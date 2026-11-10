// @vitest-environment jsdom
/** Metadata saves must not leave the one editor's content-save token stale or
 * bless content it has never loaded. Exercise the real Workbench and canvas. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, authService: { getUser: vi.fn().mockReturnValue({ id: 41, organizationId: 7 }),
    captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
    on: actual.authService.on.bind(actual.authService) },
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@example.test' } }) };
});
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

import { ApiRequestError } from '@/lib/queryClient';
import { DocumentWorkbench } from '../DocumentWorkbench';

const DOC = '10000000-0000-4000-8000-000000000108';
const SEC = '20000000-0000-4000-8000-000000000108';
const PID = '30000000-0000-4000-8000-000000000108';
const OPENED = '2026-11-08T10:00:00.000Z';
const TOGGLED = '2026-11-08T10:00:01.000Z';
const SAVED = '2026-11-08T10:00:02.000Z';
const doc = { id: DOC, title: 'Collaborative working document', module: 'M3', product_code: null,
  status: 'DRAFT', c2c_document_id: null, updated_at: OPENED, section_count: 1, client_program_id: PID };
const section = { id: SEC, doc_id: DOC, code: '3.2.P.5', title: 'Control of Drug Product',
  content: '<p>Previously saved assertion.</p>', order_index: 0, updated_at: OPENED,
  track_changes: true, revision_count: 1, comment_count: 0, citation_count: 0 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const editor = () => (document.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
const contentWrites = () => apiRequest.mock.calls.filter(([method, url, body]) => method === 'PATCH'
  && url === `/api/authoring/sections/${SEC}` && body?.content !== undefined);
const toggleWrites = () => apiRequest.mock.calls.filter(([method, url, body]) => method === 'PATCH'
  && url === `/api/authoring/sections/${SEC}` && body?.track_changes !== undefined);
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function read(url: string) {
  if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
  if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
  return ok({ success: true, comments: [], sources: [], citations: [], revisions: [] });
}
let toggleReply: () => Promise<Response>;
beforeEach(() => {
  localStorage.clear();
  toggleReply = async () => ok({ success: true, section: { ...section, track_changes: false, updated_at: TOGGLED } });
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'PATCH' && url === `/api/authoring/sections/${SEC}`) {
      if (body?.track_changes !== undefined) return toggleReply();
      return ok({ success: true, section: { ...section, content: body?.content, revision_count: 2, updated_at: SAVED } });
    }
    return read(url);
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; });
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
  });
}
async function mount() {
  render(<DocumentWorkbench docs={[doc]} docsState="ready" status="all" reloadDocs={vi.fn()}
    pinnedDocId={DOC} programId={PID} onNav={vi.fn()} />);
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toBe('Previously saved assertion.'));
}
async function save(text: string) {
  const count = contentWrites().length;
  act(() => { editor().commands.setContent(`<p>${text}</p>`, { emitUpdate: true }); });
  fireEvent.change(await screen.findByTestId('change-reason'), { target: { value: 'Clarified the saved assertion after review.' } });
  const button = screen.getByTestId('save-section') as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  await waitFor(() => expect(contentWrites()).toHaveLength(count + 1));
  await waitFor(() => expect(screen.queryByText(/Section saved — revision 2 recorded/)).not.toBeNull());
}

describe('Track-changes saves preserve the content version boundary', () => {
  it('sends its loaded token and uses the successful metadata version for the next content save', async () => {
    await mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Track changes' }));
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Track changes' }) as HTMLInputElement).checked).toBe(false));
    expect(toggleWrites()[0][2]).toEqual({ track_changes: false, expectedUpdatedAt: OPENED });
    await save('The author clarified this assertion.');
    expect(contentWrites()[0][2]).toMatchObject({ expectedUpdatedAt: TOGGLED });
  });

  it('keeps the loaded token and unsaved text when a stale metadata toggle is refused', async () => {
    toggleReply = async () => { throw new ApiRequestError('This section was changed by someone else.', 409,
      { error: { code: 'SECTION_CHANGED' } }, 'SECTION_CHANGED'); };
    await mount();
    act(() => { editor().commands.setContent('<p>Unsaved author text.</p>', { emitUpdate: true }); });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Track changes' }));
    await screen.findByText(/Couldn’t change track changes/);
    expect((screen.getByRole('checkbox', { name: 'Track changes' }) as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector('.tiptap')?.textContent).toBe('Unsaved author text.');
    await save('Unsaved author text reapplied.');
    expect(contentWrites()[0][2]).toMatchObject({ expectedUpdatedAt: OPENED });
  });

  it('does not regress a newer content-save token when an older toggle response arrives late', async () => {
    // Adversarial transport ordering: a successful older metadata reply arrives
    // after a newer saved row was adopted. The token must never move backwards.
    const delayed = deferred<Response>();
    toggleReply = () => delayed.promise;
    await mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Track changes' }));
    await waitFor(() => expect(toggleWrites()).toHaveLength(1));
    await save('Newer independently confirmed saved text.');
    await act(async () => { delayed.resolve(ok({ success: true, section: { ...section,
      track_changes: false, updated_at: TOGGLED } })); await delayed.promise; });
    expect(document.querySelector('.tiptap')?.textContent).toBe('Newer independently confirmed saved text.');
    await save('The next author amendment.');
    expect(contentWrites()[1][2]).toMatchObject({ expectedUpdatedAt: SAVED });
  });
});
