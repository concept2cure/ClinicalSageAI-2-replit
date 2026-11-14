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

const LEDGER = '/api/audit-trail/ledger?limit=1000';
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
    expect(apiRequest).toHaveBeenCalledWith('GET', CHAIN, undefined, undefined, expect.any(AbortSignal));
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

  /* Demo walk 5.u6 (2026-11-12): the line under the second chain read "A second chain, kept per organisation, that
     some services write to instead of the ledger". To a Part 11 buyer that says records bypass the audit trail. The
     ledger and this chain are both read on this screen; the line says what the chain is and that it is verified on
     its own, and makes no claim about where any service should write. */
  it('describes the second chain as a separate, separately verified chain, not as writes that bypass the ledger', async () => {
    serve({ [CHAIN]: () => ok(EMPTY_PRE_FIX) });
    mount();
    await screen.findByText('Audit-event chain: no entries yet');
    expect(region().textContent).not.toMatch(/instead of the ledger/);
    expect(region().textContent).toMatch(/A separate hash chain, kept per organisation and verified on its own/);
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

/* 2026-11-12, docs/evidence/D5-AUDIT-EVENT-CHAIN/2026-11-12/. The server's walk
   now says what it found in one sentence, tells an altered entry from one that
   does not follow its predecessor, and reports a chain it could not place as
   not verifiable. This screen composed its own detail from two counts, so each
   of those read wrongly here. The bodies below are the route's, as it answers
   (server/routes/part11-compliance.ts). */
const OMITS = 'The before and after values of a change are not part of the hash, so this does not show they are unaltered.';
const SAYS_INTACT = `All 4210 audit entries match the hash recorded when each was written, computed over its sequence, event, entity, user, timestamp, reason and predecessor hash, and each follows the entry before it. ${OMITS}`;
const UNLINKED = {
  ...INTACT, chainStatus: 'unverifiable', integrityValid: null, totalEntries: 12, verifiedEntries: 12, unhashedEntries: 0, unlinkedEntries: 1,
  compliance: { tamperEvident: '1 of 12 audit entries names no entry before it although one was recorded, so that link could not be checked.' },
};
const ALTERED = {
  ...INTACT, chainStatus: 'broken', integrityValid: false, totalEntries: 9, verifiedEntries: 7, brokenLinks: 2, contentBreaks: 1, pointerBreaks: 1,
  brokenLinkDetails: [{ id: 1, sequenceNumber: 4, kind: 'content' }, { id: 77, sequenceNumber: 6, kind: 'pointer' }],
  compliance: { tamperEvident: '1 entry does not match the hash recorded when it was written; 1 entry does not follow the entry before it.' },
};

describe('Audit trail — the audit-event verdict says what the server found', () => {
  it('a chain that could not be placed does not read "0 of 12 entries carry no record hash"', async () => {
    serve({ [CHAIN]: () => ok(UNLINKED) });
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain not verifiable')).toBeTruthy();
    expect(region().textContent).not.toMatch(/carry no record hash/);
    expect(region().textContent).toMatch(/1 of 12 audit entries names no entry before it although one was recorded/);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'not verifiable', unlinkedEntries: 1, unhashedEntries: 0 }));
    expect(seen.current?.summary).not.toMatch(/carry no record hash/);
    expect(seen.current?.summary).toMatch(/NOT VERIFIABLE over 12 entries\. 1 of 12 audit entries names no entry before it/);
  });

  it('without the server\'s sentence it names only a cause the server sent, and guesses none', async () => {
    serve({ [CHAIN]: () => ok({ ...UNLINKED, compliance: undefined }) });
    mount();
    await screen.findByText('Audit-event chain not verifiable');
    expect(region().textContent).toMatch(/1 of 12 entries names no entry before it although one was recorded, so that link could not be checked/);
    cleanup();
    serve({ [CHAIN]: () => ok({ ...UNLINKED, compliance: undefined, unlinkedEntries: undefined, unhashedEntries: undefined }) });
    mount();
    await screen.findByText('Audit-event chain not verifiable');
    expect(region().textContent).toMatch(/The chain could not be verified over 12 entries/);
    expect(region().textContent).not.toMatch(/Some of|carry no record hash/);
  });

  it('intact says what was checked and that the before and after values are not part of it, on screen and to AnA', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, compliance: { tamperEvident: SAYS_INTACT } }) });
    const { seen } = mount();
    await screen.findByText('Audit-event chain intact');
    expect(region().textContent).toContain(SAYS_INTACT);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({ verdict: 'intact', found: SAYS_INTACT }));
    expect(seen.current?.summary).toContain(OMITS);
  });

  it('an altered entry is not called a broken link, and the entries that did not verify are named', async () => {
    serve({ [CHAIN]: () => ok(ALTERED) });
    const { seen } = mount();
    expect(await screen.findByText('Audit-event chain verification failed')).toBeTruthy();
    expect(region().textContent).not.toMatch(/broken links?/);
    expect(region().textContent).toMatch(/1 entry does not match the hash recorded when it was written/);
    const list = region().querySelector('details');
    expect(list?.querySelector('summary')?.textContent).toBe('Entries that did not verify');
    expect([...list!.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'AUD-1 does not match the hash recorded when it was written',
      'AUD-77 does not follow the entry before it',
    ]);
    await waitFor(() => expect(eventFacts(seen)?.auditEventChain).toMatchObject({
      verdict: 'broken', alteredEntries: 1, outOfSequenceEntries: 1, failedEntries: ['AUD-1', 'AUD-77'],
    }));
    expect(seen.current?.summary).not.toMatch(/broken link/);
  });

  it('a named entry that is loaded in the table opens there; one that is not is named without a control', async () => {
    serve({
      [LEDGER]: () => body({ success: true, data: [{ ...ENTRY, id: 'AUD-1' }], meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: 3, legacyRows: 0, sequencedRows: 3 } } }),
      [CHAIN]: () => ok(ALTERED),
    });
    mount();
    await screen.findByText('Audit-event chain verification failed');
    expect(screen.queryByText(/AUD-1 — Entry detail/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open entry AUD-1' }));
    expect(await screen.findByText(/AUD-1 — Entry detail/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open entry AUD-77' })).toBeNull();
    expect(region().textContent).toMatch(/AUD-77/);
  });

  it('says how many are listed when the server listed only the first of them', async () => {
    serve({ [CHAIN]: () => ok({ ...ALTERED, brokenLinks: 34 }) });
    mount();
    await screen.findByText('Audit-event chain verification failed');
    expect(region().textContent).toMatch(/The first 2 of 34 are listed\./);
  });

  it('a status this screen will not call intact does not print the server\'s intact sentence under it', async () => {
    serve({ [CHAIN]: () => ok({ ...INTACT, integrityValid: null, compliance: { tamperEvident: SAYS_INTACT } }) });
    mount();
    await screen.findByText('Audit-event chain not verified');
    expect(region().textContent).not.toMatch(/match the hash recorded/);
  });

  it('names an audit-event entry as the trail\'s table does', async () => {
    const { readFileSync } = await import('node:fs');
    const ledger = readFileSync('server/routes/audit-trail-ledger.routes.ts', 'utf8');
    expect(ledger, 'the table\'s id for an audit-event entry changed; the banner names entries by it').toContain('id: `AUD-${String(row.id)}`');
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
    // A refused read is not an empty trail: no "0 entries" in the heading, and no export this role cannot run
    // (role walk, 2026-11-12: a member and a viewer read "0 entries — hash-chained — append-only").
    expect(document.body.textContent).not.toMatch(/\b0 entries\b/);
    expect(screen.queryByRole('button', { name: /Export signed bundle/ })).toBeNull();
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
