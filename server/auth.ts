/**
 * Authentication and Authorization Middleware
 *
 * This file contains middleware functions for authentication and authorization.
 *
 * Note: This is a simplified version without JWT for development purposes
 */
import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { users } from '../shared/schema';
import { createScopedLogger } from './utils/logger';
import { db } from './db';
import jwt from 'jsonwebtoken';
import { config } from './config/environment';

const logger = createScopedLogger('auth');

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
 * Validates JWT tokens (from /api/auth/login) or legacy API keys.
 * Sets req.userId, req.userRole, req.userEmail, req.tenantId, req.tenantContext.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Attach database to request for consistent access
  req.db = db;

  // Get token from Authorization header or x-api-key
  const apiKey =
    req.headers['x-api-key'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null);

  if (!apiKey) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // 1. Try JWT verification first (primary auth method)
    try {
      const decoded = jwt.verify(apiKey, config.jwt.secret) as {
        userId?: string;
        email?: string;
        organizationId?: string;
        role?: string;
      };

      if (decoded.userId) {
        req.userId = parseInt(decoded.userId) || decoded.userId;
        req.userRole = decoded.role || 'user';
        req.userEmail = decoded.email;
        req.tenantId = decoded.organizationId ? parseInt(decoded.organizationId) : 0;
        // SECURITY: Set req.user with organizationId from JWT so that
        // downstream tenant middleware (tenantContextMiddleware,
        // tenantIsolationMiddleware) derives org context from the token.
        req.user = {
          id: req.userId,
          userId: req.userId,
          email: decoded.email,
          role: decoded.role || 'user',
          organizationId: decoded.organizationId || null,
        };
        req.tenantContext = {
          organizationId: decoded.organizationId ? parseInt(decoded.organizationId) : 0,
          userId: req.userId,
          role: decoded.role || 'user',
        };
        return next();
      }
    } catch (_jwtError) {
      // Not a valid JWT — fall through to API key check
    }

    // 2. Fallback to DEV_API_KEY (for automated tools / CI)
    // SECURITY: Only allow in non-production environments to prevent auth bypass
    const devApiKey = process.env.DEV_API_KEY;
    if (devApiKey && apiKey === devApiKey) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('DEV_API_KEY authentication attempted in production — rejected');
        return res.status(401).json({ error: 'Invalid token or API key' });
      }
      req.userId = 1;
      req.userRole = 'admin';
      req.userEmail = 'dev@example.com';
      req.tenantId = 1;
      req.user = {
        id: 1,
        userId: 1,
        email: 'dev@example.com',
        role: 'admin',
        organizationId: '1',
      };
      req.tenantContext = {
        organizationId: 1,
        userId: 1,
        role: 'admin',
      };
      logger.debug('Authenticated via DEV_API_KEY (non-production)');
      return next();
    }

    // No valid authentication
    return res.status(401).json({ error: 'Invalid token or API key' });
  } catch (error) {
    logger.error('Authentication error', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
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
 * Authenticates user and returns API key
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

    // Generate a secure API key token for the session
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    return {
      token,
      user: {
        id: user[0].id,
        name: user[0].name || '',
        email: user[0].email,
        role: 'user', // Default role — looked up from organizationUsers in real auth flow
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
      logger.warn('Legacy temp_ password rejected — user must reset password via forgot-password flow');
      return false;
    }

    // Standard bcrypt comparison
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification failed', error);
    return false;
  }
}
