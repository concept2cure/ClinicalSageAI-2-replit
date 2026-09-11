/**
 * Assemble the v2 ShadowReview surface's render contract from the REAL, org-scoped
 * shadow-review store (shadow_review_runs + shadow_review_findings) — the exact tables
 * runShadowReview persists after routing an assembled sequence through the AI gateway,
 * NOT a seed-only blob.
 *
 * The surface renders one row per reviewer lens that has actually been run —
 * { lens, runId, rtfRiskScore, crlRiskScore, findings[] }, each finding carrying
 * { dimension, severity, title, detail, basis, recommendation, leafRef }. So this
 * assembler maps the latest COMPLETE run per lens, the gate scores that run RECORDED,
 * and its findings; no blob, no fabricated field. An org that has never run a reviewer
 * returns [] and the surface shows its honest empty state. A lens with a complete run
 * and zero findings still appears (findings: []) so the surface can distinguish
 * "reviewed clean" from "not yet run".
 *
 * WO-16C finding 99 — why the scores are here at all. The surface used to re-derive the
 * RTF/CRL gates client-side from the findings list, through a verbatim copy of the
 * service's `aggregateRisk`. That function returns 0 for a gate with no findings in its
 * dimensions, and on the server that 0 is only a FLOOR: `runShadowReview` persists
 * `Math.max(model self-report, aggregate)`. So a complete run that recorded, say, 0.90
 * painted "0%" and "low risk" here while SubmissionCenter printed 0.90 for the same run.
 * The recorded score is the run's verdict, so it travels with the row. It is nullable —
 * `rtf_risk_score` is a nullable column and a run may hold none — and a null is passed
 * through AS null, never coerced to 0: a score nothing recorded is not a score of zero.
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
/** A recorded 0..1 score, or null when the run recorded none. Never a coerced 0. */
const score = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function assembleOrgShadowReview(orgId: number): Promise<Record<string, unknown>[]> {
  // Latest COMPLETE run per lens for the org (soft-delete aware).
  const runsRes = await pool.query(
    `SELECT DISTINCT ON (lens) id, lens, rtf_risk_score, crl_risk_score
       FROM shadow_review_runs
      WHERE organization_id = $1 AND status = 'complete' AND deleted_at IS NULL
      ORDER BY lens, created_at DESC NULLS LAST, id DESC`,
    [orgId],
  );
  const runs = runsRes.rows as Array<{ id: number; lens: string; rtf_risk_score: unknown; crl_risk_score: unknown }>;
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
    .map((r) => ({
      lens: r.lens,
      runId: Number(r.id),
      rtfRiskScore: score(r.rtf_risk_score),
      crlRiskScore: score(r.crl_risk_score),
      findings: findingsByRun.get(Number(r.id)) ?? [],
    }))
    .sort((a, b) => lensRank(a.lens) - lensRank(b.lens));
}
