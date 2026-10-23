// @vitest-environment jsdom
/** Real source action, surface, editor, creator, picker and ledger; synthetic HTTP only. */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { ApiRequestError } from '@/lib/queryClient';
import type { OwnedSurfaceViewProps } from '../../surfaceViews';
import type { AssemblySourceSelector } from '@shared/authoring/assembly-sources';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) };
});
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import { SourceAssemblyAction } from '../SourceAssemblyDialog';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { clearEditorTarget, peekEditorTarget } from '../../editorTarget';
import { clearShellProject, publishShellProject } from '../../shellProject';
import { __resetCeremonies } from '../../ceremony';

const PROGRAM = '11111111-1111-4111-8111-111111111391';
const PRIOR = '22222222-2222-4222-8222-222222222391';
const CREATED = '22222222-2222-4222-8222-222222222392';
const DECOY = '22222222-2222-4222-8222-222222222393';
const TEMPLATE = '44444444-4444-4444-8444-444444444391';
const VAULT = '55555555-5555-4555-8555-555555555391';
const AT = '2026-10-23T18:30:00Z';
const ACTOR = { id: '7', organizationId: '12', email: 'source-start@example.test', displayName: 'Source author', roles: ['admin'], permissions: ['governed:write'] };
const BEARER = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const selectors: AssemblySourceSelector[] = [{ kind: 'data-room', sourceId: 12, expectedChecksum: 'a'.repeat(64) },
  { kind: 'vault', documentId: VAULT, expectedChecksum: 'b'.repeat(64) }];
const prior = { id: PRIOR, title: 'Prior working record', module: null, product_code: null, status: 'DRAFT',
  updated_at: AT, section_count: 1, client_program_id: PROGRAM, c2c_document_id: null, template_id: null as string | null };
const created = { ...prior, id: CREATED, title: 'Source-led planning record' };
const decoy = { ...prior, id: DECOY, title: 'A different newer record' };
let records: typeof prior[];
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
let createReply: (input: Record<string, unknown>) => Response | Promise<Response>;
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
function sections(id: string) {
  return [{ id: id.replace(/^22222222/, '33333333'), doc_id: id, code: 'objective',
    title: id === CREATED ? 'New planning section' : 'Saved prior section',
    content: id === PRIOR ? '<p>Keep the existing saved work.</p>' : '', order_index: 0, updated_at: AT }];
}
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  authService.setToken(BEARER, ACTOR, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM, title: 'Source project' });
  records = [];
  createReply = input => {
    const row = { ...created, template_id: typeof input.template_id === 'string' ? input.template_id : null };
    records = [decoy, row, ...records];
    return ok({ success: true, document: row, sections_seeded: 1 }, 201);
  };
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: ACTOR })));
  apiRequest.mockReset().mockImplementation(async (method: string, path: string, input?: Record<string, unknown>) => {
    const url = new URL(path, 'http://localhost');
    if (method === 'POST' && path === '/api/authoring/docs') return createReply(input!);
    if (path === '/api/authoring/templates') return ok({ success: true, templates: [{ id: TEMPLATE,
      name: 'Regulatory strategy — preparation worksheet', module: null, description: 'Internal shared planning for laboratory and research work.' }] });
    if (url.pathname === '/api/authoring/docs') return ok({ success: true, documents: records.map(row => ({ ...row, program_id: PROGRAM })) });
    const id = url.pathname.match(/^\/api\/authoring\/docs\/([^/]+)(?:\/sections)?$/)?.[1];
    if (id) {
      if (!path.endsWith(CREATED)) expect(url.searchParams.get('programId')).toBe(PROGRAM);
      else expect(url.searchParams.get('programId') ?? PROGRAM).toBe(PROGRAM);
      const row = records.find(record => record.id === id);
      if (!row) return ok({ success: false }, 404);
      return url.pathname.endsWith('/sections') ? ok({ success: true, sections: sections(id) }) : ok({ success: true, document: row });
    }
    if (path.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true, projectId: PROGRAM, sources: [], revisions: [], events: [], comments: [], total: 0, currentTotal: 0 });
  });
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); clearEditorTarget(); clearShellProject(); __resetCeremonies();
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});
const surface = { id: 'document-authoring', label: 'Authoring' } as OwnedSurfaceViewProps['surface'];
function Journey({ inline = false, sources = selectors }: { inline?: boolean; sources?: AssemblySourceSelector[] }) {
  const [editing, setEditing] = useState(inline);
  return <>
    {(inline || !editing) && <SourceAssemblyAction programId={PROGRAM} sources={sources}
      titles={['Retained Data Room report', 'Selected Vault record']} onNav={inline ? undefined : () => setEditing(true)} />}
    {editing && <DocumentAuthoring surface={surface} segment="biopharma" onNav={vi.fn()} />}
  </>;
}
function posts() { return apiRequest.mock.calls.filter(([method]) => method !== 'GET'); }
async function fillCreation() {
  const template = screen.getByLabelText('Start from');
  await waitFor(() => expect(Array.from((template as HTMLSelectElement).options).some(option => option.value === TEMPLATE)).toBe(true));
  fireEvent.change(template, { target: { value: TEMPLATE } });
  fireEvent.change(screen.getByLabelText(/Document title/), { target: { value: created.title } });
}
async function start(inline = false, beforeLaunch?: () => void, expectForm = true) {
  if (inline) records = [prior];
  const view = render(<Journey inline={inline} />);
  if (inline) await screen.findByRole('heading', { level: 1, name: 'Saved prior section' });
  beforeLaunch?.();
  fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
  const chooser = await screen.findByTestId('source-assembly-dialog');
  await waitFor(() => expect((within(chooser).getByLabelText('Working document') as HTMLSelectElement).disabled).toBe(false));
  fireEvent.click(within(chooser).getByRole('button', { name: /^(?:New document|Open document editor|Close to create a document)$/ }));
  await screen.findAllByRole('button', { name: 'New document' });
  if (expectForm) await screen.findByRole('dialog', { name: 'New document' }, { timeout: 750 });
  return view;
}

describe('selected sources continue through the real document creation host', () => {
  it.each([false, true])('reaches the canonical creation drawer without any write (inline=%s)', async inline => {
    await start(inline);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByLabelText(/Document title/)).toBeTruthy();
    expect(screen.getByLabelText('Start from')).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(document.querySelectorAll('.tiptap').length).toBeLessThanOrEqual(1);
  });
  it.each([false, true])('opens only the returned UUID with both original selectors and no automatic build (inline=%s)', async inline => {
    await start(inline); await fillCreation();
    const submit = screen.getByRole('button', { name: 'Create document' });
    act(() => { submit.click(); submit.click(); });
    await screen.findByRole('heading', { level: 1, name: 'New planning section' });
    const selected = await screen.findByTestId('assembly-selected-sources');
    expect(selected.textContent).toContain('Data Room source 12');
    expect(selected.textContent).toContain(`Vault document ${VAULT}`);
    expect(selected.textContent).toContain('a'.repeat(64));
    expect(selected.textContent).toContain('b'.repeat(64));
    expect(selected.textContent).toContain('No source text has been copied');
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toEqual(['POST', '/api/authoring/docs', {
      title: created.title, module: null, template_id: TEMPLATE, client_program_id: PROGRAM,
    }, { Authorization: `Bearer ${BEARER}`, 'x-organization-id': '12' }]);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    expect(document.querySelector('.tiptap')?.textContent).not.toContain('Keep the existing saved work.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('cancels the drawer without creating or binding its sources, and ordinary creation stays ordinary', async () => {
    await start(true);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    await screen.findByRole('dialog', { name: 'New document' });
    expect(screen.queryByText(/This start uses 2 selected sources/)).toBeNull();
    await fillCreation(); fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await screen.findByRole('heading', { level: 1, name: 'New planning section' });
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});

function editorNode() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
function typeLocalNote() { act(() => { editorNode().editor.commands.insertContent('Keep this unsaved source note. '); }); }
async function startAgain() {
  fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
  const chooser = await screen.findByTestId('source-assembly-dialog');
  await waitFor(() => expect((within(chooser).getByLabelText('Working document') as HTMLSelectElement).disabled).toBe(false));
  fireEvent.click(within(chooser).getByRole('button', { name: 'New document' }));
}

describe('source starts preserve the current canvas and deliberate recovery', () => {
  it('keeps the unsaved buffer guarded after Stay, then after opening and cancelling creation', async () => {
    await start(true, typeLocalNote, false);
    const original = editorNode();
    await screen.findByRole('alertdialog', { name: /Unsaved changes/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editorNode()).toBe(original); expect(original.textContent).toContain('Keep this unsaved source note.');
    expect(screen.queryByRole('dialog')).toBeNull();
    await startAgain();
    await screen.findByRole('alertdialog', { name: /Unsaved changes/ });
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    await screen.findByRole('dialog', { name: 'New document' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(editorNode()).toBe(original); expect(original.textContent).toContain('Keep this unsaved source note.');
    await startAgain();
    await screen.findByRole('alertdialog', { name: /Unsaved changes/ });
    expect(posts()).toHaveLength(0); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses creation after the actual selected sources change while its form is open', async () => {
    const view = await start(true); await fillCreation();
    view.rerender(<Journey inline sources={[{ ...selectors[0], expectedChecksum: 'c'.repeat(64) }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    expect(posts()).toHaveLength(0); expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'New document' })).toBeTruthy();
  });

  it.each(['source replacement', 'project round trip', 'session replacement', 'unmount'])('does not adopt a delayed confirmed source document after %s', async change => {
    const pending = deferred<Response>();
    const confirm = createReply; let input: Record<string, unknown> = {};
    createReply = body => { input = body; return pending.promise; };
    const view = await start(true); await fillCreation();
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    if (change === 'source replacement') view.rerender(<Journey inline sources={[{ ...selectors[0], expectedChecksum: 'c'.repeat(64) }]} />);
    else if (change === 'project round trip') {
      act(() => publishShellProject({ id: '11111111-1111-4111-8111-111111111399' }));
      act(() => publishShellProject({ id: PROGRAM }));
    } else if (change === 'session replacement') act(() => authService.setToken(BEARER, ACTOR, 'new-session', 3600));
    else view.unmount();
    await act(async () => { pending.resolve(await confirm(input)); await pending.promise; });
    expect(screen.queryByRole('heading', { level: 1, name: 'New planning section' })).toBeNull();
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    expect(peekEditorTarget()).toBeNull(); expect(posts()).toHaveLength(1);
  });

});

describe('source starts keep explicit receipt delivery and recovery', () => {
  it('keeps the source start valid through an actual same-session token refresh', async () => {
    const pending = deferred<Response>(); const confirm = createReply; let input: Record<string, unknown> = {};
    createReply = body => { input = body; return pending.promise; };
    await start(true); await fillCreation(); fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    const session = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => ok({ accessToken: BEARER, refreshToken: 'refreshed', expiresIn: 3600 })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true);
    await act(async () => { pending.resolve(await confirm(input)); await pending.promise; });
    await screen.findByRole('heading', { level: 1, name: 'New planning section' });
    expect(await screen.findByTestId('assembly-selected-sources')).toBeTruthy(); expect(posts()).toHaveLength(1);
  });

  it('closes one creation drawer with Escape and leaves ordinary opening independent', async () => {
    await start(true);
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    await screen.findByRole('dialog', { name: 'New document' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByText(/This start uses 2 selected sources/)).toBeNull();
  });

  it('retains exact selectors through explicit identified creation recovery', async () => {
    createReply = input => {
      records = [decoy, { ...created, template_id: String(input.template_id) }, ...records];
      throw new ApiRequestError('Current read unavailable', 503, { success: false, ok: false, retryAllowed: false,
        creationOutcome: 'committed', code: 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE',
        recovery: { documentId: CREATED, organizationId: 12, programId: PROGRAM } });
    };
    await start(true); await fillCreation(); fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    const check = await screen.findByRole('button', { name: 'Check working documents' });
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    fireEvent.click(check);
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified document' }));
    await screen.findByRole('heading', { level: 1, name: 'New planning section' });
    const selected = await screen.findByTestId('assembly-selected-sources');
    expect(selected.textContent).toContain('a'.repeat(64)); expect(selected.textContent).toContain('b'.repeat(64));
    expect(posts()).toHaveLength(1);
  });
  it('keeps an absent returned record unbound instead of guessing another working document', async () => {
    createReply = input => ok({ success: true, document: { ...created, template_id: input.template_id }, sections_seeded: 1 }, 201);
    await start(true); await fillCreation(); fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await screen.findByText(/exact record could not be verified in this project/);
    expect(screen.getByRole('heading', { level: 1, name: 'Saved prior section' })).toBeTruthy();
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull(); expect(posts()).toHaveLength(1);
  });

  it('hands the exact created record and selectors out of a filtered host after the form closes', async () => {
    await start(true, () => fireEvent.change(screen.getByLabelText('Filter documents by status'), { target: { value: 'APPROVED' } }));
    await fillCreation(); fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(peekEditorTarget()).toMatchObject({ docId: CREATED, programId: PROGRAM,
      assemblySources: { version: 1, sources: selectors } }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(posts()).toHaveLength(1);
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
  });

  it('preserves the original dirty canvas through creation and a reordered inventory until the actual leave decision', async () => {
    await start(true, typeLocalNote, false);
    const original = editorNode();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await screen.findByRole('dialog', { name: 'New document' }); await fillCreation();
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await screen.findByRole('alertdialog', { name: /Unsaved changes/ });
    expect(editorNode()).toBe(original);
    expect(original.textContent).toContain('Keep this unsaved source note.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editorNode()).toBe(original); expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open created document' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await screen.findByRole('heading', { level: 1, name: 'New planning section' });
    expect(await screen.findByTestId('assembly-selected-sources')).toBeTruthy(); expect(posts()).toHaveLength(1);
  });

});
