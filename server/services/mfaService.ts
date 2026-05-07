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
import { db } from '../db';
import { eq } from 'drizzle-orm';
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

function getEncryptionKey(): Buffer {
  const envKey = process.env.MFA_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    // Use raw key or hash it to exactly 32 bytes
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Fallback: derive from JWT secret (not ideal, but functional)
  if (process.env.NODE_ENV === 'production') {
    console.error('[mfa] CRITICAL: MFA_ENCRYPTION_KEY not set in production. MFA secrets may be at risk.');
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('MFA_ENCRYPTION_KEY or JWT_SECRET must be set for MFA functionality');
  }
  console.warn('[mfa] MFA_ENCRYPTION_KEY not set — deriving from JWT_SECRET. Set MFA_ENCRYPTION_KEY for production.');
  return crypto.createHash('sha256').update(jwtSecret).digest();
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

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
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
 * Verify a TOTP token against a secret, with window tolerance.
 */
function verifyTOTPToken(secret: Buffer, token: string): boolean {
  const currentCounter = getTimeCounter();

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const expected = generateTOTP(secret, currentCounter + i);
    // Constant-time comparison to prevent timing attacks
    if (expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) {
      return true;
    }
  }

  return false;
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
  qrCodeDataUrl: string; // SVG-based QR code as a data URL
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

  // Generate a simple text-based QR representation
  // In production, the client can use a JS QR library (e.g., qrcode.react)
  // to render the otpauthUrl. We provide the URL for client-side rendering.
  const qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

  return {
    secret: secretBase32,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/**
 * Verify a 6-digit TOTP token for a user.
 * Returns true if the token is valid.
 */
export async function verifyToken(userId: number, token: string): Promise<boolean> {
  if (!token || token.length !== TOTP_DIGITS || !/^\d+$/.test(token)) {
    return false;
  }

  // Get encrypted secret from DB
  const [user] = await db
    .select({
      mfaSecret: users.mfaSecret,
      mfaEnabled: users.mfaEnabled,
      mfaBackupCodes: users.mfaBackupCodes,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.mfaSecret) {
    return false;
  }

  // Decrypt and decode the secret
  const secretBase32 = decrypt(user.mfaSecret);
  const secretBuffer = base32Decode(secretBase32);

  // Verify TOTP
  if (verifyTOTPToken(secretBuffer, token)) {
    return true;
  }

  // Check backup codes if MFA is enabled
  if (user.mfaEnabled && user.mfaBackupCodes) {
    const storedCodes = user.mfaBackupCodes as string[];
    const tokenHash = hashBackupCode(token);
    const codeIndex = storedCodes.findIndex(c => c === tokenHash);

    if (codeIndex >= 0) {
      // Remove used backup code
      const updatedCodes = [...storedCodes];
      updatedCodes.splice(codeIndex, 1);
      await db
        .update(users)
        .set({ mfaBackupCodes: updatedCodes })
        .where(eq(users.id, userId));
      return true;
    }
  }

  return false;
}

export async function detectVerificationMethod(
  userId: number,
  token: string
): Promise<'totp' | 'backup_code' | null> {
  if (!token) {
    return null;
  }

  const normalizedToken = token.replace(/-/g, '').toUpperCase();

  // Backup codes are alphanumeric; TOTP codes are strictly numeric.
  if (!/^\d+$/.test(token)) {
    const [user] = await db
      .select({
        mfaEnabled: users.mfaEnabled,
        mfaBackupCodes: users.mfaBackupCodes,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.mfaEnabled || !user.mfaBackupCodes) {
      return null;
    }

    const storedCodes = user.mfaBackupCodes as string[];
    const tokenHash = hashBackupCode(normalizedToken);
    return storedCodes.some(code => code === tokenHash) ? 'backup_code' : null;
  }

  const [user] = await db
    .select({
      mfaSecret: users.mfaSecret,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.mfaSecret) {
    return null;
  }

  try {
    const secretBase32 = decrypt(user.mfaSecret);
    const secretBuffer = base32Decode(secretBase32);
    return verifyTOTPToken(secretBuffer, token) ? 'totp' : null;
  } catch {
    return null;
  }
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
    const jwtSecret = requireJwtSecret();

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as {
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
