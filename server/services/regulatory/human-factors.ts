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
 *     cause serious harm), flag unmitigated ones, and report the critical-task
 *     gate they put the file in. It does NOT judge residual-risk acceptability;
 *     under IEC 62366-1 that is a documented manufacturer determination, not a
 *     consequence of a count.
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

/**
 * The three states a use-related risk analysis can leave the critical-task gate
 * in. This is a position on CRITICAL TASKS and nothing more.
 *
 *  - `not-assessed` — no hazard-related use scenarios are recorded, so no
 *    analysis has run. An empty scenario set is not a finding of "none".
 *  - `blocked`      — at least one critical task carries no documented
 *    mitigation.
 *  - `clear`        — scenarios are recorded and every critical task identified
 *    in them carries a documented mitigation.
 */
export type CriticalTaskGate = 'not-assessed' | 'blocked' | 'clear';

export interface UseRelatedRiskResult {
  totalScenarios: number;
  /** Tasks where a use error could cause serious or critical harm. */
  criticalTasks: { task: string; useError: string; severity: HarmSeverity; mitigated: boolean }[];
  criticalTaskCount: number;
  /** Critical tasks lacking a mitigation — must be addressed before summative testing. */
  unmitigatedCriticalTasks: number;
  /**
   * What this analysis FOUND about critical tasks.
   *
   * This replaces `residualRiskAcceptable: boolean`, which was
   * `unmitigatedCriticalTasks === 0` and claimed "residual use-related risk is
   * acceptable". Two things were wrong with it, and this result object is
   * served straight through by POST /use-related-risk into an HFE/UE report a
   * regulatory reviewer reads:
   *
   *  1. `unmitigatedCriticalTasks` is a filter over `criticalTasks`, which is
   *     itself a filter over the scenarios passed in. Over a scenario set that
   *     records nothing — the caller-side state of an HFE/UE file no one has
   *     examined yet — both filters are vacuously empty, the count is 0, and the
   *     field read `true`. A file nothing had ever looked at was reported
   *     identically to one examined and found controlled. That state is now
   *     `not-assessed` and is reported as such.
   *  2. Even with scenarios recorded and every critical task mitigated, residual
   *     use-related risk acceptability is, under IEC 62366-1, a DOCUMENTED
   *     MANUFACTURER DETERMINATION recorded by a person across the whole HFE/UE
   *     file. It does not follow from this count, so this service does not state
   *     it — in any state. `clear` says the critical-task gate is clear, and
   *     stops there. (This mirrors the correction already made client-side in
   *     client/src/concept2cure/v2/surfaces/HumanFactors.tsx.)
   */
  criticalTaskGate: CriticalTaskGate;
  framework: 'IEC 62366-1 / FDA HFE';
}

const SERIOUS = new Set<HarmSeverity>(['serious', 'critical']);

/**
 * Identify critical tasks and report the critical-task gate they put the HFE/UE
 * file in. Residual-risk acceptability is deliberately not returned; see
 * `UseRelatedRiskResult.criticalTaskGate`.
 *
 * An empty scenario list used to throw. It now returns a `not-assessed` result:
 * "nothing has been assessed" is a state this analysis has to be able to REPORT,
 * because it is the exact state the old boolean silently rendered as acceptable.
 * Callers that require scenarios still reject an empty list at their own edge —
 * POST /use-related-risk validates `scenarios` with `.min(1)`, unchanged.
 */
export function analyzeUseRelatedRisk(scenarios: UseScenario[]): UseRelatedRiskResult {
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
    criticalTaskGate:
      scenarios.length === 0
        ? 'not-assessed'
        : unmitigatedCriticalTasks > 0
          ? 'blocked'
          : 'clear',
    framework: 'IEC 62366-1 / FDA HFE',
  };
}
