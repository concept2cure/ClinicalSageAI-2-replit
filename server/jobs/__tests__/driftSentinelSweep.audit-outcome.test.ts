import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ scan: vi.fn(), warn: vi.fn(), parent: vi.fn(), posture: vi.fn(), candidates: [{ programId: 'program-1' }] }));
vi.mock('../../db', () => ({ db: {
  selectDistinct: () => ({ from: async () => h.candidates }),
  select: () => ({ from: () => ({ where: () => ({ limit: () => h.parent() }) }) }),
} }));
vi.mock('../../services/tenant/tenant-lifecycle', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>()),
  getTenantAccessPosture: (...args: unknown[]) => h.posture(...args),
}));
vi.mock('../../services/living-record/reconciliation-engine', () => ({ runDriftSentinel: (...args: unknown[]) => h.scan(...args) }));
vi.mock('../../utils/logger', () => ({ createScopedLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: (...args: unknown[]) => h.warn(...args) }) }));
import { runDriftSentinelSweep, startDriftSentinelSchedule, stopDriftSentinelSchedule } from '../driftSentinelSweep';
import { getTenantScope } from '../../db/tenantStore';
beforeEach(() => {
  stopDriftSentinelSchedule(); h.scan.mockReset(); h.warn.mockReset();
  h.parent.mockReset().mockResolvedValue([{ organizationId: 42 }]);
  h.posture.mockReset().mockResolvedValue({ organizationId: 42, decision: 'allow' });
  h.candidates = [{ programId: 'program-1' }];
});
describe('drift sweep packet audit projection', () => {
  it('returns the actual program/packet receipts and preserves successful safety work', async () => {
    const auditTrail = { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'Bounded fixture warning' };
    h.scan.mockResolvedValue({ driftDetected: 1, healed: 0, items: [{ packetAuditReceipts: [{ packetId: 'packet-1', auditTrail }] }] });
    expect(await runDriftSentinelSweep()).toMatchObject({ programs: 1, errors: 0, driftDetected: 1, auditTrail,
      packetAuditReceipts: [{ programId: 'program-1', packetId: 'packet-1', auditTrail }] });
  });
  it('does not fabricate an audit when no packets changed', async () => {
    h.scan.mockResolvedValue({ driftDetected: 0, healed: 0, items: [] });
    const result = await runDriftSentinelSweep();
    expect(result.processedPrograms).toBe(1);
    expect(result.packetAuditReceipts).toEqual([]);
    expect(result).not.toHaveProperty('auditTrail');
  });
  it('warns about real missing packet receipts in the opt-in timer', async () => {
    vi.useFakeTimers();
    vi.stubEnv('ENABLE_DRIFT_SENTINEL', 'true');
    h.scan.mockResolvedValue({ driftDetected: 1, healed: 0, items: [{ packetAuditReceipts: [{ packetId: 'packet-1',
      auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'Bounded fixture warning' } }] }] });
    try {
      startDriftSentinelSchedule(1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.warn).toHaveBeenCalledWith('Drift safety flags saved with unconfirmed audit entries', { packetIds: ['packet-1'], count: 1 });
    } finally { stopDriftSentinelSchedule(); vi.unstubAllEnvs(); vi.useRealTimers(); }
  });
});
describe('drift sweep tenant admission', () => {
  it('runs admitted work under the actual role-null organization job scope', async () => {
    h.scan.mockImplementation(async () => {
      expect(getTenantScope()).toMatchObject({ tenantId: '42', role: null, source: 'job', caller: 'drift-sentinel-program' });
      return { driftDetected: 0, healed: 0, items: [] };
    });
    const result = await runDriftSentinelSweep();
    expect(result.processedPrograms).toBe(1);
    expect(h.posture).toHaveBeenCalledWith(42);
  });
  for (const decision of ['deny', 'read_only']) {
    it(`does no write for a ${decision} tenant`, async () => {
      h.posture.mockResolvedValue({ organizationId: 42, decision });
      expect(await runDriftSentinelSweep()).toMatchObject({ processedPrograms: 0, errors: 0, skippedNotEntitled: 1,
        skippedPrograms: [{ programId: 'program-1', reason: 'tenant_not_entitled' }] });
      expect(h.scan).not.toHaveBeenCalled();
    });
  }
  for (const rejected of [false, true]) {
    it(`skips an ${rejected ? 'unavailable' : 'unreadable'} tenant without claiming denial`, async () => {
      if (rejected) h.posture.mockRejectedValue(new Error('Synthetic unavailable posture'));
      else h.posture.mockResolvedValue(null);
      expect(await runDriftSentinelSweep()).toMatchObject({ processedPrograms: 0, errors: 0, skippedUnverifiedTenant: 1, skippedNotEntitled: 0 });
      expect(h.scan).not.toHaveBeenCalled();
    });
  }
  it('does no work for missing/deleted program admission and caps skip details', async () => {
    h.parent.mockResolvedValue([]);
    h.candidates = Array.from({ length: 101 }, (_, index) => ({ programId: `missing-${index}` }));
    const result = await runDriftSentinelSweep();
    expect(result).toMatchObject({ processedPrograms: 0, skippedUnverifiedProgram: 101, skipDetailsLimitReached: true });
    expect(result.skippedPrograms).toHaveLength(100);
    expect(h.posture).not.toHaveBeenCalled(); expect(h.scan).not.toHaveBeenCalled();
  });
});
