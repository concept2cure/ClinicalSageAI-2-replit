// @vitest-environment jsdom
/**
 * The CSR document's build section opens on the build the document holds imported sections from, and says so
 * (docs/evidence/D2-CSR/2026-11-12-document-build/). A document takes its imported sections from one build. The
 * section opened on the newest build, so a person could review that build's headings and be refused at the import,
 * after the work. The build list, asked with the document, names the build (server csr-jobs.ts GET /,
 * csr-import-into-document.ts csrBuildOfDocument). The setup repeats csrCardReach.test.tsx in the small.
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
const HASH = (c: string) => c.repeat(64);
const nav = vi.fn();
/** GET /api/csr/jobs/:jobId/headings: three drafts. */
/** What the build list says of this document: a build, none (null), or nothing at all (an older server). */
let documentBuild: unknown = 16;
/** GET /api/csr/jobs?programId&runId&documentId: three complete builds, newest first, and the document's build. */
const buildList = () => ({ ...(documentBuild === undefined ? {} : { documentBuild }), jobs: [18, 17, 16].map(jobId => (
  { jobId, studyId: 'SYN-201-P', status: 'complete', progress: 100, updatedAt: `2026-11-${jobId - 6}T09:00:00Z` })) });
const drafts = [['10.1', 'Disposition of patients', 'b'], ['11.1', 'Data sets analysed', 'c'], ['12.1', 'Extent of exposure', 'd']] as const;
const headingRows = () => drafts.map(([num, label, c]) => ({ num, label, depth: 2, manual: false,
  state: 'draft', contentHash: HASH(c), reviewerId: null, decidedAt: null, reason: null }));
function routes(method: string, path: string) {
  if (path === `/api/submission-orchestrator/runs?programId=${PROGRAM}`) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/csr/study-data?')) return ok({ studyData: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === `/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}&documentId=${CSR_DOC}`) {
    return ok(buildList());
  }
  if (method === 'GET' && /\/api\/csr\/jobs\/\d+\/headings$/.test(path)) return ok({ headings: headingRows() });
  if (/\/narratives\/status$/.test(path)) return ok({ run: null });
  if (/\/narratives$/.test(path)) return ok({ subjects: [] });
  if (/\/assembly$/.test(path)) return ok({ assembly: null });
  return ok({});
}
beforeEach(() => { documentBuild = 16; apiRequest.mockImplementation(async (method: string, path: string) => routes(method, path)); });
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); clearEditorTarget(); });
const card = async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} onNav={nav} />);
  fireEvent.change(await screen.findByLabelText(/Study data/), { target: { value: RUN } });
};

const builds = () => screen.findByLabelText('CSR builds from this study data');
const picker = (region: HTMLElement) => within(region).getByLabelText('CSR build') as HTMLSelectElement;

it('opens on the build this document holds imported sections from, not the newest, and says which it is', async () => {
  await card();
  const region = await builds();
  expect(await within(region).findByText(/CSR build 16 · complete · 100%/)).toBeTruthy();
  expect(picker(region).value).toBe('16');
  expect([...picker(region).options].map(option => option.textContent)).toEqual([
    'CSR build 18 · complete', 'CSR build 17 · complete', 'CSR build 16 · complete · this document’s sections']);
  expect(within(region).getByText('This document’s imported sections come from this build.')).toBeTruthy();
});

it('says, on another build, that its sections cannot be imported into this document, before any review work', async () => {
  await card();
  const region = await builds();
  await within(region).findByText(/CSR build 16 · complete · 100%/);
  fireEvent.change(picker(region), { target: { value: '18' } });
  expect(await within(region).findByText(/CSR build 18 · complete · 100%/)).toBeTruthy();
  expect(within(region).getByRole('note').textContent).toBe(
    'This document holds sections imported from CSR build 16. A document takes its imported sections from one build, so sections approved in build 18 cannot be imported into it.');
  expect(within(region).queryByText('This document’s imported sections come from this build.')).toBeNull();
});

it('opens on the newest build when the document holds no imported section, and says nothing about it', async () => {
  for (const none of [null, undefined]) {
    documentBuild = none;
    await card();
    const region = await builds();
    expect(await within(region).findByText(/CSR build 18 · complete · 100%/)).toBeTruthy();
    expect(within(region).queryByRole('note')).toBeNull();
    expect(within(region).queryByText(/imported sections come from this build/)).toBeNull();
    cleanup();
  }
});

it('refuses a build list whose document build is not a build number, never guessing which build to open', async () => {
  documentBuild = '16';
  await card();
  const region = await builds();
  expect((await within(region).findByRole('alert')).textContent).toMatch(/could not be listed/);
  expect(within(region).queryByText(/CSR build 18/)).toBeNull();
});
