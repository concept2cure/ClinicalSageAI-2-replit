// @vitest-environment jsdom
/** A letter, its questions and open action forms belong to the current visit. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
function payload(eventId = 'ace_1') {
  return { success: true, data: { letter: { id: eventId, communicationType: 'Information request', closureStatus: 'in_progress',
    dueDate: null, responseRequired: true, closeRefusal: 'Approval is required.' },
  viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null }, packageReady: false, outstanding: [],
  questions: [{ id: 7, questionRef: 'Q1', questionText: 'Only the preceding letter may show this question.', discipline: 'CMC', severity: 'major',
    responseText: 'Previously saved answer.', responseRevision: 2, responseUpdatedByName: 'Sam Author', responseUpdatedAt: '2026-10-18T09:00:00Z',
    state: 'drafted', approval: null, supersededApproval: null, signRefusal: null, withdrawal: null, history: [], commitments: [] }] } };
}
function login() { authService.setToken(TOKEN, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600); }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const fire = vi.fn();
  const view = render(<QueryClientProvider client={client}><AgencyResponses projectId="42" letter={letter} fire={fire} onNav={vi.fn()} /></QueryClientProvider>);
  return { ...view, next: (eventId: string) => view.rerender(<QueryClientProvider client={client}><AgencyResponses projectId="42" letter={{ ...letter, id: eventId }} fire={fire} onNav={vi.fn()} /></QueryClientProvider>) };
}
beforeEach(() => { authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); login(); apiRequest.mockReset(); });
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); });

describe('current authority letter and session', () => {
  it('retires preceding letter questions and open action forms while the next read is pending', async () => {
    apiRequest.mockImplementation((_method: string, path: string) => path.includes('ace_2') ? new Promise(() => {}) : Promise.resolve(ok(payload())));
    const view = mount(); await screen.findByText('Only the preceding letter may show this question.');
    fireEvent.click(screen.getByRole('button', { name: 'Record question' }));
    expect(screen.getByRole('dialog', { name: 'Record a question' })).toBeTruthy(); view.next('ace_2');
    expect(screen.queryByText('Only the preceding letter may show this question.')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Record a question' })).toBeNull();
  });
  it('retires a previous session snapshot even when the same actor logs in again', async () => {
    let changed = false;
    apiRequest.mockImplementation(() => changed ? new Promise(() => {}) : Promise.resolve(ok(payload())));
    mount(); await screen.findByText('Only the preceding letter may show this question.');
    fireEvent.click(screen.getByRole('button', { name: 'Record question' }));
    await act(async () => { changed = true; authService.endSession(null); login(); });
    expect(screen.queryByText('Only the preceding letter may show this question.')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Record a question' })).toBeNull();
  });
  it('refuses a successful payload that names a different letter', async () => {
    apiRequest.mockResolvedValue(ok(payload('ace_other'))); mount();
    await screen.findByText("Couldn't load the questions on this letter");
    expect(screen.queryByText('Only the preceding letter may show this question.')).toBeNull();
  });
});
