// @vitest-environment jsdom
/**
 * Meetings & commitments reads the one commitments register through its two
 * doors (2026-10-18, review of 0308ee25).
 *
 * A commitment made in an answer to a project's agency letter belongs to that
 * project: it is read and fulfilled through
 * /api/concept2cure/projects/:pid/commitments, behind project admission and
 * the letter's visibility. The organisation's own commitments stay on
 * /api/ha-interactions. These cases pin that the tab lists both, names the
 * letter and question a project commitment came from, fulfils each through its
 * own door, and shows an error rather than a shorter list when either read
 * fails. The server half is tests/db/agency-response-signed-approval.dbtest.ts
 * ("the commitments register").
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

import { CommunicationCenter } from '../surfaces/CommunicationCenter';

const PID = '22222222-2222-4222-8222-222222222222';
const ORG_URL = '/api/ha-interactions/commitments';
const PROJECT_URL = `/api/concept2cure/projects/${PID}/commitments`;
const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => data, headers: new Headers() }) as unknown as Response;
const failed = () => ({ ok: false, status: 503, json: async () => ({}), headers: new Headers() }) as unknown as Response;

const SIGNED_RULE = { signatureRequired: true, evidenceRequired: true, dateRequired: true };
const fulfilment = (rule = SIGNED_RULE) => ({ rule, state: 'not-fulfilled', recordedBy: null, recordedAt: null, sequence: null, vaultVersion: null, signature: null });
const row = (over: Record<string, unknown>) => ({
  commitment_type: 'pmc', regulatory_basis: null, due_date: '2027-06-30', status: 'open', fulfilled_date: null,
  effectiveStatus: 'open', project_id: null, source_communication_event_id: null, source_question_id: null,
  source_communication_type: null, source_question_ref: null, fulfilment: fulfilment(), ...over,
});
const PROJECT_ROW = row({
  id: 11, description: 'Submit 24-month stability data', project_id: 42, source_communication_event_id: 'ace_1',
  source_question_id: 7, source_communication_type: 'Information request', source_question_ref: 'Q2',
});
const ORG_ROW = row({ id: 12, commitment_type: 'pmr', description: 'Pediatric study (PREA)' });
const MEETING_ROW = row({
  id: 13, commitment_type: 'meeting_commitment', description: 'Send the briefing package',
  fulfilment: fulfilment({ signatureRequired: false, evidenceRequired: false, dateRequired: false }),
});
const options = (id: number, commitmentType: string, signed: boolean) => ({
  success: true,
  data: {
    commitment: { id, commitmentType, status: 'open' },
    rule: signed ? { ...SIGNED_RULE, meanings: ['approval', 'responsibility'] } : { signatureRequired: false, evidenceRequired: false, dateRequired: false, meanings: [] },
    projectLinked: true,
    sequences: [{ id: 5, sequenceNumber: '0042', region: 'fda', type: 'original', dispatchStatus: 'sent', submission: { id: 3, title: 'IND 123456', applicationType: 'ind' } }],
    sequencesTruncated: false,
    vault: { programId: null },
    viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null },
  },
});

const posts: Array<{ url: string; body: unknown }> = [];
const reads: string[] = [];
let projectAnswer: () => Response;

beforeEach(() => {
  (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
  posts.length = 0;
  reads.length = 0;
  projectAnswer = () => ok({ success: true, data: { commitments: [PROJECT_ROW], summary: {} } });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'POST') {
      posts.push({ url, body });
      return ok({ success: true, data: { status: 'fulfilled' }, signedAt: '2026-10-19T10:00:00.000Z' }, 201);
    }
    reads.push(url);
    if (url === ORG_URL) return ok({ success: true, data: { commitments: [ORG_ROW, MEETING_ROW], summary: {} } });
    if (url === PROJECT_URL) return projectAnswer();
    if (url === `${PROJECT_URL}/11/fulfilment-options`) return ok(options(11, 'pmc', true));
    if (url === `${ORG_URL}/12/fulfilment-options`) return ok(options(12, 'pmr', true));
    if (url === `${ORG_URL}/13/fulfilment-options`) return ok(options(13, 'meeting_commitment', false));
    return ok({ success: true, data: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) }) as Response));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

async function openCommitments() {
  // The signature dialog's password check is a react-query mutation; the app provides the client.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={vi.fn()} onNav={vi.fn()} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^Meetings & commitments$/ }));
}

async function openFulfil(description: string) {
  const rowEl = (await screen.findByText(description)).closest('.cc-row') as HTMLElement;
  fireEvent.click(within(rowEl).getByRole('button', { name: 'Record fulfilment' }));
  return screen.findByRole('dialog', { name: 'Record a commitment as fulfilled' });
}

/** A PMR or PMC: name the sequence, then sign. */
async function signFulfil(description: string) {
  const dialog = await openFulfil(description);
  fireEvent.click(await within(dialog).findByLabelText(/Sequence 0042/));
  fireEvent.change(within(dialog).getByLabelText('Date fulfilled'), { target: { value: '2026-10-01' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sign fulfilment' }));
  const esign = await screen.findByRole('dialog', { name: 'Electronic signature' });
  fireEvent.change(within(esign).getByLabelText(/Reason for this action/), { target: { value: 'Final report submitted in sequence 0042.' } });
  fireEvent.change(within(esign).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(esign).getByRole('button', { name: /Sign and commit/ }));
  fireEvent.click(await within(esign).findByRole('button', { name: 'Done' }));
}

describe('Meetings & commitments, through both doors of the one register', () => {
  it("lists the project's commitments, naming the letter and question, beside the organisation's own", async () => {
    await openCommitments();
    expect(await screen.findByText('Submit 24-month stability data')).toBeTruthy();
    expect(screen.getByText('Pediatric study (PREA)')).toBeTruthy();
    expect(screen.getByText(/made in the answer to Q2 of Information request/)).toBeTruthy();
  });

  it("signs a project's PMC through the project's door, and the organisation's PMR through its own", async () => {
    await openCommitments();
    await signFulfil('Submit 24-month stability data');
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([`${PROJECT_URL}/11/fulfill`]));
    expect(reads).toContain(`${PROJECT_URL}/11/fulfilment-options`);
    await signFulfil('Pediatric study (PREA)');
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([`${PROJECT_URL}/11/fulfill`, `${ORG_URL}/12/fulfill`]));
    expect(reads).toContain(`${ORG_URL}/12/fulfilment-options`);
    expect(posts[1].body).toMatchObject({ evidence: { sequenceId: 5 }, meaning: 'responsibility', password: 'correct horse' });
  });

  it("records a meeting commitment with a reason through the organisation's door, with no signature", async () => {
    await openCommitments();
    const dialog = await openFulfil('Send the briefing package');
    fireEvent.change(await within(dialog).findByLabelText(/Reason, and how it was met/), { target: { value: 'Briefing package sent as agreed.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record as fulfilled' }));
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([`${ORG_URL}/13/fulfill`]));
    expect((posts[0].body as Record<string, unknown>).password).toBeUndefined();
  });

  it("shows an error, not the organisation's list alone, when the project's read fails", async () => {
    projectAnswer = failed;
    await openCommitments();
    expect(await screen.findByText("Couldn't load regulatory commitments")).toBeTruthy();
    expect(screen.queryByText('Pediatric study (PREA)')).toBeNull();
  });

  it('says what the empty register will show, without a status the register never returns', async () => {
    projectAnswer = () => ok({ success: true, data: { commitments: [], summary: {} } });
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === ORG_URL || url === PROJECT_URL ? ok({ success: true, data: { commitments: [], summary: {} } }) : ok({ success: true, data: [] }),
    );
    await openCommitments();
    const hint = await screen.findByText(/appear here with their status/);
    expect(hint.textContent).not.toMatch(/on-track|due-soon/);
  });
});
