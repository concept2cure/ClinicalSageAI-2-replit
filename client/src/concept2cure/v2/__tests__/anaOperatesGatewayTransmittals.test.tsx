// @vitest-environment jsdom
/**
 * AnA operates Submission Gateway Transmittals (wave 7).
 *
 * An audit of the shipped catalog found 13 of its 29 screens with no
 * registered action at all: she navigated there and then had nothing to do.
 * This is the last screen before bytes leave for an agency, so it is also the
 * one where the line between "operate" and "sign" matters most. Since the
 * 2026-10-17 app audit (FILING_SPINE F12) it is a read-only transmittal log:
 * assemble, identifiers, package transmit and unsigned rollback moved to the
 * sequence's Dispatch tab in the Submission Center. What is left to operate is
 * the row's Status button, and that is the one action registered. The signed
 * technical rejection stays a person's own click.
 *
 * It pins the refusals too, because this screen's refusals are the honest
 * ones: a log that could not be read is never reported as an organization
 * with no transmittals, and a log number that is not on screen comes back with
 * the numbers that ARE.
 *
 * It also pins a removal. `submission-gateway.reload-findings` drove the
 * refusal card's Reload findings button, and that card existed only after a
 * refused assemble or transmit — both of which left this screen. An action
 * whose control has gone is a dead end (AnA is told she can, tries, and the
 * bus refuses), so it left the registry in the same change.
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
// The technical-rejection dialog's form. Never opened here: that rejection is a
// signed act and stays a person's click.
vi.mock('../C2CForm', () => ({ C2CForm: () => null }));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const GATEWAYS_URL = '/api/mdx/gateways';
const LOG_URL = '/api/mdx/gateways/transmittals';

const env = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => ({ data }) }) as Response;
const serverError = () => ({ ok: false, status: 500, json: async () => ({ error: 'transmittal log unavailable' }) }) as Response;

const GATEWAYS = [{ region: 'fda', gateway: 'esg', name: 'FDA ESG', configured: true, environment: 'production' }];
const row = (id: number, ref: string | null, status: string) => ({
  id, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: ref, status,
  submitted_at: '2026-07-21T00:00:00Z', ack_received_at: null, submitted_by: 11, submitted_by_name: 'Dr Ada Lovelace',
});
const LOG = [row(12, 'ESG-ALPHA-1', 'acknowledged'), row(13, 'ESG-BETA-2', 'received'), row(14, null, 'submitted')];
// Linked from another screen (?transmittalId=99) and NOT on the log page the
// read returns: the screen pins it to the top of the table anyway.
const LINKED = row(99, 'ESG-LINKED-9', 'received');

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
    if (url === `${LOG_URL}/99`) return env(LINKED);
    if (url === `${LOG_URL}/99/status`) return env({ transmittalId: 99, status: 'received', source: 'live', gatewayState: 'IN_TRANSIT' });
    return env(null);
  });
}

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
  serveEverything();
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  window.history.replaceState({}, '', '/');
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
    expect(reasonOf(outcome)).toMatch(/The transmittal log could not be read/);
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
  it('a transmittal linked from another screen is on the table, so she can name it too', async () => {
    // Opened from a notification or another screen: the hook reads the exact
    // row separately and pins it above the log page. A person can press its
    // Status button, so the handler resolves against the rows the TABLE renders
    // (logRows) rather than the log read alone, or AnA would refuse a row that
    // is plainly on screen.
    window.history.replaceState({}, '', '/?transmittalId=99');
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-LINKED-9');

    const outcome = send('submission-gateway.show-status', { transmittal: '#99' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/transmittal #99/);
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === `${LOG_URL}/99/status`)).toBe(true));
  });
});

describe('reload-findings left with its control', () => {
  it('is not a registered action — the refusal card it drove is gone from this screen', () => {
    const res = resolveSurfaceAction('submission-gateway.reload-findings', {});
    expect(res.ok, 'an action whose control has left the screen is a dead end').toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('unknown_action');
  });

  it('and the screen offers no Reload findings, assemble or package transmit to a person either', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-ALPHA-1');
    for (const name of [/Reload findings/, /Assemble bundle/, /^Transmit/]) {
      expect(screen.queryByRole('button', { name }), `${name} must not be on the read-only log`).toBeNull();
    }
  });
});

describe('the governed acts stay a person’s own click', () => {
  it('no governed act on or formerly on this screen is a performable action', () => {
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
