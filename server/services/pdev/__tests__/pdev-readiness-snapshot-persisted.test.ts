/**
 * A readiness snapshot that was never written must not be reported as taken.
 *
 * Found by the adversarial review of the WO-16C #133 conversion, not by the
 * sweep. The reviewer was checking whether a new COMMENT was true — the comment
 * said "the snapshot rows are committed by the call above" — and it was not:
 *
 *     try {
 *       await db.insert(pdevReadinessSnapshots).values(rows as never);
 *     } catch (err) {
 *       logger.error('Failed to persist readiness snapshots', { err, programId });
 *     }
 *     return report;
 *
 * `snapshot()` swallowed its own insert failure and returned the computed report
 * regardless. Unlike an audit row, which accompanies an action that already
 * happened, these rows ARE the action: the whole point of POST
 * /readiness/snapshot is to materialize them. So every caller reported success
 * for a no-op —
 *
 *   - the route answered 201 Created with the report;
 *   - the scheduler counted `snapshotted += 1` and reported the program as
 *     `status: 'snapshotted'`;
 *   - the AnA handler said "Snapshotted readiness; overall N%".
 *
 * and after the #133 conversion the route additionally attached a §11.10(e)
 * audit row saying a snapshot had been taken. A truthful audit entry for a
 * snapshot that does not exist is worse than the silence it replaced.
 *
 * Failure is injected at the dependency: `db.insert` rejects the way a real
 * outage does.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const DB = vi.hoisted(() => ({
  insertThrows: null as string | null,
  inserted: [] as unknown[],
}));

vi.mock('../../../db', () => ({
  db: {
    // computeReadiness's reads are stubbed by the activity/program mocks below;
    // only the snapshot INSERT matters here.
    insert: () => ({
      values: async (rows: unknown) => {
        if (DB.insertThrows) throw new Error(DB.insertThrows);
        DB.inserted.push(rows);
      },
    }),
  },
  pool: undefined,
  getPool: () => { throw new Error('not in test scope'); },
}));

const REPORT = {
  workstreams: [
    { workstream: 'cmc', readinessScore: 42, totalActivities: 3, completedActivities: 1, inFlightActivities: 1, blockedActivities: 0, blockingActivities: 1, blockingResolved: 0 },
  ],
  overall: {
    readinessScore: 42,
    totalActivities: 3,
    completedActivities: 1,
    inFlightActivities: 1,
    blockedActivities: 0,
    blockingActivities: 1,
    blockingResolved: 0,
  },
  findings: [],
};

import { pdevReadinessService } from '../pdev-readiness-service';

beforeEach(() => {
  DB.insertThrows = null;
  DB.inserted.length = 0;
  vi.spyOn(
    pdevReadinessService as unknown as { computeReadiness: () => Promise<unknown> },
    'computeReadiness',
  ).mockResolvedValue(REPORT);
});

describe('pdevReadinessService.snapshot reports whether its rows persisted', () => {
  test('a successful insert is reported as persisted, with the report', async () => {
    const out = await pdevReadinessService.snapshot('prog-1', 1, 7, 'manual');

    expect(out).not.toBeNull();
    expect(out!.persisted).toBe(true);
    expect(out!.report.overall.readinessScore).toBe(42);
    expect(DB.inserted).toHaveLength(1);
  });

  test('a rejected insert is reported as NOT persisted — not as a taken snapshot', async () => {
    DB.insertThrows = 'relation "pdev_readiness_snapshots" does not exist';

    const out = await pdevReadinessService.snapshot('prog-1', 1, 7, 'manual');

    expect(out).not.toBeNull();
    // The computed report is still returned — it is real work and the caller
    // may want to show it — but it is no longer indistinguishable from a
    // snapshot that exists in the table.
    expect(out!.report.overall.readinessScore).toBe(42);
    expect(out!.persisted).toBe(false);
    expect(DB.inserted).toHaveLength(0);
  });

  test('the store’s own error text does not travel in the outcome', async () => {
    DB.insertThrows = 'relation "pdev_readiness_snapshots" does not exist';

    const out = await pdevReadinessService.snapshot('prog-1', 1, 7, 'manual');

    expect(JSON.stringify(out)).not.toMatch(/relation .* does not exist/);
  });

  test('a null compute is still null — absent readiness is not an unpersisted one', async () => {
    (pdevReadinessService as unknown as { computeReadiness: () => Promise<unknown> })
      .computeReadiness = async () => null;

    const out = await pdevReadinessService.snapshot('prog-1', 1, 7, 'manual');

    expect(out).toBeNull();
  });
});
