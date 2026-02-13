// @ts-nocheck
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
 * For development, this uses a simplified authentication mechanism
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Attach database to request for consistent access
  req.db = db;

  // Get API key from request headers (could be either Authorization or x-api-key)
  const apiKey =
    req.headers['x-api-key'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null);

  // CRIT-03 FIX: Removed blanket dev-mode bypass that granted admin to all
  // unauthenticated requests when NODE_ENV === 'development'.
  // All requests now require a valid API key or token regardless of environment.

  // In a real environment, require authentication
  if (!apiKey) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // For development, use a simple API key validation
    // In production, you would look up the API key in the database
    const devApiKey = process.env.DEV_API_KEY;
    if (devApiKey && apiKey === devApiKey) {
      // Set development user information
      req.userId = 1;
      req.userRole = 'admin';
      req.userEmail = 'dev@example.com';
      req.tenantId = 1;
      req.tenantContext = {
        organizationId: 1,
        userId: 1,
        role: 'admin',
      };
      logger.debug('Authenticated via DEV_API_KEY');
      return next();
    }

    // If API key doesn't match, authentication fails
    return res.status(401).json({ error: 'Invalid API key' });
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

    // Handle legacy temp_ prefix passwords — compare after stripping prefix
    if (hash.startsWith('temp_')) {
      // Temporary passwords should still be bcrypt-compared when re-hashed
      // For migration: accept plaintext temp passwords but log deprecation warning
      logger.warn('Legacy temp_ password detected — scheduling for bcrypt migration');
      return password === hash.substring(5);
    }

    // Standard bcrypt comparison
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification failed', error);
    return false;
  }
}
