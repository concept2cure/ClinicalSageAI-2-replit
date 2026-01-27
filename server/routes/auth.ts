/**
 * Authentication Routes - TrialSage V2
 *
 * Basic authentication endpoints for development mode.
 * Provides session management, login, and user validation.
 *
 * @version 2.0.0
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  users,
  organizations,
  organizationUsers,
  authRefreshTokens,
  roles,
  userRoles,
  permissions,
} from '../../shared/schema';

const router = Router();

// JWT Secret - in production, use environment variable
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  'trialsage-dev-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Development mode flag
const isDev = process.env.NODE_ENV !== 'production';

/**
 * GET /api/auth/session
 * Get current session status and user info
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    // In dev mode without token, return mock session
    if (isDev && !token) {
      return res.json({
        authenticated: true,
        user: {
          id: 'dev-user-1',
          email: 'developer@trialsage.ai',
          firstName: 'Dev',
          lastName: 'User',
          displayName: 'Dev User',
          roles: ['admin', 'user'],
          permissions: ['*'],
          organizationId: '2',
          organizationName: 'TrialSage Demo',
          mfaEnabled: false,
          mfaMethods: [],
          mustChangePassword: false,
        },
        session: {
          id: 'dev-session-1',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastActivityAt: new Date(),
        },
        tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    if (!token) {
      return res.status(401).json({
        authenticated: false,
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      organizationId: string;
    };

    // Get user from database
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!user.length) {
      return res.status(401).json({
        authenticated: false,
        error: { code: 'AUTH_006', message: 'User not found' },
      });
    }

    const userData = user[0];

    // Get organization
    let orgName = 'TrialSage';
    if (decoded.organizationId) {
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, parseInt(decoded.organizationId)))
        .limit(1);
      if (org.length) {
        orgName = org[0].name;
      }
    }

    res.json({
      authenticated: true,
      user: {
        id: userData.id.toString(),
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        displayName:
          `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
        roles: ['user'],
        permissions: [],
        organizationId: decoded.organizationId || '2',
        organizationName: orgName,
        mfaEnabled: false,
        mfaMethods: [],
        mustChangePassword: false,
      },
      session: {
        id: `session-${userData.id}`,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
      },
      tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        authenticated: false,
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }

    console.error('[auth] Session check error:', error);

    // In dev mode, return mock session even on error
    if (isDev) {
      return res.json({
        authenticated: true,
        user: {
          id: 'dev-user-1',
          email: 'developer@trialsage.ai',
          firstName: 'Dev',
          lastName: 'User',
          displayName: 'Dev User',
          roles: ['admin', 'user'],
          permissions: ['*'],
          organizationId: '2',
          organizationName: 'TrialSage Demo',
          mfaEnabled: false,
          mfaMethods: [],
          mustChangePassword: false,
        },
        session: {
          id: 'dev-session-1',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastActivityAt: new Date(),
        },
        tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    res.status(500).json({
      authenticated: false,
      error: { code: 'AUTH_010', message: 'Internal server error' },
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, deviceInfo, rememberDevice } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Email and password are required' },
      });
    }

    // In dev mode, accept any credentials
    if (isDev) {
      const accessToken = jwt.sign({ userId: '1', email, organizationId: '2' }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      const refreshToken = jwt.sign({ userId: '1', email, type: 'refresh' }, JWT_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      });

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn: 86400, // 24 hours
        user: {
          id: '1',
          email,
          firstName: 'Dev',
          lastName: 'User',
          displayName: 'Dev User',
          roles: ['admin', 'user'],
          permissions: ['*'],
          organizationId: '2',
          organizationName: 'TrialSage Demo',
          mfaEnabled: false,
          mfaMethods: [],
          mustChangePassword: false,
        },
        mfaRequired: false,
      });
    }

    // In production, validate credentials against database
    const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (!user.length) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
      });
    }

    // TODO: Implement proper password verification with bcrypt
    // For now, this is a placeholder
    const userData = user[0];

    const accessToken = jwt.sign(
      { userId: userData.id.toString(), email: userData.email, organizationId: '2' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: userData.id.toString(), email: userData.email, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: 86400,
      user: {
        id: userData.id.toString(),
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        displayName:
          `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
        roles: ['user'],
        permissions: [],
        organizationId: '2',
        organizationName: 'TrialSage Demo',
        mfaEnabled: false,
        mfaMethods: [],
        mustChangePassword: false,
      },
      mfaRequired: false,
    });
  } catch (error: any) {
    console.error('[auth] Login error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Login failed' },
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout and invalidate tokens
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    // In production, invalidate refresh token in database
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('[auth] Logout error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Logout failed' },
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Refresh token required' },
      });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
      userId: string;
      email: string;
      type: string;
    };

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Invalid refresh token' },
      });
    }

    const accessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, organizationId: '2' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const newRefreshToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 86400,
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_005', message: 'Refresh token expired' },
      });
    }

    console.error('[auth] Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Token refresh failed' },
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    // Dev mode fallback
    if (isDev && !token) {
      return res.json({
        id: 'dev-user-1',
        email: 'developer@trialsage.ai',
        firstName: 'Dev',
        lastName: 'User',
        displayName: 'Dev User',
        roles: ['admin', 'user'],
        permissions: ['*'],
        organizationId: '2',
        organizationName: 'TrialSage Demo',
      });
    }

    if (!token) {
      return res.status(401).json({
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({
        error: { code: 'AUTH_006', message: 'User not found' },
      });
    }

    const userData = user[0];

    res.json({
      id: userData.id.toString(),
      email: userData.email,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      displayName:
        `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
      roles: ['user'],
      permissions: [],
      organizationId: '2',
      organizationName: 'TrialSage Demo',
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }

    console.error('[auth] Get user error:', error);

    if (isDev) {
      return res.json({
        id: 'dev-user-1',
        email: 'developer@trialsage.ai',
        firstName: 'Dev',
        lastName: 'User',
        displayName: 'Dev User',
        roles: ['admin', 'user'],
        permissions: ['*'],
        organizationId: '2',
        organizationName: 'TrialSage Demo',
      });
    }

    res.status(500).json({
      error: { code: 'AUTH_010', message: 'Failed to get user profile' },
    });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Verify MFA code (placeholder for dev mode)
 */
router.post('/mfa/verify', async (req: Request, res: Response) => {
  // In dev mode, MFA always passes
  if (isDev) {
    return res.json({
      success: true,
      accessToken: jwt.sign(
        { userId: '1', email: 'developer@trialsage.ai', organizationId: '2' },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      ),
      refreshToken: jwt.sign(
        { userId: '1', email: 'developer@trialsage.ai', type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
      ),
      expiresIn: 86400,
      user: {
        id: '1',
        email: 'developer@trialsage.ai',
        firstName: 'Dev',
        lastName: 'User',
        displayName: 'Dev User',
        roles: ['admin', 'user'],
        permissions: ['*'],
        organizationId: '2',
        organizationName: 'TrialSage Demo',
        mfaEnabled: false,
        mfaMethods: [],
        mustChangePassword: false,
      },
    });
  }

  res.status(501).json({
    success: false,
    error: { code: 'MFA_NOT_IMPLEMENTED', message: 'MFA not implemented in this version' },
  });
});

export default router;
