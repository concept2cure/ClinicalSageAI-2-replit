// @vitest-environment jsdom
/**
 * Reach of a CSR build from Submission Center's CSR card (D2/W1, 2026-10-30;
 * docs/evidence/D2-CSR/2026-10-30-csr-card-reach/). Production refuses
 * /api/csr-workflow/board, so the build board is not a launch screen. The card
 * lists the builds bound to the saved run (GET /api/csr/jobs?programId&runId)
 * and carries, for the selected build, the narrative build and the assembly
 * with its placement. No control on the card navigates to the board. Since
 * 2026-10-30 (docs/evidence/D2-CSR/2026-10-30-csr-card-review/) the card also
 * reviews the build's sections against the ICH E3 tree read from
 * GET /api/csr/jobs/:jobId/headings, and imports the approved ones into
 * Authoring through the canonical intake (SourceImportDialog). SYNTHETIC.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../editor/SourceImportDialog', async original => ({ ...(await original<typeof import('../editor/SourceImportDialog')>()),
  SourceImportDialog: ({ programId, programName, source, onOpenDocument }: { programId: string; programName?: string; source: unknown; onOpenDocument?: (id: string, code?: string) => void }) =>
    <div data-testid="csr-import">{JSON.stringify({ programId, programName, source })}
      {onOpenDocument && <button type="button" onClick={() => onOpenDocument('saved-csr-copy', '11.4.1')}>Open confirmed copy</button>}</div> }));
import { OrchestratorRunControls } from '../surfaces/OrchestratorRunControls';
import { StudyDataBuild } from '../editor/StudyDataBuild';
import { BUILD_POLL_MS } from '../surfaces/CsrRunBuilds';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const CSR_DOC = '11111111-2222-4333-8444-000000000009';
const HASH = 'a'.repeat(64);
const receipt = { documentId: '11111111-2222-4333-8444-000000000003', documentTitle: 'SYN source', version: '2', sha256: HASH,
  adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'SYN-201', protocolNumber: 'SYN-201-P',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'SYN Phase 2', protocolNumber: 'SYN-201-P', phase: 'Phase 2', indication: 'Synthetic', sponsor: 'Sponsor',
    investigationalProduct: 'SYN', studyDesign: 'Randomized 1:1', primaryEndpoint: 'Cure',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations']
  .map(key => [key, { title: `${key} table`, headers: ['Measure', 'Result'], rows: [['Randomized', '23']] }]));
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
const BUILDS = `/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}`;
const build = (jobId: number, status = 'complete') => ({ jobId, studyId: 'SYN-201-P', status, progress: status === 'complete' ? 100 : 0, updatedAt: '2026-10-30T09:00:00Z' });
let builds: unknown[] = [];
const HASH_10 = 'b'.repeat(64);
/** GET /api/csr/jobs/:jobId/headings (server csr-headings.ts): the E3 tree with each output's review state. */
const headings = [
  { num: '9', label: 'Investigational plan', depth: 1, manual: false, state: 'not_drafted' },
  { num: '10.1', label: 'Disposition of patients', depth: 2, manual: false, state: 'in_review', contentHash: HASH_10, reviewerId: 5, decidedAt: null, reason: null },
  { num: '11.4.1', label: 'Analysis of efficacy', depth: 3, manual: false, state: 'approved', contentHash: 'c'.repeat(64), reviewerId: 6, decidedAt: '2026-10-30T09:00:00Z', reason: null },
  { num: '12.2', label: 'Adverse events', depth: 2, manual: false, state: 'approved', contentHash: 'd'.repeat(64), reviewerId: 6, decidedAt: '2026-10-30T09:00:00Z', reason: null },
  { num: '14.3.3', label: 'Narratives of deaths, other serious and certain other significant adverse events', depth: 3, manual: true, state: 'in_review', contentHash: 'e'.repeat(64), reviewerId: 5, decidedAt: null, reason: null },
];
const nav = vi.fn();
/** §10.1's saved text, as GET /api/csr/jobs/:jobId/sections?sectionNumber= returns it (csr-jobs.ts). */
const SAVED_10 = '<p>Of 23 randomized participants, 21 completed the study.</p><p>Two withdrew consent.</p>';
let headingRows: unknown[] = headings;

const RUNS_LIST = `/api/submission-orchestrator/runs?programId=${PROGRAM}`;
function routes(method: string, path: string) {
  if (path === RUNS_LIST) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
  if (method === 'GET' && path === '/api/csr/jobs/41/sections?sectionNumber=10.1') {
    return ok({ sections: [{ sectionNumber: '10.1', contentHash: HASH_10, content: SAVED_10 }] });
  }
  return jobRoutes(method, path);
}

function jobRoutes(method: string, path: string) {
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === BUILDS) return ok({ jobs: builds });
  if (method === 'POST' && path === '/api/csr/jobs') { builds = [build(42, 'queued'), ...builds]; return ok({ jobId: 42, status: 'queued' }, 202); }
  if (method === 'GET' && /\/api\/csr\/jobs\/\d+\/headings$/.test(path)) return ok({ headings: headingRows });
  if (method === 'POST' && /\/sections\/[\d.]+\/review$/.test(path)) return ok({ review: { state: 'approved' } });
  if (/\/narratives\/status$/.test(path)) return ok({ run: null });
  if (/\/narratives$/.test(path)) return ok({ subjects: [] });
  if (/\/assembly$/.test(path)) return ok({ assembly: null });
  return ok({});
}

beforeEach(() => { builds = [build(41)]; headingRows = headings; apiRequest.mockImplementation(async (method: string, path: string) => routes(method, path)); });
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); clearEditorTarget(); });
/* 2026-10-31 (CLAUDE.md RULE 4): the build lives in the CSR document's editor, not on Submission Center's card.
   These cases are the card's, moved: mount the editor's build and choose the study data. Here it is an earlier
   package run's, which stays reachable; a document's own frozen study data is studyDataSource.test.tsx. */
const card = async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} onNav={nav} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
};

it('Submission Center carries no CSR build and no study data: both are the CSR document’s, in the editor', async () => {
  render(<OrchestratorRunControls programId={PROGRAM} sequenceId={7} run={null} selectedRunId={null} onLoad={vi.fn()} onBusyChange={() => {}} onNav={nav} />);
  expect(await screen.findByRole('button', { name: 'Build package run' })).toBeTruthy();
  expect(screen.queryByLabelText('CSR builds from this study data')).toBeNull();
  expect(screen.queryByRole('button', { name: /Build CSR draft/ })).toBeNull();
  expect(screen.queryByLabelText('Clinical source')).toBeNull();
  expect(screen.queryByText(/Clinical source tables/)).toBeNull();
});

it('carries the narrative build and the assembly for a build of the saved run, in the CSR document’s editor', async () => {
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect(await within(region).findByLabelText('Patient safety narratives')).toBeTruthy();
  expect(within(region).getByLabelText('CSR assembly')).toBeTruthy();
  expect(within(region).getByRole('button', { name: /Build narratives/ })).toBeTruthy();
  expect(await within(region).findByRole('button', { name: /Assemble CSR files/ })).toBeTruthy();
  // §14.3.3's review state comes from the build's own headings, not the board.
  expect(await within(region).findByText(/§14\.3\.3 is in review/)).toBeTruthy();
  expect(apiRequest.mock.calls.some(([, p]) => String(p).startsWith('/api/csr-workflow/board'))).toBe(false);
});

it('a newly queued build is selected in the editor; nothing navigates to the board', async () => {
  await card();
  fireEvent.click(await screen.findByRole('button', { name: /Build CSR draft · SYN-201-P/ }));
  await screen.findByText(/CSR build 42 is queued/);
  const region = screen.getByLabelText('CSR builds from this study data');
  expect(await within(region).findByText(/CSR build 42 · queued · 0%/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Open build progress/ })).toBeNull();
  expect(nav).not.toHaveBeenCalledWith('csr-workflow');
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/csr/jobs/42/assembly', undefined));
});

it('states that no build exists for the run, and a refused build list as an alert, never an empty list', async () => {
  builds = [];
  await card();
  expect(await screen.findByText('No CSR build has been started from this study data.')).toBeTruthy();
  cleanup();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === BUILDS) throw refusal(403, { code: 'CSR_PROJECT_ACCESS_DENIED', error: 'The CSR actor does not have access to this project.' });
    return routes(method, path);
  });
  await card();
  const alert = await screen.findByText(/does not have access to this project/);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(screen.queryByText('No CSR build has been started from this study data.')).toBeNull();
});

it('follows a drafting build until it ends, then stops re-reading the list', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    builds = [{ ...build(43, 'drafting'), progress: 40 }];
    await card();
    const region = await screen.findByLabelText('CSR builds from this study data');
    expect(await within(region).findByText(/CSR build 43 · drafting · 40%/)).toBeTruthy();
    builds = [{ ...build(43), updatedAt: '2026-10-30T09:05:00Z' }];
    await act(async () => { await vi.advanceTimersByTimeAsync(BUILD_POLL_MS); });
    expect(await within(region).findByText(/CSR build 43 · complete · 100%/)).toBeTruthy();
    const reads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === BUILDS).length;
    const settled = reads();
    // Three poll intervals, each flushed through React, so a re-read that was scheduled would have run.
    for (let i = 0; i < 3; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(BUILD_POLL_MS); });
    expect(reads()).toBe(settled);
  } finally { vi.useRealTimers(); }
});

it('says why a failed build stopped, as the list states it, and refuses a list whose reason is not text', async () => {
  // F10 of the 2026-11-02 demo walk: the build showed only "CSR build N · failed · NN%".
  const why = 'Not complete: §9.8 still holds a data placeholder (“[…]”) where the study’s data is missing.';
  builds = [{ ...build(44, 'failed'), progress: 15, failure: why }];
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect(await within(region).findByText(/CSR build 44 · failed · 15%/)).toBeTruthy();
  const reason = await within(region).findByText(why);
  expect(reason.getAttribute('role')).toBe('alert');
  cleanup();
  builds = [{ ...build(44, 'failed'), progress: 15, failure: { stack: 'Error: at Pool.query' } }];
  await card();
  expect((await screen.findByText(/The CSR builds of this run could not be listed/)).getAttribute('role')).toBe('alert');
  expect(screen.queryByText(/Pool\.query/)).toBeNull();
});

const headingReads = (jobId: number) => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === `/api/csr/jobs/${jobId}/headings`).length;

it('reviews the selected build section by section, with the ICH E3 labels, and approves against the content hash', async () => {
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  const review = await within(region).findByLabelText('Section review');
  expect(within(review).getByText('4 of 5 ICH E3 headings drafted · 2 approved')).toBeTruthy();
  const row = within(review).getByText('Disposition of patients').closest('li')!;
  // Since 2026-11-03 an approval is of the exact saved text: Approve waits until that text has been read (F9).
  const approve = within(row).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  fireEvent.click(within(row).getByRole('button', { name: 'Read saved section text' }));
  expect((await within(row).findByLabelText('Saved text for §10.1')).textContent)
    .toBe('Of 23 randomized participants, 21 completed the study.\n\nTwo withdrew consent.');
  expect(apiRequest).toHaveBeenCalledWith('GET', '/api/csr/jobs/41/sections?sectionNumber=10.1', undefined);
  expect(approve.disabled).toBe(false);
  const before = headingReads(41);
  fireEvent.click(approve);
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs/41/sections/10.1/review',
    { decision: 'approve', expectedContentHash: HASH_10 }));
  // The decision is re-read from the server, never assumed.
  await vi.waitFor(() => expect(headingReads(41)).toBeGreaterThan(before));
  expect(apiRequest.mock.calls.some(([, p]) => String(p).startsWith('/api/csr-workflow/board'))).toBe(false);
});

/* F6 of the 2026-11-02 demo walk (2026-11-05): the CSR document's own panel imports the approved headings into that
   document, by ICH E3 number (server csr-import-into-document.ts). It no longer opens the working-copy dialog; the
   copy import stays on the csr-workflow board and every other entry point. */
const FP = 'f'.repeat(64);
const into = (preview: boolean, documentId = CSR_DOC) => ok({ success: true, data: { preview, into: { documentId, title: 'SYN-201 Clinical Study Report' },
  fingerprint: FP, origin: { kind: 'csr' }, gaps: ['CSR section 9 is prepared from source outputs and records.'],
  warnings: ['Approval and signatures of the build’s headings are not transferred; this document is reviewed and signed as itself.'],
  sections: [{ code: '11.4.1', title: 'Analysis of efficacy', outcome: preview ? 'will-write' : 'written', placeholder: false },
    { code: '12.2', title: 'Adverse events', outcome: 'edited', placeholder: true }] } });
const imports = () => apiRequest.mock.calls.filter(([m, p]) => m === 'POST' && p === '/api/authoring/import/source');

it('imports exactly the approved sections into this document, with this document as the target, and opens no other document', async () => {
  apiRequest.mockImplementation(async (method: string, path: string, body?: { previewOnly?: boolean }) =>
    method === 'POST' && path === '/api/authoring/import/source' ? into(body?.previewOnly === true) : routes(method, path));
  const changed = vi.fn();
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} onNav={nav} onDocumentChanged={changed} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect(within(region).queryByRole('button', { name: /Import approved sections into Authoring/ })).toBeNull();
  const scrolled = vi.fn();
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = scrolled;
  onTestFinished(() => { Element.prototype.scrollIntoView = scrollIntoView; });
  fireEvent.click(await within(region).findByRole('button', { name: /Import approved sections into this document/ }));
  const panel = await within(region).findByLabelText('Import into this document');
  expect(await within(panel).findByText(/§11\.4\.1 Analysis of efficacy · Will be written/)).toBeTruthy();
  // R-1 (rehearsal 2026-11-05): the panel opens below the section list, so it is brought into view, and the reason
  // field takes focus once the preview is shown; on stage the click had looked as though it did nothing.
  expect(scrolled.mock.contexts).toContain(panel);
  expect(document.activeElement).toBe(within(panel).getByLabelText(/Reason for importing/));
  expect(within(panel).getByText(/§12\.2 Adverse events · Edited here since; not replaced · still holds a data placeholder/)).toBeTruthy();
  const source = { kind: 'csr', jobId: 41, sectionNumbers: ['11.4.1', '12.2'], approvedOnly: true };
  expect(imports()[0][2]).toEqual({ programId: PROGRAM, source, targetDocumentId: CSR_DOC, previewOnly: true });
  const importButton = within(panel).getByRole('button', { name: 'Import into this document' }) as HTMLButtonElement;
  expect(importButton.disabled).toBe(true);
  fireEvent.change(within(panel).getByLabelText(/Reason for importing/), { target: { value: 'Bring the approved headings into this CSR' } });
  fireEvent.click(importButton);
  expect(await within(panel).findByText('Imported. 1 section(s) written into this document.')).toBeTruthy();
  expect(imports()[1][2]).toEqual({ programId: PROGRAM, source, targetDocumentId: CSR_DOC, expectedFingerprint: FP, reason: 'Bring the approved headings into this CSR' });
  expect(changed).toHaveBeenCalledTimes(1);
  // No working copy, no navigation: the document re-reads its own sections in place.
  expect(screen.queryByTestId('csr-import')).toBeNull();
  expect(nav).not.toHaveBeenCalled();
  expect(peekEditorTarget()).toBeFalsy();
});

it('states a refused import by name, and refuses a reply that is not for this document', async () => {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/authoring/import/source') throw refusal(409, { error: 'IMPORT_TARGET_STUDY_DATA_MISMATCH',
      message: 'This build was not drafted from the study data this document froze. Nothing was imported.' });
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(region).findByRole('button', { name: /Import approved sections into this document/ }));
  expect((await within(region).findByText(/not drafted from the study data this document froze/)).getAttribute('role')).toBe('alert');
  expect(within(region).queryByRole('button', { name: 'Import into this document' })).toBeNull();
  cleanup();
  apiRequest.mockImplementation(async (method: string, path: string) =>
    method === 'POST' && path === '/api/authoring/import/source' ? into(true, '11111111-2222-4333-8444-0000000000aa') : routes(method, path));
  await card();
  const other = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(other).findByRole('button', { name: /Import approved sections into this document/ }));
  expect((await within(other).findByText(/What this import would write could not be read/)).getAttribute('role')).toBe('alert');
  expect(within(other).queryByText(/Will be written/)).toBeNull();
});

it('refuses a headings read whose template flag is not a yes or no, never guessing which rows are drafted', async () => {
  headingRows = [...headings, { num: '9.8', label: 'Changes in the conduct of the study', depth: 2, manual: false, state: 'draft',
    placeholder: 'yes', contentHash: 'f'.repeat(64) }];
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect((await within(region).findByText(/The build’s sections could not be read for review/)).closest('[role="alert"]')).toBeTruthy();
  expect(within(region).queryByLabelText('Section review')).toBeNull();
});

it('states a refused headings read as an alert, never an empty review', async () => {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/csr/jobs/41/headings') throw refusal(403, { code: 'CSR_PROJECT_ACCESS_DENIED', error: 'The CSR actor does not have access to this project.' });
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  const alert = await within(region).findByText(/does not have access to this project/);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(within(region).queryByLabelText('Section review')).toBeNull();
  expect(within(region).queryByText(/ICH E3 headings drafted/)).toBeNull();
});
