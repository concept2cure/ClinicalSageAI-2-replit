/**
 * RBM site-risk engine — derives a per-site risk snapshot from Site
 * Intelligence and persists it to rbm_site_risk_scores.
 *
 * Site Intelligence stores 0–100 *quality* scores (higher = better). RBM needs
 * *risk* (higher = worse), so each present score is inverted to 100 − score.
 * The monitoring tier is risk-proportionate per ICH E6(R3): higher risk →
 * more oversight (reduced / standard / enhanced).
 *
 * A second source, 2026-11-11 (GA-S8-02, plan S8: "risk-based monitoring … runs over the project's study data").
 * Site Intelligence has no writer a person can reach (its router is mounted nowhere), so every study read "0 sites"
 * while its own site-level indicator readings, loaded through "Load extract…", sat in rbm_metric_observations
 * unused: metric-ingestion.ts stored them "NOT folded into the site-risk composite". When Site Intelligence holds
 * no site for the study, the snapshot is derived from those readings: each of the study's KRIs is banded at each
 * site by the same kriStatus the study-level indicator uses, and the composite is the mean of red 100, amber 50,
 * green 0 over the indicators evaluated at the site (snapshotsFromSiteIndicators). Each row records its source and
 * every reading behind it in `metadata`, so a screen can say which it is showing and why a site has its tier.
 *
 * Defensive by design: two divergent site_intel.sites shapes exist in the
 * codebase (composite_score/operational_score vs overall_score/compliance_score),
 * and the schema may be absent in some tenants. We SELECT * and read whichever
 * score columns are present.
 *
 * Two properties this module has to hold (#1128), both of which it previously
 * did not:
 *
 *   1. A read is scoped to the caller's tenant. The recompute is reached from a
 *      route that takes programId from the request body, and readProgramSites
 *      filtered site_intel.sites on program_id ALONE — so one organization
 *      could recompute against another's sites by passing their program UUID,
 *      and the result was then persisted under the caller's organization_id.
 *      Ownership is now proved FIRST, by `programInOrganization` — the one
 *      program check — and Site Intelligence is not queried at all when it
 *      fails. site_intel.sites carries no integer organization_id of its own to
 *      filter on. (Until 2026-10-01 the proof was "this organization holds RBM
 *      records naming the program". rbm_*.program_id has no foreign key, so a
 *      KRI naming another tenant's program passed it, and an owner whose study
 *      had no RBM records yet was refused its own. D3.)
 *
 *   2. A failed read never looks like a healthy empty study, and never destroys
 *      the last good snapshot. `catch { return [] }` collapsed "no sites",
 *      "Site Intelligence not installed", "database down" and "not your study"
 *      into one empty array, which the board drew as clean site risk. Every
 *      outcome is now typed; the write happens only after a successful read,
 *      inside one transaction.
 *
 * @module server/services/rbm/site-risk-engine
 */

import { pool } from '../../db';
import { programInOrganization } from '../c2c/program-access';
import { kriStatus, monitoringTierFromRisk, type KriDirection, type KriStatus, type MonitoringTier } from './rbm-engine';

/** Minimal pg-compatible executor — matches rbm-actuator's `Exec`. */
export interface Exec {
  query(sql: string, args?: unknown[]): Promise<{ rows: any[] }>;
}

// ── Postgres error codes we can distinguish and report on ─────────────────────
const UNDEFINED_TABLE = '42P01';
const INVALID_SCHEMA = '3F000';
const UNDEFINED_COLUMN = '42703';
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Why a read or recompute produced nothing. These used to be one value — an
 * empty array — so an infrastructure failure rendered as a study with clean
 * site risk. Naming each case is the whole point.
 */
export type SiteReadFailure =
  /** The program is not a live project of the caller's organization. */
  | 'not_in_tenant'
  /** site_intel.sites / the site_intel schema is not provisioned or readable here. */
  | 'source_unavailable'
  /** The table exists but not in a shape this engine can read. */
  | 'schema_mismatch'
  /** Whether the program is the caller's could not be checked, so nothing was read. */
  | 'ownership_unverifiable'
  /** Anything else the read or the snapshot write raised. */
  | 'source_error';

export type SiteReadOutcome =
  | { ok: true; rows: Record<string, unknown>[] }
  /** `notInstalled`: the site_intel schema or its sites table does not exist here, as opposed to being unreadable. */
  | { ok: false; reason: SiteReadFailure; detail?: string; notInstalled?: boolean };

/** Where a snapshot's figures came from. Stored on each row as `metadata.source`. */
export type SiteRiskSource = 'site_intelligence' | 'study_indicators';

export type RecomputeOutcome =
  | { ok: true; snapshots: SiteRiskSnapshot[]; source: SiteRiskSource }
  | { ok: false; reason: SiteReadFailure; detail?: string };

/** One of the study's KRIs as last read at one site, with the limits it is banded against. */
export interface SiteIndicatorReading {
  siteNumber: string;
  kriName: string;
  unit: string | null;
  value: number;
  amber: number | null;
  red: number | null;
  direction: KriDirection;
  observedAt: string | null;
  dataCutoff: string | null;
}

/** A reading with the engine's band for it. */
export interface SiteIndicatorResult extends SiteIndicatorReading { status: KriStatus }

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
  /** Absent on a snapshot built by hand in a test; every stored row carries one. */
  source?: SiteRiskSource;
  /** The banded readings behind a study-indicator snapshot, in the order they are scored. */
  indicators?: SiteIndicatorResult[];
}

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

/**
 * What a banded indicator contributes to a site's composite, on the 0–100 risk scale monitoringTierFromRisk reads.
 * A red indicator is the full weight, an amber one half, a green one none. An indicator that is not evaluated
 * (no limit configured) contributes nothing and is not counted: an unbanded reading is not evidence either way.
 */
export const SITE_INDICATOR_POINTS: Record<Exclude<KriStatus, 'not_evaluated'>, number> = { red: 100, amber: 50, green: 0 };
export const SITE_INDICATOR_RULE =
  'Each indicator is banded at the site against its own limits. Red counts 100, amber 50, green 0; the composite is the mean over the indicators evaluated at the site.';

const limitWords = (r: SiteIndicatorResult): string => {
  const limit = r.status === 'red' ? r.red : r.amber;
  const unit = r.unit ? ` ${r.unit}` : '';
  return `${r.kriName} ${r.value}${unit}: ${r.status}${limit == null ? '' : ` (limit ${limit}${unit})`}`;
};

/**
 * Site-risk snapshots from the study's own site-level indicator readings. Pure.
 *
 * One snapshot per site that has a reading of at least one of the study's KRIs. The drivers are the red and amber
 * indicators, in words, worst first. A site whose readings are all unbanded has no composite and stays on the
 * standard tier: with nothing evaluated there is no ground for less oversight, or for more.
 */
export function snapshotsFromSiteIndicators(readings: SiteIndicatorReading[]): SiteRiskSnapshot[] {
  const bySite = new Map<string, SiteIndicatorResult[]>();
  for (const r of readings) {
    const banded: SiteIndicatorResult = { ...r, status: kriStatus(r.value, r.amber, r.red, r.direction) };
    bySite.set(r.siteNumber, [...(bySite.get(r.siteNumber) ?? []), banded]);
  }
  const order: Record<KriStatus, number> = { red: 0, amber: 1, green: 2, not_evaluated: 3 };
  return [...bySite.entries()].map(([siteNumber, results]) => {
    const indicators = [...results].sort((a, b) => order[a.status] - order[b.status] || a.kriName.localeCompare(b.kriName));
    const evaluated = indicators.filter((i) => i.status !== 'not_evaluated');
    const compositeRisk = evaluated.length === 0 ? null
      : Math.round((evaluated.reduce((sum, i) => sum + SITE_INDICATOR_POINTS[i.status as 'red' | 'amber' | 'green'], 0) / evaluated.length) * 100) / 100;
    return {
      // The study data names a site by its number, and RBM's signals carry the same value as their site id.
      siteId: siteNumber, siteNumber, siteName: null,
      compositeRisk, enrollmentRisk: null, qualityRisk: null, operationalRisk: null,
      monitoringTier: compositeRisk == null ? 'standard' as const : monitoringTierFromRisk(compositeRisk),
      drivers: indicators.filter((i) => i.status === 'red' || i.status === 'amber').map(limitWords),
      source: 'study_indicators' as const,
      indicators,
    };
  });
}

/**
 * The latest site-level reading of each of the study's KRIs at each site, from extracts that have not been
 * superseded. A reading binds to a KRI the way a study-level one does in metric-ingestion.ts: by the KRI's name
 * or its metadata.metricKey, case-insensitively. The caller has already proved the program is the organization's.
 */
export async function readSiteIndicatorReadings(
  exec: Exec,
  organizationId: number,
  programId: string,
): Promise<SiteIndicatorReading[]> {
  const { rows } = await exec.query(
    `SELECT DISTINCT ON (o.scope_id, k.id)
            o.scope_id AS site_number, k.name AS kri_name, COALESCE(o.unit, k.unit) AS unit, o.value,
            k.threshold_amber, k.threshold_red, k.direction, o.observed_at, o.data_cutoff
       FROM rbm_metric_observations o
       JOIN rbm_kris k
         ON k.organization_id = o.organization_id AND k.program_id = o.program_id AND k.deleted_at IS NULL
        AND (LOWER(k.name) = LOWER(o.metric_key) OR LOWER(COALESCE(k.metadata->>'metricKey','')) = LOWER(o.metric_key))
       LEFT JOIN rbm_data_runs r ON r.id = o.run_id AND r.organization_id = o.organization_id
      WHERE o.organization_id = $1 AND o.program_id = $2 AND o.scope_level = 'site'
        AND o.scope_id IS NOT NULL AND o.value IS NOT NULL AND r.superseded_at IS NULL
      ORDER BY o.scope_id, k.id, o.observed_at DESC, o.id DESC`,
    [organizationId, programId],
  );
  const text = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
  const limit = (v: unknown): number | null => (v == null ? null : Number(v));
  return rows.map((row) => ({
    siteNumber: String(row.site_number), kriName: String(row.kri_name), unit: text(row.unit), value: Number(row.value),
    amber: limit(row.threshold_amber), red: limit(row.threshold_red),
    direction: row.direction === 'lower_worse' ? 'lower_worse' : 'higher_worse',
    observedAt: text(row.observed_at), dataCutoff: text(row.data_cutoff)?.slice(0, 10) ?? null,
  }));
}

/** Map a pg error to the narrowest failure we can name. */
function classify(err: unknown): { reason: SiteReadFailure; detail: string } {
  const code = (err as { code?: string })?.code;
  const detail = err instanceof Error ? err.message : String(err);
  if (code === UNDEFINED_TABLE || code === INVALID_SCHEMA || code === INSUFFICIENT_PRIVILEGE) {
    return { reason: 'source_unavailable', detail };
  }
  if (code === UNDEFINED_COLUMN) return { reason: 'schema_mismatch', detail };
  return { reason: 'source_error', detail };
}

/**
 * Read site_intel.sites for a program the caller's organization owns.
 *
 * Ownership is checked FIRST and the source read does not happen at all if it
 * fails, so a cross-tenant program UUID never reaches Site Intelligence. A
 * genuine empty result is `{ ok: true, rows: [] }`; every failure is typed.
 */
export async function readProgramSites(
  exec: Exec,
  organizationId: number,
  programId: string,
): Promise<SiteReadOutcome> {
  let owns: boolean;
  try {
    owns = await programInOrganization(exec, programId, organizationId);
  } catch (err) {
    return { ok: false, reason: 'ownership_unverifiable', detail: err instanceof Error ? err.message : String(err) };
  }
  if (!owns) return { ok: false, reason: 'not_in_tenant' };

  try {
    const { rows } = await exec.query(
      `SELECT * FROM site_intel.sites WHERE program_id = $1`,
      [programId],
    );
    return { ok: true, rows };
  } catch (err) {
    const { reason, detail } = classify(err);
    const code = (err as { code?: string })?.code;
    return { ok: false, reason, detail, ...(code === UNDEFINED_TABLE || code === INVALID_SCHEMA ? { notInstalled: true } : {}) };
  }
}

async function recomputeOn(
  exec: Exec,
  organizationId: number,
  programId: string,
): Promise<RecomputeOutcome> {
  // Read BEFORE the transaction: a failed source read must not touch the
  // stored snapshot, and a statement error inside BEGIN would poison it.
  const read = await readProgramSites(exec, organizationId, programId);
  // Any failure but "Site Intelligence is not installed here" stops, as before: ownership is unproved, a read went
  // wrong, or the register exists and this role may not read it. None of those may look like a study with no
  // sites, and none may quietly swap one source's figures for the other's.
  if (!read.ok && !read.notInstalled) return read;
  let snapshots: SiteRiskSnapshot[];
  let source: SiteRiskSource;
  if (read.ok && read.rows.length > 0) {
    source = 'site_intelligence';
    snapshots = read.rows.map((row) => ({ ...snapshotFromSiteRow(row), source }));
  } else {
    // Site Intelligence holds no site for this study (nothing in the product writes one), or is not installed.
    // The study's own site-level indicator readings are the source. Ownership was proved by readProgramSites.
    source = 'study_indicators';
    try {
      snapshots = snapshotsFromSiteIndicators(await readSiteIndicatorReadings(exec, organizationId, programId));
    } catch (err) {
      const { reason, detail } = classify(err);
      return { ok: false, reason, detail };
    }
  }

  try {
    await exec.query('BEGIN');
    await exec.query(
      `DELETE FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
      [organizationId, programId],
    );
    for (const s of snapshots) {
      await exec.query(
        `INSERT INTO rbm_site_risk_scores (
           organization_id, program_id, site_id, site_number, site_name,
           composite_risk, enrollment_risk, quality_risk, operational_risk,
           monitoring_tier, drivers, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          organizationId, programId, s.siteId, s.siteNumber, s.siteName,
          s.compositeRisk, s.enrollmentRisk, s.qualityRisk, s.operationalRisk,
          s.monitoringTier, JSON.stringify(s.drivers),
          JSON.stringify(source === 'study_indicators'
            ? { source, rule: SITE_INDICATOR_RULE, indicators: s.indicators ?? [] }
            : { source }),
        ],
      );
    }
    await exec.query('COMMIT');
    return { ok: true, snapshots, source };
  } catch (err) {
    await exec.query('ROLLBACK').catch(() => {});
    const { reason, detail } = classify(err);
    return { ok: false, reason, detail };
  }
}

/**
 * Recompute and persist the site-risk snapshot for a program.
 *
 * Replaces the prior snapshot so the table holds the current view — but only
 * after the tenant-checked source read has succeeded, and inside ONE
 * transaction on ONE connection, so a failure anywhere leaves the last good
 * snapshot exactly as it was. (It used to DELETE and then INSERT in a loop over
 * separate pool connections, so a mid-loop failure left a partial snapshot or
 * none, and a source outage wiped the snapshot while reporting success.)
 *
 * `exec` is the caller's request-scoped client — a single pinned connection
 * carrying the tenant's RLS session, on which BEGIN/COMMIT are meaningful. With
 * none (jobs, tools outside a request) a dedicated pool client is used.
 */
export async function recomputeSiteRisk(
  organizationId: number,
  programId: string,
  exec?: Exec,
): Promise<RecomputeOutcome> {
  if (exec) return recomputeOn(exec, organizationId, programId);
  const client = await pool.connect();
  try {
    return await recomputeOn(client, organizationId, programId);
  } finally {
    client.release();
  }
}

/** Operator-facing explanation for each failure. Never "no sites". */
export const SITE_READ_MESSAGE: Record<SiteReadFailure, string> = {
  not_in_tenant:
    'This study is not a project of your organization, so its site risk cannot be recomputed.',
  source_unavailable:
    'Site Intelligence is not available in this environment, so site risk cannot be derived. The previous snapshot is unchanged.',
  schema_mismatch:
    'Site Intelligence returned a shape this engine does not recognise, so no site risk was derived. The previous snapshot is unchanged.',
  ownership_unverifiable:
    'Whether this study is your organization\'s could not be checked just now, so its site risk was not recomputed. This is not a permission decision. The previous snapshot is unchanged.',
  source_error:
    'Reading Site Intelligence or writing the snapshot failed, so no site risk was derived. The previous snapshot is unchanged.',
};
