/**
 * QA 2026-10-08, walk 2, j3 (b): a Vault version sent for review was in no
 * reviewer's queue. The board now lists Vault versions in review, each with
 * who may take its next step — the members with signing authority other than
 * its uploader and sender (and the reviewer, for the approval) — scoped like
 * the Authoring rows: "mine" when the reader is one of them, "requested" when
 * the reader sent it.
 */
import { describe, expect, it, vi } from 'vitest';
import { readVaultReviewQueue } from '../vault-review-queue';

const ORG_MEMBERS = [
  { id: 1, name: 'Ada Admin', role: 'admin' },
  { id: 2, name: 'Sam Manager', role: 'manager' },
  { id: 3, name: 'Raj Approver', role: 'approver' },
  { id: 4, name: 'Emily Watson', role: 'reviewer' },
  { id: 36, name: 'QA Onboard 3', role: 'reviewer' },
];
const record = (over: Record<string, unknown> = {}) => ({
  canonical_id: 'C-1', vault_id: 'V-1', program_id: 'P-1', program_name: 'QA-W2 Tolvexa', title: 'Stability protocol',
  version: '3.0', uploader_id: 4, sent_by: 4, sent_by_name: 'Emily Watson', sent_at: '2026-10-08T12:23:23.157Z',
  review_signature: null, ...over,
});

function sqlWith(records: unknown[]) {
  return {
    query: vi.fn(async (text: string) =>
      text.includes('FROM canonical_documents') ? { rows: records } : { rows: ORG_MEMBERS }),
  };
}

describe('Vault versions in review reach the board', () => {
  it('lists an in-review version with who may sign it, leaving out its uploader and sender', async () => {
    const sql = sqlWith([record()]);
    const items = await readVaultReviewQueue({ sql, orgId: 1, userId: '2', scope: 'all', programId: null, limit: 25 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Stability protocol', version: '3.0', step: 'review', sentBy: 'Emily Watson',
      eligibleSigners: ['Ada Admin', 'Raj Approver', 'QA Onboard 3'], mine: false, sentByMe: false,
    });
    expect(sql.query.mock.calls[0][0]).toMatch(/c\.organization_id = \$1 AND c\.stage = 'in_review'/);
    expect(sql.query.mock.calls[0][1]).toEqual([1, null]);
  });

  it("is in an eligible signer's queue, and in the sender's requested list", async () => {
    const mine = await readVaultReviewQueue({ sql: sqlWith([record()]), orgId: 1, userId: '3', scope: 'mine', programId: null, limit: 25 });
    expect(mine.map((i) => i.canonicalId)).toEqual(['C-1']);
    const managers = await readVaultReviewQueue({ sql: sqlWith([record()]), orgId: 1, userId: '2', scope: 'mine', programId: null, limit: 25 });
    expect(managers).toEqual([]);
    const sent = await readVaultReviewQueue({ sql: sqlWith([record()]), orgId: 1, userId: '4', scope: 'requested', programId: 'P-1', limit: 25 });
    expect(sent.map((i) => i.sentByMe)).toEqual([true]);
  });

  it('after the review is signed, waits on the approval, and the reviewer is not offered it', async () => {
    const items = await readVaultReviewQueue({
      sql: sqlWith([record({ review_signature: { actor: '3', signedAt: '2026-10-08T13:00:00Z' } })]),
      orgId: 1, userId: '1', scope: 'all', programId: null, limit: 25,
    });
    expect(items[0]).toMatchObject({ step: 'approve', eligibleSigners: ['Ada Admin', 'QA Onboard 3'], mine: true });
  });

  it('an unreadable member list is null, never an empty list of signers', async () => {
    const sql = { query: vi.fn(async (text: string) => {
      if (text.includes('FROM canonical_documents')) return { rows: [record()] };
      throw new Error('denied');
    }) };
    const items = await readVaultReviewQueue({ sql, orgId: 1, userId: '2', scope: 'all', programId: null, limit: 25 });
    expect(items[0].eligibleSigners).toBeNull();
  });
});
