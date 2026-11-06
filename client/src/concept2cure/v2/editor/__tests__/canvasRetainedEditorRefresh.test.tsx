// @vitest-environment jsdom
/** The retained canvas/editor adopts saved AnA revisions without rebasing unsaved human text. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '181', organizationId: '18', displayName: 'Synthetic author', email: 'assembly@example.test' } }),
}));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));

import { ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { publishShellProject } from '../../shellProject';
import { clearEditorTarget } from '../../editorTarget';
import { DocumentCanvas } from '../DocumentCanvas';
import { PID, DOC, SEC, SECOND, AT, doc, section, emptySection, ok, user, bearer, editorNode, deferred } from './workbenchAssemblyBuild.testSupport';

const NEXT_AT = '2026-10-17T20:05:00Z';
const LATEST_AT = '2026-10-17T20:10:00Z';
const ORIGINAL = 'Existing saved stability evidence.';
const HUMAN = 'Human amendment retained locally. ';
const ANA = 'Saved AnA revision from the retained source.';
const LATEST = 'Newest saved revision after the second AnA turn.';
const toast = vi.fn();
type SavedSection = typeof section;
let savedSections: SavedSection[];
let nextSectionRead: (() => Response | Promise<Response>) | null;

for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

function sectionsResponse(rows = savedSections) { return ok({ success: true, sections: rows }); }
function revise(text: string, updatedAt = NEXT_AT) {
  savedSections = savedSections.map(row => row.id === SEC ? { ...row, content: `<p>${text}</p>`, updated_at: updatedAt } : row);
}
function Host({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = React.useState(false);
  return <DocumentCanvas docId={DOC} programId={PID} conversationId="retained-editor-thread"
    fromThisConversation expanded={expanded} onExpandedChange={setExpanded}
    onNav={vi.fn()} onAsk={vi.fn()} fireToast={toast} refreshKey={refreshKey} />;
}
async function opened() {
  const view = render(<Host refreshKey={0} />);
  const open = await screen.findByTestId('dc-open-editor');
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(open);
  await waitFor(() => expect(editorNode()?.textContent).toContain(ORIGINAL));
  return view;
}
async function cardContains(text: string) {
  await waitFor(() => expect(document.querySelector('.dcv-sec-body')?.textContent).toContain(text));
}
function humanEdit() {
  act(() => { editorNode().editor.commands.insertContent(HUMAN); });
}
async function saveCollisionKeepsOldBase(original: HTMLElement) {
  expect(editorNode()).toBe(original);
  expect(editorNode().textContent).toContain(HUMAN.trim());
  expect(editorNode().textContent).not.toContain(ANA);
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason for change' }),
    { target: { value: 'Retain deliberate human amendment against the loaded revision.' } });
  fireEvent.click(screen.getByTestId('save-section'));
  await waitFor(() => expect(apiRequest.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(1));
  const write = apiRequest.mock.calls.find(([method]) => method === 'PATCH');
  expect(write?.[2]).toMatchObject({ expectedUpdatedAt: AT });
  expect(write?.[2]?.content).toContain(HUMAN.trim());
  await screen.findByText(/Not saved.*changed by someone else while you were editing/);
  expect(editorNode()).toBe(original);
  expect(editorNode().textContent).toContain(HUMAN.trim());
  expect(screen.getByTestId('save-section').textContent).not.toContain('Saved');
}

beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); toast.mockReset();
  savedSections = [{ ...section }]; nextSectionRead = null;
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: user() })));
  await authService.adoptSession(bearer());
  publishShellProject({ id: PID });
  apiRequest.mockReset().mockImplementation(async (method: string, url: string) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (method === 'PATCH') throw new ApiRequestError('This section was changed by someone else.', 409,
      { success: false, code: 'SECTION_CHANGED' }, 'SECTION_CHANGED');
    if (pathname === `/api/authoring/docs/${DOC}`) return ok({ success: true,
      document: { ...doc, updated_at: savedSections[0].updated_at } });
    if (pathname === `/api/authoring/docs/${DOC}/sections`) {
      if (nextSectionRead) { const read = nextSectionRead; nextSectionRead = null; return read(); }
      return sectionsResponse();
    }
    if (pathname === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'Retained source project', program_type: 'ind', phase: 'planning' });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    if (url.includes('/sources')) return ok({ success: true, sources: [] });
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  publishShellProject({ id: '' }); vi.unstubAllGlobals();
});

describe('AnA saved revisions and the retained one editor', () => {
  it('reopens the clean retained editor on the saved revision shown by the refreshed canvas', async () => {
    const view = await opened();
    fireEvent.click(screen.getByTestId('dc-back'));
    revise(ANA);
    view.rerender(<Host refreshKey={1} />);
    await cardContains(ANA);
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    await waitFor(() => expect(editorNode()?.textContent).toContain(ANA));
    expect(editorNode()?.textContent).not.toContain(ORIGINAL);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });

  it.each(['before-read', 'while-read-pending'] as const)('keeps the human buffer and old save base when edited %s', async timing => {
    const view = await opened();
    const original = editorNode();
    const held = deferred<Response>();
    let started = false;
    if (timing === 'before-read') humanEdit();
    else nextSectionRead = () => { started = true; return held.promise; };
    revise(ANA);
    view.rerender(<Host refreshKey={1} />);
    if (timing === 'while-read-pending') {
      await waitFor(() => expect(started).toBe(true));
      humanEdit();
      await act(async () => { held.resolve(sectionsResponse()); });
    }
    await cardContains(ANA);
    await saveCollisionKeepsOldBase(original);
  });

  it('ignores an older delayed saved refresh after a newer revision has reached the editor', async () => {
    const view = await opened();
    const held = deferred<Response>();
    let started = false;
    revise(ANA);
    const older = sectionsResponse();
    nextSectionRead = () => { started = true; return held.promise; };
    view.rerender(<Host refreshKey={1} />);
    await waitFor(() => expect(started).toBe(true));
    revise(LATEST, LATEST_AT);
    view.rerender(<Host refreshKey={2} />);
    try {
      await cardContains(LATEST);
      await waitFor(() => expect(editorNode()?.textContent).toContain(LATEST));
    } finally {
      await act(async () => { held.resolve(older); });
    }
    expect(editorNode()?.textContent).toContain(LATEST);
    expect(editorNode()?.textContent).not.toContain(ANA);
    expect(document.querySelector('.dcv-sec-body')?.textContent).toContain(LATEST);
  });

  it('preserves the current editor instance when only another section changes', async () => {
    savedSections = [{ ...section }, { ...emptySection }];
    const view = await opened();
    const original = editorNode();
    savedSections = savedSections.map(row => row.id === SECOND
      ? { ...row, content: '<p>New source-backed content in another section.</p>', updated_at: NEXT_AT } : row);
    view.rerender(<Host refreshKey={1} />);
    await waitFor(() => expect(screen.getByTestId('dc-updated').textContent).toContain(emptySection.code));
    expect(editorNode()).toBe(original);
    expect(editorNode().textContent).toContain(ORIGINAL);
    expect(screen.getByTestId('save-section').textContent).toContain('Saved');
  });
});

describe('a confirmed human save and an older pending refresh in the same render batch', () => {
  it('keeps the confirmed save version as the base for the next edit', async () => {
    const view = await opened();
    const original = editorNode();
    const read = deferred<Response>();
    const save = deferred<Response>();
    const normal = apiRequest.getMockImplementation()!;
    let refreshReads = 0;
    let patchCalls = 0;
    let quietStarted = false;
    let savedBody: { content: string; expectedUpdatedAt?: string } | undefined;
    apiRequest.mockImplementation(async (method: string, url: string, body?: { content: string; expectedUpdatedAt?: string }) => {
      if (method === 'GET' && new URL(url, 'http://localhost').pathname === `/api/authoring/docs/${DOC}/sections`) {
        if (++refreshReads === 2) { quietStarted = true; return read.promise; }
      }
      if (method === 'PATCH') {
        if (++patchCalls === 1) { savedBody = body; return save.promise; }
        if (body?.expectedUpdatedAt !== NEXT_AT) throw new ApiRequestError('The saved section has changed.', 409,
          { success: false, code: 'SECTION_CHANGED' }, 'SECTION_CHANGED');
        return ok({ success: true, section: { ...section, content: body.content, updated_at: LATEST_AT, revision_count: 3 } });
      }
      return normal(method, url, body);
    });
    // The canvas verifies A, then its retained Workbench starts a second, quiet read of A.
    view.rerender(<Host refreshKey={1} />);
    await waitFor(() => expect(quietStarted).toBe(true));
    humanEdit();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for change' }),
      { target: { value: 'Record the human amendment before accepting another saved revision.' } });
    fireEvent.click(screen.getByTestId('save-section'));
    await waitFor(() => expect(patchCalls).toBe(1));
    expect(savedBody?.expectedUpdatedAt).toBe(AT);
    const confirmed = { ...section, content: savedBody!.content, updated_at: NEXT_AT, revision_count: 2 };
    savedSections = [confirmed];
    // Both JSON reads settle in this act: the save queues B before the stale read queues A,
    // while render-time refs still name A. The transport is the only mocked boundary.
    await act(async () => {
      save.resolve(ok({ success: true, section: confirmed }));
      read.resolve(ok({ success: true, sections: [{ ...section }] }));
    });
    await waitFor(() => expect(screen.getByTestId('save-section').textContent).toContain('Saved'));
    expect(editorNode()).toBe(original);
    expect(editorNode().textContent).toContain(HUMAN.trim());
    act(() => { editorNode().editor.commands.insertContent('Follow-up human amendment. '); });
    fireEvent.click(screen.getByTestId('save-section'));
    await waitFor(() => expect(patchCalls).toBe(2));
    const writes = apiRequest.mock.calls.filter(([method]) => method === 'PATCH');
    expect(writes[1][2]).toMatchObject({ expectedUpdatedAt: NEXT_AT });
    expect(editorNode().textContent).toContain('Follow-up human amendment.');
  });
});
