// @vitest-environment jsdom
/**
 * AnA operates Submission Gateway Transmittals (wave 7).
 *
 * An audit of the shipped catalog found 13 of its 29 screens with no
 * registered action at all: she navigated there and then had nothing to do.
 * This is the last screen before bytes leave for an agency, so it is also the
 * one where the line between "operate" and "sign" matters most: the two
 * read-only reveals are hers (the row's Status button, the refusal card's
 * Reload findings button) and the five governed acts — transmit, rollback,
 * technical rejection, record identifiers, assemble — are not. Only the two
 * are registered, and this mounts the REAL surface to prove each one drives
 * the same function its control drives.
 *
 * It pins the refusals too, because this screen's refusals are the honest
 * ones: a dispatch layer that did not answer is never reported as an
 * organization with no transmittals, a log number that is not on screen comes
 * back with the numbers that ARE, and "reload the findings" with no refusal
 * card says so flatly rather than being held until it times out.
 *
 * Note on ids: the registry entries are `submission-gateway.*` (the
 * navigation-target id, shared/navigation/index.ts) while the surface
 * registers as `gateway-transmittals` (the v2 surface id, via
 * DEEP_LINK_ALIASES). The bus resolves the alias; these tests send the
 * registry's ids and the real surface answers them.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
// One submit button per dialog. Only the assemble form is driven here — it is
// the human path that puts a refusal card (and a last package id) on screen,
// which is the only state in which Reload findings exists at all.
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button
      data-testid="form-submit"
      onClick={() => onSubmit({ packageId: '77', region: 'FDA', sequence: '0001', reason: 'Assemble sequence 0001 for FDA' })}
    >
      {config.submitLabel}
    </button>
  ),
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const GATEWAYS_URL = '/api/mdx/gateways';
const LOG_URL = '/api/mdx/gateways/transmittals';
const PREFLIGHT_URL = '/api/submission-ops/packages/77/preflight';
const ASSEMBLE_URL = '/api/submission-ops/packages/77/assemble';

const env = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => ({ data }) }) as Response;
const serverError = () => ({ ok: false, status: 500, json: async () => ({ error: 'dispatch layer down' }) }) as Response;

const GATEWAYS = [{ region: 'fda', gateway: 'esg', name: 'FDA ESG', configured: true, environment: 'production' }];
const row = (id: number, ref: string | null, status: string) => ({
  id, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: ref, status,
  submitted_at: '2026-07-21T00:00:00Z', ack_received_at: null, submitted_by: 11, submitted_by_name: 'Dr Ada Lovelace',
});
const LOG = [row(12, 'ESG-ALPHA-1', 'acknowledged'), row(13, 'ESG-BETA-2', 'received'), row(14, null, 'submitted')];

const props = () =>
  ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

/**
 * Send an action through the real bus, as a drive does. A mounted screen
 * answers at once; one that has not mounted (or whose read is in flight) is
 * stashed and answers through the deferred callback. `settled()` is whichever
 * came, so a test reads the same either way.
 */
function send(actionId: string, params: Record<string, string> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`${actionId} does not resolve: ${res.error}`);
  const deferred = vi.fn();
  const immediate = applySurfaceAction(res.directive, vi.fn(), deferred);
  const settled = () => (immediate.status === 'stashed' ? deferred.mock.calls.at(-1)?.[0] : immediate);
  return { immediate, deferred, settled };
}
type Sent = ReturnType<typeof send>;

const applied = (s: Sent) => waitFor(() => expect(s.settled()).toMatchObject({ status: 'applied' }));
const refused = (s: Sent) => waitFor(() => expect(s.settled()).toMatchObject({ status: 'failed' }));
const reasonOf = (s: Sent) => String(s.settled()?.reason ?? '');
const detailOf = (s: Sent) => String(s.settled()?.detail ?? '');

/** The screen's own reads, all answering. Cases override one at a time. */
function serveEverything(overrides: Record<string, () => Response> = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const key = `${method} ${url}`;
    if (overrides[key]) return overrides[key]();
    if (url === GATEWAYS_URL) return env(GATEWAYS);
    if (url === LOG_URL) return env(LOG);
    if (url === `${LOG_URL}/12/status`) return env({ transmittalId: 12, status: 'acknowledged', source: 'stored', gatewayState: 'DONE' });
    if (url === `${LOG_URL}/13/status`) return env({ transmittalId: 13, status: 'received', source: 'live', gatewayState: 'IN_TRANSIT' });
    if (url === PREFLIGHT_URL) {
      return env({ errorCount: 1, validation: { findings: [{ ruleId: 'MODULE1-BACKBONE', severity: 'error', message: 'Module 1 backbone incomplete' }] } });
    }
    if (url === ASSEMBLE_URL) {
      // 422 from the packager: the human path to a refusal card, and the only
      // state in which the Reload findings control exists.
      return { ok: false, status: 422, json: async () => ({ error: 'the packager refused the bundle', validation: { findings: [{ ruleId: 'REGULATORY-IDENTIFIER-MISSING', severity: 'error', message: 'No application number recorded' }] } }) } as Response;
    }
    return env(null);
  });
}

/** Drive the human assemble path to a refusal card, as a person would. */
async function putARefusalCardOnScreen() {
  fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
  fireEvent.click(screen.getByTestId('form-submit'));
  await screen.findByText(/Bundle not transmittable/);
}

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
  serveEverything();
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

describe('show a transmittal’s gateway status — the row’s Status button, in her hands', () => {
  it('opens the gateway-status card for a transmittal named by its log number', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');

    const outcome = send('submission-gateway.show-status', { transmittal: '#12' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/Showing the gateway status for transmittal #12/);
    // Said as work started, never as a result the synchronous handler never saw.
    expect(detailOf(outcome), 'the handler must not claim the gateway’s answer').toMatch(/when the gateway answers/);

    // The card a person would see, and the same read the Status button performs.
    await screen.findByText(/Gateway status · transmittal #12/);
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === `${LOG_URL}/12/status`)).toBe(true);
    // It names whether the agency was polled; this row's read says it was not.
    expect(screen.getByText(/last recorded state · the agency was not asked/)).toBeTruthy();
  });

  it('resolves a transmittal by its gateway reference, and a bare number works too', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-BETA-2');

    const byRef = send('submission-gateway.show-status', { transmittal: 'esg-beta-2' });
    await applied(byRef);
    await screen.findByText(/Gateway status · transmittal #13/);
    expect(screen.getByText(/live poll/)).toBeTruthy();

    cleanup();
    __resetSurfaceActionBus();
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');
    const bare = send('submission-gateway.show-status', { transmittal: '12' });
    await applied(bare);
    await screen.findByText(/Gateway status · transmittal #12/);
  });

  it('a transmittal that is not in the log is refused, listing the numbers that are', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');

    const outcome = send('submission-gateway.show-status', { transmittal: '#999' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No transmittal "#999" in this log/);
    expect(reasonOf(outcome), 'a miss must list what IS on screen so she can retry with a real number')
      .toMatch(/Transmittals logged: "#12 · ESG-ALPHA-1", "#13 · ESG-BETA-2", "#14"/);
  });

  it('an ambiguous gateway reference says how many matched rather than guessing', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === GATEWAYS_URL) return env(GATEWAYS);
      if (url === LOG_URL) return env([row(20, 'ESG-DUP-A', 'received'), row(21, 'ESG-DUP-B', 'received')]);
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-DUP-A');

    const outcome = send('submission-gateway.show-status', { transmittal: 'ESG-DUP' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/"ESG-DUP" matches 2 transmittals — name one exactly/);
    expect(reasonOf(outcome)).toMatch(/Matched: "#20 · ESG-DUP-A", "#21 · ESG-DUP-B"/);
    // Nothing was polled: an ambiguous name must not pick one.
    expect(apiRequest.mock.calls.some(([, u]) => String(u).includes('/status'))).toBe(false);
  });

});

describe('show a transmittal’s gateway status — its honest refusals', () => {
  it('a missing transmittal never reaches the screen — the registry requires the param', () => {
    // The registry validates params before the bus is involved, exactly as it
    // validates an out-of-enum value elsewhere. The handler keeps its own
    // guard (with the logged numbers) for a caller that bypasses the registry.
    const res = resolveSurfaceAction('submission-gateway.show-status', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('missing_param');
    expect(res.error).toMatch(/requires param "transmittal"/);
  });

  it('a bare "#" picks nothing — not the row whose Gateway ref column reads “—”', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');

    const outcome = send('submission-gateway.show-status', { transmittal: '#' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No transmittal "#" in this log/);
    // #14 holds a null transmission_id; an empty name must not equal it.
    expect(apiRequest.mock.calls.some(([, u]) => String(u).includes('/status'))).toBe(false);
  });

  it('an empty log says so, and does not read as a screen with nothing on it', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === GATEWAYS_URL) return env(GATEWAYS);
      if (url === LOG_URL) return env([]);
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('No transmittals yet');

    const outcome = send('submission-gateway.show-status', { transmittal: '#12' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No transmittals have been logged for this organization yet/);
  });

  it('an action sent before the log lands is held, then applied when it does', async () => {
    let answer!: (r: Response) => void;
    const inFlight = new Promise<Response>((resolve) => (answer = resolve));
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === GATEWAYS_URL) return env(GATEWAYS);
      if (url === LOG_URL) return inFlight;
      if (url === `${LOG_URL}/12/status`) return env({ transmittalId: 12, status: 'acknowledged', source: 'stored' });
      return env(null);
    });

    const outcome = send('submission-gateway.show-status', { transmittal: '#12' });
    expect(outcome.immediate, 'nothing is mounted yet, so the bus holds it').toEqual({ status: 'stashed' });
    render(<GatewayTransmittals {...props()} />);
    await waitFor(() => expect(apiRequest.mock.calls.some(([, u]) => u === LOG_URL)).toBe(true));
    expect(outcome.deferred, 'answered before the transmittal log landed').not.toHaveBeenCalled();

    answer(env(LOG));
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/transmittal #12/);
    await screen.findByText(/Gateway status · transmittal #12/);
  });

  it('a FAILED log read gets the handler’s refusal, not a twenty-second timeout', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => (url === LOG_URL ? serverError() : env(GATEWAYS)));

    const outcome = send('submission-gateway.show-status', { transmittal: '#12' });
    expect(outcome.immediate, 'nothing is mounted yet, so the bus holds it').toEqual({ status: 'stashed' });
    render(<GatewayTransmittals {...props()} />);

    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/The dispatch layer did not respond/);
    expect(reasonOf(outcome), 'a failed read must not read as an organization with no transmittals')
      .toMatch(/not the same as this organization having none/);
  });

  it('a card already on screen for that row says so rather than re-polling the agency', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');

    await applied(send('submission-gateway.show-status', { transmittal: '#12' }));
    await screen.findByText(/Gateway status · transmittal #12/);
    const pollsSoFar = apiRequest.mock.calls.filter(([, u]) => u === `${LOG_URL}/12/status`).length;

    const again = send('submission-gateway.show-status', { transmittal: '#12' });
    await applied(again);
    expect(detailOf(again), 'a no-op says so rather than claiming a change').toMatch(/Already showing the gateway status for transmittal #12/);
    expect(apiRequest.mock.calls.filter(([, u]) => u === `${LOG_URL}/12/status`).length).toBe(pollsSoFar);
  });
});

describe('reload the refusal findings — the card’s own control, in her hands', () => {
  it('re-runs preflight for the package on the card, and the card carries the verdict', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');
    await putARefusalCardOnScreen();
    expect(screen.getByRole('button', { name: /Reload findings/ })).toBeTruthy();

    const outcome = send('submission-gateway.reload-findings', {});
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/Re-running preflight for package 77/);
    // No count and no "clear" in the detail — the card states what preflight reports.
    expect(detailOf(outcome), 'the handler must not report a finding count it never saw').not.toMatch(/\d+ (error|finding)/);

    expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === PREFLIGHT_URL)).toBe(true);
    await screen.findByText(/Preflight reports 1 error-severity finding on the stored bundle for package 77/);
    expect(screen.getByText('Module 1 backbone incomplete')).toBeTruthy();
  });

  it('a preflight that could not be run reaches the card as that, not as a clear bundle', async () => {
    serveEverything({ [`POST ${PREFLIGHT_URL}`]: () => serverError() });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');
    await putARefusalCardOnScreen();

    const outcome = send('submission-gateway.reload-findings', {});
    await applied(outcome);
    await screen.findByText(/Preflight could not be run for package 77/);
    expect(screen.queryByText(/no error-severity findings/)).toBeNull();
  });

  it('with no refusal card showing it is refused flatly — never held until it times out', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');
    expect(screen.queryByRole('button', { name: /Reload findings/ }), 'the control only exists on the card').toBeNull();

    const outcome = send('submission-gateway.reload-findings', {});
    expect(outcome.immediate.status, 'a state the load can never reach must not be held').toBe('failed');
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No refusal findings are showing, so there is nothing to reload/);
    expect(reasonOf(outcome)).toMatch(/appears only after an assembly or a transmit was refused/);
    expect(apiRequest.mock.calls.some(([, u]) => u === PREFLIGHT_URL)).toBe(false);
  });

  it('is refused the same way when it arrives before the screen has mounted', async () => {
    const outcome = send('submission-gateway.reload-findings', {});
    expect(outcome.immediate, 'nothing is mounted yet, so the bus holds it').toEqual({ status: 'stashed' });
    render(<GatewayTransmittals {...props()} />);

    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No refusal findings are showing/);
  });

  it('takes no params at all, so the registry resolves it bare', () => {
    const res = resolveSurfaceAction('submission-gateway.reload-findings', {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.directive.params ?? {}).toEqual({});
    // The registry's id is the nav target; the surface registers the alias.
    expect(res.directive.surfaceId).toBe('submission-gateway');
  });
});

describe('the governed acts stay a person’s own click', () => {
  it('neither registry id names governed work, and the five ceremonies have no action', () => {
    for (const governed of [
      'submission-gateway.transmit',
      'submission-gateway.rollback',
      'submission-gateway.record-identifiers',
      'submission-gateway.assemble-bundle',
      'submission-gateway.technical-rejection',
    ]) {
      const res = resolveSurfaceAction(governed, {});
      expect(res.ok, `${governed} must not be a performable action`).toBe(false);
    }
  });
});
