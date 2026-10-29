// @vitest-environment jsdom
/**
 * CSR slice 7, off the request path since 2026-10-30: the build board carries
 * "Build narratives" for the job; it queues the build (202), polls its status
 * (queued, running with subjects done of total, then complete, incomplete with
 * the refused subjects, failed by code, or stalled, which building again
 * resumes), reports what was landed or why not, and shows the per-subject QC
 * list (missing fields, prose source, refusals, awaiting review). A server
 * refusal or an unreadable status is shown as stated, never as an empty list.
 */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrNarrativeBuild, type CsrBoardHeading, type CsrNarrativeQcRow, type CsrNarrativeRun } from '../surfaces/CsrBuildProgress';
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { publishShellProject } from '../shellProject';
import { getSurface } from '@shared/constants/ui-surface-registry';
vi.mock('../clinicalRegulatoryGraphFlag', () => ({ isClinicalRegulatoryGraphEnabled: () => false }));

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
const headings: CsrBoardHeading[] = [{ num: '14.3.3', label: 'Narratives', depth: 3, manual: true, state: 'draft', contentHash: 'c'.repeat(64) }];
const rows: CsrNarrativeQcRow[] = [
  { subjectId: 'SYN-0008', sequence: 0, status: 'composed', contentHash: 'd'.repeat(64),
    qc: { armName: 'Placebo', categories: ['death', 'serious'], events: ['Septic shock'], missingFields: ['event1.grade'], prose: 'template' } },
  { subjectId: 'SYN-0012', sequence: 1, status: 'refused', contentHash: null,
    qc: { armName: 'LMN-201', categories: ['discontinuation'], events: [], missingFields: [], prose: null,
      refusal: { reason: 'ADSL records discontinuation for an adverse event, but no ADAE event records the study treatment as withdrawn (AEACN).' } } },
];
afterEach(() => { cleanup(); apiRequest.mockReset(); });

const at = '2026-10-30T09:00:00.000Z';
const runOf = (over: Partial<CsrNarrativeRun>): CsrNarrativeRun =>
  ({ id: 3, status: 'queued', subjectsDone: 0, subjectsTotal: null, stalled: false, updatedAt: at, result: null, error: null, ...over });

/** The server: POST queues; each status read returns the next state in `states` (the last one repeats). */
function serve(states: Array<CsrNarrativeRun | null>, qcAfter: CsrNarrativeQcRow[] = []) {
  let posted = false;
  let reads = 0;
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/csr/jobs/41/narratives') { posted = true; return ok({ runId: 3, status: 'queued', resumed: false }, 202); }
    if (path === '/api/csr/jobs/41/narratives/status') return ok({ run: posted ? states[Math.min(reads++, states.length - 1)] : null });
    if (path === '/api/csr/jobs/41/narratives') return ok({ subjects: posted ? qcAfter : [] });
    return ok({});
  });
}

it('queues the build, shows subjects done of total while it runs, then the outcome and the QC list', async () => {
  serve([runOf({ status: 'queued' }), runOf({ status: 'running', subjectsDone: 37, subjectsTotal: 80 }), runOf({ status: 'running', subjectsDone: 37, subjectsTotal: 80 }),
    runOf({ status: 'incomplete', subjectsDone: 2, subjectsTotal: 2,
      result: { status: 'incomplete', selected: 2, composed: 1, refused: 1, sections: { written: [], kept: [] }, subjects: ['SYN-0012'] } })], rows);
  const changed = vi.fn();
  render(<CsrNarrativeBuild jobId={41} headings={headings} onChanged={changed} pollMs={10} />);
  await screen.findByText('No narratives have been composed for this build.');
  expect(screen.getByText(/§14.3.3 is draft; each narrative below awaits that review/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Build narratives/ }));
  expect((await screen.findByText('Composing narratives: 37 of 80 subjects.')).getAttribute('role')).toBe('status');
  expect(screen.getByLabelText('Narrative progress').getAttribute('value')).toBe('37');
  expect((screen.getByRole('button', { name: /Building/ }) as HTMLButtonElement).disabled).toBe(true);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/1 of 2 narratives composed\. 1 subject\(s\) could not be narrated .* §14\.3\.3 was not written\. Not composed: SYN-0012\./);
  const list = await screen.findByLabelText('Narrative QC');
  expect(within(list).getByText('Septic shock')).toBeTruthy();
  expect(within(list).getByText('Not recorded in the source: event1.grade')).toBeTruthy();
  expect(within(list).getByText('Prose: template (facts only)')).toBeTruthy();
  expect(within(list).getByText(/no ADAE event records the study treatment as withdrawn/)).toBeTruthy();
  expect(changed).toHaveBeenCalled();
  expect(apiRequest.mock.calls.filter(([m]) => m === 'POST')).toHaveLength(1);
});

it('refreshes the QC list and the board when the build finished before the first status read', async () => {
  serve([runOf({ status: 'complete', subjectsDone: 2, subjectsTotal: 2,
    result: { status: 'complete', selected: 2, composed: 2, refused: 0, sections: { written: ['14.3.3', '12.3.2'], kept: [] } } })], rows);
  const changed = vi.fn();
  render(<CsrNarrativeBuild jobId={41} headings={[]} onChanged={changed} pollMs={10} />);
  await screen.findByText('No narratives have been composed for this build.');
  fireEvent.click(screen.getByRole('button', { name: /Build narratives/ }));
  expect((await screen.findByRole('status')).textContent).toMatch(/2 of 2 narratives composed from the ADaM rows; §14\.3\.3 and §12\.3\.2 written\./);
  const list = await screen.findByLabelText('Narrative QC');
  expect(within(list).getByText('Septic shock')).toBeTruthy();
  expect(changed).toHaveBeenCalled();
});

it('shows a failed build by its recorded refusal, naming the rows', async () => {
  serve([runOf({ status: 'failed', error: { code: 'CSR_ADAM_VALUE_MISSING', message: 'An ADaM value the narrative needs is missing.',
    issues: [{ path: 'ADAE[3].AESER', message: 'AESER is blank.' }] } })]);
  render(<CsrNarrativeBuild jobId={41} headings={[]} onChanged={() => {}} pollMs={10} />);
  fireEvent.click(await screen.findByRole('button', { name: /Build narratives/ }));
  expect((await screen.findByRole('alert')).textContent).toBe('An ADaM value the narrative needs is missing. ADAE[3].AESER: AESER is blank.');
});

it('says a stalled build stopped, and building again resumes it', async () => {
  apiRequest.mockImplementation(async (_m: string, path: string) => (path.endsWith('/status')
    ? ok({ run: runOf({ status: 'running', stalled: true, subjectsDone: 30, subjectsTotal: 80 }) }) : ok({ subjects: [] })));
  render(<CsrNarrativeBuild jobId={41} headings={[]} onChanged={() => {}} pollMs={10} />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/stopped making progress .*\(30 of 80 subjects\)\. Build narratives resumes it; narratives already composed are kept\./);
  expect((screen.getByRole('button', { name: /Build narratives/ }) as HTMLButtonElement).disabled).toBe(false);
});

it('shows the server refusal as stated', async () => {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST') throw refusal(409, { code: 'CSR_NARRATIVE_RUN_REQUIRED', error: 'Narratives are composed from the ADaM data of the retained run a build is bound to. This build has no bound run. No narratives were composed.' });
    return path.endsWith('/status') ? ok({ run: null }) : ok({ subjects: [] });
  });
  render(<CsrNarrativeBuild jobId={41} headings={[]} onChanged={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Build narratives/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/This build has no bound run\. No narratives were composed\./);
});

it('says so when the build status cannot be read, rather than showing nothing', async () => {
  apiRequest.mockImplementation(async (_m: string, path: string) => {
    if (path.endsWith('/status')) throw refusal(500, { error: 'Could not read the narrative build.' });
    return ok({ subjects: [] });
  });
  render(<CsrNarrativeBuild jobId={41} headings={[]} onChanged={() => {}} />);
  expect((await screen.findByRole('alert')).textContent).toBe('Could not read the narrative build.');
});

it('is reachable on the csr-workflow board for the job', async () => {
  const board = { success: true, data: { program: { title: 'SYN', code: 'ICH E3', readiness: 100 },
    sections: [{ num: '11', label: 'Efficacy evaluation', status: 'draft' }], headings, meta: { jobId: 41 } } };
  apiRequest.mockImplementation(async (_m: string, path: string) => (path.startsWith('/api/csr-workflow/board') ? ok(board) : ok({ subjects: [] })));
  publishShellProject({ id: '11111111-2222-4333-8444-000000000001', title: 'SYN' });
  try {
    render(<CsrWorkflow surface={getSurface('csr-workflow')!} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    const region = await screen.findByLabelText('Patient safety narratives');
    expect(within(region).getByRole('button', { name: /Build narratives/ })).toBeTruthy();
  } finally { publishShellProject({ id: '' }); }
});
