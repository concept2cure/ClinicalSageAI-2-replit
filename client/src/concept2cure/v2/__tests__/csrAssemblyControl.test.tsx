// @vitest-environment jsdom
/**
 * Reach of CSR assembly (2026-10-30): the build board carries "Assemble CSR
 * files". It queues the assembly, shows its progress while it runs, then each
 * leaf with its page count and SHA-256 and every missing appendix with whether
 * it blocks; it places the leaves into an open sequence of the program. A
 * refusal (to assemble, to read, to place) is shown as the server stated it,
 * never as an empty state. SYNTHETIC values.
 */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrAssemblyControl, type CsrAssemblyRun } from '../surfaces/CsrAssemblyControl';
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { publishShellProject } from '../shellProject';
import { getSurface } from '@shared/constants/ui-surface-registry';
vi.mock('../clinicalRegulatoryGraphFlag', () => ({ isClinicalRegulatoryGraphEnabled: () => false }));

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
const BASE = '/api/csr/jobs/41/assembly';
afterEach(() => { cleanup(); apiRequest.mockReset(); });

const assembled: CsrAssemblyRun = {
  id: 3, status: 'assembled', progress: 100, stage: 'Assembled', updatedAt: '2026-10-30T09:00:00Z', notApplicable: {}, supplied: {}, placement: null, error: null,
  result: {
    status: 'incomplete', bodyGaps: ['CSR section 15 is prepared from source outputs and records.'], unresolvedReferences: [], pdfa: 'Leaves are PDF 1.7.',
    structure: { ok: true, findings: [], bodyOutlineDepth: 4, linksChecked: 91 },
    listings: [{ number: '16.2.7', rows: 64, pages: 3, verified: true, findings: [] }],
    leaves: [
      { appendix: 'body', title: 'SYN — Clinical Study Report', fileName: 'csr-body.pdf', fileTag: 'study-report', origin: 'generated', ctdSection: '5.3.5.1', pages: 41, sha256: 'a'.repeat(64) },
      { appendix: '16.2.7', title: 'Listing 16.2.7 Adverse Event Listings', fileName: 'csr-16-2-7-adverse-events.pdf', fileTag: 'adverse-event-listings', origin: 'generated', ctdSection: '5.3.5.1', pages: 3, sha256: 'b'.repeat(64) },
    ],
    missing: [
      { number: '16.1.1', title: 'Protocol and protocol amendments', fileTag: 'protocol-or-amendment', blocking: true, reason: 'Only the sponsor can supply this document.' },
      { number: '16.1.11', title: 'Publications based on the study', fileTag: 'publications-based-on-study', blocking: false, reason: 'Include it if it applies.' },
    ],
  },
};

it('queues the assembly and shows its progress while it runs', async () => {
  let posted: unknown = null;
  apiRequest.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'POST' && path === BASE) { posted = body; return ok({ assemblyId: 3, status: 'queued' }, 202); }
    if (path === BASE) return ok({ assembly: posted ? { ...assembled, status: 'assembling', progress: 37, stage: 'Listing 16.2.7', result: null } : null });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  await screen.findByText('This build has not been assembled.');
  fireEvent.click(screen.getByRole('button', { name: /Assemble CSR files/ }));
  expect(await screen.findByText(/Assembling: Listing 16\.2\.7 \(37%\)/)).toBeTruthy();
  expect(screen.getByLabelText('Assembly progress').getAttribute('value')).toBe('37');
  expect(posted).toEqual({ notApplicable: {}, supplied: {} });
  expect((screen.getByRole('button', { name: /Assemble CSR files/ }) as HTMLButtonElement).disabled).toBe(true);
});

it('shows a refusal to assemble as stated', async () => {
  apiRequest.mockImplementation(async (method: string) => {
    if (method === 'POST') throw refusal(409, { code: 'CSR_ASSEMBLY_RUN_REQUIRED', error: 'This CSR build is not bound to a retained run in a project, so it has no tables or listings to assemble.' });
    return ok({ assembly: null });
  });
  render(<CsrAssemblyControl jobId={41} />);
  fireEvent.click(await screen.findByRole('button', { name: /Assemble CSR files/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/not bound to a retained run/);
});

it('shows a failed read as an alert, not as "not assembled"', async () => {
  apiRequest.mockImplementation(async () => { throw refusal(403, { code: 'CSR_PROJECT_ACCESS_DENIED', error: 'You do not have access to this project.' }); });
  render(<CsrAssemblyControl jobId={41} />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/do not have access to this project/);
  expect(screen.queryByText('This build has not been assembled.')).toBeNull();
});

it('lists each leaf with pages and SHA-256 and each missing appendix with whether it blocks; shows a placement refusal as stated', async () => {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === `${BASE}/3/place`) {
      throw refusal(409, { code: 'CSR_PLACEMENT_BLOCKING_APPENDIX', error: 'Appendix 16.1.1 (Protocol and protocol amendments) is missing. Supply each one, or declare it not applicable with a reason and assemble again. Nothing was placed.' });
    }
    if (path === BASE) return ok({ assembly: assembled });
    if (path === `${BASE}/targets`) return ok({ sequences: [{ sequenceId: 90, sequenceNumber: '0004', status: 'draft', submissionTitle: 'LMN-201 IND' }] });
    if (path === `${BASE}/supply-candidates`) return ok({ documents: [{ documentId: '11111111-2222-4333-8444-0000000000aa', title: 'Protocol v3', version: '3', sha256: 'c'.repeat(64) }] });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  const table = await screen.findByRole('table', { name: 'Assembled CSR files' });
  const body = within(table).getByText('csr-body.pdf').closest('tr')!;
  expect(within(body).getByText('41')).toBeTruthy();
  expect(within(body).getByText('a'.repeat(64))).toBeTruthy();
  const missing = screen.getByLabelText('Missing appendices');
  expect(within(missing).getByText('16.1.1').closest('li')!.textContent).toMatch(/Blocks placement/);
  expect(within(missing).getByText('16.1.11').closest('li')!.textContent).toMatch(/Include if it applies/);
  expect(await within(missing).findByLabelText('Supply appendix 16.1.1')).toBeTruthy();
  fireEvent.change(await screen.findByLabelText('Sequence'), { target: { value: '90' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'CSR for the Part B data cut' } });
  fireEvent.click(screen.getByRole('button', { name: /Place CSR files/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Appendix 16\.1\.1 .* is missing\. .*Nothing was placed\./);
});

it('assembles again with the supplied document and the declarations the user entered', async () => {
  const posts: unknown[] = [];
  apiRequest.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'POST' && path === BASE) { posts.push(body); return ok({ assemblyId: 4, status: 'queued' }, 202); }
    if (path === BASE) return ok({ assembly: assembled });
    if (path === `${BASE}/targets`) return ok({ sequences: [] });
    if (path === `${BASE}/supply-candidates`) return ok({ documents: [{ documentId: '11111111-2222-4333-8444-0000000000aa', title: 'Protocol v3', version: '3', sha256: 'c'.repeat(64) }] });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  const select = await screen.findByLabelText('Supply appendix 16.1.1');
  await within(select).findByText('Protocol v3 (version 3)');
  fireEvent.change(select, { target: { value: '11111111-2222-4333-8444-0000000000aa' } });
  const item = screen.getByText('16.1.11').closest('li')!;
  fireEvent.change(within(item).getByRole('textbox'), { target: { value: 'No publication is based on this study.' } });
  expect(screen.getByText('This program has no open sequence. Create one in Submission Center first.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Assemble CSR files/ }));
  await screen.findByText('The CSR assembly is queued.');
  expect(posts).toEqual([{ notApplicable: { '16.1.11': 'No publication is based on this study.' },
    supplied: { '16.1.1': { documentId: '11111111-2222-4333-8444-0000000000aa', sha256: 'c'.repeat(64) } } }]);
});

it('is reachable on the csr-workflow board for the job', async () => {
  const board = { success: true, data: { program: { title: 'SYN', code: 'ICH E3', readiness: 100 },
    sections: [{ num: '11', label: 'Efficacy evaluation', status: 'draft' }], headings: [], meta: { jobId: 41 } } };
  apiRequest.mockImplementation(async (_m: string, path: string) => (path.startsWith('/api/csr-workflow/board') ? ok(board) : path === BASE ? ok({ assembly: null }) : ok({ subjects: [] })));
  publishShellProject({ id: '11111111-2222-4333-8444-000000000001', title: 'SYN' });
  try {
    render(<CsrWorkflow surface={getSurface('csr-workflow')!} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    const region = await screen.findByLabelText('CSR assembly');
    expect(within(region).getByRole('button', { name: /Assemble CSR files/ })).toBeTruthy();
  } finally { publishShellProject({ id: '' }); }
});

it('shows a placement a stopped worker left as interrupted, not as being placed, and offers to place it again into that sequence (2026-10-30)', async () => {
  const interrupted = { ...assembled, result: { ...assembled.result!, missing: [], placeholderSections: [] },
    placement: { state: 'interrupted' as const, sequenceId: 90, sequenceNumber: '0004', leaves: [{ fileName: 'csr-body.pdf' }] } };
  let placed: unknown = null;
  apiRequest.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'POST' && path === `${BASE}/3/place`) { placed = body; return ok({ placement: { state: 'placed' } }); }
    if (path === BASE) return ok({ assembly: interrupted });
    if (path === `${BASE}/targets`) return ok({ sequences: [{ sequenceId: 90, sequenceNumber: '0004', status: 'draft', submissionTitle: 'LMN-201 IND' }] });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  expect((await screen.findByText(/stopped before it finished/)).textContent).toMatch(/sequence 0004.*1 file\(s\).*Place again into sequence 0004/);
  expect(screen.queryByText(/Being placed/)).toBeNull();
  fireEvent.change(await screen.findByLabelText('Reason'), { target: { value: 'Finish the interrupted placement' } });
  fireEvent.click(await screen.findByRole('button', { name: /Place CSR files/ }));
  await vi.waitFor(() => expect(placed).toEqual({ sequenceId: 90, reason: 'Finish the interrupted placement' }));
});

it('marks a drafted section that keeps a data placeholder as blocking placement', async () => {
  const withPlaceholder = { ...assembled, result: { ...assembled.result!, placeholderSections: ['11.4.1'] } };
  apiRequest.mockImplementation(async (_m: string, path: string) => (path === BASE ? ok({ assembly: withPlaceholder })
    : path === `${BASE}/targets` ? ok({ sequences: [] }) : ok({ documents: [] })));
  render(<CsrAssemblyControl jobId={41} />);
  expect((await screen.findByText(/Section 11\.4\.1 still holds a data placeholder/)).closest('[role="alert"]')).toBeTruthy();
});
