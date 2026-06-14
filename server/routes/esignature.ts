/**
 * Electronic Signature Routes — 21 CFR Part 11 backend.
 *
 * Powers the `ElectronicSignature` UI in `client/src/portal-v2/components/security/`.
 * Today the UI verifies password/MFA in-browser with a placeholder check —
 * this router replaces that with real server-side verification and persists
 * the signed event to `electronic_signatures` so the audit trail is real.
 *
 * Surface:
 *   POST /api/esignature/verify-password  — verify current user's password
 *   POST /api/esignature/verify-mfa       — verify TOTP / MFA code
 *   POST /api/esignature/sign             — record a complete e-signature event
 *
 * Each verify endpoint takes nothing the password hash leaks back through —
 * the bcrypt comparison happens server-side and only `{ valid: boolean }`
 * returns. The sign endpoint expects both verify steps to have succeeded
 * client-side and writes the audit row + emits the signed event.
 *
 * Auth: all endpoints require a valid session (req.user / req.userId).
 * Tenant: writes are scoped to the user's organization where applicable.
 *
 * @module server/routes/esignature
 */

import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { pool } from '../db.js';
import { verifyToken as verifyMfaToken, isMfaEnabled } from '../services/mfaService.js';
import auditService from '../services/auditService';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function loadUserPasswordHash(userId: number): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.password_hash || null;
  } catch (err: any) {
    // Schema drift / table missing — fail closed.
    if (err?.code !== '42P01') {
      console.warn('[esignature] password lookup failed:', err?.message);
    }
    return null;
  }
}

/**
 * POST /api/esignature/verify-password
 * Body: { password: string }
 * Response: { valid: boolean }
 *
 * Verifies the current session-user's password without ever returning the
 * stored hash. 21 CFR Part 11 §11.200(a)(1)(i) — at least one component of
 * the e-signature must use a password.
 */
router.post('/verify-password', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ valid: false, error: 'AUTH_REQUIRED' });
  }
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ valid: false, error: 'PASSWORD_REQUIRED' });
  }
  const hash = await loadUserPasswordHash(userId);
  if (!hash) {
    // Don't differentiate "no user" from "no hash" to outside callers.
    return res.json({ valid: false });
  }
  try {
    const valid = await bcrypt.compare(password, hash);
    return res.json({ valid });
  } catch (err: any) {
    console.warn('[esignature] bcrypt compare failed:', err?.message);
    return res.json({ valid: false });
  }
});

/**
 * POST /api/esignature/verify-mfa
 * Body: { token: string }   // 6-digit TOTP from authenticator app
 * Response: { valid: boolean }
 *
 * 21 CFR Part 11 §11.200(a)(1)(ii) — second factor for the e-signature.
 * Reuses the same TOTP verifier as login MFA so seeds and clock skew
 * tolerance are identical.
 */
router.post('/verify-mfa', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ valid: false, error: 'AUTH_REQUIRED' });
  }
  const { token } = req.body ?? {};
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) {
    return res.status(400).json({ valid: false, error: 'TOKEN_FORMAT_INVALID' });
  }
  try {
    const valid = await verifyMfaToken(userId, token);
    return res.json({ valid });
  } catch (err: any) {
    console.warn('[esignature] MFA verify failed:', err?.message);
    return res.json({ valid: false });
  }
});

/**
 * POST /api/esignature/sign
 * Body: {
 *   documentId: number,
 *   versionId: number,
 *   signaturePurpose: string,    // "approval" | "review" | "verification" | …
 *   signatureMeaning: string,    // human-readable declaration text
 *   action: string,              // "approved" | "reviewed" | "rejected" | …
 *   password: string,            // re-authenticated server-side (Part 11 §11.200)
 *   mfaToken?: string,           // required when the signer has MFA enabled
 *   complianceStatement?: string,
 *   legalDisclaimer?: string,
 *   deviceInfo?: object,
 * }
 * Response: { signatureId: number, signatureHash: string, signedAt: string }
 *
 * Records a complete e-signature event in `electronic_signatures` with the
 * server-computed hash, IP, and timestamp. 21 CFR Part 11 §11.200(a)(1): the
 * signature components (password + MFA when enabled) are RE-VERIFIED here
 * server-side at the moment of signing — the endpoint NEVER trusts a
 * client-supplied "already verified" flag. The audit-trail write is awaited and
 * a failure fails the whole signing request (no signature without an audit row).
 */
router.post('/sign', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }
  const {
    documentId,
    versionId,
    signaturePurpose,
    signatureMeaning,
    action,
    password,
    mfaToken,
    complianceStatement,
    legalDisclaimer,
    deviceInfo,
    signatureType,
    signerTitle,
  } = req.body ?? {};

  if (!Number.isFinite(Number(documentId)) || !Number.isFinite(Number(versionId))) {
    return res.status(400).json({ error: 'documentId and versionId are required (numeric)' });
  }
  if (typeof signaturePurpose !== 'string' || !signaturePurpose) {
    return res.status(400).json({ error: 'signaturePurpose is required' });
  }
  if (typeof action !== 'string' || !action) {
    return res.status(400).json({ error: 'action is required' });
  }

  // 21 CFR Part 11 §11.200(a)(1): RE-VERIFY the signer's identity server-side at
  // the moment of signing. We never trust a client-supplied "already verified"
  // flag — the password (first factor) and, when the user has MFA enabled, the
  // TOTP/backup code (second factor) are checked here against stored credentials.
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'password is required to sign (Part 11 §11.200)' });
  }
  const passwordHash = await loadUserPasswordHash(userId);
  let passwordVerified = false;
  if (passwordHash) {
    try {
      passwordVerified = await bcrypt.compare(password, passwordHash);
    } catch (err: any) {
      console.warn('[esignature] bcrypt compare failed during sign:', err?.message);
      passwordVerified = false;
    }
  }
  if (!passwordVerified) {
    return res.status(401).json({ error: 'Signature rejected: password verification failed (§11.200)' });
  }

  // Second factor: required only when the signer actually has MFA enabled. When
  // enabled, the server must verify the supplied token — a missing/invalid token
  // (or any failure of the MFA service) fails closed.
  let mfaRequired = false;
  let secondFactorVerified = false;
  try {
    mfaRequired = await isMfaEnabled(userId);
  } catch (err: any) {
    // Cannot determine MFA state → fail closed rather than skip the factor.
    console.warn('[esignature] isMfaEnabled check failed:', err?.message);
    return res.status(401).json({ error: 'Signature rejected: unable to verify second factor (§11.200)' });
  }
  if (mfaRequired) {
    if (typeof mfaToken !== 'string' || !/^\d{6}$/.test(mfaToken)) {
      return res.status(400).json({ error: 'mfaToken (6 digits) is required to sign; MFA is enabled for this account (§11.200)' });
    }
    try {
      secondFactorVerified = await verifyMfaToken(userId, mfaToken);
    } catch (err: any) {
      console.warn('[esignature] MFA verify failed during sign:', err?.message);
      secondFactorVerified = false;
    }
    if (!secondFactorVerified) {
      return res.status(401).json({ error: 'Signature rejected: second-factor verification failed (§11.200)' });
    }
  }

  // Server-derived validity — never a client boolean. Both required factors
  // passed by the time we get here.
  const signatureIsValid = passwordVerified && (!mfaRequired || secondFactorVerified);

  // Load signer profile so signer_name / signer_email are denormalised on
  // the signature row (required for offline audit reproduction per Part 11).
  const session = (req as any).user ?? {};
  let signerName: string = session.name ?? '';
  let signerEmail: string = session.email ?? '';
  try {
    const u = await pool.query(
      `SELECT name, email FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (u.rows[0]) {
      signerName = signerName || u.rows[0].name || '';
      signerEmail = signerEmail || u.rows[0].email || '';
    }
  } catch (err: any) {
    if (err?.code !== '42P01') {
      console.warn('[esignature] signer lookup failed:', err?.message);
    }
  }
  if (!signerEmail) {
    return res.status(400).json({ error: 'signer email not resolvable from session' });
  }

  const signedAt = new Date();
  const ipAddress: string | undefined =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined;

  // Deterministic content hash (the bytes a regulator would re-derive to
  // verify integrity). Includes everything that defines the signing event;
  // does NOT include the password or MFA token.
  const signatureHash = createHash('sha256')
    .update(
      JSON.stringify({
        documentId: Number(documentId),
        versionId: Number(versionId),
        signaturePurpose,
        signatureMeaning: signatureMeaning ?? null,
        action,
        signerId: userId,
        signerEmail,
        signedAt: signedAt.toISOString(),
      })
    )
    .digest('hex');

  try {
    const result = await pool.query(
      `INSERT INTO electronic_signatures (
         document_id, version_id, signature_type, signature_purpose,
         signer_id, signer_name, signer_title, signer_email,
         authentication_method, authentication_timestamp, second_factor_verified,
         signature_hash, signature_meaning, signature_manifest,
         is_valid, compliance_statement, legal_disclaimer,
         ip_address, device_info, signed_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         'password+totp', $9, $10,
         $11, $12, $13,
         $18, $14, $15,
         $16, $17, $9
       ) RETURNING id, signed_at`,
      [
        Number(documentId),
        Number(versionId),
        signatureType || 'approval',
        signaturePurpose,
        userId,
        signerName,
        signerTitle ?? null,
        signerEmail,
        signedAt,
        secondFactorVerified,
        signatureHash,
        signatureMeaning ?? null,
        JSON.stringify({ action, deviceInfo: deviceInfo ?? null }),
        complianceStatement ?? null,
        legalDisclaimer ?? null,
        ipAddress,
        deviceInfo ? JSON.stringify(deviceInfo) : null,
        signatureIsValid,
      ]
    );

    // 21 CFR Part 11 §11.10(e): every signing event lands in the central
    // audit trail in addition to the electronic_signatures row. The signature
    // hash is included so an auditor can correlate the two tables.
    //
    // The audit write is AWAITED before we report success: a signing action
    // whose audit record fails must NOT be reported as signed (no signature
    // without a corresponding, durable audit-trail entry). If it throws we fail
    // the request — the response below is never reached.
    try {
      await auditService.logAction({
        tenantId: (req as any).user?.organizationId ?? null,
        userId,
        action: 'esignature.sign',
        resourceType: 'electronic_signature',
        resourceId: String(result.rows[0].id),
        ipAddress: ipAddress ?? undefined,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          documentId: Number(documentId),
          versionId: Number(versionId),
          signaturePurpose,
          signatureMeaning: signatureMeaning ?? null,
          action,
          signatureHash,
          secondFactorVerified,
        },
      });
    } catch (auditErr: any) {
      console.error('[esignature] CRITICAL: audit write failed for signature', result.rows[0].id, '-', auditErr?.message);
      return res.status(500).json({
        error: 'Signature could not be recorded in the audit trail; signing aborted.',
        code: 'ESIGNATURE_AUDIT_FAILED',
      });
    }

    return res.status(201).json({
      signatureId: result.rows[0].id,
      signatureHash,
      signedAt: result.rows[0].signed_at?.toISOString?.() ?? signedAt.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === '42P01') {
      // Schema not migrated. Refuse signing rather than pretend it succeeded.
      console.warn('[esignature] electronic_signatures table missing');
      return res.status(503).json({
        error: 'E-signature schema not present — run migrations before signing.',
        code: 'ESIGNATURE_SCHEMA_MISSING',
      });
    }
    console.error('[esignature] sign insert failed:', err?.message);
    return res.status(500).json({ error: 'Failed to record signature' });
  }
});

export default router;
