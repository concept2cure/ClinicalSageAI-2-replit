// @vitest-environment jsdom
/** Same-mounted source reads use the same session lifetime as the admitted document body. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
// Keep the real service, canonical session events and current-read guards.
// Like workbenchDocumentAccess, provide only the provider-facing user hook.
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) };
});
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

import { authService, type AuthUser } from '@/services/portal/authService';
import { DocumentWorkbench } from '../DocumentWorkbench';

const DOC = '10000000-0000-4000-8000-000000000001';
const SEC = '20000000-0000-4000-8000-000000000001';
const PID = '30000000-0000-4000-8000-000000000001';
const OLD_SOURCE = 'Prior-session protocol source';
const CURRENT_SOURCE = 'Replacement-session protocol source';
const AUTHOR: AuthUser = {
  id: '1', organizationId: '7', organizationName: 'Synthetic sponsor',
  firstName: 'Test', lastName: 'Author', displayName: 'Author', email: 'author@example.test',
  roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false,
};
const documentRow = {
  id: DOC, title: 'Current accessible draft', module: null, product_code: null,
  status: 'DRAFT', c2c_document_id: null, updated_at: null, section_count: 1,
};
const sectionRow = {
  id: SEC, doc_id: DOC, code: '1', title: 'Visible section', content: '<p>Current admitted prose.</p>',
  order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null,
};
const emptyRects = () => [] as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
  } as DOMRect);
}
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (body: T) => void;
  const promise = new Promise<T>(answer => { resolve = answer; });
  return { promise, resolve };
}
function sourcePage(title: string) {
  return {
    projectId: PID,
    sources: [{ id: 9, title, extractionStatus: 'extracted', textAvailable: true,
      isCurrent: true, dataEligible: true, originalFileAvailable: true }],
    total: 1, currentTotal: 1, page: { limit: 200, offset: 0 }, window: { shown: 1, truncated: false },
  };
}
function documentRead(url: string, replacement: boolean) {
  const path = url.split('?')[0];
  if (path === `/api/authoring/docs/${DOC}`) return ok({ document: documentRow });
  if (path === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [{ ...sectionRow,
    content: replacement ? '<p>Replacement-session prose.</p>' : sectionRow.content }] });
  if (path === `/api/authoring/docs/${DOC}/citations`) return ok([]);
  return ok({ success: true, sections: [], revisions: [], comments: [], sources: [], citations: [] });
}
function renderWorkbench() {
  return render(<DocumentWorkbench docs={[documentRow]} docsState="ready" status="all" reloadDocs={vi.fn()}
    pinnedDocId={DOC} programId={PID} onNav={vi.fn()} />);
}
async function openSourcePicker() {
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.'));
  fireEvent.click(screen.getByTestId('sources-rail-open'));
  fireEvent.click(await screen.findByRole('button', { name: 'Record a source' }));
}
afterEach(() => {
  cleanup();
  authService.endSession(null);
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  delete window.C2C_PROJECT;
});

describe('same-mounted Workbench source reads retain their canonical session owner', () => {
  it('rejects a prior-session catalog body after replacement prose for the same document and section has settled', async () => {
    authService.setToken('synthetic-owner-before', AUTHOR, 'synthetic-refresh-before');
    const oldCatalog = deferred<unknown>();
    let replacement = false;
    let decodingOldCatalog = false;
    const catalogOwners: Array<'original' | 'replacement'> = [];
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith(`/api/c2c/projects/${PID}/sources?`)) {
        catalogOwners.push(replacement ? 'replacement' : 'original');
        if (replacement) return ok(sourcePage(CURRENT_SOURCE));
        if (catalogOwners.length === 1) return ok(sourcePage(OLD_SOURCE));
        return { ok: true, status: 200, json: () => {
          decodingOldCatalog = true;
          return oldCatalog.promise;
        } } as Response;
      }
      return documentRead(url, replacement);
    });
    renderWorkbench();
    await waitFor(() => expect(catalogOwners).toEqual(['original']));
    await openSourcePicker();
    await waitFor(() => expect(decodingOldCatalog).toBe(true));
    expect(screen.queryByRole('button', { name: OLD_SOURCE })).toBeNull();

    act(() => {
      replacement = true;
      authService.endSession(null);
      authService.setToken('synthetic-owner-after', AUTHOR, 'synthetic-refresh-after');
    });
    // Prove the document is authoritatively readable again with identical IDs;
    // a temporarily hidden/absent document must not make this assertion pass.
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Replacement-session prose.'));
    await act(async () => { oldCatalog.resolve(sourcePage(OLD_SOURCE)); await oldCatalog.promise; });

    expect(document.querySelector('.tiptap')?.textContent).toContain('Replacement-session prose.');
    expect(screen.queryByRole('button', { name: OLD_SOURCE })).toBeNull();
    expect(document.body.textContent).not.toContain(OLD_SOURCE);
    await waitFor(() => expect(catalogOwners).toContain('replacement'));
    await screen.findByRole('button', { name: CURRENT_SOURCE });
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('retains the pending current catalog and editor across ordinary canonical bearer refresh', async () => {
    authService.setToken('synthetic-owner-before', AUTHOR, 'synthetic-refresh-before');
    const currentCatalog = deferred<unknown>();
    let catalogReads = 0;
    let decodingCurrentCatalog = false;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith(`/api/c2c/projects/${PID}/sources?`)) {
        catalogReads += 1;
        if (catalogReads === 1) return ok(sourcePage(OLD_SOURCE));
        return { ok: true, status: 200, json: () => {
          decodingCurrentCatalog = true;
          return currentCatalog.promise;
        } } as Response;
      }
      return documentRead(url, false);
    });
    renderWorkbench();
    await waitFor(() => expect(catalogReads).toBe(1));
    await openSourcePicker();
    await waitFor(() => expect(decodingCurrentCatalog).toBe(true));
    const editor = document.querySelector('.tiptap');
    const readGuard = authService.captureSessionReadGuard();
    const readsBeforeRefresh = catalogReads;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'synthetic-owner-refreshed', refreshToken: 'synthetic-refresh-after', expiresIn: 3600,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(readGuard.sameRevision()).toBe(true);
    expect(document.querySelector('.tiptap')).toBe(editor);
    expect(catalogReads).toBe(readsBeforeRefresh);
    await act(async () => { currentCatalog.resolve(sourcePage(OLD_SOURCE)); await currentCatalog.promise; });

    await screen.findByRole('button', { name: OLD_SOURCE });
    expect(document.querySelector('.tiptap')).toBe(editor);
    expect(editor?.textContent).toContain('Current admitted prose.');
    expect(catalogReads).toBe(readsBeforeRefresh);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
