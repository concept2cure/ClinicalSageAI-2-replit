/**
 * SaMD classification — the full IMDRF N12 matrix and the IEC 62304 decision,
 * verified against the published frameworks.
 */

import { describe, it, expect } from 'vitest';
import {
  categorizeSamd,
  classifyIec62304,
  type HealthcareSituation,
  type SamdSignificance,
  type SamdCategory,
} from '../samd-classification';

describe('IMDRF SaMD risk categorization (N12)', () => {
  // The published N12 matrix.
  const expected: Record<HealthcareSituation, Record<SamdSignificance, SamdCategory>> = {
    critical: { 'treat-or-diagnose': 'IV', drive: 'III', inform: 'II' },
    serious: { 'treat-or-diagnose': 'III', drive: 'II', inform: 'I' },
    'non-serious': { 'treat-or-diagnose': 'II', drive: 'I', inform: 'I' },
  };

  for (const situation of Object.keys(expected) as HealthcareSituation[]) {
    for (const significance of Object.keys(expected[situation]) as SamdSignificance[]) {
      it(`${situation} × ${significance} → ${expected[situation][significance]}`, () => {
        const r = categorizeSamd({ healthcareSituation: situation, significance });
        expect(r.category).toBe(expected[situation][significance]);
        expect(r.riskLevel).toBe({ I: 1, II: 2, III: 3, IV: 4 }[r.category]);
        expect(r.framework).toBe('IMDRF SaMD N12');
      });
    }
  }

  it('the highest category (IV) is critical × treat-or-diagnose', () => {
    expect(categorizeSamd({ healthcareSituation: 'critical', significance: 'treat-or-diagnose' }).category).toBe('IV');
  });
});

describe('IEC 62304 software safety classification', () => {
  it('Class A when software cannot contribute to a hazard', () => {
    const r = classifyIec62304({
      canContributeToHazard: false,
      harmSeverityAfterExternalControls: 'serious-or-death',
    });
    expect(r.softwareSafetyClass).toBe('A');
  });

  it('Class A when residual harm is none after external controls', () => {
    expect(
      classifyIec62304({ canContributeToHazard: true, harmSeverityAfterExternalControls: 'none' })
        .softwareSafetyClass
    ).toBe('A');
  });

  it('Class B for possible non-serious injury', () => {
    expect(
      classifyIec62304({
        canContributeToHazard: true,
        harmSeverityAfterExternalControls: 'non-serious',
      }).softwareSafetyClass
    ).toBe('B');
  });

  it('Class C for possible death or serious injury', () => {
    expect(
      classifyIec62304({
        canContributeToHazard: true,
        harmSeverityAfterExternalControls: 'serious-or-death',
      }).softwareSafetyClass
    ).toBe('C');
  });
});
