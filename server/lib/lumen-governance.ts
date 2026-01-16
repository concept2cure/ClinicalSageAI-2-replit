type RateLimitState = { resetAt: number; count: number };

type DailySpendState = { dayKey: string; spentUsd: number };

function getDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * LumenGovernance
 *
 * Production-mode behavior (simulated): centralized enforcement of per-tenant
 * access checks, rate limits, and daily budgets.
 */
export class LumenGovernance {
  static RATE_LIMIT_PER_HOUR = 1000;
  static DAILY_BUDGET_USD = 100;

  private static rateLimit = new Map<string, RateLimitState>();
  private static dailySpend = new Map<string, DailySpendState>();

  static async checkAccess(tenantId: string) {
    if (!tenantId) throw new Error('Tenant ID required for Lumen access.');
    return true;
  }

  static enforceRateLimit(tenantKey: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;

    const entry = this.rateLimit.get(tenantKey);
    if (!entry || entry.resetAt <= now) {
      this.rateLimit.set(tenantKey, { resetAt: now + windowMs, count: 1 });
      return { allowed: true, remaining: this.RATE_LIMIT_PER_HOUR - 1 };
    }

    if (entry.count >= this.RATE_LIMIT_PER_HOUR) {
      return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: Math.max(0, this.RATE_LIMIT_PER_HOUR - entry.count) };
  }

  static enforceDailyBudget(tenantKey: string, projectedUsd: number): { allowed: boolean; remainingUsd: number } {
    const now = new Date();
    const dayKey = getDayKey(now);
    const entry = this.dailySpend.get(tenantKey);

    if (!entry || entry.dayKey !== dayKey) {
      this.dailySpend.set(tenantKey, { dayKey, spentUsd: 0 });
    }

    const current = this.dailySpend.get(tenantKey)!;
    const remaining = this.DAILY_BUDGET_USD - current.spentUsd;
    if (projectedUsd > remaining) {
      return { allowed: false, remainingUsd: Math.max(0, remaining) };
    }

    return { allowed: true, remainingUsd: Math.max(0, remaining) };
  }

  static recordSpend(tenantKey: string, usd: number) {
    const now = new Date();
    const dayKey = getDayKey(now);
    const entry = this.dailySpend.get(tenantKey);

    if (!entry || entry.dayKey !== dayKey) {
      this.dailySpend.set(tenantKey, { dayKey, spentUsd: Math.max(0, usd) });
      return;
    }

    entry.spentUsd = Math.max(0, entry.spentUsd + usd);
  }

  static getTenantStatus(tenantKey: string): {
    rate: { limitPerHour: number; remaining: number; resetAt: number };
    budget: { dailyBudgetUsd: number; spentUsd: number; remainingUsd: number; dayKey: string };
  } {
    const nowMs = Date.now();
    const windowMs = 60 * 60 * 1000;

    const rateEntry = this.rateLimit.get(tenantKey);
    const rateFresh = rateEntry && rateEntry.resetAt > nowMs ? rateEntry : undefined;
    const remaining = rateFresh ? Math.max(0, this.RATE_LIMIT_PER_HOUR - rateFresh.count) : this.RATE_LIMIT_PER_HOUR;
    const resetAt = rateFresh ? rateFresh.resetAt : nowMs + windowMs;

    const dayKey = getDayKey(new Date());
    const spendEntry = this.dailySpend.get(tenantKey);
    const spentUsd = spendEntry && spendEntry.dayKey === dayKey ? spendEntry.spentUsd : 0;
    const remainingUsd = Math.max(0, this.DAILY_BUDGET_USD - spentUsd);

    return {
      rate: {
        limitPerHour: this.RATE_LIMIT_PER_HOUR,
        remaining,
        resetAt,
      },
      budget: {
        dailyBudgetUsd: this.DAILY_BUDGET_USD,
        spentUsd,
        remainingUsd,
        dayKey,
      },
    };
  }

  static getStats() {
    return {
      trackedTenantsRate: this.rateLimit.size,
      trackedTenantsSpend: this.dailySpend.size,
      rateLimitPerHour: this.RATE_LIMIT_PER_HOUR,
      dailyBudgetUsd: this.DAILY_BUDGET_USD,
    };
  }
}
