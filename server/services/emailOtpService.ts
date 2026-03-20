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
 *  - Max 5 verification attempts per OTP (prevents brute force)
 *  - Rate limited at the route level (reuses existing mfaLimiter)
 *
 * @compliance FDA 21 CFR Part 11.10(d) — Session controls
 * @compliance NIST 800-63B AAL1+ — Email-based second factor
 */

import crypto from 'crypto';
import { db } from '../db';
import { eq } from 'drizzle-orm';
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
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db
    .update(users)
    .set({
      emailOtpHash: otpHash,
      emailOtpExpiresAt: expiresAt,
      emailOtpAttempts: 0,
    } as any)
    .where(eq(users.id, userId));

  return otp;
}

/**
 * Verify a user-submitted OTP code.
 * Returns true if valid, false otherwise.
 * Automatically invalidates the OTP after max attempts or successful verify.
 */
export async function verifyEmailOtp(userId: number, code: string): Promise<boolean> {
  if (!code || code.length !== OTP_DIGITS || !/^\d+$/.test(code)) {
    return false;
  }

  const [user] = await db
    .select({
      emailOtpHash: users.emailOtpHash,
      emailOtpExpiresAt: users.emailOtpExpiresAt,
      emailOtpAttempts: users.emailOtpAttempts,
    } as any)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.emailOtpHash) {
    return false;
  }

  // Check expiry
  if (user.emailOtpExpiresAt && new Date(user.emailOtpExpiresAt) < new Date()) {
    // Expired — clear OTP
    await clearOtp(userId);
    return false;
  }

  // Check attempt limit
  const attempts = (user.emailOtpAttempts || 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    await clearOtp(userId);
    return false;
  }

  // Increment attempt counter
  await db
    .update(users)
    .set({ emailOtpAttempts: attempts } as any)
    .where(eq(users.id, userId));

  // Constant-time comparison of hashes
  const submittedHash = hashOtp(code);
  const storedHash = user.emailOtpHash as string;

  if (
    submittedHash.length === storedHash.length &&
    crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(storedHash))
  ) {
    // Valid — clear OTP so it can't be reused
    await clearOtp(userId);
    return true;
  }

  return false;
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
