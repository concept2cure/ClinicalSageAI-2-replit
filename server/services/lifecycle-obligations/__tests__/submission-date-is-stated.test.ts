/**
 * Marking an obligation or an occurrence submitted records the date it was
 * submitted — a date the caller states, never one the server supplies.
 *
 * What setObligationStatusTx and setEventStatusTx used to do: when status was
 * 'submitted' they bound `submittedDate ?? new Date().toISOString().slice(0, 10)`,
 * so PATCH /api/lifecycle/obligations/:id/status (or /events/:id/status)
 * {status:'submitted'} with no date stored TODAY as submitted_date — the date a
 * PSUR, annual report or variation went to the agency, which nobody stated and
 * which a late filing would then read as on time. They now refuse (BAD_INPUT,
 * which the route answers 400) and write nothing.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));

import { setObligationStatusTx, setEventStatusTx } from '../lifecycle-service';

function client() {
  return { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 })) };
}

const TRANSITIONS: Array<[string, typeof setObligationStatusTx]> = [
  ['setObligationStatusTx', setObligationStatusTx],
  ['setEventStatusTx', setEventStatusTx],
];

describe.each(TRANSITIONS)('%s — the submission date is stated, not supplied', (_name, transition) => {
  it('does not record a submission date nobody stated', async () => {
    const c = client();
    const today = new Date().toISOString().slice(0, 10);
    await transition(c, 7, 21, 'submitted').catch(() => undefined);
    const boundDates = c.query.mock.calls.map((call) => call[1]?.[3]);
    expect(boundDates, "today's date was recorded as the submission date").not.toContain(today);
  });

  it('refuses to mark submitted without submittedDate, naming it, and writes nothing', async () => {
    for (const missing of [undefined, null, '']) {
      const c = client();
      await expect(transition(c, 7, 21, 'submitted', missing)).rejects.toMatchObject({
        code: 'BAD_INPUT',
        message: expect.stringMatching(/submittedDate/),
      });
      expect(c.query).not.toHaveBeenCalled();
    }
  });

  it('records the date the caller states', async () => {
    const c = client();
    await transition(c, 7, 21, 'submitted', '2026-09-30');
    expect(c.query.mock.calls[0][1]).toEqual([21, 7, 'submitted', '2026-09-30']);
  });

  it('leaves the recorded date alone on any other transition', async () => {
    const c = client();
    await transition(c, 7, 21, 'approved');
    expect(c.query.mock.calls[0][1]).toEqual([21, 7, 'approved', null]);
  });
});
