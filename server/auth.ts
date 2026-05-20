/**
 * Authentication and Authorization Middleware
 *
 * This file contains middleware functions for authentication and authorization.
 *
 */
import { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { organizationUsers, users } from '../shared/schema';
import { createScopedLogger } from './utils/logger';
import { db } from './db';
import jwt from 'jsonwebtoken';
import { config } from './config/environment';
import { verifyJwtWithRotation } from './utils/jwtVerify';

const logger = createScopedLogger('auth');


const parseFiniteInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  if (!token || token.trim() === '') return null;
  return token.trim();
};


// Augment Express Request type to include user information
declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: number | string;
        userId?: number | string;
        email?: string;
        role?: string;
        roles?: string[];
        organizationId?: number | string;
        permissions?: string[];
        tenantId?: number | string;
        industryMode?: string | null;
      };
      tenantContext?: {
        organizationId?: number | string | null;
        organizationUuid?: string | null;
        clientWorkspaceId?: number | string | null;
        module?: string | null;
        userId?: number | string;
        role?: string | null;
      };
      userId?: number | string;
      tenantId?: number | string;
      userRole?: string;
      userEmail?: string;
      db?: any;
    }
  }
}

/**
 * Authentication middleware
 * Validates Bearer JWT tokens only.
 * Sets req.userId, req.userRole, req.userEmail, req.tenantId, req.tenantContext.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Attach database to request for consistent access
  req.db = db;

  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  const authenticate = async () => {
    try {
      const decoded = verifyJwtWithRotation<{
        userId?: string;
        email?: string;
        organizationId?: string;
      }>(token);

      if (!decoded.userId || !decoded.organizationId) {
        return res.status(401).json({ error: 'Invalid token payload' });
      }

      const parsedUserId = parseFiniteInt(decoded.userId);
      const parsedOrganizationId = parseFiniteInt(decoded.organizationId);
      const userId = parsedUserId ?? decoded.userId;
      const membership =
        parsedUserId !== null && parsedOrganizationId !== null
          ? await db
              .select({ role: organizationUsers.role })
              .from(organizationUsers)
              .where(
                and(
                  eq(organizationUsers.userId, parsedUserId),
                  eq(organizationUsers.organizationId, parsedOrganizationId)
                )
              )
              .limit(1)
          : [];
      if (membership.length === 0) {
        return res.status(401).json({ error: 'Invalid tenant membership' });
      }
      const resolvedRole = membership[0].role;

      req.userId = userId;
      req.userRole = resolvedRole;
      req.userEmail = decoded.email;
      req.tenantId = parsedOrganizationId ?? 0;
      req.user = {
        id: req.userId,
        userId: req.userId,
        email: decoded.email,
        role: resolvedRole,
        organizationId: decoded.organizationId,
      };
      req.tenantContext = {
        organizationId: parsedOrganizationId ?? null,
        userId: req.userId,
        role: resolvedRole,
      };
      return next();
    } catch (error) {
      logger.error('Authentication error', error);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };

  void authenticate();
}

/**
 * Require admin role middleware
 * Ensures the user has an admin role
 */
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (!req.userRole || (req.userRole !== 'admin' && req.userRole !== 'super_admin')) {
    return res.status(403).json({ error: 'Admin permissions required' });
  }

  next();
}

/**
 * Require super admin role middleware
 * Ensures the user has a super admin role
 */
export function requireSuperAdminRole(req: Request, res: Response, next: NextFunction) {
  if (!req.userRole || req.userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin permissions required' });
  }

  next();
}

/**
 * Login function
 * Authenticates user and returns JWT bearer token
 */
export async function login(email: string, password: string) {
  try {
    // CRIT-03 FIX: Removed hardcoded dev@example.com/password bypass.
    // All logins now go through the database.

    if (!db) {
      throw new Error('Database connection not available');
    }

    // Find user by email
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // CRIT-04 FIX: Use bcrypt for password verification
    const passwordIsValid = await verifyPassword(password, user[0].passwordHash || '');

    if (!passwordIsValid) {
      throw new Error('Invalid password');
    }

    const membership = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
      })
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, user[0].id))
      .limit(1);

    if (membership.length === 0) {
      throw new Error('User has no organization membership');
    }

    const token = jwt.sign(
      {
        userId: String(user[0].id),
        email: user[0].email,
        organizationId: String(membership[0].organizationId),
        role: membership[0].role,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return {
      token,
      user: {
        id: user[0].id,
        name: user[0].name || '',
        email: user[0].email,
        role: membership[0].role,
      },
    };
  } catch (error) {
    logger.error('Login error', error);
    throw error;
  }
}

/**
 * Get user's role in an organization
 * Queries the organizationUsers junction table for the actual role
 */
async function getUserRole(userId: number, organizationId: number): Promise<string> {
  if (!db) return 'viewer'; // Safest default when DB unavailable

  try {
    const { organizationUsers } = await import('../shared/schema');
    const { and } = await import('drizzle-orm');
    const result = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.userId, userId),
          eq(organizationUsers.organizationId, organizationId)
        )
      )
      .limit(1);

    return result.length > 0 ? result[0].role : 'viewer';
  } catch (error) {
    logger.error('Failed to fetch user role', error);
    return 'viewer'; // Fail-safe: least privileged role
  }
}

/**
 * Verify password using bcrypt
 * CRIT-04 FIX: Replaced plaintext comparison with bcrypt.compare
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Reject empty hashes (previously returned true — security hole)
  if (!hash || hash === '') {
    logger.warn('Login attempt against empty password hash — rejected');
    return false;
  }

  try {
    const bcrypt = await import('bcryptjs');

    // SECURITY FIX: Reject legacy temp_ prefix passwords entirely.
    // Plaintext comparison was a security hole. Users with temp_ passwords
    // must reset their password via the forgot-password flow.
    if (hash.startsWith('temp_')) {
      logger.warn(
        'Legacy temp_ password rejected — user must reset password via forgot-password flow'
      );
      return false;
    }

    // Standard bcrypt comparison
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification failed', error);
    return false;
  }
}
