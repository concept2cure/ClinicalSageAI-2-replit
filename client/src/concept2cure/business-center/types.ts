/**
 * Business Center API payload types — mirror the shapes returned by
 * server/routes/admin/business-center.ts (base path /api/admin/business).
 *
 * All monetary fields are integer cents in USD. Margin percentages are
 * already rounded to one decimal place by the server, or null when revenue
 * is zero (no denominator).
 */

// ─── Executive summary (GET /executive-summary) ──────────────────────────────

export interface ExecPortfolio {
  clients: number;
  activeClients: number;
  mrrCents: number;
  monthlyCostRunRateCents: number;
  grossMarginCents: number;
  grossMarginPct: number | null;
}

export interface LossMaker {
  organizationId: number;
  name: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

export interface ExecRisk {
  lossMakingClients: number;
  lossMakers: LossMaker[];
  revenueConcentrationTop5Pct: number;
}

export interface ExecTopClient {
  organizationId: number;
  name: string;
  revenueCents: number;
  sharePct: number;
}

export interface ExecTierMix {
  tier: string;
  clients: number;
  revenueCents: number;
}

export interface ExecutiveSummaryPayload {
  portfolio: ExecPortfolio;
  risk: ExecRisk;
  topClients: ExecTopClient[];
  tierMix: ExecTierMix[];
  note: string;
  generatedAt: string;
}

// ─── Cost accounting (GET /cost-accounting) ──────────────────────────────────

export interface CostByFeature {
  featureId: string;
  credits: number;
  costCents: number;
}

export interface ClientCostRow {
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
  byFeature: CostByFeature[];
}

export interface CostAccountingTotals {
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number | null;
}

export interface CostAccountingPayload {
  period: string;
  currency: string;
  clients: ClientCostRow[];
  totals: CostAccountingTotals;
  generatedAt: string;
}

// ─── Cost rates (GET /cost-rates, PATCH /cost-rates/:costKey) ─────────────────

export interface CostRate {
  costKey: string;
  label: string;
  unitCostCents: number;
  unit: string;
  source: 'default' | 'override';
  updatedAt: string | null;
}

export interface CostRatesPayload {
  rates: CostRate[];
}

/** PATCH /cost-rates/:costKey body. */
export interface CostRatePatch {
  unitCostCents: number;
  reason: string;
  label?: string;
  unit?: string;
}

// ─── Tier pricing (GET /tier-pricing, PATCH /tier-pricing/:tier) ─────────────

export interface TierPrice {
  tier: string;
  monthlyPriceCents: number;
  perSeatCents: number;
  source: 'default' | 'override';
  updatedAt: string | null;
}

export interface TierPricingPayload {
  tiers: TierPrice[];
}

/** PATCH /tier-pricing/:tier body. */
export interface TierPricePatch {
  monthlyPriceCents: number;
  perSeatCents: number;
  reason: string;
}

// ─── Metering coverage (GET /metering-coverage) ──────────────────────────────

export interface MeteredFeature {
  featureId: string;
  credits: number;
  events: number;
  lastSeen: string;
  hasExplicitRate: boolean;
}

export interface UsageWithoutRate {
  featureId: string;
  credits: number;
  pricedAt: 'default';
}

export interface MeteringCoveragePayload {
  windowDays: number;
  meteredFeatures: MeteredFeature[];
  gaps: {
    usageWithoutExplicitRate: UsageWithoutRate[];
    ratedButNoUsage: string[];
  };
  healthy: boolean;
  generatedAt: string;
}

// ─── Access roster (GET /access) ─────────────────────────────────────────────

export interface RoleHolder {
  id: number;
  email: string;
  name: string | null;
  status: string;
  role: string;
  organization_name: string | null;
}

export interface AccessPayload {
  roles: string[];
  allowlistEmails: string[];
  roleHolders: RoleHolder[];
  generatedAt: string;
}
