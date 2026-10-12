/**
 * A scheduled report runs ITS OWN engine, never the readiness digest in place
 * of one.
 *
 * `generateAndDeliver` called `computeInitialRun` for every subscription,
 * passing the type as an `explicitRegistryId` that `orchestrator.ts` declares
 * and never reads. That is the QA 2026-10-08 j8 defect `report-engine.ts` was
 * written to close — the route was fixed and this path was not, so a schedule
 * over any of the sixteen domain registers computed the digest and stamped it
 * with the register's name.
 *
 * The path had no caller until the Schedules screen gave it one (2026-10-11
 * coverage review). These are the cases that keep it closed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const computeInitialRun = vi.hoisted(() => vi.fn());
const computeDomainRun = vi.hoisted(() => vi.fn());
const computeRegionalRun = vi.hoisted(() => vi.fn());

vi.mock('../../orchestrator', () => ({
  computeInitialRun: (...a: unknown[]) => computeInitialRun(...a),
}));
vi.mock('../../report-engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../report-engine')>();
  return {
    ...real,
    computeDomainRun: (...a: unknown[]) => computeDomainRun(...a),
    computeRegionalRun: (...a: unknown[]) => computeRegionalRun(...a),
  };
});
vi.mock('../delivery', () => ({
  decideDelivery: () => ({ allowed: true, requiresESignature: false, watermark: false }),
}));
vi.mock('../../../entitlements/resolver', () => ({ resolveCapabilities: async () => ({ tier: 'enterprise' }) }));
vi.mock('../../../background-jobs-metrics', () => ({
  recordBackgroundJobRun: vi.fn(),
  registerBackgroundJob: vi.fn(),
  BACKGROUND_JOB: { REPORT_SUBSCRIPTION_SWEEP: 'report-subscription-sweep' },
}));
vi.mock('bull', () => ({ default: class { } }));

import { generateAndDeliver } from '../worker-register';

const sub = (reportTypeId: string, scopeType = 'project') =>
  ({
    id: 7, organizationId: 3, reportTypeId, scopeType, scopeId: '11',
    channel: 'platform', clientWorkspaceId: null, schedule: { cadence: 'weekly', hour: 8 },
    recipients: [], format: 'pdf', persona: null, enabled: true,
    lastRunAt: null, nextRunAt: null, createdBy: 1, createdAt: new Date(), updatedAt: new Date(),
  }) as never;

const noBlockers = { criticalBlockers: [], summary: {} };

beforeEach(() => {
  computeInitialRun.mockReset();
  computeDomainRun.mockReset();
  computeRegionalRun.mockReset();
  computeInitialRun.mockResolvedValue(noBlockers);
  computeDomainRun.mockResolvedValue(noBlockers);
  computeRegionalRun.mockResolvedValue(noBlockers);
});

describe('a scheduled report runs its own engine', () => {
  it('the readiness digest runs the readiness orchestrator', async () => {
    await generateAndDeliver(sub('readiness.executive_digest'));
    expect(computeInitialRun).toHaveBeenCalledTimes(1);
    expect(computeDomainRun).not.toHaveBeenCalled();
  });

  it.each([
    'etmf.completeness_pack',
    'irb.submission_register',
    'fcoi.disclosure_register',
    'inspection.readiness_pack',
  ])('a domain register (%s) runs its OWN provider, not the digest', async (typeId) => {
    await generateAndDeliver(sub(typeId));
    expect(computeDomainRun).toHaveBeenCalledWith(typeId, 3, 'project', '11');
    // The defect: the digest standing in for the register.
    expect(computeInitialRun).not.toHaveBeenCalled();
  });

  it.each([
    'usa_fda.nda_bla_filing_readiness',
    'ema.maa_readiness_assessment',
    'japan_pmda.jnda_shonin_readiness',
  ])('a market assessment (%s) runs the regional engine, not the digest', async (typeId) => {
    await generateAndDeliver(sub(typeId));
    expect(computeRegionalRun).toHaveBeenCalledWith(typeId, 3, 'project', '11');
    // The defect: the digest standing in for a market the program may not even
    // be filing in. The regional engine refuses that case; the digest cannot.
    expect(computeInitialRun).not.toHaveBeenCalled();
  });

  it('a market assessment is not computed above one program, so a program scope throws', async () => {
    await expect(generateAndDeliver(sub('ema.maa_readiness_assessment', 'program'))).rejects.toThrow(
      /No engine computes/,
    );
    expect(computeRegionalRun).not.toHaveBeenCalled();
    expect(computeInitialRun).not.toHaveBeenCalled();
  });

  it('a type no engine computes throws, so the sweep fails the item instead of substituting the digest', async () => {
    await expect(generateAndDeliver(sub('ema.rmp_psur_signal_alignment'))).rejects.toThrow(
      /No engine computes/,
    );
    expect(computeInitialRun).not.toHaveBeenCalled();
    expect(computeDomainRun).not.toHaveBeenCalled();
    expect(computeRegionalRun).not.toHaveBeenCalled();
  });

  it('the evidence trace is not computed at project scope, so it throws there too', async () => {
    await expect(generateAndDeliver(sub('provenance.evidence_trace_report'))).rejects.toThrow(
      /No engine computes/,
    );
    expect(computeInitialRun).not.toHaveBeenCalled();
  });
});
