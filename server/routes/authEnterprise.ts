/**
 * Enterprise Authentication Routes - Concept2Cure V2
 *
 * Multi-step authentication flow for enterprise users:
 * 1. check-email - Validate email and determine auth flow
 * 2. verify-password - Validate password
 * 3. verify-mfa - Validate MFA if enabled
 * 4. select-organization - Select org if user has multiple
 *
 * @version 2.0.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { users, organizations, organizationUsers } from '../../shared/schema';
import {
  validatePasswordPolicy,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLogins,
  isPasswordExpired,
  verifySignatureIntegrity,
} from '../services/auth-security-service';

import { config } from '../config/environment';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
import { revokeToken, verifyLiveToken } from '../services/token-revocation';
import { continuedSessionClaims, idleWindowSecondsOf, openSession } from '../services/session-inactivity';
import { recordAuthEvent } from '../services/audit/auth-event-audit';
import { ACCOUNT_INACTIVE_MESSAGE, isAccountActive, isActiveAccountStatus } from '../services/account-standing';
import { runWithTenantScope } from '../db/tenantStore';
import { requireAccessTokenReason } from '../middleware/tokenType';
import { authMiddleware } from '../auth';
import * as emailOtpService from '../services/emailOtpService';
import { sendLoginOtpEmail } from '../services/emailService';
import * as mfaService from '../services/mfaService';
import { mfaEnrolmentOf } from '../services/mfa-enrolment';

const router = Router();
// SECURITY FIX: isDev variable and devUser removed — no more dev-mode auth bypasses.

// ─── Request body validation schemas ────────────────────────────────────────
//
// Typed, format-checked replacements for the previous presence-only
// `if (!field)` guards. SECURITY: no org/user identity is trusted from these
// bodies — userId/organizationId always come from the verified JWT. Each
// handler keeps its exact error code/shape by translating ZodError into the
// handler's existing { error, message } contract.
//
// MFA / verification codes are constrained to a bounded character set that
// accepts every legitimate code shape used by this app — 6-digit TOTP, 6-digit
// email OTP, and `XXXX-XXXX` / `XXXXXXXX` alphanumeric backup codes — while
// rejecting oversized or injection-style input.

const emailSchema = z.string().trim().min(1).max(320).email();

const mfaCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{6,12}$/, 'Invalid verification code format');

const checkEmailSchema = z.object({
  email: emailSchema,
});

const verifyPasswordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
  deviceFingerprint: z.string().max(512).optional(),
});

const verifyMfaSchema = z.object({
  email: emailSchema.optional(),
  code: mfaCodeSchema,
  partialToken: z.string().min(1),
});

const mfaEnableSchema = z.object({
  code: mfaCodeSchema,
});

const mfaDisableSchema = z.object({
  password: z.string().min(1).max(1024),
  code: mfaCodeSchema,
});

const selectOrganizationSchema = z.object({
  // Accept the numeric org id as number or numeric string (callers send a
  // string today); reject anything non-numeric. Membership is still verified
  // against the DB below — this only constrains the format.
  organizationId: z.union([
    z.number().int().positive(),
    z.string().trim().regex(/^\d+$/, 'organizationId must be numeric'),
  ]),
});

/**
 * Translate a ZodError into this router's existing { error, message } 400
 * contract. `error` is the handler-specific code so client behaviour and
 * status code are preserved; the message stays generic enough not to leak
 * which field failed in a way that aids enumeration.
 */
function sendValidationError(
  res: Response,
  code: string,
  message: string,
  err: z.ZodError
) {
  console.warn(`[Enterprise Auth] ${code} validation failed:`, {
    issues: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
  });
  return res.status(400).json({ error: code, message });
}

// ─── Rate Limiters ──────────────────────────────────────────────────────────

/** Enterprise login steps: 10 per 15 min per IP */
const enterpriseAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

/**
 * Helper: extract and verify JWT from Authorization header. A signed-out
 * session (AUTH-03) is no identity, the same as a bad token.
 */
async function extractJwtUser(
  req: Request
): Promise<{ userId: string; email: string; organizationId?: string } | null> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = (await verifyLiveToken(token)) as {
      userId: string;
      email: string;
      organizationId?: string;
      type?: string;
      role?: string | null;
      mfaPending?: boolean;
    };
    // SECURITY: reject non-access token classes (mfa-partial / mfa_challenge /
    // refresh). Pre-MFA tokens are signed with the same secret as access tokens,
    // so a password-only session must not be treated as a full identity for
    // access-privileged actions (MFA setup/enable/disable).
    if (requireAccessTokenReason(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Helper: look up user's actual role in an organization */
async function lookupOrgRole(userId: number, organizationId?: number): Promise<string> {
  if (!organizationId) return 'user';
  try {
    const [membership] = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.userId, userId),
          eq(organizationUsers.organizationId, organizationId)
        )
      )
      .limit(1);
    return membership?.role || 'user';
  } catch {
    return 'user';
  }
}

/**
 * GET /check-sso-domain
 * Check if a domain has SSO configured
 */
router.get('/check-sso-domain', async (req: Request, res: Response) => {
  const { domain } = req.query;

  // In dev mode, no SSO domains configured
  res.json({
    ssoEnabled: false,
    provider: null,
    providerName: null,
  });
});

/**
 * POST /check-email
 * Step 1: Check if email exists and determine authentication flow
 */
router.post('/check-email', enterpriseAuthLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = checkEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(
        res,
        'EMAIL_REQUIRED',
        'A valid email address is required',
        parsed.error
      );
    }
    const { email } = parsed.data;

    const normalizedEmail = email.trim().toLowerCase();

    // One answer for every address, and no lookup behind it. This read the
    // account and answered `mfaRequired: user.mfaEnabled` — false for an
    // unknown address, true only for a real account with an authenticator — so
    // a caller with no credentials could tell enrolled accounts apart (D6,
    // 2026-09-23). The truthful answer does not depend on the account: every
    // enterprise sign-in asks for a second factor after the password
    // (verify-password always answers requiresMfa), an emailed code when no
    // authenticator is enrolled.
    return res.json({
      authFlow: 'password',
      mfaRequired: true,
      email: normalizedEmail,
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] check-email error:', error);

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to verify email',
    });
  }
});

/**
 * POST /verify-password
 * Step 2: Verify user's password
 */
router.post('/verify-password', enterpriseAuthLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = verifyPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(
        res,
        'CREDENTIALS_REQUIRED',
        'Email and password are required',
        parsed.error
      );
    }
    const { email, password } = parsed.data;

    const normalizedEmail = email.trim().toLowerCase();

    // SECURITY FIX: Dev-mode any-password bypass removed. Always validate against database.

    // Look up user in database
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!userResult.length) {
      await recordAuthEvent({
        action: 'user_login',
        email: normalizedEmail,
        outcome: 'failure',
        reason: 'unknown_email',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const user = userResult[0];

    // An account out of use (suspended, deprovisioned) signs in nowhere: the
    // main login refuses it before comparing the password (AUTH_ACCOUNT_INACTIVE);
    // this step admitted it and minted the MFA-partial token (security audit
    // 2026-09-24, IAM-18 item 5). Refused before the lockout and the password,
    // so a suspended account spends neither.
    if (!isActiveAccountStatus(user.status)) {
      await recordAuthEvent({
        action: 'user_login',
        userId: user.id,
        tenantId: user.defaultOrganizationId,
        email: user.email,
        outcome: 'failure',
        reason: 'account_inactive',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(403).json({ error: 'AUTH_ACCOUNT_INACTIVE', message: ACCOUNT_INACTIVE_MESSAGE });
    }

    // Check account lockout
    const lockStatus = await isAccountLocked(user.id);
    if (lockStatus.locked) {
      await recordAuthEvent({
        action: 'user_login',
        userId: user.id,
        tenantId: user.defaultOrganizationId,
        email: user.email,
        outcome: 'failure',
        reason: 'account_locked',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(423).json({
        error: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to too many failed attempts. Try again later.',
        // SECURITY: Don't leak exact lockout timestamp
      });
    }

    // Verify password using bcrypt
    const bcrypt = await import('bcryptjs');
    const passwordValid = user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!passwordValid) {
      // Record failed attempt
      const failResult = await recordFailedLogin(user.id);
      await recordAuthEvent({
        action: 'user_login',
        userId: user.id,
        tenantId: user.defaultOrganizationId,
        email: user.email,
        outcome: 'failure',
        reason: failResult?.locked ? 'wrong_password_threshold_exceeded' : 'wrong_password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        // SECURITY: Don't leak remainingAttempts or locked status
      });
    }

    // Reset failed login counter on success
    await resetFailedLogins(user.id);

    // Check if password has expired
    const passwordExpired = await isPasswordExpired(user.id);

    // Always require 2FA — email OTP for all users, TOTP for those who set it up
    if (!user.defaultOrganizationId) {
      return res.status(403).json({
        error: 'NO_ORGANIZATION',
        message: 'No organization assigned to this account',
      });
    }

    // Issue partial token for MFA step
    const partialToken = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
        organizationId: user.defaultOrganizationId.toString(),
        role: 'pending_mfa',
        mfaPending: true,
      },
      config.jwt.secret,
      { expiresIn: '5m' }
    );

    // The rule the session reports too (mfa-enrolment.ts).
    const hasTotpSetup = mfaEnrolmentOf(user).signInFactor === 'totp';
    let maskedEmail: string | undefined;

    // Password verified, second factor requested: the same event /api/auth/login records.
    await recordAuthEvent({
      action: 'user_login_mfa_challenge',
      userId: user.id,
      tenantId: user.defaultOrganizationId,
      email: user.email,
      outcome: 'success',
      reason: hasTotpSetup ? 'mfa_challenge_totp' : 'mfa_challenge_email',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!hasTotpSetup) {
      // Email OTP — generate and send
      const otp = await emailOtpService.createEmailOtp(user.id);
      const [local, domain] = user.email.split('@');
      maskedEmail = `${local.slice(0, 2)}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
      sendLoginOtpEmail(user.email, otp).catch(err => {
        console.error('[enterprise-auth] Failed to send login OTP email:', err);
      });
    }

    return res.json({
      success: true,
      requiresMfa: true,
      requiresOrgSelection: false,
      partialToken,
      passwordExpired,
      mfaMethod: hasTotpSetup ? 'totp' : 'email',
      maskedEmail,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.name?.split(' ')[0] || 'User',
        lastName: user.name?.split(' ').slice(1).join(' ') || '',
        displayName: user.name || user.email,
        role: 'user',
        organizationId: user.defaultOrganizationId.toString(),
        organizationName: 'Concept2Cure',
      },
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] verify-password error:', error);

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Authentication failed',
    });
  }
});

/**
 * POST /verify-mfa
 * Step 3: Verify MFA code (TOTP or backup code)
 */
router.post('/verify-mfa', enterpriseAuthLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = verifyMfaSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(
        res,
        'MFA_CODE_REQUIRED',
        'A valid MFA verification code is required',
        parsed.error
      );
    }
    const { code, partialToken } = parsed.data;

    // SECURITY FIX: Dev-mode MFA bypass removed. MFA is always enforced.

    // Verify the partial token to get user identity
    let decoded: any;
    try {
      decoded = verifyJwtWithRotation(partialToken) as any;
    } catch {
      await recordAuthEvent({
        action: 'user_login_mfa_failed',
        outcome: 'failure',
        reason: 'invalid_or_expired_challenge',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'MFA session expired. Please re-enter your password.',
      });
    }

    if (!decoded.mfaPending) {
      await recordAuthEvent({
        action: 'user_login_mfa_failed',
        outcome: 'failure',
        reason: 'invalid_or_expired_challenge',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(400).json({
        error: 'INVALID_TOKEN',
        message: 'Token is not a valid MFA partial token',
      });
    }

    // Verify the MFA code using the same canonical MFA service as /api/auth/*
    const userId = parseInt(decoded.userId);

    // A challenge issued before the account was suspended or deprovisioned does
    // not become a session after it (the rule routes/auth.ts's /mfa/verify
    // applies; audit IAM-18 item 5). Checked before the code, so an account out
    // of use spends none.
    if (!(await isAccountActive(userId))) {
      await recordAuthEvent({
        action: 'user_login',
        userId,
        tenantId: decoded.organizationId,
        email: decoded.email,
        outcome: 'failure',
        reason: 'account_inactive',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(403).json({ error: 'AUTH_ACCOUNT_INACTIVE', message: ACCOUNT_INACTIVE_MESSAGE });
    }

    // Try email OTP first, then fall back to TOTP
    let isValid = await emailOtpService.verifyEmailOtp(userId, code);
    let verifiedMethod: 'email' | 'totp' | 'backup_code' = 'email';

    if (!isValid) {
      // One call that verifies AND consumes the code, and says which method did.
      // It was a non-consuming detectVerificationMethod followed by verifyToken:
      // a second, independent verification of the same code (removed 2026-09-23).
      // The login challenge is the one place a recovery code is redeemable
      // (P1-2, 2026-09-25); signing keeps asking for the authenticator.
      const method = await mfaService.verifyLoginSecondFactor(userId, code);
      isValid = method !== null;
      if (method) verifiedMethod = method === 'recovery' ? 'backup_code' : method;
    }

    if (!isValid) {
      // The organisation comes from the partial token this server signed.
      await recordAuthEvent({
        action: 'user_login_mfa_failed',
        userId,
        tenantId: decoded.organizationId,
        email: decoded.email,
        outcome: 'failure',
        reason: 'invalid_code',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({
        error: 'INVALID_MFA_CODE',
        message: 'Invalid or expired verification code. Each code works once; if you just used it, wait for the next.',
      });
    }

    // MFA verified — issue full token with actual role
    const mfaOrgId = decoded.organizationId ? parseInt(decoded.organizationId) : null;

    // Parallel: fetch role, user details, and org name concurrently
    const [mfaActualRole, [mfaUserData], mfaOrgResult] = await Promise.all([
      mfaOrgId ? lookupOrgRole(userId, mfaOrgId) : Promise.resolve('user'),
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      mfaOrgId
        ? db
            .select({ name: organizations.name, settings: organizations.settings })
            .from(organizations)
            .where(eq(organizations.id, mfaOrgId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const user = mfaUserData;
    const mfaVerifyOrgName = mfaOrgResult[0]?.name || 'Organization';

    // The session's id, start and idle window, registered against the
    // account's concurrent-session limit (P1-1).
    const session = await openSession(userId, mfaOrgResult[0]?.settings);
    const token = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: mfaActualRole,
        type: 'access',
        ...session,
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // The session is created here: the sign-in's success event.
    await recordAuthEvent({
      action: 'user_login',
      userId,
      tenantId: decoded.organizationId,
      email: user?.email || decoded.email,
      outcome: 'success',
      reason: 'mfa_verified',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      mfaMethod: verifiedMethod,
      token,
      user: {
        id: user?.id || userId,
        email: user?.email || decoded.email,
        firstName: user?.name?.split(' ')[0] || 'User',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        displayName: user?.name || decoded.email,
        role: mfaActualRole,
        organizationId: decoded.organizationId,
        organizationName: mfaVerifyOrgName,
      },
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] verify-mfa error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'MFA verification failed',
    });
  }
});

/**
 * POST /mfa/setup
 * Generate MFA secret and QR code for initial setup.
 * SECURITY: Requires valid JWT — userId derived from token, not request body.
 */
router.post('/mfa/setup', async (req: Request, res: Response) => {
  try {
    const decoded = await extractJwtUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await mfaService.generateSecret(parseInt(decoded.userId), decoded.email);

    res.json({
      success: true,
      qrCodeDataUrl: result.qrCodeDataUrl,
      secret: result.secret,
      otpauthUrl: result.otpauthUrl,
    });
  } catch (error) {
    // Refused by mfaService.generateSecret while a factor is enrolled (F-26);
    // the enterprise router answered that refusal with this 500.
    if (error instanceof mfaService.MfaAlreadyEnabledError) {
      return res.status(409).json({ error: 'MFA_ALREADY_ENABLED', message: error.message });
    }
    console.error('[Enterprise Auth] mfa/setup error:', error);
    res.status(500).json({ error: 'Failed to setup MFA' });
  }
});

/**
 * POST /mfa/enable
 * Enable MFA after user verifies their first TOTP code.
 * SECURITY: Requires valid JWT — userId derived from token.
 */
router.post('/mfa/enable', async (req: Request, res: Response) => {
  try {
    const decoded = await extractJwtUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parsed = mfaEnableSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn('[Enterprise Auth] mfa/enable validation failed:', {
        issues: parsed.error.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      });
      return res.status(400).json({ error: 'Verification code is required' });
    }
    const { code } = parsed.data;

    const result = await mfaService.enableMfa(parseInt(decoded.userId), code);

    if (!result.success) {
      return res.status(400).json({
        error: 'INVALID_CODE',
        message: 'Invalid verification code. MFA not enabled. Each code works once; if you just used it, wait for the next.',
      });
    }

    res.json({
      success: true,
      message: 'MFA enabled successfully',
      backupCodes: result.backupCodes || [],
    });
  } catch (error) {
    console.error('[Enterprise Auth] mfa/enable error:', error);
    res.status(500).json({ error: 'Failed to enable MFA' });
  }
});

/**
 * POST /mfa/disable
 * Disable MFA (requires JWT + password re-authentication).
 * SECURITY: Requires valid JWT — userId derived from token.
 */
router.post('/mfa/disable', async (req: Request, res: Response) => {
  try {
    const decoded = await extractJwtUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parsed = mfaDisableSchema.safeParse(req.body);
    if (!parsed.success) {
      const hasPasswordIssue = parsed.error.errors.some(e => e.path[0] === 'password');
      const message = hasPasswordIssue
        ? 'Password is required to disable MFA'
        : 'Current MFA verification code is required to disable MFA';
      return res.status(400).json({ error: message });
    }
    const { password, code } = parsed.data;

    // Re-authenticate before disabling MFA
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!userResult.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(password, userResult[0].passwordHash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const disabled = await mfaService.disableMfa(parseInt(decoded.userId), code);
    if (!disabled) {
      return res.status(400).json({
        error: 'INVALID_CODE',
        message: 'Unable to disable MFA with the current verification state.',
      });
    }

    res.json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    console.error('[Enterprise Auth] mfa/disable error:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

/**
 * POST /electronic-signature — REMOVED (Gone).
 *
 * This was a second electronic-signature write path. Its INSERT omitted
 * `bound_payload_digest`, `binding_basis` and `organization_id`, so every row
 * it wrote was permanently unverifiable against the content it approved, and it
 * took `documentId`/`versionId` from the request body without checking they
 * belonged to the caller's organization.
 *
 * Sign through POST /api/esignature/sign, which resolves the version inside the
 * caller's org, refuses when the content cannot be bound
 * (ESIGNATURE_CONTENT_UNBINDABLE), and writes through the single INSERT in
 * services/part11/signature-persistence.ts.
 *
 * 410 rather than a silent 404: a caller that was using this needs to be told
 * its signatures were not conforming, not left to think the path moved.
 */
router.post('/electronic-signature', authMiddleware, async (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'This signing endpoint has been removed.',
    code: 'ESIGNATURE_ENDPOINT_REMOVED',
    detail:
      'It wrote electronic_signatures rows with no content binding and no organization, ' +
      'which cannot satisfy 21 CFR Part 11 §11.70. Use POST /api/esignature/sign.',
    use: '/api/esignature/sign',
  });
});

/**
 * GET /electronic-signature/:id/verify
 * Verify the integrity of an electronic signature
 */
router.get(
  '/electronic-signature/:id/verify',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const signatureId = Number.parseInt(String(raw), 10);
      if (!Number.isInteger(signatureId)) {
        // Previously parseInt('abc') -> NaN went straight into the query.
        return res.status(400).json({ error: 'Invalid signature id' });
      }

      /* The organization comes from the VERIFIED JWT — authMiddleware sets
         req.user.organizationId from the token claim and re-checks that the
         membership row still exists — never from the request, so a caller cannot
         widen its own scope by asking for another tenant's signature id.
         electronic_signatures.id is a serial, and this read used to select on it
         alone: any authenticated user could count upwards and read another
         tenant's signer_name, signed_at, signature_type and signature_meaning. */
      const orgRaw = (req as unknown as { user?: { organizationId?: unknown } }).user
        ?.organizationId;
      const organizationId = Number.isFinite(Number(orgRaw)) ? Number(orgRaw) : null;
      if (organizationId === null) {
        return res.status(403).json({ error: 'Organization context required' });
      }

      const result = await verifySignatureIntegrity(signatureId, organizationId);
      res.json(result);
    } catch (error) {
      console.error('[Enterprise Auth] signature verification error:', error);
      res.status(500).json({ error: 'Failed to verify signature' });
    }
  }
);

/**
 * POST /select-organization
 * Step 4: Select organization (for multi-org users)
 *
 * SECURITY: The user must already be authenticated (valid JWT in Authorization
 * header). The selected organizationId is validated against the user's actual
 * organization memberships to prevent tenant impersonation.
 */
router.post('/select-organization', async (req: Request, res: Response) => {
  try {
    const parsed = selectOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(
        res,
        'ORG_REQUIRED',
        'A valid organization ID is required',
        parsed.error
      );
    }
    const organizationId = String(parsed.data.organizationId);

    // Verify the caller's identity from the existing JWT
    const authHeader = req.headers.authorization;
    const existingToken = authHeader?.replace('Bearer ', '');

    if (!existingToken) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication required to select organization',
      });
    }

    const decoded = (await verifyLiveToken(existingToken)) as any;
    // SECURITY: a pre-MFA (mfaPending / mfa_challenge) or refresh token must not
    // be exchanged for a full 24h access token here — that would let a
    // password-only session skip MFA. Require a genuine access token.
    if (requireAccessTokenReason(decoded)) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'A valid access token is required to select an organization',
      });
    }
    const userId: string = decoded.userId;
    const email: string = decoded.email;

    // SECURITY: Validate that the user actually belongs to the requested organization.
    // Without this check, any authenticated user could switch to any org.
    const membership = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
      })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.userId, parseInt(userId)),
          eq(organizationUsers.organizationId, parseInt(organizationId))
        )
      )
      .limit(1);

    if (!membership.length) {
      console.warn(
        `[SECURITY] select-organization: user ${userId} attempted to switch to ` +
          `org ${organizationId} without membership`
      );
      return res.status(403).json({
        error: 'ORG_ACCESS_DENIED',
        message: 'You do not have access to this organization',
      });
    }

    const selectOrgRole = membership[0].role || 'user';

    // Look up org details
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, parseInt(organizationId)))
      .limit(1);

    const orgName = org?.name || 'Organization';

    // Issue new JWT scoped to the selected organization with actual role
    const jwtEmail = Array.isArray(email) ? email[0] : email;
    const token = jwt.sign(
      // The same session, with the selected organisation's idle window (P1-1).
      { userId, email: jwtEmail, organizationId: String(organizationId), role: selectOrgRole, type: 'access', ...continuedSessionClaims(decoded), idl: idleWindowSecondsOf(org?.settings) },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // AUDIT: this is a tenant-boundary crossing and it was previously silent.
    //
    // Membership is validated above, so the switch is authorized — but "authorized"
    // and "unrecorded" is the wrong combination for the one endpoint on the
    // platform whose entire job is to move a session from one customer's data to
    // another's. A CRO consultant serving several sponsors crosses this boundary
    // routinely, and an access review of any one of those sponsors needs to see
    // when their tenant was entered and by whom. 21 CFR Part 11 §11.10(d) asks the
    // same question of any system limiting access to authorized individuals.
    //
    // Recorded against the DESTINATION org (the tenant being entered), with the
    // origin in metadata, because that is the direction a reviewer reads it from.
    // Fire-and-forget: an audit-sink outage must not break a legitimate switch,
    // and the failure is logged rather than swallowed.
    //
    // Written in the scope of the organisation being entered, with no role. The
    // request runs in the pre-auth scope (tenant '0'), whose audit_logs policy
    // refused this row under RLS like every other tenant-named auth event (F-19).
    // Membership was validated above.
    void import('../services/audit/auditLogger')
      .then(({ logAuditEvent }) =>
        runWithTenantScope(
          { tenantId: String(organizationId), role: null, source: 'request', caller: 'auth audit: organization_switch' },
          () =>
            logAuditEvent({
              category: 'authorization',
              severity: 'info',
              action: 'organization_switch',
              userId: String(userId),
              organizationId: String(organizationId),
              resourceType: 'organization',
              resourceId: String(organizationId),
              success: true,
              metadata: {
                fromOrganizationId: decoded.organizationId != null ? String(decoded.organizationId) : null,
                toOrganizationId: String(organizationId),
                roleInTarget: selectOrgRole,
              },
              ipAddress: req.ip,
              userAgent: req.get('user-agent'),
            })
        )
      )
      .catch(auditError => {
        console.warn(
          '[Enterprise Auth] failed to record organization_switch in the audit trail:',
          auditError instanceof Error ? auditError.message : String(auditError)
        );
      });

    res.json({
      success: true,
      token,
      organization: {
        id: String(organizationId),
        name: orgName,
      },
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] select-organization error:', error);

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'SessionEndedError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Session expired. Please log in again.',
      });
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to select organization',
    });
  }
});

/**
 * POST /refresh-token
 * Refresh JWT token
 */
router.post('/refresh-token', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const oldToken = authHeader?.replace('Bearer ', '');

  if (!oldToken) {
    return res.status(401).json({
      error: 'NO_TOKEN',
      message: 'No token provided',
    });
  }

  try {
    // A rotation is not the user acting (P1-1): it is not the session's activity.
    const decoded = (await verifyLiveToken(oldToken, undefined, { activity: false })) as any;

    // SECURITY: this endpoint re-mints a full 24h access token. A pre-MFA
    // (mfaPending / mfa_challenge) or refresh token presented here would let a
    // password-only session obtain an access token and bypass MFA. Smallest
    // correct fix: require a genuine access token (preserves the existing
    // access-token → access-token behavior). Refresh-token rotation lives at the
    // canonical POST /api/auth/refresh.
    if (requireAccessTokenReason(decoded)) {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Token expired or invalid',
      });
    }

    // Re-query actual role from DB instead of trusting stale JWT claim
    const refreshOrgId = decoded.organizationId ? parseInt(decoded.organizationId) : null;
    const refreshRole = refreshOrgId
      ? await lookupOrgRole(parseInt(decoded.userId), refreshOrgId)
      : 'user';

    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: refreshRole,
        type: 'access',
        ...continuedSessionClaims(decoded),
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // Security audit 2026-09-24, IAM-04: rotation. The presented token is spent
    // the moment its successor exists. Before this nothing was revoked, so any
    // live access token renewed itself for ever, a day at a time, and logging
    // out of the successor left its predecessor live. Revoked after minting, so
    // a failed mint spends nothing.
    await revokeToken(oldToken, 'rotated');

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'Token expired or invalid',
    });
  }
});

/**
 * GET /session
 * Get current session info
 */
router.get('/session', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  // SECURITY FIX: Dev-mode session bypass removed. Always require valid JWT.

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = (await verifyLiveToken(token)) as any;
    // SECURITY: a pre-MFA / refresh token is not an authenticated session.
    if (requireAccessTokenReason(decoded)) {
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role,
      },
    });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

/**
 * POST /logout
 * End user session
 */
router.post('/logout', (_req: Request, res: Response) => {
  // Answered by the canonical logout, which revokes the presented token (and a
  // refresh token in the body) and records the event. This handler used to
  // answer "Logged out successfully" and do neither (July 2026 audit, AUTH-03).
  // A 307 keeps the method, the body and the Authorization header.
  res.redirect(307, '/api/auth/logout');
});

export default router;
