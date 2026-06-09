/**
 * Device shadow-reviewer checklist — the section-anchored questions an FDA or
 * Notified-Body reviewer asks of a device/IVD submission, aggregated per
 * submission type into a single oversight checklist.
 *
 * THE REVERSE WORKFLOW: working backward from a fully-submitted 510(k) / PMA /
 * CER / PER, this is the reviewer's lens — the deterministic questions a reviewer
 * applies to each section, regardless of any risk flags. It COMPLEMENTS the
 * risk-flag-driven reviewer-persona engine (intelligence-engine/reviewer-personas)
 * and the AI shadow-review service: the persona engine fires questions when a risk
 * code is present; this provides the always-on, structure-anchored checklist so a
 * reviewer’s baseline questions are never missed when no flag has fired.
 *
 * CER and PER questions are sourced from their structure models (single source of
 * truth); 510(k) and PMA section questions are defined here.
 *
 * HONESTY: these are the questions a reviewer ASKS — an oversight checklist — not
 * the reviewer’s decision and not a guarantee of clearance/approval.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-shadow-reviewer
 */

import { CER_SECTIONS } from './cer-structure';
import { PER_SECTIONS } from './per-structure';

export type DeviceSubmissionType = '510k' | 'de_novo' | 'pma' | 'cer' | 'per';

export type ReviewerSeverity = 'critical' | 'major' | 'minor';

export interface ReviewerQuestion {
  sectionId: string;
  question: string;
  /** Regulatory basis for the question. */
  basis: string;
  /** How serious it is if this question cannot be answered by the submission. */
  severity: ReviewerSeverity;
}

/** FDA 510(k) reviewer questions, anchored to the substantial-equivalence sections. */
export const K510_REVIEWER_QUESTIONS: ReviewerQuestion[] = [
  { sectionId: 'administrative', question: 'Is the administrative information complete and is the eSTAR fully populated (RTA gate)?', basis: 'FDA RTA Policy; eSTAR (mandatory Oct 2023)', severity: 'critical' },
  { sectionId: 'device_description', question: 'Is the device, its technology, components, and principle of operation clearly described?', basis: '21 CFR 807.87(a)', severity: 'major' },
  { sectionId: 'indications_for_use', question: 'Is the Indications for Use statement precise, and does it stay within the predicate’s intended use (no expansion raising a new question of safety/effectiveness)?', basis: '21 CFR 807.92(a)(5); FDA 510(k) SE guidance', severity: 'critical' },
  { sectionId: 'substantial_equivalence', question: 'Is the primary predicate a legally marketed, validly cleared device with the same intended use?', basis: '21 CFR 807.92(a)(3); FDA SE guidance', severity: 'critical' },
  { sectionId: 'substantial_equivalence', question: 'Is the technological-characteristics comparison complete, and is EVERY difference shown not to raise new safety/effectiveness questions (with data)?', basis: 'FDA 510(k) SE guidance (2014)', severity: 'critical' },
  { sectionId: 'performance_data', question: 'Is performance (bench/clinical) tested per FDA-recognized consensus standards, with pre-specified, worst-case acceptance criteria that are met?', basis: '21 CFR 807.87; recognized consensus standards', severity: 'major' },
  { sectionId: 'biocompatibility', question: 'Is biocompatibility evaluated per ISO 10993 for the correct contact type and duration?', basis: 'ISO 10993-1; FDA biocompatibility guidance', severity: 'major' },
  { sectionId: 'sterilization', question: 'For a sterile device, is the sterilization method validated (SAL 10⁻⁶) with residuals/shelf-life addressed?', basis: 'ISO 11135/11137; FDA guidance', severity: 'major' },
  { sectionId: 'software', question: 'For software, is the documentation provided per the device’s level of concern (IEC 62304), with cybersecurity (threat model, SBOM)?', basis: 'IEC 62304; FDA software & cybersecurity guidance', severity: 'major' },
  { sectionId: 'labeling', question: 'Is the labeling/IFU compliant and internally consistent with the Indications for Use (warnings, contraindications)?', basis: '21 CFR 801', severity: 'major' },
];

/** FDA PMA reviewer questions, anchored to the reasonable-assurance sections. */
export const PMA_REVIEWER_QUESTIONS: ReviewerQuestion[] = [
  { sectionId: 'device_description', question: 'Is the device description and the manufacturing information (design controls per 21 CFR 820, process validation) complete?', basis: '21 CFR 814.20(b)(3); 21 CFR 820', severity: 'critical' },
  { sectionId: 'nonclinical', question: 'Do the nonclinical (bench/animal) studies adequately characterize the device’s performance and safety?', basis: '21 CFR 814.20(b)(6)(i)', severity: 'major' },
  { sectionId: 'clinical', question: 'Is the pivotal clinical study adequately designed (powered sample size, pre-specified endpoints, appropriate control) and are the success criteria met?', basis: '21 CFR 814.20(b)(6)(ii)', severity: 'critical' },
  { sectionId: 'clinical', question: 'Do the clinical data provide a reasonable assurance of safety AND effectiveness for the indication?', basis: '21 CFR 860.7; FDA benefit-risk guidance', severity: 'critical' },
  { sectionId: 'benefit_risk', question: 'Is an explicit benefit-risk determination articulated and supported by the totality of evidence?', basis: 'FDA benefit-risk factors guidance', severity: 'critical' },
  { sectionId: 'ssed', question: 'Is the Summary of Safety and Effectiveness Data (SSED) complete and internally consistent with the body of the PMA?', basis: '21 CFR 814.20(b)', severity: 'major' },
  { sectionId: 'labeling', question: 'Does the labeling provide adequate directions for use and reflect the studied population/conditions?', basis: '21 CFR 801; 21 CFR 814.20(b)(10)', severity: 'major' },
  { sectionId: 'post_approval', question: 'Are post-approval commitments/studies (where applicable) defined?', basis: '21 CFR 814.82', severity: 'minor' },
];

/** De Novo adds classification + special-controls questions on top of the 510(k) bench questions. */
export const DE_NOVO_REVIEWER_QUESTIONS: ReviewerQuestion[] = [
  { sectionId: 'classification', question: 'Is the proposed classification (Class I/II) justified by a complete risk-to-health analysis?', basis: '21 CFR 860 Subpart D', severity: 'critical' },
  { sectionId: 'special_controls', question: 'Are special controls proposed that mitigate each identified risk to health?', basis: 'FD&C Act §513(f)(2)', severity: 'critical' },
  { sectionId: 'performance_data', question: 'Does the performance testing characterize the novel technology (no predicate to bridge from)?', basis: 'FDA De Novo guidance', severity: 'major' },
  { sectionId: 'biocompatibility', question: 'Is biocompatibility evaluated per ISO 10993 for the correct contact type and duration?', basis: 'ISO 10993-1', severity: 'major' },
  { sectionId: 'labeling', question: 'Is the labeling/IFU compliant and consistent with the intended use?', basis: '21 CFR 801', severity: 'major' },
];

function fromSections(
  sections: Array<{ id: string; reviewerQuestions: string[] }>,
  basis: string,
  severity: ReviewerSeverity
): ReviewerQuestion[] {
  return sections.flatMap((s) => s.reviewerQuestions.map((q) => ({ sectionId: s.id, question: q, basis, severity })));
}

/**
 * Build the full reviewer checklist for a device submission type — the questions a
 * reviewer asks of each section, in submission order.
 */
export function buildShadowReviewerChecklist(submissionType: DeviceSubmissionType): {
  submissionType: DeviceSubmissionType;
  reviewer: string;
  questions: ReviewerQuestion[];
  counts: { critical: number; major: number; minor: number; total: number };
} {
  let questions: ReviewerQuestion[];
  let reviewer: string;
  switch (submissionType) {
    case '510k':
      questions = K510_REVIEWER_QUESTIONS;
      reviewer = 'FDA 510(k) reviewer (substantial equivalence; RTA gate)';
      break;
    case 'de_novo':
      questions = DE_NOVO_REVIEWER_QUESTIONS;
      reviewer = 'FDA De Novo reviewer (classification + special controls)';
      break;
    case 'pma':
      questions = PMA_REVIEWER_QUESTIONS;
      reviewer = 'FDA PMA reviewer (reasonable assurance of safety & effectiveness)';
      break;
    case 'cer':
      questions = fromSections(CER_SECTIONS, 'MDR Annex XIV; MEDDEV 2.7/1 Rev 4', 'major');
      reviewer = 'EU Notified Body clinical evaluator (CER)';
      break;
    case 'per':
      questions = fromSections(PER_SECTIONS, 'IVDR Annex XIII', 'major');
      reviewer = 'EU Notified Body performance evaluator (PER)';
      break;
    default:
      questions = [];
      reviewer = 'reviewer';
  }

  const counts = {
    critical: questions.filter((q) => q.severity === 'critical').length,
    major: questions.filter((q) => q.severity === 'major').length,
    minor: questions.filter((q) => q.severity === 'minor').length,
    total: questions.length,
  };
  return { submissionType, reviewer, questions, counts };
}

export function deviceSubmissionTypes(): DeviceSubmissionType[] {
  return ['510k', 'de_novo', 'pma', 'cer', 'per'];
}

export default {
  K510_REVIEWER_QUESTIONS,
  PMA_REVIEWER_QUESTIONS,
  DE_NOVO_REVIEWER_QUESTIONS,
  buildShadowReviewerChecklist,
  deviceSubmissionTypes,
};
