/**
 * CDISC Controlled Terminology validator — CDISC CT (NCI EVS).
 *
 * A deterministic catalog + validator for common CDISC Controlled Terminology
 * codelists, encoded with their official NCI EVS submission values. CDISC CT is
 * the standardized set of codelists referenced by SDTM/SEND/ADaM variables, and
 * is published and maintained by the NCI Enterprise Vocabulary Services (EVS).
 *
 * The catalog here covers the most universal codelists a tabulation dataset
 * draws from:
 *
 *   - SEX     — Sex.
 *   - NY      — No / Yes.
 *   - NYUNK   — No / Yes / Unknown.
 *   - AESEV   — Severity / Intensity.
 *   - AGEU    — Age Unit.
 *   - OUT     — Outcome of Event.
 *   - ROUTE   — Route of Administration (subset).
 *   - FREQ    — Frequency (subset).
 *   - ACN     — Action Taken with Study Treatment.
 *   - ND      — Not Done.
 *
 * `validateControlledTerms` checks a set of supplied values against a named
 * codelist using a case-SENSITIVE exact match against the official submission
 * values (whitespace is trimmed first, since leading/trailing whitespace is not
 * a controlled-terminology distinction). It reports:
 *
 *   - UNKNOWN_CODELIST — the codelist code is not in the catalog (error;
 *                        recognized:false, valid:false, allowedValues:[]).
 *   - INVALID_VALUE    — a supplied value is not a submission value of the
 *                        codelist (error, one finding per offending value).
 *
 * The verdict is honest-by-construction: `valid` is true only when the codelist
 * is recognized and no supplied value is invalid. Pure / deterministic — no DB,
 * no I/O; `invalidValues` and findings are sorted for stable output.
 *
 * @module server/services/cdisc/controlled-terminology-validator
 */

/** A single CDISC Controlled Terminology codelist. */
export interface CtCodelist {
  /** Human-readable codelist name (NCI EVS submission/preferred name). */
  name: string;
  /**
   * The official CDISC CT submission values for this codelist, in NCI EVS
   * order. Matching against these is case-sensitive (after trimming).
   */
  codedValues: string[];
}

/**
 * CDISC Controlled Terminology codelists, keyed by codelist code, with their
 * official NCI EVS submission values. Values follow published CDISC CT; they
 * are not invented or normalized beyond what NCI EVS publishes.
 */
export const CT_CODELISTS: Record<string, CtCodelist> = {
  SEX: {
    name: 'Sex',
    codedValues: ['M', 'F', 'U', 'UNDIFFERENTIATED'],
  },
  NY: {
    name: 'No Yes Response',
    codedValues: ['N', 'Y'],
  },
  NYUNK: {
    name: 'No Yes Unknown',
    codedValues: ['N', 'Y', 'U'],
  },
  AESEV: {
    name: 'Severity/Intensity Scale for Adverse Events',
    codedValues: ['MILD', 'MODERATE', 'SEVERE'],
  },
  AGEU: {
    name: 'Age Unit',
    codedValues: ['YEARS', 'MONTHS', 'WEEKS', 'DAYS', 'HOURS'],
  },
  OUT: {
    name: 'Outcome of Event',
    codedValues: [
      'RECOVERED/RESOLVED',
      'RECOVERING/RESOLVING',
      'NOT RECOVERED/NOT RESOLVED',
      'RECOVERED/RESOLVED WITH SEQUELAE',
      'FATAL',
      'UNKNOWN',
    ],
  },
  ROUTE: {
    name: 'Route of Administration',
    codedValues: [
      'ORAL',
      'INTRAVENOUS',
      'INTRAMUSCULAR',
      'SUBCUTANEOUS',
      'TOPICAL',
      'INTRAVENOUS DRIP',
      'RESPIRATORY (INHALATION)',
    ],
  },
  FREQ: {
    name: 'Frequency',
    codedValues: ['QD', 'BID', 'TID', 'QID', 'QW', 'PRN', 'ONCE'],
  },
  ACN: {
    name: 'Action Taken with Study Treatment',
    codedValues: [
      'DOSE INCREASED',
      'DOSE NOT CHANGED',
      'DOSE REDUCED',
      'DRUG INTERRUPTED',
      'DRUG WITHDRAWN',
      'NOT APPLICABLE',
      'UNKNOWN',
    ],
  },
  ND: {
    name: 'Not Done',
    codedValues: ['ND'],
  },
};

export type CtSeverity = 'error' | 'warning';

export interface CtFinding {
  severity: CtSeverity;
  /** UNKNOWN_CODELIST / INVALID_VALUE. */
  code: string;
  message: string;
}

export interface ControlledTermsInput {
  /** Codelist code (e.g. 'SEX'); case-sensitive against catalog keys. */
  codelist: string;
  /** Supplied values to validate against the codelist's submission values. */
  values: string[];
}

export interface ControlledTermsResult {
  /** Echoed codelist code. */
  codelist: string;
  /** Whether the codelist code matched a catalog entry. */
  recognized: boolean;
  /** True only when recognized and no supplied value is invalid. */
  valid: boolean;
  /** Supplied values not in the codelist, sorted and de-duplicated. */
  invalidValues: string[];
  /** The codelist's submission values, or [] when unrecognized. */
  allowedValues: string[];
  findings: CtFinding[];
}

/** List the catalog's codelist codes, sorted deterministically. */
export function listCodelists(): string[] {
  return Object.keys(CT_CODELISTS).sort();
}

/** Look up a codelist by code, or undefined if not in the catalog. */
export function getCodelist(code: string): CtCodelist | undefined {
  return CT_CODELISTS[code];
}

/**
 * Validate supplied values against a named CDISC CT codelist. Matching is
 * case-sensitive exact (after trimming whitespace). Pure / deterministic;
 * invalidValues and findings are sorted for stable output.
 */
export function validateControlledTerms(input: ControlledTermsInput): ControlledTermsResult {
  const codelist = input.codelist;
  const spec = CT_CODELISTS[codelist];
  const findings: CtFinding[] = [];

  // UNKNOWN_CODELIST — no catalog entry; cannot validate.
  if (!spec) {
    findings.push({
      severity: 'error',
      code: 'UNKNOWN_CODELIST',
      message: `Codelist "${codelist || '(empty)'}" is not a recognized CDISC CT codelist (supported: ${listCodelists().join(', ')}).`,
    });
    return {
      codelist,
      recognized: false,
      valid: false,
      invalidValues: [],
      allowedValues: [],
      findings,
    };
  }

  const allowed = new Set(spec.codedValues);
  const invalidSet = new Set<string>();

  for (const raw of input.values ?? []) {
    const value = String(raw).trim();
    if (!allowed.has(value)) {
      invalidSet.add(value);
      findings.push({
        severity: 'error',
        code: 'INVALID_VALUE',
        message: `Value "${value}" is not in CDISC CT codelist ${codelist} (${spec.name}); allowed: ${spec.codedValues.join(', ')}.`,
      });
    }
  }

  const invalidValues = Array.from(invalidSet).sort();

  return {
    codelist,
    recognized: true,
    valid: invalidValues.length === 0,
    invalidValues,
    allowedValues: [...spec.codedValues],
    findings,
  };
}
