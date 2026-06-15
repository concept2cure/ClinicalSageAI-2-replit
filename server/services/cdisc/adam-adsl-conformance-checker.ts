/**
 * ADaM ADSL conformance checker — CDISC ADaM IG v1.1.
 *
 * A deterministic, dataset-level inspector pass over a submitted ADSL
 * (Subject-Level Analysis Dataset) variable metadata, checking it against the
 * CDISC ADaM Implementation Guide v1.1 reference structure. ADSL has one record
 * per subject and a single, well-known structure, so there is no domain
 * parameter — the spec is fixed.
 *
 * It checks what an FDA/PMDA reviewer (and Pinnacle 21 / the FDA Study Data
 * Technical Conformance Guide) would flag at the structural level:
 *
 *   - MISSING_REQUIRED — a required ADSL variable (STUDYID, USUBJID) is absent
 *                        (error).
 *   - MISSING_EXPECTED — an expected ADSL variable (SUBJID, SITEID, AGE, AGEU,
 *                        SEX, RACE, TRT01P, TRT01A, SAFFL, ITTFL) is absent
 *                        (warning).
 *   - TYPE_MISMATCH    — a variable's Char/Num type disagrees with the IG, e.g.
 *                        AGE supplied as Char, a population flag supplied as Num,
 *                        or a numeric treatment code variable (*N) supplied as
 *                        Char (error).
 *   - FLAG_VIOLATION   — a population flag variable (name ending 'FL') has a
 *                        supplied controlled term outside {Y, N} (error).
 *
 * The verdict is honest-by-construction: `ready` is true only when there are no
 * error-severity findings. Pure / deterministic — no DB, no I/O; findings are
 * sorted by variable name then severity for stable output.
 *
 * Reference: CDISC ADaM Implementation Guide v1.1 (2016) §3 (Subject-Level
 * Analysis Dataset, ADSL) and the ADaM variable naming conventions for
 * population indicator flags (NY codelist, values Y/N) and numeric coded
 * treatment variables (TRTxxPN / TRTxxAN).
 *
 * @module server/services/cdisc/adam-adsl-conformance-checker
 */

export type AdamDataType = 'Char' | 'Num';

/** A single ADSL reference variable definition. */
export interface AdslVariableSpec {
  /** ADaM variable name (e.g. 'USUBJID'). */
  name: string;
  /** Expected data type per the ADaM IG. */
  dataType: AdamDataType;
  /** Human-readable label. */
  label: string;
}

/**
 * Required ADSL variables (ADaM IG v1.1). Their absence is an error.
 */
export const ADSL_REQUIRED: readonly AdslVariableSpec[] = [
  { name: 'STUDYID', dataType: 'Char', label: 'Study Identifier' },
  { name: 'USUBJID', dataType: 'Char', label: 'Unique Subject Identifier' },
] as const;

/**
 * Expected ADSL variables (ADaM IG v1.1). Their absence is a warning.
 */
export const ADSL_EXPECTED: readonly AdslVariableSpec[] = [
  { name: 'SUBJID', dataType: 'Char', label: 'Subject Identifier for the Study' },
  { name: 'SITEID', dataType: 'Char', label: 'Study Site Identifier' },
  { name: 'AGE', dataType: 'Num', label: 'Age' },
  { name: 'AGEU', dataType: 'Char', label: 'Age Units' },
  { name: 'SEX', dataType: 'Char', label: 'Sex' },
  { name: 'RACE', dataType: 'Char', label: 'Race' },
  { name: 'TRT01P', dataType: 'Char', label: 'Planned Treatment for Period 01' },
  { name: 'TRT01A', dataType: 'Char', label: 'Actual Treatment for Period 01' },
  { name: 'SAFFL', dataType: 'Char', label: 'Safety Population Flag' },
  { name: 'ITTFL', dataType: 'Char', label: 'Intent-To-Treat Population Flag' },
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

/** A single variable's metadata as present in the submitted ADSL dataset. */
export interface AdamVariableInput {
  name: string;
  dataType: AdamDataType;
  /** The actual distinct values present for a controlled-term variable. */
  controlledTerms?: string[];
}

export interface AdamAdslConformanceInput {
  /** The dataset's variable metadata. */
  variables: AdamVariableInput[];
}

export interface AdamAdslConformanceResult {
  ready: boolean;
  datasetName: 'ADSL';
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

/** A population indicator flag is any ADaM variable whose name ends in 'FL'. */
function isFlagVariable(name: string): boolean {
  return /FL$/.test(name);
}

/**
 * A numeric coded treatment variable, e.g. TRT01PN / TRT01AN — a 'TRT...N'
 * variable that must be Num. (TRTxxPN / TRTxxAN per ADaM IG naming.)
 */
function isNumericTreatmentVariable(name: string): boolean {
  return /^TRT\d{2}(P|A)N$/.test(name);
}

/**
 * Check a submitted ADSL dataset's variable metadata against the ADaM IG v1.1
 * reference structure. Pure / deterministic; findings ordered by variable name
 * then severity.
 */
export function checkAdamAdslConformance(input: AdamAdslConformanceInput): AdamAdslConformanceResult {
  const findings: AdamFinding[] = [];

  const suppliedByName = new Map<string, AdamVariableInput>();
  for (const v of input.variables ?? []) {
    // Last occurrence wins; deterministic given input order.
    suppliedByName.set(v.name.trim().toUpperCase(), v);
  }

  const missingRequired: string[] = [];
  const missingExpected: string[] = [];

  // Required-variable presence + type.
  for (const sv of ADSL_REQUIRED) {
    const supplied = suppliedByName.get(sv.name);
    if (!supplied) {
      missingRequired.push(sv.name);
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'MISSING_REQUIRED',
        message: `Required variable ${sv.name} (${sv.label}) is missing from the ADSL dataset.`,
      });
      continue;
    }
    if (supplied.dataType !== sv.dataType) {
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Variable ${sv.name} (${sv.label}) is typed ${supplied.dataType} but ADaM IG v1.1 requires ${sv.dataType}.`,
      });
    }
  }

  // Expected-variable presence + type.
  for (const sv of ADSL_EXPECTED) {
    const supplied = suppliedByName.get(sv.name);
    if (!supplied) {
      missingExpected.push(sv.name);
      findings.push({
        variable: sv.name,
        severity: 'warning',
        code: 'MISSING_EXPECTED',
        message: `Expected variable ${sv.name} (${sv.label}) is missing from the ADSL dataset.`,
      });
      continue;
    }
    if (supplied.dataType !== sv.dataType) {
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Variable ${sv.name} (${sv.label}) is typed ${supplied.dataType} but ADaM IG v1.1 requires ${sv.dataType}.`,
      });
    }
  }

  // Structural checks across every supplied variable: population flags and
  // numeric coded treatment variables. These run independently of the
  // required/expected lists so that any flag (e.g. RANDFL) is caught.
  const requiredOrExpected = new Set([
    ...ADSL_REQUIRED.map((v) => v.name),
    ...ADSL_EXPECTED.map((v) => v.name),
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
            message: `Population flag ${name} is typed Num but ADaM IG v1.1 requires Char (values Y/N).`,
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
              message: `Population flag ${name} value "${term}" is not in the ADaM IG v1.1 flag codelist (allowed: Y, N).`,
            });
          }
        }
      }
    }

    // Numeric coded treatment variables (TRTxxPN / TRTxxAN) must be Num.
    if (isNumericTreatmentVariable(name) && supplied.dataType !== 'Num') {
      findings.push({
        variable: name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Numeric treatment variable ${name} is typed ${supplied.dataType} but ADaM IG v1.1 requires Num.`,
      });
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
    datasetName: 'ADSL',
    missingRequired,
    missingExpected,
    findings,
    counts: { errors, warnings },
  };
}
