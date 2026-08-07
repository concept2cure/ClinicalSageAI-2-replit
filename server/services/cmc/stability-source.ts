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
