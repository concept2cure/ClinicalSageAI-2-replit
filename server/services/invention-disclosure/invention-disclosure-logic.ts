/**
 * Invention Disclosure / Bayh-Dole deterministic logic (Capability C2C-25)
 *
 * Pure, DB-free, LLM-free: the Bayh-Dole reporting clock for a federally-funded
 * invention and the submission-readiness gate. The intervals are grounded in the
 * standard funding-agreement patent-rights clause 37 CFR 401.14(c): the contractor
 * discloses each subject invention to the agency within 2 months of the inventor's
 * disclosure to the institution; elects to retain title within 2 years of that
 * disclosure; and files an initial patent application within 1 year of election
 * (or before any statutory bar). `asOf` is always passed in so the logic stays
 * deterministic and testable.
 *
 * @module server/services/invention-disclosure/invention-disclosure-logic
 */

export const BAYH_DOLE_BASIS = '37 CFR 401.14(c) (Bayh-Dole patent-rights clause)';

/** Bayh-Dole 37 CFR 401.14(c) intervals, in days (approximate calendar months/years). */
export const AGENCY_DISCLOSURE_DAYS = 60;   // ~2 months from inventor disclosure
export const ELECTION_OF_TITLE_DAYS = 730;  // 2 years from inventor disclosure
export const PATENT_FILING_DAYS = 365;      // 1 year from election of title

export type DeadlineStatus = 'on_track' | 'due_soon' | 'overdue' | 'satisfied' | 'not_applicable';

export interface BayhDoleDeadline {
  obligation: 'agency_disclosure' | 'election_of_title' | 'patent_filing';
  dueDate: string | null;
  status: DeadlineStatus;
  daysRemaining: number | null;
  basis: string;
}

export interface BayhDoleComplianceInput {
  federalFunding: boolean;
  disclosureDate?: string | null;
  electionDate?: string | null;
  /** True once an initial patent application has been filed (status patent_filed/licensed). */
  patentFiled?: boolean;
  /** Evaluation date (ISO yyyy-mm-dd). */
  asOf: string;
}

export interface BayhDoleComplianceResult {
  applicable: boolean;
  deadlines: BayhDoleDeadline[];
  /** True when any applicable obligation is overdue. */
  hasOverdue: boolean;
  basis: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 30;

function parse(d?: string | null): number | null {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}
function addDays(ms: number, days: number): number { return ms + days * DAY_MS; }
function toIso(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }

function statusFor(dueMs: number, asOfMs: number, satisfied: boolean): { status: DeadlineStatus; daysRemaining: number } {
  const daysRemaining = Math.ceil((dueMs - asOfMs) / DAY_MS);
  if (satisfied) return { status: 'satisfied', daysRemaining };
  if (asOfMs > dueMs) return { status: 'overdue', daysRemaining };
  if (daysRemaining <= DUE_SOON_DAYS) return { status: 'due_soon', daysRemaining };
  return { status: 'on_track', daysRemaining };
}

/**
 * Compute the Bayh-Dole reporting deadlines + their status as of `asOf`. Non-federal
 * inventions are not subject (every deadline `not_applicable`). Pure. (37 CFR 401.14.)
 */
export function evaluateBayhDoleCompliance(input: BayhDoleComplianceInput): BayhDoleComplianceResult {
  const asOfMs = parse(input.asOf) ?? Date.parse('1970-01-01');
  const discMs = parse(input.disclosureDate);
  const elecMs = parse(input.electionDate);

  if (!input.federalFunding) {
    const na = (obligation: BayhDoleDeadline['obligation']): BayhDoleDeadline => ({ obligation, dueDate: null, status: 'not_applicable', daysRemaining: null, basis: BAYH_DOLE_BASIS });
    return { applicable: false, deadlines: [na('agency_disclosure'), na('election_of_title'), na('patent_filing')], hasOverdue: false, basis: BAYH_DOLE_BASIS };
  }

  const deadlines: BayhDoleDeadline[] = [];

  // Agency disclosure — satisfied once title is elected (disclosure to the agency precedes/accompanies election).
  if (discMs != null) {
    const dueMs = addDays(discMs, AGENCY_DISCLOSURE_DAYS);
    const { status, daysRemaining } = statusFor(dueMs, asOfMs, elecMs != null);
    deadlines.push({ obligation: 'agency_disclosure', dueDate: toIso(dueMs), status, daysRemaining, basis: BAYH_DOLE_BASIS });
  } else {
    deadlines.push({ obligation: 'agency_disclosure', dueDate: null, status: 'on_track', daysRemaining: null, basis: BAYH_DOLE_BASIS });
  }

  // Election of title — 2 years from inventor disclosure.
  if (discMs != null) {
    const dueMs = addDays(discMs, ELECTION_OF_TITLE_DAYS);
    const { status, daysRemaining } = statusFor(dueMs, asOfMs, elecMs != null);
    deadlines.push({ obligation: 'election_of_title', dueDate: toIso(dueMs), status, daysRemaining, basis: BAYH_DOLE_BASIS });
  } else {
    deadlines.push({ obligation: 'election_of_title', dueDate: null, status: 'on_track', daysRemaining: null, basis: BAYH_DOLE_BASIS });
  }

  // Patent filing — 1 year from election (only clocks once title is elected).
  if (elecMs != null) {
    const dueMs = addDays(elecMs, PATENT_FILING_DAYS);
    const { status, daysRemaining } = statusFor(dueMs, asOfMs, input.patentFiled === true);
    deadlines.push({ obligation: 'patent_filing', dueDate: toIso(dueMs), status, daysRemaining, basis: BAYH_DOLE_BASIS });
  } else {
    deadlines.push({ obligation: 'patent_filing', dueDate: null, status: 'not_applicable', daysRemaining: null, basis: BAYH_DOLE_BASIS });
  }

  return { applicable: true, deadlines, hasOverdue: deadlines.some((d) => d.status === 'overdue'), basis: BAYH_DOLE_BASIS };
}

// ─── Submission readiness ──────────────────────────────────────────────────────

export interface DisclosureReadinessInput {
  title?: string | null;
  inventors?: string | null;
  fundingSource?: string | null;
  federalFunding?: boolean;
  federalAward?: string | null;
  disclosureDate?: string | null;
}

export interface DisclosureFinding { severity: 'critical' | 'warning' | 'info'; message: string }

export interface DisclosureReadinessResult {
  readyToSubmit: boolean;
  blockers: string[];
  findings: DisclosureFinding[];
}

function hasText(s: string | null | undefined): boolean { return typeof s === 'string' && s.trim().length > 0; }

/**
 * Score an invention disclosure's submission readiness. Blockers: missing title,
 * inventors, funding source or disclosure date; a federally-funded disclosure
 * missing its federal award number. Pure — the deterministic gate the service
 * enforces on submit.
 */
export function evaluateDisclosureReadiness(input: DisclosureReadinessInput): DisclosureReadinessResult {
  const blockers: string[] = [];
  const findings: DisclosureFinding[] = [];
  if (!hasText(input.title)) blockers.push('An invention title is required.');
  if (!hasText(input.inventors)) blockers.push('At least one inventor is required.');
  if (!hasText(input.fundingSource)) blockers.push('A funding source is required (or state "none / unfunded").');
  if (!hasText(input.disclosureDate)) blockers.push('A disclosure date is required to start the Bayh-Dole clock.');
  if (input.federalFunding === true && !hasText(input.federalAward)) {
    blockers.push('A federally-funded invention must record its federal award number for agency reporting.');
    findings.push({ severity: 'critical', message: `Federal award number required for Bayh-Dole agency reporting (${BAYH_DOLE_BASIS}).` });
  }
  for (const b of blockers.filter((x) => !/federal award/.test(x))) findings.push({ severity: 'critical', message: b });
  return { readyToSubmit: blockers.length === 0, blockers, findings };
}
