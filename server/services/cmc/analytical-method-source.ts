/**
 * Project-scoped reader for analytical methods, with explicit availability.
 *
 * ## Why this module exists
 *
 * Three CMC engines read analytical methods from `public.analytical_methods`,
 * selecting a method's name, its type, its purpose, its validation status and
 * the five per-characteristic validation records (specificity, linearity,
 * accuracy, precision, robustness), filtered by a project id cast to uuid.
 *
 * (Written out rather than quoted as SQL on purpose: ci:column-reachability
 * parses this file for statements, and a quoted example of the defect reads to
 * it as a live reference to the very columns this module exists to stop
 * querying.)
 *
 * Every one of those reads raises 42703 on every provisioned database. The
 * deployed `public.analytical_methods` (`shared/schema.ts` →
 * `migrations/0000_sweet_joseph.sql`) is an ORGANIZATION method library: it
 * has no `project_id`, no `method_type`, no `purpose`, no `validation_status`
 * and none of the `*_data` columns. That column set belongs to
 * `shared/cmc-schema.ts`, which `drizzle.config.ts` never provisions and no
 * SQL migration creates — the same split `stability-source.ts` documents for
 * stability studies, and this module is its sibling.
 *
 * The consequences differed by caller, and one of them was the defect this
 * codebase exists not to have:
 *
 *   · ich-compliance-checker.ts wrapped it in `safe()`, so Q2 reported
 *     `Q2_NOT_EVALUATED` and the overall status went `incomplete`. Honest, and
 *     useless: the ICH Q2 analytical-validation check has never run on any
 *     deployed database.
 *   · qbd-analyzer.ts did the same through `safeQuery`.
 *   · control-strategy-generator.ts caught the error and returned `[]`. A
 *     guaranteed `column does not exist` became "this project has no
 *     analytical methods", and every CQA was then reported as having no
 *     method to control it — a failed read rendered as a finding.
 *
 * ## What this module reads instead
 *
 * `cmc_source_objects` is provisioned, is scoped by BOTH `organization_id` and
 * `project_id`, and is the canonical Module 3 source store.
 * `writeThroughAnalyticalMethod()` (`server/services/cmc-write-through.ts`) is
 * its ONLY writer under `source_type = 'method'`, and
 * `mapAnalyticalMethodPayload` puts exactly the fields these engines need into
 * the payload — methodName, methodType, purpose, validationStatus and the five
 * `*_data` validation records — under the very names the broken queries were
 * aliasing to. The information was always there, under a different home.
 *
 * ## "No methods" is a claim, and this module refuses to make it blind
 *
 * A zero-row answer has two causes that must never be conflated: the project
 * genuinely has no analytical methods, or the project id addresses nothing
 * here. `cmc_source_objects.project_id` is free TEXT holding either a program
 * uuid or a legacy numeric `projects.id`
 * (`services/cmc/resolve-cmc-artifact-project.ts`), so a caller passing the
 * wrong one of the two matches no rows and would have been told, in a
 * regulated compliance report, that the project has no validated methods.
 *
 * So zero methods is only reported as an answer when the project has OTHER
 * recorded CMC source objects — that is what makes "no methods" a fact about
 * methods rather than about the id. With no source objects at all, the read is
 * `available: false` and every caller reports "could not evaluate". This is
 * the corroboration a uuid-shape guard was reaching for, without guessing at a
 * shape both of whose forms are legitimate.
 *
 * @module server/services/cmc/analytical-method-source
 */

import type { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('cmc-analytical-method-source');

type Pool = ReturnType<typeof getPool>;

/** The canonical `source_type` written by `writeThroughAnalyticalMethod`. */
export const METHOD_SOURCE_TYPE = 'method';

/**
 * An analytical method normalized to the field names the ICH / QbD / control
 * strategy rules consume.
 */
export interface AnalyticalMethodRecord {
  methodName: string;
  methodType: string;
  purpose: string;
  /**
   * The recorded validation status, or '' when the register holds none.
   *
   * Empty is NOT "unvalidated". A method whose validation status was never
   * recorded has not been shown to fail validation, and ICH Q2 must report it
   * as not evaluated rather than as a failure — `validationStatusRecorded`
   * below is what lets a rule tell the two apart without re-deriving it from
   * the string.
   */
  validationStatus: string;
  /** False when no validation status is recorded for this method at all. */
  validationStatusRecorded: boolean;
  specificityData: unknown;
  linearityData: unknown;
  accuracyData: unknown;
  precisionData: unknown;
  robustnessData: unknown;
}

/**
 * Outcome of a method read.
 *
 * `available: false` means the read could not be performed, or could not be
 * corroborated — the caller must report "cannot evaluate", NOT "no methods
 * found". `available: true` with an empty array is the genuine "this project
 * records no analytical methods" answer and may be asserted as such.
 */
export type AnalyticalMethodSourceResult =
  | { available: true; methods: AnalyticalMethodRecord[]; reason?: undefined }
  | { available: false; methods: AnalyticalMethodRecord[]; reason: string };

/** A payload value rendered for prose, or '' when nothing is recorded. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(v => String(v ?? '').trim()).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return '';
  return String(value).trim();
}

/** The first non-empty rendering among several candidate payload keys. */
function pickText(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const rendered = asText(payload[key]);
    if (rendered) return rendered;
  }
  return '';
}

/** The first non-null value among several candidate payload keys. */
function pickValue(payload: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const v = payload[key];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

/** Normalize one `cmc_source_objects.source_payload` into a method record. */
export function normalizeMethodPayload(
  payload: Record<string, unknown>,
): AnalyticalMethodRecord {
  /* Both dialects accepted, as stability-source.ts does: the write-through's
     camelCase and the snake_case a caller may have supplied verbatim. */
  const validationStatus = pickText(payload, [
    'validationStatus', 'validation_status', 'status',
  ]);
  return {
    methodName: pickText(payload, ['methodName', 'method_name', 'title']),
    methodType: pickText(payload, ['methodType', 'method_type', 'technique']),
    purpose: pickText(payload, ['purpose']),
    validationStatus,
    validationStatusRecorded: validationStatus !== '',
    specificityData: pickValue(payload, ['specificity_data', 'specificityData']),
    linearityData: pickValue(payload, ['linearity_data', 'linearityData']),
    accuracyData: pickValue(payload, ['accuracy_data', 'accuracyData']),
    precisionData: pickValue(payload, ['precision_data', 'precisionData']),
    robustnessData: pickValue(payload, ['robustness_data', 'robustnessData']),
  };
}

/**
 * Read every analytical method recorded against an (organization, CMC project)
 * pair from the canonical source-object store.
 *
 * Only the latest `version` per `source_key` is returned, mirroring the
 * "latest wins" semantics of `cmc-write-through.ts`.
 *
 * Never throws: the reason is data, so callers can surface it.
 */
export async function loadProjectAnalyticalMethods(
  pool: Pool,
  orgId: number,
  projectId: string,
): Promise<AnalyticalMethodSourceResult> {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return {
      available: false,
      methods: [],
      reason: `organizationId must be a positive integer (got ${String(orgId)}); refusing an unscoped method read`,
    };
  }
  if (!projectId || typeof projectId !== 'string') {
    return {
      available: false,
      methods: [],
      reason: `projectId is required (got ${String(projectId)}); refusing an unscoped method read`,
    };
  }

  try {
    /* One round trip for the methods AND the corroboration: `anyForProject`
       says whether this (org, project) addresses ANY recorded CMC source
       object. Without it a zero-row answer cannot be told apart from an id
       that matches nothing — see the module header. */
    const { rows } = await pool.query<{
      sourceKey: string;
      sourcePayload: Record<string, unknown> | null;
      isMethod: boolean;
    }>(
      `SELECT source_key AS "sourceKey",
              source_payload AS "sourcePayload",
              (source_type = $3) AS "isMethod"
       FROM cmc_source_objects
       WHERE organization_id = $1
         AND project_id::text = $2
       ORDER BY version DESC, updated_at DESC`,
      [orgId, String(projectId), METHOD_SOURCE_TYPE],
    );

    if (rows.length === 0) {
      return {
        available: false,
        methods: [],
        reason:
          `no CMC source object of any type is recorded for project ${projectId} in organization ` +
          `${orgId}, so "no analytical methods" cannot be distinguished from a project id that ` +
          'addresses nothing here',
      };
    }

    // Dedup to the freshest row per source_key.
    const seen = new Set<string>();
    const methods: AnalyticalMethodRecord[] = [];
    for (const row of rows) {
      if (!row.isMethod) continue;
      const key = row.sourceKey ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      methods.push(normalizeMethodPayload(row.sourcePayload ?? {}));
    }

    return { available: true, methods };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn('Analytical-method source read failed — reporting as not evaluable', {
      orgId,
      projectId,
      error: detail,
    });
    return {
      available: false,
      methods: [],
      reason: `analytical method source read failed: ${detail}`,
    };
  }
}
