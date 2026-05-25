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
import { verifyToken as verifyMfaToken } from '../services/mfaService.js';
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
 *   secondFactorVerified?: boolean,
 *   complianceStatement?: string,
 *   legalDisclaimer?: string,
 *   deviceInfo?: object,
 * }
 * Response: { signatureId: number, signatureHash: string, signedAt: string }
 *
 * Records a complete e-signature event in `electronic_signatures` with the
 * server-computed hash, IP, and timestamp. Caller must have already passed
 * verify-password and verify-mfa for the same flow — this endpoint trusts
 * those checks and focuses on durability + audit-trail integrity.
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
    secondFactorVerified,
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
  const ipAddress =
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
         true, $14, $15,
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
        Boolean(secondFactorVerified),
        signatureHash,
        signatureMeaning ?? null,
        JSON.stringify({ action, deviceInfo: deviceInfo ?? null }),
        complianceStatement ?? null,
        legalDisclaimer ?? null,
        ipAddress,
        deviceInfo ? JSON.stringify(deviceInfo) : null,
      ]
    );

    // 21 CFR Part 11 §11.10(e): every signing event lands in the central
    // audit trail in addition to the electronic_signatures row. The signature
    // hash is included so an auditor can correlate the two tables.
    void auditService.logAction({
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
        secondFactorVerified: Boolean(secondFactorVerified),
      },
    });

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
