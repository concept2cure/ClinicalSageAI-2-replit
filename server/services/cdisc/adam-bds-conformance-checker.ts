/**
 * ADaM BDS conformance checker — CDISC ADaM IG v1.1.
 *
 * A deterministic, dataset-level inspector pass over a submitted ADaM Basic Data
 * Structure (BDS) dataset's variable metadata, checking it against the CDISC ADaM
 * Implementation Guide v1.1 reference structure. The BDS is the canonical
 * one-record-per-subject-per-parameter-per-analysis-timepoint structure used by
 * analysis datasets such as ADVS, ADLB, ADEG, ADQS, etc., so there is a single,
 * well-known set of structural variables and no domain parameter — the spec is
 * fixed.
 *
 * It checks what an FDA/PMDA reviewer (and Pinnacle 21 / the FDA Study Data
 * Technical Conformance Guide) would flag at the structural level:
 *
 *   - MISSING_REQUIRED       — a required BDS variable (STUDYID, USUBJID, PARAMCD,
 *                              PARAM) is absent (error).
 *   - MISSING_ANALYSIS_VALUE — neither AVAL (Num) nor AVALC (Char), the BDS
 *                              analysis value pair, is present (error). A BDS
 *                              record must carry an analysis value.
 *   - MISSING_EXPECTED       — an expected BDS variable (PARAMN, ABLFL, ANL01FL,
 *                              AVISIT, AVISITN, and a timing variable ADT or ADY)
 *                              is absent (warning).
 *   - TYPE_MISMATCH          — a variable's Char/Num type disagrees with the IG,
 *                              e.g. PARAMCD supplied as Num, AVAL supplied as Char,
 *                              or a flag supplied as Num (error).
 *   - FLAG_VIOLATION         — a flag variable (name ending 'FL', e.g. ABLFL /
 *                              ANL01FL) has a supplied controlled term outside
 *                              {Y, N} (error).
 *
 * The verdict is honest-by-construction: `ready` is true only when there are no
 * error-severity findings. Pure / deterministic — no DB, no I/O; findings are
 * sorted by variable name then severity for stable output.
 *
 * Reference: CDISC ADaM Implementation Guide v1.1 (2016) §4 (The ADaM Basic Data
 * Structure, BDS) — the required structural variables (STUDYID, USUBJID, PARAMCD,
 * PARAM), the analysis value variables (AVAL Num / AVALC Char), the parameter and
 * timing/visit variables (PARAMN, AVISIT, AVISITN, ADT, ADY), and the ADaM
 * variable naming conventions for indicator flags (NY codelist, values Y/N).
 *
 * @module server/services/cdisc/adam-bds-conformance-checker
 */

export type AdamDataType = 'Char' | 'Num';

/** A single BDS reference variable definition. */
export interface BdsVariableSpec {
  /** ADaM variable name (e.g. 'PARAMCD'). */
  name: string;
  /** Expected data type per the ADaM IG. */
  dataType: AdamDataType;
  /** Human-readable label. */
  label: string;
}

/**
 * Required BDS variables (ADaM IG v1.1). Their absence is an error.
 */
export const BDS_REQUIRED: readonly BdsVariableSpec[] = [
  { name: 'STUDYID', dataType: 'Char', label: 'Study Identifier' },
  { name: 'USUBJID', dataType: 'Char', label: 'Unique Subject Identifier' },
  { name: 'PARAMCD', dataType: 'Char', label: 'Parameter Code' },
  { name: 'PARAM', dataType: 'Char', label: 'Parameter' },
] as const;

/**
 * Expected BDS variables (ADaM IG v1.1). Their absence is a warning.
 *
 * Note: timing is handled separately — ADaM requires a timing variable but
 * either ADT (analysis date) or ADY (analysis relative day) satisfies it, so the
 * "ADT or ADY" rule is enforced in the checker rather than as a single spec row.
 */
export const BDS_EXPECTED: readonly BdsVariableSpec[] = [
  { name: 'PARAMN', dataType: 'Num', label: 'Parameter (N)' },
  { name: 'ABLFL', dataType: 'Char', label: 'Baseline Record Flag' },
  { name: 'ANL01FL', dataType: 'Char', label: 'Analysis Record Flag 01' },
  { name: 'AVISIT', dataType: 'Char', label: 'Analysis Visit' },
  { name: 'AVISITN', dataType: 'Num', label: 'Analysis Visit (N)' },
] as const;

export type AdamConformanceSeverity = 'error' | 'warning';

export interface AdamFinding {
  /** The variable the finding concerns. */
  variable: string;
  severity: AdamConformanceSeverity;
  /** MISSING_REQUIRED / MISSING_ANALYSIS_VALUE / MISSING_EXPECTED / TYPE_MISMATCH / FLAG_VIOLATION. */
  code: string;
  message: string;
}

/** A single variable's metadata as present in the submitted BDS dataset. */
export interface AdamVariableInput {
  name: string;
  dataType: AdamDataType;
  /** The actual distinct values present for a controlled-term variable. */
  controlledTerms?: string[];
}

export interface AdamBdsConformanceInput {
  /** The dataset's variable metadata. */
  variables: AdamVariableInput[];
}

export interface AdamBdsConformanceResult {
  ready: boolean;
  datasetName: 'BDS';
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

/** An indicator flag is any ADaM variable whose name ends in 'FL'. */
function isFlagVariable(name: string): boolean {
  return /FL$/.test(name);
}

/**
 * Variables that must be Num if present (ADaM IG v1.1 BDS). AVAL is excluded
 * here because the analysis-value pair (AVAL/AVALC) is checked separately.
 */
const NUM_IF_PRESENT: readonly string[] = ['PARAMN', 'AVISITN', 'ADT', 'ADY'] as const;

/**
 * Check a submitted BDS dataset's variable metadata against the ADaM IG v1.1
 * reference structure. Pure / deterministic; findings ordered by variable name
 * then severity.
 */
export function checkAdamBdsConformance(input: AdamBdsConformanceInput): AdamBdsConformanceResult {
  const findings: AdamFinding[] = [];

  const suppliedByName = new Map<string, AdamVariableInput>();
  for (const v of input.variables ?? []) {
    // Last occurrence wins; deterministic given input order.
    suppliedByName.set(v.name.trim().toUpperCase(), v);
  }

  const missingRequired: string[] = [];
  const missingExpected: string[] = [];

  // Required-variable presence + type.
  for (const sv of BDS_REQUIRED) {
    const supplied = suppliedByName.get(sv.name);
    if (!supplied) {
      missingRequired.push(sv.name);
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'MISSING_REQUIRED',
        message: `Required variable ${sv.name} (${sv.label}) is missing from the BDS dataset.`,
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

  // Analysis value: at least one of AVAL (Num) or AVALC (Char) must be present.
  const aval = suppliedByName.get('AVAL');
  const avalc = suppliedByName.get('AVALC');
  if (!aval && !avalc) {
    findings.push({
      variable: 'AVAL',
      severity: 'error',
      code: 'MISSING_ANALYSIS_VALUE',
      message:
        'No analysis value variable present: a BDS record requires at least one of AVAL (Num) or AVALC (Char) per ADaM IG v1.1.',
    });
  }
  if (aval && aval.dataType !== 'Num') {
    findings.push({
      variable: 'AVAL',
      severity: 'error',
      code: 'TYPE_MISMATCH',
      message: `Variable AVAL (Analysis Value) is typed ${aval.dataType} but ADaM IG v1.1 requires Num.`,
    });
  }
  if (avalc && avalc.dataType !== 'Char') {
    findings.push({
      variable: 'AVALC',
      severity: 'error',
      code: 'TYPE_MISMATCH',
      message: `Variable AVALC (Analysis Value (C)) is typed ${avalc.dataType} but ADaM IG v1.1 requires Char.`,
    });
  }

  // Expected-variable presence + type.
  for (const sv of BDS_EXPECTED) {
    const supplied = suppliedByName.get(sv.name);
    if (!supplied) {
      missingExpected.push(sv.name);
      findings.push({
        variable: sv.name,
        severity: 'warning',
        code: 'MISSING_EXPECTED',
        message: `Expected variable ${sv.name} (${sv.label}) is missing from the BDS dataset.`,
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

  // Timing: ADaM requires an analysis timing variable; either ADT (analysis date)
  // or ADY (analysis relative day) satisfies it. Absence of both is a warning.
  const adt = suppliedByName.get('ADT');
  const ady = suppliedByName.get('ADY');
  if (!adt && !ady) {
    missingExpected.push('ADT');
    findings.push({
      variable: 'ADT',
      severity: 'warning',
      code: 'MISSING_EXPECTED',
      message:
        'No analysis timing variable present: a BDS dataset is expected to carry at least one of ADT (Analysis Date) or ADY (Analysis Relative Day) per ADaM IG v1.1.',
    });
  }

  // Type rules for variables that must be Num if present (PARAMN/AVISITN already
  // covered by the expected-list pass; this also catches ADT/ADY when supplied).
  for (const name of NUM_IF_PRESENT) {
    const supplied = suppliedByName.get(name);
    if (supplied && supplied.dataType !== 'Num' && !BDS_EXPECTED.some((v) => v.name === name)) {
      findings.push({
        variable: name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Variable ${name} is typed ${supplied.dataType} but ADaM IG v1.1 requires Num.`,
      });
    }
  }

  // Structural checks across every supplied variable: indicator flags. These run
  // independently of the required/expected lists so any flag (e.g. CRIT1FL) is
  // caught. (If a flag is in the expected list and typed Num, the expected-list
  // pass already reported TYPE_MISMATCH; avoid a duplicate.)
  const requiredOrExpected = new Set([
    ...BDS_REQUIRED.map((v) => v.name),
    ...BDS_EXPECTED.map((v) => v.name),
  ]);

  for (const [name, supplied] of suppliedByName) {
    if (!isFlagVariable(name)) continue;
    if (supplied.dataType === 'Num') {
      if (!requiredOrExpected.has(name)) {
        findings.push({
          variable: name,
          severity: 'error',
          code: 'TYPE_MISMATCH',
          message: `Flag ${name} is typed Num but ADaM IG v1.1 requires Char (values Y/N).`,
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
            message: `Flag ${name} value "${term}" is not in the ADaM IG v1.1 flag codelist (allowed: Y, N).`,
          });
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
    datasetName: 'BDS',
    missingRequired,
    missingExpected,
    findings,
    counts: { errors, warnings },
  };
}
