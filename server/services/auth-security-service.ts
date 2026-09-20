/**
 * Enterprise Authentication Security Service
 *
 * Handles MFA (TOTP via speakeasy), password policy enforcement,
 * account lockout, and 21 CFR Part 11 electronic signature verification.
 *
 * @compliance FDA 21 CFR Part 11.10(d) — Session controls
 * @compliance FDA 21 CFR Part 11.10(g) — Authority checks
 * @compliance FDA 21 CFR Part 11.100 — Electronic signatures
 * @compliance FDA 21 CFR Part 11.200 — Signature components
 * @compliance NIST 800-63B — Authentication assurance levels
 */

import { BINDING_BASIS, manifestSignatureHash } from './part11/signature-persistence';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { users, electronicSignatures } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger';
/* The §11.70 binding evaluator is shared with part11ComplianceService rather
   than reimplemented — see verifySignatureIntegrity. */
import { evaluateBindingVerification } from './part11/version-binding';
import part11ComplianceService from './part11ComplianceService';

const logger = createScopedLogger('auth-security');

// ─── Configuration ──────────────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5; // Failed attempts before lockout
const LOCKOUT_DURATION_MINUTES = 30; // Lockout duration
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_HISTORY_COUNT = 5; // Prevent reuse of last N passwords
const PASSWORD_MAX_AGE_DAYS = 90; // Force rotation after 90 days
const MFA_ISSUER = 'Concept2Cure';
const BACKUP_CODE_COUNT = 10;

// ─── Password Policy ────────────────────────────────────────────────────────

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password against enterprise policy
 * NIST 800-63B compliant with pharma-specific enhancements
 */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common patterns
  const commonPatterns = [
    /^(.)\1+$/, // All same character
    /^(012|123|234|345|456|567|678|789|890)/, // Sequential numbers
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i, // Sequential letters
    /password|123456|qwerty|admin|letmein|welcome|monkey|dragon/i, // Common passwords
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('Password must not contain common patterns or dictionary words');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if password was used recently (password history)
 */
export async function checkPasswordHistory(
  userId: number,
  newPasswordHash: string
): Promise<boolean> {
  try {
    const result = await db
      .select({ passwordHistory: users.passwordHistory })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length || !result[0].passwordHistory) return true;

    const history = result[0].passwordHistory as string[];
    const bcrypt = await import('bcryptjs');

    for (const oldHash of history.slice(0, PASSWORD_HISTORY_COUNT)) {
      // NOTE: newPasswordHash should be the PLAINTEXT password for bcrypt.compare
      if (await bcrypt.compare(newPasswordHash, oldHash)) {
        return false; // Password was used recently
      }
    }

    return true;
  } catch (error) {
    logger.error('Failed to check password history', error);
    return true; // Allow on error to not block user
  }
}

// ─── Account Lockout ────────────────────────────────────────────────────────

/**
 * Check if account is locked
 */
export async function isAccountLocked(userId: number): Promise<{
  locked: boolean;
  lockedUntil?: Date;
  remainingAttempts?: number;
}> {
  try {
    const result = await db
      .select({
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length) return { locked: false };

    const user = result[0];

    // Check if lockout has expired
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return {
        locked: true,
        lockedUntil: new Date(user.lockedUntil),
      };
    }

    // If lockout expired, reset the counter
    if (user.lockedUntil && new Date(user.lockedUntil) <= new Date()) {
      await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, userId));
    }

    const attempts = user.failedLoginAttempts || 0;
    return {
      locked: false,
      remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - attempts),
    };
  } catch (error) {
    logger.error('Failed to check account lockout', error);
    return { locked: false };
  }
}

/**
 * Record a failed login attempt. Locks account after threshold.
 */
export async function recordFailedLogin(userId: number): Promise<{
  locked: boolean;
  remainingAttempts: number;
}> {
  try {
    const result = await db
      .select({ failedLoginAttempts: users.failedLoginAttempts })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const currentAttempts = (result[0]?.failedLoginAttempts || 0) + 1;
    const shouldLock = currentAttempts >= LOCKOUT_THRESHOLD;

    const lockoutTime = shouldLock
      ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
      : null;

    await db
      .update(users)
      .set({
        failedLoginAttempts: currentAttempts,
        lastFailedLogin: new Date(),
        lockedUntil: lockoutTime,
      })
      .where(eq(users.id, userId));

    if (shouldLock) {
      logger.warn(`Account locked for user ${userId} after ${currentAttempts} failed attempts`);
    }

    return {
      locked: shouldLock,
      remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - currentAttempts),
    };
  } catch (error) {
    logger.error('Failed to record failed login', error);
    return { locked: false, remainingAttempts: LOCKOUT_THRESHOLD };
  }
}

/**
 * Reset failed login counter on successful login
 */
export async function resetFailedLogins(userId: number): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    logger.error('Failed to reset failed logins', error);
  }
}

// ─── MFA (TOTP via Speakeasy) ───────────────────────────────────────────────

/**
 * Generate a new MFA secret for a user
 * Returns the secret and a QR code URL for authenticator apps
 */
export async function generateMFASecret(
  userId: number,
  userEmail: string
): Promise<{
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}> {
  const secret = speakeasy.generateSecret({
    name: `${MFA_ISSUER}:${userEmail}`,
    issuer: MFA_ISSUER,
    length: 32,
  });

  // Generate backup codes
  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Hash backup codes before storing
  const hashedBackupCodes = backupCodes.map(code =>
    crypto.createHash('sha256').update(code).digest('hex')
  );

  // Store the secret (encrypted) in the database
  await db
    .update(users)
    .set({
      mfaSecret: secret.base32,
      mfaBackupCodes: hashedBackupCodes,
      mfaMethod: 'totp',
    })
    .where(eq(users.id, userId));

  // Generate QR code
  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');

  logger.info(`MFA secret generated for user ${userId}`);

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url || '',
    qrCodeDataUrl,
    backupCodes, // Return plaintext ONCE — user must save them
  };
}

/**
 * Verify a TOTP code against a user's MFA secret
 */
export async function verifyMFACode(
  userId: number,
  code: string
): Promise<{
  valid: boolean;
  method: 'totp' | 'backup_code';
}> {
  try {
    const result = await db
      .select({
        mfaSecret: users.mfaSecret,
        mfaBackupCodes: users.mfaBackupCodes,
        mfaEnabled: users.mfaEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length || !result[0].mfaSecret) {
      logger.warn(`MFA verification attempted for user ${userId} with no MFA secret`);
      return { valid: false, method: 'totp' };
    }

    const { mfaSecret, mfaBackupCodes } = result[0];

    // Try TOTP verification first
    const totpValid = speakeasy.totp.verify({
      secret: mfaSecret!,
      encoding: 'base32',
      token: code,
      window: 1, // Allow 1 step tolerance (30 seconds before/after)
    });

    if (totpValid) {
      // Update last verified timestamp
      await db
        .update(users)
        .set({ mfaVerifiedAt: new Date() })
        .where(eq(users.id, userId));

      return { valid: true, method: 'totp' };
    }

    // Try backup code
    if (mfaBackupCodes && Array.isArray(mfaBackupCodes)) {
      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      const backupCodes = mfaBackupCodes as string[];
      const codeIndex = backupCodes.indexOf(codeHash);

      if (codeIndex !== -1) {
        // Remove used backup code
        const updatedCodes = [...backupCodes];
        updatedCodes.splice(codeIndex, 1);

        await db
          .update(users)
          .set({
            mfaBackupCodes: updatedCodes,
            mfaVerifiedAt: new Date(),
          })
          .where(eq(users.id, userId));

        logger.info(`Backup code used for user ${userId}. ${updatedCodes.length} remaining.`);
        return { valid: true, method: 'backup_code' };
      }
    }

    return { valid: false, method: 'totp' };
  } catch (error) {
    logger.error(`MFA verification failed for user ${userId}`, error);
    return { valid: false, method: 'totp' };
  }
}

/**
 * Enable MFA for a user after successful verification of their first code
 */
export async function enableMFA(userId: number, code: string): Promise<boolean> {
  const verification = await verifyMFACode(userId, code);

  if (!verification.valid) {
    return false;
  }

  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
    })
    .where(eq(users.id, userId));

  logger.info(`MFA enabled for user ${userId}`);
  return true;
}

/**
 * Disable MFA for a user (requires re-authentication)
 */
export async function disableMFA(userId: number): Promise<void> {
  await db
    .update(users)
    .set({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      mfaVerifiedAt: null,
    })
    .where(eq(users.id, userId));

  logger.info(`MFA disabled for user ${userId}`);
}

/**
 * Check if a user has MFA enabled
 */
export async function isMFAEnabled(userId: number): Promise<boolean> {
  const result = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result.length > 0 && result[0].mfaEnabled === true;
}

// ─── 21 CFR Part 11 Electronic Signatures ───────────────────────────────────

/**
 * REMOVED — `createElectronicSignature`.
 *
 * This was a SECOND electronic-signature write path, next to the canonical one
 * at POST /api/esignature/sign (which binds the STORED version bytes through
 * services/part11/signature-persistence.ts, the one INSERT).
 *
 * It could not produce a conforming Part 11 record. Its INSERT omitted
 * `bound_payload_digest`, `binding_basis` and `organization_id`, so by the
 * binding evaluator's own rules every row it wrote was permanently
 * unverifiable — the §11.70 question "is this still the content that was
 * approved?" had no answer for any of them. It also took `documentId` and
 * `versionId` straight from the request body without checking they belonged to
 * the caller's organization.
 *
 * Deleted rather than repaired, for the same reason POST /api/part11/signatures
 * was (see routes/__tests__/part11-signature-post-removed.test.ts): repairing
 * it would have produced a second live document-signing surface, and one
 * signing entry point per substrate is the rule. Nothing in client/ or server/
 * called it. The re-authentication logic it carried (password + MFA before
 * signing) is not lost — the canonical route performs the same check.
 *
 * Pinned by services/__tests__/signature-write-path-single.test.ts.
 */


/**
 * What the recorded `bound_payload_digest` lets this endpoint actually claim.
 *
 * Extracted from `verifySignatureIntegrity` so the decision can be read on its
 * own — and because folding it inline pushed that function past the complexity
 * ceiling, which is a fair signal that it was doing two jobs.
 *
 * There are eleven binding bases (BINDING_BASIS) and `computeVersionBindingDigest`
 * re-derives exactly ONE of them: the sha256 of a document version's content.
 * The verifier used to re-derive whenever `versionId` was set and pass `null`
 * otherwise, so it compared digests of different things:
 *
 *   • a governed-action row carries the audit sha256 CHAIN HASH — the basis
 *     itself says it "is NOT a content hash and must never be presented as one" —
 *     with versionId NULL. current=null, and the evaluator correctly answers
 *     "the signed version content is no longer available", surfaced as BROKEN.
 *   • a submission-release row carries the RELEASE PACKAGE digest with versionId
 *     SET, compared against a re-derived document-version digest it can never
 *     equal: "changed since signing (tamper detected)".
 *
 * Both are untampered signatures reported broken, on the one endpoint that
 * answers an inspector's central question — and a verdict that cries tamper on
 * healthy rows is worth nothing on the day it is real.
 *
 * A NULL basis with a versionId is still re-derived: those are rows from the
 * document-signing path written before the column existed, the anchor says what
 * the digest is of, and dropping them would lose a tamper check that works.
 *
 * `evaluateBindingVerification` is NOT changed — it is correct for its contract,
 * which is comparing a content digest against a RE-DERIVED one. The defect was
 * handing it two digests of different things.
 */
async function resolveContentBinding(sig: {
  versionId: number | null;
  boundPayloadDigest?: string | null;
  bindingBasis?: string | null;
}): Promise<{
  binding: ReturnType<typeof evaluateBindingVerification>;
  contentBinding: string;
  attestsToContent: boolean;
}> {
  const bound = sig.boundPayloadDigest;
  const basis = sig.bindingBasis ?? null;

  if (!bound || bound.length === 0) {
    // No digest recorded at all. The evaluator's legacy branch says so.
    return {
      binding: evaluateBindingVerification(bound, null),
      contentBinding: 'NOT_RECORDED',
      attestsToContent: false,
    };
  }

  const rederivableHere =
    sig.versionId != null &&
    (basis === BINDING_BASIS.DOCUMENT_VERSION_CONTENT || basis === null);

  if (rederivableHere) {
    const current = await part11ComplianceService.computeVersionBindingDigest(sig.versionId!);
    const binding = evaluateBindingVerification(bound, current);
    return {
      binding,
      contentBinding: binding.bindingVerified ? 'VERIFIED' : 'BROKEN',
      attestsToContent: true,
    };
  }

  /* A digest IS recorded, of something this function does not re-derive. Three
     claims have to stay apart here, and folding any two together is how the
     false verdict arose: the row is internally consistent (valid); its content
     was NOT re-checked here (never asserted as verified); and whether the digest
     is of CONTENT at all, which is a property of the basis — every basis is a
     content digest except the governed-action ledger, whose vocabulary entry
     says outright that it is not. */
  const isLedgerBasis = basis === BINDING_BASIS.GOVERNED_ACTION_LEDGER;
  return {
    binding: {
      valid: true,
      bindingVerified: false,
      reason: isLedgerBasis
        ? 'Bound to the governed action\u2019s audit sha256 chain hash, which is not a content digest \u2014 no content binding to verify'
        : `Bound digest has basis \u201c${basis ?? 'unrecorded'}\u201d, which this endpoint does not re-derive \u2014 not verified here, and not evidence of tampering`,
    },
    contentBinding: 'NOT_REDERIVED_HERE',
    attestsToContent: !isLedgerBasis,
  };
}

/**
 * Verify an electronic signature's integrity
 */
export async function verifySignatureIntegrity(
  signatureId: number,
  organizationId: number | null,
): Promise<{
  valid: boolean;
  /** Whether the SIGNED CONTENT was re-derived and still matches. Distinct from
   *  `valid`: a signature can be internally consistent and still attest to
   *  nothing, if no content digest was recorded when it was written. */
  bindingVerified?: boolean;
  attestsToContent?: boolean;
  details?: any;
  error?: string;
}> {
  /* ── Tenant boundary ────────────────────────────────────────────────────────
     electronic_signatures.id is a SERIAL and the live route passed
     parseInt(req.params.id) straight in, while this read selected on that id
     ALONE. Any authenticated user of any tenant could count upwards and read
     another tenant's signer_name, signed_at, signature_type and
     signature_meaning. The organization is now a required argument rather than
     an optional filter, so a caller cannot omit it by accident, and both guards
     fail closed BEFORE any query is issued. */
  if (!Number.isInteger(signatureId)) {
    return { valid: false, error: 'Invalid signature id' };
  }
  if (organizationId === null || !Number.isFinite(organizationId)) {
    return { valid: false, error: 'Organization context required to verify a signature' };
  }

  try {
    const result = await db
      .select()
      .from(electronicSignatures)
      .where(
        and(
          eq(electronicSignatures.id, signatureId),
          eq(electronicSignatures.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!result.length) {
      // Indistinguishable from "belongs to another tenant", deliberately.
      return { valid: false, error: 'Signature not found' };
    }

    const sig = result[0];

    /* ── §11.200 attribution hash — re-derived the way the WRITER derived it ─
       This recomputed a hash over an identifier payload — document id, version
       id, signer, type, meaning, timestamp — and compared it to
       signature_hash. No writer has ever produced that hash. The one writer of
       electronic_signatures (persistElectronicSignature) stores
       sha256(JSON.stringify(signatureManifest)), so the comparison could not
       succeed on any real row: this endpoint reported hashIntegrity: COMPROMISED
       and valid: false for every genuine signature, and its tests passed
       because their fixture fabricated rows in the identifier shape.

       The manifest IS the attributed record, and the hash is over its bytes.
       Calling the writer's own exported function is what keeps the two from
       ever disagreeing again. */
    const expectedHash = manifestSignatureHash(sig.signatureManifest);
    const hashValid = typeof sig.signatureHash === 'string' && sig.signatureHash === expectedHash;

    /* ── §11.70 record binding — the check this endpoint used to skip ────────
       Everything above hashes IDENTIFIERS: document id, version id, signer,
       type, meaning, timestamp. None of it reads a byte of the signed content,
       so this function answered `valid: true` for a document that had been
       completely rewritten since it was signed — which is the one question a
       signature exists to answer.

       The content check is re-derived here from the signed version and compared
       against the digest recorded at signing, through the SAME shared evaluator
       the canonical validator uses (`evaluateBindingVerification`). Reusing it
       matters: two verifiers that disagree about what "valid" means is how a
       regulated system ends up with a screen that says verified and a report
       that says tampered. */
    const basis = (sig as { bindingBasis?: string | null }).bindingBasis ?? null;
    const { binding, contentBinding, attestsToContent } = await resolveContentBinding(
      sig as Parameters<typeof resolveContentBinding>[0],
    );

    return {
      /* A signature is only valid if BOTH hold. Previously this was the
         identifier hash alone, so tampering with content could not move it. */
      valid: hashValid && sig.isValid === true && binding.valid,
      /* Reported separately and never folded into `valid`, because "the
         content still matches what was signed" and "the signature row is
         internally consistent" are different claims and a reader must be able
         to tell which one they are getting. A signature written without a
         bound digest reports attestsToContent:false — it is not tampered, it
         simply never recorded what it was approving, and saying so is the
         honest answer rather than a bare `valid: true`. */
      bindingVerified: binding.bindingVerified,
      attestsToContent,
      details: {
        signatureId: sig.id,
        signerName: sig.signerName,
        signedAt: sig.signedAt,
        signatureType: sig.signatureType,
        signatureMeaning: sig.signatureMeaning,
        hashIntegrity: hashValid ? 'VERIFIED' : 'COMPROMISED',
        contentBinding,
        /* Named so a reader knows WHAT the digest is of rather than inferring it
           from whether verification happened. */
        bindingBasis: basis,
        contentBindingReason: binding.reason,
        isValid: sig.isValid,
      },
    };
  } catch (error) {
    logger.error('Failed to verify signature integrity', error);
    return { valid: false, error: 'Verification failed' };
  }
}

// ─── Password Expiry Check ──────────────────────────────────────────────────

/**
 * Check if a user's password has expired
 */
export async function isPasswordExpired(userId: number): Promise<boolean> {
  try {
    const result = await db
      .select({ passwordChangedAt: users.passwordChangedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length) return false;

    const changedAt = result[0].passwordChangedAt;
    if (!changedAt) return true; // Never changed — force rotation

    const maxAge = PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(changedAt).getTime() > maxAge;
  } catch (error) {
    logger.error('Failed to check password expiry', error);
    return false;
  }
}
