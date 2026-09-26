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
 * And nothing counted the codes one challenge minted (the per-challenge cap,
 * P1-3's last engineering residual, 2026-09-26): /mfa/resend could mint a code
 * for as long as the challenge lived, and a sixth wrong guess cleared the row,
 * so the next resend started a fresh budget of five guesses. reissueEmailOtp is
 * now one conditional UPDATE that refuses past MAX_RESENDS codes per challenge;
 * only createEmailOtp, which costs the password, starts the count again.
 *
 * Real PGlite Postgres behind the real drizzle handle. PGlite runs statements
 * one at a time, which is exactly why the read-then-write form fails here too:
 * every concurrent call's SELECT runs before any call's UPDATE.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

import { isAccountLocked, recordFailedLogin } from '../auth-security-service';
import { MAX_RESENDS, createEmailOtp, reissueEmailOtp, verifyEmailOtp } from '../emailOtpService';

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
  email_otp_attempts    INTEGER DEFAULT 0,
  email_otp_resends     INTEGER DEFAULT 0
);
INSERT INTO users (id, email, name, password_hash) VALUES (7, 'a@acme.test', 'A. Rivera', 'x');
`;

async function row() {
  const r = await pg.query<{
    attempts: number | null;
    locked_until: Date | null;
    otp_attempts: number | null;
    otp_hash: string | null;
    otp_expires: Date | string | null;
    otp_resends: number | null;
  }>(
    `SELECT failed_login_attempts AS attempts, locked_until, email_otp_attempts AS otp_attempts, email_otp_hash AS otp_hash,
            email_otp_expires_at AS otp_expires, email_otp_resends AS otp_resends
       FROM users WHERE id = 7`,
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

    await createEmailOtp(7); // a second issue while one is pending (until 2026-09-26, what /mfa/resend called)
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

describe('reissueEmailOtp and the per-challenge cap (P1-3 residual, 2026-09-26)', () => {
  // MAX_RESENDS is the product number, recorded in
  // docs/evidence/D6/2026-09-25-p1/IAM-18-8/README.md; changing it is a decision.
  it('a challenge receives MAX_RESENDS (3) re-issued codes, then none: the refusal leaves the pending code and its expiry untouched', async () => {
    expect(MAX_RESENDS).toBe(3);
    await createEmailOtp(7); // the sign-in: password verified, first code sent
    let last: string | null = null;
    for (let i = 1; i <= MAX_RESENDS; i++) {
      last = await reissueEmailOtp(7);
      expect(last, `re-issue ${i} of ${MAX_RESENDS} was refused`).toMatch(/^\d{6}$/);
      expect((await row()).otp_resends).toBe(i);
    }
    const before = await row();
    expect(await reissueEmailOtp(7), 'a challenge minted more codes than its limit').toBeNull();
    const after = await row();
    expect(after.otp_hash).toBe(before.otp_hash);
    expect(String(after.otp_expires)).toBe(String(before.otp_expires));
    expect(after.otp_resends).toBe(MAX_RESENDS);
    // The last code the challenge did receive still signs in.
    expect(await verifyEmailOtp(7, last as string)).toBe(true);
  });

  it('a re-issued code keeps the guesses already spent, and is the code that now verifies', async () => {
    await createEmailOtp(7);
    expect(await verifyEmailOtp(7, '000000')).toBe(false);
    expect(await verifyEmailOtp(7, '000001')).toBe(false);
    const next = await reissueEmailOtp(7);
    const r = await row();
    expect(r.otp_attempts, 'a re-issue refilled the guesses').toBe(2);
    expect(r.otp_resends).toBe(1);
    expect(await verifyEmailOtp(7, next as string)).toBe(true);
  });

  it('exhausting the guesses and clearing the row does not refill the codes: the cap counts the whole challenge', async () => {
    await createEmailOtp(7);
    expect(await reissueEmailOtp(7)).not.toBeNull(); // one code re-issued
    for (let i = 0; i < 5; i++) expect(await verifyEmailOtp(7, '000000')).toBe(false); // the guess budget
    expect(await verifyEmailOtp(7, '000000')).toBe(false); // the clearing sixth
    const cleared = await row();
    expect(cleared.otp_hash).toBeNull();
    expect(cleared.otp_attempts).toBe(0);
    expect(cleared.otp_resends, 'clearing the code reset the count of codes').toBe(1);
    // Until 2026-09-26 the next resend started a fresh budget of five guesses,
    // and nothing bounded how often that could repeat.
    for (let i = 2; i <= MAX_RESENDS; i++) expect(await reissueEmailOtp(7)).not.toBeNull();
    expect(await reissueEmailOtp(7), 'the cap did not survive a cleared row').toBeNull();
  });

  it('a fresh challenge (createEmailOtp, what the password step calls) starts the count again', async () => {
    await createEmailOtp(7);
    for (let i = 0; i < MAX_RESENDS; i++) await reissueEmailOtp(7);
    expect(await reissueEmailOtp(7)).toBeNull();
    await createEmailOtp(7); // another sign-in: the password was presented again
    expect((await row()).otp_resends).toBe(0);
    expect(await reissueEmailOtp(7)).not.toBeNull();
  });

  it('ten simultaneous re-issues mint exactly MAX_RESENDS codes, and exactly one of them is the pending code', async () => {
    await createEmailOtp(7);
    const minted = (await Promise.all(Array.from({ length: 10 }, () => reissueEmailOtp(7)))).filter((c): c is string => c !== null);
    expect(minted, 'concurrent re-issues each read the same count').toHaveLength(MAX_RESENDS);
    expect((await row()).otp_resends).toBe(MAX_RESENDS);
    let accepted = 0;
    for (const code of minted) if (await verifyEmailOtp(7, code)) accepted++;
    expect(accepted).toBe(1);
  });
});

/**
 * The column the service now writes reaches a deployed database only through a
 * file in C2C_MIGRATION_FILES (deploy runs scripts/db/deploy-migrate.mjs, never
 * drizzle push), and every set file re-runs on every deploy (CLAUDE.md Rule 1).
 * The column was added by amending migrations/20260923_users_mfa_totp_last_step.sql
 * in place. ci:column-reachability cannot see the difference — the drizzle push
 * surface vouches for any column of a public table — so this case applies the
 * real file to the pre-2026-09-26 shape of `users` and asks the service to write.
 */
describe('the migration the set runs gives the row what the service writes (Rule 1; the C-20 mode)', () => {
  const MIGRATION = fileURLToPath(new URL('../../../migrations/20260923_users_mfa_totp_last_step.sql', import.meta.url));

  it('migrations/20260923_users_mfa_totp_last_step.sql adds email_otp_resends, so createEmailOtp does not fail with 42703 after a deploy', async () => {
    // A database provisioned before this change: no email_otp_resends.
    await pg.exec(`ALTER TABLE users DROP COLUMN email_otp_resends`);
    await expect(createEmailOtp(7), 'the pre-deploy shape should refuse the write (the failure the migration exists to prevent)').rejects.toThrow(/email_otp_resends/);

    const sql = readFileSync(MIGRATION, 'utf8');
    await pg.exec(sql);
    await expect(createEmailOtp(7), 'the set file did not add the column the service writes').resolves.toMatch(/^\d{6}$/);
    const col = await pg.query<{ data_type: string; column_default: string | null }>(
      `SELECT data_type, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_otp_resends'`,
    );
    expect(col.rows).toEqual([{ data_type: 'integer', column_default: '0' }]);

    // Re-runnable: the file executes on every deploy and must be a no-op the second time.
    await pg.exec(sql);
    expect((await row()).otp_resends).toBe(0);
  });
});
