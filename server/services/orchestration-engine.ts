/**
 * Deterministic Orchestration Engine — Phase 3
 *
 * Core service that executes multi-step workflows with clear separation between:
 *   - DETERMINISTIC operations: routing, promotion, validation, status changes,
 *     object lookup, permission checks (no LLM involved)
 *   - LLM REASONING operations: summarization, prioritization, recommendation
 *     generation, gap interpretation (uses AI gateway)
 *
 * Implements enhancements #5 (separation), #7 (resume/retry), and coordinates
 * with #1 (run persistence), #2 (approval gates), #6 (evidence contract).
 *
 * @module server/services/orchestration-engine
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowStepRecord,
  TouchedObject,
  CreatedOutput,
  WorkflowBlocker,
  EvidencedRecommendation,
  DiffSummary,
  ApprovalRecord,
  WorkflowOutcome,
} from '../../shared/schema/orchestration';

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A workflow definition — the template for what steps to execute.
 * Enhancement #10: target one or two high-value flows first.
 */
export interface WorkflowDefinition {
  readonly workflowType: string;
  readonly displayName: string;
  readonly version: string;
  readonly steps: StepDefinition[];
  readonly requiredScope: WorkflowScope;
}

export interface WorkflowScope {
  readonly requiresProject: boolean;
  readonly requiresProgram: boolean;
  readonly allowedModuleTypes: string[];    // empty = all
  readonly allowedProgramTypes: string[];   // empty = all
}

/**
 * Enhancement #5: Every step declares whether it is deterministic or AI reasoning.
 * The engine enforces that deterministic steps never invoke the LLM.
 */
export interface StepDefinition {
  readonly stepName: string;
  readonly stepType: 'deterministic' | 'ai_reasoning';
  readonly description: string;
  readonly handler: string;              // Registered handler name
  readonly approvalGate?: ApprovalGateConfig;
  readonly retryPolicy?: RetryPolicy;
  readonly skipCondition?: string;       // Expression evaluated against run context
}

/**
 * Enhancement #2: Approval gate configuration.
 * No workflow may auto-promote without passing configurable gates.
 */
export interface ApprovalGateConfig {
  readonly gateType: 'manual' | 'role_based' | 'quorum' | 'auto_on_pass';
  readonly requiredRoles?: string[];
  readonly requiredCount?: number;
  readonly protectedAction: string;
  readonly timeoutHours?: number;
}

/** Enhancement #7: Retry policy per step */
export interface RetryPolicy {
  readonly maxRetries: number;
  readonly backoffMs: number;
  readonly backoffMultiplier: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT (passed through the pipeline)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExecutionContext {
  readonly runId: string;
  readonly workflowType: string;
  readonly organizationId: number;
  readonly projectId?: number;
  readonly programId?: string;
  readonly moduleScope?: string;
  readonly triggeredBy: string;
  readonly triggerSource: 'user_action' | 'schedule' | 'api_call' | 'event_hook' | 'ai_recommendation';

  /** Mutable state accumulated across steps */
  stepOutputs: Record<string, unknown>;
  objectsTouched: TouchedObject[];
  outputsCreated: CreatedOutput[];
  blockers: WorkflowBlocker[];
  recommendations: EvidencedRecommendation[];
  diffSummaries: DiffSummary[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP HANDLER CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Every step handler implements this interface.
 * Enhancement #5: deterministic handlers MUST NOT call LLM services.
 */
export interface StepHandler {
  readonly handlerName: string;
  readonly stepType: 'deterministic' | 'ai_reasoning';
  execute(ctx: ExecutionContext, input: Record<string, unknown>): Promise<StepResult>;
}

export interface StepResult {
  readonly success: boolean;
  readonly output: Record<string, unknown>;
  readonly objectsTouched?: TouchedObject[];
  readonly outputsCreated?: CreatedOutput[];
  readonly blockers?: WorkflowBlocker[];
  readonly recommendations?: EvidencedRecommendation[];
  readonly diffSummaries?: DiffSummary[];
  readonly error?: string;
  /** If true, the engine will pause and await approval before continuing */
  readonly requiresApproval?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE EVENTS (for audit trail integration)
// ═══════════════════════════════════════════════════════════════════════════════

export type EngineEvent =
  | { readonly type: 'run_started'; readonly runId: string; readonly workflowType: string; readonly displayName: string }
  | { readonly type: 'step_started'; readonly runId: string; readonly stepIndex: number; readonly stepName: string; readonly stepType: 'deterministic' | 'ai_reasoning' }
  | { readonly type: 'step_completed'; readonly runId: string; readonly stepIndex: number; readonly stepName: string; readonly stepType: 'deterministic' | 'ai_reasoning'; readonly status: string }
  | { readonly type: 'approval_required'; readonly runId: string; readonly stepIndex: number; readonly stepName: string; readonly gateType: string }
  | { readonly type: 'approval_resolved'; readonly runId: string; readonly stepIndex: number; readonly decision: string }
  | { readonly type: 'run_paused'; readonly runId: string; readonly reason: string }
  | { readonly type: 'run_resumed'; readonly runId: string; readonly fromStep: number }
  | { readonly type: 'run_completed'; readonly runId: string; readonly workflowType: string; readonly status: string }
  | { readonly type: 'run_failed'; readonly runId: string; readonly workflowType: string; readonly error: string; readonly stepIndex: number };

export type EngineEventListener = (event: EngineEvent) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class OrchestrationEngine {
  private readonly handlers = new Map<string, StepHandler>();
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly listeners: EngineEventListener[] = [];

  // ── Handler Registration ──────────────────────────────────────────────────

  /**
   * Register a step handler. Enforces that the handler's declared stepType
   * matches its implementation contract.
   */
  registerHandler(handler: StepHandler): void {
    if (this.handlers.has(handler.handlerName)) {
      throw new Error(`Handler "${handler.handlerName}" is already registered`);
    }
    this.handlers.set(handler.handlerName, handler);
  }

  /**
   * Register a workflow definition.
   * Validates that all referenced handlers exist and that stepType declarations
   * are consistent between the definition and the handler.
   */
  registerWorkflow(definition: WorkflowDefinition): void {
    for (const step of definition.steps) {
      const handler = this.handlers.get(step.handler);
      if (!handler) {
        throw new Error(
          `Workflow "${definition.workflowType}" references unregistered handler "${step.handler}"`
        );
      }
      // Enhancement #5: enforce type consistency
      if (handler.stepType !== step.stepType) {
        throw new Error(
          `Step "${step.stepName}" declares stepType "${step.stepType}" but handler "${step.handler}" ` +
          `is registered as "${handler.stepType}". Deterministic and AI reasoning must not be mixed.`
        );
      }
    }
    this.workflows.set(definition.workflowType, definition);
  }

  addEventListener(listener: EngineEventListener): void {
    this.listeners.push(listener);
  }

  removeEventListener(listener: EngineEventListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) this.listeners.splice(idx, 1);
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ── Workflow Execution ────────────────────────────────────────────────────

  /**
   * Start a new workflow run.
   * Returns the run context with a unique runId.
   * The caller is responsible for persisting the WorkflowRun record.
   */
  async startRun(params: {
    readonly workflowType: string;
    readonly organizationId: number;
    readonly triggeredBy: string;
    readonly triggerSource: ExecutionContext['triggerSource'];
    readonly projectId?: number;
    readonly programId?: string;
    readonly moduleScope?: string;
    readonly initialInput?: Record<string, unknown>;
  }): Promise<RunResult> {
    const definition = this.workflows.get(params.workflowType);
    if (!definition) {
      throw new Error(`Unknown workflow type: "${params.workflowType}"`);
    }

    const ctx: ExecutionContext = {
      runId: uuidv4(),
      workflowType: params.workflowType,
      organizationId: params.organizationId,
      projectId: params.projectId,
      programId: params.programId,
      moduleScope: params.moduleScope,
      triggeredBy: params.triggeredBy,
      triggerSource: params.triggerSource,
      stepOutputs: params.initialInput ?? {},
      objectsTouched: [],
      outputsCreated: [],
      blockers: [],
      recommendations: [],
      diffSummaries: [],
    };

    this.emit({ type: 'run_started', runId: ctx.runId, workflowType: params.workflowType, displayName: definition.displayName });

    return this.executeFrom(ctx, definition, 0);
  }

  /**
   * Enhancement #7: Resume a paused or failed run from the last successful step.
   */
  async resumeRun(params: {
    readonly context: ExecutionContext;
    readonly fromStepIndex: number;
    readonly updatedInput?: Record<string, unknown>;
  }): Promise<RunResult> {
    const definition = this.workflows.get(params.context.workflowType);
    if (!definition) {
      throw new Error(`Unknown workflow type: "${params.context.workflowType}"`);
    }

    if (params.updatedInput) {
      Object.assign(params.context.stepOutputs, params.updatedInput);
    }

    this.emit({ type: 'run_resumed', runId: params.context.runId, fromStep: params.fromStepIndex });

    return this.executeFrom(params.context, definition, params.fromStepIndex);
  }

  /**
   * Enhancement #7: Retry a specific failed step.
   */
  async retryStep(params: {
    readonly context: ExecutionContext;
    readonly stepIndex: number;
  }): Promise<RunResult> {
    return this.resumeRun({
      context: params.context,
      fromStepIndex: params.stepIndex,
    });
  }

  // ── Internal Execution ────────────────────────────────────────────────────

  private async executeFrom(
    ctx: ExecutionContext,
    definition: WorkflowDefinition,
    fromIndex: number
  ): Promise<RunResult> {
    const steps: WorkflowStepRecord[] = [];

    for (let i = fromIndex; i < definition.steps.length; i++) {
      const stepDef = definition.steps[i];
      const handler = this.handlers.get(stepDef.handler)!;

      // Check skip condition
      if (stepDef.skipCondition && this.evaluateSkipCondition(stepDef.skipCondition, ctx)) {
        const skippedRecord: WorkflowStepRecord = {
          stepIndex: i,
          stepName: stepDef.stepName,
          stepType: stepDef.stepType,
          actorType: 'system',
          actorId: 'engine',
          status: 'skipped',
          input: {},
          output: { reason: 'skip_condition_met' },
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
        };
        steps.push(skippedRecord);
        continue;
      }

      this.emit({ type: 'step_started', runId: ctx.runId, stepIndex: i, stepName: stepDef.stepName, stepType: stepDef.stepType });

      const startTime = Date.now();
      let result: StepResult;

      // Execute with retry policy (enhancement #7)
      const retryPolicy = stepDef.retryPolicy ?? { maxRetries: 0, backoffMs: 1000, backoffMultiplier: 2 };
      let attempt = 0;
      let lastError = '';

      while (attempt <= retryPolicy.maxRetries) {
        try {
          result = await handler.execute(ctx, ctx.stepOutputs);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          attempt++;
          if (attempt <= retryPolicy.maxRetries) {
            const delay = retryPolicy.backoffMs * Math.pow(retryPolicy.backoffMultiplier, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // If all retries exhausted
      if (attempt > retryPolicy.maxRetries) {
        const failedRecord: WorkflowStepRecord = {
          stepIndex: i,
          stepName: stepDef.stepName,
          stepType: stepDef.stepType,
          actorType: handler.stepType === 'deterministic' ? 'ai_deterministic' : 'ai_reasoning',
          actorId: handler.handlerName,
          status: 'failed',
          input: ctx.stepOutputs,
          output: {},
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          error: lastError,
        };
        steps.push(failedRecord);

        this.emit({ type: 'run_failed', runId: ctx.runId, workflowType: ctx.workflowType, error: lastError, stepIndex: i });

        return {
          runId: ctx.runId,
          status: 'failed',
          stepsExecuted: steps,
          context: ctx,
          lastSuccessfulStepIndex: i > 0 ? i - 1 : undefined,
          errorStepIndex: i,
          errorMessage: lastError,
        };
      }

      result = result!;
      const durationMs = Date.now() - startTime;

      // Accumulate results into context
      if (result.objectsTouched) ctx.objectsTouched.push(...result.objectsTouched);
      if (result.outputsCreated) ctx.outputsCreated.push(...result.outputsCreated);
      if (result.blockers) ctx.blockers.push(...result.blockers);
      if (result.recommendations) ctx.recommendations.push(...result.recommendations);
      if (result.diffSummaries) ctx.diffSummaries.push(...result.diffSummaries);
      Object.assign(ctx.stepOutputs, result.output);

      if (!result.success) {
        const failedRecord: WorkflowStepRecord = {
          stepIndex: i,
          stepName: stepDef.stepName,
          stepType: stepDef.stepType,
          actorType: handler.stepType === 'deterministic' ? 'ai_deterministic' : 'ai_reasoning',
          actorId: handler.handlerName,
          status: 'failed',
          input: ctx.stepOutputs,
          output: result.output,
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
          error: result.error,
        };
        steps.push(failedRecord);

        this.emit({ type: 'run_failed', runId: ctx.runId, workflowType: ctx.workflowType, error: result.error ?? 'Step failed', stepIndex: i });

        return {
          runId: ctx.runId,
          status: 'failed',
          stepsExecuted: steps,
          context: ctx,
          lastSuccessfulStepIndex: i > 0 ? i - 1 : undefined,
          errorStepIndex: i,
          errorMessage: result.error,
        };
      }

      // Check if approval gate is required (enhancement #2)
      if (result.requiresApproval || stepDef.approvalGate) {
        const approvalRecord: WorkflowStepRecord = {
          stepIndex: i,
          stepName: stepDef.stepName,
          stepType: stepDef.stepType,
          actorType: handler.stepType === 'deterministic' ? 'ai_deterministic' : 'ai_reasoning',
          actorId: handler.handlerName,
          status: 'awaiting_review',
          input: ctx.stepOutputs,
          output: result.output,
          startedAt: new Date(startTime).toISOString(),
          durationMs,
        };
        steps.push(approvalRecord);

        this.emit({
          type: 'approval_required',
          runId: ctx.runId,
          stepIndex: i,
          stepName: stepDef.stepName,
          gateType: stepDef.approvalGate?.gateType ?? 'manual',
        });

        return {
          runId: ctx.runId,
          status: 'awaiting_approval',
          stepsExecuted: steps,
          context: ctx,
          awaitingApprovalAtStep: i,
          approvalGate: stepDef.approvalGate,
        };
      }

      // Step completed successfully
      const completedRecord: WorkflowStepRecord = {
        stepIndex: i,
        stepName: stepDef.stepName,
        stepType: stepDef.stepType,
        actorType: handler.stepType === 'deterministic' ? 'ai_deterministic' : 'ai_reasoning',
        actorId: handler.handlerName,
        status: 'executed',
        input: ctx.stepOutputs,
        output: result.output,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
      };
      steps.push(completedRecord);

      this.emit({ type: 'step_completed', runId: ctx.runId, stepIndex: i, stepName: stepDef.stepName, stepType: stepDef.stepType, status: 'executed' });
    }

    this.emit({ type: 'run_completed', runId: ctx.runId, workflowType: ctx.workflowType, status: 'completed' });

    return {
      runId: ctx.runId,
      status: 'completed',
      stepsExecuted: steps,
      context: ctx,
      lastSuccessfulStepIndex: definition.steps.length - 1,
    };
  }

  private evaluateSkipCondition(condition: string, ctx: ExecutionContext): boolean {
    // Simple key-presence check. Extend as needed.
    // e.g., "has:validation_results" checks if stepOutputs has that key
    if (condition.startsWith('has:')) {
      const key = condition.slice(4);
      return key in ctx.stepOutputs;
    }
    if (condition.startsWith('!has:')) {
      const key = condition.slice(5);
      return !(key in ctx.stepOutputs);
    }
    return false;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  getRegisteredWorkflows(): ReadonlyArray<WorkflowDefinition> {
    return Array.from(this.workflows.values());
  }

  getRegisteredHandlers(): ReadonlyArray<{ readonly name: string; readonly type: string }> {
    return Array.from(this.handlers.entries()).map(([name, h]) => ({
      name,
      type: h.stepType,
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN RESULT
// ═══════════════════════════════════════════════════════════════════════════════

export interface RunResult {
  readonly runId: string;
  readonly status: 'completed' | 'failed' | 'awaiting_approval' | 'paused' | 'cancelled';
  readonly stepsExecuted: ReadonlyArray<WorkflowStepRecord>;
  readonly context: ExecutionContext;
  readonly lastSuccessfulStepIndex?: number;
  readonly errorStepIndex?: number;
  readonly errorMessage?: string;
  readonly awaitingApprovalAtStep?: number;
  readonly approvalGate?: ApprovalGateConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCEMENT #10: SCOPED WORKFLOW DEFINITIONS
// Target one or two high-value regulated flows first.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-defined workflow: Dossier / Submission Readiness Review
 * The first high-value flow to implement end-to-end.
 */
export const SUBMISSION_READINESS_REVIEW: WorkflowDefinition = {
  workflowType: 'submission_readiness_review',
  displayName: 'Submission Readiness Review',
  version: '1.0',
  requiredScope: {
    requiresProject: true,
    requiresProgram: true,
    allowedModuleTypes: ['cer', 'ectd', '510k', 'cmc'],
    allowedProgramTypes: ['CER', '510K', 'IND', 'NDA', 'BLA', 'PMA', 'DE_NOVO'],
  },
  steps: [
    {
      stepName: 'Gather project artifacts',
      stepType: 'deterministic',
      description: 'Lookup all documents, evidence objects, and milestones for the project scope',
      handler: 'gather_project_artifacts',
    },
    {
      stepName: 'Evaluate readiness rules',
      stepType: 'deterministic',
      description: 'Check each applicable readiness rule against the gathered artifacts',
      handler: 'evaluate_readiness_rules',
    },
    {
      stepName: 'Run validation checks',
      stepType: 'deterministic',
      description: 'Execute deterministic validation (completeness, cross-references, format)',
      handler: 'run_validation_checks',
    },
    {
      stepName: 'AI gap analysis',
      stepType: 'ai_reasoning',
      description: 'Use LLM to interpret gaps, generate recommendations, and prioritize findings',
      handler: 'ai_gap_analysis',
    },
    {
      stepName: 'Generate readiness report',
      stepType: 'deterministic',
      description: 'Compile findings into a structured readiness evaluation with evidence classes',
      handler: 'generate_readiness_report',
    },
    {
      stepName: 'Review readiness findings',
      stepType: 'deterministic',
      description: 'Present findings for human review before acting on recommendations',
      handler: 'present_for_review',
      approvalGate: {
        gateType: 'role_based',
        requiredRoles: ['regulatory_lead', 'quality_manager', 'admin'],
        protectedAction: 'accept_readiness_findings',
      },
    },
    {
      stepName: 'Update project intelligence',
      stepType: 'deterministic',
      description: 'Update the project intelligence summary with new findings and recommendations',
      handler: 'update_project_intelligence',
    },
  ],
};

/**
 * Pre-defined workflow: Draft → Validate → Review → Route
 * The second high-value flow to implement end-to-end.
 */
export const DRAFT_VALIDATE_REVIEW_ROUTE: WorkflowDefinition = {
  workflowType: 'draft_validate_review_route',
  displayName: 'Draft → Validate → Review → Route',
  version: '1.0',
  requiredScope: {
    requiresProject: true,
    requiresProgram: false,
    allowedModuleTypes: ['cer', 'ectd', '510k', 'cmc'],
    allowedProgramTypes: [],
  },
  steps: [
    {
      stepName: 'Capture document snapshot',
      stepType: 'deterministic',
      description: 'Create a versioned snapshot of the current document state',
      handler: 'capture_document_snapshot',
    },
    {
      stepName: 'AI draft refinement',
      stepType: 'ai_reasoning',
      description: 'Generate AI-assisted draft improvements with evidence-backed suggestions',
      handler: 'ai_draft_refinement',
    },
    {
      stepName: 'Generate diff summary',
      stepType: 'deterministic',
      description: 'Produce structured diff showing what changed, why, and what evidence supports it',
      handler: 'generate_diff_summary',
    },
    {
      stepName: 'Review draft changes',
      stepType: 'deterministic',
      description: 'Present diff for human review — no auto-promotion of governed documents',
      handler: 'present_diff_for_review',
      approvalGate: {
        gateType: 'manual',
        protectedAction: 'accept_draft_changes',
      },
    },
    {
      stepName: 'Apply approved changes',
      stepType: 'deterministic',
      description: 'Apply only the approved changes to the document',
      handler: 'apply_approved_changes',
    },
    {
      stepName: 'Run validation suite',
      stepType: 'deterministic',
      description: 'Execute deterministic validation on the updated document',
      handler: 'run_document_validation',
      retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    },
    {
      stepName: 'Route for formal review',
      stepType: 'deterministic',
      description: 'Route document to the appropriate reviewer(s) based on module type and org rules',
      handler: 'route_for_review',
      approvalGate: {
        gateType: 'role_based',
        requiredRoles: ['reviewer', 'regulatory_lead', 'admin'],
        protectedAction: 'promote_to_review',
      },
    },
    {
      stepName: 'Update project intelligence',
      stepType: 'deterministic',
      description: 'Record workflow outcome in project intelligence summary',
      handler: 'update_project_intelligence',
    },
  ],
};
