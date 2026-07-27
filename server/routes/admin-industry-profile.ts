/**
 * Governed industry profile — MDX-CONTEXT-01.
 *
 *   GET   /api/admin/industry-profile            the org's governed profile
 *   PATCH /api/admin/industry-profile            update it (audited)
 *   GET   /api/admin/industry-profile/effective  the resolved effective context
 *
 * Why this exists rather than wiring the Admin panel to something existing: the
 * panel presents "Client type" as driving templates, pathways and AnA context,
 * but writes to localStorage — and its own comment says the only /api/setup
 * routes are the first-run installer, which must not be called from a settings
 * panel. So a per-browser value has been standing in for an organization-wide
 * regulated setting: two users in one organization would get different study
 * menus for the same study, and nothing recorded who changed it or why.
 *
 * NAVIGATION IS UNAFFECTED. This governs what the existing modules offer inside
 * themselves. It adds no rail destination and changes no rail order.
 *
 * @module server/routes/admin-industry-profile
 */

import { Router, Request } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';
import { getRequestDbClient } from '../middleware/tenantContext';
import {
  PRIMARY_INDUSTRIES, MDX_SPECIALIZATIONS, INDUSTRY_MODE_FOR_PRIMARY,
} from '../../shared/regulatory/mdx-specialization';
import { resolveEffectiveProjectContext } from '../services/industry-context/resolve-effective-context';

const router = Router();
const log = createScopedLogger('admin-industry-profile');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Roles permitted to change what regulatory instruments the workspace offers. */
const PROFILE_ADMIN_ROLES = new Set(['owner', 'admin', 'org_admin', 'super_admin']);

function userRoles(req: Request): string[] {
  const u = (req as any).user ?? {};
  const raw = u.roles ?? u.role ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((r: unknown): r is string => typeof r === 'string').map(r => r.toLowerCase());
}

const APPROVAL_RIGOR = [
  'single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required',
] as const;

const patchBody = z.object({
  primaryIndustry: z.enum(PRIMARY_INDUSTRIES).optional(),
  mdxSpecialization: z.enum(MDX_SPECIALIZATIONS).optional(),
  defaultMarkets: z.array(z.string().min(1).max(40)).max(50).optional(),
  defaultPathways: z.array(z.string().min(1).max(80)).max(100).optional(),
  defaultApprovalRigor: z.enum(APPROVAL_RIGOR).optional(),
  effectiveAt: z.string().datetime().optional(),
  /**
   * Required when the industry or specialization changes — see the material-change
   * check below. Optional for a markets/pathways edit, which does not change which
   * regulatory framework the workspace presents.
   */
  changeReason: z.string().min(8).max(2000).optional(),
}).refine(b => Object.keys(b).length > 0, { message: 'No fields to update' });

const COLS: Record<string, string> = {
  primaryIndustry: 'primary_industry',
  mdxSpecialization: 'mdx_specialization',
  defaultMarkets: 'default_markets',
  defaultPathways: 'default_pathways',
  defaultApprovalRigor: 'default_approval_rigor',
  effectiveAt: 'effective_at',
  changeReason: 'change_reason',
};

const JSON_COLS = new Set(['default_markets', 'default_pathways']);

interface ProfileRow {
  primary_industry: string;
  mdx_specialization: string;
  default_markets: unknown;
  default_pathways: unknown;
  default_approval_rigor: string;
  effective_at: string | Date | null;
  change_reason: string | null;
  updated_by: number | null;
  updated_at: string | Date | null;
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const view = (r: ProfileRow) => ({
  primaryIndustry: r.primary_industry,
  mdxSpecialization: r.mdx_specialization,
  defaultMarkets: asArray(r.default_markets),
  defaultPathways: asArray(r.default_pathways),
  defaultApprovalRigor: r.default_approval_rigor,
  effectiveAt: r.effective_at ? new Date(r.effective_at).toISOString() : null,
  changeReason: r.change_reason,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
});

router.get('/industry-profile', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT primary_industry, mdx_specialization, default_markets, default_pathways,
              default_approval_rigor, effective_at, change_reason, updated_by, updated_at
         FROM organization_industry_profiles WHERE organization_id = $1`,
      [orgId],
    );
    if (rows.length === 0) {
      // No governed row yet. Reporting that plainly — rather than synthesizing a
      // default and presenting it as the organization's setting — is the point of
      // this endpoint existing.
      return ok(res, null, { configured: false });
    }
    return ok(res, view(rows[0]), { configured: true });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return ok(res, null, { configured: false, pendingStore: true });
    }
    return serverError(res, log, 'get-industry-profile', err);
  }
});

/**
 * The resolved effective context, optionally for a project.
 *
 * Exposed so every surface reads the SAME resolution rather than each deriving
 * its own from whatever it has in scope. `needsDeclaration` in the response is
 * the contract that lets a surface ask instead of assuming.
 */
router.get('/industry-profile/effective', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const projectRaw = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
  if (projectRaw !== undefined && !/^\d+$/.test(projectRaw)) {
    return clientError(res, 422, 'project_id must be numeric');
  }
  const clientRaw = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
  if (clientRaw !== undefined && !/^\d+$/.test(clientRaw)) {
    return clientError(res, 422, 'client_id must be numeric');
  }
  try {
    const context = await resolveEffectiveProjectContext(getRequestDbClient(req), {
      organizationId: orgId,
      projectId: projectRaw ? Number(projectRaw) : null,
      clientWorkspaceId: clientRaw ? Number(clientRaw) : null,
      userId: getUserId(req),
    });
    return ok(res, context);
  } catch (err) { return serverError(res, log, 'resolve-effective-context', err); }
});

router.patch('/industry-profile', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 401, 'An authenticated user is required');

  // Changing this changes which regulatory instruments every project in the
  // organization is offered, so it is not an ordinary settings write.
  const roles = userRoles(req);
  if (!roles.some(r => PROFILE_ADMIN_ROLES.has(r))) {
    return clientError(res, 403,
      'Changing the organization industry profile requires an organization administrator role.');
  }

  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  }
  const p = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT primary_industry, mdx_specialization, default_markets, default_pathways,
              default_approval_rigor, effective_at, change_reason, updated_by, updated_at
         FROM organization_industry_profiles WHERE organization_id = $1 FOR UPDATE`,
      [orgId],
    );
    const before: ProfileRow | undefined = cur.rows[0];

    // A material change is one that alters which regulatory framework the
    // workspace presents — the industry or the MDX specialization. Those require a
    // reason on the record, because an inspector asking why this organization's
    // study menus changed in June needs an answer that is not "someone clicked".
    // Markets and pathways are configuration within a framework and do not.
    const materialChange =
      (p.primaryIndustry !== undefined && p.primaryIndustry !== before?.primary_industry)
      || (p.mdxSpecialization !== undefined && p.mdxSpecialization !== before?.mdx_specialization);
    if (materialChange && !p.changeReason) {
      await client.query('ROLLBACK');
      return clientError(res, 422,
        'A reason is required when changing the primary industry or MDX specialization: '
        + 'it changes which study types, filing types and terminology every project in this '
        + 'organization is offered.');
    }

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const [key, col] of Object.entries(COLS)) {
      const v = (p as Record<string, unknown>)[key];
      if (v === undefined) continue;
      args.push(JSON_COLS.has(col) ? JSON.stringify(v) : v);
      sets.push(`${col} = $${args.length}${JSON_COLS.has(col) ? '::jsonb' : ''}`);
    }
    args.push(userId);
    sets.push(`updated_by = $${args.length}`);

    let row: ProfileRow;
    if (!before) {
      // First write for this organization. primary_industry is NOT NULL, so an
      // insert cannot proceed without it — asked for explicitly rather than
      // defaulted, since the whole point is that this value is declared.
      if (!p.primaryIndustry) {
        await client.query('ROLLBACK');
        return clientError(res, 422,
          'primaryIndustry is required to create this organization\'s industry profile.');
      }
      const ins = await client.query(
        `INSERT INTO organization_industry_profiles (
           organization_id, primary_industry, mdx_specialization, default_markets,
           default_pathways, default_approval_rigor, effective_at, change_reason, updated_by
         ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6, COALESCE($7::timestamptz, now()), $8, $9)
         RETURNING primary_industry, mdx_specialization, default_markets, default_pathways,
                   default_approval_rigor, effective_at, change_reason, updated_by, updated_at`,
        [
          orgId, p.primaryIndustry, p.mdxSpecialization ?? 'unspecified',
          JSON.stringify(p.defaultMarkets ?? []), JSON.stringify(p.defaultPathways ?? []),
          p.defaultApprovalRigor ?? 'regulated_dual_review',
          p.effectiveAt ?? null, p.changeReason ?? null, userId,
        ],
      );
      row = ins.rows[0];
    } else {
      args.push(orgId);
      const upd = await client.query(
        `UPDATE organization_industry_profiles
            SET ${sets.join(', ')}, updated_at = now()
          WHERE organization_id = $${args.length}
          RETURNING primary_industry, mdx_specialization, default_markets, default_pathways,
                    default_approval_rigor, effective_at, change_reason, updated_by, updated_at`,
        args,
      );
      row = upd.rows[0];
    }

    // Keep organizations.industry_mode consistent. It is what client-type-profiles
    // and getLicenseInfo already read, so leaving it stale would give two
    // different answers to "what industry is this organization" depending on which
    // code path asked.
    if (p.primaryIndustry) {
      await client.query(
        `UPDATE organizations SET industry_mode = $1, updated_at = now() WHERE id = $2`,
        [INDUSTRY_MODE_FOR_PRIMARY[p.primaryIndustry], orgId],
      );
    }

    await client.query('COMMIT');

    // Audit outside the transaction: a failed audit write must not roll back a
    // legitimate settings change, and the log carries before/after either way.
    log.info('industry profile updated', {
      organizationId: orgId,
      updatedBy: userId,
      materialChange,
      before: before ? { primaryIndustry: before.primary_industry, mdxSpecialization: before.mdx_specialization } : null,
      after: { primaryIndustry: row.primary_industry, mdxSpecialization: row.mdx_specialization },
      changeReason: p.changeReason ?? null,
    });

    return ok(res, view(row), { materialChange, created: !before });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if ((err as { code?: string })?.code === '42P01') {
      return clientError(res, 502,
        'The industry profile store is not provisioned in this environment.');
    }
    return serverError(res, log, 'patch-industry-profile', err);
  } finally {
    client.release();
  }
});

export default router;
