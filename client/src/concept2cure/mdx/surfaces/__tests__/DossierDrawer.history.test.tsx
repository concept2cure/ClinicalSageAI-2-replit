// @vitest-environment jsdom
/**
 * A dossier section's Activity tab is its Part-11 history, so it may show only
 * what the server recorded.
 *
 * It used to render events the dossier store appended from the browser on
 * every edit — actor "You", role "Reg Lead" (hardcoded), a Math.random id —
 * pushed before, and regardless of whether, the governed PATCH succeeded. The
 * history now comes from GET /api/c2c/documents/:id/sections/:key/versions,
 * the rows the c2c_snapshot_section_version trigger writes with the real
 * author and reason for change. These cases pin that source, and that a
 * failed read or a section with no document says so.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DossierDrawer } from '../pathway/PathwayPanes';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

let calls: string[] = [];
function serve(versions: unknown[] | null) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/versions')) {
      return versions === null
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify({ data: versions }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}

function mount(documentId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={client}>
      <DossierDrawer open target={{ id: 11, label: 'Performance testing' }} pathway="k510" documentId={documentId} onClose={() => {}} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: /Activity/ }));
  return r;
}

afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe('DossierDrawer — Activity is the server’s section history', () => {
  it('renders the version rows the server recorded, with author and reason', async () => {
    serve([{ id: '9', version: 3, authorId: 12, authorName: 'Dana Real', authorKind: 'human', reason: 'Updated bench data', occurredAt: '2026-09-01T10:00:00Z' }]);
    const { container } = mount('doc-1');
    await waitFor(() => expect(container.textContent ?? '').toContain('Dana Real'));
    expect(container.textContent).toContain('v3 · Updated bench data');
    expect(calls.some((u) => u.includes('/api/c2c/documents/doc-1/sections/11/versions'))).toBe(true);
    expect(container.textContent).not.toContain('Reg Lead');
  });

  it('says a failed history read failed, rather than showing no activity', async () => {
    serve(null);
    mount('doc-1');
    await waitFor(() => expect(screen.getByTestId('dd-act-error')).toBeTruthy());
    expect(screen.queryByTestId('dd-act-empty')).toBeNull();
  });

  it('says a section with no document has no recorded history', async () => {
    serve([]);
    mount(null);
    expect(screen.getByTestId('dd-act-no-document')).toBeTruthy();
    expect(calls.some((u) => u.includes('/versions'))).toBe(false);
  });
});
