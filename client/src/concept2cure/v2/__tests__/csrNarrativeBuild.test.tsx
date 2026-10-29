// @vitest-environment jsdom
/**
 * CSR slice 7: the build board carries "Build narratives" for the job; it
 * POSTs the job's narrative build, reports what was landed or why not, and
 * shows the per-subject QC list (missing fields, prose source, refusals,
 * awaiting review). A server refusal is shown as stated, never as an empty list.
 */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrNarrativeBuild, type CsrBoardHeading, type CsrNarrativeQcRow } from '../surfaces/CsrBuildProgress';
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

it('builds the narratives and shows the QC list with missing fields, prose source, refusals and review state', async () => {
  let built = false;
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/csr/jobs/41/narratives') { built = true; return ok({ status: 'incomplete', selected: 2, composed: 1, refused: 1, sections: { written: [], kept: [] } }); }
    if (path === '/api/csr/jobs/41/narratives') return ok({ subjects: built ? rows : [] });
    return ok({});
  });
  const changed = vi.fn();
  render(<CsrNarrativeBuild jobId={41} headings={headings} onChanged={changed} />);
  await screen.findByText('No narratives have been composed for this build.');
  expect(screen.getByText(/§14.3.3 is draft; each narrative below awaits that review/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Build narratives/ }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/1 of 2 narratives composed\. 1 subject\(s\) could not be narrated .* §14\.3\.3 was not written/);
  const list = await screen.findByLabelText('Narrative QC');
  expect(within(list).getByText('Septic shock')).toBeTruthy();
  expect(within(list).getByText('Not recorded in the source: event1.grade')).toBeTruthy();
  expect(within(list).getByText('Prose: template (facts only)')).toBeTruthy();
  expect(within(list).getByText(/no ADAE event records the study treatment as withdrawn/)).toBeTruthy();
  expect(changed).toHaveBeenCalled();
});

it('shows the server refusal as stated', async () => {
  apiRequest.mockImplementation(async (method: string) => {
    if (method === 'POST') throw refusal(422, { code: 'CSR_NARRATIVE_ADAM_REQUIRED', error: 'Patient narratives are composed from subject-level ADaM data. No narratives were composed.' });
    return ok({ subjects: [] });
  });
  render(<CsrNarrativeBuild jobId={41} headings={[]} onChanged={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Build narratives/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/subject-level ADaM data\. No narratives were composed\./);
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
