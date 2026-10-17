// @vitest-environment jsdom
/** Actual creation form and work drawer; only authenticated transport is synthetic. */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clearAuthToken } from '@/utils/authToken';
import { authService } from '@/services/portal/authService';
import { ApiRequestError } from '@/lib/queryClient';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { TaskTray } from '../TaskTray';
import { publishShellProject } from '../shellProject';
import { surfaceLeaveRefusal } from '../navParams';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { getSurface } from '@shared/constants/ui-surface-registry';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), onNav: vi.fn(), onDocCreated: vi.fn(),
  onSectionCreated: vi.fn(), onCheck: vi.fn(), toast: vi.fn(),
  user: { id: 7, organizationId: 7, role: 'admin', permissions: ['governed:write'] } }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: mocks.apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: mocks.user }), useAuthUser: () => mocks.user }));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TASK = 'TASK-CREATION-42';
const TITLE = 'Review the saved toxicology report';
type Kind = 'document' | 'section';
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const receipt = (kind: Kind, project = A) => kind === 'document'
  ? { success: true, document: { id: 'D-created', title: 'Created overview', client_program_id: project, template_id: null } }
  : { success: true, section: { id: 'S-created', code: '2.6.6', doc_id: 'D1' } };
const scopedRead = (kind: Kind, project = A) => kind === 'document'
  ? { success: true, documents: [{ id: 'D-existing', program_id: project }] }
  : { success: true, sections: [{ id: 'S-existing', doc_id: 'D1' }] };
let post: () => Promise<Response>;
let recover: () => Promise<Response>;
const postCalls = () => mocks.apiRequest.mock.calls.filter(call => call[0] === 'POST');

function Host({ programId = A, nativeHost = false }: { programId?: string; nativeHost?: boolean }) {
  const [destination, setDestination] = useState('');
  return <>
    <TaskTray onNav={target => { mocks.onNav(target); setDestination(target); }} />
    {destination ? <output aria-label="Task destination">{destination}</output> : nativeHost
      ? <DocumentAuthoring surface={getSurface('document-authoring')!} segment="biopharma" onNav={target => { mocks.onNav(target); setDestination(target); }} />
      : <AuthoringCreateExport
      docId="D1" docTitle="Saved overview" docStatus="DRAFT" module="M2" programId={programId}
      fireToast={mocks.toast} onDocCreated={mocks.onDocCreated} onSectionCreated={mocks.onSectionCreated}
      onCheckCreation={mocks.onCheck} />}
  </>;
}

for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(() => {
  Object.values(mocks).forEach(value => { if (vi.isMockFunction(value)) value.mockReset(); });
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  mocks.user = { id: 7, organizationId: 7, role: 'admin', permissions: ['governed:write'] };
  mocks.onCheck.mockResolvedValue(true);
  publishShellProject({ id: A, title: 'Synthetic project A' });
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.synthetic`,
    { ...mocks.user, id: String(mocks.user.id), organizationId: String(mocks.user.organizationId) }, 'fixture-refresh', 3600);
  post = async () => { throw new TypeError('Creation response lost'); };
  recover = async () => response(scopedRead('document'));
  mocks.apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST') return post();
    if (path === '/api/authoring/templates') return response({ success: true, templates: [] });
    if (path.startsWith('/api/authoring/docs')) return recover();
    if (path === '/api/task-management/my-work') return response({ data: {
      items: [{ taskId: TASK, title: TITLE, projectId: 12, moduleType: 'authoring', status: 'pending', priority: 'high',
        dueDate: null, overdue: false, dueSoon: false, blocked: false, approvalRequired: false, approvalStatus: null, criticalPath: false }],
      total: 1, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0,
    } });
    if (path.startsWith('/api/mdx/notifications/unread-count')) return response({ data: { unread: 0 } });
    if (path.startsWith('/api/mdx/notifications')) return response({ data: [] });
    if (path === '/api/concept2cure/reviews/my-queue') return response({ data: {
      threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0,
    } });
    return response({ data: { approvals: [] } });
  });
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); delete window.C2C_PROJECT; sessionStorage.clear(); localStorage.clear(); });

async function begin(kind: Kind, cancel = true) {
  fireEvent.click(screen.getAllByRole('button', { name: kind === 'document' ? /New document/ : /New section/ })[0]);
  const dialog = await screen.findByRole('dialog', { name: kind === 'document' ? 'New document' : 'New section' });
  if (kind === 'document') fireEvent.change(within(dialog).getByRole('textbox', { name: /Document title/ }), { target: { value: 'Created overview' } });
  else {
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Section code/ }), { target: { value: '2.6.6' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Section title/ }), { target: { value: 'Toxicology summary' } });
  }
  const submit = within(dialog).getByRole('button', { name: kind === 'document' ? 'Create document' : 'Create section' });
  const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
  act(() => { submit.click(); if (cancel) cancelButton.click(); });
  expect(postCalls()).toHaveLength(1);
}
async function clickTask() {
  if (!screen.queryByRole('dialog', { name: 'Your work' })) {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Your work/ })); });
  }
  const drawer = await screen.findByRole('dialog', { name: 'Your work' });
  const task = await within(drawer).findByRole('button', { name: new RegExp(TITLE) });
  await act(async () => { fireEvent.click(task); });
  return drawer;
}
const closeTray = async () => {
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog', { name: 'Your work' })).getByRole('button', { name: 'Close' })); });
};
async function expectHeld() {
  const drawer = await clickTask();
  expect(mocks.onNav).not.toHaveBeenCalled();
  expect(within(drawer).getByRole('alert').textContent).toMatch(/creat|unconfirmed|checking/i);
  expect(screen.queryByLabelText('Task destination')).toBeNull();
}
async function expectExactNavigation() {
  await clickTask();
  expect(mocks.onNav).toHaveBeenCalledWith(`tasks?taskId=${TASK}&taskActor=7&taskOrg=7`);
  expect(screen.getByLabelText('Task destination').textContent).toContain(TASK);
}

describe('canceled creation still owns the existing authoring host', () => {
  it.each(['receipt', 'identified503'] as const)('retires native creation before a same-project account replacement receives its old %s', async outcome => {
    const pending = deferred<Response>(); post = () => pending.promise;
    const host = render(<Host />); await begin('document');
    expect(surfaceLeaveRefusal()).toMatch(/still being created/i);
    act(() => {
      mocks.user = { ...mocks.user, id: 8 };
      authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 8, organizationId: 7 }))}.synthetic`,
        { ...mocks.user, id: String(mocks.user.id), organizationId: String(mocks.user.organizationId) }, 'fixture-refresh-8', 3600);
      expect(surfaceLeaveRefusal()).toBeNull();
    });
    host.rerender(<Host />);
    await act(async () => { pending.resolve(outcome === 'receipt' ? response(receipt('document'), 201) : response({
      ok: false, code: 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE', creationOutcome: 'committed', retryAllowed: false,
      recovery: { documentId: 'dddddddd-0000-4000-8000-000000000001', organizationId: 7, programId: A },
    }, 503)); await pending.promise; });
    expect(mocks.toast).not.toHaveBeenCalled(); expect(mocks.onDocCreated).not.toHaveBeenCalled();
    expect(surfaceLeaveRefusal()).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: /New document/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each<Kind>(['document', 'section'])('holds the exact assigned task after a synchronous %s create and Cancel', async kind => {
    const pending = deferred<Response>(); post = () => pending.promise;
    render(<Host />); await begin(kind);
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectHeld();
    expect(postCalls()).toHaveLength(1);
    await act(async () => pending.resolve(response(receipt(kind), 201)));
  });

  it.each<Kind>(['document', 'section'])('releases a confirmed %s receipt before its normal callback and exact task navigation', async kind => {
    const pending = deferred<Response>(); post = () => pending.promise;
    const callback = kind === 'document' ? mocks.onDocCreated : mocks.onSectionCreated;
    callback.mockImplementation(() => expect(surfaceLeaveRefusal()).toBeNull());
    render(<Host />); await begin(kind);
    await act(async () => pending.resolve(response(receipt(kind), 201)));
    expect(callback).toHaveBeenCalledOnce();
    await expectExactNavigation(); expect(postCalls()).toHaveLength(1);
  });

  it('releases a definite403 refusal after the native form is closed', async () => {
    post = async () => { throw new ApiRequestError('Creation refused by project policy', 403); };
    render(<Host />); await begin('document', false);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/Nothing was created/), 'error'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expectExactNavigation(); expect(mocks.onDocCreated).not.toHaveBeenCalled();
  });

  it('retains an HTTP408 as unknown and never claims nothing was created', async () => {
    post = async () => { throw new ApiRequestError('Request timed out', 408); };
    render(<Host />); await begin('document');
    await screen.findByRole('button', { name: 'Check working documents' });
    expect(mocks.toast.mock.calls.map(call => call[0]).join(' ')).not.toMatch(/Nothing was created/);
    await expectHeld(); expect(mocks.onDocCreated).not.toHaveBeenCalled();
  });
});

describe('creation recovery must finish before leaving for a task', () => {
  it.each<Kind>(['document', 'section'])('holds unknown %s, its recovery read and host refresh until all succeed', async kind => {
    const read = deferred<Response>(); const refresh = deferred<boolean>();
    recover = () => read.promise; mocks.onCheck.mockImplementation(() => refresh.promise);
    render(<Host />); await begin(kind);
    const checkName = kind === 'document' ? 'Check working documents' : 'Check document sections';
    await screen.findByRole('button', { name: checkName }); await expectHeld(); await closeTray();
    fireEvent.click(screen.getByRole('button', { name: checkName }));
    await expectHeld(); await closeTray();
    await act(async () => read.resolve(response(scopedRead(kind))));
    expect(mocks.onCheck).toHaveBeenCalledWith(kind);
    await expectHeld(); await closeTray();
    await act(async () => refresh.resolve(true));
    await expectExactNavigation(); expect(postCalls()).toHaveLength(1);
    expect(mocks.onDocCreated).not.toHaveBeenCalled(); expect(mocks.onSectionCreated).not.toHaveBeenCalled();
  });

  it.each(['403', 'wrong scope', 'host refresh failure'])('retains uncertainty after a %s recovery', async mode => {
    recover = async () => mode === '403' ? response({ error: 'Denied' }, 403)
      : response(scopedRead('document', mode === 'wrong scope' ? B : A));
    if (mode === 'host refresh failure') mocks.onCheck.mockRejectedValue(new Error('Host list unavailable'));
    render(<Host />); await begin('document');
    const check = await screen.findByRole('button', { name: 'Check working documents' });
    fireEvent.click(check);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Check working documents' }) as HTMLButtonElement).disabled).toBe(false));
    await expectHeld(); expect(postCalls()).toHaveLength(1); expect(mocks.onDocCreated).not.toHaveBeenCalled();
  });
});

describe('retained ledger ownership across authoring contexts', () => {
  it('keeps an earlier project’s unresolved entry through A→B→A and suppresses its late receipt', async () => {
    const pending = deferred<Response>(); post = () => pending.promise;
    const host = render(<Host />); await begin('document');
    act(() => publishShellProject({ id: B, title: 'Synthetic project B' })); host.rerender(<Host programId={B} />);
    await expectHeld(); await closeTray();
    await act(async () => pending.resolve(response(receipt('document'), 201)));
    expect(mocks.onDocCreated).not.toHaveBeenCalled();
    act(() => publishShellProject({ id: A, title: 'Synthetic project A' })); host.rerender(<Host />);
    await expectHeld(); await closeTray();
    fireEvent.click(screen.getByRole('button', { name: 'Check working documents' }));
    await waitFor(() => expect(mocks.onCheck).toHaveBeenCalledWith('document'));
    await expectExactNavigation();
  });

  it('unregisters a retired host without letting its late response recreate a guard or open a document', async () => {
    const pending = deferred<Response>(); post = () => pending.promise;
    const host = render(<Host />); await begin('document'); host.unmount();
    render(<TaskTray onNav={mocks.onNav} />);
    await act(async () => pending.resolve(response(receipt('document'), 201)));
    expect(surfaceLeaveRefusal()).toBeNull(); expect(mocks.onDocCreated).not.toHaveBeenCalled();
    await clickTask(); expect(mocks.onNav).toHaveBeenCalledWith(`tasks?taskId=${TASK}&taskActor=7&taskOrg=7`);
  });
});


async function failedHostRefresh(kind: Kind, failure: '503' | 'wrong scope') {
    const docId = 'dddddddd-0000-4000-8000-000000000001';
    const doc = { id: docId, title: 'Saved overview', program_id: A, client_program_id: A, module: 'M3', product_code: null,
      section_count: 1, status: 'DRAFT', updated_at: '2026-10-14T10:00:00Z' };
    const section = { id: 'aaaaaaaa-0000-4000-8000-000000000001', doc_id: docId, code: '3.2.P.8.1',
      title: 'Stability summary', content: '<p>Saved stability text.</p>', order_index: 0, updated_at: doc.updated_at };
    let scopedReads = 0;
    const original = mocks.apiRequest.getMockImplementation()!;
    mocks.apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === `/api/authoring/docs/${docId}`) return response({ document: doc });
      const isList = path.startsWith('/api/authoring/docs?');
      const isSections = path === `/api/authoring/docs/${docId}/sections`;
      if (method === 'GET' && (isList || isSections)) {
        const counted = kind === 'document' ? isList : isSections;
        if (counted && ++scopedReads >= 3) {
          if (failure === '503') return response({ success: false, message: 'Host list could not be refreshed' }, 503);
          return response(isList ? { success: true, documents: [{ ...doc, program_id: B, title: 'Foreign host record' }] }
            : { success: true, sections: [{ ...section, doc_id: 'foreign-document', content: '<p>Foreign host record</p>' }] });
        }
        return response(isList
          ? { success: true, documents: kind === 'document' ? [] : [doc] }
          : { success: true, sections: [section] });
      }
      return original(method, path);
    });
    await act(async () => { render(<Host nativeHost />); });
    if (kind === 'section') await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Saved stability text.'));
    await begin(kind);
    const checkName = kind === 'document' ? 'Check working documents' : 'Check document sections';
    fireEvent.click(await screen.findByRole('button', { name: checkName }));
    await waitFor(() => expect(scopedReads).toBeGreaterThanOrEqual(3));
    await act(async () => { await Promise.resolve(); });
    await expectHeld();
    expect(postCalls()).toHaveLength(1); expect(mocks.onNav).not.toHaveBeenCalled();
    expect(screen.queryByText('Foreign host record')).toBeNull();
}

describe('actual authoring host refresh is part of recovery', () => {
  it.each<Kind>(['document', 'section'])('holds an unknown %s when the actual host refresh fails after a valid recovery read', async kind => {
    await failedHostRefresh(kind, '503');
  });
  it.each<Kind>(['document', 'section'])('refuses a wrong-scope %s host refresh after the recovery read succeeded', async kind => {
    await failedHostRefresh(kind, 'wrong scope');
  });
});
