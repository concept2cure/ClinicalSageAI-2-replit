/**
 * EU IVDR (2017/746) Performance Evaluation Report (PER) completeness.
 *
 * The evaluation flagged IVDR as registry-only. IVDR Annex XIII requires a
 * performance evaluation built on three pillars — scientific validity,
 * analytical performance, and clinical performance — each with constituent
 * evidence. This module scores a PER against those required elements.
 *
 * Pure and deterministic.
 */

export const PER_PILLARS = {
  scientificValidity: ['scientificValidityReport'],
  analyticalPerformance: [
    'analyticalSensitivity',
    'analyticalSpecificity',
    'trueness',
    'precision',
    'limitOfDetection',
    'measuringRange',
  ],
  clinicalPerformance: ['diagnosticSensitivity', 'diagnosticSpecificity', 'clinicalEvidence'],
} as const;

export type PerPillar = keyof typeof PER_PILLARS;
export type PerElement = (typeof PER_PILLARS)[PerPillar][number];

const ALL_ELEMENTS: PerElement[] = Object.values(PER_PILLARS).flat() as PerElement[];

export interface PerPillarStatus {
  pillar: PerPillar;
  present: string[];
  gaps: string[];
  complete: boolean;
}

export interface PerCompletenessResult {
  /** 0–1 over all required PER elements. */
  completenessScore: number;
  pillars: PerPillarStatus[];
  /** Overall gaps across all pillars. */
  gaps: string[];
  complete: boolean;
  framework: 'EU IVDR 2017/746 Annex XIII';
}

/**
 * Score an IVDR Performance Evaluation Report against the Annex XIII elements
 * across the scientific-validity, analytical-performance, and clinical-
 * performance pillars.
 */
export function assessPerformanceEvaluationReport(
  elements: Partial<Record<PerElement, boolean>>
): PerCompletenessResult {
  const pillars: PerPillarStatus[] = (Object.keys(PER_PILLARS) as PerPillar[]).map(pillar => {
    const required = PER_PILLARS[pillar] as readonly string[];
    const present = required.filter(e => elements[e as PerElement] === true);
    const gaps = required.filter(e => elements[e as PerElement] !== true);
    return { pillar, present: [...present], gaps: [...gaps], complete: gaps.length === 0 };
  });
  const allGaps = pillars.flatMap(p => p.gaps);
  const presentCount = ALL_ELEMENTS.length - allGaps.length;
  return {
    completenessScore: presentCount / ALL_ELEMENTS.length,
    pillars,
    gaps: allGaps,
    complete: allGaps.length === 0,
    framework: 'EU IVDR 2017/746 Annex XIII',
  };
}
