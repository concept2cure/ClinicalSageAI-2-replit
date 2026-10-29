// @vitest-environment jsdom
/**
 * Meetings & commitments: a fulfilment names what met it (rows D2 and D5,
 * 2026-10-19; decision P-41).
 *
 * Recording a PMR, PMC or REMS as fulfilled is a Part 11 signed act that names
 * the dispatched sequence the agency received or the Vault version that met it,
 * on a date the signer is shown. A meeting commitment or other is recorded with
 * a reason. A fulfilled row says what met it, who signed it, and whether the
 * signature still matches the record; evidence in a project the reader cannot
 * open is said to be there and not named. These cases pin the screen; the
 * server half is tests/db/commitment-fulfilment-evidence.dbtest.ts and
 * tests/db/commitment-fulfilment-database.dbtest.ts.
 *
 * The review of 2026-10-19 added the cases under "what the review found": the
 * version's project and sha256 shown before signing; the project's Vault only;
 * the server's own refusal of the options; an outcome that could not be
 * confirmed; an empty date; one full stop; where focus goes; the type's name;
 * and how many matched.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({ stash: vi.fn(), vault: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ id: 9, displayName: 'Dana Reyes', email: 'dana@example.invalid', mfaEnabled: false }),
}));
vi.mock('../../_shared/signingPosture', () => ({ useSigningPosture: () => null }));
vi.mock('../navParams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navParams')>()),
  stashNavParamsForTarget: nav.stash,
}));
vi.mock('../vaultTarget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../vaultTarget')>()),
  setVaultTarget: nav.vault,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { CommunicationCenter } from '../surfaces/CommunicationCenter';

const PID = '42';
const PROGRAM = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const HASH = 'abcdef0123456789'.repeat(4);
const ORG_URL = '/api/ha-interactions/commitments';
const PROJECT_URL = `/api/concept2cure/projects/${PID}/commitments`;
const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => data, headers: new Headers() }) as unknown as Response;
const failed = () => ({ ok: false, status: 503, json: async () => ({}), headers: new Headers() }) as unknown as Response;

const SIGNED_RULE = { signatureRequired: true, evidenceRequired: true, dateRequired: true };
const UNSIGNED_RULE = { signatureRequired: false, evidenceRequired: false, dateRequired: false };
const openFulfilment = (rule = SIGNED_RULE) => ({
  rule, state: 'not-fulfilled', recordedBy: null, recordedAt: null, sequence: null, vaultVersion: null, signature: null,
});
const row = (over: Record<string, unknown>) => ({
  commitment_type: 'pmr', regulatory_basis: null, due_date: '2027-06-30', status: 'open', fulfilled_date: null,
  effectiveStatus: 'open', project_id: null, source_communication_event_id: null, source_question_id: null,
  source_communication_type: null, source_question_ref: null, fulfilment: openFulfilment(), ...over,
});
const PROJECT_PMR = row({ id: 11, description: 'Pediatric study under PREA', project_id: 42 });
const ORG_MEETING = row({ id: 12, commitment_type: 'meeting_commitment', description: 'Send the briefing package', fulfilment: openFulfilment(UNSIGNED_RULE) });
const SIGNED_ROW = row({
  id: 13, description: 'Final CSR for study 301', status: 'fulfilled', effectiveStatus: 'fulfilled', fulfilled_date: '2026-10-01',
  fulfilment: {
    rule: SIGNED_RULE, state: 'signed', recordedBy: { id: 9, name: 'Dana Reyes' }, recordedAt: '2026-10-19T10:00:00.000Z',
    sequence: { readable: true, id: 5, sequenceNumber: '0042', region: 'fda', dispatchStatus: 'acknowledged', filed: true, removed: false, submissionId: 3, submissionTitle: 'IND 123456', applicationType: 'ind', programId: PROGRAM },
    vaultVersion: { readable: true, id: DOC, title: 'Final CSR', version: '2.0', programId: PROGRAM, sha256: 'a'.repeat(64), superseded: true, removed: false, dataWithdrawn: false },
    signature: { signatureId: 77, signerName: 'Dana Reyes', signedAt: '2026-10-19T10:00:00.000Z', meaning: 'responsibility', bindsRecord: true },
  },
});
const fulfilledAs = (id: number, description: string, fulfilment: Record<string, unknown>) =>
  row({ id, description, status: 'fulfilled', effectiveStatus: 'fulfilled', fulfilled_date: '2026-01-01', fulfilment: { ...openFulfilment(), recordedBy: null, recordedAt: null, ...fulfilment } });

const OPTIONS = {
  commitment: { id: 11, commitmentType: 'pmr', status: 'open' },
  rule: { ...SIGNED_RULE, meanings: ['approval', 'responsibility'] },
  projectLinked: true,
  sequences: [{ id: 5, sequenceNumber: '0042', region: 'fda', type: 'original', dispatchStatus: 'sent', submission: { id: 3, title: 'IND 123456', applicationType: 'ind' } }],
  sequencesTruncated: false,
  vault: { programId: PROGRAM },
  viewer: { canWrite: true, writeRefusal: null, canSign: true, signAuthorityRefusal: null },
};

let projectRows: unknown[];
let orgRows: unknown[];
let optionsAnswer: () => Response | Promise<Response>;
let fulfilAnswer: (url: string, body: Record<string, unknown>) => Response;
let searchHits: Array<Record<string, unknown>>;
let searchTotal: number;
const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const gets: string[] = [];
const onAsk = vi.fn();

beforeEach(() => {
  (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
  posts.length = 0;
  gets.length = 0;
  onAsk.mockReset();
  searchHits = [{ id: DOC, title: 'Final CSR', version: '2.0', current: true, snippet: null, contentHash: HASH.toUpperCase() }];
  searchTotal = 1;
  nav.stash.mockReset();
  nav.vault.mockReset();
  projectRows = [PROJECT_PMR];
  orgRows = [ORG_MEETING];
  optionsAnswer = () => ok({ success: true, data: OPTIONS });
  fulfilAnswer = () => ok({ success: true, data: { id: 11, status: 'fulfilled', fulfilledDate: '2026-10-01', signed: true }, signatureId: 77, signedAt: '2026-10-19T10:00:00.000Z', meaning: 'responsibility' }, 201);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST') {
      posts.push({ url, body: body ?? {} });
      return fulfilAnswer(url, body ?? {});
    }
    gets.push(url);
    if (url === ORG_URL) return ok({ commitments: orgRows, summary: {} });
    if (url === PROJECT_URL) return ok({ success: true, data: { commitments: projectRows, summary: {} } });
    if (url.endsWith('/fulfilment-options')) return optionsAnswer();
    if (url.startsWith(`/api/c2c/project-vault/${PROGRAM}/search`)) {
      return ok({ success: true, data: { query: 'CSR', total: searchTotal, limit: 25, offset: 0, includeSuperseded: true, results: searchHits } });
    }
    if (url.startsWith('/api/c2c/project-vault/search')) {
      return ok({ success: true, data: {
        query: 'CSR', total: searchTotal, limit: 25, offset: 0, includeSuperseded: true, scope: 'verified-accessible-programs',
        results: searchHits.map((h) => ({ documentType: null, size: null, ...h, program: { id: PROGRAM, name: 'Project Alpha' } })),
      } });
    }
    return ok({ success: true, data: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) }) as Response));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const onNav = vi.fn();
async function openCommitments() {
  onNav.mockReset();
  // The signature dialog's password check is a react-query mutation; the app provides the client.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={onAsk} onNav={onNav} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^Meetings & commitments$/ }));
}
async function openDialogFor(description: string) {
  const rowEl = (await screen.findByText(description)).closest('.cc-row') as HTMLElement;
  fireEvent.click(within(rowEl).getByRole('button', { name: 'Record fulfilment' }));
  return screen.findByRole('dialog', { name: 'Record a commitment as fulfilled' });
}

describe('recording a PMR as fulfilled is a signature that names what met it', () => {
  it('offers Sign only once a sequence or document is named, and says so', async () => {
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    const sign = await within(dialog).findByRole('button', { name: 'Sign fulfilment' });
    expect((sign as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText('Name the sequence or the document that met this PMR.')).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText(/Sequence 0042 · IND 123456 · sent to the agency/));
    expect((within(dialog).getByRole('button', { name: 'Sign fulfilment' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("signs through the project's door with the date, the evidence and the signature components", async () => {
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    fireEvent.click(await within(dialog).findByLabelText(/Sequence 0042/));
    fireEvent.change(within(dialog).getByLabelText(/Search this project's Vault/), { target: { value: 'CSR' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Search Vault' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Select document' }));
    fireEvent.change(within(dialog).getByLabelText('Date fulfilled'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign fulfilment' }));

    const esign = await screen.findByRole('dialog', { name: 'Electronic signature' });
    expect(esign.textContent).toMatch(/PMR: Pediatric study under PREA/);
    expect(esign.textContent).toMatch(/fulfilled on 2026-10-01/);
    expect(esign.textContent).toMatch(/sequence 0042 of IND 123456, sent to the agency/);
    // The version, and the sha256 the signature will pin, before the password.
    expect(esign.textContent).toMatch(new RegExp(`Vault version Final CSR v2\\.0, sha256 ${HASH.slice(0, 12)}…`));
    fireEvent.change(within(esign).getByLabelText(/Reason for this action/), { target: { value: 'The final study report was filed in 0042.' } });
    fireEvent.change(within(esign).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(esign).getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(`${PROJECT_URL}/11/fulfill`);
    expect(posts[0].body).toMatchObject({
      fulfilledDate: '2026-10-01', evidence: { sequenceId: 5, vaultDocumentId: DOC },
      meaning: 'responsibility', password: 'correct horse', reason: 'The final study report was filed in 0042.',
    });
    expect(await within(esign).findByText('Signature applied')).toBeTruthy();
    // The signed manifest names the act.
    expect(esign.textContent).toMatch(/Record PMR as fulfilled/);
  });

  it('does not report a signature the server did not confirm', async () => {
    fulfilAnswer = () => ok({ success: true, data: { id: 11, status: 'fulfilled' } }, 201);
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    fireEvent.click(await within(dialog).findByLabelText(/Sequence 0042/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign fulfilment' }));
    const esign = await screen.findByRole('dialog', { name: 'Electronic signature' });
    fireEvent.change(within(esign).getByLabelText(/Reason for this action/), { target: { value: 'The final study report was filed in 0042.' } });
    fireEvent.change(within(esign).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(esign).getByRole('button', { name: /Sign and commit/ }));
    expect(await within(esign).findByText(/could not be confirmed\. Reload before signing again\./)).toBeTruthy();
    expect(within(esign).queryByText('Signature applied')).toBeNull();
  });

  it("says the submissions could not be read, distinct from there being none, and offers no other project's Vault in their place", async () => {
    optionsAnswer = failed;
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    expect(await within(dialog).findByText(/The submissions could not be read\. None are offered rather than an incomplete list\./)).toBeTruthy();
    expect(within(dialog).queryByText(/No sequence the agency received is on file/)).toBeNull();
    // The server takes only this project's program's versions here; with it unread, nothing is offered.
    expect(within(dialog).getByText(/This project's Vault could not be identified, so no document can be named\./)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Search/)).toBeNull();
    expect(gets.filter((u) => u.startsWith('/api/c2c/project-vault/search'))).toEqual([]);
  });

  it('says plainly when no sequence the agency received is on file', async () => {
    optionsAnswer = () => ok({ success: true, data: { ...OPTIONS, sequences: [] } });
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    expect(await within(dialog).findByText(/No sequence the agency received is on file for this project/)).toBeTruthy();
    expect(within(dialog).queryByText(/could not be read/)).toBeNull();
  });

  it('shows a viewer why they cannot sign, before anything is typed', async () => {
    optionsAnswer = () => ok({ success: true, data: { ...OPTIONS, viewer: { canWrite: true, writeRefusal: null, canSign: false, signAuthorityRefusal: 'Your role does not permit applying an electronic signature.' } } });
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    expect(await within(dialog).findByText(/Your role does not permit applying an electronic signature/)).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText(/Sequence 0042/));
    expect((within(dialog).getByRole('button', { name: 'Sign fulfilment' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a meeting commitment is recorded with a reason', () => {
  it("posts through the organisation's door, without the signature dialog", async () => {
    fulfilAnswer = () => ok({ success: true, data: { id: 12, status: 'fulfilled', signed: false }, actionId: 'a', auditId: 'b', sha256Chain: 'c' }, 201);
    optionsAnswer = () => ok({ success: true, data: { ...OPTIONS, commitment: { id: 12, commitmentType: 'meeting_commitment', status: 'open' }, rule: { ...UNSIGNED_RULE, meanings: [] } } });
    await openCommitments();
    const dialog = await openDialogFor('Send the briefing package');
    fireEvent.change(await within(dialog).findByLabelText(/Reason, and how it was met/), { target: { value: 'Briefing package sent as agreed.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record as fulfilled' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(`${ORG_URL}/12/fulfill`);
    expect(posts[0].body).toMatchObject({ reason: 'Briefing package sent as agreed.' });
    expect(posts[0].body.password).toBeUndefined();
    expect(screen.queryByRole('dialog', { name: 'Electronic signature' })).toBeNull();
  });
});

describe('a fulfilled row says what met it', () => {
  it('names the sequence and the version, who signed, and opens each where it lives', async () => {
    projectRows = [SIGNED_ROW];
    await openCommitments();
    const rowEl = (await screen.findByText('Final CSR for study 301')).closest('.cc-row') as HTMLElement;
    expect(rowEl.textContent).toMatch(/Met by sequence 0042 of IND 123456, acknowledged by the agency\./);
    expect(rowEl.textContent).toMatch(/Final CSR v2\.0 \(a later version exists\)/);
    expect(rowEl.textContent).toMatch(/Signed by Dana Reyes on .* \(responsibility\), signature 77\./);
    fireEvent.click(within(rowEl).getByRole('button', { name: 'Open in Submission Center' }));
    expect(nav.stash).toHaveBeenCalledWith('submission-center', { submissionId: '3', sequenceId: '5', ws: 'dispatch' });
    expect(onNav).toHaveBeenLastCalledWith('submission-center');
    fireEvent.click(within(rowEl).getByRole('button', { name: 'Open in Vault' }));
    expect(nav.vault).toHaveBeenCalledWith({ documentId: DOC, programId: PROGRAM });
    expect(onNav).toHaveBeenLastCalledWith('vault');
  });

  it('says evidence is in a project the reader cannot open, legacy rows, and a signature that no longer holds', async () => {
    orgRows = [
      fulfilledAs(21, 'Hidden evidence PMR', { state: 'signed', recordedBy: { id: 9, name: 'Dana Reyes' }, sequence: { readable: false }, vaultVersion: { readable: false }, signature: { signatureId: 5, signerName: 'Dana Reyes', signedAt: '2026-10-19T10:00:00.000Z', meaning: 'approval', bindsRecord: true } }),
      fulfilledAs(22, 'Legacy PMR', { state: 'legacy' }),
      fulfilledAs(23, 'Mismatched PMR', { state: 'signature-mismatch', recordedBy: { id: 9, name: 'Dana Reyes' }, sequence: { readable: false }, signature: { signatureId: 6, signerName: 'Dana Reyes', signedAt: '2026-10-19T10:00:00.000Z', meaning: 'approval', bindsRecord: false } }),
      fulfilledAs(24, 'Withdrawn PMR', { state: 'signature-withdrawn', recordedBy: { id: 9, name: 'Dana Reyes' }, sequence: { readable: false } }),
      fulfilledAs(25, 'Unsigned PMR', { state: 'signature-missing', recordedBy: { id: 9, name: 'Dana Reyes' }, sequence: { readable: false } }),
    ];
    projectRows = [];
    await openCommitments();
    const text = async (d: string) => ((await screen.findByText(d)).closest('.cc-row') as HTMLElement).textContent ?? '';
    expect(await text('Hidden evidence PMR')).toMatch(/Met by a sequence in a project you cannot open\./);
    expect(await text('Hidden evidence PMR')).toMatch(/Met by a Vault document in a project you cannot open\./);
    expect(await text('Legacy PMR')).toMatch(/Recorded as fulfilled before fulfilments were signed\. No sequence or document was named\./);
    expect(await text('Mismatched PMR')).toMatch(/The signature on this fulfilment does not match the record as it stands\./);
    expect(await text('Withdrawn PMR')).toMatch(/The signature on this fulfilment has been withdrawn\./);
    expect(await text('Unsigned PMR')).toMatch(/This fulfilment names what met it, but no signature records it\./);
  });
});

/* ── What the review of 2026-10-19 found ─────────────────────────────────── */

const signedOrgPmr = row({ id: 31, description: 'Organisation PMR, library evidence' });
const orgOptions = { ...OPTIONS, commitment: { id: 31, commitmentType: 'pmr', status: 'open', submission: null }, vault: { programId: null } };

async function search(dialog: HTMLElement, label: RegExp) {
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value: 'CSR' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search Vault' }));
}

describe('review: what the signature names, where the Vault is searched, and what the options say', () => {
  it("names the version's project and sha256 on the picked line and in the signature dialog, on the organisation's door", async () => {
    orgRows = [signedOrgPmr];
    projectRows = [];
    optionsAnswer = () => ok({ success: true, data: orgOptions });
    await openCommitments();
    const dialog = await openDialogFor('Organisation PMR, library evidence');
    await search(dialog, /Search your accessible Vaults/);
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Select document' }));
    expect(within(dialog).getByRole('status').textContent).toBe(`Chosen: Final CSR v2.0 in Project Alpha, sha256 ${HASH.slice(0, 12)}…`);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign fulfilment' }));
    const esign = await screen.findByRole('dialog', { name: 'Electronic signature' });
    expect(esign.textContent).toMatch(new RegExp(`Vault version Final CSR v2\\.0 in Project Alpha, sha256 ${HASH.slice(0, 12)}…`));
  });

  it('a version with no recorded sha256 cannot be named: it says so, and Sign stays off', async () => {
    searchHits = [{ id: DOC, title: 'Final CSR', version: '2.0', current: true, snippet: null, contentHash: null }];
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    await search(await waitFor(() => dialog), /Search this project's Vault/);
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Select document' }));
    expect(within(dialog).getByText(/Final CSR has no recorded sha256, so what it held cannot be pinned/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Sign fulfilment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("on a project's door, offers no Vault search until the project's program is read", async () => {
    let release: (r: Response) => void = () => undefined;
    optionsAnswer = () => new Promise<Response>((resolve) => { release = resolve; });
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    expect(await within(dialog).findByText(/Reading which Vault this project's documents are in/)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Search/)).toBeNull();
    await act(async () => release(ok({ success: true, data: OPTIONS })));
    expect(await within(dialog).findByLabelText(/Search this project's Vault/)).toBeTruthy();
  });

  it("says the server's own refusal of the options, and offers nothing to record", async () => {
    optionsAnswer = () => { throw new ApiRequestError('That commitment is already fulfilled, waived or released; there is nothing to fulfil.', 409, undefined, 'INVALID_STATE'); };
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    expect(await within(dialog).findByText('That commitment is already fulfilled, waived or released; there is nothing to fulfil.')).toBeTruthy();
    expect(within(dialog).queryByText(/could not be read/)).toBeNull();
    expect(within(dialog).queryByLabelText(/Search/)).toBeNull();
    expect((within(dialog).getByRole('button', { name: 'Sign fulfilment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the submission an organisation commitment was made under when none of its sequences is on file, or says it cannot be opened', async () => {
    orgRows = [signedOrgPmr];
    projectRows = [];
    optionsAnswer = () => ok({ success: true, data: { ...orgOptions, sequences: [], commitment: { ...orgOptions.commitment, submission: { readable: true, id: 7, title: 'IND 123456' } } } });
    await openCommitments();
    let dialog = await openDialogFor('Organisation PMR, library evidence');
    expect(await within(dialog).findByText(/No sequence the agency received is on file for IND 123456, the submission this commitment was made under\./)).toBeTruthy();
    expect(within(dialog).queryByText(/the submissions you can open/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    optionsAnswer = () => ok({ success: true, data: { ...orgOptions, sequences: [], commitment: { ...orgOptions.commitment, submission: { readable: false } } } });
    dialog = await openDialogFor('Organisation PMR, library evidence');
    expect(await within(dialog).findByText(/made under a submission in a project you cannot open, so none of its sequences is offered\./)).toBeTruthy();
  });

});

describe('review: a meeting commitment, recorded with a reason', () => {
  const meetingOptions = () => ok({ success: true, data: { ...OPTIONS, commitment: { id: 12, commitmentType: 'meeting_commitment', status: 'open' }, rule: { ...UNSIGNED_RULE, meanings: [] } } });
  async function recordWith(prepare?: (dialog: HTMLElement) => void) {
    optionsAnswer = meetingOptions;
    await openCommitments();
    const dialog = await openDialogFor('Send the briefing package');
    fireEvent.change(await within(dialog).findByLabelText(/Reason, and how it was met/), { target: { value: 'Briefing package sent as agreed.' } });
    prepare?.(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record as fulfilled' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    return dialog;
  }

  it('a 401 is a refusal: no success, the server says why, the dialog stays open', async () => {
    fulfilAnswer = () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }), headers: new Headers() }) as unknown as Response;
    await recordWith();
    expect(await screen.findByText('Not recorded as fulfilled: Authentication required. Nothing was stored.')).toBeTruthy();
    expect(screen.queryByText(/Commitment recorded as fulfilled/)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Record a commitment as fulfilled' })).toBeTruthy();
  });

  it("one full stop after the server's sentence", async () => {
    fulfilAnswer = () => { throw new ApiRequestError('That commitment is already fulfilled, waived or released; there is nothing to fulfil.', 409, undefined, 'INVALID_STATE'); };
    await recordWith();
    expect(await screen.findByText('Not recorded as fulfilled: That commitment is already fulfilled, waived or released; there is nothing to fulfil. Nothing was stored.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('fulfil..');
  });

  it('no answer at all is not "nothing was stored": the outcome could not be confirmed, and the register is read again', async () => {
    fulfilAnswer = () => { throw new TypeError('Failed to fetch'); };
    await recordWith();
    expect(await screen.findByText(/Whether the fulfilment was recorded could not be confirmed\. The register was reloaded/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Nothing was stored|Failed to fetch/);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record a commitment as fulfilled' })).toBeNull());
    expect(gets.filter((u) => u === ORG_URL).length).toBeGreaterThan(1);
  });

  it('an emptied date is not sent, and the server records today; a future date is refused before sending', async () => {
    await recordWith((dialog) => {
      expect(within(dialog).getByText('Leave it empty to record today.')).toBeTruthy();
      fireEvent.change(within(dialog).getByLabelText('Date fulfilled'), { target: { value: '2999-01-01' } });
      expect(within(dialog).getByText('A commitment cannot be fulfilled on a date that has not happened yet.')).toBeTruthy();
      expect((within(dialog).getByRole('button', { name: 'Record as fulfilled' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(within(dialog).getByLabelText('Date fulfilled'), { target: { value: '' } });
    });
    expect('fulfilledDate' in posts[0].body, JSON.stringify(posts[0].body)).toBe(false);
  });
});

describe('review: the signed path with no answer, focus, the picker and the row', () => {
  it('a signature with no answer says the outcome could not be confirmed, never the browser\'s error', async () => {
    fulfilAnswer = () => { throw new TypeError('Failed to fetch'); };
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    fireEvent.click(await within(dialog).findByLabelText(/Sequence 0042/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign fulfilment' }));
    const esign = await screen.findByRole('dialog', { name: 'Electronic signature' });
    fireEvent.change(within(esign).getByLabelText(/Reason for this action/), { target: { value: 'The final study report was filed in 0042.' } });
    fireEvent.change(within(esign).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(esign).getByRole('button', { name: /Sign and commit/ }));
    expect(await within(esign).findByText(/could not be confirmed\. Reload before signing again\./)).toBeTruthy();
    expect(esign.textContent).not.toMatch(/Failed to fetch/);
  });

  it('focus: to Remove once a document is chosen, back to the search when removed, to Sign when the signature dialog is cancelled, and to the row when the dialog closes', async () => {
    await openCommitments();
    const rowEl = (await screen.findByText('Pediatric study under PREA')).closest('.cc-row') as HTMLElement;
    const opener = within(rowEl).getByRole('button', { name: 'Record fulfilment' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Record a commitment as fulfilled' });
    await search(dialog, /Search this project's Vault/);
    const select = await within(dialog).findByRole('button', { name: 'Select document' });
    select.focus();
    fireEvent.click(select);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Remove' })));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText(/Search this project's Vault/)));

    fireEvent.click(within(dialog).getByLabelText(/Sequence 0042/));
    const sign = within(dialog).getByRole('button', { name: 'Sign fulfilment' });
    sign.focus();
    fireEvent.click(sign);
    // Not on the row behind both dialogs while the signature dialog opens.
    expect(document.activeElement).not.toBe(opener);
    const esign = await screen.findByRole('dialog', { name: 'Electronic signature' });
    await waitFor(() => expect(esign.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Electronic signature' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Sign fulfilment' })));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record a commitment as fulfilled' })).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  /* The picker reads with the find view's own guard, so the two agree on what a
     readable search is. Since 8c87144fd that guard refuses a hit that does not
     say whether it is the current version (the server always sends it), so the
     picker refuses it too: the search is unreadable, never a list to sign from. */
  it("reads a project's search with the Vault find view's own guard: a hit sent without `current` is refused, as the find view refuses it", async () => {
    searchHits = [{ id: DOC, title: 'Final CSR', version: '2.0', snippet: null, contentHash: HASH, fileName: null, documentType: null, size: null, folderId: null, ctdSection: null, placementStatus: null }];
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    await search(dialog, /Search this project's Vault/);
    expect(await within(dialog).findByText(/The Vault search could not be read/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Select document' })).toBeNull();
  });

  it('says how many matched when the search lists fewer than match', async () => {
    searchTotal = 40;
    await openCommitments();
    const dialog = await openDialogFor('Pediatric study under PREA');
    await search(dialog, /Search this project's Vault/);
    expect(await within(dialog).findByText('Showing 1 of 40 matches. Refine the search to find one not listed.')).toBeTruthy();
  });

  it("the row names the type as the dialog does, and the signature's time against the audit trail's UTC", async () => {
    projectRows = [SIGNED_ROW];
    await openCommitments();
    const meeting = (await screen.findByText('Send the briefing package')).closest('.cc-row') as HTMLElement;
    expect(meeting.querySelector('.cc-row-tag')?.textContent).toBe('Meeting commitment');
    expect(meeting.textContent).not.toContain('MEETING_COMMITMENT');
    fireEvent.click(within(meeting).getByRole('button', { name: 'Ask AnA about this commitment' }));
    expect(onAsk).toHaveBeenCalledWith('What is needed to fulfill this meeting commitment on time?');
    const signed = (await screen.findByText('Final CSR for study 301')).closest('.cc-row') as HTMLElement;
    expect(signed.textContent).toMatch(/Signed by Dana Reyes on 2026-10-19 10:00:00 UTC/);
    expect(signed.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-19T10:00:00.000Z');
    expect(signed.textContent).toMatch(new RegExp(`pinned at sha256 ${'a'.repeat(12)}…`));
  });
});
