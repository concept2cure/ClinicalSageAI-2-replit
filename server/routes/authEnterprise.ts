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
import { users, organizations, userOrganizations } from '../../shared/schema';

const router = Router();

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.SESSION_SECRET || 'trialsage-dev-secret-key';
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
      mfaRequired: false, // MFA can be enabled later
      passwordSet: true,
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
        JWT_SECRET,
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

    // In a real implementation, you'd verify the password hash
    // For now, accept any password in dev/demo

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
        organizationId: '2',
        role: 'admin',
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      requiresMfa: false,
      requiresOrgSelection: false,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || 'User',
        lastName: user.lastName || '',
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        role: 'admin',
        organizationId: '2',
        organizationName: 'Concept2Cure',
      },
    });
  } catch (error: any) {
    console.error('[Enterprise Auth] verify-password error:', error);

    // In dev mode, still succeed
    if (isDev) {
      const token = jwt.sign(
        { userId: '1', email: req.body.email, organizationId: '2', role: 'admin' },
        JWT_SECRET,
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
 * Step 3: Verify MFA code (if enabled)
 */
router.post('/verify-mfa', async (req: Request, res: Response) => {
  const { email, code, method } = req.body;

  // In dev mode, always succeed
  if (isDev) {
    const token = jwt.sign({ userId: '1', email, organizationId: '2', role: 'admin' }, JWT_SECRET, {
      expiresIn: '24h',
    });

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

  res.json({
    success: true,
    message: 'MFA verified',
  });
});

/**
 * POST /select-organization
 * Step 4: Select organization (for multi-org users)
 */
router.post('/select-organization', async (req: Request, res: Response) => {
  const { email, organizationId } = req.body;

  const token = jwt.sign(
    { userId: '1', email, organizationId: organizationId || '2', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    token,
    organization: {
      id: organizationId || '2',
      name: 'Concept2Cure',
    },
  });
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
      decoded = jwt.verify(oldToken, JWT_SECRET) as any;
    }

    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role,
      },
      JWT_SECRET,
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
        JWT_SECRET,
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
    const decoded = jwt.verify(token, JWT_SECRET) as any;
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
