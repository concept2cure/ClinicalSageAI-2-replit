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
const computeRunForType = vi.hoisted(() => vi.fn());

vi.mock('../../orchestrator', () => ({
  computeInitialRun: (...a: unknown[]) => computeInitialRun(...a),
}));
/* The ONE dispatch both the route and the sweep call. Spied so a case can assert
   WHICH engine the sweep asked for; its real implementation is covered by
   compute-run's own suite. The default below delegates to the engine mocks so
   the existing cases still read as "the digest was not computed". */
vi.mock('../../compute-run', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../compute-run')>();
  return { ...real, computeRunForType: (...a: unknown[]) => computeRunForType(...a) };
});
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
vi.mock('../configuration', () => ({
  validateSubscriptionConfiguration: async (sub: { reportTypeId: string; scopeType: string }) => {
    const { reportAvailability, reportTypeNotComputedMessage } = await import('../../report-engine');
    const availability = reportAvailability(sub.reportTypeId, sub.scopeType);
    if (!availability.runnable) throw new Error(reportTypeNotComputedMessage(sub.reportTypeId));
    return { availability, reportType: { label: sub.reportTypeId }, recipientUserIds: [1] };
  },
}));
vi.mock('../../persistence', () => ({ persistReportRun: vi.fn() }));
// Engine-dispatch tests supply the admitted actor/scope at their boundary.
// Real late membership, sharing and rollback are covered by SQL-backed suites.
vi.mock('../../../c2c/current-program-access', async original => ({
  ...await original<typeof import('../../../c2c/current-program-access')>(),
  readCurrentProgramActor: async (_client: unknown, input: { organizationId: number; userId: number }) => {
    if (input.organizationId !== 3 || input.userId !== 1) throw new Error('Unexpected scheduled actor fixture');
    return { userId: 1, role: 'member' };
  },
}));
vi.mock('../../scope-ownership', async original => ({
  ...await original<typeof import('../../scope-ownership')>(),
  resolveOwnedReportScope: async (input: { organizationId: number; scopeId: string }) => {
    if (input.organizationId !== 3 || input.scopeId !== '11') throw new Error('Unexpected scheduled scope fixture');
    return { projectId: 11 };
  },
}));
vi.mock('../../project-access', async original => ({
  ...await original<typeof import('../../project-access')>(),
  canAccessReportScope: async (org: number, actor: { userId: number }) => org === 3 && actor.userId === 1,
}));

import { generateAndDeliver } from '../worker-register';

const sub = (reportTypeId: string, scopeType = 'project') =>
  ({
    id: 7, organizationId: 3, reportTypeId, scopeType, scopeId: '11',
    channel: 'platform', clientWorkspaceId: null, schedule: { cadence: 'weekly', hour: 8 },
    recipients: [], format: 'pdf', persona: null, enabled: true,
    lastRunAt: null, nextRunAt: new Date('2026-10-09T08:00:00Z'), createdBy: 1, createdAt: new Date('2026-10-08'), updatedAt: new Date('2026-10-08'),
  }) as never;

const noBlockers = { providers: [], blockers: [], criticalBlockers: [], confidence: null, summary: {} };

beforeEach(() => {
  computeInitialRun.mockReset();
  computeDomainRun.mockReset();
  computeRegionalRun.mockReset();
  computeRunForType.mockReset();
  computeInitialRun.mockResolvedValue(noBlockers);
  computeDomainRun.mockResolvedValue(noBlockers);
  computeRegionalRun.mockResolvedValue(noBlockers);
  /* Route each engine to its own mock, exactly as the real dispatch does, so a
     case that asserts "the digest was NOT computed" still means that. */
  computeRunForType.mockImplementation(async (input: { engine: string; typeId: string; organizationId: number; scopeType: string; scopeId: string }) => {
    if (input.engine === 'domain') {
      return { computed: await computeDomainRun(input.typeId, input.organizationId, input.scopeType, input.scopeId) };
    }
    if (input.engine === 'regional') {
      return { computed: await computeRegionalRun(input.typeId, input.organizationId, input.scopeType, input.scopeId) };
    }
    const computed = await computeInitialRun(input.organizationId, input.scopeType, input.scopeId, {});
    return input.engine === 'lineage' ? { computed, lineageRendered: { sections: [] } } : { computed };
  });
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
    'usa_fda.ind_safety_readiness',
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

  /* ── The engine nobody enumerated ────────────────────────────────────────
     The sweep's dispatch was a ternary: domain, then regional, then everything
     else to `computeInitialRun`. `lineage` is "everything else", so a
     document-scoped Evidence & Provenance Trace subscription computed the
     Executive Readiness Digest and stamped it with the trace's name — the j8
     defect, surviving for the one engine the ternary did not name, through two
     separate fixes to this very line (2026-10-11 domain, 2026-10-12 regional).
     The dispatch now lives once (services/report-os/compute-run.ts) and matches
     the union exhaustively, so a fifth engine stops the build. */
  it('the evidence trace at DOCUMENT scope asks for the lineage engine, never the digest', async () => {
    await generateAndDeliver(sub('provenance.evidence_trace_report', 'document'));
    expect(computeRunForType).toHaveBeenCalledTimes(1);
    expect(computeRunForType.mock.calls[0][0]).toMatchObject({
      engine: 'lineage',
      typeId: 'provenance.evidence_trace_report',
      scopeType: 'document',
    });
  });

  it('never passes the report type id as an explicitRegistryId — that was the j8 carrier', async () => {
    await generateAndDeliver(sub('readiness.executive_digest'));
    const asked = computeRunForType.mock.calls[0][0] as { explicitRegistryId?: string };
    // `orchestrator.ts` DECLARES explicitRegistryId and never reads it, so
    // passing the type as one looked like dispatch and was not.
    expect(asked.explicitRegistryId).toBeUndefined();
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
