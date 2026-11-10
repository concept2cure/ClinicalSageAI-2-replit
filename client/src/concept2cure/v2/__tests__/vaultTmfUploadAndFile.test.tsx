// @vitest-environment jsdom
/**
 * Upload and file in one step (surfaces/VaultTmfFiling.tsx): what the retired
 * eTMF screen had as "Attach & file", carried in the trial master file
 * section's filing form (founder decision P-122, 2026-11-10).
 *
 * Beside choosing a version from the Vault, the person may choose a file from
 * their computer. It is added to THIS project's Vault through the Vault's one
 * upload path (useVaultUpload, POST /api/vault/ingest: the real hook and its
 * XHR boundary run here, with a synthetic receipt), then the record is filed
 * against the document the Vault recorded, with the person's reason.
 *
 * What is pinned:
 *   - the upload goes to the project the section is of, typed by the record
 *     chosen, and the filing names the id the Vault returned;
 *   - a file the Vault refused: not added, nothing filed;
 *   - an upload the Vault did not confirm: not known, nothing filed, and the
 *     same file is not sent a second time;
 *   - the upload succeeded and the filing was refused: said exactly as that,
 *     and filed from the same form without uploading again;
 *   - a file the Vault already held is not said to have been added;
 *   - a view-only role is not offered it.
 * The in-memory server (_vault-tmf-fixtures.ts) refuses a filing against a
 * document that is not in the project's Vault, as the server does, so a filing
 * here succeeds only because the upload put the document there.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), canWrite: true, vaultChanged: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => H.canWrite }));

import { tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import { VaultTrialMasterFile } from '../surfaces/VaultTrialMasterFile';
import { ingestReceipt } from './_ingest-xhr-fake';
import { PID } from './_vault-surface-fixtures';
import { BASE, NOT_IN_PROJECT, ROLE, json, refusal, resetTmf, stubVaultIngest, tmf, tmfApi } from './_vault-tmf-fixtures';

const REASON = 'Signed monitoring plan, version 2';
const pdf = (name = 'monitoring-plan-v2.pdf') => new File(['%PDF-1.7 synthetic'], name, { type: 'application/pdf' });
const posts = () => H.apiRequest.mock.calls.filter(([m]) => m === 'POST').map(([, url, body]) => [url, body]);
const record = (code: string) => screen.getByTestId(`vault-tmf-record-${code}`);

/** Open the filing form of a record that is not filed. */
async function openForm(code = 'monitoring_plan') {
  render(<VaultTrialMasterFile projectId={PID} active onVaultChanged={H.vaultChanged} />);
  await screen.findByTestId('vault-tmf-verdict');
  const open = await screen.findByRole('button', { name: `File a document as ${tmfArtifactName(code)}` });
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(open);
  return screen.getByTestId(`vault-tmf-file-${code}`);
}
const choose = (form: HTMLElement, file: File, code = 'monitoring_plan') =>
  fireEvent.change(within(form).getByTestId(`vault-tmf-upload-${code}`), { target: { files: [file] } });
const reason = (form: HTMLElement, text = REASON) => fireEvent.change(within(form).getByLabelText(/^Reason for filing it\./), { target: { value: text } });
const addAndFile = (form: HTMLElement, name = 'Monitoring Plan') => within(form).getByRole('button', { name: `Add to the Vault and file as ${name}` }) as HTMLButtonElement;
/** Choose a file, give the reason and submit. */
async function uploadAndFile(file = pdf()) {
  const form = await openForm();
  choose(form, file);
  reason(form);
  fireEvent.click(addAndFile(form));
  return form;
}

beforeEach(() => {
  H.canWrite = true;
  H.vaultChanged.mockReset();
  resetTmf();
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? json({}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('upload and file in one step', () => {
  it('adds the file to this project’s Vault through the Vault’s upload, then files the record against the document the Vault recorded', async () => {
    const sent = stubVaultIngest();
    const form = await openForm();
    // Beside the Vault search: a file from the person's computer.
    expect(within(form).getByLabelText('Search this project’s Vault for the document to file as Monitoring Plan')).toBeTruthy();
    expect(within(form).getByRole('button', { name: 'Upload a file from your computer' })).toBeTruthy();
    choose(form, pdf());
    expect(within(form).getByTestId('vault-tmf-file-chosen').textContent)
      .toContain('File from your computer: monitoring-plan-v2.pdf. It is added to this project’s Vault first, then filed as Monitoring Plan.');
    // Nothing is sent until the reason is given: an upload is never made for a filing that cannot follow it.
    expect(addAndFile(form).disabled).toBe(true);
    reason(form, 'short');
    expect(addAndFile(form).disabled).toBe(true);
    reason(form, `  ${REASON}  `);
    expect(sent).toHaveLength(0);
    fireEvent.click(addAndFile(form));

    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent).toBe(
      '“monitoring-plan-v2.pdf” was added to this project’s Vault, version 1.0. Monitoring Plan is filed against it. Your reason is recorded with the filing.',
    );
    // One upload, to the Vault's ingest, into the project the section is of, under the file's own name.
    expect(sent.map((s) => s.url)).toEqual(['/api/vault/ingest']);
    const upload = sent[0].form;
    expect(upload.get('programId')).toBe(PID);
    expect((upload.get('file') as File).name).toBe('monitoring-plan-v2.pdf');
    expect(upload.get('documentTitle')).toBe('monitoring-plan-v2');
    expect(upload.get('documentType')).toBe('OTHER');
    // Then one filing, against the id the Vault returned, with the reason as given.
    const [id] = [...tmf.vaultDocs.keys()].slice(-1);
    expect(id).toMatch(/^77777777-/);
    expect(posts()).toEqual([[`${BASE}/artifacts`, { artifactCode: 'monitoring_plan', documentRef: `vault://${id}`, reason: REASON }]]);
    // What is shown next is what the server holds.
    await waitFor(() => expect(record('monitoring_plan').getAttribute('data-state')).toBe('filed'));
    await waitFor(() => expect(record('monitoring_plan').textContent).toContain('Filed against “monitoring-plan-v2”, version 1.0'));
    expect(screen.queryByTestId('vault-tmf-file-monitoring_plan')).toBeNull();
    // A host that lists the Vault is told it holds a new document.
    expect(H.vaultChanged).toHaveBeenCalledTimes(1);
  });

  /* The record chosen is what the person said the file is (the retired screen's mapping, etmfFilingPayload.test.ts):
     a code that is an ingest type is that type; any other record is OTHER, never a type nobody stated. */
  it.each([
    ['sap', 'SAP'],
    ['investigators_brochure', 'IB'],
    ['tmf_plan', 'OTHER'],
  ])('the upload is typed by the record it is filed as (%s is %s)', async (code, type) => {
    const sent = stubVaultIngest();
    const form = await openForm(code);
    choose(form, pdf('a-file.pdf'), code);
    reason(form);
    fireEvent.click(addAndFile(form, tmfArtifactName(code)));
    await screen.findByTestId('vault-tmf-note');
    expect(sent.map((s) => s.form.get('documentType'))).toEqual([type]);
    expect(posts().map(([, body]) => (body as { artifactCode: string }).artifactCode)).toEqual([code]);
  });

  it('the person can go back to the two ways of choosing before anything is sent', async () => {
    const sent = stubVaultIngest();
    const form = await openForm();
    choose(form, pdf());
    fireEvent.click(within(form).getByRole('button', { name: 'Choose another' }));
    expect(within(form).queryByTestId('vault-tmf-file-chosen')).toBeNull();
    expect(within(form).getByRole('button', { name: 'Upload a file from your computer' })).toBeTruthy();
    expect(within(form).getByRole('button', { name: 'File as Monitoring Plan' })).toHaveProperty('disabled', true);
    expect(sent).toHaveLength(0);
  });
});

describe('the upload and the filing are said apart', () => {
  it('a file the Vault refuses is not added, and nothing is filed', async () => {
    const sent = stubVaultIngest(() => ({ status: 415, body: { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'This file type is not accepted by the Vault.' } } }));
    const form = await uploadAndFile(pdf('notes.xyz'));
    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toBe('“notes.xyz” was not added to this project’s Vault: This file type is not accepted by the Vault. Nothing was filed.');
    expect(sent).toHaveLength(1);
    expect(posts()).toEqual([]);
    expect(screen.queryByTestId('vault-tmf-note')).toBeNull();
    expect(record('monitoring_plan').getAttribute('data-state')).toBe('missing');
    // The form is kept, with the file still chosen: another file, or the Vault search, is one click away.
    expect(within(form).getByTestId('vault-tmf-file-chosen')).toBeTruthy();
    expect(H.vaultChanged).not.toHaveBeenCalled();
  });

  it('an upload the Vault did not confirm is said as not known, nothing is filed, and the same file is not sent again', async () => {
    // A 201 whose body is not a receipt: every byte was sent and nothing says what was recorded.
    const sent = stubVaultIngest(() => ({ status: 201, body: { success: true } }));
    const form = await uploadAndFile();
    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toBe(
      'It is not known whether “monitoring-plan-v2.pdf” was added to this project’s Vault: the server reply did not confirm this file in this project. ' +
      'Nothing was filed. Search the Vault for it before uploading it again. If it is there, choose it to file it.',
    );
    expect(alert.textContent).not.toMatch(/was not added|refused/);
    expect(posts()).toEqual([]);
    // The file is no longer the form's choice: the Vault search is back, and nothing offers a second send of it.
    expect(within(form).queryByTestId('vault-tmf-file-chosen')).toBeNull();
    expect(within(form).queryByRole('button', { name: /^Add to the Vault and file/ })).toBeNull();
    expect(within(form).getByLabelText('Search this project’s Vault for the document to file as Monitoring Plan')).toBeTruthy();
    expect(sent).toHaveLength(1);
    // The Vault may hold it: a host that lists the Vault reads it again.
    expect(H.vaultChanged).toHaveBeenCalledTimes(1);
  });

  it('when the upload succeeds and the filing is refused, says the document is in the Vault and is not filed, then files it without uploading again', async () => {
    const sent = stubVaultIngest();
    tmf.refuseWith.file = () => { throw refusal(403, ROLE); };
    const form = await uploadAndFile();
    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toBe(
      '“monitoring-plan-v2.pdf” is in this project’s Vault and is not filed as Monitoring Plan. Your role cannot do this. It can be filed from here without uploading it again.',
    );
    expect(alert.textContent).not.toMatch(/Nothing was filed|was not added/);
    expect(record('monitoring_plan').getAttribute('data-state')).toBe('missing');
    expect(screen.queryByTestId('vault-tmf-note')).toBeNull();
    // The form's document is now the one the Vault recorded, and the act is the filing alone.
    expect(within(form).getByTestId('vault-tmf-chosen').textContent)
      .toContain('Document: monitoring-plan-v2.pdf, version 1.0. It is in this project’s Vault and is not filed yet.');
    expect(within(form).queryByRole('button', { name: /^Add to the Vault and file/ })).toBeNull();
    // The Vault holds the document whatever the filing came to.
    expect(H.vaultChanged).toHaveBeenCalledTimes(1);
    const [id] = [...tmf.vaultDocs.keys()].slice(-1);

    tmf.refuseWith = {};
    fireEvent.click(within(form).getByRole('button', { name: 'File as Monitoring Plan' }));
    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.textContent).toBe(
      '“monitoring-plan-v2.pdf” was added to this project’s Vault, version 1.0. Monitoring Plan is filed against it. Your reason is recorded with the filing.',
    );
    // One upload in all; the second request is the filing, against the same document.
    expect(sent).toHaveLength(1);
    const filing = { artifactCode: 'monitoring_plan', documentRef: `vault://${id}`, reason: REASON };
    expect(posts()).toEqual([[`${BASE}/artifacts`, filing], [`${BASE}/artifacts`, filing]]);
    expect(H.vaultChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(record('monitoring_plan').getAttribute('data-state')).toBe('filed'));
  });

  it('a filing the server refuses because the document is not in the study’s project is said with the server’s reason', async () => {
    // The Vault confirms the file in this project, and the filing still finds no such document there.
    stubVaultIngest((form) => ({ status: 201, body: ingestReceipt(form) }));
    const form = await uploadAndFile();
    expect((await within(form).findByRole('alert')).textContent).toBe(
      `“monitoring-plan-v2.pdf” is in this project’s Vault and is not filed as Monitoring Plan. ${NOT_IN_PROJECT.message} It can be filed from here without uploading it again.`,
    );
  });

  it('when the filing is not confirmed after the upload, says where the file is and that the filing is not known', async () => {
    stubVaultIngest();
    tmf.refuseWith.file = () => { throw new TypeError('Failed to fetch'); };
    await uploadAndFile();
    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toMatch(
      /^“monitoring-plan-v2\.pdf” was added to this project’s Vault, version 1\.0\. The server did not confirm the filing, so it is not known whether it was recorded\./,
    );
    await waitFor(() => expect(H.apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === `${BASE}/completeness?scope=essential`)).toHaveLength(2));
  });

  it('a file the Vault already held is filed against the document it holds, and is not said to have been added', async () => {
    stubVaultIngest((form) => {
      const receipt = ingestReceipt(form, { reupload: { unchanged: true, changes: [], differs: [] } });
      tmf.vaultDocs.set(receipt.document.id, { title: receipt.document.documentTitle, version: receipt.document.version, current: true });
      return { status: 200, body: receipt };
    });
    await uploadAndFile();
    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.textContent).toBe(
      '“monitoring-plan-v2.pdf” was already in this project’s Vault, version 1.0. Monitoring Plan is filed against it. Your reason is recorded with the filing.',
    );
    expect(posts()).toHaveLength(1);
    // Nothing was added, so the Vault is as its host last read it.
    expect(H.vaultChanged).not.toHaveBeenCalled();
  });
});

describe('a role that may not write the Vault', () => {
  it('is offered no upload: no filing form, no file control', async () => {
    const sent = stubVaultIngest();
    H.canWrite = false;
    render(<VaultTrialMasterFile projectId={PID} active />);
    await screen.findByTestId('vault-tmf-verdict');
    expect(screen.getByTestId('vault-tmf-view-only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^File a document/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upload a file/ })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
