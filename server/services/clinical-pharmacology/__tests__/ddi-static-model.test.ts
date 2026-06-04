/**
 * Unit tests for the DDI static-model risk assessor.
 * Pure module — no mocks. Checks each FDA cut-off and the study recommendation.
 */

import { describe, it, expect } from 'vitest';

import { assessDdiRisk } from '../ddi-static-model';

describe('assessDdiRisk — reversible inhibition (R1)', () => {
  it('flags R1 ≥ 1.02', () => {
    const r = assessDdiRisk({ imaxUnbound: 0.5, ki: 10 });
    const r1 = r.mechanisms.find(m => m.mechanism.startsWith('R1 reversible'));
    expect(r1?.value).toBeCloseTo(1.05, 3);
    expect(r1?.flagged).toBe(true);
    expect(r.clinicalStudyRecommended).toBe(true);
  });

  it('does not flag R1 below the cut-off', () => {
    const r = assessDdiRisk({ imaxUnbound: 0.01, ki: 100 });
    const r1 = r.mechanisms.find(m => m.mechanism.startsWith('R1 reversible'));
    expect(r1?.flagged).toBe(false);
    expect(r.clinicalStudyRecommended).toBe(false);
  });
});

describe('assessDdiRisk — gut R1, TDI R2, induction R3', () => {
  it('flags gut CYP3A R1,gut ≥ 11 from a molar dose', () => {
    // Igut = doseMol/0.25 = 0.025/0.25 = 0.1; R1g = 1 + 0.1/0.001 = 101 ≥ 11
    const r = assessDdiRisk({ doseMol: 0.025, kiGut: 0.001 });
    const r1g = r.mechanisms.find(m => m.mechanism.startsWith('R1,gut'));
    expect(r1g?.flagged).toBe(true);
  });

  it('flags TDI when R2 ≥ 1.25', () => {
    const r = assessDdiRisk({ imaxUnbound: 1, kinact: 0.1, kI: 1, kdeg: 0.02 });
    // kobs = 0.1*1/(1+1)=0.05; R2 = (0.05+0.02)/0.02 = 3.5
    const r2 = r.mechanisms.find(m => m.mechanism.startsWith('R2'));
    expect(r2?.value).toBeCloseTo(3.5, 2);
    expect(r2?.flagged).toBe(true);
  });

  it('flags induction when R3 ≤ 0.8', () => {
    const r = assessDdiRisk({ imaxUnbound: 5, emax: 5, ec50: 1 });
    // R3 = 1/(1 + 1*5*5/(1+5)) = 1/(1+4.1667)=0.1935 ≤ 0.8
    const r3 = r.mechanisms.find(m => m.mechanism.startsWith('R3'));
    expect(r3?.flagged).toBe(true);
  });
});

describe('assessDdiRisk — transporters', () => {
  it('flags a gut transporter when Igut/IC50 ≥ 10', () => {
    const r = assessDdiRisk({ transporters: [{ name: 'P-gp', gut: true, igut: 100, ic50: 5 }] });
    expect(r.mechanisms[0].flagged).toBe(true);
  });

  it('flags a hepatic transporter when Iu/IC50 ≥ 0.1', () => {
    const r = assessDdiRisk({ transporters: [{ name: 'OATP1B1', unboundConcentration: 1, ic50: 5 }] });
    expect(r.mechanisms[0].value).toBeCloseTo(0.2, 3);
    expect(r.mechanisms[0].flagged).toBe(true);
  });
});

describe('assessDdiRisk — empty input', () => {
  it('recommends no study and explains when nothing is supplied', () => {
    const r = assessDdiRisk({});
    expect(r.mechanisms).toHaveLength(0);
    expect(r.clinicalStudyRecommended).toBe(false);
    expect(r.rationale).toMatch(/No DDI inputs/);
  });
});
