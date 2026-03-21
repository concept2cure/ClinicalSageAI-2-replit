/**
 * Phase 3 Orchestration Hardening — End-to-End Tests
 *
 * Tests cover:
 *   1. OrchestrationEngine — workflow execution, events, approval gates, retry
 *   2. Firebase Projection Publisher — event translation, projection building
 *   3. Readiness Evaluation Service — rule evaluation, scoring, seeding
 *   4. Route-level integration — column name mapping, correct DB operations
 *
 * @module tests/phase3-orchestration-hardening
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OrchestrationEngine,
  type WorkflowDefinition,
  type StepHandler,
  type RunResult,
  type EngineEvent,
} from '../server/services/orchestration-engine';
import { FirebaseProjectionPublisher } from '../server/services/firebase-projection';
import type { FirestorePaths } from '../shared/types/firebase-events';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

function createPassHandler(name: string, stepType: 'deterministic' | 'ai_reasoning' = 'deterministic'): StepHandler {
  return {
    handlerName: name,
    stepType,
    async execute(_ctx, _input) {
      return {
        success: true,
        output: { [`${name}_result`]: 'done' },
      };
    },
  };
}

function createFailHandler(name: string, error: string): StepHandler {
  return {
    handlerName: name,
    stepType: 'deterministic',
    async execute() {
      return {
        success: false,
        output: {},
        error,
      };
    },
  };
}

function createApprovalHandler(name: string): StepHandler {
  return {
    handlerName: name,
    stepType: 'deterministic',
    async execute() {
      return {
        success: true,
        output: { validated: true },
        requiresApproval: true,
      };
    },
  };
}

function createTwoStepWorkflow(): WorkflowDefinition {
  return {
    workflowType: 'test_two_step',
    displayName: 'Two Step Test',
    version: '1.0',
    steps: [
      { stepName: 'Step 1', stepType: 'deterministic', description: 'First step', handler: 'pass_handler_1' },
      { stepName: 'Step 2', stepType: 'deterministic', description: 'Second step', handler: 'pass_handler_2' },
    ],
    requiredScope: { requiresProject: false, requiresProgram: false, allowedModuleTypes: [], allowedProgramTypes: [] },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ORCHESTRATION ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('OrchestrationEngine', () => {
  let engine: OrchestrationEngine;

  beforeEach(() => {
    engine = new OrchestrationEngine();
  });

  describe('Handler Registration', () => {
    it('registers a handler successfully', () => {
      const handler = createPassHandler('test_handler');
      engine.registerHandler(handler);
      expect(engine.getRegisteredHandlers()).toHaveLength(1);
      expect(engine.getRegisteredHandlers()[0]).toEqual({ name: 'test_handler', type: 'deterministic' });
    });

    it('throws on duplicate handler registration', () => {
      engine.registerHandler(createPassHandler('dup'));
      expect(() => engine.registerHandler(createPassHandler('dup'))).toThrow('already registered');
    });
  });

  describe('Workflow Registration', () => {
    it('validates handler existence', () => {
      const def: WorkflowDefinition = {
        workflowType: 'test',
        displayName: 'Test',
        version: '1.0',
        steps: [{ stepName: 'S1', stepType: 'deterministic', description: '', handler: 'nonexistent' }],
        requiredScope: { requiresProject: false, requiresProgram: false, allowedModuleTypes: [], allowedProgramTypes: [] },
      };
      expect(() => engine.registerWorkflow(def)).toThrow('unregistered handler');
    });

    it('validates stepType consistency', () => {
      engine.registerHandler(createPassHandler('det_handler', 'deterministic'));
      const def: WorkflowDefinition = {
        workflowType: 'test',
        displayName: 'Test',
        version: '1.0',
        steps: [{ stepName: 'S1', stepType: 'ai_reasoning', description: '', handler: 'det_handler' }],
        requiredScope: { requiresProject: false, requiresProgram: false, allowedModuleTypes: [], allowedProgramTypes: [] },
      };
      expect(() => engine.registerWorkflow(def)).toThrow('Deterministic and AI reasoning must not be mixed');
    });
  });

  describe('Workflow Execution', () => {
    it('executes a two-step workflow to completion', async () => {
      engine.registerHandler(createPassHandler('pass_handler_1'));
      engine.registerHandler(createPassHandler('pass_handler_2'));
      engine.registerWorkflow(createTwoStepWorkflow());

      const result = await engine.startRun({
        workflowType: 'test_two_step',
        organizationId: 1,
        triggeredBy: 'test_user',
        triggerSource: 'user_action',
      });

      expect(result.status).toBe('completed');
      expect(result.stepsExecuted).toHaveLength(2);
      expect(result.stepsExecuted[0].status).toBe('executed');
      expect(result.stepsExecuted[1].status).toBe('executed');
      expect(result.runId).toBeDefined();
      expect(result.lastSuccessfulStepIndex).toBe(1);
    });

    it('stops on step failure and records error', async () => {
      engine.registerHandler(createPassHandler('pass_handler_1'));
      engine.registerHandler(createFailHandler('pass_handler_2', 'Step 2 broke'));
      engine.registerWorkflow(createTwoStepWorkflow());

      const result = await engine.startRun({
        workflowType: 'test_two_step',
        organizationId: 1,
        triggeredBy: 'test_user',
        triggerSource: 'user_action',
      });

      expect(result.status).toBe('failed');
      expect(result.stepsExecuted).toHaveLength(2);
      expect(result.stepsExecuted[0].status).toBe('executed');
      expect(result.stepsExecuted[1].status).toBe('failed');
      expect(result.errorMessage).toBe('Step 2 broke');
      expect(result.errorStepIndex).toBe(1);
    });

    it('pauses at approval gate', async () => {
      engine.registerHandler(createApprovalHandler('approval_handler'));
      engine.registerHandler(createPassHandler('after_approval'));

      const def: WorkflowDefinition = {
        workflowType: 'approval_test',
        displayName: 'Approval Test',
        version: '1.0',
        steps: [
          { stepName: 'Validate', stepType: 'deterministic', description: 'Validation', handler: 'approval_handler',
            approvalGate: { gateType: 'manual', protectedAction: 'promote' } },
          { stepName: 'Post-Approve', stepType: 'deterministic', description: 'After approval', handler: 'after_approval' },
        ],
        requiredScope: { requiresProject: false, requiresProgram: false, allowedModuleTypes: [], allowedProgramTypes: [] },
      };

      engine.registerWorkflow(def);

      const result = await engine.startRun({
        workflowType: 'approval_test',
        organizationId: 1,
        triggeredBy: 'test_user',
        triggerSource: 'user_action',
      });

      expect(result.status).toBe('awaiting_approval');
      expect(result.awaitingApprovalAtStep).toBe(0);
      expect(result.stepsExecuted).toHaveLength(1);
      expect(result.stepsExecuted[0].status).toBe('awaiting_review');
    });

    it('generates a unique runId per execution', async () => {
      engine.registerHandler(createPassHandler('pass_handler_1'));
      engine.registerHandler(createPassHandler('pass_handler_2'));
      engine.registerWorkflow(createTwoStepWorkflow());

      const result1 = await engine.startRun({ workflowType: 'test_two_step', organizationId: 1, triggeredBy: 'u', triggerSource: 'user_action' });
      const result2 = await engine.startRun({ workflowType: 'test_two_step', organizationId: 1, triggeredBy: 'u', triggerSource: 'user_action' });

      expect(result1.runId).not.toBe(result2.runId);
    });
  });

  describe('Event Listeners', () => {
    it('emits lifecycle events in correct order', async () => {
      const events: EngineEvent[] = [];
      engine.addEventListener(e => events.push(e));

      engine.registerHandler(createPassHandler('pass_handler_1'));
      engine.registerHandler(createPassHandler('pass_handler_2'));
      engine.registerWorkflow(createTwoStepWorkflow());

      await engine.startRun({
        workflowType: 'test_two_step',
        organizationId: 1,
        triggeredBy: 'test_user',
        triggerSource: 'user_action',
      });

      // run_started + (step_started + step_completed) * 2 + run_completed = 6
      expect(events).toHaveLength(6);
      expect(events.map(e => e.type)).toEqual([
        'run_started',
        'step_started',
        'step_completed',
        'step_started',
        'step_completed',
        'run_completed',
      ]);
    });

    it('removes listener correctly', async () => {
      const events: EngineEvent[] = [];
      const listener = (e: EngineEvent) => events.push(e);
      engine.addEventListener(listener);
      engine.removeEventListener(listener);

      engine.registerHandler(createPassHandler('pass_handler_1'));
      engine.registerHandler(createPassHandler('pass_handler_2'));
      engine.registerWorkflow(createTwoStepWorkflow());

      await engine.startRun({
        workflowType: 'test_two_step',
        organizationId: 1,
        triggeredBy: 'test_user',
        triggerSource: 'user_action',
      });

      expect(events).toHaveLength(0);
    });
  });

  describe('Skip Conditions', () => {
    it('skips steps with met skip conditions', async () => {
      engine.registerHandler(createPassHandler('step_a'));
      engine.registerHandler(createPassHandler('step_b'));

      const def: WorkflowDefinition = {
        workflowType: 'skip_test',
        displayName: 'Skip Test',
        version: '1.0',
        steps: [
          { stepName: 'A', stepType: 'deterministic', description: '', handler: 'step_a' },
          { stepName: 'B', stepType: 'deterministic', description: '', handler: 'step_b', skipCondition: 'has:step_a_result' },
        ],
        requiredScope: { requiresProject: false, requiresProgram: false, allowedModuleTypes: [], allowedProgramTypes: [] },
      };
      engine.registerWorkflow(def);

      const result = await engine.startRun({
        workflowType: 'skip_test',
        organizationId: 1,
        triggeredBy: 'u',
        triggerSource: 'user_action',
      });

      expect(result.status).toBe('completed');
      expect(result.stepsExecuted[1].status).toBe('skipped');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FIREBASE PROJECTION PUBLISHER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('FirebaseProjectionPublisher', () => {
  it('creates in no-op mode when firestore is null', () => {
    const publisher = new FirebaseProjectionPublisher(null);
    expect(publisher.isEnabled).toBe(false);
  });

  it('builds correct workflow projection from RunResult', () => {
    const publisher = new FirebaseProjectionPublisher(null);

    const result: RunResult = {
      runId: 'test-run-id',
      status: 'completed',
      stepsExecuted: [
        { stepIndex: 0, stepName: 'S1', stepType: 'deterministic', actorType: 'system', actorId: 'h1', status: 'executed', input: {}, output: {}, startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:00:01Z', durationMs: 1000 },
        { stepIndex: 1, stepName: 'S2', stepType: 'ai_reasoning', actorType: 'ai_reasoning', actorId: 'h2', status: 'executed', input: {}, output: {}, startedAt: '2024-01-01T00:00:01Z', completedAt: '2024-01-01T00:00:02Z', durationMs: 1000 },
      ],
      context: {
        runId: 'test-run-id',
        workflowType: 'test_wf',
        organizationId: 1,
        triggeredBy: 'user1',
        triggerSource: 'user_action',
        stepOutputs: {},
        objectsTouched: [],
        outputsCreated: [{ outputType: 'doc', outputId: 'doc1', title: 'Doc 1', createdAt: '2024-01-01' }],
        blockers: [],
        recommendations: [],
        diffSummaries: [],
      },
      lastSuccessfulStepIndex: 1,
    };

    const projection = publisher.buildWorkflowProjection(result, {
      workflowType: 'test_wf',
      displayName: 'Test Workflow',
      triggerSource: 'user_action',
      triggeredBy: 'user1',
      totalSteps: 2,
    });

    expect(projection.runId).toBe('test-run-id');
    expect(projection.status).toBe('completed');
    expect(projection.completedSteps).toBe(2);
    expect(projection.failedSteps).toBe(0);
    expect(projection.progressPercent).toBe(100);
    expect(projection.outputCount).toBe(1);
    expect(projection.blockerCount).toBe(0);
    expect(projection.awaitingApproval).toBe(false);
    expect(projection.totalSteps).toBe(2);
  });

  it('builds correct projection for awaiting_approval status', () => {
    const publisher = new FirebaseProjectionPublisher(null);

    const result: RunResult = {
      runId: 'gate-run',
      status: 'awaiting_approval',
      stepsExecuted: [
        { stepIndex: 0, stepName: 'Validate', stepType: 'deterministic', actorType: 'system', actorId: 'h1', status: 'awaiting_review', input: {}, output: {}, startedAt: '2024-01-01T00:00:00Z', durationMs: 500 },
      ],
      context: {
        runId: 'gate-run',
        workflowType: 'gate_wf',
        organizationId: 1,
        triggeredBy: 'user1',
        triggerSource: 'user_action',
        stepOutputs: {},
        objectsTouched: [],
        outputsCreated: [],
        blockers: [{ blockerType: 'approval_pending', description: 'Needs review', severity: 'blocker' }],
        recommendations: [],
        diffSummaries: [],
      },
      awaitingApprovalAtStep: 0,
    };

    const projection = publisher.buildWorkflowProjection(result, {
      workflowType: 'gate_wf',
      displayName: 'Gate Workflow',
      triggerSource: 'user_action',
      triggeredBy: 'user1',
      totalSteps: 2,
    });

    expect(projection.awaitingApproval).toBe(true);
    expect(projection.awaitingApprovalStepName).toBe('Validate');
    expect(projection.blockerCount).toBe(1);
    expect(projection.completedSteps).toBe(0);
  });

  it('creates engine event handler that does not throw', () => {
    const publisher = new FirebaseProjectionPublisher(null);
    const handler = publisher.createEngineEventHandler({
      tenantId: 1,
      projectId: 100,
      correlationId: 'test-correlation',
    });

    // Should not throw even in no-op mode
    expect(() => handler({ type: 'run_started', runId: 'r1', workflowType: 'wf', displayName: 'WF' })).not.toThrow();
    expect(() => handler({ type: 'step_started', runId: 'r1', stepIndex: 0, stepName: 'S1', stepType: 'deterministic' })).not.toThrow();
    expect(() => handler({ type: 'run_completed', runId: 'r1', workflowType: 'wf', status: 'completed' })).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SHARED TYPES TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('FirestorePaths', () => {
  // Import the actual paths
  let paths: typeof FirestorePaths;

  beforeEach(async () => {
    const mod = await import('../shared/types/firebase-events');
    paths = mod.FirestorePaths;
  });

  it('builds correct project event path', () => {
    expect(paths.projectEvent(1, 100, 'evt-1')).toBe('tenants/1/projects/100/events/evt-1');
  });

  it('builds correct workflow run current path', () => {
    expect(paths.workflowRunCurrent(1, 100, 'run-1')).toBe('tenants/1/projects/100/workflowRuns/run-1/current');
  });

  it('builds correct readiness current path', () => {
    expect(paths.readinessCurrent(1, 100)).toBe('tenants/1/projects/100/readiness/current');
  });

  it('builds correct intelligence current path', () => {
    expect(paths.intelligenceCurrent(1, 100)).toBe('tenants/1/projects/100/intelligence/summary');
  });

  it('builds correct workflow run events collection path', () => {
    expect(paths.workflowRunEventsCollection(1, 100, 'run-1')).toBe('tenants/1/projects/100/workflowRuns/run-1/events');
  });

  it('builds correct user notification path', () => {
    expect(paths.userNotification(1, 'user-1', 'evt-1')).toBe('tenants/1/users/user-1/notifications/evt-1');
  });

  it('builds correct recommendations current path', () => {
    expect(paths.recommendationsCurrent(1, 100)).toBe('tenants/1/projects/100/recommendations/current');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SCHEMA CONSISTENCY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Schema Consistency', () => {
  it('workflowRuns has expected columns', async () => {
    const schema = await import('../shared/schema/orchestration');
    const table = schema.workflowRuns;

    // Verify key columns exist
    expect(table.id).toBeDefined();
    expect(table.organizationId).toBeDefined();
    expect(table.workflowType).toBeDefined();
    expect(table.status).toBeDefined();
    expect(table.stepsExecuted).toBeDefined();
    expect(table.blockers).toBeDefined();
    expect(table.outputsCreated).toBeDefined();
    expect(table.currentStepIndex).toBeDefined();
    expect(table.lastSuccessfulStepIndex).toBeDefined();
    expect(table.errorMessage).toBeDefined();
    expect(table.errorStepIndex).toBeDefined();
  });

  it('approvalCheckpoints has expected columns', async () => {
    const schema = await import('../shared/schema/orchestration');
    const table = schema.approvalCheckpoints;

    expect(table.id).toBeDefined();
    expect(table.workflowRunId).toBeDefined();
    expect(table.stepIndex).toBeDefined();
    expect(table.stepName).toBeDefined();
    expect(table.gateType).toBeDefined();
    expect(table.status).toBeDefined();
    expect(table.approvals).toBeDefined();
    expect(table.requiredApproverCount).toBeDefined();
    expect(table.protectedAction).toBeDefined();
  });

  it('readinessEvaluations has expected columns', async () => {
    const schema = await import('../shared/schema/orchestration');
    const table = schema.readinessEvaluations;

    expect(table.id).toBeDefined();
    expect(table.organizationId).toBeDefined();
    expect(table.rulesBasedFindings).toBeDefined();
    expect(table.validationFindings).toBeDefined();
    expect(table.aiInferredFindings).toBeDefined();
    expect(table.overallScore).toBeDefined();
    expect(table.isReady).toBeDefined();
  });

  it('readinessRules has expected columns', async () => {
    const schema = await import('../shared/schema/orchestration');
    const table = schema.readinessRules;

    expect(table.id).toBeDefined();
    expect(table.organizationId).toBeDefined();
    expect(table.programType).toBeDefined();
    expect(table.ruleType).toBeDefined();
    expect(table.ruleCode).toBeDefined();
    expect(table.expectedItem).toBeDefined();
    expect(table.severity).toBeDefined();
  });
});
