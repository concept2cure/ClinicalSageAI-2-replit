/**
 * Whether PDF/A is required for a production transmit, and by whom.
 *
 * Founder delegation, 2026-10-01 ("make the decision that's best for our
 * clients and our product"); evidence docs/evidence/D7/2026-10-01-pdfa-rule/.
 *
 * Decision: PDF/A is never required by default. Every agency the catalog
 * transmits to accepts plain PDF 1.4–1.7 as well as PDF/A, so refusing a
 * package because a leaf is plain PDF would refuse what the agency accepts.
 * PDF/A is required only when someone chose it:
 *
 *   deployment    — `ECTD_REQUIRE_PDFA=true`, for every organisation on it;
 *   organization  — the organisation's own setting, `settings.submission.requirePdfA`
 *                   (Admin, Setup), for sponsors whose SOPs require PDF/A.
 *
 * Only the literal boolean `true` turns the setting on. A read that fails, or
 * finds no organisation row, is thrown, not taken as "not required": the
 * transmit guard calls this before the wire, so an organisation that requires
 * PDF/A is never sent plain PDF because its setting could not be read.
 */
import { pdfaRequiredFromEnv } from './pdfa-readiness';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface PdfARequirement {
  required: boolean;
  /** Who required it; null when nobody did. The deployment wins when both did. */
  source: 'deployment' | 'organization' | null;
}

export function pdfaRequirementFrom(env: NodeJS.ProcessEnv, organizationRequires: boolean): PdfARequirement {
  if (pdfaRequiredFromEnv(env)) return { required: true, source: 'deployment' };
  if (organizationRequires) return { required: true, source: 'organization' };
  return { required: false, source: null };
}

export async function resolvePdfARequirement(
  db: Queryable,
  organizationId: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PdfARequirement> {
  if (pdfaRequiredFromEnv(env)) return { required: true, source: 'deployment' };
  const { rows } = await db.query(
    `SELECT settings->'submission'->'requirePdfA' AS require_pdfa FROM organizations WHERE id = $1`,
    [organizationId],
  );
  // No row is not "not required": the organisation exists, so not seeing it
  // means its setting is unknown.
  if (rows.length === 0) throw new Error(`The settings of organisation ${organizationId} could not be read, so whether it requires PDF/A is unknown.`);
  return pdfaRequirementFrom(env, rows[0].require_pdfa === true);
}

/** Who required PDF/A, in words a refusal can carry. */
export function pdfaRequirementWho(r: PdfARequirement): string {
  return r.source === 'organization'
    ? "this organisation's own setting requires PDF/A for its submissions (Admin, Setup)"
    : 'this deployment requires PDF/A for every submission (ECTD_REQUIRE_PDFA)';
}
