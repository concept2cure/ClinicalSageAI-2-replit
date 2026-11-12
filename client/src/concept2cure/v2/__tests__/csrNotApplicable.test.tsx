// @vitest-environment jsdom
/**
 * "Not applicable because …" on a CSR heading the build does not draft, in the CSR document's "Build from the
 * study's data" (docs/evidence/D2-CSR/2026-11-12-heading-not-applicable/). Split out of csrCardReach.test.tsx,
 * whose setup this repeats in the small: the editor's build over an earlier package run's study data. SYNTHETIC.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { StudyDataBuild } from '../editor/StudyDataBuild';
import { clearEditorTarget } from '../editorTarget';

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const CSR_DOC = '11111111-2222-4333-8444-000000000009';
const receipt = { documentId: '11111111-2222-4333-8444-000000000003', documentTitle: 'SYN source', version: '2', sha256: 'a'.repeat(64),
  adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'SYN-201', protocolNumber: 'SYN-201-P',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'SYN Phase 2', protocolNumber: 'SYN-201-P', phase: 'Phase 2', indication: 'Synthetic', sponsor: 'Sponsor',
    investigationalProduct: 'SYN', studyDesign: 'Randomized 1:1', primaryEndpoint: 'Cure',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations']
  .map(key => [key, { title: `${key} table`, headers: ['Measure', 'Result'], rows: [['Randomized', '23']] }]));
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
const nav = vi.fn();
/** GET /api/csr/jobs/:jobId/headings: one heading the build drafts, then the ones it leaves to a person. */
const headings = [
  { num: '9', label: 'Investigational plan', depth: 1, manual: false, state: 'not_drafted' },
  { num: '12.2', label: 'Adverse events', depth: 2, manual: false, state: 'approved', contentHash: 'd'.repeat(64), reviewerId: 6, decidedAt: '2026-10-30T09:00:00Z', reason: null },
];
function routes(method: string, path: string) {
  if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === `/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}&documentId=${CSR_DOC}`) {
    return ok({ jobs: [{ jobId: 41, studyId: 'SYN-201-P', status: 'complete', progress: 100, updatedAt: '2026-10-30T09:00:00Z' }] });
  }
  if (method === 'GET' && /\/api\/csr\/jobs\/\d+\/headings$/.test(path)) return ok({ headings: manualHeadings });
  if (/\/narratives\/status$/.test(path)) return ok({ run: null });
  if (/\/narratives$/.test(path)) return ok({ subjects: [] });
  if (/\/assembly$/.test(path)) return ok({ assembly: null });
  return ok({});
}
beforeEach(() => { apiRequest.mockImplementation(async (method: string, path: string) => routes(method, path)); });
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); clearEditorTarget(); });
const card = async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} onNav={nav} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
};

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
