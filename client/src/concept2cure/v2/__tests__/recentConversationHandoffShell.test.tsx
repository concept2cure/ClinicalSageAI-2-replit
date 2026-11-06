// @vitest-environment jsdom
/* global ReadableStreamDefaultController: readonly, RequestInfo: readonly, RequestInit: readonly */
/** Saved conversation choices must reach the real shell's mounted conversation now, once. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { installDriveBrowserMocks } from './liveDriveShell.fixtures';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
// Stable session identity: the navigation read belongs to this one signed-in visit.
const signedIn = vi.hoisted(() => ({
  user: { id: '7', organizationId: '7', firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['admin'], permissions: ['governed:write'] },
  logout: () => Promise.resolve(),
}));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => signedIn,
}));
vi.mock('@/contexts/TenantContext', async original => ({
  ...await original<typeof import('@/contexts/TenantContext')>(),
  useTenant: () => ({ currentOrganization: { id: '7', name: 'Sponsor' }, organizationId: 7, tenant: null }),
}));

import { V2App } from '../V2App';
import { locationForConversation } from '../routing';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams, registerSurfaceLeaveGuard } from '../navParams';
import { __resetCeremonies } from '../ceremony';
import { __resetSurfaceActionBus } from '../surfaceActions';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const A = 'thread-a', B = 'thread-b';
const THREADS = [{ id: A, title: 'Recorded protocol discussion' }, { id: B, title: 'Recorded safety discussion' }];
const REFUSAL = 'Save the pending section changes before switching work.';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const history = (id: string) => ({ messages: [
  { id: id === A ? 1 : 3, role: 'user', content: id === A ? 'Question in conversation A' : 'Question in conversation B' },
  { id: id === A ? 2 : 4, role: 'assistant', content: id === A ? 'Saved answer in conversation A.' : 'Saved answer in conversation B.' },
] });

function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { closed = true; cancelled(); },
  });
  return {
    body, cancelled,
    push(event: unknown) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)); },
    close() { if (!closed) { closed = true; controller.close(); } },
  };
}
let activeStream: ReturnType<typeof openStream> | null = null;
let streamSignal: AbortSignal | null = null;
const release: Array<() => void> = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  for (const id of [A, B]) if (url === `/api/chat/threads/${id}/messages?limit=100`) return json(history(id));
  if (url.startsWith('/api/ana-ri/turn-records?thread_id=')) return json({ data: { records: [] } });
  if (url.startsWith('/api/ana-ri/runs?thread_id=')) return json({ runs: [] });
  if (url === '/api/ana-ri/stream' && init?.method === 'POST' && activeStream) {
    streamSignal = init.signal ?? null;
    return new Response(activeStream.body, { headers: { 'content-type': 'text/event-stream' } });
  }
  return json({}, 503);
});
const historyReads = (id: string) => fetchMock.mock.calls.filter(([url]) => String(url) === `/api/chat/threads/${id}/messages?limit=100`);
const posts = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/ana-ri/stream' && init?.method === 'POST');
const composer = () => screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
const transcript = () => document.querySelector('.ct-col') as HTMLElement;
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };

async function mount() {
  window.history.replaceState({}, '', `${locationForConversation(A)}?program=${PID}#retained`);
  publishShellProject({ id: PID, title: 'BX-410' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><V2App /></QueryClientProvider>);
  await within(await screen.findByTestId('rail-recents')).findByText(THREADS[1].title);
  await waitFor(() => expect(within(transcript()).getByText('Saved answer in conversation A.')).toBeTruthy());
  await waitFor(() => expect(window.C2C_CONVO).toEqual({ id: 'current', seed: null }));
  expect(historyReads(A)).toHaveLength(1);
  expect(window.location.pathname).toBe(locationForConversation(A));
}

type Entry = 'sidebar' | 'palette';
async function choose(id: string, entry: Entry) {
  const title = THREADS.find(thread => thread.id === id)!.title;
  if (entry === 'sidebar') {
    fireEvent.click(within(screen.getByTestId('rail-recents')).getByRole('button', { name: title }));
  } else {
    if (!screen.queryByRole('dialog', { name: 'Command palette' })) fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const button = await within(palette).findByRole('button', { name: title });
    fireEvent.mouseEnter(button);
    fireEvent.keyDown(window, { key: 'Enter' });
  }
}

beforeEach(() => {
  installDriveBrowserMocks(); localStorage.clear(); sessionStorage.clear(); __resetCeremonies();
  delete window.C2C_CONVO;
  activeStream = null; streamSignal = null; fetchMock.mockClear(); apiRequest.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/chat/threads?')) return json({ threads: THREADS });
    if (url === '/api/module-subscriptions/navigation') return json({ organizationId: 7, tier: 'enterprise', masterAdmin: false, resolved: true, surfaces: [] });
    if (url.startsWith('/api/c2c/projects')) return json({ data: [] });
    return json({});
  });
});
afterEach(() => {
  cleanup(); activeStream?.close(); release.splice(0).forEach(unregister => unregister());
  clearNavParams(); clearShellProject(); __resetCeremonies(); __resetSurfaceActionBus();
  vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); delete window.C2C_CONVO;
  window.history.replaceState({}, '', '/');
});

describe('saved selections reach the conversation already on screen', () => {
  it.each<Entry>(['sidebar', 'palette'])('opens B immediately from the %s and writes its saved-thread address', async entry => {
    await mount();
    const project = readShellProject();
    await choose(B, entry);
    await waitFor(() => expect(historyReads(B)).toHaveLength(1));
    await waitFor(() => expect(within(transcript()).getByText('Saved answer in conversation B.')).toBeTruthy());
    expect(within(transcript()).queryByText('Saved answer in conversation A.')).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe(locationForConversation(B)));
    expect(window.C2C_CONVO).toEqual({ id: 'current', seed: null });
    expect(readShellProject()).toBe(project);
    expect(historyReads(A)).toHaveLength(1);
    expect(posts()).toHaveLength(0);
    if (entry === 'palette') expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    await choose(A, entry);
    await waitFor(() => expect(historyReads(A)).toHaveLength(2));
    await within(transcript()).findByText('Saved answer in conversation A.');
    await waitFor(() => expect(window.location.pathname).toBe(locationForConversation(A)));
    expect(historyReads(B)).toHaveLength(1);
  });

  it.each<Entry>(['sidebar', 'palette'])('keeps the mounted composer and unsent text when the %s selects A again', async entry => {
    await mount();
    const input = composer(), url = window.location.href;
    fireEvent.change(input, { target: { value: 'An unsent follow-up about the protocol.' } });
    await choose(A, entry);
    await flush();
    expect(composer()).toBe(input);
    expect(input.value).toBe('An unsent follow-up about the protocol.');
    expect(window.location.href).toBe(url);
    expect(window.C2C_CONVO).toEqual({ id: 'current', seed: null });
    expect(historyReads(A)).toHaveLength(1);
    expect(posts()).toHaveLength(0);
  });
});

describe('the existing leave guard runs before a saved conversation handoff', () => {
  it.each<Entry>(['sidebar', 'palette'])('preserves A and its handoff when pending work blocks the %s', async entry => {
    await mount();
    const before = { input: composer(), url: window.location.href, convo: window.C2C_CONVO, project: readShellProject() };
    fireEvent.change(before.input, { target: { value: 'Keep this pending question.' } });
    let blocked = true;
    release.push(registerSurfaceLeaveGuard(() => blocked ? REFUSAL : null));
    await choose(B, entry);
    await waitFor(() => expect(screen.getAllByRole('alert').some(element => element.textContent?.includes(REFUSAL))).toBe(true));
    expect(window.C2C_CONVO).toBe(before.convo);
    expect(window.location.href).toBe(before.url);
    expect(readShellProject()).toBe(before.project);
    expect(composer()).toBe(before.input);
    expect(before.input.value).toBe('Keep this pending question.');
    expect(historyReads(B)).toHaveLength(0);
    if (entry === 'palette') expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    blocked = false;
    if (entry === 'palette') fireEvent.keyDown(window, { key: 'Escape' });
    await flush();
    expect(historyReads(B)).toHaveLength(0);
    expect(window.C2C_CONVO).toBe(before.convo);
  });
});

async function startAnswer() {
  activeStream = openStream();
  fireEvent.change(composer(), { target: { value: 'Continue the protocol discussion.' } });
  fireEvent.keyDown(composer(), { key: 'Enter' });
  await waitFor(() => expect(posts()).toHaveLength(1));
  await act(async () => { activeStream!.push({ type: 'text', content: 'Still answering conversation A.' }); });
  await within(transcript()).findByText('Still answering conversation A.');
  // Headers and text arrived, but the real chat's SSE reader is still waiting for its closing frame.
  expect(streamSignal?.aborted).toBe(false);
}

describe('a saved selection reaches the existing active-answer refusal', () => {
  it.each<Entry>(['sidebar', 'palette'])('keeps the answer running after a %s attempt, consumes B, and accepts only a fresh retry', async entry => {
    await mount(); await startAnswer();
    const stream = activeStream!;
    const input = composer(), url = window.location.href;
    fireEvent.change(input, { target: { value: 'Keep this unsent safety follow-up.' } });
    await choose(B, entry);
    await waitFor(() => expect(screen.getAllByRole('alert').some(element => element.textContent?.includes('AnA is still answering in the current conversation'))).toBe(true));
    expect(historyReads(B)).toHaveLength(0);
    expect(streamSignal?.aborted).toBe(false);
    expect(stream.cancelled).not.toHaveBeenCalled();
    expect(within(transcript()).getByText('Still answering conversation A.')).toBeTruthy();
    expect(composer()).toBe(input);
    expect(input.value).toBe('Keep this unsent safety follow-up.');
    expect(window.location.href).toBe(url);
    expect(window.C2C_CONVO).toEqual({ id: 'current', seed: null });
    expect(window.location.pathname).toBe(locationForConversation(A));
    await act(async () => {
      stream.push({ type: 'post_done', cleanedResponse: 'Finished answer in conversation A.' }); stream.close();
    });
    await within(transcript()).findByText('Finished answer in conversation A.');
    await waitFor(() => expect(composer()).toBeTruthy());
    await flush();
    expect(historyReads(B)).toHaveLength(0);
    expect(window.location.pathname).toBe(locationForConversation(A));
    await choose(B, entry);
    await waitFor(() => expect(historyReads(B)).toHaveLength(1));
    await within(transcript()).findByText('Saved answer in conversation B.');
    await waitFor(() => expect(window.location.pathname).toBe(locationForConversation(B)));
    expect(screen.queryAllByRole('alert').some(element => element.textContent?.includes('AnA is still answering in the current conversation'))).toBe(false);
    expect(posts()).toHaveLength(1);
  });
});
