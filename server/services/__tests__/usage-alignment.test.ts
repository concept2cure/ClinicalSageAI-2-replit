/**
 * Unit tests for the Anthropic-style usage/licensing alignment layer:
 *   - usage-recorder  — entry normalization + USD→cents
 *   - usage-windows   — session window math + percent-used + budget grid
 *   - credit-ledger   — auto-reload predicate/validation + entry-sign rules
 *   - entitlements/resolver — toggle applicability + tier⊕toggle composition
 *
 * Targets the PURE cores; the DB wrappers are thin pass-throughs (same
 * testing posture as weekly-usage-limits.test.ts).
 */
import { describe, it, expect } from 'vitest';

import { normalizeUsageEntry, usdToCents } from '../usage-recorder';
import {
  sessionWindowFromEvents,
  percentUsed,
  PLAN_USAGE_BUDGETS,
  SESSION_WINDOW_HOURS,
} from '../usage-windows';
import {
  shouldAutoReload,
  validateAutoReload,
  normalizeEntryAmount,
  DEFAULT_AUTORELOAD,
} from '../credit-ledger';
import { toggleAppliesToOrg, composeFeatures } from '../entitlements/resolver';
import { entitlementMatrix } from '../entitlements/mdx-entitlements';

// ─────────────────────────────────────────────────────────────────────────────
// usage-recorder
// ─────────────────────────────────────────────────────────────────────────────

describe('usdToCents', () => {
  it('rounds to integer cents', () => {
    expect(usdToCents(0.015)).toBe(2);
    expect(usdToCents(0.014)).toBe(1);
    expect(usdToCents(1.006)).toBe(101);
    // IEEE 754: 1.005 * 100 === 100.4999… — rounds down. The precise USD
    // figure travels in metadata, so sub-cent drift stays auditable.
    expect(usdToCents(1.005)).toBe(100);
  });

  it('returns 0 for non-finite or non-positive input', () => {
    expect(usdToCents(0)).toBe(0);
    expect(usdToCents(-3)).toBe(0);
    expect(usdToCents(Number.NaN)).toBe(0);
    expect(usdToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('normalizeUsageEntry', () => {
  it('drops entries without a finite positive organizationId', () => {
    expect(normalizeUsageEntry({ organizationId: 0 })).toBeNull();
    expect(normalizeUsageEntry({ organizationId: -4 })).toBeNull();
    expect(normalizeUsageEntry({ organizationId: Number.NaN })).toBeNull();
  });

  it('defaults module to ai_assistance and clamps negatives to 0', () => {
    const row = normalizeUsageEntry({
      organizationId: 7,
      tokensUsed: -50,
      costCents: -1,
    })!;
    expect(row.module).toBe('ai_assistance');
    expect(row.tokensUsed).toBe(0);
    expect(row.costCents).toBe(0);
    expect(row.requestCount).toBe(1); // at least one request
  });

  it('preserves attribution fields', () => {
    const row = normalizeUsageEntry({
      organizationId: 7,
      userId: 12,
      module: 'cer',
      endpoint: 'document_drafting',
      model: 'claude-opus-4-7',
      requestCount: 2,
      tokensUsed: 1234,
      costCents: 8,
    })!;
    expect(row).toMatchObject({
      organizationId: 7,
      userId: 12,
      module: 'cer',
      endpoint: 'document_drafting',
      model: 'claude-opus-4-7',
      requestCount: 2,
      tokensUsed: 1234,
      costCents: 8,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usage-windows
// ─────────────────────────────────────────────────────────────────────────────

describe('sessionWindowFromEvents', () => {
  const now = new Date('2026-07-02T12:00:00Z');
  const h = 3_600_000;

  it('is idle with no events in the trailing window', () => {
    expect(sessionWindowFromEvents([], now)).toEqual({ start: null, resetsAt: null });
    // An event older than the window does not anchor a session.
    const stale = new Date(now.getTime() - (SESSION_WINDOW_HOURS + 1) * h);
    expect(sessionWindowFromEvents([stale], now)).toEqual({ start: null, resetsAt: null });
  });

  it('anchors on the earliest event inside the window and resets 5h after it', () => {
    const first = new Date(now.getTime() - 2.5 * h);
    const later = new Date(now.getTime() - 1 * h);
    const w = sessionWindowFromEvents([later, first], now);
    expect(w.start?.toISOString()).toBe(first.toISOString());
    expect(w.resetsAt?.toISOString()).toBe(
      new Date(first.getTime() + SESSION_WINDOW_HOURS * h).toISOString(),
    );
  });

  it('ignores future timestamps', () => {
    const future = new Date(now.getTime() + h);
    expect(sessionWindowFromEvents([future], now)).toEqual({ start: null, resetsAt: null });
  });
});

describe('percentUsed', () => {
  it('reads 0 with no usage and rounds to integer percent', () => {
    expect(percentUsed(0, 500)).toBe(0);
    expect(percentUsed(275, 500)).toBe(55);
  });

  it('does not clamp overage and treats zero budget with usage as 100', () => {
    expect(percentUsed(600, 500)).toBe(120);
    expect(percentUsed(1, 0)).toBe(100);
  });
});

describe('PLAN_USAGE_BUDGETS', () => {
  it('covers all four real tiers, ascending in every budget', () => {
    const tiers = ['free', 'standard', 'professional', 'enterprise'];
    expect(Object.keys(PLAN_USAGE_BUDGETS).sort()).toEqual([...tiers].sort());
    for (let i = 1; i < tiers.length; i++) {
      const lower = PLAN_USAGE_BUDGETS[tiers[i - 1]];
      const higher = PLAN_USAGE_BUDGETS[tiers[i]];
      expect(higher.sessionCostCents).toBeGreaterThan(lower.sessionCostCents);
      expect(higher.weeklyCostCents).toBeGreaterThan(lower.weeklyCostCents);
      expect(higher.weeklyPremiumCostCents).toBeGreaterThan(lower.weeklyPremiumCostCents);
    }
  });

  it('keeps the premium bucket within the all-models budget', () => {
    for (const budget of Object.values(PLAN_USAGE_BUDGETS)) {
      expect(budget.weeklyPremiumCostCents).toBeLessThanOrEqual(budget.weeklyCostCents);
      expect(budget.sessionCostCents).toBeLessThanOrEqual(budget.weeklyCostCents);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// credit-ledger
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldAutoReload', () => {
  const settings = { enabled: true, thresholdCents: 1_000, topupCents: 2_500 };

  it('fires at or below the threshold, not above', () => {
    expect(shouldAutoReload(1_000, settings)).toBe(true);
    expect(shouldAutoReload(999, settings)).toBe(true);
    expect(shouldAutoReload(-50, settings)).toBe(true);
    expect(shouldAutoReload(1_001, settings)).toBe(false);
  });

  it('never fires when disabled, unset, or balance is not finite', () => {
    expect(shouldAutoReload(0, { ...settings, enabled: false })).toBe(false);
    expect(shouldAutoReload(0, null)).toBe(false);
    expect(shouldAutoReload(Number.NaN, settings)).toBe(false);
  });
});

describe('validateAutoReload', () => {
  it('accepts the platform defaults', () => {
    expect(validateAutoReload({ ...DEFAULT_AUTORELOAD })).toEqual([]);
  });

  it('rejects non-boolean enabled, negative threshold, non-positive topup', () => {
    expect(validateAutoReload({ enabled: 'yes', thresholdCents: -1, topupCents: 0 })).toHaveLength(3);
  });
});

describe('normalizeEntryAmount', () => {
  it('normalizes debit amounts to negative', () => {
    expect(normalizeEntryAmount('debit', 500)).toBe(-500);
    expect(normalizeEntryAmount('debit', -500)).toBe(-500);
  });

  it('rejects negative credit-type amounts and zero/non-integer amounts', () => {
    expect(() => normalizeEntryAmount('grant', -100)).toThrow();
    expect(() => normalizeEntryAmount('purchase', 0)).toThrow();
    expect(() => normalizeEntryAmount('auto_reload', 10.5)).toThrow();
  });

  it('passes signed adjustments through', () => {
    expect(normalizeEntryAmount('adjustment', -250)).toBe(-250);
    expect(normalizeEntryAmount('adjustment', 250)).toBe(250);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// entitlements/resolver
// ─────────────────────────────────────────────────────────────────────────────

describe('toggleAppliesToOrg', () => {
  it('applies when globally enabled regardless of allowlist', () => {
    expect(toggleAppliesToOrg({ enabled: true, enabledForOrganizationIds: [] }, 7)).toBe(true);
  });

  it('applies when the org is allowlisted even if not globally enabled', () => {
    expect(toggleAppliesToOrg({ enabled: false, enabledForOrganizationIds: [3, 7] }, 7)).toBe(true);
    expect(toggleAppliesToOrg({ enabled: false, enabledForOrganizationIds: [3] }, 7)).toBe(false);
    expect(toggleAppliesToOrg({ enabled: false, enabledForOrganizationIds: null }, 7)).toBe(false);
  });
});

describe('composeFeatures', () => {
  it('mirrors the tier matrix with no toggles', () => {
    const features = composeFeatures('professional', new Set());
    const matrix = entitlementMatrix();
    expect(features).toHaveLength(matrix.length);
    for (const f of features) {
      expect(f.source).toBe('tier');
    }
    // professional unlocks everything except the enterprise-only rollup
    const rollup = features.find(f => f.feature === 'portfolio_rollup')!;
    expect(rollup.enabled).toBe(false);
    const forecast = features.find(f => f.feature === 'prediction_forecast_report')!;
    expect(forecast.enabled).toBe(true);
  });

  it('lets a toggle grant a feature below tier, attributed to the toggle', () => {
    const features = composeFeatures('standard', new Set(['prediction_forecast_report']));
    const forecast = features.find(f => f.feature === 'prediction_forecast_report')!;
    expect(forecast.enabled).toBe(true);
    expect(forecast.source).toBe('toggle');
  });

  it('does not let a toggle disable a tier entitlement (grant-only)', () => {
    const features = composeFeatures('enterprise', new Set());
    for (const f of features) expect(f.enabled).toBe(true);
  });
});
