// @vitest-environment jsdom
/**
 * A link from another screen opens one letter in Communication (2026-10-19,
 * rows D2 and D5; decisions P-38, P-39 item 1).
 *
 * CMC / Module 3 no longer keeps agency questions of its own. Its Module 3
 * index reads them from the letters and, for each, offers one door: open it on
 * its letter, in Communication, where it is recorded, answered and approved.
 * That door is the repository's navigation-params channel (navParams.ts), the
 * one CommitmentRow, TaskBoard and Submission Center already use: CMC stashes
 * `{ letterId, questionId }` for 'communication-center' and navigates.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 *   • on mount, Communication consumes the params once, shows the inbox with
 *     every owner, opens THAT letter's card and moves focus to it;
 *   • when it is already mounted, the channel's event does the same;
 *   • a letter that is not in this project's inbox (deleted, withheld from the
 *     person, another project's) is said to be so, and no other letter opens;
 *   • an id that is not id-shaped is ignored, and opens nothing.
 *
 * This is the reachability gate the deletion record of CMC's question writes
 * names: every act CMC lost is reached through this door.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (original) => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 9, displayName: 'Dana Reyes', email: 'dana@example.invalid', mfaEnabled: false }),
}));

import { CommunicationCenter } from '../surfaces/CommunicationCenter';
import { stashNavParamsForTarget } from '../navParams';

const PID = '22222222-2222-4222-8222-222222222222';
const COMMS_URL = `/api/concept2cure/projects/${PID}/agency-communications`;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data, headers: new Headers() }) as unknown as Response;
const row = (id: string, type: string) => ({
  id, sourceType: 'uploaded_official_correspondence', communicationType: type, sourceChannel: 'esg',
  linkedSectionCodes: [], linkedArtifactIds: [], receivedDate: '2026-10-16T09:00:00.000Z', urgency: 'high',
  responseRequired: true, extractedIssues: [], humanReviewStatus: 'triaged', closureStatus: 'open',
  auditMetadata: { visibilityTier: 'shared_client_c2c' },
});
const questions = (letter: string) => ({
  success: true,
  data: {
    letter: { id: letter, communicationType: 'IR', closureStatus: 'open', dueDate: null, responseRequired: true, closeRefusal: null, overdue: false },
    viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null },
    questions: [{
      id: 31, questionRef: 'Q4', questionText: 'Justify the impurity limit for the des-methyl degradant.', discipline: 'CMC', severity: 'major',
      ctdSection: '3.2.S.4.1', responseText: '', responseRevision: 0, responseUpdatedByName: null, responseUpdatedAt: null,
      state: 'unanswered', approval: null, supersededApproval: null, signRefusal: null, withdrawal: null, history: [], commitments: [],
    }],
    outstanding: [{ questionRef: 'Q4', state: 'unanswered' }],
    packageReady: false,
  },
});

const reads = () => (apiRequest.mock.calls as Array<[string, string]>).filter(([m, u]) => m === 'GET' && /\/questions$/.test(u)).map(([, u]) => u);
const props = { surface: 'communication-center' as never, segment: 'biotech', onAsk: vi.fn(), onNav: vi.fn() };

beforeEach(() => {
  (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === COMMS_URL) return ok({ success: true, data: [row('ace_1', 'Acknowledgement'), row('ace_2', 'Information request 4')] });
    const m = /agency-communications\/(ace_\d)\/questions$/.exec(url);
    if (m) return ok(questions(m[1]));
    return ok({ success: true, data: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  delete (window as { C2C_NAV_PARAMS?: unknown }).C2C_NAV_PARAMS;
});

describe('Communication opens the letter another screen links to', () => {
  it('on mount: the inbox, that letter\'s card open with its questions, focus on it', async () => {
    stashNavParamsForTarget('communication-center', { letterId: 'ace_2', questionId: '31' });
    render(<CommunicationCenter {...props} />);
    expect(await screen.findByText('Justify the impurity limit for the des-methyl degradant.')).toBeTruthy();
    expect(reads()).toEqual([`${COMMS_URL}/ace_2/questions`]);
    const card = document.querySelector('[data-letter-id="ace_2"]') as HTMLElement;
    expect(card).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(document.querySelector('[data-question-id="31"]')?.getAttribute('data-targeted')).toBe('true');
    // Consumed once: the channel is empty, so a later visit opens nothing.
    expect((window as { C2C_NAV_PARAMS?: unknown }).C2C_NAV_PARAMS).toBeUndefined();
  });

  it('when already mounted, the channel\'s event opens the letter', async () => {
    render(<CommunicationCenter {...props} />);
    expect(await screen.findByText('Information request 4')).toBeTruthy();
    expect(reads()).toEqual([]);
    await act(async () => { stashNavParamsForTarget('communication-center', { letterId: 'ace_2' }); });
    expect(await screen.findByText('Justify the impurity limit for the des-methyl degradant.')).toBeTruthy();
    expect(reads()).toEqual([`${COMMS_URL}/ace_2/questions`]);
  });

  it('a letter that is not in this project\'s inbox is said to be so, and no other letter opens', async () => {
    stashNavParamsForTarget('communication-center', { letterId: 'ace_9' });
    render(<CommunicationCenter {...props} />);
    expect(await screen.findByText(/That letter is not in this project's inbox, or you cannot open it\./)).toBeTruthy();
    expect(reads()).toEqual([]);
  });

  /* Review of 2026-10-19: the inbox adopted its read in an effect, after the
     render in which the read settled, so one committed frame held the read as
     settled and the list as empty. In it, a linked letter that WAS listed got
     the role="alert" refusal, and the inbox said it had no communications. */
  it('never says, even for one frame, that a listed letter is absent, or that the inbox is empty', async () => {
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      if (/That letter is not in this project's inbox/.test(document.body.textContent ?? '')) seen.push('absent');
      if (document.querySelector('[role="alert"]')) seen.push('alert');
      if (/No agency communications yet/.test(document.body.textContent ?? '')) seen.push('empty');
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    stashNavParamsForTarget('communication-center', { letterId: 'ace_2', questionId: '31' });
    render(<CommunicationCenter {...props} />);
    expect(await screen.findByText('Justify the impurity limit for the des-methyl degradant.')).toBeTruthy();
    observer.disconnect();
    expect([...new Set(seen)]).toEqual([]);
  });

  it('the card a link opened is a region named by its own title, never a role-less div with a label', async () => {
    stashNavParamsForTarget('communication-center', { letterId: 'ace_2' });
    render(<CommunicationCenter {...props} />);
    const region = await screen.findByRole('region', { name: 'Information request 4 opened from a link' });
    await waitFor(() => expect(document.activeElement).toBe(region));
    expect(document.querySelector('div[aria-label]:not([role])')).toBeNull();
    // Its content is not replaced by a label: the due line and actions stay readable inside it.
    expect(region.textContent).toMatch(/received 2026-10-16/);
  });

  it('an id that is not id-shaped opens nothing', async () => {
    stashNavParamsForTarget('communication-center', { letterId: '<img src=x>' });
    render(<CommunicationCenter {...props} />);
    expect(await screen.findByText('Information request 4')).toBeTruthy();
    expect(reads()).toEqual([]);
    expect(screen.queryByText(/That letter is not in this project's inbox/)).toBeNull();
  });
});
