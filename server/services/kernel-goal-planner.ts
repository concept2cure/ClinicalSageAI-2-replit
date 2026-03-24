/**
 * Kernel Goal Planner (v1)
 *
 * Produces explicit multi-step plans with dependencies and success criteria.
 * Enables deterministic replanning hooks when quality/risk signals degrade.
 */

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'replanned';

export interface PlanStep {
  id: string;
  title: string;
  objective: string;
  dependsOn: string[];
  successCriteria: string[];
  status: PlanStepStatus;
}

export interface GoalPlan {
  planId: string;
  goal: string;
  intentLens: string;
  riskTier: 'low' | 'medium' | 'high';
  steps: PlanStep[];
  generatedAt: string;
  replanCount: number;
}

export interface GoalPlannerInput {
  message: string;
  intentLens: string;
  riskTier: 'low' | 'medium' | 'high';
  submissionType?: string | null;
}

function id(prefix: string, idx: number): string {
  return `${prefix}_${idx}`;
}

export function buildGoalPlan(input: GoalPlannerInput): GoalPlan {
  const goal = input.submissionType
    ? `Deliver ${input.submissionType.toUpperCase()}-ready response for: ${input.message.slice(0, 120)}`
    : `Deliver regulatory response for: ${input.message.slice(0, 120)}`;

  const baseSteps: PlanStep[] = [
    {
      id: id('step', 1),
      title: 'Clarify intent and scope',
      objective: 'Resolve intent lens and response boundaries from user request.',
      dependsOn: [],
      successCriteria: ['Intent confidence captured', 'Scope constraints identified'],
      status: 'pending',
    },
    {
      id: id('step', 2),
      title: 'Collect evidence and context',
      objective: 'Gather relevant project/document/history evidence.',
      dependsOn: [id('step', 1)],
      successCriteria: ['Evidence sources enumerated or explicitly absent'],
      status: 'pending',
    },
    {
      id: id('step', 3),
      title: 'Draft response with governance controls',
      objective: 'Produce grounded response using selected routing policy.',
      dependsOn: [id('step', 2)],
      successCriteria: ['Structured response generated', 'Citations/labels included when applicable'],
      status: 'pending',
    },
    {
      id: id('step', 4),
      title: 'Run quality/risk checks',
      objective: 'Evaluate structure, evidence discipline, and risk posture.',
      dependsOn: [id('step', 3)],
      successCriteria: ['Quality checks passed or remediation surfaced'],
      status: 'pending',
    },
  ];

  if (input.riskTier === 'high' || input.intentLens === 'risk' || input.intentLens === 'audit') {
    baseSteps.push({
      id: id('step', 5),
      title: 'Escalate mitigation actions',
      objective: 'Generate explicit risk mitigations and reviewer-facing actions.',
      dependsOn: [id('step', 4)],
      successCriteria: ['Mitigation actions prioritized by severity'],
      status: 'pending',
    });
  }

  return {
    planId: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    goal,
    intentLens: input.intentLens,
    riskTier: input.riskTier,
    steps: baseSteps,
    generatedAt: new Date().toISOString(),
    replanCount: 0,
  };
}

export function replanGoalPlan(
  current: GoalPlan,
  reason: 'evidence_failure' | 'structure_failure' | 'policy_failure'
): GoalPlan {
  const next = { ...current };
  next.replanCount += 1;
  next.steps = next.steps.map(step => ({ ...step }));

  const qualityStep = next.steps.find(s => s.title === 'Run quality/risk checks');
  if (qualityStep) qualityStep.status = 'replanned';

  next.steps.push({
    id: id('replan', next.replanCount),
    title: 'Remediation pass',
    objective:
      reason === 'evidence_failure'
        ? 'Add or qualify evidence and explicitly label unknowns.'
        : reason === 'structure_failure'
          ? 'Repair response structure and required output sections.'
          : 'Adjust routing/policy constraints and regenerate safely.',
    dependsOn: [qualityStep?.id || id('step', 4)],
    successCriteria: ['Failure reason addressed', 'Response meets governance checks'],
    status: 'pending',
  });

  return next;
}

