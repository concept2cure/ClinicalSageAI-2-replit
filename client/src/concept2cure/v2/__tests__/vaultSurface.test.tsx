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
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext } from '../surfaceContext';

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
    // As the server projects an upload: no authoring completion assessed.
    pct: null,
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

/* A suggestion has two possible authors: the ingest classifier, which always
   records its confidence, and AnA, whose place_project_document writes a
   suggestion for a person to confirm (D5, 2026-09-24) and records none. The
   filing block labelled EVERY suggestion "Classifier: …", so AnA's proposal
   would have been shown beside the Confirm button as the classifier's —
   misattributed in the one place a person decides whether to accept it. */
describe('Vault — a suggestion is attributed to whoever made it', () => {
  it("labels the classifier's proposal as the classifier's, with its confidence", async () => {
    mockApi(() => ok(vaultPayload()));
    render(<Vault {...props()} />);
    const block = await screen.findByTestId('vault-filing-block');
    expect(block.textContent).toMatch(/Classifier \(high confidence\): CTD pattern "Stability"/);
  });

  it("does not label AnA's suggestion as the classifier's", async () => {
    const anaDoc = uploadDoc({
      filing: {
        folderId: 'module-3',
        folderLabel: 'Module 3 · Quality',
        evidenceKind: 'report',
        ctdSection: '3.2.P.8',
        placementStatus: 'suggested',
        confidence: null,
        rationale: "AnA's suggestion: the report states a 24-month stability study.",
      },
    });
    mockApi(() => ok(vaultPayload({ tree: cabinetTree([anaDoc]) })));
    render(<Vault {...props()} />);
    const block = await screen.findByTestId('vault-filing-block');
    expect(block.textContent).toMatch(/AnA's suggestion: the report states/);
    expect(block.textContent).not.toMatch(/Classifier/);
    // Still a suggestion a person can confirm.
    expect(screen.getByTestId('vault-confirm-filing')).toBeTruthy();
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

/**
 * Search.
 *
 * The surface had no search input at all — `q` existed and was driven ONLY by
 * AnA's vault.search action, so the assistant could search this screen and the
 * person looking at it could not. What filtering there was ran client-side over
 * the rows the tree happened to deliver: it could not match document CONTENT,
 * and it missed anything the read did not carry.
 *
 * The honesty case is the one that matters. A search that FAILED and a search
 * that found nothing render the same screen unless the surface distinguishes
 * them, and "no documents match your search" is the more believable of the two
 * — which is exactly why it must not be shown for an error.
 */
describe('Vault — search', () => {
  function mockSearch(searchResponse: () => Response) {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith(`/api/c2c/project-vault/${PID}/search`)) return searchResponse();
      if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
      return ok({});
    });
  }

  it('renders a search input the human can actually use', async () => {
    mockSearch(() => ok({ success: true, data: { query: '', total: 0, limit: 100, offset: 0, results: [] } }));
    render(<Vault {...props()} />);
    expect(await screen.findByLabelText('Search this vault')).toBeTruthy();
  });

  it('searches on the server and shows the hits, not a substring filter', async () => {
    mockSearch(() =>
      ok({
        success: true,
        data: {
          query: 'shelf life',
          total: 1,
          limit: 100,
          offset: 0,
          results: [
            {
              id: DOC_ID,
              title: 'Stability Report',
              fileName: 'stability.pdf',
              documentType: 'REPORT',
              size: '1.0 MB',
              folderId: 'module-3',
              ctdSection: '3.2.P.8',
              placementStatus: 'confirmed',
              // A body match: this phrase is in no title anywhere in the tree,
              // so a client-side substring filter could never have found it.
              snippet: 'the <b>shelf life</b> was established at 24 months',
            },
          ],
        },
      }),
    );
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), {
      target: { value: 'shelf life' },
    });

    expect((await screen.findAllByText('Stability Report')).length).toBeGreaterThan(0);
    // The ts_headline markers are stripped — a highlight arriving as literal
    // markup would read as corruption.
    await waitFor(() =>
      expect(document.body.textContent).toContain('the shelf life was established at 24 months'),
    );
    expect(document.body.textContent).not.toContain('<b>');
  });

  it('reports a FAILED search as a failure, never as zero matches', async () => {
    mockSearch(() => ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'SEARCH_FAILED', message: 'nothing was searched' }),
    }) as Response);
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), {
      target: { value: 'stability' },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/not a result of zero matches/i);
  });

  it('says how many of the total are shown when the page is not all of them', async () => {
    mockSearch(() =>
      ok({
        success: true,
        data: {
          query: 'x',
          total: 340,
          limit: 100,
          offset: 0,
          results: [
            {
              id: DOC_ID, title: 'One of many', fileName: 'a.pdf', documentType: 'REPORT',
              size: null, folderId: null, ctdSection: null, placementStatus: 'confirmed', snippet: null,
            },
          ],
        },
      }),
    );
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'x' } });
    // "1 of 340" — implying the page is the whole result set is the failure this
    // avoids.
    await waitFor(() => expect(document.body.textContent).toContain('1 of 340'));
  });
});

/**
 * The filing cabinet is a WINDOW onto the vault, not the vault.
 *
 * The server caps the tree read (the vault is unbounded; the read that renders
 * it used to grow with it). A cap the surface does not mention is worse than
 * the unbounded read it replaced: a reviewer who searches the cabinet, does not
 * find a document, and is shown nothing to suggest the cabinet is partial
 * concludes the document is absent — and in a regulated vault "absent" is a
 * finding. Same contract as the `unavailable` branches: say what is not shown.
 */
describe('Vault — a truncated filing cabinet says so', () => {
  it('states the window and the real total when the server truncated the page', async () => {
    mockApi(() =>
      ok(vaultPayload({ uploadsWindow: { shown: 2000, total: 48213, truncated: true } })),
    );
    render(<Vault {...(props() as any)} />);
    const note = await screen.findByText(/showing the .* most recently updated/i);
    expect(note.textContent).toMatch(/2,000/);
    expect(note.textContent).toMatch(/48,213/);
  });

  it('says nothing when the whole cabinet fits — no note on the common case', async () => {
    mockApi(() =>
      ok(vaultPayload({ uploadsWindow: { shown: 12, total: 12, truncated: false } })),
    );
    render(<Vault {...(props() as any)} />);
    // Anchor on the surface having actually loaded the payload (the spine line
    // comes from it), so "no note" cannot pass merely because nothing rendered.
    await screen.findByText(/IND · 21 CFR 312/);
    expect(screen.queryByText(/most recently updated/i)).toBeNull();
  });

  it('leaves the unfiled queue alone — it is programme-wide, not a page count', async () => {
    // The server counts unfiled over the whole programme precisely so it stays
    // right when the page is capped. The surface must not re-derive or qualify
    // it, or the one number that survived truncation gets caveated into doubt.
    mockApi(() =>
      ok(
        vaultPayload({
          unfiledCount: 137,
          uploadsWindow: { shown: 2000, total: 48213, truncated: true },
        }),
      ),
    );
    render(<Vault {...(props() as any)} />);
    expect(await screen.findByText(/137 unfiled — needs review/i)).toBeTruthy();
  });
});

/**
 * The control that makes filing reachable.
 *
 * The capability landed server-side first — a leaf can name a vault document by
 * uuid and the packager can fetch its bytes — but a capability with no control
 * is not something a customer has. This pins the wiring, and specifically the
 * one thing in it that can silently be wrong: the tree id is `up-<uuid>` and
 * what a leaf must name is the bare uuid. A leaf carrying "up-…" would be
 * refused by the server as a malformed uuid, at the end of a filing session
 * rather than at the click.
 */
describe('Vault — placing a document into a submission', () => {
  const SUBMISSIONS = [
    { id: 4, title: 'BX-301 NDA', applicationType: 'nda', primaryRegion: 'us', status: 'open' },
  ];
  const SEQUENCES = [
    { id: 9, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'us' },
  ];

  function mockWithFiling() {
    const writes: Array<{ method: string; url: string; body: unknown }> = [];
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method !== 'GET') writes.push({ method, url, body });
      if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
      if (url === '/api/submissions' && method === 'GET') return ok(SUBMISSIONS);
      if (url === '/api/submissions/4/sequences' && method === 'GET') return ok(SEQUENCES);
      if (method === 'PUT' && /\/sequences\/\d+\/leaves$/.test(url)) {
        return ok({ id: 77, sectionCode: '3.2.P.8.3', title: 'stability-summary-24m', lifecycleOp: 'new' });
      }
      return ok({});
    });
    return writes;
  }

  it('offers the action on an uploaded document and files it by BARE uuid', async () => {
    const writes = mockWithFiling();
    render(<Vault {...(props() as any)} />);

    // Open the upload, then the dialog.
    fireEvent.click((await screen.findAllByText('stability-summary-24m'))[0]);
    fireEvent.click(await screen.findByRole('button', { name: /place into submission/i }));

    const sub = await screen.findByLabelText('Target submission');
    fireEvent.change(sub, { target: { value: '4' } });
    await screen.findByLabelText('Sequence');
    fireEvent.change(screen.getByLabelText(/^Section code/), { target: { value: '3.2.P.8.3' } });

    // Scoped to the dialog: the trigger button behind it matches the same name,
    // and clicking that one would re-open rather than submit.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^place into submission$/i }));

    await waitFor(() => expect(writes.some((w) => w.method === 'PUT')).toBe(true));
    const put = writes.find((w) => w.method === 'PUT')!;
    const sent = put.body as Record<string, unknown>;
    expect(sent.documentTable).toBe('vault_documents');
    // The tree id is `up-<uuid>`; the leaf must carry the uuid alone.
    expect(sent.documentUuid).toBe(DOC_ID);
    expect(String(sent.documentUuid)).not.toMatch(/^up-/);
  });
});

describe('Vault — what AnA is told about the selected document', () => {
  /* The surface shows no percentage for an upload (there is no authoring
     completion to show), but the context it publishes for AnA carried the
     tree's placeholder 0 as `percentComplete`, so AnA described every uploaded
     file as "0% complete". The server now sends null for an upload; the
     surface also maps an upload to null, because a 0 from a server that has
     not caught up is still not a completion figure. */
  function ContextProbe({ onContext }: { onContext: (c: unknown) => void }) {
    onContext(useActiveSurfaceContext('vault'));
    return null;
  }

  it('an upload has no completion figure — null, not 0% complete', async () => {
    mockApi(() => ok(vaultPayload()));
    let latest: any = null;
    render(
      <>
        <Vault {...props()} />
        <ContextProbe onContext={(c) => { latest = c; }} />
      </>,
    );
    await screen.findByTestId('vault-filing-block');
    await waitFor(() => expect(latest?.facts?.selected?.title).toBe('stability-summary-24m'));
    expect(latest.facts.selected.percentComplete).toBeNull();
  });
});

