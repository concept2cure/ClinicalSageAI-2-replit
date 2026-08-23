/**
 * Master Administration — licensing control. Mounted under /api/admin/master.
 *
 * WHY THIS EXISTS. Until now the platform's commercial packaging — which tier
 * includes which module — lived in exactly one place a human could change it: a
 * SQL migration. Every other layer that reads packaging (the nav rail,
 * getModuleCatalog, provision_org_modules, the Apps catalog) was wired and
 * live, and the one thing the platform owner actually needed to adjust required
 * writing and deploying a migration. That is not a control surface.
 *
 * These endpoints make the licensing model editable by the people who own it:
 *
 *   GET   /licensing                     the whole matrix — modules x tiers, plus every tenant
 *   GET   /licensing/tenants/:id         one tenant's effective verdict for every module
 *   PATCH /licensing/modules/:moduleId   move a module to a different tier (or unrestricted)
 *   PATCH /licensing/tenants/:id/tier    change one tenant's plan
 *   POST  /licensing/tenants/:id/provision  apply that plan — grant what it includes
 *
 * The per-tenant module override already existed as
 * `PATCH /tenants/:id/modules` in ./master-admin and is deliberately not
 * duplicated here — one canonical implementation per capability.
 *
 * ── THE TWO INVARIANTS THIS FILE IS BUILT AROUND ────────────────────────────
 *
 * 1. PACKAGING IS NOT REPOSSESSION. Moving a module to a higher tier never
 *    revokes it from an organization that already holds an explicit grant. An
 *    `enabled` module_subscriptions row is an auditable decision — somebody
 *    turned it on, on purpose — and resolveNavEntitlements reads it before it
 *    reads tier. So re-tiering changes what NEW and re-provisioned tenants get,
 *    and the response says how many existing grants are unaffected rather than
 *    leaving the operator to discover it. Taking capability back from a paying
 *    customer is a per-tenant act, made deliberately, one tenant at a time.
 *
 * 2. EVERY MUTATION IS GOVERNED. A reason is required (min 3 chars) and every
 *    write goes through auditService, so the Part 11 tamper-evident chain
 *    records who changed the commercial model, when, and why. This mirrors
 *    ./master-admin exactly; a licensing change is at least as consequential as
 *    the tenant-status change already governed there.
 *
 * The whole router inherits `authMiddleware` + `requirePlatformAdmin` from the
 * mount in ./master-admin — no endpoint here does its own authorization, and
 * none may.
 *
 * @module server/routes/admin/master-licensing
 */

import { Router, Request, Response } from 'express';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import auditService from '../../services/auditService';

const logger = createScopedLogger('admin-master-licensing');
const router = Router();

/**
 * The real tiers, ascending. Same four ids as license-manager.ts TIER_LEVELS,
 * mdx-entitlements.ts TIER_RANK and the module_tier_level() SQL function.
 */
export const TIERS = ['free', 'standard', 'professional', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v);
}

/**
 * PURE: validate a reason-for-change. Returns the trimmed reason or null.
 *
 * Governed actions in ./master-admin all require min 3 characters; the same
 * floor applies here so an operator cannot learn one rule for suspending a
 * tenant and a different one for repricing the platform.
 */
export function normalizeReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length >= 3 ? trimmed : null;
}

/**
 * PURE: what a tenant's effective verdict is for one module.
 *
 * Deliberately mirrors decideNavEntitlement in
 * server/services/entitlements/navigation-entitlements.ts — the admin console
 * must show the SAME answer the customer's rail shows, or it is worse than
 * useless: an operator would "fix" something the customer never saw as broken.
 * Kept as a small pure function with its own tests rather than importing the
 * other, because that one takes a ModuleCatalogEntry (a shape this query does
 * not produce) and reshaping the row to fit would hide the coupling rather than
 * make it explicit. The tests assert the two agree.
 */
export function effectiveVerdict(row: {
  subscriptionState: 'enabled' | 'disabled' | 'none';
  minTier: Tier | null;
  orgTier: Tier | null;
  industries: string[];
  orgIndustry: string | null;
}): { effective: boolean; source: 'subscribed' | 'included' | 'disabled' | 'tier' | 'industry' } {
  if (row.subscriptionState === 'enabled') return { effective: true, source: 'subscribed' };
  if (row.subscriptionState === 'disabled') return { effective: false, source: 'disabled' };

  const industryOk =
    row.industries.length === 0 ||
    (row.orgIndustry != null && row.industries.includes(row.orgIndustry));
  if (!industryOk) return { effective: false, source: 'industry' };

  // A null minTier is unrestricted — included at every tier.
  if (row.minTier == null) return { effective: true, source: 'included' };

  const orgRank = row.orgTier != null ? TIER_RANK[row.orgTier] : undefined;
  if (orgRank !== undefined && orgRank >= TIER_RANK[row.minTier]) {
    return { effective: true, source: 'included' };
  }
  return { effective: false, source: 'tier' };
}

/** The lowest tier named in a metadata `tiers` array, or null when unrestricted. */
export function lowestTier(tiers: unknown): Tier | null {
  if (!Array.isArray(tiers)) return null;
  const valid = tiers.filter(isTier);
  if (valid.length === 0) return null;
  return valid.reduce((lo, t) => (TIER_RANK[t] < TIER_RANK[lo] ? t : lo), valid[0]);
}

// ─── GET /licensing — the whole matrix ───────────────────────────────────────

router.get('/licensing', async (_req: Request, res: Response) => {
  try {
    const [modules, orgs] = await Promise.all([
      query(
        `SELECT am.module_id, am.name, am.category, am.metadata,
                COUNT(*) FILTER (WHERE ms.enabled IS TRUE)  AS granted_orgs,
                COUNT(*) FILTER (WHERE ms.enabled IS FALSE) AS revoked_orgs
           FROM available_modules am
           LEFT JOIN module_subscriptions ms ON ms.module_id = am.module_id
          GROUP BY am.module_id, am.name, am.category, am.metadata, am.sort_order
          ORDER BY am.sort_order NULLS LAST, am.module_id`,
      ),
      query(
        `SELECT o.id, o.name, o.slug, o.tier, o.industry_mode, o.status,
                COUNT(*) FILTER (WHERE ms.enabled IS TRUE)  AS grants,
                COUNT(*) FILTER (WHERE ms.enabled IS FALSE) AS revocations
           FROM organizations o
           LEFT JOIN module_subscriptions ms ON ms.organization_id = o.id
          GROUP BY o.id, o.name, o.slug, o.tier, o.industry_mode, o.status
          ORDER BY o.name`,
      ),
    ]);

    return res.json({
      tiers: TIERS,
      modules: modules.rows.map((m: any) => {
        const meta = m.metadata || {};
        return {
          moduleId: m.module_id,
          name: m.name,
          category: m.category ?? null,
          minTier: lowestTier(meta.tiers),
          industries: Array.isArray(meta.industries) ? meta.industries : [],
          // Retired rows are kept (the module_subscriptions FK is ON DELETE
          // CASCADE, so deleting them would destroy entitlement history) and
          // are surfaced flagged rather than hidden — an operator looking at
          // the licensing model should be able to see what was retired.
          deprecated: meta.deprecated === true,
          grantedOrgs: Number(m.granted_orgs) || 0,
          revokedOrgs: Number(m.revoked_orgs) || 0,
        };
      }),
      organizations: orgs.rows.map((o: any) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        tier: o.tier ?? null,
        industryMode: o.industry_mode ?? null,
        status: o.status ?? null,
        grants: Number(o.grants) || 0,
        revocations: Number(o.revocations) || 0,
      })),
    });
  } catch (err) {
    logger.error('licensing matrix read failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load the licensing matrix.' });
  }
});

// ─── GET /licensing/tenants/:id — one tenant's effective verdicts ────────────

router.get('/licensing/tenants/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const orgRes = await query(
      `SELECT id, name, slug, tier, industry_mode, status FROM organizations WHERE id = $1`,
      [id],
    );
    if (!orgRes.rows.length) return res.status(404).json({ error: 'Tenant not found.' });
    const org = orgRes.rows[0];
    const orgTier = isTier(org.tier) ? org.tier : null;
    const orgIndustry = org.industry_mode ?? null;

    const rows = await query(
      `SELECT am.module_id, am.name, am.category, am.metadata, ms.enabled
         FROM available_modules am
         LEFT JOIN module_subscriptions ms
           ON ms.module_id = am.module_id AND ms.organization_id = $1
        WHERE COALESCE((am.metadata->>'deprecated')::boolean, false) = false
        ORDER BY am.sort_order NULLS LAST, am.module_id`,
      [id],
    );

    return res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        tier: orgTier,
        industryMode: orgIndustry,
        status: org.status ?? null,
      },
      modules: rows.rows.map((m: any) => {
        const meta = m.metadata || {};
        const subscriptionState: 'enabled' | 'disabled' | 'none' =
          m.enabled === true ? 'enabled' : m.enabled === false ? 'disabled' : 'none';
        const minTier = lowestTier(meta.tiers);
        const industries = Array.isArray(meta.industries) ? meta.industries : [];
        const verdict = effectiveVerdict({
          subscriptionState,
          minTier,
          orgTier,
          industries,
          orgIndustry,
        });
        return {
          moduleId: m.module_id,
          name: m.name,
          category: m.category ?? null,
          minTier,
          subscriptionState,
          ...verdict,
        };
      }),
    });
  } catch (err) {
    logger.error('tenant licensing read failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load tenant licensing.' });
  }
});

// ─── PATCH /licensing/modules/:moduleId — move a module between tiers ───────

router.patch('/licensing/modules/:moduleId', async (req: Request, res: Response) => {
  try {
    const moduleId = String(req.params.moduleId ?? '').trim();
    if (!moduleId) return res.status(400).json({ error: 'moduleId is required.' });

    const body = (req.body ?? {}) as { minTier?: unknown; reason?: unknown };
    // null is meaningful and distinct from absent: it means UNRESTRICTED
    // (included at every tier). `undefined` is a malformed request.
    const wantsUnrestricted = body.minTier === null;
    if (!wantsUnrestricted && !isTier(body.minTier)) {
      return res.status(400).json({
        error: `minTier must be one of ${TIERS.join(', ')}, or null for unrestricted.`,
      });
    }
    const reason = normalizeReason(body.reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const existing = await query(
      `SELECT module_id, metadata FROM available_modules WHERE module_id = $1`,
      [moduleId],
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Unknown module.' });
    const previousTier = lowestTier((existing.rows[0].metadata || {}).tiers);

    const nextTiers = wantsUnrestricted ? [] : [body.minTier as Tier];

    // jsonb_set on the parsed object, cast back to `json` because the column is
    // `json`. Only `tiers` is touched — `industries` and, above all,
    // `deprecated` must survive, since getModuleCatalog and
    // provision_org_modules both filter on the latter.
    const updated = await query(
      `UPDATE available_modules
          SET metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'::jsonb), '{tiers}', $2::jsonb)::json,
              updated_at = now()
        WHERE module_id = $1
        RETURNING module_id, metadata`,
      [moduleId, JSON.stringify(nextTiers)],
    );

    // How many organizations hold an explicit grant that this change does NOT
    // touch. Reported so the operator is not left to infer invariant 1.
    const grantsRes = await query(
      `SELECT COUNT(*)::int AS n FROM module_subscriptions
        WHERE module_id = $1 AND enabled IS TRUE`,
      [moduleId],
    );

    await auditService.logAction({
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'module_packaging',
      resourceId: moduleId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        masterAdminAction: 'module.repackage',
        moduleId,
        previousTier,
        minTier: wantsUnrestricted ? null : (body.minTier as Tier),
        reason,
      },
    });

    return res.json({
      moduleId,
      minTier: lowestTier((updated.rows[0].metadata || {}).tiers),
      previousTier,
      /** Existing explicit grants are untouched by a packaging change. */
      unaffectedGrants: grantsRes.rows[0]?.n ?? 0,
    });
  } catch (err) {
    logger.error('module repackage failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update module packaging.' });
  }
});

// ─── POST /licensing/tenants/:id/provision — apply the plan ─────────────────
//
// The endpoint that makes a tier change mean something.
//
// Changing `organizations.tier` writes no subscription rows. Provisioning is a
// separate act, and the only paths that performed it were
// `provisionModulesForTier` (billing.ts, fired by Stripe checkout and the
// subscription webhook) and `POST /api/module-subscriptions/provision` — which
// requires `userRole === 'admin'`, an ORG admin acting on their OWN
// organization. So a platform admin who moved a tenant to Professional in the
// licensing console had no way to apply it: the tier field changed and the
// tenant's entitlements did not. The console said "re-provision the tenant" and
// offered nothing that could.
//
// WHAT IT REPORTS, AND WHY THAT MATTERS MORE THAN WHAT IT DOES.
// provision_org_modules() inserts ON CONFLICT DO NOTHING: it GRANTS what the
// new tier includes and revokes nothing. That is the correct default — see
// invariant 1 — but it means a DOWNGRADE provisions zero rows and removes zero,
// so an operator who downgrades a tenant, sees "provisioned", and assumes
// capability was withdrawn would be wrong in the most expensive direction.
// This returns `granted` (rows actually added) AND `retainedAboveTier` (grants
// the tenant still holds that the new plan does not include), so the gap is
// stated rather than left to be discovered. Removing those is a deliberate,
// per-module act through the module toggle — never a side effect of a plan
// change.
router.post('/licensing/tenants/:id/provision', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const reason = normalizeReason((req.body ?? {}).reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const orgRes = await query(
      `SELECT id, name, tier, industry_mode FROM organizations WHERE id = $1`,
      [id],
    );
    if (!orgRes.rows.length) return res.status(404).json({ error: 'Tenant not found.' });
    const org = orgRes.rows[0];

    const before = await query(
      `SELECT COUNT(*)::int AS n FROM module_subscriptions
        WHERE organization_id = $1 AND enabled IS TRUE`,
      [id],
    );

    // The repaired function (20260823_fix_provision_org_modules_tier_ladder).
    // Before that migration this call raised on every invocation, so an older
    // database reaches the catch below rather than silently doing nothing.
    await query(`SELECT provision_org_modules($1)`, [id]);

    const after = await query(
      `SELECT COUNT(*)::int AS n FROM module_subscriptions
        WHERE organization_id = $1 AND enabled IS TRUE`,
      [id],
    );

    // Grants the tenant holds that its CURRENT tier does not include. Computed
    // in SQL against the same ladder provisioning uses, so the two cannot
    // disagree about what "above tier" means.
    const retained = await query(
      `SELECT ms.module_id, am.name
         FROM module_subscriptions ms
         JOIN available_modules am ON am.module_id = ms.module_id
        WHERE ms.organization_id = $1
          AND ms.enabled IS TRUE
          AND jsonb_typeof(COALESCE(am.metadata::jsonb, '{}'::jsonb)->'tiers') = 'array'
          AND jsonb_array_length(COALESCE(am.metadata::jsonb, '{}'::jsonb)->'tiers') > 0
          AND NOT EXISTS (
                SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(am.metadata::jsonb, '{}'::jsonb)->'tiers') AS t
                 WHERE module_tier_level(t) IS NOT NULL
                   AND module_tier_level($2) >= module_tier_level(t)
              )
        ORDER BY am.name`,
      [id, org.tier ?? 'standard'],
    );

    const granted = (after.rows[0]?.n ?? 0) - (before.rows[0]?.n ?? 0);

    await auditService.logAction({
      tenantId: id,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'organization',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        masterAdminAction: 'tenant.provision',
        tier: org.tier ?? null,
        industryMode: org.industry_mode ?? null,
        granted,
        retainedAboveTier: retained.rows.map((r: any) => r.module_id),
        reason,
      },
    });

    return res.json({
      id,
      name: org.name,
      tier: org.tier ?? null,
      /** Modules newly granted by this run. */
      granted,
      enabledTotal: after.rows[0]?.n ?? 0,
      /**
       * Grants the tenant KEEPS that this plan does not include. Provisioning
       * never revokes; these are removed one at a time through the module
       * toggle, deliberately.
       */
      retainedAboveTier: retained.rows.map((r: any) => ({
        moduleId: r.module_id,
        name: r.name,
      })),
    });
  } catch (err) {
    logger.error('tenant provisioning failed', err as Record<string, unknown>);
    return res.status(500).json({
      error:
        'Provisioning failed. If this database predates the provision_org_modules repair, apply the pending migrations first.',
    });
  }
});

// ─── PATCH /licensing/tenants/:id/tier — change one tenant's plan ────────────

router.patch('/licensing/tenants/:id/tier', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const body = (req.body ?? {}) as { tier?: unknown; reason?: unknown };
    if (!isTier(body.tier)) {
      return res.status(400).json({ error: `tier must be one of ${TIERS.join(', ')}.` });
    }
    const reason = normalizeReason(body.reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const existing = await query(`SELECT id, tier FROM organizations WHERE id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Tenant not found.' });
    const previousTier = existing.rows[0].tier ?? null;

    const updated = await query(
      `UPDATE organizations SET tier = $2, updated_at = now() WHERE id = $1
        RETURNING id, name, tier`,
      [id, body.tier],
    );

    await auditService.logAction({
      tenantId: id,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'organization',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        masterAdminAction: 'tenant.tier_change',
        previousTier,
        tier: body.tier,
        reason,
      },
    });

    return res.json({
      id: updated.rows[0].id,
      name: updated.rows[0].name,
      tier: updated.rows[0].tier,
      previousTier,
      /**
       * A tier change does not write subscription rows on its own — that is
       * `provision_org_modules(id)`, run at checkout and on the subscription
       * webhook. Downgrades in particular leave existing grants in place by
       * design (invariant 1). Said in the response so nobody assumes a plan
       * change silently repossessed anything.
       */
      note: 'Existing module grants are unchanged. Provision the tenant to apply the new plan.',
      provisionPath: `/api/admin/master/licensing/tenants/${id}/provision`,
    });
  } catch (err) {
    logger.error('tenant tier change failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update the tenant plan.' });
  }
});

export default router;
