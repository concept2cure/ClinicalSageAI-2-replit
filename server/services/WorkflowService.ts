/**
 * Workflow Service
 *
 * This service manages workflow templates, workflow instances, and approvals
 * across the unified document system.
 *
 * Performance optimizations:
 * - LRU cache for workflow templates (read-heavy, rarely mutated)
 * - Batch-loaded approvals to eliminate N+1 queries
 */

import { db } from '../db';
import { and, eq, inArray, desc, isNull, ne, or, sql } from 'drizzle-orm';
import {
  workflowTemplates,
  workflowSteps,
  documentWorkflows,
  workflowApprovals,
  workflowHistory,
} from '../../shared/schema/unified_workflow';
import { LRUCache } from '../middleware/enterprise-performance';

// Template cache: templates change infrequently, cache for 5 minutes
const templateCache = new LRUCache<any>({ maxSize: 200, defaultTtl: 5 * 60_000 });

export class WorkflowService {
  constructor(private db: any) {}

  /** Invalidate cached template after mutation */
  private invalidateTemplateCache(templateId: number) {
    templateCache.delete(`template:${templateId}`);
  }

  /**
   * Get workflow templates for a specific module
   *
   * @param moduleType The module type (e.g., '510k', 'cer', 'cmc')
   * @param organizationId The organization ID
   * @returns Array of workflow templates
   */
  async getWorkflowTemplatesByModule(moduleType: any, organizationId: any) {
    return this.db
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.moduleType, moduleType),
          eq(workflowTemplates.organizationId, organizationId),
          eq(workflowTemplates.isActive, true)
        )
      )
      .orderBy(desc(workflowTemplates.updatedAt));
  }

  /**
   * Get a specific workflow template
   *
   * @param templateId The template ID
   * @returns The workflow template
   */
  async getWorkflowTemplate(templateId: number) {
    const cacheKey = `template:${templateId}`;
    const cached = templateCache.get(cacheKey);
    if (cached) return cached;

    const templates = await this.db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, templateId))
      .limit(1);

    if (!templates.length) {
      return null;
    }

    const steps = await this.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.templateId, templateId))
      .orderBy(workflowSteps.order);

    const result = { ...templates[0], steps };
    templateCache.set(cacheKey, result);
    return result;
  }

  /**
   * Create a new workflow template
   *
   * @param moduleType The module type (e.g., '510k', 'cer', 'cmc')
   * @param organizationId The organization ID
   * @param userId The user ID of the creator
   * @param data The template data
   * @returns The created workflow template
   */
  async createWorkflowTemplate(moduleType: any, organizationId: any, userId: any, data: any) {
    return this.db.transaction(async (tx: any) => {
      // Create the template
      const [template] = await tx
        .insert(workflowTemplates)
        .values({
          name: data.name,
          description: data.description,
          moduleType,
          organizationId,
          createdBy: userId,
          isActive: true,
          documentTypes: data.documentTypes || [],
          defaultForTypes: data.defaultForTypes || [],
        })
        .returning();

      // Create the steps
      const steps = await Promise.all(
        data.steps.map(async (step: any, index: number) => {
          const [createdStep] = await tx
            .insert(workflowSteps)
            .values({
              templateId: template.id,
              name: step.name,
              description: step.description,
              order: index + 1,
              approverType: step.approverType,
              approverIds: step.approverIds || [],
              requiredActions: step.requiredActions || [],
            })
            .returning();

          return createdStep;
        })
      );

      return {
        ...template,
        steps,
      };
    });
  }

  /**
   * Get predefined workflow template for a document type
   *
   * @param moduleType The module type (e.g., '510k', 'cer', 'cmc')
   * @param organizationId The organization ID
   * @param userId The user ID
   * @param documentType The document type
   * @returns Predefined workflow template
   */
  async getPredefinedTemplate(
    moduleType: any,
    organizationId: any,
    userId: any,
    documentType: string
  ) {
    return this.db.transaction(async (tx: any) => {
      // Check if there's a default template for this document type
      const defaultTemplates = await tx
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.moduleType, moduleType),
            eq(workflowTemplates.organizationId, organizationId),
            eq(workflowTemplates.isActive, true)
          )
        );

      const matchingTemplate = defaultTemplates.find(
        (t: any) =>
          t.defaultForTypes.includes(documentType) || t.documentTypes.includes(documentType)
      );

      if (matchingTemplate) {
        const steps = await tx
          .select()
          .from(workflowSteps)
          .where(eq(workflowSteps.templateId, matchingTemplate.id))
          .orderBy(workflowSteps.order);

        return {
          ...matchingTemplate,
          steps,
        };
      }

      // If no template exists, create a basic default one
      const defaultTemplateData = {
        name: `Default ${documentType} Workflow`,
        description: `Standard workflow for ${documentType} documents`,
        moduleType,
        documentTypes: [documentType],
        defaultForTypes: [documentType],
        steps: [
          {
            name: 'Initial Review',
            description: 'First level review',
            approverType: 'role',
            approverIds: ['reviewer'],
            requiredActions: ['review', 'comment'],
          },
          {
            name: 'Quality Check',
            description: 'QC verification',
            approverType: 'role',
            approverIds: ['qc_specialist'],
            requiredActions: ['verify', 'comment'],
          },
          {
            name: 'Final Approval',
            description: 'Senior approval',
            approverType: 'role',
            approverIds: ['manager', 'senior_reviewer'],
            requiredActions: ['approve', 'comment'],
          },
        ],
      };

      return this.createWorkflowTemplate(moduleType, organizationId, userId, defaultTemplateData);
    });
  }

  /**
   * Update a workflow template
   *
   * @param templateId The template ID
   * @param data The update data
   * @param userId The user ID making the update
   * @returns The updated template
   */
  async updateWorkflowTemplate(templateId: number, data: any, userId: string) {
    this.invalidateTemplateCache(templateId);
    return this.db.transaction(async (tx: any) => {
      // Update the template
      const [template] = await tx
        .update(workflowTemplates)
        .set({
          name: data.name,
          description: data.description,
          documentTypes: data.documentTypes || [],
          defaultForTypes: data.defaultForTypes || [],
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(workflowTemplates.id, templateId))
        .returning();

      // Handle step updates if provided
      if (data.steps && data.steps.length > 0) {
        // Delete existing steps
        await tx.delete(workflowSteps).where(eq(workflowSteps.templateId, templateId));

        // Create new steps
        const steps = await Promise.all(
          data.steps.map(async (step: any, index: number) => {
            const [createdStep] = await tx
              .insert(workflowSteps)
              .values({
                templateId: template.id,
                name: step.name,
                description: step.description,
                order: index + 1,
                approverType: step.approverType,
                approverIds: step.approverIds || [],
                requiredActions: step.requiredActions || [],
              })
              .returning();

            return createdStep;
          })
        );

        return {
          ...template,
          steps,
        };
      }

      const steps = await tx
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.templateId, templateId))
        .orderBy(workflowSteps.order);

      return {
        ...template,
        steps,
      };
    });
  }

  /**
   * Deactivate a workflow template
   *
   * @param templateId The template ID
   * @param userId The user ID making the update
   * @returns Success status
   */
  async deactivateWorkflowTemplate(templateId: number, userId: string) {
    this.invalidateTemplateCache(templateId);
    await this.db
      .update(workflowTemplates)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(workflowTemplates.id, templateId));

    return { success: true };
  }

  /**
   * Get workflow templates by document type
   *
   * @param moduleType The module type (e.g., '510k', 'cer', 'cmc')
   * @param documentType The document type
   * @param organizationId The organization ID
   * @returns Array of compatible workflow templates
   */
  async getWorkflowTemplatesByDocumentType(
    moduleType: string,
    documentType: string,
    organizationId: string
  ) {
    const templates = await this.db
      .select()
      .from(workflowTemplates)
      .where(
        and(
          // Using the SQL template string syntax to compare the moduleType column with the parameter
          sql`${workflowTemplates.moduleType} = ${moduleType}`,
          eq(workflowTemplates.organizationId, organizationId),
          eq(workflowTemplates.isActive, true)
        )
      );

    return templates.filter(
      (template: any) =>
        template.documentTypes.includes(documentType) || template.documentTypes.length === 0 // Templates with empty documentTypes are applicable to all
    );
  }

  /**
   * Start a workflow for a document
   *
   * @param documentId The document ID
   * @param templateId The template ID
   * @param startedBy The user ID starting the workflow
   * @param metadata Additional metadata
   * @returns The created workflow
   */
  async startWorkflow(documentId: any, templateId: any, startedBy: any, metadata: any = {}) {
    return this.db.transaction(async (tx: any) => {
      // Get the template with steps
      const template = await this.getWorkflowTemplate(templateId);

      if (!template) {
        throw new Error(`Workflow template with ID ${templateId} not found`);
      }

      // Create the workflow
      const [workflow] = await tx
        .insert(documentWorkflows)
        .values({
          documentId,
          templateId,
          status: 'active',
          currentStep: 1,
          startedBy,
          organizationId: template.organizationId,
          metadata: metadata || {},
        })
        .returning();

      // Create the first approval
      const firstStep = template.steps[0];
      const [approval] = await tx
        .insert(workflowApprovals)
        .values({
          workflowId: workflow.id,
          stepId: firstStep.id,
          stepOrder: firstStep.order,
          status: 'pending',
          assignedTo: firstStep.approverIds,
          assignmentType: firstStep.approverType,
          requiredActions: firstStep.requiredActions,
        })
        .returning();

      // Create workflow history entry
      await tx.insert(workflowHistory).values({
        workflowId: workflow.id,
        action: 'workflow_started',
        performedBy: startedBy,
        details: {
          templateName: template.name,
          documentId,
        },
      });

      return {
        ...workflow,
        currentApproval: approval,
        template,
      };
    });
  }

  /**
   * Get approvals for a workflow
   *
   * @param workflowId The workflow ID
   * @returns Array of approvals
   */
  async getWorkflowApprovals(workflowId: number) {
    return this.db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.workflowId, workflowId))
      .orderBy(workflowApprovals.stepOrder);
  }

  /**
   * Approve a workflow step
   *
   * @param approvalId The approval ID
   * @param userId The user ID making the approval
   * @param comments Optional comments
   * @returns The updated workflow
   */
  async approveWorkflowStep(approvalId: any, userId: any, comments: string = '') {
    return this.db.transaction(async (tx: any) => {
      // Get the approval
      const approvals = await tx
        .select()
        .from(workflowApprovals)
        .where(eq(workflowApprovals.id, approvalId))
        .limit(1);

      if (!approvals.length) {
        throw new Error(`Approval with ID ${approvalId} not found`);
      }

      const approval = approvals[0];

      // Check if approval is pending
      if (approval.status !== 'pending') {
        throw new Error(`Approval with ID ${approvalId} is not pending`);
      }

      // Update the approval
      const [updatedApproval] = await tx
        .update(workflowApprovals)
        .set({
          status: 'approved',
          completedBy: userId,
          completedAt: new Date(),
          comments,
        })
        .where(eq(workflowApprovals.id, approvalId))
        .returning();

      // Get the workflow
      const workflows = await tx
        .select()
        .from(documentWorkflows)
        .where(eq(documentWorkflows.id, approval.workflowId))
        .limit(1);

      const workflow = workflows[0];

      // Create workflow history entry
      await tx.insert(workflowHistory).values({
        workflowId: workflow.id,
        action: 'step_approved',
        performedBy: userId,
        details: {
          approvalId,
          stepOrder: approval.stepOrder,
          comments,
        },
      });

      // Get the template to determine next steps
      const template = await this.getWorkflowTemplate(workflow.templateId);

      // Check if this was the last step
      if (approval.stepOrder === template.steps.length) {
        // Complete the workflow
        const [completedWorkflow] = await tx
          .update(documentWorkflows)
          .set({
            status: 'completed',
            completedBy: userId,
            completedAt: new Date(),
          })
          .where(eq(documentWorkflows.id, workflow.id))
          .returning();

        // Create workflow history entry
        await tx.insert(workflowHistory).values({
          workflowId: workflow.id,
          action: 'workflow_completed',
          performedBy: userId,
          details: {
            completedAt: completedWorkflow.completedAt,
          },
        });

        return {
          ...completedWorkflow,
          currentApproval: null,
          isCompleted: true,
        };
      } else {
        // Move to the next step
        const nextStepOrder = approval.stepOrder + 1;
        const nextStep = template.steps.find((s: any) => s.order === nextStepOrder);

        // Create next approval
        const [nextApproval] = await tx
          .insert(workflowApprovals)
          .values({
            workflowId: workflow.id,
            stepId: nextStep.id,
            stepOrder: nextStep.order,
            status: 'pending',
            assignedTo: nextStep.approverIds,
            assignmentType: nextStep.approverType,
            requiredActions: nextStep.requiredActions,
          })
          .returning();

        // Update workflow currentStep
        const [updatedWorkflow] = await tx
          .update(documentWorkflows)
          .set({
            currentStep: nextStepOrder,
          })
          .where(eq(documentWorkflows.id, workflow.id))
          .returning();

        // Create workflow history entry
        await tx.insert(workflowHistory).values({
          workflowId: workflow.id,
          action: 'step_started',
          performedBy: userId,
          details: {
            stepOrder: nextStepOrder,
            approvalId: nextApproval.id,
          },
        });

        return {
          ...updatedWorkflow,
          currentApproval: nextApproval,
          isCompleted: false,
        };
      }
    });
  }

  /**
   * Reject a workflow step
   *
   * @param approvalId The approval ID
   * @param userId The user ID making the rejection
   * @param comments Comments explaining the rejection
   * @returns The updated workflow
   */
  async rejectWorkflowStep(approvalId: any, userId: any, comments: any) {
    return this.db.transaction(async (tx: any) => {
      // Get the approval
      const approvals = await tx
        .select()
        .from(workflowApprovals)
        .where(eq(workflowApprovals.id, approvalId))
        .limit(1);

      if (!approvals.length) {
        throw new Error(`Approval with ID ${approvalId} not found`);
      }

      const approval = approvals[0];

      // Check if approval is pending
      if (approval.status !== 'pending') {
        throw new Error(`Approval with ID ${approvalId} is not pending`);
      }

      // Update the approval
      const [updatedApproval] = await tx
        .update(workflowApprovals)
        .set({
          status: 'rejected',
          completedBy: userId,
          completedAt: new Date(),
          comments,
        })
        .where(eq(workflowApprovals.id, approvalId))
        .returning();

      // Get the workflow
      const workflows = await tx
        .select()
        .from(documentWorkflows)
        .where(eq(documentWorkflows.id, approval.workflowId))
        .limit(1);

      const workflow = workflows[0];

      // Update the workflow status
      const [updatedWorkflow] = await tx
        .update(documentWorkflows)
        .set({
          status: 'rejected',
          rejectedBy: userId,
          rejectedAt: new Date(),
        })
        .where(eq(documentWorkflows.id, workflow.id))
        .returning();

      // Create workflow history entry
      await tx.insert(workflowHistory).values({
        workflowId: workflow.id,
        action: 'step_rejected',
        performedBy: userId,
        details: {
          approvalId,
          stepOrder: approval.stepOrder,
          comments,
        },
      });

      // Create workflow history entry for workflow rejection
      await tx.insert(workflowHistory).values({
        workflowId: workflow.id,
        action: 'workflow_rejected',
        performedBy: userId,
        details: {
          rejectedAt: updatedWorkflow.rejectedAt,
          reason: comments,
        },
      });

      return {
        ...updatedWorkflow,
        currentApproval: updatedApproval,
        isRejected: true,
      };
    });
  }

  /**
   * Get active workflows
   *
   * @param organizationId The organization ID
   * @returns Array of active workflows
   */
  async getActiveWorkflows(organizationId: string) {
    const workflows = await this.db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.status, 'active'),
          eq(documentWorkflows.organizationId, organizationId)
        )
      );

    if (!workflows.length) return [];

    // Batch-load all approvals for these workflows in a single query
    const workflowIds = workflows.map((w: any) => w.id);
    const allApprovals = await this.db
      .select()
      .from(workflowApprovals)
      .where(inArray(workflowApprovals.workflowId, workflowIds))
      .orderBy(workflowApprovals.stepOrder);

    // Group approvals by workflow ID
    const approvalsByWorkflow = new Map<number, any[]>();
    for (const approval of allApprovals) {
      const existing = approvalsByWorkflow.get(approval.workflowId) || [];
      existing.push(approval);
      approvalsByWorkflow.set(approval.workflowId, existing);
    }

    // Templates are cached, so parallel fetches are fast (cache hits)
    const uniqueTemplateIds = [...new Set(workflows.map((w: any) => w.templateId))];
    const templateMap = new Map<number, any>();
    await Promise.all(
      uniqueTemplateIds.map(async (tid: number) => {
        const template = await this.getWorkflowTemplate(tid);
        if (template) templateMap.set(tid, template);
      })
    );

    return workflows.map((workflow: any) => {
      const approvals = approvalsByWorkflow.get(workflow.id) || [];
      const pendingApproval = approvals.find((a: any) => a.status === 'pending');
      const template = templateMap.get(workflow.templateId);

      return {
        ...workflow,
        currentApproval: pendingApproval,
        template,
        approvals,
      };
    });
  }

  /**
   * Get completed workflows
   *
   * @param organizationId The organization ID
   * @returns Array of completed workflows
   */
  async getCompletedWorkflows(organizationId: string) {
    const workflows = await this.db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.status, 'completed'),
          eq(documentWorkflows.organizationId, organizationId)
        )
      )
      .orderBy(desc(documentWorkflows.completedAt));

    if (!workflows.length) return [];

    // Batch-load all approvals in a single query
    const workflowIds = workflows.map((w: any) => w.id);
    const allApprovals = await this.db
      .select()
      .from(workflowApprovals)
      .where(inArray(workflowApprovals.workflowId, workflowIds))
      .orderBy(workflowApprovals.stepOrder);

    const approvalsByWorkflow = new Map<number, any[]>();
    for (const approval of allApprovals) {
      const existing = approvalsByWorkflow.get(approval.workflowId) || [];
      existing.push(approval);
      approvalsByWorkflow.set(approval.workflowId, existing);
    }

    // Templates are cached via LRU
    const uniqueTemplateIds = [...new Set(workflows.map((w: any) => w.templateId))];
    const templateMap = new Map<number, any>();
    await Promise.all(
      uniqueTemplateIds.map(async (tid: number) => {
        const template = await this.getWorkflowTemplate(tid);
        if (template) templateMap.set(tid, template);
      })
    );

    return workflows.map((workflow: any) => ({
      ...workflow,
      template: templateMap.get(workflow.templateId),
      approvals: approvalsByWorkflow.get(workflow.id) || [],
    }));
  }

  /**
   * Get workflows pending approval for a user
   *
   * @param organizationId The organization ID
   * @param userId The user ID
   * @returns Array of workflows pending approval
   */
  async getPendingApprovals(organizationId: string, userId: string) {
    // Get all active workflows for the organization
    const workflows = await this.db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.status, 'active'),
          eq(documentWorkflows.organizationId, organizationId)
        )
      );

    if (!workflows.length) {
      return [];
    }

    const workflowIds = workflows.map((w: any) => w.id);

    // Get pending approvals across all workflows
    const approvals = await this.db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          inArray(workflowApprovals.workflowId, workflowIds),
          eq(workflowApprovals.status, 'pending')
        )
      );

    // Filter for approvals relevant to this user
    const userApprovals = approvals.filter((approval: any) => {
      // Direct assignment
      if (approval.assignedTo.includes(userId)) {
        return true;
      }

      // Role-based assignment (would need integration with a role service)
      // For simplicity, we'll assume the user has the roles in assignedTo if assignmentType is 'role'
      if (approval.assignmentType === 'role') {
        return true; // In a real app, check user roles against approval.assignedTo
      }

      return false;
    });

    if (!userApprovals.length) {
      return [];
    }

    // Get full workflow details for these approvals
    return Promise.all(
      userApprovals.map(async (approval: any) => {
        const workflow = workflows.find((w: any) => w.id === approval.workflowId);
        const template = await this.getWorkflowTemplate(workflow.templateId);
        const step = template.steps.find((s: any) => s.id === approval.stepId);

        return {
          workflow,
          approval,
          template,
          step,
        };
      })
    );
  }

  /**
   * Get workflow history
   *
   * @param workflowId The workflow ID
   * @returns Array of history events
   */
  async getWorkflowHistory(workflowId: number) {
    return this.db
      .select()
      .from(workflowHistory)
      .where(eq(workflowHistory.workflowId, workflowId))
      .orderBy(desc(workflowHistory.createdAt));
  }

  /**
   * Get active workflow for a document
   *
   * @param documentId The document ID
   * @returns Active workflow or null
   */
  async getDocumentWorkflow(documentId: number) {
    try {
      // First try to find a workflow with this document ID
      const workflow = await this.db
        .select()
        .from(documentWorkflows)
        .where(
          and(
            eq(documentWorkflows.documentId, documentId),
            isNull(documentWorkflows.completedAt),
            isNull(documentWorkflows.rejectedAt)
          )
        )
        .limit(1);

      if (!workflow || workflow.length === 0) {
        return null;
      }

      // Get workflow with template and steps
      const workflowWithDetails = await this.db.query.documentWorkflows.findFirst({
        where: eq(documentWorkflows.id, workflow[0].id),
        with: {
          template: true,
          steps: {
            orderBy: [{ orderIndex: 'asc' }],
          },
        },
      });

      return workflowWithDetails;
    } catch (error) {
      console.error('Error getting document workflow:', error);
      return null;
    }
  }

  /**
   * Add workflow history entry
   *
   * @param workflowId The workflow ID
   * @param actionType The type of action
   * @param performedBy ID or name of who performed the action
   * @param metadata Additional metadata for the entry
   * @returns Created workflow history entry
   */
  async addWorkflowHistoryEntry(
    workflowId: number,
    actionType: string,
    performedBy: string,
    metadata: Record<string, any> = {}
  ) {
    try {
      const entry = await this.db
        .insert(workflowHistory)
        .values({
          workflowId,
          action: actionType,
          performedBy,
          details: metadata,
          createdAt: new Date(),
        })
        .returning();

      return entry[0];
    } catch (error) {
      console.error('Error adding workflow history entry:', error);
      throw new Error(
        `Failed to add workflow history entry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
