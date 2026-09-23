/**
 * MFA Service - TOTP (Time-based One-Time Password) Implementation
 *
 * Production-grade MFA for FDA 21 CFR Part 11 compliance.
 * Uses RFC 6238 (TOTP) with HMAC-SHA1, 30-second time steps, 6-digit codes.
 *
 * Secrets are stored AES-256-GCM encrypted in the database.
 * No external TOTP libraries required — implemented with Node.js crypto.
 *
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11.10(d), NIST 800-63B AAL2
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import * as QRCode from 'qrcode';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
import { db } from '../db';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { users } from '../../shared/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TOTP time step in seconds (RFC 6238 default) */
const TOTP_PERIOD = 30;

/** Number of digits in the OTP code */
const TOTP_DIGITS = 6;

/** Algorithm used for HMAC (Google Authenticator standard) */
const TOTP_ALGORITHM = 'sha1';

/** How many time-step windows to accept (1 = current +/- 1 period) */
const TOTP_WINDOW = 1;

/** Length of the raw secret in bytes (160 bits, standard for SHA-1 TOTP) */
const SECRET_BYTES = 20;

/** AES-256-GCM IV length */
const IV_LENGTH = 12;

/** AES-256-GCM auth tag length */
const AUTH_TAG_LENGTH = 16;

/** Number of backup codes to generate */
const BACKUP_CODE_COUNT = 10;

/** Issuer name shown in authenticator apps */
const TOTP_ISSUER = 'Concept2Cure';

// ---------------------------------------------------------------------------
// Base32 Encoding (RFC 4648)
// ---------------------------------------------------------------------------

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleanInput = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleanInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

// ---------------------------------------------------------------------------
// Encryption Helpers (AES-256-GCM)
// ---------------------------------------------------------------------------

/** Derive a 32-byte AES key from a secret string. */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * The key used to ENCRYPT new MFA secrets.
 *
 * SECURITY: a dedicated MFA_ENCRYPTION_KEY must back MFA-secret confidentiality
 * so it does not depend on JWT_SECRET — reusing JWT_SECRET means a JWT_SECRET
 * disclosure would also decrypt every stored MFA secret (key reuse across
 * trust domains). Development falls back to a JWT-derived key for convenience.
 * Production allows the fallback (with a CRITICAL log) only until the operator
 * sets MFA_REQUIRE_DEDICATED_KEY=true — done after provisioning the key and
 * re-encrypting existing secrets — at which point encryption fails closed.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.MFA_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return deriveKey(envKey);
  }
  if (process.env.NODE_ENV === 'production') {
    if (process.env.MFA_REQUIRE_DEDICATED_KEY === 'true') {
      throw new Error(
        'MFA_ENCRYPTION_KEY (>=32 chars) is required in production when MFA_REQUIRE_DEDICATED_KEY=true'
      );
    }
    console.error(
      '[mfa] CRITICAL: MFA_ENCRYPTION_KEY not set in production — falling back to a JWT_SECRET-derived key. ' +
        'Provision MFA_ENCRYPTION_KEY, re-encrypt secrets, then set MFA_REQUIRE_DEDICATED_KEY=true.'
    );
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('MFA_ENCRYPTION_KEY or JWT_SECRET must be set for MFA functionality');
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[mfa] MFA_ENCRYPTION_KEY not set — deriving from JWT_SECRET (development only).');
  }
  return deriveKey(jwtSecret);
}

/**
 * Candidate keys to TRY when DECRYPTING, primary first. Includes the legacy
 * JWT_SECRET-derived key so secrets written before MFA_ENCRYPTION_KEY was
 * provisioned still decrypt — no user lockout during the key migration.
 * AES-GCM's auth tag makes trying candidates safe: a wrong key throws.
 */
function getDecryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const seen = new Set<string>();
  const add = (k: Buffer | null) => {
    if (!k) return;
    const h = k.toString('hex');
    if (!seen.has(h)) {
      seen.add(h);
      keys.push(k);
    }
  };
  try {
    add(getEncryptionKey());
  } catch {
    /* primary unavailable (enforcement on, no key) — fall through to legacy */
  }
  const envKey = process.env.MFA_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) add(deriveKey(envKey));
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) add(deriveKey(jwtSecret));
  if (keys.length === 0) {
    throw new Error('No MFA decryption key available (set MFA_ENCRYPTION_KEY or JWT_SECRET)');
  }
  return keys;
}

function requireJwtSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured for MFA token operations');
  }
  return process.env.JWT_SECRET;
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  // Try each candidate key (primary, then legacy JWT-derived). A wrong key
  // fails the GCM auth tag on final(), so this never decrypts with the wrong key.
  let lastErr: unknown;
  for (const key of getDecryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('MFA secret decryption failed');
}

// ---------------------------------------------------------------------------
// TOTP Core (RFC 6238 / RFC 4226)
// ---------------------------------------------------------------------------

/**
 * Generate a TOTP code for the given secret and time.
 */
function generateTOTP(secret: Buffer, timeCounter: number): string {
  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  // Write as unsigned 64-bit big-endian
  counterBuffer.writeUInt32BE(Math.floor(timeCounter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(timeCounter & 0xffffffff, 4);

  // HMAC-SHA1
  const hmac = crypto.createHmac(TOTP_ALGORITHM, secret);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation (RFC 4226 Section 5.4)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Get the current time counter for TOTP.
 */
function getTimeCounter(timestamp?: number): number {
  const time = timestamp || Math.floor(Date.now() / 1000);
  return Math.floor(time / TOTP_PERIOD);
}

/**
 * The time step a TOTP code matches within the ±TOTP_WINDOW tolerance, or null.
 *
 * Returns WHICH step matched, because acceptance is decided per step: a code is
 * accepted once, and only for a step later than the last one accepted
 * (consumeTotpStep). Until 2026-09-23 this returned a bare boolean and nothing
 * recorded the step, so a verified code was accepted again until its window
 * closed (VSR-001 §13.3 item 1).
 */
function matchTotpStep(secret: Buffer, token: string): number | null {
  const currentCounter = getTimeCounter();

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const expected = generateTOTP(secret, currentCounter + i);
    // Constant-time comparison to prevent timing attacks
    if (expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) {
      return currentCounter + i;
    }
  }

  return null;
}

/**
 * Accept `step` for the user if, and only if, it is later than the last step
 * accepted — in one conditional UPDATE, so of two concurrent verifications of
 * one code exactly one succeeds (the second re-checks the WHERE against the
 * committed row and matches nothing). RFC 6238 §5.2: "the verifier MUST NOT
 * accept the second attempt of the OTP after the successful validation has
 * been issued for the first OTP".
 *
 * "Later than", not "different from": once step N+1 has been accepted, a code
 * captured at step N is refused too. A consumed step stays consumed even if the
 * action it authorised later fails; the retry takes the next code.
 *
 * public.users carries no RLS policy, so this runs in whatever scope the caller
 * is in — the pre-auth scope at sign-in, the tenant scope when signing.
 */
async function consumeTotpStep(userId: number, step: number): Promise<boolean> {
  const accepted = await db
    .update(users)
    .set({ mfaTotpLastStep: step })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.mfaTotpLastStep), lt(users.mfaTotpLastStep, step))
      )
    )
    .returning({ id: users.id });
  return accepted.length === 1;
}

// ---------------------------------------------------------------------------
// Backup Codes
// ---------------------------------------------------------------------------

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // 8-character alphanumeric codes, grouped as XXXX-XXXX
    const raw = crypto.randomBytes(5).toString('hex').slice(0, 8).toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MfaSetupResult {
  secret: string;       // base32-encoded secret (for manual entry)
  otpauthUrl: string;   // otpauth:// URI for QR code generation
  qrCodeDataUrl: string; // PNG QR code of otpauthUrl, as a data: URL drawn on this server
}

/**
 * Generate a new TOTP secret for a user. Does NOT enable MFA yet.
 * The secret is stored encrypted but mfaEnabled remains false until
 * the user verifies a token via enableMfa().
 */
export async function generateSecret(userId: number, userEmail: string): Promise<MfaSetupResult> {
  // Generate random secret
  const secretBuffer = crypto.randomBytes(SECRET_BYTES);
  const secretBase32 = base32Encode(secretBuffer);

  // Build otpauth URL
  const label = encodeURIComponent(`${TOTP_ISSUER}:${userEmail}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(TOTP_ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;

  // Encrypt and store the secret (not yet enabled)
  const encryptedSecret = encrypt(secretBase32);

  await db
    .update(users)
    .set({
      mfaSecret: encryptedSecret,
      mfaMethod: 'totp',
      // Do NOT set mfaEnabled = true yet; that happens on verify
    })
    .where(eq(users.id, userId));

  // The QR code is drawn HERE, as a data: URL. Until 2026-09-23 this returned
  // an https://api.qrserver.com/... address whose query string carried the
  // otpauth URI — the TOTP secret itself — so any client that displayed it as
  // an image sent the seed of the user's second factor to a third party (D6).
  // The secret leaves this server only in the response to the user enrolling.
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 });

  return {
    secret: secretBase32,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/** The user's TOTP secret, decrypted, and the last step accepted; null if none. */
async function loadTotpState(
  userId: number
): Promise<{ secret: Buffer; lastStep: number | null } | null> {
  const [user] = await db
    .select({ mfaSecret: users.mfaSecret, mfaTotpLastStep: users.mfaTotpLastStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.mfaSecret) {
    return null;
  }

  return {
    secret: base32Decode(decrypt(user.mfaSecret)),
    lastStep: user.mfaTotpLastStep ?? null,
  };
}

const isSixDigits = (token: string) =>
  typeof token === 'string' && token.length === TOTP_DIGITS && /^\d+$/.test(token);

/**
 * Verify a second factor and CONSUME it: the one entry point every sign-in,
 * enrolment and signing path goes through. Returns the method that verified,
 * or null.
 *
 * Only a 6-digit TOTP code verifies. The recovery codes enableMfa issues have
 * never been redeemable here — their XXXX-XXXX form fails the digit check, as
 * tests/services/mfaService.test.ts pins — so the unreachable branch that would
 * have consumed them was removed on 2026-09-23 rather than kept as dead code.
 * Whether to make them redeemable (at the login challenge only) or stop issuing
 * them is an open D6 decision (docs/evidence/D6/2026-09-23/README.md).
 *
 * Replaces detectVerificationMethod, which classified a code by verifying it
 * WITHOUT consuming it, and was called just before this on the enterprise path.
 */
export async function verifySecondFactor(userId: number, token: string): Promise<'totp' | null> {
  if (!isSixDigits(token)) {
    return null;
  }

  const state = await loadTotpState(userId);
  if (!state) {
    return null;
  }

  const step = matchTotpStep(state.secret, token);
  if (step === null) {
    return null;
  }

  return (await consumeTotpStep(userId, step)) ? 'totp' : null;
}

/**
 * Verify a 6-digit TOTP token for a user, consuming it. True if it verified.
 */
export async function verifyToken(userId: number, token: string): Promise<boolean> {
  return (await verifySecondFactor(userId, token)) !== null;
}

/**
 * Would this code be accepted right now? A check that does NOT consume it.
 *
 * For one caller only: the e-signature modal's pre-check
 * (POST /api/esignature/verify-mfa), which checks the code and then sends the
 * SAME code to the governed signing endpoint. If the pre-check consumed it, the
 * signing endpoint would refuse it and every signature by an enrolled signer
 * would fail. The signing endpoint consumes it (verifyToken via reverifySigner).
 * Any other use would reopen the replay this service closes.
 */
export async function isTokenCurrentlyAcceptable(userId: number, token: string): Promise<boolean> {
  if (!isSixDigits(token)) {
    return false;
  }

  const state = await loadTotpState(userId);
  if (!state) {
    return false;
  }

  const step = matchTotpStep(state.secret, token);
  return step !== null && (state.lastStep === null || step > state.lastStep);
}

/**
 * Enable MFA after verifying the initial TOTP token.
 * This confirms the user has correctly set up their authenticator app.
 * Returns backup codes on success.
 */
export async function enableMfa(userId: number, token: string): Promise<{ success: boolean; backupCodes?: string[] }> {
  // Verify the token first to confirm authenticator app is set up correctly
  const isValid = await verifyToken(userId, token);
  if (!isValid) {
    return { success: false };
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const hashedCodes = backupCodes.map(hashBackupCode);

  // Enable MFA
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
      mfaBackupCodes: hashedCodes,
    })
    .where(eq(users.id, userId));

  console.log(`[mfa] MFA enabled for user ${userId}`);

  return { success: true, backupCodes };
}

/**
 * Disable MFA for a user after verifying their current TOTP token.
 */
export async function disableMfa(userId: number, token: string): Promise<boolean> {
  // Verify the token to confirm identity
  const isValid = await verifyToken(userId, token);
  if (!isValid) {
    return false;
  }

  // Clear all MFA data
  await db
    .update(users)
    .set({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      mfaVerifiedAt: null,
      mfaMethod: 'totp',
    })
    .where(eq(users.id, userId));

  console.log(`[mfa] MFA disabled for user ${userId}`);

  return true;
}

/**
 * Check if a user has MFA enabled.
 */
export async function isMfaEnabled(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.mfaEnabled === true;
}

/**
 * Create a short-lived MFA challenge token.
 * This is returned during login when MFA is required, so the user
 * can complete the second factor without re-submitting their password.
 */
export function createMfaChallengeToken(
  userId: number,
  email: string,
  organizationId: string,
  organizationUuid: string | null,
  role: string,
): string {
  const jwtSecret = requireJwtSecret();

  return jwt.sign(
    {
      userId: userId.toString(),
      email,
      organizationId,
      organizationUuid,
      role,
      type: 'mfa_challenge',
    },
    jwtSecret,
    { expiresIn: '5m' } // 5-minute window to complete MFA
  );
}

/**
 * Verify and decode an MFA challenge token.
 */
export function verifyMfaChallengeToken(token: string): {
  userId: string;
  email: string;
  organizationId: string;
  organizationUuid: string | null;
  role: string;
} | null {
  try {
    const decoded = verifyJwtWithRotation(token) as {
      userId: string;
      email: string;
      organizationId: string;
      organizationUuid: string | null;
      role: string;
      type: string;
    };

    if (decoded.type !== 'mfa_challenge') {
      return null;
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      organizationId: decoded.organizationId,
      organizationUuid: decoded.organizationUuid,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}
