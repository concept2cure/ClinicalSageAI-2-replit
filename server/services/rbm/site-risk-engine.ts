/**
 * RBM site-risk engine — derives a per-site risk snapshot from Site
 * Intelligence and persists it to rbm_site_risk_scores.
 *
 * Site Intelligence stores 0–100 *quality* scores (higher = better). RBM needs
 * *risk* (higher = worse), so each present score is inverted to 100 − score.
 * The monitoring tier is risk-proportionate per ICH E6(R3): higher risk →
 * more oversight (reduced / standard / enhanced).
 *
 * Defensive by design: two divergent site_intel.sites shapes exist in the
 * codebase (composite_score/operational_score vs overall_score/compliance_score),
 * and the schema may be absent in some tenants. We SELECT * and read whichever
 * score columns are present.
 *
 * Two properties this module has to hold, both of which it previously did not:
 *
 *   1. A read is scoped to the caller's tenant. The recompute is reached from a
 *      route that takes programId from the request body, so an unscoped read let
 *      one organization recompute against another organization's sites simply by
 *      passing their program UUID — and then persisted those sites under the
 *      caller's organization_id. Ownership is proved against the RBM store (see
 *      programBelongsToOrg): the RBM module's own definition of "this org's
 *      study" is one it holds RBQM records for, which is the same rule the study
 *      picker uses. site_intel.sites carries no organization_id of its own — it
 *      is scoped through core.programs.org_id, a UUID against a different
 *      organization registry than the integer organization_id the rbm_* tables
 *      use — so joining it would be comparing two unrelated identity systems.
 *
 *   2. A failed read never looks like a healthy empty study, and never destroys
 *      the last good snapshot. Every outcome is typed and the write only happens
 *      after a successful read, inside one transaction.
 *
 * @module server/services/rbm/site-risk-engine
 */

import { pool } from '../../db';
import { monitoringTierFromRisk, type MonitoringTier } from './rbm-engine';

/** Minimal pg-compatible executor — matches rbm-actuator's `Exec`. */
export interface Exec {
  query(sql: string, args: unknown[]): Promise<{ rows: any[] }>;
}

export interface SiteRiskSnapshot {
  siteId: string | null;
  siteNumber: string | null;
  siteName: string | null;
  compositeRisk: number | null;
  enrollmentRisk: number | null;
  qualityRisk: number | null;
  operationalRisk: number | null;
  monitoringTier: MonitoringTier;
  drivers: string[];
}

// ── Postgres error codes we can distinguish and report on ─────────────────────
const UNDEFINED_TABLE = '42P01';
const INVALID_SCHEMA = '3F000';
const UNDEFINED_COLUMN = '42703';
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Why a read or recompute produced nothing.
 *
 * These used to be one value — an empty array — which made "this study has no
 * sites", "Site Intelligence is not installed", "the database is down" and "you
 * are asking about someone else's study" indistinguishable. The board then drew
 * the first interpretation, so an infrastructure failure rendered as a study
 * with clean site risk. Naming each case is the whole point.
 */
export type SiteReadFailure =
  /** The caller's organization holds no RBQM records for this program. */
  | 'not_in_tenant'
  /** site_intel.sites / the site_intel schema is not provisioned here. */
  | 'source_unavailable'
  /** The table exists but not in a shape this engine can read. */
  | 'schema_mismatch'
  /** rbm_* is not provisioned, so ownership cannot even be checked. */
  | 'store_missing'
  /** Anything else the source read raised. */
  | 'source_error';

export type SiteReadOutcome =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; reason: SiteReadFailure; detail?: string };

export type RecomputeOutcome =
  | { ok: true; snapshots: SiteRiskSnapshot[] }
  | { ok: false; reason: SiteReadFailure; detail?: string };

function toRisk(score: unknown): number | null {
  const n = typeof score === 'string' ? parseFloat(score) : (score as number);
  if (!Number.isFinite(n)) return null;
  return Math.round((100 - n) * 100) / 100;
}

function firstNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Compute a risk snapshot for one raw site_intel.sites row. */
export function snapshotFromSiteRow(row: Record<string, unknown>): SiteRiskSnapshot {
  const enrollmentRisk = toRisk(row.enrollment_score);
  const qualityRisk = toRisk(row.quality_score);
  const operationalRisk = toRisk(firstNumber(row.operational_score, row.compliance_score));

  const components = [enrollmentRisk, qualityRisk, operationalRisk].filter(
    (r): r is number => r != null,
  );
  let compositeRisk = toRisk(firstNumber(row.composite_score, row.overall_score));
  if (compositeRisk == null && components.length > 0) {
    compositeRisk = Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 100) / 100;
  }

  const drivers: string[] = [];
  if (enrollmentRisk != null && enrollmentRisk >= 60) drivers.push('enrollment');
  if (qualityRisk != null && qualityRisk >= 60) drivers.push('quality');
  if (operationalRisk != null && operationalRisk >= 60) drivers.push('operational');

  return {
    siteId: row.id != null ? String(row.id) : null,
    siteNumber: row.site_number != null ? String(row.site_number) : null,
    siteName: (row.site_name ?? row.name ?? null) as string | null,
    compositeRisk,
    enrollmentRisk,
    qualityRisk,
    operationalRisk,
    monitoringTier: monitoringTierFromRisk(compositeRisk ?? 0),
    drivers,
  };
}

/** Map a pg error to the narrowest failure we can name. */
function classify(err: unknown): { reason: SiteReadFailure; detail: string } {
  const code = (err as { code?: string })?.code;
  const detail = err instanceof Error ? err.message : String(err);
  if (code === UNDEFINED_TABLE || code === INVALID_SCHEMA) return { reason: 'source_unavailable', detail };
  if (code === UNDEFINED_COLUMN) return { reason: 'schema_mismatch', detail };
  if (code === INSUFFICIENT_PRIVILEGE) return { reason: 'source_unavailable', detail };
  return { reason: 'source_error', detail };
}

/**
 * Does this organization own RBQM records for this program?
 *
 * The authorization check for every site-risk read. Deliberately broad across
 * the RBM tables rather than requiring a risk assessment specifically, so a
 * study that was set up KRIs-first is not locked out of its own site risk — but
 * it always requires SOMETHING this organization created for this program, which
 * a caller reaching for another tenant's program UUID will not have.
 */
export async function programBelongsToOrg(
  exec: Exec,
  organizationId: number,
  programId: string,
): Promise<boolean | 'store_missing'> {
  try {
    const { rows } = await exec.query(
      `SELECT 1 FROM rbm_risk_assessments
         WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
       UNION ALL
       SELECT 1 FROM rbm_kris
         WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
       UNION ALL
       SELECT 1 FROM rbm_qtls
         WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
       UNION ALL
       SELECT 1 FROM rbm_monitoring_plans
         WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
       UNION ALL
       SELECT 1 FROM rbm_site_risk_scores
         WHERE organization_id = $1 AND program_id = $2
       LIMIT 1`,
      [organizationId, programId],
    );
    return rows.length > 0;
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) return 'store_missing';
    throw err;
  }
}

/**
 * Read site_intel.sites for a program the caller's organization owns.
 *
 * Ownership is checked FIRST and the source read does not happen at all if it
 * fails, so a cross-tenant program UUID never reaches Site Intelligence.
 */
export async function readProgramSites(
  exec: Exec,
  organizationId: number,
  programId: string,
): Promise<SiteReadOutcome> {
  let owns: boolean | 'store_missing';
  try {
    owns = await programBelongsToOrg(exec, organizationId, programId);
  } catch (err) {
    const { reason, detail } = classify(err);
    return { ok: false, reason, detail };
  }
  if (owns === 'store_missing') return { ok: false, reason: 'store_missing' };
  if (!owns) return { ok: false, reason: 'not_in_tenant' };

  try {
    const { rows } = await exec.query(
      `SELECT * FROM site_intel.sites WHERE program_id = $1`,
      [programId],
    );
    return { ok: true, rows };
  } catch (err) {
    const { reason, detail } = classify(err);
    return { ok: false, reason, detail };
  }
}

/**
 * Recompute and persist the site-risk snapshot for a program.
 *
 * Replaces the prior snapshot so the table holds the current view — but only
 * after the source read has succeeded, and inside one transaction, so a failure
 * anywhere leaves the last good snapshot exactly as it was. The previous version
 * deleted first and inserted in a loop over separate connections, so a mid-loop
 * failure could leave a study with a partial snapshot or none at all — and a
 * source outage silently wiped the snapshot and reported success.
 *
 * `exec` defaults to the shared pool for callers outside a request (jobs, tools);
 * a route should pass its request-scoped executor so RLS applies too.
 */
export async function recomputeSiteRisk(
  organizationId: number,
  programId: string,
  exec: Exec = pool,
): Promise<RecomputeOutcome> {
  const read = await readProgramSites(exec, organizationId, programId);
  if (!read.ok) return read;

  const snapshots = read.rows.map(snapshotFromSiteRow);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
      [organizationId, programId],
    );
    for (const s of snapshots) {
      await client.query(
        `INSERT INTO rbm_site_risk_scores (
           organization_id, program_id, site_id, site_number, site_name,
           composite_risk, enrollment_risk, quality_risk, operational_risk,
           monitoring_tier, drivers
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          organizationId, programId, s.siteId, s.siteNumber, s.siteName,
          s.compositeRisk, s.enrollmentRisk, s.qualityRisk, s.operationalRisk,
          s.monitoringTier, JSON.stringify(s.drivers),
        ],
      );
    }
    await client.query('COMMIT');
    return { ok: true, snapshots };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const { reason, detail } = classify(err);
    return { ok: false, reason, detail };
  } finally {
    client.release();
  }
}

/** Operator-facing explanation for each failure. Never "no sites". */
export const SITE_READ_MESSAGE: Record<SiteReadFailure, string> = {
  not_in_tenant:
    'This study has no RBQM records for your organization, so its site risk cannot be recomputed.',
  source_unavailable:
    'Site Intelligence is not available in this environment, so site risk cannot be derived. The previous snapshot is unchanged.',
  schema_mismatch:
    'Site Intelligence returned a shape this engine does not recognise, so no site risk was derived. The previous snapshot is unchanged.',
  store_missing:
    'The RBQM store is not provisioned in this environment.',
  source_error:
    'Reading Site Intelligence failed, so no site risk was derived. The previous snapshot is unchanged.',
};
