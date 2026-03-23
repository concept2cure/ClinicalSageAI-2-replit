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
  verifyMFACode,
  generateMFASecret,
  enableMFA,
  disableMFA,
  isMFAEnabled,
  isPasswordExpired,
  createElectronicSignature,
  verifySignatureIntegrity,
} from '../services/auth-security-service';

import { config } from '../config/environment';
import { authMiddleware } from '../auth';
import * as emailOtpService from '../services/emailOtpService';
import { sendLoginOtpEmail } from '../services/emailService';

const router = Router();
// SECURITY FIX: isDev variable and devUser removed — no more dev-mode auth bypasses.

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
  keyGenerator: req => req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown',
});

/** Helper: extract and verify JWT from Authorization header */
function extractJwtUser(
  req: Request
): { userId: string; email: string; organizationId?: string } | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
      organizationId?: string;
    };
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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'EMAIL_REQUIRED',
        message: 'Email address is required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('[Enterprise Auth] Checking email:', normalizedEmail);

    // SECURITY FIX: Dev-mode bypass removed. Always check database.

    // Check if user exists in database
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // SECURITY: Always return the same shape regardless of user existence
    // to prevent user enumeration attacks
    if (!userResult.length) {
      // SECURITY: Return same shape whether user exists or not to prevent enumeration
      return res.json({
        authFlow: 'password',
        mfaRequired: false,
        email: normalizedEmail,
      });
    }

    const user = userResult[0];

    // SECURITY: Do not expose 'exists' flag — prevents email enumeration
    res.json({
      authFlow: 'password',
      mfaRequired: user.mfaEnabled === true,
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
    const { email, password, deviceFingerprint } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'CREDENTIALS_REQUIRED',
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('[Enterprise Auth] Verifying password for:', normalizedEmail);

    // SECURITY FIX: Dev-mode any-password bypass removed. Always validate against database.

    // Look up user in database
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!userResult.length) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const user = userResult[0];

    // Check account lockout
    const lockStatus = await isAccountLocked(user.id);
    if (lockStatus.locked) {
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

    const mfaMethod = (user as any).mfaMethod || 'email';
    const hasTotpSetup = user.mfaEnabled === true && mfaMethod === 'totp';
    let maskedEmail: string | undefined;

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
        role: user.role || user.tier || 'user',
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
    const { email, code, partialToken } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'MFA_CODE_REQUIRED',
        message: 'MFA verification code is required',
      });
    }

    // SECURITY FIX: Dev-mode MFA bypass removed. MFA is always enforced.

    // Verify the partial token to get user identity
    let decoded: any;
    try {
      decoded = jwt.verify(partialToken, config.jwt.secret) as any;
    } catch {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'MFA session expired. Please re-enter your password.',
      });
    }

    if (!decoded.mfaPending) {
      return res.status(400).json({
        error: 'INVALID_TOKEN',
        message: 'Token is not a valid MFA partial token',
      });
    }

    // Verify the MFA code using speakeasy
    const userId = parseInt(decoded.userId);

    // Try email OTP first, then fall back to TOTP
    let isValid = await emailOtpService.verifyEmailOtp(userId, code);
    let verifiedMethod = 'email';

    if (!isValid) {
      const mfaResult = await verifyMFACode(userId, code);
      isValid = mfaResult.valid;
      verifiedMethod = mfaResult.method || 'totp';
    }

    if (!isValid) {
      return res.status(401).json({
        error: 'INVALID_MFA_CODE',
        message: 'Invalid or expired verification code. Please try again.',
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
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, mfaOrgId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const user = mfaUserData;
    const mfaVerifyOrgName = mfaOrgResult[0]?.name || 'Organization';

    const token = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: mfaActualRole,
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

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
    const decoded = extractJwtUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await generateMFASecret(parseInt(decoded.userId), decoded.email);

    res.json({
      success: true,
      qrCodeDataUrl: result.qrCodeDataUrl,
      secret: result.secret,
      backupCodes: result.backupCodes,
    });
  } catch (error) {
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
    const decoded = extractJwtUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const success = await enableMFA(parseInt(decoded.userId), code);

    if (!success) {
      return res.status(400).json({
        error: 'INVALID_CODE',
        message: 'Invalid verification code. MFA not enabled.',
      });
    }

    res.json({ success: true, message: 'MFA enabled successfully' });
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
    const decoded = extractJwtUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable MFA' });
    }

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

    await disableMFA(parseInt(decoded.userId));
    res.json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    console.error('[Enterprise Auth] mfa/disable error:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

/**
 * POST /electronic-signature
 * Create a 21 CFR Part 11 compliant electronic signature
 */
router.post('/electronic-signature', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await createElectronicSignature({
      documentId: req.body.documentId,
      versionId: req.body.versionId,
      signerId: req.body.signerId,
      signerName: req.body.signerName,
      signerTitle: req.body.signerTitle,
      signerEmail: req.body.signerEmail,
      signatureType: req.body.signatureType,
      signaturePurpose: req.body.signaturePurpose,
      signatureMeaning: req.body.signatureMeaning,
      password: req.body.password,
      mfaCode: req.body.mfaCode,
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
      deviceInfo: {
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString(),
      },
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      signatureId: result.signatureId,
      message: 'Electronic signature created successfully (21 CFR Part 11 compliant)',
    });
  } catch (error) {
    console.error('[Enterprise Auth] electronic-signature error:', error);
    res.status(500).json({ error: 'Failed to create electronic signature' });
  }
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
      const result = await verifySignatureIntegrity(parseInt(req.params.id));
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
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: 'ORG_REQUIRED',
        message: 'Organization ID is required',
      });
    }

    // Verify the caller's identity from the existing JWT
    const authHeader = req.headers.authorization;
    const existingToken = authHeader?.replace('Bearer ', '');

    if (!existingToken) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication required to select organization',
      });
    }

    const decoded = jwt.verify(existingToken, config.jwt.secret) as any;
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
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, parseInt(organizationId)))
      .limit(1);

    const orgName = org?.name || 'Organization';

    // Issue new JWT scoped to the selected organization with actual role
    const token = jwt.sign(
      { userId, email, organizationId: String(organizationId), role: selectOrgRole },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

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

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
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
    const decoded = jwt.verify(oldToken, config.jwt.secret) as any;

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
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

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
    const decoded = jwt.verify(token, config.jwt.secret) as any;
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
router.post('/logout', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default router;
