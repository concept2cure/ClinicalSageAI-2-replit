/**
 * Reporting applicability separates a program's product type from the
 * organization's service/institution identity. An anchored filing keeps its
 * own product catalog and the organization's CRO/CDMO/academic/government
 * reports; sibling product catalogs are excluded. Unanchored catalog views
 * use the organization's union. No declared product type is guessed from the
 * default organizations.client_type='pharma'.
 */

import { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import type { ClientSegmentType } from '../../../shared/constants/domain/organization-types';

const logger = createScopedLogger('report-os-segment');

/** Product and organization identity vocabulary used only for reporting. */
export type ReportSegment = ClientSegmentType | 'cro' | 'cdmo' | 'academic' | 'government';

/** Map a `regulatory_programs.product_type` value to a client segment. */
const PRODUCT_TYPE_TO_SEGMENT: Record<string, ClientSegmentType> = {
  drug: 'pharma',
  biologic: 'biotech',
  device: 'device',
  ivd: 'ivd',
  // A combination product is regulated device-led at CDRH by default; the
  // union rule means a combination-heavy org that also files drugs still
  // sees the pharma catalog via its other programs.
  combination: 'device',
  // A companion diagnostic IS an in-vitro diagnostic, and software as a medical
  // device IS a device. They are stored as their own product types because the
  // platform routes them differently, but they belong to these segments — and
  // an unmapped value is DROPPED here, which for a single-program org means an
  // empty segment list and a vault that renders the CRO/TMF view. A regulated
  // diagnostic shown the cross-sponsor service view is not a cosmetic slip.
  cdx: 'ivd',
  samd: 'device',
};

/**
 * Service-organization markers (from `organizations.client_type` /
 * `industry_mode`) that add their own service segment. Product-owning
 * client_type values are DELIBERATELY excluded here: `client_type` defaults to
 * `'pharma'` for every org, so unioning product segments from it would show the
 * pharma catalog to every org and break per-segment anchoring. Product segments
 * come only from real `regulatory_programs`; the service segment is the one
 * signal `client_type` legitimately adds (a CRO/CDMO owns no program).
 */
const SERVICE_CLIENT_TYPES = new Set(['cro', 'cdmo']);

/**
 * PURE: map a set of raw `product_type` strings to the distinct, ordered
 * segment list. Unknown product types are dropped (not guessed).
 */
export function productTypesToSegments(productTypes: Iterable<string>): ClientSegmentType[] {
  const seen = new Set<ClientSegmentType>();
  for (const raw of productTypes) {
    const seg = PRODUCT_TYPE_TO_SEGMENT[String(raw).trim().toLowerCase()];
    if (seg) seen.add(seg);
  }
  // Canonical order for stable output/tests.
  const order: ClientSegmentType[] = ['pharma', 'biotech', 'device', 'ivd'];
  return order.filter((s) => seen.has(s));
}

/**
 * PURE: does an org's declared type(s) name a service organization (CRO/CDMO)?
 * Reads the free-text `client_type` and `industry_mode` markers. Returns the recorded CRO or CDMO identity, else `null`.
 */
export function serviceSegmentFor(
  clientType?: string | null,
  industryMode?: string | null,
): 'cro' | 'cdmo' | null {
  const markers = [clientType, industryMode].map((v) => String(v ?? '').trim().toLowerCase());
  return (markers.find((m) => SERVICE_CLIENT_TYPES.has(m)) as 'cro' | 'cdmo' | undefined) ?? null;
}

/** Service and institution identity supplements, rather than replaces, product scope. */
export function institutionalSegmentFor(clientType?: string | null, industryMode?: string | null): 'academic' | 'government' | null {
  const markers = [clientType, industryMode].map(v => String(v ?? '').trim().toLowerCase());
  return (markers.find(m => m === 'academic' || m === 'government') as 'academic' | 'government' | undefined) ?? null;
}

/** Canonical order for a full ReportSegment list (product segments then service). */
function orderSegments(set: Set<ReportSegment>): ReportSegment[] {
  const order: ReportSegment[] = ['pharma', 'biotech', 'device', 'ivd', 'cro', 'cdmo', 'academic', 'government'];
  return order.filter((s) => set.has(s));
}

/**
 * Derive the report segment(s) for an org: the UNION of its product segments
 * (from `regulatory_programs.product_type`) and — for a CRO/CDMO service org —
 * the service/institution identity (from `organizations.client_type` /
 * `industry_mode`). A CRO with no programs of its own therefore still sees its
 * cross-sponsor catalog (eTMF completeness, inspection readiness). Returns `[]`
 * for a program-less product org or on any DB error (fail-open to "universal
 * types only", never throws into the request).
 */
export async function deriveOrgSegments(organizationId: number): Promise<ReportSegment[]> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return [];
  const set = new Set<ReportSegment>();
  try {
    const { rows } = await getPool().query<{ product_type: string }>(
      `SELECT DISTINCT product_type FROM regulatory_programs
        WHERE organization_id = $1 AND product_type IS NOT NULL`,
      [organizationId],
    );
    for (const s of productTypesToSegments(rows.map((r) => r.product_type))) set.add(s);
  } catch (err) {
    // Missing table (fresh deploy) or query error → no product segments.
    logger.warn('deriveOrgSegments: program derivation failed', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    const { rows } = await getPool().query<{ client_type: string | null; industry_mode: string | null }>(
      `SELECT client_type, industry_mode FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId],
    );
    const svc = serviceSegmentFor(rows[0]?.client_type, rows[0]?.industry_mode);
    if (svc) set.add(svc);
    const institution = institutionalSegmentFor(rows[0]?.client_type, rows[0]?.industry_mode);
    if (institution) set.add(institution);
  } catch (err) {
    logger.warn('deriveOrgSegments: service derivation failed', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return orderSegments(set);
}

/**
 * The segment(s) of the program a `projects` row is anchored to
 * (`projects.regulatory_program_id` → `regulatory_programs.product_type`), or
 * null when the project has no anchored program with a recorded product type.
 *
 * A report runs over ONE program, so the types offered for it, and the types
 * it may run, follow THAT program's product type — not the organisation's
 * union, which offered a 510(k) equivalence matrix for a biologic IND because
 * the same organisation also holds device programs (QA 2026-10-08, j8).
 *
 * A database without the anchor column (42703) has no anchor: null. Any other
 * failure throws — a run is not let past an applicability check that could not
 * be made.
 */
export async function deriveProjectSegments(
  organizationId: number,
  projectId: number,
): Promise<ReportSegment[] | null> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return null;
  try {
    const { rows } = await getPool().query<{ product_type: string | null }>(
      `SELECT rp.product_type
         FROM projects p
         JOIN regulatory_programs rp
           ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
        WHERE p.id = $1 AND p.organization_id = $2
        LIMIT 1`,
      [projectId, organizationId],
    );
    const segments = productTypesToSegments(rows.map((r) => r.product_type ?? ''));
    return segments.length > 0 ? segments : null;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '42703') return null;
    throw err;
  }
}

/**
 * The segments a report over `projectId` is offered and checked against: the
 * project's own program's, else (a project with no anchored program) the
 * organisation's derived union. Service/institution identities remain
 * applicable even when one product narrows the catalog.
 */
export async function deriveScopeSegments(
  organizationId: number,
  projectId: number | null,
): Promise<ReportSegment[]> {
  const own = projectId == null ? null : await deriveProjectSegments(organizationId, projectId);
  return segmentsForScope(own, await deriveOrgSegments(organizationId));
}

/** An anchored filing never inherits a sibling product's regional catalog. */
export function segmentsForScope(own: ReportSegment[] | null, organization: ReportSegment[]): ReportSegment[] {
  if (!own) return organization;
  const identity = organization.filter(s => ['cro', 'cdmo', 'academic', 'government'].includes(s));
  return orderSegments(new Set([...own, ...identity]));
}

/** A report-type row as seen by the filter — only the fields it reads. */
export interface SegmentFilterableType {
  allowedClientSegments?: string[] | null;
  allowedPersonas?: string[] | null;
}

/**
 * PURE: keep report types the org's segment(s) are allowed to see. A type
 * with an EMPTY (or missing) `allowedClientSegments` is UNIVERSAL — shown to
 * every org, including service orgs with no derived segment. A type with a
 * non-empty list is shown only when it intersects the org's segments.
 *
 * Optionally intersect on persona the same way (empty persona list =
 * universal), when the caller passes a persona filter.
 */
export function filterTypesForSegment<T extends SegmentFilterableType>(
  rows: T[],
  segments: ReportSegment[],
  persona?: string | null,
): T[] {
  const segSet = new Set<string>(segments);
  return rows.filter((row) => {
    const allowedSegs = row.allowedClientSegments ?? [];
    const segOk = allowedSegs.length === 0 || allowedSegs.some((s) => segSet.has(s));
    if (!segOk) return false;
    if (persona) {
      const allowedPersonas = row.allowedPersonas ?? [];
      if (allowedPersonas.length > 0 && !allowedPersonas.includes(persona)) return false;
    }
    return true;
  });
}
