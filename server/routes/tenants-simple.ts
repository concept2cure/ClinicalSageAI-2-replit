/**
 * Simple Tenant Management API Routes for testing
 */
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';
import { invalidateOrgMembershipCache } from '../middleware/auth';
import { requirePlatformAdmin, resolvePlatformAdmin } from '../middleware/requirePlatformAdmin';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger.js';
import { assertCanAdmitNewTenant } from '../db/tenantAdmission';
import { provisionLaunchModules } from '../services/entitlements/launch-scope.js';
import { pool } from '../db';
import {
  cancelDeletion,
  OffboardingStateError,
  purgeTenant,
  requestDeletion,
} from '../services/tenant/tenant-offboarding';

const log = createScopedLogger('tenants-simple');

const router = Router();

// SECURITY: All tenant management endpoints require authentication
router.use(authMiddleware);

// Platform-operator (cross-tenant) authorization uses resolvePlatformAdmin from
// ../middleware/requirePlatformAdmin, the decision the write routes'
// requirePlatformAdmin makes: the owner's own sign-in on the allowlist, or an
// active platform_role_grants row, with NO org-`admin` bypass. A file-local helper
// previously counted org `admin` as a platform operator, so GET /api/tenants
// leaked the full cross-tenant organization directory to any tenant admin. The
// read path then used the synchronous isPlatformAdmin, which skipped the grant
// lookup (a designated staff member got the member-scoped view) and, until
// 2026-10-05, read the request role, which is the tenant membership role (D6,
// docs/evidence/D6/2026-10-05-cross-tenant-staff/).

// The directory reads and writes below go through the runtime pool (`pool`,
// server/db), the non-superuser role RLS governs, under the system scope this
// mount applies (SYSTEM_SCOPE_PREFIXES, establishRequestTenantScope.ts). They
// used a module-level `postgres` client on DATABASE_URL, which put the RDS
// master credential on the request path (MR-03 OPS-16, MR-05 ARCH-08).
// Authorization is unchanged: resolvePlatformAdmin, the membership join and
// the authedOrgId check below decide who sees what.

// Schema for tenant creation
const createTenantSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    }),
  domain: z.string().optional(),
  tier: z.enum(['free', 'standard', 'professional', 'enterprise']).default('standard'),
  industryType: z.enum(['biotech', 'cro', 'pharma', 'meddevice']).default('pharma'),
  complianceLevel: z.enum(['base', 'standard', 'enhanced']).default('standard'),
  maxUsers: z.number().int().positive().optional(),
  maxProjects: z.number().int().positive().optional(),
  maxStorage: z.number().int().positive().optional(),
  settings: z.record(z.any()).optional(),
});

// Schema for tenant updates - same as create but all fields optional
const updateTenantSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    })
    .optional(),
  domain: z.string().optional(),
  tier: z.enum(['free', 'standard', 'professional', 'enterprise']).optional(),
  industryType: z.enum(['biotech', 'cro', 'pharma', 'meddevice']).optional(),
  complianceLevel: z.enum(['base', 'standard', 'enhanced']).optional(),
  maxUsers: z.number().int().positive().optional(),
  maxProjects: z.number().int().positive().optional(),
  maxStorage: z.number().int().positive().optional(),
});

/**
 * GET /api/tenants
 * Get all tenants - simple version
 */
router.get('/', async (req, res) => {
  try {
    // SECURITY: a non-admin may only see the organizations they belong to.
    // Returning every organization leaked the full customer list (names,
    // slugs, domains, tiers) to any authenticated user. Platform admins still
    // get the full list for tenant management.
    const userId = Number((req as any).user?.id ?? (req as any).user?.userId ?? 0);
    const { rows: result } = (await resolvePlatformAdmin(req))
      ? await pool.query(
          `SELECT id, name, slug, domain, logo, tier, max_users as "maxUsers",
                  max_projects as "maxProjects", max_storage as "maxStorage",
                  status, created_at as "createdAt", updated_at as "updatedAt"
           FROM organizations
           ORDER BY created_at DESC`,
          [],
        )
      : await pool.query(
          `SELECT o.id, o.name, o.slug, o.domain, o.logo, o.tier,
                  o.max_users as "maxUsers", o.max_projects as "maxProjects",
                  o.max_storage as "maxStorage", o.status,
                  o.created_at as "createdAt", o.updated_at as "updatedAt"
           FROM organizations o
           INNER JOIN organization_users ou ON ou.organization_id = o.id
           WHERE ou.user_id = $1
           ORDER BY o.created_at DESC`,
          [userId],
        );

    log.debug('Retrieved tenants from database:', result.length);

    return res.json(result);
  } catch (error) {
    log.error('Error retrieving tenants', error);
    res.status(500).json({ error: 'Failed to retrieve tenants' });
  }
});

/**
 * POST /api/tenants
 * Create a new tenant - simple version
 */
router.post('/', requirePlatformAdmin, async (req, res) => {
  try {
    log.debug('Create tenant request received');

    // Validate request body
    const validatedData = createTenantSchema.parse(req.body);

    // SECURITY: Use crypto.randomBytes for API key generation (not Math.random)
    const crypto = await import('crypto');
    const apiKey = 'c2c_' + crypto.randomBytes(24).toString('base64url');

    // Tenant isolation posture: refuse to make this deployment multi-tenant while
    // Postgres RLS is not filtering rows. No-ops locally and for the founding
    // organization. See server/db/tenantAdmission.ts.
    await assertCanAdmitNewTenant();

    const { rows: result } = await pool.query(
      `INSERT INTO organizations (name, slug, domain, tier, max_users, max_projects, max_storage, status, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING id, name, slug, domain, logo, tier, max_users as "maxUsers",
                 max_projects as "maxProjects", max_storage as "maxStorage",
                 status, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        validatedData.name,
        validatedData.slug,
        validatedData.domain || null,
        validatedData.tier || 'standard',
        validatedData.maxUsers || 5,
        validatedData.maxProjects || 10,
        validatedData.maxStorage || 5,
        apiKey,
      ],
    );

    const newTenant = result[0];
    log.debug('Created tenant in database:', newTenant);

    // Launch catalog on by default (docs/LAUNCH_DEFINITION_OF_DONE.md, D2: "six
    // apps on by default for a NEW ORGANISATION" — not only a self-serve one).
    // This path created tenants with no launch grants at all until 2026-09-22.
    // It runs under the system scope ('/api/tenants' is in SYSTEM_SCOPE_PREFIXES),
    // which RLS lets write the new tenant's module_subscriptions rows — proven on
    // a deploy-shaped database by tests/db/signup-launch-catalog.dbtest.ts. A
    // failure does not fail tenant creation (the tenant must exist to be repaired);
    // provisionLaunchModules logs it as one error line with the repair command.
    if (newTenant?.id != null) {
      await provisionLaunchModules(Number(newTenant.id), { actorEmail: null });
    }

    // No regulatory precedent library is seeded into a new organisation
    // (2026-10-15). Until then every tenant made here got ~2,000 lines of
    // patterns carrying uncited rates — "frequencyRate 0.18", "55% resolution
    // success", calibration accuracy its own file called placeholders — and
    // the pre-submission gate scored CRL/RTF risk from them. The library is the
    // organisation's own record (ADR 0013) and starts empty.

    res.status(201).json(newTenant);
  } catch (error) {
    log.error('Error creating tenant:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tenant data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

/**
 * PATCH /api/tenants/:id
 * Update an existing tenant/organization
 */
router.patch('/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.id));

    const validatedData = updateTenantSchema.parse(req.body);

    // A field left out (or empty) keeps its current value, as before.
    const { rows: result } = await pool.query(
      `UPDATE organizations
       SET
         name = COALESCE($1, name),
         slug = COALESCE($2, slug),
         domain = COALESCE($3, domain),
         tier = COALESCE($4, tier),
         max_users = COALESCE($5, max_users),
         max_projects = COALESCE($6, max_projects),
         max_storage = COALESCE($7, max_storage),
         updated_at = NOW()
       WHERE id = $8
       RETURNING id, name, slug, domain, logo, tier, max_users as "maxUsers",
                 max_projects as "maxProjects", max_storage as "maxStorage",
                 status, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        validatedData.name || null,
        validatedData.slug || null,
        validatedData.domain || null,
        validatedData.tier || null,
        validatedData.maxUsers || null,
        validatedData.maxProjects || null,
        validatedData.maxStorage || null,
        tenantId,
      ],
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updatedTenant = result[0];
    log.debug('Updated tenant in database:', updatedTenant);
    res.json(updatedTenant);
  } catch (error) {
    log.error('Error updating tenant:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tenant data', details: error.errors });
    }
    // Handle duplicate slug constraint error
    if (
      (error as any).code === '23505' &&
      (error as any).constraint === 'organizations_slug_unique'
    ) {
      return res.status(409).json({
        error: 'Organization URL slug already exists',
        message: 'Please choose a different organization name or URL slug.',
      });
    }
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

/**
 * GET /api/tenant-users/:tenantId
 * Get users for a specific tenant
 */
router.get('/:tenantId/users', async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.tenantId));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    // SECURITY: only a platform admin, or a member of the tenant, may list its
    // users (emails, names, roles). Otherwise any authenticated user could read
    // any tenant's directory by changing the path id.
    if (authedOrgId(req) !== tenantId && !(await resolvePlatformAdmin(req))) {
      return res.status(403).json({ error: 'Tenant context mismatch' });
    }

    // Get users for this organization with their roles
    const { rows: result } = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.title,
         u.department,
         u.avatar,
         u.status,
         u.last_login as "lastLogin",
         u.created_at as "createdAt",
         ou.role,
         ou.created_at as "joinedAt"
       FROM users u
       INNER JOIN organization_users ou ON u.id = ou.user_id
       WHERE ou.organization_id = $1
       ORDER BY u.name ASC`,
      [tenantId],
    );

    res.json(result);
  } catch (error) {
    log.error('Error retrieving tenant users', error);
    res.status(500).json({ error: 'Failed to retrieve tenant users' });
  }
});

/**
 * Map an offboarding state error to an HTTP status.
 *
 *   404 — the organization does not exist.
 *   422 — the request is well-formed but a PRECONDITION of the lifecycle is
 *         unmet (no export evidence, retention window still open). The caller
 *         can retry the same request once it satisfies the precondition.
 *   409 — the organization is in a state that conflicts with the request
 *         (already purged, not scheduled for deletion, or retained document
 *         lineage blocks erasure). Review the governed records before retrying.
 *   403 — the purge cannot be attributed to a person (no user id on the
 *         request). The purge's audit row names who purged; a purge by nobody
 *         is refused.
 */
function offboardingHttpStatus(code: string): number {
  if (code === 'TENANT_NOT_FOUND') return 404;
  if (code === 'PURGE_ACTOR_REQUIRED') return 403;
  if (code === 'EXPORT_EVIDENCE_REQUIRED' || code === 'RETENTION_WINDOW_OPEN') return 422;
  return 409;
}

/**
 * DELETE /api/tenants/:id — request offboarding.
 *
 * This used to be an immediate cascade delete. It is now the ENTRY POINT to a
 * governed lifecycle: the organization moves to `pending_deletion` (read-only
 * but fully exportable) and a retention clock starts. Destruction is a separate,
 * later, explicitly-authorized act — see POST /:id/purge.
 *
 * The change is deliberate and not merely defensive. This platform stores IND
 * applications, 510(k) submissions and clinical protocols; 21 CFR Part 11
 * §11.10(e) requires deletion of such records to remain reconstructable from the
 * audit trail, and the standard MSA commits to a data-return window before
 * destruction. A single API call that cascaded both away could satisfy neither.
 *
 * See services/tenant/tenant-offboarding.ts for the state machine.
 */
router.delete('/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.id));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // SAFETY: explicit confirmation header, unchanged from the previous
    // destructive handler — offboarding a tenant is still not a casual action.
    const confirmation = req.headers['x-confirm-delete'] as string;
    if (confirmation !== `delete-org-${tenantId}`) {
      return res.status(400).json({
        error: 'Destructive operation requires confirmation',
        hint: `Set header x-confirm-delete: delete-org-${tenantId}`,
      });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({
        error: { code: 'REASON_REQUIRED', message: 'A reason for offboarding is required' },
      });
    }

    const record = await requestDeletion(pool, {
      organizationId: tenantId,
      requestedByUserId: Number(req.user?.userId ?? req.user?.id ?? 0),
      reason,
      retentionDays:
        typeof req.body?.retentionDays === 'number' ? req.body.retentionDays : undefined,
    });

    res.json({
      success: true,
      message:
        `Organization "${record.name}" is scheduled for deletion. Its data remains readable ` +
        `and exportable until the retention window closes.`,
      organizationId: record.organizationId,
      status: record.status,
      purgeEligibleAt: record.purgeEligibleAt,
    });
  } catch (error) {
    if (error instanceof OffboardingStateError) {
      return res
        .status(offboardingHttpStatus(error.code))
        .json({ error: { code: error.code, message: error.message } });
    }
    log.error('Error scheduling organization deletion:', error);
    res.status(500).json({ error: 'Failed to schedule organization deletion' });
  }
});

/**
 * POST /api/tenants/:id/cancel-deletion — call off a scheduled offboarding.
 *
 * Available at any point before the purge runs. A retention window that cannot
 * be cancelled turns a mis-click into a lost customer.
 */
router.post('/:id/cancel-deletion', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.id));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const record = await cancelDeletion(pool, {
      organizationId: tenantId,
      cancelledByUserId: Number(req.user?.userId ?? req.user?.id ?? 0),
    });

    res.json({
      success: true,
      message: `Deletion of "${record.name}" has been cancelled.`,
      organizationId: record.organizationId,
      status: record.status,
    });
  } catch (error) {
    if (error instanceof OffboardingStateError) {
      return res
        .status(offboardingHttpStatus(error.code))
        .json({ error: { code: error.code, message: error.message } });
    }
    log.error('Error cancelling organization deletion:', error);
    res.status(500).json({ error: 'Failed to cancel organization deletion' });
  }
});

/**
 * POST /api/tenants/:id/purge — destroy a tenant's data.
 *
 * The irreversible step, separated from DELETE on purpose. Refuses unless the
 * tenant is already pending deletion, the retention window has closed (or an
 * explicit override reason is supplied), and a final export digest proves the
 * data-return obligation was discharged.
 *
 * The organization ROW survives in status `purged`, carrying the offboarding
 * evidence. Deleting it would delete the audit trail of the deletion. The purge
 * also writes one chained audit row in its own transaction — who, from where,
 * on which export, what it deleted — and does not happen if that row cannot be
 * written (services/tenant/tenant-purge-audit.ts).
 */
router.post('/:id/purge', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.id));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const confirmation = req.headers['x-confirm-purge'] as string;
    if (confirmation !== `purge-org-${tenantId}`) {
      return res.status(400).json({
        error: 'Irreversible operation requires confirmation',
        hint: `Set header x-confirm-purge: purge-org-${tenantId}`,
      });
    }

    const finalExportDigest =
      typeof req.body?.finalExportDigest === 'string' ? req.body.finalExportDigest.trim() : '';
    const overrideReason =
      typeof req.body?.overrideRetentionWindowReason === 'string'
        ? req.body.overrideRetentionWindowReason.trim()
        : undefined;

    const record = await purgeTenant(pool, {
      organizationId: tenantId,
      purgedByUserId: Number(req.user?.userId ?? req.user?.id ?? 0),
      preconditions: { finalExportDigest, overrideRetentionWindowReason: overrideReason },
      auditContext: { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined },
    });

    // Every membership in this org just vanished — revoke cached
    // auth-middleware membership results immediately.
    invalidateOrgMembershipCache(undefined, tenantId);

    res.json({
      success: true,
      message: `Organization "${record.name}" has been purged.`,
      organizationId: record.organizationId,
      status: record.status,
      purgedAt: record.purgedAt,
      // Rows deleted per table: the counts the purge's audit row records.
      deletedRows: record.deletedRows,
      // What happened to the vault's stored bytes, stated rather than implied.
      storageErasure: record.storageErasure,
      // The AnA turn records erased; each turn's chained audit row is kept.
      turnRecordErasure: record.turnRecordErasure,
      // An artifact's signatures and lock snapshots erased; each signing's chained ledger row is kept.
      artifactRecordErasure: record.artifactRecordErasure,
    });
  } catch (error) {
    if (error instanceof OffboardingStateError) {
      return res
        .status(offboardingHttpStatus(error.code))
        .json({ error: { code: error.code, message: error.message } });
    }
    log.error('Error purging organization:', error);
    res.status(500).json({ error: 'Failed to purge organization' });
  }
});

export default router;
