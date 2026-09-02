/**
 * eCTD sequence validation against the canonical IND section map.
 *
 * Distinct from the readiness evaluator (which scores AUTHORING status of
 * sections): this validates an ASSEMBLED sequence — does it actually carry a
 * leaf for every section its filing type requires? An original IND is held to
 * the required set of services/regulatory/ind-ectd-sections.ts. Every later
 * sequence (ectd_sequences.type amendment/response/variation/annual/withdrawal,
 * plus the 21 CFR 312.32 safety report the lifecycle services file as an
 * amendment) is held to the Module 1 transmittal pair — Form 1571 at 1.1 and
 * the cover letter at 1.2 — plus the content that sequence exists to carry, at
 * the FDA eCTD Module 1 Specification v2.3 heading the platform files it under.
 * It reports the required placements with no leaf, plus any leaves that map to
 * no known section.
 *
 * The section map's `requiredForAmendment` flags are NOT the amendment set
 * here: they are conjunctive (every flagged M3 CMC section and 5.3.5 on every
 * amendment), which is the readiness evaluator's authoring checklist, not what
 * a single 312.30 protocol amendment or 312.32 safety report must carry.
 *
 * Pure / deterministic. Section codes are normalized (leading "m" stripped,
 * lower-cased) so 'm2.5' and '2.5' compare equal; a required section is
 * satisfied by an exact leaf or any more-granular descendant leaf.
 */

import {
  getRequiredSections,
  getAllINDSections,
} from '../../../services/regulatory/ind-ectd-sections.js';

/**
 * The validator's filing types. `initial` is an original IND; the rest follow
 * ectd_sequences.type (shared/schema/submissions.ts), with `safety_report`
 * carved out of `amendment` by leaf documentType — see filingTypeForSequence.
 */
export type SequenceFilingType = 'initial' | 'amendment' | 'safety_report' | 'annual' | 'response' | 'withdrawal';

export const SEQUENCE_FILING_TYPES: readonly SequenceFilingType[] = [
  'initial',
  'amendment',
  'safety_report',
  'annual',
  'response',
  'withdrawal',
];

export function isSequenceFilingType(value: unknown): value is SequenceFilingType {
  return typeof value === 'string' && (SEQUENCE_FILING_TYPES as readonly string[]).includes(value);
}

/**
 * Where the 312.32 IND Safety Report leaf is filed. ind-safety-report-service
 * .buildAmendmentIntent places the report here and this validator requires it
 * here, so the two cannot drift. 1.12.4 is a published FDA Module 1 v2.3
 * heading (CoU "m1.12.4 request for comments and advice"); the specification
 * has no heading dedicated to IND safety reports.
 */
export const IND_SAFETY_REPORT_SECTION = 'm1.12.4';

/** A leaf documentType that marks the sequence as a 312.32 safety-report filing. */
const SAFETY_REPORT_DOCUMENT_TYPE = /safety[_-]?report|icsr/i;

/** The minimal leaf shape this validator reads. */
export interface SequenceLeafLike {
  sectionCode: string;
}

export interface MissingRequiredSection {
  code: string;
  title: string;
  module: string;
  regulatoryRef: string;
  /** Every placement that would have satisfied the requirement (any-of requirements only). */
  alternatives?: string[];
}

export interface SequenceValidationReport {
  filingType: SequenceFilingType;
  /** True ⇔ every required section has a leaf. */
  valid: boolean;
  requiredCount: number;
  presentCount: number;
  missing: MissingRequiredSection[];
  /** Leaf section codes that map to no known CTD section (informational). */
  unknownSections: string[];
}

/**
 * One requirement: satisfied by a leaf at (or under) `code`, or at (or under)
 * any code in `anyOf`. Findings are reported under `code`.
 */
interface RequiredPlacement extends MissingRequiredSection {
  anyOf?: string[];
}

/**
 * FDA Module 1 v2.3 headings only post-original sequences file under. They are
 * not authoring sections of the initial-IND map, so their finding metadata
 * lives here; every other placement resolves from the map.
 */
const LIFECYCLE_HEADINGS: Record<string, Omit<MissingRequiredSection, 'code'>> = {
  'm1.5': {
    title: 'Application Status (withdrawal of an IND)',
    module: 'M1',
    regulatoryRef: '21 CFR 312.38; FDA eCTD Module 1 Specification v2.3 §1.5.1',
  },
  'm1.11': {
    title: 'Information Amendment: Information Not Covered Under Modules 2 to 5',
    module: 'M1',
    regulatoryRef: '21 CFR 312.31; FDA eCTD Module 1 Specification v2.3 §1.11',
  },
  [IND_SAFETY_REPORT_SECTION]: {
    title: 'IND Safety Report',
    module: 'M1',
    regulatoryRef: '21 CFR 312.32; FDA eCTD Module 1 Specification v2.3 §1.12.4',
  },
  'm1.13': {
    title: 'Annual Report',
    module: 'M1',
    regulatoryRef: '21 CFR 312.33; FDA eCTD Module 1 Specification v2.3 §1.13',
  },
};

/**
 * Content a 312.30 / 312.31 amendment carries: the protocol at 5.3.5.x, the
 * amended Module 2–5 information (CMC 3.2, pharm/tox 4.2, clinical 2.5 / 5.3),
 * or a 1.11 information amendment for information no CTD module covers.
 */
const AMENDED_CONTENT = ['m5.3.5', 'm1.11', 'm2', 'm3', 'm4', 'm5'];

type LifecycleFilingType = Exclude<SequenceFilingType, 'initial'>;

let lifecycleSets: Record<LifecycleFilingType, RequiredPlacement[]> | null = null;

/** The per-type required placements for every post-original sequence (built once). */
function lifecycleRequirements(): Record<LifecycleFilingType, RequiredPlacement[]> {
  if (lifecycleSets) return lifecycleSets;
  const byCode = new Map(getAllINDSections().map((s) => [s.code, s]));
  const heading = (code: string, override: Partial<RequiredPlacement> = {}): RequiredPlacement => {
    const s = byCode.get(code);
    const h = LIFECYCLE_HEADINGS[code];
    if (!s && !h) throw new Error(`ind-sequence-validation: ${code} is neither a section-map code nor a lifecycle heading`);
    const base = s ? { title: s.title, module: s.module, regulatoryRef: s.regulatoryRef } : h!;
    return { code, ...base, ...override };
  };
  // Every post-original sequence carries the transmittal pair: Form 1571 (1.1) + cover letter (1.2).
  const transmittal = () => [heading('m1.1'), heading('m1.2')];
  lifecycleSets = {
    amendment: [
      ...transmittal(),
      heading('m5.3.5', {
        anyOf: AMENDED_CONTENT,
        title: 'Amended content — protocol (5.3.5.x), Module 2–5 information, or a 1.11 information amendment',
        regulatoryRef: '21 CFR 312.30 (protocol amendment) / 312.31 (information amendment)',
      }),
    ],
    safety_report: [...transmittal(), heading(IND_SAFETY_REPORT_SECTION)],
    annual: [...transmittal(), heading('m1.13')],
    response: [
      ...transmittal(),
      heading('m1.11', {
        anyOf: ['m1.11', 'm2', 'm3', 'm4', 'm5'],
        title: 'Response content — a Module 2–5 leaf or a 1.11 information amendment',
        regulatoryRef: '21 CFR 312.42(e) (clinical hold response) / 312.31 (information request response)',
      }),
    ],
    withdrawal: [...transmittal(), heading('m1.5')],
  };
  return lifecycleSets;
}

/** The required placements for a filing type; `initial` is the section map's required set, unchanged. */
function requiredPlacementsFor(filingType: SequenceFilingType): RequiredPlacement[] {
  if (filingType === 'initial') {
    return getRequiredSections().map((s) => ({ code: s.code, title: s.title, module: s.module, regulatoryRef: s.regulatoryRef }));
  }
  return lifecycleRequirements()[filingType];
}

/**
 * The validator filing type for a stored eCTD sequence. A sequence carrying a
 * safety-report / ICSR leaf (by documentType) is a 312.32 safety-report filing
 * whatever its type says — the lifecycle services persist it as an `amendment`
 * (persistSafetyReportIntent). `original` is the initial IND; `variation` (a
 * post-authorisation change) has an amendment's shape. An unknown or absent
 * type falls back to the original-IND set — the strictest — so a mis-typed
 * sequence fails closed rather than passing on a lighter set.
 */
export function filingTypeForSequence(
  sequenceType: string | null | undefined,
  leaves: ReadonlyArray<{ documentType?: string | null }> = [],
): SequenceFilingType {
  if (leaves.some((l) => typeof l.documentType === 'string' && SAFETY_REPORT_DOCUMENT_TYPE.test(l.documentType))) {
    return 'safety_report';
  }
  switch ((sequenceType ?? '').trim().toLowerCase()) {
    case 'amendment':
    case 'variation':
      return 'amendment';
    case 'annual':
      return 'annual';
    case 'response':
      return 'response';
    case 'withdrawal':
      return 'withdrawal';
    case 'original':
    default:
      return 'initial';
  }
}

/** Strip a leading "m" and lower-case so 'm2.5' and '2.5' compare equal. */
function normalize(code: string): string {
  const c = code.trim().toLowerCase();
  return c.startsWith('m') ? c.slice(1) : c;
}

/** A required section is satisfied by an exact leaf or a descendant leaf. */
function isSatisfied(requiredCode: string, leafCodes: Set<string>): boolean {
  if (leafCodes.has(requiredCode)) return true;
  const prefix = `${requiredCode}.`;
  for (const lc of leafCodes) {
    if (lc.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Validate a sequence's leaves against the required IND sections for the filing
 * type. `valid` is the gate (true ⇔ no missing required sections).
 */
export function validateSequenceLeaves(input: {
  filingType: SequenceFilingType;
  leaves: SequenceLeafLike[];
}): SequenceValidationReport {
  const required = requiredPlacementsFor(input.filingType);

  const leafCodes = new Set(input.leaves.map((l) => normalize(l.sectionCode)));

  const missing: MissingRequiredSection[] = [];
  for (const { anyOf, ...s } of required) {
    const accepted = anyOf ?? [s.code];
    if (!accepted.some((code) => isSatisfied(normalize(code), leafCodes))) {
      missing.push(anyOf ? { ...s, alternatives: anyOf } : s);
    }
  }

  // Known section codes (for the unknown-leaf check): a leaf is "known" if its
  // code equals or is a descendant of any section in the full map.
  const knownCodes = getAllINDSections().map((s) => normalize(s.code));
  const unknownSections: string[] = [];
  for (const leaf of input.leaves) {
    const nc = normalize(leaf.sectionCode);
    const known = knownCodes.some((k) => k === nc || nc.startsWith(`${k}.`) || k.startsWith(`${nc}.`));
    if (!known) unknownSections.push(leaf.sectionCode);
  }

  return {
    filingType: input.filingType,
    valid: missing.length === 0,
    requiredCount: required.length,
    presentCount: required.length - missing.length,
    missing,
    unknownSections,
  };
}
