/**
 * Tests for the PDEV readiness scheduler batch driver.
 *
 * The discovery queries are mocked (selectDistinct over activities, then a
 * filtered select over programs) and `pdevReadinessService.snapshot` is
 * mocked so we exercise the batch orchestration: which programs are
 * considered, per-program success / skip / error handling, and the rollup
 * counts.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({
  activityProgramIds: [] as Array<{ programId: string }>,
  programs: [] as Array<{ id: string; organizationId: number }>,
}));

vi.mock('../../../db', () => ({
  db: {
    selectDistinct: () => ({ from: () => Promise.resolve(H.activityProgramIds) }),
    select: () => ({ from: () => ({ where: () => Promise.resolve(H.programs) }) }),
  },
  pool: undefined,
  getPool: () => { throw new Error('not in test scope'); },
}));

const SNAP = vi.hoisted(() => ({
  // Map programId -> behaviour: 'ok' | 'null' | 'throw'
  behaviour: {} as Record<string, 'ok' | 'null' | 'throw'>,
  calls: [] as Array<{ programId: string; trigger: string; actor: number | null }>,
}));

vi.mock('../pdev-readiness-service', () => ({
  pdevReadinessService: {
    snapshot: vi.fn(async (programId: string, _org: number, actor: number | null, trigger: string) => {
      SNAP.calls.push({ programId, trigger, actor });
      const b = SNAP.behaviour[programId] ?? 'ok';
      if (b === 'throw') throw new Error('boom');
      if (b === 'null') return null;
      return { overall: { readinessScore: 42 }, workstreams: [], findings: [] };
    }),
  },
}));

import { pdevReadinessScheduler } from '../pdev-readiness-scheduler';

beforeEach(() => {
  H.activityProgramIds = [];
  H.programs = [];
  SNAP.behaviour = {};
  SNAP.calls.length = 0;
});

describe('pdevReadinessScheduler.snapshotActivePrograms', () => {
  test('no PDEV activity anywhere → considers nothing', async () => {
    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);
    expect(r.programsConsidered).toBe(0);
    expect(r.snapshotted).toBe(0);
    expect(SNAP.calls).toHaveLength(0);
  });

  test('snapshots every active program with trigger=scheduled', async () => {
    H.activityProgramIds = [{ programId: 'p1' }, { programId: 'p2' }];
    H.programs = [
      { id: 'p1', organizationId: 1 },
      { id: 'p2', organizationId: 1 },
    ];
    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);
    expect(r.programsConsidered).toBe(2);
    expect(r.snapshotted).toBe(2);
    expect(SNAP.calls.every(c => c.trigger === 'scheduled')).toBe(true);
    expect(SNAP.calls.every(c => c.actor === 7)).toBe(true);
    expect(r.results.every(x => x.status === 'snapshotted')).toBe(true);
    expect(r.results[0].overallReadiness).toBe(42);
  });

  test('one program failing does not abort the batch', async () => {
    H.activityProgramIds = [{ programId: 'p1' }, { programId: 'p2' }, { programId: 'p3' }];
    H.programs = [
      { id: 'p1', organizationId: 1 },
      { id: 'p2', organizationId: 1 },
      { id: 'p3', organizationId: 1 },
    ];
    SNAP.behaviour = { p2: 'throw' };
    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);
    expect(r.programsConsidered).toBe(3);
    expect(r.snapshotted).toBe(2);
    const p2 = r.results.find(x => x.programId === 'p2');
    expect(p2?.status).toBe('error');
    expect(p2?.detail).toBe('boom');
  });

  test('readiness returning null marks the program skipped', async () => {
    H.activityProgramIds = [{ programId: 'p1' }];
    H.programs = [{ id: 'p1', organizationId: 1 }];
    SNAP.behaviour = { p1: 'null' };
    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);
    expect(r.snapshotted).toBe(0);
    expect(r.results[0].status).toBe('skipped');
  });

  test('candidates with activity but no matching active program are dropped', async () => {
    // 2 programs have activity, but the filtered program query (active +
    // tenant) returns only 1 — the other is archived or another org.
    H.activityProgramIds = [{ programId: 'p1' }, { programId: 'p2' }];
    H.programs = [{ id: 'p1', organizationId: 1 }];
    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);
    expect(r.programsConsidered).toBe(1);
    expect(r.snapshotted).toBe(1);
    expect(SNAP.calls.map(c => c.programId)).toEqual(['p1']);
  });

  test('org-wide run (no organizationId) uses null actor by default', async () => {
    H.activityProgramIds = [{ programId: 'p1' }];
    H.programs = [{ id: 'p1', organizationId: 9 }];
    const r = await pdevReadinessScheduler.snapshotActivePrograms();
    expect(r.snapshotted).toBe(1);
    expect(SNAP.calls[0].actor).toBeNull();
  });
});
