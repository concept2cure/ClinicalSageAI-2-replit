// @vitest-environment jsdom
/** The existing project's checked sources survive its searched/paged Data Room,
 * but only a fresh, complete exact read can hand them to AnA or the one editor. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }),
    useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: null, currentClientWorkspace: null }),
}));

import { authService, type AuthUser } from '@/services/portal/authService';
import { ProjectHome } from '../surfaces/ProjectHome';
import { clearShellProject, publishShellProject } from '../shellProject';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import { clearNavParams } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';
import type { SourceRow } from '../surfaces/projectSources';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const AUTHOR: AuthUser = { id: '7', organizationId: '4', organizationName: 'Synthetic sponsor',
  firstName: 'Synthetic', lastName: 'Author', displayName: 'Synthetic author', email: 'author@example.test',
  roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const props = { surface: { id: 'project-home', label: 'Project home' } as never,
  segment: 'biopharma', onNav: vi.fn(), onAsk: vi.fn() };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const token = (user = AUTHOR, revision = 1) => `fixture.${btoa(JSON.stringify({ userId: Number(user.id), organizationId: Number(user.organizationId), revision }))}.fixture`;
const startSession = (user = AUTHOR, revision = 1) => authService.setToken(token(user, revision), user, `fixture-refresh-${revision}`);
const source = (id: number, patch: Partial<SourceRow> = {}): SourceRow => ({
  id, title: `Source ${id}.pdf`, projectId: A, checksum: (id === 11 ? 'a' : 'b').repeat(64),
  ingestionStatus: 'ingested', extractionStatus: 'extracted', textAvailable: true,
  isCurrent: true, dataEligible: true, originalFileAvailable: true, disposition: null,
  createdAt: '2026-11-13T12:00:00Z', mimeType: 'application/pdf', fileSize: 100,
  artifactId: null, origin: 'chat_upload', extractionMethod: 'pdf-text', ...patch,
});
const page = (rows: SourceRow[], patch: Record<string, unknown> = {}) => ({
  projectId: A, sources: rows, total: rows.length, currentTotal: rows.length,
  window: { shown: rows.length, truncated: false }, ...patch,
});
const exact = (rows = [source(11)], ids = rows.map(row => row.id), patch: Record<string, unknown> = {}) =>
  page(rows, { selection: { scope: 'verified-accessible-sources', sourceIds: ids }, ...patch });
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
type Route = (url: string) => Response | Promise<Response>;
let listed: Route;
let selected: Route;
const exactReads = () => request.mock.calls.filter(([method, path]) => method === 'GET' &&
  new URL(String(path), 'http://example.test').searchParams.has('sourceIds'));
const selectedIds = (path: string) => new URL(path, 'http://example.test').searchParams.get('sourceIds')?.split(',').map(Number);
const publishProject = (id = A) => publishShellProject({ id, title: id === A ? 'Synthetic A' : 'Synthetic B', step: 'evidence' });
const pin = (id: number) => fireEvent.click(screen.getByRole('checkbox', { name: `Use Source ${id}.pdf as context` }));
const draft = () => screen.getByRole('button', { name: /Draft with \d+ pinned source/ });
function mount() {
  const view = render(<ProjectHome {...props} />);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Project lifecycle' })).getByRole('button', { name: 'Evidence' }));
  return view;
}
async function oneSelected() {
  const view = mount();
  await screen.findByText('Source 11.pdf'); pin(11);
  return view;
}
function expectNoHandoff() {
  expect(props.onAsk).not.toHaveBeenCalled();
  expect(props.onNav).not.toHaveBeenCalled();
  expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
  expect(peekEditorTarget()).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Build from selected sources' })).toBeNull();
}

beforeEach(() => {
  clearShellProject(); clearNavParams(); clearEditorTarget(); __resetSurfaceActionBus();
  startSession(); publishProject(); window.C2C_SOURCE_PINS = [];
  props.onAsk.mockReset(); props.onNav.mockReset();
  listed = () => ok(page([source(11)]));
  selected = () => ok(exact());
  request.mockReset().mockImplementation(async (_method: string, path: string) => {
    const url = new URL(path, 'http://example.test');
    if (/\/sources$/.test(url.pathname)) return url.searchParams.has('sourceIds') ? selected(path) : listed(path);
    if (path.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [] });
    if (/\/source-changes$/.test(url.pathname)) return ok({ changes: [], count: 0, vaultChanges: [], vaultCount: 0 });
    if (path === `/api/c2c/projects/${A}` || path === `/api/c2c/projects/${B}`) return ok({
      id: path.endsWith(A) ? A : B, name: path.endsWith(A) ? 'Synthetic A' : 'Synthetic B',
      program_type: 'IND', product_type: 'drug', primary_agency: 'FDA', status: 'active',
    });
    return ok({});
  });
  vi.stubGlobal('fetch', vi.fn(async () => ok({})));
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearShellProject(); clearNavParams(); clearEditorTarget();
  __resetSurfaceActionBus(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  localStorage.clear(); sessionStorage.clear();
  delete window.C2C_SOURCE_PINS; delete window.C2C_CONVO;
});

describe('the checked set belongs to the Data Room, not its current page', () => {
  it.each(['visible', 'off-page'])('can deliberately clear a %s selection and retire its delayed action', async location => {
    const pending = deferred<Response>(); selected = () => pending.promise;
    listed = path => ok(page(new URL(path, 'http://example.test').searchParams.has('q') ? [] : [source(11)]));
    await oneSelected(); fireEvent.click(draft());
    await waitFor(() => expect(exactReads()).toHaveLength(1));
    if (location === 'off-page') {
      fireEvent.change(screen.getByLabelText('Search sources by title or text'), { target: { value: 'not available' } });
      await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Use Source 11.pdf as context' })).toBeNull());
    }
    window.C2C_SOURCE_PINS = ['11'];
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('button', { name: /Draft with \d+ pinned source/ })).toBeNull();
    expect(window.C2C_SOURCE_PINS).toEqual([]);
    await act(async () => pending.resolve(ok(exact())));
    expectNoHandoff();
    expect(exactReads()).toHaveLength(1);
  });

  it.each(['search', 'pagination'] as const)('retains both checked identities across %s and freshly admits the whole AnA handoff', async navigation => {
    const pending = deferred<Response>();
    listed = path => {
      const query = new URL(path, 'http://example.test').searchParams;
      return query.has('q') || query.has('offset') ? ok(page([source(22)]))
        : ok(page([source(11)], { total: 2, currentTotal: 2, window: { shown: 1, truncated: true } }));
    };
    selected = () => pending.promise;
    mount(); await screen.findByText('Source 11.pdf'); pin(11);
    if (navigation === 'search') fireEvent.change(screen.getByLabelText('Search sources by title or text'), { target: { value: 'second source' } });
    else fireEvent.click(screen.getByRole('button', { name: 'Older sources' }));
    await screen.findByText('Source 22.pdf'); pin(22);
    expect(draft().textContent).toContain('2 pinned sources');
    fireEvent.click(draft());
    await waitFor(() => expect(exactReads()).toHaveLength(1));
    const path = String(exactReads()[0][1]);
    expect(selectedIds(path)?.sort((a, b) => a - b)).toEqual([11, 22]);
    expect([...new URL(path, 'http://example.test').searchParams.keys()]).toEqual(['sourceIds']);
    expectNoHandoff();
    await act(async () => pending.resolve(ok(exact([source(22), source(11)], [22, 11]))));
    await waitFor(() => expect(window.C2C_SOURCE_PINS).toEqual(['11', '22']));
    expect(props.onAsk).toHaveBeenCalledExactlyOnceWith('Use the 2 sources I pinned in the data room as the context for this project.');
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('opens the existing editor chooser only after exact admission and carries the checked digests into New document', async () => {
    const pending = deferred<Response>();
    listed = path => ok(page(new URL(path, 'http://example.test').searchParams.has('q') ? [source(22)] : [source(11)]));
    selected = () => pending.promise;
    const view = mount(); await screen.findByText('Source 11.pdf'); pin(11);
    fireEvent.change(screen.getByLabelText('Search sources by title or text'), { target: { value: 'second' } });
    await screen.findByText('Source 22.pdf'); pin(22);
    const beforeAuthoring = request.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
    await waitFor(() => expect(exactReads()).toHaveLength(1)); expectNoHandoff();
    // No borrowed saved target or template is used as a source-read preflight.
    expect(request.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/'))).toHaveLength(beforeAuthoring);
    await act(async () => pending.resolve(ok(exact([source(22), source(11)]))));
    const dialog = await screen.findByRole('dialog', { name: 'Build from selected sources' });
    expect(within(dialog).getByText(`SHA-256 ${'a'.repeat(64)}`)).toBeTruthy();
    expect(within(dialog).getByText(`SHA-256 ${'b'.repeat(64)}`)).toBeTruthy();
    await within(dialog).findByText('No working documents are available in this project.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'New document' }));
    expect(peekEditorTarget()?.sourceDocumentStart?.sources).toEqual([
      { kind: 'data-room', sourceId: 11, expectedChecksum: 'a'.repeat(64) },
      { kind: 'data-room', sourceId: 22, expectedChecksum: 'b'.repeat(64) },
    ]);
    expect(peekEditorTarget()?.docId).toBeNull();
    expect(props.onNav).toHaveBeenCalledExactlyOnceWith('document-authoring');
    expect(props.onAsk).not.toHaveBeenCalled();
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    // The existing receiver consumes this intent after the originating project
    // page unmounts during the deliberate navigation.
    view.unmount();
    expect(peekEditorTarget()?.sourceDocumentStart?.sources).toHaveLength(2);
  });

  it('admits retained readable data whose original bytes are unavailable', async () => {
    const retained = source(11, { originalFileAvailable: false, disposition: 'keep_data' });
    listed = () => ok(page([retained])); selected = () => ok(exact([retained]));
    await oneSelected(); fireEvent.click(draft());
    await waitFor(() => expect(props.onAsk).toHaveBeenCalledTimes(1));
    expect(exactReads()).toHaveLength(1); expect(window.C2C_SOURCE_PINS).toEqual(['11']);
  });

  it('retires a known refreshed withdrawal rather than preserving a now-ineligible selection', async () => {
    await oneSelected();
    listed = () => ok(page([source(11, { dataEligible: false, disposition: 'remove_data' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' }));
    await screen.findByText('Data withdrawn');
    expect(screen.queryByRole('button', { name: /Draft with 1 pinned/ })).toBeNull();
    expectNoHandoff();
  });
});

describe('exact source admission is complete, current and checked-version specific', () => {
  const refusals: Array<[string, () => Response]> = [
    ['HTTP failure', () => ({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }) as Response],
    ['missing attestation', () => ok(page([source(11)]))],
    ['wrong project', () => ok(exact([source(11)], [11], { projectId: B }))],
    ['missing project', () => ok(exact([source(11)], [11], { projectId: undefined }))],
    ['unverified scope', () => ok(exact([source(11)], [11], { selection: { scope: 'project', sourceIds: [11] } }))],
    ['empty attested set', () => ok(exact([source(11)], []))],
    ['duplicate attested identity', () => ok(exact([source(11)], [11, 11]))],
    ['unrelated attested identity', () => ok(exact([source(11)], [11, 22]))],
    ['string attested identity', () => ok(exact([source(11)], [11], { selection: { scope: 'verified-accessible-sources', sourceIds: ['11'] } }))],
    ['missing selected row', () => ok(exact([], [11]))],
    ['duplicate selected row', () => ok(exact([source(11), source(11)], [11]))],
    ['unrelated selected row', () => ok(exact([source(11), source(22)], [11]))],
    ['changed checked digest', () => ok(exact([source(11, { checksum: 'c'.repeat(64) })]))],
    ['missing checked digest', () => ok(exact([source(11, { checksum: null })]))],
    ['withdrawn data', () => ok(exact([source(11, { dataEligible: false, disposition: 'remove_data' })]))],
    ['replaced identity', () => ok(exact([source(11, { isCurrent: false })]))],
    ['unreadable text', () => ok(exact([source(11, { textAvailable: false })]))],
    ['processing has not supplied readable text', () => ok(exact([source(11, { textAvailable: false, processing: { state: 'running', retryable: false, reasonCode: null,
      leaseExpiresAt: '2026-11-14T01:00:00Z', nextRetryAt: null } })]))],
    ['pending source store', () => ok({ success: true, data: exact(), meta: { pendingStore: true } })],
  ];
  it.each(refusals)('publishes neither AnA pins nor editor start after %s', async (_label, response) => {
    selected = response; await oneSelected(); fireEvent.click(draft());
    await act(async () => {});
    expectNoHandoff();
    expect(exactReads()).toHaveLength(1);
    expect((screen.getByRole('checkbox', { name: 'Use Source 11.pdf as context' }) as HTMLInputElement).checked).toBe(true);
  });

  it('rechecks the selected identities on each deliberate action instead of reusing a successful read', async () => {
    await oneSelected(); fireEvent.click(draft());
    await waitFor(() => expect(props.onAsk).toHaveBeenCalledTimes(1));
    window.C2C_SOURCE_PINS = []; props.onAsk.mockClear();
    selected = () => ok(exact([source(11, { checksum: 'c'.repeat(64) })]));
    fireEvent.click(draft()); await act(async () => {});
    expectNoHandoff(); expect(exactReads()).toHaveLength(2);
  });

  it('does not silently update the checked digest when the visible row refreshes to different content', async () => {
    await oneSelected();
    listed = () => ok(page([source(11, { checksum: 'c'.repeat(64) })]));
    selected = () => ok(exact([source(11, { checksum: 'c'.repeat(64) })]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' }));
    await waitFor(() => expect(request.mock.calls.filter(([, path]) => path === `/api/c2c/projects/${A}/sources`)).toHaveLength(2));
    await act(async () => {});
    fireEvent.click(draft()); await act(async () => {});
    expectNoHandoff();
  });

  it.each([null, '', '   '])('refuses a missing original checked checksum %j even if the fresh read repeats it', async checksum => {
    const row = source(11, { checksum });
    listed = () => ok(page([row])); selected = () => ok(exact([row]));
    await oneSelected(); fireEvent.click(draft()); await act(async () => {});
    expectNoHandoff();
  });
});

describe('a delayed exact action never outlives its selected set or owner', () => {
  it.each(['selection', 'selection ABA', 'project', 'project ABA', 'actor', 'session', 'access'] as const)('retires a delayed AnA handoff after %s changes', async change => {
    const pending = deferred<Response>(); selected = () => pending.promise;
    const view = await oneSelected(); fireEvent.click(draft());
    await waitFor(() => expect(exactReads()).toHaveLength(1));
    if (change === 'selection' || change === 'selection ABA') {
      pin(11); if (change === 'selection ABA') pin(11);
    } else if (change === 'project' || change === 'project ABA') {
      act(() => publishProject(B));
      if (change === 'project ABA') act(() => publishProject(A));
    } else act(() => {
      const next = change === 'actor' ? { ...AUTHOR, id: '8' } : change === 'access' ? { ...AUTHOR, roles: ['admin'] } : AUTHOR;
      startSession(next, 2);
    });
    view.rerender(<ProjectHome {...props} />);
    await act(async () => pending.resolve(ok(exact())));
    expectNoHandoff();
  });

  it('retires editor launch when the selection changes away and back during exact JSON parsing', async () => {
    const body = deferred<unknown>();
    selected = () => ({ ok: true, status: 200, json: () => body.promise }) as Response;
    await oneSelected(); fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
    await waitFor(() => expect(exactReads()).toHaveLength(1));
    pin(11); pin(11);
    await act(async () => body.resolve(exact()));
    expectNoHandoff();
  });

  it.each(['selection', 'project', 'session'] as const)('prevents either editor handoff after %s changes while the actual chooser is open', async change => {
    const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fallback = request.getMockImplementation()!;
    request.mockImplementation(async (method: string, path: string, ...rest: unknown[]) => path.startsWith('/api/authoring/docs?')
      ? ok({ success: true, documents: [{ id: documentId, title: 'Synthetic working document', program_id: A, status: 'draft', readScope: 'document' }] })
      : fallback(method, path, ...rest));
    await oneSelected();
    const originalCheckbox = screen.getByRole('checkbox', { name: 'Use Source 11.pdf as context' });
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Build from selected sources' });
    await within(dialog).findByRole('option', { name: 'Synthetic working document' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Working document' }), { target: { value: documentId } });
    const start = within(dialog).getByRole('button', { name: 'New document' });
    const open = within(dialog).getByRole('button', { name: 'Open in editor' });
    expect((open as HTMLButtonElement).disabled).toBe(false);
    // Retain both action references: a retired chooser must not deliver even
    // when an event was already queued before its context changed.
    if (change === 'selection') fireEvent.click(originalCheckbox);
    else if (change === 'project') act(() => publishProject(B));
    else act(() => startSession(AUTHOR, 2));
    fireEvent.click(start); fireEvent.click(open); await act(async () => {});
    expect(props.onAsk).not.toHaveBeenCalled(); expect(props.onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull(); expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
  });

  it('accepts a still-current exact action after an actual same-account bearer refresh', async () => {
    const pending = deferred<Response>(); selected = () => pending.promise;
    await oneSelected(); fireEvent.click(draft());
    await waitFor(() => expect(exactReads()).toHaveLength(1));
    const guard = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: token(AUTHOR, 2),
      refreshToken: 'fixture-rotated-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(guard.sameRevision()).toBe(true); expect(guard.credentialsCurrent()).toBe(false);
    await act(async () => pending.resolve(ok(exact())));
    await waitFor(() => expect(props.onAsk).toHaveBeenCalledTimes(1));
    expect(window.C2C_SOURCE_PINS).toEqual(['11']); expect(exactReads()).toHaveLength(1);
  });
});

describe('explicit choices retain the existing independent action limits', () => {
  it.each([20, 21])('does not silently truncate %i checked sources for AnA', async count => {
    const rows = Array.from({ length: count }, (_, index) => source(index + 1));
    listed = () => ok(page(rows)); selected = path => ok(exact(rows, selectedIds(path)));
    mount(); await screen.findByText('Source 1.pdf'); rows.forEach(row => pin(row.id));
    fireEvent.click(draft()); await act(async () => {});
    if (count === 20) {
      await waitFor(() => expect(props.onAsk).toHaveBeenCalledTimes(1));
      expect(exactReads()).toHaveLength(1); expect(window.C2C_SOURCE_PINS).toEqual(rows.map(row => String(row.id)));
      expect(selectedIds(String(exactReads()[0][1]))).toHaveLength(20);
    } else { expectNoHandoff(); expect(exactReads()).toHaveLength(0); }
    expect(screen.getAllByRole('checkbox').filter(element => (element as HTMLInputElement).checked)).toHaveLength(count);
  });

  it('refuses six checked sources for editor assembly without shortening the selection or reading a target', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => source(index + 1));
    listed = () => ok(page(rows));
    mount(); await screen.findByText('Source 1.pdf'); rows.forEach(row => pin(row.id));
    expect((screen.getByRole('button', { name: 'Build in editor' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Select up to 5 sources to build in the editor\. 6 are selected\./)).toBeTruthy();
    expect(screen.getAllByRole('checkbox').filter(element => (element as HTMLInputElement).checked)).toHaveLength(6);
    expect(exactReads()).toHaveLength(0); expectNoHandoff();
  });
});
