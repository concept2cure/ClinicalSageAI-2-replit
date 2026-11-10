// @vitest-environment jsdom
/**
 * CSR slice 3: "Build CSR draft" sits on the CSR card only when a saved run
 * holds retained tables, binds that run, and shows a server refusal as stated;
 * the board's section review records decisions and imports the approved set.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { StudyDataBuild } from '../editor/StudyDataBuild';
import { CsrHeadingReview, type CsrBoardHeading } from '../surfaces/CsrBuildProgress';
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { publishShellProject } from '../shellProject';
import { getSurface } from '@shared/constants/ui-surface-registry';
vi.mock('../clinicalRegulatoryGraphFlag', () => ({ isClinicalRegulatoryGraphEnabled: () => false }));

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const HASH = 'a'.repeat(64);
const receipt = { documentId: '11111111-2222-4333-8444-000000000003', documentTitle: 'LMN-201 source', version: '2', sha256: HASH,
  adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'LMN-201-201', protocolNumber: 'NCT05330182',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'LMN-201 Phase 2/3', protocolNumber: 'NCT05330182', phase: 'Phase 2/3', indication: 'Recurrent CDI', sponsor: 'Sponsor',
    investigationalProduct: 'LMN-201', studyDesign: 'Randomized 1:1', primaryEndpoint: 'Global cure',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations']
  .map(key => [key, { title: `${key} table`, headers: ['Measure', 'Result'], rows: [['Randomized', '23']] }]));
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
let studies: unknown[] = [{ source: receipt, tables }];
/* The editor's study-data section also mounts the pivotal declarations and the build list. A test that asserts the
   one alert a failed read raises answers those reads healthily, so any other alert on the page is a real one. */
const healthyNeighbours = (path: string) => (path.startsWith('/api/csr-workflow/pivotal?') ? ok({ projectId: 1, studies: [] })
  : path.startsWith('/api/csr/jobs?') ? ok({ jobs: [] }) : null);
const nav = vi.fn();
/* The study's pivotal declarations sit with its data in the editor (StudyPivotalDeclarations, since 2026-10-31), and
   a read it cannot parse is an alert of its own. Every mock below answers it, so the alert a case finds is its own. */
const PIVOTAL = '/api/csr-workflow/pivotal?';
const pivotal = () => ok({ projectId: 7, studies: [] });

beforeEach(() => {
  studies = [{ source: receipt, tables }];
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
    if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
    if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
    if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies });
    if (path === '/api/csr/jobs') return ok({ jobId: 41, status: 'queued' }, 202);
    if (path.startsWith(PIVOTAL)) return pivotal();
    return ok({});
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); });
/* The build is in the CSR document's editor since 2026-10-31 (CLAUDE.md RULE 4): mount it and choose the study
   data, here an earlier package run's (the same id field as a document's own frozen study data). */
const card = async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId="11111111-2222-4333-8444-000000000009" onNav={nav} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
};

it('offers "Build CSR draft" only for a saved run that holds retained tables, and binds that run', async () => {
  await card();
  const button = await screen.findByRole('button', { name: /Build CSR draft · NCT05330182/ });
  fireEvent.click(button);
  await screen.findByText(/CSR build 41 is queued/);
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs', {
    programId: PROGRAM, studyInfo: receipt.studyInfo, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' },
  });
  // The board is refused in production (2026-10-30): the queued build is reached in the editor, not by navigation.
  expect(screen.queryByRole('button', { name: /Open build progress/ })).toBeNull();
  expect(nav).not.toHaveBeenCalledWith('csr-workflow');
});

it('renders no build control for a run with no retained tables', async () => {
  studies = [];
  await card();
  await screen.findByText(/This earlier package run holds no study data\./);
  expect(screen.queryByRole('button', { name: /Build CSR draft/ })).toBeNull();
});

it('shows the server refusal as stated, never a silent empty or a queued build', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
    if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies });
    if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
    if (path === '/api/csr/jobs') throw refusal(404, { code: 'CSR_RUN_INPUTS_NOT_FOUND',
      error: 'This saved run has no retained source inputs in the selected project. No job was created.' });
    return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  });
  await card();
  fireEvent.click(await screen.findByRole('button', { name: /Build CSR draft/ }));
  const alert = await screen.findByText(/no retained source inputs in the selected project\. No job was created\./);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(screen.queryByText(/is queued/)).toBeNull();
});

it('does not block the document CSR source picker when optional package-run history is unavailable', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    const neighbour = healthyNeighbours(path);
    if (neighbour) return neighbour;
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) {
      throw refusal(503, { code: 'PACKAGE_HISTORY_UNAVAILABLE',
        message: 'Submission-package history is unavailable.' });
    }
    if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
    if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1',
      limitReached: false, sources: [] });
    if (path.startsWith(PIVOTAL)) return pivotal();
    return ok({});
  });
  render(<StudyDataBuild programId={PROGRAM} documentId="11111111-2222-4333-8444-000000000009" />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/Earlier submission-package history is unavailable/);
  expect(screen.getByText(/Choose the study’s clinical source in this project’s Vault/)).toBeTruthy();
  expect(apiRequest.mock.calls.some(([, path]) => String(path).includes('/csr/sources?'))).toBe(true);
  expect(screen.queryByText(/Reading this document’s study data/)).toBeNull();
});

it('permits retained document study data to build even when older package-run history fails', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    const neighbour = healthyNeighbours(path);
    if (neighbour) return neighbour;
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) throw new Error('Package history read failed');
    if (path.includes('/csr/study-data?')) return ok({ studyData: [{
      studyDataId: RUN, createdAt: '2026-11-02T08:00:00Z', sources: [receipt],
    }] });
    if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM,
      historical: true, studies: [{ source: receipt, tables }] });
    if (path === '/api/csr/jobs') return ok({ jobId: 42, status: 'queued' }, 202);
    if (path.startsWith(PIVOTAL)) return pivotal();
    return ok({});
  });
  render(<StudyDataBuild programId={PROGRAM} documentId="11111111-2222-4333-8444-000000000009" />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/Earlier submission-package history is unavailable/);
  const build = await screen.findByRole('button', { name: /Build CSR draft · NCT05330182/ });
  fireEvent.click(build);
  await screen.findByText(/CSR build 42 is queued/);
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs', {
    programId: PROGRAM, studyInfo: receipt.studyInfo,
    evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' },
  });
});

it('keeps the existing frozen CSR build accessible while a newer source is being selected', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [] });
    if (path.includes('/csr/study-data?')) return ok({ studyData: [{
      studyDataId: RUN, createdAt: '2026-11-02T08:00:00Z', sources: [receipt],
    }] });
    if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM,
      historical: true, studies: [{ source: receipt, tables }] });
    if (path.includes('/csr/sources?')) return ok({
      format: 'concept2cure.csr-source.v1', limitReached: false, sources: [],
    });
    if (path.startsWith('/api/csr/jobs?')) return ok({ jobs: [] });
    return ok({});
  });
  render(<StudyDataBuild programId={PROGRAM} documentId="11111111-2222-4333-8444-000000000009" />);
  await screen.findByRole('button', { name: /Build CSR draft/ });
  fireEvent.click(screen.getByRole('button', { name: 'Freeze newer study data' }));
  expect(screen.getByRole('button', { name: /Build CSR draft/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Return to current frozen study data and CSR build/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Return to current frozen study data and CSR build/ }));
  expect(screen.getByRole('button', { name: 'Freeze newer study data' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Build CSR draft/ })).toBeTruthy();
});

it('tells the user when package history is malformed instead of pretending there are no runs', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    const neighbour = healthyNeighbours(path);
    if (neighbour) return neighbour;
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: null });
    if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
    if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1',
      limitReached: false, sources: [] });
    if (path.startsWith(PIVOTAL)) return pivotal();
    return ok({});
  });
  render(<StudyDataBuild programId={PROGRAM} documentId="11111111-2222-4333-8444-000000000009" />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete response/);
  expect(screen.getByText(/Choose the study’s clinical source in this project’s Vault/)).toBeTruthy();
});

it('does not expose the source picker after the document study-data read itself fails', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    const neighbour = healthyNeighbours(path);
    if (neighbour) return neighbour;
    if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [] });
    if (path.includes('/csr/study-data?')) throw refusal(503, { code: 'CSR_DATA_UNAVAILABLE',
      message: 'Current document study data could not be read.' });
    if (path.startsWith(PIVOTAL)) return pivotal();
    return ok({});
  });
  render(<StudyDataBuild programId={PROGRAM} documentId="11111111-2222-4333-8444-000000000009" />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/Current document study data could not be read/);
  expect(screen.queryByText(/Choose the study’s clinical source in this project’s Vault/)).toBeNull();
});

const headings: CsrBoardHeading[] = [
  { num: '11', label: 'Efficacy evaluation', depth: 1, manual: false, state: 'not_drafted' },
  { num: '11.4.1', label: 'Analysis of efficacy', depth: 3, manual: false, state: 'in_review', contentHash: HASH, reviewerId: 5 },
  { num: '10.1', label: 'Disposition of patients', depth: 2, manual: false, state: 'approved', contentHash: 'b'.repeat(64), reviewerId: 6 },
  { num: '16.1.1', label: 'Protocol and amendments', depth: 3, manual: true, state: 'not_drafted' },
];

it('does not offer review, inspection or import for a section whose saved bytes failed SHA-256', () => {
  const onImport = vi.fn();
  const bad: CsrBoardHeading = {
    num: '12.3', label: 'Safety outcomes', depth: 2, manual: false,
    state: 'draft', integrityFailure: true, contentHash: HASH,
  };
  const good: CsrBoardHeading = {
    num: '10.1', label: 'Verified disposition', depth: 2, manual: false,
    state: 'approved', contentHash: 'b'.repeat(64),
  };
  render(<CsrHeadingReview jobId={41} headings={[bad, good]}
    onChanged={vi.fn()} onImport={onImport} />);
  const damaged = screen.getByText('Safety outcomes').closest('li')!;
  expect(within(damaged).getByText('Saved text integrity failed')).toBeTruthy();
  expect(within(damaged).getByRole('alert').textContent).toMatch(/review and import are blocked/i);
  const submit = within(damaged).getByRole('button', { name: 'Send for review' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(within(damaged).queryByRole('button', { name: 'Read saved section text' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Import approved sections into Authoring/ }));
  expect(onImport).toHaveBeenCalledWith(['10.1']);
  expect(apiRequest).not.toHaveBeenCalled();
});

it('excludes a corrupted record from approved-section imports even if it falsely carries an approved state', () => {
  const onImport = vi.fn();
  const damaged: CsrBoardHeading = {
    num: '11.4.1', label: 'Damaged efficacy', depth: 3, manual: false,
    state: 'approved', integrityFailure: true, contentHash: HASH,
  };
  render(<CsrHeadingReview jobId={41} headings={[damaged]}
    onChanged={vi.fn()} onImport={onImport} />);
  const importButton = screen.getByRole('button', { name: /Import approved sections into Authoring/ }) as HTMLButtonElement;
  expect(importButton.disabled).toBe(true);
  fireEvent.click(importButton);
  expect(onImport).not.toHaveBeenCalled();
});

it('records a review decision on the exact text, and shows a refused decision', async () => {
  const changed = vi.fn();
  const onImport = vi.fn();
  render(<CsrHeadingReview jobId={41} headings={headings} onChanged={changed} onImport={onImport} />);
  expect(screen.getByText('2 of 4 ICH E3 headings drafted · 1 approved')).toBeTruthy();
  expect(screen.getByText('Prepared from records, not drafted by the build')).toBeTruthy();
  const approve = screen.getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  apiRequest.mockResolvedValueOnce(ok({ sections: [{
    sectionNumber: '11.4.1', contentHash: HASH,
    content: '<p>The verified Week-12 comparison was reviewed against the retained source table.</p>',
  }] }));
  fireEvent.click(within(screen.getByText('Analysis of efficacy').closest('li')!).getByRole('button', { name: 'Read saved section text' }));
  await screen.findByLabelText('Saved text for §11.4.1');
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs/41/sections/11.4.1/review', { decision: 'approve', expectedContentHash: HASH });
  apiRequest.mockRejectedValueOnce(refusal(409, { code: 'CSR_REVIEWER_IS_REQUESTER',
    error: 'The person who requested this build cannot approve its sections. Ask another reviewer.' }));
  fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/cannot approve its sections/);
  fireEvent.click(screen.getByRole('button', { name: /Import approved sections/ }));
  expect(onImport).toHaveBeenCalledWith(['10.1']);
});

it('reads a template row as template text with data missing: not drafted, not counted, not offered for review', () => {
  // F2 of the 2026-11-02 demo walk: "18 of 119 … drafted" and "Draft · Send for review" on template rows whose saved
  // text still held "[…]" placeholders (the server's `placeholder`, csr-headings.ts, CSR_DATA_PLACEHOLDER).
  const template: CsrBoardHeading = { num: '9.8', label: 'Changes in the conduct of the study or planned analyses', depth: 2,
    manual: false, state: 'draft', placeholder: true, contentHash: 'd'.repeat(64) };
  const queued: CsrBoardHeading = { num: '5.1', label: 'Independent ethics committee', depth: 2,
    manual: false, state: 'in_review', placeholder: true, contentHash: 'e'.repeat(64) };
  const drafted: CsrBoardHeading = { num: '10.1', label: 'Disposition of patients', depth: 2, manual: false, state: 'draft', contentHash: 'b'.repeat(64) };
  const approved: CsrBoardHeading = { num: '11.4.1', label: 'Analysis of efficacy', depth: 3, manual: false, state: 'approved', contentHash: HASH };
  render(<CsrHeadingReview jobId={41} headings={[template, queued, drafted, approved]} onChanged={vi.fn()} onImport={vi.fn()} />);
  expect(screen.getByText('2 of 4 ICH E3 headings drafted · 2 are template text with data missing · 1 approved')).toBeTruthy();
  for (const label of ['Changes in the conduct of the study or planned analyses', 'Independent ethics committee']) {
    const row = screen.getByText(label).closest('li')!;
    expect(within(row).getByText('Template · data missing')).toBeTruthy();
    expect(within(row).queryByText('Draft')).toBeNull();
    expect(within(row).getByText(/the study’s data is still missing, so it is not offered for review/)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /Send for review/ })).toBeNull();
    expect(within(row).queryByRole('button', { name: /Approve/ })).toBeNull();
    // Its text can still be read.
    expect(within(row).getByRole('button', { name: 'Read saved section text' })).toBeTruthy();
  }
  // One sent for review before the rule can still be sent back.
  expect(within(screen.getByText('Independent ethics committee').closest('li')!).getByRole('button', { name: /Send back/ })).toBeTruthy();
  const draftRow = screen.getByText('Disposition of patients').closest('li')!;
  expect(within(draftRow).getByText('Draft')).toBeTruthy();
  expect((within(draftRow).getByRole('button', { name: /Send for review/ }) as HTMLButtonElement).disabled).toBe(false);
});

it('shows the saved text as saved, with its lines and paragraphs, before an approval', async () => {
  // F9: the approver reads the heading's exact saved text. The read kept the words but ran every line together.
  render(<CsrHeadingReview jobId={41} headings={headings} onChanged={vi.fn()} onImport={vi.fn()} />);
  apiRequest.mockResolvedValueOnce(ok({ sections: [{ sectionNumber: '11.4.1', contentHash: HASH,
    content: 'The secondary objectives were:\n1. To evaluate cure\n2. To evaluate recurrence\n\n<p>The sponsor&#8217;s table: AE rate &amp;lt;5%.</p><p>Second   paragraph.</p>' }] }));
  fireEvent.click(within(screen.getByText('Analysis of efficacy').closest('li')!).getByRole('button', { name: 'Read saved section text' }));
  const text = await screen.findByLabelText('Saved text for §11.4.1');
  expect(text.textContent).toBe('The secondary objectives were:\n1. To evaluate cure\n2. To evaluate recurrence\n\n'
    + 'The sponsor’s table: AE rate &lt;5%.\n\nSecond paragraph.');
});

it('requires a stated reason to send a section back', async () => {
  render(<CsrHeadingReview jobId={41} headings={headings} onChanged={() => {}} onImport={() => {}} />);
  const row = screen.getByText('Disposition of patients').closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: /Send back/ }));
  const record = within(row).getByRole('button', { name: 'Record send-back' }) as HTMLButtonElement;
  expect(record.disabled).toBe(true);
  fireEvent.change(within(row).getByLabelText(/Reason for sending §10.1 back/), { target: { value: 'Death count differs from FDA review.' } });
  fireEvent.click(record);
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs/41/sections/10.1/review',
    { decision: 'send_back', expectedContentHash: 'b'.repeat(64), reason: 'Death count differs from FDA review.' }));
});

it('the csr-workflow board shows the build headings with review state and re-reads after a decision', async () => {
  const board = { success: true, data: { program: { title: 'LMN-201 Phase 2/3', code: 'ICH E3', readiness: 100 },
    sections: [{ num: '11', label: 'Efficacy evaluation', status: 'draft' }], headings, meta: { jobId: 41, sourceRunId: RUN } } };
  apiRequest.mockImplementation(async (method: string, path: string) =>
    method === 'GET' && path.includes('/sections?sectionNumber=') ? ok({ sections: [{
      sectionNumber: '11.4.1', contentHash: HASH, content: '<p>Review the exact stored clinical result.</p>',
    }] }) : method === 'GET' ? ok(board) : ok({ review: {} }));
  publishShellProject({ id: PROGRAM, title: 'LMN-201' });
  try {
    render(<CsrWorkflow surface={getSurface('csr-workflow')!} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    const region = await screen.findByLabelText('Section review');
    expect(within(region).getByText('In review')).toBeTruthy();
    const approve = within(region).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    const reviewRow = within(region).getByText('Analysis of efficacy').closest('li')!;
    fireEvent.click(within(reviewRow).getByRole('button', { name: 'Read saved section text' }));
    await screen.findByLabelText('Saved text for §11.4.1');
    fireEvent.click(approve);
    await vi.waitFor(() => expect(apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && String(p).startsWith('/api/csr-workflow/board')).length).toBe(2));
  } finally { publishShellProject({ id: '' }); }
});

it('refuses to approve when the section read is missing or its hash has changed', async () => {
  render(<CsrHeadingReview jobId={41} headings={headings} onChanged={() => {}} onImport={() => {}} />);
  const row = screen.getByText('Analysis of efficacy').closest('li')!;
  const approve = within(row).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
  apiRequest.mockResolvedValueOnce(ok({ sections: [{
    sectionNumber: '11.4.1', contentHash: 'c'.repeat(64), content: 'Another version',
  }] }));
  fireEvent.click(within(row).getByRole('button', { name: 'Read saved section text' }));
  expect((await within(row).findByRole('alert')).textContent).toMatch(/content hash changed/);
  expect(approve.disabled).toBe(true);
  expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
});
