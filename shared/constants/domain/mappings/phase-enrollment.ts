/**
 * Phase × Therapeutic area → typical enrollment ranges.
 * Used by validators to flag enrollment numbers that are unusually high or low.
 * @module shared/constants/domain/mappings/phase-enrollment
 */

import type { ClinicalPhase } from '../clinical-phases.js';
import type { TherapeuticArea } from '../therapeutic-areas.js';

export interface EnrollmentRange {
  min: number;
  typical: number;
  max: number;
  note?: string;
}

const PHASE_ENROLLMENT: Partial<Record<ClinicalPhase, Partial<Record<TherapeuticArea, EnrollmentRange>>>> = {
  phase_1: {
    oncology: { min: 15, typical: 30, max: 100, note: 'Dose escalation + expansion cohorts' },
    rare_disease: { min: 6, typical: 15, max: 30 },
    // default for unlisted areas:
  },
  phase_2: {
    oncology: { min: 40, typical: 100, max: 300 },
    cardiology: { min: 100, typical: 250, max: 500 },
    rare_disease: { min: 20, typical: 50, max: 100 },
    neurology: { min: 50, typical: 150, max: 400 },
    infectious_disease: { min: 50, typical: 200, max: 500 },
    immunology: { min: 80, typical: 200, max: 400 },
    metabolic: { min: 100, typical: 250, max: 500 },
  },
  phase_3: {
    oncology: { min: 200, typical: 500, max: 2000, note: 'Single pivotal may suffice with compelling results' },
    cardiology: { min: 500, typical: 3000, max: 15000, note: 'CVOT may require very large N' },
    rare_disease: { min: 30, typical: 80, max: 200, note: 'FDA may accept smaller N with strong effect size' },
    neurology: { min: 300, typical: 800, max: 3000 },
    infectious_disease: { min: 200, typical: 600, max: 2000 },
    immunology: { min: 200, typical: 500, max: 1500 },
    metabolic: { min: 500, typical: 1500, max: 5000, note: 'T2DM CVOT: 5,000-15,000' },
    respiratory: { min: 300, typical: 800, max: 3000 },
    psychiatry: { min: 200, typical: 500, max: 1500 },
    gastroenterology: { min: 200, typical: 500, max: 1500 },
    dermatology: { min: 200, typical: 400, max: 1000 },
    ophthalmology: { min: 200, typical: 400, max: 1000 },
  },
  phase_4: {
    oncology: { min: 500, typical: 2000, max: 10000, note: 'Post-marketing safety or confirmatory' },
    cardiology: { min: 1000, typical: 5000, max: 20000 },
  },
};

const DEFAULT_RANGES: Record<string, EnrollmentRange> = {
  phase_1: { min: 10, typical: 30, max: 100 },
  phase_1b: { min: 15, typical: 40, max: 120 },
  phase_1_2: { min: 20, typical: 60, max: 200 },
  phase_2: { min: 50, typical: 200, max: 500 },
  phase_2b: { min: 80, typical: 250, max: 600 },
  phase_2_3: { min: 100, typical: 400, max: 1000 },
  phase_3: { min: 200, typical: 600, max: 3000 },
  phase_3b: { min: 200, typical: 500, max: 2000 },
  phase_4: { min: 500, typical: 2000, max: 10000 },
};

export function getEnrollmentRange(phase: ClinicalPhase, area?: TherapeuticArea): EnrollmentRange {
  if (area) {
    const specific = PHASE_ENROLLMENT[phase]?.[area];
    if (specific) return specific;
  }
  return DEFAULT_RANGES[phase] ?? { min: 10, typical: 100, max: 5000 };
}

export function isEnrollmentUnusual(n: number, phase: ClinicalPhase, area?: TherapeuticArea): 'low' | 'high' | null {
  const range = getEnrollmentRange(phase, area);
  if (n < range.min) return 'low';
  if (n > range.max) return 'high';
  return null;
}
