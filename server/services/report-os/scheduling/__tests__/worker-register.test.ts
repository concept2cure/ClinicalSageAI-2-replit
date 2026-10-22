import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn(), sweep: vi.fn(), metric: vi.fn(), register: vi.fn() }));
vi.mock('../../../../db', () => ({ getPool: () => ({ connect: mocks.connect }) }));
vi.mock('../../../../db/tenantStore', () => ({ runWithSystemTenantScope: (_caller: string, fn: () => Promise<unknown>) => fn() }));
vi.mock('../../../entitlements/resolver', () => ({ resolveCapabilities: vi.fn() }));
vi.mock('../generate-deliver', () => ({ generateAndDeliver: vi.fn() }));
vi.mock('../worker', () => ({ sweepDueSubscriptions: mocks.sweep }));
vi.mock('../../../background-jobs-metrics', () => ({ recordBackgroundJobRun: mocks.metric, registerBackgroundJob: mocks.register, BACKGROUND_JOB: { REPORT_SUBSCRIPTION_SWEEP: 'report-subscription-sweep' } }));
import { initSubscriptionSweep, runSubscriptionSweepTick, stopSubscriptionSweep } from '../worker-register';
beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockReset());
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockResolvedValue({ rows: [{ acquired: true }] });
  mocks.sweep.mockResolvedValue({ scanned: 0, ran: 0, skippedEntitlement: 0, failed: 0 });
});
afterEach(() => { stopSubscriptionSweep(); vi.useRealTimers(); });
describe('Postgres-coordinated Redis-free worker', () => {
  it('starts without Redis and ticks on the timer', async () => {
    vi.useFakeTimers();
    await initSubscriptionSweep();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(mocks.sweep).toHaveBeenCalledTimes(2);
  });
  it('skips a sweep held by another process', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ acquired: false }] });
    await runSubscriptionSweepTick();
    expect(mocks.sweep).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalled();
    expect(mocks.metric).toHaveBeenCalledWith('report-subscription-sweep', { ok: true, processed: 0 });
  });
  it('holds one lock through the sweep and always releases it on failure', async () => {
    mocks.sweep.mockRejectedValueOnce(new Error('database unavailable'));
    await runSubscriptionSweepTick();
    expect(mocks.query.mock.calls[0][0]).toContain('pg_try_advisory_lock');
    expect(mocks.query.mock.calls[1][0]).toContain('pg_advisory_unlock');
    expect(mocks.metric).toHaveBeenCalledWith('report-subscription-sweep', expect.objectContaining({ ok: false }));
    expect(mocks.release).toHaveBeenCalled();
  });
  it('does not report a healthy delivery sweep when an item failed', async () => {
    mocks.sweep.mockResolvedValueOnce({ scanned: 1, ran: 0, skippedEntitlement: 0, failed: 1 });
    await runSubscriptionSweepTick();
    expect(mocks.metric).toHaveBeenCalledWith('report-subscription-sweep', expect.objectContaining({ ok: false, processed: 0 }));
  });
  it('destroys a pooled connection if advisory unlock cannot be proven', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ acquired: true }] }).mockRejectedValueOnce(new Error('connection lost'));
    await runSubscriptionSweepTick();
    expect(mocks.release).toHaveBeenCalledWith(expect.any(Error));
  });
});
