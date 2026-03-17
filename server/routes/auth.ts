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
import bcrypt from 'bcryptjs';
import { z } from 'zod';
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

import { config } from '../config/environment';

const router = Router();

// JWT configuration from centralized config
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Development auth bypass fully removed — all authentication is enforced.
// To test locally, create a user via POST /api/auth/signup then login normally.

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2),
  industryMode: z.enum([
    'biotech',
    'medtech',
    'cro',
    'pharma',
    'academic',
    'regulatory',
    'medical_writing',
  ]),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

/**
 * Guard: ensure database is available before any DB query.
 * Returns 503 if the pool didn't initialize (e.g. missing DATABASE_URL).
 */
function requireDb(res: Response): boolean {
  if (!db) {
    res.status(503).json({
      success: false,
      error: { code: 'DB_UNAVAILABLE', message: 'Database connection not available' },
    });
    return false;
  }
  return true;
}

/**
 * GET /api/auth/session
 * Get current session status and user info
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    // CRIT-02b FIX: Removed unconditional dev-mode session bypass (was: isDev && !token → admin)
    // All sessions now require a valid JWT token regardless of environment.

    if (!token) {
      return res.status(401).json({
        authenticated: false,
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as {
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

    // Extract firstName/lastName from name field
    const sessionNameParts = (userData.name || '').trim().split(/\s+/);
    const sessionFirstName = sessionNameParts[0] || '';
    const sessionLastName = sessionNameParts.slice(1).join(' ') || '';
    const sessionDisplayName = (userData.name || '').trim() || userData.email;

    // Get role from organization_users
    let sessionRole = 'user';
    if (decoded.organizationId) {
      const [sessionMembership] = await db
        .select({ role: organizationUsers.role })
        .from(organizationUsers)
        .where(eq(organizationUsers.userId, userData.id))
        .limit(1);
      sessionRole = sessionMembership?.role || 'user';
    }
    const sessionRoles =
      sessionRole === 'admin' ? ['admin', 'user'] : [sessionRole === 'editor' ? 'editor' : 'user'];

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
        firstName: sessionFirstName,
        lastName: sessionLastName,
        displayName: sessionDisplayName,
        roles: sessionRoles,
        permissions: [],
        organizationId: decoded.organizationId || '1',
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

    // CRIT-02c FIX: Removed error-path dev bypass that returned mock admin on DB errors

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

    // CRIT-02d FIX: Removed dev-mode any-credentials login bypass
    // All login attempts now validated against database with bcrypt

    // Validate credentials against database
    if (!requireDb(res)) return;
    const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (!user.length) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
      });
    }

    // CRIT-01b FIX: Password verification with bcrypt
    const userData = user[0];

    if (!userData.passwordHash) {
      console.error('[auth] User has no password hash:', userData.email);
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
      });
    }

    const isPasswordValid = await bcrypt.compare(password, userData.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
      });
    }

    const defaultOrganizationId = userData.defaultOrganizationId || null;
    let organizationId = defaultOrganizationId;

    if (!organizationId) {
      const [membership] = await db
        .select({ organizationId: organizationUsers.organizationId })
        .from(organizationUsers)
        .where(eq(organizationUsers.userId, userData.id))
        .limit(1);
      organizationId = membership?.organizationId || null;
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: { code: 'AUTH_011', message: 'No organization assigned' },
      });
    }

    const [organization] = await db
      .select({ id: organizations.id, name: organizations.name, uuid: organizations.uuid })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    // Get the actual role from organization_users (needed for JWT)
    const [membershipRoleForJwt] = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, userData.id))
      .limit(1);
    const jwtRole = membershipRoleForJwt?.role || 'user';

    const accessToken = jwt.sign(
      {
        userId: userData.id.toString(),
        email: userData.email,
        organizationId: organizationId.toString(),
        organizationUuid: organization?.uuid || null,
        role: jwtRole,
      },
      config.jwt.secret,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: userData.id.toString(), email: userData.email, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Extract firstName/lastName from the name field (users table has name, not firstName/lastName)
    const nameParts = (userData.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const displayName = (userData.name || '').trim() || userData.email;

    // Reuse the role already fetched above for JWT
    const userRole = jwtRole;
    const roles =
      userRole === 'admin'
        ? ['admin', 'user']
        : [userRole, 'user'].filter((v, i, a) => a.indexOf(v) === i);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: 86400,
      user: {
        id: userData.id.toString(),
        email: userData.email,
        firstName,
        lastName,
        displayName,
        roles,
        permissions: [],
        organizationId: organizationId.toString(),
        organizationName: organization?.name || 'Organization',
        organizationUuid: organization?.uuid || null,
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
 * POST /api/auth/signup
 * Create organization + admin user
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid signup data', details: parsed.error.errors },
      });
    }

    const { email, password, companyName, industryMode, firstName, lastName } = parsed.data;

    if (!requireDb(res)) return;
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) {
      return res.status(409).json({
        success: false,
        error: { code: 'AUTH_002', message: 'Email already registered' },
      });
    }

    const baseSlug = companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    let slug = baseSlug || `tenant-${Date.now()}`;

    const existingSlug = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (existingSlug.length) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    let stripeCustomerId: string | null = null;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    if (stripeSecretKey) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
      const customer = await stripe.customers.create({
        email,
        name: companyName,
        metadata: { industryMode },
      });
      stripeCustomerId = customer.id;
    }

    const result = await db.transaction(async tx => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: companyName, slug, industryMode, stripeCustomerId })
        .returning();

      const passwordHash = await bcrypt.hash(password, 12);
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];
      const [user] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          name: fullName,
          defaultOrganizationId: org.id,
        })
        .returning();

      await tx.insert(organizationUsers).values({
        organizationId: org.id,
        userId: user.id,
        role: 'admin',
      });

      return { org, user };
    });

    const token = jwt.sign(
      {
        userId: result.user.id.toString(),
        email: result.user.email,
        organizationId: result.org.id.toString(),
        organizationUuid: result.org.uuid,
        role: 'admin',
      },
      config.jwt.secret,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      token,
      organization: {
        id: result.org.id,
        name: result.org.name,
        uuid: result.org.uuid,
        industryMode: result.org.industryMode,
        stripeCustomerId: result.org.stripeCustomerId,
      },
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    });
  } catch (error: any) {
    console.error('[auth] Signup error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Internal server error' },
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

    const decoded = jwt.verify(refreshToken, config.jwt.secret) as {
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
      config.jwt.secret,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const newRefreshToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, type: 'refresh' },
      config.jwt.secret,
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

    // CRIT-02e FIX: Removed GET /me dev-mode bypass

    if (!token) {
      return res.status(401).json({
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
      organizationId?: string;
    };

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

    // Extract name parts from name column
    const meParts = (userData.name || '').trim().split(/\s+/);
    const meFirstName = meParts[0] || '';
    const meLastName = meParts.slice(1).join(' ') || '';
    const meDisplayName = (userData.name || '').trim() || userData.email;

    // Get role
    const [meMembership] = await db
      .select({ role: organizationUsers.role, organizationId: organizationUsers.organizationId })
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, userData.id))
      .limit(1);
    const meRole = meMembership?.role || 'user';
    const meRoles =
      meRole === 'admin' ? ['admin', 'user'] : [meRole === 'editor' ? 'editor' : 'user'];
    const meOrgId = decoded.organizationId || meMembership?.organizationId?.toString() || '1';

    res.json({
      id: userData.id.toString(),
      email: userData.email,
      firstName: meFirstName,
      lastName: meLastName,
      displayName: meDisplayName,
      roles: meRoles,
      permissions: [],
      organizationId: meOrgId,
      organizationName: 'Concept2Cure Inc.',
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }

    console.error('[auth] Get user error:', error);

    // CRIT-02f FIX: Removed error-path dev bypass for GET /me

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
  // CRIT-02g FIX: Removed unconditional dev-mode MFA bypass
  // MFA verification placeholder — returns 501 until MFA service is implemented
  res.status(501).json({
    success: false,
    error: { code: 'MFA_NOT_IMPLEMENTED', message: 'MFA not implemented in this version' },
  });
});

export default router;
