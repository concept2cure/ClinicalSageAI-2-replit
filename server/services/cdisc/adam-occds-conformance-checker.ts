/**
 * ADaM OCCDS conformance checker — CDISC ADaM OCCDS IG v1.0.
 *
 * A deterministic, dataset-level inspector pass over a submitted occurrence
 * analysis dataset's variable metadata (the OCCDS — Occurrence Data Structure —
 * used for adverse-event and other occurrence analysis datasets such as ADAE),
 * checking it against the CDISC ADaM Implementation Guide and the ADaM OCCDS
 * Implementation Guide reference structure. An OCCDS dataset has one record per
 * subject per occurrence (e.g. one row per reported adverse event), built on the
 * BDS/OCCDS occurrence flavour with a fixed, well-known set of identifier,
 * coded-term, and treatment-emergent variables.
 *
 * It checks what an FDA/PMDA reviewer (and Pinnacle 21 / the FDA Study Data
 * Technical Conformance Guide) would flag at the structural level:
 *
 *   - MISSING_REQUIRED — a required OCCDS variable (STUDYID, USUBJID, AEDECOD,
 *                        TRTA) is absent (error).
 *   - MISSING_EXPECTED — an expected OCCDS variable (AETERM, AESEV, AESER,
 *                        AEREL, AEBODSYS, TRTEMFL, ASTDT, AENDT, TRTP) is absent
 *                        (warning).
 *   - TYPE_MISMATCH    — a variable's Char/Num type disagrees with the IG, e.g.
 *                        a coded-term variable supplied as Num, the analysis
 *                        start/end dates (ASTDT/AENDT) supplied as Char, or an
 *                        occurrence/treatment-emergent flag supplied as Num
 *                        (error).
 *   - FLAG_VIOLATION   — a flag variable (name ending 'FL', e.g. TRTEMFL,
 *                        AOCCFL) has a supplied controlled term outside {Y, N}
 *                        (error).
 *
 * The verdict is honest-by-construction: `ready` is true only when there are no
 * error-severity findings. Pure / deterministic — no DB, no I/O; findings are
 * sorted by variable name then severity for stable output.
 *
 * Reference: CDISC ADaM Implementation Guide v1.1 (2016) and the CDISC ADaM
 * Occurrence Data Structure (OCCDS) Implementation Guide v1.0 (2016) §3
 * (Occurrence Data Structure variables), including the analyzed MedDRA preferred
 * term (AEDECOD), the treatment-emergent flag (TRTEMFL) and other occurrence
 * flag variables (NY codelist, values Y/N), and the analysis date variables
 * (ASTDT / AENDT, numeric).
 *
 * @module server/services/cdisc/adam-occds-conformance-checker
 */

export type AdamDataType = 'Char' | 'Num';

/** A single OCCDS reference variable definition. */
export interface OccdsVariableSpec {
  /** ADaM variable name (e.g. 'AEDECOD'). */
  name: string;
  /** Expected data type per the ADaM OCCDS IG. */
  dataType: AdamDataType;
  /** Human-readable label. */
  label: string;
}

/**
 * Required OCCDS variables (ADaM OCCDS IG v1.0). Their absence is an error.
 * STUDYID/USUBJID identify the record; AEDECOD is the analyzed MedDRA preferred
 * term; TRTA is the actual treatment under which the occurrence is analyzed.
 */
export const OCCDS_REQUIRED: readonly OccdsVariableSpec[] = [
  { name: 'STUDYID', dataType: 'Char', label: 'Study Identifier' },
  { name: 'USUBJID', dataType: 'Char', label: 'Unique Subject Identifier' },
  { name: 'AEDECOD', dataType: 'Char', label: 'Dictionary-Derived Term (MedDRA Preferred Term)' },
  { name: 'TRTA', dataType: 'Char', label: 'Actual Treatment' },
] as const;

/**
 * Expected OCCDS variables (ADaM OCCDS IG v1.0). Their absence is a warning.
 */
export const OCCDS_EXPECTED: readonly OccdsVariableSpec[] = [
  { name: 'AETERM', dataType: 'Char', label: 'Reported Term for the Adverse Event' },
  { name: 'AESEV', dataType: 'Char', label: 'Severity/Intensity' },
  { name: 'AESER', dataType: 'Char', label: 'Serious Event' },
  { name: 'AEREL', dataType: 'Char', label: 'Causality' },
  { name: 'AEBODSYS', dataType: 'Char', label: 'Body System or Organ Class' },
  { name: 'TRTEMFL', dataType: 'Char', label: 'Treatment Emergent Analysis Flag' },
  { name: 'ASTDT', dataType: 'Num', label: 'Analysis Start Date' },
  { name: 'AENDT', dataType: 'Num', label: 'Analysis End Date' },
  { name: 'TRTP', dataType: 'Char', label: 'Planned Treatment' },
] as const;

export type AdamConformanceSeverity = 'error' | 'warning';

export interface AdamFinding {
  /** The variable the finding concerns. */
  variable: string;
  severity: AdamConformanceSeverity;
  /** MISSING_REQUIRED / MISSING_EXPECTED / TYPE_MISMATCH / FLAG_VIOLATION. */
  code: string;
  message: string;
}

/** A single variable's metadata as present in the submitted OCCDS dataset. */
export interface AdamVariableInput {
  name: string;
  dataType: AdamDataType;
  /** The actual distinct values present for a controlled-term variable. */
  controlledTerms?: string[];
}

export interface AdamOccdsConformanceInput {
  /** The dataset's variable metadata. */
  variables: AdamVariableInput[];
}

export interface AdamOccdsConformanceResult {
  ready: boolean;
  datasetName: 'OCCDS';
  /** Required variables absent from the dataset. */
  missingRequired: string[];
  /** Expected variables absent from the dataset. */
  missingExpected: string[];
  findings: AdamFinding[];
  counts: { errors: number; warnings: number };
}

function severityRank(s: AdamConformanceSeverity): number {
  return s === 'error' ? 0 : 1;
}

/** A flag variable is any ADaM variable whose name ends in 'FL'. */
function isFlagVariable(name: string): boolean {
  return /FL$/.test(name);
}

/**
 * Check a submitted OCCDS dataset's variable metadata against the ADaM OCCDS IG
 * v1.0 reference structure. Pure / deterministic; findings ordered by variable
 * name then severity.
 */
export function checkAdamOccdsConformance(input: AdamOccdsConformanceInput): AdamOccdsConformanceResult {
  const findings: AdamFinding[] = [];

  const suppliedByName = new Map<string, AdamVariableInput>();
  for (const v of input.variables ?? []) {
    // Last occurrence wins; deterministic given input order.
    suppliedByName.set(v.name.trim().toUpperCase(), v);
  }

  const missingRequired: string[] = [];
  const missingExpected: string[] = [];

  // Required-variable presence + type.
  for (const sv of OCCDS_REQUIRED) {
    const supplied = suppliedByName.get(sv.name);
    if (!supplied) {
      missingRequired.push(sv.name);
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'MISSING_REQUIRED',
        message: `Required variable ${sv.name} (${sv.label}) is missing from the OCCDS dataset.`,
      });
      continue;
    }
    if (supplied.dataType !== sv.dataType) {
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Variable ${sv.name} (${sv.label}) is typed ${supplied.dataType} but ADaM OCCDS IG v1.0 requires ${sv.dataType}.`,
      });
    }
  }

  // Expected-variable presence + type.
  for (const sv of OCCDS_EXPECTED) {
    const supplied = suppliedByName.get(sv.name);
    if (!supplied) {
      missingExpected.push(sv.name);
      findings.push({
        variable: sv.name,
        severity: 'warning',
        code: 'MISSING_EXPECTED',
        message: `Expected variable ${sv.name} (${sv.label}) is missing from the OCCDS dataset.`,
      });
      continue;
    }
    if (supplied.dataType !== sv.dataType) {
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Variable ${sv.name} (${sv.label}) is typed ${supplied.dataType} but ADaM OCCDS IG v1.0 requires ${sv.dataType}.`,
      });
    }
  }

  // Structural checks across every supplied variable: flag variables. These run
  // independently of the required/expected lists so that any flag (e.g. AOCCFL)
  // is caught.
  const requiredOrExpected = new Set([
    ...OCCDS_REQUIRED.map((v) => v.name),
    ...OCCDS_EXPECTED.map((v) => v.name),
  ]);

  for (const [name, supplied] of suppliedByName) {
    if (isFlagVariable(name)) {
      // A flag must be Char. (If it is also in the expected list and typed Num,
      // the expected-list pass already reported TYPE_MISMATCH; avoid a duplicate.)
      if (supplied.dataType === 'Num') {
        if (!requiredOrExpected.has(name)) {
          findings.push({
            variable: name,
            severity: 'error',
            code: 'TYPE_MISMATCH',
            message: `Flag variable ${name} is typed Num but ADaM OCCDS IG v1.0 requires Char (values Y/N).`,
          });
        }
      } else if (supplied.controlledTerms?.length) {
        for (const term of supplied.controlledTerms) {
          const normalized = String(term).trim().toUpperCase();
          if (normalized !== 'Y' && normalized !== 'N') {
            findings.push({
              variable: name,
              severity: 'error',
              code: 'FLAG_VIOLATION',
              message: `Flag variable ${name} value "${term}" is not in the ADaM OCCDS IG v1.0 flag codelist (allowed: Y, N).`,
            });
          }
        }
      }
    }
  }

  findings.sort((a, b) =>
    a.variable === b.variable
      ? severityRank(a.severity) - severityRank(b.severity)
      : a.variable.localeCompare(b.variable),
  );

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  return {
    ready: errors === 0,
    datasetName: 'OCCDS',
    missingRequired,
    missingExpected,
    findings,
    counts: { errors, warnings },
  };
}
