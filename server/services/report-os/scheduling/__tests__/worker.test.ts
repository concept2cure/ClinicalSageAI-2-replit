import { describe, it, expect, vi } from 'vitest';
import { planSweep, type SweepDeps } from '../worker';
import type { ReportSubscriptionRow } from '@shared/schema/report-os';
import type { Tier } from '../../../entitlements/types';

function sub(id: number, orgId: number): ReportSubscriptionRow {
  // Only the fields planSweep reads are needed; cast the rest.
  return {
    id,
    organizationId: orgId,
    reportTypeId: 'readiness.executive_digest',
  } as unknown as ReportSubscriptionRow;
}

function deps(over: Partial<SweepDeps> & Pick<SweepDeps, 'due' | 'resolveTier'>): SweepDeps {
  return {
    generateAndDeliver: vi.fn(async () => undefined),
    onRan: vi.fn(async () => undefined),
    onSkip: vi.fn(async () => undefined),
    ...over,
  };
}

describe('planSweep', () => {
  it('runs entitled subscriptions and advances their cursor', async () => {
    const d = deps({
      due: [sub(1, 10), sub(2, 20)],
      resolveTier: async (): Promise<Tier> => 'professional',
    });
    const summary = await planSweep(d);
    expect(summary.ran).toBe(2);
    expect(summary.skippedEntitlement).toBe(0);
    expect(summary.failed).toBe(0);
    expect(d.generateAndDeliver).toHaveBeenCalledTimes(2);
    expect(d.onRan).toHaveBeenCalledTimes(2);
  });

  it('skips a downgraded org (no scheduled_reports entitlement) and audits it, WITHOUT generating', async () => {
    const d = deps({
      due: [sub(1, 10)],
      resolveTier: async (): Promise<Tier> => 'standard', // scheduled_reports is professional
    });
    const summary = await planSweep(d);
    expect(summary.ran).toBe(0);
    expect(summary.skippedEntitlement).toBe(1);
    expect(summary.items[0].disposition).toBe('skipped_entitlement');
    expect(d.generateAndDeliver).not.toHaveBeenCalled();
    expect(d.onSkip).toHaveBeenCalledTimes(1);
    expect(d.onRan).not.toHaveBeenCalled();
  });

  it('isolates a single failure — the rest of the sweep still runs, cursor NOT advanced for the failure', async () => {
    const gen = vi.fn(async (s: ReportSubscriptionRow) => {
      if (s.id === 2) throw new Error('provider down');
    });
    const d = deps({
      due: [sub(1, 10), sub(2, 20), sub(3, 30)],
      resolveTier: async (): Promise<Tier> => 'enterprise',
      generateAndDeliver: gen,
    });
    const summary = await planSweep(d);
    expect(summary.ran).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.items.find((i) => i.subscriptionId === 2)?.disposition).toBe('failed');
    // onRan (cursor advance) must NOT be called for the failed subscription.
    expect(d.onRan).toHaveBeenCalledTimes(2);
  });

  it('mixes tiers per org: enterprise runs, free skips', async () => {
    const tiers: Record<number, Tier> = { 10: 'enterprise', 20: 'free' };
    const d = deps({
      due: [sub(1, 10), sub(2, 20)],
      resolveTier: async (orgId): Promise<Tier> => tiers[orgId],
    });
    const summary = await planSweep(d);
    expect(summary.ran).toBe(1);
    expect(summary.skippedEntitlement).toBe(1);
  });
});
