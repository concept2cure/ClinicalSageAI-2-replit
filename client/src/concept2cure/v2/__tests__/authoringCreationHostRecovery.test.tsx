// @vitest-environment jsdom
/** Real native host readers; only transport and the Workbench view are stubbed.
 * Full Workbench/CreateExport/TaskTray failure coverage lives in the drawer suite. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DocumentWorkbenchProps } from '../editor/DocumentWorkbench';
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
const host = vi.hoisted(() => ({ current: null as DocumentWorkbenchProps | null }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../editor/DocumentWorkbench', async original => ({
  ...await original<typeof import('../editor/DocumentWorkbench')>(),
  DocumentWorkbench: (props: DocumentWorkbenchProps) => {
    host.current = props;
    return <div data-testid="native-host" data-doc={props.pinnedDocId} />;
  },
}));
import { DocumentCanvas, type DocumentCanvasProps } from '../editor/DocumentCanvas';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { publishShellProject } from '../shellProject';

const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const DOC = 'dddddddd-0000-4000-8000-000000000001';
const NEXT = 'dddddddd-0000-4000-8000-000000000002';
const actor = (id = 7, organizationId = 12) => ({ id: String(id), organizationId: String(organizationId), roles: ['admin'], permissions: ['governed:write'] });
const bearer = (userId = 7, organizationId = 12, visit = 'original') => `fixture.${btoa(JSON.stringify({ userId, organizationId, visit }))}.synthetic`;
const row = (id = DOC) => ({ id, title: 'Saved working document',
  module: 'M3', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1 });
const documentRow = (id = DOC, programId = PID) => ({ ...row(id), client_program_id: programId });
const workingRow = (id = DOC, programId = PID) => ({ ...row(id), program_id: programId });
const sections = (docId = DOC) => [{ id: 'section-1', doc_id: docId, code: '3.2.S.1', title: 'Saved section', content: '<p>Saved text.</p>', order_index: 0 }];
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function normal(_method: string, url: string): Promise<Response> {
  const id = url.includes(NEXT) ? NEXT : DOC;
  if (url.includes('/sections')) return Promise.resolve(ok({ success: true, sections: sections(id) }));
  if (url.includes('/docs?')) return Promise.resolve(ok({ success: true, documents: [workingRow(DOC, url.includes(OTHER) ? OTHER : PID)] }));
  if (url.includes('/docs/')) return Promise.resolve(ok({ success: true, document: documentRow(id) }));
  return Promise.resolve(ok({ success: true }));
}
const canvasProps = (): DocumentCanvasProps => ({ docId: DOC, programId: PID, conversationId: 'thread', fromThisConversation: false,
  expanded: true, onExpandedChange: vi.fn(), onNav: vi.fn(), onAsk: vi.fn(), fireToast: vi.fn() });
async function canvas() {
  const props = canvasProps();
  const mounted = render(<DocumentCanvas {...props} />);
  await screen.findByTestId('native-host');
  return { props, ...mounted };
}
beforeEach(() => {
  host.current = null; localStorage.clear(); sessionStorage.clear();
  clearAuthToken();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600);
  publishShellProject({ id: PID });
  apiRequest.mockReset().mockImplementation(normal);
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); delete window.C2C_PROJECT;
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

async function replaceHostCredentials(transition: string) {
  if (transition === 'account') authService.setToken(bearer(8), actor(8), 'fixture-refresh-8', 3600);
  else if (transition === 'organization') authService.setToken(bearer(7, 13), actor(7, 13), 'fixture-refresh-13', 3600);
  else if (transition === 'session') authService.setToken(bearer(7, 12, 'replacement'), actor(), 'fixture-refresh-new', 3600);
  else if (transition === 'bearer') setAuthToken(bearer(8));
  else if (transition === 'in-place account') (authService.getUser() as { id: string }).id = '8';
  else if (transition === 'in-place organization') (authService.getUser() as { organizationId: string }).organizationId = '13';
  else {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: bearer(7, 12, 'refreshed'), refreshToken: 'fixture-refresh-next', expiresIn: 3600 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    expect(await authService.refreshToken()).toBe(true);
  }
}

describe.each(['canvas', 'working list'] as const)('the actual %s host retains its read owner', kind => {
  it('accepts a fresh verified read after a genuine same-session refresh with exact current headers', async () => {
    if (kind === 'canvas') await canvas();
    else {
      render(<DocumentAuthoring onNav={vi.fn()} surface={{ id: 'document-authoring' } as never} segment="biotech" />);
      await waitFor(() => expect(host.current?.docsState).toBe('ready'));
    }
    const session = authService.captureSessionReadGuard();
    await act(async () => { await replaceHostCredentials('same-session refresh'); });
    expect(session.sameRevision()).toBe(true);
    expect(session.credentialsCurrent()).toBe(false);
    const before = apiRequest.mock.calls.length;
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(true);
    const reads = apiRequest.mock.calls.slice(before).filter(([, path]) => path.startsWith('/api/authoring/docs'));
    expect(reads).toHaveLength(kind === 'canvas' ? 2 : 1);
    for (const [method, , body, headers] of reads) {
      expect(method).toBe('GET');
      expect(body).toBeUndefined();
      expect(headers).toEqual({ Authorization: `Bearer ${bearer(7, 12, 'refreshed')}`, 'x-organization-id': '12' });
    }
  });

  it.each(['account', 'organization', 'session', 'bearer', 'same-session refresh', 'in-place account', 'in-place organization'])('refuses a delayed verified refresh after %s changes', async transition => {
    if (kind === 'canvas') await canvas();
    else {
      render(<DocumentAuthoring onNav={vi.fn()} surface={{ id: 'document-authoring' } as never} segment="biotech" />);
      await waitFor(() => expect(host.current?.docsState).toBe('ready'));
    }
    const previousTitle = host.current!.docs[0].title;
    const pending = deferred<Response>();
    apiRequest.mockImplementationOnce(() => pending.promise);
    let checking!: Promise<boolean>;
    act(() => { checking = host.current!.refreshCreationContext!(); });
    await act(async () => { await replaceHostCredentials(transition); });
    const stale = kind === 'canvas'
      ? { success: true, document: { ...documentRow(), title: 'Private response from the previous read owner' } }
      : { success: true, documents: [{ ...workingRow(), title: 'Private response from the previous read owner' }] };
    let confirmed: unknown;
    await act(async () => { pending.resolve(ok(stale)); confirmed = await checking; });
    expect(confirmed).toBe(false);
    expect(host.current!.docs[0].title).toBe(previousTitle);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});

describe('pinned canvas recovery confirms only the current actual record read', () => {
  it.each([
    ['failed sections', { success: true, sections: sections() }, 503],
    ['missing sections', { success: true }, 200],
    ['unsuccessful sections', { success: false, sections: sections() }, 200],
    ['foreign section', { success: true, sections: sections(NEXT) }, 200],
  ] as const)('refuses %s instead of confirming navigation', async (_name, body, status) => {
    const { props } = await canvas();
    apiRequest.mockImplementation((method, url) => url === `/api/authoring/docs/${DOC}/sections`
      ? Promise.resolve(ok(body, status)) : normal(method, url));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('refuses a response for another document', async () => {
    await canvas();
    apiRequest.mockImplementation((method, url) => url === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ success: true, document: documentRow(NEXT) })) : normal(method, url));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(host.current?.pinnedDocId).toBe(DOC);
  });

  it('refuses a pinned record from another program', async () => {
    const { props } = await canvas();
    apiRequest.mockImplementation((method, url) => url === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ success: true, document: documentRow(DOC, OTHER) })) : normal(method, url));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(host.current?.pinnedDocId).toBe(DOC);
  });

  it.each([
    ['module', {}],
    ['product_code', {}],
    ['status', null],
    ['updated_at', {}],
    ['section_count', -1],
    ['section_count', 'not a count'],
    ['c2c_document_id', {}],
    ['created_by', {}],
  ] as const)('refuses malformed %s metadata before applying the record', async (field, value) => {
    const { props } = await canvas();
    apiRequest.mockImplementation((method, url) => url === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ success: true, document: { ...documentRow(), [field]: value } })) : normal(method, url));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(host.current?.docs[0]).toMatchObject({ id: DOC, module: 'M3', product_code: null, status: 'DRAFT' });
    expect(props.onNav).not.toHaveBeenCalled();
  });

  it('confirms the actual metadata and section refresh without another navigation or write', async () => {
    const { props } = await canvas();
    const refreshed = { ...documentRow(), title: 'Refreshed working document', product_code: 'clinical_overview', section_count: '1',
      updated_at: '2026-10-17T12:00:00Z' };
    apiRequest.mockImplementation((method, url) => url === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ success: true, document: refreshed })) : normal(method, url));
    const before = apiRequest.mock.calls.filter(([, url]) => url.startsWith('/api/authoring/docs/')).length;
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(true);
    expect(host.current?.docs[0]).toMatchObject({ id: DOC, title: refreshed.title, product_code: refreshed.product_code,
      updated_at: refreshed.updated_at, section_count: '1' });
    expect(apiRequest.mock.calls.filter(([, url]) => url.startsWith('/api/authoring/docs/'))).toHaveLength(before + 2);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it.each(['document change', 'program round trip', 'unmount'])('refuses a delayed recovery after %s', async change => {
    const { props, rerender, unmount } = await canvas();
    const pending = deferred<Response>();
    apiRequest.mockImplementationOnce(() => pending.promise);
    let checking!: Promise<boolean>;
    act(() => { checking = host.current!.refreshCreationContext!(); });
    if (change === 'unmount') unmount();
    else if (change === 'document change') rerender(<DocumentCanvas {...props} docId={NEXT} />);
    else { rerender(<DocumentCanvas {...props} programId={OTHER} />); rerender(<DocumentCanvas {...props} />); }
    let confirmed: unknown;
    await act(async () => { pending.resolve(ok({ success: true, document: documentRow() })); confirmed = await checking; });
    expect(confirmed).toBe(false);
    expect(props.onNav).not.toHaveBeenCalled();
  });
});

describe('Authoring working-list recovery uses its existing scoped reader', () => {
  async function authoring() {
    render(<DocumentAuthoring onNav={vi.fn()} surface={{ id: 'document-authoring' } as never} segment="biotech" />);
    await waitFor(() => expect(host.current?.docsState).toBe('ready'));
  }

  it.each([
    { success: true },
    { success: false, documents: [workingRow()] },
    { success: true, documents: [workingRow(DOC, OTHER)] },
  ])('does not confirm an invalid current working-list result %#', async body => {
    await authoring();
    apiRequest.mockImplementationOnce(async () => ok(body));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(host.current?.docsState).toBe('error');
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('applies an all-status recovery without a duplicate filter-change GET', async () => {
    await authoring();
    await act(async () => { host.current!.onStatusChange!('APPROVED'); });
    await waitFor(() => expect(host.current?.docsState).toBe('ready'));
    const before = apiRequest.mock.calls.length;
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(true);
    await act(async () => { host.current!.onStatusChange!('all'); });
    expect(apiRequest.mock.calls).toHaveLength(before + 1);
    expect(apiRequest.mock.calls.at(-1)?.[1]).toBe(`/api/authoring/docs?status=all&programId=${PID}`);
    expect(host.current?.docs.map(document => document.id)).toEqual([DOC]);
  });
});
