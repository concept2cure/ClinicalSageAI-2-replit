// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const io = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/queryClient', async importOriginal => ({ ...await importOriginal<object>(), apiRequest: io.request }));
import { useDossierHydration } from '../useDossier';
import { DossierStore } from '../../store/dossierStore';
import { ApiRequestError } from '@/lib/queryClient';

const A = '11111111-1111-4111-8111-111111111111';
const json = (body: unknown) => ({ status: 200, json: async () => body });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useDossierHydration('cer', A), { wrapper });
}
beforeEach(() => { io.request.mockReset(); DossierStore.clearAllPathways(); });
afterEach(() => { cleanup(); DossierStore.clearAllPathways(); });

describe('dossier hydration read outcomes', () => {
  it('keeps an absent secondary report empty without fetching the primary filing outline', async () => {
    io.request.mockResolvedValue(json({ documents: [{ id: 'primary', project_id: A, doc_type: 'k510' }] }));
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe('empty'));
    expect(io.request).toHaveBeenCalledTimes(1);
    expect(result.current.documentId).toBeNull();
  });

  it('hydrates exact project CER content and retains its canonical section key', async () => {
    io.request.mockImplementation(async (_method: string, path: string) => {
      if (path.includes('?projectId=')) return json({ documents: [{ id: 'cer', project_id: A, doc_type: 'cer' }] });
      if (path.endsWith('/outline')) return json({ outline: [{ key: 'C2', label: 'Clinical scope', status: 'draft', has_content: true }] });
      return json({ content: { text: 'Project A clinical evidence' } });
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe('live-data'));
    expect(result.current.documentId).toBe('cer');
    expect(DossierStore.readSectionBody('cer', 'C2', 'Clinical scope')).toBe('Project A clinical evidence');
  });

  it('does not replace a failed content read with an apparently empty section', async () => {
    DossierStore.hydratePathway('cer', 'old', [{ key: 'C2', label: 'Clinical scope', body: 'Old cached content' }]);
    io.request.mockImplementation(async (_method: string, path: string) => {
      if (path.includes('?projectId=')) return json({ documents: [{ id: 'cer', project_id: A, doc_type: 'cer' }] });
      if (path.endsWith('/outline')) return json({ outline: [{ key: 'C2', label: 'Clinical scope', has_content: true }] });
      throw new Error('Document body unavailable');
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.live).toBe(false);
    expect(result.current.documentId).toBeNull();
    expect(DossierStore.readSectionBody('cer', 'C2', 'Clinical scope')).toBe('');
  });

  it('reports an unreadable list as unavailable rather than claiming no report exists', async () => {
    io.request.mockResolvedValue(json({ data: [] }));
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.documentId).toBeNull();
  });

  it('withholds cached sections until the current session revalidates the read', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['dossier', ':', 1, 'cer', A], {
      docId: 'old', sections: [{ key: 'C2', label: 'Clinical scope', body: 'Old cached content' }],
    });
    let rejectRead!: (reason: Error) => void;
    io.request.mockReturnValue(new Promise((_resolve, reject) => { rejectRead = reject; }));
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDossierHydration('cer', A), { wrapper });
    expect(result.current.live).toBe(false);
    expect(result.current.documentId).toBeNull();
    rejectRead(new ApiRequestError('Forbidden', 403));
    await waitFor(() => expect(result.current.status).toBe('permission-denied'));
    expect(DossierStore.readSectionBody('cer', 'C2', 'Clinical scope')).toBe('');
  });
});
