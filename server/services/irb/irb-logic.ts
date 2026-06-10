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
export type IrbRiskFlag = 'high' | 'medium' | 'low';

export interface IrbFinding {
  severity: IrbFindingSeverity;
  message: string;
  basis: string;
}

export interface IrbCompletenessInput {
  riskLevel: IrbRiskLevel;
  reviewType?: IrbReviewType | null;
  involvesVulnerablePopulations: boolean;
  vulnerablePopulationProtections?: string | null;
  isSingleIrb: boolean;
  consentWaiverRequested: boolean;
  approvedConsentCount: number;
  siteCount: number;
}

/**
 * Deterministic approval-criteria gate (45 CFR 46.111). Informed consent must be
 * documented unless a waiver is requested; additional protections are required
 * when vulnerable populations are involved (46.111(b), Subparts B/C/D); a
 * multi-site study must designate a single IRB of record (revised Common Rule
 * 46.114). Pure — cited findings + risk flag.
 */
export function evaluateIrbCompleteness(p: IrbCompletenessInput): { findings: IrbFinding[]; riskLevel: IrbRiskFlag } {
  const findings: IrbFinding[] = [];

  if (!p.consentWaiverRequested && p.approvedConsentCount === 0) {
    findings.push({
      severity: 'critical',
      message: 'No informed-consent document is present and no consent waiver is requested.',
      basis: '45 CFR 46.116 / 46.117',
    });
  }

  if (p.involvesVulnerablePopulations && (!p.vulnerablePopulationProtections || p.vulnerablePopulationProtections.trim().length === 0)) {
    findings.push({
      severity: 'critical',
      message: 'Vulnerable populations are involved but no additional safeguards are documented.',
      basis: '45 CFR 46.111(b); Subparts B/C/D',
    });
  }

  if (p.siteCount > 1 && !p.isSingleIrb) {
    findings.push({
      severity: 'major',
      message: 'Multi-site study does not designate a single IRB of record (sIRB).',
      basis: 'Revised Common Rule 45 CFR 46.114',
    });
  }

  if (p.riskLevel === 'greater_than_minimal' && p.reviewType && p.reviewType !== 'full_board') {
    findings.push({
      severity: 'critical',
      message: `Greater-than-minimal risk cannot use ${p.reviewType} review; full board is required.`,
      basis: '45 CFR 46.108-110',
    });
  }

  const riskLevel: IrbRiskFlag = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : findings.some((f) => f.severity === 'major')
      ? 'medium'
      : 'low';
  return { findings, riskLevel };
}

/**
 * Continuing-review status. Under the revised Common Rule, full-board approvals
 * require continuing review at intervals not exceeding one year; expedited and
 * exempt determinations generally do NOT require annual continuing review unless
 * the IRB documents a rationale. Pure — `today` injected for testability.
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
