// @vitest-environment jsdom
/** The shipped workbench resolves filing targets against admitted saved bindings. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: { displayName: 'Test author', email: 'test@example.test' } }),
    authService: { getUser: () => null, captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService), on: actual.authService.on.bind(actual.authService) } };
});
import { DocumentWorkbench, type AuthDoc } from '../DocumentWorkbench';
import { clearEditorTarget, setEditorTarget } from '../../editorTarget';
import { clearShellProject, publishShellProject } from '../../shellProject';
import { filingTargetInventoryKey, resolveFilingSectionTarget, workingFilingBinding } from '../filingSectionTarget';

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Record<string, unknown>[]) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 });
}
const P = '11111111-1111-4111-8111-111111111111';
const filings = [
  { id: 'FK', project_id: P, doc_type: 'k510', title: 'Primary 510(k) filing', agency: 'fda' },
  { id: 'FC', project_id: P, doc_type: 'cer', title: 'Secondary CER filing', agency: 'ema' },
  { id: 'FI', project_id: P, doc_type: 'ivdr', title: 'Secondary IVDR filing', agency: 'ema' },
];
const workingDoc = (id: string, c2c_document_id: string | null = 'FK', module: string | null = null): AuthDoc => ({ id, title: `Working ${id}`, c2c_document_id,
  module, product_code: null, status: 'draft', updated_at: null, section_count: 1 });
const section = (doc: string, code: string, title = 'Requested evidence') => ({ id: `S-${doc}-${code}`, doc_id: doc, code, title,
  content: `<p>Saved ${doc} ${code} text</p>`, order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null });
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let inventory: AuthDoc[], rows: Record<string, ReturnType<typeof section>[]>, header: Record<string, Record<string, unknown>>;
function wire(over?: (method: string, path: string) => Response | Promise<Response> | undefined) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const custom = over?.(method, path); if (custom) return custom;
    const url = new URL(path, 'http://fixture.local');
    if (url.pathname === '/api/c2c/documents') return reply({ documents: url.searchParams.get('scope') === 'market' ? []
      : filings.filter(f => !url.searchParams.has('docType') || f.doc_type === url.searchParams.get('docType')) });
    const outline = /^\/api\/c2c\/documents\/(\w+)\/outline$/.exec(url.pathname);
    if (outline) {
      const f = filings.find(f => f.id === outline[1])!;
      return reply({ document: { ...f, filing_scope: 'home' }, outline: [{ key: f.doc_type === 'k510' ? 'K1' : f.doc_type === 'cer' ? 'A3' : 'II.6.2', parent_key: null,
        label: `${f.doc_type} requirements`, mandatory: true, path_order: 1, status: 'todo', version: 1, draft_source: null, has_content: false }] });
    }
    const doc = /^\/api\/authoring\/docs\/([^/]+)(\/sections)?$/.exec(url.pathname);
    if (doc) return doc[2] ? reply({ success: true, sections: rows[doc[1]] ?? [] })
      : reply({ success: true, document: { ...(inventory.find(d => d.id === doc[1]) ?? workingDoc(doc[1], 'FC')), client_program_id: P, ...header[doc[1]] } });
    return reply({ success: true });
  });
}
const workbench = (docs = inventory, pinnedDocId: string | null = null) => <DocumentWorkbench docs={docs} docsState="ready" programId={P} status="all" onStatusChange={() => {}}
  reloadDocs={async () => {}} onNav={() => {}} consumeDeepLinks pinnedDocId={pinnedDocId} />;
const mount = (docs = inventory, pinnedDocId: string | null = null) => render(workbench(docs, pinnedDocId));
const text = () => document.querySelector('.rse-body .tiptap')?.textContent ?? '';
beforeEach(() => {
  clearEditorTarget(); clearShellProject(); publishShellProject({ id: P, title: 'Mixed device project' });
  inventory = [workingDoc('W1'), workingDoc('W2', 'FC'), workingDoc('W3', 'FI')];
  rows = { W1: [section('W1', 'K1')], W2: [section('W2', 'A3')], W3: [section('W3', 'II.6.2')] };
  header = {}; apiRequest.mockReset(); wire();
});
afterEach(() => { cleanup(); clearEditorTarget(); clearShellProject(); sessionStorage.clear(); localStorage.clear(); });

describe('filing handoffs in the actual shared workbench', () => {
  it.each([{ family: 'cer', id: 'W2', code: 'A3' }, { family: 'ivdr', id: 'W3', code: 'II.6.2' }])('opens $family beside the primary 510(k)', async ({ family, id, code }) => {
    mount(); await waitFor(() => expect(text()).toContain('Saved W1 K1 text'));
    act(() => setEditorTarget({ docType: family, programId: P, code }));
    await waitFor(() => expect(text()).toContain(`Saved ${id} ${code} text`));
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/documents?projectId=${P}&docType=${family}`);
  });

  it('reaches the tenth saved working copy', async () => {
    inventory = Array.from({ length: 10 }, (_, n) => workingDoc(`W${n + 1}`));
    rows = Object.fromEntries(inventory.map(d => [d.id, [section(d.id, d.id === 'W10' ? '11' : `other-${d.id}`)]]));
    mount(); await waitFor(() => expect(text()).toContain('Saved W1 other-W1 text'));
    act(() => setEditorTarget({ docType: 'k510', programId: P, code: '11' }));
    await waitFor(() => expect(text()).toContain('Saved W10 11 text'));
  });

  it('keeps a known-null M5 copy unbound instead of borrowing project filing requirements', async () => {
    inventory = [workingDoc('W1', null, 'M5')];
    mount(); await waitFor(() => expect(text()).toContain('Saved W1 K1 text'));
    expect(screen.getByText(/Unbound working copy/)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([, path]) => path.endsWith('/FK/outline'))).toBe(false);
    const create = await screen.findByRole('button', { name: 'Create editing copy', description: /FDA · K510/ });
    fireEvent.click(create);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs', {
      title: filings[0].title, module: null, client_program_id: P, c2c_document_id: 'FK',
    }));
  });

  it('uses the exact current pinned header when its document is absent from the list', async () => {
    mount([], 'W2'); await waitFor(() => expect(text()).toContain('Saved W2 A3 text'));
    await waitFor(() => expect(apiRequest.mock.calls.some(([method, path]) => method === 'GET' && path === '/api/c2c/documents/FC/outline')).toBe(true));
    expect(document.querySelector('.ed-tree')?.textContent).toContain('Secondary CER filing');
  });
});

describe('whole filing and held navigation use the same admitted context', () => {
  it('opens the one bound whole filing without deriving a section from its title', async () => {
    mount(); await waitFor(() => expect(text()).toContain('Saved W1 K1 text'));
    act(() => setEditorTarget({ docType: 'cer', programId: P, filingDocumentId: 'FC' }));
    await waitFor(() => expect(text()).toContain('Saved W2 A3 text'));
  });

  it('states ambiguity for multiple whole-filing copies', async () => {
    inventory.push(workingDoc('W4', 'FC')); rows.W4 = [section('W4', 'A4')];
    mount(); await waitFor(() => expect(text()).toContain('Saved W1 K1 text'));
    act(() => setEditorTarget({ docType: 'cer', programId: P, filingDocumentId: 'FC' }));
    await screen.findByText(/more than one accessible working copy/i);
    expect(text()).toContain('Saved W1 K1 text');
  });

  it('refuses a stale target after a held unsaved-work decision and inventory rebind', async () => {
    const view = mount(); await waitFor(() => expect(text()).toContain('Saved W1 K1 text'));
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    act(() => { editor.commands.insertContent('Unsaved original buffer '); });
    await waitFor(() => expect(text()).toContain('Unsaved original buffer'));
    act(() => setEditorTarget({ docType: 'cer', programId: P, code: 'A3' }));
    const discard = await screen.findByRole('button', { name: 'Leave without saving' });
    inventory = inventory.map(doc => doc.id === 'W2' ? { ...doc, c2c_document_id: 'FK' } : doc);
    view.rerender(workbench()); fireEvent.click(discard);
    await screen.findByText(/linked filing is no longer current/i);
    expect(text()).toContain('Unsaved original buffer');
    expect(text()).not.toContain('Saved W2 A3 text');
  });

  it('retires a delayed lookup across an inventory A to B to A visit', async () => {
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => { finish = resolve; });
    wire((_method, path) => path.includes('docType=cer') ? delayed : undefined);
    const view = mount(); await waitFor(() => expect(text()).toContain('Saved W1 K1 text'));
    act(() => setEditorTarget({ docType: 'cer', programId: P, code: 'A3' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/documents?projectId=${P}&docType=cer`));
    const original = inventory;
    inventory = inventory.filter(doc => doc.id !== 'W2'); view.rerender(workbench());
    inventory = original; view.rerender(workbench());
    await act(async () => { finish(reply({ documents: [filings[1]] })); });
    await screen.findByText(/document list or its filing bindings changed/i);
    expect(text()).toContain('Saved W1 K1 text');
  });
});

const read = async (path: string) => {
  const response = await apiRequest('GET', path);
  return { ok: response.ok, status: response.status, body: await response.json() };
};
const resolveTarget = (over: Partial<Parameters<typeof resolveFilingSectionTarget>[0]> = {}) => resolveFilingSectionTarget({
  projectId: P, docType: 'cer', target: { sectionCode: 'A3', sectionLabel: 'Requested evidence' }, docs: inventory, read, current: () => true, ...over });

describe('exact filing resolver admits records and proves a unique best match', () => {
  it('uses exact code globally before an unrelated title-only match in a modular copy', async () => {
    inventory.push(workingDoc('W4', 'FC')); rows.W4 = [section('W4', 'other')];
    expect(await resolveTarget()).toMatchObject({ kind: 'match', documentId: 'W2', section: { code: 'A3' } });
  });

  it.each(['exact', 'numeric', 'title'])('rejects duplicate %s best sections inside one working copy', async mode => {
    const code = mode === 'numeric' ? '01' : mode === 'exact' ? 'A3' : 'other';
    rows.W2.push({ ...section('W2', code, 'Requested evidence'), id: 'second-matching-section' });
    if (mode === 'numeric') rows.W2[0] = section('W2', '1');
    const target = { sectionCode: mode === 'title' ? null : mode === 'numeric' ? '1.0' : 'A3', sectionLabel: 'Requested evidence' };
    expect((await resolveTarget({ target })).kind).toBe('ambiguous');
  });

  it('does not infer uniqueness when another candidate read fails', async () => {
    inventory.push(workingDoc('W4', 'FC'));
    wire((_method, path) => path.includes('/W4/sections') ? reply({}, 503) : undefined);
    expect((await resolveTarget()).kind).toBe('unavailable');
  });

  it('rechecks the winning header after sections have been read', async () => {
    let headers = 0;
    wire((_method, path) => path.split('?')[0] === '/api/authoring/docs/W2' && ++headers > 1
      ? reply({ document: { ...workingDoc('W2', 'FK'), client_program_id: P } }) : undefined);
    expect((await resolveTarget()).kind).toBe('unavailable');
  });

  it.each(['project', 'identity', 'binding', 'partial', 'failure'])('refuses a %s header mismatch', async problem => {
    header.W2 = problem === 'project' ? { client_program_id: 'another-project' } : problem === 'identity' ? { id: 'another-copy' }
      : problem === 'binding' ? { c2c_document_id: 'FK' } : problem === 'partial' ? { readScope: 'sections' } : {};
    if (problem === 'failure') wire((_method, path) => path.split('?')[0] === '/api/authoring/docs/W2'
      ? reply({ success: false, document: { ...workingDoc('W2', 'FC'), client_program_id: P } }) : undefined);
    expect((await resolveTarget()).kind).toBe('unavailable');
  });

  it.each(['foreign', 'missing', 'declared-failure'])('refuses %s section records', async problem => {
    wire((_method, path) => path.includes('/W2/sections') ? reply({ success: problem !== 'declared-failure', sections: [
      problem === 'foreign' ? { ...rows.W2[0], doc_id: 'wrong-copy' } : problem === 'missing' ? { ...rows.W2[0], doc_id: undefined } : rows.W2[0],
    ] }) : undefined);
    expect((await resolveTarget()).kind).toBe('unavailable');
  });

  it('refuses a wrong-project successful family list', async () => {
    wire((_method, path) => path.includes('docType=cer') ? reply({ documents: [{ ...filings[1], project_id: 'foreign' }] }) : undefined);
    expect((await resolveTarget()).kind).toBe('unavailable');
  });

  it.each(['', ' ', 'bad/path', 'encoded%2Fpath'])('rejects malformed direct filing identity %s before any read', async filingDocumentId => {
    expect((await resolveTarget({ target: { filingDocumentId, sectionCode: null, sectionLabel: null } })).kind).toBe('unavailable');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('whole-filing identity and read ownership', () => {
  it('selects an exact filing among multiple same-family filings, without a section read', async () => {
    inventory.push(workingDoc('W4', 'FC2')); rows.W4 = [section('W4', 'A3')];
    wire((_method, path) => path.includes('docType=cer') ? reply({ documents: [filings[1], { ...filings[1], id: 'FC2' }] }) : undefined);
    expect(await resolveTarget({ target: { filingDocumentId: 'FC2', sectionCode: null, sectionLabel: null } })).toEqual({ kind: 'document', documentId: 'W4' });
    expect(apiRequest.mock.calls.some(([, path]) => path.includes('/sections'))).toBe(false);
  });

  it('never falls back from a missing exact filing', async () => {
    expect((await resolveTarget({ target: { filingDocumentId: 'missing', sectionCode: null, sectionLabel: null } })).kind).toBe('missing');
  });

  it('states refusal for a whole-filing header denial', async () => {
    wire((_method, path) => path.split('?')[0] === '/api/authoring/docs/W2' ? reply({}, 403) : undefined);
    expect((await resolveTarget({ target: { filingDocumentId: 'FC', sectionCode: null, sectionLabel: null } })).kind).toBe('refused');
  });

  it('retires completion after its owner changes during a delayed required read', async () => {
    let current = true;
    const guardedRead: typeof read = async path => { const result = await read(path); current = false; return result; };
    expect((await resolveTarget({ read: guardedRead, current: () => current })).kind).toBe('retired');
  });

  it('distinguishes a known-null header from missing/refused metadata and keeps inventory order immaterial', () => {
    const base = { activeId: 'W2', projectId: P, listed: workingDoc('W2', 'FC'), header: { id: 'W2', client_program_id: P, c2c_document_id: null }, headerAnswered: true, headerAvailable: true };
    expect(workingFilingBinding(base)).toEqual({ known: true, documentId: null });
    expect(workingFilingBinding({ ...base, headerAvailable: false })).toEqual({ known: false, documentId: null });
    expect(workingFilingBinding({ ...base, header: { ...base.header, client_program_id: 'foreign' } })).toEqual({ known: false, documentId: null });
    expect(filingTargetInventoryKey(inventory)).toBe(filingTargetInventoryKey([...inventory].reverse()));
    expect(filingTargetInventoryKey(inventory)).not.toBe(filingTargetInventoryKey(inventory.slice(1)));
  });
});
