// @vitest-environment jsdom
/**
 * File into Vault from the data room (VR-11, row D2).
 *
 * Sources not yet filed can be picked and filed. The answer is shown source by
 * source: filed and where it landed, already in the Vault, or not filed with
 * the reason. A batch with a refusal says not every file was filed. A refusal
 * of the whole request, or a dropped connection, is said as such and never as
 * a result. Server half: tests/db/vault-data-room-file.dbtest.ts and
 * server/routes/__tests__/vault-data-room-file.test.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { fileItemText, fileOutcomeSummary } from '../surfaces/VaultDataRoomFiling';
import { PID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const FILE_URL = `/api/c2c/project-vault/${PID}/data-room/file`;

const row = (id: number, stage: string, title: string) => ({
  id, title, kind: 'PDF', sizeLabel: '2 KB', addedAt: '1d ago', stage, readState: 'Read',
  suggestedFolder: null, suggestedFolderLabel: '—', evidenceKind: null, confidence: null, needsReview: false,
  filedAs: stage === 'filed' ? { version: '1.0', supersededBy: null } : null,
});

const room = {
  captured: 3, classified: 1, filed: 1, needsReview: 0,
  sources: [row(1, 'captured', 'Tox report.pdf'), row(2, 'classified', 'Protocol.pdf'), row(3, 'filed', 'IB.pdf')],
  window: { shown: 3, truncated: false },
};

let reads = 0;
let onFile: (body: unknown) => Response | Promise<Response>;

function mockApi() {
  reads = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') {
      reads += 1;
      return ok(vaultPayload({ dataRoom: room }));
    }
    if (url === FILE_URL && method === 'POST') return onFile(body);
    return ok({});
  });
}

async function openRoom() {
  render(<Vault {...props()} />);
  fireEvent.click(await screen.findByText('Show 3 sources'));
  return screen.getByTestId('vault-data-room');
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  mockApi();
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('File into Vault from the data room (VR-11)', () => {
  it('offers a checkbox only for sources not yet filed', async () => {
    const lane = await openRoom();
    expect(within(lane).getByLabelText('Select Tox report.pdf to file into the Vault')).toBeTruthy();
    expect(within(lane).getByLabelText('Select Protocol.pdf to file into the Vault')).toBeTruthy();
    expect(within(lane).queryByLabelText('Select IB.pdf to file into the Vault')).toBeNull();
  });

  it('files the chosen sources and answers for each one, saying the batch was not complete', async () => {
    onFile = () => ok({
      success: true,
      complete: false,
      items: [
        { sourceId: 1, outcome: 'filed', documentId: 'd-1', version: '1.0', placementStatus: 'suggested', folderLabel: 'Module 4 · Nonclinical', needsReview: false },
        { sourceId: 2, outcome: 'refused', code: 'SOURCE_BYTES_CHANGED', message: 'The stored file no longer matches the checksum recorded when it was captured. Nothing was filed. Capture the file again.' },
      ],
    });
    const lane = await openRoom();
    fireEvent.click(within(lane).getByLabelText('Select Tox report.pdf to file into the Vault'));
    fireEvent.click(within(lane).getByLabelText('Select Protocol.pdf to file into the Vault'));
    fireEvent.click(within(lane).getByRole('button', { name: 'File 2 into Vault' }));

    const result = await within(lane).findByRole('status');
    expect(result.textContent).toContain('1 filed, 1 not filed. Not every file was filed; the reasons are below.');
    expect(result.textContent).toContain('Tox report.pdf: Filed as v1.0, suggested for Module 4 · Nonclinical, awaiting your filing decision.');
    expect(result.textContent).toContain('Protocol.pdf: Not filed. The stored file no longer matches the checksum recorded when it was captured.');
    expect(apiRequest).toHaveBeenCalledWith('POST', FILE_URL, { sourceIds: [1, 2] });
    // Something was filed, so the Vault is read again.
    await waitFor(() => expect(reads).toBe(2));
  });

  it('a refusal of the whole request says nothing was filed, and gives the reason', async () => {
    onFile = () => {
      throw new ApiRequestError('Insufficient permissions', 403, { error: 'Insufficient permissions' }, '');
    };
    const lane = await openRoom();
    fireEvent.click(within(lane).getByLabelText('Select Tox report.pdf to file into the Vault'));
    fireEvent.click(within(lane).getByRole('button', { name: 'File 1 into Vault' }));
    const alert = await within(lane).findByRole('alert');
    expect(alert.textContent).toContain('Nothing was filed.');
    expect(alert.textContent).toContain('Insufficient permissions');
    expect(within(lane).queryByRole('status')).toBeNull();
    expect(reads).toBe(1);
  });

  it('a dropped connection says the outcome is not known', async () => {
    onFile = () => { throw new TypeError('Failed to fetch'); };
    const lane = await openRoom();
    fireEvent.click(within(lane).getByLabelText('Select Tox report.pdf to file into the Vault'));
    fireEvent.click(within(lane).getByRole('button', { name: 'File 1 into Vault' }));
    expect((await within(lane).findByRole('alert')).textContent).toContain('it is not known which files were filed');
  });

  it('can select every source not yet filed in one step', async () => {
    const lane = await openRoom();
    fireEvent.click(within(lane).getByRole('button', { name: 'Select 2 not yet filed' }));
    expect(within(lane).getByRole('button', { name: 'File 2 into Vault' })).toBeTruthy();
  });
});

describe('a revised file refused as a conflict is offered as the next version (QA-2026-10-08)', () => {
  const CONFLICT = 'A different document is already recorded at code "Protocol-Stability.pdf" version "1.0" for this program. Nothing was changed. Add it as a new version of that document instead of replacing the recorded one.';

  it('offers the recorded document, and files the source as its next version', async () => {
    let call = 0;
    onFile = () => {
      call += 1;
      return call === 1
        ? ok({ success: true, complete: false, items: [{ sourceId: 2, outcome: 'refused', code: 'VERSION_CONTENT_CONFLICT', message: CONFLICT, headDocumentId: 'head-2', headVersion: '1.0' }] })
        : ok({ success: true, complete: true, items: [{ sourceId: 2, outcome: 'filed', documentId: 'doc-9', version: '2.0', placementStatus: 'suggested', folderLabel: 'Module 4 · Nonclinical', needsReview: false }] });
    };
    const lane = await openRoom();
    fireEvent.click(within(lane).getByLabelText('Select Protocol.pdf to file into the Vault'));
    fireEvent.click(within(lane).getByRole('button', { name: 'File 1 into Vault' }));
    fireEvent.click(await within(lane).findByRole('button', { name: 'Add as the next version of Protocol.pdf' }));

    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('POST', FILE_URL, { sourceIds: [2], newVersionOf: { 2: 'head-2' } }));
    const result = await within(lane).findByRole('status');
    expect(result.textContent).toContain('Protocol.pdf: Filed as v2.0, suggested for Module 4 · Nonclinical, awaiting your filing decision.');
    expect(result.textContent).not.toContain('Not filed');
  });

  it('a refusal that is not a conflict offers no new version', async () => {
    onFile = () => ok({
      success: true, complete: false,
      items: [{ sourceId: 2, outcome: 'refused', code: 'SOURCE_BYTES_CHANGED', message: 'Capture the file again.' }],
    });
    const lane = await openRoom();
    fireEvent.click(within(lane).getByLabelText('Select Protocol.pdf to file into the Vault'));
    fireEvent.click(within(lane).getByRole('button', { name: 'File 1 into Vault' }));
    await within(lane).findByRole('status');
    expect(within(lane).queryByRole('button', { name: /as the next version/ })).toBeNull();
  });
});

describe('the words for each outcome', () => {
  it('already in the Vault names the version and what replaced it', () => {
    expect(fileItemText({ sourceId: 1, outcome: 'already_filed', documentId: 'd', version: '1.0', supersededBy: '2.0' }))
      .toBe('Already in the Vault as v1.0, superseded by v2.0. Nothing changed.');
  });

  it('a source the classifier could not place says it is not in a folder yet', () => {
    expect(fileItemText({ sourceId: 1, outcome: 'filed', documentId: 'd', version: '1.0', placementStatus: 'unfiled', folderLabel: null, needsReview: true }))
      .toBe('Filed as v1.0, not placed in a folder yet, awaiting your filing decision.');
  });

  it('a complete batch has no caveat', () => {
    expect(fileOutcomeSummary({ complete: true, items: [{ sourceId: 1, outcome: 'already_filed', documentId: 'd', version: null, supersededBy: null }] }))
      .toBe('1 already in the Vault.');
  });
});
