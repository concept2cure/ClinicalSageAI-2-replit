// @vitest-environment jsdom
/**
 * GatewayTransmittals — what the surface says after a transmit or an assembly,
 * against what the server actually answered (package-spine sweep, honest-state
 * lens: docs/evidence/W5/2026-09-30-package-spine-sweep/LENSES.md, HS-1 … HS-8).
 *
 *   HS-1  a filed sequence the history could not record is said, in alert tone
 *   HS-2  the pre-transmit checks' failed checks and warnings are said; a send
 *         whose report is missing never reads as "all passed"
 *   HS-3  a pre-transmit refusal is itemized and titled by its source
 *   HS-4  a transport that is not verified says nothing was sent; a 500 shows
 *         no enum token
 *   HS-5  every transmit answer but a 401 reloads the transmittal log, and a
 *         5xx or a lost response reads "did not complete", never "failed" or
 *         "nothing was sent"
 *   HS-6  the active-transmittal refusal carries the agency caveat, and never
 *         offers a rollback as the way to re-send a received bundle; a 409
 *         that is not the lock is never said as one
 *   HS-7  a clean assembly's warnings are listed in a card titled for warnings,
 *         unless preflight reports an error-severity finding the assembly did
 *         not count
 *   HS-8  the log count and AnA's facts come from the server's totals, not
 *         from the page it returned
 *
 * The server half is pinned by its own route tests; the bodies here are the
 * shapes the transmit and list routes answer with.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
type Published = { summary?: string; facts?: Record<string, unknown> };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  // What the surface hands AnA, captured as published (id, context).
  usePublishSurfaceContext: (...args: [string, Published]) => { published.current = args[1]; },
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => {
    const values = config.title === 'Assemble bundle'
      ? { packageId: '77', region: 'FDA', sequence: '0001', reason: 'Assemble sequence 0001 for FDA' }
      : { region: 'fda', gateway: 'esg', packageId: '77', reason: 'Dispatch sequence 0001 to FDA', meaning: 'release', password: 'pw', totp: '' };
    return <button data-testid="form-submit" onClick={() => onSubmit(values)}>{config.submitLabel}</button>;
  },
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';
import { ApiRequestError } from '@/lib/queryClient';

const env = (data: unknown, status = 200, meta?: unknown) =>
  ({ ok: status < 400, status, json: async () => (meta === undefined ? { data } : { data, meta }) } as Response);
const refused = (status: number, payload: Record<string, unknown>) => () => {
  throw new ApiRequestError(String(payload.error ?? 'refused'), status, payload);
};
const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const GATEWAYS = [{ region: 'fda', gateway: 'esg', transport: 'as2', configured: true, environment: 'production' }];
const ROW_3 = { id: 3, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: 'ESG-XYZ', status: 'acknowledged', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: '2026-07-21T01:00:00Z', submitted_by_name: 'Dr Ada Lovelace' };

/** Routes the surface reads; `post` answers every POST, `log` the transmittal list, `gateways` the gateway table. */
function serve(post: (url: string) => Response | Promise<Response>, log: () => Response = () => env([ROW_3]), gateways: unknown[] = GATEWAYS) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways') return env(gateways);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return log();
    if (method === 'POST') return post(url);
    return env(null);
  });
}
const logReads = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === '/api/mdx/gateways/transmittals').length;
const toastEl = () => document.querySelector('.de-toast') as HTMLElement | null;

async function transmit() {
  render(<GatewayTransmittals {...props()} />);
  await screen.findByText('FDA ESG');
  fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
  fireEvent.click(screen.getByTestId('form-submit'));
  await waitFor(() => expect(toastEl()).not.toBeNull());
  return toastEl()!;
}
async function assemble() {
  render(<GatewayTransmittals {...props()} />);
  await screen.findByText('FDA ESG');
  fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
  fireEvent.click(screen.getByTestId('form-submit'));
  await waitFor(() => expect(toastEl()).not.toBeNull());
  return toastEl()!;
}

const SENT = { transmittalId: 4300, transmissionId: 'MDN-1', status: 'received' };

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  published.current = null;
});

describe('HS-1 — a filed sequence the history could not record is said, never a clean success', () => {
  const CONFLICT = 'The transmission completed, but this sequence could not be added to the package filed history. The history already holds sequence 0001 on file as a different bundle, sent by transmittal 4100. Two different bundles have now been sent under one sequence number: the agency will load at most one of them.';
  it.each([
    ['append-failed', 'The transmission completed, but this sequence could not be added to the package filed history. Record it manually before assembling the next sequence, which derives each leaf operation from that history.', /Record it manually/],
    ['no-usable-manifest', 'The transmission completed, but this sequence could not be added to the package filed history. Its bundle descriptor carries no readable leaf inventory.', /no readable leaf inventory/],
    ['sequence-conflict', CONFLICT, /transmittal 4100.*at most one of them/],
  ])('%s: the server’s warning is in an alert beside the confirmation', async (reason, warning, said) => {
    serve(() => env({ ...SENT, filedSequenceRecorded: false, filedSequenceReason: reason, filedSequenceWarning: warning }, 201));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/Transmitted via FDA \/ FDA ESG · gateway ref MDN-1/);
    expect(toast.textContent).toMatch(/filed history/);
    expect(toast.textContent).toMatch(said);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('a false with no warning still says it, in fixed words', async () => {
    serve(() => env({ ...SENT, filedSequenceRecorded: false }, 201));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/could not be added to the package filed history/);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('not-applicable (a test send, a non-eCTD send) stays a plain confirmation', async () => {
    serve(() => env({ ...SENT, filedSequenceRecorded: 'not-applicable', filedSequenceReason: 'not-applicable', preTransmitFailedChecks: [], preTransmitWarnings: [] }, 201));
    const toast = await transmit();
    expect(toast.textContent).not.toMatch(/filed history/);
    expect(toast.getAttribute('role')).toBe('status');
  });
});

describe('HS-2 — the pre-transmit checks’ verdict reaches the operator', () => {
  const BACKBONE = 'm1/us/us-regional.xml is NOT an FDA-conformant Module 1 backbone — applicant contact "Jane Q. Regulatory": <telephone> carries no telephone-number-type. A regional validator will not accept it as FDA Module 1.';

  it('failed checks (as {name, detail}) and warnings are named, in an alert', async () => {
    serve(() => env({
      ...SENT, filedSequenceRecorded: true,
      preTransmitFailedChecks: [
        { name: 'dtd-self-contained', detail: 'missing: ich-ectd-3-2.dtd, us-regional-v3-3.dtd' },
        { name: 'regional-backbone-conformant', detail: '<telephone> carries no telephone-number-type' },
      ],
      preTransmitWarnings: [BACKBONE],
    }, 201));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/gateway ref MDN-1/);
    expect(toast.textContent).toMatch(/missing: ich-ectd-3-2\.dtd, us-regional-v3-3\.dtd/);
    expect(toast.textContent).toMatch(/regional backbone conformance/i);
    expect(toast.textContent).toMatch(/NOT an FDA-conformant Module 1 backbone/);
    // The check's identifier is a token; the operator reads its name.
    expect(toast.textContent).not.toMatch(/dtd-self-contained|regional-backbone-conformant/);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('failed checks as the governed transmit records them ("name: detail") read the same', async () => {
    serve(() => env({ ...SENT, preTransmitFailedChecks: ['dtd-self-contained: missing: ich-ectd-3-2.dtd'], preTransmitWarnings: [] }, 201));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/did not pass/);
    expect(toast.textContent).toMatch(/missing: ich-ectd-3-2\.dtd/);
    expect(toast.textContent).not.toMatch(/dtd-self-contained/);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('a missing report (null) is said as missing — never as checks that passed — and does not raise the tone', async () => {
    serve(() => env({ ...SENT, preTransmitFailedChecks: null, preTransmitWarnings: null }, 201));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/pre-transmit checks sent no report/);
    expect(toast.textContent).not.toMatch(/(all|every) (pre-transmit )?checks? passed/i);
    expect(toast.getAttribute('role')).toBe('status');
  });

  it('a report with nothing failed and nothing warned adds nothing to the confirmation', async () => {
    serve(() => env({ ...SENT, preTransmitFailedChecks: [], preTransmitWarnings: [] }, 201));
    const toast = await transmit();
    expect(toast.textContent).not.toMatch(/pre-transmit/i);
    expect(toast.getAttribute('role')).toBe('status');
  });
});

describe('HS-3 — a pre-transmit refusal is itemized and titled by its source', () => {
  const MESSAGE = 'Refusing to transmit to FDA esg: package failed pre-transmit checks. Package is 4.50 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency’s large-submission channel (e.g. physical media) instead of the gateway. Package was assembled for EMA (descriptor); it cannot be transmitted to FDA. Re-assemble the package for FDA.';
  const BLOCKERS = [
    'Package is 4.50 GB, over the FDA gateway limit of 4.00 GB. Submit via the agency’s large-submission channel (e.g. physical media) instead of the gateway.',
    'Package was assembled for EMA (descriptor); it cannot be transmitted to FDA. Re-assemble the package for FDA.',
  ];

  it('the contract shape: two findings, its own title, no structural gate and no blanket "assemble again"', async () => {
    serve(refused(422, {
      error: MESSAGE,
      details: { code: 'PRE_TRANSMIT_BLOCKED', findings: BLOCKERS.map((message) => ({ severity: 'error', ruleId: 'PRE-TRANSMIT', message })) },
    }));
    const toast = await transmit();
    const card = await screen.findByRole('region', { name: 'Pre-transmit refusal' });
    expect(card.textContent).toMatch(/Pre-transmit checks refused the transmit/);
    expect(card.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(card.querySelector('.s')?.textContent).toBe('2 findings');
    expect(card.textContent).toMatch(/large-submission channel/);
    expect(card.textContent).not.toMatch(/did not include an itemized/);
    expect(card.textContent).not.toMatch(/structural gate/i);
    expect(card.textContent).not.toMatch(/Assemble the package again/);
    expect(toast.textContent).toMatch(/pre-transmit checks refused the bundle/);
    expect(toast.textContent).not.toMatch(/structural gate/i);
    expect(screen.queryByRole('region', { name: 'Structural gate refusal' })).toBeNull();
  });

  it('blockers sent as plain sentences are itemized, not dropped into "0 findings"', async () => {
    serve(refused(422, { error: MESSAGE, details: { findings: BLOCKERS } }));
    await transmit();
    const card = await screen.findByRole('region', { name: /refusal/ });
    expect(card.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(card.querySelector('.s')?.textContent).toBe('2 findings');
    expect(card.textContent).not.toMatch(/did not include an itemized/);
  });
});

describe('HS-4 — a refusal before the wire says so in words, never as an enum token', () => {
  it('412 TRANSPORT_NOT_VERIFIED: nothing was sent, and it is not called a credentials problem', async () => {
    serve(refused(412, {
      error: 'FDA esg rest transport is configured but its wire contract has not been verified against the agency specification; nothing was transmitted. Use FDA_ESG_TRANSPORT=as2 for the verified AS2 path.',
      details: { code: 'TRANSPORT_NOT_VERIFIED', transmitted: false },
    }));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/Not transmitted — nothing was sent/);
    expect(toast.textContent).toMatch(/not been verified/);
    expect(toast.textContent).not.toMatch(/credentials are not configured/);
    expect(toast.textContent).not.toMatch(/FDA_ESG_TRANSPORT|TRANSPORT_NOT_VERIFIED/);
  });

  it('a 422 beside a gateway that cannot transmit (REST transport, unverified) does not call it a credentials gap', async () => {
    const REST = [{ region: 'fda', gateway: 'esg', transport: 'rest', configured: false, environment: 'production' }];
    serve(refused(422, { error: 'Bundle failed eCTD structural validation (1 error).', details: { code: 'BUNDLE_VALIDATION_ERRORS', findings: [] } }), undefined, REST);
    const toast = await transmit();
    expect(toast.textContent).toMatch(/structural gate rejected the bundle/);
    expect(toast.textContent).toMatch(/FDA ESG is also not set up to transmit for this organization yet, so nothing could be sent through it/);
    expect(toast.textContent).not.toMatch(/credentials/);
    // The table and AnA say the same: able to transmit or not, never "holds credentials".
    expect(screen.getByText('cannot transmit')).toBeTruthy();
    expect(published.current?.summary).toMatch(/0 of 1 gateway\(s\) can transmit/);
    expect(published.current?.summary).not.toMatch(/credentials/);
    expect(published.current?.facts).toMatchObject({ gatewaysConfigured: 0, gatewaysUnableToTransmit: ['esg'] });
    expect(published.current?.facts).not.toHaveProperty('gatewaysAwaitingCredentials');
  });

  it('a 500 shows the server’s sentence, not its error code', async () => {
    serve(refused(500, { error: 'INTERNAL_ERROR', message: 'Something went wrong while transmit. The problem has been logged.' }));
    const toast = await transmit();
    expect(toast.textContent).not.toMatch(/INTERNAL_ERROR/);
    expect(toast.textContent).toMatch(/Something went wrong while transmit/);
  });
});

describe('HS-5 — the log is reloaded after every transmit answer but a 401, and an unconfirmed outcome is not called a failure', () => {
  const DELIVERED = 'ESG AS2 POST timed out. The bundle was delivered (HTTP 200, AS2 Message-ID <m@x>) and FDA may hold it: transmittal 4245 is recorded in transit, not rejected. Confirm receipt at FDA before any resend.';
  const ROW_4245 = { ...ROW_3, id: 4245, transmission_id: 'ESG-4245', status: 'in_transit', ack_received_at: null };
  /** The log answers the pre-transmit state first, then the row the attempt wrote. */
  const logAfterAttempt = () => {
    let reads = 0;
    return () => { reads += 1; return env(reads === 1 ? [ROW_3] : [ROW_4245, ROW_3]); };
  };

  it('502 delivered-unconfirmed: "did not complete", the server’s sentence once, and the in-transit row that holds the lock is shown', async () => {
    serve(refused(502, { error: DELIVERED }), logAfterAttempt());
    const toast = await transmit();
    expect(toast.textContent).toMatch(/Transmit did not complete/);
    expect(toast.textContent).not.toMatch(/Transmit failed/);
    expect(toast.textContent).toMatch(/FDA may hold it: transmittal 4245 is recorded in transit/);
    expect(toast.textContent).toMatch(/check the transmittal log before any resend/i);
    expect(toast.textContent).not.toMatch(/\.\./);
    expect(await screen.findByText('ESG-4245')).toBeTruthy();
    expect(screen.getByText('in_transit')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Rollback/ })).toHaveLength(2);
  });

  it.each([
    { answer: '409', post: refused(409, { error: 'An active transmittal holds the lock', details: { transmittalId: 4245, status: 'in_transit' } }) },
    { answer: '412', post: refused(412, { error: 'FDA esg (production) — missing credentials.' }) },
    { answer: '422', post: refused(422, { error: 'Bundle failed eCTD structural validation (1 error).', details: { findings: [] } }) },
    { answer: '500', post: refused(500, { error: 'INTERNAL_ERROR' }) },
    { answer: 'no response', post: () => { throw new TypeError('Failed to fetch'); } },
  ])('$answer: the transmittal log is read again', async ({ post }) => {
    serve(post, logAfterAttempt());
    await transmit();
    await waitFor(() => expect(logReads()).toBe(2));
    expect(await screen.findByText('ESG-4245')).toBeTruthy();
  });

  it('401 (re-authentication failed, refused before any row exists): the log is not re-read', async () => {
    serve(() => ({ ok: false, status: 401, json: async () => ({ error: 'REAUTH_REQUIRED' }) } as Response), logAfterAttempt());
    const toast = await transmit();
    expect(toast.textContent).toMatch(/re-authentication failed/);
    expect(logReads()).toBe(1);
  });

  it('a send recorded in transit says the agency has not acknowledged receipt yet; a received one does not', async () => {
    serve(() => env({ ...SENT, status: 'in_transit', preTransmitFailedChecks: [], preTransmitWarnings: [] }, 201));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/gateway ref MDN-1\. The agency has not acknowledged receipt yet\./);
    cleanup();
    serve(() => env({ ...SENT, preTransmitFailedChecks: [], preTransmitWarnings: [] }, 201));
    const received = await transmit();
    expect(received.textContent).toMatch(/gateway ref MDN-1/);
    expect(received.textContent).not.toMatch(/not acknowledged receipt/);
  });

  it('no response at all: the outcome is unknown — not "failed", not "nothing was sent"', async () => {
    serve(() => { throw new TypeError('Failed to fetch'); });
    const toast = await transmit();
    expect(toast.textContent).toMatch(/Transmit did not complete/);
    expect(toast.textContent).toMatch(/check the transmittal log before any resend/i);
    expect(toast.textContent).not.toMatch(/nothing was sent|Transmit failed/);
    expect(toast.getAttribute('role')).toBe('alert');
  });
});

describe('HS-6 — the active-transmittal refusal keeps the agency caveat', () => {
  it('the server’s own sentence is shown when it names no internal route', async () => {
    const sentence = 'Sequence 0001 of this package already has an active production transmittal (transmittal 3, in transit), sent as a different bundle, and the agency may already hold it. Confirm receipt with the agency before sending sequence 0001 again; if it did not arrive, roll transmittal 3 back from its row in Gateway transmittals first.';
    serve(refused(409, { error: sentence, details: { code: 'ACTIVE_TRANSMITTAL', transmittalId: 3, status: 'in_transit', sequence: '0001' } }));
    const toast = await transmit();
    expect(toast.textContent).toContain(`Not transmitted — ${sentence}`);
  });

  it('a sentence that names a route falls back to words that still carry the caveat', async () => {
    serve(refused(409, {
      error: 'An active transmittal already exists for this package (id=3, status=in_transit). Roll it back via POST /api/mdx/gateways/transmittals/3/rollback before re-transmitting.',
      details: { code: 'ACTIVE_TRANSMITTAL', transmittalId: 3, status: 'in_transit' },
    }));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/transmittal #3 is already active \(in transit\)/);
    expect(toast.textContent).toMatch(/the agency may already hold it/);
    expect(toast.textContent).toMatch(/Confirm receipt with the agency before sending again/);
    expect(toast.textContent).not.toMatch(/\/api\//);
  });

  it('a received holder: receipt was acknowledged, and a rollback is not offered as the way to re-send', async () => {
    serve(refused(409, {
      error: 'An active transmittal already exists for this package (id=3, status=received). Roll it back via POST /api/mdx/gateways/transmittals/3/rollback before re-transmitting.',
      details: { code: 'ACTIVE_TRANSMITTAL', transmittalId: 3, status: 'received' },
    }));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/acknowledged receipt of transmittal #3/);
    expect(toast.textContent).toMatch(/A rollback does not retract it/);
    expect(toast.textContent).not.toMatch(/Roll it back|roll .* back from its row/i);
  });

  it('a 409 that is not the lock (no creator recorded) says the server’s sentence — no transmittal, no agency caveat', async () => {
    const sentence = 'No creator is recorded for this package, so nobody can be shown to be independent of it and it cannot be transmitted. Nothing was transmitted.';
    serve(refused(409, { error: sentence, details: { code: 'SIGNER_INDEPENDENCE_UNRESOLVED' } }));
    const toast = await transmit();
    expect(toast.textContent).toContain(`Not transmitted — ${sentence}`);
    expect(toast.textContent).not.toMatch(/agency may already hold|already active|transmittal #|Confirm receipt/);
  });

  it('a 409 under another code with no readable sentence says it was refused and nothing was sent', async () => {
    serve(refused(409, { error: 'PACKAGE_STATE_CONFLICT', details: { code: 'PACKAGE_STATE_CONFLICT' } }));
    const toast = await transmit();
    expect(toast.textContent).toMatch(/Not transmitted — the package’s current state does not allow this transmit; nothing was sent\./);
    expect(toast.textContent).not.toMatch(/PACKAGE_STATE_CONFLICT|agency may already hold|transmittal #/);
  });
});

describe('HS-7 — a clean assembly’s warnings are listed, in a card titled for warnings', () => {
  const ASSEMBLED = { packageId: 'pkg_77', bundle: { sha256: 'a'.repeat(64), leafCount: 3, validation: { errorCount: 0, warningCount: 2, infoCount: 1 } } };
  const WARNINGS = [
    { severity: 'info', ruleId: 'SUMMARY', message: '3 leaf(s), 0 empty' },
    { severity: 'warning', ruleId: 'M1-COVER-LETTER-MISSING', message: 'FDA expects a cover letter with every submission (Module 1.2).' },
    { severity: 'warning', ruleId: 'PLACEHOLDER-ON-FILE', message: 'Withdraw it with withdraw: [{ ctdSection: "2.5", fileName: "clinical-overview.pdf" }].' },
  ];

  it('loads them from preflight and shows them, warnings first, without calling the bundle untransmittable', async () => {
    serve((url) => (url.endsWith('/assemble') ? env(ASSEMBLED) : url.endsWith('/preflight') ? env({ findings: WARNINGS }) : env(null)));
    const toast = await assemble();
    expect(toast.textContent).toMatch(/Bundle assembled for pkg_77 · 3 leaves · 2 warnings/);
    const card = await screen.findByRole('region', { name: 'Assembly warnings' });
    expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/submission-ops/packages/77/preflight')).toBe(true);
    const chips = Array.from(card.querySelectorAll('.rd-chip')).map((c) => c.textContent);
    expect(chips).toEqual(['M1-COVER-LETTER-MISSING', 'PLACEHOLDER-ON-FILE', 'SUMMARY']);
    expect(card.textContent).toMatch(/clinical-overview\.pdf/);
    expect(card.textContent).toMatch(/warnings to review/);
    expect(card.textContent).not.toMatch(/not transmittable|Resolve the findings/);
    expect(screen.queryByRole('region', { name: 'Packager refusal' })).toBeNull();
  });

  it('warnings that could not be loaded are said, not shown as an empty card', async () => {
    serve((url) => (url.endsWith('/assemble') ? env(ASSEMBLED) : url.endsWith('/preflight') ? refused(503, { error: 'Preflight is unavailable.' })() : env(null)));
    await assemble();
    const card = await screen.findByRole('region', { name: 'Assembly warnings' });
    expect(card.textContent).toMatch(/could not be loaded/);
    expect(card.querySelector('.s')?.textContent).toBe('findings unavailable');
  });

  /* Preflight runs the configured external validator and the bundle-content
     checks, which add error-severity findings the assembly never counted. */
  const ONE_WARNING = { ...ASSEMBLED, bundle: { ...ASSEMBLED.bundle, validation: { errorCount: 0, warningCount: 1, infoCount: 0 } } };
  const DRIFTED = {
    findings: [
      { severity: 'warning', ruleId: 'M1-COVER-LETTER-MISSING', message: 'FDA expects a cover letter with every submission (Module 1.2).' },
      { severity: 'error', ruleId: 'BUNDLE-CONTENT-DRIFT', message: 'The package content changed since this bundle was assembled.' },
    ],
    errorCount: 1,
  };

  it('an error-severity finding preflight reports, which the assembly did not count, makes the card the refusal', async () => {
    serve((url) => (url.endsWith('/assemble') ? env(ONE_WARNING) : url.endsWith('/preflight') ? env(DRIFTED) : env(null)));
    const toast = await assemble();
    const card = await screen.findByRole('region', { name: 'Packager refusal' });
    expect(card.textContent).toMatch(/Preflight reports 1 error-severity finding on the stored bundle for package pkg_77; transmit will refuse it/);
    expect(card.textContent).toMatch(/BUNDLE-CONTENT-DRIFT/);
    expect(card.textContent).not.toMatch(/warnings to review|Warnings do not stop a transmit|no error-severity findings/);
    expect(screen.queryByRole('region', { name: 'Assembly warnings' })).toBeNull();
    expect(toast.textContent).toMatch(/Bundle assembled for pkg_77 · 3 leaves · 1 warning ·/);
    expect(toast.textContent).toMatch(/preflight reports 1 error-severity finding on the stored bundle that the assembly did not count/);
    expect(toast.textContent).toMatch(/listed below/);
    expect(toast.textContent).not.toMatch(/No error-severity findings/);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('an empty preflight list beside counted warnings is said as a disagreement, not as a clean bundle', async () => {
    serve((url) => (url.endsWith('/assemble') ? env(ASSEMBLED) : url.endsWith('/preflight') ? env({ findings: [] }) : env(null)));
    await assemble();
    const card = await screen.findByRole('region', { name: 'Assembly warnings' });
    expect(card.textContent).toMatch(/Preflight lists no findings on the stored bundle, yet assembly counted 2 warnings; the two disagree/);
    // An empty list the assembly contradicts is not a count of zero.
    expect(card.querySelector('.s')?.textContent).toBe('findings unavailable');
  });

  it.each([
    { reloaded: { findings: WARNINGS, errorCount: 0 }, region: 'Assembly warnings', title: /warnings to review/ },
    { reloaded: DRIFTED, region: 'Packager refusal', title: /Bundle not transmittable/ },
  ])('Reload findings on a warnings card → $region', async ({ reloaded, region, title }) => {
    let preflights = 0;
    serve((url) => {
      if (url.endsWith('/assemble')) return env(ASSEMBLED);
      if (!url.endsWith('/preflight')) return env(null);
      preflights += 1;
      return env(preflights === 1 ? { findings: WARNINGS } : reloaded);
    });
    await assemble();
    await screen.findByRole('region', { name: 'Assembly warnings' });
    fireEvent.click(screen.getByRole('button', { name: /Reload findings/ }));
    await waitFor(() => expect(preflights).toBe(2));
    const card = await screen.findByRole('region', { name: region });
    expect(card.querySelector('.t')?.textContent).toMatch(title);
  });

  it('an assembly with no warnings fetches nothing and shows no card', async () => {
    serve((url) => (url.endsWith('/assemble')
      ? env({ ...ASSEMBLED, bundle: { ...ASSEMBLED.bundle, validation: { errorCount: 0, warningCount: 0, infoCount: 1 } } })
      : env(null)));
    await assemble();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).endsWith('/preflight'))).toBe(false);
    expect(screen.queryByRole('region', { name: /Assembly warnings|refusal/ })).toBeNull();
  });
});

describe('HS-8 — the log’s count and AnA’s facts come from the server’s totals', () => {
  const PAGE = Array.from({ length: 100 }, (_, i) => ({ ...ROW_3, id: 1000 - i, transmission_id: `ESG-${1000 - i}` }));

  it('a truncated page: "100 of 250", a note that older ones are not listed, and AnA gets the totals', async () => {
    serve(() => env(null), () => env(PAGE, 200, {
      count: 100, total: 250, hasMore: true, byStatus: { acknowledged: 220, in_transit: 30 }, awaitingAcknowledgement: 30,
    }));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-1000');
    expect(screen.getByText('100 of 250')).toBeTruthy();
    expect(screen.getByText(/older transmittals are not listed here/i)).toBeTruthy();
    await waitFor(() => expect(published.current?.facts?.transmittalCount).toBe(250));
    expect(published.current?.facts).toMatchObject({
      transmittalCount: 250, transmittalsListed: 100, logTruncated: true,
      awaitingAcknowledgement: 30, byStatus: { acknowledged: 220, in_transit: 30 },
    });
    expect(published.current?.summary).toMatch(/250 transmittal\(s\) logged/);
  });

  it('a page with more to come but no total says older ones are not listed, without inventing a total', async () => {
    serve(() => env(null), () => env(PAGE, 200, { count: 100, hasMore: true }));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-1000');
    expect(screen.getByText('Showing the 100 most recently submitted transmittals. Older transmittals are not listed here.')).toBeTruthy();
    expect(screen.queryByText(/100 of/)).toBeNull();
    await waitFor(() => expect(published.current?.facts?.logTruncated).toBe(true));
    expect(published.current?.facts?.transmittalCount).toBeNull();
  });

  it('without the server’s totals the facts are unknown, never computed from the page', async () => {
    serve(() => env(null), () => env(PAGE));
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-1000');
    await waitFor(() => expect(published.current?.facts?.dispatchState).toBe('ready'));
    expect(published.current?.facts).toMatchObject({
      transmittalCount: null, transmittalsListed: 100, logTruncated: null, awaitingAcknowledgement: null, byStatus: null,
    });
    expect(published.current?.summary).not.toMatch(/100 transmittal\(s\) logged/);
    expect(screen.queryByText(/not listed here/)).toBeNull();
  });
});
