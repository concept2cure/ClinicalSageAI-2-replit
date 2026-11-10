// @vitest-environment jsdom
/**
 * The study's data enters a clinical study report from its own document, in the one editor (CLAUDE.md RULE 4,
 * 2026-10-31): choose the clinical source, preview it, and freeze the approved version as the document's study
 * data (editor/StudyDataSource.tsx, editor/StudyDataBuild.tsx). Moved from Submission Center's CSR card
 * (CsrSourceInputControls, deleted), whose checks these are, ported to where the behaviour now lives.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { StudyDataSource } from '../editor/StudyDataSource';
import { StudyDataBuild } from '../editor/StudyDataBuild';
import { OrchestratorRunControls } from '../surfaces/OrchestratorRunControls';

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const SOURCE_DOC = '11111111-2222-4333-8444-000000000003';
const CSR_DOC = '11111111-2222-4333-8444-000000000004';
const FROZEN = '11111111-2222-4333-8444-000000000005';
const HASH = 'a'.repeat(64);
const SOURCE = { documentId: SOURCE_DOC, documentTitle: 'Approved synthetic study source', version: '2', sha256: HASH, approved: true };
const receipt = { ...SOURCE, adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'SYN-001', protocolNumber: 'SYN-P1',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'Synthetic source study', protocolNumber: 'SYN-P1', phase: 'Phase 2', indication: 'Synthetic condition', sponsor: 'Synthetic sponsor',
    investigationalProduct: 'Synthetic product', studyDesign: 'Parallel randomized', primaryEndpoint: 'Recorded endpoint',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations'].map(key => [key, {
  title: `${key} source table`, headers: ['Measure', 'Recorded result'], rows: [['Synthetic measure', '4']],
}]));
const preview = { source: receipt, approved: true, tables };
const list = { format: 'concept2cure.csr-source.v1', limitReached: false, sources: [SOURCE] };
const entry = { studyDataId: FROZEN, createdAt: '2026-10-31T12:00:00.000Z', createdBy: 7, sources: [receipt] };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
let studyData: unknown[] = [];
beforeEach(() => {
  studyData = [];
  apiRequest.mockImplementation(async (method, path) => {
    if (path.includes('/csr/sources?')) return response(list);
    if (path.endsWith('/csr/source-preview')) return response(preview);
    if (path.includes('/csr/study-data?')) return response({ studyData });
    if (method === 'POST' && path.endsWith('/csr/study-data')) { studyData = [entry]; return response(entry, 201); }
    if (path.includes('/clinical-tables?')) return response({ runId: FROZEN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
    if (path.endsWith('/csr/source-contract')) return response({ format: list.format, requiredFields: ['studyInfo', 'participants', 'studyData'], sourceSchema: { type: 'object' } });
    if (path.includes('/runs?')) return response({ runs: [] });
    if (path.startsWith('/api/csr-workflow/pivotal')) return response({ projectId: 11, studies: [] });
    if (path.startsWith('/api/csr/jobs')) return response({ jobs: [] });
    if (path.endsWith('/runs/for-program')) return response({ runId: 'created-run', submissionId: 'submission-1', status: 'awaiting-signature', startedAt: '2026-10-14' });
    return response({});
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); });
const onFrozen = vi.fn();
const sourceProps = { programId: PROGRAM, documentId: CSR_DOC, onFrozen };
async function chooseAndPreview() {
  await screen.findByRole('option', { name: /Approved synthetic study source/ });
  fireEvent.change(screen.getByLabelText('Clinical source'), { target: { value: SOURCE_DOC } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview clinical tables' }));
  await screen.findByLabelText('Clinical table preview');
}

it('previews the exact version and hash, and freezes only on an explicit action, for this document', async () => {
  render(<StudyDataSource {...sourceProps} />);
  await chooseAndPreview();
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/csr/source-preview', { programId: PROGRAM, documentId: SOURCE_DOC, expectedSha256: HASH });
  expect(apiRequest.mock.calls.some(([method, path]) => method === 'POST' && String(path).endsWith('/csr/study-data'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Freeze as this document’s study data' }));
  await waitFor(() => expect(onFrozen).toHaveBeenCalledWith(entry));
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/csr/study-data',
    { programId: PROGRAM, documentId: CSR_DOC, source: { documentId: SOURCE_DOC, expectedSha256: HASH } });
});

it('names the study’s ClinicalTrials.gov number from its source, or says the source states none (D5, 2026-10-29)', async () => {
  render(<StudyDataSource {...sourceProps} />);
  await chooseAndPreview();
  expect(screen.getByText(/SYN-P1 · no ClinicalTrials\.gov number in the source · data cut 2026-10-01/)).toBeTruthy();
  cleanup();
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, body) => path.endsWith('/csr/source-preview')
    ? Promise.resolve(response({ ...preview, source: { ...receipt, studyInfo: { ...receipt.studyInfo, nctNumber: 'NCT05330182' } } }))
    : original(method, path, body));
  render(<StudyDataSource {...sourceProps} />);
  await chooseAndPreview();
  expect(screen.getByText(/SYN-P1 · NCT05330182 · data cut 2026-10-01/)).toBeTruthy();
});

it('keeps an unapproved source preview read-only: it cannot be frozen', async () => {
  apiRequest.mockImplementation(async (_method, path) => response(path.includes('/source-preview')
    ? { ...preview, approved: false, source: { ...receipt, sourceApproval: 'not-approved' } }
    : { ...list, sources: [{ ...SOURCE, approved: false }] }));
  render(<StudyDataSource {...sourceProps} />);
  await chooseAndPreview();
  expect(screen.queryByRole('button', { name: 'Freeze as this document’s study data' })).toBeNull();
  expect(screen.getByText(/Approve this exact source version in the Vault/)).toBeTruthy();
});

it('separates a failed or malformed source list from a confirmed empty one, and retries', async () => {
  let listReads = 0;
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, body) => {
    if (!String(path).includes('/csr/sources?')) return original(method, path, body);
    listReads += 1;
    return Promise.resolve(response(listReads === 1 ? { ...list, sources: [{ ...SOURCE, sha256: 'missing' }] } : { ...list, sources: [], limitReached: true }));
  });
  render(<StudyDataSource {...sourceProps} />);
  await screen.findByRole('alert');
  expect(screen.queryByText(/No clinical source is in this project’s Vault yet/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reload clinical sources' }));
  await screen.findByText(/No clinical source is in this project’s Vault yet/);
  expect(screen.getByText(/source list reached its limit/)).toBeTruthy();
});

/* D2-CSR F5 (2026-11-05): the list offers clinical sources only. The files it could not read are named, so a
   failed read is never shown as an empty list, and the JSON files that are not clinical sources are counted. */
const UNREADABLE = { documentId: '11111111-2222-4333-8444-000000000006', documentTitle: 'cdiscpilot01-adam-bundle', version: '1.0' };
function serveList(body: unknown) {
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, requestBody) => String(path).includes('/csr/sources?')
    ? Promise.resolve(response(body)) : original(method, path, requestBody));
}

it('names a Vault file it could not read beside the sources it offers, and counts the JSON files that are not sources', async () => {
  serveList({ ...list, unreadable: [UNREADABLE], notClinicalSources: 1 });
  render(<StudyDataSource {...sourceProps} />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read.*cdiscpilot01-adam-bundle, version 1\.0/);
  expect(screen.getByRole('option', { name: /Approved synthetic study source/ })).toBeTruthy();
  expect(screen.getByText(/1 other JSON file in this project’s Vault is not a clinical source/)).toBeTruthy();
});

it('with no source offered, a file it could not read is an alert, not only "no clinical source"', async () => {
  serveList({ ...list, sources: [], unreadable: [UNREADABLE], notClinicalSources: 0 });
  render(<StudyDataSource {...sourceProps} />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/cdiscpilot01-adam-bundle/);
  expect(screen.queryByRole('combobox', { name: 'Clinical source' })).toBeNull();
});

it.each([
  ['an unreadable entry without its id', { ...list, unreadable: [{ documentTitle: 'x', version: '1' }], notClinicalSources: 0 }],
  ['a negative count', { ...list, unreadable: [], notClinicalSources: -1 }],
])('treats a list with %s as incomplete, never as a list', async (_name, body) => {
  serveList(body);
  render(<StudyDataSource {...sourceProps} />);
  expect((await screen.findByRole('alert')).textContent).toBe('The project’s clinical sources could not be listed.');
  expect(screen.queryByRole('combobox', { name: 'Clinical source' })).toBeNull();
});

it.each([
  ['another source hash', { ...preview, source: { ...receipt, sha256: 'b'.repeat(64) } }],
  ['missing required table', { ...preview, tables: { disposition: tables.disposition } }],
  ['unrecorded source approval', { ...preview, approved: true, source: { ...receipt, sourceApproval: 'not-approved' } }],
])('refuses a preview with %s instead of offering to freeze incomplete or changed inputs', async (_name, body) => {
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, requestBody) => path.endsWith('/csr/source-preview') ? Promise.resolve(response(body)) : original(method, path, requestBody));
  render(<StudyDataSource {...sourceProps} />);
  await screen.findByRole('option', { name: /Approved synthetic study source/ });
  fireEvent.change(screen.getByLabelText('Clinical source'), { target: { value: SOURCE_DOC } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview clinical tables' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Freeze as this document’s study data' })).toBeNull();
});

it('paginates large aggregate tables and shows the clinical source format', async () => {
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, body) => path.endsWith('/csr/source-preview') ? Promise.resolve(response({ ...preview, tables: { ...tables, disposition: {
    ...tables.disposition, rows: Array.from({ length: 55 }, (_, i) => [`Aggregate ${i + 1}`, String(i)]),
  } } })) : original(method, path, body));
  render(<StudyDataSource {...sourceProps} />);
  await chooseAndPreview();
  fireEvent.click(screen.getByText('disposition source table', { selector: 'summary' }));
  expect(screen.getByText('Rows 1–50 of 55')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next rows' }));
  expect(screen.getByText('Rows 51–55 of 55')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'View clinical source format' }));
  await screen.findByText(/"sourceSchema"/);
  expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submission-orchestrator/csr/source-contract', undefined);
});

it('the CSR document with no study data offers the source, and builds on the data once frozen (no package run)', async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} />);
  await chooseAndPreview();
  expect(apiRequest).toHaveBeenCalledWith('GET', `/api/submission-orchestrator/csr/study-data?programId=${PROGRAM}&documentId=${CSR_DOC}`, undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Freeze as this document’s study data' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', `/api/submission-orchestrator/runs/${FROZEN}/clinical-tables?programId=${PROGRAM}`, undefined));
  expect((screen.getByLabelText(/Study data/) as HTMLSelectElement).value).toBe(FROZEN);
  expect(screen.getByRole('button', { name: 'Freeze newer study data' })).toBeTruthy();
  expect(apiRequest.mock.calls.some(([, path]) => String(path).endsWith('/runs/for-program'))).toBe(false);
});

it('keeps the study’s pivotal declarations with its data, in the editor (D5, 2026-10-29)', async () => {
  render(<StudyDataBuild programId={PROGRAM} documentId={CSR_DOC} />);
  expect(await screen.findByText('No CSR build in this project names a study yet.')).toBeTruthy();
  expect(screen.getByText('Pivotal studies')).toBeTruthy();
  expect(apiRequest.mock.calls.some(([method, path]) => method === 'GET' && path === `/api/csr-workflow/pivotal?programId=${encodeURIComponent(PROGRAM)}`)).toBe(true);
});

it('Submission Center’s package run takes no clinical source: none is offered, and none is sent', async () => {
  const loaded = vi.fn();
  render(<OrchestratorRunControls programId={PROGRAM} sequenceId={7} run={null} selectedRunId={null} onLoad={loaded} onBusyChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Build package run' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/runs/for-program', { programId: PROGRAM, sequenceId: 7 }));
  expect(screen.queryByLabelText('Clinical source')).toBeNull();
  expect(screen.queryByText(/Clinical source tables/)).toBeNull();
  expect(apiRequest.mock.calls.some(([, path]) => String(path).includes('/csr/sources?'))).toBe(false);
});

it('lists first, and says so, the Vault file of a capture this project uses (S2 "Use in this project")', async () => {
  const OTHER = { ...SOURCE, documentId: '11111111-2222-4333-8444-000000000006', documentTitle: 'Earlier study source', sha256: 'b'.repeat(64) };
  const fallback = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (path.includes('/csr/sources?')) return response({ ...list, sources: [OTHER, SOURCE] });
    if (path.endsWith(`/projects/${PROGRAM}/evidence`)) {
      return response({ evidence: [{ evidence_kind: 'data_room', data_room: { checksum: HASH, isCurrent: true } }] });
    }
    return fallback(method, path);
  });
  render(<StudyDataSource {...sourceProps} />);
  await screen.findByRole('option', { name: /Approved synthetic study source.*used in this project/ });
  const options = screen.getAllByRole('option').map(o => o.textContent);
  expect(options.slice(1)).toEqual(['Approved synthetic study source · v2 · approved · used in this project', 'Earlier study source · v2 · approved']);
});
