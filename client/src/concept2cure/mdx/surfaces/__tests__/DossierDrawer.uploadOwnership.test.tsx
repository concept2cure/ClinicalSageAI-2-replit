// @vitest-environment jsdom
/** Upload completion belongs to the drawer visit that selected the file. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, authService } from '@/services/portal/authService';
import { setOrgId } from '@/utils/authToken';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import { ingestReceipt, stubIngestXhr, type IngestInit } from '../../../v2/__tests__/_ingest-xhr-fake';
import { DossierDrawer, type DossierDrawerProps } from '../pathway/PathwayPanes';
import { DossierStore } from '../../store/dossierStore';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const OTHER_DOCUMENT = '44444444-4444-4444-8444-444444444444';
const RECORD = '55555555-5555-4555-8555-555555555555';
const TARGET = { id: 71, label: 'Owned performance evidence' };
const clients: QueryClient[] = [];
const initial = (): DossierDrawerProps => ({
  open: true, target: TARGET, pathway: 'k510', programId: PROGRAM, documentId: DOCUMENT, onClose: vi.fn(),
});
const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

function account(id = 7, organizationId = 12, visit = 'original') {
  const token = `ownership.${btoa(JSON.stringify({ userId: id, organizationId, visit }))}.synthetic`;
  authService.setToken(token, {
    id: String(id), organizationId: String(organizationId), roles: ['admin'], permissions: [],
  }, 'synthetic-refresh', 3600);
  setOrgId(String(organizationId));
  return token;
}

function hydrate(props: DossierDrawerProps) {
  const target = props.target ?? TARGET;
  DossierStore.hydratePathway(props.pathway, props.documentId ?? null, [
    { key: target.id, label: target.label, body: 'Synthetic current filing section.', attachments: [] },
  ]);
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function pendingReceipt(status: 200 | 201 = 201) {
  const entered = gate(), release = gate(), complete = gate();
  const answer = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => {
    entered.resolve();
    await release.promise;
    return { status, json: async () => {
      const receipt = ingestReceipt(init.body as FormData, {
        document: { id: RECORD },
        ...(status === 200 ? { reupload: { unchanged: true, changes: [], differs: [] } } : {}),
      });
      complete.resolve();
      return receipt;
    } };
  }));
  return { entered, release, complete, answer };
}

async function mount(overrides: Partial<DossierDrawerProps> = {}) {
  let props = { ...initial(), ...overrides };
  hydrate(props);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const tree = () => <QueryClientProvider client={client}><AuthProvider>
    <DossierDrawer {...props} />
  </AuthProvider></QueryClientProvider>;
  let view!: ReturnType<typeof render>;
  // Drain the real AuthProvider's synthetic GET /session before choosing a file.
  await act(async () => { view = render(tree()); await Promise.resolve(); });
  return {
    view,
    props: () => props,
    replace(patch: Partial<DossierDrawerProps>) {
      props = { ...props, ...patch };
      hydrate(props);
      view.rerender(tree());
    },
  };
}

function showAttachments() {
  fireEvent.click(screen.getByRole('tab', { name: /Attachments/ }));
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

async function start(h: Awaited<ReturnType<typeof mount>>, receipt: ReturnType<typeof pendingReceipt>) {
  const file = new File(['original selected performance bytes'], 'owned-evidence.pdf');
  const input = showAttachments();
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
    await receipt.entered.promise;
  });
  expect(DossierStore.readSectionAttachments(h.props().pathway, TARGET.id, TARGET.label)).toEqual([]);
  return file;
}

async function finish(receipt: ReturnType<typeof pendingReceipt>) {
  await act(async () => { receipt.release.resolve(); await receipt.complete.promise; });
}

function expectOriginalPost(receipt: ReturnType<typeof pendingReceipt>, file: File, token: string) {
  expect(receipt.answer).toHaveBeenCalledTimes(1);
  const [url, init] = receipt.answer.mock.calls[0];
  const form = init.body as FormData;
  expect(url).toBe('/api/vault/ingest');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe(`Bearer ${token}`);
  expect(init.headers['x-organization-id']).toBe('12');
  expect(form.get('file')).toBe(file);
  expect(form.get('programId')).toBe(PROGRAM);
  expect(form.get('documentCode')).toBe(file.name);
}

function expectNoLatePublication(h: Awaited<ReturnType<typeof mount>>, file: File) {
  const props = h.props(), target = props.target ?? TARGET;
  expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([]);
  expect(DossierStore.readSectionAttachments(props.pathway, target.id, target.label)).toEqual([]);
  expect(document.querySelectorAll('.dd-att-row')).toHaveLength(0);
  const messages = [...screen.queryAllByRole('alert'), ...screen.queryAllByRole('status')]
    .map(node => node.textContent).join(' ');
  expect(messages).not.toContain(file.name);
  expect(messages).not.toMatch(/Uploading files/i);
  expect(document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(false);
}

let originalToken = '';
beforeEach(() => {
  DossierStore.clearAllPathways(); clearShellProject();
  originalToken = account(); publishShellProject({ id: PROGRAM });
  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = String(input);
    if (path.endsWith('/auth/session')) return json({ authenticated: true, user: authService.getUser() });
    if (path.endsWith('/auth/refresh')) return json({
      accessToken: 'synthetic-refreshed-bearer', refreshToken: 'synthetic-refreshed-token', expiresIn: 3600,
    });
    return json({ data: [] });
  }));
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  DossierStore.clearAllPathways(); clearShellProject(); authService.endSession(null);
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

const replacements: Array<{ label: string; patch: Partial<DossierDrawerProps> }> = [
  { label: 'section id', patch: { target: { id: 72, label: 'Other section' } } },
  { label: 'backend document', patch: { documentId: OTHER_DOCUMENT } },
  { label: 'program', patch: { programId: OTHER_PROGRAM } },
  { label: 'pathway', patch: { pathway: 'pma' } },
];

describe('pending device upload ownership follows the original drawer visit', () => {
  it.each(replacements)('retires completion after replacing the $label', async ({ patch }) => {
    const receipt = pendingReceipt(), h = await mount(), file = await start(h, receipt);
    await act(async () => {
      if (patch.programId) publishShellProject({ id: patch.programId });
      h.replace(patch);
    });
    showAttachments();
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expectNoLatePublication(h, file);
  });

  it('retires a section-label A to B to A visit instead of reviving the first completion', async () => {
    const receipt = pendingReceipt(), h = await mount(), file = await start(h, receipt);
    await act(async () => { h.replace({ target: { ...TARGET, label: 'Temporary section label' } }); });
    await act(async () => { h.replace({ target: TARGET }); });
    showAttachments();
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expectNoLatePublication(h, file);
  });

  it('retires a batched shell A to B to A visit even when drawer props return unchanged', async () => {
    const receipt = pendingReceipt(), h = await mount(), file = await start(h, receipt);
    await act(async () => {
      publishShellProject({ id: OTHER_PROGRAM }); publishShellProject({ id: PROGRAM }); hydrate(h.props());
    });
    showAttachments();
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expectNoLatePublication(h, file);
  });
});

describe('pending device upload completion cannot cross account or mounted-view lifetime', () => {
  it.each([false, true])('retires a replacement session, same actor=%s', async sameActor => {
    const receipt = pendingReceipt(), h = await mount(), file = await start(h, receipt);
    const revision = authService.captureSessionReadGuard();
    await act(async () => { account(sameActor ? 7 : 8, sameActor ? 12 : 13, 'replacement'); hydrate(h.props()); });
    expect(revision.sameRevision()).toBe(false);
    showAttachments();
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expectNoLatePublication(h, file);
  });

  it.each(['close', 'unmount'] as const)('retires an upload across %s and reopening the same section', async how => {
    const receipt = pendingReceipt();
    let h = await mount();
    const file = await start(h, receipt);
    if (how === 'close') {
      await act(async () => { h.replace({ open: false }); });
      await act(async () => { h.replace({ open: true }); });
    } else {
      await act(async () => { h.view.unmount(); });
      h = await mount();
    }
    showAttachments();
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expectNoLatePublication(h, file);
  });
});

describe('current device upload visits retain legitimate completion', () => {
  it('publishes a confirmed file when its original visit remains current', async () => {
    const receipt = pendingReceipt(), h = await mount(), file = await start(h, receipt);
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([
      expect.objectContaining({ name: file.name, size: file.size, live: true }),
    ]);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(1);
  });

  it('keeps an ordinary bearer refresh current and accepts its valid unchanged receipt', async () => {
    const receipt = pendingReceipt(200), h = await mount(), file = await start(h, receipt);
    const revision = authService.captureSessionReadGuard(), actor = authService.getUser();
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(revision.sameRevision()).toBe(true);
    expect(revision.credentialsCurrent()).toBe(false);
    expect(authService.getUser()).toBe(actor);
    await finish(receipt);

    expectOriginalPost(receipt, file, originalToken);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([
      expect.objectContaining({ name: file.name, size: file.size, live: true }),
    ]);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(1);
  });
});
