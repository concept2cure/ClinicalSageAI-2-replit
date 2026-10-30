// @vitest-environment jsdom
/** Exercise source reads/receipts through the real retained Workbench and session guards. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
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
import { useActiveSurfaceContext } from '../../surfaceContext';

const DOC = '10000000-0000-4000-8000-000000000001';
const SEC = '20000000-0000-4000-8000-000000000001';
const NEXT = '20000000-0000-4000-8000-000000000002';
const PID = '30000000-0000-4000-8000-000000000001';
const AUTHOR: AuthUser = { id: '1', organizationId: '7', organizationName: 'Synthetic sponsor',
  firstName: 'Test', lastName: 'Author', displayName: 'Author', email: 'author@example.test',
  roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const doc = { id: DOC, title: 'Current accessible draft', module: null, product_code: null,
  status: 'DRAFT', c2c_document_id: null, updated_at: null, section_count: 2 };
const section = { id: SEC, doc_id: DOC, code: '1', title: 'First section', content: '<p>Current admitted prose.</p>',
  order_index: 0, comment_count: 0, revision_count: 0, citation_count: 1, updated_at: null };
const secondSection = { ...section, id: NEXT, code: '2', title: 'Second section', content: '<p>Second section prose.</p>', order_index: 1 };
const source = (title = 'Current recorded protocol') => ({ citationId: 'current-citation', citedAt: null,
  citationText: null, citedChecksum: null, state: 'unverified', source: { id: 9, title, checksum: null,
    extractionStatus: 'extracted', mimeType: 'application/pdf' } });
const page = { projectId: PID, sources: [{ id: 10, title: 'Eligible current source', extractionStatus: 'extracted',
  textAvailable: true, isCurrent: true, dataEligible: true, originalFileAvailable: true }], total: 1, currentTotal: 1,
  page: { limit: 200, offset: 0 }, window: { shown: 1, truncated: false } };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(answer => { resolve = answer; });
  return { promise, resolve };
}
const emptyRects = () => [] as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
  } as DOMRect);
}
let replacement = false;
let sourceReads: string[] = [];
function read(url: string) {
  const path = url.split('?')[0];
  if (path === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
  if (path === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [
    { ...section, content: replacement ? '<p>Replacement-session prose.</p>' : section.content }, secondSection,
  ] });
  if (url.startsWith(`/api/c2c/projects/${PID}/sources?`)) return ok(page);
  if (path === `/api/authoring/docs/${DOC}/citations`) return ok([{ section_id: SEC, source: 'cre_evidence_source',
    reference_id: '9', source_details: { id: '9', title: 'Current recorded protocol' } }]);
  if (path.endsWith('/sources')) {
    sourceReads.push(path.includes(NEXT) ? NEXT : SEC);
    return ok({ sources: [source(path.includes(NEXT) ? 'Second-section recorded protocol' : undefined)] });
  }
  return ok({ success: true, sections: [], revisions: [], comments: [], sources: [], citations: [] });
}
function mount() {
  return render(<DocumentWorkbench docs={[doc]} docsState="ready" status="all" reloadDocs={vi.fn()}
    pinnedDocId={DOC} programId={PID} onNav={vi.fn()} />);
}
function PublishedSourceContext() {
  const context = useActiveSurfaceContext('document-authoring');
  return <output data-testid="published-source-context">{JSON.stringify(context?.facts ?? null)}</output>;
}
async function openSources() {
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.'));
  fireEvent.click(screen.getByTestId('sources-rail-open'));
  await screen.findByRole('button', { name: 'Record a source' });
}
async function replaceSession() {
  act(() => {
    replacement = true;
    authService.endSession(null);
    authService.setToken('synthetic-owner-after', AUTHOR, 'synthetic-refresh-after');
  });
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Replacement-session prose.'));
}
beforeEach(() => {
  replacement = false; sourceReads = [];
  authService.setToken('synthetic-owner-before', AUTHOR, 'synthetic-refresh-before');
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => read(url));
});
afterEach(() => {
  cleanup(); authService.endSession(null); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); delete window.C2C_PROJECT;
});

describe('Workbench sources require readable document membership', () => {
  it('does not read the previous document section or publish its evidence while the next pinned document sections are pending', async () => {
    const nextDocId = '10000000-0000-4000-8000-000000000002';
    const nextDoc = { ...doc, id: nextDocId, title: 'Next pinned document' };
    const nextSections = deferred<unknown>();
    let switched = false;
    let nextSectionsDecoding = false;
    let previousSectionReadsAfterSwitch = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      const path = url.split('?')[0];
      if (path === `/api/authoring/docs/${nextDocId}`) return ok({ document: nextDoc });
      if (path === `/api/authoring/docs/${nextDocId}/sections`) return { ok: true, status: 200, json: () => {
        nextSectionsDecoding = true; return nextSections.promise;
      } } as Response;
      if (path === `/api/authoring/docs/${nextDocId}/citations`) return ok([]);
      if (switched && path === `/api/authoring/sections/${SEC}/sources`) previousSectionReadsAfterSwitch += 1;
      return read(url);
    });
    const pinned = (id: string) => <><DocumentWorkbench docs={[doc, nextDoc]} docsState="ready" status="all" reloadDocs={vi.fn()}
      pinnedDocId={id} programId={PID} onNav={vi.fn()} /><PublishedSourceContext /></>;
    const view = render(pinned(DOC));
    await openSources();
    await screen.findByText('Current recorded protocol');
    await waitFor(() => expect(JSON.parse(screen.getByTestId('published-source-context').textContent ?? 'null')?.evidenceSourceIds).toEqual(['9']));
    switched = true;
    view.rerender(pinned(nextDocId));
    await waitFor(() => expect(nextSectionsDecoding).toBe(true));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('published-source-context').textContent ?? 'null')?.documentId).toBe(nextDocId));
    await act(async () => { await Promise.resolve(); });

    const published = JSON.parse(screen.getByTestId('published-source-context').textContent ?? 'null');
    expect(published.evidenceSourceIds).toEqual([]);
    expect(previousSectionReadsAfterSwitch).toBe(0);
    expect(document.querySelector('.tiptap')).toBeNull();
    await act(async () => { nextSections.resolve({ sections: [] }); await nextSections.promise; });
  });
});

describe('Workbench source replies stay with the original readable visit', () => {
  it('rejects delayed recorded-section sources after replacement prose settles with the same IDs', async () => {
    const oldBody = deferred<unknown>();
    let decoding = false;
    let replacementSourceReads = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === `/api/authoring/sections/${SEC}/sources`) {
        if (replacement) { replacementSourceReads += 1; return ok({ sources: [source()] }); }
        return { ok: true, status: 200, json: () => { decoding = true; return oldBody.promise; } } as Response;
      }
      return read(url);
    });
    mount();
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.'));
    fireEvent.click(screen.getByTestId('sources-rail-open'));
    await waitFor(() => expect(decoding).toBe(true));
    await replaceSession();
    await act(async () => { oldBody.resolve({ sources: [source('Prior-session recorded safety source')] }); await oldBody.promise; });

    expect(document.body.textContent).not.toContain('Prior-session recorded safety source');
    await screen.findByText('Current recorded protocol');
    expect(replacementSourceReads).toBeGreaterThan(0);
  });

  it.each(['cite', 'remove', 'reread'] as const)('does not apply an earlier section %s receipt to the replacement session', async operation => {
    const pending = deferred<Response>();
    let started = false;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if ((operation === 'cite' && method === 'POST' && url.endsWith('/cite-source'))
        || (operation === 'remove' && method === 'DELETE')
        || (operation === 'reread' && method === 'POST' && url.endsWith('/refresh-token'))) {
        started = true; return pending.promise;
      }
      return read(url);
    });
    mount(); await openSources();
    if (operation === 'cite') {
      fireEvent.click(screen.getByRole('button', { name: 'Record a source' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Eligible current source' }));
    } else {
      const row = (await screen.findByText('Current recorded protocol')).closest('.cmt') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: operation === 'remove' ? 'Remove' : 'Re-read source' }));
    }
    await waitFor(() => expect(started).toBe(true));
    await replaceSession();
    const readsBeforeReceipt = sourceReads.length;
    await act(async () => { pending.resolve(ok({ success: true, created: true, message: 'Earlier session source re-read.' })); await pending.promise; });

    expect(document.body.textContent).not.toContain('Source recorded —');
    expect(document.body.textContent).not.toContain('Citation removed.');
    expect(document.body.textContent).not.toContain('Earlier session source re-read.');
    expect(screen.getByTestId('sources-rail-open').textContent?.replace(/\s+/g, ' ').trim()).toBe('Sources 1');
    expect(sourceReads.length).toBe(readsBeforeReceipt);
  });

  it('retires document-refresh busy state and suppresses old findings and follow-up reads on session replacement', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' && url.endsWith('/refresh-all')
      ? pending.promise : read(url));
    mount(); await openSources();
    fireEvent.click(screen.getByTestId('refresh-all-sources'));
    expect((screen.getByTestId('refresh-all-sources') as HTMLButtonElement).disabled).toBe(true);
    await replaceSession();
    const replacementReady = !(screen.getByTestId('refresh-all-sources') as HTMLButtonElement).disabled;
    const readsBeforeReceipt = sourceReads.length;
    await act(async () => { pending.resolve(ok({ ok: true, refreshed: 0, changed: 0,
      skipped: [{ cite_id: 'old-private-citation', reason: 'source_not_found' }] })); await pending.promise; });

    expect(screen.queryByTestId('refresh-skipped')).toBeNull();
    expect(document.body.textContent).not.toContain('Re-read 0 citations:');
    expect(sourceReads.length).toBe(readsBeforeReceipt);
    expect(replacementReady).toBe(true);
  });

  it.each([false, true])('accepts a current document-refresh receipt and reads the current section (switch=%s)', async switchSection => {
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => method === 'POST' && url.endsWith('/refresh-all')
      ? pending.promise : read(url));
    mount(); await openSources();
    fireEvent.click(screen.getByTestId('refresh-all-sources'));
    if (switchSection) {
      fireEvent.click(screen.getByRole('button', { name: /^2\s*Second section$/ }));
      await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Second section prose.'));
    }
    const expectedSection = switchSection ? NEXT : SEC;
    const readsBeforeReceipt = sourceReads.length;
    await act(async () => { pending.resolve(ok({ ok: true, refreshed: 1, changed: 0, skipped: [] })); await pending.promise; });

    await screen.findByText('Re-read 1 citation: none had changed.');
    await waitFor(() => expect(sourceReads.length).toBeGreaterThan(readsBeforeReceipt));
    expect(sourceReads[sourceReads.length - 1]).toBe(expectedSection);
    await screen.findByText(switchSection ? 'Second-section recorded protocol' : 'Current recorded protocol');
    expect((screen.getByTestId('refresh-all-sources') as HTMLButtonElement).disabled).toBe(false);
  });
});
