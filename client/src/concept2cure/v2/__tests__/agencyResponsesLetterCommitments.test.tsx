// @vitest-environment jsdom
/**
 * Extract commitments (P-81, P-84): the commitments the letter imposes are
 * proposed in its Questions and responses panel. "Record" opens the
 * Record-a-commitment form filled from the letter (its kind, words, due date and
 * basis), and nothing is written until the person records it with a reason,
 * through the letter's own commitments route. One already recorded says so.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../_shared/signingPosture', () => ({ useSigningPosture: () => null }));
import { AgencyResponses } from '../surfaces/AgencyResponses';
import type { CommRow } from '../surfaces/AgencyInbox';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const TOKEN = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const letter = { id: 'ace_9', sourceType: 'uploaded_official_correspondence', communicationType: 'Approval letter',
  sourceChannel: 'esg', linkedSectionCodes: [], receivedDate: '2026-10-12T00:00:00Z', urgency: 'normal', responseRequired: false,
  extractedIssues: [], humanReviewStatus: 'triaged', closureStatus: 'in_progress' } as unknown as CommRow;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data, headers: new Headers() }) as Response;
const QUESTIONS = { success: true, data: { letter: { id: 'ace_9', communicationType: 'Approval letter', closureStatus: 'in_progress',
  dueDate: null, responseRequired: false, closeRefusal: null },
  viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null }, packageReady: false, outstanding: [], questions: [] } };
const PMR = 'Conduct a randomized trial to evaluate the\n          long-term hepatic safety of LMN-201.';
const COMMITMENTS = { success: true, data: {
  sources: [{ sourceId: 4, title: 'Approval letter.pdf', state: 'read' }],
  proposals: [
    { sourceId: 4, ref: '4321-1', commitmentType: 'pmr', basis: 'FDCA 505(o)(3)', recordBasis: 'FDCA 505(o)(3) · 4321-1',
      text: PMR, start: 300, end: 300 + PMR.length, dueDate: '2029-06-30',
      milestones: [{ label: 'Final Report Submission', when: '06/2029', date: '2029-06-30' }], recordedCommitmentId: null },
    { sourceId: 4, ref: '4321-3', commitmentType: 'pmc', basis: 'FDCA 506B', recordBasis: 'FDCA 506B · 4321-3',
      text: 'Complete the in vitro OATP1B1 study.', start: 600, end: 636, dueDate: '2026-12-31', milestones: [], recordedCommitmentId: 51 },
  ] } };

beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(TOKEN, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string, path: string) => {
    if (method === 'POST') return Promise.resolve(ok({ success: true, data: { id: 77, status: 'open' } }));
    if (path.endsWith('/commitment-proposals')) return Promise.resolve(ok(COMMITMENTS));
    if (path.endsWith('/question-proposals')) return Promise.resolve(ok({ success: true, data: { sources: [], proposals: [] } }));
    return Promise.resolve(ok(QUESTIONS));
  });
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); });

function mount(fire = vi.fn(), onCommitmentRecorded = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AgencyResponses projectId="42" letter={letter} fire={fire} onNav={vi.fn()}
    onCommitmentRecorded={onCommitmentRecorded} /></QueryClientProvider>);
  return fire;
}

describe('the commitments a letter imposes, proposed (extract commitments)', () => {
  it('lists them with kind, basis and due date, and says which are recorded', async () => {
    mount();
    await screen.findByText(/The letter imposes 2 commitments, found in its text without AI/);
    expect(screen.getByText(/Postmarketing requirement, FDCA 505\(o\)\(3\), due Jun 30, 2029/)).toBeTruthy();
    expect(screen.getByText('Recorded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record commitment 4321-3 from the letter' })).toBeNull();
  });

  it('fills the form from the letter, and writes nothing until it is recorded with a reason', async () => {
    const fire = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Record commitment 4321-1 from the letter' }));
    const form = screen.getByRole('dialog', { name: 'Record a commitment' });
    expect((form.querySelector('select') as HTMLSelectElement).value).toBe('pmr');
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('Conduct a randomized trial to evaluate the long-term hepatic safety of LMN-201.');
    expect((form.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2029-06-30');
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toEqual([]);

    const inputs = Array.from(form.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    expect(inputs[0].value).toBe('FDCA 505(o)(3) · 4321-1');
    fireEvent.change(inputs[1], { target: { value: 'Recording the approval letter of 2026-10-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record commitment' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([m]) => m === 'POST')).toBe(true));
    const [, path, body] = apiRequest.mock.calls.find(([m]) => m === 'POST')!;
    expect(path).toMatch(/\/agency-communications\/ace_9\/commitments$/);
    expect(body).toMatchObject({ commitmentType: 'pmr', dueDate: '2029-06-30', regulatoryBasis: 'FDCA 505(o)(3) · 4321-1',
      reason: 'Recording the approval letter of 2026-10-12' });
    await waitFor(() => expect(String(fire.mock.calls[0]?.[0])).toMatch(/^Commitment 4321-1 recorded from the letter/));
  });

  it("tells the host its commitments register must re-read, once the record is confirmed", async () => {
    const onCommitmentRecorded = vi.fn();
    mount(vi.fn(), onCommitmentRecorded);
    fireEvent.click(await screen.findByRole('button', { name: 'Record commitment 4321-1 from the letter' }));
    const form = screen.getByRole('dialog', { name: 'Record a commitment' });
    expect(onCommitmentRecorded).not.toHaveBeenCalled();
    const inputs = Array.from(form.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    fireEvent.change(inputs[1], { target: { value: 'Recording the approval letter of 2026-10-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record commitment' }));
    await waitFor(() => expect(onCommitmentRecorded).toHaveBeenCalledTimes(1));
  });

  it('keeps the long basis whole in a full-width field', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Record commitment 4321-1 from the letter' }));
    const basis = screen.getByLabelText(/^Regulatory basis/) as HTMLInputElement;
    expect(basis.value).toBe('FDCA 505(o)(3) · 4321-1');
    expect(basis.closest('.half')).toBeNull();
  });

  it('does not tell a letter that asks nothing to record its questions by hand', async () => {
    const fallback = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string) => path.endsWith('/question-proposals')
      ? Promise.resolve(ok({ success: true, data: { sources: [{ sourceId: 4, title: 'Approval letter.pdf', state: 'read' }], proposals: [] } }))
      : fallback(method, path));
    mount();
    await screen.findByText(/^No numbered questions were found in the letter's text\.$/);
    expect(screen.queryByText(/Record each question by hand/)).toBeNull();
    expect(screen.getByText(/No questions are recorded on this letter\. The letter needs no response\./)).toBeTruthy();
  });
});
