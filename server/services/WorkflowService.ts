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

/**
 * Template cache: templates change infrequently, cache for 5 minutes.
 *
 * The key carries the ORGANIZATION as well as the template id, and every read
 * that populates it is org-filtered. Both halves are load-bearing.
 *
 * `workflow_templates` and `document_workflows` are not RLS-protected — the
 * 20260206 orchestration migration enables row-level security on
 * `orchestration.workflow_runs`/`step_runs`/`step_run_events` only, and these
 * are the unrelated `public` tables from shared/schema/unified_workflow.ts.
 * Tenant isolation on this family is therefore whatever the query says, and
 * `getWorkflowTemplate` said nothing: it looked a template up by primary key
 * alone, so any authenticated caller could read any organization's template —
 * name, description, and the full step list with its approver ids.
 *
 * The process-global cache in front of it was a second, independent leak of the
 * same shape as the Nano Banana response cache: a row fetched for organization
 * A was stored under `template:<id>` and served to organization B on the next
 * request. A cache in front of a filtered query still hands one tenant another
 * tenant's row unless the key says whose row it is — which is why this is fixed
 * here and not left to the database.
 */
const templateCache = new LRUCache<any>({ maxSize: 200, defaultTtl: 5 * 60_000 });

/**
 * Coerce an organization id to the positive integer the schema stores, or null
 * when it cannot be trusted. Callers treat null as "no access", never as
 * "unscoped" — an unresolvable tenant must not fall through to a shared key or
 * an unfiltered query.
 */
function normalizeOrgId(organizationId: unknown): number | null {
  if (organizationId === null || organizationId === undefined) return null;
  const raw = typeof organizationId === 'number' ? organizationId : String(organizationId).trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export class WorkflowService {
  constructor(private db: any) {}

  /** Invalidate the cached template after a mutation, for one organization. */
  private invalidateTemplateCache(templateId: number, organizationId: unknown) {
    const orgId = normalizeOrgId(organizationId);
    if (orgId === null) return;
    templateCache.delete(`template:${orgId}:${templateId}`);
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
   * Get a specific workflow template, scoped to one organization.
   *
   * Returns null for a template that belongs to another organization, which is
   * the same answer callers already handle for a template that does not exist —
   * a caller must not be able to tell those two cases apart.
   *
   * @param templateId The template ID
   * @param organizationId The caller's organization ID (required)
   * @returns The workflow template, or null
   */
  async getWorkflowTemplate(templateId: number, organizationId: unknown) {
    const orgId = normalizeOrgId(organizationId);
    // Fail closed. Without a tenant there is no scoped key to read and no
    // filter to apply, so there is no safe query to run.
    if (orgId === null) return null;

    const cacheKey = `template:${orgId}:${templateId}`;
    const cached = templateCache.get(cacheKey);
    if (cached) return cached;

    const templates = await this.db
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.id, templateId),
          eq(workflowTemplates.organizationId, orgId)
        )
      )
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
  async updateWorkflowTemplate(
    templateId: number,
    data: any,
    userId: string,
    organizationId: unknown
  ) {
    const orgId = normalizeOrgId(organizationId);
    if (orgId === null) {
      throw new Error('updateWorkflowTemplate requires an organization context');
    }
    this.invalidateTemplateCache(templateId, orgId);
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
        .where(
          and(
            eq(workflowTemplates.id, templateId),
            eq(workflowTemplates.organizationId, orgId)
          )
        )
        .returning();

      // No row matched the id AND the organization: the template is another
      // tenant's, or gone. Either way there is nothing here to edit, and the
      // step rewrite below must not run against a foreign template.
      if (!template) {
        return null;
      }

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
  async deactivateWorkflowTemplate(
    templateId: number,
    userId: string,
    organizationId: unknown
  ) {
    const orgId = normalizeOrgId(organizationId);
    if (orgId === null) {
      throw new Error('deactivateWorkflowTemplate requires an organization context');
    }
    this.invalidateTemplateCache(templateId, orgId);
    await this.db
      .update(workflowTemplates)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(workflowTemplates.id, templateId),
          eq(workflowTemplates.organizationId, orgId)
        )
      );

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
          eq(workflowTemplates.organizationId, Number(organizationId)),
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
   * The organization is an explicit parameter rather than a field read back off
   * the template. It used to be `organizationId: template.organizationId` — the
   * template was fetched by id with no tenant filter, so a caller in one
   * organization could name another organization's template and have the new
   * `document_workflows` row stamped with THAT organization. The tenant of a
   * record must come from the caller's verified identity, never from a row the
   * caller chose. (The scoped lookup below now also makes the two agree, which
   * is the point: they must not be able to differ.)
   *
   * @param documentId The document ID
   * @param templateId The template ID
   * @param startedBy The user ID starting the workflow
   * @param organizationId The caller's organization ID (required)
   * @param metadata Additional metadata
   * @returns The created workflow
   */
  async startWorkflow(
    documentId: any,
    templateId: any,
    startedBy: any,
    organizationId: unknown,
    metadata: any = {}
  ) {
    const orgId = normalizeOrgId(organizationId);
    if (orgId === null) {
      throw new Error('startWorkflow requires an organization context');
    }
    return this.db.transaction(async (tx: any) => {
      // Get the template with steps, scoped to the caller's organization.
      const template = await this.getWorkflowTemplate(templateId, orgId);

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
          organizationId: orgId,
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

      // Get the template to determine next steps. The organization comes from
      // the workflow row being approved, so the lookup stays inside the tenant
      // that owns the workflow.
      const template = await this.getWorkflowTemplate(
        workflow.templateId,
        workflow.organizationId
      );

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
  async getActiveWorkflows(organizationId: string, page = 1, pageSize = 50) {
    const workflows = await this.db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.status, 'active'),
          eq(documentWorkflows.organizationId, Number(organizationId))
        )
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);

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
    const uniqueTemplateIds: number[] = [
      ...new Set<number>(workflows.map((w: any) => w.templateId as number)),
    ];
    const templateMap = new Map<number, any>();
    await Promise.all(
      uniqueTemplateIds.map(async (tid: number) => {
        // organizationId is this method's own scoped parameter — the same one
        // the workflow query above filters on.
        const template = await this.getWorkflowTemplate(tid, organizationId);
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
  async getCompletedWorkflows(organizationId: string, page = 1, pageSize = 50) {
    const workflows = await this.db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.status, 'completed'),
          eq(documentWorkflows.organizationId, Number(organizationId))
        )
      )
      .orderBy(desc(documentWorkflows.completedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

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
    const uniqueTemplateIds: number[] = [
      ...new Set<number>(workflows.map((w: any) => w.templateId as number)),
    ];
    const templateMap = new Map<number, any>();
    await Promise.all(
      uniqueTemplateIds.map(async (tid: number) => {
        // organizationId is this method's own scoped parameter — the same one
        // the workflow query above filters on.
        const template = await this.getWorkflowTemplate(tid, organizationId);
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
          eq(documentWorkflows.organizationId, Number(organizationId))
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
        const template = await this.getWorkflowTemplate(
          workflow.templateId,
          organizationId
        );
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
