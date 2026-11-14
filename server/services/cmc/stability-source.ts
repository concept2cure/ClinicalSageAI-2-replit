/**
 * Project-scoped reader for stability studies, with explicit availability.
 *
 * ## Why this module exists
 *
 * Module 3 code used to read stability studies with:
 *
 * ```sql
 * SELECT study_name, study_type, storage_condition, duration, status, results
 * FROM stability_studies WHERE project_id = $1::text::uuid
 * ```
 *
 * Every one of those reads failed at runtime, silently. The provisioned
 * `public.stability_studies` table (`shared/schema.ts` →
 * `migrations/0000_sweet_joseph.sql`) has **no `project_id` column at all** —
 * it is scoped by `organization_id` only — and it does not have
 * `study_name`, `storage_condition`, or `results` either (it has
 * `study_title`, `storage_conditions text[]`, and `stability_data`). The
 * column set those queries targeted belongs to `shared/cmc-schema.ts`, which
 * is never provisioned: `drizzle.config.ts` points at `./shared/schema.ts`
 * only and no SQL migration creates that shape.
 *
 * The callers wrapped the query in a try/catch that returned `[]`, so a
 * guaranteed `relation/column does not exist` error was indistinguishable
 * from "this project genuinely has no stability studies". Downstream rules
 * then asserted the latter as fact — e.g. ICH Q1A(R2) reported
 * "No stability studies recorded for the project" with the fabricated
 * evidence string `stability_studies row count: 0`, a count that was never
 * obtained. In a regulated compliance check that is the defect: a check that
 * could not run must never render as a check that ran.
 *
 * ## What this module reads instead
 *
 * `cmc_source_objects` (`db/migrations/20260401_cmc_convergence_os.sql`) is
 * provisioned, is scoped by BOTH `organization_id` and `project_id`, and is
 * the canonical Module 3 source store. `writeThroughStabilityStudy()`
 * (`server/services/cmc-write-through.ts`) upserts every stability save into
 * it under `source_type = 'stability'`, with a payload whose field names are
 * exactly the ones the broken queries were aliasing to. So the information
 * the checks need is genuinely available — under a different home, not a
 * different column name.
 *
 * Deliberately NOT read here: the org-scoped `public.stability_studies`
 * table. It carries no project linkage, so attributing its rows to a project
 * would mean reporting one project's studies as another's. Absent a
 * project key, "unknown" is the only honest answer.
 *
 * @module server/services/cmc/stability-source
 */

import {
  inspectRecordedSeriesCriterion,
  parseMonthTime,
  parseNumeric,
  readRecordedStabilityResults,
  type StabilityPointRecord,
} from './recorded-stability';
import { forecastTrend, type ForecastVerdict } from './stability-trending';
import type { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('cmc-stability-source');

type Pool = ReturnType<typeof getPool>;

/** The canonical `source_type` value written by `writeThroughStabilityStudy`. */
export const STABILITY_SOURCE_TYPE = 'stability';

/**
 * A stability study normalized to the field names the ICH / QbD / control
 * strategy rules consume.
 */
export interface StabilityStudyRecord {
  studyName: string;
  studyType: string;
  storageCondition: string;
  duration: string;
  timePoints: string;
  /**
   * The shelf life the organisation CLAIMS — what §3.2.P.8.1 states and what
   * ICH Q1E is evaluated against (ich-compliance-q1e.ts). The write-through
   * emits it as `shelfLifeClaim`; the register's own column is `shelf_life`.
   * Free text, so the rule parses it and refuses to guess.
   */
  shelfLifeClaim: string;
  /**
   * Which side the study is evidence for — the write-through resolves it
   * through the shared vocabulary and emits `stabilityScope`
   * ('drug_substance' | 'drug_product' | 'both'). Carried because Q1A(R2) and
   * Q1E judge a substance's re-test period and a product's shelf life
   * separately, on their own data: without it the Q1E rule saw every study as
   * one pool and compared a 36-month DS re-test period with the product's
   * coverage.
   */
  scope: string;
  testParameters: string;
  containerClosure: string;
  status: string;
  results: unknown;
}

/**
 * Outcome of a stability read.
 *
 * `available: false` means the read could not be performed — the caller must
 * report "cannot evaluate", NOT "no studies found". `available: true` with an
 * empty `studies` array is the genuine "this project has no stability studies"
 * answer and may be asserted as such.
 */
export type StabilitySourceResult =
  | { available: true; studies: StabilityStudyRecord[]; reason?: undefined }
  | { available: false; studies: StabilityStudyRecord[]; reason: string };

/** Coerce a payload value that may be a string, an array, or null into a string. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(v => String(v ?? '').trim()).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return '';
  return String(value).trim();
}

/**
 * Pick the first non-empty rendering among several candidate payload keys.
 *
 * Payloads arrive in two dialects. The legacy dialect uses `studyName` /
 * `storageCondition`; rows originating from the drizzle `stability_studies`
 * table use `studyTitle` / `storageConditions` (a `text[]`). We accept both
 * so this reader keeps working regardless of which writer produced the row.
 */
function pickText(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const rendered = asText(payload[key]);
    if (rendered) return rendered;
  }
  return '';
}

/** Normalize one `cmc_source_objects.source_payload` into a StabilityStudyRecord. */
export function normalizeStabilityPayload(payload: Record<string, unknown>): StabilityStudyRecord {
  return {
    studyName: pickText(payload, ['studyName', 'study_name', 'studyTitle', 'study_title']),
    studyType: pickText(payload, ['studyType', 'study_type']),
    storageCondition: pickText(payload, [
      'storageCondition', 'storage_condition',
      'storageConditions', 'storage_conditions',
    ]),
    duration: pickText(payload, ['duration']),
    timePoints: pickText(payload, ['timePoints', 'time_points']),
    shelfLifeClaim: pickText(payload, ['shelfLifeClaim', 'shelf_life_claim', 'shelfLife', 'shelf_life']),
    scope: pickText(payload, ['stabilityScope', 'stability_scope', 'scope']),
    testParameters: pickText(payload, [
      'testParameters', 'test_parameters', 'stabilityParameters',
    ]),
    containerClosure: pickText(payload, ['containerClosure', 'container_closure']),
    status: pickText(payload, ['status']),
    results: payload.results ?? payload.stabilityData ?? payload.stability_data ?? null,
  };
}

/**
 * Read every stability study recorded against a (organization, CMC project)
 * pair from the canonical source-object store.
 *
 * Only the latest `version` per `source_key` is returned, mirroring the
 * "latest wins" semantics of `cmc-write-through.ts`.
 *
 * @param pool      Active pg pool.
 * @param orgId     Organization id (tenant scope — non-negotiable).
 * @param projectId CMC project id, compared as text.
 * @returns `available: true` with the studies, or `available: false` with a
 *          human-readable reason the read could not be performed. Never
 *          throws: the reason is data, so callers can surface it.
 */
export async function loadProjectStabilityStudies(
  pool: Pool,
  orgId: number,
  projectId: string,
): Promise<StabilitySourceResult> {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return {
      available: false,
      studies: [],
      reason: `organizationId must be a positive integer (got ${String(orgId)}); refusing an unscoped stability read`,
    };
  }
  if (!projectId || typeof projectId !== 'string') {
    return {
      available: false,
      studies: [],
      reason: `projectId is required (got ${String(projectId)}); refusing an unscoped stability read`,
    };
  }

  try {
    const { rows } = await pool.query<{
      sourceKey: string;
      sourcePayload: Record<string, unknown> | null;
    }>(
      `SELECT source_key AS "sourceKey",
              source_payload AS "sourcePayload"
       FROM cmc_source_objects
       WHERE organization_id = $1
         AND project_id::text = $2
         AND source_type = $3
       ORDER BY version DESC, updated_at DESC`,
      [orgId, String(projectId), STABILITY_SOURCE_TYPE],
    );

    // Dedup to the freshest row per source_key.
    const seen = new Set<string>();
    const studies: StabilityStudyRecord[] = [];
    for (const row of rows) {
      const key = row.sourceKey ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      studies.push(normalizeStabilityPayload(row.sourcePayload ?? {}));
    }

    return { available: true, studies };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn('Stability source read failed — reporting as not evaluable', {
      orgId,
      projectId,
      error: detail,
    });
    return {
      available: false,
      studies: [],
      reason: `stability source read failed: ${detail}`,
    };
  }
}

/* ── Pull schedule: what is due on a study (P-122 inventory B2) ──────────────
 *
 * The Stability register listed each study's pull points only to fill the
 * result form, and never its start date, so "what is due this month" — the
 * question a stability coordinator opens the register to answer — had no
 * answer on the CMC screen. Each pull point's planned date is the recorded
 * start date plus its months, parsed by the same `parseMonthTime` the trend
 * and the Q1E fit read; a point it cannot parse is reported as such, never
 * dropped. A point whose planned date has passed is OVERDUE when nothing is
 * recorded at it, and INCOMPLETE when some of its recorded test parameters have
 * a result and some do not (on the demo programme, water content was never
 * recorded at any pull: that is a gap in a pull, not a missed one). No grace
 * window is invented.
 */
export type PullState = 'recorded' | 'overdue' | 'incomplete' | 'due-today' | 'planned' | 'not-scheduled';

export interface PullPoint {
  /** The pull point as the study records it. */
  label: string;
  months: number | null;
  /** YYYY-MM-DD, or null when the point or the start date cannot be read. */
  plannedDate: string | null;
  recorded: string[];
  outstanding: string[];
  state: PullState;
  /** Why a point has no date, in words. */
  reason?: string;
  /**
   * On a pull still to come: what the study's own recorded results predict
   * for each recorded test at it (stability-trending.ts `forecastTrend`), or
   * why no forecast can be made for that test.
   */
  forecast?: PullForecast[];
}

export type PullForecast =
  | { parameter: string; ok: false; detail: string }
  | {
      parameter: string; ok: true;
      predicted: number; interval: { lower: number; upper: number };
      verdict: ForecastVerdict; pointsUsed: number;
      /** The acceptance criterion the verdict reads, as recorded, or '' when none is. */
      criterion: string;
    };

/** One test's forecast at a month to come, from the results recorded for it on this study. */
function pullForecast(parameter: string, results: StabilityPointRecord[], months: number): PullForecast {
  const own = results.filter((r) => String(r.parameter ?? '').trim().toLowerCase() === parameter.toLowerCase());
  const conditions = new Set(own.map((r) => String(r.condition ?? '').trim()).filter(Boolean));
  if (conditions.size > 1) {
    return { parameter, ok: false, detail: 'its results are recorded at more than one storage condition, so one line is not fitted through them' };
  }
  const inspected = inspectRecordedSeriesCriterion(own);
  if (inspected.reason) return { parameter, ok: false, detail: inspected.reason };
  const points = own.flatMap((r) => {
    const time = parseMonthTime(r.timePoint);
    const value = parseNumeric(r.result);
    return time === null || value === null ? [] : [{ time, value }];
  });
  const outcome = forecastTrend(points, [months], inspected.criterion);
  if (!outcome.ok) return { parameter, ok: false, detail: outcome.detail };
  const at = outcome.at[0];
  return {
    parameter, ok: true, predicted: at.predicted, interval: at.interval, verdict: at.verdict, pointsUsed: outcome.pointsUsed,
    criterion: String(own.find((r) => String(r.specification ?? '').trim())?.specification ?? '').trim(),
  };
}

export interface PullSchedule {
  points: PullPoint[];
  /** The next pull to come (planned or due today), or null when none is. */
  next: PullPoint | null;
  /** Past pulls with nothing recorded. */
  overdue: number;
  /** Past pulls with some recorded test parameters still without a result. */
  incomplete: number;
  /** Why no schedule could be drawn at all (no pull points, no start date). */
  reason?: string;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function startDay(value: unknown): Date | null {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '').trim();
  const m = text.match(ISO_DAY);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Start plus whole months, held to the month's last day (31 Jan + 1 month = 28/29 Feb). */
function addMonths(start: Date, months: number): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const textList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean);

export function stabilityPullSchedule(
  study: { startDate?: unknown; timePoints?: unknown; testParameters?: unknown; stabilityData?: unknown },
  today: Date,
): PullSchedule {
  const labels = textList(study.timePoints);
  if (labels.length === 0) return { points: [], next: null, overdue: 0, incomplete: 0, reason: 'No pull points are recorded on this study.' };
  const start = startDay(study.startDate);
  const parameters = textList(study.testParameters);
  const results = readRecordedStabilityResults(study.stabilityData).points;
  const todayText = dayText(today);

  const points: PullPoint[] = labels.map((label) => {
    const months = parseMonthTime(label);
    const at = results.filter((r) => months !== null && parseMonthTime(r.timePoint) === months);
    const recorded = [...new Set(at.map((r) => String(r.parameter ?? '').trim()).filter(Boolean))];
    const outstanding = parameters.filter((p) => !recorded.some((r) => r.toLowerCase() === p.toLowerCase()));
    const complete = parameters.length > 0 ? outstanding.length === 0 : at.length > 0;
    if (months === null || !Number.isInteger(months)) {
      return { label, months, plannedDate: null, recorded, outstanding, state: complete ? 'recorded' : 'not-scheduled',
        reason: months === null ? `"${label}" is not a number of months.` : `${label} is not a whole number of months, so no calendar date is drawn.` };
    }
    if (!start) {
      return { label, months, plannedDate: null, recorded, outstanding, state: complete ? 'recorded' : 'not-scheduled',
        reason: 'No start date is recorded on this study.' };
    }
    const plannedDate = dayText(addMonths(start, months));
    const past = plannedDate < todayText;
    const state: PullState = complete ? 'recorded'
      : past ? (at.length > 0 ? 'incomplete' : 'overdue')
        : plannedDate === todayText ? 'due-today' : 'planned';
    const toCome = state === 'planned' || state === 'due-today';
    return {
      label, months, plannedDate, recorded, outstanding, state,
      ...(toCome && parameters.length > 0 ? { forecast: parameters.map((p) => pullForecast(p, results, months)) } : {}),
    };
  });

  const upcoming = points
    .filter((p) => p.state === 'planned' || p.state === 'due-today')
    .sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
  return {
    points,
    next: upcoming[0] ?? null,
    overdue: points.filter((p) => p.state === 'overdue').length,
    incomplete: points.filter((p) => p.state === 'incomplete').length,
    ...(start ? {} : { reason: 'No start date is recorded on this study, so no pull has a planned date.' }),
  };
}
