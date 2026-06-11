/**
 * Sterilization requirements — the sterilization method standards, the Sterility
 * Assurance Level (SAL), and the validation elements + reviewer questions for a
 * sterile device.
 *
 * WHY THIS EXISTS (audit gap): sterilization was unmodelled, yet it is a required
 * evidence area for sterile devices and a common deficiency. Given the method, this
 * returns the governing ISO standard, the SAL claim, the validation elements
 * (bioburden, dose-setting/half-cycle, residuals for EO), the packaging standard,
 * and the reviewer's questions.
 *
 * HONESTY: reflects the ISO 11135/11137/17665/20857/22441/14937 family + SAL 10⁻⁶
 * for terminal sterilization (aseptic processing makes no SAL claim — it validates
 * the process). The expected standard/validation set, not a validation report or a
 * conformity decision.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/sterilization
 */

export type SterilizationMethod = 'eo' | 'radiation' | 'steam' | 'dry_heat' | 'vh2o2' | 'aseptic' | 'unknown';

export interface SterilizationMethodInfo {
  id: SterilizationMethod;
  label: string;
  standard: string;
  /** True for terminal sterilization (a SAL is claimed); false for aseptic processing. */
  terminal: boolean;
  sal: string;
  /** Method-specific validation elements. */
  validationElements: string[];
  /** Additional standards specific to the method. */
  extraStandards: string[];
}

export const STERILIZATION_METHODS: SterilizationMethodInfo[] = [
  {
    id: 'eo', label: 'Ethylene oxide (EO)', standard: 'ISO 11135', terminal: true, sal: 'SAL 10⁻⁶',
    validationElements: ['Bioburden determination (ISO 11737-1)', 'Half-cycle / overkill cycle development', 'Sterility test (ISO 11737-2)', 'EO/ECH residual limits (ISO 10993-7)'],
    extraStandards: ['ISO 10993-7 (EO residuals)', 'ISO 11737-1/2'],
  },
  {
    id: 'radiation', label: 'Radiation (gamma / e-beam / X-ray)', standard: 'ISO 11137-1', terminal: true, sal: 'SAL 10⁻⁶',
    validationElements: ['Bioburden determination (ISO 11737-1)', 'Sterilization dose setting/substantiation (ISO 11137-2, e.g. VDmax)', 'Dose mapping', 'Material compatibility at dose'],
    extraStandards: ['ISO 11137-2 (dose setting)', 'ISO 11137-3 (dosimetric)'],
  },
  {
    id: 'steam', label: 'Moist heat (steam)', standard: 'ISO 17665', terminal: true, sal: 'SAL 10⁻⁶',
    validationElements: ['Bioburden determination (ISO 11737-1)', 'Cycle development (temperature/time/saturated steam)', 'Microbiological/biological indicator validation', 'Material/load compatibility'],
    extraStandards: ['ISO 11737-1/2'],
  },
  {
    id: 'dry_heat', label: 'Dry heat', standard: 'ISO 20857', terminal: true, sal: 'SAL 10⁻⁶',
    validationElements: ['Bioburden determination', 'Cycle development (temperature/time)', 'Biological indicator validation'],
    extraStandards: ['ISO 11737-1/2'],
  },
  {
    id: 'vh2o2', label: 'Vaporized hydrogen peroxide (VH₂O₂)', standard: 'ISO 22441', terminal: true, sal: 'SAL 10⁻⁶',
    validationElements: ['Bioburden determination', 'Cycle development', 'Biological indicator validation', 'Residual assessment'],
    extraStandards: ['ISO 14937 (general)', 'ISO 11737-1/2'],
  },
  {
    id: 'aseptic', label: 'Aseptic processing (non-terminal)', standard: 'ISO 13408', terminal: false, sal: 'No terminal-sterilization SAL — process validated by media fills',
    validationElements: ['Process simulation / media fill', 'Environmental monitoring', 'Operator qualification', 'Sterile filtration validation (where applicable)'],
    extraStandards: ['ISO 13408 series'],
  },
];

const BY_METHOD = new Map(STERILIZATION_METHODS.map((m) => [m.id, m]));

const PACKAGING_STANDARD = 'ISO 11607-1/2 (packaging for terminally sterilized medical devices)';

export const STERILIZATION_REVIEWER_QUESTIONS = [
  'Is the sterilization validated to the correct ISO standard for the method, achieving SAL 10⁻⁶ (terminal)?',
  'Is bioburden determined and controlled (ISO 11737-1), and the sterility test validated (ISO 11737-2)?',
  'For EO, are EO/ECH residuals within ISO 10993-7 limits?',
  'For radiation, is the sterilization dose substantiated (ISO 11137-2) with dose mapping?',
  'Is the sterile barrier system validated and is shelf-life/ageing supported (ISO 11607, accelerated + real-time)?',
];

export interface SterilizationFacts {
  sterile?: boolean;
  method?: SterilizationMethod;
}

export interface SterilizationRequirements {
  applicable: boolean;
  method?: SterilizationMethodInfo;
  packagingStandard?: string;
  reviewerQuestions: string[];
  notes: string[];
}

/**
 * Resolve sterilization requirements. Not applicable for a non-sterile device.
 * When sterile but the method is unknown, returns the reviewer questions + a note
 * to identify the method.
 */
export function sterilizationRequirements(facts: SterilizationFacts): SterilizationRequirements {
  if (!facts.sterile) {
    return { applicable: false, reviewerQuestions: [], notes: ['Device is not supplied sterile — sterilization validation does not apply.'] };
  }
  const method = facts.method && facts.method !== 'unknown' ? BY_METHOD.get(facts.method) : undefined;
  const notes: string[] = [];
  if (!method) notes.push('Sterilisation method not specified — identify the method to select the governing ISO standard.');
  return {
    applicable: true,
    method,
    packagingStandard: PACKAGING_STANDARD,
    reviewerQuestions: STERILIZATION_REVIEWER_QUESTIONS,
    notes,
  };
}

export default { STERILIZATION_METHODS, sterilizationRequirements };
