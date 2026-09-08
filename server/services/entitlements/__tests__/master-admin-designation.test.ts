/**
 * `resolveMasterAdmin` — the owner grant, including designations made in the app.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 *
 * `isMasterAdminIdentity` reads two synchronous signals: the role on the request
 * and an email allowlist. Neither can see a `platform_role_grants` row — the
 * audited, in-app way the owner designates personnel through the Access
 * Management console, which exists precisely so nobody has to edit an env
 * allowlist.
 *
 * `requirePlatformAdmin` DOES honour those rows, and does not write the
 * resolved role back onto the request. So the two questions disagreed: somebody
 * designated `super_admin` in the console could open the Master Admin console
 * and still have their nav rail greyed by the entitlement layer. One identity,
 * two answers, from two code paths.
 *
 * Three properties below are load-bearing and none is visible from a passing
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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ query: dbQuery }));

import {
  clearMasterAdminGrantCache,
  isMasterAdmin,
  resolveMasterAdmin,
  MASTER_ADMIN_GRANT_TTL_MS,
} from '../master-admin';

const DEFAULT_OWNER = 'jonmichaelpsmith@gmail.com';

/** A plain object is enough: the resolver reads only fields auth already set. */
const reqOf = (o: Record<string, unknown>) => o as unknown as Request;

/** No designation row. */
const noGrant = () => dbQuery.mockResolvedValue({ rows: [] });
/** An active designation row. */
const granted = () => dbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });

beforeEach(() => {
  dbQuery.mockReset();
  clearMasterAdminGrantCache();
  delete process.env.MASTER_ADMIN_EMAILS;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.MASTER_ADMIN_EMAILS;
});

describe('resolveMasterAdmin — in-app designations', () => {
  it('honors a designation the sync check cannot see', async () => {
    granted();
    const req = reqOf({ userId: 77, userEmail: 'ops@customer.test', userRole: 'admin' });

    // This is the whole defect: sync says no, the platform says yes.
    expect(isMasterAdmin(req)).toBe(false);
    expect(await resolveMasterAdmin(req)).toBe(true);
  });

  it('asks only about master-admin roles, never the broader platform set', async () => {
    granted();
    await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }));

    const [, params] = dbQuery.mock.calls[0];
    // A support/platform_admin designation admits somebody to the console
    // WITHOUT the commercial unlock. Widening this list erases that boundary.
    expect(params[1]).toEqual(['super_admin']);
    expect(params[1]).not.toContain('support');
    expect(params[1]).not.toContain('platform_admin');
  });

  it('does not query at all when the sync signals already say owner', async () => {
    granted();
    expect(await resolveMasterAdmin(reqOf({ userId: 1, userEmail: DEFAULT_OWNER }))).toBe(true);
    expect(await resolveMasterAdmin(reqOf({ userId: 2, userRole: 'super_admin' }))).toBe(true);
    // The owner path must not gain a database round trip.
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('is not the owner when there is no designation', async () => {
    noGrant();
    expect(await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }))).toBe(false);
  });

  it('fails CLOSED when the lookup throws — a database error is not a grant', async () => {
    dbQuery.mockRejectedValue(new Error('connection refused'));
    expect(await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }))).toBe(false);
  });

  it('does not cache a failure — one blip must not grey the owner for the whole window', async () => {
    dbQuery.mockRejectedValueOnce(new Error('connection refused'));
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

  it('reuses a result within the window, and re-asks after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
    granted();
    const req = reqOf({ userId: 77, userRole: 'admin' });

    expect(await resolveMasterAdmin(req)).toBe(true);
    expect(await resolveMasterAdmin(req)).toBe(true);
    expect(dbQuery).toHaveBeenCalledTimes(1);

    // Revoked, but still inside the window — the stated staleness.
    noGrant();
    vi.setSystemTime(new Date(Date.now() + MASTER_ADMIN_GRANT_TTL_MS - 1));
    expect(await resolveMasterAdmin(req)).toBe(true);
    expect(dbQuery).toHaveBeenCalledTimes(1);

    // Past it, the revocation lands.
    vi.setSystemTime(new Date(Date.now() + 2));
    expect(await resolveMasterAdmin(req)).toBe(false);
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });

  it('caches per user, not globally', async () => {
    granted();
    expect(await resolveMasterAdmin(reqOf({ userId: 77, userRole: 'admin' }))).toBe(true);
    noGrant();
    // A second person must get their own answer, not the first person's.
    expect(await resolveMasterAdmin(reqOf({ userId: 78, userRole: 'admin' }))).toBe(false);
  });
});
