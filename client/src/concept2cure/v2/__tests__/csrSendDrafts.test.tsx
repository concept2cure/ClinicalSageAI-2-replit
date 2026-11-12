// @vitest-environment jsdom
/**
 * Every draft of a CSR build sent for review in one act, in the CSR document's "Build from the study's data"
 * (docs/evidence/D2-CSR/2026-11-12-send-drafts-for-review/). The act itself is pinned on the bare component in
 * csrBuildProgress.test.tsx. This file mounts the host, because the host empties and re-reads the list after a
 * review decision, and what the act said must still be on screen afterwards (found in the running app: the 65
 * headings were sent and the line that said so was gone). The setup repeats csrCardReach.test.tsx in the small.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const HASH = (c: string) => c.repeat(64);
const nav = vi.fn();
/** GET /api/csr/jobs/:jobId/headings: three drafts. Once a draft is sent the server reads it back in review. */
let sentForReview: string[] = [];
let refuse: string | null = null;
const drafts = [['10.1', 'Disposition of patients', 'b'], ['11.1', 'Data sets analysed', 'c'], ['12.1', 'Extent of exposure', 'd']] as const;
const headingRows = () => drafts.map(([num, label, c]) => ({ num, label, depth: 2, manual: false,
  state: sentForReview.includes(num) ? 'in_review' : 'draft', contentHash: HASH(c), reviewerId: null, decidedAt: null, reason: null }));
function routes(method: string, path: string) {
  if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === `/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}`) {
    return ok({ jobs: [{ jobId: 41, studyId: 'SYN-201-P', status: 'complete', progress: 100, updatedAt: '2026-10-30T09:00:00Z' }] });
  }
  if (method === 'GET' && /\/api\/csr\/jobs\/\d+\/headings$/.test(path)) return ok({ headings: headingRows() });
  const review = /\/api\/csr\/jobs\/41\/sections\/([\d.]+)\/review$/.exec(path);
  if (method === 'POST' && review) {
    if (review[1] === refuse) throw refusal(409, { code: 'CSR_SECTION_CHANGED', error: `CSR section ${review[1]} was redrafted since it was opened. Reload it and review the current text.` });
    sentForReview.push(review[1]);
    return ok({ review: { state: 'in_review' } });
  }
  if (/\/narratives\/status$/.test(path)) return ok({ run: null });
  if (/\/narratives$/.test(path)) return ok({ subjects: [] });
  if (/\/assembly$/.test(path)) return ok({ assembly: null });
  return ok({});
}
beforeEach(() => { sentForReview = []; refuse = null; apiRequest.mockImplementation(async (method: string, path: string) => routes(method, path)); });
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); clearEditorTarget(); });
const card = async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} onNav={nav} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
};

it('after every draft is sent, the list is read again and the line that says so is still on screen', async () => {
  await card();
  const builds = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(builds).findByRole('button', { name: 'Send 3 drafts for review' }));
  // The host re-reads the headings: each row now reads in review, and no draft is left to send.
  expect(await within(builds).findAllByText(/In review/)).toHaveLength(3);
  expect(within(builds).queryByRole('button', { name: /drafts for review/ })).toBeNull();
  expect(within(builds).getByText('3 headings were sent for review.').getAttribute('role')).toBe('status');
  expect(sentForReview).toEqual(['10.1', '11.1', '12.1']);
});

it('a refusal part of the way is still on screen after the list is read again, with what was sent and what was not', async () => {
  refuse = '11.1';
  await card();
  const builds = await screen.findByLabelText('CSR builds from this study data');
  fireEvent.click(await within(builds).findByRole('button', { name: 'Send 3 drafts for review' }));
  expect(await within(builds).findAllByText(/In review/)).toHaveLength(1);
  expect(within(builds).getByRole('alert').textContent).toBe('1 of 3 headings was sent for review. §11.1 was not: CSR section 11.1 was redrafted since it was opened. Reload it and review the current text.');
  expect(within(builds).getByRole('button', { name: 'Send 2 drafts for review' })).toBeTruthy();
});
