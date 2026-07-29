/**
 * Tests for the PDEV workflow bridge.
 *
 * The state-machine decision logic is extracted into the pure
 * `decideCheckpointOutcome` function and tested exhaustively with no DB.
 * The kickoff orchestration is tested with a stateful in-memory mock.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    regulatory_programs: [],
    pdev_program_activities: [],
    workflow_runs: [],
    approval_checkpoints: [],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;
  function nameOf(t: any): string {
    const n = t?.[Symbol.for('drizzle:Name')];
    return typeof n === 'string' ? n : 'unknown';
  }
  return { tables, nextId, nameOf, reset: () => {
    for (const k of Object.keys(tables)) tables[k] = [];
    seq = 0;
  } };
});

const AUDIT = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock('../../../db', () => {
  function readChain(tableName: string) {
    const rows = () => H.tables[tableName] ?? [];
    const node: any = {
      where: () => node,
      innerJoin: () => node,
      leftJoin: () => node,
      orderBy: () => node,
      limit: () => rows(),
      then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
    };
    return node;
  }
  return {
    db: {
      select: () => ({ from: (t: unknown) => readChain(H.nameOf(t)) }),
      insert: (t: unknown) => {
        const name = H.nameOf(t);
        return {
          values: (vals: any) => {
            const arr = Array.isArray(vals) ? vals : [vals];
            const inserted = arr.map(v => ({ ...v, id: v.id ?? H.nextId(name) }));
            H.tables[name].push(...inserted);
            return { returning: () => inserted };
          },
        };
      },
      update: (t: unknown) => {
        const name = H.nameOf(t);
        return {
          set: (vals: any) => ({
            where: () => {
              const arr = H.tables[name];
              const row = arr[arr.length - 1];
              if (row) Object.assign(row, vals);
              return {
                returning: () => (row ? [row] : []),
                then: (res: any) => Promise.resolve(undefined).then(res),
              };
            },
          }),
        };
      },
    },
    pool: undefined,
    getPool: () => { throw new Error('not in test scope'); },
  };
});

vi.mock('../../auditService', () => ({
  default: { logAction: async (e: any) => { AUDIT.calls.push(e); } },
}));

vi.mock('../pdev-clearance', () => ({
  applyIndClearanceIfTerminal: async () => ({ cleared: false, alreadyCleared: false }),
}));

import {
  decideCheckpointOutcome,
  pdevWorkflowBridge,
} from '../pdev-workflow-bridge';

beforeEach(() => {
  H.reset();
  AUDIT.calls.length = 0;
});

describe('decideCheckpointOutcome — pure state machine', () => {
  test('reject → failed/failed/rejected regardless of counts', () => {
    expect(
      decideCheckpointOutcome({ decision: 'reject', approvalsCountAfter: 5, requiredCount: 1, hasNextProposedCheckpoint: true })
    ).toEqual({ checkpointStatus: 'failed', workflowStatus: 'failed', outcome: 'rejected' });
  });

  test('approve below quorum → partial, checkpoint stays awaiting_review', () => {
    expect(
      decideCheckpointOutcome({ decision: 'approve', approvalsCountAfter: 1, requiredCount: 2, hasNextProposedCheckpoint: true })
    ).toEqual({ checkpointStatus: 'awaiting_review', workflowStatus: 'awaiting_approval', outcome: 'partial' });
  });

  test('approve meeting quorum with next checkpoint → advanced', () => {
    expect(
      decideCheckpointOutcome({ decision: 'approve', approvalsCountAfter: 1, requiredCount: 1, hasNextProposedCheckpoint: true })
    ).toEqual({ checkpointStatus: 'approved', workflowStatus: 'awaiting_approval', outcome: 'advanced' });
  });

  test('approve meeting quorum with NO next checkpoint → completed', () => {
    expect(
      decideCheckpointOutcome({ decision: 'approve', approvalsCountAfter: 2, requiredCount: 2, hasNextProposedCheckpoint: false })
    ).toEqual({ checkpointStatus: 'approved', workflowStatus: 'completed', outcome: 'completed' });
  });

  test('requiredCount of 0 is treated as 1 (always needs ≥1 approval)', () => {
    const r = decideCheckpointOutcome({ decision: 'approve', approvalsCountAfter: 1, requiredCount: 0, hasNextProposedCheckpoint: false });
    expect(r.outcome).toBe('completed');
    const r2 = decideCheckpointOutcome({ decision: 'approve', approvalsCountAfter: 0, requiredCount: 0, hasNextProposedCheckpoint: false });
    expect(r2.outcome).toBe('partial');
  });
});

describe('pdevWorkflowBridge.kickoff — orchestration', () => {
  const PROGRAM_ID = '11111111-1111-1111-1111-111111111111';

  function seedProgram() {
    H.tables.regulatory_programs.push({
      id: PROGRAM_ID,
      organizationId: 1,
      productName: 'OR-801',
    });
  }

  test('rejects a non-completing target state', async () => {
    seedProgram();
    await expect(
      pdevWorkflowBridge.kickoff({
        programId: PROGRAM_ID,
        organizationId: 1,
        activityKey: 'cmc.formulation_development',
        targetState: 'in_review' as any,
        requestedByUserId: 7,
      })
    ).rejects.toThrow(/only used for promotions/);
  });

  test('rejects an unknown activity key', async () => {
    seedProgram();
    await expect(
      pdevWorkflowBridge.kickoff({
        programId: PROGRAM_ID,
        organizationId: 1,
        activityKey: 'not.a.real.key',
        targetState: 'approved',
        requestedByUserId: 7,
      })
    ).rejects.toThrow(/Unknown PDEV activity/);
  });

  test('rejects when the program is not in the tenant', async () => {
    // No program seeded.
    await expect(
      pdevWorkflowBridge.kickoff({
        programId: PROGRAM_ID,
        organizationId: 1,
        activityKey: 'cmc.formulation_development',
        targetState: 'approved',
        requestedByUserId: 7,
      })
    ).rejects.toThrow(/not found in tenant/);
  });

  test('happy path creates a workflow run + 2 checkpoints and holds the activity', async () => {
    seedProgram();
    const result = await pdevWorkflowBridge.kickoff({
      programId: PROGRAM_ID,
      organizationId: 1,
      activityKey: 'cmc.formulation_development',
      targetState: 'approved',
      requestedByUserId: 7,
      reason: 'Ready for sign-off',
    });

    expect(result.workflowRunId).toBeTruthy();
    expect(result.checkpointIds.length).toBe(2); // default 2-step chain
    expect(result.holdingState).toBe('human_review_required');

    // One workflow_runs row created, awaiting_approval.
    expect(H.tables.workflow_runs).toHaveLength(1);
    expect(H.tables.workflow_runs[0].status).toBe('awaiting_approval');
    expect(H.tables.workflow_runs[0].workflowType).toBe('pdev_activity_approval');

    // Two checkpoints; first awaiting_review, second proposed.
    expect(H.tables.approval_checkpoints).toHaveLength(2);
    expect(H.tables.approval_checkpoints[0].status).toBe('awaiting_review');
    expect(H.tables.approval_checkpoints[1].status).toBe('proposed');

    // Activity row created in human_review_required.
    expect(H.tables.pdev_program_activities).toHaveLength(1);
    expect(H.tables.pdev_program_activities[0].state).toBe('human_review_required');

    // Audit event emitted.
    expect(AUDIT.calls.some(c => c.action === 'pdev_workflow_kickoff')).toBe(true);
  });
});
