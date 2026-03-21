/**
 * Workflow Orchestrator — Phase 3
 *
 * Controls multi-step AI workflow execution on top of the Phase 1 action system.
 * Each workflow:
 * 1. Inspects project/module/document state (cross-object resolver)
 * 2. Determines missing or weak areas
 * 3. Runs relevant actions in sequence via the AI action dispatcher
 * 4. Tracks execution state (resumable, auditable)
 * 5. Stops safely on validation/permission failures
 * 6. Returns structured progress, results, blockers, and next steps
 *
 * Governance: permission-aware, tenant-scoped, auditable, failure-safe.
 */

import { generateUUID } from '../../utils/id-generator';
import { dispatchAction } from '../ai-actions/action-registry';
import type { DispatchOptions } from '../ai-actions/action-registry';
import { assembleCrossObjectPayload } from './cross-object-resolver';
import type {
  WorkflowTemplateId,
  WorkflowTemplate,
  WorkflowExecution,
  WorkflowExecutionRequest,
  WorkflowExecutionStatus,
  WorkflowStepExecution,
  WorkflowResult,
  WorkflowBlocker,
  WorkflowAuditEntry,
  CrossObjectReasoningPayload,
} from '../../../shared/types/orchestration';
import type { AIActionRequest, AIActionResponse } from '../../../shared/types/ai-actions';

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

const templates = new Map<WorkflowTemplateId, WorkflowTemplate>();

export function registerWorkflowTemplate(template: WorkflowTemplate): void {
  templates.set(template.templateId, template);
  console.log(`[Orchestrator] Registered workflow template: ${template.templateId}`);
}

export function getWorkflowTemplate(id: WorkflowTemplateId): WorkflowTemplate | undefined {
  return templates.get(id);
}

export function getRegisteredTemplates(): WorkflowTemplate[] {
  return Array.from(templates.values());
}

// ---------------------------------------------------------------------------
// Execution State Store (in-memory — production would use DB)
// ---------------------------------------------------------------------------

const executions = new Map<string, WorkflowExecution>();

export function getWorkflowExecution(executionId: string): WorkflowExecution | undefined {
  return executions.get(executionId);
}

export function getProjectWorkflows(
  orgId: number,
  projectId: number
): WorkflowExecution[] {
  return Array.from(executions.values()).filter(
    (e) => e.organizationId === orgId && e.projectId === projectId
  );
}

// ---------------------------------------------------------------------------
// Workflow Executor
// ---------------------------------------------------------------------------

/**
 * Start and execute a workflow from a template.
 * Runs steps sequentially, stopping on failure if configured.
 */
export async function executeWorkflow(
  request: WorkflowExecutionRequest
): Promise<WorkflowExecution> {
  const template = templates.get(request.templateId);
  if (!template) {
    throw new Error(`Unknown workflow template: ${request.templateId}`);
  }

  const executionId = generateUUID();
  const now = new Date().toISOString();

  // Initialize execution state
  const execution: WorkflowExecution = {
    executionId,
    templateId: request.templateId,
    status: 'running',
    projectId: request.projectId,
    organizationId: request.organizationId,
    module: request.module,
    steps: template.steps.map((s) => ({
      stepId: s.stepId,
      name: s.name,
      status: 'pending',
    })),
    currentStepIndex: 0,
    progressPercent: 0,
    startedAt: now,
    requestedBy: {
      userId: request.requestedBy.userId,
      userName: request.requestedBy.userName,
    },
    auditTrail: [
      {
        timestamp: now,
        action: 'workflow_started',
        detail: `Started workflow: ${template.name}`,
        userId: request.requestedBy.userId,
      },
    ],
  };

  executions.set(executionId, execution);

  // Build dispatch options for AI actions
  const dispatchOptions: DispatchOptions = {
    ipAddress: '127.0.0.1',
    user: request.requestedBy,
  };

  // Assemble cross-object context once (reused by steps)
  let crossObjectPayload;
  try {
    crossObjectPayload = await assembleCrossObjectPayload({
      organizationId: request.organizationId,
      projectId: request.projectId,
      module: request.module,
    });
  } catch (err) {
    execution.status = 'failed';
    execution.completedAt = new Date().toISOString();
    addAuditEntry(execution, 'context_assembly_failed', `Failed to assemble project context: ${(err as Error).message}`, request.requestedBy.userId);
    return execution;
  }

  // Execute steps sequentially
  const stepResults: Record<string, unknown>[] = [];
  const allBlockers: WorkflowBlocker[] = [];

  for (let i = 0; i < template.steps.length; i++) {
    const stepDef = template.steps[i];
    const stepExec = execution.steps[i];
    execution.currentStepIndex = i;

    // Update progress
    execution.progressPercent = Math.round((i / template.steps.length) * 100);

    // Start step
    stepExec.status = 'running';
    stepExec.startedAt = new Date().toISOString();
    addAuditEntry(execution, 'step_started', `Step ${i + 1}: ${stepDef.name}`, request.requestedBy.userId, stepDef.stepId);

    try {
      // Execute based on action type
      let stepResult: Record<string, unknown>;

      if (stepDef.actionType === 'orchestrator_logic') {
        // Internal orchestration step — execute the template's custom logic
        stepResult = await executeOrchestratorStep(
          stepDef.stepId,
          request,
          crossObjectPayload,
          stepResults,
          allBlockers
        );
      } else {
        // Dispatch to the AI action system
        const actionRequest: AIActionRequest = {
          actionType: stepDef.actionType,
          targetType: request.targetType || 'project',
          targetId: request.targetId || request.projectId,
          projectId: request.projectId,
          module: request.module,
          context: {
            ...request.context,
            workflowExecutionId: executionId,
            workflowStep: stepDef.stepId,
          },
          payload: {
            crossObjectPayload: crossObjectPayload,
            previousStepResults: stepResults,
            ...(request.context || {}),
          },
          sourceSurface: 'workflow_trigger',
        };

        const actionResponse = await dispatchAction(actionRequest, dispatchOptions);
        stepExec.actionId = actionResponse.provenance.actionId;

        stepResult = {
          success: actionResponse.success,
          result: actionResponse.result,
          createdObjects: actionResponse.createdObjects,
          updatedObjects: actionResponse.updatedObjects,
          warnings: actionResponse.warnings,
          errors: actionResponse.errors,
        };

        if (!actionResponse.success) {
          stepExec.errors = actionResponse.errors.map((e) => ({
            code: e.code,
            message: e.message,
          }));
          if (stepDef.stopOnFailure) {
            stepExec.status = 'failed';
            stepExec.completedAt = new Date().toISOString();
            execution.status = 'failed';
            addAuditEntry(execution, 'step_failed', `Step failed: ${actionResponse.errors.map((e) => e.message).join('; ')}`, request.requestedBy.userId, stepDef.stepId);
            break;
          }
        }

        stepExec.warnings = actionResponse.warnings;
      }

      stepResults.push(stepResult);
      stepExec.result = stepResult;
      stepExec.status = 'completed';
      stepExec.completedAt = new Date().toISOString();
      stepExec.durationMs = Date.now() - new Date(stepExec.startedAt!).getTime();

      addAuditEntry(execution, 'step_completed', `Step completed: ${stepDef.name}`, request.requestedBy.userId, stepDef.stepId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      stepExec.status = 'failed';
      stepExec.completedAt = new Date().toISOString();
      stepExec.errors = [{ code: 'STEP_ERROR', message: errMsg }];
      addAuditEntry(execution, 'step_error', `Step error: ${errMsg}`, request.requestedBy.userId, stepDef.stepId);

      if (stepDef.stopOnFailure) {
        execution.status = 'failed';
        break;
      }
    }
  }

  // Finalize execution
  if (execution.status !== 'failed') {
    execution.status = 'completed';
    execution.progressPercent = 100;
  }
  execution.completedAt = new Date().toISOString();
  execution.totalDurationMs = Date.now() - new Date(execution.startedAt).getTime();

  // Aggregate results
  execution.result = await aggregateResults(execution, stepResults, allBlockers, crossObjectPayload);

  addAuditEntry(
    execution,
    execution.status === 'completed' ? 'workflow_completed' : 'workflow_failed',
    `Workflow ${execution.status}: ${execution.result?.summary || ''}`,
    request.requestedBy.userId
  );

  return execution;
}

// ---------------------------------------------------------------------------
// Orchestrator Step Logic
// ---------------------------------------------------------------------------

/**
 * Execute internal orchestrator logic (non-AI-action steps).
 * These are the "glue" steps that do reasoning, aggregation, etc.
 */
async function executeOrchestratorStep(
  stepId: string,
  request: WorkflowExecutionRequest,
  crossObjectPayload: CrossObjectReasoningPayload,
  previousResults: Record<string, unknown>[],
  blockers: WorkflowBlocker[]
): Promise<Record<string, unknown>> {
  // Import engines dynamically to avoid circular deps
  const { computeReadinessAssessment } = await import('./readiness-engine');
  const { generateRecommendations } = await import('./recommendation-engine');

  switch (stepId) {
    case 'inspect_project_state':
    case 'inspect_state': {
      return {
        projectName: crossObjectPayload.project.name,
        projectStatus: crossObjectPayload.project.status,
        projectProgress: crossObjectPayload.project.progress,
        documentCount: crossObjectPayload.documents.length,
        artifactCount: crossObjectPayload.artifacts.length,
        validationCount: crossObjectPayload.validations.length,
        taskCount: crossObjectPayload.tasks.length,
        moduleCount: crossObjectPayload.moduleMap.length,
      };
    }

    case 'inventory_documents': {
      return {
        total: crossObjectPayload.documents.length,
        byStatus: groupBy(crossObjectPayload.documents, 'status'),
        unrouted: crossObjectPayload.documents.filter((d: any) => !d.isRouted).length,
        unvalidated: crossObjectPayload.documents.filter((d: any) => !d.hasValidation).length,
      };
    }

    case 'identify_gaps': {
      const assessment = computeReadinessAssessment(crossObjectPayload);
      for (const b of assessment.blockers) {
        blockers.push({
          severity: b.severity,
          category: b.category,
          message: b.message,
          targetType: b.targetType,
          targetId: b.targetId,
          suggestedAction: b.suggestedResolution,
        });
      }
      return {
        overallScore: assessment.overallScore,
        status: assessment.status,
        scores: assessment.scores,
        blockerCount: assessment.blockers.length,
        blockers: assessment.blockers,
        moduleBreakdown: assessment.moduleBreakdown,
      };
    }

    case 'compute_readiness': {
      const readiness = computeReadinessAssessment(crossObjectPayload);
      return {
        readiness,
      };
    }

    case 'generate_recommendations': {
      const recSet = generateRecommendations(crossObjectPayload);
      return {
        recommendations: recSet.recommendations,
        summary: recSet.summary,
      };
    }

    case 'scan_blockers': {
      const recSet = generateRecommendations(crossObjectPayload, {
        projectId: request.projectId,
        minSeverity: 'medium',
      });
      const assessment = computeReadinessAssessment(crossObjectPayload);

      for (const b of assessment.blockers) {
        blockers.push({
          severity: b.severity,
          category: b.category,
          message: b.message,
          targetType: b.targetType,
          targetId: b.targetId,
          suggestedAction: b.suggestedResolution,
        });
      }

      return {
        blockers: assessment.blockers,
        recommendations: recSet.recommendations.slice(0, 10),
        readinessScore: assessment.overallScore,
        readinessStatus: assessment.status,
      };
    }

    case 'summarize_blockers': {
      return {
        totalBlockers: blockers.length,
        criticalBlockers: blockers.filter((b) => b.severity === 'critical').length,
        majorBlockers: blockers.filter((b) => b.severity === 'major').length,
        blockers: blockers,
      };
    }

    case 'prepare_draft_plan': {
      // Analyze what needs drafting
      const missingModules = crossObjectPayload.moduleMap
        .filter((m: any) => m.module !== 'Unassigned' && m.documentCount === 0)
        .map((m: any) => m.module);

      const unvalidated = crossObjectPayload.documents
        .filter((d: any) => !d.hasValidation && d.status !== 'draft');

      return {
        modulesNeedingContent: missingModules,
        documentsNeedingValidation: unvalidated.map((d: any) => ({
          id: d.id,
          title: d.title,
        })),
        unroutedDocuments: crossObjectPayload.documents
          .filter((d: any) => !d.isRouted)
          .map((d: any) => ({ id: d.id, title: d.title })),
      };
    }

    case 'compile_results': {
      // Final compilation step — return all prior step data
      return {
        stepCount: previousResults.length,
        previousResults,
        completedAt: new Date().toISOString(),
      };
    }

    default:
      return { stepId, note: 'No specific logic for this step' };
  }
}

// ---------------------------------------------------------------------------
// Result Aggregation
// ---------------------------------------------------------------------------

async function aggregateResults(
  execution: WorkflowExecution,
  stepResults: Record<string, unknown>[],
  blockers: WorkflowBlocker[],
  crossObjectPayload: CrossObjectReasoningPayload
): Promise<WorkflowResult> {
  const completedSteps = execution.steps.filter((s) => s.status === 'completed').length;
  const failedSteps = execution.steps.filter((s) => s.status === 'failed').length;

  // Build summary
  let summary: string;
  if (execution.status === 'completed') {
    summary = `Workflow "${execution.templateId}" completed: ${completedSteps}/${execution.steps.length} steps succeeded.`;
  } else {
    summary = `Workflow "${execution.templateId}" failed at step ${execution.currentStepIndex + 1}: ${failedSteps} step(s) failed.`;
  }

  if (blockers.length > 0) {
    summary += ` Found ${blockers.length} blocker(s).`;
  }

  // Collect created/updated objects from step results
  const createdObjects: Array<{ type: string; id: string | number; title?: string }> = [];
  const updatedObjects: Array<{ type: string; id: string | number; title?: string }> = [];
  for (const result of stepResults) {
    const created = (result as any)?.createdObjects;
    const updated = (result as any)?.updatedObjects;
    if (Array.isArray(created)) createdObjects.push(...created);
    if (Array.isArray(updated)) updatedObjects.push(...updated);
  }

  // Import readiness assessment from step results if available
  let readiness;
  for (const result of stepResults) {
    if ((result as any)?.readiness) {
      readiness = (result as any).readiness;
      break;
    }
    if ((result as any)?.overallScore !== undefined) {
      readiness = result;
      break;
    }
  }

  // Generate recommendations (dynamic import to avoid circular deps in ESM)
  const { generateRecommendations: genRecs } = await import('./recommendation-engine');
  const recSet = genRecs(crossObjectPayload, { projectId: execution.projectId, limit: 10 });

  return {
    summary,
    blockers,
    recommendations: recSet.recommendations,
    readiness,
    createdObjects,
    updatedObjects,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addAuditEntry(
  execution: WorkflowExecution,
  action: string,
  detail: string,
  userId: number,
  stepId?: string
): void {
  execution.auditTrail.push({
    timestamp: new Date().toISOString(),
    stepId,
    action,
    detail,
    userId,
  });
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const k = String(item[key] ?? 'unknown');
    result[k] = (result[k] || 0) + 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export function cancelWorkflow(executionId: string, userId: number): boolean {
  const execution = executions.get(executionId);
  if (!execution) return false;
  if (execution.status !== 'running' && execution.status !== 'paused') return false;

  execution.status = 'cancelled';
  execution.completedAt = new Date().toISOString();
  addAuditEntry(execution, 'workflow_cancelled', 'Workflow cancelled by user', userId);
  return true;
}
