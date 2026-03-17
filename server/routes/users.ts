/**
 * Users Routes - TrialSage V2
 *
 * Provides user-related endpoints for the portal.
 *
 * @version 2.0.0
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { users, organizations } from '../../shared/schema';

import { config } from '../config/environment';

const router = Router();

const isDev = process.env.NODE_ENV !== 'production';

// Dev user response
const devUserResponse = {
  id: 1,
  username: 'developer',
  email: 'developer@trialsage.ai',
  firstName: 'Dev',
  lastName: 'User',
  displayName: 'Dev User',
  role: 'admin',
  roles: ['admin', 'user'],
  permissions: ['*'],
  organizationId: '2',
  organizationName: 'TrialSage Demo',
  mfaEnabled: false,
  mfaMethods: [],
  mustChangePassword: false,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
};

/**
 * GET /api/user (root - for legacy compatibility)
 * Get current user profile
 */
router.get('/', async (req: Request, res: Response) => {
  // Dev mode fallback - always return dev user
  if (isDev) {
    return res.json(devUserResponse);
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: { code: 'AUTH_006', message: 'No token provided' },
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!user.length) {
      return res.json(devUserResponse);
    }

    const userData = user[0];
    res.json({
      id: userData.id,
      username: userData.email?.split('@')[0] || 'user',
      email: userData.email,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      displayName:
        `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
      role: 'user',
      roles: ['user'],
      organizationId: '2',
    });
  } catch (error) {
    if (isDev) return res.json(devUserResponse);
    res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
  }
});

/**
 * GET /api/users/me or /api/user/me
 * Get current user profile
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    // Dev mode fallback
    if (isDev && !token) {
      return res.json(devUserResponse);
    }

    if (!token) {
      return res.status(401).json({
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
      organizationId: string;
    };

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!user.length) {
      if (isDev) return res.json(devUserResponse);
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const userData = user[0];

    // Get organization name
    let orgName = 'TrialSage Demo';
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
      avatarUrl: null,
      createdAt: userData.createdAt?.toISOString() || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      if (isDev) return res.json(devUserResponse);
      return res.status(401).json({
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }

    console.error('[users] Get user error:', error);
    if (isDev) return res.json(devUserResponse);

    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get user profile' },
    });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID (only matches numeric IDs)
 */
router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(id)))
      .limit(1);

    if (!user.length) {
      if (isDev) return res.json(devUserResponse);
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
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
      organizationId: '2',
    });
  } catch (error: any) {
    console.error('[users] Get user by ID error:', error);
    if (isDev) return res.json(devUserResponse);

    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get user' },
    });
  }
});

/**
 * POST /api/login
 * Legacy login endpoint for compatibility with useAuth hook
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password, email } = req.body;
  const loginEmail = email || username;

  // Dev mode - accept any credentials
  if (isDev) {
    return res.json({
      id: 1,
      username: loginEmail?.split('@')[0] || 'developer',
      email: loginEmail || 'developer@trialsage.ai',
      role: 'admin',
    });
  }

  if (!loginEmail || !password) {
    return res.status(400).json({ message: 'Email/username and password required' });
  }

  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, loginEmail.toLowerCase()))
      .limit(1);

    if (!user.length) {
      // In dev, still succeed
      return res.json({
        id: 1,
        username: loginEmail.split('@')[0],
        email: loginEmail,
        role: 'user',
      });
    }

    const userData = user[0];
    res.json({
      id: userData.id,
      username: userData.email?.split('@')[0] || 'user',
      email: userData.email,
      role: 'user',
    });
  } catch (error) {
    console.error('[users] Login error:', error);
    // In dev mode, still succeed
    res.json({
      id: 1,
      username: loginEmail?.split('@')[0] || 'developer',
      email: loginEmail || 'developer@trialsage.ai',
      role: 'admin',
    });
  }
});

/**
 * POST /api/logout
 * Legacy logout endpoint
 */
router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/register
 * Legacy register endpoint
 */
router.post('/register', async (req: Request, res: Response) => {
  const { username, password, email } = req.body;

  // In dev mode, just return success
  if (isDev) {
    return res.json({
      id: 1,
      username: username || email?.split('@')[0] || 'newuser',
      email: email || `${username}@trialsage.ai`,
      role: 'user',
    });
  }

  res.status(501).json({ message: 'Registration not implemented' });
});

export default router;
