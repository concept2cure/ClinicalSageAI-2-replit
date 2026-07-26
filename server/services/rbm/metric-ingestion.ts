/**
 * @fileoverview RBM metric ingestion — the producer the RBM engines were
 * missing.
 * @module server/services/rbm/metric-ingestion
 *
 * Every RBM engine is a consumer. `kriStatus` reads `rbm_kris.current_value`,
 * `scorePatientCohort` reads `rbm_patient_profiles.metrics`, the site-risk
 * engine reads `site_intel.sites`, and `detectSiteOutliers` reads that
 * engine's output. Until this module none of them had a source: readings were
 * hand-entered one at a time. This is the load path.
 *
 * Two design commitments, both of which exist to keep the module honest about
 * what it actually knows:
 *
 *   1. Nothing is dropped silently. A row that cannot be used is rejected with
 *      a specific reason and persisted on the run. A row that lands but does
 *      not match any configured indicator is reported as unmatched rather than
 *      quietly stored — otherwise "ingested 400 rows" would read as success
 *      while every KRI stayed unevaluated.
 *   2. Provenance travels with the numbers. The run records which feed, as of
 *      what cutoff, and how much was accepted, because under ICH E6(R3) an
 *      indicator means nothing without the currency and completeness of the
 *      data behind it. A green KRI from a feed that last landed three weeks
 *      ago is not evidence of control.
 *
 * `parseMetricRows` / `parseMetricCsv` are pure and do all validation, so the
 * rules are unit-testable without a database. `ingestMetrics` performs the
 * transactional load and projection; the caller owns BEGIN/COMMIT.
 */

import { parse as parseCsvSync } from 'csv-parse/sync';

import { kriStatus, qtlStatus, type KriDirection } from './rbm-engine';

/** Minimal pg-compatible executor — matches rbm-actuator's `Exec`. */
export interface Exec {
  query(sql: string, args: unknown[]): Promise<{ rows: any[] }>;
}

/**
 * The sponsor's system-of-record category, not a vendor name, so a study can
 * migrate between EDC vendors without its ingestion history changing meaning.
 */
export const METRIC_SOURCES = [
  'edc', 'ctms', 'safety', 'lab', 'irt', 'ecoa', 'vendor', 'manual_upload',
] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

export const SCOPE_LEVELS = ['study', 'country', 'site', 'subject'] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

/** A validated measurement ready to land. */
export interface ParsedObservation {
  metricKey: string;
  scopeLevel: ScopeLevel;
  scopeId: string | null;
  value: number;
  numerator: number | null;
  denominator: number | null;
  unit: string | null;
  observedAt: string | null;
}

/** A row that could not be used, and precisely why. */
export interface RowReject {
  /** 1-based row number as supplied, so a data manager can find it. */
  row: number;
  reason: string;
}

export interface ParseResult {
  observations: ParsedObservation[];
  rejects: RowReject[];
  received: number;
}

/** Cap on persisted reject detail, so one catastrophic file can't bloat a row. */
const MAX_PERSISTED_REJECTS = 200;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Parse to a finite number, or null. Rejects NaN/Infinity, never coerces. */
const numOrNull = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Accept the common column spellings a sponsor extract actually arrives with. */
function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (row[n] !== undefined) return row[n];
    // Tolerate header casing/spacing drift ("Metric Key", "metric key").
    const alt = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_-]/g, '') === n.toLowerCase().replace(/[\s_-]/g, ''));
    if (alt && row[alt] !== undefined) return row[alt];
  }
  return undefined;
}

/**
 * Validate raw rows into observations, rejecting anything unusable with a
 * reason. Pure: no I/O, no clock, no database.
 *
 * A row is usable when it names a metric, names its scope, and carries either
 * a value or a numerator/denominator pair the value can be derived from.
 */
export function parseMetricRows(rows: Record<string, unknown>[]): ParseResult {
  const observations: ParsedObservation[] = [];
  const rejects: RowReject[] = [];

  rows.forEach((raw, i) => {
    const row = i + 1;
    const reject = (reason: string) => rejects.push({ row, reason });

    const metricKey = str(pick(raw, 'metric_key', 'metricKey', 'metric'));
    if (!metricKey) return reject('metric_key is missing');
    if (metricKey.length > 200) return reject('metric_key exceeds 200 characters');

    const scopeRaw = str(pick(raw, 'scope_level', 'scopeLevel', 'scope')) ?? 'study';
    const scopeLevel = scopeRaw.toLowerCase() as ScopeLevel;
    if (!SCOPE_LEVELS.includes(scopeLevel)) {
      return reject(`scope_level "${scopeRaw}" is not one of ${SCOPE_LEVELS.join(', ')}`);
    }

    const scopeId = str(pick(raw, 'scope_id', 'scopeId', 'site', 'site_number', 'subject', 'subject_id', 'country'));
    if (scopeLevel !== 'study' && !scopeId) {
      return reject(`scope_id is required at ${scopeLevel} scope`);
    }

    const numerator = numOrNull(pick(raw, 'numerator', 'num'));
    const denominator = numOrNull(pick(raw, 'denominator', 'den'));
    let value = numOrNull(pick(raw, 'value', 'result'));

    if (value === null) {
      // Derive from the pair when the source reports components rather than a
      // computed rate. A zero denominator is rejected, not treated as zero:
      // "no subjects yet" is not "a rate of nothing".
      if (numerator !== null && denominator !== null) {
        if (denominator === 0) return reject('denominator is zero — a rate cannot be computed');
        value = numerator / denominator;
      } else {
        const rawValue = str(pick(raw, 'value', 'result'));
        return reject(rawValue === null
          ? 'no value, and no numerator/denominator to derive one from'
          : `value "${rawValue}" is not a finite number`);
      }
    }

    const observedRaw = str(pick(raw, 'observed_at', 'observedAt', 'date'));
    let observedAt: string | null = null;
    if (observedRaw !== null) {
      const t = Date.parse(observedRaw);
      if (!Number.isFinite(t)) return reject(`observed_at "${observedRaw}" is not a valid date`);
      observedAt = new Date(t).toISOString();
    }

    observations.push({
      metricKey,
      scopeLevel,
      scopeId: scopeLevel === 'study' ? null : scopeId,
      value,
      numerator,
      denominator,
      unit: str(pick(raw, 'unit')),
      observedAt,
    });
  });

  return { observations, rejects, received: rows.length };
}

/** Parse a delimited extract (headers required) and validate it. */
export function parseMetricCsv(csv: string): ParseResult {
  let rows: Record<string, unknown>[];
  try {
    rows = parseCsvSync(csv, {
      columns: (header: string[]) => header.map(h => String(h).trim()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, unknown>[];
  } catch (err) {
    // A malformed file is one reject, not a silent empty load.
    return {
      observations: [],
      rejects: [{ row: 0, reason: `The file could not be parsed as delimited text: ${err instanceof Error ? err.message : String(err)}` }],
      received: 0,
    };
  }
  return parseMetricRows(rows);
}

export interface IngestInput {
  programId: string;
  source: MetricSource;
  sourceRef?: string | null;
  /** The date the extract represents — not the load time. */
  dataCutoff?: string | null;
  rows?: Record<string, unknown>[];
  csv?: string;
  ingestedBy?: number | null;
}

export interface IngestProjection {
  kriReadings: number;
  qtlUpdates: number;
  subjectProfiles: number;
  siteObservations: number;
  /**
   * Study-scope metrics that landed but matched no configured KRI or QTL.
   * Surfaced rather than swallowed: without this, "400 rows ingested" would
   * read as success while every indicator stayed unevaluated.
   */
  unmatched: string[];
}

export interface IngestResult {
  runId: number;
  status: 'succeeded' | 'partial' | 'failed';
  received: number;
  accepted: number;
  rejected: number;
  rejects: RowReject[];
  projection: IngestProjection;
}

/** Latest observation wins when a file reports the same metric/scope twice. */
function latestByKey(observations: ParsedObservation[]): Map<string, ParsedObservation> {
  const out = new Map<string, ParsedObservation>();
  for (const o of observations) {
    const key = `${o.scopeLevel} ${o.scopeId ?? ''} ${o.metricKey.toLowerCase()}`;
    const prev = out.get(key);
    if (!prev || (o.observedAt ?? '') >= (prev.observedAt ?? '')) out.set(key, o);
  }
  return out;
}

/**
 * Land an extract and project it onto the engines that consume it.
 *
 * Projection is deliberately narrow in this first slice, and the caller is
 * told exactly what happened to each class of row:
 *   - study scope  → appended as a KRI reading (status recomputed by the
 *                    engine, never by this module) or rolled onto a QTL's
 *                    current value; reported as `unmatched` when it binds to
 *                    neither.
 *   - subject scope → merged into the subject's patient-profile metrics, which
 *                    is what scorePatientCohort reads.
 *   - site/country  → stored with provenance and available, but NOT folded
 *                    into the site-risk composite, which still derives from
 *                    Site Intelligence. Counted so the caller can see they
 *                    landed without inferring they changed a score.
 *
 * The caller owns the transaction: pass a pooled client inside BEGIN/COMMIT.
 */
export async function ingestMetrics(
  exec: Exec,
  organizationId: number,
  input: IngestInput,
): Promise<IngestResult> {
  const parsed = input.csv !== undefined
    ? parseMetricCsv(input.csv)
    : parseMetricRows(input.rows ?? []);

  const cutoff = input.dataCutoff ?? null;

  const run = (await exec.query(
    `INSERT INTO rbm_data_runs (organization_id, program_id, source, source_ref, data_cutoff, status, ingested_by)
     VALUES ($1,$2,$3,$4,$5,'running',$6) RETURNING id`,
    [organizationId, input.programId, input.source, input.sourceRef ?? null, cutoff, input.ingestedBy ?? null],
  )).rows[0];
  const runId: number = run.id;

  const projection: IngestProjection = {
    kriReadings: 0, qtlUpdates: 0, subjectProfiles: 0, siteObservations: 0, unmatched: [],
  };

  // ── Land every accepted observation, tied to this run. ──────────────────
  for (const o of parsed.observations) {
    await exec.query(
      `INSERT INTO rbm_metric_observations (
         organization_id, program_id, run_id, metric_key, scope_level, scope_id,
         value, numerator, denominator, unit, observed_at, data_cutoff
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11::timestamptz, NOW()), $12)`,
      [
        organizationId, input.programId, runId, o.metricKey, o.scopeLevel, o.scopeId,
        o.value, o.numerator, o.denominator, o.unit, o.observedAt, cutoff,
      ],
    );
    if (o.scopeLevel === 'site' || o.scopeLevel === 'country') projection.siteObservations += 1;
  }

  const latest = latestByKey(parsed.observations);

  // ── Study scope → KRI readings and QTL current values. ──────────────────
  for (const o of latest.values()) {
    if (o.scopeLevel !== 'study') continue;

    const kri = (await exec.query(
      `SELECT id, direction, threshold_amber, threshold_red FROM rbm_kris
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND (LOWER(name) = LOWER($3) OR LOWER(COALESCE(metadata->>'metricKey','')) = LOWER($3))
        LIMIT 1`,
      [organizationId, input.programId, o.metricKey],
    )).rows[0];

    if (kri) {
      // Status is the engine's call, from the KRI's own thresholds and
      // direction — this module never bands a value itself.
      const status = kriStatus(
        o.value,
        kri.threshold_amber === null ? null : Number(kri.threshold_amber),
        kri.threshold_red === null ? null : Number(kri.threshold_red),
        (kri.direction ?? 'higher_worse') as KriDirection,
      );
      await exec.query(
        `INSERT INTO rbm_kri_values (organization_id, kri_id, value, status, observed_at, note)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, NOW()), $6)`,
        [organizationId, kri.id, o.value, status, o.observedAt, `Ingested from ${input.source}${input.sourceRef ? ` (${input.sourceRef})` : ''}`],
      );
      await exec.query(
        `UPDATE rbm_kris SET current_value = $1, status = $2, evaluated_at = COALESCE($3::timestamptz, NOW()), updated_at = NOW()
          WHERE id = $4 AND organization_id = $5`,
        [o.value, status, o.observedAt, kri.id, organizationId],
      );
      projection.kriReadings += 1;
      continue;
    }

    const qtl = (await exec.query(
      `SELECT id, threshold, secondary_limit FROM rbm_qtls
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND LOWER(parameter) = LOWER($3)
        LIMIT 1`,
      [organizationId, input.programId, o.metricKey],
    )).rows[0];

    if (qtl) {
      const status = qtlStatus(
        o.value,
        qtl.threshold === null ? null : Number(qtl.threshold),
        qtl.secondary_limit === null ? null : Number(qtl.secondary_limit),
      );
      await exec.query(
        `UPDATE rbm_qtls SET current_value = $1, status = $2, breached = $3, updated_at = NOW()
          WHERE id = $4 AND organization_id = $5`,
        [o.value, status, status === 'breached', qtl.id, organizationId],
      );
      projection.qtlUpdates += 1;
      continue;
    }

    projection.unmatched.push(o.metricKey);
  }

  // ── Subject scope → patient-profile metrics (what the cohort scorer reads). ─
  const bySubject = new Map<string, Record<string, number>>();
  for (const o of latest.values()) {
    if (o.scopeLevel !== 'subject' || !o.scopeId) continue;
    const dims = bySubject.get(o.scopeId) ?? {};
    dims[o.metricKey] = o.value;
    bySubject.set(o.scopeId, dims);
  }
  for (const [subjectId, dims] of bySubject) {
    // Merge rather than replace: one feed rarely carries every dimension, and
    // overwriting would silently delete metrics another source supplied.
    await exec.query(
      `INSERT INTO rbm_patient_profiles (organization_id, program_id, subject_id, metrics)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (organization_id, program_id, subject_id) DO UPDATE
         SET metrics = COALESCE(rbm_patient_profiles.metrics, '{}'::jsonb) || EXCLUDED.metrics,
             updated_at = NOW()`,
      [organizationId, input.programId, subjectId, JSON.stringify(dims)],
    );
    projection.subjectProfiles += 1;
  }

  const accepted = parsed.observations.length;
  const rejected = parsed.rejects.length;
  const status: IngestResult['status'] =
    rejected === 0 ? 'succeeded'
      : accepted === 0 ? 'failed'
        : 'partial';

  await exec.query(
    `UPDATE rbm_data_runs
        SET status = $1, rows_received = $2, rows_accepted = $3, rows_rejected = $4,
            rejects = $5::jsonb, finished_at = NOW(), updated_at = NOW(),
            metadata = COALESCE(metadata,'{}'::jsonb) || $6::jsonb
      WHERE id = $7 AND organization_id = $8`,
    [
      status, parsed.received, accepted, rejected,
      JSON.stringify(parsed.rejects.slice(0, MAX_PERSISTED_REJECTS)),
      JSON.stringify({ projection }),
      runId, organizationId,
    ],
  );

  return {
    runId, status,
    received: parsed.received,
    accepted,
    rejected,
    rejects: parsed.rejects,
    projection,
  };
}

/** How stale a source's last successful load is allowed to be before the board
 *  calls it out. Seven days is the common central-monitoring review cadence;
 *  a feed quieter than that is not supporting a live indicator. */
export const FRESHNESS_STALE_DAYS = 7;

export interface SourceFreshness {
  source: string;
  lastRunAt: string | null;
  dataCutoff: string | null;
  status: string;
  rowsAccepted: number;
  rowsRejected: number;
  /** True when the newest successful load is older than FRESHNESS_STALE_DAYS. */
  stale: boolean;
  ageDays: number | null;
}

/** Days between an ISO timestamp and `now`, or null when never loaded. */
export function ageInDays(at: string | null, now: Date): number | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** Decide staleness from a source's newest run. Pure, so the rule is testable. */
export function freshnessFromRun(
  row: { source: string; startedAt: string | null; dataCutoff: string | null; status: string; rowsAccepted: number; rowsRejected: number },
  now: Date,
): SourceFreshness {
  // Staleness is measured from the extract's cutoff when it has one: a load
  // that ran this morning against a three-week-old export is not fresh data.
  const basis = row.dataCutoff ?? row.startedAt;
  const ageDays = ageInDays(basis, now);
  return {
    source: row.source,
    lastRunAt: row.startedAt,
    dataCutoff: row.dataCutoff,
    status: row.status,
    rowsAccepted: row.rowsAccepted,
    rowsRejected: row.rowsRejected,
    stale: row.status === 'failed' || ageDays === null || ageDays > FRESHNESS_STALE_DAYS,
    ageDays,
  };
}
