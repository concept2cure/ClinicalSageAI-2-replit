// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
const H = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({ useFetchJson: () => ({ data: H.payload, loading: false, error: null, refresh: vi.fn() }) }));
import { useReviewDue, useSopRegister } from '../hooks';
afterEach(cleanup);
describe('QMS document adapter', () => {
  it('retains the canonical binding and program rather than losing them between the service and Open control', () => {
    H.payload = { data: [{ id: 4, doc_number: 'SOP-004', title: 'Document control', doc_type: 'sop', version: '1.0', status: 'draft',
      category: null, effective_date: null, next_review_date: null, updated_at: null,
      authoring_document_id: '40000000-0000-4000-8000-000000000002', metadata: { programId: '40000000-0000-4000-8000-000000000001' } }] };
    const { result } = renderHook(useSopRegister);
    expect(result.current.docs?.[0]).toMatchObject({ authoringDocumentId: '40000000-0000-4000-8000-000000000002',
      programId: '40000000-0000-4000-8000-000000000001' });
  });
  it('keeps legacy absence explicit so an unbound draft opens binding setup', () => {
    H.payload = { data: [{ id: 4, doc_number: 'SOP-004', title: 'Document control', doc_type: 'sop', version: '1.0', status: 'draft',
      category: null, effective_date: null, next_review_date: null, updated_at: null }] };
    const { result } = renderHook(useSopRegister);
    expect(result.current.docs?.[0]).toMatchObject({ authoringDocumentId: null, programId: null });
  });
});
describe('the next periodic review the register shows (gap 5.2)', () => {
  const reviewed = { id: 6, doc_number: 'SOP-015', title: 'Supplier controls', doc_type: 'sop', version: '1.0', status: 'effective',
    category: null, effective_date: '2026-01-01', next_review_date: '2026-11-01T00:00:00.000Z', updated_at: null, overdue: false,
    in_force: null, next_review_due: '2027-10-22',
    periodic_review: { signatureId: 91, reviewedAt: '2026-10-22T09:12:00Z', reviewerId: 3, reviewerName: 'R. Reviewer',
      outcome: 'current', nextReviewDate: '2027-10-22', nextDue: '2027-10-22', version: '1.0' } };
  const lastReview = { outcome: 'current', reviewerName: 'R. Reviewer', nextReviewDate: '2027-10-22', version: '1.0' };
  it('is the date due after the last signed review, not the date the approval signed', () => {
    H.payload = { data: [reviewed] };
    expect(renderHook(() => useReviewDue()).result.current.rows?.[0]).toMatchObject({ nextReviewDate: '2027-10-22', version: '1.0', underRevision: false, lastReview });
    expect(renderHook(useSopRegister).result.current.docs?.[0]).toMatchObject({ nextReviewDate: '2027-10-22', lastReview });
  });
  it('is the row date when the server sends no review', () => {
    H.payload = { data: [{ ...reviewed, next_review_due: undefined, periodic_review: undefined }] };
    expect(renderHook(useSopRegister).result.current.docs?.[0]).toMatchObject({ nextReviewDate: '2026-11-01T00:00:00.000Z', lastReview: null });
  });
});
