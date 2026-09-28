/**
 * Project-scoped reader for drug substances, with explicit availability.
 *
 * ## Why this module exists
 *
 * The third and last of this family, after `stability-source.ts` and
 * `analytical-method-source.ts`, and the same split for the same reason.
 *
 * Two CMC engines read `public.drug_substances` for a substance's name, its
 * impurity profile and its characterization data, filtered by a project id
 * cast to uuid. The provisioned table (`shared/schema.ts` →
 * `migrations/0000_sweet_joseph.sql`) has none of those three things: it is
 * org-scoped with NO `project_id` at all, it spells the impurity field
 * `impurities_profile`, and it has no characterization column. The names those
 * queries used belong to `shared/cmc-schema.ts`, which `drizzle.config.ts`
 * never provisions.
 *
 * (Column names written out rather than quoted as SQL, as the sibling module
 * does: ci:column-reachability parses this file for statements, and a quoted
 * example of the defect reads to it as a live reference.)
 *
 * So the read raised 42703 and ICH Q3A(R2) / Q3B — the impurity checks — have
 * never run on any deployed database. `safe()` reported it honestly as
 * `Q3A_NOT_EVALUATED`; nothing was fabricated, and nothing was checked either.
 *
 * ## What this module reads instead
 *
 * `cmc_source_objects` under `source_type = 'drug_substance'`, written by
 * `writeThroughDrugSubstance()` through `mapDrugSubstancePayload`
 * (`server/services/cmc-write-through.ts`) — whose payload carries `name`,
 * `impurities` and `characterization_data` under exactly the names the broken
 * queries aliased to, alongside the modality and biologic-origin fields the
 * §3.2.A.2 work added.
 *
 * ## The claim this module refuses to make blind
 *
 * Identical to its sibling, and for the identical reason: a zero-row answer
 * means either "this project records no drug substance" or "this project id
 * addresses nothing here", and `cmc_source_objects.project_id` is free TEXT
 * holding either a program uuid or a legacy numeric `projects.id`. Zero is
 * only reported as an answer when the project has OTHER recorded source
 * objects. With none at all the read is `available: false` and the caller says
 * "could not evaluate" rather than putting an impurity finding on a project it
 * cannot address.
 *
 * @module server/services/cmc/drug-substance-source
 */

import type { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('cmc-drug-substance-source');

type Pool = ReturnType<typeof getPool>;

/** The canonical `source_type` written by `writeThroughDrugSubstance`. */
export const DRUG_SUBSTANCE_SOURCE_TYPE = 'drug_substance';

/**
 * A drug substance normalized to the field names the ICH and QbD rules
 * consume.
 */
export interface DrugSubstanceRecord {
  substanceName: string;
  /**
   * The impurity profile recorded ON the drug-substance record, or null.
   *
   * Null here does NOT mean the project records no impurities: the impurity
   * register is its own source type (`impurity_profile`), and on the reference
   * database a project carried four of those while this field was null. Any
   * rule concluding absence must look at both — see checkQ3AandQ3B.
   */
  impurities: unknown;
  characterizationData: unknown;
}

/**
 * Outcome of a drug-substance read.
 *
 * `available: false` means the read could not be performed, or could not be
 * corroborated — the caller must report "cannot evaluate", NOT "no drug
 * substance". `available: true` with an empty array is the genuine answer.
 */
export type DrugSubstanceSourceResult =
  | { available: true; drugSubstances: DrugSubstanceRecord[]; reason?: undefined }
  | { available: false; drugSubstances: DrugSubstanceRecord[]; reason: string };

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

/** Normalize one `cmc_source_objects.source_payload` into a substance record. */
export function normalizeDrugSubstancePayload(
  payload: Record<string, unknown>,
): DrugSubstanceRecord {
  return {
    substanceName: pickText(payload, ['name', 'substanceName', 'substance_name']),
    impurities: pickValue(payload, ['impurities', 'impurities_profile', 'impuritiesProfile']),
    characterizationData: pickValue(payload, [
      'characterization_data', 'characterizationData',
    ]),
  };
}

/**
 * Read every drug substance recorded against an (organization, CMC project)
 * pair from the canonical source-object store.
 *
 * Only the latest `version` per `source_key` is returned, mirroring the
 * "latest wins" semantics of `cmc-write-through.ts`. Never throws: the reason
 * is data, so callers can surface it.
 */
export async function loadProjectDrugSubstances(
  pool: Pool,
  orgId: number,
  projectId: string,
): Promise<DrugSubstanceSourceResult> {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return {
      available: false,
      drugSubstances: [],
      reason: `organizationId must be a positive integer (got ${String(orgId)}); refusing an unscoped drug-substance read`,
    };
  }
  if (!projectId || typeof projectId !== 'string') {
    return {
      available: false,
      drugSubstances: [],
      reason: `projectId is required (got ${String(projectId)}); refusing an unscoped drug-substance read`,
    };
  }

  try {
    /* One round trip for the substances AND the corroboration, exactly as
       analytical-method-source.ts does: `isSubstance` marks the rows this
       reader returns, and the presence of ANY row says the project id
       addresses recorded CMC data. */
    const { rows } = await pool.query<{
      sourceKey: string;
      sourcePayload: Record<string, unknown> | null;
      isSubstance: boolean;
    }>(
      `SELECT source_key AS "sourceKey",
              source_payload AS "sourcePayload",
              (source_type = $3) AS "isSubstance"
       FROM cmc_source_objects
       WHERE organization_id = $1
         AND project_id::text = $2
       ORDER BY version DESC, updated_at DESC`,
      [orgId, String(projectId), DRUG_SUBSTANCE_SOURCE_TYPE],
    );

    if (rows.length === 0) {
      return {
        available: false,
        drugSubstances: [],
        reason:
          `no CMC source object of any type is recorded for project ${projectId} in organization ` +
          `${orgId}, so "no drug substance" cannot be distinguished from a project id that ` +
          'addresses nothing here',
      };
    }

    const seen = new Set<string>();
    const drugSubstances: DrugSubstanceRecord[] = [];
    for (const row of rows) {
      if (!row.isSubstance) continue;
      const key = row.sourceKey ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      drugSubstances.push(normalizeDrugSubstancePayload(row.sourcePayload ?? {}));
    }

    return { available: true, drugSubstances };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn('Drug-substance source read failed — reporting as not evaluable', {
      orgId,
      projectId,
      error: detail,
    });
    return {
      available: false,
      drugSubstances: [],
      reason: `drug substance source read failed: ${detail}`,
    };
  }
}
