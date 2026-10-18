/**
 * Finalizing a study records the date its final report was signed — a date the
 * caller states, never one the server supplies.
 *
 * What setStudyStatusTx used to do: when status was 'finalized' it bound
 * `reportFinalizedDate ?? new Date().toISOString().slice(0, 10)`, so
 * PATCH /api/nonclinical/studies/:id/status {status:'finalized'} with no date
 * stored TODAY as report_finalized_date — a regulatory date nobody stated, on
 * the record Module 4 placement readiness counts. It now refuses (BAD_INPUT,
 * which the route answers 400) and writes nothing.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));

import { setStudyStatusTx } from '../nonclinical-service';

function client() {
  return { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 })) };
}

describe('setStudyStatusTx — the report finalization date is stated, not supplied', () => {
  it('does not record a finalization date nobody stated', async () => {
    const c = client();
    const today = new Date().toISOString().slice(0, 10);
    await setStudyStatusTx(c, 7, 11, 'finalized').catch(() => undefined);
    const boundDates = c.query.mock.calls.map((call) => call[1]?.[3]);
    expect(boundDates, "today's date was recorded as the report finalization date").not.toContain(today);
  });

  it('refuses to finalize without reportFinalizedDate, naming it, and writes nothing', async () => {
    for (const missing of [undefined, null, '']) {
      const c = client();
      await expect(setStudyStatusTx(c, 7, 11, 'finalized', missing)).rejects.toMatchObject({
        code: 'BAD_INPUT',
        message: expect.stringMatching(/reportFinalizedDate/),
      });
      expect(c.query).not.toHaveBeenCalled();
    }
  });

  it('records the date the caller states', async () => {
    const c = client();
    await setStudyStatusTx(c, 7, 11, 'finalized', '2026-09-30');
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(c.query.mock.calls[0][1]).toEqual([11, 7, 'finalized', '2026-09-30']);
  });

  it('leaves the recorded date alone on any other transition', async () => {
    const c = client();
    await setStudyStatusTx(c, 7, 11, 'in_reporting');
    expect(c.query.mock.calls[0][1]).toEqual([11, 7, 'in_reporting', null]);
  });
});
