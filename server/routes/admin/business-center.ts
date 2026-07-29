/**
 * Business Center API — /api/admin/business
 *
 * Owner / finance tier. Cost-based accounting per client: recognized revenue
 * (from a per-tier price card), attributed cost (metered usage × owner-set unit
 * rates), and gross margin. Plus a platform P&L roll-up, the editable rate
 * cards, and CSV export.
 *
 * Access is gated by authMiddleware → requireBusinessAdmin (STRICTER than the
 * support-facing Master Admin: support / platform_admin do NOT pass — see
 * ../../middleware/requireBusinessAdmin).
 *
 * The rate cards live in platform_cost_rates / tier_pricing (owner-managed,
 * non-tenant config). They are resilient to empty tables: code-level defaults
 * apply until the owner overrides a value, so the reports work on day one with
 * no seed migration. Rate-card edits are governed (reason-for-change) and
 * written to the 21 CFR Part 11 audit chain via auditService.
 *
 * Cost driver: usage_records (the canonical metering table). We deliberately do
 * NOT also sum deep_research_jobs.credits_used to avoid double-counting — those
 * jobs already emit usage_records rows (feature_id = 'deep_research').
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth';
import {
  requireBusinessAdmin,
  BUSINESS_ROLES,
  businessAllowlistedEmails,
} from '../../middleware/requireBusinessAdmin';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import auditService from '../../services/auditService';
import { buildCostAccounting, DEFAULT_COST_RATES } from './business/cost-model';
import rateCardsRouter from './business/rate-cards';

const logger = createScopedLogger('admin-business-center');
const router = Router();

router.use(authMiddleware);
router.use(requireBusinessAdmin);

// The cost model (rate-card defaults, DB-override loaders, buildCostAccounting)
// lives in ./business/cost-model. Owner-managed rate-card CRUD lives in the
// ./business/rate-cards sub-router, mounted below (after the auth gate above).
router.use(rateCardsRouter);

// ─── Cost accounting (per client) ────────────────────────────────────────────

router.get('/cost-accounting', async (_req: Request, res: Response) => {
  try {
    const rows = await buildCostAccounting();
    const totals = rows.reduce(
      (t, r) => {
        t.revenueCents += r.revenueCents;
        t.costCents += r.costCents;
        return t;
      },
      { revenueCents: 0, costCents: 0 }
    );
    const marginCents = totals.revenueCents - totals.costCents;
    // Surface whether revenue is actual (Stripe), modeled, or a mix.
    const hasStripe = rows.some(r => r.revenueSource === 'stripe');
    const hasModeled = rows.some(r => r.revenueSource === 'modeled');
    const revenueModel: 'stripe' | 'modeled' | 'mixed' =
      hasStripe && hasModeled ? 'mixed' : hasStripe ? 'stripe' : 'modeled';
    return res.json({
      period: 'trailing_30d',
      currency: 'usd',
      revenueModel,
      clients: rows,
      totals: {
        ...totals,
        marginCents,
        marginPct:
          totals.revenueCents > 0
            ? Math.round((marginCents / totals.revenueCents) * 1000) / 10
            : null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Cost-accounting report failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to build cost-accounting report.' });
  }
});

// ─── Cost accounting — CSV export ────────────────────────────────────────────

router.get('/cost-accounting.csv', async (req: Request, res: Response) => {
  try {
    const rows = await buildCostAccounting();
    const fmt = (cents: number) => (cents / 100).toFixed(2);
    const header = 'organization_id,client,slug,tier,status,seats,revenue_usd,cost_usd,margin_usd,margin_pct,revenue_source';
    const lines = rows.map(r =>
      [
        r.organizationId,
        `"${r.name.replace(/"/g, '""')}"`,
        r.slug,
        r.tier,
        r.status,
        r.seats,
        fmt(r.revenueCents),
        fmt(r.costCents),
        fmt(r.marginCents),
        r.marginPct == null ? '' : r.marginPct,
        r.revenueSource,
      ].join(',')
    );
    const csv = [header, ...lines].join('\n') + '\n';

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_access',
      resourceType: 'cost_accounting_export',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: { businessCenterAction: 'cost_accounting.csv_export', rows: rows.length },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="cost-accounting.csv"');
    return res.send(csv);
  } catch (err) {
    logger.error('Cost-accounting CSV failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to export cost-accounting CSV.' });
  }
});

// ─── Platform P&L roll-up ────────────────────────────────────────────────────

router.get('/pnl', async (_req: Request, res: Response) => {
  try {
    const rows = await buildCostAccounting();
    const byTier = new Map<string, { revenueCents: number; costCents: number; clients: number }>();
    let revenueCents = 0;
    let costCents = 0;
    for (const r of rows) {
      revenueCents += r.revenueCents;
      costCents += r.costCents;
      const t = byTier.get(r.tier) ?? { revenueCents: 0, costCents: 0, clients: 0 };
      t.revenueCents += r.revenueCents;
      t.costCents += r.costCents;
      t.clients += 1;
      byTier.set(r.tier, t);
    }
    const marginCents = revenueCents - costCents;
    return res.json({
      period: 'trailing_30d',
      currency: 'usd',
      revenueCents,
      costCents,
      marginCents,
      marginPct: revenueCents > 0 ? Math.round((marginCents / revenueCents) * 1000) / 10 : null,
      clients: rows.length,
      byTier: Array.from(byTier.entries()).map(([tier, v]) => ({
        tier,
        ...v,
        marginCents: v.revenueCents - v.costCents,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('P&L roll-up failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to build P&L.' });
  }
});

// ─── Executive summary — portfolio view for the owner ────────────────────────
// One call that answers "how is the business doing?": recognized MRR, monthly
// cost run-rate, blended gross margin, loss-making clients (cost > revenue), and
// revenue concentration (dependence on the largest accounts). All derived from
// the SAME per-client cost accounting, so the numbers reconcile exactly.

router.get('/executive-summary', async (_req: Request, res: Response) => {
  try {
    const rows = await buildCostAccounting();
    const totals = rows.reduce(
      (t, r) => {
        t.revenueCents += r.revenueCents;
        t.costCents += r.costCents;
        return t;
      },
      { revenueCents: 0, costCents: 0 }
    );
    const marginCents = totals.revenueCents - totals.costCents;
    const marginPct =
      totals.revenueCents > 0 ? Math.round((marginCents / totals.revenueCents) * 1000) / 10 : null;

    const activeClients = rows.filter(r => r.status === 'active').length;

    // Loss-makers: a client costs more to serve than it pays. rows are already
    // sorted lowest-margin-first by buildCostAccounting().
    const lossMakers = rows
      .filter(r => r.marginCents < 0)
      .map(r => ({
        organizationId: r.organizationId,
        name: r.name,
        revenueCents: r.revenueCents,
        costCents: r.costCents,
        marginCents: r.marginCents,
      }));

    // Revenue concentration — exposure to the largest accounts.
    const byRevenue = [...rows].sort((a, b) => b.revenueCents - a.revenueCents);
    const topClients = byRevenue.slice(0, 5).map(r => ({
      organizationId: r.organizationId,
      name: r.name,
      revenueCents: r.revenueCents,
      sharePct:
        totals.revenueCents > 0
          ? Math.round((r.revenueCents / totals.revenueCents) * 1000) / 10
          : 0,
    }));
    const top5SharePct =
      totals.revenueCents > 0
        ? Math.round(
            (byRevenue.slice(0, 5).reduce((s, r) => s + r.revenueCents, 0) /
              totals.revenueCents) *
              1000
          ) / 10
        : 0;

    // Tier mix.
    const tierMap = new Map<string, { clients: number; revenueCents: number }>();
    for (const r of rows) {
      const t = tierMap.get(r.tier) ?? { clients: 0, revenueCents: 0 };
      t.clients += 1;
      t.revenueCents += r.revenueCents;
      tierMap.set(r.tier, t);
    }
    const tierMix = [...tierMap.entries()]
      .map(([tier, v]) => ({ tier, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

    return res.json({
      portfolio: {
        clients: rows.length,
        activeClients,
        mrrCents: totals.revenueCents,
        monthlyCostRunRateCents: totals.costCents,
        grossMarginCents: marginCents,
        grossMarginPct: marginPct,
      },
      risk: {
        lossMakingClients: lossMakers.length,
        lossMakers,
        revenueConcentrationTop5Pct: top5SharePct,
      },
      topClients,
      tierMix,
      note: 'Revenue is modeled from the tier price card; cost is metered usage × owner rates.',
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Executive summary query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to build executive summary.' });
  }
});

// ─── Metering coverage — accuracy audit for the cost accounting ──────────────
// Cost is attributed only from features that emit usage_records. This diagnostic
// surfaces the accuracy boundary so the owner can trust the margins:
//   • usageWithoutExplicitRate — a feature is billing usage but has no explicit
//     rate, so it is priced at the catch-all 'default' rate (mispricing risk).
//   • ratedButNoUsage — a configured rate sees no usage in the window (a stale
//     rate, or a feature that stopped/never started metering).

router.get('/metering-coverage', async (req: Request, res: Response) => {
  try {
    const daysRaw = Number(req.query.days);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.trunc(daysRaw), 365) : 90;

    const [usageRes, rateRows] = await Promise.all([
      query(
        `SELECT feature_id,
                SUM(credits_used)::int AS credits,
                COUNT(*)::int AS events,
                MAX(created_at) AS last_seen
           FROM usage_records
          WHERE created_at > now() - ($1 || ' days')::interval
          GROUP BY feature_id
          ORDER BY credits DESC`,
        [days]
      ),
      query('SELECT cost_key FROM platform_cost_rates'),
    ]);

    // Explicit (non-fallback) rate keys = built-in defaults + owner overrides.
    const explicitKeys = new Set(
      Object.keys(DEFAULT_COST_RATES).filter(k => k !== 'default')
    );
    for (const r of rateRows.rows as Array<{ cost_key: string }>) {
      if (r.cost_key !== 'default') explicitKeys.add(r.cost_key);
    }

    const meteredFeatures = (usageRes.rows as Array<{
      feature_id: string;
      credits: number;
      events: number;
      last_seen: string;
    }>).map(r => ({
      featureId: r.feature_id,
      credits: r.credits,
      events: r.events,
      lastSeen: r.last_seen,
      hasExplicitRate: explicitKeys.has(r.feature_id),
    }));

    const usageFeatureIds = new Set(meteredFeatures.map(f => f.featureId));
    const usageWithoutExplicitRate = meteredFeatures
      .filter(f => !f.hasExplicitRate)
      .map(f => ({ featureId: f.featureId, credits: f.credits, pricedAt: 'default' as const }));
    const ratedButNoUsage = [...explicitKeys].filter(k => !usageFeatureIds.has(k)).sort();

    return res.json({
      windowDays: days,
      meteredFeatures,
      gaps: { usageWithoutExplicitRate, ratedButNoUsage },
      healthy: usageWithoutExplicitRate.length === 0 && ratedButNoUsage.length === 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Metering coverage query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to compute metering coverage.' });
  }
});

// ─── Access roster — "who are my designated personnel?" ──────────────────────
// Read-only audit of who can reach the Business Center, from the SAME source of
// truth requireBusinessAdmin enforces: the BUSINESS_CENTER_EMAILS allowlist plus
// any user holding a business role. Lets the owner verify access without DB/env
// spelunking. Does NOT grant/revoke — role changes stay an explicit, separate op.

router.get('/access', async (_req: Request, res: Response) => {
  try {
    const roles = [...BUSINESS_ROLES];
    const roleHolders = await query(
      `SELECT u.id, u.email, u.name, u.status, ou.role, o.name AS organization_name
         FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
         LEFT JOIN organizations o ON o.id = ou.organization_id
        WHERE LOWER(ou.role) = ANY($1)
        ORDER BY u.email`,
      [roles]
    );
    return res.json({
      roles,
      allowlistEmails: [...businessAllowlistedEmails()].sort(),
      roleHolders: roleHolders.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Access roster query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load access roster.' });
  }
});

export default router;
