/**
 * Field-Level PII/PHI Encryption Utility
 *
 * A REUSABLE, general-purpose helper for encrypting individual database
 * field values (diagnosis codes, patient demographics, biomarkers, SSN/DOB/MRN,
 * etc.) at rest. This does NOT replace the existing purpose-specific crypto in
 * `server/services/mfaService.ts` (TOTP secrets) or
 * `server/services/integrations/credentialVault.ts` (integration secrets) —
 * it reuses the SAME established scheme (AES-256-GCM, random 12-byte IV,
 * appended auth tag) so there is one crypto approach across the platform.
 *
 * Serialization format (self-describing + versioned so mixed plaintext /
 * ciphertext can be safely round-tripped during a column migration):
 *
 *   enc:v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * ── NOT IN USE. READ BEFORE CITING THIS FILE ──────────────────────────────────
 * This module has ZERO production call sites. It is imported by exactly one
 * file — its own test. No customer field, PII, PHI or regulatory content is
 * encrypted with it today, and `PII_ENCRYPTION_KEY` is not provisioned in
 * `.env.example`, so a caller wired up right now would throw at boot in
 * production by design.
 *
 * The note matters because the annotation below used to read as an unqualified
 * compliance claim. A HIPAA "encryption at rest" citation attached to a module
 * that encrypts nothing is exactly the finding a customer security audit is
 * looking for, and it is the same defect this codebase has now found three
 * times: `organizations.status` before the lifecycle guard, `organizations.
 * max_storage` before the storage quota, and this. The artefact is good; it is
 * simply not connected to anything.
 *
 * Encryption at rest in production TODAY comes from the managed database's
 * disk-level encryption — where the operator holds the key. That is a hosting
 * property, not an application one, and it is not BYOK.
 *
 * Keeping this file is deliberate: it is the natural foundation for the envelope
 * scheme in ADR-0012 (R2.1), whose `enc:v2` format adds the `key_id` this one
 * lacks. See docs/adr/0012-tenant-key-custody-and-data-residency.md.
 *
 * @compliance Implements the AES-256-GCM primitive required by HIPAA 45 CFR
 *             164.312(a)(2)(iv) and FDA 21 CFR Part 11 (data integrity via GCM
 *             authentication). NOT EVIDENCE of encryption at rest: see the note
 *             above — this module has no production call sites.
 * @version 1.0.0
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Format constants
// ---------------------------------------------------------------------------

/** Scheme + version prefix. `isEncrypted()` keys off this. */
const ENC_PREFIX = 'enc:v1';

/** AES-256-GCM IV length (96-bit / 12-byte IV is the GCM standard). */
const IV_LENGTH = 12;

/** AES-256-GCM auth tag length (128-bit). */
const AUTH_TAG_LENGTH = 16;

// ---------------------------------------------------------------------------
// Key management
//
// Mirrors the production fail-closed discipline in
// `server/services/integrations/credentialVault.ts::getEncryptionKey()`:
// production MUST supply a real key and we refuse to fall back to a hardcoded
// literal so encrypted PII/PHI cannot be trivially decrypted by anyone with
// code access. A derived dev key is allowed ONLY outside production and is
// logged loudly on first use.
// ---------------------------------------------------------------------------

/** Dedicated env var for this utility. */
const KEY_ENV_VAR = 'PII_ENCRYPTION_KEY';

/**
 * Dev-only fallback literal. NEVER reached in production (we throw first).
 * Kept obviously non-secret so it can't be mistaken for a real key.
 */
const DEV_FALLBACK_SECRET = 'dev-pii-field-encryption-key-change-me';

let devFallbackWarned = false;

/**
 * Derive the 32-byte AES-256 key. SHA-256 of the configured secret — the same
 * KDF used by credentialVault and mfaService, so key material is handled
 * identically across the platform (no bespoke stretching to get wrong).
 */
function getEncryptionKey(): Buffer {
  const fromEnv = process.env[KEY_ENV_VAR];

  // Production must supply a real key. Refuse the hardcoded fallback — see
  // credentialVault.ts for the pattern this mirrors.
  if (!fromEnv && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Field-level PII/PHI encryption requires ${KEY_ENV_VAR} in production. ` +
        'Refusing to use a hardcoded fallback.'
    );
  }

  if (!fromEnv && !devFallbackWarned) {
    devFallbackWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[field-encryption] ${KEY_ENV_VAR} not set — deriving a NON-SECRET development key. ` +
        'Set a real key before handling any production PII/PHI.'
    );
  }

  const raw = fromEnv || DEV_FALLBACK_SECRET;
  return crypto.createHash('sha256').update(raw).digest();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if `value` is a payload produced by `encryptField()`
 * (i.e. carries the `enc:v1:` prefix). Lets callers dual-read mixed
 * plaintext / ciphertext columns during migration without throwing.
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${ENC_PREFIX}:`);
}

/**
 * Encrypt a single field value with AES-256-GCM.
 *
 * - Random 12-byte IV per value (identical plaintexts yield different output).
 * - Auth tag appended so tampering is detected on decrypt.
 * - Empty string and null/undefined pass through unchanged: there is nothing
 *   sensitive to protect and a NULL/'' column stays NULL/'' for the DB. Callers
 *   migrating a column therefore don't have to special-case empties.
 */
export function encryptField(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (plaintext === '') return '';

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      ENC_PREFIX,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  } catch (err) {
    // Never surface plaintext (or its length/content) in the error.
    throw new Error(
      `Field encryption failed: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}

/**
 * Decrypt a payload produced by `encryptField()`.
 *
 * - Empty string and null/undefined pass through unchanged (symmetric with
 *   `encryptField`).
 * - Throws clearly if the value is not an `enc:v1:` payload — callers that may
 *   see mixed data should gate on `isEncrypted()` first.
 * - A tampered IV / auth tag / ciphertext fails GCM authentication and throws;
 *   no partial or unauthenticated plaintext is ever returned.
 */
export function decryptField(payload: string | null | undefined): string | null | undefined {
  if (payload === null || payload === undefined) return payload;
  if (payload === '') return '';

  if (!isEncrypted(payload)) {
    throw new Error(
      `Value is not an encrypted field payload (missing "${ENC_PREFIX}:" prefix). ` +
        'Use isEncrypted() to guard mixed plaintext/ciphertext data.'
    );
  }

  // Format: enc:v1:<iv>:<tag>:<ciphertext> — split into exactly the tail parts
  // so ciphertext (which cannot contain ':') is not accidentally re-joined.
  const parts = payload.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted field payload: unexpected segment count.');
  }

  const [, , ivB64, tagB64, dataB64] = parts;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(dataB64, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('invalid IV or auth tag length');
    }

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(), // throws if the auth tag does not verify
    ]);
    return plaintext.toString('utf8');
  } catch (err) {
    // Generic message — do not leak key material, ciphertext, or plaintext.
    throw new Error(
      `Field decryption failed: ${err instanceof Error ? err.message : 'authentication failed'}`
    );
  }
}
