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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate and store a new email OTP for a user.
 * Returns the plaintext OTP (to be sent via email) — never stored in DB.
 */
export async function createEmailOtp(userId: number): Promise<string> {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db
    .update(users)
    .set({
      emailOtpHash: otpHash,
      emailOtpExpiresAt: expiresAt,
      // A code re-issued while one is pending and unexpired (what /mfa/resend
      // does) keeps the guesses already spent on this challenge; a fresh
      // challenge — nothing pending, or the pending code expired — starts at
      // 0. Until 2026-09-25 every issue reset the count, so each resend
      // refilled MAX_ATTEMPTS guesses (security audit 2026-09-24, IAM-09).
      // The SET expressions read the row as it was before this statement.
      emailOtpAttempts: sql`CASE
        WHEN ${users.emailOtpHash} IS NOT NULL AND ${users.emailOtpExpiresAt} > ${now.toISOString()}::timestamp
        THEN coalesce(${users.emailOtpAttempts}, 0)
        ELSE 0
      END`,
    } as any)
    .where(eq(users.id, userId));

  return otp;
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
 * Clear stored OTP data for a user.
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
