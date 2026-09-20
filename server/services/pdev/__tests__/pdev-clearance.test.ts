/**
 * Tests for the IND-clearance terminal transition.
 *
 * Single-table (regulatory_programs) stateful mock: select returns the
 * seeded program, update mutates it in place.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ programs: [] as any[] }));
/*
 * `result` is what auditService.logAction RESOLVES — an AuditWriteResult, not
 * void. The previous mock returned undefined, which is indistinguishable from
 * a store that wrote nothing; with the outcome now carried to the caller that
 * distinction is the whole point, so the mock answers the real shape and the
 * failure arm is programmable (WO-16C #133 follow-up review).
 */
const AUDIT = vi.hoisted(() => ({
  calls: [] as any[],
  result: { persisted: true, chained: true } as any,
  throws: null as string | null,
}));

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => H.programs.slice(0, 1) }),
      }),
    }),
    update: () => ({
      set: (vals: any) => ({
        where: () => {
          if (H.programs[0]) Object.assign(H.programs[0], vals);
          return Promise.resolve(undefined);
        },
      }),
    }),
  },
  pool: undefined,
  getPool: () => { throw new Error('not in test scope'); },
}));

vi.mock('../../auditService', () => ({
  default: {
    logAction: async (e: any) => {
      AUDIT.calls.push(e);
      if (AUDIT.throws) throw new Error(AUDIT.throws);
      return AUDIT.result;
    },
  },
}));

import {
  applyIndClearanceIfTerminal,
  IND_CLEARANCE_ACTIVITY_KEY,
} from '../pdev-clearance';

const PROGRAM_ID = '22222222-2222-2222-2222-222222222222';

function seedProgram(overrides: Record<string, unknown> = {}) {
  H.programs.length = 0;
  H.programs.push({
    id: PROGRAM_ID,
    organizationId: 1,
    status: 'active',
    metadata: null,
    ...overrides,
  });
}

beforeEach(() => {
  H.programs.length = 0;
  AUDIT.calls.length = 0;
  AUDIT.result = { persisted: true, chained: true };
  AUDIT.throws = null;
});

describe('applyIndClearanceIfTerminal', () => {
  test('no-op for a non-clearance activity', async () => {
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: 'cmc.formulation_development',
      newState: 'approved',
    });
    expect(r.cleared).toBe(false);
    expect(H.programs[0].status).toBe('active');
    expect(AUDIT.calls).toHaveLength(0);
  });

  test('no-op for the clearance activity in a non-completing state', async () => {
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'in_review',
    });
    expect(r.cleared).toBe(false);
    expect(H.programs[0].status).toBe('active');
  });

  test('clears the program when the clearance activity reaches a completing state', async () => {
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });
    expect(r.cleared).toBe(true);
    expect(H.programs[0].status).toBe('approved');
    expect(H.programs[0].approvalDate).toBeInstanceOf(Date);
    expect((H.programs[0].metadata as any).indClearedAt).toBeTruthy();
    expect((H.programs[0].metadata as any).indClearedBy).toBe(7);
    expect(AUDIT.calls.some(c => c.action === 'pdev_ind_cleared')).toBe(true);
  });

  test('preserves existing metadata when clearing', async () => {
    seedProgram({ metadata: { sponsor: 'Acme Bio', priorField: 1 } });
    await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'approved',
    });
    const meta = H.programs[0].metadata as any;
    expect(meta.sponsor).toBe('Acme Bio');
    expect(meta.priorField).toBe(1);
    expect(meta.indClearedAt).toBeTruthy();
  });

  test('idempotent: already-cleared program does not churn + records noop audit', async () => {
    seedProgram({ status: 'approved', metadata: { indClearedAt: '2026-01-01T00:00:00.000Z' } });
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });
    expect(r.cleared).toBe(false);
    expect(r.alreadyCleared).toBe(true);
    // approvalDate not overwritten (no new Date set).
    expect(H.programs[0].approvalDate).toBeUndefined();
    expect(AUDIT.calls.some(c => c.action === 'pdev_ind_cleared_noop')).toBe(true);
  });

  test('no-op when the program is not in the tenant', async () => {
    // No program seeded → select returns [].
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'approved',
    });
    expect(r.cleared).toBe(false);
    expect(r.alreadyCleared).toBe(false);
  });

  test('completing states all trigger clearance', async () => {
    for (const s of ['approved', 'locked', 'submission_ready', 'submitted'] as const) {
      seedProgram();
      const r = await applyIndClearanceIfTerminal({
        programId: PROGRAM_ID,
        organizationId: 1,
        userId: 7,
        activityKey: IND_CLEARANCE_ACTIVITY_KEY,
        newState: s,
      });
      expect(r.cleared).toBe(true);
    }
  });
});

/*
 * WO-16C #133, follow-up review. The #133 fix carried the §11.10(e) audit
 * outcome through pdev-workflow-bridge and stopped at its door: this module —
 * the one that moves a regulatory program to its TERMINAL IND-cleared state,
 * the most consequential write in the whole PDEV path — still wrote both of its
 * rows with `void auditService.logAction(…)`.
 *
 * `logAction` never rejects on a persistence failure, by deliberate policy; it
 * resolves an AuditWriteResult and says so in `persisted`. Discarding it meant
 * an IND clearance could be recorded NOWHERE while the program row was already
 * moved to 'approved' with an indClearedAt stamp, and every caller — the
 * activity-state route, the AnA set_state command, the bridge's own
 * chain-completion path — received `cleared: true` with nothing to tell the two
 * cases apart. The module's own header says "audit event 'pdev_ind_cleared' via
 * the existing dual-write auditor", which the code could not keep.
 *
 * Failure is injected at the dependency: the audit store answers
 * `persisted: false`, and separately throws.
 */
describe('applyIndClearanceIfTerminal: the audit row is reported, not assumed', () => {
  test('a cleared program reports its audit row as persisted, and whether it is chained', async () => {
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });
    expect(r.cleared).toBe(true);
    expect(r.audit).toEqual({ persisted: true, chained: true });
  });

  test('a tamper-proof-only write is not reported as a retrievable record', async () => {
    // `persisted` is `chained || tamperProof`. Only the chained audit_logs row
    // is the one a customer reads back or exports.
    AUDIT.result = { persisted: true, chained: false };
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });
    expect(r.audit).toEqual({ persisted: true, chained: false });
  });

  test('a store that persists nothing is reported, and the clearance still stands', async () => {
    AUDIT.result = { persisted: false, chained: false, error: 'relation "audit_logs" does not exist' };
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });

    // The governed write already committed — that is the documented policy, and
    // reverting it would be a worse lie than reporting it.
    expect(r.cleared).toBe(true);
    expect(H.programs[0].status).toBe('approved');
    // But the caller is TOLD.
    expect(r.audit).toBeDefined();
    expect(r.audit!.persisted).toBe(false);
    expect(r.audit).toMatchObject({ code: 'AUDIT_ROW_NOT_PERSISTED' });
    // The store's own text never travels — it is in the log line only.
    expect(JSON.stringify(r)).not.toContain('audit_logs');
    expect(JSON.stringify(r)).not.toContain('does not exist');
  });

  test('a throwing audit store is reported the same way, not swallowed', async () => {
    AUDIT.throws = 'connection terminated unexpectedly';
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });
    expect(r.cleared).toBe(true);
    expect(r.audit).toBeDefined();
    expect(r.audit!.persisted).toBe(false);
    expect(JSON.stringify(r)).not.toContain('connection terminated');
  });

  test('the idempotent no-op path reports its audit row too', async () => {
    AUDIT.result = { persisted: false, chained: false, error: 'store down' };
    seedProgram({ status: 'approved', metadata: { indClearedAt: '2026-01-01T00:00:00.000Z' } });
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: IND_CLEARANCE_ACTIVITY_KEY,
      newState: 'submitted',
    });
    expect(r.alreadyCleared).toBe(true);
    expect(r.audit).toBeDefined();
    expect(r.audit!.persisted).toBe(false);
  });

  test('a path that writes no audit row says so, rather than claiming one', async () => {
    seedProgram();
    const r = await applyIndClearanceIfTerminal({
      programId: PROGRAM_ID,
      organizationId: 1,
      userId: 7,
      activityKey: 'cmc.formulation_development',
      newState: 'approved',
    });
    expect(r.cleared).toBe(false);
    expect(AUDIT.calls).toHaveLength(0);
    // No row was attempted, so neither arm of the outcome applies.
    expect(r.audit).toBeUndefined();
  });
});
