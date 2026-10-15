// @vitest-environment jsdom
/**
 * AnA operates the audit trail and the apps catalog (wave 7).
 *
 * An audit of the shipped catalog found 13 of its 29 screens with no
 * registered action at all: AnA could navigate there and then do nothing. The
 * audit trail is the worst of them to leave mute — it is the last stop of the
 * training demonstration and the first place an inspector looks, so every
 * demonstration ended on a screen she could not touch.
 *
 * These mount the REAL surfaces and drive the registry's actions through the
 * real bus, asserting what a person would see: the kind filter narrows the
 * table, the search box carries the term, a row opens, the hash chain shows.
 * The refusals are checked too — a kind the ledger does not file is named and
 * refused, and a failed read says the ledger could not be read rather than
 * letting an empty table read as an empty ledger.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Apps, AuditTrail } from '../surfaces/AdminSurfaces';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const LEDGER = '/api/audit-trail/ledger';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const serverError = () => ({ ok: false, status: 500, json: async () => ({ success: false }) }) as Response;

const entry = (id: string, kind: string, event: string) => ({
  id, kind, event, when: '2026-10-11 09:00', actor: 'JM Smith', actorRef: 'user:1',
  target: `${kind}:thing`, sig: kind === 'esign', hash: `h-${id}`, prevHash: 'h-0', ip: '127.0.0.1',
});
const ENTRIES = [
  entry('AUD-1', 'esign', 'Document signed'),
  entry('AUD-2', 'authoring', 'Section drafted'),
  entry('AUD-3', 'vault', 'File filed'),
];

const props = (id: string) => ({ surface: { id }, onAsk: vi.fn(), onNav: vi.fn() }) as any;

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

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => (String(url).startsWith(LEDGER) ? ok(ENTRIES) : ok(null)));
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

describe('the audit trail — the demonstration ended on a screen AnA could not touch', () => {
  it('filters the ledger to one kind of governed event, and says how many that is', async () => {
    render(<AuditTrail {...props('audit-trail')} />);
    await screen.findByText('AUD-2');

    const outcome = send('audit-trail.filter-entries', { kind: 'esign' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/E-sign — 1 of 3 entries/);
    // The table really narrowed: the two other kinds are gone.
    await waitFor(() => expect(screen.queryByText('AUD-2')).toBeNull());
    expect(screen.getByText('AUD-1')).toBeTruthy();
  });

  it('a kind the ledger does not file never reaches the screen, and the legal kinds are named', () => {
    // The registry validates the enum before the bus is involved, so a bogus
    // kind is refused with the legal set and the screen is never touched.
    // The handler keeps its own guard for a caller that bypasses the registry.
    const res = resolveSurfaceAction('audit-trail.filter-entries', { kind: 'holodeck' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/must be one of/);
    expect(res.error, 'the refusal must name what the ledger does file').toMatch(/esign.*authoring.*vault/);
  });

  it('runs the search box over the ledger, and the box carries the term', async () => {
    render(<AuditTrail {...props('audit-trail')} />);
    await screen.findByText('AUD-1');

    const outcome = send('audit-trail.search', { query: 'drafted' });
    await applied(outcome);
    const box = screen.getByLabelText('Search audit trail entries') as HTMLInputElement;
    expect(box.value).toBe('drafted');
    await waitFor(() => expect(screen.queryByText('AUD-1')).toBeNull());
    expect(screen.getByText('AUD-2')).toBeTruthy();
  });

  it('opens one entry by id, and closes it again', async () => {
    render(<AuditTrail {...props('audit-trail')} />);
    await screen.findByText('AUD-3');

    const open = send('audit-trail.select-entry', { entry: 'AUD-3' });
    await applied(open);
    expect(detailOf(open)).toMatch(/Opened AUD-3/);

    const close = send('audit-trail.close-entry', {});
    await applied(close);
    expect(detailOf(close)).toMatch(/Closed AUD-3/);
  });

  it('an entry that is not on screen is refused, listing the ids that are', async () => {
    render(<AuditTrail {...props('audit-trail')} />);
    await screen.findByText('AUD-1');

    const outcome = send('audit-trail.select-entry', { entry: 'AUD-999' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No audit entry matching "AUD-999"/);
    expect(reasonOf(outcome), 'a miss must list what IS on screen so she can retry').toMatch(/On screen: "AUD-1"/);
  });

  it('shows the hash chain', async () => {
    render(<AuditTrail {...props('audit-trail')} />);
    await screen.findByText('AUD-1');

    const outcome = send('audit-trail.set-chain-view', { state: 'shown' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/Showing the hash chain/);
  });

  it('a ledger that could not be read is said so, never shown as an empty trail', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => (String(url).startsWith(LEDGER) ? serverError() : ok(null)));
    const outcome = send('audit-trail.filter-entries', { kind: 'esign' });
    expect(outcome.immediate, 'nothing is mounted yet, so the bus holds it').toEqual({ status: 'stashed' });
    render(<AuditTrail {...props('audit-trail')} />);

    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/could not be read/);
    expect(reasonOf(outcome), 'a failed read must not read as an empty ledger').toMatch(/not the same as the trail being empty/);
  });

  it('an action sent before the ledger lands is held, then applied when it does', async () => {
    let answer!: (r: Response) => void;
    const inFlight = new Promise<Response>((resolve) => (answer = resolve));
    apiRequest.mockImplementation(async (_m: string, url: string) => (String(url).startsWith(LEDGER) ? inFlight : ok(null)));

    const outcome = send('audit-trail.filter-entries', { kind: 'vault' });
    expect(outcome.immediate, 'nothing is mounted yet, so the bus holds it').toEqual({ status: 'stashed' });
    render(<AuditTrail {...props('audit-trail')} />);
    await waitFor(() => expect(apiRequest.mock.calls.some(([, u]) => String(u).startsWith(LEDGER))).toBe(true));
    expect(outcome.deferred, 'answered before the ledger landed').not.toHaveBeenCalled();

    answer(ok(ENTRIES));
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/Vault — 1 of 3 entries/);
  });
});

describe('the apps catalog', () => {
  it('shows and hides the admin controls, the one thing a person switches here', async () => {
    render(<Apps {...props('apps')} />);

    const on = send('apps.show-admin-controls', { state: 'on' });
    await applied(on);
    expect(detailOf(on)).toMatch(/Showing the admin controls/);
    await screen.findByText(/Admin controls on/);

    const again = send('apps.show-admin-controls', { state: 'on' });
    await applied(again);
    expect(detailOf(again), 'a no-op says so rather than claiming a change').toMatch(/already on/);
  });

  it('a state the control does not have is refused with the legal pair', () => {
    const res = resolveSurfaceAction('apps.show-admin-controls', { state: 'sideways' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/must be one of: on, off/);
  });
});
