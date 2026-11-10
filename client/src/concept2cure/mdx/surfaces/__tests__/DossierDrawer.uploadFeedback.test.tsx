// @vitest-environment jsdom
/** Actual attachment results must be visible without fabricating a saved file or a retry. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken, setOrgId } from '@/utils/authToken';
import { DossierDrawer } from '../pathway/PathwayPanes';
import { DossierStore } from '../../store/dossierStore';
import { ingestReceipt, stubIngestXhr, type IngestInit } from '../../../v2/__tests__/_ingest-xhr-fake';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const TARGET = { id: 95, label: 'Attachment outcome evidence' };
const clients: QueryClient[] = [];
type Reply = { status: number; body: (form: FormData) => unknown } | { lost: true };
type Request = { url: string; init: IngestInit };

const created: Reply = { status: 201, body: form => ingestReceipt(form) };
const unchanged: Reply = { status: 200, body: form => ingestReceipt(form, {
  reupload: { unchanged: true, changes: [], differs: [] },
}) };
const refused: Reply = { status: 409, body: () => ({ error: {
  code: 'VERSION_CONTENT_CONFLICT', message: 'Different bytes are already recorded at this code and version.',
} }) };
const malformed: Reply = { status: 201, body: () => ({ success: true }) };
const uncertain: Reply = { status: 503, body: () => ({ error: {
  code: 'OUTCOME_UNKNOWN', message: 'Review the current Vault records before trying again.',
} }) };
const selected = (name = 'diagnostic-performance.pdf') => new File(['synthetic evidence'], name, { type: 'application/pdf' });

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}>
    <DossierDrawer open target={TARGET} pathway="k510" programId={PROGRAM} documentId={DOCUMENT} onClose={vi.fn()} />
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole('tab', { name: /Attachments/ }));
  return {
    input: () => view.container.querySelector<HTMLInputElement>('input[type="file"]')!,
    drop: () => view.container.querySelector<HTMLElement>('.dd-att-drop')!,
    chooser: () => screen.getByRole('button', { name: /Choose files/i }) as HTMLButtonElement,
  };
}

/** The real transport parses every reply; only the server response is synthetic. */
function serve(replies: Reply[], beforeReply?: (index: number) => Promise<void>) {
  const requests: Request[] = [];
  const finished = signal();
  stubIngestXhr(async (url, init) => {
    const index = requests.length;
    requests.push({ url, init });
    const reply = replies[index];
    if (!reply) throw new Error('An attachment was resubmitted without a deliberate selection');
    await beforeReply?.(index);
    if ('lost' in reply) {
      if (index === replies.length - 1) finished.resolve();
      throw new Error('Synthetic reply lost after all bytes were sent');
    }
    return { status: reply.status, json: async () => {
      const body = reply.body(init.body as FormData);
      if (index === replies.length - 1) finished.resolve();
      return body;
    } };
  });
  return { requests, complete: finished.promise };
}

async function choose(input: HTMLInputElement, files: File[], complete: Promise<void>) {
  await act(async () => { fireEvent.change(input, { target: { files } }); await complete; });
}
async function whilePending(check: () => void | Promise<void>, release: () => void, complete: Promise<void>) {
  try { await check(); }
  finally { await act(async () => { release(); await complete; }); }
}
function feedback(role: 'status' | 'alert') {
  return within(screen.getByRole('dialog', { name: /Dossier/ })).getByRole(role);
}
function attachments() { return DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label); }
function expectOriginalRequests(requests: Request[], files: File[]) {
  expect(requests).toHaveLength(files.length);
  requests.forEach(({ url, init }, index) => {
    expect(url).toBe('/api/vault/ingest'); expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer synthetic-device-feedback');
    expect(init.headers['x-organization-id']).toBe('7');
    expect(Object.keys(init.headers).map(key => key.toLowerCase())).not.toContain('content-type');
    const form = init.body as FormData;
    expect(form.get('file')).toBe(files[index]); expect(form.get('programId')).toBe(PROGRAM);
    expect(form.get('documentCode')).toBe(files[index].name);
  });
}
async function expectServerOwnedActivity() {
  fireEvent.click(screen.getByRole('tab', { name: /Activity/ }));
  await screen.findByTestId('dd-act-empty');
  expect(document.querySelectorAll('.dd-act-row')).toHaveLength(0);
}

beforeEach(() => {
  DossierStore.clearAllPathways(); setAuthToken('synthetic-device-feedback'); setOrgId('7');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear()); DossierStore.clearAllPathways();
  clearAuthToken(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('visible device attachment refusals and uncertain results', () => {
  it('shows the actual version refusal without adding a file or a local activity event', async () => {
    const file = selected(); const transport = serve([refused]); const view = mount();
    await choose(view.input(), [file], transport.complete);
    expect(feedback('alert').textContent).toContain('Not filed: diagnostic-performance.pdf');
    expect(feedback('alert').textContent).toContain('Different bytes are already recorded');
    expect(attachments()).toEqual([]); expectOriginalRequests(transport.requests, [file]);
    await expectServerOwnedActivity();
  });

  it.each([
    { label: 'malformed successful reply', reply: malformed },
    { label: 'explicit uncertain commit', reply: uncertain },
    { label: 'complete-send reply loss', reply: { lost: true } as Reply },
  ])('shows check-before-retry guidance for $label and sends no automatic retry', async ({ reply }) => {
    const file = selected(); const transport = serve([reply]); const view = mount();
    await choose(view.input(), [file], transport.complete);
    const text = feedback('alert').textContent;
    expect(text).toContain('It is not known whether these files were recorded: diagnostic-performance.pdf');
    expect(text).toContain('Reload the Vault and check before trying again.');
    expect(text).not.toMatch(/Not filed:|Nothing partial was recorded/);
    expect(attachments()).toEqual([]); expectOriginalRequests(transport.requests, [file]);
    await expectServerOwnedActivity();
  });

  it('shows partial success and the refused file while listing only the confirmed attachment', async () => {
    const files = [selected('confirmed.pdf'), selected('refused.pdf')];
    const transport = serve([created, refused]); const view = mount();
    await choose(view.input(), files, transport.complete);
    expect(feedback('alert').textContent).toMatch(/Filed 1\. Not filed: refused\.pdf/);
    expect(attachments().map(file => file.name)).toEqual(['confirmed.pdf']);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(1);
    expectOriginalRequests(transport.requests, files); await expectServerOwnedActivity();
  });

  it('keeps a mixed unknown result distinct from a known refusal', async () => {
    const files = [selected('confirmed.pdf'), selected('uncertain.pdf')];
    const transport = serve([created, malformed]); const view = mount();
    await choose(view.input(), files, transport.complete);
    const text = feedback('alert').textContent;
    expect(text).toContain('Filed 1.'); expect(text).toContain('not known whether these files were recorded: uncertain.pdf');
    expect(text).toContain('Reload the Vault and check before trying again.');
    expect(text).not.toMatch(/Not filed:|Nothing partial was recorded/);
    expect(attachments().map(file => file.name)).toEqual(['confirmed.pdf']);
    expectOriginalRequests(transport.requests, files); await expectServerOwnedActivity();
  });
});

describe('visible confirmed uploads and deliberate later selections', () => {
  it.each([
    { label: 'created', reply: created, words: /1 landed in Unfiled/ },
    { label: 'unchanged same-bytes', reply: unchanged, words: /Already in the Vault, nothing changed/ },
  ])('reports a valid $label receipt with its existing Vault wording', async ({ reply, words }) => {
    const file = selected(); const transport = serve([reply]); const view = mount();
    await choose(view.input(), [file], transport.complete);
    expect(feedback('status').textContent).toMatch(words);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(attachments()).toEqual([expect.objectContaining({ name: file.name, size: file.size, live: true })]);
    expectOriginalRequests(transport.requests, [file]); await expectServerOwnedActivity();
  });

  it('clears an earlier refusal when a deliberate new selection starts and publishes its own result', async () => {
    const first = selected('refused.pdf'); const firstTransport = serve([refused]); const view = mount();
    await choose(view.input(), [first], firstTransport.complete);
    expect(feedback('alert').textContent).toContain('refused.pdf');
    const entered = signal(); const release = signal(); const next = selected('new-evidence.pdf');
    const nextTransport = serve([created], async () => { entered.resolve(); await release.promise; });
    await act(async () => { fireEvent.change(view.input(), { target: { files: [next] } }); await entered.promise; });
    await whilePending(() => {
      expect(screen.queryByRole('alert')).toBeNull(); expect(feedback('status').textContent).toMatch(/Uploading/i);
      expect(feedback('status').textContent).not.toContain('refused.pdf');
    }, release.resolve, nextTransport.complete);
    expect(feedback('status').textContent).toMatch(/1 landed in Unfiled/);
    expect(attachments().map(file => file.name)).toEqual(['new-evidence.pdf']);
    expectOriginalRequests(firstTransport.requests, [first]); expectOriginalRequests(nextTransport.requests, [next]);
  });
});

describe('one active device attachment batch', () => {
  it('shows pending status and disables selection while ignoring later input and drop gestures', async () => {
    const entered = signal(); const release = signal(); const file = selected();
    const transport = serve([created], async () => { entered.resolve(); await release.promise; }); const view = mount();
    await act(async () => { fireEvent.change(view.input(), { target: { files: [file] } }); await entered.promise; });
    await whilePending(async () => {
      expect(feedback('status').textContent).toMatch(/Uploading/i);
      expect(view.input().disabled).toBe(true); expect(view.chooser().disabled).toBe(true);
      await act(async () => {
        fireEvent.change(view.input(), { target: { files: [selected('extra-input.pdf')] } });
        fireEvent.drop(view.drop(), { dataTransfer: { files: [selected('extra-drop.pdf')] } });
        await Promise.resolve();
      });
      expectOriginalRequests(transport.requests, [file]);
    }, release.resolve, transport.complete);
    expect(view.input().disabled).toBe(false); expect(view.chooser().disabled).toBe(false);
    expect(attachments().map(item => item.name)).toEqual([file.name]); expectOriginalRequests(transport.requests, [file]);
  });

  it('blocks overlapping input and drop calls before the pending state can repaint', async () => {
    const entered = signal(); const release = signal(); const file = selected();
    const transport = serve([created], async () => { entered.resolve(); await release.promise; }); const view = mount();
    await act(async () => {
      fireEvent.change(view.input(), { target: { files: [file] } });
      fireEvent.drop(view.drop(), { dataTransfer: { files: [selected('synchronous-drop.pdf')] } });
      fireEvent.change(view.input(), { target: { files: [selected('synchronous-input.pdf')] } });
      await entered.promise;
    });
    await whilePending(() => { expectOriginalRequests(transport.requests, [file]); }, release.resolve, transport.complete);
    expect(attachments().map(item => item.name)).toEqual([file.name]); expectOriginalRequests(transport.requests, [file]);
  });
});

describe('keyboard selection and ordinary drawer tab changes', () => {
  it('opens the native chooser once per keyboard activation without submitting an upload', async () => {
    const transport = serve([]); const view = mount(); const user = userEvent.setup();
    const click = vi.spyOn(view.input(), 'click');
    view.chooser().focus(); expect(document.activeElement).toBe(view.chooser());
    await user.keyboard('[Enter]'); expect(click).toHaveBeenCalledTimes(1);
    await user.keyboard(' '); expect(click).toHaveBeenCalledTimes(2);
    expect(transport.requests).toEqual([]); expect(attachments()).toEqual([]);
  });

  it('opens the existing drop-zone chooser once per pointer gesture', () => {
    const transport = serve([]); const view = mount(); const click = vi.spyOn(view.input(), 'click');
    fireEvent.click(view.drop());
    expect(click).toHaveBeenCalledTimes(1); expect(transport.requests).toEqual([]); expect(attachments()).toEqual([]);
  });

  it('keeps pending progress and the eventual result while visiting Document and Activity tabs', async () => {
    const entered = signal(); const release = signal(); const file = selected();
    const transport = serve([created], async () => { entered.resolve(); await release.promise; }); const view = mount();
    await act(async () => { fireEvent.change(view.input(), { target: { files: [file] } }); await entered.promise; });
    await whilePending(async () => {
      expect(feedback('status').textContent).toMatch(/Uploading/i);
      fireEvent.click(screen.getByRole('tab', { name: 'Document' }));
      fireEvent.click(screen.getByRole('tab', { name: /Activity/ }));
      await screen.findByTestId('dd-act-empty');
      fireEvent.click(screen.getByRole('tab', { name: /Attachments/ }));
      expect(feedback('status').textContent).toMatch(/Uploading/i); expect(view.input().disabled).toBe(true);
    }, release.resolve, transport.complete);
    expect(feedback('status').textContent).toMatch(/1 landed in Unfiled/);
    expect(attachments()).toEqual([expect.objectContaining({ name: file.name, size: file.size })]);
    expectOriginalRequests(transport.requests, [file]); await expectServerOwnedActivity();
  });
});
