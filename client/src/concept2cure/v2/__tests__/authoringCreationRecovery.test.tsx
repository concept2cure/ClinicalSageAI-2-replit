// @vitest-environment jsdom
/** Existing create drawer + real C2CForm, with synthetic transport only. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { startNewDocument } from '../newDocumentAction';
import { publishShellProject } from '../shellProject';
import { ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest,
}));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TEMPLATE = 'regional-template';
const ACTOR = { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] };
const BEARER = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
type Kind = 'document' | 'section';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function props() {
  return {
    docId: 'D1', docTitle: 'Existing document', docStatus: 'DRAFT', module: 'M2',
    programId: A, programSwitchHeld: false,
    fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn(), onCheckCreation: vi.fn(() => true),
  };
}
function postCalls() { return apiRequest.mock.calls.filter(call => call[0] === 'POST'); }
function receipt(kind: Kind, project = A) {
  return kind === 'document'
    ? { success: true, document: { id: 'D-created', title: 'New document', client_program_id: project, template_id: null } }
    : { success: true, section: { id: 'S-created', code: '2.6.6', doc_id: 'D1' } };
}
async function open(kind: Kind) {
  fireEvent.click(screen.getByRole('button', { name: kind === 'document' ? /New document/ : /New section/ }));
  await screen.findByRole('dialog', { name: kind === 'document' ? 'New document' : 'New section' });
}
function fill(kind: Kind) {
  if (kind === 'document') fireEvent.change(screen.getByRole('textbox', { name: /Document title/ }), { target: { value: 'New document' } });
  else {
    fireEvent.change(screen.getByRole('textbox', { name: /Section code/ }), { target: { value: '2.6.6' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Section title/ }), { target: { value: 'Toxicology summary' } });
  }
}
function submit(kind: Kind) {
  fireEvent.click(screen.getByRole('button', { name: kind === 'document' ? 'Create document' : 'Create section' }));
}
function wire(post: () => Promise<Response>, read?: (url: string) => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST') return post();
    if (url === '/api/authoring/templates') return response({ success: true, templates: [{ id: TEMPLATE, name: 'Regional filing', module: 'M2' }] });
    return read ? read(url) : response({ success: true, documents: [], sections: [] });
  });
}
function checkLabel(kind: Kind): RegExp {
  return kind === 'document' ? /Check working documents/i : /Check document sections/i;
}
function newButton(kind: Kind): HTMLButtonElement {
  return screen.getByRole('button', { name: kind === 'document' ? /New document/ : /New section/ }) as HTMLButtonElement;
}
function scopedRead(kind: Kind) {
  return kind === 'document'
    ? { success: true, filters: { programId: A, status: 'all' }, documents: [{ id: 'D-existing', title: 'Existing document', program_id: A }] }
    : { success: true, sections: [{ id: 'S-existing', code: '2.6', doc_id: 'D1' }] };
}
async function makeUnknown(kind: Kind) {
  await open(kind); fill(kind); submit(kind);
  expect((await screen.findByRole('alert')).textContent).toMatch(/(?:cannot|could not) confirm/i);
}

beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(BEARER, ACTOR, 'fixture-refresh', 3600);
  apiRequest.mockReset();
  publishShellProject({ id: A, title: 'Project A' });
});
afterEach(() => {
  cleanup();
  authService.endSession(null); clearAuthToken();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
  localStorage.clear();
});

describe('Authoring creation pending guard in the existing drawer', () => {
  it.each<Kind>(['document', 'section'])('does not POST a %s twice on synchronous double activation', async kind => {
    const pending = deferred<Response>();
    wire(() => pending.promise);
    render(<AuthoringCreateExport {...props()} />);
    await open(kind);
    fill(kind);
    const button = screen.getByRole('button', { name: kind === 'document' ? 'Create document' : 'Create section' });
    act(() => { button.click(); button.click(); });
    expect(postCalls()).toHaveLength(1);
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
    await act(async () => pending.resolve(response(receipt(kind), 201)));
  });

  it.each<Kind>(['document', 'section'])('canceling the drawer cannot release a pending %s guard', async kind => {
    const pending = deferred<Response>();
    wire(() => pending.promise);
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await open(kind);
    fill(kind);
    submit(kind);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(newButton(kind).disabled).toBe(true);
    fireEvent.click(newButton(kind));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(postCalls()).toHaveLength(1);
    await act(async () => pending.resolve(response(receipt(kind), 201)));
    expect(kind === 'document' ? p.onDocCreated : p.onSectionCreated).toHaveBeenCalledOnce();
    expect(newButton(kind).disabled).toBe(false);
    await open(kind);
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBeNull();
    expect(postCalls()).toHaveLength(1);
  });
});

describe('Authoring creation scope and stale replies', () => {
  it('explicit null project never falls back to the shell, including the empty-state event', async () => {
    wire(async () => response(receipt('document'), 201));
    const p = props();
    render(<AuthoringCreateExport {...p} programId={null} />);
    expect((screen.getByRole('button', { name: /New document/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => startNewDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(postCalls()).toHaveLength(0);
  });

  it('ignores a confirmed old document after a project A → B → A round trip', async () => {
    const pending = deferred<Response>();
    wire(() => pending.promise);
    const p = props();
    const view = render(<AuthoringCreateExport {...p} />);
    await open('document'); fill('document'); submit('document');
    act(() => publishShellProject({ id: B, title: 'Project B' }));
    view.rerender(<AuthoringCreateExport {...p} programId={B} />);
    act(() => publishShellProject({ id: A, title: 'Project A' }));
    view.rerender(<AuthoringCreateExport {...p} />);
    await act(async () => pending.resolve(response(receipt('document'), 201)));
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(p.fireToast).not.toHaveBeenCalled();
  });

  it('keeps an unreadable successful receipt unknown without claiming nothing persisted', async () => {
    wire(async () => ({ ok: true, status: 201, json: async () => { throw new Error('Interrupted body'); } }) as unknown as Response);
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await open('document'); fill('document'); submit('document');
    await waitFor(() => expect(p.fireToast).toHaveBeenCalled());
    const messages = p.fireToast.mock.calls.map(call => String(call[0])).join(' ');
    expect(messages).toMatch(/(?:cannot|could not) confirm/i);
    expect(messages).not.toMatch(/nothing was persisted|nothing was created/i);
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Check.*document/i })).toBeTruthy();
  });

  it.each(['held switch', 'shell mismatch'])('refuses both creation paths during %s, including the event path', async state => {
    wire(async () => response(receipt('document'), 201));
    const p = props();
    if (state === 'shell mismatch') publishShellProject({ id: B, title: 'Shell Project B' });
    render(<AuthoringCreateExport {...p} programSwitchHeld={state === 'held switch'} />);
    expect(newButton('document').disabled).toBe(true);
    expect(newButton('section').disabled).toBe(true);
    act(() => startNewDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(postCalls()).toHaveLength(0);
    await waitFor(() => expect(p.fireToast).toHaveBeenCalledWith(expect.any(String), 'error'));
  });

  it('pins the effective workbench project when a shell mismatch occurs with a drawer already open', async () => {
    wire(async () => response(receipt('document'), 201));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await open('document'); fill('document');
    act(() => publishShellProject({ id: B, title: 'Shell Project B' }));
    const create = screen.queryByRole('button', { name: 'Create document' });
    if (create) fireEvent.click(create);
    expect(postCalls()).toHaveLength(0);
    expect(p.onDocCreated).not.toHaveBeenCalled();
  });
});

describe('Unknown creation outcomes require an explicit successful scoped read', () => {
  it.each<Kind>(['document', 'section'])('a lost %s response blocks another POST until reconciliation', async kind => {
    wire(async () => { throw new TypeError('Failed to fetch'); }, async url => {
      const expected = kind === 'document'
        ? `/api/authoring/docs?status=all&programId=${encodeURIComponent(A)}`
        : '/api/authoring/docs/D1/sections';
      expect(url).toBe(expected);
      return response(scopedRead(kind));
    });
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    expect(newButton(kind).disabled).toBe(true);
    fireEvent.click(newButton(kind));
    expect(postCalls()).toHaveLength(1);
    expect(p.onCheckCreation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: checkLabel(kind) }));
    await waitFor(() => expect(p.onCheckCreation).toHaveBeenCalledWith(kind));
    expect(newButton(kind).disabled).toBe(false);
    expect(postCalls()).toHaveLength(1);
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    await open(kind); fill(kind); submit(kind);
    await waitFor(() => expect(postCalls()).toHaveLength(2));
  });

  const badReads = ['network', '403', '502', 'unreadable', 'malformed', 'wrong scope'] as const;
  it.each<Kind>(['document', 'section'])('failed or malformed %s recovery reads never release the guard', async kind => {
    let mode: typeof badReads[number] = 'network';
    wire(async () => { throw new TypeError('Lost response'); }, async () => {
      if (mode === 'network') throw new TypeError('Read failed');
      if (mode === '403') return response({ error: 'Access denied' }, 403);
      if (mode === '502') return response({ error: 'Unavailable' }, 502);
      if (mode === 'unreadable') return { ok: true, status: 200, json: async () => { throw new Error('Truncated JSON'); } } as unknown as Response;
      if (mode === 'malformed') return response({ success: true, documents: 'not an array', sections: {} });
      return response(kind === 'document'
        ? { success: true, filters: { programId: A, status: 'all' }, documents: [{ id: 'foreign', title: 'Foreign', program_id: B }] }
        : { success: true, sections: [{ id: 'foreign', code: '3.2', doc_id: 'D-other' }] });
    });
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    for (const failure of badReads) {
      mode = failure;
      const readsBefore = apiRequest.mock.calls.filter(call => call[0] === 'GET' && call[1] !== '/api/authoring/templates').length;
      fireEvent.click(screen.getByRole('button', { name: checkLabel(kind) }));
      await waitFor(() => expect(apiRequest.mock.calls.filter(call => call[0] === 'GET' && call[1] !== '/api/authoring/templates')).toHaveLength(readsBefore + 1));
      await act(async () => { await Promise.resolve(); });
      expect(newButton(kind).disabled, failure).toBe(true);
      expect(p.onCheckCreation, failure).not.toHaveBeenCalled();
      expect(postCalls(), failure).toHaveLength(1);
    }
  });

  it.each<Kind>(['document', 'section'])('an untyped 5xx for a %s is unknown rather than a safe retry', async kind => {
    wire(async () => { throw new ApiRequestError('Service unavailable', 503); });
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    expect(newButton(kind).disabled).toBe(true);
    expect(p.fireToast.mock.calls.map(call => String(call[0])).join(' ')).not.toMatch(/nothing was persisted|nothing was created/i);
    expect(postCalls()).toHaveLength(1);
  });

  it.each<Kind>(['document', 'section'])('does not reconcile a %s from a success:false read with an array', async kind => {
    wire(async () => { throw new TypeError('Lost response'); }, async () => response({ ...scopedRead(kind), success: false }));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    fireEvent.click(screen.getByRole('button', { name: checkLabel(kind) }));
    await act(async () => { await Promise.resolve(); });
    expect(newButton(kind).disabled).toBe(true);
    expect(p.onCheckCreation).not.toHaveBeenCalled();
  });

  it.each<Kind>(['document', 'section'])('accepts an explicit empty scoped %s read without manufacturing a receipt', async kind => {
    wire(async () => { throw new TypeError('Lost response'); }, async () => response(kind === 'document'
      ? { success: true, documents: [], filters: { programId: A, status: 'all' } }
      : { success: true, sections: [] }));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    fireEvent.click(screen.getByRole('button', { name: checkLabel(kind) }));
    await waitFor(() => expect(p.onCheckCreation).toHaveBeenCalledWith(kind));
    expect(newButton(kind).disabled).toBe(false);
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(postCalls()).toHaveLength(1);
    expect(p.fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/^(?:Document|Section) created/));
  });

  it.each<Kind>(['document', 'section'])('does not overlap explicit scoped %s reconciliation reads', async kind => {
    const pending = deferred<Response>();
    wire(async () => { throw new TypeError('Lost response'); }, () => pending.promise);
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    const check = screen.getByRole('button', { name: checkLabel(kind) });
    act(() => { check.click(); check.click(); });
    expect(apiRequest.mock.calls.filter(call => call[0] === 'GET' && call[1] !== '/api/authoring/templates')).toHaveLength(1);
    expect(newButton(kind).disabled).toBe(true);
    await act(async () => pending.resolve(response(scopedRead(kind))));
    expect(p.onCheckCreation).toHaveBeenCalledWith(kind);
  });
});

describe('Creation confirmation checks the requested source identity', () => {
  it.each<Kind>(['document', 'section'])('does not adopt a %s receipt explicitly marked unsuccessful', async kind => {
    wire(async () => response({ ...receipt(kind), success: false }, 201));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown(kind);
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(newButton(kind).disabled).toBe(true);
  });

  it.each(['wrong project', 'missing project', 'wrong template', 'missing title', 'missing ID'])('treats a document receipt with %s as unknown', async issue => {
    const row: Record<string, unknown> = { id: 'D-server', title: 'Created', client_program_id: A, template_id: TEMPLATE };
    if (issue === 'wrong project') row.client_program_id = B;
    if (issue === 'missing project') delete row.client_program_id;
    if (issue === 'wrong template') row.template_id = 'Other-template';
    if (issue === 'missing title') delete row.title;
    if (issue === 'missing ID') delete row.id;
    wire(async () => response({ success: true, document: row }, 201));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await open('document'); fill('document');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Regional filing' })).toBeTruthy());
    fireEvent.change(screen.getByRole('combobox', { name: 'Start from' }), { target: { value: TEMPLATE } });
    submit('document');
    expect((await screen.findByRole('alert')).textContent).toMatch(/(?:cannot|could not) confirm/i);
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(newButton('document').disabled).toBe(true);
    expect(p.fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/^Document created/));
  });

  it.each(['wrong document', 'missing document', 'missing code', 'missing ID'])('treats a section receipt with %s as unknown', async issue => {
    const row: Record<string, unknown> = { id: 'S-server', code: '2.6.6', doc_id: 'D1' };
    if (issue === 'wrong document') row.doc_id = 'D-other';
    if (issue === 'missing document') delete row.doc_id;
    if (issue === 'missing code') delete row.code;
    if (issue === 'missing ID') delete row.id;
    wire(async () => response({ success: true, section: row }, 201));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await makeUnknown('section');
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(newButton('section').disabled).toBe(true);
    expect(p.fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/^Section created/));
  });

  it.each<Kind>(['document', 'section'])('adopts the confirmed returned %s ID without requiring UUID-shaped IDs', async kind => {
    wire(async () => response(receipt(kind), 201));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await open(kind); fill(kind); submit(kind);
    await waitFor(() => expect(kind === 'document' ? p.onDocCreated : p.onSectionCreated).toHaveBeenCalledWith(kind === 'document'
      ? { id: 'D-created', title: 'New document' } : { id: 'S-created', code: '2.6.6' }));
    expect(postCalls()).toHaveLength(1);
  });

  it.each<Kind>(['document', 'section'])('a readable 4xx %s refusal permits an explicit retry', async kind => {
    let count = 0;
    wire(async () => ++count === 1 ? response({ success: false, message: 'Project policy refused this request' }, 409) : response(receipt(kind), 201));
    const p = props();
    render(<AuthoringCreateExport {...p} />);
    await open(kind); fill(kind); submit(kind);
    await waitFor(() => expect(p.fireToast).toHaveBeenCalledWith(expect.stringMatching(/refus|policy/i), 'error'));
    expect(newButton(kind).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: checkLabel(kind) })).toBeNull();
    submit(kind);
    await waitFor(() => expect(kind === 'document' ? p.onDocCreated : p.onSectionCreated).toHaveBeenCalledOnce());
    expect(postCalls()).toHaveLength(2);
  });

  for (const kind of ['document', 'section'] as const) {
    it.each([401, 403, 422])(`a thrown %s refusal remains retryable for ${kind}`, async status => {
      let count = 0;
      wire(async () => {
        if (++count === 1) throw new ApiRequestError('Creation refused by policy', status);
        return response(receipt(kind), 201);
      });
      const p = props();
      render(<AuthoringCreateExport {...p} />);
      await open(kind); fill(kind); submit(kind);
      await waitFor(() => expect(p.fireToast).toHaveBeenCalledWith(expect.any(String), 'error'));
      expect(newButton(kind).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: checkLabel(kind) })).toBeNull();
      submit(kind);
      await waitFor(() => expect(kind === 'document' ? p.onDocCreated : p.onSectionCreated).toHaveBeenCalledOnce());
      expect(postCalls()).toHaveLength(2);
    });
  }
});
describe('Delayed creation work cannot affect a different editing context', () => {
  const changes = ['document switch', 'project switch', 'project round trip', 'unmount'] as const;
  for (const kind of ['document', 'section'] as const) {
    for (const phase of ['resolve response', 'reject response', 'resolve JSON', 'reject JSON'] as const) {
      it.each(changes)(`ignores ${kind} ${phase} after %s`, async change => {
        const pendingResponse = deferred<Response>();
        const pendingBody = deferred<unknown>();
        const json = vi.fn(() => pendingBody.promise);
        wire(() => phase.includes('JSON')
          ? Promise.resolve({ ok: true, status: 201, json } as unknown as Response)
          : pendingResponse.promise);
        const p = props();
        const view = render(<AuthoringCreateExport {...p} />);
        await open(kind); fill(kind); submit(kind);
        if (phase.includes('JSON')) await waitFor(() => expect(json).toHaveBeenCalledOnce());
        if (change === 'document switch') view.rerender(<AuthoringCreateExport {...p} docId="D2" />);
        if (change === 'project switch' || change === 'project round trip') {
          act(() => publishShellProject({ id: B, title: 'Project B' }));
          view.rerender(<AuthoringCreateExport {...p} programId={B} />);
          if (change === 'project round trip') {
            act(() => publishShellProject({ id: A, title: 'Project A' }));
            view.rerender(<AuthoringCreateExport {...p} />);
          }
        }
        if (change === 'unmount') view.unmount();
        await act(async () => {
          if (phase === 'resolve response') pendingResponse.resolve(response(receipt(kind), 201));
          if (phase === 'reject response') pendingResponse.reject(new TypeError('Late network failure'));
          if (phase === 'resolve JSON') pendingBody.resolve(receipt(kind));
          if (phase === 'reject JSON') pendingBody.reject(new Error('Late JSON failure'));
        });
        expect(p.onDocCreated).not.toHaveBeenCalled();
        expect(p.onSectionCreated).not.toHaveBeenCalled();
        expect(p.onCheckCreation).not.toHaveBeenCalled();
        expect(p.fireToast).not.toHaveBeenCalled();
      });
    }
  }

  it.each<Kind>(['document', 'section'])('an old %s completion cannot unlock a newer pending creation', async kind => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    let calls = 0;
    wire(() => ++calls === 1 ? old.promise : current.promise);
    const p = props();
    const view = render(<AuthoringCreateExport {...p} />);
    await open(kind); fill(kind); submit(kind);
    act(() => publishShellProject({ id: B, title: 'Project B' }));
    view.rerender(<AuthoringCreateExport {...p} programId={B} docId="D2" />);
    if (screen.queryByRole('dialog')) fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await open(kind); fill(kind); submit(kind);
    expect(postCalls()).toHaveLength(2);
    await act(async () => old.resolve(response(receipt(kind), 201)));
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: kind === 'document' ? 'Create document' : 'Create section' }) as HTMLButtonElement).disabled).toBe(true);
    expect(p.fireToast).not.toHaveBeenCalled();
    expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    await act(async () => current.resolve(response(kind === 'document' ? receipt(kind, B)
      : { success: true, section: { id: 'S-new-context', code: '3.2', doc_id: 'D2' } }, 201)));
    expect(kind === 'document' ? p.onDocCreated : p.onSectionCreated).toHaveBeenCalledOnce();
  });

  for (const kind of ['document', 'section'] as const) {
    it.each(['response', 'JSON'])(`a stale ${kind} check %s cannot clear uncertainty or strand checking after a round trip`, async phase => {
      const pendingResponse = deferred<Response>();
      const pendingBody = deferred<unknown>();
      const json = vi.fn(() => pendingBody.promise);
      let reads = 0;
      wire(async () => { throw new TypeError('Lost create response'); }, () => {
        reads += 1;
        if (reads > 1) return Promise.resolve(response(scopedRead(kind)));
        return phase === 'JSON'
          ? Promise.resolve({ ok: true, status: 200, json } as unknown as Response)
          : pendingResponse.promise;
      });
      const p = props();
      const view = render(<AuthoringCreateExport {...p} />);
      await makeUnknown(kind);
      fireEvent.click(screen.getByRole('button', { name: checkLabel(kind) }));
      if (phase === 'JSON') await waitFor(() => expect(json).toHaveBeenCalledOnce());
      act(() => publishShellProject({ id: B, title: 'Project B' }));
      view.rerender(<AuthoringCreateExport {...p} programId={B} docId="D2" />);
      act(() => publishShellProject({ id: A, title: 'Project A' }));
      view.rerender(<AuthoringCreateExport {...p} />);
      await act(async () => {
        if (phase === 'JSON') pendingBody.resolve(scopedRead(kind));
        else pendingResponse.resolve(response(scopedRead(kind)));
      });
      expect(p.onCheckCreation).not.toHaveBeenCalled();
      expect(p.fireToast).toHaveBeenCalledTimes(1);
      expect(newButton(kind).disabled).toBe(true);
      expect(postCalls()).toHaveLength(1);
      const check = screen.getByRole('button', { name: checkLabel(kind) }) as HTMLButtonElement;
      expect(check.disabled).toBe(false);
      fireEvent.click(check);
      await waitFor(() => expect(p.onCheckCreation).toHaveBeenCalledWith(kind));
      expect(reads).toBe(2);
      expect(postCalls()).toHaveLength(1);
    });
  }
});


describe('explicit host recovery acknowledgement', () => {
  for (const kind of ['document', 'section'] as const) {
    it.each([false, undefined])(`keeps unknown ${kind} when the host acknowledgement is %s`, async acknowledged => {
      wire(async () => { throw new TypeError('Lost creation response'); }, async () => response(scopedRead(kind)));
      const p = props();
      const host = acknowledged === undefined ? undefined : vi.fn(() => false);
      render(<AuthoringCreateExport {...p} onCheckCreation={host} />);
      await makeUnknown(kind);
      fireEvent.click(screen.getByRole('button', { name: checkLabel(kind) }));
      await act(async () => { await Promise.resolve(); });
      if (host) expect(host).toHaveBeenCalledWith(kind);
      expect(newButton(kind).disabled).toBe(true);
      expect(postCalls()).toHaveLength(1);
      expect(p.onDocCreated).not.toHaveBeenCalled();
      expect(p.onSectionCreated).not.toHaveBeenCalled();
    });
  }
});
