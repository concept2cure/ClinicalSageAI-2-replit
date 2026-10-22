/**
 * The generated SAP says which design inputs were not specified, and computes
 * nothing from them.
 *
 * generateSAP filled a missing dropout rate with 0.15 ("Dropout rate assumed at
 * 15%", "N effective after 15% dropout"), a missing duration with 24 weeks, a
 * missing arm count with 2 (and printed an allocation ratio and a per-arm size
 * derived from it), a missing randomization with 'randomized' and a missing
 * blinding with 'blinded'; it printed stratification factors, subgroups, an
 * interim analysis at "approximately 50%" and a significance level of 0.05 that
 * no request field carried. updateSap filled sample_size with 100,
 * primary_endpoint with 'treatment efficacy', and indication / phase with
 * 'Unknown'. And a failed assumption capture was a "non-fatal" log line: the SAP
 * came back with no word that its inputs never reached the registry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const H = vi.hoisted(() => ({ capture: vi.fn(), rows: [] as unknown[] }));

vi.mock('../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => H.rows,
  };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});
vi.mock('../operating-system-integration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../operating-system-integration')>()),
  OperatingSystemIntegration: { getInstance: () => ({ captureFromSapGeneration: H.capture }) },
}));

import SapGenerator from '../sap-generator-service';

const REQUIRED = {
  indication: 'Type 2 diabetes',
  phase: 'Phase 3',
  sample_size: 400,
  primary_endpoint: 'HbA1c change from baseline at week 24',
};

beforeEach(() => {
  H.capture.mockReset();
  H.rows = [];
});

describe('generateSAP — inputs the request did not state', () => {
  it('says each one is not specified, and computes nothing from it', async () => {
    const { sapContent } = await SapGenerator.generateSAP(REQUIRED);

    expect(sapContent).toContain('Sample Size: 400 participants (dropout rate not specified; no effective sample size is computed)');
    expect(sapContent).toContain('Duration: not specified');
    expect(sapContent).toContain('Arms: not specified');
    expect(sapContent).toContain('Randomization: not specified');
    expect(sapContent).toContain('Blinding: not specified');
    expect(sapContent).toContain('Allocation ratio: not specified');
    expect(sapContent).toContain('Stratification factors: not specified');
    expect(sapContent).toContain('Significance level (two-sided): not specified — to be set by the study statistician');
    expect(sapContent).toContain('Dropout rate: not specified — to be set by the study statistician');
    expect(sapContent).toContain('Per-arm sample size: not computed');
    expect(sapContent).toContain('Interim analyses: not specified — to be set by the study statistician');
    expect(sapContent).toContain('Subgroup analyses: not specified — to be set by the study statistician');
    // What it used to print in their place.
    expect(sapContent).not.toMatch(/15%|24 weeks|2-arm|randomized, blinded|effective after|Per-arm sample size: \d|0\.05|approximately 50%|Disease severity, age group/);
    // The honest power deferral is unchanged.
    expect(sapContent).toContain('must be specified and computed by the study statistician');
  });

  it('uses what was stated, and computes only from that', async () => {
    const { sapContent } = await SapGenerator.generateSAP({
      ...REQUIRED,
      dropout_rate: 0.1,
      duration_weeks: 52,
      arms: ['Semaglutide 1.0 mg', 'Placebo'],
      randomization: 'Randomized 1:1, central IWRS',
      blinding: 'Double-blind',
      alpha: 0.05,
      target_power: 0.9,
      minimum_detectable_effect: 0.35,
    });

    expect(sapContent).toContain('Sample Size: 400 participants (360 effective after 10% dropout)');
    expect(sapContent).toContain('Duration: 52 weeks');
    expect(sapContent).toContain('Arms: 2 (Semaglutide 1.0 mg, Placebo)');
    expect(sapContent).toContain('Randomization: Randomized 1:1, central IWRS');
    expect(sapContent).toContain('Blinding: Double-blind');
    expect(sapContent).toContain('Significance level (two-sided): 0.05');
    expect(sapContent).toContain('Dropout rate: 10%');
    expect(sapContent).toContain('will provide 90% power to detect a difference of 0.35');
    // An allocation ratio is still not something the request can state.
    expect(sapContent).toContain('Per-arm sample size: not computed');
  });

  it('refuses a SAP without the inputs it is built on, naming them', async () => {
    const err = await SapGenerator.generateSAP({ ...REQUIRED, sample_size: undefined as unknown as number, primary_endpoint: '' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, 'a SAP was generated without a sample size or a primary endpoint').not.toBeNull();
    expect((err as { fields?: string[] }).fields).toEqual(['primary_endpoint', 'sample_size']);
  });

  it('refuses a dropout rate it cannot use rather than printing it', async () => {
    const err = await SapGenerator.generateSAP({ ...REQUIRED, dropout_rate: 15 }).then(() => null, (e: unknown) => e);
    expect(err, 'a SAP was generated with a 1500% dropout').not.toBeNull();
    expect((err as { fields?: string[] }).fields).toEqual(['dropout_rate']);
  });
});

describe('generateSAP — whether the inputs reached the assumption registry', () => {
  it('says they were not recorded when no project was named', async () => {
    const r = await SapGenerator.generateSAP(REQUIRED);
    expect(r.assumptionCapture).toEqual({
      recorded: false,
      reason: 'no_project_context',
      message: expect.stringMatching(/not recorded in the assumption registry/),
    });
    expect(H.capture).not.toHaveBeenCalled();
  });

  it('reports a failed capture in the result, not only in a log line', async () => {
    H.capture.mockImplementation(async () => {
      throw new Error('connection terminated unexpectedly');
    });
    const r = await SapGenerator.generateSAP({ ...REQUIRED, organizationId: 3, projectId: 12, createdById: 41 });
    expect(r.sapContent).toContain('STATISTICAL ANALYSIS PLAN');
    expect(r.assumptionCapture).toEqual({
      recorded: false,
      reason: 'capture_failed',
      error: expect.stringMatching(/assumption registry/),
      writtenAssumptionIds: [],
    });
    // A driver's text is not passed through to the caller.
    expect(JSON.stringify(r.assumptionCapture)).not.toContain('connection terminated');
  });

  it('reports what was recorded, and passes on only the inputs that were stated', async () => {
    H.capture.mockImplementation(async () => ({
      assumptions: [{ id: 'a-1' }, { id: 'a-2' }],
      decision: { id: 'd-1' },
      notCaptured: ['dropout rate (not specified in the SAP request)'],
    }));
    const r = await SapGenerator.generateSAP({ ...REQUIRED, organizationId: 3, projectId: 12, createdById: 41 });
    expect(r.assumptionCapture).toEqual({
      recorded: true,
      assumptionIds: ['a-1', 'a-2'],
      decisionId: 'd-1',
      notCaptured: ['dropout rate (not specified in the SAP request)'],
    });
    const [ctx] = H.capture.mock.calls[0] as [Record<string, unknown>];
    expect(ctx.dropoutRate).toBeUndefined();
    expect(ctx.alpha).toBeUndefined();
  });
});

describe('updateSap', () => {
  // Organization 3 is the caller's: the protocol is read only within it (2026-10-15).
  beforeEach(() => {
    // generateSAP writes <protocol_id>_sap.txt under data/sap; not from a test.
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  });

  it('refuses rather than filling sample size and endpoint it does not have', async () => {
    H.rows = [{ id: 5, indication: 'NSCLC', phase: 'Phase 2' }];
    const err = await SapGenerator.updateSap('5', 3, {}).then(() => null, (e: unknown) => e);
    expect(err, 'updateSap produced a SAP with an invented sample size and endpoint').not.toBeNull();
    expect((err as { fields?: string[] }).fields).toEqual(['primary_endpoint', 'sample_size']);
  });

  it("carries forward the stored record's values, and never 'Unknown'", async () => {
    H.rows = [{ id: 5, indication: 'NSCLC', phase: null }];
    const err = await SapGenerator.updateSap('5', 3, { sample_size: 120, primary_endpoint: 'PFS' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, "updateSap generated a SAP for phase 'Unknown'").not.toBeNull();
    expect((err as { fields?: string[] }).fields).toEqual(['phase']);

    H.rows = [{ id: 5, indication: 'NSCLC', phase: 'Phase 2' }];
    const r = await SapGenerator.updateSap('5', 3, { sample_size: 120, primary_endpoint: 'PFS' });
    expect(r?.sapContent).toContain('- Indication: NSCLC');
    expect(r?.sapContent).toContain('- Phase: Phase 2');
    expect(r?.sapContent).toContain('Sample Size: 120 participants');
    expect(r?.sapContent).not.toMatch(/Unknown|treatment efficacy|15%|24 weeks/);
  });
});
