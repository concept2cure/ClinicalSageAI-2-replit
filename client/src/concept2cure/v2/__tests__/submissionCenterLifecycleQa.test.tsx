// @vitest-environment jsdom
/**
 * Submission Center publishing lifecycle — the QA walk of 2026-10-08 (j6).
 *
 * Each case is a finding reproduced on the running app before the fix:
 *   - the dispatched sequence had no package download and no transmit (the blocker);
 *   - the freeze e-signature was taken before the gate was asked, and a refused
 *     freeze left an executed signature;
 *   - "source verified" sat on a Vault version nobody had approved;
 *   - an identical re-placement read "placed … server-confirmed";
 *   - no control removed a leaf;
 *   - an original sequence offered Replace / Append / Delete.
 *
 * Same idiom as submissionCenterGovernedWorkspaces: apiRequest mocked at the
 * module boundary, the EsignModal's re-auth hook mocked, the modal itself real.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const verifyPassword = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword,
    verifyMfa: vi.fn(async () => ({ valid: true })),
    sign: vi.fn(),
    verifyingPassword: false,
    verifyingMfa: false,
    signing: false,
    signError: null,
  }),
}));
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('../download', () => ({ downloadBlob }));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() });
const SUBS = [{ id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' }];
const seqRow = (over: Record<string, unknown> = {}) => ({ id: 21, sequenceNumber: '0000', type: 'original', status: 'validated', region: 'fda', validationStatus: 'passed', ...over });
const CLEAR = { cleared: true, blockers: [] };
const readiness = (over: Record<string, unknown> = {}) => ({
  sequenceId: 21, region: 'fda', sequenceStatus: 'validated', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 1, signer: { state: 'independent', sources: [] }, ...over,
});
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body, headers: new Headers() }) as unknown as Response;

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
let seqs = [seqRow()];
function mockApi(extra: Handler = () => undefined) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const hit = extra(method, url, body);
    if (hit) return hit;
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return ok(seqs);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') return ok(readiness({ sequenceStatus: seqs[0].status }));
    return ok([]);
  });
}
const calledWith = (method: string, url: string) => apiRequest.mock.calls.filter((c) => c[0] === method && c[1] === url);
const openWorkspace = (label: string) => fireEvent.click(screen.getByRole('tab', { name: label }));
async function ready() {
  render(<SubmissionCenter {...props()} />);
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
}
async function sign() {
  fireEvent.change(await screen.findByLabelText('Reason for this action'), { target: { value: 'Locking sequence 0000 for filing.' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign and commit/ }));
}

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  downloadBlob.mockClear();
  seqs = [seqRow()];
});

describe('a governed step is asked before anyone signs (finding: signature before gate)', () => {
  it('the Sequences row does not open the e-signature when the server would refuse the freeze', async () => {
    mockApi((method, url) =>
      method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck'
        ? ok({ step: 'freeze', cleared: false, refusal: 'Dispatch gate blocks frozen: No completed Shadow Review has run for this sequence.' })
        : undefined,
    );
    await ready();
    openWorkspace('Sequences');
    fireEvent.click((await screen.findAllByRole('button', { name: /Frozen/ }))[0]);
    await waitFor(() => expect(document.body.textContent).toContain('Freeze of sequence 0000 not started — Dispatch gate blocks frozen'));
    expect(document.body.textContent).toContain('Nothing was signed.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calledWith('POST', '/api/c2c/actions/sign')).toHaveLength(0);
  });

  it('the gates are asked again just before signing; a refusal then takes no signature', async () => {
    let asked = 0;
    mockApi((method, url) => {
      if (method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck') {
        asked += 1;
        return asked === 1
          ? ok({ step: 'freeze', cleared: true, refusal: null })
          : ok({ step: 'freeze', cleared: false, refusal: 'Refusing to freeze: 1 leaf document(s) are not approved (3.2.S.4.1: not reviewed).' });
      }
      return undefined;
    });
    await ready();
    openWorkspace('Dispatch');
    fireEvent.click(await screen.findByRole('button', { name: /Freeze sequence \(Part 11 e-signature\)/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await sign();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('3.2.S.4.1: not reviewed'));
    expect(screen.getByRole('alert').textContent).toContain('Nothing was signed.');
    expect(calledWith('POST', '/api/c2c/actions/sign')).toHaveLength(0);
    expect(calledWith('POST', '/api/submissions/sequences/21/freeze')).toHaveLength(0);
  });
});

describe('the dispatched sequence has a package and a transmit (the blocker)', () => {
  const TRANSMIT = (configured: { staging: boolean | null; production: boolean | null }) => ({
    sequenceStatus: 'dispatched', dispatchStatus: 'pending', route: { ok: true, region: 'fda', gateway: 'esg' },
    configured, recordedApplicationNumber: '000512', gate: CLEAR, refusal: configured.staging || configured.production ? null : 'This sequence\'s agency gateway has no staging or production credentials configured for this organization, so nothing can be sent. Nothing was signed or transmitted.',
  });

  it('downloads the package through the canonical eCTD export for this sequence', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    mockApi((method, url) => {
      if (method === 'POST' && url === '/api/ectd/export/7') {
        return { ok: true, status: 200, blob: async () => new Blob(['PK']), headers: new Headers({ 'Content-Disposition': 'attachment; filename="ind-000512-0000.zip"' }) } as unknown as Response;
      }
      if (method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck') return ok({ step: 'transmit', cleared: false, refusal: 'x', transmit: TRANSMIT({ staging: false, production: false }) });
      return undefined;
    });
    await ready();
    openWorkspace('Dispatch');
    fireEvent.click(await screen.findByRole('button', { name: /Download the eCTD package \(zip\)/ }));
    await waitFor(() => expect(document.body.textContent).toContain('Package ind-000512-0000.zip downloaded'));
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/ectd/export/7', { sequenceNumber: '0000' });
    expect(downloadBlob).toHaveBeenCalledWith('ind-000512-0000.zip', expect.any(Blob));
  });

  it('says the gateway is not configured, and offers no transmit, before any password is typed', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    mockApi((method, url) =>
      method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck'
        ? ok({ step: 'transmit', cleared: false, refusal: 'x', transmit: TRANSMIT({ staging: false, production: false }) })
        : undefined,
    );
    await ready();
    openWorkspace('Dispatch');
    await waitFor(() => expect(document.body.textContent).toContain('FDA ESG (FDA)'));
    expect(document.body.textContent).toContain('Transmit is not available:');
    expect(document.body.textContent).toContain('FDA ESG has no staging credentials configured for this organization, so nothing can be sent.');
    const transmit = screen.getByRole('button', { name: /Transmit sequence 0000/ }) as HTMLButtonElement;
    expect(transmit.disabled).toBe(true);
    expect((screen.getByLabelText('Agency application number') as HTMLInputElement).value).toBe('000512');
  });

  /* QA 2026-10-08 (j6): the package named "UNASSIGNED (organization 1)" as the
     applicant and the program code as the application number. The Dispatch tab
     says, before anyone signs, what the package names — from the record. */
  it('says what the package names as its applicant and its application, from the record', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    mockApi((method, url) =>
      method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck'
        ? ok({ step: 'transmit', cleared: true, refusal: null, transmit: { ...TRANSMIT({ staging: true, production: false }), recordedApplicant: 'Concept2Cure Therapeutics' } })
        : undefined,
    );
    await ready();
    openWorkspace('Dispatch');
    await waitFor(() => expect(document.body.textContent).toContain('FDA ESG (FDA)'));
    expect(document.body.textContent).toContain('ApplicantConcept2Cure Therapeutics');
    expect(document.body.textContent).toContain('Application number000512');
  });

  it('with no application number or applicant on record, says "not recorded" and the server refusal, never a placeholder', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    const refusal = 'A package names its application and its applicant from the record, never a placeholder, and its project records no agency application number (record the number the agency assigned on the project; the program code is not one). Nothing can be sent until it is recorded.';
    mockApi((method, url) =>
      method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck'
        ? ok({ step: 'transmit', cleared: false, refusal, transmit: { ...TRANSMIT({ staging: true, production: false }), recordedApplicationNumber: null, recordedApplicant: null, refusal } })
        : undefined,
    );
    await ready();
    openWorkspace('Dispatch');
    await waitFor(() => expect(document.body.textContent).toContain('FDA ESG (FDA)'));
    expect(document.body.textContent).toContain('Applicantnot recorded');
    expect(document.body.textContent).toContain('Application numbernot recorded');
    expect(document.body.textContent).toContain('its project records no agency application number');
    expect(document.body.textContent).not.toMatch(/UNASSIGNED/);
  });

  it('a configured gateway transmits through the signed chain: gates, sign (intent transmit), transmit', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    const posts: Array<{ url: string; body: unknown }> = [];
    mockApi((method, url, body) => {
      if (method !== 'POST') return undefined;
      if (url.includes('/sequences/21/') || url === '/api/c2c/actions/sign') posts.push({ url, body });
      if (url === '/api/submissions/sequences/21/governed-precheck') return ok({ step: 'transmit', cleared: true, refusal: null, transmit: TRANSMIT({ staging: true, production: false }) });
      if (url === '/api/c2c/actions/sign') return ok({ actionId: 'act_tx1', sha256Chain: 'beef' });
      if (url === '/api/submissions/sequences/21/transmit') return ok({ transmitted: true, gateway: 'esg', transmittalId: 41, status: 'submitted', dispatchStatus: 'sent' });
      return undefined;
    });
    await ready();
    openWorkspace('Dispatch');
    const transmit = await screen.findByRole('button', { name: /Transmit sequence 0000/ });
    await waitFor(() => expect((transmit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(transmit);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await sign();
    await waitFor(() => expect(document.body.textContent).toContain('handed to FDA ESG (staging) — transmittal #41'));
    const urls = posts.map((p) => p.url);
    expect(urls.slice(-3)).toEqual(['/api/submissions/sequences/21/governed-precheck', '/api/c2c/actions/sign', '/api/submissions/sequences/21/transmit']);
    expect(posts.find((p) => p.url === '/api/c2c/actions/sign')?.body).toMatchObject({ target: 'ectd-sequence:21', payload: { intent: 'transmit' } });
    expect(posts.find((p) => p.url.endsWith('/transmit'))?.body).toEqual({ signatureActionId: 'act_tx1', environment: 'staging', applicationId: '000512' });
  });
});

/* P-23 (docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08): a signature serves only
   the act it was given for. The server voids the signature of a transmit it
   refuses; the screen asks the typed number of the server before anyone signs,
   and says when a signature was spent on an attempt that sent nothing. */
describe('a transmit signature serves only the transmit it was given for (P-23)', () => {
  const TRANSMIT = {
    sequenceStatus: 'dispatched', dispatchStatus: 'pending', route: { ok: true, region: 'fda', gateway: 'esg' },
    configured: { staging: true, production: false }, recordedApplicationNumber: '000512', gate: CLEAR, refusal: null,
  };

  it('the pre-sign check carries the typed number; one the record contradicts takes no signature', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    const prechecks: unknown[] = [];
    mockApi((method, url, body) => {
      if (method !== 'POST' || url !== '/api/submissions/sequences/21/governed-precheck') return undefined;
      prechecks.push(body);
      const typed = (body as { applicationId?: string }).applicationId;
      return typed && typed !== '000512'
        ? ok({ step: 'transmit', cleared: false, refusal: `Application number "${typed}" does not match the program's recorded application number "000512". The record is authoritative: transmit under the recorded number, or correct the program record first. Nothing was sent.`, transmit: TRANSMIT })
        : ok({ step: 'transmit', cleared: true, refusal: null, transmit: TRANSMIT });
    });
    await ready();
    openWorkspace('Dispatch');
    const transmit = await screen.findByRole('button', { name: /Transmit sequence 0000/ });
    fireEvent.change(screen.getByLabelText('Agency application number'), { target: { value: '000999' } });
    await waitFor(() => expect((transmit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(transmit);
    await waitFor(() => expect(document.body.textContent).toContain('does not match the program\'s recorded application number "000512"'));
    expect(document.body.textContent).toContain('Nothing was signed.');
    expect(prechecks.at(-1)).toEqual({ step: 'transmit', environment: 'staging', applicationId: '000999' });
    expect(calledWith('POST', '/api/c2c/actions/sign')).toHaveLength(0);
    expect(calledWith('POST', '/api/submissions/sequences/21/transmit')).toHaveLength(0);
  });

  it('a transmit that sent nothing says the signature given for it is void', async () => {
    seqs = [seqRow({ status: 'dispatched' })];
    mockApi((method, url) => {
      if (method !== 'POST') return undefined;
      if (url === '/api/submissions/sequences/21/governed-precheck') return ok({ step: 'transmit', cleared: true, refusal: null, transmit: TRANSMIT });
      if (url === '/api/c2c/actions/sign') return ok({ actionId: 'act_tx2', sha256Chain: 'beef' });
      if (url === '/api/submissions/sequences/21/transmit') {
        return ok({ transmitted: false, reason: 'gateway_not_configured', gateway: 'esg', dispatchStatus: 'pending', signatureVoided: true });
      }
      return undefined;
    });
    await ready();
    openWorkspace('Dispatch');
    const transmit = await screen.findByRole('button', { name: /Transmit sequence 0000/ });
    await waitFor(() => expect((transmit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(transmit);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await sign();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not transmitted — FDA ESG has no staging credentials'));
    expect(screen.getByRole('alert').textContent).toContain('The signature given for it is now void; a new attempt is signed again.');
  });
});

describe('the Builder says what the server knows about each leaf', () => {
  const LEAF = (over: Record<string, unknown> = {}) => ({
    id: 60, sectionCode: '3.2.P.8', title: 'Stability Protocol', granularity: null, lifecycleOp: 'new',
    documentTable: 'vault_documents', documentId: null, documentUuid: '3551f13c-f929-4979-a832-7cc014536570', documentType: null,
    sourceDocument: { status: 'resolved', keyKind: 'uuid', pinnedSha256: 'a', storedSha256: 'a', pin: 'match', reason: null, notTransmittable: 'not reviewed' },
    ...over,
  });

  it('an unapproved Vault version reads "not approved", never "source verified"', async () => {
    mockApi((method, url) => (method === 'GET' && url === '/api/submissions/sequences/21/leaves' ? ok([LEAF()]) : undefined));
    await ready();
    openWorkspace('Builder');
    await waitFor(() => expect(document.body.textContent).toContain('not approved: not reviewed'));
    expect(document.body.textContent).not.toContain('source verified');
  });

  it('removes a leaf with its reason, and nothing without one', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/leaves') return ok([LEAF()]);
      if (method === 'DELETE' && url === '/api/submissions/sequences/21/leaves/60') {
        return { ok: true, status: 204, json: async () => { throw new Error('no body'); }, headers: new Headers({ 'X-Sequence-Status-Changed': 'validated->assembling' }) } as unknown as Response;
      }
      return undefined;
    });
    await ready();
    openWorkspace('Builder');
    fireEvent.click(await screen.findByRole('button', { name: /Remove leaf 3\.2\.P\.8/ }));
    const confirm = screen.getByRole('button', { name: /^Remove leaf$/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: 'Placed twice by mistake' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(document.body.textContent).toContain('Leaf 3.2.P.8 (“Stability Protocol”) removed — server-confirmed.'));
    expect(document.body.textContent).toContain('returned it to Assembling, so validate it again');
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/submissions/sequences/21/leaves/60', { reason: 'Placed twice by mistake' });
  });

  it('an identical re-placement says nothing was placed, and an original offers only New', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/leaves') return ok([]);
      if (method === 'GET' && url === '/api/coauthor/documents') return ok({ documents: [{ id: 5, title: 'Cover Letter', moduleNumber: '1.2', status: 'approved' }] });
      if (method === 'PUT' && url === '/api/submissions/sequences/21/leaves') return ok({ id: 62, sectionCode: '1.2', unchanged: true, auditTrail: null });
      return undefined;
    });
    await ready();
    openWorkspace('Builder');
    fireEvent.click(await screen.findByRole('button', { name: /Place a Co-Author document as a leaf/ }));
    fireEvent.change(await screen.findByLabelText('Source document'), { target: { value: '5' } });
    const ops = within(screen.getByLabelText('Lifecycle operation')).getAllByRole('option').map((o) => o.textContent);
    expect(ops).toEqual(['New']);
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: 'Cover letter for the IND' } });
    fireEvent.click(screen.getByRole('button', { name: /Place leaf in the sequence/ }));
    await waitFor(() => expect(document.body.textContent).toContain('is already leaf #62 at 1.2 in this sequence'));
    expect(document.body.textContent).toContain('Nothing was placed');
    expect(document.body.textContent).not.toContain('placed from “Cover Letter” — server-confirmed');
  });
});
