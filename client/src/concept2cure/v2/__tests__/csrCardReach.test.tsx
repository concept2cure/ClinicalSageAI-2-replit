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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../editor/SourceImportDialog', async original => ({ ...(await original<typeof import('../editor/SourceImportDialog')>()),
  SourceImportDialog: ({ programId, programName, source, onOpenDocument }: { programId: string; programName?: string; source: unknown; onOpenDocument?: (id: string, code?: string) => void }) =>
    <div data-testid="csr-import">{JSON.stringify({ programId, programName, source })}
      {onOpenDocument && <button type="button" onClick={() => onOpenDocument('saved-csr-copy', '11.4.1')}>Open confirmed copy</button>}</div> }));
import { OrchestratorRunControls } from '../surfaces/OrchestratorRunControls';
import { StudyDataBuild } from '../editor/StudyDataBuild';
import { BUILD_POLL_MS, LIVE_POLL_MS } from '../surfaces/CsrRunBuilds';
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
/** True while a test keeps the next read of the headings unanswered. */
let holdHeadings = false;

const RUNS_LIST = `/api/submission-orchestrator/runs?programId=${PROGRAM}`;
function routes(method: string, path: string) {
  if (path === RUNS_LIST) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
  if (method === 'GET' && /^\/api\/csr\/jobs\/\d+\/sections\?sectionNumber=10\.1$/.test(path)) {
    return ok({ sections: [{ sectionNumber: '10.1', contentHash: HASH_10, content: SAVED_10 }] });
  }
  return jobRoutes(method, path);
}

/** The headings, or no answer yet while a test holds the read. */
const headingsReply = () => (holdHeadings ? new Promise(() => undefined) : ok({ headings: headingRows }));

function jobRoutes(method: string, path: string) {
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === BUILDS) return ok({ jobs: builds });
  if (method === 'POST' && path === '/api/csr/jobs') { builds = [build(42, 'queued'), ...builds]; return ok({ jobId: 42, status: 'queued' }, 202); }
  if (method === 'GET' && /\/api\/csr\/jobs\/\d+\/headings$/.test(path)) return headingsReply();
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

// 2026-11-10: a CSR document takes its imported sections from one build, so a build that stopped part-way must be
// resumed, not replaced. The failed build offers it, and the list is read again once the server has taken it.
it('offers to resume a failed build, as that build, and follows it once resumed', async () => {
  builds = [{ ...build(48, 'failed'), progress: 40, failure: 'Drafting was refused by a rate limit for several minutes running.' }];
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/csr/jobs/48/resume') { builds = [{ ...build(48, 'queued'), progress: 40 }]; return ok({ jobId: 48, status: 'queued', resumed: true }, 202); }
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  const resume = await within(region).findByRole('button', { name: 'Resume build 48' });
  expect(within(region).getByText(/drafts the headings that have no saved text and keeps the rest/i)).toBeTruthy();
  fireEvent.click(resume);
  expect(await within(region).findByText(/CSR build 48 · queued · 40%/)).toBeTruthy();
  expect(within(region).queryByRole('button', { name: 'Resume build 48' })).toBeNull();
  expect(apiRequest.mock.calls.filter(([m, p]) => m === 'POST' && p === '/api/csr/jobs').length).toBe(0);
});

/* Reach (R1), 2026-11-11. The server stops a running build (POST /api/csr/jobs/:jobId/cancel) and no screen
   called it: a build started by mistake ran through its 69 headings on the model's account, and the page could only
   watch. A running build offers "Stop build N"; a stopped one says so, keeps its saved headings, and is resumed as
   that build, because the document takes its imported sections from one build. */
it('offers to stop a running build, and shows it stopped with its saved headings kept', async () => {
  builds = [{ ...build(52, 'drafting'), progress: 30 }];
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/csr/jobs/52/cancel') { builds = [{ ...build(52, 'cancelled'), progress: 30 }]; return ok(null, 204); }
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  const stop = await within(region).findByRole('button', { name: 'Stop build 52' });
  expect(within(region).queryByRole('button', { name: /Resume build/ })).toBeNull();
  fireEvent.click(stop);
  expect(await within(region).findByText(/CSR build 52 · stopped · 30%/)).toBeTruthy();
  expect(within(region).getByText(/This build was stopped\. The sections already saved are kept\./)).toBeTruthy();
  expect(within(region).queryByRole('button', { name: 'Stop build 52' })).toBeNull();
  expect(within(region).getByRole('button', { name: 'Resume build 52' })).toBeTruthy();
});

it('a queued build can be stopped too, and a build that has ended offers no stop', async () => {
  builds = [{ ...build(53, 'queued'), progress: 0 }];
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect(await within(region).findByRole('button', { name: 'Stop build 53' })).toBeTruthy();
  cleanup();
  for (const status of ['complete', 'failed', 'cancelled']) {
    builds = [{ ...build(54, status), progress: 100, failure: status === 'failed' ? 'The build stopped.' : null }];
    await card();
    await screen.findByText(/CSR build 54 · /);
    expect(screen.queryByRole('button', { name: /Stop build/ }), status).toBeNull();
    cleanup();
  }
});

it('says so when a build ended before it could be stopped, and reads the builds again', async () => {
  builds = [{ ...build(55, 'drafting'), progress: 99 }];
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/csr/jobs/55/cancel') {
      builds = [{ ...build(55, 'complete'), progress: 100 }];
      throw refusal(409, { error: 'Job is in a terminal state and cannot be cancelled', status: 'complete' });
    }
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(region).findByRole('button', { name: 'Stop build 55' }));
  expect(await within(region).findByText(/CSR build 55 · complete · 100%/)).toBeTruthy();
  expect(within(region).getByText(/had already ended, so there was nothing to stop/i)).toBeTruthy();
});

/* Founder decision P-115, item 5 (2026-11-10): "Every heading holds text. 'Not applicable' is a person's statement
   with a reason, never a default … The editor offers, on a CSR heading, the 'Not applicable because …' act." The
   scientific review refuses a CSR with a blank heading, the build leaves the headings it does not draft to a person,
   and the only way to say one does not apply was to open it and type. The act writes the person's sentence into the
   document's own section, through the editor's save, with their reason for change. */
const DOC_SECTIONS = `/api/authoring/docs/${CSR_DOC}/sections`;
const manualHeadings = [
  ...headings,
  // A heading the build skips because it only holds drafted subsections (§12 over §12.2): not "manual", still blank.
  { num: '12', label: 'Safety evaluation', depth: 1, manual: false, state: 'not_drafted' },
  { num: '15', label: 'Reference list', depth: 1, manual: true, state: 'not_drafted' },
  { num: '16', label: 'Appendices', depth: 1, manual: true, state: 'not_drafted' },
  { num: '16.1.8', label: 'Audit certificates (if available)', depth: 3, manual: true, state: 'not_drafted' },
  { num: '16.1.11', label: 'Publications based on the study', depth: 3, manual: true, state: 'not_drafted' },
];
const docSection = (code: string, content: string) => ({ id: `sec-${code}`, doc_id: CSR_DOC, code, title: code, content, updated_at: '2026-11-11T09:00:00.000Z' });
function withDocument(sections: unknown[], more?: (method: string, path: string, body?: unknown) => unknown) {
  headingRows = manualHeadings;
  apiRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
    const answer = more?.(method, path, body);
    if (answer !== undefined) return answer;
    if (method === 'GET' && path === DOC_SECTIONS) return ok({ success: true, sections });
    return routes(method, path);
  });
}
const notApplicable = async () => {
  const region = await screen.findByRole('group', { name: 'Headings the build does not draft' });
  fireEvent.click(within(region).getByText(/Headings the build does not draft/));
  return region;
};

it('lists the headings the build does not draft that hold no text in the document, and offers "Not applicable because" on each leaf', async () => {
  withDocument([docSection('9', ''), docSection('12', ''), docSection('15', '<p>1. Smith J. A reference.</p>'), docSection('16', ''), docSection('16.1.8', '<p></p>'), docSection('16.1.11', '')]);
  await card();
  const region = await notApplicable();
  expect(await within(region).findByText(/2 headings can be stated not applicable/)).toBeTruthy();
  expect(within(region).getByText(/4 hold no text in this document/)).toBeTruthy();
  // §15 holds text in the document: nothing to state. §12 and §16 hold only their subsections, whether or not the
  // build drafts those: each is named, and neither is offered "not applicable". §9 is the build's own to draft.
  expect(within(region).queryByText('Reference list')).toBeNull();
  expect(within(region).getByText(/12 Safety evaluation, 16 Appendices hold only their subsections/)).toBeTruthy();
  expect(within(region).queryByText(/Investigational plan/)).toBeNull();
  expect(within(region).getByLabelText('Not applicable because, for §16.1.8')).toBeTruthy();
  expect(within(region).getByLabelText('Not applicable because, for §16.1.11')).toBeTruthy();
  expect(within(region).queryByLabelText('Not applicable because, for §16')).toBeNull();
});

it('states a heading not applicable in the document, as the person\'s sentence with their reason, and tells the editor', async () => {
  let sections = [docSection('16.1.8', ''), docSection('16.1.11', '')];
  const saves: Array<{ path: string; body: Record<string, unknown> }> = [];
  const changed = vi.fn();
  withDocument(sections, (method, path, body) => {
    if (method === 'GET' && path === DOC_SECTIONS) return ok({ success: true, sections });
    if (method === 'PATCH' && path === '/api/authoring/sections/sec-16.1.8') {
      saves.push({ path, body: body as Record<string, unknown> });
      sections = [docSection('16.1.8', String((body as { content: string }).content)), docSection('16.1.11', '')];
      return ok({ success: true });
    }
    return undefined;
  });
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} onNav={nav} onDocumentChanged={changed} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
  const region = await notApplicable();
  const reason = await within(region).findByLabelText('Not applicable because, for §16.1.8');
  const state = within(region).getByRole('button', { name: 'State §16.1.8 not applicable in the document' });
  expect((state as HTMLButtonElement).disabled, 'no reason, no statement').toBe(true);
  fireEvent.change(reason, { target: { value: 'no audit was performed for this study <by QA>' } });
  fireEvent.click(state);
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0].body).toEqual({
    content: '<p>Not applicable to this study: no audit was performed for this study &lt;by QA&gt;</p>',
    changeReason: 'Stated not applicable to this study: no audit was performed for this study <by QA>',
    expectedUpdatedAt: '2026-11-11T09:00:00.000Z',
  });
  expect(await within(region).findByText(/1 heading can be stated not applicable/)).toBeTruthy();
  expect(within(region).queryByLabelText('Not applicable because, for §16.1.8')).toBeNull();
  expect(changed).toHaveBeenCalledTimes(1);
});

it('offers the reason already declared for the assembly, and says so when the document refuses the statement', async () => {
  withDocument([docSection('16.1.8', '')], (method, path) => {
    if (method === 'GET' && /\/api\/csr\/jobs\/41\/assembly$/.test(path)) return ok({ assembly: { id: 3, status: 'assembled', progress: 100, stage: null, updatedAt: '2026-11-11T09:00:00Z',
      notApplicable: { '16.1.8': { reason: 'No audit was performed for this study.', declaredBy: 5, declaredAt: '2026-11-11T08:00:00Z' } }, supplied: {}, result: null, error: null, placement: null } });
    if (method === 'PATCH') throw refusal(409, { success: false, error: { code: 'SECTION_CHANGED', message: 'This section was changed by someone else while you were editing.' } });
    return undefined;
  });
  await card();
  const region = await notApplicable();
  const reason = await within(region).findByLabelText('Not applicable because, for §16.1.8') as HTMLInputElement;
  await waitFor(() => expect(reason.value).toBe('No audit was performed for this study.'));
  expect(within(region).getByText(/as declared for the assembled report/i)).toBeTruthy();
  fireEvent.click(within(region).getByRole('button', { name: 'State §16.1.8 not applicable in the document' }));
  expect((await within(region).findByRole('alert')).textContent).toMatch(/changed by someone else/);
  expect(within(region).getByLabelText('Not applicable because, for §16.1.8')).toBeTruthy();
});

it('says why a failed build could not be resumed, and keeps the offer', async () => {
  builds = [{ ...build(49, 'failed'), progress: 10, failure: 'The build stopped.' }];
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/csr/jobs/49/resume') throw refusal(409, { code: 'CSR_BUILD_NOT_RESUMABLE', error: 'This build is complete and cannot be resumed.' });
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(region).findByRole('button', { name: 'Resume build 49' }));
  expect(await within(region).findByText(/cannot be resumed/)).toBeTruthy();
  expect(within(region).getByRole('button', { name: 'Resume build 49' })).toBeTruthy();
});

// The founder, 2026-11-10: "I want to see it happening, or in the background, I want to see that it's progressing,
// and then I want to see the result." A drafting build showed one line, "CSR build N · drafting · 13%", for as long as
// it ran: no heading, no text, and the heading list blinked out each time a heading was saved.
it('shows the heading a build is writing, its text as it is written, how far it is, and keeps the headings on screen', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const writing = { number: '9.1', title: 'Overall Study Design and Plan', text: 'This was a randomized', written: 9, total: 69 };
    builds = [{ ...build(45, 'drafting'), progress: 13, writing }];
    await card();
    const region = await screen.findByLabelText('CSR builds from this study data');
    expect(await within(region).findByText(/Writing §9\.1 Overall Study Design and Plan/)).toBeTruthy();
    expect(within(region).getByText(/9 of 69 headings written/)).toBeTruthy();
    const bar = within(region).getByLabelText('Headings written');
    expect([bar.getAttribute('aria-valuemax'), bar.getAttribute('aria-valuenow')]).toEqual(['69', '9']);
    const live = () => within(region).getByLabelText(/^Text being written for §/).textContent;
    expect(live()).toBe('This was a randomized');
    expect(within(region).getByText(/saved only after every figure in it is checked/i)).toBeTruthy();
    await within(region).findByText('Disposition of patients');
    // A person opens a heading that is already written, to read it while the build goes on.
    fireEvent.click(within(region).getAllByRole('button', { name: 'Read saved section text' })[0]);
    expect((await within(region).findByLabelText('Saved text for §10.1')).textContent).toMatch(/21 completed the study/);

    // The text grows on the next read, which comes sooner than the list's ordinary re-read.
    expect(LIVE_POLL_MS).toBeLessThan(BUILD_POLL_MS);
    builds = [{ ...build(45, 'drafting'), progress: 13, writing: { ...writing, text: 'This was a randomized, double-blind study.' } }];
    await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_POLL_MS); });
    expect(live()).toBe('This was a randomized, double-blind study.');

    // A heading is saved: the next one starts, and the heading list stays while it is read again.
    holdHeadings = true;
    builds = [{ ...build(45, 'drafting'), progress: 14, updatedAt: '2026-10-30T09:01:00Z',
      writing: { number: '9.2', title: 'Discussion of Study Design', text: '', written: 10, total: 69 } }];
    await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_POLL_MS); });
    expect(within(region).getByText(/Writing §9\.2 Discussion of Study Design/)).toBeTruthy();
    expect(within(region).getByText(/10 of 69 headings written/)).toBeTruthy();
    expect(live()).toMatch(/Reading the study’s tables/);
    expect(within(region).queryByText('Reading the build’s sections…')).toBeNull();
    expect(within(region).getByText('Disposition of patients')).toBeTruthy();
    // The heading the person opened is still open: the list was not taken down and put back.
    expect(within(region).getByLabelText('Saved text for §10.1').textContent).toMatch(/21 completed the study/);
  } finally { holdHeadings = false; vi.useRealTimers(); }
});

it('shows no live writing for a build that is not drafting, and refuses a list whose live writing is malformed', async () => {
  builds = [build(46)];
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect(await within(region).findByText(/CSR build 46 · complete · 100%/)).toBeTruthy();
  expect(within(region).queryByLabelText('Headings written')).toBeNull();
  cleanup();
  builds = [{ ...build(47, 'drafting'), writing: { number: '9.1', title: 'Design', text: 7, written: 1, total: 69 } }];
  await card();
  expect(await screen.findByText(/could not be listed/)).toBeTruthy();
});

it.each([
  ['a build a provider refusal stopped', 'The AI provider refused this deployment’s API key, so nothing more was drafted. An administrator must set a valid key. The build stopped at §9.1. The sections already saved are kept.', 'stopped'],
  ['a build that ran to its end with a heading left unwritten', 'Not complete: §12.5 has no saved text. The sections already saved are kept. The draft of §12.5 was not written, because its study tables hold no results, so it was not saved.', 'not complete'],
  ['a build that stopped for a reason it does not name', 'The build could not read its study data.', 'failed'],
])('names the state of %s in words that fit it', async (_name, failure, word) => {
  builds = [{ ...build(51, 'failed'), progress: 98, failure }];
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  expect(await within(region).findByText(new RegExp(`CSR build 51 · ${word} · 98%`))).toBeTruthy();
  expect((await within(region).findByText(failure)).getAttribute('role')).toBe('alert');
  // Whatever the word, the build can still be resumed: the server's recorded state is unchanged.
  expect(within(region).getByRole('button', { name: /Resume build 51/ })).toBeTruthy();
});

it('says why a failed build stopped, as the list states it, and refuses a list whose reason is not text', async () => {
  // F10 of the 2026-11-02 demo walk: the build showed only "CSR build N · failed · NN%".
  const why = 'Not complete: §9.8 still holds a data placeholder (“[…]”) where the study’s data is missing.';
  builds = [{ ...build(44, 'failed'), progress: 15, failure: why }];
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  // Showcase walk, 2026-11-10: "failed · 98%" stood beside a build that had drafted 68 of its 69 headings and left one
  // with no study table. A build that ran to its end and is not complete says so.
  expect(await within(region).findByText(/CSR build 44 · not complete · 15%/)).toBeTruthy();
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

it.each([
  ['IMPORT_TARGET_BOUND_TO_OTHER_BUILD', 'preview'], ['IMPORT_TARGET_STUDY_DATA_MISMATCH', 'preview'],
  ['IMPORT_TARGET_BOUND_TO_OTHER_BUILD', 'write'], ['IMPORT_TARGET_STUDY_DATA_MISMATCH', 'write'],
])(
  'explains the existing new-CSR path after %s at %s, while collaborators keep this CSR', async (code, stage) => {
    const original = code === 'IMPORT_TARGET_BOUND_TO_OTHER_BUILD'
      ? 'This document holds sections imported from CSR build 40. Nothing was imported.'
      : 'This build was not drafted from the study data this document froze. Nothing was imported.';
    apiRequest.mockImplementation(async (method: string, path: string, body?: { previewOnly?: boolean }) => {
      if (method === 'POST' && path === '/api/authoring/import/source') {
        if (stage === 'write' && body?.previewOnly === true) return into(true);
        throw refusal(409, { error: code, message: original });
      }
      return routes(method, path);
    });
    await card();
    const region = await screen.findByLabelText('CSR builds from this study data');
    fireEvent.click(await within(region).findByRole('button', { name: /Import approved sections into this document/ }));
    const panel = await within(region).findByLabelText('Import into this document');
    if (stage === 'write') {
      fireEvent.change(await within(panel).findByLabelText(/Reason for importing/), { target: { value: 'Import the approved headings from this saved cut' } });
      fireEvent.click(within(panel).getByRole('button', { name: 'Import into this document' }));
    }
    const alert = await within(panel).findByRole('alert');
    expect(alert.textContent).toBe(`${original} For a different data cut, go to Project → New document → Clinical Study Report. ` +
      'Freeze that cut for the new document, then build and import there. Collaborators should open this existing CSR.');
    if (stage === 'preview') expect(within(panel).queryByRole('button', { name: 'Import into this document' })).toBeNull();
    expect(screen.queryByTestId('csr-import')).toBeNull();
    expect(imports()).toHaveLength(stage === 'preview' ? 1 : 2);
    expect(imports()[0][2]).toMatchObject({ targetDocumentId: CSR_DOC, previewOnly: true });
    expect(imports().every(([, , body]) => body.targetDocumentId === CSR_DOC)).toBe(true);
    expect(nav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeFalsy();
  },
);

it('does not offer another CSR as recovery for an access refusal', async () => {
  const original = 'You cannot edit this document with your current permissions. Nothing was imported.';
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/authoring/import/source') throw refusal(403, { error: 'IMPORT_TARGET_PERMISSION_DENIED', message: original });
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(region).findByRole('button', { name: /Import approved sections into this document/ }));
  const panel = await within(region).findByLabelText('Import into this document');
  expect((await within(panel).findByRole('alert')).textContent).toBe(original);
  expect(within(panel).queryByText(/Project → New document/)).toBeNull();
  expect(imports()).toHaveLength(1);
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
