/**
 * Clinical Phases — canonical domain vocabulary.
 *
 * 10 clinical development phases from preclinical through post-marketing,
 * with ICH and CFR regulatory references. Used by protocol design, project
 * metadata, and competitive-intelligence queries.
 *
 * @module shared/constants/domain/clinical-phases
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type ClinicalPhase =
  | 'preclinical'
  | 'phase_1'
  | 'phase_1b'
  | 'phase_1_2'
  | 'phase_2'
  | 'phase_2b'
  | 'phase_2_3'
  | 'phase_3'
  | 'phase_3b'
  | 'phase_4';

export const CLINICAL_PHASES: DomainEntry<ClinicalPhase>[] = [
  {
    value: 'preclinical',
    label: 'Preclinical / Discovery',
    description: 'Non-clinical studies including in vitro, in vivo, and toxicology prior to first human dose.',
    regulatoryRefs: ['ICH M3(R2)'],
  },
  {
    value: 'phase_1',
    label: 'Phase 1 (First-in-Human)',
    description: 'Initial safety, tolerability, pharmacokinetics, and pharmacodynamics in healthy volunteers or patients.',
    regulatoryRefs: ['21 CFR 312.21(a)', 'ICH E8(R1)'],
  },
  {
    value: 'phase_1b',
    label: 'Phase 1b',
    description: 'Dose expansion cohorts to further characterize safety and preliminary activity at recommended doses.',
  },
  {
    value: 'phase_1_2',
    label: 'Phase 1/2 (Seamless)',
    description: 'Seamless dose-finding and preliminary efficacy study combining Phase 1 and Phase 2 objectives.',
    regulatoryRefs: ['ICH E8(R1)'],
  },
  {
    value: 'phase_2',
    label: 'Phase 2 (Proof of Concept)',
    description: 'Exploratory efficacy and dose-response in patients with the target condition.',
    regulatoryRefs: ['21 CFR 312.21(b)'],
  },
  {
    value: 'phase_2b',
    label: 'Phase 2b (Dose-Ranging)',
    description: 'Dose-ranging study to identify optimal dose(s) for confirmatory trials.',
    regulatoryRefs: ['ICH E4'],
  },
  {
    value: 'phase_2_3',
    label: 'Phase 2/3 (Adaptive)',
    description: 'Adaptive seamless design that transitions from learning (Phase 2) to confirming (Phase 3).',
    regulatoryRefs: ['ICH E8(R1)'],
  },
  {
    value: 'phase_3',
    label: 'Phase 3 (Confirmatory)',
    description: 'Pivotal trials providing substantial evidence of efficacy and safety for registration.',
    regulatoryRefs: ['21 CFR 312.21(c)', 'ICH E9(R1)'],
  },
  {
    value: 'phase_3b',
    label: 'Phase 3b (Post-Confirmatory)',
    description: 'Studies conducted after pivotal data are available but before approval, often for label expansion.',
  },
  {
    value: 'phase_4',
    label: 'Phase 4 (Post-Marketing)',
    description: 'Post-approval studies including safety surveillance, real-world evidence, and label commitments.',
    regulatoryRefs: ['21 CFR 312.85'],
  },
];

/** Convert CLINICAL_PHASES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return CLINICAL_PHASES.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
