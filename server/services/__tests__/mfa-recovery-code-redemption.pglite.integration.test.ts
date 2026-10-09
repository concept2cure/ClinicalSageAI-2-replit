/**
 * Recovery codes are redeemable at the login challenge, once each, and nowhere
 * else (security audit 2026-09-24, IAM-08; plan P1-2, recovery-code half).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * enableMfa issued ten recovery codes (hashed into users.mfa_backup_codes) and
 * no verifier accepted them: verifySecondFactor refused anything that was not
 * six digits, so a user who lost the authenticator had codes that opened
 * nothing (docs/evidence/D6/2026-09-23/README.md item 1 recorded the choice:
 * make them redeemable at the login challenge only, or stop issuing them).
 *
 * The contract pinned here:
 *   · verifyLoginSecondFactor redeems a code the enrolment issued, once: the
 *     redemption is one conditional UPDATE, so a second presentation, and the
 *     second of two concurrent presentations, gets nothing;
 *   · a code is bound to its account and to an enabled enrolment;
 *   · verifySecondFactor / verifyToken — what the signing ceremony, enrolment
 *     and disablement call — still refuse a recovery code and do not consume it.
 *
 * Real PGlite Postgres behind the real drizzle handle. The stored form is the
 * service's own: sha256 of the code without dashes, upper-cased, hex.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

import { verifyLoginSecondFactor, verifySecondFactor, verifyToken } from '../mfaService';

const stored = (code: string) =>
  crypto.createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');

const USER_CODES = ['ABCD-EF01', '1234-5678'];
const OTHER_CODES = ['AAAA-BBBB'];

let pg: PGlite;

async function codesOf(userId: number): Promise<string[] | null> {
  const r = await pg.query<{ codes: string[] | null }>(`SELECT mfa_backup_codes AS codes FROM users WHERE id = $1`, [userId]);
  return r.rows[0]?.codes ?? null;
}

beforeAll(async () => {
  pg = new PGlite();
  holder.db = drizzle(pg);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(`
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id                 SERIAL PRIMARY KEY,
      email              TEXT NOT NULL UNIQUE,
      name               TEXT NOT NULL,
      password_hash      TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'active',
      mfa_enabled        BOOLEAN DEFAULT false,
      mfa_secret         TEXT,
      mfa_backup_codes   JSON,
      mfa_method         TEXT DEFAULT 'email',
      mfa_totp_last_step BIGINT
    );
  `);
  await pg.query(
    `INSERT INTO users (id, email, name, password_hash, mfa_enabled, mfa_backup_codes) VALUES
       (7, 'a@acme.test', 'A. Rivera', 'x', true, $1::json),
       (8, 'b@acme.test', 'B. Chen',   'x', true, $2::json),
       (9, 'c@acme.test', 'C. Okafor', 'x', false, $1::json)`,
    [JSON.stringify(USER_CODES.map(stored)), JSON.stringify(OTHER_CODES.map(stored))],
  );
});

describe('verifyLoginSecondFactor: recovery codes', () => {
  it('redeems a code the enrolment issued, and removes only that code', async () => {
    expect(await verifyLoginSecondFactor(7, 'ABCD-EF01')).toBe('recovery');
    expect(await codesOf(7)).toEqual([stored('1234-5678')]);
  });

  it('a redeemed code is gone: presenting it again gets nothing', async () => {
    expect(await verifyLoginSecondFactor(7, 'ABCD-EF01')).toBe('recovery');
    expect(await verifyLoginSecondFactor(7, 'ABCD-EF01')).toBeNull();
  });

  it('of two simultaneous presentations of one code, exactly one is accepted', async () => {
    const results = await Promise.all([verifyLoginSecondFactor(7, '1234-5678'), verifyLoginSecondFactor(7, '1234-5678')]);
    expect(results.filter((r) => r === 'recovery')).toHaveLength(1);
    expect(await codesOf(7)).toEqual([stored('ABCD-EF01')]);
  });

  it('accepts the code as people type it: lower-case, or without the dash', async () => {
    expect(await verifyLoginSecondFactor(7, 'abcd-ef01')).toBe('recovery');
    expect(await verifyLoginSecondFactor(7, '12345678')).toBe('recovery');
    expect(await codesOf(7)).toEqual([]);
  });

  it("another account's code is not this account's", async () => {
    expect(await verifyLoginSecondFactor(7, 'AAAA-BBBB')).toBeNull();
    expect(await codesOf(8)).toEqual(OTHER_CODES.map(stored));
  });

  it('codes from a disabled enrolment are dead', async () => {
    expect(await verifyLoginSecondFactor(9, 'ABCD-EF01')).toBeNull();
    expect(await codesOf(9)).toEqual(USER_CODES.map(stored));
  });

  it('a six-digit token takes the authenticator path and touches no recovery code', async () => {
    expect(await verifyLoginSecondFactor(7, '000000')).toBeNull(); // no secret enrolled here
    expect(await codesOf(7)).toEqual(USER_CODES.map(stored));
  });

  it('text that is neither shape is refused without a query', async () => {
    expect(await verifyLoginSecondFactor(7, 'ABCD-EF01; DROP TABLE users')).toBeNull();
    expect(await verifyLoginSecondFactor(7, '')).toBeNull();
    expect(await codesOf(7)).toEqual(USER_CODES.map(stored));
  });
});

describe('the authenticator-only entry points (signing, enrolment, disablement)', () => {
  it('verifySecondFactor refuses a recovery code and leaves it unconsumed', async () => {
    expect(await verifySecondFactor(7, 'ABCD-EF01')).toBeNull();
    expect(await codesOf(7)).toEqual(USER_CODES.map(stored));
  });

  it('verifyToken refuses a recovery code and leaves it unconsumed', async () => {
    expect(await verifyToken(7, 'ABCD-EF01')).toBe(false);
    expect(await codesOf(7)).toEqual(USER_CODES.map(stored));
  });
});
