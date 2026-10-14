// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { admittedCitationSources, useDocumentCitationAdmission } from '../citationAdmission';
const docId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const source = { id: 5, title: 'Recorded protocol', extractionStatus: 'extracted', isCurrent: true, dataEligible: true, originalFileAvailable: true };
beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

describe('recorded citation metadata and recovery', () => {
  it('preserves an admitted organization-wide historical reference outside the project catalogue', () => {
    const sourceDetails = { id: '5', title: 'Recorded protocol' };
    expect(admittedCitationSources([], [{ sectionId, sourceId: '5', sourceDetails }], sectionId)).toEqual([sourceDetails]);
  });

  it('an authoritative unresolved citation never falls back to a catalogue title', () => {
    expect(admittedCitationSources([source], [{ sectionId, sourceId: '5', sourceDetails: null }], sectionId)).toEqual([]);
  });

  it('retries the same document associations after a read failure', async () => {
    apiRequest.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ section_id: sectionId, source: 'cre_evidence_source', reference_id: '5', source_details: { id: '5', title: source.title } }] });
    const { result } = renderHook(() => useDocumentCitationAdmission(docId, null));
    await waitFor(() => expect(result.current.state).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.admissions).toEqual([]);
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(admittedCitationSources([], result.current.admissions, sectionId)).toEqual([{ id: '5', title: source.title }]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenLastCalledWith('GET', `/api/authoring/docs/${docId}/citations`);
  });
});
