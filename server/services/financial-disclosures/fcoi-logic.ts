/**
 * FCOI deterministic logic — 21 CFR 54 (Capability C2C-01)
 *
 * Pure, DB-free, LLM-free functions: form-type derivation, the completeness
 * gate the AI review is bounded by, and the content hash bound at certification.
 * The AI assist (gateway) ADVISES; this gate is the deterministic floor.
 *
 * @module server/services/financial-disclosures/fcoi-logic
 */

import { createHash } from 'crypto';
import type { FcoiFormType, FcoiInterestType } from '../../../shared/schema/financial-disclosures';

/** The four 21 CFR 54.2 disclosable-interest categories, with citations. */
export const FCOI_INTEREST_CATEGORIES: Array<{
  type: FcoiInterestType;
  label: string;
  citation: string;
  /** Whether 54.4 expects an arrangements-to-minimize-bias statement. */
  expectsMitigation: boolean;
}> = [
  { type: 'COMPENSATION_BY_OUTCOME', label: 'Compensation affected by study outcome', citation: '21 CFR 54.2(a)', expectsMitigation: true },
  { type: 'EQUITY_INTEREST', label: 'Significant equity interest in the sponsor', citation: '21 CFR 54.2(b)', expectsMitigation: true },
  { type: 'PROPRIETARY_INTEREST', label: 'Proprietary interest (patent/trademark/copyright/licensing)', citation: '21 CFR 54.2(c)', expectsMitigation: true },
  { type: 'SIGNIFICANT_PAYMENTS', label: 'Significant payments of other sorts (> $25,000)', citation: '21 CFR 54.2(f)', expectsMitigation: false },
];

const VALID_INTEREST_TYPES = new Set(FCOI_INTEREST_CATEGORIES.map((c) => c.type));

/**
 * Derive the Module 1 form: 3454 certifies NO disclosable interests; 3455
 * discloses them. Persisted on the record and re-derived on every edit.
 */
export function deriveFormType(hasDisclosableInterests: boolean): FcoiFormType {
  return hasDisclosableInterests ? 'FDA_3455' : 'FDA_3454';
}

export type FcoiFindingSeverity = 'critical' | 'major' | 'minor';
export type FcoiRiskLevel = 'high' | 'medium' | 'low';

export interface FcoiFinding {
  severity: FcoiFindingSeverity;
  message: string;
  basis: string;
}

export interface DisclosureSnapshot {
  hasDisclosableInterests: boolean;
  formType: FcoiFormType;
  disclosurePeriodStart?: string | null;
  disclosurePeriodEnd?: string | null;
  interests: Array<{
    interestType: FcoiInterestType | string;
    description?: string | null;
    monetaryValue?: string | number | null;
    arrangementsToMinimizeBias?: string | null;
  }>;
}

/**
 * Deterministic completeness gate against 21 CFR 54. Pure. The model's
 * fcoi-completeness-review can only ADD context — these structural findings are
 * the floor and bound the certification.
 */
export function validateDisclosureCompleteness(d: DisclosureSnapshot): {
  findings: FcoiFinding[];
  riskLevel: FcoiRiskLevel;
} {
  const findings: FcoiFinding[] = [];

  // form_type must match the disclosable-interests flag.
  if (deriveFormType(d.hasDisclosableInterests) !== d.formType) {
    findings.push({
      severity: 'critical',
      message: `form_type ${d.formType} does not match has_disclosable_interests=${d.hasDisclosableInterests}. 3454 certifies none; 3455 discloses interests.`,
      basis: '21 CFR 54.4(a)',
    });
  }

  // 3455 must carry at least one interest; 3454 must carry none.
  if (d.hasDisclosableInterests && d.interests.length === 0) {
    findings.push({
      severity: 'critical',
      message: 'Disclosable interests indicated (3455) but no interest rows are present.',
      basis: '21 CFR 54.4(a)(3)',
    });
  }
  if (!d.hasDisclosableInterests && d.interests.length > 0) {
    findings.push({
      severity: 'critical',
      message: 'Certification of no interests (3454) but interest rows are present.',
      basis: '21 CFR 54.4(a)(2)',
    });
  }

  // Disclosure period must be present and ordered (study + 1 year per 54.4).
  if (!d.disclosurePeriodStart || !d.disclosurePeriodEnd) {
    findings.push({
      severity: 'major',
      message: 'Disclosure period (start and end) is incomplete; 54.4 covers the study through one year after completion.',
      basis: '21 CFR 54.4',
    });
  } else if (d.disclosurePeriodEnd < d.disclosurePeriodStart) {
    findings.push({ severity: 'major', message: 'Disclosure period end precedes start.', basis: '21 CFR 54.4' });
  }

  // Per-interest checks.
  for (const [i, it] of d.interests.entries()) {
    const ref = `interest #${i + 1}`;
    if (!VALID_INTEREST_TYPES.has(it.interestType as FcoiInterestType)) {
      findings.push({ severity: 'critical', message: `${ref}: unknown interest_type "${it.interestType}".`, basis: '21 CFR 54.2' });
      continue;
    }
    if (!it.description || String(it.description).trim().length === 0) {
      findings.push({ severity: 'major', message: `${ref}: description is required.`, basis: '21 CFR 54.4(a)(3)(ii)' });
    }
    const cat = FCOI_INTEREST_CATEGORIES.find((c) => c.type === it.interestType);
    if (cat?.expectsMitigation && (!it.arrangementsToMinimizeBias || String(it.arrangementsToMinimizeBias).trim().length === 0)) {
      findings.push({
        severity: 'minor',
        message: `${ref} (${cat.label}): no steps taken to minimize potential bias are recorded.`,
        basis: '21 CFR 54.4(a)(3)(ii)',
      });
    }
  }

  const riskLevel: FcoiRiskLevel = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : findings.some((f) => f.severity === 'major')
      ? 'medium'
      : 'low';

  return { findings, riskLevel };
}

/**
 * Deterministic sha256 of the disclosure snapshot, bound at certification so a
 * post-signature edit invalidates the signature. Stable key ordering.
 */
export function computeDisclosureContentHash(d: DisclosureSnapshot): string {
  const canonical = {
    hasDisclosableInterests: d.hasDisclosableInterests,
    formType: d.formType,
    disclosurePeriodStart: d.disclosurePeriodStart ?? null,
    disclosurePeriodEnd: d.disclosurePeriodEnd ?? null,
    interests: [...d.interests]
      .map((it) => ({
        interestType: it.interestType,
        description: it.description ?? null,
        monetaryValue: it.monetaryValue == null ? null : String(it.monetaryValue),
        arrangementsToMinimizeBias: it.arrangementsToMinimizeBias ?? null,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
