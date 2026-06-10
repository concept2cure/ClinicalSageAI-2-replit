/**
 * Human factors / usability engineering — IEC 62366-1 (and FDA HFE guidance).
 *
 * Two deterministic assessors a device HFE/UE file needs and that the platform
 * did not provide:
 *   - HFE/UE file completeness against the IEC 62366-1 usability-engineering
 *     elements (use specification, user profiles, use environments, UI
 *     characteristics, known use problems, hazard-related use scenarios, critical
 *     tasks, formative + summative evaluation, HFE/UE report).
 *   - Use-related risk analysis: identify critical tasks (where a use error could
 *     cause serious harm), flag unmitigated ones, and judge residual-risk
 *     acceptability.
 *
 * Pure and deterministic.
 */

// ── HFE/UE file completeness ─────────────────────────────────────────────────

export const HFE_ELEMENTS = [
  'useSpecification',
  'userProfiles',
  'useEnvironments',
  'userInterfaceCharacteristics',
  'knownUseProblems',
  'hazardRelatedUseScenarios',
  'criticalTasks',
  'formativeEvaluation',
  'summativeEvaluation',
  'hfeUeReport',
] as const;

export type HfeElement = (typeof HFE_ELEMENTS)[number];

export interface HfeCompletenessResult {
  /** 0–1 share of IEC 62366-1 HFE/UE elements present. */
  completenessScore: number;
  present: HfeElement[];
  gaps: HfeElement[];
  complete: boolean;
  framework: 'IEC 62366-1';
}

/** Assess HFE/UE file completeness against IEC 62366-1. */
export function assessHfeCompleteness(
  elements: Partial<Record<HfeElement, boolean>>
): HfeCompletenessResult {
  const present: HfeElement[] = [];
  const gaps: HfeElement[] = [];
  for (const e of HFE_ELEMENTS) {
    if (elements[e] === true) present.push(e);
    else gaps.push(e);
  }
  return {
    completenessScore: present.length / HFE_ELEMENTS.length,
    present,
    gaps,
    complete: gaps.length === 0,
    framework: 'IEC 62366-1',
  };
}

// ── Use-related risk analysis ────────────────────────────────────────────────

export type HarmSeverity = 'negligible' | 'minor' | 'serious' | 'critical';

export interface UseScenario {
  /** Task or use step. */
  task: string;
  /** The potential use error in this task. */
  useError: string;
  /** Severity of the potential harm if the use error occurs. */
  potentialHarmSeverity: HarmSeverity;
  /** Whether a risk-control / mitigation is in place for this use error. */
  mitigated: boolean;
}

export interface UseRelatedRiskResult {
  totalScenarios: number;
  /** Tasks where a use error could cause serious or critical harm. */
  criticalTasks: { task: string; useError: string; severity: HarmSeverity; mitigated: boolean }[];
  criticalTaskCount: number;
  /** Critical tasks lacking a mitigation — must be addressed before summative testing. */
  unmitigatedCriticalTasks: number;
  /** True when every critical task has a documented mitigation. */
  residualRiskAcceptable: boolean;
  framework: 'IEC 62366-1 / FDA HFE';
}

const SERIOUS = new Set<HarmSeverity>(['serious', 'critical']);

/** Identify critical tasks and judge residual-risk acceptability. */
export function analyzeUseRelatedRisk(scenarios: UseScenario[]): UseRelatedRiskResult {
  if (scenarios.length === 0) {
    throw new Error('Use-related risk analysis requires at least one use scenario.');
  }
  const criticalTasks = scenarios
    .filter(s => SERIOUS.has(s.potentialHarmSeverity))
    .map(s => ({
      task: s.task,
      useError: s.useError,
      severity: s.potentialHarmSeverity,
      mitigated: s.mitigated,
    }));
  const unmitigatedCriticalTasks = criticalTasks.filter(t => !t.mitigated).length;
  return {
    totalScenarios: scenarios.length,
    criticalTasks,
    criticalTaskCount: criticalTasks.length,
    unmitigatedCriticalTasks,
    residualRiskAcceptable: unmitigatedCriticalTasks === 0,
    framework: 'IEC 62366-1 / FDA HFE',
  };
}
