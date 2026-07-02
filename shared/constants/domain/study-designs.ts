/**
 * Study Designs — canonical domain vocabulary.
 *
 * 14 clinical trial design types with ICH and FDA guidance references.
 * Used in protocol design, competitive intelligence, and trial-landscape
 * analysis.
 *
 * @module shared/constants/domain/study-designs
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type StudyDesign =
  | 'parallel_group'
  | 'crossover'
  | 'factorial'
  | 'adaptive'
  | 'basket'
  | 'umbrella'
  | 'platform'
  | 'single_arm'
  | 'dose_escalation'
  | 'enrichment'
  | 'non_inferiority'
  | 'equivalence'
  | 'real_world'
  | 'other';

export const STUDY_DESIGNS: DomainEntry<StudyDesign>[] = [
  {
    value: 'parallel_group',
    label: 'Parallel Group',
    description: 'Subjects randomized to one of two or more treatment arms for the study duration.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'crossover',
    label: 'Crossover',
    description: 'Each subject receives multiple treatments in a sequential order with washout periods.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'factorial',
    label: 'Factorial',
    description: 'Two or more interventions evaluated simultaneously in all possible combinations.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'adaptive',
    label: 'Adaptive Design',
    description: 'Pre-planned modifications to the trial based on accumulating data from interim analyses.',
    regulatoryRefs: ['FDA Guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019)'],
  },
  {
    value: 'basket',
    label: 'Basket Trial',
    description: 'Single targeted therapy tested across multiple tumor types sharing a common molecular alteration.',
  },
  {
    value: 'umbrella',
    label: 'Umbrella Trial',
    description: 'Single disease studied with multiple targeted therapies assigned by biomarker status.',
  },
  {
    value: 'platform',
    label: 'Platform Trial',
    description: 'Perpetual multi-arm trial with a shared control arm where treatments can enter and exit.',
    regulatoryRefs: ['FDA Guidance: Master Protocols for Drug and Biological Product Development (2023)'],
  },
  {
    value: 'single_arm',
    label: 'Single Arm',
    description: 'All subjects receive the investigational treatment; often used with Accelerated Approval pathway.',
  },
  {
    value: 'dose_escalation',
    label: 'Dose Escalation (3+3, CRM, BOIN)',
    description: 'Phase 1 design to identify the maximum tolerated dose or recommended Phase 2 dose.',
  },
  {
    value: 'enrichment',
    label: 'Enrichment Design',
    description: 'Patient population prospectively restricted to those most likely to benefit based on a biomarker.',
    regulatoryRefs: ['FDA Guidance: Enrichment Strategies for Clinical Trials (2019)'],
  },
  {
    value: 'non_inferiority',
    label: 'Non-Inferiority',
    description: 'Demonstrates that the new treatment is not clinically worse than an active comparator by more than a pre-specified margin.',
    regulatoryRefs: ['ICH E10'],
  },
  {
    value: 'equivalence',
    label: 'Equivalence / Bioequivalence',
    description: 'Demonstrates that two products have equivalent bioavailability or clinical effect.',
    regulatoryRefs: ['21 CFR 320'],
  },
  {
    value: 'real_world',
    label: 'Real-World Evidence Study',
    description: 'Study leveraging real-world data from EHR, claims, registries, or pragmatic trial designs.',
    regulatoryRefs: ['21 CFR 312.2', 'FDA Framework for Real-World Evidence'],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Study design not covered by the predefined categories.',
  },
];

/** Convert STUDY_DESIGNS to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return STUDY_DESIGNS.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
