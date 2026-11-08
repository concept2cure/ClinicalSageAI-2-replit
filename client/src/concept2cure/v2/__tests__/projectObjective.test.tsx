// @vitest-environment jsdom
/**
 * The project's objective of record in its About card (S1, P-80, P-82): read
 * from the charter's objectives section, with its sources and versions; AnA is
 * asked to propose it; a person records a version with a reason; nobody who
 * may not change the project is offered the change.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProjectObjective, PROPOSE_OBJECTIVE_ASK } from '../surfaces/ProjectObjective';

const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';
const PATH = `/api/charters/by-project/${PROGRAM}/objectives`;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data, headers: new Headers() }) as Response;
const NONE = { success: true, data: { charterId: null, current: null, history: [] } };
const RECORDED = { success: true, data: { charterId: 3, current: {
  version: 2, updatedAt: '2026-11-01T04:00:00.000Z', contentHash: 'h', status: 'draft', updatedBy: 7,
  content: { objective: 'Show C2C-101 is safe at the proposed doses, and open the IND.', successCriteria: 'No dose-limiting toxicity below 30 mg.',
    sources: [{ kind: 'registry', title: 'ClinicalTrials.gov entry', url: 'https://clinicaltrials.gov/study/NCT00000000' }] } },
  history: [{ version: 2, eventType: 'updated', occurredAt: '2026-11-01T04:00:00.000Z', reason: 'The final protocol' },
    { version: 1, eventType: 'created', occurredAt: '2026-10-30T04:00:00.000Z', reason: 'First draft' }] } };

let reads: unknown = NONE;
beforeEach(() => {
  reads = NONE;
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string) => Promise.resolve(ok(method === 'PUT' ? RECORDED : reads)));
});
afterEach(() => cleanup());

describe("the project's objective of record", () => {
  it('says none is recorded, and offers to set it and to ask AnA', async () => {
    const onAsk = vi.fn();
    render(<ProjectObjective programId={PROGRAM} canEdit onAsk={onAsk} />);
    await screen.findByText('No objective is recorded for this project yet.');
    expect(apiRequest.mock.calls[0][1]).toBe(PATH);
    fireEvent.click(screen.getByRole('button', { name: 'Ask AnA to propose it' }));
    expect(onAsk).toHaveBeenCalledWith(PROPOSE_OBJECTIVE_ASK);
    expect(screen.getByRole('button', { name: 'Set the objective' })).toBeTruthy();
  });

  it('shows the recorded objective, its criteria and where it was taken from, with its versions', async () => {
    reads = RECORDED;
    render(<ProjectObjective programId={PROGRAM} canEdit />);
    await screen.findByText('Show C2C-101 is safe at the proposed doses, and open the IND.');
    expect(screen.getByText('No dose-limiting toxicity below 30 mg.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ClinicalTrials.gov entry' }).getAttribute('href')).toBe('https://clinicaltrials.gov/study/NCT00000000');
    expect(screen.getByText(/^Version 2, /, { selector: 'summary' })).toBeTruthy();
    expect(screen.getByText(/Version 1, .*: First draft/)).toBeTruthy();
  });

  it('records a version with its reason and source, and writes nothing before', async () => {
    render(<ProjectObjective programId={PROGRAM} canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set the objective' }));
    const form = screen.getByRole('dialog', { name: "Record the project's objective" });
    expect(apiRequest.mock.calls.filter(([m]) => m !== 'GET')).toEqual([]);
    const [objective] = Array.from(form.querySelectorAll('textarea')) as HTMLTextAreaElement[];
    fireEvent.change(objective, { target: { value: 'Show the primary endpoint is met, and file the NDA.' } });
    const texts = Array.from(form.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    fireEvent.change(texts[0], { target: { value: 'Protocol C2C-101-201' } });
    fireEvent.change(texts[1], { target: { value: 'Section 2.1' } });
    fireEvent.change(texts[2], { target: { value: 'Taken from the final protocol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record objective' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([m]) => m === 'PUT')).toBe(true));
    const [, path, body] = apiRequest.mock.calls.find(([m]) => m === 'PUT')!;
    expect(path).toBe(PATH);
    expect(body).toEqual({ objective: 'Show the primary endpoint is met, and file the NDA.', successCriteria: undefined,
      sources: [{ kind: 'protocol', title: 'Protocol C2C-101-201', locator: 'Section 2.1' }], reason: 'Taken from the final protocol' });
  });

  it('says the objective could not be read, and never takes the page down, when the read fails or is malformed', async () => {
    reads = { success: true, data: { unexpected: true } };
    render(<ProjectObjective programId={PROGRAM} canEdit />);
    await screen.findByText("The project's objective could not be read.");
  });

  it('offers no change to someone who may not change the project', async () => {
    render(<ProjectObjective programId={PROGRAM} canEdit={false} />);
    await screen.findByText('No objective is recorded for this project yet.');
    expect(screen.queryByRole('button', { name: 'Set the objective' })).toBeNull();
  });
});
