/**
 * Market access — CPT/HCPCS code classification and coverage-dossier completeness.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyProcedureCode,
  assessCoverageDossierCompleteness,
} from '../market-access';

describe('classifyProcedureCode', () => {
  it('classifies each code family', () => {
    expect(classifyProcedureCode('93000').type).toBe('CPT-I');
    expect(classifyProcedureCode('0001F').type).toBe('CPT-II');
    expect(classifyProcedureCode('0042T').type).toBe('CPT-III');
    expect(classifyProcedureCode('0001U').type).toBe('PLA');
    expect(classifyProcedureCode('G0008').type).toBe('HCPCS-II');
  });

  it('marks valid recognized codes', () => {
    expect(classifyProcedureCode('93000').valid).toBe(true);
    expect(classifyProcedureCode('g0008').type).toBe('HCPCS-II'); // case-insensitive
  });

  it('flags an unrecognized format as invalid', () => {
    expect(classifyProcedureCode('ABC').valid).toBe(false);
    expect(classifyProcedureCode('123').type).toBe('unknown');
    expect(classifyProcedureCode('930000').valid).toBe(false);
  });
});

describe('assessCoverageDossierCompleteness', () => {
  it('scores and lists gaps', () => {
    const r = assessCoverageDossierCompleteness({ clinicalEvidence: true, codingStrategy: true });
    expect(r.complete).toBe(false);
    expect(r.completenessScore).toBeCloseTo(2 / 8, 8);
    expect(r.gaps).toContain('budgetImpactModel');
  });

  it('complete when all elements present', () => {
    const r = assessCoverageDossierCompleteness({
      clinicalEvidence: true,
      comparatorEvidence: true,
      patientPopulationDefinition: true,
      codingStrategy: true,
      coveragePolicyAnalysis: true,
      costEffectivenessAnalysis: true,
      budgetImpactModel: true,
      valueProposition: true,
    });
    expect(r.complete).toBe(true);
    expect(r.completenessScore).toBeCloseTo(1, 10);
  });
});
