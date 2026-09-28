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
 *   116  The SOC 2 header printed the route's `certificationTarget` bare —
 *        "4/10 Part 11-mapped · SOC 2 Type II" — beside rows that all say
 *        "not collected". It reads as a held certification; there is none.
 *   125  Raw keys on screen: TSC category `processing_integrity`, the chain
 *        type `linear-hash-chain`, and the chip `empty`.
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

const SOC2 = {
  controls: [
    { controlId: 'CC6.1', category: 'security', title: 'Logical and Physical Access — Authentication', part11Mapping: '§11.100', evidenceStatus: 'not_collected', evidenceCount: 0 },
    { controlId: 'PI1.1', category: 'processing_integrity', title: 'Processing Integrity — Data Accuracy', evidenceStatus: 'not_collected', evidenceCount: 0 },
  ],
  summary: {
    totalControls: 10, part11MappedControls: 4, readinessScore: null, certificationTarget: 'SOC 2 Type II',
    note: 'Control framework reference. The platform does not track or attest SOC 2 evidence.',
  },
};
const STATUS = { part11: { overallStatus: 'not_assessed', sections: {} }, soc2: { certificationTarget: 'SOC 2 Type II', readinessScore: null }, gamp5: {} };

type Route = (url: string) => Response | Promise<Response>;
function serve(over: Partial<Record<string, Route>> = {}) {
  const routes: Record<string, Route> = {
    [LEDGER]: () => LEDGER_INTACT,
    [CHAIN]: () => ok(EMPTY_CHAIN),
    '/api/part11/compliance-status': () => ok(STATUS),
    '/api/part11/soc2/controls': () => ok(SOC2),
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

describe('finding 116 — the SOC 2 header never reads as a held certification', () => {
  it('qualifies the framework name as a reference, not an attestation', async () => {
    serve();
    render(<Part11Console {...props()} />);
    const header = await screen.findByText(/mapped to Part 11/);
    expect(header.textContent).toBe('4 of 10 mapped to Part 11 · reference framework for SOC 2 Type II, not an attestation');
  });

  it('shows the route’s own statement of what the grid is', async () => {
    serve();
    render(<Part11Console {...props()} />);
    expect(await screen.findByText(SOC2.summary.note)).toBeTruthy();
  });
});

describe('finding 125 — no raw keys in the console copy', () => {
  it('prints SOC 2 categories and the chain type in words', async () => {
    serve({ [CHAIN]: () => ok({ chainStatus: 'intact', integrityValid: true, totalEntries: 7, brokenLinks: 0, lastHash: 'abcdef', hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain' }) });
    const { container } = render(<Part11Console {...props()} />);
    const table = (await screen.findByText('PI1.1')).closest('table')!;
    expect(within(table).getByText('Processing integrity')).toBeTruthy();
    expect(within(table).getByText('Security')).toBeTruthy();
    expect(container.textContent).not.toMatch(/processing_integrity|linear-hash-chain/);
  });
});
