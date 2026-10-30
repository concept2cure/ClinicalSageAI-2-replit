// @vitest-environment jsdom
/** A local device-dossier attachment requires a confirmed Vault receipt. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAuthToken, clearAuthToken, setOrgId } from '@/utils/authToken';
import { DossierDrawer } from '../pathway/PathwayPanes';
import { DossierStore } from '../../store/dossierStore';
import { stubIngestXhr, type IngestInit } from '../../../v2/__tests__/_ingest-xhr-fake';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const TARGET = { id: 91, label: 'Performance evidence' };
const clients: QueryClient[] = [];
function receipt(fileName: string) {
  return { success: true, document: {
    id: VERSION, programId: PROGRAM, documentCode: fileName, documentTitle: fileName.replace(/\.[^.]+$/, ''),
    documentType: 'OTHER', version: '1.0', fileName, fileSize: 8, mimeType: 'application/pdf',
    contentHash: 'a'.repeat(64), processingStatus: 'PENDING', hasExtractedText: true, extraction: 'extracted',
    wordCount: 2, createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z',
  }, filing: { view: 'device', folderId: null, folderLabel: '', evidenceKind: null, ctdSection: null,
    placementStatus: 'unfiled', confidence: null, rationale: 'No folder proposed.', needsReview: true } };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}>
    <DossierDrawer open target={TARGET} pathway="k510" programId={PROGRAM} documentId={DOCUMENT} onClose={vi.fn()} />
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole('tab', { name: /Attachments/ }));
  return view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
}
function serveReceipts(bodies: unknown[]) {
  let finish!: () => void;
  const complete = new Promise<void>(resolve => { finish = resolve; });
  let replies = 0;
  const answer = stubIngestXhr(vi.fn(async (url: string, init: IngestInit) => {
    expect(url).toBe('/api/vault/ingest');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('programId')).toBe(PROGRAM);
    const body = bodies[replies++];
    return { status: 201, json: async () => {
      if (replies === bodies.length) finish();
      return body;
    } };
  }));
  return { answer, complete };
}
async function attach(input: HTMLInputElement, files: File[], complete: Promise<void>) {
  // Await the actual XHR fixture's final response and drain the real hook's
  // status/outcome updates, without fabricating an accepted hook result.
  await act(async () => { fireEvent.change(input, { target: { files } }); await complete; });
}
async function expectNoLocalActivity() {
  fireEvent.click(screen.getByRole('tab', { name: /Activity/ }));
  await screen.findByTestId('dd-act-empty');
  expect(document.querySelectorAll('.dd-act-row')).toHaveLength(0);
}
beforeEach(() => {
  DossierStore.clearAllPathways();
  setAuthToken('synthetic-vault-receipt-test'); setOrgId('7');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  DossierStore.clearAllPathways(); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

describe('device dossier attachment confirmation through the actual upload hook', () => {
  it('does not add an attachment or activity from an affirmative response with no document receipt', async () => {
    const transport = serveReceipts([{ success: true }]);
    const input = mount();
    await attach(input, [new File(['evidence'], 'unconfirmed-performance.pdf')], transport.complete);

    expect(transport.answer).toHaveBeenCalledTimes(1);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([]);
    expect(screen.queryByText('unconfirmed-performance.pdf')).toBeNull();
    expect(screen.getByText('No attachments yet.')).toBeTruthy();
    await expectNoLocalActivity();
  });

  it('adds the selected file after a full producer receipt and keeps activity server-owned', async () => {
    const transport = serveReceipts([receipt('confirmed-performance.pdf')]);
    const input = mount();
    await attach(input, [new File(['evidence'], 'confirmed-performance.pdf')], transport.complete);

    await screen.findByText('confirmed-performance.pdf');
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([
      expect.objectContaining({ name: 'confirmed-performance.pdf', size: 8, live: true }),
    ]);
    expect(transport.answer).toHaveBeenCalledTimes(1);
    await expectNoLocalActivity();
  });

  it('adds only confirmed files from a mixed batch of unique filenames', async () => {
    const transport = serveReceipts([{ success: true }, receipt('confirmed-bench.pdf')]);
    const input = mount();
    await attach(input, [new File(['pending'], 'unconfirmed-bench.pdf'), new File(['evidence'], 'confirmed-bench.pdf')], transport.complete);

    await screen.findByText('confirmed-bench.pdf');
    expect(transport.answer).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('unconfirmed-bench.pdf')).toBeNull();
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label).map(file => file.name)).toEqual(['confirmed-bench.pdf']);
    await expectNoLocalActivity();
  });
});

type BatchReply = { status: number; body: unknown } | { lost: true };
const SAME_NAME = 'diagnostic-performance.pdf';
const conflict: BatchReply = { status: 409, body: { error: {
  code: 'VERSION_CONTENT_CONFLICT', message: 'Different bytes are already recorded at this name.',
} } };
const malformed: BatchReply = { status: 201, body: { success: true } };
const uncertain: BatchReply = { status: 503, body: { error: {
  code: 'OUTCOME_UNKNOWN', message: 'Review the current Vault records before trying again.',
} } };

function confirmed(file: File, status: 200 | 201 = 201): BatchReply {
  const body = receipt(file.name);
  return { status, body: {
    ...body, document: { ...body.document, fileSize: file.size, mimeType: file.type },
    ...(status === 200 ? { reupload: { unchanged: true, changes: [], differs: [] } } : {}),
  } };
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

/** Only the XHR reply is synthetic; upload, correlation and store remain real. */
function serveBatch(replies: BatchReply[], beforeReply?: (index: number) => Promise<void>) {
  const finished = signal();
  let count = 0;
  const answer = stubIngestXhr(vi.fn(async (_url: string, _init: IngestInit) => {
    const index = count++;
    const reply = replies[index];
    if (!reply) throw new Error('Unexpected repeat of a selected upload');
    await beforeReply?.(index);
    if ('lost' in reply) {
      if (index === replies.length - 1) finished.resolve();
      throw new Error('Synthetic lost reply after all upload bytes were sent');
    }
    return { status: reply.status, json: async () => {
      if (index === replies.length - 1) finished.resolve();
      return reply.body;
    } };
  }));
  return { answer, complete: finished.promise };
}

function expectPostedFiles(transport: ReturnType<typeof serveBatch>, files: File[]) {
  expect(transport.answer).toHaveBeenCalledTimes(files.length);
  files.forEach((file, index) => {
    const [url, init] = transport.answer.mock.calls[index];
    const form = init.body as FormData;
    expect(url).toBe('/api/vault/ingest');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer synthetic-vault-receipt-test');
    expect(init.headers['x-organization-id']).toBe('7');
    expect(Object.keys(init.headers).map(key => key.toLowerCase())).not.toContain('content-type');
    expect(form.get('file')).toBe(file);
    expect(form.get('programId')).toBe(PROGRAM);
    expect(form.get('documentCode')).toBe(file.name);
  });
}

const mixed = [
  { label: '409 version refusal', reply: conflict },
  { label: 'malformed successful reply', reply: malformed },
  { label: 'explicit uncertain commit', reply: uncertain },
  { label: 'lost complete-send reply', reply: { lost: true } as BatchReply },
].flatMap(item => [0, 1].map(storedIndex => ({ ...item, storedIndex })));

describe('device attachment identity for equal filenames', () => {
  it.each(mixed)('attaches only index $storedIndex when its same-name sibling has a $label', async ({ reply, storedIndex }) => {
    const files = [
      new File(['short'], SAME_NAME, { type: 'application/pdf' }),
      new File(['a distinctly longer diagnostic performance report'], SAME_NAME, { type: 'application/pdf' }),
    ];
    const successStatus = reply === conflict && storedIndex === 1 ? 200 : 201;
    const transport = serveBatch(files.map((file, index) => index === storedIndex ? confirmed(file, successStatus) : reply));
    const input = mount();
    await attach(input, files, transport.complete);

    expectPostedFiles(transport, files);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([
      expect.objectContaining({ name: SAME_NAME, size: files[storedIndex].size, live: true }),
    ]);
    expect(screen.getAllByText(SAME_NAME)).toHaveLength(1);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(1);
    await expectNoLocalActivity();
  });

  it('attaches neither same-name selection when one is refused and the other is unconfirmed', async () => {
    const files = [new File(['refused'], SAME_NAME), new File(['unconfirmed'], SAME_NAME)];
    const transport = serveBatch([conflict, malformed]);
    const input = mount();
    await attach(input, files, transport.complete);

    expectPostedFiles(transport, files);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([]);
    expect(screen.queryByText(SAME_NAME)).toBeNull();
    expect(screen.getByText('No attachments yet.')).toBeTruthy();
    await expectNoLocalActivity();
  });

  it('keeps both confirmed selections for a valid create followed by an unchanged same-bytes receipt', async () => {
    const files = [new File(['same exact bytes'], SAME_NAME), new File(['same exact bytes'], SAME_NAME)];
    const transport = serveBatch([confirmed(files[0]), confirmed(files[1], 200)]);
    const input = mount();
    await attach(input, files, transport.complete);

    expectPostedFiles(transport, files);
    expect(files[0]).not.toBe(files[1]);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([
      expect.objectContaining({ name: SAME_NAME, size: files[1].size, live: true }),
      expect.objectContaining({ name: SAME_NAME, size: files[0].size, live: true }),
    ]);
    expect(screen.getAllByText(SAME_NAME)).toHaveLength(2);
    await expectNoLocalActivity();
  });
});

describe('device attachment selection lifetime', () => {
  it('uses the original sent File when a live selection is replaced before its receipt arrives', async () => {
    const original = new File(['original selected bytes'], SAME_NAME);
    const replacement = new File(['replacement'], SAME_NAME);
    // The existing input seam supplies an array-backed FileList. Mutating it
    // models a live selection changing while the actual XHR reply is pending.
    const selected = [original];
    const entered = signal();
    const release = signal();
    const transport = serveBatch([confirmed(original)], async () => {
      entered.resolve();
      await release.promise;
    });
    const input = mount();
    await act(async () => {
      fireEvent.change(input, { target: { files: selected } });
      await entered.promise;
      selected.splice(0, selected.length, replacement);
      release.resolve();
      await transport.complete;
    });

    expect(selected[0]).toBe(replacement);
    expectPostedFiles(transport, [original]);
    expect(DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label)).toEqual([
      expect.objectContaining({ name: SAME_NAME, size: original.size, live: true }),
    ]);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(1);
    await expectNoLocalActivity();
  });
});
