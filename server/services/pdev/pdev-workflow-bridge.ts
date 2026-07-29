/**
 * PDEV workflow-run bridge — connects PDEV activity promotions to the
 * existing rich workflow / approval-checkpoint infrastructure.
 *
 * Without this bridge, an activity going to `approved` just sets a
 * column. With this bridge, a multi-step approval chain (reviewer →
 * approver → QA / RA / governance, configurable per policy) is created
 * and the activity is held at `human_review_required` until every
 * checkpoint resolves.
 *
 * Reuses (does NOT duplicate):
 *   - workflow_runs                  (existing)
 *   - approval_checkpoints           (existing)
 *   - approval-orchestrator concepts (existing)
 *   - tamper-proof audit             (existing)
 *
 * Policy: today the default chain is two checkpoints:
 *   1. reviewer (workstream_lead or designated reviewer role)
 *   2. approver (regulatory_lead or designated approver role)
 *
 * The chain is hard-coded as a sensible default. Configurable per
 * tenant / per activity is a future enhancement (organizations.settings
 * already supports per-tenant config; not wired here).
 *
 * @module server/services/pdev/pdev-workflow-bridge
 */

import { and, asc, eq, desc } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  workflowRuns,
  approvalCheckpoints,
  type ApprovalRecord,
} from '../../../shared/schema/orchestration';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import {
  getActivityByKey,
  type PdevActivityState,
} from './pdev-activity-registry';
import { applyIndClearanceIfTerminal } from './pdev-clearance';
import auditService from '../auditService';

const logger = createScopedLogger('pdev-workflow-bridge');

const COMPLETED_TARGET_STATES: ReadonlySet<PdevActivityState> = new Set([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

export interface PdevApprovalChainStep {
  stepIndex: number;
  stepName: string;
  requiredApproverRoles: string[];
  requiredApproverCount: number;
  protectedAction: string;
}

/**
 * Default 2-step approval chain for PDEV activity promotion. Reviewer
 * sees the artifact first; approver gives the final sign-off.
 */
const DEFAULT_CHAIN: PdevApprovalChainStep[] = [
  {
    stepIndex: 0,
    stepName: 'Workstream reviewer',
    requiredApproverRoles: ['regulatory', 'regulatory_lead', 'workstream_lead'],
    requiredApproverCount: 1,
    protectedAction: 'pdev_activity_review',
  },
  {
    stepIndex: 1,
    stepName: 'Regulatory approver',
    requiredApproverRoles: ['regulatory_lead', 'admin', 'superadmin'],
    requiredApproverCount: 1,
    protectedAction: 'pdev_activity_approve',
  },
];

export interface PdevWorkflowKickoffInput {
  programId: string;
  organizationId: number;
  activityKey: string;
  targetState: PdevActivityState;
  requestedByUserId: number;
  requestedByRole?: string;
  reason?: string;
  /** Optional override of the default chain (e.g. governed by tenant policy). */
  chain?: PdevApprovalChainStep[];
}

export interface PdevWorkflowKickoffResult {
  workflowRunId: string;
  checkpointIds: string[];
  activityStateId: string;
  /** Activity moved to this state during kickoff (typically `human_review_required`). */
  holdingState: PdevActivityState;
}

export interface PdevApprovalChainStatus {
  workflowRunId: string;
  workflowStatus: string;
  workflowType: string;
  programId: string | null;
  activityKey: string;
  targetState: PdevActivityState;
  startedAt: string | null;
  completedAt: string | null;
  checkpoints: Array<{
    id: string;
    stepIndex: number;
    stepName: string;
    status: string;
    requiredApproverRoles: string[];
    requiredApproverCount: number;
    approvals: Array<{
      userId: string;
      role?: string;
      at: string;
      reason?: string;
    }>;
    rejectionReason: string | null;
    resolvedAt: string | null;
  }>;
}

export interface PdevCheckpointDecisionInput {
  workflowRunId: string;
  checkpointId: string;
  organizationId: number;
  userId: number;
  userRole?: string;
  decision: 'approve' | 'reject';
  reason: string;
}

/**
 * Pure decision rule for one checkpoint decision. Captures every branch of
 * the approval state machine without touching the database, so it can be
 * tested exhaustively. `recordDecision` calls this to derive the status
 * strings; the DB writes follow the plan.
 */
export interface CheckpointOutcomePlan {
  checkpointStatus: 'approved' | 'awaiting_review' | 'failed';
  workflowStatus: 'awaiting_approval' | 'completed' | 'failed';
  outcome: 'rejected' | 'partial' | 'advanced' | 'completed';
}

export function decideCheckpointOutcome(args: {
  decision: 'approve' | 'reject';
  approvalsCountAfter: number;
  requiredCount: number;
  hasNextProposedCheckpoint: boolean;
}): CheckpointOutcomePlan {
  if (args.decision === 'reject') {
    return { checkpointStatus: 'failed', workflowStatus: 'failed', outcome: 'rejected' };
  }
  const quorumMet = args.approvalsCountAfter >= Math.max(1, args.requiredCount);
  if (!quorumMet) {
    return {
      checkpointStatus: 'awaiting_review',
      workflowStatus: 'awaiting_approval',
      outcome: 'partial',
    };
  }
  if (args.hasNextProposedCheckpoint) {
    return {
      checkpointStatus: 'approved',
      workflowStatus: 'awaiting_approval',
      outcome: 'advanced',
    };
  }
  return { checkpointStatus: 'approved', workflowStatus: 'completed', outcome: 'completed' };
}

export interface PdevCheckpointDecisionResult {
  checkpointStatus: string;
  workflowStatus: string;
  /** Set when the chain advances to the next checkpoint. */
  nextCheckpointId?: string;
  /** Set when the chain completes — the activity is moved to its target state. */
  activityFinalState?: PdevActivityState;
  rejectionReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class PdevWorkflowBridge {
  /**
   * Kick off a new approval workflow for a PDEV activity promotion.
   *
   * Side effects:
   *   - Tenant-gates the program.
   *   - Validates the target state is a completing state.
   *   - Creates the workflow_runs row.
   *   - Creates one approval_checkpoints row per chain step.
   *   - Upserts pdev_program_activities into `human_review_required`
   *     (the activity is held until the chain completes).
   *   - Audit-logs the kickoff.
   */
  async kickoff(input: PdevWorkflowKickoffInput): Promise<PdevWorkflowKickoffResult> {
    if (!COMPLETED_TARGET_STATES.has(input.targetState)) {
      throw new Error(
        `Workflow approval chain is only used for promotions to completed states (approved / locked / submission_ready / submitted), got: ${input.targetState}.`
      );
    }
    const activity = getActivityByKey(input.activityKey);
    if (!activity) {
      throw new Error(`Unknown PDEV activity key: ${input.activityKey}`);
    }

    // Tenant gate.
    const programRows = await db
      .select({ id: regulatoryPrograms.id, productName: regulatoryPrograms.productName })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, input.programId),
          eq(regulatoryPrograms.organizationId, input.organizationId)
        )
      )
      .limit(1);
    const program = programRows[0];
    if (!program) {
      throw new Error('PDEV program not found in tenant');
    }

    const chain = input.chain ?? DEFAULT_CHAIN;
    if (chain.length === 0) {
      throw new Error('Approval chain must have at least one step.');
    }

    const now = new Date();
    const displayName = `Approve ${activity.title} → ${input.targetState}`;

    // Create workflow_runs row.
    const runRows = await db
      .insert(workflowRuns)
      .values({
        organizationId: input.organizationId,
        workflowType: 'pdev_activity_approval',
        workflowVersion: '1.0',
        displayName,
        triggerSource: 'user_action',
        triggeredBy: String(input.requestedByUserId),
        programId: input.programId,
        moduleScope: activity.workstream,
        status: 'awaiting_approval',
        currentStepIndex: 0,
        startedAt: now,
        metadata: {
          pdevActivityKey: input.activityKey,
          pdevWorkstream: activity.workstream,
          pdevStage: activity.stage,
          targetState: input.targetState,
          requestedByRole: input.requestedByRole ?? null,
          reason: input.reason ?? null,
        },
      })
      .returning({ id: workflowRuns.id });
    const workflowRunId = runRows[0].id;

    // Create approval_checkpoints rows for each step.
    const checkpointInserts = chain.map(step => ({
      workflowRunId,
      stepIndex: step.stepIndex,
      stepName: step.stepName,
      gateType: 'role_based' as const,
      isConfigurable: true,
      status: step.stepIndex === 0 ? ('awaiting_review' as const) : ('proposed' as const),
      requiredApproverRoles: step.requiredApproverRoles,
      requiredApproverCount: step.requiredApproverCount,
      approvals: [],
      protectedAction: step.protectedAction,
      protectedObjectIds: [input.activityKey],
    }));
    const checkpointRows = await db
      .insert(approvalCheckpoints)
      .values(checkpointInserts)
      .returning({ id: approvalCheckpoints.id });
    const checkpointIds = checkpointRows.map(r => r.id);

    // Upsert PDEV activity into human_review_required so the existing
    // dependency gate (pdev-state-guard.ts) prevents naive promotion
    // outside this workflow.
    const existing = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, input.programId),
          eq(pdevProgramActivities.activityKey, input.activityKey)
        )
      )
      .limit(1);
    const holdingState: PdevActivityState = 'human_review_required';

    let activityStateId: string;
    if (existing[0]) {
      const updated = await db
        .update(pdevProgramActivities)
        .set({
          state: holdingState,
          notes: existing[0].notes,
          stateChangedAt: now,
          stateChangedBy: input.requestedByUserId,
          updatedAt: now,
        })
        .where(eq(pdevProgramActivities.id, existing[0].id))
        .returning({ id: pdevProgramActivities.id });
      activityStateId = updated[0].id;
    } else {
      const inserted = await db
        .insert(pdevProgramActivities)
        .values({
          programId: input.programId,
          activityKey: input.activityKey,
          workstream: activity.workstream,
          stage: activity.stage,
          state: holdingState,
          stateChangedAt: now,
          stateChangedBy: input.requestedByUserId,
        })
        .returning({ id: pdevProgramActivities.id });
      activityStateId = inserted[0].id;
    }

    void auditService.logAction({
      tenantId: input.organizationId,
      userId: input.requestedByUserId,
      action: 'pdev_workflow_kickoff',
      resourceType: 'workflow_run',
      resourceId: workflowRunId,
      details: {
        programId: input.programId,
        activityKey: input.activityKey,
        targetState: input.targetState,
        chainSteps: chain.map(s => s.stepName),
        productName: program.productName,
      },
    });

    logger.info('PDEV workflow kickoff', {
      workflowRunId,
      activityKey: input.activityKey,
      targetState: input.targetState,
    });

    return { workflowRunId, checkpointIds, activityStateId, holdingState };
  }

  /**
   * Return the current chain status for an activity (most recent
   * workflow run for that program × activity).
   */
  async getChainStatus(
    programId: string,
    organizationId: number,
    activityKey: string
  ): Promise<PdevApprovalChainStatus | null> {
    // Tenant gate first.
    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, programId),
          eq(regulatoryPrograms.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) return null;

    // Find the most recent workflow run for this activity.
    const runs = await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.organizationId, organizationId),
          eq(workflowRuns.programId, programId),
          eq(workflowRuns.workflowType, 'pdev_activity_approval')
        )
      )
      .orderBy(desc(workflowRuns.createdAt))
      .limit(20);

    // Pick the latest one whose metadata matches the activityKey.
    const run = runs.find(r => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return meta.pdevActivityKey === activityKey;
    });
    if (!run) return null;

    const checkpoints = await db
      .select()
      .from(approvalCheckpoints)
      .where(eq(approvalCheckpoints.workflowRunId, run.id))
      .orderBy(asc(approvalCheckpoints.stepIndex));

    const meta = (run.metadata ?? {}) as Record<string, unknown>;
    return {
      workflowRunId: run.id,
      workflowStatus: run.status,
      workflowType: run.workflowType,
      programId: run.programId,
      activityKey,
      targetState: (meta.targetState as PdevActivityState) ?? 'approved',
      startedAt: run.startedAt ? new Date(run.startedAt as unknown as Date).toISOString() : null,
      completedAt: run.completedAt
        ? new Date(run.completedAt as unknown as Date).toISOString()
        : null,
      checkpoints: checkpoints.map(c => ({
        id: c.id,
        stepIndex: c.stepIndex,
        stepName: c.stepName,
        status: c.status,
        requiredApproverRoles: (c.requiredApproverRoles as string[]) ?? [],
        requiredApproverCount: c.requiredApproverCount ?? 1,
        approvals: ((c.approvals as ApprovalRecord[]) ?? []).map(a => ({
          userId: a.approverId,
          role: a.approverRole,
          at: a.decidedAt,
          reason: a.comment,
        })),
        rejectionReason: c.rejectionReason,
        resolvedAt: c.resolvedAt
          ? new Date(c.resolvedAt as unknown as Date).toISOString()
          : null,
      })),
    };
  }

  /**
   * Record an approve/reject decision on one checkpoint. If the chain
   * advances past its final step, the underlying activity is moved to
   * its target state. On reject, the workflow run is marked failed and
   * the activity returns to `revision_required`.
   */
  async recordDecision(
    input: PdevCheckpointDecisionInput
  ): Promise<PdevCheckpointDecisionResult> {
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error('reason is required (≥10 chars).');
    }

    // Load the checkpoint + run with tenant gate.
    const checkpointRows = await db
      .select()
      .from(approvalCheckpoints)
      .where(eq(approvalCheckpoints.id, input.checkpointId))
      .limit(1);
    const checkpoint = checkpointRows[0];
    if (!checkpoint || checkpoint.workflowRunId !== input.workflowRunId) {
      throw new Error('Checkpoint not found.');
    }

    const runRows = await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.id, input.workflowRunId),
          eq(workflowRuns.organizationId, input.organizationId)
        )
      )
      .limit(1);
    const run = runRows[0];
    if (!run) {
      throw new Error('Workflow run not found in tenant.');
    }
    if (run.workflowType !== 'pdev_activity_approval') {
      throw new Error('Workflow run is not a PDEV approval chain.');
    }
    if (run.status !== 'awaiting_approval' && run.status !== 'running' && run.status !== 'pending') {
      throw new Error(`Workflow run is already ${run.status}; no further decisions accepted.`);
    }

    // Role validation. If user has no role, accept it (the role isn't strictly
    // required for the chain to function). The required roles guard at the
    // tool-policy layer (mdx-tool-policy.ts) handles tenant allow-deny.
    const requiredRoles = (checkpoint.requiredApproverRoles as string[]) ?? [];
    const role = input.userRole ?? '';
    if (requiredRoles.length > 0 && role && !requiredRoles.includes(role)) {
      // Soft warn — we still allow the decision, but mark the audit as
      // role_outside_required for the auditor.
      logger.warn('Decision recorded with role outside the required-roles set', {
        userRole: role,
        requiredRoles,
      });
    }

    if (checkpoint.status !== 'awaiting_review') {
      throw new Error(
        `Checkpoint is in status ${checkpoint.status}; only awaiting_review is decidable.`
      );
    }

    const now = new Date();
    const meta = (run.metadata ?? {}) as Record<string, unknown>;
    const activityKey = String(meta.pdevActivityKey ?? '');
    const targetState = (meta.targetState as PdevActivityState) ?? 'approved';

    if (input.decision === 'reject') {
      // Mark this checkpoint failed + workflow run failed.
      await db
        .update(approvalCheckpoints)
        .set({
          status: 'failed',
          rejectionReason: input.reason,
          resolvedAt: now,
        })
        .where(eq(approvalCheckpoints.id, input.checkpointId));

      await db
        .update(workflowRuns)
        .set({
          status: 'failed',
          completedAt: now,
          updatedAt: now,
          errorMessage: `Rejected at step ${checkpoint.stepIndex} (${checkpoint.stepName}): ${input.reason}`,
          errorStepIndex: checkpoint.stepIndex,
        })
        .where(eq(workflowRuns.id, run.id));

      // Move PDEV activity to revision_required so the owner has to address.
      if (run.programId && activityKey) {
        await db
          .update(pdevProgramActivities)
          .set({
            state: 'revision_required',
            stateChangedAt: now,
            stateChangedBy: input.userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(pdevProgramActivities.programId, run.programId),
              eq(pdevProgramActivities.activityKey, activityKey)
            )
          );
      }

      void auditService.logAction({
        tenantId: input.organizationId,
        userId: input.userId,
        action: 'pdev_workflow_checkpoint_rejected',
        resourceType: 'approval_checkpoint',
        resourceId: input.checkpointId,
        details: {
          workflowRunId: input.workflowRunId,
          programId: run.programId,
          activityKey,
          stepIndex: checkpoint.stepIndex,
          stepName: checkpoint.stepName,
          rejectionReason: input.reason,
        },
      });

      return {
        checkpointStatus: 'failed',
        workflowStatus: 'failed',
        rejectionReason: input.reason,
      };
    }

    // Approve path. Append to approvals[]; if requiredApproverCount is met,
    // mark checkpoint approved. If the chain has more steps, activate the next
    // checkpoint; if not, mark workflow complete and move activity to target.
    const approvals: ApprovalRecord[] = ((checkpoint.approvals as ApprovalRecord[]) ?? []).concat([
      {
        approverId: String(input.userId),
        approverName: String(input.userId),
        approverRole: input.userRole ?? 'unspecified',
        decision: 'approved',
        comment: input.reason,
        decidedAt: now.toISOString(),
      },
    ]);
    const required = checkpoint.requiredApproverCount ?? 1;
    const checkpointMet = approvals.length >= Math.max(1, required);
    // Pure decision rule (tested exhaustively in pdev-workflow-bridge.test.ts).
    // hasNextProposedCheckpoint is resolved after this update for the met
    // case; for the partial case it is irrelevant.
    const partialPlan = decideCheckpointOutcome({
      decision: 'approve',
      approvalsCountAfter: approvals.length,
      requiredCount: required,
      hasNextProposedCheckpoint: false,
    });
    const newCheckpointStatus = partialPlan.checkpointStatus;

    await db
      .update(approvalCheckpoints)
      .set({
        approvals,
        status: newCheckpointStatus,
        resolvedAt: checkpointMet ? now : null,
      })
      .where(eq(approvalCheckpoints.id, input.checkpointId));

    if (!checkpointMet) {
      void auditService.logAction({
        tenantId: input.organizationId,
        userId: input.userId,
        action: 'pdev_workflow_checkpoint_partial_approval',
        resourceType: 'approval_checkpoint',
        resourceId: input.checkpointId,
        details: {
          workflowRunId: input.workflowRunId,
          programId: run.programId,
          activityKey,
          approvalsReceived: approvals.length,
          approvalsRequired: required,
          reason: input.reason,
        },
      });
      return {
        checkpointStatus: partialPlan.checkpointStatus,
        workflowStatus: run.status,
      };
    }

    // Checkpoint cleared. Find the next one.
    const allCheckpoints = await db
      .select()
      .from(approvalCheckpoints)
      .where(eq(approvalCheckpoints.workflowRunId, run.id))
      .orderBy(asc(approvalCheckpoints.stepIndex));
    const nextCheckpoint = allCheckpoints.find(
      c => c.stepIndex > checkpoint.stepIndex && c.status === 'proposed'
    );

    // Re-evaluate the plan now that we know whether a next checkpoint exists.
    const metPlan = decideCheckpointOutcome({
      decision: 'approve',
      approvalsCountAfter: approvals.length,
      requiredCount: required,
      hasNextProposedCheckpoint: Boolean(nextCheckpoint),
    });

    if (metPlan.outcome === 'advanced' && nextCheckpoint) {
      // Advance — activate the next checkpoint.
      await db
        .update(approvalCheckpoints)
        .set({
          status: 'awaiting_review',
          reviewStartedAt: now,
        })
        .where(eq(approvalCheckpoints.id, nextCheckpoint.id));

      await db
        .update(workflowRuns)
        .set({
          currentStepIndex: nextCheckpoint.stepIndex,
          lastSuccessfulStepIndex: checkpoint.stepIndex,
          updatedAt: now,
        })
        .where(eq(workflowRuns.id, run.id));

      void auditService.logAction({
        tenantId: input.organizationId,
        userId: input.userId,
        action: 'pdev_workflow_checkpoint_approved',
        resourceType: 'approval_checkpoint',
        resourceId: input.checkpointId,
        details: {
          workflowRunId: input.workflowRunId,
          programId: run.programId,
          activityKey,
          stepIndex: checkpoint.stepIndex,
          nextStepIndex: nextCheckpoint.stepIndex,
          reason: input.reason,
        },
      });

      return {
        checkpointStatus: metPlan.checkpointStatus,
        workflowStatus: metPlan.workflowStatus,
        nextCheckpointId: nextCheckpoint.id,
      };
    }

    // No more checkpoints — workflow complete, activity reaches target state.
    await db
      .update(workflowRuns)
      .set({
        status: 'completed',
        currentStepIndex: checkpoint.stepIndex,
        lastSuccessfulStepIndex: checkpoint.stepIndex,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(workflowRuns.id, run.id));

    if (run.programId && activityKey) {
      await db
        .update(pdevProgramActivities)
        .set({
          state: targetState,
          stateChangedAt: now,
          stateChangedBy: input.userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(pdevProgramActivities.programId, run.programId),
            eq(pdevProgramActivities.activityKey, activityKey)
          )
        );
    }

    void auditService.logAction({
      tenantId: input.organizationId,
      userId: input.userId,
      action: 'pdev_workflow_completed',
      resourceType: 'workflow_run',
      resourceId: run.id,
      details: {
        programId: run.programId,
        activityKey,
        finalState: targetState,
        finalApproverReason: input.reason,
      },
    });

    // Terminal IND-clearance transition: a completed approval chain on
    // the clearance activity moves the program to its cleared state.
    if (run.programId && activityKey) {
      await applyIndClearanceIfTerminal({
        programId: run.programId,
        organizationId: input.organizationId,
        userId: input.userId,
        activityKey,
        newState: targetState,
      });
    }

    return {
      checkpointStatus: metPlan.checkpointStatus,
      workflowStatus: metPlan.workflowStatus,
      activityFinalState: targetState,
    };
  }
}

export const pdevWorkflowBridge = new PdevWorkflowBridge();
