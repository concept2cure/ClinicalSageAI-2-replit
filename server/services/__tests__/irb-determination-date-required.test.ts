/**
 * An IRB / IBC / IACUC determination is recorded with the board's own date.
 *
 * A missing determinationDate was stamped as the day the record was entered,
 * and the approval date and continuing-review expiration were derived from it.
 * A consent document with no version was recorded as '1.0'; a full-committee
 * IACUC review with no reviewer count as reviewed by 1.
 */
import { describe, it, expect, vi } from 'vitest';
import { recordReviewTx as irbReview, addConsentDocumentTx, IrbError } from '../irb/irb-service';
import { recordReviewTx as ibcReview, IbcError } from '../ibc/ibc-service';
import { recordReviewTx as iacucReview, IacucError } from '../iacuc/iacuc-service';

/** A client whose every lookup finds the record, and which records each statement. */
function client() {
  const sql: string[] = [];
  return {
    sql,
    query: vi.fn(async (text: string, _params?: unknown[]) => {
      sql.push(text);
      if (/^\s*SELECT/i.test(text)) return { rows: [{ id: 5, submission_id: null, status: 'submitted' }], rowCount: 1 };
      return { rows: [{ id: 9 }], rowCount: 1 };
    }),
  };
}
const writes = (c: ReturnType<typeof client>) => c.sql.filter((s) => /INSERT|UPDATE/i.test(s));

describe('a determination needs its date', () => {
  it.each([
    ['IRB', () => irbReview(client() as never, 3, 7, 5, { reviewType: 'full_board', outcome: 'approved' }), IrbError],
    ['IBC', () => ibcReview(client() as never, 3, 7, 5, { outcome: 'approved' }), IbcError],
    ['IACUC', () => iacucReview(client() as never, 3, 7, 5, { reviewType: 'designated_member_review', outcome: 'approved' }), IacucError],
  ])('%s refuses a determination with no date rather than stamping today', async (_n, run, Err) => {
    await expect(run()).rejects.toBeInstanceOf(Err);
    await expect(run()).rejects.toThrow(/determinationDate is required/);
  });

  it('refuses a date that is not a calendar date', async () => {
    const c = client();
    await expect(
      irbReview(c as never, 3, 7, 5, { reviewType: 'full_board', outcome: 'approved', determinationDate: '2026-02-30' }),
    ).rejects.toThrow(/determinationDate is required/);
    expect(writes(c)).toEqual([]);
  });

  it('derives the approval from the date the board gave', async () => {
    const c = client();
    const r = await irbReview(c as never, 3, 7, 5, { reviewType: 'full_board', outcome: 'approved', determinationDate: '2026-03-02' });
    // 2026-10-15: this pinned a COMPUTED '2027-03-02' as the expiration on file;
    // with no board-set expiration none is stored (board-expiration-recorded-not-computed.test.ts).
    expect(r.expirationDate).toBeNull();
    const insert = c.query.mock.calls.find(([t]) => /INSERT INTO irb_reviews/.test(String(t)));
    expect(insert?.[1]).toContain('2026-03-02');
    const approve = c.query.mock.calls.find(([t]) => /UPDATE irb_submissions SET status = 'approved'/.test(String(t)));
    expect(approve?.[1]).toEqual([5, 3, 'full_board', '2026-03-02', null]);
  });
});

describe('the other facts a board record carries', () => {
  it('a consent document is recorded with its own version, not 1.0', async () => {
    const c = client();
    await expect(addConsentDocumentTx(c as never, 3, 7, 5, { documentName: 'ICF main' })).rejects.toThrow(/version is required/);
    expect(writes(c)).toEqual([]);
  });

  it('a full-committee IACUC review names its reviewer count', async () => {
    const c = client();
    await expect(
      iacucReview(c as never, 3, 7, 5, { reviewType: 'full_committee_review', outcome: 'approved', determinationDate: '2026-03-02' }),
    ).rejects.toThrow(/reviewerCount is required/);
  });
});
