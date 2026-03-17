/**
 * Enterprise Authentication Routes - TrialSage V2
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

const router = Router();
const isDev = process.env.NODE_ENV !== 'production';

// Dev user for testing
const devUser = {
  id: 1,
  email: 'developer@trialsage.ai',
  firstName: 'Dev',
  lastName: 'User',
  role: 'admin',
};

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
router.post('/check-email', async (req: Request, res: Response) => {
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

    // In dev mode, always allow password auth
    if (isDev) {
      return res.json({
        exists: true,
        authFlow: 'password',
        mfaRequired: false,
        passwordSet: true,
        email: normalizedEmail,
      });
    }

    // Check if user exists in database
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!userResult.length) {
      // User doesn't exist - still return password flow for signup
      return res.json({
        exists: false,
        authFlow: 'password',
        mfaRequired: false,
        passwordSet: false,
        email: normalizedEmail,
      });
    }

    const user = userResult[0];

    res.json({
      exists: true,
      authFlow: 'password',
      mfaRequired: user.mfaEnabled === true,
      passwordSet: !!user.passwordHash,
      email: normalizedEmail,
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] check-email error:', error);

    // In dev mode, still succeed
    if (isDev) {
      return res.json({
        exists: true,
        authFlow: 'password',
        mfaRequired: false,
        passwordSet: true,
        email: req.body.email,
      });
    }

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
router.post('/verify-password', async (req: Request, res: Response) => {
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

    // In dev mode, accept any password
    if (isDev) {
      // Generate JWT token
      const token = jwt.sign(
        {
          userId: '1',
          email: normalizedEmail,
          organizationId: '2',
          role: 'admin',
        },
        config.jwt.secret,
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        requiresMfa: false,
        requiresOrgSelection: false,
        token,
        user: {
          id: 1,
          email: normalizedEmail,
          firstName: 'Dev',
          lastName: 'User',
          displayName: 'Dev User',
          role: 'admin',
          organizationId: '2',
          organizationName: 'Concept2Cure',
        },
      });
    }

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
        message: `Account is temporarily locked. Try again after ${lockStatus.lockedUntil?.toISOString()}`,
        lockedUntil: lockStatus.lockedUntil,
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
        remainingAttempts: failResult.remainingAttempts,
        accountLocked: failResult.locked,
      });
    }

    // Reset failed login counter on success
    await resetFailedLogins(user.id);

    // Check if password has expired
    const passwordExpired = await isPasswordExpired(user.id);

    // Check if MFA is required
    const mfaRequired = user.mfaEnabled === true;

    if (mfaRequired) {
      // Don't issue full token yet — require MFA step
      const partialToken = jwt.sign(
        {
          userId: user.id.toString(),
          email: user.email,
          organizationId: (user.defaultOrganizationId || 2).toString(),
          role: 'pending_mfa', // Restricted token — only valid for MFA verification
          mfaPending: true,
        },
        config.jwt.secret,
        { expiresIn: '5m' } // Short-lived — only valid for MFA step
      );

      return res.json({
        success: true,
        requiresMfa: true,
        requiresOrgSelection: false,
        partialToken,
        passwordExpired,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.name?.split(' ')[0] || 'User',
          lastName: user.name?.split(' ').slice(1).join(' ') || '',
          displayName: user.name || user.email,
        },
      });
    }

    // No MFA required — issue full token
    const token = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
        organizationId: (user.defaultOrganizationId || 2).toString(),
        role: 'admin',
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      requiresMfa: false,
      requiresOrgSelection: false,
      passwordExpired,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.name?.split(' ')[0] || 'User',
        lastName: user.name?.split(' ').slice(1).join(' ') || '',
        displayName: user.name || user.email,
        role: 'admin',
        organizationId: (user.defaultOrganizationId || 2).toString(),
        organizationName: 'Concept2Cure',
      },
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] verify-password error:', error);

    // In dev mode, still succeed
    if (isDev) {
      const token = jwt.sign(
        { userId: '1', email: req.body.email, organizationId: '2', role: 'admin' },
        config.jwt.secret,
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        requiresMfa: false,
        requiresOrgSelection: false,
        token,
        user: {
          id: 1,
          email: req.body.email,
          firstName: 'Dev',
          lastName: 'User',
          displayName: 'Dev User',
          role: 'admin',
          organizationId: '2',
          organizationName: 'Concept2Cure',
        },
      });
    }

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
router.post('/verify-mfa', async (req: Request, res: Response) => {
  try {
    const { email, code, partialToken } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'MFA_CODE_REQUIRED',
        message: 'MFA verification code is required',
      });
    }

    // In dev mode, always succeed
    if (isDev) {
      const token = jwt.sign(
        { userId: '1', email, organizationId: '2', role: 'admin' },
        config.jwt.secret,
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: 1,
          email,
          firstName: 'Dev',
          lastName: 'User',
          displayName: 'Dev User',
          role: 'admin',
          organizationId: '2',
          organizationName: 'Concept2Cure',
        },
      });
    }

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
    const mfaResult = await verifyMFACode(userId, code);

    if (!mfaResult.valid) {
      return res.status(401).json({
        error: 'INVALID_MFA_CODE',
        message: 'Invalid verification code. Please try again.',
      });
    }

    // MFA verified — issue full token
    const token = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: 'admin',
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // Look up user details
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    res.json({
      success: true,
      mfaMethod: mfaResult.method,
      token,
      user: {
        id: user?.id || userId,
        email: user?.email || decoded.email,
        firstName: user?.name?.split(' ')[0] || 'User',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        displayName: user?.name || decoded.email,
        role: 'admin',
        organizationId: decoded.organizationId,
        organizationName: 'Concept2Cure',
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
 * Generate MFA secret and QR code for initial setup
 */
router.post('/mfa/setup', async (req: Request, res: Response) => {
  try {
    const { userId, email } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: 'userId and email are required' });
    }

    const result = await generateMFASecret(parseInt(userId), email);

    res.json({
      success: true,
      qrCodeDataUrl: result.qrCodeDataUrl,
      secret: result.secret, // For manual entry
      backupCodes: result.backupCodes, // Show ONCE
    });
  } catch (error) {
    console.error('[Enterprise Auth] mfa/setup error:', error);
    res.status(500).json({ error: 'Failed to setup MFA' });
  }
});

/**
 * POST /mfa/enable
 * Enable MFA after user verifies their first TOTP code
 */
router.post('/mfa/enable', async (req: Request, res: Response) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'userId and code are required' });
    }

    const success = await enableMFA(parseInt(userId), code);

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
 * Disable MFA (requires password re-authentication)
 */
router.post('/mfa/disable', async (req: Request, res: Response) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ error: 'userId and password are required' });
    }

    // Re-authenticate before disabling MFA
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(userId)))
      .limit(1);

    if (!userResult.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(password, userResult[0].passwordHash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    await disableMFA(parseInt(userId));
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
router.post('/electronic-signature', async (req: Request, res: Response) => {
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
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
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
router.get('/electronic-signature/:id/verify', async (req: Request, res: Response) => {
  try {
    const result = await verifySignatureIntegrity(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    console.error('[Enterprise Auth] signature verification error:', error);
    res.status(500).json({ error: 'Failed to verify signature' });
  }
});

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

    if (!existingToken && !isDev) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication required to select organization',
      });
    }

    let userId: string;
    let email: string;

    if (existingToken) {
      const decoded = jwt.verify(existingToken, config.jwt.secret) as any;
      userId = decoded.userId;
      email = decoded.email;
    } else {
      // Dev fallback (only reachable when isDev is true)
      userId = '1';
      email = 'developer@trialsage.ai';
    }

    // SECURITY: Validate that the user actually belongs to the requested organization.
    // Without this check, any authenticated user could switch to any org.
    if (!isDev) {
      const membership = await db
        .select({ organizationId: organizationUsers.organizationId })
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
    }

    // Look up org details
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, parseInt(organizationId)))
      .limit(1);

    const orgName = org?.name || 'Organization';

    // Issue new JWT scoped to the selected organization
    const token = jwt.sign(
      { userId, email, organizationId: String(organizationId), role: 'admin' },
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

  if (!oldToken && !isDev) {
    return res.status(401).json({
      error: 'NO_TOKEN',
      message: 'No token provided',
    });
  }

  try {
    let decoded: any = {
      userId: '1',
      email: 'developer@trialsage.ai',
      organizationId: '2',
      role: 'admin',
    };

    if (oldToken) {
      decoded = jwt.verify(oldToken, config.jwt.secret) as any;
    }

    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role,
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    if (isDev) {
      const newToken = jwt.sign(
        { userId: '1', email: 'developer@trialsage.ai', organizationId: '2', role: 'admin' },
        config.jwt.secret,
        { expiresIn: '24h' }
      );
      return res.json({ success: true, token: newToken });
    }

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

  // Dev mode - always return authenticated
  if (isDev) {
    return res.json({
      authenticated: true,
      user: {
        id: '1',
        email: 'developer@trialsage.ai',
        firstName: 'Dev',
        lastName: 'User',
        displayName: 'Dev User',
        role: 'admin',
        organizationId: '2',
        organizationName: 'Concept2Cure',
      },
    });
  }

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
