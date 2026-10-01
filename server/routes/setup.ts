/**
 * First-run setup for private / single-tenant installs.
 *
 * POST /api/setup/initialize creates the first organization + admin user on a
 * fresh install. It is open (no session auth) but self-closing: once any user
 * exists it returns 409, so it can only ever run once on an empty database.
 * This replaces the publicly-known demo admin (SEED_DEMO_USER=false) for real
 * private deployments — the operator creates their own admin on first boot.
 *
 * ── Who may run it (D1, 2026-10-01) ──────────────────────────────────────────
 * The first account becomes the first administrator, with no e-mail
 * verification and a session in the response. Open to anyone, a fresh
 * deployment belonged to whoever reached it first, who could also register the
 * owner's own address: the one PLATFORM_ADMIN_EMAILS and BUSINESS_CENTER_EMAILS
 * name (terraform/stack), which admits that account to every organisation. So
 * in production the route takes the deployment's own secret, SETUP_TOKEN (the
 * stack generates it into Secrets Manager), in the X-Setup-Token header, and is
 * closed without one. Holding that secret is the operator's proof of authority,
 * which is why the address it names is not verified by mail. Elsewhere a
 * configured token is required too; with none the route stays open for local
 * installs.
 *
 * Two first calls at once both passed the user count and both created an
 * organisation and an administrator. The create transaction now takes an
 * advisory lock and counts again under it.
 */
import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { users, organizations, organizationUsers } from '../../shared/schema';
import { validatePasswordPolicy } from '../services/auth-security-service';
import { config } from '../config/environment';
import { createScopedLogger } from '../utils/logger.js';
import { assertCanAdmitNewTenant } from '../db/tenantAdmission';
import { provisionLaunchModules } from '../services/entitlements/launch-scope.js';
import { openSession } from '../services/session-inactivity';
import {
  drizzleWorkspaceStore,
  ensureOrganizationDefaultWorkspace,
} from '../services/c2c/organization-default-workspace';

const logger = createScopedLogger('setup');
const router = Router();

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const initializeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().min(1).optional(),
  organizationName: z.string().min(2),
});

/** The header that carries the deployment's setup token. */
export const SETUP_TOKEN_HEADER = 'X-Setup-Token';
/** Shorter than this is not a secret; a deployment configured with one is closed. */
const SETUP_TOKEN_MIN_LENGTH = 32;

type SetupGate = { ok: true } | { ok: false; status: 403; code: 'SETUP_CLOSED' | 'SETUP_TOKEN_INVALID'; message: string };

/** Whether this request may run first-run setup (module header, "Who may run it"). */
function setupTokenGate(req: Request): SetupGate {
  const configured = process.env.SETUP_TOKEN ?? '';
  const production = process.env.NODE_ENV === 'production';
  if (!configured && !production) return { ok: true };
  if (configured.length < SETUP_TOKEN_MIN_LENGTH) {
    return {
      ok: false,
      status: 403,
      code: 'SETUP_CLOSED',
      message: 'First-run setup is closed on this deployment: it needs the setup token the deployment was created with (SETUP_TOKEN), and none is configured.',
    };
  }
  const presented = req.get(SETUP_TOKEN_HEADER) ?? '';
  const digest = (v: string) => crypto.createHash('sha256').update(v, 'utf8').digest();
  if (!presented || !crypto.timingSafeEqual(digest(presented), digest(configured))) {
    return {
      ok: false,
      status: 403,
      code: 'SETUP_TOKEN_INVALID',
      message: `The setup token in ${SETUP_TOKEN_HEADER} is missing or does not match this deployment's.`,
    };
  }
  return { ok: true };
}

/** Middleware form of {@link setupTokenGate}: refuses before the body is read. */
function requireSetupToken(req: Request, res: Response, next: NextFunction): void {
  const gate = setupTokenGate(req);
  if (gate.ok) return next();
  logger.warn('First-run setup refused', { code: gate.code });
  res.status(gate.status).json({ success: false, error: { code: gate.code, message: gate.message } });
}

/** Thrown inside the create transaction when another first call got there first. */
class AlreadyInitializedError extends Error {}

async function userCount(): Promise<number> {
  const [row] = await db!.select({ count: sql<number>`count(*)::int` }).from(users);
  return row?.count ?? 0;
}

/** Whether the install still needs first-run setup (no users yet). */
router.get('/status', async (_req: Request, res: Response) => {
  if (!db) return res.status(503).json({ initialized: false, error: 'DB_UNAVAILABLE' });
  try {
    res.json({ initialized: (await userCount()) > 0 });
  } catch (error: any) {
    logger.error('Setup status error', { err: error?.message ?? String(error) });
    res.status(500).json({ initialized: false, error: 'STATUS_FAILED' });
  }
});

router.post('/initialize', setupLimiter, requireSetupToken, async (req: Request, res: Response) => {
  if (!db) {
    return res
      .status(503)
      .json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database connection not available' } });
  }

  try {
    const parsed = initializeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid input' },
      });
    }

    const { password, organizationName } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();
    const name = parsed.data.name?.trim() || email.split('@')[0];

    const policy = validatePasswordPolicy(password, { email, name, organizationName });
    if (!policy.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'WEAK_PASSWORD', message: policy.errors[0], details: { errors: policy.errors } },
      });
    }

    // Self-closing gate: only runs on an empty install.
    if ((await userCount()) > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_INITIALIZED', message: 'Setup has already been completed' },
      });
    }

    const slug =
      organizationName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'default';
    const tier = config.singleTenant.defaultOrgTier || 'enterprise';

    // Tenant isolation posture: refuse to make this deployment multi-tenant while
    // Postgres RLS is not filtering rows. No-ops locally and for the founding
    // organization. See server/db/tenantAdmission.ts.
    await assertCanAdmitNewTenant();

    const result = await db.transaction(async tx => {
      // One first call at a time, and the count again under the lock: two
      // concurrent calls both passed the count above.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('c2c:first-run-setup'))`);
      // tenant-isolation-safe: first-run setup counts every account on the install, before any tenant exists
      const { rows } = await tx.execute(sql`SELECT count(*)::int AS count FROM users`);
      if (Number((rows[0] as { count?: unknown } | undefined)?.count ?? 0) > 0) throw new AlreadyInitializedError();

      const [org] = await tx
        .insert(organizations)
        .values({ name: organizationName, slug, industryMode: 'biotech', tier })
        .returning();

      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await tx
        .insert(users)
        .values({ email, passwordHash, name, defaultOrganizationId: org.id })
        .returning();

      await tx.insert(organizationUsers).values({ organizationId: org.id, userId: user.id, role: 'admin' });

      // The organisation's own client workspace, SAME transaction — the PM
      // spine's NOT NULL parent. Without it every program this install creates
      // is unanchored and its governed artifacts stay out of the registry.
      // See services/c2c/organization-default-workspace.ts.
      await ensureOrganizationDefaultWorkspace(drizzleWorkspaceStore(tx), {
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        userId: user.id,
      });

      return { org, user };
    });

    // Launch catalog on by default (docs/LAUNCH_DEFINITION_OF_DONE.md, D2).
    // Outside the transaction on purpose: the grant writer holds its own
    // connection, and an organisation that fails to provision must still
    // exist so an administrator can provision it by hand. Failures are
    // logged by the service and returned; they do not fail the signup.
    await provisionLaunchModules(result.org.id, { actorEmail: null });

    logger.info('First-run setup completed', { orgId: result.org.id });

    // The bootstrap token is a session like any sign-in's: its id, start and
    // idle window from the new organisation's settings, registered against the
    // account's concurrent-session limit (P1-1; P1-38 brought this door in).
    const session = await openSession(result.user.id, result.org.settings);
    const token = jwt.sign(
      {
        userId: result.user.id.toString(),
        email: result.user.email,
        organizationId: result.org.id.toString(),
        organizationUuid: result.org.uuid,
        role: 'admin',
        type: 'access',
        ...session,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return res.status(201).json({
      success: true,
      token,
      organization: { id: result.org.id, name: result.org.name, uuid: result.org.uuid },
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
    });
  } catch (error: any) {
    if (error instanceof AlreadyInitializedError) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_INITIALIZED', message: 'Setup has already been completed' },
      });
    }
    logger.error('Setup initialize error', { err: error?.message ?? String(error) });
    return res
      .status(500)
      .json({ success: false, error: { code: 'SETUP_FAILED', message: 'Failed to initialize install' } });
  }
});

export default router;
