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
  if (stabilityPlan.testParameters.length === 0) {
    gaps.push('No stability test parameters recorded — ICH Q1A(R2) stability program not defined.');
  }
  stabilityPlan.ichBasis.forEach(c => citations.add(c));
  controlElements.push({
    controlType: 'stability_monitoring',
    description: `Long-term and accelerated stability monitoring program.`,
    acceptanceCriterion: 'Within registered specification at every time point through proposed shelf life',
    performedBy: 'Stability program',
    ichBasis: stabilityPlan.ichBasis,
    justification:
      `Stability-indicating attributes monitored at ${stabilityPlan.longTermCondition} long-term and ${stabilityPlan.acceleratedCondition} accelerated per ICH Q1A(R2).`,
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

async function loadStabilityPlan(orgId: number, projectId: string): Promise<StabilityMonitoringPlan> {
  const pool = getPool();
  const fallback: StabilityMonitoringPlan = {
    longTermCondition: '25°C / 60% RH',
    acceleratedCondition: '40°C / 75% RH',
    testParameters: [],
    timePoints: ['0', '3', '6', '9', '12', '18', '24 months'],
    ichBasis: ['ICH Q1A(R2)'],
  };
  try {
    const { rows } = await pool.query<{
      storageCondition: string | null;
      duration: string | null;
      timePoints: string | null;
      testParameters: string | null;
      studyType: string | null;
    }>(`
      SELECT storage_condition AS "storageCondition",
             duration,
             time_points AS "timePoints",
             test_parameters AS "testParameters",
             study_type AS "studyType"
      FROM stability_studies
      WHERE project_id = $1::text::uuid
    `, [projectId]);

    if (rows.length === 0) return fallback;

    const longTerm = rows.find(r => String(r.studyType ?? '').toLowerCase().includes('long'))?.storageCondition;
    const accelerated = rows.find(r => String(r.studyType ?? '').toLowerCase().includes('accel'))?.storageCondition;
    const testParameters = rows.flatMap(r => parseList(r.testParameters));
    const timePoints = rows.flatMap(r => parseList(r.timePoints));

    return {
      longTermCondition: longTerm ?? fallback.longTermCondition,
      acceleratedCondition: accelerated ?? fallback.acceleratedCondition,
      testParameters: Array.from(new Set(testParameters)).slice(0, 20),
      timePoints: Array.from(new Set(timePoints)).slice(0, 20),
      ichBasis: ['ICH Q1A(R2)', 'ICH Q1E'],
    };
  } catch (err) {
    log.warn('Failed to load stability plan', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

function parseList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
}
