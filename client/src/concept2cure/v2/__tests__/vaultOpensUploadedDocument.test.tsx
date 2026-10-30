// @vitest-environment jsdom
/**
 * After an upload, the Vault opens the document the server recorded.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The upload list (VaultUploadStaging.tsx) said "Recorded as v1.0", the tree
 * was re-read, and the detail pane stayed on whatever was open before. The next
 * act on the filing path, confirming the filing and "Place into filing…", is on
 * the uploaded document's own pane, so the person had to find, in the tree, the
 * file they had just added (IND reference lane, Click 3; the walk's driver
 * opened it itself). A check-in was worse: the version the pane showed stopped
 * being current, and the pane fell back to the folder's first document.
 *
 * The ingest response names the document it recorded (`document.id`). The
 * Vault opens it as "Open in Vault" opens a filed one (vaultTarget.ts), once the
 * re-read holds it. An id the response does not give is not guessed, and a
 * recorded document the re-read does not hold is said.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { stubIngestXhr } from './_ingest-xhr-fake';
import { PID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const NEW_ID = '44444444-4444-4444-8444-444444444444';
const V2_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ID = '66666666-6666-4666-8666-666666666666';
const HEAD = 'stability-summary-24m';
const OTHER = 'container-closure-summary';

/** The analytical procedures file as the read model projects it once recorded: Unfiled, awaiting review. */
const uploaded = uploadDoc({
  id: `up-${NEW_ID}`, docId: NEW_ID, num: '—', title: 'analytical-procedures', status: 'unfiled',
  filing: { folderId: null, folderLabel: null, evidenceKind: null, ctdSection: null, placementStatus: 'unfiled', confidence: null, rationale: null },
});
const other = uploadDoc({ id: `up-${OTHER_ID}`, docId: OTHER_ID, num: '3.2.P.7', title: OTHER });
const head = uploadDoc({ documentCode: `${HEAD}.pdf` });
const headV2 = uploadDoc({ id: `up-${V2_ID}`, docId: V2_ID, documentCode: `${HEAD}.pdf`, ver: 'v2.0', versionCount: 2 });

/** The tree before the upload, and the tree the Vault reads once the server has recorded it. */
function mockApi(before: unknown[], after: unknown[], state: { recorded: boolean }) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: state.recorded ? after : before }));
    return ok({ success: true, data: {} });
  });
}

/** POST /api/vault/ingest answers in order; a 2xx marks the document recorded, so the next tree read holds it. */
function stubIngest(answers: Array<{ status: number; body: unknown }>, state: { recorded: boolean }) {
  stubIngestXhr(vi.fn(async (url: string) => {
    if (url !== '/api/vault/ingest') return { ok: true, status: 200, json: async () => ({}) } as Response;
    const a = answers.shift() ?? { status: 500, body: {} };
    if (a.status < 300) state.recorded = true;
    return { ok: a.status < 300, status: a.status, json: async () => a.body } as Response;
  }));
}

/** The open document's title, as the detail pane heads it ("3.2.P.8 - <title>"). */
const openTitle = () => document.querySelector('.vd-detail .vd-d-title')?.textContent ?? '';
const rowFor = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.vd-row')).find((r) => r.textContent?.includes(title))!;

/** Open `title`'s row, then send `file` through the upload list. */
async function uploadWhileReading(title: string, file: File) {
  render(<Vault {...props()} />);
  await screen.findAllByText(title);
  fireEvent.click(rowFor(title));
  await waitFor(() => expect(openTitle()).toContain(title));
  fireEvent.change(screen.getByTestId('vault-upload-zone-files'), { target: { files: [file] } });
  fireEvent.click(await screen.findByTestId('vault-stage-upload'));
}

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-512' }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

describe('after an upload, the Vault opens the document it recorded', () => {
  it('opens a new document where it landed, in place of the one that was open', async () => {
    const state = { recorded: false };
    mockApi(cabinetTree([head]), cabinetTree([head], [uploaded]), state);
    stubIngest([{ status: 201, body: {
      success: true,
      document: { id: NEW_ID, programId: PID, version: '1.0', documentTitle: 'analytical-procedures' },
      filing: { folderId: null, folderLabel: null, needsReview: true, placementStatus: 'unfiled' },
    } }], state);
    await uploadWhileReading(HEAD, new File(['%PDF-1.7 v1'], 'analytical-procedures.pdf'));

    await waitFor(() => expect(openTitle()).toContain('analytical-procedures'));
    expect(openTitle()).not.toContain(HEAD);
    expect(rowFor('analytical-procedures').getAttribute('data-on')).toBe('true');
    // It opens on the folder it landed in, so the list and the pane agree.
    expect(within(document.querySelector('.vd-list') as HTMLElement).getAllByText(/Unfiled/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('vault-target-missing')).toBeNull();
  });

  it('a check-in opens the document at the version just recorded, not the folder’s first document', async () => {
    const state = { recorded: false };
    mockApi(cabinetTree([other, head]), cabinetTree([other, headV2]), state);
    stubIngest([
      { status: 409, body: { error: { code: 'VERSION_CONTENT_CONFLICT', message: `A different document is already recorded at code "${HEAD}.pdf".` } } },
      { status: 201, body: { success: true, document: { id: V2_ID, programId: PID, version: '2.0', documentTitle: HEAD },
        filing: { folderId: 'module-3', folderLabel: 'Module 3 · Quality', placementStatus: 'confirmed', needsReview: false } } },
    ], state);
    await uploadWhileReading(HEAD, new File(['%PDF-1.7 v2'], `${HEAD}.pdf`));
    fireEvent.click(await screen.findByText(`Upload as a new version of ${HEAD}`));

    // The re-read holds the new version; the row it replaced is gone.
    await waitFor(() => expect(rowFor(HEAD).textContent).toContain('v2.0, 2 versions'));
    await waitFor(() => expect(rowFor(HEAD).getAttribute('data-on')).toBe('true'));
    expect(openTitle()).toContain(HEAD);
    expect(openTitle()).not.toContain(OTHER);
  });

  it('a response that names no document opens nothing: the document is not guessed', async () => {
    const state = { recorded: false };
    mockApi(cabinetTree([head]), cabinetTree([head], [uploaded]), state);
    stubIngest([{ status: 201, body: { success: true,
      document: { programId: PID, version: '1.0', documentTitle: 'analytical-procedures' },
      filing: { folderId: null, folderLabel: null, placementStatus: 'unfiled', needsReview: true },
    } }], state);
    await uploadWhileReading(HEAD, new File(['%PDF-1.7 v1'], 'analytical-procedures.pdf'));

    await screen.findByText(/Not known whether it was recorded:/);
    expect(rowFor('analytical-procedures')).toBeUndefined();
    // An unconfirmed receipt neither refreshes the tree nor looks for a guessed document.
    await expect(screen.findByTestId('vault-target-missing', undefined, { timeout: 300 })).rejects.toThrow();
    expect(openTitle()).toContain(HEAD);
  });

  it('a recorded document the re-read does not hold is said, not silently ignored', async () => {
    const state = { recorded: false };
    mockApi(cabinetTree([head]), cabinetTree([head]), state);
    stubIngest([{ status: 201, body: { success: true,
      document: { id: NEW_ID, programId: PID, version: '1.0', documentTitle: 'analytical-procedures' },
      filing: { folderId: null, folderLabel: null, placementStatus: 'unfiled', needsReview: true },
    } }], state);
    await uploadWhileReading(HEAD, new File(['%PDF-1.7 v1'], 'analytical-procedures.pdf'));

    expect((await screen.findByTestId('vault-target-missing')).textContent).toContain('you just uploaded is not in this list');
    expect(openTitle()).toContain(HEAD);
  });
});
