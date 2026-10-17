// @vitest-environment jsdom
/** Real native host readers; only transport and the Workbench view are stubbed.
 * Full Workbench/CreateExport/TaskTray failure coverage lives in the drawer suite. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DocumentWorkbenchProps } from '../editor/DocumentWorkbench';

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
const row = (id = DOC, programId = PID) => ({ id, program_id: programId, client_program_id: programId, title: 'Saved working document',
  module: 'M3', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1 });
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
  if (url.includes('/docs?')) return Promise.resolve(ok({ success: true, documents: [row(DOC, url.includes(OTHER) ? OTHER : PID)] }));
  if (url.includes('/docs/')) return Promise.resolve(ok({ success: true, document: row(id) }));
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
  publishShellProject({ id: PID });
  apiRequest.mockReset().mockImplementation(normal);
});
afterEach(() => { cleanup(); delete window.C2C_PROJECT; localStorage.clear(); sessionStorage.clear(); });

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
      ? Promise.resolve(ok({ success: true, document: row(NEXT) })) : normal(method, url));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(host.current?.pinnedDocId).toBe(DOC);
  });

  it('refuses a pinned record from another program', async () => {
    const { props } = await canvas();
    apiRequest.mockImplementation((method, url) => url === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ success: true, document: row(DOC, OTHER) })) : normal(method, url));
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(false);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(host.current?.pinnedDocId).toBe(DOC);
  });

  it('confirms the actual metadata and section refresh without another navigation or write', async () => {
    const { props } = await canvas();
    const before = apiRequest.mock.calls.filter(([, url]) => url.startsWith('/api/authoring/docs/')).length;
    let confirmed: unknown;
    await act(async () => { confirmed = await host.current!.refreshCreationContext!(); });
    expect(confirmed).toBe(true);
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
    await act(async () => { pending.resolve(ok({ success: true, document: row() })); confirmed = await checking; });
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
    { success: false, documents: [row()] },
    { success: true, documents: [row(DOC, OTHER)] },
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
