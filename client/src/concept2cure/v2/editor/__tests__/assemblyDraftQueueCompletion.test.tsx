// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssemblyPlan, AssemblySection } from '@shared/authoring/assembly';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));

import { useAuthoringAssemblyBuild } from '../useAuthoringAssemblyBuild';
import { publishShellProject } from '../../shellProject';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '33333333-3333-4333-8333-333333333333';
const FIRST = '44444444-4444-4444-8444-444444444444';
const SECOND = '55555555-5555-4555-8555-555555555555';
const THIRD = '66666666-6666-4666-8666-666666666666';
const TEMPLATE = 'builtin:queue-completion';
const SAVED_TEXT = 'Author-reviewed diagnostic assay performance narrative.';

function section(id: string, index: number, content = ''): AssemblySection {
  return { id, doc_id: DOC, code: `3.2.S.${index + 1}`, title: `Scientific section ${index + 1}`,
    content, order_index: index, updated_at: null };
}
function outline(sections: AssemblySection[]): AssemblyPlan {
  return { version: 1, docId: DOC, programId: PROGRAM, templateId: TEMPLATE, selection: { target: 'document' },
    targetSnapshot: 'target', templateSnapshot: 'template', fingerprint: 'fingerprint',
    templateName: 'Scientific reference outline', draftRegion: 'FDA', limitations: ['Reference only'], gaps: [],
    rows: sections.map(saved => ({ code: saved.code, title: saved.title, content: '', ordering: saved.order_index,
      disposition: 'append', aiDraftable: true, aiDraftableReason: 'Scientific narrative', gaps: [] })) };
}
function reply(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function mount() {
  return renderHook(({ editorDirty }) => useAuthoringAssemblyBuild({ docId: DOC, programId: PROGRAM,
    docSealed: false, editorDirty, onStructureBuilt: vi.fn(), onReviewSection: vi.fn() }),
  { initialProps: { editorDirty: false } });
}
function requests(ending: string) {
  return apiRequest.mock.calls.filter(([, path]) => new URL(String(path), 'http://localhost').pathname.endsWith(ending));
}
function fixture(ids = [FIRST, SECOND]) {
  // The confirmed commit was empty. Subsequent scoped reads may see another author's save.
  const committed = ids.map((id, index) => section(id, index));
  let saved = committed.map(row => ({ ...row }));
  let read = async () => reply({ success: true, sections: saved });
  let generate = async (path: string) => reply({ success: true,
    draft: { content: `Candidate for ${path}`, draftId: path, metadata: {} } });
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const pathname = new URL(path, 'http://localhost').pathname;
    if (path === '/api/authoring/templates') return reply({ success: true,
      templates: [{ id: TEMPLATE, name: 'Scientific reference outline' }] });
    if (pathname.endsWith('/assembly/preview')) return reply({ success: true, data: outline(committed) });
    if (pathname.endsWith('/assembly/commit')) return reply({ success: true,
      data: { docId: DOC, programId: PROGRAM, plan: outline(committed), sections: committed } });
    if (method === 'GET' && pathname === '/api/authoring/docs') return reply({ success: true,
      documents: [{ id: DOC, program_id: PROGRAM }] });
    if (method === 'GET' && pathname === `/api/authoring/docs/${DOC}`) return reply({ success: true,
      document: { id: DOC, client_program_id: PROGRAM } });
    if (method === 'GET' && pathname.endsWith('/sections')) return read();
    if (method === 'POST' && pathname.endsWith('/ai/draft')) return generate(path);
    throw new Error(`Unexpected request ${method} ${path}`);
  });
  return { committed, get saved() { return saved; }, set saved(value: AssemblySection[]) { saved = value; },
    setRead: (next: () => Promise<Response>) => { read = next; },
    setGenerate: (next: (path: string) => Promise<Response>) => { generate = next; } };
}
async function prepare(view: ReturnType<typeof mount>) {
  await act(async () => { await view.result.current.loadTemplates(); await view.result.current.chooseTemplate(TEMPLATE); });
  await act(async () => { await view.result.current.preview(); });
  expect(view.result.current.plan).not.toBeNull();
  act(() => { view.result.current.setReason('Prepare missing scientific narratives.'); view.result.current.setWithAna(true); });
}
async function build(view: ReturnType<typeof mount>) {
  await act(async () => { await view.result.current.build(); });
}

beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset();
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`,
    { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM });
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  delete window.C2C_PROJECT;
});

describe('assembly completion when a verified pending section gains saved text', () => {
  it('preserves text found on the initial inspect and prepares the next empty section without accepting either', async () => {
    const data = fixture(); data.saved[0].content = SAVED_TEXT;
    const view = mount(); await prepare(view); await build(view);

    expect(requests('/ai/draft').map(([, path]) => path)).toEqual([`/api/authoring/sections/${SECOND}/ai/draft`]);
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['preserved', 'ready']);
    expect(view.result.current.slots[0]).toMatchObject({ message: expect.stringContaining('preserved'),
      review: { draft: null, body: '', changeReason: '' } });
    expect(Object.keys(view.result.current.reviewSessions)).toEqual([SECOND]);
    expect(view.result.current.phase).toBe('built');
    expect(data.saved[0].content).toBe(SAVED_TEXT);
    expect(data.committed.every(row => row.content === '')).toBe(true);
    expect(requests('/accept')).toHaveLength(0);

    // Ordinary retry never regenerates the preserved section, even if someone later clears it.
    data.saved[0].content = '';
    const count = apiRequest.mock.calls.length;
    await act(async () => { await view.result.current.retryDrafts(); });
    expect(apiRequest).toHaveBeenCalledTimes(count);
  });

  it('explicit retry moves past a now-populated failed first section and drafts the later empty section once', async () => {
    const data = fixture(); data.setGenerate(async () => reply({ message: 'Provider refused' }, 503));
    const view = mount(); await prepare(view); await build(view);
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['failed', 'not-started']);
    data.saved[0].content = SAVED_TEXT;
    data.setGenerate(async path => reply({ success: true, draft: { content: 'Later review candidate', draftId: path } }));

    await act(async () => { await view.result.current.retryDrafts(); });

    expect(requests('/ai/draft').map(([, path]) => path)).toEqual([
      `/api/authoring/sections/${FIRST}/ai/draft`, `/api/authoring/sections/${SECOND}/ai/draft`,
    ]);
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['preserved', 'ready']);
    expect(view.result.current.reviewSessions[FIRST]).toBeUndefined();
    expect(view.result.current.reviewSessions[SECOND].state.body).toBe('Later review candidate');
    expect(view.result.current.phase).toBe('built');
    expect(data.saved[0].content).toBe(SAVED_TEXT);
    expect(requests('/accept')).toHaveLength(0);
  });

  it('finishes an entirely populated pending batch with no manufactured candidate or acceptance', async () => {
    const data = fixture(); data.saved.forEach(row => { row.content = `${SAVED_TEXT} ${row.code}`; });
    const before = data.saved.map(row => ({ ...row }));
    const view = mount(); await prepare(view); await build(view);

    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['preserved', 'preserved']);
    expect(view.result.current.phase).toBe('built');
    expect(view.result.current.message).toMatch(/0 candidates retained/i);
    expect(view.result.current.message).toMatch(/2 saved sections preserved/i);
    expect(view.result.current.message).toMatch(/no candidate is awaiting review/i);
    expect(view.result.current.slots.every(slot => slot.review.draft === null && slot.review.body === '')).toBe(true);
    expect(view.result.current.reviewSessions).toEqual({});
    expect(data.saved).toEqual(before);
    expect(requests('/ai/draft')).toHaveLength(0);
    expect(requests('/accept')).toHaveLength(0);
  });

  it('retains completed review edits while preserving a later changed row and preparing the remaining section', async () => {
    const data = fixture([FIRST, SECOND, THIRD]);
    data.setGenerate(async path => path.includes(SECOND) ? reply({ message: 'Provider refused' }, 503)
      : reply({ success: true, draft: { content: 'First retained candidate', draftId: path } }));
    const view = mount(); await prepare(view); await build(view);
    act(() => {
      const session = view.result.current.reviewSessions[FIRST];
      session.update({ ...session.state, body: 'Reviewed scientific wording', changeReason: 'Compared with assay evidence' });
    });
    data.saved[1].content = SAVED_TEXT;
    data.setGenerate(async path => reply({ success: true, draft: { content: 'Third candidate', draftId: path } }));

    await act(async () => { await view.result.current.retryDrafts(); });

    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['ready', 'preserved', 'ready']);
    expect(view.result.current.reviewSessions[FIRST].state).toMatchObject({ body: 'Reviewed scientific wording', changeReason: 'Compared with assay evidence' });
    expect(requests('/ai/draft').map(([, path]) => path)).toEqual([FIRST, SECOND, THIRD].map(id => `/api/authoring/sections/${id}/ai/draft`));
    expect(requests('/accept')).toHaveLength(0);
  });
});

describe('assembly completion keeps existing refusal and ownership boundaries', () => {
  it.each(['missing', 'wrong-id', 'wrong-code', 'malformed', 'failed-read', 'inaccessible'] as const)(
    'stops rather than treating an unconfirmed %s row as preserved or drafting later sections', async failure => {
      const data = fixture();
      if (failure === 'missing') data.saved = [data.saved[1]];
      if (failure === 'wrong-id') data.saved[0].id = THIRD;
      if (failure === 'wrong-code') data.saved[0].code = '3.2.S.99';
      if (failure === 'malformed') data.setRead(async () => reply({ success: true, sections: [{ ...data.saved[0], content: null }, data.saved[1]] }));
      if (failure === 'failed-read') data.setRead(async () => { throw new Error('Scoped read unavailable'); });
      if (failure === 'inaccessible') data.setRead(async () => reply({ message: 'Forbidden' }, 403));
      const view = mount(); await prepare(view); await build(view);

      expect(view.result.current.slots.map(slot => slot.status)).toEqual(['failed', 'not-started']);
      expect(view.result.current.phase).toBe('stopped');
      expect(view.result.current.slots[0].message).toMatch(/exact saved section could not be confirmed/i);
      expect(view.result.current.reviewSessions).toEqual({});
      expect(requests('/ai/draft')).toHaveLength(0);
      expect(requests('/accept')).toHaveLength(0);
    });

  it.each(['stop', 'editor-change', 'source-change'] as const)(
    'does not preserve or continue after %s during the exact-row read', async transition => {
      const data = fixture(); const pending = deferred<Response>(); data.setRead(() => pending.promise);
      const view = mount(); await prepare(view);
      let operation!: Promise<void>; act(() => { operation = view.result.current.build(); });
      await waitFor(() => expect(requests('/sections')).toHaveLength(1));
      act(() => {
        if (transition === 'stop') view.result.current.stop();
        if (transition === 'editor-change') view.rerender({ editorDirty: true });
        if (transition === 'source-change') view.result.current.adoptSources([{ kind: 'data-room', sourceId: 41 }]);
      });
      data.saved[0].content = SAVED_TEXT;
      await act(async () => { pending.resolve(reply({ success: true, sections: data.saved })); await operation; });

      expect(view.result.current.slots.map(slot => slot.status)).toEqual(['not-started', 'not-started']);
      if (transition !== 'source-change') expect(view.result.current.phase).toBe('stopped');
      else expect(view.result.current.sourceSelection).toEqual([{ kind: 'data-room', sourceId: 41 }]);
      expect(requests('/sections')).toHaveLength(1);
      expect(requests('/ai/draft')).toHaveLength(0);
      expect(requests('/accept')).toHaveLength(0);
    });

  it('still stops on provider refusal after a preserved row, leaving the later empty row unstarted', async () => {
    const data = fixture([FIRST, SECOND, THIRD]); data.saved[0].content = SAVED_TEXT;
    data.setGenerate(async () => reply({ message: 'Provider refused' }, 503));
    const view = mount(); await prepare(view); await build(view);

    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['preserved', 'failed', 'not-started']);
    expect(view.result.current.phase).toBe('stopped');
    expect(view.result.current.reviewSessions).toEqual({});
    expect(requests('/ai/draft').map(([, path]) => path)).toEqual([`/api/authoring/sections/${SECOND}/ai/draft`]);
    expect(requests('/accept')).toHaveLength(0);
  });

  it('an exact-section retry does not preserve or draft the unselected pending rows', async () => {
    const data = fixture([FIRST, SECOND, THIRD]);
    data.setGenerate(async () => reply({ message: 'Provider refused' }, 503));
    const view = mount(); await prepare(view); await build(view);
    data.saved[0].content = SAVED_TEXT;
    data.setGenerate(async path => reply({ success: true, draft: { content: 'Selected candidate', draftId: path } }));
    act(() => view.result.current.chooseTarget(data.saved[1].code));

    await act(async () => { await view.result.current.retryDrafts(); });

    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['failed', 'ready', 'not-started']);
    expect(requests('/ai/draft').map(([, path]) => path)).toEqual([FIRST, SECOND].map(id => `/api/authoring/sections/${id}/ai/draft`));
    expect(view.result.current.reviewSessions[FIRST]).toBeUndefined();
    expect(view.result.current.reviewSessions[THIRD]).toBeUndefined();
    expect(requests('/accept')).toHaveLength(0);
  });

  it('a different source selection never retries or preserves slots retained for the earlier selection', async () => {
    const data = fixture(); data.setGenerate(async () => reply({ message: 'Provider refused' }, 503));
    const view = mount(); await prepare(view); await build(view);
    data.saved[0].content = SAVED_TEXT;
    act(() => { expect(view.result.current.adoptSources([{ kind: 'data-room', sourceId: 41 }])).toBe(true); });
    const count = apiRequest.mock.calls.length;

    await act(async () => { await view.result.current.retryDrafts(); });

    expect(apiRequest).toHaveBeenCalledTimes(count);
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['failed', 'not-started']);
    expect(view.result.current.reviewSessions).toEqual({});
    expect(requests('/accept')).toHaveLength(0);
  });
});
