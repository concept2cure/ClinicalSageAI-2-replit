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

/**
 * Deterministic completeness gate. The 3 Rs (Replacement, Reduction, Refinement)
 * must be addressed; category D/E require a refinement (analgesia) plan; category
 * E additionally requires scientific justification for withholding relief; an
 * animal-number justification (reduction) is expected. Pure — cited findings + risk.
 */
export function evaluateProtocolCompleteness(p: ProtocolCompletenessInput): { findings: IacucFinding[]; riskLevel: IacucRiskLevel } {
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
  return { findings, riskLevel };
}

/** Add N years to an ISO date (YYYY-MM-DD). Pure. */
export function addYears(iso: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]) + years;
  return `${y.toString().padStart(4, '0')}-${m[2]}-${m[3]}`;
}

/**
 * Continuing-review / expiration status. An approved protocol requires de novo
 * review every 3 years (PHS Policy IV.C.5) and annual continuing review. Pure —
 * `today` injected for testability.
 */
export function reviewStatus(approvalDate: string | null, today: string): {
  expirationDate: string | null;
  expired: boolean;
  annualReviewDue: boolean;
} {
  if (!approvalDate) return { expirationDate: null, expired: false, annualReviewDue: false };
  const expiration = addYears(approvalDate, 3);
  const annual = addYears(approvalDate, 1);
  return {
    expirationDate: expiration,
    expired: today >= expiration,
    annualReviewDue: today >= annual && today < expiration,
  };
}
