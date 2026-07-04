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
 * Derive the client segment(s) for an org from its regulatory programs.
 * Returns `[]` for service orgs, program-less orgs, or on any DB error
 * (fail-open to "universal types only", never throws into the request).
 */
export async function deriveOrgSegments(organizationId: number): Promise<ClientSegmentType[]> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return [];
  try {
    const { rows } = await getPool().query<{ product_type: string }>(
      `SELECT DISTINCT product_type FROM regulatory_programs
        WHERE organization_id = $1 AND product_type IS NOT NULL`,
      [organizationId],
    );
    return productTypesToSegments(rows.map((r) => r.product_type));
  } catch (err) {
    // Missing table (fresh deploy) or query error → treat as no segment.
    logger.warn('deriveOrgSegments failed; defaulting to universal', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
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
  segments: ClientSegmentType[],
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
