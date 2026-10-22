/**
 * IACUC deterministic logic (Capability C2C-05)
 *
 * Pure, DB-free, LLM-free: the USDA pain-category catalog, review-type
 * determination, the protocol completeness gate (3 Rs + category-E
 * justification), and expiration / continuing-review derivation. Grounded in
 * PHS Policy, the Animal Welfare Act, and OLAW; each finding cites its basis.
 *
 * @module server/services/iacuc/iacuc-logic
 */

import type { UsdaPainCategory, IacucReviewType } from '../../../shared/schema/iacuc';

/** USDA pain/distress categories with definitions and citations. */
export const USDA_PAIN_CATEGORIES: Array<{
  category: UsdaPainCategory;
  label: string;
  definition: string;
  citation: string;
  requiresAnalgesia: boolean;
  requiresScientificJustification: boolean;
}> = [
  { category: 'B', label: 'Breeding / holding', definition: 'Animals bred, conditioned, or held but not yet used in procedures.', citation: 'USDA APHIS Annual Report categories', requiresAnalgesia: false, requiresScientificJustification: false },
  { category: 'C', label: 'No pain/distress', definition: 'Procedures involving no more than momentary or slight pain/distress, no anesthesia needed.', citation: 'USDA APHIS Annual Report categories', requiresAnalgesia: false, requiresScientificJustification: false },
  { category: 'D', label: 'Pain/distress relieved', definition: 'Pain/distress relieved by appropriate anesthesia, analgesia, or tranquilization.', citation: 'AWA 9 CFR 2.31(e); USDA category D', requiresAnalgesia: true, requiresScientificJustification: false },
  { category: 'E', label: 'Unrelieved pain/distress', definition: 'Pain/distress for which relieving drugs would adversely affect the procedures; requires scientific justification.', citation: 'AWA 9 CFR 2.31(e)(4); USDA category E', requiresAnalgesia: false, requiresScientificJustification: true },
];

const CAT = new Map(USDA_PAIN_CATEGORIES.map((c) => [c.category, c]));

/**
 * Recommend the review pathway. Designated Member Review (DMR) is permissible
 * for most protocols, but ANY committee member may call for Full Committee
 * Review (FCR); category E (unrelieved pain) is conservatively routed to FCR.
 * Pure. (PHS Policy IV.C.2; OLAW guidance on DMR vs FCR.)
 */
export function recommendReviewType(painCategory: UsdaPainCategory): { reviewType: IacucReviewType; rationale: string } {
  if (painCategory === 'E') {
    return { reviewType: 'full_committee_review', rationale: 'Category E (unrelieved pain/distress) is routed to full committee review.' };
  }
  return {
    reviewType: 'designated_member_review',
    rationale: 'Eligible for designated member review; any IACUC member may call for full committee review (PHS Policy IV.C.2).',
  };
}

export type IacucFindingSeverity = 'critical' | 'major' | 'minor';
export type IacucRiskLevel = 'high' | 'medium' | 'low';

export interface IacucFinding {
  severity: IacucFindingSeverity;
  message: string;
  basis: string;
}

export interface ProtocolCompletenessInput {
  painCategory: UsdaPainCategory;
  threeRsReplacement?: string | null;
  threeRsReduction?: string | null;
  threeRsRefinement?: string | null;
  painJustification?: string | null;
  speciesCount: number; // number of distinct cohorts/species
  plannedAnimalTotal: number;
}

/** What the gate checks: the presence of text and counts, not their adequacy. */
const IACUC_GATE_CHECKS = [
  'text recorded for each of Replacement, Reduction and Refinement (AWA 9 CFR 2.31(d))',
  'category D: an analgesia/anesthesia plan; category E: a written scientific justification (9 CFR 2.31(e))',
  'animal cohorts and planned numbers recorded (PHS Policy IV.D.1)',
];

/**
 * Deterministic completeness gate. The 3 Rs (Replacement, Reduction, Refinement)
 * must be addressed; category D/E require a refinement (analgesia) plan; category
 * E additionally requires scientific justification for withholding relief; an
 * animal-number justification (reduction) is expected. Pure — cited findings, the
 * checks run, risk.
 */
export function evaluateProtocolCompleteness(p: ProtocolCompletenessInput): { findings: IacucFinding[]; riskLevel: IacucRiskLevel; checksRun: string[] } {
  const findings: IacucFinding[] = [];
  const has = (s?: string | null) => !!s && s.trim().length > 0;

  if (!has(p.threeRsReplacement)) findings.push({ severity: 'major', message: 'Replacement (alternatives to animal use) is not addressed.', basis: 'AWA 9 CFR 2.31(d)(1)(ii); PHS Policy (3 Rs)' });
  if (!has(p.threeRsReduction)) findings.push({ severity: 'major', message: 'Reduction (justification of animal numbers) is not addressed.', basis: 'AWA 9 CFR 2.31(d)(1)(ii)' });
  if (!has(p.threeRsRefinement)) findings.push({ severity: 'major', message: 'Refinement (minimizing pain/distress) is not addressed.', basis: 'AWA 9 CFR 2.31(d)(1)' });

  const cat = CAT.get(p.painCategory);
  if (cat?.requiresScientificJustification && !has(p.painJustification)) {
    findings.push({ severity: 'critical', message: 'Category E requires written scientific justification for withholding pain relief.', basis: 'AWA 9 CFR 2.31(e)(4)' });
  }
  if (cat?.requiresAnalgesia && !has(p.threeRsRefinement)) {
    findings.push({ severity: 'critical', message: 'Category D requires an anesthesia/analgesia (refinement) plan.', basis: 'AWA 9 CFR 2.31(e)' });
  }
  if (p.speciesCount === 0 || p.plannedAnimalTotal === 0) {
    findings.push({ severity: 'major', message: 'No animal cohorts / planned numbers are recorded.', basis: 'PHS Policy IV.D.1' });
  }

  const riskLevel: IacucRiskLevel = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : findings.some((f) => f.severity === 'major')
      ? 'medium'
      : 'low';
  return { findings, riskLevel, checksRun: [...IACUC_GATE_CHECKS] };
}

/** Add N years to an ISO date (YYYY-MM-DD). Pure. */
export function addYears(iso: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]) + years;
  return `${y.toString().padStart(4, '0')}-${m[2]}-${m[3]}`;
}

/** True for an ISO calendar-date string (YYYY-MM-DD). */
export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export type ApprovalReviewStatus =
  | {
      undetermined: false; expirationDate: string; expirationSource: 'recorded' | 'computed'; expired: boolean; annualReviewDue: boolean | null;
      /** Why annualReviewDue is null; null when it is determined. */
      annualReviewUndeterminedReason: string | null;
    }
  | { undetermined: true; reason: string; expirationDate: null; expirationSource: 'none'; expired: null; annualReviewDue: null };

/**
 * Continuing-review / expiration status. An approved protocol requires de novo
 * review at least every 3 years (PHS Policy IV.C.5) and annual continuing
 * review. The expiration on record (the committee's) is the fact; approval + 3
 * years is the fallback, labelled 'computed'. Pure — `today` injected for
 * testability. With neither date recorded the status is undetermined, never
 * "not expired, no review due"; annual review needs the approval date.
 *
 * 2026-10-15: the committee's own date was not an input, so a protocol it
 * approved for one year read as current until approval + 3 years.
 */
export function approvalReviewStatus(
  approvalDate: string | null,
  today: string,
  recordedExpiration?: string | null,
  lastAnnualReviewDate?: string | null,
): ApprovalReviewStatus {
  const recorded = isIsoDate(recordedExpiration) ? recordedExpiration : null;
  const expiration = recorded ?? (approvalDate ? addYears(approvalDate, 3) : null);
  if (!expiration) {
    return {
      undetermined: true,
      reason: 'No approval date or expiration is recorded, so expiry and annual review cannot be determined.',
      expirationDate: null, expirationSource: 'none', expired: null, annualReviewDue: null,
    };
  }
  const expired = today >= expiration;
  const annual = annualReviewDue(approvalDate, today, expired, isIsoDate(lastAnnualReviewDate) ? lastAnnualReviewDate : null);
  return {
    undetermined: false,
    expirationDate: expiration,
    expirationSource: recorded ? 'recorded' : 'computed',
    expired,
    annualReviewDue: annual.due,
    annualReviewUndeterminedReason: annual.reason,
  };
}

/**
 * Annual continuing review: due a year after approval, then a year after the
 * last recorded annual review. 2026-10-15: it was `today >= approval + 1 year`,
 * so from the second year on it read due forever, however recently the review
 * was held. Past the first year with no annual review recorded it is not
 * determined.
 */
function annualReviewDue(
  approvalDate: string | null,
  today: string,
  expired: boolean,
  lastAnnualReviewDate: string | null,
): { due: boolean | null; reason: string | null } {
  if (expired) return { due: false, reason: null };
  if (!approvalDate) return { due: null, reason: 'No approval date is recorded, so whether annual review is due cannot be determined.' };
  if (today < addYears(approvalDate, 1)) return { due: false, reason: null };
  if (lastAnnualReviewDate) return { due: today >= addYears(lastAnnualReviewDate, 1), reason: null };
  return { due: null, reason: 'More than a year has passed since approval and no annual review is recorded, so whether one is due cannot be determined.' };
}
