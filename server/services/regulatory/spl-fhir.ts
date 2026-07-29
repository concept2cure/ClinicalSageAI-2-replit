/**
 * Interoperability — LOINC, SPL (Structured Product Labeling), and FHIR.
 *
 * The evaluation flagged the absence of SPL/FHIR/LOINC support. This module
 * provides:
 *   - LOINC code validation, including the official LOINC Mod-10 check digit
 *     (verified against published codes, e.g. 10013-1, 2160-0, 8867-4);
 *   - SPL document section completeness against the FDA PLR labeling sections
 *     (each carrying its LOINC section code);
 *   - minimal structural validation of FHIR resources.
 *
 * Pure and deterministic.
 */

// ── LOINC ────────────────────────────────────────────────────────────────────

/**
 * LOINC Mod-10 check digit of the numeric part: starting from the rightmost
 * digit, multiply by alternating 2,1,2,1…; for a two-digit product add its
 * digits; the check digit makes the total a multiple of 10.
 */
export function loincCheckDigit(payload: string): number {
  if (!/^\d{1,7}$/.test(payload)) throw new Error('LOINC payload must be 1–7 digits.');
  const rev = payload.split('').reverse();
  let sum = 0;
  for (let i = 0; i < rev.length; i++) {
    let v = Number(rev[i]) * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9; // sum the digits of a two-digit product
    sum += v;
  }
  return (10 - (sum % 10)) % 10;
}

export interface LoincValidationResult {
  code: string;
  valid: boolean;
  error?: string;
  expectedCheckDigit?: number;
  framework: 'LOINC';
}

/** Validate a LOINC code (format NNNNN-N + check digit). */
export function validateLoincCode(code: string): LoincValidationResult {
  const c = code.trim();
  if (!/^\d{1,7}-\d$/.test(c)) {
    return { code: c, valid: false, error: 'LOINC format must be digits + "-" + check digit.', framework: 'LOINC' };
  }
  const [payload, check] = c.split('-');
  const expected = loincCheckDigit(payload);
  if (expected !== Number(check)) {
    return { code: c, valid: false, error: 'Invalid LOINC check digit.', expectedCheckDigit: expected, framework: 'LOINC' };
  }
  return { code: c, valid: true, framework: 'LOINC' };
}

// ── SPL section completeness ─────────────────────────────────────────────────

/** FDA PLR required labeling sections with their LOINC section codes. */
export const SPL_SECTIONS = {
  indicationsAndUsage: '34067-9',
  dosageAndAdministration: '34068-7',
  contraindications: '34070-3',
  warningsAndPrecautions: '43685-7',
  adverseReactions: '34084-4',
  drugInteractions: '34073-7',
  useInSpecificPopulations: '43684-0',
  description: '34089-3',
  clinicalPharmacology: '34090-1',
  howSupplied: '34069-5',
} as const;

export type SplSection = keyof typeof SPL_SECTIONS;

export interface SplCompletenessResult {
  completenessScore: number;
  present: SplSection[];
  gaps: { section: SplSection; loincCode: string }[];
  complete: boolean;
  framework: 'FDA SPL / PLR';
}

/** Score SPL document completeness against the required PLR labeling sections. */
export function assessSplCompleteness(
  sections: Partial<Record<SplSection, boolean>>
): SplCompletenessResult {
  const keys = Object.keys(SPL_SECTIONS) as SplSection[];
  const present: SplSection[] = [];
  const gaps: { section: SplSection; loincCode: string }[] = [];
  for (const k of keys) {
    if (sections[k] === true) present.push(k);
    else gaps.push({ section: k, loincCode: SPL_SECTIONS[k] });
  }
  return {
    completenessScore: present.length / keys.length,
    present,
    gaps,
    complete: gaps.length === 0,
    framework: 'FDA SPL / PLR',
  };
}

// ── FHIR resource validation ─────────────────────────────────────────────────

export interface FhirValidationResult {
  valid: boolean;
  resourceType: string | null;
  errors: string[];
  framework: 'HL7 FHIR';
}

/** Required fields beyond resourceType for the resource types we check. */
const FHIR_REQUIRED: Record<string, string[]> = {
  Observation: ['status', 'code'],
  DiagnosticReport: ['status', 'code'],
  Device: ['udiCarrier'],
};

/** Minimal structural validation of a FHIR resource. */
export function validateFhirResource(resource: Record<string, unknown>): FhirValidationResult {
  const errors: string[] = [];
  const resourceType = typeof resource?.resourceType === 'string' ? resource.resourceType : null;
  if (!resourceType) {
    errors.push('Missing required field: resourceType.');
    return { valid: false, resourceType: null, errors, framework: 'HL7 FHIR' };
  }
  for (const field of FHIR_REQUIRED[resourceType] ?? []) {
    if (resource[field] == null) errors.push(`${resourceType} requires field: ${field}.`);
  }
  return { valid: errors.length === 0, resourceType, errors, framework: 'HL7 FHIR' };
}
