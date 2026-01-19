/**
 * Authentication and Authorization Middleware
 *
 * This file contains middleware functions for authentication and authorization.
 *
 * Note: This is a simplified version without JWT for development purposes
 */
import { Request, Response, NextFunction, Router } from 'express';
import { eq } from 'drizzle-orm';
import { users } from '../shared/schema';
import { createScopedLogger } from './utils/logger';
import { db } from './db';

const logger = createScopedLogger('auth');

// Augment Express Request type to include user information
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
      userEmail?: string;
      tenantId?: number;
      tenantContext?: {
        organizationId: number;
        userId?: number;
        role?: string;
      };
      db: typeof db;
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

  const isDemoMode = ['true', '1', 'yes'].includes(String(process.env.DEMO_MODE).toLowerCase());

  // For development/demo, allow requests without authentication
  if ((process.env.NODE_ENV === 'development' || isDemoMode) && !apiKey) {
    // Set default values for development
    req.userId = 1;
    req.userRole = 'admin';
    req.userEmail = 'dev@example.com';
    req.tenantId = 1;
    req.tenantContext = {
      organizationId: 1,
      userId: 1,
      role: 'admin',
    };
    return next();
  }

  // In a real environment, require authentication
  if (!apiKey) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // For development, use a simple API key validation
    // In production, you would look up the API key in the database
    if (apiKey === 'dev-api-key-12345') {
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
    // For simplified development authentication
    if (email === 'dev@example.com' && password === 'password') {
      return {
        token: 'dev-api-key-12345',
        user: {
          id: 1,
          name: 'Developer',
          email: 'dev@example.com',
          role: 'admin',
        },
      };
    }

    // If this is not a development user, check the database
    if (db) {
      // Find user by email
      const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (user.length === 0) {
        throw new Error('User not found');
      }

      // Simplified password verification for development
      const passwordIsValid = verifyPassword(password, user[0].passwordHash || '');

      if (!passwordIsValid) {
        throw new Error('Invalid password');
      }

      // In a real app, here we would generate a real token
      // For now, we just create a simple API key for development
      return {
        token: `dev-api-key-${user[0].id}`,
        user: {
          id: user[0].id,
          name: user[0].name || '',
          email: user[0].email,
          role: 'user', // Default role
        },
      };
    }

    throw new Error('Database connection not available');
  } catch (error) {
    logger.error('Login error', error);
    throw error;
  }
}

/**
 * Get user's role in an organization
 * Simplified for development
 */
async function getUserRole(userId: number, organizationId: number) {
  // For development, return a default role
  return 'admin';
}

/**
 * Verify password
 * This is a simplified example - in a real application, you would use bcrypt
 */
function verifyPassword(password: string, hash: string) {
  // In a real application, you would use bcrypt.compare or similar
  // This is a simplified example for development
  if (hash.startsWith('temp_')) {
    // Temporary password for new users
    return password === hash.substring(5);
  }

  // For development, we'll just compare plaintext or return true if hash is empty
  return hash === '' || password === hash;
}

// --- Express Router export so `server/index.ts` can mount auth routes ---
const router = Router();

// POST /login -> { email, password }
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await login(email, password);
    return res.json(result);
  } catch (err: any) {
    logger.error('Login route error', err);
    return res.status(401).json({ error: err?.message || 'Login failed' });
  }
});

// Simple healthcheck for auth
router.get('/ping', (req: Request, res: Response) => {
  res.json({ ok: true, service: 'auth' });
});

export { router };
