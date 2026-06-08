/**
 * Market access / reimbursement.
 *
 * The evaluation flagged the absence of any reimbursement support. This module
 * provides two deterministic assessors:
 *   - procedure-code classification/validation across the AMA CPT categories
 *     (I / II / III / PLA) and HCPCS Level II;
 *   - coverage-evidence dossier completeness against the elements a payer /
 *     Medicare coverage submission requires.
 *
 * Pure and deterministic.
 */

// ── Procedure-code classification ────────────────────────────────────────────

export type ProcedureCodeType =
  | 'CPT-I'
  | 'CPT-II'
  | 'CPT-III'
  | 'PLA'
  | 'HCPCS-II'
  | 'unknown';

export interface ProcedureCodeResult {
  code: string;
  type: ProcedureCodeType;
  valid: boolean;
  description: string;
  framework: 'AMA CPT / CMS HCPCS';
}

const TYPE_DESCRIPTION: Record<ProcedureCodeType, string> = {
  'CPT-I': 'CPT Category I — 5 numeric digits (procedures/services)',
  'CPT-II': 'CPT Category II — performance-measurement tracking code (NNNNF)',
  'CPT-III': 'CPT Category III — emerging technology code (NNNNT)',
  PLA: 'CPT Proprietary Laboratory Analyses code (NNNNU)',
  'HCPCS-II': 'HCPCS Level II — alphanumeric (letter + 4 digits)',
  unknown: 'Unrecognized procedure-code format',
};

/** Classify and format-validate a CPT/HCPCS procedure code. */
export function classifyProcedureCode(code: string): ProcedureCodeResult {
  const c = code.trim().toUpperCase();
  let type: ProcedureCodeType = 'unknown';
  if (/^\d{5}$/.test(c)) type = 'CPT-I';
  else if (/^\d{4}F$/.test(c)) type = 'CPT-II';
  else if (/^\d{4}T$/.test(c)) type = 'CPT-III';
  else if (/^\d{4}U$/.test(c)) type = 'PLA';
  else if (/^[A-Z]\d{4}$/.test(c)) type = 'HCPCS-II';
  return {
    code: c,
    type,
    valid: type !== 'unknown',
    description: TYPE_DESCRIPTION[type],
    framework: 'AMA CPT / CMS HCPCS',
  };
}

// ── Coverage-evidence dossier completeness ───────────────────────────────────

export const COVERAGE_DOSSIER_ELEMENTS = [
  'clinicalEvidence',
  'comparatorEvidence',
  'patientPopulationDefinition',
  'codingStrategy',
  'coveragePolicyAnalysis', // NCD/LCD landscape
  'costEffectivenessAnalysis',
  'budgetImpactModel',
  'valueProposition',
] as const;

export type CoverageDossierElement = (typeof COVERAGE_DOSSIER_ELEMENTS)[number];

export interface CoverageDossierResult {
  completenessScore: number;
  present: CoverageDossierElement[];
  gaps: CoverageDossierElement[];
  complete: boolean;
  framework: 'Payer / CMS coverage dossier';
}

/** Score a coverage-evidence dossier against the required elements. */
export function assessCoverageDossierCompleteness(
  elements: Partial<Record<CoverageDossierElement, boolean>>
): CoverageDossierResult {
  const present: CoverageDossierElement[] = [];
  const gaps: CoverageDossierElement[] = [];
  for (const e of COVERAGE_DOSSIER_ELEMENTS) {
    if (elements[e] === true) present.push(e);
    else gaps.push(e);
  }
  return {
    completenessScore: present.length / COVERAGE_DOSSIER_ELEMENTS.length,
    present,
    gaps,
    complete: gaps.length === 0,
    framework: 'Payer / CMS coverage dossier',
  };
}
