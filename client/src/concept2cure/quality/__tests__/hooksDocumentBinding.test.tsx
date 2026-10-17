// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
const H = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({ useFetchJson: () => ({ data: H.payload, loading: false, error: null, refresh: vi.fn() }) }));
import { useSopRegister } from '../hooks';
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
