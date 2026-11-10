// @vitest-environment jsdom
/**
 * A Module 3 question is answered inside CMC, on its letter's own controls
 * (P-122 inventory, A9).
 *
 * c5168933d (2026-10-19) moved the agency-question workflow to the letter in
 * Communication, where a response is approved under a Part 11 signature, and
 * left CMC a read-only index with an "Open on its letter" door. That
 * convergence stands: one question, one record. What was lost was the place —
 * a CMC lead answering FDA's CMC questions left the Module 3 to do it.
 *
 * What must be true:
 *   • each listed question can be answered here, and "here" is the SAME
 *     component Communication renders (`AgencyResponses`), on the same letter,
 *     reading the letter's own questions endpoint — no second workflow;
 *   • the earlier CMC question file is not written: nothing is posted to
 *     /api/cmc/agency-questions;
 *   • "Open on its letter" still leaves for Communication;
 *   • Done closes the panel.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../_shared/signingPosture', () => ({ useSigningPosture: () => null }));

import { CmcModule3QuestionIndex, CmcQuestionsContextProvider, type CmcQuestionsRead, type Module3Payload } from '../surfaces/cmcAgencyQuestions';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const TOKEN = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const LETTER = { id: 'ace_9', communicationType: 'Information request', receivedDate: '2026-10-12', dueDate: '2026-11-20', closureStatus: 'in_progress', responseRequired: true, overdue: false };
const MODULE3: Module3Payload = {
  module: 3, today: '2026-11-10',
  questions: [{ id: 41, questionRef: 'CMC-3', questionText: 'Provide the batch analyses for the registration batches.', discipline: 'CMC', severity: 'major',
    ctdSection: '3.2.P.5.4', section: '3.2.P.5.4', sectionSource: 'question', state: 'none' as never, outstanding: true, overdue: false, approval: null, owner: null, letter: LETTER }],
  lettersWithoutQuestions: [],
  summary: { questions: 1, outstanding: 1, questionsOverdue: 0, lettersOverdue: 0, lettersWithoutQuestionsOverdue: 0, lettersOverdueOnOtherQuestions: 0 },
  notCounted: { unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 0 }, withheld: 0, truncated: false,
};
const READ: CmcQuestionsRead = {
  projectId: PROJECT,
  module3: { data: MODULE3, loading: false, empty: false },
  earlier: { data: [], loading: false, empty: true },
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data, headers: new Headers() }) as Response;
const LETTER_QUESTIONS = {
  success: true, data: { letter: { id: 'ace_9', communicationType: 'Information request', closureStatus: 'in_progress', dueDate: '2026-11-20', responseRequired: true, closeRefusal: 'Every question needs an approved response.' },
    viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null }, packageReady: false, outstanding: [],
    questions: [{ id: 41, questionRef: 'CMC-3', questionText: 'Provide the batch analyses for the registration batches.', discipline: 'CMC', severity: 'major',
      responseText: '', responseRevision: 0, responseUpdatedByName: null, responseUpdatedAt: null,
      state: 'no_response', approval: null, supersededApproval: null, signRefusal: null, withdrawal: null, history: [], commitments: [] }] },
};

function mount(nav = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CmcQuestionsContextProvider value={READ}><CmcModule3QuestionIndex nav={nav} /></CmcQuestionsContextProvider>
    </QueryClientProvider>,
  );
  return nav;
}

beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(TOKEN, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok(LETTER_QUESTIONS));
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); });

describe('a Module 3 question is answered inside CMC, on its letter', () => {
  it('opens the letter’s own controls here, reading the letter’s questions', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Answer here' }));
    const panel = await screen.findByTestId('cmc-answer-here');
    expect(panel.textContent).toMatch(/CMC-3 — on its letter, Information request/);
    await screen.findByRole('button', { name: 'Record question' });
    const reads = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(reads).toContain(`/api/concept2cure/projects/${PROJECT}/agency-communications/ace_9/questions`);
    expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/cmc/agency-questions') && c[0] !== 'GET')).toBe(false);
  });

  it('keeps the door to Communication, and Done closes the panel', async () => {
    const nav = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Answer here' }));
    await screen.findByTestId('cmc-answer-here');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('cmc-answer-here')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Open on its letter/ }));
    expect(nav).toHaveBeenCalledWith('communication-center');
  });
});
