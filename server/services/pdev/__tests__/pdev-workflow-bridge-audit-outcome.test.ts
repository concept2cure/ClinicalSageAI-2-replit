/**
 * WO-16C finding 133 — the PDEV workflow bridge threw away the outcome of its
 * own 21 CFR Part 11 §11.10(e) audit writes.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `auditService.logAction` was deliberately given a return value
 * (`AuditWriteResult`) precisely so a caller can tell whether the audit row
 * actually landed: it never rejects on a persistence failure, by policy, so
 * awaiting it proves nothing and catching it is dead code. All five audit
 * writes in `pdev-workflow-bridge.ts` — the file's only audit writes — were
 * `void auditService.logAction({…})`. The governed rows (checkpoint decision,
 * workflow completion, activity state) commit first; the audit write is then
 * fired and its outcome discarded. When neither durable store accepts the row,
 * the bridge returned an envelope BYTE-IDENTICAL to the success case and the
 * route answered 200, with one `logger.error` line the only trace anywhere
 * that the §11.10(e) record for that approval does not exist.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * At the DEPENDENCY, never at the function under test. `auditService` is NOT
 * mocked — the real one runs. The mocked `server/db` module exports a `pool`
 * whose `connect()` rejects with a Postgres 53300 (connection slots exhausted),
 * which is what both of `logAction`'s stores call first: the chained
 * `audit_logs` transaction and the tamper-proof hash-chain log. Both therefore
 * fail for real, `logAction` resolves `{persisted: false, …}` on its own, and
 * the bridge's own governed writes still succeed through the in-memory drizzle
 * stub — exactly the production shape where the mutation commits and only the
 * audit row is lost.
 *
 * ── RED on the pre-fix code ──────────────────────────────────────────────────
 *   AssertionError: expected undefined to deeply equal { persisted: false, … }
 * and, for the comparison test,
 *   AssertionError: expected { checkpointStatus: 'approved', … } to not deeply
 *   equal { checkpointStatus: 'approved', … }
 * i.e. a lost audit row and a recorded one produced the same envelope.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const PROGRAM_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const CHECKPOINT_ID = '33333333-3333-3333-3333-333333333333';

/** In-memory drizzle stub — the same shape the sibling bridge test uses. */
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
  return {
    tables,
    nextId,
    nameOf,
    reset: () => {
      for (const k of Object.keys(tables)) tables[k] = [];
      seq = 0;
    },
  };
});

/**
 * The audit stores' only dependency. `storeDown` flips BOTH of them: the
 * chained `audit_logs` writer and the tamper-proof log each begin with
 * `pool.connect()`.
 */
const PG = vi.hoisted(() => {
  const state = { storeDown: true };
  const down = () =>
    Object.assign(new Error('remaining connection slots are reserved'), { code: '53300' });
  const client = {
    query: async () => {
      if (state.storeDown) throw down();
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  const pool = {
    connect: async () => {
      if (state.storeDown) throw down();
      return client;
    },
    query: async () => {
      if (state.storeDown) throw down();
      return { rows: [], rowCount: 0 };
    },
    on: () => {},
  };
  return { state, pool };
});

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
    pool: PG.pool,
    getPool: () => PG.pool,
  };
});

vi.mock('../pdev-clearance', () => ({
  applyIndClearanceIfTerminal: async () => ({ cleared: false, alreadyCleared: false }),
}));

import { pdevWorkflowBridge } from '../pdev-workflow-bridge';

function seedProgram() {
  H.tables.regulatory_programs.push({
    id: PROGRAM_ID,
    organizationId: 1,
    productName: 'OR-801',
  });
}

/** One run, one checkpoint — so an approval completes the chain in one call. */
function seedSingleStepChain() {
  seedProgram();
  H.tables.workflow_runs.push({
    id: RUN_ID,
    organizationId: 1,
    programId: PROGRAM_ID,
    workflowType: 'pdev_activity_approval',
    status: 'awaiting_approval',
    currentStepIndex: 0,
    metadata: {
      pdevActivityKey: 'cmc.formulation_development',
      targetState: 'approved',
    },
  });
  H.tables.approval_checkpoints.push({
    id: CHECKPOINT_ID,
    workflowRunId: RUN_ID,
    stepIndex: 0,
    stepName: 'Regulatory approver',
    status: 'awaiting_review',
    requiredApproverRoles: [],
    requiredApproverCount: 1,
    approvals: [],
    rejectionReason: null,
    resolvedAt: null,
  });
  H.tables.pdev_program_activities.push({
    id: 'activity-seed',
    programId: PROGRAM_ID,
    activityKey: 'cmc.formulation_development',
    state: 'human_review_required',
  });
}

const approveOnce = () =>
  pdevWorkflowBridge.recordDecision({
    workflowRunId: RUN_ID,
    checkpointId: CHECKPOINT_ID,
    organizationId: 1,
    userId: 7,
    userRole: 'regulatory_lead',
    decision: 'approve',
    reason: 'Reviewed the dossier and approve promotion.',
  });

beforeEach(() => {
  H.reset();
  PG.state.storeDown = true;
});

describe('pdev workflow bridge: the §11.10(e) audit row did not persist', () => {
  test('kickoff reports the lost audit row instead of a silent success', async () => {
    seedProgram();

    const result = await pdevWorkflowBridge.kickoff({
      programId: PROGRAM_ID,
      organizationId: 1,
      activityKey: 'cmc.formulation_development',
      targetState: 'approved',
      requestedByUserId: 7,
      reason: 'Ready for sign-off',
    });

    // The governed writes DID commit — that is the whole shape of the defect.
    expect(H.tables.workflow_runs).toHaveLength(1);
    expect(H.tables.pdev_program_activities[0].state).toBe('human_review_required');

    // ...and the envelope must say, in the third state, that the audit row did not.
    expect(result.auditTrail.persisted).toBe(false);
    expect(
      result.auditTrail.persisted === false ? result.auditTrail.reason : '',
    ).toMatch(/connection slots|53300/i);
  });

  test('a completing approval reports the lost audit row', async () => {
    seedSingleStepChain();

    const result = await approveOnce();

    // The checkpoint, the run and the activity all moved.
    expect(result.checkpointStatus).toBe('approved');
    expect(result.workflowStatus).toBe('completed');
    expect(result.activityFinalState).toBe('approved');
    expect(H.tables.pdev_program_activities[0].state).toBe('approved');

    expect(result.auditTrail.persisted).toBe(false);
    expect(
      result.auditTrail.persisted === false ? result.auditTrail.reason : '',
    ).toBeTruthy();
  });

  test('a rejection reports the lost audit row', async () => {
    seedSingleStepChain();

    const result = await pdevWorkflowBridge.recordDecision({
      workflowRunId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      organizationId: 1,
      userId: 7,
      userRole: 'regulatory_lead',
      decision: 'reject',
      reason: 'Stability data is incomplete; revise before promotion.',
    });

    expect(result.checkpointStatus).toBe('failed');
    expect(result.auditTrail.persisted).toBe(false);
  });

  test('a lost audit row and a recorded one are not the same envelope', async () => {
    seedSingleStepChain();
    const lost = await approveOnce();

    H.reset();
    PG.state.storeDown = false;
    seedSingleStepChain();
    const recorded = await approveOnce();

    // Pre-fix these were byte-identical, which is the defect: a 200 that cannot
    // be told apart from the one where the §11.10(e) row exists.
    expect(lost).not.toEqual(recorded);
    expect(recorded.auditTrail).toEqual({ persisted: true });
  });
});
