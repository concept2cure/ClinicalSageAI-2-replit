/**
 * SEND (nonclinical) domain conformance checker — CDISC SEND-IG v3.1.
 *
 * A deterministic, dataset-level inspector pass over a single submitted SEND
 * domain dataset's variable metadata, checking it against the CDISC Standard
 * for Exchange of Nonclinical Data Implementation Guide (SEND-IG) v3.1
 * reference specification for the most common nonclinical (animal toxicology)
 * tabulation domains:
 *
 *   - DM (Demographics, SEND-IG v3.1) — one record per animal/subject.
 *   - EX (Exposure, SEND-IG v3.1) — one record per dosing/treatment.
 *   - BW (Body Weights, SEND-IG v3.1) — one record per body-weight measurement.
 *   - CL (Clinical Observations, SEND-IG v3.1) — one record per observation.
 *   - LB (Laboratory Test Results, SEND-IG v3.1) — one record per lab test.
 *   - MI (Microscopic Findings, SEND-IG v3.1) — one record per histopathology finding.
 *
 * It checks what an FDA reviewer (and the FDA Study Data Technical Conformance
 * Guide / Pinnacle 21) would flag at the structural level:
 *
 *   - MISSING_REQUIRED    — a Core=Req variable is absent (error).
 *   - TYPE_MISMATCH       — a variable's Char/Num type disagrees with the IG (error).
 *   - CODELIST_VIOLATION  — a supplied value is outside the variable's controlled
 *                           terminology (CDISC CT) (error).
 *   - UNKNOWN_DOMAIN      — the domain is not a recognized spec (error; not ready).
 *   - EXTRA_VARIABLE      — a variable not in the reference spec (warning,
 *                           informational — sponsors legitimately add Perm
 *                           variables and SUPP-- linkage).
 *
 * The verdict is honest-by-construction: `ready` is true only when there are no
 * error-severity findings. Pure / deterministic — no DB, no I/O; findings are
 * sorted by variable name then severity for stable output.
 *
 * @module server/services/cdisc/send-domain-conformance-checker
 */

export type SendDataType = 'Char' | 'Num';

/** A single variable's reference definition within a SEND domain spec. */
export interface SendVariableSpec {
  /** SEND variable name (e.g. 'USUBJID'). */
  name: string;
  /** Expected data type per the SEND-IG. */
  dataType: SendDataType;
  /** Core designation. 'Req' variables MUST be present; others are not enforced for presence. */
  core: 'Req' | 'Exp' | 'Perm';
  /** Human-readable label (SEND-IG variable label). */
  label: string;
  /**
   * CDISC controlled-terminology codelist name this variable draws from, if any.
   * The allowed values are listed in `allowedValues`.
   */
  codelist?: string;
  /** Allowed (case-insensitive) controlled-terminology values, when `codelist` is set. */
  allowedValues?: readonly string[];
}

/** A reference spec for one SEND domain. */
export interface SendDomainSpec {
  /** Two-character domain code (e.g. 'DM'). */
  domain: string;
  /** Domain label. */
  label: string;
  /** The reference variables for the domain. */
  variables: readonly SendVariableSpec[];
}

/**
 * SEND-IG v3.1 reference specifications for DM, EX, BW, CL, LB and MI.
 *
 * Variable selection, Core designations, types and codelists follow CDISC
 * SEND-IG v3.1 (final, 2016) and the corresponding CDISC Controlled
 * Terminology. Only the Req-core (and the codelist-bearing) variables that a
 * dataset-level conformance check enforces are enumerated here. Codelists are
 * encoded only where the controlled terminology is unambiguous (e.g. SEX).
 */
export const SEND_DOMAIN_SPECS: Readonly<Record<string, SendDomainSpec>> = {
  DM: {
    domain: 'DM',
    label: 'Demographics',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'SUBJID', dataType: 'Char', core: 'Req', label: 'Subject Identifier for the Study' },
      { name: 'SPECIES', dataType: 'Char', core: 'Req', label: 'Species' },
      { name: 'STRAIN', dataType: 'Char', core: 'Req', label: 'Strain/Substrain' },
      {
        name: 'SEX',
        dataType: 'Char',
        core: 'Req',
        label: 'Sex',
        codelist: 'SEX',
        allowedValues: ['M', 'F', 'U'],
      },
      { name: 'ARMCD', dataType: 'Char', core: 'Req', label: 'Planned Arm Code' },
      { name: 'ARM', dataType: 'Char', core: 'Req', label: 'Description of Planned Arm' },
      { name: 'SETCD', dataType: 'Char', core: 'Req', label: 'Set Code' },
    ],
  },
  EX: {
    domain: 'EX',
    label: 'Exposure',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'EXSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'EXTRT', dataType: 'Char', core: 'Req', label: 'Name of Treatment' },
      { name: 'EXDOSE', dataType: 'Num', core: 'Req', label: 'Dose' },
      { name: 'EXDOSU', dataType: 'Char', core: 'Req', label: 'Dose Units' },
      { name: 'EXROUTE', dataType: 'Char', core: 'Req', label: 'Route of Administration' },
    ],
  },
  BW: {
    domain: 'BW',
    label: 'Body Weights',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'BWSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'BWTESTCD', dataType: 'Char', core: 'Req', label: 'Body Weight Test Short Name' },
      { name: 'BWTEST', dataType: 'Char', core: 'Req', label: 'Body Weight Test Name' },
      { name: 'BWORRES', dataType: 'Char', core: 'Req', label: 'Result or Finding in Original Units' },
      { name: 'BWORRESU', dataType: 'Char', core: 'Req', label: 'Original Units' },
      { name: 'BWDY', dataType: 'Num', core: 'Req', label: 'Study Day of Body Weight Measurement' },
    ],
  },
  CL: {
    domain: 'CL',
    label: 'Clinical Observations',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'CLSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'CLTESTCD', dataType: 'Char', core: 'Req', label: 'Clinical Observation Short Name' },
      { name: 'CLTEST', dataType: 'Char', core: 'Req', label: 'Clinical Observation Name' },
      { name: 'CLORRES', dataType: 'Char', core: 'Req', label: 'Result or Finding in Original Units' },
    ],
  },
  LB: {
    domain: 'LB',
    label: 'Laboratory Test Results',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'LBSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'LBTESTCD', dataType: 'Char', core: 'Req', label: 'Lab Test or Examination Short Name' },
      { name: 'LBTEST', dataType: 'Char', core: 'Req', label: 'Lab Test or Examination Name' },
      { name: 'LBORRES', dataType: 'Char', core: 'Req', label: 'Result or Finding in Original Units' },
    ],
  },
  MI: {
    domain: 'MI',
    label: 'Microscopic Findings',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'MISEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'MISPEC', dataType: 'Char', core: 'Req', label: 'Specimen Material Type' },
      { name: 'MITESTCD', dataType: 'Char', core: 'Req', label: 'Microscopic Examination Short Name' },
      { name: 'MITEST', dataType: 'Char', core: 'Req', label: 'Microscopic Examination Name' },
      { name: 'MIORRES', dataType: 'Char', core: 'Req', label: 'Result or Finding in Original Units' },
    ],
  },
} as const;

export type SendConformanceSeverity = 'error' | 'warning';

export interface SendFinding {
  /** The variable the finding concerns, or '*' for a domain-level finding. */
  variable: string;
  severity: SendConformanceSeverity;
  /** MISSING_REQUIRED / TYPE_MISMATCH / CODELIST_VIOLATION / UNKNOWN_DOMAIN / EXTRA_VARIABLE. */
  code: string;
  message: string;
}

/** A single variable's metadata as present in the submitted dataset. */
export interface SendVariableInput {
  name: string;
  dataType: SendDataType;
  /** Variable length, if known (carried through but not enforced here). */
  length?: number;
  /** The actual distinct values present in the dataset for a controlled-term variable. */
  controlledTerms?: string[];
}

export interface SendConformanceInput {
  /** Two-character domain code (case-insensitive). */
  domain: string;
  /** The dataset's variable metadata. */
  variables: SendVariableInput[];
}

export interface SendConformanceResult {
  ready: boolean;
  /** Echoed (normalized, uppercased) domain code. */
  domain: string;
  /** Whether the domain matched a known SEND-IG spec. */
  recognized: boolean;
  /** Required (Core=Req) variables absent from the dataset. */
  missingRequired: string[];
  findings: SendFinding[];
  counts: { errors: number; warnings: number };
}

function severityRank(s: SendConformanceSeverity): number {
  return s === 'error' ? 0 : 1;
}

/**
 * Check a submitted SEND domain dataset's variable metadata against the
 * SEND-IG v3.1 reference spec. Pure / deterministic; findings ordered by
 * variable name then severity.
 */
export function checkSendDomainConformance(input: SendConformanceInput): SendConformanceResult {
  const domain = (input.domain ?? '').trim().toUpperCase();
  const spec = SEND_DOMAIN_SPECS[domain];
  const findings: SendFinding[] = [];

  // UNKNOWN_DOMAIN — no reference spec; cannot conform.
  if (!spec) {
    findings.push({
      variable: '*',
      severity: 'error',
      code: 'UNKNOWN_DOMAIN',
      message: `Domain "${domain || '(empty)'}" is not a recognized SEND-IG v3.1 spec (supported: ${Object.keys(SEND_DOMAIN_SPECS).join(', ')}).`,
    });
    return {
      ready: false,
      domain,
      recognized: false,
      missingRequired: [],
      findings,
      counts: { errors: 1, warnings: 0 },
    };
  }

  const suppliedByName = new Map<string, SendVariableInput>();
  for (const v of input.variables ?? []) {
    // Last occurrence wins; deterministic given input order.
    suppliedByName.set(v.name.trim().toUpperCase(), v);
  }
  const specByName = new Map(spec.variables.map((v) => [v.name, v] as const));

  const missingRequired: string[] = [];

  // Spec-driven checks: presence, type, codelist.
  for (const sv of spec.variables) {
    const supplied = suppliedByName.get(sv.name);

    if (!supplied) {
      if (sv.core === 'Req') {
        missingRequired.push(sv.name);
        findings.push({
          variable: sv.name,
          severity: 'error',
          code: 'MISSING_REQUIRED',
          message: `Required variable ${sv.name} (${sv.label}) is missing from the ${domain} dataset.`,
        });
      }
      continue;
    }

    // TYPE_MISMATCH — Char vs Num must match the IG.
    if (supplied.dataType !== sv.dataType) {
      findings.push({
        variable: sv.name,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: `Variable ${sv.name} (${sv.label}) is typed ${supplied.dataType} but SEND-IG v3.1 requires ${sv.dataType}.`,
      });
    }

    // CODELIST_VIOLATION — supplied values must be within the CDISC CT codelist.
    if (sv.codelist && sv.allowedValues && supplied.controlledTerms?.length) {
      const allowed = new Set(sv.allowedValues.map((a) => a.toUpperCase()));
      for (const term of supplied.controlledTerms) {
        if (!allowed.has(String(term).trim().toUpperCase())) {
          findings.push({
            variable: sv.name,
            severity: 'error',
            code: 'CODELIST_VIOLATION',
            message: `Variable ${sv.name} value "${term}" is not in CDISC CT codelist ${sv.codelist} (allowed: ${sv.allowedValues.join(', ')}).`,
          });
        }
      }
    }
  }

  // EXTRA_VARIABLE — present in the dataset but not in the reference spec.
  for (const [name, v] of suppliedByName) {
    if (!specByName.has(name)) {
      findings.push({
        variable: v.name,
        severity: 'warning',
        code: 'EXTRA_VARIABLE',
        message: `Variable ${v.name} is not part of the SEND-IG v3.1 ${domain} reference spec (sponsor/SUPP-- extension — informational).`,
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
    domain,
    recognized: true,
    missingRequired,
    findings,
    counts: { errors, warnings },
  };
}
