// @vitest-environment jsdom
/**
 * The Builder places the PROJECT's documents (2026-10-31).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Acting on the dispatch finding "Place a leaf at 3.2.S" opened the Builder's
 * "Place a Co-Author document as a leaf", which listed the organization's
 * Co-Author documents (GET /api/coauthor/documents). A deployment built from
 * the migration set has no coauthor_documents table, so the read answered 500
 * and the form ended in "Couldn't load the Co-Author documents" — and where the
 * table did exist, it offered an org-wide list of copies, not the project's
 * documents.
 *
 * ── What must be true now ────────────────────────────────────────────────────
 *   • the picker reads the project's documents, GET /api/authoring/docs
 *     ?status=all&programId=<the submission's project>, and never the
 *     Co-Author list;
 *   • it says how many it shows (QA 2026-10-08, j6: never a silent cut-off),
 *     and a search narrows it as typed;
 *   • placing takes the document's filing copy from its SAVED sections (the
 *     editor's Place into filing step, placeIntoFilingCopy.ts), then places the
 *     leaf on that copy; a copy that cannot be taken places nothing.
 *
 * Same idiom as submissionCenterLifecycleQa: apiRequest mocked at the module
 * boundary, the Submission Center real.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const PROGRAM = '0a000000-0000-4000-8000-00000000000a';
const SUB = { id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PROGRAM };
const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;

const QUALITY = 'b1000000-0000-4000-8000-0000000000b1';
const DOCS = [
  { id: QUALITY, title: 'Drug substance — quality', module: 'M3', status: 'draft', program_id: PROGRAM },
  { id: 'b2000000-0000-4000-8000-0000000000b2', title: 'Clinical Overview', module: 'M2', status: 'draft', program_id: PROGRAM },
  { id: 'b3000000-0000-4000-8000-0000000000b3', title: 'Protocol Synopsis', module: 'M5', status: 'draft', program_id: PROGRAM },
];
const DOCS_PATH = `/api/authoring/docs?status=all&programId=${encodeURIComponent(PROGRAM)}`;
const SNAPSHOT = 901;
const REASON = 'Drug substance section ready for the original sequence';

type Route = (method: string, url: string, body?: unknown) => Response | undefined;
const LEAF_RECEIPT = { id: 70, sequenceId: 21, sectionCode: '3.2.S', title: 'Drug substance — quality', lifecycleOp: 'new',
  documentTable: 'coauthor_documents', documentId: SNAPSHOT, auditTrail: { persisted: true, chained: true } };
/** The server, as a table of `METHOD path` → answer; the leaves read carries its scope after `?`. */
function routes(subs: unknown[], docs: () => Response): Record<string, () => Response> {
  return {
    'GET /api/submissions': () => ok(subs),
    'GET /api/submissions/7/sequences': () => ok([SEQ]),
    'GET /api/submissions/sequences/21/leaves': () => ok([]),
    [`GET ${DOCS_PATH}`]: docs,
    [`GET /api/authoring/docs/${QUALITY}/sections`]: () =>
      ok({ sections: [{ code: '3.2.S', title: 'Drug substance', content: '<p>Manufacture and characterisation.</p>' }] }),
    'POST /api/coauthor/documents': () =>
      ok({ success: true, written: true, document: { id: SNAPSHOT, status: 'draft', metadata: { source: 'authoring-document', docId: QUALITY } } }, 201),
    'PUT /api/submissions/sequences/21/leaves': () => ok(LEAF_RECEIPT),
    'GET /api/510k/estar/submissions': () => ok({ submissions: [] }),
  };
}
function mockApi({ subs = [SUB] as unknown[], docs = (() => ok({ success: true, documents: DOCS })) as () => Response, extra = (() => undefined) as Route } = {}) {
  const table = routes(subs, docs);
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const path = url.startsWith('/api/submissions/sequences/21/leaves?') ? url.split('?')[0] : url;
    return extra(method, url, body) ?? table[`${method} ${path}`]?.() ?? ok([]);
  });
}
const calls = (method: string, prefix: string) => apiRequest.mock.calls.filter((c) => c[0] === method && String(c[1]).startsWith(prefix));

async function openPicker() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
  fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
  fireEvent.click(await screen.findByRole('button', { name: /Place a project document as a leaf/ }));
}
const optionTitles = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent ?? '');

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('the Builder places the project’s documents', () => {
  it('reads the project’s documents, never the organization’s Co-Author list, and says it shows them all', async () => {
    mockApi();
    await openPicker();
    const select = await screen.findByLabelText('Source document');
    expect(calls('GET', '/api/authoring/docs?').map((c) => c[1])).toContain(DOCS_PATH);
    expect(calls('GET', '/api/coauthor/documents')).toHaveLength(0);
    expect(optionTitles(select)).toEqual(['Choose a document…',
      'Drug substance — quality · M3 · draft', 'Clinical Overview · M2 · draft', 'Protocol Synopsis · M5 · draft']);
    expect(document.body.textContent).toContain('All 3 documents of this project shown.');
  });

  it('searches the project’s list by title or module as typed, and says how many match', async () => {
    mockApi();
    await openPicker();
    const select = await screen.findByLabelText('Source document');
    fireEvent.change(screen.getByLabelText('Find a document'), { target: { value: 'quality' } });
    await waitFor(() => expect(optionTitles(select)).toEqual(['Choose a document…', 'Drug substance — quality · M3 · draft']));
    expect(document.body.textContent).toContain('1 of 3 documents match “quality”.');
  });

  it('a search that matches nothing says so and keeps the search box', async () => {
    mockApi();
    await openPicker();
    await screen.findByLabelText('Source document');
    fireEvent.change(screen.getByLabelText('Find a document'), { target: { value: 'zzz' } });
    await waitFor(() => expect(document.body.textContent).toContain('No document of this project matches “zzz”'));
    expect(screen.getByLabelText('Find a document')).toBeTruthy();
  });

  it('places the document as its filing copy, then the leaf on that copy', async () => {
    mockApi();
    await openPicker();
    fireEvent.change(await screen.findByLabelText('Source document'), { target: { value: QUALITY } });
    fireEvent.change(screen.getByLabelText('Section code'), { target: { value: '3.2.S' } });
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Place leaf in the sequence/ }));

    await waitFor(() => expect(document.body.textContent).toContain('server-confirmed (leaf #70)'));
    expect(calls('POST', '/api/coauthor/documents')[0][2]).toMatchObject({ sourceAuthoringDocId: QUALITY, moduleNumber: '3.2.S', changeReason: REASON });
    expect(calls('PUT', '/api/submissions/sequences/21/leaves')[0][2]).toMatchObject({
      sectionCode: '3.2.S', documentTable: 'coauthor_documents', documentId: SNAPSHOT, reason: REASON, lifecycleOp: 'new',
    });
  });

  it('a filing copy that cannot be taken places nothing, and says why in the server’s words', async () => {
    mockApi({ extra: (method, url) => (method === 'POST' && url === '/api/coauthor/documents'
      ? ok({ error: 'FILING_COPY_STORE_UNAVAILABLE', message: 'Filing copies are not available on this deployment: their store has not been set up. Nothing was read or changed.' }, 503)
      : undefined) });
    await openPicker();
    fireEvent.change(await screen.findByLabelText('Source document'), { target: { value: QUALITY } });
    fireEvent.change(screen.getByLabelText('Section code'), { target: { value: '3.2.S' } });
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Place leaf in the sequence/ }));

    await waitFor(() => expect(document.body.textContent).toMatch(/filing snapshot could not be (created|confirmed)/));
    expect(calls('PUT', '/api/submissions/sequences/21/leaves')).toHaveLength(0);
  });

  it('a failed read says it failed, never an empty project', async () => {
    mockApi({ docs: () => ok({ success: false, error: 'down' }, 500) });
    await openPicker();
    await waitFor(() => expect(document.body.textContent).toContain("Couldn't load the project's documents"));
    expect(screen.queryByLabelText('Source document')).toBeNull();
  });

  it('a project with no documents says so', async () => {
    mockApi({ docs: () => ok({ success: true, documents: [] }) });
    await openPicker();
    await waitFor(() => expect(document.body.textContent).toContain('This project has no documents yet.'));
  });

  it('a submission that is not in a project offers no project documents and reads none', async () => {
    mockApi({ subs: [{ ...SUB, programId: null }] });
    await openPicker();
    await waitFor(() => expect(document.body.textContent).toContain('This submission is not in a project'));
    expect(calls('GET', '/api/authoring/docs')).toHaveLength(0);
  });
});
