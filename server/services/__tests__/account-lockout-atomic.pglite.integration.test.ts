/**
 * The per-account lockout counts every failure, under concurrency, and an
 * emailed code's guesses are not refilled by asking for the code again
 * (security audit 2026-09-24, IAM-09; plan P1-3).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * auth-security-service.recordFailedLogin read users.failed_login_attempts,
 * added one in JavaScript and wrote the sum back. Twenty wrong passwords sent
 * at once each read 0 and each wrote 1: the account never locked, and the
 * limit of five was a limit on sequential attackers only. On a write error it
 * answered { locked: false } — an unrecordable failure counted as no failure.
 * emailOtpService.createEmailOtp set email_otp_attempts back to 0 on every
 * call, and /mfa/resend calls it, so each resend refilled the guesses.
 *
 * Real PGlite Postgres behind the real drizzle handle. PGlite runs statements
 * one at a time, which is exactly why the read-then-write form fails here too:
 * every concurrent call's SELECT runs before any call's UPDATE.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

import { isAccountLocked, recordFailedLogin } from '../auth-security-service';
import { createEmailOtp, verifyEmailOtp } from '../emailOtpService';

let pg: PGlite;

const DDL = `
CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until          TIMESTAMP,
  last_failed_login     TIMESTAMP,
  email_otp_hash        TEXT,
  email_otp_expires_at  TIMESTAMP,
  email_otp_attempts    INTEGER DEFAULT 0
);
INSERT INTO users (id, email, name, password_hash) VALUES (7, 'a@acme.test', 'A. Rivera', 'x');
`;

async function row() {
  const r = await pg.query<{ attempts: number | null; locked_until: Date | null; otp_attempts: number | null; otp_hash: string | null }>(
    `SELECT failed_login_attempts AS attempts, locked_until, email_otp_attempts AS otp_attempts, email_otp_hash AS otp_hash FROM users WHERE id = 7`,
  );
  return r.rows[0];
}

beforeAll(async () => {
  pg = new PGlite();
  holder.db = drizzle(pg);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(`DROP TABLE IF EXISTS users; ${DDL}`);
});

describe('recordFailedLogin under concurrency', () => {
  it('twenty simultaneous wrong passwords are twenty failures, and the account is locked', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => recordFailedLogin(7)));
    const r = await row();
    expect(r.attempts, 'concurrent failures overwrote each other').toBe(20);
    expect(r.locked_until, 'five failures did not lock the account').not.toBeNull();
    expect(results.some((x) => x.locked)).toBe(true);
    expect((await isAccountLocked(7)).locked).toBe(true);
  });

  it('control: the fifth sequential failure locks, the first four do not', async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await recordFailedLogin(7);
      expect(r.locked).toBe(false);
      expect(r.remainingAttempts).toBe(5 - i);
    }
    expect((await row()).locked_until).toBeNull();
    const fifth = await recordFailedLogin(7);
    expect(fifth).toMatchObject({ locked: true, remainingAttempts: 0 });
    expect((await row()).locked_until).not.toBeNull();
  });

  it('a failure that cannot be recorded is an error, not "not locked"', async () => {
    await pg.exec(`ALTER TABLE users DROP COLUMN failed_login_attempts`);
    await expect(recordFailedLogin(7), 'an unrecordable failure answered as if recorded').rejects.toThrow();
  });
});

describe('createEmailOtp and the guess budget', () => {
  it('re-issuing a code while one is pending keeps the attempts already spent', async () => {
    await createEmailOtp(7);
    expect(await verifyEmailOtp(7, '000000')).toBe(false);
    expect(await verifyEmailOtp(7, '000001')).toBe(false);
    expect((await row()).otp_attempts).toBe(2);

    await createEmailOtp(7); // what /mfa/resend does
    expect((await row()).otp_attempts, 'a resend refilled the guesses').toBe(2);
  });

  it('a code issued when none is pending starts a fresh budget', async () => {
    const otp = await createEmailOtp(7);
    expect(await verifyEmailOtp(7, '000000')).toBe(false);
    expect(await verifyEmailOtp(7, otp)).toBe(true); // consumed: nothing pending
    expect((await row()).otp_hash).toBeNull();

    await createEmailOtp(7); // a new challenge
    expect((await row()).otp_attempts).toBe(0);
  });

  it('a code issued after the pending one expired starts a fresh budget', async () => {
    await createEmailOtp(7);
    expect(await verifyEmailOtp(7, '000000')).toBe(false);
    await pg.exec(`UPDATE users SET email_otp_expires_at = now() - interval '1 minute' WHERE id = 7`);

    await createEmailOtp(7);
    expect((await row()).otp_attempts).toBe(0);
  });
});
