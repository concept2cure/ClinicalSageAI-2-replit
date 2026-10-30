// @vitest-environment jsdom
/** Real ProjectHome state belongs to its project and adopted session, not its mounting slot. */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
// This read-only fixture has no selected client workspace. Sharing still
// resolves its actor from the real adopted session and keeps its own guards.
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: null, currentClientWorkspace: null }),
}));
import { authService, type AuthUser } from '@/services/portal/authService';
import { ProjectHome } from '../surfaces/ProjectHome';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const AUTHOR: AuthUser = { id: '7', organizationId: '4', organizationName: 'Synthetic sponsor',
  firstName: 'Test', lastName: 'Author', displayName: 'Author', email: 'author@example.test',
  roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const props = { surface: { id: 'project-home', label: 'Project home' } as never,
  segment: 'biopharma', onNav: vi.fn(), onAsk: vi.fn() };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });
type Snapshot = { project: string | number | null; text: string; textarea: HTMLTextAreaElement | null; draft: string };
type Override = (method: string, path: string) => Response | Promise<Response> | undefined;
let override: Override;
let ownerLabel: string;

const letter = (pid: string) => pid === A ? 'A' : 'B';
const threadRows = (pid: string, from = 1, count = 9, label = ownerLabel) => Array.from({ length: count }, (_, index) => ({
  id: `${label}-${letter(pid)}-${from + index}`, title: `${label} ${letter(pid)} conversation ${from + index}`,
  program_id: pid, created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z',
}));
const doc = (pid: string) => ({ id: pid === A ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: `${letter(pid)} working document`, program_id: pid, client_program_id: pid, status: 'draft',
  module: '2', c2c_document_id: null, updated_at: null, section_count: 0 });

function responseFor(path: string): Response {
  const pid = path.includes(B) ? B : A;
  if (path === `/api/c2c/projects/${pid}`) return ok({ id: pid, name: `Project ${letter(pid)}`,
    product_name: { [A]: 'Alpha', [B]: 'Beta' }[pid], program_type: 'IND', product_type: 'drug', primary_agency: 'FDA', status: 'active' });
  if (path.startsWith('/api/authoring/docs?')) return ok({ documents: [doc(pid)] });
  if (path.endsWith('/activity')) return ok({ activity: [{ actor_name: `${ownerLabel} ${letter(pid)} actor`,
    action: 'document_created', occurred_at: '2026-10-30T10:00:00Z', reason: `${ownerLabel} audit reason` }] });
  if (path.endsWith('/dossier')) {
    const pct = ownerLabel === 'Original' && pid === A ? 81 : 37;
    const figure = { state: 'measured', pct, counted: 100, complete: pct };
    return ok({ projectId: pid, measuredAt: '2026-10-30T10:00:00Z', home: figure, markets: [], rows: [{
      group: 'module', module: '2', agency: null, label: `${ownerLabel} measured module`, documentId: doc(pid).id,
      counted: 100, complete: pct, inReview: 0, drafted: 0, figure, lastUpdated: null,
    }] });
  }
  if (path.endsWith('/team')) return ok({ program_id: pid, project_id: pid === A ? 51 : 61, team: [] });
  if (path.startsWith('/api/chat/threads?')) {
    const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset') ?? 0);
    return ok({ threads: threadRows(pid, offset + 1, offset ? 2 : 9) });
  }
  if (path === '/api/ana-ri/runs?mine=live') return ok({ runs: [] });
  if (path.startsWith('/api/review/board')) return ok({ queue: [] });
  return ok({});
}
function pendingRead() {
  let answer!: (response: Response) => void;
  return { promise: new Promise<Response>(resolve => { answer = resolve; }), resolve: (value: Response) => answer(value) };
}
function selectProject(pid: string, title = `Project ${letter(pid)}`) {
  publishShellProject({ id: pid, title, product: pid === A ? 'Alpha' : 'Beta', step: 'author' });
}
function BeforeEffects({ capture }: { capture: () => void }) {
  React.useLayoutEffect(() => { capture(); });
  return null;
}
function mountPage() {
  const snapshots: Snapshot[] = [];
  const capture = () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.pj-convo textarea');
    snapshots.push({ project: readShellProject()?.id ?? null, text: document.body.textContent ?? '',
      textarea, draft: textarea?.value ?? '' });
  };
  const tree = () => <><ProjectHome {...props} /><BeforeEffects capture={capture} /></>;
  const view = render(tree());
  return { snapshots, view, rerender: () => view.rerender(tree()), visit: (pid: string) => {
    act(() => { selectProject(pid); view.rerender(tree()); });
  } };
}
const composer = () => screen.getByRole('textbox', { name: /Start a conversation in/ }) as HTMLTextAreaElement;
const stage = (name: string) => within(screen.getByRole('navigation', { name: 'Project lifecycle' })).getByRole('button', { name });
const threadReads = () => request.mock.calls.filter(([, path]) => String(path).startsWith('/api/chat/threads?')).map(([, path]) => path);
const scopedReads = () => request.mock.calls.filter(([, path]) =>
  /^\/api\/c2c\/projects\/[^/]+(?:\/(?:activity|dossier|team))?$/.test(String(path)) ||
  String(path).startsWith('/api/chat/threads?')).map(([, path]) => path);
async function ready(pid = A, label = ownerLabel) {
  await screen.findByText(`${label} ${letter(pid)} conversation 1`);
  await screen.findByText(`${label} ${letter(pid)} actor`);
  await waitFor(() => expect(document.body.textContent).toContain(pid === A && label === 'Original' ? '81%' : '37%'));
}
function expectOldOwnerAbsent(snapshot: Snapshot) {
  expect(snapshot.text).not.toContain('Original A conversation');
  expect(snapshot.text).not.toContain('Original A actor');
  expect(snapshot.text).not.toContain('81%');
  expect(snapshot.draft).not.toBe('Question only for project A');
}

beforeEach(() => {
  clearShellProject(); clearNavParams(); __resetSurfaceActionBus();
  ownerLabel = 'Original'; override = () => undefined;
  request.mockReset().mockImplementation(async (method: string, path: string) => override(method, path) ?? responseFor(path));
  props.onNav.mockReset(); props.onAsk.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => json(503, {})));
  authService.setToken('synthetic-original', AUTHOR, 'synthetic-original-refresh');
  selectProject(A);
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearShellProject(); clearNavParams(); __resetSurfaceActionBus();
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
  delete window.C2C_CONVO; delete window.C2C_SOURCE_PINS;
});

it('does not send project A’s unsent question from the same-mounted project B composer', async () => {
  const page = mountPage(); await ready();
  const original = composer(); fireEvent.change(original, { target: { value: 'Question only for project A' } });
  page.visit(B); await ready(B);
  fireEvent.keyDown(composer(), { key: 'Enter' });
  expect(props.onNav).not.toHaveBeenCalled();
  expect(window.C2C_CONVO).toBeUndefined();
  expect(composer()).not.toBe(original);
  expect(composer().value).toBe('');
  expect(request.mock.calls.filter(([method]) => method !== 'GET')).toEqual([]);
});

it('retires draft, older pages, activity and dossier in B’s first commit before passive read resets', async () => {
  const page = mountPage(); await ready();
  fireEvent.change(composer(), { target: { value: 'Question only for project A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show older conversations' }));
  await screen.findByText('Original A conversation 10');
  const program = pendingRead(), activity = pendingRead(), dossier = pendingRead(), threads = pendingRead();
  override = (_method, path) => path === `/api/c2c/projects/${B}` ? program.promise
    : path === `/api/c2c/projects/${B}/activity` ? activity.promise
      : path === `/api/c2c/projects/${B}/dossier` ? dossier.promise
        : path.startsWith(`/api/chat/threads?program_id=${B}`) ? threads.promise : undefined;
  const before = page.snapshots.length;
  page.visit(B);
  const committed = page.snapshots.slice(before).filter(snapshot => snapshot.project === B);
  expect(committed.length).toBeGreaterThan(0);
  committed.forEach(expectOldOwnerAbsent);
  expectOldOwnerAbsent({ project: B, text: document.body.textContent ?? '', textarea: composer(), draft: composer().value });
  await act(async () => {
    program.resolve(responseFor(`/api/c2c/projects/${B}`));
    activity.resolve(responseFor(`/api/c2c/projects/${B}/activity`));
    dossier.resolve(responseFor(`/api/c2c/projects/${B}/dossier`));
    threads.resolve(ok({ threads: threadRows(B) }));
  });
  await ready(B);
  expect(screen.queryByText('Original A conversation 10')).toBeNull();
});

it('a later A visit is fresh and ignores an older-page reply from the first A visit', async () => {
  const oldPage = pendingRead();
  override = (_method, path) => path.startsWith(`/api/chat/threads?program_id=${A}`) && path.includes('offset=8') ? oldPage.promise : undefined;
  const page = mountPage(); await ready();
  const original = composer(); fireEvent.change(original, { target: { value: 'Question only for project A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show older conversations' }));
  page.visit(B); await ready(B);
  page.visit(A); await ready(A);
  await act(async () => oldPage.resolve(ok({ threads: [{ ...threadRows(A, 9, 1)[0], title: 'Late first-A older page' }] })));
  expect(composer()).not.toBe(original);
  expect(composer().value).toBe('');
  expect(screen.queryByText('Late first-A older page')).toBeNull();
  expect(screen.getByRole('button', { name: 'Show older conversations' })).toBeTruthy();
});

it('ignores late first-page threads, activity and dossier replies from an abandoned project', async () => {
  const activity = pendingRead(), dossier = pendingRead(), threads = pendingRead();
  override = (_method, path) => path === `/api/c2c/projects/${A}/activity` ? activity.promise
    : path === `/api/c2c/projects/${A}/dossier` ? dossier.promise
      : path.startsWith(`/api/chat/threads?program_id=${A}`) ? threads.promise : undefined;
  const page = mountPage();
  fireEvent.change(composer(), { target: { value: 'Question only for project A' } });
  page.visit(B); await ready(B);
  const current = composer();
  await act(async () => {
    activity.resolve(responseFor(`/api/c2c/projects/${A}/activity`));
    dossier.resolve(responseFor(`/api/c2c/projects/${A}/dossier`));
    threads.resolve(ok({ threads: threadRows(A) }));
  });
  expectOldOwnerAbsent({ project: B, text: document.body.textContent ?? '', textarea: current, draft: current.value });
  expect(composer()).toBe(current);
  expect(screen.getByText('Original B conversation 1')).toBeTruthy();
  expect(screen.getByText('Original B actor')).toBeTruthy();
});

it.each([
  { boundary: 'account', next: { ...AUTHOR, id: '12', displayName: 'Second author' } },
  { boundary: 'organization', next: { ...AUTHOR, organizationId: '5', organizationName: 'Other sponsor' } },
])('retires same-UUID state when the $boundary changes', async ({ next }) => {
  const page = mountPage(); await ready();
  const original = composer(); fireEvent.change(original, { target: { value: 'Question only for project A' } });
  const program = pendingRead(), activity = pendingRead(), dossier = pendingRead(), threads = pendingRead();
  override = (_method, path) => path === `/api/c2c/projects/${A}` ? program.promise
    : path === `/api/c2c/projects/${A}/activity` ? activity.promise
      : path === `/api/c2c/projects/${A}/dossier` ? dossier.promise
        : path.startsWith(`/api/chat/threads?program_id=${A}`) ? threads.promise : undefined;
  window.C2C_SOURCE_PINS = ['original-source'];
  const before = page.snapshots.length;
  act(() => { ownerLabel = 'Replacement'; authService.setToken('synthetic-replacement', next, 'synthetic-next-refresh'); page.rerender(); });
  page.snapshots.slice(before).forEach(expectOldOwnerAbsent);
  expect(document.body.contains(original)).toBe(false);
  expect(window.C2C_SOURCE_PINS).toEqual([]);
  expect(request.mock.calls.filter(([, path]) => path === `/api/c2c/projects/${A}/activity`)).toHaveLength(2);
  await act(async () => {
    program.resolve(responseFor(`/api/c2c/projects/${A}`)); activity.resolve(responseFor(`/api/c2c/projects/${A}/activity`));
    dossier.resolve(responseFor(`/api/c2c/projects/${A}/dossier`)); threads.resolve(ok({ threads: threadRows(A) }));
  });
  await ready(A, 'Replacement');
  expect(composer().value).toBe('');
});

it('a new sign-in of the same account retires unsent state even though the actor and project match', async () => {
  const page = mountPage(); await ready();
  const original = composer(); fireEvent.change(original, { target: { value: 'Old session question' } });
  window.C2C_SOURCE_PINS = ['old-session-source'];
  const reads = threadReads().length;
  act(() => {
    ownerLabel = 'Replacement'; authService.endSession(null);
    authService.setToken('synthetic-new-session', AUTHOR, 'synthetic-new-session-refresh'); page.rerender();
  });
  await ready(A, 'Replacement');
  expect(composer()).not.toBe(original);
  expect(composer().value).toBe('');
  expect(threadReads()).toHaveLength(reads + 1);
  expect(window.C2C_SOURCE_PINS).toEqual([]);
});

it('keeps one fenced workspace during pending adoption and creates one fresh adopted workspace', async () => {
  const page = mountPage(); await ready();
  const original = composer(); fireEvent.change(original, { target: { value: 'Old adoption question' } });
  const probe = pendingRead(), heldReads = pendingRead();
  vi.stubGlobal('fetch', vi.fn((url: unknown) => String(url).endsWith('/api/v1/auth/session')
    ? probe.promise : Promise.resolve(json(503, {}))));
  override = (_method, path) => path.startsWith('/api/c2c/projects/') || path.startsWith('/api/chat/threads?')
    ? heldReads.promise : undefined;
  let adopting!: Promise<AuthUser | null>;
  act(() => { adopting = authService.adoptSession('synthetic-adoption'); page.rerender(); });
  const fenced = composer();
  expect(fenced).not.toBe(original);
  expect(fenced.value).toBe('');
  const reads = scopedReads();
  for (let repeat = 0; repeat < 20; repeat += 1) {
    page.rerender();
    expect(composer()).toBe(fenced);
  }
  expect(scopedReads()).toEqual(reads);
  ownerLabel = 'Replacement'; override = () => undefined;
  await act(async () => {
    probe.resolve(json(200, { authenticated: true, user: { ...AUTHOR, id: '12' },
      session: { idleMinutes: 30, lifetimeHours: 12 } }));
    expect(await adopting).toMatchObject({ id: '12' });
  });
  await ready(A, 'Replacement');
  const adopted = composer();
  expect(adopted).not.toBe(fenced);
  expect(adopted.value).toBe('');
  const adoptedReads = scopedReads();
  page.rerender(); page.rerender();
  expect(composer()).toBe(adopted);
  expect(scopedReads()).toEqual(adoptedReads);
  await act(async () => heldReads.resolve(ok({ activity: [{ actor_name: 'Abandoned adoption actor' }] })));
  expect(document.body.textContent).not.toContain('Abandoned adoption actor');
});

it('preserves the exact composer and loaded history through stage/title changes and ordinary bearer refresh', async () => {
  window.C2C_SOURCE_PINS = ['first-mount-handoff'];
  const page = mountPage(); await ready();
  const original = composer(); fireEvent.change(original, { target: { value: 'Still working on this project' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show older conversations' }));
  const older = await screen.findByText('Original A conversation 10');
  const reads = scopedReads();
  expect(window.C2C_SOURCE_PINS).toEqual(['first-mount-handoff']);
  for (const name of ['Evidence', 'Review', 'Submit', 'Respond', 'Plan', 'Author']) {
    fireEvent.click(stage(name));
    expect(composer()).toBe(original);
    expect(composer().value).toBe('Still working on this project');
    expect(screen.getByText('Original A conversation 10')).toBe(older);
  }
  act(() => { publishShellProject({ id: A, title: 'Renamed project A', product: 'Renamed Alpha' }); page.rerender(); });
  const beforeRefresh = request.mock.calls.map(([method, path]) => [method, path]);
  vi.stubGlobal('fetch', vi.fn(async () => json(200, { accessToken: 'synthetic-refreshed', refreshToken: 'synthetic-refreshed-refresh', expiresIn: 3600 })));
  await act(async () => { expect(await authService.refreshToken()).toBe(true); });
  expect(composer()).toBe(original);
  expect(composer().value).toBe('Still working on this project');
  expect(screen.getByText('Original A conversation 10')).toBe(older);
  expect(scopedReads()).toEqual(reads);
  expect(request.mock.calls.map(([method, path]) => [method, path])).toEqual(beforeRefresh);
  expect(window.C2C_SOURCE_PINS).toEqual(['first-mount-handoff']);
  expect(readShellProject()?.step).toBe('author');
});

it('keeps the remembered step while retiring global source pins after a project ownership change', async () => {
  window.C2C_SOURCE_PINS = ['first-mount-handoff'];
  const page = mountPage(); await ready();
  expect(window.C2C_SOURCE_PINS).toEqual(['first-mount-handoff']);
  window.C2C_SOURCE_PINS = ['chosen-on-A'];
  act(() => { publishShellProject({ id: B, title: 'Project B', product: 'Beta', step: 'review' }); page.rerender(); });
  await waitFor(() => expect(stage('Review').getAttribute('aria-current')).toBe('step'));
  expect(window.C2C_SOURCE_PINS).toEqual([]);
  expect(readShellProject()?.step).toBe('review');
  expect(composer().value).toBe('');
});
