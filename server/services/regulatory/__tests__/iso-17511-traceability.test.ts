/**
 * ISO 17511 metrological traceability tests.
 */

import { describe, it, expect } from 'vitest';
import { assessTraceability } from '../iso-17511-traceability';

describe('assessTraceability', () => {
  it('a complete SI-anchored chain is valid', () => {
    const r = assessTraceability({
      tier: 'si_unit',
      certifiedReferenceMaterial: true,
      referenceMeasurementProcedure: true,
      commutabilityDemonstrated: true,
      uncertaintyBudgetDocumented: true,
      unbrokenChain: true,
    });
    expect(r.valid).toBe(true);
    expect(r.completenessScore).toBe(1);
    expect(r.gaps).toHaveLength(0);
  });

  it('flags missing commutability', () => {
    const r = assessTraceability({
      tier: 'international_conventional_crm',
      certifiedReferenceMaterial: true,
      referenceMeasurementProcedure: false,
      commutabilityDemonstrated: false,
      uncertaintyBudgetDocumented: true,
      unbrokenChain: true,
    });
    expect(r.valid).toBe(false);
    expect(r.gaps.some(g => g.toLowerCase().includes('commutability'))).toBe(true);
  });

  it('weakest tier yields the strengthening recommendation', () => {
    const r = assessTraceability({
      tier: 'manufacturer_working_calibrator',
      certifiedReferenceMaterial: false,
      referenceMeasurementProcedure: false,
      commutabilityDemonstrated: false,
      uncertaintyBudgetDocumented: false,
      unbrokenChain: false,
    });
    expect(r.valid).toBe(false);
    expect(r.tierRank).toBe(4);
    expect(r.recommendation).toContain('reference measurement procedure');
  });
});
