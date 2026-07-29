/**
 * IVD lifecycle AnA tools — contract + live handler exercise.
 * The handlers dynamic-import pure engines; these tests invoke the real
 * handlers with valid input to prove the import paths and engine call shapes
 * are correct end-to-end (not just that a handler is registered).
 */

import { describe, it, expect } from 'vitest';

import { IVD_LIFECYCLE_TOOLS } from '../ivdLifecycleTools';
import { getToolHandler } from '../AnaToolExecutor';

async function run(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `${name} handler registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, { organizationId: 1, userId: 1 }));
}

describe('IVD_LIFECYCLE_TOOLS contract', () => {
  it('exposes the eight lifecycle tools with object schemas', () => {
    expect(IVD_LIFECYCLE_TOOLS.map(t => t.name).sort()).toEqual([
      'assess_accelerated_stability',
      'assess_iso17511_traceability',
      'assess_scientific_validity',
      'assess_shelf_life_stability',
      'build_postmarket_report',
      'determine_assay_cutoff',
      'generate_declaration_of_conformity',
      'screen_signal_panel',
    ]);
    for (const t of IVD_LIFECYCLE_TOOLS) {
      expect(t.input_schema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(40);
    }
  });
});

describe('IVD lifecycle handlers (live engine calls)', () => {
  it('screen_signal_panel computes disproportionality metrics from a 2x2 table', async () => {
    const out = await run('screen_signal_panel', { a: 20, b: 10, c: 5, d: 1000 });
    expect(out.status).toBe('computed');
    expect(out.result).toBeTruthy();
  });

  it('assess_iso17511_traceability returns a validity assessment', async () => {
    const out = await run('assess_iso17511_traceability', {
      tier: 'si_unit',
      certifiedReferenceMaterial: true,
      referenceMeasurementProcedure: true,
      commutabilityDemonstrated: true,
      uncertaintyBudgetDocumented: true,
      unbrokenChain: true,
    });
    expect(out.status).toBe('computed');
  });

  it('determine_assay_cutoff computes a cutoff from labelled observations', async () => {
    const out = await run('determine_assay_cutoff', {
      observations: [
        { score: 1, positive: false },
        { score: 2, positive: false },
        { score: 8, positive: true },
        { score: 9, positive: true },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result).toBeTruthy();
  });

  it('build_postmarket_report drafts a PSUR and reports validity', async () => {
    const out = await run('build_postmarket_report', {
      reportType: 'psur',
      fields: {
        deviceName: 'AcmeDx HIV-1',
        riskClass: 'C',
        reportingPeriodStart: '2025-01-01',
        reportingPeriodEnd: '2025-12-31',
        complaintCount: 12,
        seriousIncidentCount: 1,
        fscaCount: 0,
        signalsDetected: 0,
        benefitRiskConclusion: 'Benefit-risk remains favourable.',
      },
    });
    expect(out.status).toBe('computed');
    expect(out.result).toHaveProperty('valid');
  });

  it('build_postmarket_report rejects an unknown report type as needs_parameters', async () => {
    const out = await run('build_postmarket_report', { reportType: 'bogus', fields: {} });
    expect(out.status).toBe('needs_parameters');
  });

  it('screen_signal_panel relays a parameter error for a malformed cell', async () => {
    const out = await run('screen_signal_panel', { a: -1, b: 0, c: 0, d: 0 });
    expect(out.status).toBe('needs_parameters');
  });
});
