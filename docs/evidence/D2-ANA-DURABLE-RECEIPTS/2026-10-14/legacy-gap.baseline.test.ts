/** Expected red baseline: the existing raw legacy insert cannot supply the
 * new exact-extraction/actor/range/payload ledger contract. It stays legacy. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../../server/db.js', () => ({ pool: { query: h.query } }));
import { recordReadReceipt } from '../../../../server/services/vault/document-catalog.service.js';
const base = { documentId: '20000000-0000-4000-8000-000000000002', contentHash: 'a'.repeat(64),
  span: { start: 2, end: 8 }, readBy: 7, threadId: 'thread-1' };
beforeEach(() => { vi.clearAllMocks(); h.query.mockResolvedValue({ rows: [], rowCount: 0 }); });
describe('prior legacy storage cannot establish durable V2 admission', () => {
  it('has no acknowledged stable receipt ID/outcome for a zero-row insert', async () => {
    expect(await recordReadReceipt(base)).toEqual({ receiptId: '30000000-0000-4000-8000-000000000003', outcome: 'recorded' });
  });
  it('persists neither exact extraction identity nor immutable range/payload fingerprint', async () => {
    await recordReadReceipt(base);
    expect(h.query.mock.calls[0][0]).toContain('extraction_sha256');
    expect(h.query.mock.calls[0][0]).toContain('receipt_sha256');
  });
  it('has no identical stable-ID retry protocol in its SQL', async () => {
    await recordReadReceipt(base);
    expect(h.query.mock.calls[0][0]).toContain('ON CONFLICT');
    expect(h.query.mock.calls[0][0]).toContain('RETURNING');
  });
});
