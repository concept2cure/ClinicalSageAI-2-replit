/**
 * CAT2-19 (2026-10-29): a version approved with a future effective date is
 * pending: not in force until that day. Its signed predecessor stays in force,
 * and the register says so.
 */
import { describe, expect, it, vi } from 'vitest';
import { inForceSummary, isPendingEffective, readInForceReleases } from '../in-force-release';
import type { QmsDocumentRow } from '../document-approval-signature';

const row = (over: Partial<QmsDocumentRow>): QmsDocumentRow => ({
  id: 5, organization_id: 9, doc_number: 'SOP-001', title: 'Complaint handling', doc_type: 'sop', category: null, version: '2.0',
  status: 'effective', effective_date: '2099-01-01', next_review_date: null, author_id: 3, approver_id: 7,
  approved_at: '2026-10-29T09:00:00.000Z', superseded_by_id: null, artifact_id: null, metadata: {}, ...over,
});
const v1 = row({ version: '1.0', effective_date: '2026-06-01', approved_at: '2026-06-01T09:00:00.000Z' });

describe('pending effective', () => {
  it('a future effective date is pending; today or earlier is in force', () => {
    expect(isPendingEffective(row({}), '2026-10-29')).toBe(true);
    expect(isPendingEffective(row({ effective_date: '2026-10-29' }), '2026-10-29')).toBe(false);
    expect(isPendingEffective(row({ status: 'in_review' }), '2026-10-29')).toBe(false);
  });

  it('keeps the signed predecessor in force while the approved successor is pending, and never the pending version itself', async () => {
    const query = vi.fn(async () => ({ rows: [{ document_id: 5, controlled_document: v1 }] }));
    const inForce = await readInForceReleases({ query }, 9, [row({})]);
    expect(inForce.get(5)).toMatchObject({ release: { version: '1.0' }, pendingEffective: true, underRevision: false });
    expect(String((query.mock.calls[0] as unknown as [string])[0])).toMatch(/version IS DISTINCT FROM \(SELECT d\.version FROM qms_documents d/);
    expect(inForceSummary(inForce.get(5))).toMatchObject({ version: '1.0', effectiveDate: '2026-06-01' });
  });

  it('a pending first version has nothing in force, and an effective one is its own release', async () => {
    expect((await readInForceReleases({ query: async () => ({ rows: [] }) }, 9, [row({ version: '1.0' })])).get(5)).toBeUndefined();
    const current = row({ effective_date: '2026-01-01' });
    expect((await readInForceReleases({ query: async () => ({ rows: [] }) }, 9, [current])).get(5)).toEqual({ release: current, underRevision: false });
  });
});
