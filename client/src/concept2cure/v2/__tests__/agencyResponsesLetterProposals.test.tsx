// @vitest-environment jsdom
/**
 * G3: the letter's numbered questions are proposed in its Questions and
 * responses panel. "Record" opens the Record-a-question form filled with the
 * agency's number and words, and nothing is written until the person records
 * it with a reason. A question already recorded says so.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../_shared/signingPosture', () => ({ useSigningPosture: () => null }));
import { AgencyResponses } from '../surfaces/AgencyResponses';
import type { CommRow } from '../surfaces/AgencyInbox';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const TOKEN = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const letter = { id: 'ace_1', sourceType: 'uploaded_official_correspondence', communicationType: 'Information request',
  sourceChannel: 'esg', linkedSectionCodes: [], receivedDate: '2026-10-12T00:00:00Z', urgency: 'high', responseRequired: true,
  extractedIssues: [], humanReviewStatus: 'triaged', closureStatus: 'in_progress' } as CommRow;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data, headers: new Headers() }) as Response;
const QUESTIONS = { success: true, data: { letter: { id: 'ace_1', communicationType: 'Information request', closureStatus: 'in_progress',
  dueDate: null, responseRequired: true, closeRefusal: null },
  viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null }, packageReady: false, outstanding: [], questions: [] } };
const Q1 = 'Provide the batch analysis data for the drug substance lots used in the toxicology studies.';
const PROPOSALS = { success: true, data: {
  sources: [{ sourceId: 4, title: 'IR letter.pdf', state: 'read' }],
  proposals: [
    { sourceId: 4, ref: '1', text: Q1, start: 120, end: 120 + Q1.length, recordedQuestionId: null },
    { sourceId: 4, ref: '2', text: 'Clarify the starting dose rationale.', start: 240, end: 276, recordedQuestionId: 31 },
  ] } };

beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(TOKEN, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, path: string) =>
    Promise.resolve(ok(path.endsWith('/question-proposals') ? PROPOSALS : QUESTIONS)));
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); });

describe("the letter's numbered questions, proposed (G3)", () => {
  it('fills the Record-a-question form from a proposal, and writes nothing until the person records it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgencyResponses projectId="42" letter={letter} fire={vi.fn()} onNav={vi.fn()} /></QueryClientProvider>);
    await screen.findByText(/In the letter: 2 numbered questions, found in its text without AI/);
    expect(screen.getByText('Recorded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record question 2 from the letter' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Record question 1 from the letter' }));
    const form = screen.getByRole('dialog', { name: 'Record a question' });
    expect((form.querySelector('input[name="questionRef"], #questionRef, input') as HTMLInputElement).value).toBe('1');
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe(Q1);
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toEqual([]);
  });
});
