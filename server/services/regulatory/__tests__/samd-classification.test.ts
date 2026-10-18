/**
 * SaMD classification — the full IMDRF N12 matrix, verified against the
 * published framework. (IEC 62304 classification is classifySoftware's, tested
 * with market-specs/software-lifecycle.ts; the duplicate here was removed
 * 2026-10-15.)
 */

import { describe, it, expect } from 'vitest';
import {
  categorizeSamd,
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
