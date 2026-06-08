/**
 * Software-as-a-Medical-Device (SaMD) classification.
 *
 * Two deterministic, standards-grounded classifiers a device/IVD software
 * submission needs and that the platform did not previously provide:
 *
 *   - IMDRF SaMD risk categorization (IMDRF/SaMD WG/N12): the 4×3 matrix of
 *     {state of healthcare situation} × {significance of information provided by
 *     the SaMD} → risk category I–IV.
 *   - IEC 62304 software safety classification: Class A/B/C from the software's
 *     ability to contribute to a hazardous situation and the severity of the
 *     resulting harm after non-software risk controls.
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

// ── IEC 62304 software safety classification ─────────────────────────────────

export type SoftwareSafetyClass = 'A' | 'B' | 'C';
export type HarmSeverity = 'none' | 'non-serious' | 'serious-or-death';

export interface Iec62304Input {
  /**
   * Whether the software system can contribute to a hazardous situation (failure
   * or unintended behaviour leading to a hazard). If false → Class A.
   */
  canContributeToHazard: boolean;
  /**
   * Severity of the possible resulting harm AFTER any hardware / non-software
   * risk controls external to the software have been applied.
   */
  harmSeverityAfterExternalControls: HarmSeverity;
}

export interface Iec62304Result {
  softwareSafetyClass: SoftwareSafetyClass;
  rationale: string;
  framework: 'IEC 62304';
}

/**
 * IEC 62304 software safety classification (incl. the 2015 Amendment decision):
 * Class A if no injury is possible (or software cannot contribute to a hazard);
 * Class B if non-serious injury is possible; Class C if death or serious injury
 * is possible — judged on the harm remaining after non-software risk controls.
 */
export function classifyIec62304(input: Iec62304Input): Iec62304Result {
  if (!input.canContributeToHazard) {
    return {
      softwareSafetyClass: 'A',
      rationale:
        'Software cannot contribute to a hazardous situation → Class A (no injury possible).',
      framework: 'IEC 62304',
    };
  }
  switch (input.harmSeverityAfterExternalControls) {
    case 'none':
      return {
        softwareSafetyClass: 'A',
        rationale:
          'A hazardous situation is possible but external risk controls reduce the residual harm to none → Class A.',
        framework: 'IEC 62304',
      };
    case 'non-serious':
      return {
        softwareSafetyClass: 'B',
        rationale: 'Non-serious injury is possible → Class B.',
        framework: 'IEC 62304',
      };
    case 'serious-or-death':
      return {
        softwareSafetyClass: 'C',
        rationale: 'Death or serious injury is possible → Class C.',
        framework: 'IEC 62304',
      };
    default:
      throw new Error(`Unknown harm severity: ${input.harmSeverityAfterExternalControls}`);
  }
}
