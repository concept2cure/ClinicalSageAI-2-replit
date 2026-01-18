import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { organizations, users, organizationUsers } from '../../shared/schema.ts';
import { eq, sql } from 'drizzle-orm';
import { authenticateToken } from '../auth.js';
import { sendWelcomeEmail } from '../utils/email.js';

const router = express.Router();

const slugify = value =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 64) || 'org';

const buildUniqueSlug = async base => {
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!existing.length) return slug;
    slug = `${base}-${suffix}`.slice(0, 64);
    suffix += 1;
  }
};

const generateTempPassword = () => `C2C-${Math.random().toString(36).slice(2, 8)}!A1`;

const requireAdmin = (req, res, next) => {
  const role = req.user?.role;
  if (!role || (role !== 'admin' && role !== 'super_admin')) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  return next();
};

router.use(authenticateToken, requireAdmin);

router.post('/create-client', async (req, res) => {
  try {
    const { companyName, adminEmail, adminName, industry, useCase } = req.body || {};

    if (!companyName || !adminEmail || !adminName || !industry) {
      return res.status(400).json({
        success: false,
        message: 'Company name, admin email, admin name, and industry are required.',
      });
    }

    const baseSlug = slugify(companyName);
    const slug = await buildUniqueSlug(baseSlug);

    const [org] = await db
      .insert(organizations)
      .values({
        name: companyName,
        slug,
        status: 'active',
        settings: {
          industry,
          useCase,
        },
      })
      .returning();

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [user] = await db
      .insert(users)
      .values({
        email: adminEmail.toLowerCase(),
        name: adminName,
        passwordHash,
        status: 'active',
        defaultOrganizationId: org.id,
      })
      .returning();

    await db.insert(organizationUsers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'admin',
    });

    await sendWelcomeEmail(user.email, org.name, tempPassword);

    res.json({
      success: true,
      organization: org,
      user,
      tempPassword,
    });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ success: false, message: 'Failed to create client.' });
  }
});

const onboardingFilter = sql`${organizations.settings} ->> 'requestedBy' IS NOT NULL`;

const approveOnboardingUser = async userId => {
  const [membership] = await db
    .select()
    .from(organizationUsers)
    .where(eq(organizationUsers.userId, userId))
    .limit(1);

  if (!membership) {
    return { error: { status: 404, message: 'User membership not found' } };
  }

  await db
    .update(users)
    .set({ status: 'active' })
    .where(eq(users.id, userId));

  await db
    .update(organizationUsers)
    .set({ role: 'admin' })
    .where(eq(organizationUsers.id, membership.id));

  await db
    .update(organizations)
    .set({ status: 'active' })
    .where(eq(organizations.id, membership.organizationId));

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  if (user && org) {
    await sendWelcomeEmail(user.email, org.name, 'Use your existing password to sign in.');
  }

  return { user, org };
};

router.get('/onboarding/pending', async (req, res) => {
  try {
    const rows = await db
      .select({
        membershipId: organizationUsers.id,
        membershipRole: organizationUsers.role,
        membershipCreatedAt: organizationUsers.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userTitle: users.title,
        userStatus: users.status,
        userCreatedAt: users.createdAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgStatus: organizations.status,
        orgSettings: organizations.settings,
        orgCreatedAt: organizations.createdAt,
      })
      .from(organizationUsers)
      .innerJoin(users, eq(organizationUsers.userId, users.id))
      .innerJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(onboardingFilter)
      .orderBy(organizationUsers.createdAt);

    const payload = rows.map(row => ({
      id: row.membershipId,
      createdAt: row.membershipCreatedAt,
      org: {
        id: row.orgId,
        name: row.orgName,
        status: row.orgStatus,
        settings: row.orgSettings,
        createdAt: row.orgCreatedAt,
      },
      user: {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        title: row.userTitle,
        status: row.userStatus,
        role: row.membershipRole,
        createdAt: row.userCreatedAt,
      },
    }));

    res.json(payload);
  } catch (error) {
    console.error('Load onboarding requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to load requests.' });
  }
});

router.get('/onboarding/stats', async (req, res) => {
  try {
    const counts = await db
      .select({
        role: organizationUsers.role,
        count: sql`count(*)`.mapWith(Number),
      })
      .from(organizationUsers)
      .innerJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(onboardingFilter)
      .groupBy(organizationUsers.role);

    const stats = counts.reduce(
      (acc, item) => {
        if (item.role === 'pending') acc.pending += item.count;
        if (item.role === 'admin') acc.approved += item.count;
        acc.total += item.count;
        return acc;
      },
      { pending: 0, approved: 0, total: 0 }
    );

    res.json(stats);
  } catch (error) {
    console.error('Load onboarding stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
});

router.post('/onboarding/approve/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const result = await approveOnboardingUser(userId);
    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Approve onboarding error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve user.' });
  }
});

router.post('/approve/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const result = await approveOnboardingUser(userId);
    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Approve onboarding error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve user.' });
  }
});

export default router;
