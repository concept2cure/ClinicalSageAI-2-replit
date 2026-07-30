/**
 * Authentication and Authorization Middleware
 *
 * This file contains middleware functions for authentication and authorization.
 *
 */
import { Request, Response, NextFunction } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { organizationUsers, users } from '../shared/schema';
import { createScopedLogger } from './utils/logger';
import { db } from './db';
import jwt from 'jsonwebtoken';
import { config } from './config/environment';
import { verifyJwtWithRotation } from './utils/jwtVerify';
import { requireAccessTokenReason } from './middleware/tokenType';

const logger = createScopedLogger('auth');


const parseFiniteInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    // Only a string that is ENTIRELY an integer may parse. Number.parseInt is a
    // prefix parser — parseInt('3f1c2a10-0000-…', 10) === 3 — so a UUID JWT
    // subject silently became a valid-looking integer user id (here, user 3, a
    // DIFFERENT real user). enforceOrgMembership then re-checked membership for
    // the wrong user, and on the authoring surface (UUID subjects) 503'd every
    // request when the integer-keyed organization_users had no such row. A
    // non-integer subject must yield null so the caller treats it as "no numeric
    // identity", never as a truncated one. See ledger C-21.
    if (!/^[+-]?\d+$/.test(value.trim())) return null;
    const parsed = Number.parseInt(value.trim(), 10);
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


/**
 * Canonical, fully-resolved identity for an authenticated request.
 *
 * The legacy request fields (`req.userId`, `req.user`, `req.tenantContext`)
 * are typed `number | string` because several middlewares share the same
 * global augmentation, and they historically mixed parsed numbers with raw
 * token strings — the ambiguity behind the C-21 UUID-truncation defect.
 * `req.identity` is the unambiguous shape: every field has exactly one type,
 * the raw token subject is preserved as provenance, and the resolved legacy
 * integer id is separate from it. New code should read identity from here.
 */
export interface AuthenticatedIdentity {
  /** The raw, untranslated subject claim from the verified token. */
  externalSubject: string;
  /** Which authentication surface issued the token (e.g. 'local-jwt', 'saml'). */
  provider: string;
  /** Resolved integer user id in the platform's membership model. */
  legacyUserId: number;
  /** Organization the request is scoped to (verified membership). */
  organizationId: number;
  /** Role from the organization membership row — never from the token. */
  role: string;
  email: string | null;
}

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
      identity?: AuthenticatedIdentity;
    }
  }
}

/**
 * Authentication middleware
 * Validates Bearer JWT tokens only.
 * Sets req.userId, req.userRole, req.userEmail, req.tenantId, req.tenantContext.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
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
        type?: string;
        role?: string;
        provider?: string;
        mfaPending?: boolean;
      }>(token);

      // SECURITY: the access path requires an explicit `type: 'access'` claim.
      // Refresh / MFA-challenge / MFA-partial tokens are rejected as before,
      // but so is every unknown or absent token class — the expected class is
      // positively asserted, not inferred from the absence of known-bad ones.
      if (requireAccessTokenReason(decoded)) {
        return res.status(401).json({ error: 'Token is not valid for this operation' });
      }

      if (!decoded.userId || !decoded.organizationId) {
        return res.status(401).json({ error: 'Invalid token payload' });
      }

      const parsedUserId = parseFiniteInt(decoded.userId);
      const parsedOrganizationId = parseFiniteInt(decoded.organizationId);
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
      if (membership.length === 0 || parsedUserId === null || parsedOrganizationId === null) {
        return res.status(401).json({ error: 'Invalid tenant membership' });
      }
      const resolvedRole = membership[0].role;

      // Past the membership gate both ids are verified integers, so every
      // legacy field gets ONE consistent representation (numbers, not a mix of
      // parsed numbers and raw token strings). The raw subject survives on
      // req.identity.externalSubject as provenance.
      req.identity = {
        externalSubject: String(decoded.userId),
        provider: typeof decoded.provider === 'string' ? decoded.provider : 'local-jwt',
        legacyUserId: parsedUserId,
        organizationId: parsedOrganizationId,
        role: resolvedRole,
        email: decoded.email ?? null,
      };

      req.userId = parsedUserId;
      req.userRole = resolvedRole;
      req.userEmail = decoded.email;
      req.tenantId = parsedOrganizationId;
      req.user = {
        id: parsedUserId,
        userId: parsedUserId,
        email: decoded.email,
        role: resolvedRole,
        organizationId: parsedOrganizationId,
      };
      req.tenantContext = {
        organizationId: parsedOrganizationId,
        userId: parsedUserId,
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

    // Load ALL memberships in a deterministic order. Selection is explicit:
    // the user's defaultOrganizationId wins when a membership for it exists;
    // otherwise the lowest organizationId. Previously an unordered `.limit(1)`
    // let the database pick whichever row it returned first, so a
    // multi-organization user could land in a different tenant per login.
    const memberships = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
      })
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, user[0].id))
      .orderBy(asc(organizationUsers.organizationId));

    if (memberships.length === 0) {
      throw new Error('User has no organization membership');
    }

    const membership =
      (user[0].defaultOrganizationId != null
        ? memberships.find(m => m.organizationId === user[0].defaultOrganizationId)
        : undefined) ?? memberships[0];

    const token = jwt.sign(
      {
        userId: String(user[0].id),
        email: user[0].email,
        organizationId: String(membership.organizationId),
        role: membership.role,
        type: 'access',
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
        role: membership.role,
      },
      organizationId: membership.organizationId,
      // Surfaced so callers can offer an explicit organization switch instead
      // of silently accepting the default selection.
      availableOrganizations: memberships.map(m => ({
        organizationId: m.organizationId,
        role: m.role,
      })),
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
