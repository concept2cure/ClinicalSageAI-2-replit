/**
 * Time-limited module grants — what a lapsed trial does, and what it must not.
 *
 * ── The two ways this feature gets built wrong ───────────────────────────────
 *
 * 1. AN EXPIRED GRANT BECOMES A DENIAL. `expires_at` bounds the OVERRIDE a
 *    `module_subscriptions` row applies, not the entitlement underneath it.
 *    Resolution order is master admin → subscription row → tier + industry.
 *    When the override lapses, resolution must CONTINUE to tier + industry
 *    exactly as if the row had never been written. An organization on the
 *    `standard` plan whose trial of a `standard` module lapses still holds that
 *    module, through its plan. Turning the lapse into a hard "not licensed"
 *    repossesses capability the customer is paying for — the most expensive way
 *    to get this wrong, and the one that looks correct in a naive test.
 *
 * 2. THE REASON IS NOT THE REAL ONE. When tier or industry then does refuse,
 *    "requires professional tier" is true but it is not what happened. What
 *    happened is that a trial ended on a date, and a customer told the generic
 *    sentence calls sales asking why a working module vanished.
 *
 * Everything here is pure or stubbed at the pool: no live database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({
  pool: { query: poolQuery },
  query: poolQuery,
  default: { query: poolQuery },
}));

import {
  canAccessModule,
  getLicenseInfo,
  getModuleCatalog,
  isGrantExpired,
  toDateOrNull,
  toIsoOrNull,
} from '../../license-manager';

const PAST = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
const NOW = new Date('2026-08-24T12:00:00.000Z');

const ORG = {
  id: 1,
  tier: 'standard',
  industry_mode: 'biotech',
  max_users: 5,
  max_projects: 10,
  max_storage: 5,
};

/** metadata.tiers is the LADDER FLOOR list the catalog stores per module. */
const meta = (tiers: string[], industries: string[] = []) => ({ tiers, industries });

beforeEach(() => {
  poolQuery.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('isGrantExpired — the one comparison', () => {
  it('a grant with no expiry is perpetual, which is every pre-existing grant', () => {
    expect(isGrantExpired(null, NOW)).toBe(false);
    expect(isGrantExpired(undefined, NOW)).toBe(false);
  });

  it('past is expired, future is not', () => {
    expect(isGrantExpired(PAST, NOW)).toBe(true);
    expect(isGrantExpired(FUTURE, NOW)).toBe(false);
  });

  it('accepts a Date as well as a string — the driver returns either', () => {
    expect(isGrantExpired(new Date(PAST), NOW)).toBe(true);
    expect(isGrantExpired(new Date(FUTURE), NOW)).toBe(false);
  });

  it('an UNREADABLE instant is not an expiry — corruption must not repossess', () => {
    // Dropping the override because a value would not parse is repossession by
    // data corruption. The grant stands and the row is visibly wrong instead.
    expect(isGrantExpired('not-a-date', NOW)).toBe(false);
    expect(toIsoOrNull('not-a-date')).toBeNull();
    expect(toDateOrNull('not-a-date')).toBeNull();
  });

  it('renders a calendar date for the customer, not an instant', () => {
    expect(toDateOrNull(PAST)).toBe('2026-01-01');
  });
});

describe('getLicenseInfo — an expired grant is not an enabled module', () => {
  it('drops the lapsed one and keeps the live one', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [ORG] })
      .mockResolvedValueOnce({
        rows: [
          { module_id: 'perpetual', expires_at: null },
          { module_id: 'live-trial', expires_at: FUTURE },
          { module_id: 'lapsed-trial', expires_at: PAST },
        ],
      });

    const info = await getLicenseInfo(1);
    expect(info?.enabledModules).toEqual(['perpetual', 'live-trial']);
  });
});

describe('canAccessModule — a lapse removes the override, never the entitlement', () => {
  /** org row + grants for getLicenseInfo, then the module lookup. */
  function wire(grants: unknown[], moduleRow: unknown) {
    poolQuery
      .mockResolvedValueOnce({ rows: [ORG] })
      .mockResolvedValueOnce({ rows: grants })
      .mockResolvedValueOnce({ rows: moduleRow == null ? [] : [moduleRow] });
  }

  it('THE CASE THIS FEATURE IS ABOUT: a lapsed trial of a module the plan includes stays allowed', async () => {
    // standard org, standard module, trial ended. The plan covers it.
    wire(
      [{ module_id: 'covered', expires_at: PAST }],
      { metadata: meta(['standard']), enabled: true, expires_at: PAST },
    );

    const verdict = await canAccessModule(1, 'covered');
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('a lapsed trial ABOVE the plan is refused, and the reason names the trial and its date', async () => {
    wire(
      [{ module_id: 'premium', expires_at: PAST }],
      { metadata: meta(['professional']), enabled: true, expires_at: PAST },
    );

    const verdict = await canAccessModule(1, 'premium');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/ended on 2026-01-01/);
    // A calendar date, not the stored instant.
    expect(verdict.reason).not.toMatch(/T00:00:00/);
    // Still says what would restore it.
    expect(verdict.reason).toMatch(/professional/);
  });

  it('a LIVE trial above the plan is still allowed — the override has not lapsed', async () => {
    wire(
      [{ module_id: 'premium', expires_at: FUTURE }],
      { metadata: meta(['professional']), enabled: true, expires_at: FUTURE },
    );
    expect((await canAccessModule(1, 'premium')).allowed).toBe(true);
  });

  it('never claims a trial ended when there was no trial', async () => {
    wire([], { metadata: meta(['professional']), enabled: null, expires_at: null });
    const verdict = await canAccessModule(1, 'premium');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).not.toMatch(/ended on/);
  });

  it('a DISABLED row does not lapse — a revocation is not a trial', async () => {
    // Somebody switched this off. An end date on a revocation would silently
    // re-grant a module an admin turned off.
    wire([], { metadata: meta(['standard']), enabled: false, expires_at: PAST });
    const verdict = await canAccessModule(1, 'off-by-admin');
    expect(verdict.reason ?? '').not.toMatch(/ended on/);
  });
});

describe('getModuleCatalog — what the console and the rail read', () => {
  function wireCatalog(row: Record<string, unknown>) {
    poolQuery
      .mockResolvedValueOnce({ rows: [ORG] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });
  }

  const base = {
    module_id: 'm',
    name: 'M',
    description: null,
    category: null,
    icon: null,
    path: null,
    sort_order: 0,
  };

  it('an expired grant collapses to no-override, NOT to disabled', async () => {
    wireCatalog({
      ...base,
      metadata: meta(['standard']),
      is_subscribed: true,
      grant_expires_at: PAST,
    });

    const [entry] = await getModuleCatalog(1);
    // 'disabled' would deny outright and tell the customer an admin switched it
    // off — a repossession and a lie. 'none' routes to tier + industry.
    expect(entry.subscriptionState).toBe('none');
    expect(entry.isEnabled).toBe(false);
    expect(entry.grantExpired).toBe(true);
    // The date survives the lapse: it is exactly what a customer is owed.
    expect(entry.grantExpiresAt).toBe(PAST);
    // And the plan still covers it.
    expect(entry.isAvailable).toBe(true);
  });

  it('a live trial reads as an enabled grant carrying its end date', async () => {
    wireCatalog({
      ...base,
      metadata: meta(['professional']),
      is_subscribed: true,
      grant_expires_at: FUTURE,
    });

    const [entry] = await getModuleCatalog(1);
    expect(entry.subscriptionState).toBe('enabled');
    expect(entry.isEnabled).toBe(true);
    expect(entry.grantExpired).toBe(false);
    expect(entry.grantExpiresAt).toBe(FUTURE);
  });

  it('an explicit disabled row is still disabled, expiry or not', async () => {
    wireCatalog({
      ...base,
      metadata: meta(['standard']),
      is_subscribed: false,
      grant_expires_at: PAST,
    });

    const [entry] = await getModuleCatalog(1);
    expect(entry.subscriptionState).toBe('disabled');
    expect(entry.grantExpired).toBe(false);
  });

  it('no row at all is no override, and carries no date', async () => {
    wireCatalog({
      ...base,
      metadata: meta(['standard']),
      is_subscribed: null,
      grant_expires_at: null,
    });

    const [entry] = await getModuleCatalog(1);
    expect(entry.subscriptionState).toBe('none');
    expect(entry.grantExpired).toBe(false);
    expect(entry.grantExpiresAt).toBeNull();
  });
});
