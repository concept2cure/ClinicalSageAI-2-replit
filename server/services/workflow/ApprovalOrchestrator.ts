/**
 * Approval Workflow Orchestrator
 *
 * Manages the complete lifecycle of approval workflows:
 * - Start workflows on documents/tasks
 * - Route approvals to assignees (serial/parallel)
 * - Handle approve/reject/delegate actions
 * - Advance workflow to next step on approval
 * - Generate audit trail entries
 * - Trigger notifications on state changes
 *
 * @module server/services/workflow/ApprovalOrchestrator
 */

import { db } from '../../db';
import { eq, and, inArray } from 'drizzle-orm';
import {
  documentWorkflows,
  workflowApprovals,
  workflowSteps,
  workflowTemplates,
  workflowHistory,
  unifiedDocuments,
  documentAuditLogs,
} from '../../../shared/schema/unified_workflow';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface StartWorkflowParams {
  documentId: number;
  templateId: number;
  startedBy: string;
  organizationId: string | number;
  metadata?: Record<string, unknown>;
}

export interface ApprovalActionParams {
  approvalId: number;
  action: 'approve' | 'reject';
  performedBy: string;
  comments?: string;
}

export interface DelegateParams {
  approvalId: number;
  delegatedBy: string;
  delegateTo: string;
  reason?: string;
}

export interface WorkflowStatus {
  workflowId: number;
  documentId: number;
  status: string;
  currentStep: number;
  totalSteps: number;
  approvals: Array<{
    id: number;
    stepName: string;
    stepOrder: number;
    status: string;
    assignedTo: string[];
    completedBy: string | null;
    completedAt: Date | null;
    comments: string | null;
  }>;
  history: Array<{
    action: string;
    performedBy: string;
    createdAt: Date;
    details: Record<string, unknown>;
  }>;
}

export interface PendingApproval {
  approvalId: number;
  workflowId: number;
  documentId: number;
  documentTitle: string;
  stepName: string;
  stepOrder: number;
  assignedTo: string[];
  requiredActions: string[];
  workflowStartedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class ApprovalOrchestrator {
  /**
   * Start a new approval workflow on a document.
   * Creates workflow instance + approval records for each step.
   */
  async startWorkflow(params: StartWorkflowParams): Promise<{
    workflowId: number;
    approvals: number[];
  }> {
    const { documentId, templateId, startedBy, organizationId, metadata } = params;

    // Get template steps
    const steps = await db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.templateId, templateId))
      .orderBy(workflowSteps.order);

    if (steps.length === 0) {
      throw new Error(`Template ${templateId} has no steps defined`);
    }

    // Create workflow instance
    const [workflow] = await db
      .insert(documentWorkflows)
      .values({
        documentId,
        templateId,
        status: 'active',
        currentStep: 1,
        startedBy,
        organizationId: typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId,
        metadata: metadata || {},
      })
      .returning();

    // Create approval records for each step
    const approvalIds: number[] = [];
    for (const step of steps) {
      const [approval] = await db
        .insert(workflowApprovals)
        .values({
          workflowId: workflow.id,
          stepId: step.id,
          stepOrder: step.order,
          status: step.order === 1 ? 'pending' : 'pending',
          assignedTo: step.approverIds,
          assignmentType: step.approverType,
          requiredActions: step.requiredActions,
        })
        .returning();
      approvalIds.push(approval.id);
    }

    // Update document status to in_review
    await db
      .update(unifiedDocuments)
      .set({ status: 'in_review', updatedBy: startedBy, updatedAt: new Date() })
      .where(eq(unifiedDocuments.id, documentId));

    // Audit trail
    await this.recordHistory(workflow.id, 'workflow_started', startedBy, {
      templateId,
      totalSteps: steps.length,
      firstStepApprovers: steps[0].approverIds,
    });

    await this.recordAudit(documentId, 'workflow_started', startedBy, {
      workflowId: workflow.id,
      templateId,
    });

    return { workflowId: workflow.id, approvals: approvalIds };
  }

  /**
   * Process an approval action (approve or reject).
   * On approval: advances to next step or completes workflow.
   * On rejection: rejects the entire workflow.
   */
  async processApproval(params: ApprovalActionParams): Promise<{
    status: string;
    workflowAdvanced: boolean;
    workflowCompleted: boolean;
    workflowRejected: boolean;
    nextStep?: number;
  }> {
    const { approvalId, action, performedBy, comments } = params;

    // Get the approval record
    const [approval] = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.id, approvalId));

    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval ${approvalId} is already ${approval.status}`);
    }

    // Verify the performer is in the assigned approvers
    if (!approval.assignedTo.includes(performedBy) && !approval.assignedTo.includes('*')) {
      throw new Error(`User ${performedBy} is not assigned to this approval`);
    }

    // Get the workflow
    const [workflow] = await db
      .select()
      .from(documentWorkflows)
      .where(eq(documentWorkflows.id, approval.workflowId));

    if (!workflow || workflow.status !== 'active') {
      throw new Error('Workflow is not active');
    }

    if (action === 'reject') {
      return this.rejectWorkflow(workflow, approval, performedBy, comments);
    }

    // Approve this step
    await db
      .update(workflowApprovals)
      .set({
        status: 'approved',
        completedBy: performedBy,
        completedAt: new Date(),
        comments: comments || null,
      })
      .where(eq(workflowApprovals.id, approvalId));

    await this.recordHistory(workflow.id, 'step_approved', performedBy, {
      approvalId,
      stepOrder: approval.stepOrder,
      comments,
    });

    // Check if there are more steps
    const allApprovals = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.workflowId, workflow.id))
      .orderBy(workflowApprovals.stepOrder);

    const nextPending = allApprovals.find(
      a => a.stepOrder > approval.stepOrder && a.status === 'pending',
    );

    if (nextPending) {
      // Advance to next step
      await db
        .update(documentWorkflows)
        .set({ currentStep: nextPending.stepOrder })
        .where(eq(documentWorkflows.id, workflow.id));

      await this.recordHistory(workflow.id, 'step_advanced', performedBy, {
        fromStep: approval.stepOrder,
        toStep: nextPending.stepOrder,
      });

      return {
        status: 'approved',
        workflowAdvanced: true,
        workflowCompleted: false,
        workflowRejected: false,
        nextStep: nextPending.stepOrder,
      };
    }

    // All steps approved — complete the workflow
    await db
      .update(documentWorkflows)
      .set({
        status: 'completed',
        completedBy: performedBy,
        completedAt: new Date(),
      })
      .where(eq(documentWorkflows.id, workflow.id));

    // Update document status to approved
    await db
      .update(unifiedDocuments)
      .set({ status: 'approved', updatedBy: performedBy, updatedAt: new Date() })
      .where(eq(unifiedDocuments.id, workflow.documentId));

    await this.recordHistory(workflow.id, 'workflow_completed', performedBy, {
      totalSteps: allApprovals.length,
    });

    await this.recordAudit(workflow.documentId, 'document_approved', performedBy, {
      workflowId: workflow.id,
    });

    return {
      status: 'approved',
      workflowAdvanced: false,
      workflowCompleted: true,
      workflowRejected: false,
    };
  }

  /**
   * Reject the entire workflow at the current step.
   */
  private async rejectWorkflow(
    workflow: typeof documentWorkflows.$inferSelect,
    approval: typeof workflowApprovals.$inferSelect,
    performedBy: string,
    comments?: string,
  ) {
    // Reject this approval
    await db
      .update(workflowApprovals)
      .set({
        status: 'rejected',
        completedBy: performedBy,
        completedAt: new Date(),
        comments: comments || null,
      })
      .where(eq(workflowApprovals.id, approval.id));

    // Reject the workflow
    await db
      .update(documentWorkflows)
      .set({
        status: 'rejected',
        rejectedBy: performedBy,
        rejectedAt: new Date(),
      })
      .where(eq(documentWorkflows.id, workflow.id));

    // Update document status back to draft
    await db
      .update(unifiedDocuments)
      .set({ status: 'rejected', updatedBy: performedBy, updatedAt: new Date() })
      .where(eq(unifiedDocuments.id, workflow.documentId));

    await this.recordHistory(workflow.id, 'workflow_rejected', performedBy, {
      rejectedAtStep: approval.stepOrder,
      comments,
    });

    await this.recordAudit(workflow.documentId, 'document_rejected', performedBy, {
      workflowId: workflow.id,
      reason: comments,
    });

    return {
      status: 'rejected',
      workflowAdvanced: false,
      workflowCompleted: false,
      workflowRejected: true,
    };
  }

  /**
   * Delegate an approval to another user.
   */
  async delegateApproval(params: DelegateParams): Promise<void> {
    const { approvalId, delegatedBy, delegateTo, reason } = params;

    const [approval] = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.id, approvalId));

    if (!approval) throw new Error(`Approval ${approvalId} not found`);
    if (approval.status !== 'pending') throw new Error('Can only delegate pending approvals');

    // Replace delegator with delegate in the assigned list
    const newAssignees = approval.assignedTo
      .filter(id => id !== delegatedBy)
      .concat(delegateTo);

    await db
      .update(workflowApprovals)
      .set({ assignedTo: newAssignees })
      .where(eq(workflowApprovals.id, approvalId));

    await this.recordHistory(approval.workflowId, 'approval_delegated', delegatedBy, {
      approvalId,
      delegatedTo: delegateTo,
      reason,
    });
  }

  /**
   * Get all pending approvals for a user across all workflows.
   */
  async getPendingApprovals(
    userId: string,
    organizationId: string | number,
  ): Promise<PendingApproval[]> {
    // Get all active workflows for the org
    const activeWorkflows = await db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.organizationId, typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId),
          eq(documentWorkflows.status, 'active'),
        ),
      );

    if (activeWorkflows.length === 0) return [];

    const workflowIds = activeWorkflows.map(w => w.id);

    // Get pending approvals assigned to this user
    const pendingApprovals = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          inArray(workflowApprovals.workflowId, workflowIds),
          eq(workflowApprovals.status, 'pending'),
        ),
      );

    // Filter to approvals assigned to this user
    const userApprovals = pendingApprovals.filter(
      a => a.assignedTo.includes(userId) || a.assignedTo.includes('*'),
    );

    if (userApprovals.length === 0) return [];

    // Enrich with document titles and step names
    const results: PendingApproval[] = [];
    for (const approval of userApprovals) {
      const wf = activeWorkflows.find(w => w.id === approval.workflowId);
      if (!wf) continue;

      // Get document title
      const [doc] = await db
        .select({ title: unifiedDocuments.title })
        .from(unifiedDocuments)
        .where(eq(unifiedDocuments.id, wf.documentId));

      // Get step name
      const [step] = await db
        .select({ name: workflowSteps.name })
        .from(workflowSteps)
        .where(eq(workflowSteps.id, approval.stepId));

      results.push({
        approvalId: approval.id,
        workflowId: approval.workflowId,
        documentId: wf.documentId,
        documentTitle: doc?.title || 'Untitled',
        stepName: step?.name || `Step ${approval.stepOrder}`,
        stepOrder: approval.stepOrder,
        assignedTo: approval.assignedTo,
        requiredActions: approval.requiredActions,
        workflowStartedAt: wf.startedAt,
      });
    }

    return results;
  }

  /**
   * Get full workflow status with all approvals and history.
   */
  async getWorkflowStatus(workflowId: number): Promise<WorkflowStatus | null> {
    const [workflow] = await db
      .select()
      .from(documentWorkflows)
      .where(eq(documentWorkflows.id, workflowId));

    if (!workflow) return null;

    // Get all approvals with step names
    const approvals = await db
      .select({
        id: workflowApprovals.id,
        stepOrder: workflowApprovals.stepOrder,
        status: workflowApprovals.status,
        assignedTo: workflowApprovals.assignedTo,
        completedBy: workflowApprovals.completedBy,
        completedAt: workflowApprovals.completedAt,
        comments: workflowApprovals.comments,
        stepName: workflowSteps.name,
      })
      .from(workflowApprovals)
      .leftJoin(workflowSteps, eq(workflowApprovals.stepId, workflowSteps.id))
      .where(eq(workflowApprovals.workflowId, workflowId))
      .orderBy(workflowApprovals.stepOrder);

    // Get history
    const history = await db
      .select()
      .from(workflowHistory)
      .where(eq(workflowHistory.workflowId, workflowId))
      .orderBy(workflowHistory.createdAt);

    // Count total steps
    const totalSteps = approvals.length;

    return {
      workflowId: workflow.id,
      documentId: workflow.documentId,
      status: workflow.status,
      currentStep: workflow.currentStep,
      totalSteps,
      approvals: approvals.map(a => ({
        id: a.id,
        stepName: a.stepName || `Step ${a.stepOrder}`,
        stepOrder: a.stepOrder,
        status: a.status,
        assignedTo: a.assignedTo,
        completedBy: a.completedBy,
        completedAt: a.completedAt,
        comments: a.comments,
      })),
      history: history.map(h => ({
        action: h.action,
        performedBy: h.performedBy,
        createdAt: h.createdAt,
        details: h.details as Record<string, unknown>,
      })),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async recordHistory(
    workflowId: number,
    action: string,
    performedBy: string,
    details: Record<string, unknown>,
  ) {
    await db.insert(workflowHistory).values({
      workflowId,
      action,
      performedBy,
      details,
    });
  }

  private async recordAudit(
    documentId: number,
    action: string,
    performedBy: string,
    details: Record<string, unknown>,
  ) {
    await db.insert(documentAuditLogs).values({
      documentId,
      action,
      performedBy,
      details,
    });
  }
}

// Singleton
export const approvalOrchestrator = new ApprovalOrchestrator();
