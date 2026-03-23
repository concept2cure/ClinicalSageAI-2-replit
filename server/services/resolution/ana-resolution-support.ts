/**
 * AnA Resolution Support — Sprint 4
 *
 * Wires AnA (Regulatory Intelligence) into the Resolution Orchestration Layer.
 * AnA can explain resolution plans, identify tradeoffs, and prepare
 * resolution bundles — all grounded in the structured layer.
 *
 * AnA MUST NOT invent resolution logic outside the structured layer
 * when structured data exists.
 *
 * @module server/services/resolution/ana-resolution-support
 */

import type {
  AnaResolutionExplanation,
  AnaResolutionBundleSummary,
  AffectedObject,
  ResolutionConfidence,
  ResolutionPath,
  ResolutionState,
  BundleState,
  BundleItemActionType,
} from '../../../shared/types/resolution';
import type { ResolutionPlan, ResolutionBundle, ResolutionBundleItem } from '../../../shared/schema/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLAN EXPLANATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a structured explanation of a resolution plan for AnA to present.
 *
 * This is NOT freeform AI prose — it is grounded in the structured plan data.
 * AnA uses this structured explanation to communicate with the user.
 */
export function explainResolutionPlan(
  plan: ResolutionPlan
): AnaResolutionExplanation {
  const affectedObjects = (plan.affectedObjects ?? []) as AffectedObject[];
  const directCount = affectedObjects.filter(o => o.impactState === 'direct').length;
  const indirectCount = affectedObjects.filter(o => o.impactState === 'indirect').length;
  const potentialCount = affectedObjects.filter(o => o.impactState === 'potential').length;

  return {
    planId: plan.id,

    summary: buildPlanSummary(plan, affectedObjects),

    triggerExplanation: buildTriggerExplanation(plan),

    affectedObjectsSummary: buildAffectedObjectsSummary(
      affectedObjects,
      directCount,
      indirectCount,
      potentialCount
    ),

    recommendedPathExplanation: buildPathExplanation(
      plan.recommendedPath as ResolutionPath,
      affectedObjects
    ),

    alternativePathsExplanation: plan.alternativePaths && (plan.alternativePaths as string[]).length > 0
      ? buildAlternativePathsExplanation(plan.alternativePaths as string[])
      : undefined,

    reviewRequirements: buildReviewRequirements(plan),

    confidenceExplanation: buildConfidenceExplanation(
      plan.confidence as ResolutionConfidence,
      affectedObjects.length
    ),

    nextSteps: buildNextSteps(plan),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION BUNDLE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a structured summary of a resolution bundle for AnA to present.
 */
export function summarizeResolutionBundle(
  bundle: ResolutionBundle,
  items: ResolutionBundleItem[]
): AnaResolutionBundleSummary {
  // Count items by action type
  const actionCounts = new Map<string, number>();
  for (const item of items) {
    const count = actionCounts.get(item.actionType) ?? 0;
    actionCounts.set(item.actionType, count + 1);
  }

  const completedCount = items.filter(i => i.status === 'completed').length;
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const inProgressCount = items.filter(i => i.status === 'in_progress').length;

  let reviewStatus: string;
  if (bundle.state === 'approved' || bundle.state === 'applied') {
    reviewStatus = 'Approved and ready for application';
  } else if (bundle.state === 'pending_review') {
    reviewStatus = 'Awaiting review';
  } else if (bundle.state === 'in_progress') {
    reviewStatus = `In progress: ${completedCount}/${items.length} items completed`;
  } else if (bundle.state === 'rejected') {
    reviewStatus = 'Rejected — requires revision';
  } else {
    reviewStatus = `${bundle.state}: ${pendingCount} pending, ${inProgressCount} in progress, ${completedCount} completed`;
  }

  return {
    bundleId: bundle.id,
    summary: buildBundleSummary(bundle, items, completedCount),
    itemCount: items.length,
    itemBreakdown: Array.from(actionCounts.entries()).map(([actionType, count]) => ({
      actionType,
      count,
    })),
    reviewStatus,
    confidenceLevel: bundle.confidence as ResolutionConfidence,
    nextSteps: buildBundleNextSteps(bundle, items, completedCount),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANA RESOLUTION PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a structured context block for AnA's system prompt when a user
 * asks about resolution plans or contradictions in their project.
 *
 * This gives AnA grounded information to work with instead of
 * inventing resolution logic.
 */
export function buildAnaResolutionContext(
  plans: ResolutionPlan[],
  bundles: Array<{ bundle: ResolutionBundle; items: ResolutionBundleItem[] }>
): string {
  if (plans.length === 0 && bundles.length === 0) {
    return '<resolution_context>No active resolution plans or bundles for this project.</resolution_context>';
  }

  const lines: string[] = ['<resolution_context>'];

  if (plans.length > 0) {
    lines.push(`## Active Resolution Plans (${plans.length})`);
    for (const plan of plans) {
      const affectedObjects = (plan.affectedObjects ?? []) as AffectedObject[];
      lines.push(`- **Plan ${plan.id.slice(0, 8)}**: ${plan.triggerDescription}`);
      lines.push(`  State: ${plan.state} | Path: ${plan.recommendedPath} | Confidence: ${plan.confidence}`);
      lines.push(`  Affected: ${affectedObjects.length} objects | Review: ${plan.requiresReview ? 'yes' : 'no'} | Reapproval: ${plan.requiresReapproval ? 'yes' : 'no'}`);
    }
  }

  if (bundles.length > 0) {
    lines.push(`\n## Resolution Bundles (${bundles.length})`);
    for (const { bundle, items } of bundles) {
      const completedCount = items.filter(i => i.status === 'completed').length;
      lines.push(`- **Bundle ${bundle.id.slice(0, 8)}**: ${bundle.title}`);
      lines.push(`  State: ${bundle.state} | Items: ${items.length} (${completedCount} completed)`);
      lines.push(`  Confidence: ${bundle.confidence} | Review: ${bundle.requiresReview ? 'yes' : 'no'}`);
    }
  }

  lines.push('</resolution_context>');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildPlanSummary(plan: ResolutionPlan, affectedObjects: AffectedObject[]): string {
  const triggerLabel = (plan.triggerType as string).replace(/_/g, ' ');
  const pathLabel = (plan.recommendedPath as string).replace(/_/g, ' ');
  const objectTypes = [...new Set(affectedObjects.map(o => o.objectType))];

  return `This ${triggerLabel} affects ${affectedObjects.length} object(s) ` +
    `(${objectTypes.join(', ')}). ` +
    `The recommended resolution path is "${pathLabel}" with ${plan.confidence} confidence.`;
}

function buildTriggerExplanation(plan: ResolutionPlan): string {
  const triggerLabel = (plan.triggerType as string).replace(/_/g, ' ');
  return `This resolution was triggered by a ${triggerLabel}: ${plan.triggerDescription}`;
}

function buildAffectedObjectsSummary(
  objects: AffectedObject[],
  direct: number,
  indirect: number,
  potential: number
): string {
  const parts: string[] = [];
  if (direct > 0) parts.push(`${direct} directly impacted`);
  if (indirect > 0) parts.push(`${indirect} indirectly impacted`);
  if (potential > 0) parts.push(`${potential} potentially impacted`);

  const typeBreakdown = new Map<string, number>();
  for (const obj of objects) {
    typeBreakdown.set(obj.objectType, (typeBreakdown.get(obj.objectType) ?? 0) + 1);
  }
  const typeStr = Array.from(typeBreakdown.entries())
    .map(([type, count]) => `${count} ${type}(s)`)
    .join(', ');

  return `${objects.length} objects affected: ${parts.join(', ')}. Breakdown: ${typeStr}.`;
}

function buildPathExplanation(path: ResolutionPath, objects: AffectedObject[]): string {
  const explanations: Record<ResolutionPath, string> = {
    harmonize: 'Harmonize affected objects to ensure consistency across all impacted documents and decisions.',
    supersede: 'Supersede affected objects with new versions that reflect the corrected information.',
    rewrite: 'Rewrite the directly impacted content to address the root cause of the issue.',
    review_only: 'Review the impacted objects to confirm whether changes are needed.',
    escalate: 'Escalate for manual review — the scope or complexity requires human judgment.',
    mixed: 'A combination approach: directly impacted objects will be rewritten, while indirectly impacted ones will be harmonized.',
  };
  return explanations[path] || `Recommended path: ${path}`;
}

function buildAlternativePathsExplanation(paths: string[]): string {
  if (paths.length === 0) return '';
  return `Alternative approaches: ${paths.map(p => p.replace(/_/g, ' ')).join(', ')}.`;
}

function buildReviewRequirements(plan: ResolutionPlan): string {
  const parts: string[] = [];
  if (plan.requiresReview) parts.push('review required');
  if (plan.requiresReapproval) parts.push('reapproval required for approved artifacts');
  if (plan.requiresEscalation) parts.push('escalation recommended');
  if (parts.length === 0) return 'No additional review requirements.';
  return `Requirements: ${parts.join(', ')}.`;
}

function buildConfidenceExplanation(confidence: ResolutionConfidence, objectCount: number): string {
  const explanations: Record<ResolutionConfidence, string> = {
    strong: 'The impact analysis has strong confidence — the affected objects and resolution path are well-determined.',
    moderate: 'The impact analysis has moderate confidence — most affected objects are identified but some may be missing.',
    provisional: 'The impact analysis is provisional — the full scope of impact is not yet confirmed. Review recommended.',
    uncertain: 'The impact analysis has uncertain confidence — manual review is strongly recommended before proceeding.',
  };
  return explanations[confidence] || `Confidence: ${confidence}`;
}

function buildNextSteps(plan: ResolutionPlan): string[] {
  const state = plan.state as ResolutionState;
  const steps: string[] = [];

  switch (state) {
    case 'unresolved':
      steps.push('Review the resolution plan and affected objects');
      steps.push('Create a resolution bundle to coordinate fixes');
      if (plan.requiresEscalation) steps.push('Escalate to a senior reviewer');
      break;
    case 'proposed_resolution':
      steps.push('Begin implementing the resolution');
      steps.push('Assign resolution items to team members');
      break;
    case 'in_resolution':
      steps.push('Complete all resolution bundle items');
      steps.push('Submit for review when all items are addressed');
      break;
    case 'resolved_pending_review':
      steps.push('Review the completed resolution');
      if (plan.requiresReapproval) steps.push('Re-approve affected artifacts');
      steps.push('Approve or send back for revision');
      break;
    case 'resolved_approved':
      steps.push('Resolution is complete — no further action needed');
      break;
    case 'superseded':
      steps.push('This plan has been superseded by a newer resolution');
      break;
    case 'cancelled':
      steps.push('This plan was cancelled — reopen if needed');
      break;
  }

  return steps;
}

function buildBundleSummary(
  bundle: ResolutionBundle,
  items: ResolutionBundleItem[],
  completedCount: number
): string {
  return `Resolution bundle "${bundle.title}" contains ${items.length} item(s). ` +
    `${completedCount} completed, ${items.length - completedCount} remaining. ` +
    `State: ${bundle.state}. Confidence: ${bundle.confidence}.`;
}

function buildBundleNextSteps(
  bundle: ResolutionBundle,
  items: ResolutionBundleItem[],
  completedCount: number
): string[] {
  const state = bundle.state as BundleState;
  const steps: string[] = [];

  switch (state) {
    case 'draft':
      steps.push('Review and finalize bundle items');
      steps.push('Propose the bundle for implementation');
      break;
    case 'proposed':
      steps.push('Begin implementing bundle items');
      break;
    case 'in_progress':
      steps.push(`Complete remaining ${items.length - completedCount} item(s)`);
      const pendingItems = items.filter(i => i.status === 'pending');
      if (pendingItems.length > 0) {
        steps.push(`Next: ${pendingItems[0].actionDescription}`);
      }
      break;
    case 'pending_review':
      steps.push('Review all completed items');
      if (bundle.requiresReapproval) steps.push('Re-approve affected artifacts');
      break;
    case 'approved':
      steps.push('Apply the resolution to finalize all changes');
      break;
    case 'applied':
      steps.push('Resolution is complete');
      break;
    case 'rejected':
      steps.push('Revise the bundle based on review feedback');
      break;
    default:
      steps.push(`Bundle is in ${state} state`);
  }

  return steps;
}
