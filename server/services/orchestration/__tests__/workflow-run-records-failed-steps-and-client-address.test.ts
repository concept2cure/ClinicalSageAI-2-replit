/**
 * A workflow run records the requester's address, and a failed step as failed.
 *
 * What the orchestrator used to do (VSR finding #9, 2026-10-15):
 *  - executeWorkflow dispatched every action with `ipAddress: '127.0.0.1'`, so
 *    each one's Part 11 row in regulatory_audit_logs (isGxpRelevant: true) said
 *    the loopback interface asked for it, whoever did.
 *  - A dispatched action that returned success:false on a step declared
 *    stopOnFailure:false (run_validation in draft_validate_route) fell through to
 *    status 'completed' and an audit 'step_completed', and the roll-up read
 *    "completed: 5/5 steps succeeded." with the errors sitting on the step.
 *
 * The real dispatcher runs here (action-registry.ts), so the address is read off
 * the audit row it writes, not off an argument the test hands a mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIActionRequest, AIActionExecutionContext, AIActionResponse } from '../../../../shared/types/ai-actions';
import type { CrossObjectReasoningPayload } from '../../../../shared/types/orchestration';

const h = vi.hoisted(() => ({
  auditRows: [] as Array<Record<string, unknown>>,
  contextAddresses: [] as string[],
  validationFails: true,
}));

vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        h.auditRows.push(row);
      },
    }),
    execute: async () => ({ rows: [] }),
  },
}));
vi.mock('../../ai-actions/concurrency-limiter', () => ({
  acquireConcurrencySlot: async () => ({ release: async () => undefined }),
}));
vi.mock('../../ai-actions/distributed-lock', () => ({ acquireLock: async () => null }));

const PAYLOAD: CrossObjectReasoningPayload = {
  project: {
    id: 7, name: 'BX-114 IND', status: 'active', progress: 0,
    totalDocuments: 0, totalTasks: 0, doneTasks: 0, blockedTasks: 0, overdueTasks: 0, taskCountsPartial: false,
  },
  documents: [], artifacts: [], validations: [], tasks: [],
  moduleMap: [], recentActions: [], evidence: [],
  cmcSignals: {
    sourceObjectCount: 0, sourceTypeBreakdown: {}, sectionCount: 0, staleSectionCount: 0,
    contradictions: [],
    contradictionCounts: { critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0 },
  },
  assembledAt: '2026-10-15T00:00:00.000Z',
  lastSignalAt: null,
  scope: { organizationId: 3, projectId: 7 },
};
vi.mock('../cross-object-resolver', () => ({ assembleCrossObjectPayload: async () => PAYLOAD }));

import { registerActionHandler } from '../../ai-actions/action-registry';
import { executeWorkflow } from '../workflow-orchestrator';
import '../templates/draft-validate-route';

registerActionHandler({
  actionType: 'run_validation',
  async execute(request: AIActionRequest, ctx: AIActionExecutionContext): Promise<AIActionResponse> {
    h.contextAddresses.push(ctx.ipAddress);
    return {
      success: !h.validationFails,
      actionType: 'run_validation',
      status: h.validationFails ? 'failed' : 'completed',
      result: null,
      createdObjects: [],
      updatedObjects: [],
      warnings: [],
      errors: h.validationFails ? [{ code: 'NO_TARGET', message: 'Nothing on the project could be validated' }] : [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: '2026-10-15T00:00:00.000Z',
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: [],
    };
  },
});

const REQUEST = {
  templateId: 'draft_validate_route' as const,
  projectId: 7,
  organizationId: 3,
  requestedBy: { userId: 17, userName: 'runner@example.test', userRole: 'admin', organizationId: 3 },
  sourceSurface: 'api' as const,
};

beforeEach(() => {
  h.auditRows = [];
  h.contextAddresses = [];
  h.validationFails = true;
});

describe('a workflow run audits the address the request came from', () => {
  it('writes the requester address on the action audit row, never a loopback literal', async () => {
    await executeWorkflow(REQUEST, { ipAddress: '203.0.113.7' });
    expect(h.auditRows).toHaveLength(1);
    expect(h.auditRows[0].ipAddress).toBe('203.0.113.7');
    expect(h.auditRows[0].isGxpRelevant).toBe(true);
    // The handler's own audit writes read the same address from its context.
    expect(h.contextAddresses).toEqual(['203.0.113.7']);
  });
});

describe('a step whose action failed is a failed step', () => {
  it('records the step failed and audits step_failed, while the run continues past it', async () => {
    const execution = await executeWorkflow(REQUEST, { ipAddress: '203.0.113.7' });
    const step = execution.steps.find((s) => s.stepId === 'run_validation_pass');
    expect(step?.status).toBe('failed');
    expect(step?.errors).toEqual([{ code: 'NO_TARGET', message: 'Nothing on the project could be validated' }]);

    const stepAudit = execution.auditTrail
      .filter((e) => e.stepId === 'run_validation_pass')
      .map((e) => e.action);
    expect(stepAudit).toEqual(['step_started', 'step_failed']);

    // stopOnFailure:false — the later steps still ran.
    expect(execution.steps.filter((s) => s.status === 'completed').map((s) => s.stepId)).toEqual([
      'inspect_state',
      'prepare_draft_plan',
      'generate_recommendations',
      'compile_results',
    ]);
  });

  it('says how many steps succeeded and how many failed', async () => {
    const execution = await executeWorkflow(REQUEST, { ipAddress: '203.0.113.7' });
    expect(execution.result?.summary).toContain('4 of 5 steps succeeded, 1 failed');
    expect(execution.result?.summary).not.toMatch(/5\/5/);
    const final = execution.auditTrail[execution.auditTrail.length - 1];
    expect(final.detail).toContain('4 of 5 steps succeeded, 1 failed');
  });

  it('still reports a clean run as clean', async () => {
    h.validationFails = false;
    const execution = await executeWorkflow(REQUEST, { ipAddress: '203.0.113.7' });
    expect(execution.steps.every((s) => s.status === 'completed')).toBe(true);
    expect(execution.auditTrail.some((e) => e.action === 'step_failed')).toBe(false);
    expect(execution.result?.summary).toContain('5 of 5 steps succeeded, 0 failed');
  });
});
