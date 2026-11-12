// @vitest-environment jsdom
/**
 * Protocol workspace, IRB package tab: what is on file for the IRB submission.
 *
 * `docs/design/IRB_SUBMISSION.md` step 5. The board's determinations, sites,
 * consent documents, amendments and reportable events each had a governed
 * write on `/api/irb` and no caller, and no read: nothing a person recorded
 * could be shown back to them.
 *
 * What each case exists to catch:
 *
 *   • A FAILED READ IS NOT "NONE RECORDED".
 *   • AN APPROVAL IS SIGNED. It never goes through the reason-only form: the
 *     form collects what the board decided, and the request is made only from
 *     the signing dialog, carrying the meaning and the password. The dialog
 *     says the signature is the recorder's, not the board's.
 *   • THE OTHER DETERMINATIONS ARE NOT SIGNED and never offer "approved".
 *   • NOTHING IS PRESELECTED WHERE THE ANSWER IS AN ASSESSMENT (substantive).
 *   • EMPTY OPTIONALS ARE LEFT OUT, not sent as ''.
 *   • NOTHING IS APPENDED LOCALLY: the register is read again after a write.
 *   • A VIEWER IS OFFERED NO WRITE.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ displayName: 'Lumen Lead', email: 'lumen.lead@lumen-demo.example', mfaEnabled: false }),
}));
/* The signing dialog itself is covered by its own suite. Here it is a stand-in that shows what it was told and signs. */
vi.mock('../../_shared/components/EsignModal', () => ({
  EsignModal: (props: { open: boolean; action: string; target: string; targetMeta?: string; meanings?: readonly string[]; defaultMeaning?: string; signer?: { name: string };
    onSign: (input: { meaning: string; reason: string; password: string; totp?: string }) => Promise<unknown>; onClose: () => void }) => (props.open ? (
    <div role="dialog" aria-label={props.action}>
      <p>{props.target}</p>
      <p>{props.targetMeta}</p>
      <p>{`meanings: ${(props.meanings ?? []).join(', ')}; default ${props.defaultMeaning}; signer ${props.signer?.name}`}</p>
      <button onClick={() => { void props.onSign({ meaning: 'responsibility', reason: 'Recorded from the approval letter of 3 November.', password: 'pw-entered' }); }}>Sign</button>
      <button onClick={props.onClose}>Close</button>
    </div>
  ) : null),
}));

import { IrbRegisters } from '../surfaces/IrbSubmissionRegisters';

const ok = (obj: unknown, status = 200) => ({ ok: true, status, json: async () => obj }) as Response;
const refuse = (status: number, message: string) => ({ ok: false, status, json: async () => ({ error: { code: 'INTERNAL', message } }) }) as Response;

const REASON = 'Recording what the board has on file.';
const EMPTY = { irbSubmissionId: 7, reviews: [], sites: [], consentDocuments: [], amendments: [], reportableEvents: [] };
const FULL = {
  irbSubmissionId: 7,
  reviews: [{ id: 1, reviewType: 'full_board', outcome: 'modifications_required', conditions: 'Shorten the consent form.', determinationDate: '2026-10-20' }],
  sites: [{ id: 2, siteName: 'Site 104', principalInvestigator: 'Dr. Example (fictional)', localContext: null, status: 'pending' }],
  consentDocuments: [{ id: 3, documentName: 'Main consent form', version: '2.1', status: 'draft', approvedDate: null }],
  amendments: [{ id: 4, description: 'Adds a week 12 visit.', substantive: true, status: 'submitted' }],
  reportableEvents: [{ id: 5, eventType: 'unanticipated_problem', description: 'A dosing error at site 104.', reportedDate: '2026-11-02', status: 'reported' }],
};

const calls = () => apiRequest.mock.calls.map((c) => ({ method: c[0] as string, url: c[1] as string, body: c[2] as Record<string, unknown> | undefined }));
const writes = () => calls().filter((c) => c.method !== 'GET');
const reads = () => calls().filter((c) => c.method === 'GET' && c.url.endsWith('/record')).length;

function route(onFile: unknown = EMPTY, opts: { readStatus?: number; refuseWrite?: string } = {}) {
  apiRequest.mockImplementation(async (method: string) => {
    if (method === 'GET') return opts.readStatus ? refuse(opts.readStatus, 'The register did not answer.') : ok(onFile);
    if (opts.refuseWrite) return refuse(400, opts.refuseWrite);
    return ok({ id: 7, actionId: 1, signedAt: '2026-11-12T05:00:00Z', sha256Chain: 'abc123' }, 201);
  });
}

const onChanged = vi.fn();
const onError = vi.fn();

function open(onFile: unknown = EMPTY, opts: { readStatus?: number; refuseWrite?: string; canWrite?: boolean } = {}) {
  route(onFile, opts);
  render(<IrbRegisters submissionId={7} title="LMN-201 ethics submission" canWrite={opts.canWrite ?? true} reads={0} onChanged={onChanged} onError={onError} />);
}

const card = () => screen.getByRole('group', { name: 'On file for this submission' });
const dialog = () => screen.getByRole('dialog');
const fill = (label: RegExp, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
const submit = (name: string) => fireEvent.click(within(dialog()).getByRole('button', { name }));

beforeEach(() => { apiRequest.mockReset(); onChanged.mockReset(); onError.mockReset(); });
afterEach(() => cleanup());

describe('IRB tab — what is on file', () => {
  it('lists each register as recorded, in words', async () => {
    open(FULL);
    const determinations = await within(card()).findByRole('group', { name: 'Board determinations' });
    expect(determinations.textContent).toContain('2026-10-20: modifications required, full board (convened) review. Shorten the consent form.');
    expect(within(card()).getByRole('group', { name: 'Sites' }).textContent).toContain('Site 104, Dr. Example (fictional) (pending).');
    expect(within(card()).getByRole('group', { name: 'Consent documents' }).textContent).toContain('Main consent form, version 2.1 (draft).');
    expect(within(card()).getByRole('group', { name: 'Amendments' }).textContent).toContain('Adds a week 12 visit. (substantive; submitted).');
    expect(within(card()).getByRole('group', { name: 'Reportable events' }).textContent).toContain('Unanticipated problem, reported 2026-11-02: A dosing error at site 104. (reported).');
  });

  it('says none recorded for an empty register, and that the board has decided nothing', async () => {
    open();
    const determinations = await within(card()).findByRole('group', { name: 'Board determinations' });
    expect(determinations.textContent).toContain('The board has made no decision on this record.');
    expect(within(card()).getByRole('group', { name: 'Sites' }).textContent).toContain('None recorded.');
  });

  it('says the read failed, and never draws that as none recorded', async () => {
    open(EMPTY, { readStatus: 500 });
    const alert = await within(card()).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read: The register did not answer\./);
    expect(alert.textContent).toMatch(/not a submission with nothing on file/);
    expect(card().textContent).not.toContain('None recorded.');
    expect(within(card()).queryByRole('group', { name: 'Sites' })).toBeNull();
  });

  it('offers a viewer no write', async () => {
    open(FULL, { canWrite: false });
    await within(card()).findByRole('group', { name: 'Sites' });
    expect(within(card()).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('IRB tab — recording what is on file', () => {
  it('adds a site, leaving out what was not entered, and reads the register again', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a site' }));
    fill(/Site name/, 'Site 104');
    fill(/Reason for change/, REASON);
    submit('Add site');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/irb/submissions/7/sites', body: { siteName: 'Site 104', reason: REASON } });
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Site added.'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reads the register again when the record above says it changed', async () => {
    route();
    const view = render(<IrbRegisters submissionId={7} title="t" canWrite reads={0} onChanged={onChanged} onError={onError} />);
    await waitFor(() => expect(reads()).toBe(1));
    view.rerender(<IrbRegisters submissionId={7} title="t" canWrite reads={1} onChanged={onChanged} onError={onError} />);
    await waitFor(() => expect(reads()).toBe(2));
  });

  it('adds a consent document by its own name and version', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a consent document' }));
    fill(/Document name/, 'Main consent form');
    fill(/Reason for change/, REASON);
    submit('Add consent document');
    // No version: refused before any request.
    expect(writes()).toHaveLength(0);
    fill(/Version/, '2.1');
    submit('Add consent document');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({ documentName: 'Main consent form', version: '2.1', reason: REASON });
  });

  it('records an amendment with no preselected answer to "substantive"', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record an amendment' }));
    expect((within(dialog()).getByLabelText(/Substantive change/) as HTMLSelectElement).value).toBe('');
    fill(/What changes/, 'Adds a week 12 visit.');
    fill(/Reason for change/, REASON);
    submit('Record amendment');
    expect(writes()).toHaveLength(0);
    fill(/Substantive change/, 'no');
    submit('Record amendment');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/irb/submissions/7/amendments', body: { description: 'Adds a week 12 visit.', substantive: false, reason: REASON } });
  });

  it('records a reportable event with the date it was reported to the board', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record a reportable event' }));
    fill(/^Event/, 'unanticipated_problem');
    fill(/Date reported to the board/, '2026-11-02');
    fill(/What happened/, 'A dosing error at site 104.');
    fill(/Reason for change/, REASON);
    submit('Record event');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/irb/submissions/7/reportable-events',
      body: { eventType: 'unanticipated_problem', description: 'A dosing error at site 104.', reportedDate: '2026-11-02', reason: REASON } });
  });

  it('says the server\'s refusal in its words and keeps the form', async () => {
    open(EMPTY, { refuseWrite: 'reportedDate is required, as the date the event was reported to the board (YYYY-MM-DD).' });
    fireEvent.click(await screen.findByRole('button', { name: 'Record a reportable event' }));
    fill(/^Event/, 'other'); fill(/Date reported to the board/, '2026-11-02'); fill(/What happened/, 'x'); fill(/Reason for change/, REASON);
    submit('Record event');
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toMatch(/Couldn’t record the event: reportedDate is required/);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('IRB tab — the board\'s determination', () => {
  it('records a determination that is not an approval, unsigned, and never offers "approved" there', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record a determination' }));
    const outcomes = Array.from((within(dialog()).getByLabelText(/The board’s decision/) as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    expect(outcomes).toEqual(['modifications_required', 'deferred', 'disapproved']);
    fill(/The board’s decision/, 'deferred');
    fill(/The board’s review/, 'full_board');
    fill(/Determination date/, '2026-10-20');
    fill(/Reason for change/, REASON);
    submit('Record determination');
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/irb/submissions/7/reviews',
      body: { reviewType: 'full_board', outcome: 'deferred', determinationDate: '2026-10-20', reason: REASON } });
    expect(writes()[0].body).not.toHaveProperty('password');
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Determination recorded: deferred.'));
  });

  it('records an approval only through the signing dialog, with the meaning and the password', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record approval' }));
    // The first step asks what the board decided, and no reason: the signature carries it.
    expect(within(dialog()).queryByLabelText(/Reason for change/)).toBeNull();
    fill(/The board’s review/, 'full_board');
    fill(/Determination date/, '2026-11-03');
    fill(/Expiration date the board set/, '2027-05-03');
    submit('Continue to sign');
    // Nothing is written by the form.
    expect(writes()).toHaveLength(0);

    const signing = await screen.findByRole('dialog', { name: 'Record the board’s approval' });
    expect(signing.textContent).toContain('IRB submission 7 · LMN-201 ethics submission');
    expect(signing.textContent).toMatch(/this is your signature, not the board’s/);
    expect(signing.textContent).toContain('meanings: responsibility, approval; default responsibility; signer Lumen Lead');

    fireEvent.click(within(signing).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'POST', url: '/api/irb/submissions/7/reviews', body: {
      reviewType: 'full_board', outcome: 'approved', determinationDate: '2026-11-03', expirationDate: '2027-05-03',
      reason: 'Recorded from the approval letter of 3 November.', meaning: 'responsibility', password: 'pw-entered',
    } });
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('The board’s approval was recorded and signed.'));
  });

  it('sends no expiration when the letter sets none', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record approval' }));
    fill(/The board’s review/, 'expedited');
    fill(/Determination date/, '2026-11-03');
    submit('Continue to sign');
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Record the board’s approval' })).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).not.toHaveProperty('expirationDate');
    expect(writes()[0].body).not.toHaveProperty('conditions');
  });
});
