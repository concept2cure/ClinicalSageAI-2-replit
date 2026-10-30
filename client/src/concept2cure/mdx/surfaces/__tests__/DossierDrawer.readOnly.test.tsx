// @vitest-environment jsdom
/**
 * The dossier drawer shows a filing section's text; it does not edit it.
 *
 * Document store consolidation step 5 (docs/design/DOCUMENT_STORE_CONSOLIDATION.md):
 * the authoring editor is the one editor, and its write-through
 * (server/services/c2c/commit-section-to-filing.ts) is the one writer of
 * c2c_document_sections text. The drawer's Document tab was a second editor
 * that PATCHed that table directly (the deleted mdx/hooks/useSectionSave.ts).
 * It now renders the text read-only and hands editing to the authoring editor
 * through the same `onOpenEditor` the drawer footer already used.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DossierDrawer } from '../pathway/PathwayPanes';
import { DossierStore } from '../../store/dossierStore';

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/authToken')>(),
  getAuthToken: () => 'test-token', getOrgId: () => '7',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'x-organization-id': '7' }),
}));

const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
);

function mount(onOpenEditor = vi.fn(), onClose = vi.fn()) {
  vi.stubGlobal('fetch', fetchMock);
  DossierStore.writeSectionBody('k510', 21, 'Biocompatibility', 'The device is ISO 10993 tested.');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DossierDrawer
        open
        target={{ id: 21, label: 'Biocompatibility' }}
        pathway="k510"
        documentId="doc-1"
        onClose={onClose}
        onOpenEditor={onOpenEditor}
      />
    </QueryClientProvider>,
  );
  return { onOpenEditor, onClose };
}

afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); cleanup(); });

describe('DossierDrawer — the Document tab is read-only', () => {
  it('shows the section text with no editable surface', () => {
    mount();
    const body = screen.getByTestId('dd-doc-readonly');
    expect(body.textContent).toContain('The device is ISO 10993 tested.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    expect(screen.getByText(/written from the authoring editor/i)).toBeTruthy();
  });

  it('"Open in editor" in the Document tab opens the authoring editor on this section', () => {
    const { onOpenEditor, onClose } = mount();
    fireEvent.click(screen.getByTestId('dd-doc-open-editor'));
    expect(onOpenEditor).toHaveBeenCalledWith({ code: 21, label: 'Biocompatibility' });
    expect(onClose).toHaveBeenCalled();
  });

  it('never writes the filing section from the drawer', () => {
    mount();
    const writes = fetchMock.mock.calls.filter((c) => {
      const init = (c as unknown[])[1] as RequestInit | undefined;
      return init?.method && init.method !== 'GET';
    });
    expect(writes).toEqual([]);
  });
});
