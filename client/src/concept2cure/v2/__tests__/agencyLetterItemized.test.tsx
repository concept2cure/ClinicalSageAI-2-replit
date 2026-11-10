// @vitest-environment jsdom
/**
 * Itemizing an agency letter from the project inbox (P-122, 2026-11-10).
 *
 * The deterministic deficiency parser (server/services/regulatory-correspondence/issue-parser.ts, keyword rules, no
 * model) lost its last client caller in e3a2d0475. It is reached from the letter's own proposals
 * (GET …/question-proposals, letter-question-proposals.ts): each proposed question carries what the rules read
 * in it, and a letter that numbers nothing has its deficiencies itemized. In the letter's Questions and responses:
 *   - each proposed question says, in words, what the rules found ("Keyword rules, no AI: CMC and quality");
 *   - "Record" fills the form with the agency's words and the rules' suggestion (severity, CTD section, discipline),
 *     and nothing is written until the person records it with a reason;
 *   - a letter with no numbered question lists the passages the rules itemized, each recordable the same way, with
 *     the agency's number left for the person to give.
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
const STABILITY = 'Submit the 6-month stability results for drug product lot C2C101-DP-2501.';
const cmc = { topics: [{ label: 'CMC and quality', severity: 'high', sections: ['3.2.S', '3.2.P'] }],
  suggested: { severity: 'major', ctdSection: '3.2.S', discipline: 'CMC' } };
const none = { topics: [{ label: 'Not classified', severity: 'low', sections: [] }], suggested: { severity: 'major', ctdSection: null, discipline: null } };
const NUMBERED = { success: true, data: {
  sources: [{ sourceId: 4, title: 'IR letter.pdf', state: 'read' }],
  proposals: [
    { sourceId: 4, ref: '3', text: STABILITY, start: 300, end: 300 + STABILITY.length, recordedQuestionId: null, classification: cmc },
    { sourceId: 4, ref: '4', text: 'Provide the batch records.', start: 400, end: 426, recordedQuestionId: null, classification: none },
  ],
  deficiencies: [] } };
const PROSE = 'The safety database does not characterize the risk of serious infections at the higher dose.';
const UNNUMBERED = { success: true, data: {
  sources: [{ sourceId: 4, title: 'Deficiency letter.pdf', state: 'read' }], proposals: [],
  deficiencies: [{ sourceId: 4, text: PROSE, start: 80, end: 80 + PROSE.length,
    classification: { topics: [{ label: 'Clinical safety', severity: 'high', sections: ['2.5', '2.7.4'] }],
      suggested: { severity: 'major', ctdSection: '2.5', discipline: 'Safety' } } }] } };

function serve(proposals: unknown) {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, path: string) => Promise.resolve(ok(path.endsWith('/question-proposals') ? proposals : QUESTIONS)));
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AgencyResponses projectId="42" letter={letter} fire={vi.fn()} onNav={vi.fn()} /></QueryClientProvider>);
}
/** A form field by its key (C2CForm gives each the id `<form id>-<key>`). */
const field = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[id$="-${name}"]`);

beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(TOKEN, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); });

describe('the deficiency parser, reached from the letter in the project inbox', () => {
  it('says what the keyword rules read in each proposed question', async () => {
    serve(NUMBERED);
    mount();
    expect(await screen.findByText('Keyword rules, no AI: CMC and quality · major · 3.2.S')).toBeTruthy();
    expect(screen.getByText('Keyword rules, no AI: no topic found; classify it yourself')).toBeTruthy();
  });

  it('"Record" fills the form with the agency\'s words and the rules\' suggestion, and writes nothing', async () => {
    serve(NUMBERED);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Record question 3 from the letter' }));
    const form = screen.getByRole('dialog', { name: 'Record a question' });
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe(STABILITY);
    expect(field(form, 'ctdSection')?.value).toBe('3.2.S');
    expect(field(form, 'discipline')?.value).toBe('CMC');
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toEqual([]);
  });

  it('itemizes the deficiencies of a letter that numbers nothing, each recordable with a number the person gives', async () => {
    serve(UNNUMBERED);
    mount();
    expect(await screen.findByText(/The keyword rules itemized 1 deficiency in the letter's text, without AI/)).toBeTruthy();
    expect(screen.getByText('Keyword rules, no AI: Clinical safety · major · 2.5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record deficiency 1 from the letter as a question' }));
    const form = screen.getByRole('dialog', { name: 'Record a question' });
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe(PROSE);
    expect(field(form, 'questionRef')?.value).toBe('');
    expect(field(form, 'discipline')?.value).toBe('Safety');
  });

  it('a letter that asks nothing (an approval letter) is not itemized as deficiencies', async () => {
    apiRequest.mockReset();
    const asksNothing = { ...QUESTIONS, data: { ...QUESTIONS.data, letter: { ...QUESTIONS.data.letter, responseRequired: false } } };
    apiRequest.mockImplementation((_m: string, path: string) => Promise.resolve(ok(path.endsWith('/question-proposals') ? UNNUMBERED : asksNothing)));
    mount();
    await screen.findByText(/No numbered questions were found/);
    expect(screen.queryByTestId('letter-deficiencies')).toBeNull();
  });
});
