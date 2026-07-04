/**
 * @fileoverview Per-organization client-segment derivation for report scoping.
 * @module server/services/report-os/segment
 *
 * The Report-OS taxonomy stamps every report type with an
 * `allowedClientSegments` list (pharma / biotech / device / ivd). To anchor
 * the catalog to what each client actually needs, we must know the requesting
 * org's segment(s). There is no stored segment column on `organizations`
 * today, so we DERIVE it from the org's regulatory programs:
 * `regulatory_programs.product_type` (drug / biologic / device / ivd /
 * combination) maps to a `ClientSegmentType`.
 *
 * Design choices (honest, non-restrictive):
 *   - Multi-product orgs return the UNION of their segments — a pharma+device
 *     org sees both catalogs rather than being forced into one.
 *   - Orgs with no product-owning programs (service orgs: CRO/CDMO, or brand
 *     new orgs) return `[]` → the caller shows only universal report types
 *     (empty `allowedClientSegments`) and, later, the CRO cross-sponsor view.
 *   - A future explicit `organizations.client_segment` override column can
 *     short-circuit this derivation; until then, programs are the source.
 *
 * The filter is a PURE function (unit-testable without a DB); the derivation
 * is a thin, missing-table-safe query.
 */

import { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import type { ClientSegmentType } from '../../../shared/constants/domain/organization-types';

const logger = createScopedLogger('report-os-segment');

/**
 * The segment vocabulary the report catalog anchors on. This is the four
 * product-owning `ClientSegmentType`s PLUS the `'cro'` service segment — the
 * taxonomy stamps CRO-relevant report types (e.g. `etmf.completeness_pack`)
 * with `'cro'` in `allowedClientSegments`, but `ClientSegmentType` proper does
 * not include it because a CRO owns no regulatory program of its own.
 */
export type ReportSegment = ClientSegmentType | 'cro';

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
};

/**
 * Service-organization markers (from `organizations.client_type` /
 * `industry_mode`) that add the `'cro'` service segment. Product-owning
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
 * Reads the free-text `client_type` and `industry_mode` markers. Returns the
 * `'cro'` service segment when either names a service org, else `null`.
 */
export function serviceSegmentFor(
  clientType?: string | null,
  industryMode?: string | null,
): 'cro' | null {
  const markers = [clientType, industryMode].map((v) => String(v ?? '').trim().toLowerCase());
  return markers.some((m) => SERVICE_CLIENT_TYPES.has(m)) ? 'cro' : null;
}

/** Canonical order for a full ReportSegment list (product segments then service). */
function orderSegments(set: Set<ReportSegment>): ReportSegment[] {
  const order: ReportSegment[] = ['pharma', 'biotech', 'device', 'ivd', 'cro'];
  return order.filter((s) => set.has(s));
}

/**
 * Derive the report segment(s) for an org: the UNION of its product segments
 * (from `regulatory_programs.product_type`) and — for a CRO/CDMO service org —
 * the `'cro'` service segment (from `organizations.client_type` /
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
  } catch (err) {
    logger.warn('deriveOrgSegments: service derivation failed', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return orderSegments(set);
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
