/**
 * SDTM domain conformance checker — CDISC SDTM-IG v3.4.
 *
 * A deterministic, dataset-level inspector pass over a single submitted SDTM
 * domain dataset's variable metadata, checking it against the SDTM-IG v3.4
 * reference specification for the most universal tabulation domains:
 *
 *   - DM (Demographics, SDTM-IG v3.4 §5.2) — one record per subject.
 *   - AE (Adverse Events, SDTM-IG v3.4 §6.3) — one record per AE per subject.
 *   - LB (Laboratory Test Results, SDTM-IG v3.4 §6.3) — one record per lab test.
 *   - VS (Vital Signs, SDTM-IG v3.4 §6.3) — one record per vital sign measurement.
 *   - CM (Concomitant/Prior Medications, SDTM-IG v3.4 §6.1) — one record per medication.
 *   - DS (Disposition, SDTM-IG v3.4 §6.2) — one record per disposition event.
 *   - EX (Exposure, SDTM-IG v3.4 §6.1) — one record per protocol-specified study treatment.
 *   - TS (Trial Summary, SDTM-IG v3.4 trial design model) — one record per parameter
 *     value. FDA's Technical Rejection Criteria for Study Data (1734) require a
 *     ts.xpt for every study, so a package cannot be checked without it. Both
 *     the full SDTM-IG form and FDA's four-variable "simplified ts.xpt"
 *     (STUDYID, TSPARMCD, TSVAL, TSVALNF) are accepted; see the spec below.
 *
 * Every other SDTM-IG domain is known (SDTM_KNOWN_DOMAINS) but has no
 * reference spec here. Such a domain is reported NOT_CONFORMANCE_CHECKED: it is
 * recognised, never called conformant, and never `ready`.
 *
 * It checks what an FDA/PMDA reviewer (and Pinnacle 21 / the FDA Study Data
 * Technical Conformance Guide) would flag at the structural level:
 *
 *   - MISSING_REQUIRED    — a Core=Req variable is absent (error).
 *   - TYPE_MISMATCH       — a variable's Char/Num type disagrees with the IG (error).
 *   - CODELIST_VIOLATION  — a supplied value is outside the variable's controlled
 *                           terminology (CDISC CT) (error).
 *   - UNKNOWN_DOMAIN      — the domain is not an SDTM-IG domain at all (error; not ready).
 *   - NOT_CONFORMANCE_CHECKED — a known SDTM-IG domain with no reference spec
 *                           here (warning; not ready, because nothing was checked).
 *   - EXTRA_VARIABLE      — a variable not in the reference spec (warning,
 *                           informational — sponsors legitimately add Perm
 *                           variables and SUPP-- linkage).
 *
 * The verdict is honest-by-construction: `ready` is true only when the domain
 * was conformance-checked against a spec and there are no error-severity
 * findings. Pure / deterministic — no DB, no I/O; findings are
 * sorted by variable name then severity for stable output.
 *
 * @module server/services/cdisc/sdtm-domain-conformance-checker
 */

export type SdtmDataType = 'Char' | 'Num';

/** A single variable's reference definition within an SDTM domain spec. */
export interface SdtmVariableSpec {
  /** SDTM variable name (e.g. 'USUBJID'). */
  name: string;
  /** Expected data type per the SDTM-IG. */
  dataType: SdtmDataType;
  /** Core designation. 'Req' variables MUST be present; others are not enforced for presence. */
  core: 'Req' | 'Exp' | 'Perm';
  /** Human-readable label (SDTM-IG variable label). */
  label: string;
  /**
   * CDISC controlled-terminology codelist name this variable draws from, if any.
   * The allowed values are listed in `allowedValues`.
   */
  codelist?: string;
  /** Allowed (case-insensitive) controlled-terminology values, when `codelist` is set. */
  allowedValues?: readonly string[];
  /**
   * False when a Req variable's absence is not raised as MISSING_REQUIRED,
   * because a form the regulator accepts omits it (TS: FDA's simplified
   * ts.xpt). Defaults to enforced. A type or codelist error is still raised
   * when the variable is present.
   */
  presenceEnforced?: false;
}

/** A reference spec for one SDTM domain. */
export interface SdtmDomainSpec {
  /** Two-character domain code (e.g. 'DM'). */
  domain: string;
  /** Domain label. */
  label: string;
  /** The reference variables for the domain. */
  variables: readonly SdtmVariableSpec[];
  /** Where the spec's content comes from, when it is not plain SDTM-IG v3.4 text. */
  note?: string;
}

/**
 * Every SDTM-IG domain code this checker knows, whether or not it has a
 * reference spec in SDTM_DOMAIN_SPECS. The one list of known SDTM domains:
 * a domain here without a spec is reported NOT_CONFORMANCE_CHECKED, and a code
 * outside it UNKNOWN_DOMAIN.
 *
 * Basis: recall of the SDTM-IG v3.4 domain models (special-purpose,
 * interventions, events, findings, findings-about, trial design and
 * relationship datasets), plus the domains SDTM-IG v3.4 cross-references from
 * the pharmacogenomics and medical-device implementation guides. Not checked
 * against CDISC text on 2026-10-05; a code missing here is reported
 * UNKNOWN_DOMAIN, which is never ready, so an omission fails closed.
 */
export const SDTM_KNOWN_DOMAINS: readonly string[] = [
  // Special-purpose
  'CO', 'DM', 'SE', 'SM', 'SV',
  // Interventions
  'AG', 'CM', 'EC', 'EX', 'ML', 'PR', 'SU',
  // Events
  'AE', 'BE', 'CE', 'DS', 'DV', 'HO', 'MH',
  // Findings and findings-about
  'BS', 'CP', 'CV', 'DA', 'DD', 'EG', 'FA', 'FT', 'GF', 'IE', 'IS', 'LB', 'MB', 'MI',
  'MK', 'MS', 'NV', 'OE', 'PC', 'PE', 'PP', 'QS', 'RE', 'RP', 'RS', 'SC', 'SR', 'SS',
  'TR', 'TU', 'UR', 'VS', 'OI',
  // Trial design
  'TA', 'TD', 'TE', 'TI', 'TM', 'TS', 'TV',
  // Relationship datasets
  'RELREC', 'SUPPQUAL',
];

const KNOWN_DOMAIN_SET = new Set(SDTM_KNOWN_DOMAINS);

/** Whether `code` is a known SDTM-IG domain; SUPP-- (e.g. SUPPAE) counts as SUPPQUAL. */
export function isKnownSdtmDomain(code: string): boolean {
  const c = (code ?? '').trim().toUpperCase();
  return KNOWN_DOMAIN_SET.has(c) || (/^SUPP[A-Z]{2}$/.test(c) && KNOWN_DOMAIN_SET.has(c.slice(4)));
}

/**
 * SDTM-IG v3.4 reference specifications for DM, AE, LB, VS, CM, DS, EX and TS.
 *
 * Variable selection, Core designations, types and codelists follow CDISC
 * SDTM-IG v3.4 (final, 2021) and the corresponding CDISC Controlled
 * Terminology. Only the Req-core (and the codelist-bearing) variables that a
 * dataset-level conformance check enforces are enumerated here.
 */
export const SDTM_DOMAIN_SPECS: Readonly<Record<string, SdtmDomainSpec>> = {
  DM: {
    domain: 'DM',
    label: 'Demographics',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'SUBJID', dataType: 'Char', core: 'Req', label: 'Subject Identifier for the Study' },
      { name: 'RFSTDTC', dataType: 'Char', core: 'Exp', label: 'Subject Reference Start Date/Time (ISO 8601)' },
      { name: 'RFENDTC', dataType: 'Char', core: 'Exp', label: 'Subject Reference End Date/Time (ISO 8601)' },
      { name: 'SITEID', dataType: 'Char', core: 'Req', label: 'Study Site Identifier' },
      { name: 'AGE', dataType: 'Num', core: 'Exp', label: 'Age' },
      {
        name: 'AGEU',
        dataType: 'Char',
        core: 'Exp',
        label: 'Age Units',
        codelist: 'AGEU',
        allowedValues: ['YEARS', 'MONTHS', 'WEEKS', 'DAYS', 'HOURS'],
      },
      {
        name: 'SEX',
        dataType: 'Char',
        core: 'Req',
        label: 'Sex',
        codelist: 'SEX',
        allowedValues: ['M', 'F', 'U', 'UNDIFFERENTIATED'],
      },
      { name: 'RACE', dataType: 'Char', core: 'Exp', label: 'Race' },
      { name: 'ETHNIC', dataType: 'Char', core: 'Exp', label: 'Ethnicity' },
      { name: 'ARM', dataType: 'Char', core: 'Req', label: 'Description of Planned Arm' },
      { name: 'ARMCD', dataType: 'Char', core: 'Req', label: 'Planned Arm Code' },
      { name: 'COUNTRY', dataType: 'Char', core: 'Req', label: 'Country' },
    ],
  },
  AE: {
    domain: 'AE',
    label: 'Adverse Events',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'AESEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'AETERM', dataType: 'Char', core: 'Req', label: 'Reported Term for the Adverse Event' },
      { name: 'AEDECOD', dataType: 'Char', core: 'Req', label: 'Dictionary-Derived Term' },
      {
        name: 'AESER',
        dataType: 'Char',
        core: 'Req',
        label: 'Serious Event',
        codelist: 'NY',
        allowedValues: ['Y', 'N'],
      },
      {
        name: 'AESEV',
        dataType: 'Char',
        core: 'Exp',
        label: 'Severity/Intensity',
        codelist: 'AESEV',
        allowedValues: ['MILD', 'MODERATE', 'SEVERE'],
      },
      { name: 'AEREL', dataType: 'Char', core: 'Exp', label: 'Causality' },
      {
        name: 'AEOUT',
        dataType: 'Char',
        core: 'Exp',
        label: 'Outcome of Adverse Event',
        codelist: 'OUT',
        allowedValues: [
          'RECOVERED/RESOLVED',
          'RECOVERING/RESOLVING',
          'NOT RECOVERED/NOT RESOLVED',
          'RECOVERED/RESOLVED WITH SEQUELAE',
          'FATAL',
          'UNKNOWN',
        ],
      },
      { name: 'AESTDTC', dataType: 'Char', core: 'Exp', label: 'Start Date/Time of Adverse Event (ISO 8601)' },
      { name: 'AEENDTC', dataType: 'Char', core: 'Exp', label: 'End Date/Time of Adverse Event (ISO 8601)' },
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
      { name: 'LBORRES', dataType: 'Char', core: 'Exp', label: 'Result or Finding in Original Units' },
      { name: 'LBORRESU', dataType: 'Char', core: 'Exp', label: 'Original Units' },
      { name: 'LBSTRESC', dataType: 'Char', core: 'Exp', label: 'Character Result/Finding in Std Format' },
      { name: 'LBSTRESN', dataType: 'Num', core: 'Exp', label: 'Numeric Result/Finding in Standard Units' },
      { name: 'LBSTRESU', dataType: 'Char', core: 'Exp', label: 'Standard Units' },
      { name: 'LBNRIND', dataType: 'Char', core: 'Exp', label: 'Reference Range Indicator' },
      { name: 'VISITNUM', dataType: 'Num', core: 'Exp', label: 'Visit Number' },
      { name: 'LBDTC', dataType: 'Char', core: 'Exp', label: 'Date/Time of Specimen Collection (ISO 8601)' },
    ],
  },
  VS: {
    domain: 'VS',
    label: 'Vital Signs',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'VSSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'VSTESTCD', dataType: 'Char', core: 'Req', label: 'Vital Signs Test Short Name' },
      { name: 'VSTEST', dataType: 'Char', core: 'Req', label: 'Vital Signs Test Name' },
      { name: 'VSORRES', dataType: 'Char', core: 'Exp', label: 'Result or Finding in Original Units' },
      { name: 'VSORRESU', dataType: 'Char', core: 'Exp', label: 'Original Units' },
      { name: 'VSSTRESC', dataType: 'Char', core: 'Exp', label: 'Character Result/Finding in Std Format' },
      { name: 'VSSTRESN', dataType: 'Num', core: 'Exp', label: 'Numeric Result/Finding in Standard Units' },
      { name: 'VSPOS', dataType: 'Char', core: 'Perm', label: 'Vital Signs Position of Subject' },
      { name: 'VSDTC', dataType: 'Char', core: 'Exp', label: 'Date/Time of Measurements (ISO 8601)' },
    ],
  },
  CM: {
    domain: 'CM',
    label: 'Concomitant/Prior Medications',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'CMSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'CMTRT', dataType: 'Char', core: 'Req', label: 'Reported Name of Drug, Med, or Therapy' },
      { name: 'CMDECOD', dataType: 'Char', core: 'Perm', label: 'Standardized Medication Name' },
      { name: 'CMINDC', dataType: 'Char', core: 'Perm', label: 'Indication' },
      { name: 'CMDOSE', dataType: 'Num', core: 'Perm', label: 'Dose per Administration' },
      { name: 'CMDOSU', dataType: 'Char', core: 'Perm', label: 'Dose Units' },
      { name: 'CMSTDTC', dataType: 'Char', core: 'Perm', label: 'Start Date/Time of Medication (ISO 8601)' },
      { name: 'CMENDTC', dataType: 'Char', core: 'Perm', label: 'End Date/Time of Medication (ISO 8601)' },
    ],
  },
  DS: {
    domain: 'DS',
    label: 'Disposition',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation' },
      { name: 'USUBJID', dataType: 'Char', core: 'Req', label: 'Unique Subject Identifier' },
      { name: 'DSSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number' },
      { name: 'DSTERM', dataType: 'Char', core: 'Req', label: 'Reported Term for the Disposition Event' },
      { name: 'DSDECOD', dataType: 'Char', core: 'Req', label: 'Standardized Disposition Term' },
      { name: 'DSCAT', dataType: 'Char', core: 'Req', label: 'Category for Disposition Event' },
      { name: 'DSSTDTC', dataType: 'Char', core: 'Exp', label: 'Start Date/Time of Disposition Event (ISO 8601)' },
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
      { name: 'EXDOSU', dataType: 'Char', core: 'Perm', label: 'Dose Units' },
      { name: 'EXROUTE', dataType: 'Char', core: 'Perm', label: 'Route of Administration' },
      { name: 'EXSTDTC', dataType: 'Char', core: 'Exp', label: 'Start Date/Time of Treatment (ISO 8601)' },
      { name: 'EXENDTC', dataType: 'Char', core: 'Exp', label: 'End Date/Time of Treatment (ISO 8601)' },
    ],
  },
  TS: {
    domain: 'TS',
    label: 'Trial Summary',
    note:
      "Accepts SDTM-IG's full TS and FDA's simplified ts.xpt (STUDYID, TSPARMCD, TSVAL, TSVALNF), "
      + 'which FDA accepts for studies that started before its study-data requirements applied. '
      + 'Only STUDYID and TSPARMCD, present in both forms, are enforced. DOMAIN, TSSEQ and TSPARM '
      + 'are Req in the full form by recall of SDTM-IG v3.4 and are not enforced, because the '
      + 'simplified form omits them; the Core designations below are recall, not checked against '
      + 'CDISC text. The study start date (TSPARMCD SSTDTC) is a package requirement '
      + '(TRC_1734_SSTDTC in cdisc-package-readiness), not a variable.',
    variables: [
      { name: 'STUDYID', dataType: 'Char', core: 'Req', label: 'Study Identifier' },
      { name: 'DOMAIN', dataType: 'Char', core: 'Req', label: 'Domain Abbreviation', presenceEnforced: false },
      { name: 'TSSEQ', dataType: 'Num', core: 'Req', label: 'Sequence Number', presenceEnforced: false },
      { name: 'TSGRPID', dataType: 'Char', core: 'Perm', label: 'Group ID' },
      { name: 'TSPARMCD', dataType: 'Char', core: 'Req', label: 'Trial Summary Parameter Short Name' },
      { name: 'TSPARM', dataType: 'Char', core: 'Req', label: 'Trial Summary Parameter', presenceEnforced: false },
      { name: 'TSVAL', dataType: 'Char', core: 'Exp', label: 'Parameter Value' },
      { name: 'TSVALNF', dataType: 'Char', core: 'Perm', label: 'Parameter Null Flavor' },
      { name: 'TSVALCD', dataType: 'Char', core: 'Exp', label: 'Parameter Value Code' },
      { name: 'TSVCDREF', dataType: 'Char', core: 'Exp', label: 'Name of the Reference Terminology' },
      { name: 'TSVCDVER', dataType: 'Char', core: 'Exp', label: 'Version of the Reference Terminology' },
    ],
  },
} as const;

export type SdtmConformanceSeverity = 'error' | 'warning';

export interface SdtmFinding {
  /** The variable the finding concerns, or '*' for a domain-level finding. */
  variable: string;
  severity: SdtmConformanceSeverity;
  /** MISSING_REQUIRED / TYPE_MISMATCH / CODELIST_VIOLATION / UNKNOWN_DOMAIN / NOT_CONFORMANCE_CHECKED / EXTRA_VARIABLE. */
  code: string;
  message: string;
}

/** A single variable's metadata as present in the submitted dataset. */
export interface SdtmVariableInput {
  name: string;
  dataType: SdtmDataType;
  /** Variable length, if known (carried through but not enforced here). */
  length?: number;
  /** The actual distinct values present in the dataset for a controlled-term variable. */
  controlledTerms?: string[];
}

export interface SdtmConformanceInput {
  /** Two-character domain code (case-insensitive). */
  domain: string;
  /** The dataset's variable metadata. */
  variables: SdtmVariableInput[];
}

export interface SdtmConformanceResult {
  ready: boolean;
  /** Echoed (normalized, uppercased) domain code. */
  domain: string;
  /** Whether the domain is a known SDTM-IG domain (SDTM_KNOWN_DOMAINS). */
  recognized: boolean;
  /** Whether the domain had a reference spec and was checked against it. */
  conformanceChecked: boolean;
  /** Required (Core=Req) variables absent from the dataset. */
  missingRequired: string[];
  findings: SdtmFinding[];
  counts: { errors: number; warnings: number };
}

function severityRank(s: SdtmConformanceSeverity): number {
  return s === 'error' ? 0 : 1;
}

/**
 * The result for a domain with no reference spec: NOT_CONFORMANCE_CHECKED for a
 * known SDTM-IG domain (recognised, nothing checked, never ready), and
 * UNKNOWN_DOMAIN for anything else.
 */
function noSpecResult(domain: string): SdtmConformanceResult {
  const specs = Object.keys(SDTM_DOMAIN_SPECS).join(', ');
  const base = { ready: false, domain, conformanceChecked: false, missingRequired: [] as string[] };
  if (isKnownSdtmDomain(domain)) {
    return {
      ...base,
      recognized: true,
      findings: [{
        variable: '*',
        severity: 'warning',
        code: 'NOT_CONFORMANCE_CHECKED',
        message: `Domain ${domain} is an SDTM-IG domain, but this checker has no reference spec for it (specs: ${specs}); its variables were not conformance-checked.`,
      }],
      counts: { errors: 0, warnings: 1 },
    };
  }
  return {
    ...base,
    recognized: false,
    findings: [{
      variable: '*',
      severity: 'error',
      code: 'UNKNOWN_DOMAIN',
      message: `Domain "${domain || '(empty)'}" is not a recognized SDTM-IG v3.4 domain (specs: ${specs}).`,
    }],
    counts: { errors: 1, warnings: 0 },
  };
}

/**
 * Check a submitted SDTM domain dataset's variable metadata against the
 * SDTM-IG v3.4 reference spec. Pure / deterministic; findings ordered by
 * variable name then severity.
 */
export function checkSdtmDomainConformance(input: SdtmConformanceInput): SdtmConformanceResult {
  const domain = (input.domain ?? '').trim().toUpperCase();
  const spec = SDTM_DOMAIN_SPECS[domain];
  // No reference spec: NOT_CONFORMANCE_CHECKED (known domain) or UNKNOWN_DOMAIN.
  if (!spec) return noSpecResult(domain);
  const findings: SdtmFinding[] = [];

  const suppliedByName = new Map<string, SdtmVariableInput>();
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
      if (sv.core === 'Req' && sv.presenceEnforced !== false) {
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
        message: `Variable ${sv.name} (${sv.label}) is typed ${supplied.dataType} but SDTM-IG v3.4 requires ${sv.dataType}.`,
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
        message: `Variable ${v.name} is not part of the SDTM-IG v3.4 ${domain} reference spec (sponsor/SUPP-- extension — informational).`,
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
    conformanceChecked: true,
    missingRequired,
    findings,
    counts: { errors, warnings },
  };
}
