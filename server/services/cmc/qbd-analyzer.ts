/**
 * Data-driven CMC QbD analyzer.
 *
 * Reads the project's actual quality data — specifications, analytical
 * methods, stability studies, manufacturing processes, drug substance
 * characterization — and derives:
 *   - Critical Quality Attributes (CQAs) from spec test parameters,
 *     impurity profiles, and stability indicators.
 *   - Critical Process Parameters (CPPs) from manufacturing process
 *     records and in-process controls.
 *
 * Replaces the type-string-keyed heuristics in blueprintRoutes.ts for
 * any caller that has a real project. The heuristics remain in place for
 * pre-project blueprint generation where no source data exists yet.
 *
 * @module server/services/cmc/qbd-analyzer
 */

import { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { loadProjectStabilityStudies } from './stability-source';
import {
  extractParameterNames, extractImpurityNames, extractCharacterizationAttrs,
  extractCppEntries, extractCppFromPayload,
  classifyCqaIchBasis, matchesAnyPurpose, prettifyAttribute,
} from './qbd-helpers';

const log = createScopedLogger('cmc-qbd-analyzer');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CqaItem {
  /** The quality attribute name (e.g. "Related substances", "Aggregation"). */
  name: string;
  /** Where the attribute was inferred from. */
  source:
    | 'specification'
    | 'impurity_profile'
    | 'stability_indicator'
    | 'characterization'
    | 'method_purpose';
  /** Material the CQA applies to (DS / DP / excipient). */
  materialType?: string;
  /** Specific spec test parameter or impurity name. */
  evidenceDetail?: string;
  /** ICH guideline(s) anchoring the attribute. */
  ichBasis: string[];
  /** Whether an analytical method exists to control it. */
  methodLinked: boolean;
}

export interface CppItem {
  /** Parameter name (e.g. "Compression force", "Mixing time"). */
  name: string;
  /** Process step it controls. */
  processStep?: string;
  /** Numerical range if specified. */
  acceptableRange?: string;
  /** Quality attribute(s) it impacts. */
  impacts?: string[];
  /** ICH guideline(s) anchoring the parameter. */
  ichBasis: string[];
  /** Source provenance. */
  source: 'process_record' | 'source_object';
}

/** The named inputs the analyzer reads. */
export type QbdInputKey =
  | 'specs' | 'methods' | 'stability' | 'processes' | 'drugSubs' | 'sourceObjects';

export interface QbdAnalysisResult {
  projectId: string;
  organizationId: number;
  cqas: CqaItem[];
  cpps: CppItem[];
  /**
   * Row counts per input. A count is only meaningful when the corresponding
   * input is absent from `unevaluatedInputs`; otherwise it is `0` because the
   * read failed, not because the project has no such records.
   */
  inputs: {
    specificationCount: number;
    methodCount: number;
    stabilityStudyCount: number;
    drugSubstanceCount: number;
    processCount: number;
    cmcSourceObjectCount: number;
  };
  /**
   * Inputs that could not be read, with the reason. Non-empty means this
   * analysis is partial: CQAs/CPPs derived from those inputs are missing, and
   * their absence from the lists is not evidence they do not exist.
   */
  unevaluatedInputs: Array<{ input: QbdInputKey; reason: string }>;
  /** True when `unevaluatedInputs` is non-empty. */
  partial: boolean;
  gaps: string[];
  analyzedAt: string;
}

// ─── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Analyze a project's CMC source data and derive CQAs and CPPs from the
 * actual records, not from drug-type heuristics. Best-effort: missing
 * tables or empty data return empty arrays rather than throwing.
 */
export async function analyzeQbdFromSources(
  orgId: number,
  projectId: string,
): Promise<QbdAnalysisResult> {
  const pool = getPool();
  const projectIdParam = String(projectId);

  // Reads that fail are recorded here rather than collapsing into an
  // indistinguishable empty array. "No stability studies recorded" and "the
  // stability read failed" are different facts; only the first is a gap.
  const unavailable: Partial<Record<QbdInputKey, string>> = {};

  // Run every read in parallel.
  const [specs, methods, stabilityResult, processes, drugSubs, sourceObjects] = await Promise.all([
    safeQuery(pool, unavailable, 'specs', `
      SELECT material_type AS "materialType",
             material_name AS "materialName",
             test_parameters AS "testParameters",
             acceptance_criteria AS "acceptanceCriteria"
      FROM quality_specifications
      WHERE project_id = $1::text::uuid
    `, [projectIdParam]),
    safeQuery(pool, unavailable, 'methods', `
      SELECT method_name AS "methodName",
             method_type AS "methodType",
             purpose,
             validation_status AS "validationStatus"
      FROM analytical_methods
      WHERE project_id = $1::text::uuid
    `, [projectIdParam]),
    // Stability comes from the canonical project-scoped source-object store.
    // `public.stability_studies` has no `project_id` column (it is org-scoped)
    // and no `study_name` / `storage_condition` / `results` columns, so the
    // query this replaced could never succeed. See stability-source.ts.
    loadProjectStabilityStudies(pool, orgId, projectIdParam),
    safeQuery(pool, unavailable, 'processes', `
      SELECT process_name AS "processName",
             process_type AS "processType",
             process_steps AS "processSteps",
             critical_process_parameters AS "criticalProcessParameters",
             process_controls AS "processControls"
      FROM manufacturing_processes
      WHERE project_id = $1::text::uuid
    `, [projectIdParam]),
    safeQuery(pool, unavailable, 'drugSubs', `
      SELECT substance_name AS "substanceName",
             impurities,
             characterization_data AS "characterizationData"
      FROM drug_substances
      WHERE project_id = $1::text::uuid
    `, [projectIdParam]),
    safeQuery(pool, unavailable, 'sourceObjects', `
      SELECT source_type AS "sourceType",
             source_payload AS "sourcePayload"
      FROM cmc_source_objects
      WHERE organization_id = $1
        AND project_id::text = $2
    `, [orgId, projectIdParam]),
  ]);

  if (!stabilityResult.available) {
    unavailable.stability = stabilityResult.reason;
  }
  const stability = stabilityResult.studies as unknown as Array<Record<string, unknown>>;

  // ── Derive CQAs ────────────────────────────────────────────────────────
  const cqaMap = new Map<string, CqaItem>();
  const addCqa = (item: CqaItem) => {
    const key = `${item.materialType ?? '-'}::${item.name.toLowerCase()}`;
    const existing = cqaMap.get(key);
    if (existing) {
      // Merge ich basis + method linkage.
      existing.ichBasis = Array.from(new Set([...existing.ichBasis, ...item.ichBasis]));
      existing.methodLinked = existing.methodLinked || item.methodLinked;
      return;
    }
    cqaMap.set(key, item);
  };

  const methodPurposes = new Set(
    methods.map(m => String(m.purpose ?? '').toLowerCase()).filter(Boolean),
  );

  // From specifications: each test parameter is a CQA candidate.
  for (const spec of specs) {
    const params = spec.testParameters;
    if (!params) continue;
    const paramNames = extractParameterNames(params);
    for (const paramName of paramNames) {
      addCqa({
        name: prettifyAttribute(paramName),
        source: 'specification',
        materialType: String(spec.materialType ?? 'unknown'),
        evidenceDetail: spec.materialName ? `Spec for ${spec.materialName}` : undefined,
        ichBasis: classifyCqaIchBasis(paramName, spec.materialType),
        methodLinked: matchesAnyPurpose(paramName, methodPurposes),
      });
    }
  }

  // From impurity profiles in drug_substances.
  for (const ds of drugSubs) {
    const impurities = ds.impurities;
    if (!impurities) continue;
    const impurityNames = extractImpurityNames(impurities);
    for (const name of impurityNames) {
      addCqa({
        name: `Impurity: ${prettifyAttribute(name)}`,
        source: 'impurity_profile',
        materialType: 'drug_substance',
        evidenceDetail: `Identified impurity in ${ds.substanceName}`,
        ichBasis: ['ICH Q3A(R2)', 'ICH Q3B(R2)'],
        methodLinked: methodPurposes.has('impurities') || methodPurposes.has('related substances'),
      });
    }
  }

  // From stability indicators (assay drop, related substance growth, dissolution).
  if (stability.length > 0) {
    const hasAssay = methodPurposes.has('assay');
    const hasRelated = methodPurposes.has('related substances') || methodPurposes.has('impurities');
    if (hasAssay) {
      addCqa({
        name: 'Assay (stability-indicating)',
        source: 'stability_indicator',
        materialType: 'drug_product',
        ichBasis: ['ICH Q1A(R2)', 'ICH Q6A'],
        methodLinked: true,
      });
    }
    if (hasRelated) {
      addCqa({
        name: 'Degradation products',
        source: 'stability_indicator',
        materialType: 'drug_product',
        ichBasis: ['ICH Q1A(R2)', 'ICH Q3B(R2)'],
        methodLinked: true,
      });
    }
  }

  // From characterization data: biologic-specific attributes.
  for (const ds of drugSubs) {
    const characterization = ds.characterizationData;
    if (!characterization) continue;
    const attrs = extractCharacterizationAttrs(characterization);
    for (const attr of attrs) {
      addCqa({
        name: prettifyAttribute(attr),
        source: 'characterization',
        materialType: 'drug_substance',
        evidenceDetail: `Characterization of ${ds.substanceName}`,
        ichBasis: classifyCqaIchBasis(attr, 'drug_substance_biologic'),
        methodLinked: matchesAnyPurpose(attr, methodPurposes),
      });
    }
  }

  const cqas = Array.from(cqaMap.values());

  // ── Derive CPPs ────────────────────────────────────────────────────────
  const cppMap = new Map<string, CppItem>();
  const addCpp = (item: CppItem) => {
    const key = `${item.processStep ?? '-'}::${item.name.toLowerCase()}`;
    if (cppMap.has(key)) return;
    cppMap.set(key, item);
  };

  for (const proc of processes) {
    const cppData = proc.criticalProcessParameters;
    if (!cppData) continue;
    const cppEntries = extractCppEntries(cppData);
    for (const entry of cppEntries) {
      const processName = typeof proc.processName === 'string' ? proc.processName : undefined;
      addCpp({
        name: prettifyAttribute(entry.name),
        processStep: entry.step ?? processName,
        acceptableRange: entry.range,
        impacts: entry.impacts,
        ichBasis: ['ICH Q8(R2)', 'ICH Q9', 'ICH Q11'],
        source: 'process_record',
      });
    }
  }

  // From cmc_source_objects with source_type='process' or 'control_strategy'.
  for (const obj of sourceObjects) {
    const sourceType = String(obj.sourceType ?? '');
    if (sourceType !== 'process' && sourceType !== 'control_strategy') continue;
    const payload = obj.sourcePayload as Record<string, unknown> | null;
    if (!payload) continue;
    const cppEntries = extractCppFromPayload(payload);
    for (const entry of cppEntries) {
      addCpp({
        name: prettifyAttribute(entry.name),
        processStep: entry.step,
        acceptableRange: entry.range,
        ichBasis: ['ICH Q8(R2)', 'ICH Q11'],
        source: 'source_object',
      });
    }
  }

  const cpps = Array.from(cppMap.values());

  // ── Gap analysis ───────────────────────────────────────────────────────
  const gaps: string[] = [];

  // Only assert "none recorded" for inputs we actually read. For an input that
  // failed to load, say so — an empty list there is unknown, not empty.
  const gapIfEmpty = (key: QbdInputKey, rows: unknown[], label: string, gapText: string) => {
    const reason = unavailable[key];
    if (reason) {
      gaps.push(`Cannot evaluate ${label}: input could not be read (${reason}). This is not a finding of absence.`);
      return;
    }
    if (rows.length === 0) gaps.push(gapText);
  };

  gapIfEmpty('specs', specs, 'quality specifications',
    'No quality specifications recorded — CQA derivation is incomplete.');
  gapIfEmpty('methods', methods, 'analytical methods',
    'No analytical methods recorded — CQAs may not be testable.');
  gapIfEmpty('stability', stability, 'stability studies',
    'No stability studies recorded — shelf-life CQAs cannot be evaluated.');
  gapIfEmpty('processes', processes, 'manufacturing processes',
    'No manufacturing processes recorded — CPP list is empty.');

  const unlinkedCqas = cqas.filter(c => !c.methodLinked);
  if (unlinkedCqas.length > 0) {
    gaps.push(`${unlinkedCqas.length} CQA(s) lack a validated analytical method (ICH Q2(R1) gap).`);
  }

  const unevaluatedInputs = Object.entries(unavailable)
    .map(([input, reason]) => ({ input: input as QbdInputKey, reason: String(reason) }));

  log.info('QbD analysis complete', {
    projectId,
    cqaCount: cqas.length,
    cppCount: cpps.length,
    gapCount: gaps.length,
    partial: unevaluatedInputs.length > 0,
    unevaluatedInputs: unevaluatedInputs.map(u => u.input),
  });

  return {
    projectId,
    organizationId: orgId,
    cqas,
    cpps,
    inputs: {
      specificationCount: specs.length,
      methodCount: methods.length,
      stabilityStudyCount: stability.length,
      drugSubstanceCount: drugSubs.length,
      processCount: processes.length,
      cmcSourceObjectCount: sourceObjects.length,
    },
    unevaluatedInputs,
    partial: unevaluatedInputs.length > 0,
    gaps,
    analyzedAt: new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run a read, recording the reason into `unavailable` if it fails.
 *
 * The empty array returned on failure is a placeholder so the rest of the
 * analysis can proceed — it is NOT a result. Callers must consult
 * `unavailable[input]` before drawing any conclusion from its emptiness.
 */
async function safeQuery(
  pool: ReturnType<typeof getPool>,
  unavailable: Partial<Record<QbdInputKey, string>>,
  input: QbdInputKey,
  sql: string,
  params: unknown[],
): Promise<Array<Record<string, unknown>>> {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn('QbD analyzer query failed — marking input as not evaluable', {
      input,
      error: detail,
    });
    unavailable[input] = detail;
    return [];
  }
}

// Pure helpers live in qbd-helpers.ts so unit tests can exercise them
// without dragging in the DB import chain. The analyzer just imports
// them; see qbd-helpers.ts for the underlying logic.
