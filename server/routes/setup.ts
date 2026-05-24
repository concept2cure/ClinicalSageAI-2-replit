/**
 * First-run setup for private / single-tenant installs.
 *
 * POST /api/setup/initialize creates the first organization + admin user on a
 * fresh install. It is open (no session auth) but self-closing: once any user
 * exists it returns 409, so it can only ever run once on an empty database.
 * This replaces the publicly-known demo admin (SEED_DEMO_USER=false) for real
 * private deployments — the operator creates their own admin on first boot.
 */
import { Router, type Request, type Response } from 'express';
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

router.post('/initialize', setupLimiter, async (req: Request, res: Response) => {
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

    const policy = validatePasswordPolicy(password);
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

    const result = await db.transaction(async tx => {
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
      return { org, user };
    });

    logger.info('First-run setup completed', { orgId: result.org.id });

    const token = jwt.sign(
      {
        userId: result.user.id.toString(),
        email: result.user.email,
        organizationId: result.org.id.toString(),
        organizationUuid: result.org.uuid,
        role: 'admin',
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
    logger.error('Setup initialize error', { err: error?.message ?? String(error) });
    return res
      .status(500)
      .json({ success: false, error: { code: 'SETUP_FAILED', message: 'Failed to initialize install' } });
  }
});

export default router;
