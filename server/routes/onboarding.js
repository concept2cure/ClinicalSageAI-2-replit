import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { organizations, users, organizationUsers } from '../../shared/schema.ts';
import { eq } from 'drizzle-orm';
import { sendApprovalEmail, sendApprovalNotification, sendRequestConfirmation } from '../utils/email.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

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

const randomPassword = () => Math.random().toString(36).slice(2) + 'A1!';

router.post('/request-access', async (req, res) => {
  try {
    const { fullName, email, companyName, industry, useCase, jobTitle } = req.body || {};

    if (!fullName || !email || !companyName || !industry) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, company name, and industry are required.',
      });
    }

    const baseSlug = slugify(companyName);
    const slug = await buildUniqueSlug(baseSlug);

    const [org] = await db
      .insert(organizations)
      .values({
        name: companyName,
        slug,
        status: 'pending',
        settings: {
          industry,
          useCase,
          requestedBy: email,
          jobTitle,
        },
      })
      .returning();

    const tempPassword = randomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        name: fullName,
        title: jobTitle || null,
        passwordHash,
        status: 'pending',
        defaultOrganizationId: org.id,
      })
      .returning();

    await db.insert(organizationUsers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'pending',
    });

    if (process.env.ADMIN_EMAIL) {
      await sendApprovalEmail(process.env.ADMIN_EMAIL, { org, user });
    }

    await sendRequestConfirmation(user.email, user.name);

    res.json({
      success: true,
      message: 'Access request submitted',
    });
  } catch (error) {
    console.error('Request access error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to submit request',
    });
  }
});

router.post('/send-approval', requireAdmin, async (req, res) => {
  try {
    const { email, orgName } = req.body || {};

    if (!email || !orgName) {
      return res.status(400).json({ success: false, message: 'Email and org name are required.' });
    }

    await sendApprovalNotification(email, orgName);
    return res.json({ success: true });
  } catch (error) {
    console.error('Send approval error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send approval email.' });
  }
});

export default router;
