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
