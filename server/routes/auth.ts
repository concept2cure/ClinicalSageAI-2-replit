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
import crypto from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  users,
  organizations,
  organizationUsers,
} from '../../shared/schema';
import { sendPasswordResetEmail } from '../services/emailService';
import * as mfaService from '../services/mfaService';
import {
  validatePasswordPolicy,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLogins,
  isPasswordExpired,
} from '../services/auth-security-service';

import { config } from '../config/environment';

const router = Router();

// JWT configuration from centralized config
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// ─── Rate Limiters ──────────────────────────────────────────────────────────
// Separate limiters for different risk levels.

/** Login: 10 attempts per 15 minutes per IP */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many login attempts. Please try again later.' } },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
});

/** Signup: 5 per hour per IP */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many signup attempts. Please try again later.' } },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
});

/** Password reset: 5 per hour per IP */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many password reset requests. Please try again later.' } },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
});

/** MFA verify: 10 per 15 minutes per IP */
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many MFA attempts. Please try again later.' } },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
});

// Development auth bypass fully removed — all authentication is enforced.
// To test locally, create a user via POST /api/auth/signup then login normally.

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
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
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, deviceInfo, rememberDevice } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Email and password are required' },
      });
    }

    // All login attempts validated against database with bcrypt
    if (!requireDb(res)) return;
    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user.length) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
      });
    }

    const userData = user[0];

    // ── Account Lockout Check ─────────────────────────────────────────────
    const lockStatus = await isAccountLocked(userData.id);
    if (lockStatus.locked) {
      return res.status(423).json({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Account temporarily locked due to too many failed attempts. Try again later.',
        },
        lockedUntil: lockStatus.lockedUntil?.toISOString(),
      });
    }

    if (!userData.passwordHash) {
      console.error('[auth] User has no password hash:', userData.email);
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
      });
    }

    const isPasswordValid = await bcrypt.compare(password, userData.passwordHash);
    if (!isPasswordValid) {
      // Record failed attempt and potentially lock
      const failResult = await recordFailedLogin(userData.id);
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid credentials' },
        remainingAttempts: failResult.remainingAttempts,
        accountLocked: failResult.locked,
      });
    }

    // Successful password check — reset lockout counter
    await resetFailedLogins(userData.id);

    const defaultOrganizationId = userData.defaultOrganizationId || null;
    let organizationId = defaultOrganizationId;
    let jwtRole = 'user';

    // Single query for org membership + role (avoids duplicate organizationUsers queries)
    const [membership] = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
      })
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, userData.id))
      .limit(1);

    if (!organizationId) {
      organizationId = membership?.organizationId || null;
    }
    jwtRole = membership?.role || 'user';

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

    // ── MFA Check ──────────────────────────────────────────────────────
    // If the user has MFA enabled, return a short-lived challenge token
    // instead of the full JWT. The client must complete /mfa/verify first.
    const userHasMfa = userData.mfaEnabled === true;

    if (userHasMfa) {
      const challengeToken = mfaService.createMfaChallengeToken(
        userData.id,
        userData.email,
        organizationId.toString(),
        organization?.uuid || null,
        jwtRole,
      );

      return res.json({
        success: true,
        mfaRequired: true,
        challengeId: challengeToken,
        mfaMethods: [{ type: 'totp', isEnabled: true, isPrimary: true }],
      });
    }

    // ── Update last login timestamp ──────────────────────────────────
    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, userData.id));

    // ── No MFA — issue full tokens ─────────────────────────────────────
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
router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Invalid signup data', details: parsed.error.errors },
      });
    }

    const { email, password, companyName, industryMode, firstName, lastName } = parsed.data;

    // Enforce enterprise password policy (NIST 800-63B)
    const policyResult = validatePasswordPolicy(password);
    if (!policyResult.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: policyResult.errors[0], details: { errors: policyResult.errors } },
      });
    }

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

    // SECURITY FIX: Look up the user's actual organization from the database
    // instead of hardcoding organizationId: '2'. This prevents a refresh token
    // from granting access to an arbitrary tenant.
    if (!requireDb(res)) return;
    const refreshUser = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!refreshUser.length) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'User not found' },
      });
    }

    const refreshUserData = refreshUser[0];
    let refreshOrgId = refreshUserData.defaultOrganizationId;
    if (!refreshOrgId) {
      const [refreshMembership] = await db
        .select({ organizationId: organizationUsers.organizationId })
        .from(organizationUsers)
        .where(eq(organizationUsers.userId, refreshUserData.id))
        .limit(1);
      refreshOrgId = refreshMembership?.organizationId || null;
    }

    if (!refreshOrgId) {
      return res.status(403).json({
        success: false,
        error: { code: 'AUTH_011', message: 'No organization assigned' },
      });
    }

    // Get the user's role for the JWT
    const [refreshMembershipRole] = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, refreshUserData.id))
      .limit(1);

    const accessToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        organizationId: refreshOrgId.toString(),
        role: refreshMembershipRole?.role || 'user',
      },
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

    // Look up the actual organization name
    let meOrgName = 'Organization';
    const meOrgIdNum = parseInt(meOrgId);
    if (meOrgIdNum) {
      const [meOrg] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, meOrgIdNum))
        .limit(1);
      meOrgName = meOrg?.name || 'Organization';
    }

    res.json({
      id: userData.id.toString(),
      email: userData.email,
      firstName: meFirstName,
      lastName: meLastName,
      displayName: meDisplayName,
      roles: meRoles,
      permissions: [],
      organizationId: meOrgId,
      organizationName: meOrgName,
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
 * Complete MFA verification during login.
 * Accepts the challenge token (from login response) + TOTP code,
 * and returns the real JWT access/refresh tokens.
 */
router.post('/mfa/verify', mfaLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeId, code, method } = req.body;

    if (!challengeId || !code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MFA_001', message: 'Challenge token and verification code are required' },
      });
    }

    // Verify the challenge token
    const challenge = mfaService.verifyMfaChallengeToken(challengeId);
    if (!challenge) {
      return res.status(401).json({
        success: false,
        error: { code: 'MFA_002', message: 'Invalid or expired MFA challenge. Please log in again.' },
      });
    }

    const userId = parseInt(challenge.userId);

    // Verify the TOTP code
    const isValid = await mfaService.verifyToken(userId, code);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_004', message: 'Invalid verification code' },
      });
    }

    // MFA verified — issue full tokens
    if (!requireDb(res)) return;

    const [userData] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userData) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'User not found' },
      });
    }

    const accessToken = jwt.sign(
      {
        userId: challenge.userId,
        email: challenge.email,
        organizationId: challenge.organizationId,
        organizationUuid: challenge.organizationUuid,
        role: challenge.role,
      },
      config.jwt.secret,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: challenge.userId, email: challenge.email, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Build user response object
    const mfaNameParts = (userData.name || '').trim().split(/\s+/);
    const mfaFirstName = mfaNameParts[0] || '';
    const mfaLastName = mfaNameParts.slice(1).join(' ') || '';
    const mfaDisplayName = (userData.name || '').trim() || userData.email;
    const mfaRole = challenge.role;
    const mfaRoles =
      mfaRole === 'admin'
        ? ['admin', 'user']
        : [mfaRole, 'user'].filter((v, i, a) => a.indexOf(v) === i);

    // Fetch org name
    let mfaOrgName = 'Organization';
    if (challenge.organizationId) {
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, parseInt(challenge.organizationId)))
        .limit(1);
      mfaOrgName = org?.name || 'Organization';
    }

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: 86400,
      user: {
        id: challenge.userId,
        email: challenge.email,
        firstName: mfaFirstName,
        lastName: mfaLastName,
        displayName: mfaDisplayName,
        roles: mfaRoles,
        permissions: [],
        organizationId: challenge.organizationId,
        organizationName: mfaOrgName,
        organizationUuid: challenge.organizationUuid,
        mfaEnabled: true,
        mfaMethods: [{ type: 'totp', isEnabled: true, isPrimary: true }],
        mustChangePassword: false,
      },
      mfaRequired: false,
    });
  } catch (error: any) {
    console.error('[auth] MFA verify error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'MFA verification failed' },
    });
  }
});

/**
 * POST /api/auth/mfa/setup
 * Generate a TOTP secret and QR code URL for the authenticated user.
 * Requires a valid JWT (user must be logged in).
 */
router.post('/mfa/setup', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Authentication required' },
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
    };

    if (!requireDb(res)) return;

    const result = await mfaService.generateSecret(parseInt(decoded.userId), decoded.email);

    res.json({
      success: true,
      secret: result.secret,
      otpauthUrl: result.otpauthUrl,
      qrCode: result.qrCodeDataUrl,
    });
  } catch (error: any) {
    console.error('[auth] MFA setup error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Invalid or expired token' },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'MFA setup failed' },
    });
  }
});

/**
 * POST /api/auth/mfa/enable
 * Confirm MFA setup by verifying the initial TOTP code from the authenticator app.
 * Returns backup codes on success.
 */
router.post('/mfa/enable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Authentication required' },
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
    };

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MFA_001', message: 'Verification code is required' },
      });
    }

    if (!requireDb(res)) return;

    const result = await mfaService.enableMfa(parseInt(decoded.userId), code);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_004', message: 'Invalid verification code. Ensure your authenticator app is synced.' },
      });
    }

    res.json({
      success: true,
      message: 'MFA has been enabled successfully',
      backupCodes: result.backupCodes,
    });
  } catch (error: any) {
    console.error('[auth] MFA enable error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Invalid or expired token' },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Failed to enable MFA' },
    });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA for the authenticated user. Requires current TOTP code.
 */
router.post('/mfa/disable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Authentication required' },
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
    };

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MFA_001', message: 'Current verification code is required to disable MFA' },
      });
    }

    if (!requireDb(res)) return;

    const disabled = await mfaService.disableMfa(parseInt(decoded.userId), code);

    if (!disabled) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_004', message: 'Invalid verification code' },
      });
    }

    res.json({
      success: true,
      message: 'MFA has been disabled',
    });
  } catch (error: any) {
    console.error('[auth] MFA disable error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Invalid or expired token' },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Failed to disable MFA' },
    });
  }
});

// ---------------------------------------------------------------------------
// Password Reset Flow
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/forgot-password
 * Also mounted at /api/auth/password/reset-request for v2 client compat
 *
 * Generates a reset token, stores it on the user row, and sends an email.
 */
async function handleForgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Email is required' },
      });
    }

    if (!requireDb(res)) return;

    // Always return the same response to prevent email enumeration
    const successResponse = {
      success: true,
      message: 'If the email exists, a password reset link will be sent',
    };

    const user = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user.length) {
      // Don't reveal whether the email exists
      return res.json(successResponse);
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store hashed token on the user row
    await db
      .update(users)
      .set({
        resetToken: resetTokenHash,
        resetTokenExpiresAt: expiresAt,
      })
      .where(eq(users.id, user[0].id));

    // Build the reset URL (frontend route)
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/concept2cure/password-reset?token=${resetToken}`;

    // Send the email (or log in dev)
    await sendPasswordResetEmail(user[0].email, resetToken, resetUrl);

    return res.json(successResponse);
  } catch (error: any) {
    console.error('[auth] Forgot password error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Password reset request failed' },
    });
  }
}

/**
 * POST /api/auth/reset-password
 * Also mounted at /api/auth/password/reset-confirm for v2 client compat
 *
 * Validates the reset token and updates the user's password.
 */
async function handleResetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Reset token and new password are required' },
      });
    }

    // Enforce enterprise password policy (NIST 800-63B)
    const resetPolicyResult = validatePasswordPolicy(newPassword);
    if (!resetPolicyResult.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: resetPolicyResult.errors[0], details: { errors: resetPolicyResult.errors } },
      });
    }

    if (!requireDb(res)) return;

    // Hash the incoming token to compare against stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await db
      .select({
        id: users.id,
        resetToken: users.resetToken,
        resetTokenExpiresAt: users.resetTokenExpiresAt,
      })
      .from(users)
      .where(eq(users.resetToken, tokenHash))
      .limit(1);

    if (!user.length) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Invalid or expired reset token' },
      });
    }

    const userData = user[0];

    // Check expiry
    if (!userData.resetTokenExpiresAt || new Date() > userData.resetTokenExpiresAt) {
      // Clear the expired token
      await db
        .update(users)
        .set({ resetToken: null, resetTokenExpiresAt: null })
        .where(eq(users.id, userData.id));

      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Reset token has expired. Please request a new one.' },
      });
    }

    // Hash new password and clear reset token
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      })
      .where(eq(users.id, userData.id));

    console.log(`[auth] Password reset completed for user ${userData.id}`);

    return res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    console.error('[auth] Reset password error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Password reset failed' },
    });
  }
}

// Register both legacy and v2 paths (rate-limited)
router.post('/forgot-password', passwordResetLimiter, handleForgotPassword);
router.post('/password/reset-request', passwordResetLimiter, handleForgotPassword);

router.post('/reset-password', passwordResetLimiter, handleResetPassword);
router.post('/password/reset-confirm', passwordResetLimiter, handleResetPassword);

// ---------------------------------------------------------------------------
// Password Change (Authenticated)
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/password/change
 * Change password for the currently authenticated user.
 * Requires current password + new password (enforced by policy).
 */
router.post('/password/change', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_006', message: 'Authentication required' },
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
    };

    const { currentPassword, newPassword, terminateOtherSessions } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Current password and new password are required' },
      });
    }

    // Enforce enterprise password policy
    const changePolicyResult = validatePasswordPolicy(newPassword);
    if (!changePolicyResult.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: changePolicyResult.errors[0], details: { errors: changePolicyResult.errors } },
      });
    }

    if (!requireDb(res)) return;

    const [userData] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: { code: 'AUTH_006', message: 'User not found' },
      });
    }

    // Verify current password
    if (!userData.passwordHash) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Current password is incorrect' },
      });
    }

    const currentValid = await bcrypt.compare(currentPassword, userData.passwordHash);
    if (!currentValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_001', message: 'Current password is incorrect' },
      });
    }

    // Prevent reusing the same password (string compare avoids redundant bcrypt call)
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_001', message: 'New password must be different from current password' },
      });
    }

    // Hash and store new password
    const newHash = await bcrypt.hash(newPassword, 12);

    // Maintain password history (last 5)
    const history = (userData.passwordHistory as string[] || []).slice(0, 4);
    history.unshift(userData.passwordHash);

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        passwordHistory: history,
        mustChangePassword: false,
      })
      .where(eq(users.id, userData.id));

    console.log(`[auth] Password changed for user ${userData.id}`);

    return res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }

    console.error('[auth] Password change error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_010', message: 'Password change failed' },
    });
  }
});

export default router;
