/**
 * Tests for the IND-clearance terminal transition.
 *
 * Single-table (regulatory_programs) stateful mock: select returns the
 * seeded program, update mutates it in place.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ programs: [] as any[] }));
const AUDIT = vi.hoisted(() => ({ calls: [] as any[] }));

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
  default: { logAction: async (e: any) => { AUDIT.calls.push(e); } },
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
