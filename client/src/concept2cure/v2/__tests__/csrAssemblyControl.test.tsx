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

/** A sequence with no earlier CSR file of the study: every file is new. */
const NO_PRIOR = { studyId: 'SYN-LMN201-B', undecided: [], keptOnFile: [], withdrawnHere: [], ambiguous: [],
  leaves: [{ appendix: 'body', fileName: 'csr-body.pdf', title: 'Body', operation: 'new', parent: null }] };

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
    if (path === `${BASE}/3/lifecycle?sequenceId=90`) return ok({ lifecycle: NO_PRIOR });
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
    if (path === `${BASE}/3/lifecycle?sequenceId=90`) return ok({ lifecycle: NO_PRIOR });
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

it('shows what each file replaces in the chosen sequence, and places only once an earlier file left out is confirmed on file (2026-10-30)', async () => {
  const ready = { ...assembled, result: { ...assembled.result!, missing: [], placeholderSections: [] } };
  const plan = { studyId: 'SYN-LMN201-B', keptOnFile: [], withdrawnHere: [], ambiguous: [],
    leaves: [{ appendix: 'body', fileName: 'csr-body.pdf', title: 'Body', operation: 'replace', parent: { leafId: 700, sequenceNumber: '0003', title: 'Earlier body' } },
      { appendix: '16.2.7', fileName: 'csr-16-2-7-adverse-events.pdf', title: 'Listing 16.2.7', operation: 'new', parent: null }],
    undecided: [{ leafId: 702, sequenceNumber: '0003', title: 'Publications', part: '16.1.11' }] };
  let placed: unknown = null;
  apiRequest.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'POST' && path === `${BASE}/3/place`) { placed = body; return ok({ placement: { state: 'placed' } }); }
    if (path === BASE) return ok({ assembly: ready });
    if (path === `${BASE}/targets`) return ok({ sequences: [{ sequenceId: 90, sequenceNumber: '0004', status: 'draft', submissionTitle: 'LMN-201 IND' }] });
    if (path === `${BASE}/3/lifecycle?sequenceId=90`) return ok({ lifecycle: plan });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  fireEvent.change(await screen.findByLabelText('Sequence'), { target: { value: '90' } });
  const ops = await screen.findByLabelText('Lifecycle of each file');
  expect(within(ops).getByText('csr-body.pdf').closest('li')!.textContent).toMatch(/replaces leaf 700 \(Earlier body\) in sequence 0003/);
  expect(within(ops).getByText('csr-16-2-7-adverse-events.pdf').closest('li')!.textContent).toMatch(/new \(study SYN-LMN201-B has no earlier file/);
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Revised CSR for the Part B data cut' } });
  const button = screen.getByRole('button', { name: /Place CSR files/ }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/Stays on file: Appendix 16\.1\.11 \(Publications\), sequence 0003, leaf 702/));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await vi.waitFor(() => expect(placed).toEqual({ sequenceId: 90, reason: 'Revised CSR for the Part B data cut', keepOnFile: [702] }));
});

it('offers to withdraw the partly placed CSR files with a reason, and shows a refusal as stated (2026-10-30)', async () => {
  const partial = { ...assembled, result: { ...assembled.result!, missing: [], placeholderSections: [] },
    placement: { state: 'partial' as const, sequenceId: 90, sequenceNumber: '0004', leaves: [{ fileName: 'csr-body.pdf' }], error: 'a refusal' } };
  const posts: unknown[] = [];
  apiRequest.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'POST' && path === `${BASE}/3/withdraw-placement`) {
      posts.push(body);
      throw refusal(409, { code: 'CSR_PLACEMENT_SEQUENCE_LOCKED', error: 'Sequence 0004 is frozen; its leaves cannot change, so the partly placed CSR files stay. Nothing was withdrawn.' });
    }
    if (path === BASE) return ok({ assembly: partial });
    if (path === `${BASE}/targets`) return ok({ sequences: [{ sequenceId: 90, sequenceNumber: '0004', status: 'draft', submissionTitle: 'LMN-201 IND' }] });
    if (path === `${BASE}/3/lifecycle?sequenceId=90`) return ok({ lifecycle: NO_PRIOR });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  const withdraw = await screen.findByRole('button', { name: /Withdraw the partly placed CSR files/ }) as HTMLButtonElement;
  expect(withdraw.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Reason for withdrawal'), { target: { value: 'The build was edited after this placement.' } });
  fireEvent.click(withdraw);
  expect((await screen.findByText(/so the partly placed CSR files stay/)).closest('[role="alert"]')).toBeTruthy();
  expect(posts).toEqual([{ reason: 'The build was edited after this placement.' }]);
});

it('states a withdrawal and offers a fresh placement (2026-10-30)', async () => {
  const withdrawn = { ...assembled, result: { ...assembled.result!, missing: [], placeholderSections: [] },
    placement: { state: 'withdrawn' as const, sequenceId: 90, sequenceNumber: '0004', leaves: [],
      withdrawal: { withdrawnBy: 5, withdrawnAt: '2026-10-30T10:00:00Z', reason: 'The build was edited', sequenceNumber: '0004', removed: [{ fileName: 'csr-body.pdf' }], notRemoved: [] } } };
  apiRequest.mockImplementation(async (_m: string, path: string) => (path === BASE ? ok({ assembly: withdrawn })
    : path === `${BASE}/targets` ? ok({ sequences: [{ sequenceId: 90, sequenceNumber: '0004', status: 'draft', submissionTitle: 'LMN-201 IND' }] }) : ok({})));
  render(<CsrAssemblyControl jobId={41} />);
  expect((await screen.findByText(/were withdrawn \(1 file\(s\)\) by user 5/)).textContent).toMatch(/sequence 0004.*The build was edited/);
  expect(await screen.findByRole('button', { name: /Place CSR files/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Withdraw the partly placed CSR files/ })).toBeNull();
});

it('lets the user withdraw an earlier file left out, or one of two current files for a part, in this sequence (review, 2026-10-30)', async () => {
  const ready = { ...assembled, result: { ...assembled.result!, missing: [], placeholderSections: [] } };
  const plan = { studyId: 'SYN-LMN201-B', keptOnFile: [], withdrawnHere: [],
    leaves: [{ appendix: 'body', fileName: 'csr-body.pdf', title: 'Body', operation: 'new', parent: null }],
    ambiguous: [{ part: 'body', leaves: [{ leafId: 700, sequenceNumber: '0001', title: 'Body A', part: 'body' }, { leafId: 701, sequenceNumber: '0002', title: 'Body B', part: 'body' }] }],
    undecided: [{ leafId: 702, sequenceNumber: '0003', title: 'Publications', part: '16.1.11' }] };
  let placed: unknown = null;
  apiRequest.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'POST' && path === `${BASE}/3/place`) { placed = body; return ok({ placement: { state: 'placed' } }); }
    if (path === BASE) return ok({ assembly: ready });
    if (path === `${BASE}/targets`) return ok({ sequences: [{ sequenceId: 90, sequenceNumber: '0004', status: 'draft', submissionTitle: 'LMN-201 IND' }] });
    if (path === `${BASE}/3/lifecycle?sequenceId=90`) return ok({ lifecycle: plan });
    return ok({});
  });
  render(<CsrAssemblyControl jobId={41} />);
  fireEvent.change(await screen.findByLabelText('Sequence'), { target: { value: '90' } });
  fireEvent.change(await screen.findByLabelText('Reason'), { target: { value: 'Revised CSR for the Part B data cut' } });
  const button = await screen.findByRole('button', { name: /Place CSR files/ }) as HTMLButtonElement;
  fireEvent.click(await screen.findByLabelText(/Withdraw in this sequence: Appendix 16\.1\.11 \(Publications\), sequence 0003, leaf 702/));
  // Two current bodies: still undecided until the one no longer current is withdrawn.
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/Withdraw in this sequence: Body A, sequence 0001, leaf 700/));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await vi.waitFor(() => expect(placed).toEqual({ sequenceId: 90, reason: 'Revised CSR for the Part B data cut', withdraw: [702, 700] }));
});
