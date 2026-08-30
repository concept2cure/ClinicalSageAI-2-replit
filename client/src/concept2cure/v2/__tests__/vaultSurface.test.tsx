// @vitest-environment jsdom
/**
 * Vault (DMS) — the dossier tree, the filing cabinet, and the data room lane.
 *
 * What these tests pin is the honesty and the seam this build closed:
 *   - an upload appears IN THE TREE it was uploaded into (the filing cabinet),
 *     carrying its real placement state — suggested / confirmed / unfiled;
 *   - the data room lane reports the derived capture → classify → file
 *     pipeline, and a FAILED read renders as a failure, never as an empty room;
 *   - a failed vault read renders as an error, never as "no documents";
 *   - confirming a suggested filing is a POST to the governed /file route and
 *     a re-read of the tree — never a local patch.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';

const PID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/* An expired-token 401 as authenticateToken returns it. apiRequest does NOT
   throw on 401, so this response reaches the caller — the case that used to fall
   through Vault's filing handler into a fabricated success. */
function unauthorized() {
  return {
    ok: false,
    status: 401,
    json: async () => ({ error: { code: 'AUTH_002', message: 'Invalid or expired token' } }),
  } as Response;
}

function uploadDoc(over: Record<string, unknown> = {}) {
  return {
    id: `up-${DOC_ID}`,
    num: '3.2.P.8',
    title: 'stability-summary-24m',
    type: 'Test reports',
    status: 'suggested',
    pct: 0,
    owner: 'A. Author',
    ver: 'v1.0',
    updated: '2m ago',
    preview: 'stability-summary-24m.pdf · 1.0 MB · SHA-256 aaaaaaaaaaaa…',
    src: 'upload',
    docId: DOC_ID,
    sizeLabel: '1.0 MB',
    hash: 'a'.repeat(64),
    filing: {
      folderId: 'module-3',
      folderLabel: 'Module 3 · Quality',
      evidenceKind: 'report',
      ctdSection: '3.2.P.8',
      placementStatus: 'suggested',
      confidence: 'high',
      rationale: 'CTD pattern "Stability" → Module 3 (3.2.P.8).',
    },
    ...over,
  };
}

function cabinetTree(docs: unknown[] = [uploadDoc()], unfiledDocs: unknown[] = []) {
  return [
    {
      id: 'cabinet',
      code: '',
      label: 'Source files · filing cabinet',
      children: [
        { id: 'cab-unfiled', code: '', label: 'Unfiled · needs review', children: unfiledDocs },
        { id: 'cab-module-3', code: '', label: 'Module 3 · Quality', children: docs },
        { id: 'cab-corresp', code: '', label: 'Agency correspondence', children: [] },
      ],
    },
  ];
}

function vaultPayload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      program: 'BX-301',
      spine: 'IND · 21 CFR 312',
      standard: 'pharma',
      documentCount: 1,
      tree: cabinetTree(),
      unfiledCount: 0,
      ...over,
    },
  };
}

const props = () => ({
  surface: { id: 'vault', label: 'Vault' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function mockApi(vaultResponse: () => Response, onFile?: (body: unknown) => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return vaultResponse();
    if (url === `/api/c2c/project-vault/${PID}/file` && method === 'POST') {
      return onFile
        ? onFile(body)
        : ok({ success: true, filing: { folderId: 'module-3', folderLabel: 'Module 3 · Quality', placementStatus: 'confirmed' } });
    }
    return ok({});
  });
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
});

describe('Vault — uploads are visible in the tree they were uploaded into', () => {
  it('renders the filing cabinet with the upload inside its suggested folder', async () => {
    mockApi(() => ok(vaultPayload()));
    render(<Vault {...props()} />);

    // Cabinet + folder labels appear in the tree (and again in the breadcrumb
    // for the open folder) — presence anywhere is what this test pins.
    expect((await screen.findAllByText('Source files · filing cabinet')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Module 3 · Quality').length).toBeGreaterThan(0);
    // The upload row itself, with its filing state pill.
    expect(screen.getAllByText('stability-summary-24m').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Auto-filed · confirm').length).toBeGreaterThan(0);
  });

  it('shows the unfiled queue and the header review count', async () => {
    mockApi(() =>
      ok(
        vaultPayload({
          tree: cabinetTree([], [uploadDoc({
            id: 'up-unf', docId: DOC_ID, status: 'unfiled', num: '—',
            title: 'scan0001', flag: 'Not filed into the dossier yet.',
            filing: {
              folderId: null, folderLabel: '', evidenceKind: null, ctdSection: null,
              placementStatus: 'unfiled', confidence: 'none',
              rationale: 'No filing rule matched the name, title, or document text — needs a person to file it.',
            },
          })]),
          unfiledCount: 1,
        }),
      ),
    );
    render(<Vault {...props()} />);

    expect(await screen.findByText(/1 unfiled — needs review/)).toBeTruthy();
    expect(screen.getAllByText('Unfiled · needs review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('scan0001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unfiled').length).toBeGreaterThan(0);
  });

  it('a failed vault read is an error, never "no documents"', async () => {
    mockApi(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    render(<Vault {...props()} />);

    expect(await screen.findByText(/Couldn't load the project vault/)).toBeTruthy();
    expect(screen.queryByText(/No documents in this project's vault yet/)).toBeNull();
  });
});

describe('Vault — the data room lane', () => {
  it('reports the derived pipeline stages and lists sources on demand', async () => {
    mockApi(() =>
      ok(
        vaultPayload({
          dataRoom: {
            captured: 3,
            classified: 2,
            filed: 1,
            sources: [
              {
                id: 1, title: 'protocol-v2.pdf', kind: 'PDF', sizeLabel: '2.3 MB',
                addedAt: '1d ago', stage: 'filed', readState: 'Read',
                suggestedFolder: null, suggestedFolderLabel: '', evidenceKind: null,
                confidence: null, needsReview: false,
              },
              {
                id: 2, title: 'tox-report.pdf', kind: 'PDF', sizeLabel: '5.1 MB',
                addedAt: '2h ago', stage: 'classified', readState: 'Read',
                suggestedFolder: 'module-4', suggestedFolderLabel: 'Module 4 · Nonclinical',
                evidenceKind: 'report', confidence: 'high', needsReview: false,
              },
              {
                id: 3, title: 'notes.txt', kind: 'Text', sizeLabel: '12.0 kB',
                addedAt: '5m ago', stage: 'captured', readState: 'Read',
                suggestedFolder: null, suggestedFolderLabel: '', evidenceKind: null,
                confidence: null, needsReview: false,
              },
            ],
          },
        }),
      ),
    );
    render(<Vault {...props()} />);

    const lane = await screen.findByTestId('vault-data-room');
    expect(lane.textContent).toMatch(/Captured\s*3/);
    expect(lane.textContent).toMatch(/Classified\s*2/);
    expect(lane.textContent).toMatch(/Filed to vault\s*1/);

    fireEvent.click(screen.getByText(/Show 3 sources/));
    expect(screen.getByText('tox-report.pdf')).toBeTruthy();
    expect(screen.getAllByText(/Module 4 · Nonclinical/).length).toBeGreaterThan(0);
    // Stage chips (the strip repeats the words; the chips are what the rows carry).
    expect(screen.getAllByText('Filed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Captured').length).toBeGreaterThan(0);
  });

  it('an unavailable data room renders as a failure, never an empty room', async () => {
    mockApi(() =>
      ok(
        vaultPayload({
          unavailable: [
            { branch: 'Data room', reason: 'The data room store (cre_evidence_sources) is not provisioned in this environment.' },
          ],
        }),
      ),
    );
    render(<Vault {...props()} />);

    const lane = await screen.findByTestId('vault-data-room');
    expect(lane.textContent).toMatch(/could not be served/);
    expect(lane.textContent).toMatch(/not because it is empty/);
    expect(screen.queryByText(/Nothing captured for this project yet/)).toBeNull();
  });

  it('an empty data room says it is empty', async () => {
    mockApi(() =>
      ok(vaultPayload({ dataRoom: { captured: 0, classified: 0, filed: 0, sources: [] } })),
    );
    render(<Vault {...props()} />);
    expect(await screen.findByText(/Nothing captured for this project yet/)).toBeTruthy();
  });

  it('an unavailable branch is said, never silently omitted from the tree', async () => {
    mockApi(() =>
      ok(
        vaultPayload({
          tree: [],
          documentCount: 0,
          unavailable: [
            { branch: 'Uploaded files', reason: 'The vault document store (vault.documents) is not provisioned in this environment.' },
          ],
        }),
      ),
    );
    render(<Vault {...props()} />);
    expect(
      await screen.findByText(/Uploaded files: The vault document store/),
    ).toBeTruthy();
  });
});

describe('Vault — filing decisions are governed commits, not local patches', () => {
  it('confirming a suggested filing POSTs to /file and re-reads the tree', async () => {
    let reads = 0;
    let filedBody: unknown = null;
    mockApi(
      () => {
        reads += 1;
        return ok(vaultPayload());
      },
      (body) => {
        filedBody = body;
        return ok({
          success: true,
          filing: {
            folderId: 'module-3', folderLabel: 'Module 3 · Quality',
            placementStatus: 'confirmed', confidence: null,
            rationale: 'Suggested filing confirmed.', needsReview: false,
          },
        });
      },
    );
    render(<Vault {...props()} />);

    // The upload is auto-selected (first doc); its filing block renders the
    // classifier's suggestion with its rationale.
    const block = await screen.findByTestId('vault-filing-block');
    expect(block.textContent).toMatch(/Module 3 · Quality/);
    expect(block.textContent).toMatch(/CTD pattern "Stability"/);

    const before = reads;
    fireEvent.click(screen.getByTestId('vault-confirm-filing'));

    await waitFor(() => expect(filedBody).toBeTruthy());
    expect(filedBody).toMatchObject({ documentId: DOC_ID, confirm: true });
    // The tree is re-read from the server — what the Vault shows is what it stored.
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    expect(await screen.findByText(/Filed to Module 3 · Quality/)).toBeTruthy();
  });

  it('a rejected filing (expired session) is reported as refused, never as recorded', async () => {
    /* apiRequest does not reject on 401, so a refused filing RETURNS here rather
       than throwing into the catch. Before the fix the handler skipped res.ok
       and landed on the tone:'ok' branch, telling the user the placement was
       "Recorded in the audit trail" — a Part 11 claim on a write that never
       happened. The fix guards res.ok and reports the refusal. */
    let reads = 0;
    let filed = false;
    mockApi(
      () => {
        reads += 1;
        return ok(vaultPayload());
      },
      () => {
        filed = true;
        return unauthorized();
      },
    );
    render(<Vault {...props()} />);

    await screen.findByTestId('vault-filing-block');
    const before = reads;
    fireEvent.click(screen.getByTestId('vault-confirm-filing'));

    await waitFor(() => expect(filed).toBe(true));
    const body = () => document.body.textContent ?? '';
    // Never the fabricated success, in any of its wordings.
    await waitFor(() =>
      expect(/Recorded in the audit trail|Filed to|Moved to Unfiled/i.test(body())).toBe(false),
    );
    // It says the filing was refused.
    expect(/was not recorded/i.test(body())).toBe(true);
    // And it does not re-read the tree as if something changed.
    expect(reads).toBe(before);
  });
});
