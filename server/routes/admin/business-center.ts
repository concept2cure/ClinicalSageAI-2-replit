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

const logger = createScopedLogger('admin-business-center');
const router = Router();

router.use(authMiddleware);
router.use(requireBusinessAdmin);

// ─── Defaults (apply until the owner overrides a value) ──────────────────────

/** Unit cost in cents per metered credit, by usage feature_id. */
const DEFAULT_COST_RATES: Record<string, { label: string; unitCostCents: number; unit: string }> = {
  deep_research: { label: 'Deep research', unitCostCents: 25, unit: 'credit' },
  csr_builder: { label: 'CSR builder', unitCostCents: 15, unit: 'credit' },
  ctd_builder: { label: 'CTD builder', unitCostCents: 15, unit: 'credit' },
  default: { label: 'Other metered usage', unitCostCents: 5, unit: 'credit' },
};

/** Per-tier recognized revenue, in cents. */
const DEFAULT_TIER_PRICES: Record<string, { monthlyPriceCents: number; perSeatCents: number }> = {
  free: { monthlyPriceCents: 0, perSeatCents: 0 },
  standard: { monthlyPriceCents: 49900, perSeatCents: 0 },
  professional: { monthlyPriceCents: 149900, perSeatCents: 0 },
  enterprise: { monthlyPriceCents: 0, perSeatCents: 0 }, // custom-quoted; owner sets
};

// ─── Rate-card loaders (DB overrides merged over defaults) ────────────────────

async function loadCostRates(): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  for (const [k, v] of Object.entries(DEFAULT_COST_RATES)) rates.set(k, v.unitCostCents);
  const res = await query('SELECT cost_key, unit_cost_cents FROM platform_cost_rates');
  for (const row of res.rows as Array<{ cost_key: string; unit_cost_cents: number }>) {
    rates.set(row.cost_key, row.unit_cost_cents);
  }
  return rates;
}

async function loadTierPrices(): Promise<Map<string, { monthly: number; perSeat: number }>> {
  const prices = new Map<string, { monthly: number; perSeat: number }>();
  for (const [k, v] of Object.entries(DEFAULT_TIER_PRICES)) {
    prices.set(k, { monthly: v.monthlyPriceCents, perSeat: v.perSeatCents });
  }
  const res = await query('SELECT tier, monthly_price_cents, per_seat_cents FROM tier_pricing');
  for (const row of res.rows as Array<{ tier: string; monthly_price_cents: number; per_seat_cents: number }>) {
    prices.set(row.tier, { monthly: row.monthly_price_cents, perSeat: row.per_seat_cents });
  }
  return prices;
}

function rateFor(rates: Map<string, number>, featureId: string): number {
  return rates.get(featureId) ?? rates.get('default') ?? 0;
}

interface ClientCostRow {
  organizationId: number;
  name: string;
  slug: string;
  tier: string;
  status: string;
  seats: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number | null;
  byFeature: Array<{ featureId: string; credits: number; costCents: number }>;
}

/** Build the per-client cost-accounting rows for the trailing 30 days. */
async function buildCostAccounting(): Promise<ClientCostRow[]> {
  const [rates, prices, orgsRes, usageRes] = await Promise.all([
    loadCostRates(),
    loadTierPrices(),
    query(
      `SELECT id, name, slug, COALESCE(tier,'standard') AS tier, status,
              COALESCE(seats_purchased, 0) AS seats
         FROM organizations`
    ),
    query(
      `SELECT organization_id, feature_id, SUM(credits_used)::int AS credits
         FROM usage_records
        WHERE created_at > now() - interval '30 days'
        GROUP BY organization_id, feature_id`
    ),
  ]);

  // Index usage by org.
  const usageByOrg = new Map<number, Array<{ featureId: string; credits: number }>>();
  for (const r of usageRes.rows as Array<{ organization_id: number; feature_id: string; credits: number }>) {
    const list = usageByOrg.get(r.organization_id) ?? [];
    list.push({ featureId: r.feature_id, credits: r.credits });
    usageByOrg.set(r.organization_id, list);
  }

  const rows: ClientCostRow[] = (orgsRes.rows as Array<{
    id: number;
    name: string;
    slug: string;
    tier: string;
    status: string;
    seats: number;
  }>).map(o => {
    const price = prices.get(o.tier) ?? { monthly: 0, perSeat: 0 };
    const revenueCents = price.monthly + price.perSeat * (o.seats || 0);
    const usage = usageByOrg.get(o.id) ?? [];
    const byFeature = usage.map(u => ({
      featureId: u.featureId,
      credits: u.credits,
      costCents: u.credits * rateFor(rates, u.featureId),
    }));
    const costCents = byFeature.reduce((sum, f) => sum + f.costCents, 0);
    const marginCents = revenueCents - costCents;
    const marginPct = revenueCents > 0 ? Math.round((marginCents / revenueCents) * 1000) / 10 : null;
    return {
      organizationId: o.id,
      name: o.name,
      slug: o.slug,
      tier: o.tier,
      status: o.status,
      seats: o.seats || 0,
      revenueCents,
      costCents,
      marginCents,
      marginPct,
      byFeature,
    };
  });

  // Lowest margin first — that's what the owner most wants to see.
  rows.sort((a, b) => a.marginCents - b.marginCents);
  return rows;
}

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
    return res.json({
      period: 'trailing_30d',
      currency: 'usd',
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
    const header = 'organization_id,client,slug,tier,status,seats,revenue_usd,cost_usd,margin_usd,margin_pct';
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

// ─── Rate cards — cost rates ─────────────────────────────────────────────────

router.get('/cost-rates', async (_req: Request, res: Response) => {
  try {
    const res2 = await query(
      'SELECT cost_key, label, unit_cost_cents, unit, updated_at FROM platform_cost_rates'
    );
    const overrides = new Map(
      (res2.rows as Array<{ cost_key: string }>).map(r => [r.cost_key, r])
    );
    const merged = Object.entries(DEFAULT_COST_RATES).map(([costKey, d]) => {
      const o = overrides.get(costKey) as
        | { label: string | null; unit_cost_cents: number; unit: string; updated_at: string }
        | undefined;
      return {
        costKey,
        label: o?.label ?? d.label,
        unitCostCents: o?.unit_cost_cents ?? d.unitCostCents,
        unit: o?.unit ?? d.unit,
        source: o ? 'override' : 'default',
        updatedAt: o?.updated_at ?? null,
      };
    });
    // Include any custom keys the owner added that aren't in the defaults.
    for (const row of res2.rows as Array<{
      cost_key: string;
      label: string | null;
      unit_cost_cents: number;
      unit: string;
      updated_at: string;
    }>) {
      if (!DEFAULT_COST_RATES[row.cost_key]) {
        merged.push({
          costKey: row.cost_key,
          label: row.label ?? row.cost_key,
          unitCostCents: row.unit_cost_cents,
          unit: row.unit,
          source: 'override',
          updatedAt: row.updated_at,
        });
      }
    }
    return res.json({ rates: merged });
  } catch (err) {
    logger.error('Cost-rate list failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load cost rates.' });
  }
});

router.patch('/cost-rates/:costKey', async (req: Request, res: Response) => {
  try {
    const costKey = String(req.params.costKey || '').trim();
    if (!costKey) return res.status(400).json({ error: 'costKey is required.' });
    const body = req.body as { unitCostCents?: unknown; label?: unknown; unit?: unknown; reason?: unknown };
    const unitCostCents = Number(body.unitCostCents);
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) {
      return res.status(400).json({ error: 'unitCostCents must be a non-negative number.' });
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const label = typeof body.label === 'string' ? body.label.slice(0, 200) : null;
    const unit = typeof body.unit === 'string' ? body.unit.slice(0, 40) : 'credit';
    const actor = req.userEmail ?? null;

    const result = await query(
      `INSERT INTO platform_cost_rates (cost_key, label, unit_cost_cents, unit, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (cost_key) DO UPDATE
         SET unit_cost_cents = EXCLUDED.unit_cost_cents,
             label = COALESCE(EXCLUDED.label, platform_cost_rates.label),
             unit = EXCLUDED.unit,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING cost_key, label, unit_cost_cents, unit, updated_at`,
      [costKey, label, Math.trunc(unitCostCents), unit, actor]
    );

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'platform_cost_rate',
      resourceId: costKey,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        businessCenterAction: 'cost_rate.update',
        unitCostCents: Math.trunc(unitCostCents),
        reason: body.reason.trim(),
      },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Cost-rate update failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update cost rate.' });
  }
});

// ─── Rate cards — tier pricing ───────────────────────────────────────────────

router.get('/tier-pricing', async (_req: Request, res: Response) => {
  try {
    const res2 = await query(
      'SELECT tier, monthly_price_cents, per_seat_cents, updated_at FROM tier_pricing'
    );
    const overrides = new Map(
      (res2.rows as Array<{ tier: string }>).map(r => [r.tier, r])
    );
    const tiers = Object.entries(DEFAULT_TIER_PRICES).map(([tier, d]) => {
      const o = overrides.get(tier) as
        | { monthly_price_cents: number; per_seat_cents: number; updated_at: string }
        | undefined;
      return {
        tier,
        monthlyPriceCents: o?.monthly_price_cents ?? d.monthlyPriceCents,
        perSeatCents: o?.per_seat_cents ?? d.perSeatCents,
        source: o ? 'override' : 'default',
        updatedAt: o?.updated_at ?? null,
      };
    });
    return res.json({ tiers });
  } catch (err) {
    logger.error('Tier-pricing list failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load tier pricing.' });
  }
});

router.patch('/tier-pricing/:tier', async (req: Request, res: Response) => {
  try {
    const tier = String(req.params.tier || '').trim().toLowerCase();
    if (!DEFAULT_TIER_PRICES[tier]) {
      return res.status(404).json({ error: `Unknown tier. Expected one of: ${Object.keys(DEFAULT_TIER_PRICES).join(', ')}` });
    }
    const body = req.body as { monthlyPriceCents?: unknown; perSeatCents?: unknown; reason?: unknown };
    const monthly = Number(body.monthlyPriceCents);
    const perSeat = body.perSeatCents == null ? 0 : Number(body.perSeatCents);
    if (!Number.isFinite(monthly) || monthly < 0 || !Number.isFinite(perSeat) || perSeat < 0) {
      return res.status(400).json({ error: 'monthlyPriceCents and perSeatCents must be non-negative numbers.' });
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const actor = req.userEmail ?? null;
    const result = await query(
      `INSERT INTO tier_pricing (tier, monthly_price_cents, per_seat_cents, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tier) DO UPDATE
         SET monthly_price_cents = EXCLUDED.monthly_price_cents,
             per_seat_cents = EXCLUDED.per_seat_cents,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING tier, monthly_price_cents, per_seat_cents, updated_at`,
      [tier, Math.trunc(monthly), Math.trunc(perSeat), actor]
    );

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'tier_pricing',
      resourceId: tier,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        businessCenterAction: 'tier_pricing.update',
        monthlyPriceCents: Math.trunc(monthly),
        perSeatCents: Math.trunc(perSeat),
        reason: body.reason.trim(),
      },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Tier-pricing update failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update tier pricing.' });
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
