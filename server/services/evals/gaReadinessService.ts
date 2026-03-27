export type ReleaseStage = 'beta' | 'ga';

export interface ScorecardPayload {
  stage: ReleaseStage;
  weights: Record<string, number>;
  scores: Record<string, number>;
  hard_fail_conditions: Record<string, boolean>;
  human_testing: {
    beta_sessions_completed?: number;
    ga_sessions_completed?: number;
    critical_defects_open?: number;
    core_task_success_rate?: number;
    citation_trust_mean?: number;
  };
}

export interface ReadinessResult {
  stage: ReleaseStage;
  weightedScore: number;
  minCategoryScore: number;
  passed: boolean;
  reasons: string[];
}

const CATEGORIES = [
  'parsing_quality',
  'retrieval_citation',
  'policy_enforcement',
  'workflow_reliability',
  'observability_completeness',
  'pilot_safety',
] as const;

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function evaluateReadiness(payload: ScorecardPayload): ReadinessResult {
  const reasons: string[] = [];

  const weightedScore = CATEGORIES.reduce((sum, category) => {
    const weight = getNumber(payload.weights?.[category]);
    const score = getNumber(payload.scores?.[category]);

    if (weight === 0) {
      reasons.push(`Missing or zero weight for category '${category}'`);
    }

    return sum + weight * score;
  }, 0);

  const minCategoryScore = Math.min(...CATEGORIES.map(c => getNumber(payload.scores?.[c])));

  for (const [flag, enabled] of Object.entries(payload.hard_fail_conditions || {})) {
    if (enabled) {
      reasons.push(`Hard fail active: ${flag}`);
    }
  }

  if (payload.stage === 'beta') {
    if (weightedScore < 3.8) reasons.push('Beta threshold requires weighted score >= 3.8');
    if (minCategoryScore < 3.0) reasons.push('Beta threshold requires min category >= 3.0');
    if (getNumber(payload.human_testing?.beta_sessions_completed) < 10) {
      reasons.push('Beta requires >= 10 supervised user sessions');
    }
  }

  if (payload.stage === 'ga') {
    if (weightedScore < 4.3) reasons.push('GA threshold requires weighted score >= 4.3');
    if (minCategoryScore < 3.8) reasons.push('GA threshold requires min category >= 3.8');
    if (getNumber(payload.human_testing?.ga_sessions_completed) < 25) {
      reasons.push('GA requires >= 25 supervised user sessions');
    }
    if (getNumber(payload.human_testing?.critical_defects_open) > 0) {
      reasons.push('GA requires zero open critical defects');
    }
    if (getNumber(payload.human_testing?.core_task_success_rate) < 0.9) {
      reasons.push('GA requires core task success rate >= 0.9');
    }
    if (getNumber(payload.human_testing?.citation_trust_mean) < 4.0) {
      reasons.push('GA requires citation trust mean >= 4.0');
    }
  }

  return {
    stage: payload.stage,
    weightedScore,
    minCategoryScore,
    passed: reasons.length === 0,
    reasons,
  };
}
