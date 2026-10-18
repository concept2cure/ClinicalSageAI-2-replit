// @vitest-environment jsdom
/**
 * Part11Console — what the console says on a fresh organisation.
 *
 * Launch sweep, empty org (2026-09-23):
 *
 *   111  The tamper-evidence panel read "EMPTY · Integrity valid · 0 Chained
 *        entries". It verified only `audit_events`, which on a fresh org holds
 *        nothing, and printed the route's `integrityValid: true` over zero rows
 *        as a pass — while the org's chained sign-ins sat in `audit_logs`,
 *        unread. The org's governed chain is now read from the ledger's server
 *        verdict (`meta.chain` of GET /api/audit-trail/ledger), and a chain
 *        with no entries says so instead of passing.
 *   116  The SOC 2 header read as a held certification. Superseded
 *        2026-10-17: the SOC 2 and §11.10 tables were constants and are gone.
 *   125  Raw keys on screen: the chain type `linear-hash-chain` and the chip
 *        `empty`.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Part11Console } from '../surfaces/Part11Console';

const LEDGER = '/api/audit-trail/ledger?limit=1';
const CHAIN = '/api/part11/audit-trail/chain-integrity';

function body(json: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
}
const ok = (data: unknown) => body({ success: true, data });
/** apiRequest THROWS for every non-OK status except 401 (client/src/lib/queryClient.ts). */
function thrown(status: number, message = 'Request failed') {
  return Object.assign(new Error(message), { status });
}
const props = () => ({ surface: { id: 'part11-console', label: 'P11' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' });

/** What a fresh org's audit_events chain returned before the server fix. */
const EMPTY_CHAIN_PRE_FIX = { chainStatus: 'empty', totalEntries: 0, integrityValid: true, hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain' };
const EMPTY_CHAIN = { ...EMPTY_CHAIN_PRE_FIX, integrityValid: null, verifiedEntries: 0 };
/** The ledger's server verdict over the org's audit_logs chain (two sign-ins). */
const LEDGER_INTACT = body({
  success: true,
  data: [{ id: 'AUD-1', source: 'audit_logs' }],
  sources: { audit_logs: 1, audit_events: 0 },
  meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: 2, legacyRows: 0, sequencedRows: 2 } },
});

type Route = (url: string) => Response | Promise<Response>;
function serve(over: Partial<Record<string, Route>> = {}) {
  const routes: Record<string, Route> = {
    [LEDGER]: () => LEDGER_INTACT,
    [CHAIN]: () => ok(EMPTY_CHAIN),
    ...over,
  } as Record<string, Route>;
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const r = routes[url];
    if (!r) throw new Error(`unexpected request ${url}`);
    return r(url);
  });
}

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('finding 111 — an empty audit-event chain is not a valid one', () => {
  it('never prints "Integrity valid" over zero entries, even if the route says true', async () => {
    serve({ [CHAIN]: () => ok(EMPTY_CHAIN_PRE_FIX) });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('No audit events yet')).toBeTruthy();
    // The ledger verdict is intact over 2 entries; its line is the only one
    // allowed to say "Integrity valid".
    expect(screen.getAllByText('Integrity valid')).toHaveLength(1);
    expect(screen.queryByText('empty')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('verifies the org’s governed-action chain from the ledger’s server verdict', async () => {
    serve();
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('Audit trail ledger')).toBeTruthy();
    expect(await screen.findByText('intact')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Entries verified')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', LEDGER);
  });

  it('a ledger chain with no entries is "nothing to verify", not intact', async () => {
    serve({
      [LEDGER]: () => body({ success: true, data: [], sources: {}, meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: 0, legacyRows: 0, sequencedRows: 0 } } }),
    });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('No ledger entries yet')).toBeTruthy();
    expect(screen.queryByText('intact')).toBeNull();
    expect(screen.queryByText('Integrity valid')).toBeNull();
  });

  it('the server\'s "not verified" over no chained rows is "nothing to verify", not a failed read (SECURITY-8)', async () => {
    serve({
      [LEDGER]: () => body({ success: true, data: [], sources: {}, meta: { chain: { store: 'audit_logs', ok: null, rowsChecked: 0, legacyRows: 0, sequencedRows: 0, reason: 'No chained rows exist for this organisation, so there is no chain to verify.' } } }),
    });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('No ledger entries yet')).toBeTruthy();
    expect(screen.queryByText('Couldn’t verify the audit trail ledger')).toBeNull();
    expect(screen.queryByText('intact')).toBeNull();
  });

  it('a broken ledger chain says broken and where', async () => {
    serve({
      [LEDGER]: () => body({ success: true, data: [], sources: {}, meta: { chain: { store: 'audit_logs', ok: false, rowsChecked: 5, legacyRows: 0, sequencedRows: 5, brokenAt: { id: 'AUD-9', segment: 'sequenced' } } } }),
    });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('broken')).toBeTruthy();
    expect(screen.getByText('Integrity broken')).toBeTruthy();
    expect(screen.getByText('AUD-9')).toBeTruthy();
  });

  it('a 200 with no chain verdict is a failed verification, not a pass', async () => {
    serve({ [LEDGER]: () => ok([]) });
    render(<Part11Console {...props()} />);
    const alert = await screen.findByText('Couldn’t verify the audit trail ledger');
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    expect(screen.queryByText('intact')).toBeNull();
  });

  it('a 500 on the ledger is a failure', async () => {
    serve({ [LEDGER]: () => { throw thrown(500); } });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('Couldn’t verify the audit trail ledger')).toBeTruthy();
  });

  it('a 403 on the ledger is "no access", not "couldn’t verify"', async () => {
    serve({ [LEDGER]: () => { throw thrown(403, 'Forbidden'); } });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('You don’t have access to the audit trail ledger')).toBeTruthy();
    expect(screen.queryByText('Couldn’t verify the audit trail ledger')).toBeNull();
  });

  it('a 403 on the audit-event chain is "no access", not "couldn’t verify"', async () => {
    serve({ [CHAIN]: () => { throw thrown(403, 'Tenant context required'); } });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('You don’t have access to the audit-event chain')).toBeTruthy();
    expect(screen.queryByText('Couldn’t verify the audit-event chain')).toBeNull();
  });

  it('an unhashed audit-event chain reads "not verifiable", not the raw key', async () => {
    serve({ [CHAIN]: () => ok({ chainStatus: 'unverifiable', integrityValid: null, totalEntries: 3, brokenLinks: 0, hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain' }) });
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('not verifiable')).toBeTruthy();
    expect(screen.getByText('Not verified')).toBeTruthy();
    expect(screen.queryByText('unverifiable')).toBeNull();
  });
});

describe('settings audit 2026-10-17 — no hardcoded assessment tables', () => {
  /* Findings 116 and 125 qualified the SOC 2 header and translated its category
     keys. The table itself was the defect: every §11.10 row was a constant
     not_assessed and every SOC 2 row a constant not_collected. Both routes are
     gone (server/routes/__tests__/part11-static-tables-removed.test.ts) and the
     console shows only the chain verdicts the server computes. */
  it('reads only the two chain verdicts', async () => {
    serve();
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('Audit trail ledger')).toBeTruthy();
    await screen.findByText('No audit events yet');
    const urls = apiRequest.mock.calls.map((c) => c[1]);
    expect(urls.sort()).toEqual([CHAIN, LEDGER].sort());
  });

  it('renders no §11.10 or SOC 2 status table, and says what it shows', async () => {
    serve();
    const { container } = render(<Part11Console {...props()} />);
    await screen.findByText('No audit events yet');
    expect(container.textContent).not.toMatch(/not assessed|not collected|SOC 2 controls|§11\.10 controls/i);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toMatch(/shows only the integrity verdicts/);
  });

  it('prints the chain type in words', async () => {
    serve({ [CHAIN]: () => ok({ chainStatus: 'intact', integrityValid: true, totalEntries: 7, brokenLinks: 0, lastHash: 'abcdef', hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain' }) });
    const { container } = render(<Part11Console {...props()} />);
    expect(await screen.findByText('7')).toBeTruthy();
    expect(container.textContent).not.toMatch(/linear-hash-chain/);
  });
});
