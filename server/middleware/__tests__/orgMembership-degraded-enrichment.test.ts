/**
 * A degraded membership answer must not be cached.
 *
 * `enforceOrgMembership` resolves TWO things in one query: whether the user is
 * still a member (governed solely by the organization_users row) and, by LEFT
 * JOIN, that organisation's uuid. The uuid is enrichment only — it is what
 * `establishRequestTenantScope` puts in `app.current_org_id`, and it matters
 * because 6 of the 8 token mint paths do not stamp organizationUuid into the
 * JWT (server/auth.ts:321 — the primary login — plus users.ts x2 and
 * authEnterprise.ts x3; only mfaService.ts and setup.ts do). This LEFT JOIN is
 * therefore the only thing that puts a real uuid on the request for an
 * ordinarily-logged-in user.
 *
 * When the JOIN throws, the membership-only fallback answers. That is right:
 * a determinable membership must not surface as `indeterminate`. But the result
 * then carries `orgUuid: null`, which `tenantSessionVars` turns into an EMPTY
 * `app.current_org_id` for the whole request — and the module's own contract
 * says such a result must not reach the 60s cache, because a cached null would
 * serve numeric-only scoping for the whole TTL and turn a transient JOIN error
 * into minutes of quietly empty tenant reads.
 *
 * That guard is one `if` (`if (!enrichmentDegraded) cacheMembership(...)`) and
 * nothing pinned it. Ledger L148 is what happens without it: the flagship
 * authoring journey ran EVERY request degraded — its `organizations` stub
 * predated the uuid column, so the JOIN threw 42703 on every call — and proved
 * its tenant-isolation steps with the org session variable empty. Nothing
 * failed, because membership itself was decided correctly, and nothing could
 * notice.
 *
 * Pinned here: membership still stands, the uuid is absent, the degradation is
 * counted, the answer is NOT cached, and the next request self-heals.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const { selectImpl } = vi.hoisted(() => ({ selectImpl: { fn: null as null | (() => unknown) } }));

vi.mock('../../db', () => ({
  db: { select: (...args: unknown[]) => (selectImpl.fn as (...a: unknown[]) => unknown)(...args) },
}));

import {
  enforceOrgMembership,
  peekOrgMembership,
  invalidateOrgMembershipCache,
  degradedEnrichmentCount,
  resetDegradedEnrichments,
} from '../orgMembership';

const USER = 4242;
const ORG = 9090;
const ORG_UUID = '3f1c0e2a-1111-4222-8333-444455556666';

/** A drizzle chain whose terminal `.limit()` resolves to `rows`. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'leftJoin']) c[m] = () => c;
  c.limit = () => Promise.resolve(rows);
  return c;
}
/** A chain that throws only when a leftJoin is in play — the enriched query. */
function chainFailingOnJoin(error: unknown, fallbackRows: unknown[]) {
  const make = (joined: boolean): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.leftJoin = () => make(true);
    c.limit = () => (joined ? Promise.reject(error) : Promise.resolve(fallbackRows));
    return c;
  };
  return make(false);
}

/* `userId`, not `id`: enforceOrgMembership reads req.user.userId and takes an
   early next() when it is absent — which silently skips the query and would
   make every assertion below pass without exercising anything. */
function req() {
  return { user: { userId: USER, organizationId: ORG } } as never;
}
function res() {
  const r: Record<string, unknown> = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r as never;
}

/**
 * Run the middleware and resolve once next() or a response actually happened.
 *
 * `queryOrgMembership` reaches the db through dynamic
 * `import('../../shared/schema')` + `import('drizzle-orm')`. Cold, those take
 * longer than a short timeout, and a run that times out looks exactly like a run
 * that was admitted-and-did-nothing — every assertion here would pass without
 * the query ever being issued. So: the imports are warmed in beforeAll, and this
 * REJECTS on timeout instead of resolving, so a harness that stops exercising
 * the code fails loudly rather than going green.
 */
function run(request: never, response: never): Promise<{ nexted: boolean }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (nexted: boolean) => {
      if (!settled) { settled = true; resolve({ nexted }); }
    };
    const r = response as unknown as { json: ReturnType<typeof vi.fn> };
    r.json.mockImplementation(() => { done(false); return response; });
    enforceOrgMembership(request, response, () => done(true));
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('enforceOrgMembership neither called next() nor answered — the query never ran'));
      }
    }, 5_000);
  });
}

beforeAll(async () => {
  // Warm the dynamic imports the middleware performs, so the per-test runs are
  // not racing a cold module graph.
  await Promise.all([import('../../../shared/schema'), import('drizzle-orm')]);
}, 30_000);

beforeEach(() => {
  invalidateOrgMembershipCache(USER, ORG);
  resetDegradedEnrichments();
  selectImpl.fn = null;
});
afterEach(() => vi.clearAllMocks());

describe('enforceOrgMembership — the orgUuid enrichment degraded', () => {
  const joinError = Object.assign(new Error('column organizations.uuid does not exist'), {
    code: '42703',
  });

  it('still admits the request — membership is decided by organization_users alone', async () => {
    selectImpl.fn = () => chainFailingOnJoin(joinError, [{ role: 'member' }]);
    const r = req();
    const { nexted } = await run(r, res());
    expect(nexted, 'a determinable membership must not surface as indeterminate').toBe(true);
  });

  it('leaves organizationUuid absent, so app.current_org_id will be empty', async () => {
    selectImpl.fn = () => chainFailingOnJoin(joinError, [{ role: 'member' }]);
    const r = req() as unknown as { user: { organizationUuid?: string | null } };
    await run(r as never, res());
    expect(r.user.organizationUuid ?? null).toBeNull();
  });

  it('counts the degradation, so a degraded run is visible outside a log line', async () => {
    selectImpl.fn = () => chainFailingOnJoin(joinError, [{ role: 'member' }]);
    await run(req(), res());
    expect(degradedEnrichmentCount()).toBeGreaterThan(0);
  });

  it('does NOT cache the degraded answer — the whole point of the guard', async () => {
    selectImpl.fn = () => chainFailingOnJoin(joinError, [{ role: 'member' }]);
    await run(req(), res());
    expect(
      peekOrgMembership(USER, ORG),
      'a cached null orgUuid would serve numeric-only scoping for the full 60s TTL',
    ).toBeNull();
  });

  it('self-heals: once the JOIN works, the uuid lands and IS cached', async () => {
    selectImpl.fn = () => chainFailingOnJoin(joinError, [{ role: 'member' }]);
    await run(req(), res());
    expect(peekOrgMembership(USER, ORG)).toBeNull();

    selectImpl.fn = () => chain([{ role: 'member', orgUuid: ORG_UUID }]);
    const healed = req() as unknown as { user: { organizationUuid?: string | null } };
    await run(healed as never, res());
    expect(healed.user.organizationUuid).toBe(ORG_UUID);
    expect(peekOrgMembership(USER, ORG), 'a complete answer is cacheable').toBe(true);
  });

  it('caches a healthy answer, so the degraded case is the exception not the rule', async () => {
    selectImpl.fn = () => chain([{ role: 'member', orgUuid: ORG_UUID }]);
    await run(req(), res());
    expect(peekOrgMembership(USER, ORG)).toBe(true);
    expect(degradedEnrichmentCount()).toBe(0);
  });
});
