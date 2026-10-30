// @vitest-environment jsdom
/**
 * Audit trail states the second chain's verdict (D2 fold of part11-console,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-part11-console/).
 *
 * The organisation's audit records live in two hash chains. Audit trail
 * already stated the first (`audit_logs`, the ledger's `meta.chain`). The
 * second (`audit_events`, which a few services still write) was verified only
 * on the Part 11 console, from GET /api/part11/audit-trail/chain-integrity.
 * The placement map (.design/client-journey/FUNCTION_PARITY.md, "Into the
 * audit trail") moves both of the console's functions here:
 *
 *   - the live verdict, as a second verdict in the chain banner;
 *   - AnA reading it, as the audit_events verdict in Audit trail's facts.
 *
 * The honesty cases are the console's own (part11Console.test.tsx and
 * part11ConsoleHonesty.test.tsx, deleted with the console in this fold: finding
 * 111, the 403/unverifiable cases, the chain type in words, no assessment
 * tables), restated against this screen:
 * a verdict that could not be read is not "intact", an error is never an
 * empty chain, and the two chains' verdicts are never merged into one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuditTrail } from '../surfaces/AdminSurfaces';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const LEDGER = '/api/audit-trail/ledger';
const CHAIN = '/api/part11/audit-trail/chain-integrity';

const ENTRY = {
  id: 'EVT-1', when: '2026-10-29 09:00', at: '2026-10-29T09:00:00.000Z', actor: 'Rae Okafor', actorRef: 'user:4',
  event: 'Vault document ingested', target: 'vault_document:doc-42', targetRef: null, kind: 'vault', sig: false,
  hash: 'b'.repeat(64), prevHash: 'genesis', ip: null, reason: null, meaning: null, source: 'audit_events', seq: null, signatureRef: null,
};

function body(json: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
}
const ok = (data: unknown) => body({ success: true, data });
/** apiRequest THROWS for every non-OK status except 401 (client/src/lib/queryClient.ts). */
const thrown = (status: number, message = 'Request failed') => Object.assign(new Error(message), { status });

const LEDGER_INTACT = () =>
  body({ success: true, data: [ENTRY], meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: 3, legacyRows: 0, sequencedRows: 3 } } });
const INTACT = { chainStatus: 'intact', integrityValid: true, totalEntries: 4210, verifiedEntries: 4210, unhashedEntries: 0, brokenLinks: 0, lastHash: 'abcdef1234567890abcdef1234567890', hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain', verifiedAt: '2026-10-29T09:00:00.000Z' };
/** What a fresh org's audit_events chain returned before the server fix (finding 111). */
const EMPTY_PRE_FIX = { chainStatus: 'empty', totalEntries: 0, integrityValid: true, hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain' };

type Route = () => Response | Promise<Response>;
function serve(over: Partial<Record<string, Route>> = {}) {
  const routes: Record<string, Route> = { [LEDGER]: LEDGER_INTACT, [CHAIN]: () => ok(INTACT), ...over } as Record<string, Route>;
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const r = routes[String(url)];
    if (!r) throw new Error(`unexpected request ${url}`);
    return r();
  });
}

function Probe({ seen }: { seen: { current: SurfaceContext | null } }) {
  const ctx = useActiveSurfaceContext('audit-trail');
  React.useEffect(() => { seen.current = ctx; });
  return null;
}
const PROPS = () =>
  ({ surface: { id: 'audit-trail', label: 'Audit trail' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' }) as unknown as React.ComponentProps<typeof AuditTrail>;

function mount() {
  const seen = { current: null as SurfaceContext | null };
  const view = render(<><AuditTrail {...PROPS()} /><Probe seen={seen} /></>);
  return { seen, view };
}
const region = () => screen.getByRole('region', { name: 'Audit-event chain verdict' });
const eventFacts = (seen: { current: SurfaceContext | null }) => seen.current?.facts as Record<string, unknown> | undefined;

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('Audit trail — the audit_events chain verdict in the chain banner', () => {
  it('reads the route the Part 11 console read', async () => {
    serve();
    mount();
    await screen.findByText('Audit-event chain intact');
    expect(apiRequest).toHaveBeenCalledWith('GET', CHAIN);
  });

  it('an intact chain says intact, how many entries, and sits beside the ledger verdict', async () => {
    serve();
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain intact')).toBeTruthy();
    expect(region().textContent).toMatch(/4210 chained entries re-computed on the server/);
    expect(region().textContent).toMatch(/abcdef1234567890abcdef12/);
    // The ledger's own banner is still there, and still about the ledger.
    expect(screen.getByText('Hash chain intact')).toBeTruthy();
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'intact', totalEntries: 4210, brokenLinks: 0 }));
    expect(eventFacts(seen)?.auditEventChainUnavailable).toBeNull();
    expect(seen.current?.summary).toMatch(/separate audit-event chain is verified intact over 4210 entr/);
  });

  it('the two chains are never merged: an intact ledger beside a broken audit-event chain says both', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, chainStatus: 'broken', integrityValid: false, brokenLinks: 2, totalEntries: 9 }) });
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain verification failed')).toBeTruthy();
    expect(region().textContent).toMatch(/2 broken links over 9 entries/);
    expect(screen.getByText('Hash chain intact')).toBeTruthy();
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'broken', brokenLinks: 2 }));
    expect((eventFacts(seen)?.hashChain as { verdict: string }).verdict).toBe('intact');
    expect(seen.current?.summary).toMatch(/separate audit-event chain is BROKEN/);
  });

  it('finding 111: an empty chain is "nothing to verify", never intact, even when the route says true', async () => {
    serve({ [CHAIN]: () => ok(EMPTY_PRE_FIX) });
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain: no entries yet')).toBeTruthy();
    expect(region().textContent).toMatch(/nothing to verify/);
    expect(region().textContent).not.toMatch(/intact|Integrity valid/);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'no entries' }));
    expect(seen.current?.summary).toMatch(/holds no entries, so there is nothing to verify/);
    expect(seen.current?.summary).not.toMatch(/audit-event chain is verified intact/);
  });

  it('an unhashed chain reads "not verifiable", not the raw key, and is not intact', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, chainStatus: 'unverifiable', integrityValid: null, totalEntries: 3, unhashedEntries: 3, verifiedEntries: 0 }) });
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain not verifiable')).toBeTruthy();
    expect(region().textContent).toMatch(/3 of 3 entries carry no record hash/);
    expect(region().textContent).not.toMatch(/unverifiable/);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'not verifiable' }));
  });

  it('"intact" needs the server\'s integrity verdict too: a status with no verdict is not intact', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, integrityValid: null }) });
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain not verified')).toBeTruthy();
    expect(region().textContent).not.toMatch(/intact/);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'not verified' }));
    expect(seen.current?.summary).not.toMatch(/audit-event chain is verified intact/);
  });

  it('states the chain in words, and no Part 11, validation or SOC 2 assessment (ported from part11ConsoleHonesty, 2026-10-17 / finding 125)', async () => {
    serve();
    const { view } = mount();
    await screen.findByText('Audit-event chain intact');
    expect(region().textContent).not.toMatch(/linear-hash-chain/);
    expect(view.container.textContent).not.toMatch(/not assessed|not collected|SOC 2 controls|§11\.10 controls/i);
    const urls = apiRequest.mock.calls.map((c) => c[1]);
    expect(urls).not.toContain('/api/part11/compliance-status');
    expect(urls).not.toContain('/api/part11/soc2/controls');
  });

  it('an unrecognised status is "not verified", not intact', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, chainStatus: 'pending' }) });
    mount();
    expect(await screen.findByText('Audit-event chain not verified')).toBeTruthy();
    expect(region().textContent).not.toMatch(/intact|pending/);
  });
});

describe('Audit trail — a verdict that could not be read is not intact', () => {
  it('a 500 is a failed verification, with a way to try again — never an empty chain', async () => {
    let fail = true;
    serve({ [CHAIN]: () => { if (fail) throw thrown(500); return ok(INTACT); } });
    const { seen } = mount();
    const alert = await screen.findByText('Couldn’t verify the audit-event chain');
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    // It says "not intact" in so many words; it never says the chain is intact, or empty.
    expect(region().textContent).toMatch(/not verified, and not intact/);
    expect(region().textContent).not.toMatch(/chain intact|no entries/);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChainUnavailable).toMatch(/unknown, not intact/));
    expect(eventFacts(seen)?.auditEventChain).toBeNull();
    expect(seen.current?.summary).toMatch(/audit-event chain verification could not be read, so its integrity is UNKNOWN/);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Audit-event chain intact')).toBeTruthy();
  });

  it('a 200 that is not a verdict (a list body) is a failed verification, not an empty chain', async () => {
    serve({ [CHAIN]: () => ok([]) });
    mount();
    expect(await screen.findByText('Couldn’t verify the audit-event chain')).toBeTruthy();
    expect(screen.queryByText('Audit-event chain: no entries yet')).toBeNull();
  });

  it('a 200 with no payload is a failed verification, not an empty chain', async () => {
    serve({ [CHAIN]: () => ok(null) });
    mount();
    expect(await screen.findByText('Couldn’t verify the audit-event chain')).toBeTruthy();
    expect(screen.queryByText('Audit-event chain: no entries yet')).toBeNull();
  });

  it('a count that is not a number is a failed verification', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, totalEntries: '4210' }) });
    mount();
    expect(await screen.findByText('Couldn’t verify the audit-event chain')).toBeTruthy();
  });

  it('a 403 is "not available to your role", not "couldn’t verify"', async () => {
    serve({ [CHAIN]: () => { throw thrown(403, 'Tenant context required'); } });
    const { seen } = mount();
    expect(await screen.findByText('The audit-event chain is not available to your role')).toBeTruthy();
    expect(screen.queryByText('Couldn’t verify the audit-event chain')).toBeNull();
    await waitFor(() => expect(eventFacts(seen)?.auditEventChainUnavailable).toMatch(/cannot read the audit-event chain/));
    expect(eventFacts(seen)?.auditEventChain).toBeNull();
  });

  it('while the verification is in flight, nothing is called intact — on screen or to AnA', async () => {
    serve({ [CHAIN]: () => new Promise<Response>(() => undefined) });
    const { seen } = mount();
    expect(await screen.findByText('Verifying the audit-event chain…')).toBeTruthy();
    await waitFor(() => expect(seen.current?.summary).toMatch(/audit-event chain is still being verified/));
    expect(eventFacts(seen)?.auditEventChain).toBeNull();
    expect(region().textContent).not.toMatch(/intact/);
  });
});

describe('Audit trail — the audit-event verdict does not depend on the ledger read', () => {
  it('a failed ledger read still states the audit-event verdict, on screen and to AnA', async () => {
    serve({ [LEDGER]: () => { throw thrown(500); } });
    const { seen } = mount();
    expect(await screen.findByText('Couldn\'t load the audit trail')).toBeTruthy();
    expect(await screen.findByText('Audit-event chain intact')).toBeTruthy();
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'intact' }));
    expect(seen.current?.summary).toMatch(/could not be read/);
  });

  it('an empty ledger still states the audit-event verdict', async () => {
    serve({ [LEDGER]: () => body({ success: true, data: [], meta: { chain: { store: 'audit_logs', ok: null, rowsChecked: 0, legacyRows: 0, sequencedRows: 0 } } }) });
    mount();
    expect(await screen.findByText('No audit entries yet')).toBeTruthy();
    expect(await screen.findByText('Audit-event chain intact')).toBeTruthy();
  });

  it('a role the audit-reader gate refuses is refused both verdicts, and neither is called intact (P-65)', async () => {
    // Since P-65 (2026-10-29) the chain verdict takes the ledger's gate, requireAuditReader,
    // so the server refuses a non-reader both reads with the same body.
    const refused = () => { throw thrown(403, 'The audit trail is read by organisation administrators and managers.'); };
    serve({ [LEDGER]: refused, [CHAIN]: refused });
    const { seen } = mount();
    expect(await screen.findByText('The audit trail is not available to your role')).toBeTruthy();
    expect(await screen.findByText('The audit-event chain is not available to your role')).toBeTruthy();
    expect(screen.queryByText('Couldn’t verify the audit-event chain')).toBeNull();
    expect(region().textContent).not.toMatch(/intact/);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChainUnavailable).toMatch(/cannot read the audit-event chain/));
    expect(eventFacts(seen)?.auditEventChain).toBeNull();
  });

  it('a ledger still loading publishes the audit-event verdict to AnA, not a blank', async () => {
    serve({ [LEDGER]: () => new Promise<Response>(() => undefined) });
    const { seen } = mount();
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'intact' }));
    expect(seen.current?.summary).toMatch(/still loading/);
  });
});
