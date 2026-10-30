// @vitest-environment jsdom
/** A dropped selection is confirmed by its own upload, even when names or objects repeat. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken, setOrgId } from '@/utils/authToken';
import { DossierDrawer } from '../pathway/PathwayPanes';
import { DossierStore } from '../../store/dossierStore';
import { ingestReceipt, stubIngestXhr, type IngestInit } from '../../../v2/__tests__/_ingest-xhr-fake';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const TARGET = { id: 93, label: 'Dropped performance evidence' };
const NAME = 'performance.pdf';
const clients: QueryClient[] = [];
type Reply = { status: number; body: (form: FormData) => unknown };
type Request = { url: string; init: IngestInit };

const created: Reply = {
  status: 201, body: form => ingestReceipt(form, { document: { id: RECORD } }),
};
const held: Reply = {
  status: 200, body: form => ingestReceipt(form, {
    document: { id: RECORD }, reupload: { unchanged: true, changes: [], differs: [] },
  }),
};
const refused: Reply = {
  status: 409, body: () => ({ error: {
    code: 'VERSION_CONTENT_CONFLICT', message: 'Different bytes are already recorded at this code and version.',
  } }),
};
const unconfirmed: Reply = { status: 201, body: () => ({ success: true }) };

function mountDropTarget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}>
    <DossierDrawer open target={TARGET} pathway="k510" programId={PROGRAM} documentId={DOCUMENT} onClose={vi.fn()} />
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole('tab', { name: /Attachments/ }));
  return view.container.querySelector<HTMLElement>('.dd-att-drop')!;
}

function serveReplies(replies: Reply[]) {
  const requests: Request[] = [];
  let finish!: () => void;
  const complete = new Promise<void>(resolve => { finish = resolve; });
  stubIngestXhr(async (url, init) => {
    const reply = replies[requests.length];
    requests.push({ url, init });
    if (!reply) throw new Error('No reply was configured for an extra upload');
    return { status: reply.status, json: async () => {
      const body = reply.body(init.body as FormData);
      if (requests.length === replies.length) finish();
      return body;
    } };
  });
  return { requests, complete };
}

async function dropFiles(target: HTMLElement, files: File[], complete: Promise<void>) {
  let browserDefaultAllowed = true;
  await act(async () => {
    browserDefaultAllowed = fireEvent.drop(target, { dataTransfer: { files } });
    await complete;
  });
  expect(browserDefaultAllowed).toBe(false);
}

function expectOriginalRequests(requests: Request[], files: File[]) {
  expect(requests).toHaveLength(files.length);
  requests.forEach(({ url, init }, index) => {
    expect(url).toBe('/api/vault/ingest');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer synthetic-drop-identity');
    expect(Object.keys(init.headers).map(key => key.toLowerCase())).not.toContain('content-type');
    const form = init.body as FormData;
    expect(form.get('file')).toBe(files[index]);
    expect(form.get('programId')).toBe(PROGRAM);
    expect(form.get('documentCode')).toBe(NAME);
  });
}

function expectConfirmed(files: File[]) {
  expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual(
    [...files].reverse().map(file => expect.objectContaining({ name: file.name, size: file.size, live: true })),
  );
  expect(document.querySelectorAll('.dd-att-row')).toHaveLength(files.length);
}

async function expectServerOwnedActivity() {
  fireEvent.click(screen.getByRole('tab', { name: /Activity/ }));
  await screen.findByTestId('dd-act-empty');
  expect(document.querySelectorAll('.dd-act-row')).toHaveLength(0);
}

beforeEach(() => {
  DossierStore.clearAllPathways();
  setAuthToken('synthetic-drop-identity'); setOrgId('7');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  DossierStore.clearAllPathways(); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

describe('device attachment identity through the actual drop handler', () => {
  it('attaches only the confirmed same-name dropped file when its sibling is refused', async () => {
    const files = [new File(['recorded evidence'], NAME), new File(['refused bytes differ in length'], NAME)];
    const replies = serveReplies([created, refused]);
    await dropFiles(mountDropTarget(), files, replies.complete);

    expectOriginalRequests(replies.requests, files);
    expectConfirmed([files[0]]);
    await expectServerOwnedActivity();
  });

  it('keeps repeated references to one File independent when only the second selection is confirmed', async () => {
    const file = new File(['one immutable selected object'], NAME);
    const files = [file, file];
    const replies = serveReplies([unconfirmed, created]);
    await dropFiles(mountDropTarget(), files, replies.complete);

    expectOriginalRequests(replies.requests, files);
    expectConfirmed([file]);
    await expectServerOwnedActivity();
  });

  it('keeps both confirmed dropped selections for a new receipt and a valid same-bytes reupload', async () => {
    const files = [new File(['identical bytes'], NAME), new File(['identical bytes'], NAME)];
    const replies = serveReplies([created, held]);
    await dropFiles(mountDropTarget(), files, replies.complete);

    expectOriginalRequests(replies.requests, files);
    expectConfirmed(files);
    await expectServerOwnedActivity();
  });
});
