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
  /*
   * Map programId -> behaviour. `unpersisted` is the fourth case, added with the
   * outcome shape: `snapshot()` used to swallow its own INSERT failure and
   * return the computed report, so this scheduler counted the program as
   * snapshotted and reported `status: 'snapshotted'` for rows that never landed.
   * A total store outage would have reported every program snapshotted.
   */
  behaviour: {} as Record<string, 'ok' | 'null' | 'throw' | 'unpersisted'>,
  calls: [] as Array<{ programId: string; trigger: string; actor: number | null }>,
}));

vi.mock('../pdev-readiness-service', () => ({
  pdevReadinessService: {
    snapshot: vi.fn(async (programId: string, _org: number, actor: number | null, trigger: string) => {
      SNAP.calls.push({ programId, trigger, actor });
      const b = SNAP.behaviour[programId] ?? 'ok';
      if (b === 'throw') throw new Error('boom');
      if (b === 'null') return null;
      // PdevReadinessSnapshotOutcome: the computed report AND whether it stored.
      return {
        report: { overall: { readinessScore: 42 }, workstreams: [], findings: [] },
        persisted: b !== 'unpersisted',
        rowsAttempted: 2,
      };
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

  /*
   * Found by the review of the WO-16C #133 conversion, not by the sweep. The
   * readiness service wrapped its INSERT in a `try` that logged and fell through
   * to `return report`, so a program whose rows never landed was counted here as
   * snapshotted and reported `status: 'snapshotted'`. The batch total was an
   * upper bound presented as a count.
   */
  test('a program whose rows did not store is not counted as snapshotted', async () => {
    H.activityProgramIds = [{ programId: 'p1' }];
    H.programs = [{ id: 'p1', organizationId: 1 }];
    SNAP.behaviour = { p1: 'unpersisted' };

    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);

    expect(r.programsConsidered).toBe(1);
    expect(r.snapshotted).toBe(0);
    expect(r.results[0].status).toBe('not_persisted');
    // The readiness WAS computed — that is real work and is still reported.
    expect(r.results[0].overallReadiness).toBe(42);
    // And it is neither a skip (which computed nothing) nor an error (which threw).
    expect(r.results[0].status).not.toBe('skipped');
    expect(r.results[0].status).not.toBe('error');
  });

  test('a total store outage reports zero snapshotted, not every program', async () => {
    H.activityProgramIds = [{ programId: 'p1' }, { programId: 'p2' }, { programId: 'p3' }];
    H.programs = [
      { id: 'p1', organizationId: 1 },
      { id: 'p2', organizationId: 1 },
      { id: 'p3', organizationId: 1 },
    ];
    SNAP.behaviour = { p1: 'unpersisted', p2: 'unpersisted', p3: 'unpersisted' };

    const r = await pdevReadinessScheduler.snapshotActivePrograms(1, 7);

    expect(r.programsConsidered).toBe(3);
    expect(r.snapshotted).toBe(0);
    expect(r.results.every(x => x.status === 'not_persisted')).toBe(true);
  });
});
