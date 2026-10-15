/**
 * IRB deterministic logic (Capability C2C-06)
 *
 * Pure, DB-free, LLM-free: review-pathway determination, the 45 CFR 46.111
 * approval-criteria completeness gate, and continuing-review/expiration under
 * the revised Common Rule. Grounded in 45 CFR 46, 21 CFR 56, ICH E6; each
 * finding cites its basis.
 *
 * @module server/services/irb/irb-logic
 */

import type { IrbReviewType, IrbRiskLevel } from '../../../shared/schema/irb';
import { addYears } from '../iacuc/iacuc-logic';

/**
 * Recommend the review pathway. Greater-than-minimal risk requires full board
 * review (convened IRB); minimal-risk research that fits an expedited category
 * may be expedited; certain minimal-risk activities are exempt. Pure and
 * conservative — it never downgrades greater-than-minimal risk.
 * (45 CFR 46.108-46.110; 46.104 exempt categories.)
 */
export function recommendReviewType(input: { riskLevel: IrbRiskLevel; fitsExpeditedCategory?: boolean; fitsExemptCategory?: boolean }): {
  reviewType: IrbReviewType;
  rationale: string;
} {
  if (input.riskLevel === 'greater_than_minimal') {
    return { reviewType: 'full_board', rationale: 'Greater-than-minimal risk requires review by the convened IRB (45 CFR 46.108-109).' };
  }
  if (input.fitsExemptCategory) {
    return { reviewType: 'exempt', rationale: 'Minimal-risk activity fitting an exempt category (45 CFR 46.104).' };
  }
  if (input.fitsExpeditedCategory) {
    return { reviewType: 'expedited', rationale: 'Minimal-risk research fitting an expedited category (45 CFR 46.110).' };
  }
  return { reviewType: 'full_board', rationale: 'Minimal risk but no exempt/expedited category asserted; route to full board pending determination.' };
}

export type IrbFindingSeverity = 'critical' | 'major' | 'minor';
/** 'undetermined': no critical finding, but a check that could raise one did not run. */
export type IrbRiskFlag = 'high' | 'medium' | 'low' | 'undetermined';

export interface IrbFinding {
  severity: IrbFindingSeverity;
  message: string;
  basis: string;
}

export interface IrbCompletenessInput {
  riskLevel: IrbRiskLevel;
  reviewType?: IrbReviewType | null;
  /** NULL means NOT RECORDED, not "none involved". */
  involvesVulnerablePopulations: boolean | null;
  vulnerablePopulationProtections?: string | null;
  isSingleIrb: boolean;
  consentWaiverRequested: boolean;
  approvedConsentCount: number;
  siteCount: number;
}

/** The four checks this gate runs. The other 46.111 criteria are the board's to determine. */
const CHECK_CONSENT = 'an informed-consent document on file (draft or approved) or a waiver requested (45 CFR 46.116/46.117)';
const CHECK_VULNERABLE = 'additional safeguards documented where vulnerable populations are involved (45 CFR 46.111(b))';
const CHECK_SIRB = 'a single IRB of record for a multi-site study (45 CFR 46.114)';
const CHECK_REVIEW_TYPE = 'a review type permitted for the risk level (45 CFR 46.108-110)';

/**
 * Deterministic completeness gate over four checks: informed consent is on file
 * unless a waiver is requested; additional protections are documented when
 * vulnerable populations are involved (46.111(b), Subparts B/C/D); a multi-site
 * study designates a single IRB of record (46.114); greater-than-minimal risk is
 * not given expedited or exempt review. Pure — cited findings, the checks that
 * ran, the ones that could not, and a risk flag.
 *
 * A check whose input is not recorded is reported in `notAssessed` and makes
 * the flag 'undetermined' (2026-10-15: an unanswered vulnerable-populations
 * question used to read as "none involved", and the result as clean).
 */
export function evaluateIrbCompleteness(p: IrbCompletenessInput): {
  findings: IrbFinding[];
  riskLevel: IrbRiskFlag;
  checksRun: string[];
  notAssessed: string[];
} {
  const consent: CheckOutcome = {
    finding: !p.consentWaiverRequested && p.approvedConsentCount === 0
      ? { severity: 'critical', message: 'No informed-consent document is present and no consent waiver is requested.', basis: '45 CFR 46.116 / 46.117' }
      : null,
  };
  const singleIrb: CheckOutcome = {
    finding: p.siteCount > 1 && !p.isSingleIrb
      ? { severity: 'major', message: 'Multi-site study does not designate a single IRB of record (sIRB).', basis: 'Revised Common Rule 45 CFR 46.114' }
      : null,
  };
  const { findings, checksRun, notAssessed } = tally([
    [CHECK_CONSENT, consent],
    [CHECK_VULNERABLE, vulnerableSafeguards(p)],
    [CHECK_SIRB, singleIrb],
    [CHECK_REVIEW_TYPE, reviewTypeForRisk(p)],
  ]);

  const riskLevel: IrbRiskFlag = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : notAssessed.length > 0
      ? 'undetermined'
      : findings.some((f) => f.severity === 'major')
        ? 'medium'
        : 'low';
  return { findings, riskLevel, checksRun, notAssessed };
}

/** A check either ran (with or without a finding) or could not run, and says why. */
type CheckOutcome = { finding: IrbFinding | null } | { notAssessed: string };

/** 46.111(b). Decided when the answer is recorded, or when safeguards are documented whatever it is. */
function vulnerableSafeguards(p: IrbCompletenessInput): CheckOutcome {
  const protections = !!p.vulnerablePopulationProtections && p.vulnerablePopulationProtections.trim().length > 0;
  if (p.involvesVulnerablePopulations == null && !protections) {
    return { notAssessed: 'whether vulnerable populations are involved is not recorded' };
  }
  return {
    finding: p.involvesVulnerablePopulations === true && !protections
      ? { severity: 'critical', message: 'Vulnerable populations are involved but no additional safeguards are documented.', basis: '45 CFR 46.111(b); Subparts B/C/D' }
      : null,
  };
}

/** 46.108-110. Greater-than-minimal risk needs the convened board; not decidable before a review type is recorded. */
function reviewTypeForRisk(p: IrbCompletenessInput): CheckOutcome {
  if (p.riskLevel !== 'greater_than_minimal') return { finding: null };
  if (!p.reviewType) return { notAssessed: 'no review type is recorded for this greater-than-minimal-risk study' };
  return {
    finding: p.reviewType !== 'full_board'
      ? { severity: 'critical', message: `Greater-than-minimal risk cannot use ${p.reviewType} review; full board is required.`, basis: '45 CFR 46.108-110' }
      : null,
  };
}

function tally(checks: Array<[string, CheckOutcome]>): { findings: IrbFinding[]; checksRun: string[]; notAssessed: string[] } {
  const out = { findings: [] as IrbFinding[], checksRun: [] as string[], notAssessed: [] as string[] };
  for (const [check, outcome] of checks) {
    if ('notAssessed' in outcome) {
      out.notAssessed.push(`${check}: ${outcome.notAssessed}`);
      continue;
    }
    out.checksRun.push(check);
    if (outcome.finding) out.findings.push(outcome.finding);
  }
  return out;
}

/**
 * Continuing-review status. Under the revised Common Rule, full-board approvals
 * require continuing review at intervals not exceeding one year; expedited and
 * exempt determinations generally do NOT require annual continuing review unless
 * the IRB documents a rationale. Pure — `today` injected for testability.
 *
 * @deprecated Two booleans cannot say "unknown": an unrecorded review type or
 * approval date comes back "not required, not expired". Use `lifecycleStatus`
 * (./lifecycle.ts). Kept for protocol-portfolio-logic.ts only (2026-10-15).
 */
export function continuingReviewStatus(reviewType: IrbReviewType | null, approvalDate: string | null, today: string): {
  continuingReviewRequired: boolean;
  expirationDate: string | null;
  expired: boolean;
} {
  if (reviewType !== 'full_board' || !approvalDate) {
    return { continuingReviewRequired: false, expirationDate: null, expired: false };
  }
  const expiration = addYears(approvalDate, 1);
  return { continuingReviewRequired: true, expirationDate: expiration, expired: today >= expiration };
}
