/**
 * Assemble the v2 ShadowReview surface's render contract from the REAL, org-scoped
 * shadow-review store (shadow_review_runs + shadow_review_findings) — the exact tables
 * runShadowReview persists after routing an assembled sequence through the AI gateway,
 * NOT a seed-only blob.
 *
 * The surface renders one row per reviewer lens that has actually been run —
 * { lens, findings[] }, each finding carrying { dimension, severity, title, detail,
 * basis, recommendation, leafRef } — and recomputes the RTF/CRL gate risk itself from
 * those findings. So this assembler maps the latest COMPLETE run per lens and its
 * findings only; no blob, no fabricated field. An org that has never run a reviewer
 * returns [] and the surface shows its honest empty state. A lens with a complete run
 * and zero findings still appears (findings: []) so the surface can distinguish
 * "reviewed clean" from "not yet run".
 */
import { pool } from '../../db';

/** Canonical lens order the surface presents (catalog order), for a stable list. */
const LENS_ORDER = ['fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr'];
const lensRank = (lens: string): number => {
  const i = LENS_ORDER.indexOf(lens);
  return i === -1 ? LENS_ORDER.length : i;
};

const str = (v: unknown): string => (v == null ? '' : String(v));
const nul = (v: unknown): string | null => (v == null ? null : String(v));

export async function assembleOrgShadowReview(orgId: number): Promise<Record<string, unknown>[]> {
  // Latest COMPLETE run per lens for the org (soft-delete aware).
  const runsRes = await pool.query(
    `SELECT DISTINCT ON (lens) id, lens
       FROM shadow_review_runs
      WHERE organization_id = $1 AND status = 'complete' AND deleted_at IS NULL
      ORDER BY lens, created_at DESC NULLS LAST, id DESC`,
    [orgId],
  );
  const runs = runsRes.rows as Array<{ id: number; lens: string }>;
  if (runs.length === 0) return [];

  const runIds = runs.map((r) => Number(r.id));
  const findRes = await pool.query(
    `SELECT run_id, dimension, severity, title, detail, basis, recommendation, leaf_ref
       FROM shadow_review_findings
      WHERE run_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 WHEN 'minor' THEN 2 ELSE 3 END, id`,
    [runIds, orgId],
  );
  const findingsByRun = new Map<number, Record<string, unknown>[]>();
  for (const f of findRes.rows as Array<Record<string, unknown>>) {
    const rid = Number(f.run_id);
    const list = findingsByRun.get(rid) ?? [];
    list.push({
      dimension: str(f.dimension),
      severity: str(f.severity),
      title: str(f.title),
      detail: nul(f.detail),
      basis: nul(f.basis),
      recommendation: nul(f.recommendation),
      leafRef: nul(f.leaf_ref),
    });
    findingsByRun.set(rid, list);
  }

  return runs
    .map((r) => ({ lens: r.lens, findings: findingsByRun.get(Number(r.id)) ?? [] }))
    .sort((a, b) => lensRank(a.lens) - lensRank(b.lens));
}
