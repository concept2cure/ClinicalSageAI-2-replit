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

describe('a returned session refusal is never a recorded action', () => {
  const reason = 'Record this from the agency letter.';
  const message = 'Your session ended. Sign in again before recording this change.';
  const actions = [
    { open: 'Record question', title: 'Record a question', submit: 'Record question', suffix: '/questions',
      fields: [[/^Question number/, 'Q3'], [/^Question text/, 'Provide the method validation.']] },
    { open: 'Record commitment', title: 'Record a commitment', submit: 'Record commitment', suffix: '/questions/7/commitments',
      fields: [[/^Type/, 'pmc'], [/^What was committed/, 'Provide stability follow-up.']] },
    { open: 'Withdraw question', title: 'Withdraw this question', submit: 'Withdraw question', suffix: '/questions/7/withdraw', fields: [] },
    { open: 'Record section', title: 'Record the section', submit: 'Record section', suffix: '/questions/7',
      fields: [[/^CTD section/, '3.2.P.5.1']] },
    { open: 'Set owner', title: 'Set the owner', submit: 'Record owner', suffix: '/questions/7/owner', fields: [[/^Owner/, '41']] },
    { open: 'Mark as needing no response', title: 'Mark as needing no response', submit: 'Mark as needing no response', suffix: '/no-response-required', fields: [] },
  ] as const;

  it.each(actions)('keeps the $open form and its reason when the server returns 401', async action => {
    const mutations: string[] = [];
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method !== 'GET') {
        mutations.push(url);
        return new Response(JSON.stringify({ error: { code: 'SESSION_IDLE', message } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === `/api/concept2cure/projects/${PID}/team`) return ok({ success: true, data: [{ userId: 41, name: 'Ines Okafor', role: 'member' }] });
      return url === `${BASE}/questions` ? ok(payload(action.suffix === '/no-response-required' ? [] : [question()])) : ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: action.open }));
    const dialog = await screen.findByRole('dialog', { name: action.title });
    if (action.open === 'Set owner') await within(dialog).findByRole('option', { name: 'Ines Okafor (member)' });
    for (const [label, value] of action.fields) fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: reason } });
    fireEvent.click(within(dialog).getByRole('button', { name: action.submit }));
    await waitFor(() => expect(fire).toHaveBeenCalledWith(expect.stringContaining(message), 'error'));
    expect(mutations).toEqual([`${BASE}${action.suffix}`]);
    expect((within(screen.getByRole('dialog', { name: action.title })).getByLabelText(/^Reason/) as HTMLInputElement).value).toBe(reason);
    expect(fire.mock.calls.every(([, tone]) => tone === 'error')).toBe(true);
  });

  it('keeps the exact response edit and base revision after a returned 401', async () => {
    const writes: unknown[] = [];
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'PUT') {
        writes.push(body);
        return new Response(JSON.stringify({ error: { code: 'SESSION_IDLE', message } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return url === `${BASE}/questions` ? ok(payload([question()])) : ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit response' }));
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'Keep this exact response text.' } });
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: reason } });
    fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
    await waitFor(() => expect(fire).toHaveBeenCalledWith(expect.stringContaining(message), 'error'));
    expect(writes).toEqual([{ responseText: 'Keep this exact response text.', expectedRevision: 2, reason }]);
    expect((screen.getByLabelText('Response') as HTMLTextAreaElement).value).toBe('Keep this exact response text.');
    expect((screen.getByLabelText('Reason for this change') as HTMLInputElement).value).toBe(reason);
    expect(fire.mock.calls.every(([, tone]) => tone === 'error')).toBe(true);
  });
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

/* 2026-10-19 (rows D2, D5; P-39 item 1): a question carries the CTD section it
   concerns, so CMC / Module 3 can show the ones about its sections without a
   store of its own. The section is classification, recorded and corrected
   here with a reason; the signature does not cover it. The letter says it is
   overdue in the server's words, the same verdict CMC's count is made of. */
describe('the CTD section on a question, and the letter\'s overdue verdict', () => {
  it('records a question with the section it concerns', async () => {
    let body: Record<string, unknown> | undefined;
    apiRequest.mockImplementation(async (m: string, url: string, b?: Record<string, unknown>) => {
      if (m === 'POST' && url === `${BASE}/questions`) { body = b; return ok({ success: true, data: { id: 8 } }, 201); }
      return url === `${BASE}/questions` ? ok(payload([])) : ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Record question/ }));
    fireEvent.change(screen.getByLabelText(/^Question number/), { target: { value: 'Q2' } });
    fireEvent.change(screen.getByLabelText(/^Question text/), { target: { value: 'Justify the impurity limit.' } });
    fireEvent.change(screen.getByLabelText(/^CTD section/), { target: { value: '3.2.S.4.1' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Recording the IR received 2026-10-12' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Record question/ }).at(-1)!);
    await waitFor(() => expect(body).toMatchObject({ questionRef: 'Q2', ctdSection: '3.2.S.4.1', reason: 'Recording the IR received 2026-10-12' }));
  });

  it('shows the section on the question, and corrects it with a reason', async () => {
    let body: Record<string, unknown> | undefined;
    let url: string | undefined;
    apiRequest.mockImplementation(async (m: string, u: string, b?: Record<string, unknown>) => {
      if (m === 'PATCH') { url = u; body = b; return ok({ success: true, data: question({ ctdSection: '3.2.P.5.1' }) }); }
      return u === `${BASE}/questions` ? ok(payload([question({ ctdSection: '3.2.P.5' })])) : ok({});
    });
    mount();
    expect(await screen.findByText('§3.2.P.5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Correct section/ }));
    fireEvent.change(screen.getByLabelText(/^CTD section/), { target: { value: '3.2.P.5.1' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'The agency cites the method, not the specification' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Correct section/ }).at(-1)!);
    await waitFor(() => expect(body).toEqual({ ctdSection: '3.2.P.5.1', reason: 'The agency cites the method, not the specification' }));
    expect(url).toBe(`${BASE}/questions/7`);
  });

  it('offers no section correction on a closed letter or a withdrawn question', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) =>
      u === `${BASE}/questions`
        ? ok(payload([question({ ctdSection: '3.2.P.5' }), question({ id: 8, questionRef: 'Q2', state: 'withdrawn', withdrawal: { withdrawnAt: null, withdrawnByName: null, reason: 'x' } })], false, [], { letter: { closureStatus: 'closed' } }))
        : ok({}),
    );
    mount();
    expect(await screen.findByText('§3.2.P.5')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Correct section/ })).toBeNull();
  });

  it('says the letter is overdue when the server says so, and only then', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) =>
      u === `${BASE}/questions` ? ok(payload([question()], false, undefined, { letter: { overdue: true, dueDate: '2026-10-01T00:00:00.000Z' } })) : ok({}),
    );
    const first = mount();
    expect(await screen.findByText(/^Overdue:/)).toBeTruthy();
    first.unmount();
    apiRequest.mockImplementation(async (_m: string, u: string) =>
      u === `${BASE}/questions` ? ok(payload([question({ state: 'approved', approval: { signatureId: 1, signerName: 'Dana Reyes', signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval' } })], true, [], { letter: { overdue: false, dueDate: '2026-10-01T00:00:00.000Z' } })) : ok({}),
    );
    mount();
    await screen.findByText(/Approved by Dana Reyes/);
    expect(screen.queryByText(/^Overdue:/)).toBeNull();
  });

  /* Review of 2026-10-19: the overdue note says what made the verdict. A
     response-required letter with nothing recorded is overdue because nothing
     is recorded, not because responses are unapproved: it has none. */
  it('on a letter with no question recorded, the overdue note says that, not "responses not approved"', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) =>
      u === `${BASE}/questions` ? ok(payload([], false, [], { letter: { overdue: true, dueDate: '2026-10-10T00:00:00.000Z' } })) : ok({}),
    );
    mount();
    const note = await screen.findByText(/^Overdue:/);
    expect(note.textContent).toBe('Overdue: past its due date (2026-10-10), with no question recorded.');
    expect(note.textContent).not.toMatch(/responses not approved/);
  });

  it('with questions recorded, it keeps the server\'s reason: responses not approved as they stand', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) =>
      u === `${BASE}/questions` ? ok(payload([question()], false, undefined, { letter: { overdue: true, dueDate: '2026-10-10T00:00:00.000Z' } })) : ok({}),
    );
    mount();
    expect((await screen.findByText(/^Overdue:/)).textContent).toBe('Overdue: past its due date (2026-10-10), with responses not approved as they stand.');
  });

  /* Review of 2026-10-19: a question with no section is offered "Record
     section", which CMC's "not counted" line sends people to; "Correct" is
     only for a section that is recorded. */
  /* Review of 2026-10-19: CMC's free-text assignment went read-only with its
     file; the owner is set here, on the letter, with a reason. */
  it('sets who owns a response, with a reason, from the organisation\'s members, and shows it', async () => {
    let call: [string, string, Record<string, unknown> | undefined] | undefined;
    let owned = false;
    apiRequest.mockImplementation(async (m: string, u: string, b?: Record<string, unknown>) => {
      if (m === 'PATCH') { call = [m, u, b]; owned = true; return ok({ success: true, data: question({ ownerUserId: 41, ownerName: 'Ines Okafor' }) }); }
      if (u === `/api/concept2cure/projects/${PID}/team`) {
        return ok({ success: true, data: [{ userId: 41, name: 'Ines Okafor', role: 'member' }, { userId: 42, name: 'Sam Author', role: 'admin' }] });
      }
      return u === `${BASE}/questions`
        ? ok(payload([owned ? question({ ownerUserId: 41, ownerName: 'Ines Okafor' }) : question()]))
        : ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Set owner' }));
    expect(screen.getByText('Set the owner')).toBeTruthy();
    const select = screen.getByLabelText(/^Owner/) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).map((o) => o.textContent)).toContain('Ines Okafor (member)'));
    fireEvent.change(select, { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Ines leads the dissolution work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record owner' }));
    await waitFor(() => expect(call).toEqual(['PATCH', `${BASE}/questions/7/owner`, { ownerUserId: 41, reason: 'Ines leads the dissolution work' }]));
    expect(await screen.findByText('Owner: Ines Okafor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change owner' })).toBeTruthy();
  });

  it('offers no owner change on a closed letter', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) =>
      u === `${BASE}/questions` ? ok(payload([question({ ownerUserId: 41, ownerName: 'Ines Okafor' })], false, [], { letter: { closureStatus: 'closed' } })) : ok({}),
    );
    mount();
    expect(await screen.findByText('Owner: Ines Okafor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /(Set|Change) owner/ })).toBeNull();
  });

  it('a question with no section is offered "Record section", and the form records one', async () => {
    let body: Record<string, unknown> | undefined;
    apiRequest.mockImplementation(async (m: string, u: string, b?: Record<string, unknown>) => {
      if (m === 'PATCH') { body = b; return ok({ success: true, data: question({ ctdSection: '3.2.P.5.1' }) }); }
      return u === `${BASE}/questions` ? ok(payload([question({ ctdSection: null })])) : ok({});
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Record section' }));
    expect(screen.queryByRole('button', { name: /Correct section/ })).toBeNull();
    expect(screen.getByText('Record the section')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^CTD section/), { target: { value: '3.2.P.5.1' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'The agency cites the dissolution method' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Record section' }).at(-1)!);
    await waitFor(() => expect(body).toEqual({ ctdSection: '3.2.P.5.1', reason: 'The agency cites the dissolution method' }));
  });
});

