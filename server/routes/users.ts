/**
 * Users Routes - Concept2Cure V2
 *
 * Provides user-related endpoints for the portal.
 *
 * @version 2.0.0
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { runWithTenantScope } from '../db/tenantStore';
import { and, eq } from 'drizzle-orm';
import { users, organizations, organizationUsers, notificationPreferences } from '../../shared/schema';
import {
  REPORT_PERSONAS,
  isReportPersona,
} from '../../shared/constants/domain/report-personas';

import { verifyLiveToken, SessionEndedError } from '../services/token-revocation';
import { requireAccessTokenReason } from '../middleware/tokenType';
import { pickWritable } from '../utils/authedOrgId';
import { isDevAuthAllowed } from '../auth/dev-auth-policy.js';
import { sessionMfaFields } from '../services/mfa-enrolment';

const router = Router();

/** What PATCH /me/notifications may write: the preferences, not the row's id or
 *  owner. See the handler (ledger L195). */
const NOTIFICATION_PREFERENCE_FIELDS = [
  'emailMentions',
  'emailShares',
  'emailApprovals',
  'emailCompliance',
  'emailSystem',
  'emailDigest',
  'inAppMentions',
  'inAppShares',
  'inAppApprovals',
  'inAppCompliance',
  'inAppSystem',
  'toastEnabled',
  'toastDuration',
  'toastPosition',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'timezone',
  'autoFollowOnInteraction',
  'soundEnabled',
  'metadata',
] as const satisfies readonly (keyof typeof notificationPreferences.$inferInsert & string)[];

/**
 * A live ACCESS token's claims. verifyLiveToken alone accepts any live token
 * signed with this key, a pre-MFA one included, and this router is mounted
 * pre-auth-scoped, so the /api boundary in front of it may be in warn mode (it
 * is outside production). Every handler here reads or writes the signed-in
 * user's own account, which a password-only session must not reach (ledger
 * L195). A refused token is a SessionEndedError, which isSessionError below
 * already answers with 401.
 */
async function verifyAccessToken<T = unknown>(token: string): Promise<T> {
  const decoded = await verifyLiveToken<T>(token);
  if (requireAccessTokenReason(decoded as Parameters<typeof requireAccessTokenReason>[0])) {
    throw new SessionEndedError();
  }
  return decoded;
}

/**
 * A bearer token that does not verify, has expired, or belongs to a session
 * that was signed out (verifyLiveToken, AUTH-03): an authentication failure,
 * answered 401, never a 500.
 */
function isSessionError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'JsonWebTokenError' || name === 'TokenExpiredError' || name === 'SessionEndedError';
}

// SECURITY: the dev-user fallback (synthetic user / faked mutation responses
// below) is only active when the canonical dev-auth gate allows it — i.e.
// BOTH NODE_ENV==='development' AND ALLOW_DEV_AUTH==='1'. Gating on NODE_ENV
// alone was unsafe: any environment an operator accidentally flipped to
// "development" (staging, beta, e2e) would have served the fallback. Routed
// through isDevAuthAllowed() so this file is covered by the same policy and
// CI guard (check-no-dev-auth-in-prod.mjs) as the rest of the auth surface.
const isDev = isDevAuthAllowed();

// Dev user response — uses 'user' role (not admin) to match least-privilege principle
const devUserResponse = {
  id: 1,
  username: 'developer',
  email: 'developer@trialsage.ai',
  firstName: 'Dev',
  lastName: 'User',
  displayName: 'Dev User',
  role: 'user',
  roles: ['user'],
  permissions: [],
  organizationId: '2',
  organizationName: 'Concept2Cure Demo',
  mfaEnabled: false,
  mfaMethods: [],
  mustChangePassword: false,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
};

/**
 * GET /api/users/me or /api/user/me, and the legacy root GET /api/user(s):
 * the session's own account. One handler for both. The root had its own, which
 * answered every account organizationId '2' and role 'user' whatever the
 * session said. Every field here is the session's or the database's, or null
 * when it has none to give.
 */
async function currentUser(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    const decoded = (await verifyAccessToken(token)) as {
      userId: string;
      email: string;
      organizationId: string;
      role?: string;
    };

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(decoded.userId)))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const userData = user[0];
    const [firstName = '', ...lastNameParts] = (userData.name || '').split(' ');
    const lastName = lastNameParts.join(' ');

    // Get organization name + client type (Phase 10.2 — tenant IA for the
    // biopharma shell; medtech | biotech | pharma). Null when the session names
    // no organization this database holds: it used to answer "Concept2Cure
    // Demo" / "pharma", an organization nobody belongs to.
    let orgName: string | null = null;
    let orgClientType: string | null = null;
    if (decoded.organizationId) {
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, parseInt(decoded.organizationId)))
        .limit(1);
      if (org.length) {
        orgName = org[0].name;
        orgClientType = org[0].clientType ?? null;
      }
    }

    res.json({
      id: userData.id.toString(),
      email: userData.email,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`.trim() || userData.email,
      title: userData.title || '',
      department: userData.department || '',
      bio: userData.bio || '',
      avatar: userData.avatar || null,
      preferences: userData.preferences || {},
      // The session's role, as GET /api/v1/auth/session reports it. This said
      // ['user'] for everyone, and carried an always-empty `permissions` list.
      roles: decoded.role ? [decoded.role] : [],
      organizationId: decoded.organizationId,
      organizationName: orgName,
      organizationClientType: orgClientType,
      // One reading of the account, the session's (mfa-enrolment.ts); mfaMethods
      // was the literal [] until 2026-09-23 (VSR-001 §13.3 item 4).
      ...sessionMfaFields(userData),
      mustChangePassword: userData.mustChangePassword === true,
      avatarUrl: userData.avatar || null,
      createdAt: userData.createdAt?.toISOString() ?? null,
      // Null for an account that has never signed in; this used to answer the
      // moment of the request.
      lastLoginAt: userData.lastLogin?.toISOString() ?? null,
    });
  } catch (error: any) {
    if (isSessionError(error)) {
      return res.status(401).json({
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }

    console.error('[users] Get user error:', error.message);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get user profile' },
    });
  }
}

router.get('/', currentUser);
router.get('/me', currentUser);

/**
 * PATCH /api/users/me
 * Update current user profile
 */
router.patch('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (isDev && !token) {
      return res.json({ success: true, message: 'Profile updated (dev mode)' });
    }

    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }

    const decoded = (await verifyAccessToken(token)) as { userId: string };
    const userId = parseInt(decoded.userId);

    const { name, title, department, bio, avatar, preferences } = req.body;

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateFields.name = name;
    if (title !== undefined) updateFields.title = title;
    if (department !== undefined) updateFields.department = department;
    if (bio !== undefined) updateFields.bio = bio;
    if (avatar !== undefined) updateFields.avatar = avatar;
    if (preferences !== undefined) updateFields.preferences = preferences;

    const [updated] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    res.json({
      success: true,
      user: {
        id: updated.id.toString(),
        email: updated.email,
        name: updated.name,
        title: updated.title,
        department: updated.department,
        bio: updated.bio,
        avatar: updated.avatar,
        preferences: updated.preferences,
      },
    });
  } catch (error: unknown) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Update profile error:', error);
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' } });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 10.2 — per-user UI preferences (PHASE_10_2_INSTALL.md §4).
// Display preferences only; merge-patched into users.preferences (jsonb).
// Allowed keys are validated explicitly — unknown keys are rejected so the
// column never accumulates unaudited state.
// ───────────────────────────────────────────────────────────────────────────

const PREFERENCE_KEYS = [
  'density',
  'railGroups',
  'dockOpen',
  // Translation-workspace per-user prefs (ui-v2 OnboardingWizard / editor
  // Trans dock). Org-wide policy lives on organizations.settings.translation.
  'txwEnabled',
  'txwLangs',
  'txwRole',
  'txwAutoOpenSegments',
  // First-run onboarding wizard: set true when the user finishes (or skips)
  // the wizard so it never re-appears on another device/browser.
  'onboardingComplete',
] as const;
const DENSITY_VALUES = ['compact', 'comfortable', 'spacious'] as const;
const TXW_ROLE_VALUES = ['post_editor', 'reviewer', 'observer'] as const;

/**
 * Validate a preferences merge-patch body. Returns an error string when the
 * patch is invalid, otherwise null. A key set to `null` removes it (RFC 7396
 * merge-patch semantics at the top level).
 */
function validatePreferencesPatch(patch: unknown): string | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return 'Body must be a JSON object of preference keys';
  }
  const entries = Object.entries(patch as Record<string, unknown>);
  if (entries.length === 0) return 'Empty preferences patch';
  for (const [key, value] of entries) {
    if (!(PREFERENCE_KEYS as readonly string[]).includes(key)) {
      return `Unknown preference key: ${key}`;
    }
    if (value === null) continue; // null deletes the key
    if (key === 'density') {
      if (typeof value !== 'string' || !(DENSITY_VALUES as readonly string[]).includes(value)) {
        return `density must be one of ${DENSITY_VALUES.join(' | ')}`;
      }
    }
    if (key === 'dockOpen' && typeof value !== 'boolean') {
      return 'dockOpen must be a boolean';
    }
    if (key === 'railGroups') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'railGroups must be an object of group id -> open boolean';
      }
      const groups = Object.entries(value as Record<string, unknown>);
      if (groups.length > 32) return 'railGroups has too many entries';
      for (const [gid, open] of groups) {
        if (gid.length > 64) return 'railGroups key too long';
        if (typeof open !== 'boolean') return 'railGroups values must be booleans';
      }
    }
    if (
      (key === 'txwEnabled' || key === 'txwAutoOpenSegments' || key === 'onboardingComplete') &&
      typeof value !== 'boolean'
    ) {
      return `${key} must be a boolean`;
    }
    if (key === 'txwLangs') {
      if (!Array.isArray(value) || value.length > 24 ||
          value.some(v => typeof v !== 'string' || v.length === 0 || v.length > 16)) {
        return 'txwLangs must be an array of up to 24 short language tags';
      }
    }
    if (key === 'txwRole') {
      if (typeof value !== 'string' || !(TXW_ROLE_VALUES as readonly string[]).includes(value)) {
        return `txwRole must be one of ${TXW_ROLE_VALUES.join(' | ')}`;
      }
    }
  }
  return null;
}

/**
 * GET /api/users/me/preferences
 * Read the session user's UI preferences (density, railGroups, dockOpen).
 * Self-only — the user id comes from the verified JWT.
 */
router.get('/me/preferences', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }

    const decoded = (await verifyAccessToken(token)) as { userId: string };
    const userId = parseInt(decoded.userId);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }

    const rows = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!rows.length) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    return res.json({ preferences: rows[0].preferences ?? {} });
  } catch (error: any) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Get preferences error:', error);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get preferences' } });
  }
});

/**
 * PUT /api/users/me/preferences
 * Merge-patch the session user's UI preferences. Self-only — the user id
 * comes from the verified JWT; no other user's row is reachable from here.
 * Allowed keys: density | railGroups | dockOpen. Unknown keys are rejected.
 */
router.put('/me/preferences', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }

    const decoded = (await verifyAccessToken(token)) as { userId: string };
    const userId = parseInt(decoded.userId);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }

    const patch = req.body as Record<string, unknown>;
    const validationError = validatePreferencesPatch(patch);
    if (validationError) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: validationError } });
    }

    // Read-merge-write via Drizzle (no raw SQL — tenant-isolation gate scans
    // raw SQL strings). Display preferences are low-contention; last write
    // wins is acceptable here.
    const rows = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!rows.length) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const current =
      rows[0].preferences && typeof rows[0].preferences === 'object' && !Array.isArray(rows[0].preferences)
        ? (rows[0].preferences as Record<string, unknown>)
        : {};

    const next: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete next[key];
      else next[key] = value;
    }

    const [updated] = await db
      .update(users)
      .set({ preferences: next, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ preferences: users.preferences });

    if (!updated) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    return res.json({ success: true, preferences: updated.preferences ?? {} });
  } catch (error: any) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Update preferences error:', error);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update preferences' } });
  }
});

/**
 * GET /api/users/me/persona
 * The session user's job persona for their current org (from
 * organization_users.persona), plus their access role and the canonical
 * vocabulary the client can offer. Self + org-scoped from the verified JWT.
 */
router.get('/me/persona', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }
    const decoded = (await verifyAccessToken(token)) as { userId: string; organizationId?: string };
    const userId = parseInt(decoded.userId);
    const organizationId = parseInt(String(decoded.organizationId ?? ''));
    if (!Number.isFinite(userId) || !Number.isFinite(organizationId)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }

    const rows = await db
      .select({ persona: organizationUsers.persona, role: organizationUsers.role })
      .from(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.organizationId, organizationId)))
      .limit(1);

    if (!rows.length) {
      return res.status(404).json({ error: { code: 'MEMBERSHIP_NOT_FOUND', message: 'No membership in this organization' } });
    }

    return res.json({
      persona: rows[0].persona ?? null,
      role: rows[0].role,
      availablePersonas: REPORT_PERSONAS,
    });
  } catch (error: any) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Get persona error:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get persona' } });
  }
});

/**
 * PUT /api/users/me/persona
 * Set (or clear, with null) the session user's persona for their current org.
 * Self + org-scoped from the verified JWT — no other user/org row is reachable.
 * `persona` must be one of REPORT_PERSONAS, or null to unset. Persona is NOT an
 * authorization boundary; it only personalizes surfaces.
 */
router.put('/me/persona', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }
    const decoded = (await verifyAccessToken(token)) as { userId: string; organizationId?: string };
    const userId = parseInt(decoded.userId);
    const organizationId = parseInt(String(decoded.organizationId ?? ''));
    if (!Number.isFinite(userId) || !Number.isFinite(organizationId)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }

    const { persona } = (req.body ?? {}) as { persona?: unknown };
    if (persona !== null && !isReportPersona(persona)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'persona must be one of the canonical personas, or null to clear',
          availablePersonas: REPORT_PERSONAS,
        },
      });
    }

    // /api/users runs in the pre-auth scope. A membership row is written only in
    // its own organisation's scope (D3, 2026-09-26;
    // docs/evidence/D3/2026-09-26-memberships/), so this write runs in the
    // verified token's organisation — the one the WHERE clause names. Awaited
    // inside the scope: a Drizzle builder is lazy, and one returned unawaited
    // would start after the scope had exited.
    const [updated] = await runWithTenantScope(
      { tenantId: String(organizationId), role: null, source: 'request', caller: 'users:PUT /me/persona' },
      async () =>
        await db
          .update(organizationUsers)
          .set({ persona: (persona as string | null), updatedAt: new Date() })
          .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.organizationId, organizationId)))
          .returning({ persona: organizationUsers.persona, role: organizationUsers.role })
    );

    if (!updated) {
      return res.status(404).json({ error: { code: 'MEMBERSHIP_NOT_FOUND', message: 'No membership in this organization' } });
    }

    return res.json({ success: true, persona: updated.persona ?? null, role: updated.role });
  } catch (error: any) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Update persona error:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update persona' } });
  }
});

/**
 * GET /api/users/me/notifications
 * Get notification preferences for current user
 */
router.get('/me/notifications', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (isDev && !token) {
      return res.json({
        emailMentions: true,
        emailApprovals: true,
        inAppMentions: true,
        inAppApprovals: true,
        toastEnabled: true,
        soundEnabled: false,
      });
    }

    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }

    const decoded = (await verifyAccessToken(token)) as { userId: string };
    const userId = parseInt(decoded.userId);

    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (!prefs.length) {
      return res.json({
        emailMentions: true,
        emailApprovals: true,
        emailCompliance: true,
        emailSystem: true,
        emailDigest: 'weekly',
        inAppMentions: true,
        inAppApprovals: true,
        inAppCompliance: true,
        inAppSystem: true,
        toastEnabled: true,
        toastDuration: 5000,
        soundEnabled: false,
        timezone: 'America/New_York',
      });
    }

    res.json(prefs[0]);
  } catch (error: unknown) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Get notifications error:', error);
    res
      .status(500)
      .json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get notification preferences' },
      });
  }
});

/**
 * PATCH /api/users/me/notifications
 * Update notification preferences
 */
router.patch('/me/notifications', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (isDev && !token) {
      return res.json({ success: true, message: 'Notification preferences updated (dev mode)' });
    }

    if (!token) {
      return res.status(401).json({ error: { code: 'AUTH_006', message: 'No token provided' } });
    }

    const decoded = (await verifyAccessToken(token)) as { userId: string };
    const userId = parseInt(decoded.userId);

    // Preferences only. The body was written as-is, so `userId` in it moved this
    // row onto another user, or created one for them (ledger L195): the table
    // is keyed on user_id alone, with no organization column and no RLS policy.
    const updates = {
      ...pickWritable<typeof notificationPreferences.$inferInsert>(req.body, NOTIFICATION_PREFERENCE_FIELDS),
      updatedAt: new Date(),
    };

    // Upsert notification preferences
    const existing = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (existing.length) {
      await db
        .update(notificationPreferences)
        .set(updates)
        .where(eq(notificationPreferences.userId, userId));
    } else {
      await db.insert(notificationPreferences).values({ ...updates, userId });
    }

    res.json({ success: true, message: 'Notification preferences updated' });
  } catch (error: unknown) {
    if (isSessionError(error)) {
      return res.status(401).json({ error: { code: 'AUTH_005', message: 'Session expired' } });
    }
    console.error('[users] Update notifications error:', error);
    res
      .status(500)
      .json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update notification preferences' },
      });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID (only matches numeric IDs)
 * Requires authentication — user can only fetch users within their own org
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (isDev && !token) {
      return res.json(devUserResponse);
    }

    if (!token) {
      return res.status(401).json({
        error: { code: 'AUTH_006', message: 'No token provided' },
      });
    }

    const decoded = (await verifyAccessToken(token)) as {
      userId: string;
      organizationId?: string;
    };

    const idRaw = req.params.id;
    const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? '');

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(String(id))))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const userData = user[0];
    const [firstName = '', ...lastNameParts] = (userData.name || '').split(' ');
    const lastName = lastNameParts.join(' ');

    // Tenant isolation: only return user if they belong to the same org
    const requestorOrgId = decoded.organizationId;
    const targetOrgId = userData.defaultOrganizationId?.toString();
    if (requestorOrgId !== targetOrgId) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    res.json({
      id: userData.id.toString(),
      email: userData.email,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`.trim() || userData.email,
      roles: ['user'],
      organizationId: targetOrgId,
    });
  } catch (error: any) {
    if (isSessionError(error)) {
      if (isDev) return res.json(devUserResponse);
      return res.status(401).json({
        error: { code: 'AUTH_005', message: 'Session expired' },
      });
    }
    console.error('[users] Get user by ID error:', error);
    if (isDev) return res.json(devUserResponse);

    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get user' },
    });
  }
});

/**
 * POST /login, /logout, /register — answered by the canonical routes.
 *
 * These were parallel implementations of sign-in, sign-out and sign-up, mounted
 * at /api/users and /api/user ahead of the /api gate. /login checked the
 * password alone and issued a 24-hour access token: no second factor, no
 * lockout, no audit record, for users who had enrolled an authenticator. It
 * was a way around MFA for every account. /logout reported success and revoked
 * nothing. /register created an account with no organisation outside signup
 * and its admission control, and gave it a token.
 *
 * Nothing in the client called them (the sign-in page uses /api/v1/auth). They
 * now answer the way the platform's own /api/login, /api/logout and
 * /api/register already do (register-platform-routes.ts): a 307 to the
 * canonical route in server/routes/auth.ts, which keeps the method and body.
 * Reachability of the replacements is pinned by
 * tests/db/sign-in-audit-trail.dbtest.ts (the login and register paths) and by
 * OQ-PROJ-02 / OQ-PROJ-16.
 */
router.post('/login', (_req: Request, res: Response) => res.redirect(307, '/api/auth/login'));
router.post('/logout', (_req: Request, res: Response) => res.redirect(307, '/api/auth/logout'));
router.post('/register', (_req: Request, res: Response) => res.redirect(307, '/api/auth/signup'));

export default router;
