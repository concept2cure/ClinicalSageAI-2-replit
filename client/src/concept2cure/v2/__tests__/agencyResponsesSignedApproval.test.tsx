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
 *
 * Added after the review of 0308ee25: no control is offered that the server
 * says this person would be refused; a save carries the revision the edit
 * started from, so a second click after a refusal cannot overwrite what
 * someone else saved; a refused signature reloads the record; the approved
 * text of an edited response is read back in its history; a question can be
 * withdrawn and a letter that asks nothing marked so, each with a reason; a
 * commitment shows the register's status (overdue), not the stored one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRequestError } from '@/lib/queryClient';

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
    withdrawal: null,
    history: [],
    commitments: [],
    ...over,
  };
}

const EDITOR = { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null };

function payload(
  questions: unknown[],
  packageReady = false,
  outstanding = [{ questionRef: 'Q1', state: 'drafted' }],
  over: { viewer?: Record<string, unknown>; letter?: Record<string, unknown> } = {},
) {
  return {
    success: true,
    data: {
      letter: {
        id: 'ace_1', communicationType: 'Information request', closureStatus: 'in_progress', dueDate: null,
        responseRequired: true, closeRefusal: packageReady ? null : 'Q1 (not approved) must be approved before the letter is closed.',
        ...over.letter,
      },
      viewer: { ...EDITOR, ...over.viewer },
      questions,
      outstanding: packageReady ? [] : outstanding,
      packageReady,
    },
  };
}

const refused = (status: number, code: string, message: string) => new ApiRequestError(message, status, undefined, code);

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

describe('after the review of 0308ee25', () => {
  it('offers a viewer no write or sign control, and says why once', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions`
        ? ok(payload([question()], false, undefined, {
            viewer: { canWrite: false, writeRefusal: 'You have view access to this project; an editor records and answers questions.', canSign: false },
          }))
        : ok({}),
    );
    mount();
    expect(await screen.findByText(/You can read the questions and responses on this letter\. You have view access/)).toBeTruthy();
    for (const name of [/Record question/, /Edit response/, /Approve response/, /Record commitment/, /Withdraw question/]) {
      expect(screen.queryByRole('button', { name }), String(name)).toBeNull();
    }
  });

  it('tells an editor without signing authority why they cannot approve, before the dialog', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions`
        ? ok(payload([question()], false, undefined, { viewer: { canSign: false, signAuthorityRefusal: 'You do not hold signing authority in this organization.' } }))
        : ok({}),
    );
    mount();
    const approve = await screen.findByRole('button', { name: /Approve response/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You do not hold signing authority in this organization.')).toBeTruthy();
  });

  it('a second Save after a refusal still sends the revision the edit started from', async () => {
    let revision = 2;
    const sent: unknown[] = [];
    apiRequest.mockImplementation(async (m: string, url: string, body?: Record<string, unknown>) => {
      if (url === `${BASE}/questions`) return ok(payload([question({ responseRevision: revision, responseText: `Text of revision ${revision}.` })]));
      if (m === 'PUT' && url === `${BASE}/questions/7/response`) {
        sent.push(body?.expectedRevision);
        revision = 3; // someone else saved meanwhile
        throw refused(409, 'RESPONSE_CHANGED', 'The response was changed by someone else (now revision 3). Reload it before saving.');
      }
      return ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Edit response/ }));
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'My text.' } });
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: 'Answering from the report' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
    expect(await screen.findByText(/Someone saved revision 3 while you were editing revision 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
    await waitFor(() => expect(sent).toEqual([2, 2]));
    expect((screen.getByLabelText('Response') as HTMLTextAreaElement).value).toBe('My text.');
  });

  it('a refused signature reloads the record when the dialog closes', async () => {
    let reads = 0;
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (url === `${BASE}/questions`) {
        reads += 1;
        return ok(payload([question({ responseRevision: reads > 1 ? 3 : 2 })]));
      }
      if (m === 'POST' && url === `${BASE}/questions/7/approve`) {
        throw refused(409, 'RESPONSE_CHANGED', 'The response changed after you opened it. Nothing was signed.');
      }
      return ok({});
    });
    mount();
    stubPasswordCheck();
    fireEvent.click(await screen.findByRole('button', { name: /Approve response/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'I reviewed against the report.' } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    expect(await within(dialog).findByText(/Nothing was signed\. Close this dialog to see the response as it now stands\./)).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole('button', { name: /Cancel/ })[0]);
    await waitFor(() => expect(reads).toBe(2));
    expect(await screen.findByText(/^Revision 3/)).toBeTruthy();
  });

  it('reads back the approved text of an edited response in its history', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions`
        ? ok(payload([question({
            state: 'changed-after-approval',
            responseText: 'Edited text.',
            supersededApproval: { signatureId: 50, signerName: 'Dana Reyes', signedAt: '2026-10-17T10:00:00.000Z', meaning: 'approval' },
            history: [
              { revision: 2, responseText: 'Edited text.', writtenByName: 'Sam Author', writtenAt: '2026-10-18T09:00:00.000Z', reason: 'Added the batch table', approvedBy: null },
              { revision: 1, responseText: 'Approved text.', writtenByName: 'Sam Author', writtenAt: '2026-10-17T09:00:00.000Z', reason: 'First draft', approvedBy: { signatureId: 50, signerName: 'Dana Reyes', signedAt: '2026-10-17T10:00:00.000Z', meaning: 'approval' } },
            ],
          })], false, [{ questionRef: 'Q1', state: 'changed-after-approval' }]))
        : ok({}),
    );
    mount();
    fireEvent.click(await screen.findByText('History · 2 texts'));
    expect(screen.getByText('Approved text.')).toBeTruthy();
    expect(screen.getByText(/Revision 1, written by Sam Author on .*Reason: First draft/)).toBeTruthy();
    expect(screen.getByText(/^Approved by Dana Reyes on .*signature 50\.$/)).toBeTruthy();
    expect(screen.getByText('Not approved.')).toBeTruthy();
  });

  it('withdraws a question with a reason, and shows it withdrawn', async () => {
    let withdrawn = false;
    let body: Record<string, unknown> | undefined;
    apiRequest.mockImplementation(async (m: string, url: string, b?: Record<string, unknown>) => {
      if (url === `${BASE}/questions`) {
        return ok(payload([withdrawn
          ? question({ state: 'withdrawn', withdrawal: { withdrawnAt: '2026-10-18T11:00:00.000Z', withdrawnByName: 'Dana Reyes', reason: 'Recorded twice' } })
          : question()], false, [], { letter: { closeRefusal: withdrawn ? 'This letter requires a response and no question is recorded on it.' : null } }));
      }
      if (m === 'POST' && url === `${BASE}/questions/7/withdraw`) {
        body = b;
        withdrawn = true;
        return ok({ success: true }, 200);
      }
      return ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw question' }));
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Recorded twice' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw question' }).at(-1)!);
    await waitFor(() => expect(body).toEqual({ reason: 'Recorded twice' }));
    expect(await screen.findByText(/Withdrawn by Dana Reyes on .*: Recorded twice\. It needs no response and is left out of the package\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit response/ })).toBeNull();
  });

  it('a letter that requires a response and records no question says why it cannot close, and can be marked as asking nothing', async () => {
    let body: Record<string, unknown> | undefined;
    apiRequest.mockImplementation(async (m: string, url: string, b?: Record<string, unknown>) => {
      if (url === `${BASE}/questions`) {
        return ok(payload([], false, [], { letter: { closeRefusal: 'This letter requires a response and no question is recorded on it. Record each question and approve each response before closing it.' } }));
      }
      if (m === 'POST' && url === `${BASE}/no-response-required`) {
        body = b;
        return ok({ success: true }, 200);
      }
      return ok({});
    });
    mount();
    expect(await screen.findByText(/This letter requires a response and no question is recorded on it/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as needing no response' }));
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Acknowledgement letter; it asks nothing' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as needing no response' }).at(-1)!);
    await waitFor(() => expect(body).toEqual({ reason: 'Acknowledgement letter; it asks nothing' }));
  });

  it("shows a commitment's status as the register reads it: past due reads overdue", async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `${BASE}/questions`
        ? ok(payload([question({
            commitments: [{ id: 3, commitmentType: 'pmc', description: 'Submit 24-month stability', dueDate: '2026-01-31', regulatoryBasis: null, status: 'open', effectiveStatus: 'overdue' }],
          })]))
        : ok({}),
    );
    mount();
    const status = await screen.findByText('overdue');
    expect(status.getAttribute('data-tone')).toBe('err');
    expect(screen.queryByText('open')).toBeNull();
  });
});
