/**
 * `resolveMasterAdmin` — the owner grant, including designations made in the app.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 *
 * `isMasterAdminIdentity` reads one synchronous signal: an email allowlist (on
 * the owner's own sign-in). It used to read the role on the request too; that
 * is the TENANT membership role, so it is no longer read (D6, 2026-10-05,
 * docs/evidence/D6/2026-10-05-platform-standing/). The allowlist cannot see a
 * `platform_role_grants` row — the audited, in-app way the owner designates
 * personnel through the Access Management console, which exists precisely so
 * nobody has to edit an env allowlist.
 *
 * `requirePlatformAdmin` DOES honour those rows, and does not write the
 * resolved role back onto the request. So the two questions disagreed: somebody
 * designated `super_admin` in the console could open the Master Admin console
 * and still have their nav rail greyed by the entitlement layer. One identity,
 * two answers, from two code paths.
 *
 * Four properties below are load-bearing and none is visible from a passing
 * test against an ordinary user:
 *
 *   1. The role filter stays MASTER_ADMIN_ROLES, not the broader PLATFORM_ROLES.
 *      A `support` designation admits somebody to the console; it must not hand
 *      them a blanket commercial unlock on every tenant they open.
 *   2. A lookup failure resolves to NOT the owner. This is the opposite
 *      direction to the entitlement gate, which fails open — see the module
 *      header on why the two answer different questions.
 *   3. The sync signals short-circuit BEFORE any query, so the owner path costs
 *      no database round trip and the nav rail does not gain one per load.
 *   4. The owner grant is never wider than platform administration (finding
 *      43): whoever `requirePlatformAdmin` refuses is not the owner, whatever
 *      e-mail they carry, and costs no designation lookup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ query: dbQuery }));

import {
  clearMasterAdminGrantCache,
  isMasterAdmin,
  resolveAdminStanding,
  resolveMasterAdmin,
  MASTER_ADMIN_GRANT_TTL_MS,
} from '../master-admin';

const OWNER = 'owner@example.com';

/** A plain object is enough: the resolver reads only fields auth already set. */
const reqOf = (o: Record<string, unknown>) => o as unknown as Request;

/**
 * Two lookups hit platform_role_grants: the platform guard's (any of
 * super_admin / platform_admin / support) and the owner designation's
 * (super_admin only). They are told apart by the role list they pass.
 */
const isOwnerLookup = (params: unknown[]) => {
  const roles = (params?.[1] as string[]) ?? [];
  return roles.length === 1 && roles[0] === 'super_admin';
};
const ownerLookups = () => dbQuery.mock.calls.filter(([, params]) => isOwnerLookup(params));

/**
 * Serve both lookups: `platform` answers the guard's, `owner` the owner
 * designation's. An Error rejects that lookup.
 */
function standing({ platform, owner }: { platform: boolean | Error; owner: boolean | Error }) {
  dbQuery.mockImplementation(async (_sql: string, params: unknown[]) => {
    const answer = isOwnerLookup(params) ? owner : platform;
    if (answer instanceof Error) throw answer;
    return { rows: answer ? [{ '?column?': 1 }] : [] };
  });
}
/** No designation of any kind. */
const noGrant = () => standing({ platform: false, owner: false });
/** An active super_admin designation — which the platform guard also honours. */
const granted = () => standing({ platform: true, owner: true });

beforeEach(() => {
  dbQuery.mockReset();
  clearMasterAdminGrantCache();
  delete process.env.MASTER_ADMIN_EMAILS;
  delete process.env.PLATFORM_ADMIN_EMAILS;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.MASTER_ADMIN_EMAILS;
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe('resolveMasterAdmin — in-app designations', () => {
  it('honors a designation the sync check cannot see', async () => {
    granted();
    const req = reqOf({ userId: 77, userEmail: 'ops@customer.test', userRole: 'admin' });

    // Sync says no, the platform says yes.
    expect(isMasterAdmin(req)).toBe(false);
    expect(await resolveMasterAdmin(req)).toBe(true);
  });

  it('asks only about master-admin roles, never the broader platform set', async () => {
    granted();
    await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }));

    const [[, params]] = ownerLookups();
    // A support/platform_admin designation admits somebody to the console
    // WITHOUT the commercial unlock. Widening this list erases that boundary.
    expect(params[1]).toEqual(['super_admin']);
  });

  it('a support designation opens the console and is not the owner', async () => {
    standing({ platform: true, owner: false });
    expect(await resolveAdminStanding(reqOf({ userId: 77, userRole: 'member' }))).toEqual({
      platformAdmin: true,
      masterAdmin: false,
    });
  });

  it('does not query at all when the sync signals already say owner', async () => {
    granted();
    process.env.PLATFORM_ADMIN_EMAILS = OWNER;
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    expect(await resolveMasterAdmin(reqOf({ userId: 1, userEmail: OWNER }))).toBe(true);
    // The owner path must not gain a database round trip.
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('a request role of super_admin is no sync owner signal: without a grant row it is not the owner', async () => {
    // Inverted 2026-10-05 (D6): the request role is the tenant membership role; standing is a platform grant — docs/evidence/D6/2026-10-05-platform-standing/
    // (It was the second case above, expecting `userRole: 'super_admin'` alone to be the owner with no query.)
    noGrant();
    expect(await resolveMasterAdmin(reqOf({ userId: 2, userRole: 'super_admin' }))).toBe(false);
    // Not a short-circuit: the decision went to the grant table and found none.
    expect(dbQuery).toHaveBeenCalled();
  });

  it('is not the owner when there is no designation', async () => {
    noGrant();
    expect(await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }))).toBe(false);
  });

  it('fails CLOSED when the owner lookup throws — a database error is not a grant', async () => {
    standing({ platform: true, owner: new Error('connection refused') });
    expect(await resolveAdminStanding(reqOf({ userId: 77, userRole: 'admin' }))).toEqual({
      platformAdmin: true,
      masterAdmin: false,
    });
  });

  it('fails CLOSED when the platform lookup throws, and never asks the owner lookup', async () => {
    standing({ platform: new Error('connection refused'), owner: true });
    expect(await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }))).toBe(false);
    expect(ownerLookups()).toHaveLength(0);
  });

  it('does not cache a failure — one blip must not grey the owner for the whole window', async () => {
    standing({ platform: true, owner: new Error('connection refused') });
    const req = reqOf({ userId: 77, userRole: 'admin' });
    expect(await resolveMasterAdmin(req)).toBe(false);

    granted();
    // Same tick, so a cached negative would still be live. It must re-ask.
    expect(await resolveMasterAdmin(req)).toBe(true);
  });

  it('an unauthenticated request is never the owner, and is never looked up', async () => {
    granted();
    expect(await resolveMasterAdmin(reqOf({}))).toBe(false);
    expect(await resolveMasterAdmin(reqOf({ userId: 'not-a-number' }))).toBe(false);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('reuses an owner-designation result within the window, and re-asks after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
    granted();
    const req = reqOf({ userId: 77, userRole: 'admin' });

    expect(await resolveMasterAdmin(req)).toBe(true);
    expect(await resolveMasterAdmin(req)).toBe(true);
    expect(ownerLookups()).toHaveLength(1);

    // super_admin revoked, a support standing kept, still inside the window —
    // the stated staleness (module note on MASTER_ADMIN_GRANT_TTL_MS).
    standing({ platform: true, owner: false });
    vi.setSystemTime(new Date(Date.now() + MASTER_ADMIN_GRANT_TTL_MS - 1));
    expect(await resolveMasterAdmin(req)).toBe(true);
    expect(ownerLookups()).toHaveLength(1);

    // Past it, the revocation lands.
    vi.setSystemTime(new Date(Date.now() + 2));
    expect(await resolveMasterAdmin(req)).toBe(false);
    expect(ownerLookups()).toHaveLength(2);
  });

  it('loses the grant at once when the last platform standing is revoked — no window', async () => {
    granted();
    const req = reqOf({ userId: 77, userRole: 'admin' });
    expect(await resolveMasterAdmin(req)).toBe(true);

    // The owner designation is cached; platform administration is not.
    noGrant();
    expect(await resolveMasterAdmin(req)).toBe(false);
  });

  it('caches per user, not globally', async () => {
    granted();
    expect(await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }))).toBe(true);
    standing({ platform: true, owner: false });
    // A second person must get their own answer, not the first person's.
    expect(await resolveMasterAdmin(reqOf({ userId: 78, userRole: 'admin' }))).toBe(false);
  });
});

/* Finding 43 (launch sweep 2026-09-23): the owner grant was decided beside the
   platform guard, keyed on an e-mail — so the nav unlocked every module for an
   account the licensing console refused, and access-requests.ts let the same
   account answer requests for every organization. */
describe('resolveAdminStanding — the owner grant never exceeds platform administration', () => {
  it('an allowlisted address the platform guard refuses is not the owner, and is not looked up', async () => {
    noGrant();
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    const req = reqOf({ userId: 90, userEmail: OWNER, userRole: 'admin' });

    // The signal is there; the verdict is still no.
    expect(isMasterAdmin(req)).toBe(true);
    expect(await resolveAdminStanding(req)).toEqual({ platformAdmin: false, masterAdmin: false });
    expect(ownerLookups()).toHaveLength(0);
  });

  it('a federated session carrying the allowlisted address is not the owner, even as staff', async () => {
    // A support designation admits them to the console; their IdP asserted the
    // owner's address. The address must not upgrade them to the owner.
    standing({ platform: true, owner: false });
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    const req = reqOf({ userId: 91, userEmail: OWNER, userRole: 'member', identity: { provider: 'saml' } });
    expect(await resolveAdminStanding(req)).toEqual({ platformAdmin: true, masterAdmin: false });
  });

  it('never answers masterAdmin without platformAdmin, across every combination of signals', async () => {
    const roles = ['admin', 'member', 'super_admin', 'support'];
    // Every role × the four boolean signals (2^4), as one flat list.
    const cases = roles.flatMap((role) =>
      Array.from({ length: 16 }, (_, bits) => ({
        role,
        platformGrant: Boolean(bits & 1),
        ownerGrant: Boolean(bits & 2),
        allowlisted: Boolean(bits & 4),
        platformListed: Boolean(bits & 8),
      })),
    );
    for (const c of cases) {
      dbQuery.mockReset();
      clearMasterAdminGrantCache();
      standing({ platform: c.platformGrant, owner: c.ownerGrant });
      process.env.MASTER_ADMIN_EMAILS = c.allowlisted ? OWNER : '';
      process.env.PLATFORM_ADMIN_EMAILS = c.platformListed ? OWNER : '';
      const s = await resolveAdminStanding(reqOf({ userId: 92, userEmail: OWNER, userRole: c.role }));
      expect(!s.masterAdmin || s.platformAdmin, JSON.stringify(c)).toBe(true);
    }
    expect(cases).toHaveLength(64);
  });
});
