/**
 * A sequence's history (filing-spine design review, open item 3, 2026-10-15).
 *
 * Creation was recorded (SUBMISSION_CREATED) and never shown, and the Builder
 * showed no leaf history. The read is the one ledger's per-record reader over
 * the submission and every leaf of the sequence, removed ones included; the
 * ledger's own SQL is held on pglite in audit-trail-ledger.routes.test.ts
 * ("a record's history across record kinds").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readRecordAuditHistory, requireSubmissionReadStillCurrent } = vi.hoisted(() => ({
  readRecordAuditHistory: vi.fn(),
  requireSubmissionReadStillCurrent: vi.fn(),
}));
vi.mock('../../../routes/audit-trail-ledger.routes', () => ({ readRecordAuditHistory }));
vi.mock('../submission-request-read', () => ({ requireSubmissionReadStillCurrent }));

import { readSubmissionHistoryForRequest, SUBMISSION_HISTORY_WINDOW } from '../submission-history-read';

const ADMITTED = {
  organizationId: 7, userId: 11, submissionId: 5, sequenceId: 21, programId: 'p', projectId: 3,
  applicationType: 'nda', sequenceRegion: 'fda',
};
const CHAIN = { ok: true, rowsChecked: 3, legacyRows: 0 };
const entry = (id: string, event: string, target: string, over: Record<string, unknown> = {}) => ({
  id, event, target, actor: 'Rita Reviewer', at: '2026-10-15T10:00:00.000Z', when: '2026-10-15 10:00', hash: 'h'.repeat(64), seq: 1, reason: null, ...over,
});

const query = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  // The sequence's leaves, a removed one (71) included.
  query.mockResolvedValue({ rows: [{ id: 70, section_code: '2.5' }, { id: 71, section_code: '3.2.P.1' }] });
  requireSubmissionReadStillCurrent.mockResolvedValue(undefined);
  readRecordAuditHistory.mockResolvedValue({
    data: [
      entry('AUD-3', 'Leaf Removed', 'submission_leaf:71', { reason: 'Superseded by the new overview' }),
      entry('AUD-2', 'Leaf Created', 'submission_leaf:70'),
      entry('AUD-1', 'Submission Created', 'submission:5'),
    ],
    meta: { chain: CHAIN },
  });
});

describe("a sequence's history", () => {
  it("reads the submission and every leaf of this sequence, removed ones included, in this organisation", async () => {
    await readSubmissionHistoryForRequest({ query }, ADMITTED);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM submission_leaves/);
    expect(sql).not.toMatch(/deleted_at/);
    expect(params).toEqual([21, 7]);
    expect(readRecordAuditHistory).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({
      tableName: 'submission', recordId: '5', also: [{ tableName: 'submission_leaf', recordId: ['70', '71'] }],
    }));
  });

  it('names who did what, when, at which section, and why, with the chain verdict', async () => {
    const h = await readSubmissionHistoryForRequest({ query }, ADMITTED);
    expect(h.chain).toEqual(CHAIN);
    expect(h.truncated).toBe(false);
    expect(h.entries.map((e) => [e.event, e.section, e.actor, e.reason])).toEqual([
      ['Leaf Removed', '3.2.P.1', 'Rita Reviewer', 'Superseded by the new overview'],
      ['Leaf Created', '2.5', 'Rita Reviewer', null],
      ['Submission Created', null, 'Rita Reviewer', null],
    ]);
  });

  it('says when the history was cut to its newest entries', async () => {
    readRecordAuditHistory.mockResolvedValue({
      data: Array.from({ length: SUBMISSION_HISTORY_WINDOW + 1 }, (_, i) => entry(`AUD-${i}`, 'Leaf Updated', 'submission_leaf:70')),
      meta: { chain: CHAIN },
    });
    const h = await readSubmissionHistoryForRequest({ query }, ADMITTED);
    expect(h.truncated).toBe(true);
    expect(h.entries).toHaveLength(SUBMISSION_HISTORY_WINDOW);
  });

  it('returns nothing when access changed during the read', async () => {
    requireSubmissionReadStillCurrent.mockRejectedValue(new Error('SUBMISSION_ACCESS_CHANGED'));
    await expect(readSubmissionHistoryForRequest({ query }, ADMITTED)).rejects.toThrow('SUBMISSION_ACCESS_CHANGED');
  });
});
