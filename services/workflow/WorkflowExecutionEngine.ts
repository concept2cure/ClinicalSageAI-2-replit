/**
 * Workflow Execution Engine
 * 
 * Core orchestration engine that executes workflows based on the
 * Workflow-as-Contract principle. Handles step advancement, precondition
 * evaluation, effect execution, and audit logging.
 * 
 * Pillars:
 * - Workflow-as-Contract 📜: Preconditions & effects
 * - Trust Rails 🔐: Hash-chained audit trail
 * - Submission-as-Asset 💎: Asset state management
 */

import { createHash } from 'crypto';
import type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  Precondition,
  Effect,
} from '../../database/schema/workflow-definitions';
import type { WorkflowRun, WorkflowContext } from '../../database/schema/workflow-runs';
import type { WorkflowStep, StepCompletionData } from '../../database/schema/workflow-steps';
import type { StepRun, PreconditionCheckResult, EffectExecutionResult } from '../../database/schema/step-runs';
import { DeadLetterQueue, type DeadLetterItem } from './DeadLetterQueue';
import FormalComplianceGraph from '../proof/FormalComplianceGraph';
import DeltaVerificationEngine from '../proof/DeltaVerificationEngine';
import type { ExecutionContext, EvidenceBundle, TransitionProof, ProofType } from '../proof/types';

// Types
export interface WorkflowEngineConfig {
  enableAutoAdvance: boolean;
  checkIntervalMs: number;
  maxRetries: number;
  enableNotifications: boolean;
  enableAuditHashing: boolean;
  enableDeadLetterQueue: boolean;
  enableProofSystem: boolean;
}

export interface StepTransitionResult {
  success: boolean;
  step: WorkflowStep;
  previousStatus: string;
  newStatus: string;
  preconditionResults?: PreconditionCheckResult[];
  effectResults?: EffectExecutionResult[];
  error?: string;
}

export interface WorkflowStartResult {
  success: boolean;
  workflowRun: WorkflowRun;
  initialSteps: WorkflowStep[];
  error?: string;
}

export type AssetState = 
  | 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SUBMITTED' 
  | 'DEFICIENCY' | 'RESPONSE_PENDING' | 'ACCEPTED' 
  | 'WITHDRAWN' | 'REJECTED' | 'MARKETED'
  | 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4';

export type StepStatus = 
  | 'PENDING' | 'READY' | 'IN_PROGRESS' | 'AWAITING_APPROVAL'
  | 'AWAITING_SIGNATURE' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED' | 'FAILED';

// Default configuration
const DEFAULT_CONFIG: WorkflowEngineConfig = {
  enableAutoAdvance: true,
  checkIntervalMs: 5000,
  maxRetries: 3,
  enableNotifications: true,
  enableAuditHashing: true,
  enableDeadLetterQueue: true,
  enableProofSystem: true,
};

/**
 * WorkflowExecutionEngine
 * 
 * Main entry point for workflow orchestration.
 */
export class WorkflowExecutionEngine {
  private config: WorkflowEngineConfig;
  private lastAuditHash: string = '';
  private readonly deltaVerifier = new DeltaVerificationEngine();
  private readonly complianceGraphCache = new Map<
    string,
    { signature: string; graph: FormalComplianceGraph }
  >();
  private deadLetterQueue: DeadLetterQueue;

  constructor(config: Partial<WorkflowEngineConfig> = {}, deadLetterQueue?: DeadLetterQueue) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deadLetterQueue = deadLetterQueue || new DeadLetterQueue();
  }

  // ============================================================
  // WORKFLOW LIFECYCLE
  // ============================================================

  /**
   * Start a new workflow run from a definition
   */
  async startWorkflow(
    definition: WorkflowDefinition,
    stepDefinitions: WorkflowStepDefinition[],
    projectId: string,
    ownerId: string,
    context: WorkflowContext = {}
  ): Promise<WorkflowStartResult> {
    try {
      // Create workflow run
      const workflowRun: WorkflowRun = {
        id: this.generateId(),
        tenantId: definition.tenantId,
        workflowDefinitionId: definition.id,
        projectId,
        submissionId: context.variables?.submissionId as string | undefined,
        name: `${definition.name} - ${new Date().toISOString().split('T')[0]}`,
        status: 'ACTIVE',
        assetState: 'DRAFT',
        previousAssetState: null,
        assetStateChangedAt: new Date(),
        currentStepId: null,
        completedStepsCount: 0,
        totalStepsCount: stepDefinitions.length,
        progressPercent: 0,
        startedAt: new Date(),
        completedAt: null,
        estimatedCompletionAt: this.calculateEstimatedCompletion(stepDefinitions),
        dueDate: null,
        ownerId,
        assignedTeamIds: [],
        context,
        lastError: null,
        errorCount: 0,
        metrics: {
          totalDurationHours: 0,
          averageStepDurationHours: 0,
          slaBreaches: 0,
          reworkCount: 0,
          approvalCycles: 0,
          signatureCount: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: ownerId,
        updatedBy: null,
        stateHash: '',
      };

      // Create initial steps from definitions
      const steps = stepDefinitions.map((def, index) => 
        this.createStepFromDefinition(def, workflowRun.id, index === 0 ? 'READY' : 'PENDING')
      );

      // Set current step to first step
      workflowRun.currentStepId = steps[0]?.id || null;

      // Generate state hash
      workflowRun.stateHash = this.generateStateHash(workflowRun, steps);

      // Initialize delta verification baseline
      const baselineSnapshot = this.deltaVerifier.createSnapshot(
        steps.map(s => `${s.id}:${s.status}`),
        workflowRun.stateHash,
        workflowRun.id
      );
      this.deltaVerifier.setExpectedState(baselineSnapshot);

      // Log audit entry
      await this.logStepRun(steps[0], workflowRun.tenantId, {
        action: 'STARTED',
        performedBy: ownerId,
        details: {
          metadata: { workflowName: definition.name, context },
        },
      });

      return {
        success: true,
        workflowRun,
        initialSteps: steps,
      };
    } catch (error) {
      return {
        success: false,
        workflowRun: null as any,
        initialSteps: [],
        error: error instanceof Error ? error.message : 'Unknown error starting workflow',
      };
    }
  }

  /**
   * Advance to the next step in the workflow
   */
  async advanceStep(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[],
    completionData: StepCompletionData,
    userId: string
  ): Promise<StepTransitionResult> {
    const previousStatus = step.status;

    try {
      // 1. Validate step can be completed
      if (step.status === 'COMPLETED' || step.status === 'SKIPPED') {
        return {
          success: false,
          step,
          previousStatus,
          newStatus: step.status,
          error: 'Step is already completed or skipped',
        };
      }

      // 2. Check preconditions
      const preconditionResults = await this.evaluatePreconditions(
        step.preconditions || [],
        workflowRun,
        allSteps
      );
      const allPreconditionsMet = preconditionResults.every(r => r.passed);

      if (!allPreconditionsMet) {
        step.preconditionsMet = false;
        step.failedPreconditions = preconditionResults
          .filter(r => !r.passed)
          .map(r => r.preconditionId);
        step.preconditionsEvaluatedAt = new Date();

        // Log precondition failure
        await this.logStepRun(step, workflowRun.tenantId, {
          action: 'PRECONDITION_CHECK',
          performedBy: userId,
          preconditionsSnapshot: preconditionResults,
          details: { metadata: { failedCount: step.failedPreconditions.length } },
        });

        return {
          success: false,
          step,
          previousStatus,
          newStatus: 'BLOCKED',
          preconditionResults,
          error: 'Preconditions not met',
        };
      }

      // 3. Mark step as completed
      step.status = 'COMPLETED';
      step.completedAt = new Date();
      step.completedBy = userId;
      step.completionData = completionData;
      step.preconditionsMet = true;
      step.preconditionsEvaluatedAt = new Date();

      // Calculate duration
      if (step.startedAt) {
        step.actualDurationMinutes = Math.round(
          (step.completedAt.getTime() - step.startedAt.getTime()) / 60000
        );
      }

      // 4. Execute effects
      const effectResults = await this.executeEffects(
        step.effects || [],
        step,
        workflowRun,
        allSteps
      );
      step.effectsExecuted = true;
      step.effectsExecutedAt = new Date();

      // Determine next step for proof context
      const nextStep = this.findNextStep(step, allSteps);

      const transitionProof = await this.generateTransitionProof(
        step,
        workflowRun,
        allSteps,
        previousStatus,
        'COMPLETED',
        userId,
        nextStep?.id
      );

      if (transitionProof) {
        await this.logStepRun(step, workflowRun.tenantId, {
          action: 'PROOF_GENERATED',
          performedBy: userId,
          details: {
            metadata: {
              proofId: transitionProof.circuitSatisfaction?.proofId || null,
              proofHash: this.hashValue(transitionProof),
              proofTypes: transitionProof.zeroKnowledge.map(p => p.type),
            },
          },
        });
      }

      // 5. Log completion
      await this.logStepRun(step, workflowRun.tenantId, {
        action: 'COMPLETED',
        performedBy: userId,
        previousStatus,
        newStatus: 'COMPLETED',
        preconditionsSnapshot: preconditionResults,
        effectsSnapshot: effectResults,
        details: {
          ...completionData,
          metadata: {
            transitionProofId: transitionProof?.circuitSatisfaction?.proofId || null,
            transitionProofHash: transitionProof ? this.hashValue(transitionProof) : null,
          },
        },
      });

      // 6. Find and activate next step
      if (nextStep) {
        nextStep.status = 'READY';
        workflowRun.currentStepId = nextStep.id;
        
        // Check if next step should auto-advance
        if (nextStep.isAutoAdvance && this.config.enableAutoAdvance) {
          // Schedule auto-advance check
          setTimeout(() => {
            this.checkAutoAdvance(nextStep, workflowRun, allSteps, userId);
          }, this.config.checkIntervalMs);
        }
      } else {
        // Workflow complete
        workflowRun.status = 'COMPLETED';
        workflowRun.completedAt = new Date();
        workflowRun.progressPercent = 100;
        this.complianceGraphCache.delete(workflowRun.id);
      }

      // 7. Update progress
      workflowRun.completedStepsCount = allSteps.filter(s => s.status === 'COMPLETED').length;
      workflowRun.progressPercent = Math.round(
        (workflowRun.completedStepsCount / workflowRun.totalStepsCount) * 100
      );
      workflowRun.stateHash = this.generateStateHash(workflowRun, allSteps);
      workflowRun.updatedAt = new Date();

      const deltaSnapshot = this.deltaVerifier.createSnapshot(
        allSteps.map(s => `${s.id}:${s.status}`),
        workflowRun.stateHash,
        workflowRun.id
      );
      const deltaReport = await this.deltaVerifier.verifySnapshot(deltaSnapshot);
      if (deltaReport.divergence > 0) {
        await this.logStepRun(step, workflowRun.tenantId, {
          action: 'DELTA_VERIFICATION',
          performedBy: userId,
          details: {
            metadata: {
              divergence: deltaReport.divergence,
              violations: deltaReport.violations,
              expectedHash: deltaReport.expectedHash,
              actualHash: deltaReport.actualHash,
            },
          },
        });
      }

      return {
        success: true,
        step,
        previousStatus,
        newStatus: 'COMPLETED',
        preconditionResults,
        effectResults,
      };
    } catch (error) {
      step.lastError = error instanceof Error ? error.message : 'Unknown error';
      step.retryCount += 1;

      if (this.config.enableDeadLetterQueue && step.retryCount >= this.config.maxRetries) {
        const dlqItem: DeadLetterItem = {
          id: this.generateId(),
          tenantId: workflowRun.tenantId,
          workflowRunId: workflowRun.id,
          workflowStepId: step.id,
          stepRunId: null,
          action: 'FAILED',
          errorMessage: step.lastError,
          errorStack: error instanceof Error ? error.stack || null : null,
          payload: {
            stepName: step.name,
            stepType: step.stepType,
            workflowName: workflowRun.name,
            completionData: step.completionData || undefined,
            metadata: { retryCount: step.retryCount },
          },
          retryCount: step.retryCount,
          maxRetries: this.config.maxRetries,
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.deadLetterQueue.enqueue(dlqItem);
      }

      await this.logStepRun(step, workflowRun.tenantId, {
        action: 'FAILED',
        performedBy: userId,
        previousStatus,
        newStatus: 'FAILED',
        errorMessage: step.lastError,
      });

      return {
        success: false,
        step,
        previousStatus,
        newStatus: 'FAILED',
        error: step.lastError,
      };
    }
  }

  /**
   * Start a step (move from READY to IN_PROGRESS)
   */
  async startStep(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    userId: string
  ): Promise<StepTransitionResult> {
    const previousStatus = step.status;

    if (step.status !== 'READY' && step.status !== 'PENDING') {
      return {
        success: false,
        step,
        previousStatus,
        newStatus: step.status,
        error: 'Step must be READY or PENDING to start',
      };
    }

    step.status = 'IN_PROGRESS';
    step.startedAt = new Date();
    step.assigneeUserId = userId;
    step.assignedAt = new Date();

    // Calculate SLA due date
    if (step.slaHours) {
      step.slaDueAt = new Date(Date.now() + step.slaHours * 60 * 60 * 1000);
    }

    await this.logStepRun(step, workflowRun.tenantId, {
      action: 'STARTED',
      performedBy: userId,
      previousStatus,
      newStatus: 'IN_PROGRESS',
    });

    return {
      success: true,
      step,
      previousStatus,
      newStatus: 'IN_PROGRESS',
    };
  }

  /**
   * Submit step for approval
   */
  async submitForApproval(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    userId: string,
    submissionData: StepCompletionData
  ): Promise<StepTransitionResult> {
    const previousStatus = step.status;

    if (step.stepType !== 'APPROVAL' && step.stepType !== 'REVIEW') {
      return {
        success: false,
        step,
        previousStatus,
        newStatus: step.status,
        error: 'Step is not an approval/review type',
      };
    }

    step.status = 'AWAITING_APPROVAL';
    step.completionData = { ...step.completionData, ...submissionData };

    await this.logStepRun(step, workflowRun.tenantId, {
      action: 'SUBMITTED',
      performedBy: userId,
      previousStatus,
      newStatus: 'AWAITING_APPROVAL',
      details: submissionData,
    });

    return {
      success: true,
      step,
      previousStatus,
      newStatus: 'AWAITING_APPROVAL',
    };
  }

  /**
   * Approve or reject a step
   */
  async processApproval(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[],
    approved: boolean,
    userId: string,
    comments?: string
  ): Promise<StepTransitionResult> {
    const previousStatus = step.status;

    if (step.status !== 'AWAITING_APPROVAL') {
      return {
        success: false,
        step,
        previousStatus,
        newStatus: step.status,
        error: 'Step is not awaiting approval',
      };
    }

    const completionData: StepCompletionData = {
      ...step.completionData,
      approved,
      approvalComments: comments,
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    };

    if (approved) {
      // Advance the step
      return this.advanceStep(step, workflowRun, allSteps, completionData, userId);
    } else {
      // Rejection - move back to in progress
      step.status = 'IN_PROGRESS';
      step.completionData = completionData;
      workflowRun.metrics = {
        ...workflowRun.metrics,
        reworkCount: (workflowRun.metrics?.reworkCount || 0) + 1,
      };

      await this.logStepRun(step, workflowRun.tenantId, {
        action: 'REJECTED',
        performedBy: userId,
        previousStatus,
        newStatus: 'IN_PROGRESS',
        details: { approvalDecision: 'REJECTED', approvalComments: comments },
      });

      return {
        success: true,
        step,
        previousStatus,
        newStatus: 'IN_PROGRESS',
      };
    }
  }

  // ============================================================
  // ASSET STATE MANAGEMENT (Submission-as-Asset pillar)
  // ============================================================

  /**
   * Transition the asset state
   */
  transitionAssetState(
    workflowRun: WorkflowRun,
    newState: AssetState,
    userId: string
  ): { success: boolean; previousState: AssetState; newState: AssetState } {
    const validTransitions: Record<AssetState, AssetState[]> = {
      'DRAFT': ['REVIEW'],
      'REVIEW': ['APPROVED', 'DRAFT'],
      'APPROVED': ['SUBMITTED'],
      'SUBMITTED': ['ACCEPTED', 'DEFICIENCY'],
      'DEFICIENCY': ['RESPONSE_PENDING'],
      'RESPONSE_PENDING': ['SUBMITTED'],
      'ACCEPTED': ['MARKETED', 'PHASE_1'],
      'WITHDRAWN': [],
      'REJECTED': [],
      'MARKETED': [],
      'PHASE_1': ['PHASE_2', 'WITHDRAWN'],
      'PHASE_2': ['PHASE_3', 'WITHDRAWN'],
      'PHASE_3': ['PHASE_4', 'WITHDRAWN'],
      'PHASE_4': ['MARKETED', 'WITHDRAWN'],
    };

    const currentState = workflowRun.assetState as AssetState;
    const allowed = validTransitions[currentState] || [];

    if (!allowed.includes(newState)) {
      return {
        success: false,
        previousState: currentState,
        newState: currentState,
      };
    }

    workflowRun.previousAssetState = currentState;
    workflowRun.assetState = newState;
    workflowRun.assetStateChangedAt = new Date();
    workflowRun.updatedAt = new Date();
    workflowRun.updatedBy = userId;

    return {
      success: true,
      previousState: currentState,
      newState,
    };
  }

  // ============================================================
  // PRECONDITION EVALUATION
  // ============================================================

  /**
   * Evaluate all preconditions for a step
   */
  async evaluatePreconditions(
    preconditions: Precondition[],
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<PreconditionCheckResult[]> {
    const results: PreconditionCheckResult[] = [];

    for (const precondition of preconditions) {
      const result = await this.evaluateSinglePrecondition(
        precondition,
        workflowRun,
        allSteps
      );
      results.push(result);
    }

    return results;
  }

  private async evaluateSinglePrecondition(
    precondition: Precondition,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<PreconditionCheckResult> {
    const { id, type, target, operator, value } = precondition;

    try {
      switch (type) {
        case 'STEP_COMPLETE': {
          const targetStep = allSteps.find(s => s.id === target || s.name === target);
          const passed = targetStep?.status === 'COMPLETED';
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: targetStep?.status,
            expectedValue: 'COMPLETED',
          };
        }

        case 'DATA_PRESENT': {
          const contextValue = this.getNestedValue(workflowRun.context || {}, target);
          const passed = this.evaluateOperator(operator, contextValue, value);
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: contextValue,
            expectedValue: value,
          };
        }

        case 'APPROVAL_RECEIVED': {
          const targetStep = allSteps.find(s => s.id === target || s.name === target);
          const passed = targetStep?.completionData?.approved === true;
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: targetStep?.completionData?.approved,
            expectedValue: true,
          };
        }

        case 'SIGNATURE_OBTAINED': {
          const targetStep = allSteps.find(s => s.id === target || s.name === target);
          const passed = !!targetStep?.completionData?.signatureId;
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: !!targetStep?.completionData?.signatureId,
            expectedValue: true,
          };
        }

        case 'ARTIFACT_COMPLETE': {
          // Check if artifact exists in linked artifacts
          const passed = workflowRun.context?.linkedArtifacts?.includes(target) || false;
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: passed,
            expectedValue: true,
          };
        }

        case 'ROLE_ASSIGNED': {
          const targetStep = allSteps.find(s => s.id === target || s.name === target);
          const passed = !!targetStep?.assigneeUserId;
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: !!targetStep?.assigneeUserId,
            expectedValue: true,
          };
        }

        case 'DEADLINE_NOT_PASSED': {
          const deadline = new Date(target);
          const passed = new Date() < deadline;
          return {
            preconditionId: id,
            type,
            target,
            passed,
            actualValue: new Date().toISOString(),
            expectedValue: target,
          };
        }

        default:
          return {
            preconditionId: id,
            type,
            target,
            passed: false,
            errorMessage: `Unknown precondition type: ${type}`,
          };
      }
    } catch (error) {
      return {
        preconditionId: id,
        type,
        target,
        passed: false,
        errorMessage: error instanceof Error ? error.message : 'Evaluation error',
      };
    }
  }

  // ============================================================
  // EFFECT EXECUTION
  // ============================================================

  /**
   * Execute all effects for a step
   */
  async executeEffects(
    effects: Effect[],
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<EffectExecutionResult[]> {
    const results: EffectExecutionResult[] = [];

    for (const effect of effects) {
      const result = await this.executeSingleEffect(effect, step, workflowRun, allSteps);
      results.push(result);
    }

    return results;
  }

  private async executeSingleEffect(
    effect: Effect,
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<EffectExecutionResult> {
    const { id, type, target, payload, delay } = effect;

    // Apply delay if specified
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      switch (type) {
        case 'UPDATE_STATE': {
          const newState = target as AssetState;
          const result = this.transitionAssetState(workflowRun, newState, step.completedBy || '');
          return {
            effectId: id,
            type,
            target,
            success: result.success,
            result: { previousState: result.previousState, newState: result.newState },
            executedAt: new Date().toISOString(),
          };
        }

        case 'SEND_NOTIFICATION': {
          // Placeholder - integrate with notification service
          console.log(`[NOTIFICATION] ${target}:`, payload);
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { notificationSent: true },
            executedAt: new Date().toISOString(),
          };
        }

        case 'CREATE_TASK': {
          // Create a follow-up task
          console.log(`[CREATE_TASK] Creating task: ${target}`);
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { taskCreated: true, taskName: target },
            executedAt: new Date().toISOString(),
          };
        }

        case 'TRIGGER_WORKER': {
          // Trigger a background worker
          console.log(`[TRIGGER_WORKER] Triggering: ${target}`);
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { workerTriggered: true, workerName: target },
            executedAt: new Date().toISOString(),
          };
        }

        case 'LOCK_VERSION': {
          // Lock an artifact version
          console.log(`[LOCK_VERSION] Locking: ${target}`);
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { versionLocked: true, artifactId: target },
            executedAt: new Date().toISOString(),
          };
        }

        case 'CREATE_ARTIFACT': {
          // Create an artifact
          console.log(`[CREATE_ARTIFACT] Creating: ${target}`);
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { artifactCreated: true, artifactName: target },
            executedAt: new Date().toISOString(),
          };
        }

        case 'ASSIGN_ROLE': {
          // Assign a role to next step
          const targetStep = allSteps.find(s => s.id === target || s.name === target);
          if (targetStep) {
            targetStep.assigneeRole = payload?.role as string;
          }
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { roleAssigned: payload?.role },
            executedAt: new Date().toISOString(),
          };
        }

        case 'SCHEDULE_REMINDER': {
          // Schedule a reminder
          console.log(`[SCHEDULE_REMINDER] For: ${target}`);
          return {
            effectId: id,
            type,
            target,
            success: true,
            result: { reminderScheduled: true },
            executedAt: new Date().toISOString(),
          };
        }

        default:
          return {
            effectId: id,
            type,
            target,
            success: false,
            errorMessage: `Unknown effect type: ${type}`,
            executedAt: new Date().toISOString(),
          };
      }
    } catch (error) {
      return {
        effectId: id,
        type,
        target,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Execution error',
        executedAt: new Date().toISOString(),
      };
    }
  }

  // ============================================================
  // AUTO-ADVANCE LOGIC
  // ============================================================

  /**
   * Check if a step can auto-advance
   */
  private async checkAutoAdvance(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[],
    userId: string
  ): Promise<void> {
    if (!step.isAutoAdvance || !this.config.enableAutoAdvance) return;

    const preconditionResults = await this.evaluatePreconditions(
      step.preconditions || [],
      workflowRun,
      allSteps
    );

    const allMet = preconditionResults.every(r => r.passed);
    
    if (allMet) {
      await this.advanceStep(step, workflowRun, allSteps, {}, userId);
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private createStepFromDefinition(
    def: WorkflowStepDefinition,
    workflowRunId: string,
    initialStatus: StepStatus
  ): WorkflowStep {
    return {
      id: this.generateId(),
      workflowRunId,
      stepDefinitionId: def.id,
      name: def.name,
      description: def.description || null,
      stepType: def.stepType,
      order: def.order,
      status: initialStatus,
      phaseId: def.phaseId || null,
      phaseName: def.phaseName || null,
      assigneeRole: def.assigneeRole || null,
      assigneeUserId: def.assigneeUserId || null,
      assignedAt: null,
      preconditions: def.preconditions || [],
      preconditionsMet: false,
      preconditionsEvaluatedAt: null,
      failedPreconditions: [],
      effects: def.effects || [],
      effectsExecuted: false,
      effectsExecutedAt: null,
      slaHours: def.slaHours || null,
      slaDueAt: null,
      slaBreached: false,
      slaBreachedAt: null,
      escalationRules: def.escalationRules || [],
      escalationLevel: 0,
      startedAt: null,
      completedAt: null,
      actualDurationMinutes: null,
      linkedArtifactIds: [],
      completionData: null,
      completedBy: null,
      isRequired: def.isRequired,
      isAutoAdvance: def.isAutoAdvance,
      isExpanded: false,
      uiConfig: def.uiConfig || null,
      lastError: null,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private findNextStep(currentStep: WorkflowStep, allSteps: WorkflowStep[]): WorkflowStep | null {
    const sortedSteps = [...allSteps].sort((a, b) => a.order - b.order);
    const currentIndex = sortedSteps.findIndex(s => s.id === currentStep.id);
    
    for (let i = currentIndex + 1; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      if (step.status === 'PENDING' || step.status === 'BLOCKED') {
        return step;
      }
    }
    
    return null;
  }

  private calculateEstimatedCompletion(steps: WorkflowStepDefinition[]): Date {
    const totalSlaHours = steps.reduce((sum, step) => sum + (step.slaHours || 24), 0);
    return new Date(Date.now() + totalSlaHours * 60 * 60 * 1000);
  }

  private async generateTransitionProof(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[],
    previousStatus: string,
    nextStatus: string,
    userId: string,
    nextStepId?: string
  ): Promise<TransitionProof | null> {
    if (!this.config.enableProofSystem) return null;
    const graph = this.getComplianceGraph(workflowRun.id, allSteps);

    const context: ExecutionContext = {
      workflowRunId: workflowRun.id,
      stepId: step.id,
      actor: { userId, role: step.assigneeRole || undefined },
      system: { timestamp: new Date().toISOString() },
      variables: workflowRun.context?.variables || {},
    };

    const evidence: EvidenceBundle = {
      documentHash: workflowRun.stateHash || undefined,
      previousProofHash: this.lastAuditHash || undefined,
      metadata: {
        workflowName: workflowRun.name,
        stepType: step.stepType,
      },
    };

    const fromNodeId = step.id;
    const toNodeId = nextStepId || step.id;
    return graph.executeTransition(fromNodeId, toNodeId, context, evidence);
  }

  private getComplianceGraph(
    workflowRunId: string,
    allSteps: WorkflowStep[]
  ): FormalComplianceGraph {
    const signaturePayload = allSteps
      .map(step => ({
        id: step.id,
        name: step.name,
        order: step.order,
        assigneeRole: step.assigneeRole || null,
      }))
      .sort((a, b) => a.order - b.order);
    const signature = this.hashValue(signaturePayload);
    const cached = this.complianceGraphCache.get(workflowRunId);
    if (cached && cached.signature === signature) {
      return cached.graph;
    }

    const nodes = signaturePayload.map(step => ({ id: step.id, state: step.name }));
    const edges = signaturePayload
      .map((step, idx, arr) => {
        if (idx === arr.length - 1) return null;
        const nextStep = arr[idx + 1];
        return {
          from: step.id,
          to: nextStep.id,
          transition: `${step.name} -> ${nextStep.name}`,
          guardConditions: nextStep.assigneeRole
            ? [{ id: `${nextStep.id}-role`, predicate: `role:${nextStep.assigneeRole}` }]
            : [],
          requiresProof: ['IDENTITY', 'AUTHORIZATION', 'INTEGRITY'],
        };
      })
      .filter(Boolean) as Array<{ from: string; to: string; transition: string; requiresProof: ProofType[] }>;

    const graph = new FormalComplianceGraph(nodes, edges);
    this.complianceGraphCache.set(workflowRunId, { signature, graph });
    return graph;
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private generateStateHash(workflowRun: WorkflowRun, steps: WorkflowStep[]): string {
    const data = {
      id: workflowRun.id,
      status: workflowRun.status,
      assetState: workflowRun.assetState,
      steps: steps
        .map(s => ({ id: s.id, status: s.status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    return createHash('sha256').update(this.stableStringify(data)).digest('hex');
  }

  private async logStepRun(
    step: WorkflowStep,
    tenantId: string,
    data: Partial<StepRun>
  ): Promise<void> {
    if (!this.config.enableAuditHashing) return;

    const entry: Partial<StepRun> = {
      id: this.generateId(),
      workflowStepId: step.id,
      workflowRunId: step.workflowRunId,
      tenantId,
      performedAt: new Date(),
      prevHash: this.lastAuditHash,
      ...data,
    };

    // Generate entry hash
    const hashData = {
      ...entry,
      prevHash: this.lastAuditHash,
    };
    entry.entryHash = createHash('sha256')
      .update(this.stableStringify(hashData))
      .digest('hex');
    this.lastAuditHash = entry.entryHash;

    // In real implementation, persist to database
    console.log('[AUDIT]', entry.action, step.name, entry.entryHash.substring(0, 8));
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private evaluateOperator(operator: string, actual: unknown, expected: unknown): boolean {
    switch (operator) {
      case 'EXISTS':
        return actual !== undefined && actual !== null;
      case 'EQUALS':
        return actual === expected;
      case 'CONTAINS':
        return String(actual).includes(String(expected));
      case 'GREATER_THAN':
        return Number(actual) > Number(expected);
      case 'LESS_THAN':
        return Number(actual) < Number(expected);
      case 'NOT_EMPTY':
        return actual !== undefined && actual !== null && actual !== '' && 
               (Array.isArray(actual) ? actual.length > 0 : true);
      default:
        return false;
    }
  }

  private hashValue(value: string | Record<string, unknown>): string {
    const payload = typeof value === 'string' ? value : this.stableStringify(value);
    return createHash('sha256').update(payload).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map(v => this.stableStringify(v)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${this.stableStringify(val)}`);
    return `{${entries.join(',')}}`;
  }

  // ============================================================
  // PUBLIC API: Query Methods
  // ============================================================

  /**
   * Get next available actions for user
   */
  getNextActions(
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[],
    userId: string
  ): WorkflowStep[] {
    return allSteps.filter(step => 
      (step.status === 'READY' || step.status === 'IN_PROGRESS' || step.status === 'AWAITING_APPROVAL') &&
      (step.assigneeUserId === userId || !step.assigneeUserId)
    );
  }

  /**
   * Get workflow progress summary
   */
  getProgressSummary(workflowRun: WorkflowRun, allSteps: WorkflowStep[]): {
    completed: number;
    inProgress: number;
    pending: number;
    blocked: number;
    total: number;
    percent: number;
  } {
    return {
      completed: allSteps.filter(s => s.status === 'COMPLETED').length,
      inProgress: allSteps.filter(s => s.status === 'IN_PROGRESS').length,
      pending: allSteps.filter(s => s.status === 'PENDING' || s.status === 'READY').length,
      blocked: allSteps.filter(s => s.status === 'BLOCKED').length,
      total: allSteps.length,
      percent: workflowRun.progressPercent,
    };
  }

  /**
   * Get SLA status for all steps
   */
  getSlaStatus(allSteps: WorkflowStep[]): {
    onTrack: WorkflowStep[];
    atRisk: WorkflowStep[];
    breached: WorkflowStep[];
  } {
    const now = new Date();
    const warningThresholdHours = 8;

    const activeSteps = allSteps.filter(
      s => s.status !== 'COMPLETED' && s.status !== 'SKIPPED' && s.slaDueAt
    );

    return {
      onTrack: activeSteps.filter(s => {
        if (!s.slaDueAt) return true;
        const hoursRemaining = (new Date(s.slaDueAt).getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursRemaining > warningThresholdHours;
      }),
      atRisk: activeSteps.filter(s => {
        if (!s.slaDueAt) return false;
        const hoursRemaining = (new Date(s.slaDueAt).getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursRemaining > 0 && hoursRemaining <= warningThresholdHours;
      }),
      breached: activeSteps.filter(s => s.slaBreached || (s.slaDueAt && new Date(s.slaDueAt) < now)),
    };
  }
}

// Export singleton factory
export function createWorkflowEngine(config?: Partial<WorkflowEngineConfig>): WorkflowExecutionEngine {
  return new WorkflowExecutionEngine(config);
}

export default WorkflowExecutionEngine;
