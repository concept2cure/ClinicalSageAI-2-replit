/**
 * Email OTP Service — Zero-Setup Two-Factor Authentication
 *
 * Sends a 6-digit code to the user's email on login. No authenticator
 * app required, no QR codes, no backup codes to manage. If a user
 * can receive email, they can complete 2FA — zero support burden.
 *
 * Flow:
 *  1. User enters email + password (validated)
 *  2. Server generates 6-digit OTP, hashes it, stores hash + expiry in DB
 *  3. Server sends OTP to user's email
 *  4. User enters OTP on login screen
 *  5. Server verifies OTP (constant-time compare of hashes)
 *  6. On success, issues JWT tokens
 *
 * Security:
 *  - OTP is SHA-256 hashed before storage (plaintext never persisted)
 *  - 10-minute expiry window
 *  - Max 5 verification attempts per OTP (prevents brute force), counted and
 *    consumed atomically so concurrent requests cannot share a code
 *  - At most MAX_RESENDS re-issued codes per sign-in challenge (reissueEmailOtp,
 *    one conditional UPDATE), counted on the row and started again only by
 *    createEmailOtp, which costs the password (IAM-09, plan P1-3; 2026-09-26)
 *  - Rate limited at the route level (reuses existing mfaLimiter)
 *
 * @compliance FDA 21 CFR Part 11.10(d) — Session controls
 * @compliance NIST 800-63B AAL1+ — Email-based second factor
 */

import crypto from 'crypto';
import { db } from '../db';
import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { users } from '../../shared/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OTP validity window in minutes */
const OTP_EXPIRY_MINUTES = 10;

/** Number of digits in the OTP */
const OTP_DIGITS = 6;

/** Maximum verification attempts before OTP is invalidated */
const MAX_ATTEMPTS = 5;

/**
 * Re-issued codes one sign-in challenge may receive (POST /mfa/resend). The
 * code that comes with the challenge itself is not counted. Three is the
 * product number recorded in docs/evidence/D6/2026-09-25-p1/IAM-18-8/README.md:
 * enough for a delayed or filtered message, few enough that a challenge cannot
 * be used to mail an inbox without limit or, after a cleared code, to refill
 * the MAX_ATTEMPTS guesses again and again. Beyond it the holder signs in again.
 */
export const MAX_RESENDS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateOtp(): string {
  // Cryptographically random 6-digit code (100000–999999)
  const num = crypto.randomInt(100000, 999999 + 1);
  return num.toString();
}

/** A fresh code, its stored hash and its expiry, from one clock reading. */
function mintCode(now: Date): { otp: string; otpHash: string; expiresAt: Date } {
  const otp = generateOtp();
  return { otp, otpHash: hashOtp(otp), expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000) };
}

/**
 * The attempt count a newly issued code carries. A code issued while one is
 * pending and unexpired keeps the guesses already spent on it; a fresh code —
 * nothing pending, or the pending code expired — starts at 0. Until 2026-09-25
 * every issue reset the count, so each resend refilled MAX_ATTEMPTS guesses
 * (security audit 2026-09-24, IAM-09). The SET expression reads the row as it
 * was before the statement that carries it.
 */
function attemptsCarriedOver(now: Date) {
  return sql`CASE
    WHEN ${users.emailOtpHash} IS NOT NULL AND ${users.emailOtpExpiresAt} > ${now.toISOString()}::timestamp
    THEN coalesce(${users.emailOtpAttempts}, 0)
    ELSE 0
  END`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Issue the emailed code of a new sign-in challenge — the password has just
 * been verified (routes/auth.ts POST /login, routes/authEnterprise.ts POST
 * /verify-password). Returns the plaintext OTP (to be sent via email), never
 * stored. This is the only statement that starts the count of re-issued codes
 * again: a fresh budget of codes costs the password.
 */
export async function createEmailOtp(userId: number): Promise<string> {
  const now = new Date();
  const { otp, otpHash, expiresAt } = mintCode(now);

  await db
    .update(users)
    .set({
      emailOtpHash: otpHash,
      emailOtpExpiresAt: expiresAt,
      emailOtpAttempts: attemptsCarriedOver(now),
      emailOtpResends: 0,
    } as any)
    .where(eq(users.id, userId));

  return otp;
}

/**
 * Re-issue the current challenge's emailed code (routes/auth.ts POST
 * /mfa/resend), or refuse: null once the challenge has received MAX_RESENDS
 * re-issued codes, and then nothing on the row changes — the pending code and
 * its expiry stand.
 *
 * One conditional UPDATE … RETURNING, so the count is read and written under
 * the row lock: ten concurrent resends mint exactly MAX_RESENDS codes. The
 * count survives an exhausted or cleared code (verifyEmailOtp and clearOtp
 * leave it), so five wrong guesses, a clearing sixth and a resend no longer
 * start a fresh budget of five; until 2026-09-26 nothing counted the codes a
 * challenge minted (IAM-09; plan P1-3's last engineering residual).
 */
export async function reissueEmailOtp(userId: number): Promise<string | null> {
  const now = new Date();
  const { otp, otpHash, expiresAt } = mintCode(now);

  const [reissued] = await db
    .update(users)
    .set({
      emailOtpHash: otpHash,
      emailOtpExpiresAt: expiresAt,
      emailOtpAttempts: attemptsCarriedOver(now),
      emailOtpResends: sql`coalesce(${users.emailOtpResends}, 0) + 1`,
    } as any)
    .where(and(eq(users.id, userId), sql`coalesce(${users.emailOtpResends}, 0) < ${MAX_RESENDS}`))
    .returning({ id: users.id });

  return reissued ? otp : null;
}

/**
 * Verify a user-submitted OTP code, consuming it. True if valid.
 *
 * Each step is one conditional UPDATE, so concurrent requests cannot share a
 * code or an attempt (D6, the same class as the TOTP replay in VSR-001 §13.3
 * item 1). Until 2026-09-23 this read the row, wrote the attempt count, compared,
 * and cleared the code in separate statements: two concurrent requests carrying
 * the right code could both pass before either cleared it, and concurrent wrong
 * guesses could each read the same count and exceed MAX_ATTEMPTS together.
 *
 *   1. Count the attempt — only while a code is pending, unexpired and under the
 *      limit — and read back the stored hash.
 *   2. Compare in constant time.
 *   3. Consume — only if the stored hash is still this code's. Of two concurrent
 *      correct submissions exactly one gets the row.
 */
export async function verifyEmailOtp(userId: number, code: string): Promise<boolean> {
  if (!code || code.length !== OTP_DIGITS || !/^\d+$/.test(code)) {
    return false;
  }

  const now = new Date();
  const [pending] = await db
    .update(users)
    .set({ emailOtpAttempts: sql`coalesce(${users.emailOtpAttempts}, 0) + 1` })
    .where(
      and(
        eq(users.id, userId),
        isNotNull(users.emailOtpHash),
        gt(users.emailOtpExpiresAt, now),
        sql`coalesce(${users.emailOtpAttempts}, 0) < ${MAX_ATTEMPTS}`
      )
    )
    .returning({ storedHash: users.emailOtpHash });

  if (!pending?.storedHash) {
    // None pending, expired, or out of attempts: the code is dead either way.
    await clearOtp(userId);
    return false;
  }

  const submittedHash = hashOtp(code);
  const storedHash = pending.storedHash;
  const matches =
    submittedHash.length === storedHash.length &&
    crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(storedHash));
  if (!matches) {
    return false;
  }

  const consumed = await db
    .update(users)
    .set({ emailOtpHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0 })
    .where(and(eq(users.id, userId), eq(users.emailOtpHash, storedHash)))
    .returning({ id: users.id });
  return consumed.length === 1;
}

/**
 * Clear stored OTP data for a user. email_otp_resends is left as it is: it
 * counts the challenge's codes, not this code's guesses, and must survive the
 * clearing guess (see reissueEmailOtp).
 */
async function clearOtp(userId: number): Promise<void> {
  await db
    .update(users)
    .set({
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailOtpAttempts: 0,
    } as any)
    .where(eq(users.id, userId));
}

/**
 * Check if the user still has a valid (non-expired) OTP pending.
 * Used to decide whether to resend or generate a new one.
 */
export async function hasValidPendingOtp(userId: number): Promise<boolean> {
  const [user] = await db
    .select({
      emailOtpHash: users.emailOtpHash,
      emailOtpExpiresAt: users.emailOtpExpiresAt,
    } as any)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.emailOtpHash || !user.emailOtpExpiresAt) {
    return false;
  }

  return new Date(user.emailOtpExpiresAt) > new Date();
}
