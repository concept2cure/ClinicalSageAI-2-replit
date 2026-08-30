/**
 * Deterministic control strategy generator.
 *
 * Reads the project's actual quality data via the QbD analyzer and
 * composes a structured ICH Q8/Q9/Q10/Q11-grade control strategy:
 *   - CQA → control element mapping
 *   - Process controls (CPPs → in-process tests)
 *   - Release tests + acceptance criteria
 *   - Stability monitoring program
 *   - Risk-based justification per CQA
 *
 * Replaces the placeholder fallback at server/api/cmc/playbookRoutes.ts
 * that returned "Regulatory guidance ... AI service temporarily
 * unavailable." This generator never returns a placeholder — it returns
 * a real strategy or explicit gaps.
 *
 * Pure-deterministic. Inputs come from the QbD analyzer, the analytical
 * methods table, the stability program, and the CMC source-object store.
 *
 * @module server/services/cmc/control-strategy-generator
 */

import { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { analyzeQbdFromSources, type CqaItem, type CppItem } from './qbd-analyzer';
import { loadProjectStabilityStudies } from './stability-source';

const log = createScopedLogger('cmc-control-strategy');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ControlElement {
  controlType: 'release_test' | 'in_process_control' | 'stability_monitoring' | 'raw_material_test' | 'process_parameter_range';
  description: string;
  targetCqa?: string;
  /** Specific spec acceptance criterion when one is recorded. */
  acceptanceCriterion?: string;
  /** Analytical method or process step that performs the control. */
  performedBy?: string;
  /** ICH Q-series guidelines that anchor the control. */
  ichBasis: string[];
  /** Risk-based justification. */
  justification: string;
}

export interface ControlStrategyDocument {
  projectId: string;
  organizationId: number;
  /** Drug substance vs drug product scope. */
  scope: 'drug_substance' | 'drug_product' | 'both';
  cqas: CqaItem[];
  cpps: CppItem[];
  controlElements: ControlElement[];
  stabilityMonitoring: StabilityMonitoringPlan;
  /** Open gaps the strategy could not close from existing data. */
  gaps: string[];
  /** Citations to every guideline referenced in the strategy. */
  citations: string[];
  generatedAt: string;
}

export interface StabilityMonitoringPlan {
  longTermCondition: string;
  acceleratedCondition: string;
  testParameters: string[];
  timePoints: string[];
  ichBasis: string[];
  /**
   * Provenance of the conditions and time points above.
   *
   * - `project_data`  — read from the project's recorded stability studies.
   * - `ich_default`   — the project has no recorded stability studies; the
   *                     values are generic ICH Q1A(R2) defaults.
   * - `not_evaluated` — the stability inputs could not be read at all; the
   *                     values are generic ICH Q1A(R2) defaults and we do not
   *                     know what the project has recorded.
   *
   * Only `project_data` may be presented as this project's stability program.
   * The other two are templates, and `note` says so.
   */
  derivedFrom: 'project_data' | 'ich_default' | 'not_evaluated';
  /** Present whenever `derivedFrom !== 'project_data'`. */
  note?: string;
}

// ─── Generator ───────────────────────────────────────────────────────────────

export async function generateControlStrategy(
  orgId: number,
  projectId: string,
  scope: 'drug_substance' | 'drug_product' | 'both' = 'both',
): Promise<ControlStrategyDocument> {
  const qbd = await analyzeQbdFromSources(orgId, projectId);
  const methods = await loadMethods(orgId, projectId);
  const stabilityPlan = await loadStabilityPlan(orgId, projectId);

  const controlElements: ControlElement[] = [];
  const citations = new Set<string>();
  const gaps: string[] = [];

  // ── Release tests — one per CQA, mapped to analytical method when available
  for (const cqa of qbd.cqas) {
    if (cqa.materialType === 'unknown') continue;
    if (scope === 'drug_substance' && cqa.materialType !== 'drug_substance') continue;
    if (scope === 'drug_product' && cqa.materialType !== 'drug_product') continue;

    const method = matchMethodForCqa(cqa, methods);
    const ichBasis = cqa.ichBasis.length > 0 ? cqa.ichBasis : ['ICH Q6A'];
    ichBasis.forEach(c => citations.add(c));

    controlElements.push({
      controlType: 'release_test',
      description: `Release test for ${cqa.name} on ${cqa.materialType?.replace('_', ' ')}.`,
      targetCqa: cqa.name,
      acceptanceCriterion: cqa.evidenceDetail
        ? `Per current specification (${cqa.evidenceDetail})`
        : 'Per current specification',
      performedBy: method ? method.methodName : undefined,
      ichBasis,
      justification: method
        ? `${cqa.name} is identified as a CQA via ${cqa.source.replace('_', ' ')}; controlled by validated method "${method.methodName}" (${method.validationStatus}).`
        : `${cqa.name} is identified as a CQA via ${cqa.source.replace('_', ' ')}; no validated method linked yet (ICH Q2(R1) gap).`,
    });
    if (!method) {
      gaps.push(`No validated analytical method linked to CQA "${cqa.name}" (${cqa.materialType}). Required per ICH Q2(R1).`);
    }
  }

  // ── In-process controls — one per CPP
  for (const cpp of qbd.cpps) {
    controlElements.push({
      controlType: 'in_process_control',
      description: `In-process control on ${cpp.name}.`,
      acceptanceCriterion: cpp.acceptableRange
        ? `Within ${cpp.acceptableRange}`
        : 'Per validated operating range',
      performedBy: cpp.processStep ? `Process step: ${cpp.processStep}` : undefined,
      ichBasis: cpp.ichBasis,
      justification: cpp.acceptableRange
        ? `${cpp.name} is a CPP with validated range ${cpp.acceptableRange}.`
        : `${cpp.name} is a CPP; operating range must be established by DoE per ICH Q8(R2).`,
    });
    cpp.ichBasis.forEach(c => citations.add(c));
    if (!cpp.acceptableRange) {
      gaps.push(`CPP "${cpp.name}" lacks a documented acceptable range — DoE needed per ICH Q8(R2).`);
    }
  }

  // ── Stability monitoring
  // The plan's conditions are only this project's program when
  // derivedFrom === 'project_data'. Otherwise they are a generic ICH template,
  // and both the gap list and the control element must say so rather than
  // describing a monitoring program that was never recorded.
  if (stabilityPlan.derivedFrom === 'not_evaluated') {
    gaps.push(
      `Cannot evaluate the stability program: ${stabilityPlan.note} `
      + 'This is not a finding that the program is absent.',
    );
  } else if (stabilityPlan.derivedFrom === 'ich_default') {
    gaps.push('No stability studies recorded — ICH Q1A(R2) stability program not defined.');
  } else if (stabilityPlan.testParameters.length === 0) {
    gaps.push('No stability test parameters recorded — ICH Q1A(R2) stability program not defined.');
  }
  stabilityPlan.ichBasis.forEach(c => citations.add(c));

  const stabilityIsProjectData = stabilityPlan.derivedFrom === 'project_data';
  controlElements.push({
    controlType: 'stability_monitoring',
    description: stabilityIsProjectData
      ? 'Long-term and accelerated stability monitoring program.'
      : 'Long-term and accelerated stability monitoring program (PROPOSED TEMPLATE — not derived from recorded project data).',
    acceptanceCriterion: 'Within registered specification at every time point through proposed shelf life',
    performedBy: 'Stability program',
    ichBasis: stabilityPlan.ichBasis,
    justification: stabilityIsProjectData
      ? `Stability-indicating attributes monitored at ${stabilityPlan.longTermCondition} long-term and ${stabilityPlan.acceleratedCondition} accelerated per ICH Q1A(R2).`
      : `${stabilityPlan.note} Proposed conditions are ${stabilityPlan.longTermCondition} long-term and ${stabilityPlan.acceleratedCondition} accelerated per ICH Q1A(R2); they must be confirmed against the project's actual stability program before use.`,
  });

  // ── Raw material controls — if drug substance specs exist
  const hasDsSpecs = qbd.cqas.some(c => c.materialType === 'drug_substance' && c.source === 'specification');
  if (!hasDsSpecs && (scope === 'drug_substance' || scope === 'both')) {
    gaps.push('No drug substance specifications recorded — raw material control strategy incomplete.');
  } else if (hasDsSpecs) {
    controlElements.push({
      controlType: 'raw_material_test',
      description: 'Drug substance release per registered specification before drug product manufacture.',
      acceptanceCriterion: 'Compliance with drug substance specification (3.2.S.4.1)',
      ichBasis: ['ICH Q6A', 'ICH Q11'],
      justification: 'Raw material controls upstream of drug product manufacture per ICH Q11 control strategy framework.',
    });
    citations.add('ICH Q11');
  }

  // Always anchor in Q8/Q9/Q10
  citations.add('ICH Q8(R2)');
  citations.add('ICH Q9');
  citations.add('ICH Q10');

  // Surface gaps the QbD analyzer already raised.
  for (const g of qbd.gaps) gaps.push(g);

  log.info('Control strategy generated', {
    projectId,
    controlCount: controlElements.length,
    gapCount: gaps.length,
  });

  return {
    projectId,
    organizationId: orgId,
    scope,
    cqas: qbd.cqas,
    cpps: qbd.cpps,
    controlElements,
    stabilityMonitoring: stabilityPlan,
    gaps: Array.from(new Set(gaps)),
    citations: Array.from(citations).sort(),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MethodRecord {
  methodName: string;
  purpose: string;
  validationStatus: string;
}

async function loadMethods(orgId: number, projectId: string): Promise<MethodRecord[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{
      methodName: string;
      purpose: string;
      validationStatus: string;
    }>(`
      SELECT method_name AS "methodName",
             purpose,
             validation_status AS "validationStatus"
      FROM analytical_methods
      WHERE project_id = $1::text::uuid
    `, [projectId]);
    return rows;
  } catch (err) {
    log.warn('Failed to load analytical methods', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function matchMethodForCqa(cqa: CqaItem, methods: MethodRecord[]): MethodRecord | null {
  const cqaName = cqa.name.toLowerCase();
  // Strip leading "Impurity: " for matching.
  const stripped = cqaName.replace(/^impurity:\s*/, '');

  for (const m of methods) {
    const purpose = String(m.purpose ?? '').toLowerCase();
    if (purpose.includes(stripped) || stripped.includes(purpose)) return m;
    if (cqaName.includes('related') && purpose.includes('related')) return m;
    if (cqaName.includes('assay') && purpose.includes('assay')) return m;
    if (cqaName.includes('identity') && purpose.includes('identity')) return m;
    if (cqaName.includes('dissolution') && purpose.includes('dissolution')) return m;
    if (cqaName.includes('aggregation') && (purpose.includes('size') || purpose.includes('sec'))) return m;
    if (cqaName.includes('charge') && (purpose.includes('iex') || purpose.includes('charge'))) return m;
  }
  return null;
}

/**
 * Load the project's stability monitoring plan.
 *
 * This previously queried `stability_studies` for `storage_condition`,
 * `time_points`, `test_parameters` and `study_type` filtered on `project_id`.
 * That query could never succeed: the provisioned `public.stability_studies`
 * has no `project_id` column (it is org-scoped) and no `storage_condition`
 * column. Every call therefore hit the catch and returned the generic ICH
 * template below — which the generated control strategy then presented as the
 * project's stability program, complete with conditions nobody had recorded.
 *
 * Now the studies come from the canonical project-scoped source-object store,
 * and when the plan is NOT derived from project data the returned object says
 * so via `derivedFrom` + `note` instead of passing a template off as fact.
 */
async function loadStabilityPlan(orgId: number, projectId: string): Promise<StabilityMonitoringPlan> {
  const pool = getPool();

  // Generic ICH Q1A(R2) conditions — a template, not this project's program.
  const template = {
    longTermCondition: '25°C / 60% RH',
    acceleratedCondition: '40°C / 75% RH',
    testParameters: [] as string[],
    timePoints: ['0', '3', '6', '9', '12', '18', '24 months'],
    ichBasis: ['ICH Q1A(R2)'],
  };

  const result = await loadProjectStabilityStudies(pool, orgId, projectId);

  if (!result.available) {
    return {
      ...template,
      derivedFrom: 'not_evaluated',
      note:
        `Stability inputs could not be read (${result.reason}). The conditions and time points `
        + 'shown are generic ICH Q1A(R2) values, NOT this project\'s recorded stability program, '
        + 'which is unknown.',
    };
  }

  if (result.studies.length === 0) {
    return {
      ...template,
      derivedFrom: 'ich_default',
      note:
        'No stability studies are recorded for this project. The conditions and time points shown '
        + 'are generic ICH Q1A(R2) values offered as a starting template, not a recorded program.',
    };
  }

  const studies = result.studies;
  const longTerm = studies.find(s => s.studyType.toLowerCase().includes('long'))?.storageCondition;
  const accelerated = studies.find(s => s.studyType.toLowerCase().includes('accel'))?.storageCondition;
  const testParameters = studies.flatMap(s => parseList(s.testParameters));
  const timePoints = studies.flatMap(s => parseList(s.timePoints));

  // The STORAGE CONDITIONS shown are the project's recorded program ONLY when
  // both the long-term and accelerated conditions came from an actual matched
  // study. If either falls back to the generic ICH template constant (no study
  // whose studyType names 'long'/'accel'), the conditions are NOT recorded data —
  // mark provenance ich_default (with a note) so the justification does not
  // present ICH-template conditions as the project's real stability program.
  const conditionsFromStudies = longTerm !== undefined && accelerated !== undefined;

  return {
    longTermCondition: longTerm || template.longTermCondition,
    acceleratedCondition: accelerated || template.acceleratedCondition,
    testParameters: Array.from(new Set(testParameters)).slice(0, 20),
    timePoints: Array.from(new Set(timePoints)).slice(0, 20),
    ichBasis: ['ICH Q1A(R2)', 'ICH Q1E'],
    derivedFrom: conditionsFromStudies ? 'project_data' : 'ich_default',
    ...(conditionsFromStudies
      ? {}
      : {
          note:
            'Stability studies are recorded for this project, but no long-term/accelerated study '
            + 'condition was matched; the storage conditions shown are generic ICH Q1A(R2) template '
            + 'values, not the recorded program.',
        }),
  };
}

function parseList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
}
