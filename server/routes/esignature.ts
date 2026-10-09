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
import { resolveSignerIdentity } from '../services/part11/resolve-signer-identity.js';
import { createHash } from 'crypto';
import { pool } from '../db.js';
import { isTokenCurrentlyAcceptable, isMfaEnabled } from '../services/mfaService.js';
import { signingAttemptLimiter } from '../middleware/signing-attempt-limiter';
import { writeChainedAuditRow } from '../services/auditService';
import { buildVersionBindingDigest } from '../services/part11/version-binding.js';
import { isSigningAuthorized } from '../services/part11/signing-authority';
import { reverifySigner, verifySignerPassword } from '../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps.js';
import { ACCOUNT_INACTIVE_MESSAGE } from '../services/account-standing.js';
import {
  persistElectronicSignature,
  BINDING_BASIS,
} from '../services/part11/signature-persistence.js';
import { clientIpOf } from '../utils/client-ip.js';
import { resolveUserRole } from '../types/auth-request';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The two pre-checks answer "is this credential right?" without signing
 * anything, so each is a guessing oracle for whoever holds the session. Each is
 * limited per signer with its own budget (middleware/signing-attempt-limiter,
 * shared with the protocol signing routes). Until 2026-09-23 neither was limited
 * beyond the global per-session API budget (600 a minute).
 */
function signerCheckLimiter(check: 'password' | 'mfa') {
  return signingAttemptLimiter(`esign-verify-${check}`, { valid: false, error: 'TOO_MANY_ATTEMPTS' });
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
router.post('/verify-password', signerCheckLimiter('password'), async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ valid: false, error: 'AUTH_REQUIRED' });
  }
  const { password } = req.body ?? {};
  // The signing path's own first factor (services/part11/reverify-signer.ts),
  // so a wrong password here counts against the account's lockout exactly as it
  // does at signing and at sign-in, and a locked account is told so without its
  // password being compared (F-27). It compared on its own before, and a guess
  // here counted for nothing. "No user" and "no hash" still read as invalid.
  const first = await verifySignerPassword(userId, password, signerReverificationDeps());
  if (!first.ok) {
    if (first.code === 'PASSWORD_REQUIRED') {
      return res.status(400).json({ valid: false, error: 'PASSWORD_REQUIRED' });
    }
    if (first.code === 'ACCOUNT_LOCKED') {
      return res.status(423).json({
        valid: false,
        error: 'ACCOUNT_LOCKED',
        message: 'This account is locked after repeated failed attempts. Try again later.',
      });
    }
    // Suspended or deprovisioned (F-28): refused before its password is compared.
    if (first.code === 'ACCOUNT_INACTIVE') {
      return res.status(403).json({ valid: false, error: 'ACCOUNT_INACTIVE', message: ACCOUNT_INACTIVE_MESSAGE });
    }
    return res.json({ valid: false });
  }
  const valid = true;
  // Only after the password verified: whether the signer has a second factor
  // enrolled, which every signing endpoint then requires (§11.200). The e-sign
  // modal asks for the code on this answer instead of sending a signature the
  // server will refuse. When the state cannot be read it is left out, and the
  // signing endpoint refuses the signature on the same uncertainty.
  const mfaRequired = await isMfaEnabled(userId).catch(() => undefined);
  return res.json(mfaRequired === undefined ? { valid } : { valid, mfaRequired });
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
router.post('/verify-mfa', signerCheckLimiter('mfa'), async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ valid: false, error: 'AUTH_REQUIRED' });
  }
  const { token } = req.body ?? {};
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) {
    return res.status(400).json({ valid: false, error: 'TOKEN_FORMAT_INVALID' });
  }
  try {
    // The account's allowance, as the signing path keeps it (F-27): a locked
    // account's code is not checked, and a wrong code counts.
    const allowance = signerReverificationDeps();
    // An account out of use has no code to check (F-28), as at signing.
    if (!(await allowance.isAccountActive(userId))) {
      return res.status(403).json({ valid: false, error: 'ACCOUNT_INACTIVE', message: ACCOUNT_INACTIVE_MESSAGE });
    }
    if (await allowance.isAccountLocked(userId)) {
      return res.status(423).json({
        valid: false,
        error: 'ACCOUNT_LOCKED',
        message: 'This account is locked after repeated failed attempts. Try again later.',
      });
    }
    // A CHECK, not a use: the modal sends this same code to the signing
    // endpoint next, which consumes it (reverifySigner -> verifyToken). A code
    // already used — at sign-in, or for an earlier signature — reads invalid
    // here, as it would there.
    const valid = await isTokenCurrentlyAcceptable(userId, token);
    if (!valid) await allowance.recordFailedAttempt(userId);
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

  // 21 CFR Part 11 §11.10(g): identity is not authority. Even a fully
  // re-authenticated signer (password + MFA below) may apply a signature only
  // if their organization role carries signing authority. The policy lives in
  // server/services/part11/signing-authority (the single source of truth every
  // signing route shares).
  const signerRole = resolveUserRole(req);
  if (!isSigningAuthorized(signerRole)) {
    return res.status(403).json({
      error: 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)).',
      code: 'ESIGNATURE_NO_AUTHORITY',
    });
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
    // signerTitle is intentionally NOT read from the request body: a signer must
    // not be able to assert an arbitrary credential/authority (e.g. "Chief
    // Medical Officer") into the immutable §11.50 manifestation. It is resolved
    // server-side from the signer's own users row below.
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

  // signature_type is client-supplied and lands in a column the release-gate
  // uniqueness index keys on. Accept only the document-signing vocabulary and
  // RESERVE 'submission-release' for the orchestrator release path
  // (server/routes/submission-sign-release.ts) — a document signer must not be
  // able to mint a row that masquerades as a release signature. Default
  // 'approval' when omitted, matching the historical behaviour.
  const DOCUMENT_SIGNATURE_TYPES = new Set([
    'approval', 'review', 'witness', 'acknowledgment', 'verification',
  ]);
  const resolvedSignatureType =
    signatureType === undefined || signatureType === null || signatureType === ''
      ? 'approval'
      : signatureType;
  if (!DOCUMENT_SIGNATURE_TYPES.has(resolvedSignatureType)) {
    return res.status(400).json({
      error: 'signatureType must be one of: approval, review, witness, acknowledgment, verification',
      code: 'ESIGNATURE_TYPE_INVALID',
    });
  }

  /* 21 CFR Part 11 §11.200(a)(1): RE-VERIFY the signer's identity server-side at
     the moment of signing — the password, and the second factor when enrolled.
     This block used to be inline here, correctly, and was NOT used by the other
     signing surface, which took a client-asserted `secondFactorVerified` boolean
     instead. It now lives in services/part11/reverify-signer.ts so both call the
     same policy; see that module's header for the history. */
  const reverified = await reverifySigner(
    userId,
    { password, mfaToken },
    signerReverificationDeps(),
  );
  if (!reverified.ok) {
    return res.status(reverified.status).json({ error: reverified.error, code: reverified.code });
  }
  /* Server-derived, never a client boolean. `reverifySigner` returns ok ONLY
     when the password verified and, where a second factor is enrolled, the
     token verified too — so reaching this line is itself the proof that every
     required factor passed. `secondFactorVerified` distinguishes the two valid
     shapes (password alone vs password+MFA) for the persisted row. */
  const secondFactorVerified = reverified.secondFactorVerified;
  const signatureIsValid = true;

  // Load signer profile so signer_name / signer_email are denormalised on
  // the signature row (required for offline audit reproduction per Part 11).
  const session = (req as any).user ?? {};
  const orgId = Number(session.organizationId);
  if (!Number.isFinite(orgId)) {
    return res.status(403).json({
      error: 'Organization context required to sign (§11.10).',
      code: 'ESIGNATURE_ORG_REQUIRED',
    });
  }

  // §11.50 printed name, email and title — resolved from the membership record
  // through the shared Part 11 lookup, never from the session and never
  // defaulted.
  //
  // What this replaces: `session.name ?? ''` / `session.email ?? ''` seeded the
  // values from client-controlled session fields, then filled gaps from a BARE
  // PRIMARY-KEY read of `users` — unscoped, so a user id belonging to another
  // tenant would still have resolved a name. Only the email was checked before
  // signing, so the printed NAME could be written empty; and a failed lookup was
  // swallowed with a console.warn, degrading identity to whatever the session
  // asserted at exactly the moment the server could not confirm it.
  let signerName: string;
  let signerEmail: string;
  let resolvedSignerTitle: string | null;
  try {
    const signer = await resolveSignerIdentity(pool, userId, orgId, 'esignature sign');
    signerName = signer.name;
    signerEmail = signer.email;
    resolvedSignerTitle = signer.title;
  } catch (err: any) {
    if (err?.code === 'SIGNER_NOT_ATTRIBUTABLE') {
      return res.status(403).json({
        error: 'Signer identity is not attributable in this organization (§11.100).',
        code: 'ESIGNATURE_SIGNER_NOT_ATTRIBUTABLE',
      });
    }
    throw err;
  }

  const signedAt = new Date();
  const ipAddress: string | undefined = clientIpOf(req) ?? undefined;

  // §11.70 content binding: the signature must be linked to the *bytes* of the
  // version being signed, not just its id. Load the version's content
  // server-side and derive the deterministic binding digest stored in
  // bound_payload_digest. Fail CLOSED — never apply a signature to a version
  // that has no content (or whose row/table is absent). signatureHash above is
  // the §11.200 attribution hash; this is the §11.70 record-linking hash.
  let boundPayloadDigest: string;
  try {
    // Tenant-scoped: the version is resolved only within the signer's org
    // (join documents.organization_id), so a signature can never be bound to
    // another tenant's version by supplying a foreign versionId.
    const ver = await pool.query(
      `SELECT dv.document_id, dv.version_number, dv.content
         FROM document_versions dv
         JOIN documents d ON d.id = dv.document_id
        WHERE dv.id = $1 AND d.organization_id = $2
        LIMIT 1`,
      [Number(versionId), orgId],
    );
    if (ver.rows.length === 0) {
      return res.status(422).json({
        error: 'Cannot sign: the referenced document version does not exist in your organization.',
        code: 'ESIGNATURE_VERSION_NOT_FOUND',
      });
    }
    boundPayloadDigest = buildVersionBindingDigest({
      documentId: Number(ver.rows[0].document_id ?? documentId),
      versionId: Number(versionId),
      versionNumber: ver.rows[0].version_number ?? null,
      content: ver.rows[0].content,
    });
  } catch (bindErr: any) {
    if (bindErr?.code === '42P01') {
      return res.status(503).json({
        error: 'E-signature schema not present — run migrations before signing.',
        code: 'ESIGNATURE_SCHEMA_MISSING',
      });
    }
    // buildVersionBindingDigest throws when content is empty/absent — an
    // unbindable signature must be refused, not silently applied.
    return res.status(422).json({
      error: bindErr instanceof Error ? bindErr.message : 'Cannot bind signature to version content.',
      code: 'ESIGNATURE_CONTENT_UNBINDABLE',
    });
  }

  // §11.200 attribution manifest + hash. The hash MUST be computed over the
  // EXACT object persisted as signature_manifest — previously the hash covered
  // one set of fields while a DIFFERENT (thinner) object was stored, so the
  // stored signature_hash did not authenticate the stored manifest and any
  // re-derivation over the manifest always mismatched. Build the manifest once,
  // then hash that same object. Computed here (after the §11.70 binding digest)
  // so boundPayloadDigest is included. Excludes the password and MFA token.
  const signatureManifest = {
    documentId: Number(documentId),
    versionId: Number(versionId),
    signaturePurpose,
    signatureMeaning: signatureMeaning ?? null,
    action,
    signerId: userId,
    signerEmail,
    signerRole,
    signerTitle: resolvedSignerTitle,
    deviceInfo: deviceInfo ?? null,
    boundPayloadDigest,
    signedAt: signedAt.toISOString(),
  };
  const signatureHash = createHash('sha256')
    .update(JSON.stringify(signatureManifest))
    .digest('hex');

  // 21 CFR Part 11 §11.10(e): the signature and its audit row are ONE
  // transaction. Previously the INSERT ran on an autocommit `pool.query`, so
  // the signature was durably committed BEFORE the audit write was attempted.
  // The comment below the INSERT claimed "no signature without a corresponding,
  // durable audit-trail entry" — that guarantee could not hold: (a) the audit
  // write ran on a different connection, so a 500 rolled back nothing, and
  // (b) auditService.logAction catches its own persistence errors and returns
  // normally, so the catch could never fire for the failure it was written for.
  // A signature could therefore be permanently recorded with no audit row.
  const signClient = await pool.connect();
  try {
    await signClient.query('BEGIN');
    // Single e-signature write path: the INSERT lives in
    // services/part11/signature-persistence.ts, shared with the governed sign
    // action (/api/c2c/actions/sign). Values are unchanged from the historical
    // inline INSERT of this route.
    const result = await persistElectronicSignature(signClient, {
      documentId: Number(documentId),
      versionId: Number(versionId),
      bindingBasis: BINDING_BASIS.DOCUMENT_VERSION_CONTENT,
      signatureType: resolvedSignatureType,
      signaturePurpose,
      signerId: userId,
      signerName,
      signerTitle: resolvedSignerTitle,
      signerEmail,
      /* Was hardcoded 'password+totp' regardless of whether a second factor
         was ever presented — a false statement on a Part 11 record for any
         signer without MFA enrolled. Now reports what was actually verified. */
      authenticationMethod: reverified.authenticationMethod,
      authenticationTimestamp: signedAt,
      secondFactorVerified,
      signatureHash,
      signatureMeaning: signatureMeaning ?? null,
      signatureManifest,
      isValid: signatureIsValid,
      complianceStatement: complianceStatement ?? null,
      legalDisclaimer: legalDisclaimer ?? null,
      ipAddress: ipAddress ?? null,
      deviceInfo: deviceInfo ?? null,
      signedAt,
      boundPayloadDigest,
      // Tenant scope stamped at INSERT — the signer's org context is already
      // verified above (orgId gates the version lookup).
      organizationId: orgId,
    });

    // 21 CFR Part 11 §11.10(e): every signing event lands in the central audit
    // trail in addition to the electronic_signatures row. The signature hash is
    // included so an auditor can correlate the two tables.
    //
    // Written on `signClient`, INSIDE the transaction that created the
    // signature, via the transaction-enlistable writer rather than
    // auditService.logAction (which runs on its own connection and swallows
    // persistence failures by design). If the audit row cannot be written the
    // whole transaction rolls back, so the signature never exists either. That
    // is what makes "no signature without a durable audit entry" true rather
    // than merely asserted.
    await writeChainedAuditRow(signClient, {
      tenantId: (req as any).user?.organizationId ?? null,
      userId,
      action: 'esignature.sign',
      resourceType: 'electronic_signature',
      resourceId: String(result.id),
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
        signerRole,
      },
    });

    await signClient.query('COMMIT');

    return res.status(201).json({
      signatureId: result.id,
      signatureHash,
      signedAt: (result.signedAt as any)?.toISOString?.() ?? signedAt.toISOString(),
    });
  } catch (err: any) {
    try {
      await signClient.query('ROLLBACK');
    } catch {
      /* ignore rollback failure — the original error is what matters */
    }
    if (err?.code === '42P01' || err?.code === '42703') {
      // Schema not migrated (table missing, or the signed_target/binding_basis
      // columns not yet applied). Refuse signing rather than pretend it succeeded.
      console.warn('[esignature] electronic_signatures schema missing/stale');
      return res.status(503).json({
        error: 'E-signature schema not present — run migrations before signing.',
        code: 'ESIGNATURE_SCHEMA_MISSING',
      });
    }
    console.error('[esignature] sign transaction failed:', err?.message);
    return res.status(500).json({
      error: 'Signature could not be recorded together with its audit-trail entry; signing aborted.',
      code: 'ESIGNATURE_AUDIT_FAILED',
    });
  } finally {
    signClient.release();
  }
});

export default router;
