// @vitest-environment jsdom
/**
 * The questions on an agency letter, as a person works them (2026-10-18).
 *
 * The screen decides nothing: a response's state, whether this person may
 * sign it and whether the package is ready are the server's words. These
 * cases pin that it shows them as said: an author is told before the dialog
 * that they cannot approve their own answer; an approval is the Part 11
 * dialog forwarding meaning, reason, password and the revision read; a text
 * changed after approval says so and names who approved the earlier text;
 * the package is offered only when the server says every response is
 * approved. The server half is tests/db/agency-response-signed-approval.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ id: 9, displayName: 'Dana Reyes', email: 'dana@example.invalid', mfaEnabled: false }),
}));
vi.mock('../../_shared/signingPosture', () => ({ useSigningPosture: () => null }));

import { AgencyResponses } from '../surfaces/AgencyResponses';
import type { CommRow } from '../surfaces/AgencyInbox';

const PID = '42';
const BASE = `/api/concept2cure/projects/${PID}/agency-communications/ace_1`;
const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => data, headers: new Headers() }) as unknown as Response;

const LETTER: CommRow = {
  id: 'ace_1',
  sourceType: 'uploaded_official_correspondence',
  communicationType: 'Information request',
  sourceChannel: 'esg',
  linkedSectionCodes: [],
  receivedDate: '2026-10-12T00:00:00.000Z',
  urgency: 'high',
  responseRequired: true,
  extractedIssues: [],
  humanReviewStatus: 'triaged',
  closureStatus: 'in_progress',
};

function question(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    questionRef: 'Q1',
    questionText: 'Provide the dissolution method validation report.',
    discipline: 'CMC',
    severity: 'major',
    responseText: 'Provided in 3.2.P.5.3.',
    responseRevision: 2,
    responseUpdatedByName: 'Sam Author',
    responseUpdatedAt: '2026-10-18T09:00:00.000Z',
    state: 'drafted',
    approval: null,
    supersededApproval: null,
    signRefusal: null,
    commitments: [],
    ...over,
  };
}

function payload(questions: unknown[], packageReady = false, outstanding = [{ questionRef: 'Q1', state: 'drafted' }]) {
  return {
    success: true,
    data: {
      letter: { id: 'ace_1', communicationType: 'Information request', closureStatus: 'in_progress', dueDate: null },
      questions,
      outstanding: packageReady ? [] : outstanding,
      packageReady,
    },
  };
}

const fire = vi.fn();

beforeEach(() => {
  apiRequest.mockReset();
  fire.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The password pre-check the dialog runs (POST /api/esignature/verify-password). */
function stubPasswordCheck() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) }) as Response));
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AgencyResponses projectId={PID} letter={LETTER} fire={fire} />
    </QueryClientProvider>,
  );
}

describe('the questions on an agency letter', () => {
  it("tells the author, before any dialog, that they cannot approve their own answer", async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions`
        ? ok(payload([question({ signRefusal: { code: 'SIGNER_WROTE_RESPONSE', message: 'You wrote the current response to Q1, so someone else must approve it.' } })]))
        : ok({}),
    );
    mount();
    const approve = await screen.findByRole('button', { name: /Approve response/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/someone else must approve it/)).toBeTruthy();
  });

  it('approves through the Part 11 dialog, forwarding meaning, reason, password and the revision read', async () => {
    let approved = false;
    apiRequest.mockImplementation(async (m: string, url: string, body?: Record<string, unknown>) => {
      if (url === `${BASE}/questions`) {
        return ok(payload(approved
          ? [question({ state: 'approved', approval: { signatureId: 51, signerName: 'Dana Reyes', signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval' } })]
          : [question()], approved));
      }
      if (m === 'POST' && url === `${BASE}/questions/7/approve`) {
        expect(body).toMatchObject({ meaning: 'approval', password: 'correct horse', expectedRevision: 2 });
        expect(String(body?.reason)).toMatch(/reviewed against the report/);
        approved = true;
        return ok({ success: true, data: { questionId: 7, state: 'approved' }, signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval', signatureId: 51 }, 201);
      }
      return ok({});
    });
    mount();
    stubPasswordCheck();
    fireEvent.click(await screen.findByRole('button', { name: /Approve response/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/exact response text shown \(revision 2\)/);
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'I reviewed against the report and the batch data.' } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    await waitFor(() => expect(approved).toBe(true));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Done|Close/ }));
    expect(await screen.findByText(/Approved by Dana Reyes on .*signature 51/)).toBeTruthy();
  });

  it('says when a response changed after approval, and names the earlier approval', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions`
        ? ok(payload([question({ state: 'changed-after-approval', supersededApproval: { signatureId: 50, signerName: 'Dana Reyes', signedAt: '2026-10-17T10:00:00.000Z', meaning: 'approval' } })], false, [{ questionRef: 'Q1', state: 'changed-after-approval' }]))
        : ok({}),
    );
    mount();
    expect(await screen.findByText(/Approved earlier by Dana Reyes .*signature 50\. The response has changed since, so it needs a new signature\./)).toBeTruthy();
    expect(screen.getByText('Changed after approval')).toBeTruthy();
  });

  it('offers the package only when the server says every response is approved', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions` ? ok(payload([question()], false)) : ok({}),
    );
    mount();
    const pkg = await screen.findByRole('button', { name: /Response package \(\.docx\)/ });
    expect((pkg as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Available when every response is approved\. Outstanding: Q1 \(Draft\)\./)).toBeTruthy();
  });

  it('says so when the questions cannot be read, rather than showing none', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}), headers: new Headers() }) as unknown as Response);
    mount();
    expect(await screen.findByText(/Couldn't load the questions on this letter/)).toBeTruthy();
    expect(screen.queryByText(/No questions are recorded/)).toBeNull();
  });
});
