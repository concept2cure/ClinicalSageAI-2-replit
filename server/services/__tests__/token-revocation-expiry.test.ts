/**
 * A revocation must outlive the token it revokes.
 *
 * Security audit 2026-09-24, IAM-04 (High): every revocation entry was written
 * with a fixed 24-hour life (Redis `setex`, `revoked_tokens.expires_at`), and
 * the read side honours `expires_at > NOW()`. Refresh tokens live 7 days
 * (routes/auth.ts REFRESH_TOKEN_EXPIRES_IN), so a refresh token revoked at
 * logout dropped off the list after a day and could mint sessions again for the
 * remaining six. The rule now: a revocation lasts until the later of 24 hours
 * and the token's own `exp`. The memory tier never expired and is unchanged.
 *
 * The backends are stood in by recorders: what this file proves is the expiry
 * each backend is asked to keep, not that Redis or PostgreSQL keep it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const recorded = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  setex: [] as Array<{ key: string; ttl: number }>,
}));

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      recorded.queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  },
}));

// token-revocation reaches the pool through `import('../db.js')`, which resolves
// to the literal server/db.js shim; the extensionless form is mocked too so
// whichever resolver wins sees the same double.
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);
vi.mock('../ai-actions/redis-manager', () => ({
  isRedisAvailable: () => true,
  getRedisClient: () => ({
    setex: async (key: string, ttl: number) => {
      recorded.setex.push({ key, ttl });
      return 'OK';
    },
    exists: async () => 0,
  }),
}));

import { revokeToken, revocationExpiryFor, resetRevocationMetrics } from '../token-revocation';

const DAY_SECONDS = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A token with the given `exp`. The secret is irrelevant: expiry is read, not verified. */
const tokenExpiringAt = (exp: number, type = 'refresh') =>
  jwt.sign({ userId: '1', email: 'u@example.com', type, exp }, 'not-the-server-secret');

const insertedExpiry = (): number => {
  const insert = recorded.queries.find(q => /INSERT INTO revoked_tokens/i.test(q.sql));
  expect(insert, 'the DB tier was not written').toBeDefined();
  return new Date(insert!.params[1] as string).getTime();
};

beforeEach(() => {
  recorded.queries.length = 0;
  recorded.setex.length = 0;
  resetRevocationMetrics();
});

describe('revokeToken keeps a revocation for the life of the token (IAM-04)', () => {
  it('keeps a 7-day refresh token on the DB list until its own exp, not for 24 hours', async () => {
    const exp = nowSeconds() + 7 * DAY_SECONDS;

    await revokeToken(tokenExpiringAt(exp), 'logout');

    expect(insertedExpiry()).toBeGreaterThanOrEqual(exp * 1000);
  });

  it('asks Redis to keep the same refresh token for its remaining life, not for 24 hours', async () => {
    const exp = nowSeconds() + 7 * DAY_SECONDS;

    await revokeToken(tokenExpiringAt(exp), 'logout');

    expect(recorded.setex).toHaveLength(1);
    // Allow the seconds the test itself takes.
    expect(recorded.setex[0].ttl).toBeGreaterThanOrEqual(7 * DAY_SECONDS - 5);
  });

  it('still keeps a short-lived token for the 24-hour floor (an exp sooner than that does not shorten the entry)', async () => {
    const before = Date.now();
    await revokeToken(tokenExpiringAt(nowSeconds() + 5 * 60, 'mfa_challenge'), 'logout');

    expect(insertedExpiry()).toBeGreaterThanOrEqual(before + DAY_SECONDS * 1000 - 1000);
    expect(recorded.setex[0].ttl).toBeGreaterThanOrEqual(DAY_SECONDS - 5);
  });

  it('keeps an opaque (non-JWT) string for the 24-hour floor', async () => {
    const before = Date.now();
    await revokeToken('not-a-jwt-at-all', 'logout');

    expect(insertedExpiry()).toBeGreaterThanOrEqual(before + DAY_SECONDS * 1000 - 1000);
  });
});

describe('revocationExpiryFor (the rule, in one place)', () => {
  it('is the later of 24 hours and the token exp', () => {
    const now = Date.UTC(2026, 8, 25, 12, 0, 0);
    const sevenDays = Math.floor(now / 1000) + 7 * DAY_SECONDS;
    expect(revocationExpiryFor(tokenExpiringAt(sevenDays), now).getTime()).toBe(sevenDays * 1000);

    const fiveMinutes = Math.floor(now / 1000) + 300;
    expect(revocationExpiryFor(tokenExpiringAt(fiveMinutes), now).getTime()).toBe(now + DAY_SECONDS * 1000);
  });

  it('is 24 hours for a token with no readable exp', () => {
    const now = Date.UTC(2026, 8, 25, 12, 0, 0);
    expect(revocationExpiryFor('opaque', now).getTime()).toBe(now + DAY_SECONDS * 1000);
    const noExp = jwt.sign({ userId: '1', type: 'access' }, 'x', { noTimestamp: true });
    expect(revocationExpiryFor(noExp, now).getTime()).toBe(now + DAY_SECONDS * 1000);
  });
});
