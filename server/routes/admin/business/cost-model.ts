/**
 * Business Center cost model — the finance core, separated from the HTTP layer.
 *
 * Holds the rate-card defaults, the DB-override loaders, and `buildCostAccounting`
 * (per-client recognized revenue, attributed cost, and margin for the trailing
 * 30 days). Revenue prefers actual paid Stripe invoices per client and falls
 * back to the modeled tier card; cost is metered usage × owner-set unit rates.
 *
 * Imported by the business-center router and its rate-cards sub-router so the
 * numbers reconcile across cost-accounting, P&L, and the executive summary.
 */

import { query } from '../../../db';
import { getInvoicedRevenueCentsByOrg } from '../../../services/billing/stripe-revenue';

// ─── Defaults (apply until the owner overrides a value) ──────────────────────

/** Unit cost in cents per metered credit, by usage feature_id. */
export const DEFAULT_COST_RATES: Record<
  string,
  { label: string; unitCostCents: number; unit: string }
> = {
  deep_research: { label: 'Deep research', unitCostCents: 25, unit: 'credit' },
  csr_builder: { label: 'CSR builder', unitCostCents: 15, unit: 'credit' },
  ctd_builder: { label: 'CTD builder', unitCostCents: 15, unit: 'credit' },
  default: { label: 'Other metered usage', unitCostCents: 5, unit: 'credit' },
};

/** Per-tier recognized revenue, in cents. */
export const DEFAULT_TIER_PRICES: Record<
  string,
  { monthlyPriceCents: number; perSeatCents: number }
> = {
  free: { monthlyPriceCents: 0, perSeatCents: 0 },
  standard: { monthlyPriceCents: 49900, perSeatCents: 0 },
  professional: { monthlyPriceCents: 149900, perSeatCents: 0 },
  enterprise: { monthlyPriceCents: 0, perSeatCents: 0 }, // custom-quoted; owner sets
};

// ─── Rate-card loaders (DB overrides merged over defaults) ────────────────────

export async function loadCostRates(): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  for (const [k, v] of Object.entries(DEFAULT_COST_RATES)) rates.set(k, v.unitCostCents);
  const res = await query('SELECT cost_key, unit_cost_cents FROM platform_cost_rates');
  for (const row of res.rows as Array<{ cost_key: string; unit_cost_cents: number }>) {
    rates.set(row.cost_key, row.unit_cost_cents);
  }
  return rates;
}

export async function loadTierPrices(): Promise<Map<string, { monthly: number; perSeat: number }>> {
  const prices = new Map<string, { monthly: number; perSeat: number }>();
  for (const [k, v] of Object.entries(DEFAULT_TIER_PRICES)) {
    prices.set(k, { monthly: v.monthlyPriceCents, perSeat: v.perSeatCents });
  }
  const res = await query('SELECT tier, monthly_price_cents, per_seat_cents FROM tier_pricing');
  for (const row of res.rows as Array<{
    tier: string;
    monthly_price_cents: number;
    per_seat_cents: number;
  }>) {
    prices.set(row.tier, { monthly: row.monthly_price_cents, perSeat: row.per_seat_cents });
  }
  return prices;
}

export function rateFor(rates: Map<string, number>, featureId: string): number {
  return rates.get(featureId) ?? rates.get('default') ?? 0;
}

export interface ClientCostRow {
  organizationId: number;
  name: string;
  slug: string;
  tier: string;
  status: string;
  seats: number;
  revenueCents: number;
  /** Where revenueCents came from: actual paid Stripe invoices, or the modeled tier card. */
  revenueSource: 'stripe' | 'modeled';
  costCents: number;
  marginCents: number;
  marginPct: number | null;
  byFeature: Array<{ featureId: string; credits: number; costCents: number }>;
}

/** Build the per-client cost-accounting rows for the trailing 30 days. */
export async function buildCostAccounting(): Promise<ClientCostRow[]> {
  const [rates, prices, orgsRes, usageRes, invoicedByOrg] = await Promise.all([
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
    // Actual invoiced revenue from Stripe for the same trailing-30d window.
    // Empty map when Stripe is unconfigured/down → every client falls back to
    // the modeled tier card below.
    getInvoicedRevenueCentsByOrg(30),
  ]);

  // Index usage by org.
  const usageByOrg = new Map<number, Array<{ featureId: string; credits: number }>>();
  for (const r of usageRes.rows as Array<{
    organization_id: number;
    feature_id: string;
    credits: number;
  }>) {
    const list = usageByOrg.get(r.organization_id) ?? [];
    list.push({ featureId: r.feature_id, credits: r.credits });
    usageByOrg.set(r.organization_id, list);
  }

  const rows: ClientCostRow[] = (
    orgsRes.rows as Array<{
      id: number;
      name: string;
      slug: string;
      tier: string;
      status: string;
      seats: number;
    }>
  ).map(o => {
    const price = prices.get(o.tier) ?? { monthly: 0, perSeat: 0 };
    const modeledRevenueCents = price.monthly + price.perSeat * (o.seats || 0);
    // Prefer actual invoiced revenue from Stripe when we have it for this org;
    // otherwise fall back to the modeled tier card.
    const invoiced = invoicedByOrg.get(o.id);
    const usedStripe = invoiced != null;
    const revenueCents = usedStripe ? invoiced : modeledRevenueCents;
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
      revenueSource: usedStripe ? 'stripe' : 'modeled',
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
