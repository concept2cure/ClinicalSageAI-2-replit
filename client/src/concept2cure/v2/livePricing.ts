/**
 * Live price cards — GET /api/billing/dtc-pricing + /api/billing/pricing
 * (server/services/billing.ts price book, serialized in DOLLARS) merged over
 * the curated fixture tiers (fixtures/licensing.ts, also dollars).
 *
 * Merge rules (honesty-driven):
 *   • Only price-bearing fields are adopted from the live book
 *     (baseMonthly / perUserMonthly, annualDiscountPct, trialDays); feature
 *     lists, token allowances and commitment terms stay curated copy.
 *   • A fixture tier whose price is null means "Custom / sales-led" — it stays
 *     null even though the serializer collapses null to 0 (never show a
 *     sales-led tier as $0).
 *   • Tiers are matched by `tier` key; a live row with no fixture match is
 *     ignored and a fixture tier with no live match keeps its curated price.
 *   • Any fetch/shape failure keeps the fixtures with sample=true.
 */
import { useMemo } from 'react';
import { useLive } from './dataConnect';
import type { B2bTier, DtcTier } from './fixtures/licensing';

interface LiveDtcRow {
  tier: string;
  priceMonthly?: number;
  annualDiscountPct?: number;
  trialDays?: number;
}

interface LiveB2bRow {
  tier: string;
  perUserMonthly?: number;
  annualDiscountPct?: number;
}

function rows(payload: unknown): Record<string, unknown>[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const tiers = (payload as { tiers?: unknown }).tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const ok = tiers.filter(
    (t): t is Record<string, unknown> =>
      !!t && typeof t === 'object' && typeof (t as any).tier === 'string',
  );
  return ok.length > 0 ? ok : null;
}

export function mergeDtcPricing(fixture: DtcTier[], payload: unknown): DtcTier[] | null {
  const live = rows(payload) as LiveDtcRow[] | null;
  if (!live) return null;
  const byTier = new Map(live.map((r) => [r.tier, r]));
  return fixture.map((f) => {
    const r = byTier.get(f.tier);
    if (!r) return f;
    return {
      ...f,
      baseMonthly:
        f.baseMonthly === null
          ? null // sales-led tier: the serializer's null→0 must not become "$0/mo"
          : typeof r.priceMonthly === 'number'
            ? r.priceMonthly
            : f.baseMonthly,
      annualDiscountPct:
        typeof r.annualDiscountPct === 'number' ? r.annualDiscountPct : f.annualDiscountPct,
      trialDays: typeof r.trialDays === 'number' ? r.trialDays : f.trialDays,
    };
  });
}

export function mergeB2bPricing(fixture: B2bTier[], payload: unknown): B2bTier[] | null {
  const live = rows(payload) as LiveB2bRow[] | null;
  if (!live) return null;
  const byTier = new Map(live.map((r) => [r.tier, r]));
  return fixture.map((f) => {
    const r = byTier.get(f.tier);
    if (!r) return f;
    return {
      ...f,
      perUserMonthly:
        f.perUserMonthly === null
          ? null
          : typeof r.perUserMonthly === 'number' && r.perUserMonthly > 0
            ? r.perUserMonthly
            : f.perUserMonthly,
      annualDiscountPct:
        typeof r.annualDiscountPct === 'number' ? r.annualDiscountPct : f.annualDiscountPct,
    };
  });
}

export function useLiveDtcPricing(fixture: DtcTier[]): { tiers: DtcTier[]; live: boolean } {
  const raw = useLive<unknown>('/api/billing/dtc-pricing', null);
  return useMemo(() => {
    const merged = raw.sample ? null : mergeDtcPricing(fixture, raw.data);
    return { tiers: merged ?? fixture, live: merged !== null };
  }, [raw.sample, raw.data, fixture]);
}

export function useLiveB2bPricing(
  family: string,
  fixture: B2bTier[],
): { tiers: B2bTier[]; live: boolean } {
  // The endpoint keys its book by industry mode and falls back to its default
  // card for unknown keys — either way the numbers are the platform's real
  // price book, so adoption stays honest.
  const raw = useLive<unknown>(
    `/api/billing/pricing?industry=${encodeURIComponent(family)}`,
    null,
    [family],
  );
  return useMemo(() => {
    const merged = raw.sample ? null : mergeB2bPricing(fixture, raw.data);
    return { tiers: merged ?? fixture, live: merged !== null };
  }, [raw.sample, raw.data, fixture]);
}
