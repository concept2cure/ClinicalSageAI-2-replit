/**
 * A contradiction scan that could not run its full detector set is unknown,
 * not clean.
 *
 * That sentence is not mine — it is the comment already sitting on
 * scanProjectFull's fail-closed gate. This test exists because four of the
 * seven detectors made that gate unreachable.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The four Pass-8 detectors each wrapped their body in try/catch, logged a
 * warning, and returned their partial `findings` array. Because the promise
 * RESOLVED:
 *
 *   - `Promise.allSettled`'s `if (result.status === 'rejected') throw` never
 *     saw a rejection for them;
 *   - the `.then(r => { detectionMethods.push('status_conflict'); return r; })`
 *     wrapper still ran, so the response ASSERTED the detector had run;
 *   - `summary.total` came back short by exactly what the crashed detectors
 *     would have found.
 *
 * So a scan in which four detectors crashed answered with all seven method
 * names and a low count. buildPreflightContradictionContext reads that count,
 * and a preflight verdict reads "0 blocking contradictions / ready to promote".
 *
 * Quieter still: an inner `.catch(() => [])` on the artifact read turned a
 * failed query into an empty artifact list with no log line at all — a detector
 * that found nothing because it saw nothing, reported as a detector that found
 * nothing because there was nothing.
 *
 * The three Pass-7 detectors never had a try/catch and always rejected
 * correctly. The fix makes the other four behave the same way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const warn = vi.fn();
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../db', () => ({
  db: {
    query: new Proxy(
      {},
      {
        // Every relation the detectors read resolves through the same stub.
        get: () => ({ findMany: (...a: unknown[]) => findMany(...a) }),
      },
    ),
  },
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));

let service: { detectApprovedVsWorkingDrift: (o: number, p: number) => Promise<unknown> };
beforeEach(async () => {
  vi.resetModules();
  findMany.mockReset();
  warn.mockReset();
  const mod = await import('../contradiction-engine-service');
  service = mod.contradictionEngineService as unknown as typeof service;
});

describe('a Pass-8 detector whose read fails does not report "no findings"', () => {
  it('rejects instead of returning an empty findings array', async () => {
    // The realistic failure: a permissions change or a missing relation.
    findMany.mockRejectedValue(new Error('permission denied for relation artifacts'));

    // Was: resolves to []. The whole defect in one assertion.
    await expect(
      service.detectApprovedVsWorkingDrift(9901, 1),
    ).rejects.toThrow(/permission denied/);
  });

  it('still logs the breadcrumb before rethrowing', async () => {
    findMany.mockRejectedValue(new Error('boom'));

    await expect(service.detectApprovedVsWorkingDrift(9901, 1)).rejects.toThrow();

    // Silence was half the defect — the inner `.catch(() => [])` produced an
    // empty result with no log at all. The warning survives the fix, and names
    // the detector and the cause.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/Approved-vs-working drift detection failed/);
    expect(JSON.stringify(warn.mock.calls[0][1])).toContain('boom');
  });

  it('returns findings normally when the read succeeds', async () => {
    // The fix removes the swallow, not the detector.
    findMany.mockResolvedValue([]);
    await expect(service.detectApprovedVsWorkingDrift(9901, 1)).resolves.toEqual([]);
  });
});
