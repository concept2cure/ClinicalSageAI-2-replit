/**
 * Software-as-a-Medical-Device (SaMD) classification.
 *
 * IMDRF SaMD risk categorization (IMDRF/SaMD WG/N12): the 4×3 matrix of
 * {state of healthcare situation} × {significance of information provided by
 * the SaMD} → risk category I–IV.
 *
 * IEC 62304 software safety classification is not here: it is classifySoftware
 * in market-specs/software-lifecycle.ts. 2026-10-15: classifyIec62304, a third
 * IEC 62304 classifier, lived in this file (zero-duplication rule).
 *
 * Pure and deterministic; the IMDRF matrix is reproduced verbatim from N12.
 */

// ── IMDRF SaMD risk categorization ───────────────────────────────────────────

export type HealthcareSituation = 'critical' | 'serious' | 'non-serious';
export type SamdSignificance = 'treat-or-diagnose' | 'drive' | 'inform';
export type SamdCategory = 'I' | 'II' | 'III' | 'IV';

/**
 * IMDRF N12 Table — rows: state of healthcare situation; columns: significance
 * of the information the SaMD provides. Higher categories carry greater risk.
 */
const IMDRF_MATRIX: Record<HealthcareSituation, Record<SamdSignificance, SamdCategory>> = {
  critical: { 'treat-or-diagnose': 'IV', drive: 'III', inform: 'II' },
  serious: { 'treat-or-diagnose': 'III', drive: 'II', inform: 'I' },
  'non-serious': { 'treat-or-diagnose': 'II', drive: 'I', inform: 'I' },
};

const SITUATION_LABEL: Record<HealthcareSituation, string> = {
  critical: 'Critical situation or condition',
  serious: 'Serious situation or condition',
  'non-serious': 'Non-serious situation or condition',
};
const SIGNIFICANCE_LABEL: Record<SamdSignificance, string> = {
  'treat-or-diagnose': 'Treat or diagnose',
  drive: 'Drive clinical management',
  inform: 'Inform clinical management',
};

export interface SamdCategorizationInput {
  healthcareSituation: HealthcareSituation;
  significance: SamdSignificance;
}

export interface SamdCategorizationResult {
  category: SamdCategory;
  /** 1 (lowest) … 4 (highest), the ordinal of the category. */
  riskLevel: number;
  healthcareSituation: HealthcareSituation;
  significance: SamdSignificance;
  rationale: string;
  framework: 'IMDRF SaMD N12';
}

const CATEGORY_LEVEL: Record<SamdCategory, number> = { I: 1, II: 2, III: 3, IV: 4 };

/** IMDRF SaMD risk categorization (N12). */
export function categorizeSamd(input: SamdCategorizationInput): SamdCategorizationResult {
  const row = IMDRF_MATRIX[input.healthcareSituation];
  if (!row) throw new Error(`Unknown healthcare situation: ${input.healthcareSituation}`);
  const category = row[input.significance];
  if (!category) throw new Error(`Unknown SaMD significance: ${input.significance}`);
  return {
    category,
    riskLevel: CATEGORY_LEVEL[category],
    healthcareSituation: input.healthcareSituation,
    significance: input.significance,
    rationale: `${SIGNIFICANCE_LABEL[input.significance]} in a ${SITUATION_LABEL[
      input.healthcareSituation
    ].toLowerCase()} → IMDRF category ${category}.`,
    framework: 'IMDRF SaMD N12',
  };
}
