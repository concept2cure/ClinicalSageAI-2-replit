/**
 * PDEV state-transition guard — enforces the dependency graph defined
 * in the closed-enum activity registry at write time.
 *
 * Without this guard, a user could mark `regulatory.module_3_cmc` as
 * approved while `cmc.gmp_readiness` is still drafting, producing an
 * IND submission that's structurally inconsistent on its face.
 *
 * Rule:
 *   - If the caller is moving an activity into a "completed" state
 *     (approved / locked / submission_ready / submitted), every
 *     activity listed in its `dependsOn` chain must already be in one
 *     of those completed states.
 *   - Transitions to non-completed states (drafting, in_review,
 *     ai_draft_generated, etc.) are unrestricted.
 *   - Callers may pass `force: true` to override — recorded in the
 *     audit detail so an auditor can find every governance-override
 *     transition.
 *
 * Tenant gate is delegated to the caller — this service only reads
 * pdev_program_activities for the program id passed in. Callers must
 * have already validated the program belongs to the organization.
 *
 * @module server/services/pdev/pdev-state-guard
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import {
  getActivityByKey,
  PDEV_COMPLETED_STATES,
  type PdevActivityState,
} from './pdev-activity-registry';

const COMPLETED_STATES: ReadonlySet<PdevActivityState> = new Set(PDEV_COMPLETED_STATES);

export interface PdevDependencyBlocker {
  /** The dependency activity key (e.g. 'cmc.gmp_readiness'). */
  activityKey: string;
  /** Its current state for this program; 'not_started' when no row exists. */
  currentState: PdevActivityState;
  /** Human title from the registry. */
  title: string;
  /** Workstream the dependency belongs to. */
  workstream: string;
}

export type PdevStateGateResult =
  | { allowed: true; reason: 'unrestricted_target' }
  | { allowed: true; reason: 'all_dependencies_completed' }
  | { allowed: false; blockers: PdevDependencyBlocker[] };

/**
 * Check whether transitioning `activityKey` into `targetState` is
 * allowed by the registry's dependency graph for one program.
 *
 * Returns `{ allowed: true }` for non-completing transitions or when
 * every dependency is in a completed state. Otherwise returns
 * `{ allowed: false, blockers: [...] }` with the offending dependencies.
 */
export async function checkStateTransition(
  programId: string,
  activityKey: string,
  targetState: PdevActivityState
): Promise<PdevStateGateResult> {
  // Non-completing transitions are unrestricted.
  if (!COMPLETED_STATES.has(targetState)) {
    return { allowed: true, reason: 'unrestricted_target' };
  }

  const activity = getActivityByKey(activityKey);
  if (!activity) {
    // Unknown activity — surface upstream as a hard error.
    return { allowed: false, blockers: [] };
  }
  if (activity.dependsOn.length === 0) {
    return { allowed: true, reason: 'all_dependencies_completed' };
  }

  // Load current state for every dependency in a single query.
  const rows = await db
    .select({
      key: pdevProgramActivities.activityKey,
      state: pdevProgramActivities.state,
    })
    .from(pdevProgramActivities)
    .where(eq(pdevProgramActivities.programId, programId));

  const stateByKey = new Map<string, PdevActivityState>();
  for (const r of rows) {
    stateByKey.set(r.key, r.state as PdevActivityState);
  }

  const blockers: PdevDependencyBlocker[] = [];
  for (const depKey of activity.dependsOn) {
    const depState = stateByKey.get(depKey) ?? 'not_started';
    if (!COMPLETED_STATES.has(depState)) {
      const dep = getActivityByKey(depKey);
      blockers.push({
        activityKey: depKey,
        currentState: depState,
        title: dep?.title ?? depKey,
        workstream: dep?.workstream ?? '',
      });
    }
  }

  if (blockers.length === 0) {
    return { allowed: true, reason: 'all_dependencies_completed' };
  }
  return { allowed: false, blockers };
}

/**
 * Helper to format a blocker list for an error message.
 * Kept exported so command handlers and routes produce identical wording.
 */
export function describeBlockers(blockers: PdevDependencyBlocker[]): string {
  if (blockers.length === 0) return '';
  const parts = blockers
    .slice(0, 5)
    .map(b => `${b.title} (${b.activityKey}) — ${b.currentState}`);
  if (blockers.length > 5) parts.push(`+${blockers.length - 5} more`);
  return `Cannot complete: dependency activities not yet completed: ${parts.join('; ')}.`;
}

// Used by AnA command handler to bundle blockers into result.data without
// the caller having to know the shape.
export function buildGuardedResultData(
  result: PdevStateGateResult
): Record<string, unknown> | undefined {
  if (result.allowed) return undefined;
  return {
    blockers: result.blockers,
    blockerCount: result.blockers.length,
  };
}
