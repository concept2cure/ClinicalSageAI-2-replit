// @vitest-environment jsdom
/** Real Vault staging/check-in actions must wait for a verifiable ingest receipt. */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { stubIngestXhr } from './_ingest-xhr-fake';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const SAVED_ID = '44444444-4444-4444-8444-444444444444';
const UNVERIFIED_ID = '55555555-5555-4555-8555-555555555555';
const NEXT_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_PROGRAM = '77777777-7777-4777-8777-777777777777';
const HEAD = 'stability-summary-24m';
const SAVED_TITLE = 'Analytical procedures — stored title';
const UNKNOWN_TITLE = 'Protocol with an unconfirmed receipt';
const VAULT_URL = `/api/c2c/project-vault/${PID}`;
const head = uploadDoc({ documentCode: `${HEAD}.pdf` });

/** The route's actual producer shape; no hook, receipt parser or transport is mocked. */
function receipt(id: string, documentTitle: string, version = '1.0', folderId: string | null = null) {
  return {
    success: true,
    document: {
      id, programId: PID, documentCode: 'analytical-procedures.pdf', documentTitle,
      documentType: 'OTHER', version, fileName: 'analytical-procedures.pdf', fileSize: 1024,
      mimeType: 'application/pdf', contentHash: 'a'.repeat(64), processingStatus: 'completed',
      hasExtractedText: true, extraction: 'extracted', wordCount: 24,
      createdAt: '2026-10-30T10:00:00.000Z', updatedAt: '2026-10-30T10:00:00.000Z',
    },
    filing: {
      view: 'ind', folderId, folderLabel: folderId ? 'Module 3 · Quality' : '',
      evidenceKind: folderId ? 'report' : null, ctdSection: folderId ? '3.2.P.8' : null,
      placementStatus: folderId ? 'suggested' : 'unfiled', confidence: null, rationale: null, needsReview: !folderId,
    },
  };
}

function projected(id: string, title: string) {
  return uploadDoc({
    id: `up-${id}`, docId: id, num: '—', title, status: 'unfiled',
    filing: receipt(id, title).filing,
  });
}

/** A false-success refresh would expose even the unconfirmed ID in this read. */
function serveVault(after: unknown[], before = cabinetTree([head])) {
  apiRequest.mockReset();
  let reads = 0;
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === VAULT_URL) {
      reads += 1;
      return ok(vaultPayload({ tree: reads === 1 ? before : after }));
    }
    if (path.endsWith('/versions')) return ok({ success: true, data: { versions: [] } });
    if (path.endsWith('/seals')) return ok({ success: true, data: { seals: [] } });
    return ok({});
  });
  return () => reads;
}

function replyInOrder(answers: Array<{ status: number; body: unknown }>) {
  const sent: FormData[] = [];
  stubIngestXhr(async (path, init) => {
    if (path !== '/api/vault/ingest') throw new Error(`Unexpected ingest path ${path}`);
    sent.push(init.body as FormData);
    const answer = answers.shift();
    if (!answer) throw new Error('An upload was repeated without an explicit test action');
    return { status: answer.status, json: async () => answer.body };
  });
  return sent;
}

function rowFor(title: string) {
  const row = Array.from(document.querySelectorAll<HTMLElement>('.vd-row'))
    .find(item => item.textContent?.includes(title));
  if (!row) throw new Error(`Missing Vault row ${title}`);
  return row;
}

const openTitle = () => document.querySelector('.vd-detail .vd-d-title')?.textContent ?? '';

async function uploadWhileReading(files: File[]) {
  render(<Vault {...props()} />);
  await screen.findAllByText(HEAD);
  fireEvent.click(rowFor(HEAD));
  await waitFor(() => expect(openTitle()).toContain(HEAD));
  fireEvent.change(screen.getByTestId('vault-upload-zone-files'), { target: { files } });
  fireEvent.click(await screen.findByTestId('vault-stage-upload'));
}

async function settled() {
  await waitFor(() => expect(screen.getByTestId('vault-stage-live').textContent).toMatch(/recorded\./));
}

function expectUnknownRow(name: string) {
  const row = screen.getByRole('group', { name });
  expect(row.textContent).toContain('Not known whether it was recorded:');
  expect(row.textContent).toContain('Reload the Vault and check before trying again.');
  expect(row.textContent).not.toContain('Recorded as');
  expect((within(row).getByLabelText('Title') as HTMLInputElement).disabled).toBe(false);
  expect(within(row).getByRole('button', { name: `Remove ${name} from this upload` })).toBeTruthy();
  return row;
}

async function expectOpened(id: string, title: string) {
  await waitFor(() => expect(openTitle()).toContain(title));
  await waitFor(() => expect(rowFor(title).getAttribute('data-on')).toBe('true'));
  await waitFor(() => expect(apiRequest.mock.calls.some(([, path]) =>
    path === `${VAULT_URL}/documents/${id}/versions`)).toBe(true));
  expect(screen.queryByTestId('vault-target-missing')).toBeNull();
}

beforeEach(() => { Reflect.set(window, 'C2C_PROJECT', { id: PID, title: 'BX-301' }); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'C2C_PROJECT');
});

it('keeps a malformed 201 file unknown and editable without opening its unverified ID or refreshing', async () => {
  const body = receipt(UNVERIFIED_ID, UNKNOWN_TITLE);
  body.document.programId = OTHER_PROGRAM;
  const reads = serveVault(cabinetTree([head], [projected(UNVERIFIED_ID, UNKNOWN_TITLE)]));
  const sent = replyInOrder([{ status: 201, body }]);
  const file = new File(['%PDF-1.7 report'], 'analytical-procedures.pdf');

  await uploadWhileReading([file]);
  await settled();

  expectUnknownRow(file.name);
  const live = screen.getByTestId('vault-stage-live');
  expect(live.textContent).toContain('0 files confirmed recorded.');
  expect(live.textContent).toContain('not known whether 1 file was recorded');
  expect(live.textContent).toContain(file.name);
  expect(screen.getByTestId('vault-stage-upload').textContent).toContain('Try again for 1 file');
  expect(screen.getByTestId('vault-stage-upload').getAttribute('aria-disabled')).not.toBe('true');
  expect(sent).toHaveLength(1);
  expect(sent[0].get('file')).toBe(file);
  expect(sent[0].get('programId')).toBe(PID);
  expect(reads()).toBe(1);
  expect(openTitle()).toContain(HEAD);
  expect(apiRequest.mock.calls.some(([, path]) => path.includes(`/documents/${UNVERIFIED_ID}/`))).toBe(false);
  expect(screen.queryByTestId('vault-target-missing')).toBeNull();
});

it('retains the same check-in offer and File after a malformed version receipt, then permits a deliberate retry', async () => {
  const next = receipt(NEXT_ID, HEAD, '2.0', 'module-3');
  next.document.documentCode = `${HEAD}.pdf`;
  next.document.fileName = `${HEAD}.pdf`;
  const malformed = { ...next, document: { ...next.document, version: '' } };
  const nextHead = uploadDoc({ id: `up-${NEXT_ID}`, docId: NEXT_ID, title: HEAD, ver: 'v2.0', versionCount: 2 });
  const reads = serveVault(cabinetTree([nextHead]));
  const sent = replyInOrder([
    { status: 409, body: { error: { code: 'VERSION_CONTENT_CONFLICT', message: `A different file is recorded at ${HEAD}.pdf.` } } },
    { status: 201, body: malformed },
    { status: 201, body: next },
  ]);
  const file = new File(['%PDF-1.7 changed'], `${HEAD}.pdf`);
  await uploadWhileReading([file]);
  await settled();
  const name = `Upload as a new version of ${HEAD}`;
  const offer = screen.getByRole('button', { name });

  fireEvent.click(offer);
  await waitFor(() => expect(sent).toHaveLength(2));
  await settled();

  expect(screen.queryByRole('button', { name })).toBe(offer);
  expect((offer as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/It is not known whether these files were recorded:/)).toBeTruthy();
  expect(screen.queryByText(/Added .* as v/)).toBeNull();
  expect(reads()).toBe(1);
  expect(openTitle()).toContain(HEAD);
  expect(sent[1].get('file')).toBe(file);
  expect(sent[1].get('supersedesDocumentId')).toBe(DOC_ID);
  expect(sent[1].get('documentCode')).toBeNull();

  fireEvent.click(offer);
  await waitFor(() => expect(sent).toHaveLength(3));
  expect(sent[2].get('file')).toBe(file);
  await expectOpened(NEXT_ID, HEAD);
  expect(rowFor(HEAD).textContent).toContain('v2.0, 2 versions');
  expect(screen.queryByRole('button', { name })).toBeNull();
  expect(reads()).toBe(2);
});

it('opens only the confirmed saved ID in a mixed batch and keeps its second file unknown', async () => {
  const known = receipt(SAVED_ID, SAVED_TITLE);
  const unconfirmed = receipt(UNVERIFIED_ID, UNKNOWN_TITLE);
  unconfirmed.document.documentCode = 'protocol.pdf';
  unconfirmed.document.fileName = 'protocol.pdf';
  unconfirmed.filing.placementStatus = 'suggested'; // A suggested placement cannot have no folder.
  unconfirmed.filing.needsReview = false;
  const reads = serveVault(cabinetTree([head], [projected(SAVED_ID, SAVED_TITLE), projected(UNVERIFIED_ID, UNKNOWN_TITLE)]));
  const sent = replyInOrder([{ status: 201, body: known }, { status: 201, body: unconfirmed }]);
  const first = new File(['%PDF-1.7 analytical'], 'analytical-procedures.pdf');
  const second = new File(['%PDF-1.7 protocol'], 'protocol.pdf');

  await uploadWhileReading([first, second]);
  await settled();

  expectUnknownRow(second.name);
  const stored = screen.getByRole('group', { name: first.name });
  expect(stored.textContent).toContain('Recorded as v1.0');
  expect((within(stored).getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByTestId('vault-stage-live').textContent).toContain('1 file confirmed recorded.');
  expect(screen.getByTestId('vault-stage-live').textContent).toContain('not known whether 1 file was recorded: protocol.pdf');
  expect(sent).toHaveLength(2);
  expect(sent.map(form => form.get('file'))).toEqual([first, second]);
  await expectOpened(SAVED_ID, SAVED_TITLE);
  expect(openTitle()).not.toContain(UNKNOWN_TITLE);
  expect(rowFor(UNKNOWN_TITLE).getAttribute('data-on')).not.toBe('true');
  expect(apiRequest.mock.calls.some(([, path]) => path.includes(`/documents/${UNVERIFIED_ID}/`))).toBe(false);
  expect(reads()).toBe(2);
});

it.each([
  { kind: 'newly saved', status: 201 },
  { kind: 'already recorded', status: 200 },
])('opens the actual $kind document from a complete producer-compatible receipt', async ({ status }) => {
  const saved = projected(SAVED_ID, SAVED_TITLE);
  const body = receipt(SAVED_ID, SAVED_TITLE);
  const response = status === 200 ? { ...body, reupload: { unchanged: true, changes: [], differs: [] } } : body;
  const before = status === 200 ? cabinetTree([head], [saved]) : cabinetTree([head]);
  const reads = serveVault(cabinetTree([head], [saved]), before);
  const sent = replyInOrder([{ status, body: response }]);
  const file = new File(['%PDF-1.7 analytical'], 'analytical-procedures.pdf');

  await uploadWhileReading([file]);
  await settled();

  await expectOpened(SAVED_ID, SAVED_TITLE);
  expect(openTitle()).not.toContain(HEAD);
  expect(screen.getByTestId('vault-stage-live').textContent).toBe('1 file recorded.');
  expect(screen.queryByTestId('vault-stage-upload')).toBeNull();
  expect(screen.getByRole('group', { name: file.name }).textContent).not.toContain('Not known whether');
  expect(sent).toHaveLength(1);
  expect(sent[0].get('file')).toBe(file);
  expect(reads()).toBe(2);
});
