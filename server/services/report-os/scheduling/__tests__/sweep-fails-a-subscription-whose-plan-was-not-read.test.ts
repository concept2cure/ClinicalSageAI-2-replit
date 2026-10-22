/**
 * The report sweep fails a subscription whose plan was not read (2026-10-15).
 *
 * What the code used to do: worker-register's resolveTier returned the
 * resolver's `tier` and dropped `tierResolved`, and turned a resolver throw into
 * 'standard'. A due subscription whose organization's plan could not be read
 * was therefore recorded as `skipped_entitlement` — "Org tier 'standard' is
 * not entitled to scheduled reports." — about a plan nobody read, and the
 * sweep reported itself healthy.
 *
 * Now the unread plan fails that subscription's run, saying so; nothing is
 * delivered either way, so no access changes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportSubscriptionRow } from '@shared/schema/report-os';
import type { Tier } from '../../../entitlements/types';

const caps = vi.hoisted(() => ({ resolve: vi.fn() }));
const sweep = vi.hoisted(() => vi.fn());

vi.mock('../../../entitlements/resolver', () => ({ resolveCapabilities: (...a: unknown[]) => caps.resolve(...a) }));
vi.mock('../../../../db/tenantStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../db/tenantStore')>()),
  runWithSystemTenantScope: (_caller: string, fn: () => Promise<unknown>) => fn(),
}));
// The real planSweep; only the DB-reading orchestrator is replaced, to capture
// the resolveTier the sweep is handed.
vi.mock('../worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../worker')>()),
  sweepDueSubscriptions: (...a: unknown[]) => sweep(...a),
}));
vi.mock('../../../background-jobs-metrics', () => ({
  recordBackgroundJobRun: vi.fn(),
  registerBackgroundJob: vi.fn(),
  BACKGROUND_JOB: { REPORT_SUBSCRIPTION_SWEEP: 'report-subscription-sweep' },
}));

import { getPool } from '../../../../db';
import { planSweep } from '../worker';
import { runSubscriptionSweepTick } from '../worker-register';

type ResolveTier = (organizationId: number) => Promise<Tier>;
type FakeClient = { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>; release: () => void };

const SUB = { id: 1, organizationId: 7, reportTypeId: 'readiness.executive_digest' } as unknown as ReportSubscriptionRow;

/** Run one locked tick and return the resolveTier it handed the sweep. */
async function capturedResolveTier(): Promise<ResolveTier> {
  const client: FakeClient = {
    query: async (sql) => ({ rows: sql.includes('pg_try_advisory_lock') ? [{ acquired: true }] : [] }),
    release: () => undefined,
  };
  vi.spyOn(getPool() as unknown as { connect: () => Promise<FakeClient> }, 'connect').mockResolvedValue(client);
  sweep.mockResolvedValue({ scanned: 0, ran: 0, skippedEntitlement: 0, failed: 0, items: [] });
  await runSubscriptionSweepTick();
  expect(sweep).toHaveBeenCalledTimes(1);
  return sweep.mock.calls[0][2] as ResolveTier;
}

beforeEach(() => {
  caps.resolve.mockReset();
  sweep.mockReset();
});

describe('report sweep tier resolution', () => {
  it.each([
    { label: 'the resolver could not read the plan', value: { tier: null, tierResolved: false } },
    { label: 'the resolver marks its tier as unread', value: { tier: 'standard', tierResolved: false } },
  ])('fails the subscription, naming the unread plan, when $label', async ({ value }) => {
    caps.resolve.mockResolvedValue(value);
    const resolveTier = await capturedResolveTier();
    await expect(resolveTier(7), 'an unread plan was handed to the sweep as a tier').rejects.toThrow(/could not be read/);

    const generateAndDeliver = vi.fn();
    const summary = await planSweep({ due: [SUB], resolveTier, generateAndDeliver, onRan: vi.fn() });
    expect(summary.items[0].disposition, 'an unread plan was recorded as an entitlement skip').toBe('failed');
    expect(summary.items[0].reason).toMatch(/could not be read/);
    expect(generateAndDeliver).not.toHaveBeenCalled();
  });

  it('fails the subscription when the resolver itself throws', async () => {
    caps.resolve.mockRejectedValue(new Error('capability store unreachable'));
    const resolveTier = await capturedResolveTier();
    await expect(resolveTier(7), 'a resolver failure became the standard plan').rejects.toThrow('capability store unreachable');
  });

  it('control: a read enterprise plan reaches the sweep and the subscription runs', async () => {
    caps.resolve.mockResolvedValue({ tier: 'enterprise', tierResolved: true });
    const resolveTier = await capturedResolveTier();
    expect(await resolveTier(7)).toBe('enterprise');
    const generateAndDeliver = vi.fn().mockResolvedValue(undefined);
    const summary = await planSweep({ due: [SUB], resolveTier, generateAndDeliver, onRan: vi.fn().mockResolvedValue(undefined) });
    expect(summary.items[0].disposition).toBe('ran');
  });
});
