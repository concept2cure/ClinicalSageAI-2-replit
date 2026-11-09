// @vitest-environment jsdom
/**
 * P-86 C3 (founder, 2026-11-01; launch row D7): retire a sequence that was never
 * filed, from the foot of its Dispatch tab.
 *
 * The server's half is C2: `POST /sequences/:id/governed-precheck {step:'retire'}`
 * answers whether the sequence can be retired and the statement the signer
 * makes; `POST /sequences/:id/retire {signatureActionId}` is the act. This file
 * pins the screen against that contract (mocked at apiRequest):
 *
 *   T1  the disclosure: closed by default, outside the readiness read, asked
 *       again on every open; offered, refused, the creator, an unreadable answer;
 *       a refusal at the click is said inside the disclosure and focused.
 *   T2  the one signature, through the real Submission Center: Responsibility
 *       only, the server's statement word for word (precheck, dialog, signed
 *       row and sign payload are one string), then the act; no record key and
 *       no signature id on screen; a refusal at the act inline; a 200 that does
 *       not say "retired" is not a success.
 *   T3  the transmissions list marks a row by the sequence it is bound to, not
 *       by its number.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The EsignModal's §11.200 re-auth primitives are mocked at the hook; the modal
// and the governed chain behind it are driven for real.
const verifyPassword = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
const verifyMfa = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword, verifyMfa, sign: vi.fn(),
    verifyingPassword: false, verifyingMfa: false, signing: false, signError: null,
  }),
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const SUB = { id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PROGRAM };
const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null };

/** The server's words. Deliberately not the production text: the screen must carry what the server sent, never a
 *  copy of its own (M8). */
const STATEMENT = 'Sequence 0000 has not been filed with the agency by any route (the words of this precheck, 4c1).';
const RETIREMENT = { sequenceNumber: '0000', stagingSends: [{ sentOn: '2026-10-30' }], numberFreed: true, statement: STATEMENT };
const OFFERED = { step: 'retire', cleared: true, refusal: null, retirement: RETIREMENT };
const refusedWith = (refusal: string) => ({ step: 'retire', cleared: false, refusal, retirement: { ...RETIREMENT } });
const CREATOR = 'You created sequence 0000, so you cannot sign its retirement. Another person with signing authority signs it.';

const CLEAR = { cleared: true, blockers: [] as string[] };
const READINESS = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'assembling', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 2, signer: { state: 'independent', sources: [] },
};

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const text = () => document.body.textContent ?? '';

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
let extra: Handler = () => undefined;
let retireAnswers: Array<() => Response | Promise<Response>> = [];
let readiness: () => Response = () => json({ data: READINESS });
const calls: Array<{ method: string; url: string; body?: unknown }> = [];

function serve() {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown, body?: unknown) => {
    const url = String(rawUrl ?? '');
    calls.push({ method, url, body });
    const hit = extra(method, url, body);
    if (hit) return hit;
    if (method === 'GET' && url.endsWith('/dispatch-readiness')) return readiness();
    if (method === 'POST' && url.endsWith('/governed-precheck')) {
      const step = (body as { step?: string })?.step;
      if (step === 'retire') return (retireAnswers.length > 1 ? retireAnswers.shift()! : retireAnswers[0] ?? (() => json(OFFERED)))();
      return json({ step, cleared: false, refusal: 'Not at this step.' });
    }
    return json({ data: [] });
  });
}
const retirePrechecks = () =>
  calls.filter((c) => c.method === 'POST' && c.url.endsWith('/governed-precheck') && (c.body as { step?: string })?.step === 'retire');

const disclosure = () => screen.getByTestId('retire-sequence') as HTMLElement & { open: boolean };
const setOpen = (open: boolean) => {
  const d = disclosure();
  d.open = open;
  fireEvent(d, new Event('toggle'));
};
const retireButton = () => within(disclosure()).queryByRole('button', { name: 'Retire sequence 0000' });

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  verifyPassword.mockClear();
  verifyMfa.mockClear();
  calls.length = 0;
  extra = () => undefined;
  retireAnswers = [];
  readiness = () => json({ data: READINESS });
  serve();
});

const renderDispatch = async (onGoverned = vi.fn()) => {
  render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={onGoverned} />);
  await waitFor(() => expect(screen.getByTestId('retire-sequence')).toBeTruthy());
  return onGoverned;
};

/* ── T1: the disclosure ─────────────────────────────────────────────────── */

describe('T1 — "Retire sequence 0000…" at the foot of Dispatch', () => {
  it('S0: closed by default, quiet, and asks nothing until opened', async () => {
    await renderDispatch();
    await waitFor(() => expect(text()).toMatch(/Cleared to dispatch\?/));
    const d = disclosure();
    expect(d.tagName).toBe('DETAILS');
    expect(d.className).toBe('pj-more');
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe('Retire sequence 0000…');
    expect(retirePrechecks()).toHaveLength(0);
    expect(retireButton()).toBeNull();
    // The last block of the Dispatch section.
    const section = d.closest('.pj-sec');
    expect(section?.lastElementChild).toBe(d);
  });

  it('S1 → S2: reading, then what retiring does, the test send it keeps, the number freed, and the button', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    retireAnswers = [() => held.then(() => json(OFFERED))];
    await renderDispatch();
    setOpen(true);
    const reading = await within(disclosure()).findByRole('status');
    expect(reading.textContent).toBe('Checking whether sequence 0000 can be retired…');
    release();
    await waitFor(() => expect(retireButton()).not.toBeNull());
    const body = disclosure().textContent ?? '';
    expect(body).toContain(
      'Retiring takes sequence 0000 out of use. Nothing is sent to the agency. Its leaves, compiles, its test send of ' +
      '2026-10-30 UTC and its signatures stay recorded as history; it is no longer listed, built on or sent. Its number, ' +
      '0000, becomes free, so a corrected sequence 0000 can then be started from the Sequences tab. Retirement cannot be undone.',
    );
    expect(retireButton()!.className).toBe('btn ghost small');
    // No tinted box, no chip, no id.
    expect(disclosure().querySelector('.sc-verdict, .rd-chip, .scaf-note')).toBeNull();
    expect(body).not.toMatch(/\b[a-z-]+:\d+\b/);
  });

  it.each([
    [[], 'Its leaves, compiles and its signatures stay recorded as history'],
    [[{ sentOn: '2026-10-30' }, { sentOn: '2026-10-31' }, { sentOn: '2026-11-01' }], 'Its leaves, compiles, its 3 test sends and its signatures stay recorded as history'],
  ])('S2 says the test sends it keeps: %j', async (stagingSends, words) => {
    retireAnswers = [() => json({ ...OFFERED, retirement: { ...RETIREMENT, stagingSends } })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
    expect(disclosure().textContent).toContain(words);
  });

  it('S2 with the number still taken says so, and does not promise a free number', async () => {
    retireAnswers = [() => json({ ...OFFERED, retirement: { ...RETIREMENT, numberFreed: false } })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
    expect(disclosure().textContent).toContain('Another sequence 0000 is in use, so the number stays taken.');
    expect(disclosure().textContent).not.toMatch(/becomes free/);
  });

  it("S3: the server's sentence, as a note, and no button; a record key in it is said in words", async () => {
    retireAnswers = [() => json(refusedWith('Sequence 0000 was sent to the agency’s production environment (ectd-sequence:21), so it is on record there and cannot be retired.'))];
    await renderDispatch();
    setOpen(true);
    const note = await within(disclosure()).findByRole('note');
    expect(note.textContent).toBe('Sequence 0000 was sent to the agency’s production environment (this sequence), so it is on record there and cannot be retired.');
    expect(retireButton()).toBeNull();
    expect(disclosure().innerHTML).not.toMatch(/ectd-sequence:21/);
  });

  it('S4: the creator is told why they cannot sign it, and offered no button', async () => {
    retireAnswers = [() => json(refusedWith(CREATOR))];
    await renderDispatch();
    setOpen(true);
    const note = await within(disclosure()).findByRole('note');
    expect(note.textContent).toBe(CREATOR);
    expect(retireButton()).toBeNull();
  });

  it.each([
    ['a failed read', () => json({ error: { code: 'INTERNAL', message: 'Internal error' } }, 500)],
    ['a cleared answer without the statement', () => json({ ...OFFERED, retirement: { ...RETIREMENT, statement: undefined } })],
    ['an answer of another shape', () => json({ ok: true })],
  ])('S5 (%s): could not be checked, never "cannot be retired", and no button', async (_label, answer) => {
    retireAnswers = [answer];
    await renderDispatch();
    setOpen(true);
    await waitFor(() =>
      expect(disclosure().textContent).toContain('Whether sequence 0000 can be retired could not be checked. Close this and open it again to retry.'));
    expect(retireButton()).toBeNull();
    expect(disclosure().textContent).not.toMatch(/cannot be retired|not retirable/);
  });

});

describe('T1 — outside the readiness read, and asked on every open and every click', () => {
  it('renders when the readiness read fails, so a sequence whose gate cannot be read can still be retired', async () => {
    readiness = () => json({ error: 'Internal error' }, 500);
    await renderDispatch();
    await waitFor(() => expect(text()).toMatch(/Couldn't compute the dispatch gate/));
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
  });

  it('asks again on every open, and keeps no answer across a close', async () => {
    retireAnswers = [() => json(OFFERED), () => json(refusedWith(CREATOR))];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
    setOpen(false);
    expect(disclosure().textContent).toBe('Retire sequence 0000…');
    setOpen(true);
    await waitFor(() => expect(within(disclosure()).queryByRole('note')?.textContent).toBe(CREATOR));
    expect(retireButton()).toBeNull();
    expect(retirePrechecks()).toHaveLength(2);
  });

  it('the button asks once more, and opens the signature only when that answer clears', async () => {
    retireAnswers = [() => json(OFFERED), () => json(OFFERED)];
    const onGoverned = await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
    fireEvent.click(retireButton()!);
    await waitFor(() => expect(onGoverned).toHaveBeenCalledTimes(1));
    expect(onGoverned).toHaveBeenCalledWith(SEQ, 'retire');
    expect(retirePrechecks()).toHaveLength(2);
  });

  it('a refusal at the click is said inside the disclosure, focused, and nothing is signed', async () => {
    retireAnswers = [() => json(OFFERED), () => json(refusedWith(CREATOR))];
    const onGoverned = await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
    fireEvent.click(retireButton()!);
    const said = await within(disclosure()).findByRole('status');
    expect(said.textContent).toBe(`${CREATOR} Nothing was signed.`);
    await waitFor(() => expect(document.activeElement).toBe(said));
    expect(onGoverned).not.toHaveBeenCalled();
    expect(retireButton()).toBeNull();
  });

  it('an unreadable answer at the click is said as that, focused, and nothing is signed', async () => {
    retireAnswers = [() => json(OFFERED), () => json({ error: 'Internal error' }, 500)];
    const onGoverned = await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(retireButton()).not.toBeNull());
    fireEvent.click(retireButton()!);
    const said = await within(disclosure()).findByRole('status');
    expect(said.textContent).toBe('Whether sequence 0000 can be retired could not be checked. Nothing was signed. Close this and open it again to retry.');
    await waitFor(() => expect(document.activeElement).toBe(said));
    expect(onGoverned).not.toHaveBeenCalled();
  });
});

/* ── T2: the one signature, through the real Submission Center ─────────── */

const SIGN = { actionId: 'act_r1', auditId: 'a-9', sha256Chain: 'c0ffee', state: 'executed' };
const RETIRE_URL = '/api/submissions/sequences/21/retire';
const RETIRED = {
  retired: true, sequenceId: 21, sequenceNumber: '0000', region: 'fda', retiredAt: '2026-11-09T10:00:00.000Z',
  signatureActionId: 'act_r1', signatureId: 4471, meaning: 'responsibility', reason: 'Wrong leaves; corrected 0000 follows.', numberFreed: true,
};
const RECORD_KEY = /\b[a-z-]+:\d+\b/;

function serveCenter(act: () => Response, retires = true) {
  let retired = false;
  extra = (method, url) => {
    if (method === 'GET' && url === '/api/submissions') return json([SUB]);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return json(retired ? [] : [SEQ]);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return json({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return json({ artifactKind: 'none', blockers: [] });
    if (method === 'POST' && url === '/api/c2c/actions/sign') return json(SIGN);
    if (method === 'POST' && url === RETIRE_URL) {
      const r = act();
      retired = r.ok && retires;
      return r;
    }
    return undefined;
  };
}

async function openRetirement() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('ZX-9 First-in-Human'));
  fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
  await waitFor(() => expect(screen.getByTestId('retire-sequence')).toBeTruthy());
  setOpen(true);
  await waitFor(() => expect(retireButton()).not.toBeNull());
  fireEvent.click(retireButton()!);
}

async function sign(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Reason for this action'), { target: { value: RETIRED.reason } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

const signBody = () => calls.find((c) => c.method === 'POST' && c.url === '/api/c2c/actions/sign')?.body as
  { target: string; payload: Record<string, unknown> } | undefined;

describe('T2 — the one signature, Responsibility only, the statement word for word', () => {
  it('signs the server\'s statement, then retires; no record key and no signature id on screen', async () => {
    serveCenter(() => json(RETIRED));
    await openRetirement();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Responsibility']);
    // The statement, as the server gave it: one quoted paragraph after "By signing, you state:".
    const stated = within(dialog).getByTestId('retire-statement');
    expect(stated.textContent).toBe(`By signing, you state:${STATEMENT}`);
    expect(stated.querySelector('q')?.textContent).toBe(STATEMENT);
    // The target line: what the act does, and no record key.
    const meta = within(dialog).getByText(/takes the sequence out of use/);
    expect(meta.textContent).toBe('FDA (US) · takes the sequence out of use; nothing is sent to the agency; cannot be undone');
    expect(dialog.textContent).not.toMatch(RECORD_KEY);

    await sign(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));
    expect(signBody()).toMatchObject({
      target: 'ectd-sequence:21',
      payload: { intent: 'retire', meaning: 'responsibility', notFiledElsewhere: true, statement: STATEMENT },
    });
    const act = calls.find((c) => c.method === 'POST' && c.url === RETIRE_URL);
    expect(act?.body).toEqual({ signatureActionId: 'act_r1' });
    // The signed manifest repeats the same words.
    expect(within(dialog).getByText('Stated')).toBeTruthy();
    expect(dialog.textContent?.split(STATEMENT).length).toBeGreaterThanOrEqual(2);

    const notice = await screen.findByText(/Sequence 0000 is retired, signed by/);
    expect(notice.textContent).toMatch(
      /^Sequence 0000 is retired, signed by .+ \(responsibility\)\. Its number is free: start sequence 0000 again from the Sequences tab\.$/,
    );
    for (const shown of [notice.textContent ?? '', meta.textContent ?? '']) {
      expect(shown).not.toMatch(RECORD_KEY);
      expect(shown).not.toContain('act_r1');
      expect(shown).not.toContain('4471');
    }
    expect(document.body.innerHTML).not.toContain('act_r1');
  });

  it('a retirement that leaves the number taken says so', async () => {
    serveCenter(() => json({ ...RETIRED, numberFreed: false }));
    await openRetirement();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    const notice = await screen.findByText(/Sequence 0000 is retired, signed by/);
    expect(notice.textContent).toMatch(/\(responsibility\)\. Another sequence 0000 is in use, so the number stays taken\.$/);
  });

  it("S7: the act's refusal is shown inline, with the server's words; nothing is said retired", async () => {
    const refusal = 'Sequence 0000 was sent to the agency’s production environment, so it cannot be retired. ' +
      'The signature given for this retirement is now void; sign again for a new attempt.';
    serveCenter(() => json({ error: { code: 'INVALID_STATE', message: refusal } }, 409));
    await openRetirement();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain(refusal));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/is retired/);
  });

  it.each([
    ['without retired: true', { ...RETIRED, retired: undefined }],
    ['for another sequence', { ...RETIRED, sequenceId: 22 }],
    ['an empty body', {}],
  ])('a 200 %s is not a success', async (_label, answer) => {
    serveCenter(() => json(answer), false);
    await openRetirement();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('The server did not confirm that sequence 0000 was retired'));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/is retired/);
  });

  it('a cleared precheck without the statement opens no signature', async () => {
    serveCenter(() => json(RETIRED));
    // The disclosure's two answers carry the statement; the third, the one the dialog would sign from, does not.
    retireAnswers = [
      () => json(OFFERED), () => json(OFFERED),
      () => json({ ...OFFERED, retirement: { ...RETIREMENT, statement: '' } }),
    ];
    await openRetirement();
    await waitFor(() => expect(text()).toMatch(/Retirement of sequence 0000 not started — Whether the server would accept this could not be checked/));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(signBody()).toBeUndefined();
  });
});

/* ── T3: transmissions marked by the sequence they are bound to ─────────── */

const TRANSMIT = {
  sequenceStatus: 'dispatched', dispatchStatus: 'pending', route: { ok: true, region: 'fda', gateway: 'esg' },
  configured: { staging: true, production: false }, recordedApplicationNumber: '000512', gate: CLEAR, refusal: null,
};
const ROW = (id: number, metadata: Record<string, unknown>) => ({
  id, region: 'fda', gateway: 'esg', status: 'submitted', transmission_id: null, submitted_at: '2026-10-30T09:00:00Z',
  ack_received_at: null, submitted_by: 5, submitted_by_name: 'Dana Approver', metadata,
});

describe('T3 — a transmission is marked by the sequence it is bound to', () => {
  it('this one, another sequence of the same number, an unbound row of this number, and another number', async () => {
    extra = (method, url, body) => {
      if (method === 'POST' && url.endsWith('/governed-precheck') && (body as { step?: string }).step === 'transmit') {
        return json({ step: 'transmit', cleared: true, refusal: null, transmit: TRANSMIT });
      }
      if (method === 'GET' && url.startsWith('/api/mdx/gateways/transmittals')) {
        return json({
          data: [
            ROW(12, { sequence: '0000', environment: 'staging', dispatchBinding: { sequenceId: 21 } }),
            ROW(11, { sequence: '0000', environment: 'staging', dispatchBinding: { sequenceId: 9 } }),
            ROW(10, { sequence: '0000', environment: 'staging' }),
            ROW(9, { sequence: '0001', environment: 'staging', dispatchBinding: { sequenceId: 9 } }),
          ],
        });
      }
      return undefined;
    };
    // A sequence test-sent to the agency is dispatched: its transmissions are listed under Package and transmit.
    readiness = () => json({ data: { ...READINESS, sequenceStatus: 'dispatched' } });
    render(<DispatchWorkspace sub={SUB as never} seq={{ ...SEQ, status: 'dispatched' }} onGoverned={vi.fn()} />);
    const region = await screen.findByRole('region', { name: 'Transmissions and acknowledgements' });
    await waitFor(() => expect(region.textContent).toContain('Transmittal #9'));
    const rowOf = (id: number) =>
      Array.from(region.querySelectorAll('.tl-spec-k')).find((k) => k.textContent?.startsWith(`Transmittal #${id} `))?.textContent;
    expect(rowOf(12)).toBe('Transmittal #12 · sequence 0000 (this one)');
    expect(rowOf(11)).toBe('Transmittal #11 · sequence 0000 (another sequence numbered 0000)');
    expect(rowOf(10)).toBe('Transmittal #10 · sequence 0000 (this number)');
    expect(rowOf(9)).toBe('Transmittal #9 · sequence 0001');
  });
});
