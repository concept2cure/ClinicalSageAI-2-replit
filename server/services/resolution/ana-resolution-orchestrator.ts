/**
 * AnA Resolution Orchestrator — Sprint 5
 *
 * Upgrades AnA from narrator → orchestrator.
 *
 * AnA can now:
 * 1. DETECT — identify contradictions / drift / inconsistency
 * 2. DECIDE — should it execute, prepare, or block?
 * 3. PLAN — build a resolution plan with affected objects
 * 4. EXECUTE (or not) — create bundle, trigger execution if allowed
 * 5. PROVE — return receipt + structured explanation
 *
 * RULES:
 * - NEVER execute if confidence is uncertain
 * - ALWAYS return receipt if execution occurs
 * - ALWAYS link to governed objects
 * - USE existing system (no parallel logic)
 * - NO LLM-first decisions — structured-first
 *
 * @module server/services/resolution/ana-resolution-orchestrator
 */

import { createResolutionPlan } from './resolution-planner';
import { createBundleFromPlan } from './bundle-builder';
import { executeBundle } from './bundle-executor';
import { explainResolutionPlan } from './ana-resolution-support';
import { transitionResolutionState } from './resolution-state-machine';
import type {
  OrchestratorTrigger,
  OrchestratorResult,
  OrchestratorDecision,
  ResolutionConfidence,
  AffectedObject,
} from '../../../shared/types/resolution';
import type { ResolutionPlan } from '../../../shared/schema/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the full orchestration loop:
 * detect → decide → plan → (optionally execute) → prove
 */
export async function orchestrateResolution(
  organizationId: number,
  userId: number,
  trigger: OrchestratorTrigger
): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();

  // ── STEP 1: CREATE RESOLUTION PLAN ──
  // Uses existing resolution-planner — discovers affected objects,
  // determines path, confidence, and requirements
  const plan = await createResolutionPlan(organizationId, userId, {
    projectId: trigger.projectId,
    triggerType: trigger.triggerType,
    triggerId: trigger.triggerId,
    triggerDescription: trigger.triggerDescription,
    affectedObjects: trigger.affectedObjects,
    confidence: trigger.forceConfidence,
    autoCluster: !trigger.affectedObjects || trigger.affectedObjects.length === 0,
  });

  // ── STEP 2: CLASSIFY + DECIDE ──
  const confidence = (plan.confidence as ResolutionConfidence) ?? 'uncertain';
  const affectedObjects = (plan.affectedObjects ?? []) as AffectedObject[];
  const decision = classifyDecision(confidence, plan, affectedObjects);

  // ── STEP 3: GENERATE EXPLANATION ──
  const explanation = explainResolutionPlan(plan);

  // ── STEP 4: HANDLE DECISION ──

  // BLOCK — do not create bundle, do not execute
  if (decision.action === 'block') {
    return {
      decision: 'block',
      decisionRationale: decision.rationale,
      plan: summarizePlan(plan),
      explanation,
      timestamp,
    };
  }

  // PREPARE or EXECUTE — create bundle from plan
  // Transition plan to proposed_resolution first
  await transitionResolutionState(
    organizationId, userId, plan.id,
    'proposed_resolution',
    `AnA orchestrator: ${decision.rationale}`
  );

  // createBundleFromPlan reads the plan's affected objects and generates
  // appropriate bundle items based on the recommended path
  const { bundle, items } = await createBundleFromPlan(
    organizationId,
    userId,
    plan.id
  );

  const bundleSummary = {
    id: bundle.id,
    state: bundle.state,
    itemCount: items.length,
    confidence: bundle.confidence as string,
  };

  // PREPARE — bundle created but not executed
  if (decision.action === 'prepare') {
    return {
      decision: 'prepare',
      decisionRationale: decision.rationale,
      plan: summarizePlan(plan),
      bundle: bundleSummary,
      explanation,
      timestamp,
    };
  }

  // EXECUTE — transition plan to in_resolution and execute bundle
  await transitionResolutionState(
    organizationId, userId, plan.id,
    'in_resolution',
    `AnA orchestrator: executing bundle ${bundle.id}`
  );

  const receipt = await executeBundle(organizationId, userId, bundle.id);

  return {
    decision: 'execute',
    decisionRationale: decision.rationale,
    plan: summarizePlan(plan),
    bundle: {
      ...bundleSummary,
      state: 'in_progress', // Updated after execution
    },
    receipt,
    explanation,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

interface ClassifiedDecision {
  action: OrchestratorDecision;
  rationale: string;
}

/**
 * Determine what action to take based on structured data.
 * NO LLM inference. Pure rule-based classification.
 *
 * Decision matrix:
 * - uncertain confidence → BLOCK (never act on uncertain data)
 * - escalation required → PREPARE (human must decide)
 * - provisional confidence → PREPARE (too risky for auto-execution)
 * - no affected objects → BLOCK (nothing to act on)
 * - moderate/strong + no escalation → EXECUTE
 */
function classifyDecision(
  confidence: ResolutionConfidence,
  plan: ResolutionPlan,
  affectedObjects: AffectedObject[]
): ClassifiedDecision {
  // Rule 1: NEVER execute if confidence is uncertain
  if (confidence === 'uncertain') {
    return {
      action: 'block',
      rationale: 'Confidence is uncertain — system cannot reliably determine affected objects or resolution path. Manual investigation required.',
    };
  }

  // Rule 2: No affected objects → block
  if (affectedObjects.length === 0) {
    return {
      action: 'block',
      rationale: 'No affected objects identified — cannot create a resolution plan without known impact.',
    };
  }

  // Rule 3: Escalation required → prepare only
  if (plan.requiresEscalation) {
    return {
      action: 'prepare',
      rationale: 'Escalation required — resolution plan and bundle prepared for senior review. Execution blocked until human approval.',
    };
  }

  // Rule 4: Provisional confidence → prepare only
  if (confidence === 'provisional') {
    return {
      action: 'prepare',
      rationale: 'Confidence is provisional — resolution plan and bundle prepared but require human review before execution.',
    };
  }

  // Rule 5: Moderate or strong confidence, no escalation → execute
  return {
    action: 'execute',
    rationale: `Confidence is ${confidence}. ${affectedObjects.length} object(s) affected. ` +
      `Resolution path: ${plan.recommendedPath}. Proceeding with governed execution.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function summarizePlan(plan: ResolutionPlan): OrchestratorResult['plan'] {
  const affectedObjects = (plan.affectedObjects ?? []) as AffectedObject[];
  return {
    id: plan.id,
    state: plan.state,
    triggerType: plan.triggerType as string,
    recommendedPath: plan.recommendedPath as string,
    confidence: plan.confidence as string,
    affectedObjectCount: affectedObjects.length,
    requiresReview: plan.requiresReview,
    requiresReapproval: plan.requiresReapproval,
    requiresEscalation: plan.requiresEscalation,
  };
}
