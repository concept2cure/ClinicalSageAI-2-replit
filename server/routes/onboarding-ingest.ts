/**
 * AnA agentic onboarding — ingest + commit routes (P2/P3).
 *
 *   POST /api/onboarding/commit   — apply HUMAN-APPROVED proposals through the
 *                                    existing governed, audited write paths.
 *
 * P3's governed commit is deliberately scoped to the ORG PROFILE, because that
 * is the only onboarding target with a real governed + audited write today
 * (organizations-routes.ts PATCH /:id/profile). Program/project creation is NOT
 * governed (no reason, no audit), so onboarding never silently writes one — such
 * fields are surfaced as suggestions for the wizard, not auto-committed here.
 * Every applied value is recorded in the sha256-chained audit_logs, attributed
 * to the human ("AnA on behalf of <user>"), with the AnA proposal provenance +
 * confidence in the audit detail so the change is fully traceable.
 *
 * @module routes/onboarding-ingest
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../auth';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';
import { isCommittable, type OnboardingCommitResult } from '@shared/types/onboarding-ingest';

const router = Router();
const log = createScopedLogger('onboarding-ingest');

router.use(authMiddleware);

/** Org-admin gate — mirrors organizations-routes.ts requireOrgAdmin (local, not
 *  exported there). Platform staff or the org's own admin/owner may commit. */
const PLATFORM_STAFF = new Set(['platform_admin', 'superadmin', 'super_admin']);
function isOrgAdmin(req: Request): boolean {
  const role = String((req as any).userRole ?? (req as any).user?.role ?? '').toLowerCase();
  return PLATFORM_STAFF.has(role) || role === 'admin' || role === 'owner';
}
function callerOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId ?? (req as any).organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function callerUserId(req: Request): number | string | undefined {
  return (req as any).userId ?? (req as any).user?.id;
}

/** The onboarding proposal targets that map to a GOVERNED org-profile column. */
const ORG_PROFILE_COLUMN: Record<string, 'name' | 'clientType' | 'industryMode'> = {
  'org_profile.name': 'name',
  'org_profile.clientType': 'clientType',
  'org_profile.industryMode': 'industryMode',
};
/** clientType is an enum server-side (organizations-routes profilePatchSchema). */
const CLIENT_TYPES = new Set(['medtech', 'biotech', 'pharma', 'diagnostics', 'cro', 'health']);

const commitSchema = z.object({
  approved: z
    .array(
      z.object({
        id: z.string(),
        entity: z.string(),
        targetField: z.string(),
        label: z.string().optional(),
        value: z.string().nullable(),
        extractedValue: z.string().nullable().optional(),
        provenance: z.object({ file: z.string(), page: z.number().optional(), section: z.string().optional() }).passthrough(),
        confidence: z.number(),
        status: z.string(),
      }).passthrough(),
    )
    .min(1, 'At least one approved field is required'),
  reason: z.string().min(3, 'A reason for change is required'),
});

/**
 * POST /commit — apply human-approved onboarding proposals.
 * Fail-closed: org-admin only, tenant-scoped, governed columns only, audited.
 */
router.post('/commit', async (req: Request, res: Response) => {
  const orgId = callerOrgId(req);
  if (orgId === null) return res.status(400).json({ success: false, error: 'Organization context required' });
  if (!isOrgAdmin(req)) return res.status(403).json({ success: false, error: 'Organization admin role required to apply onboarding proposals' });

  const parsed = commitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid commit body' });
  }
  const { approved, reason } = parsed.data;

  // Only human-approved, non-empty fields that map to a governed org-profile
  // column are applied. Everything else is reported back honestly (not written).
  const applied: OnboardingCommitResult['applied'] = [];
  const updates: Record<string, unknown> = {};
  const committedProvenance: Array<{ targetField: string; provenance: unknown; confidence: number }> = [];

  for (const f of approved) {
    if (!isCommittable(f as any)) {
      applied.push({ entity: (f.entity as any), targetField: f.targetField, ok: false, error: 'not human-approved / empty' });
      continue;
    }
    const col = ORG_PROFILE_COLUMN[f.targetField];
    if (!col) {
      applied.push({ entity: (f.entity as any), targetField: f.targetField, ok: false, error: 'no governed write path for this field (suggestion only)' });
      continue;
    }
    const value = String(f.value).trim();
    if (col === 'clientType' && !CLIENT_TYPES.has(value)) {
      applied.push({ entity: (f.entity as any), targetField: f.targetField, ok: false, error: `unrecognized client type "${value}"` });
      continue;
    }
    updates[col] = value;
    committedProvenance.push({ targetField: f.targetField, provenance: f.provenance, confidence: f.confidence });
    applied.push({ entity: (f.entity as any), targetField: f.targetField, ok: true });
  }

  const failures = applied.filter((a) => !a.ok).length;

  if (Object.keys(updates).length === 0) {
    // Nothing governed to write — honest empty result, no audit noise.
    return res.json({ success: true, data: { applied, writes: [], failures } satisfies OnboardingCommitResult });
  }

  try {
    const [before] = await db
      .select({ name: organizations.name, clientType: organizations.clientType, industryMode: organizations.industryMode })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!before) return res.status(404).json({ success: false, error: 'Organization not found' });

    updates.updatedAt = new Date();
    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId))
      .returning({ name: organizations.name, clientType: organizations.clientType, industryMode: organizations.industryMode });

    // Governed audit — same shape as PATCH /:id/profile, plus the AnA
    // attribution + the proposal provenance/confidence so the write is fully
    // traceable to the source document a human approved.
    await auditService.logAction({
      tenantId: orgId,
      userId: callerUserId(req), // the HUMAN on whose behalf AnA acted
      action: 'data_modify',
      resourceType: 'organization',
      resourceId: orgId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        orgAdminAction: 'organization.profile_update',
        actorKind: 'ana_on_behalf_of_user',
        via: 'onboarding_ingest',
        before,
        after: updated,
        reason,
        proposals: committedProvenance,
      },
    });

    return res.json({ success: true, data: { applied, writes: ['organizations.profile'], failures } satisfies OnboardingCommitResult });
  } catch (err) {
    log.error('onboarding commit failed', { orgId, err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ success: false, error: 'Failed to apply onboarding proposals' });
  }
});

export default router;
