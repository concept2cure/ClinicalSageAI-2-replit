/**
 * Endpoint Types — canonical domain vocabulary.
 *
 * 18 clinical-endpoint entries organized by category: clinical outcome
 * endpoints, surrogate endpoints, patient-reported outcomes, and
 * biomarker endpoints. Used by the intelligence question engine,
 * protocol design, and statistical analysis planning.
 *
 * @module shared/constants/domain/endpoint-types
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type EndpointType =
  | 'overall_survival'
  | 'event_free_survival'
  | 'major_adverse_events'
  | 'all_cause_mortality'
  | 'clinical_response'
  | 'objective_response_rate'
  | 'progression_free_survival'
  | 'disease_free_survival'
  | 'hba1c'
  | 'ldl_cholesterol'
  | 'fev1'
  | 'viral_load'
  | 'pro_questionnaire'
  | 'clinro'
  | 'observer_ro'
  | 'biomarker_response'
  | 'pharmacodynamic'
  | 'other';

export const ENDPOINT_TYPES: DomainEntry<EndpointType>[] = [
  // ── Clinical outcome endpoints ──────────────────────────────────────
  {
    value: 'overall_survival',
    label: 'Overall Survival (OS)',
    description: 'Time from randomization to death from any cause.',
    regulatoryRefs: ['ICH E9', 'FDA Oncology Endpoints Guidance'],
  },
  {
    value: 'event_free_survival',
    label: 'Event-Free Survival (EFS)',
    description: 'Time from randomization to disease progression, relapse, or death.',
  },
  {
    value: 'major_adverse_events',
    label: 'Major Adverse Cardiovascular Events (MACE)',
    description: 'Composite of cardiovascular death, MI, and stroke used in cardiology trials.',
  },
  {
    value: 'all_cause_mortality',
    label: 'All-Cause Mortality',
    description: 'Death from any cause, used as a definitive clinical endpoint.',
  },
  {
    value: 'clinical_response',
    label: 'Clinical Response (e.g., ACR20/50/70, EASI)',
    description: 'Disease-specific composite clinical response measures in immunology and dermatology.',
  },

  // ── Surrogate endpoints ─────────────────────────────────────────────
  {
    value: 'objective_response_rate',
    label: 'Objective Response Rate (ORR)',
    description: 'Proportion of patients with complete or partial tumor response per RECIST 1.1.',
    regulatoryRefs: ['RECIST 1.1'],
  },
  {
    value: 'progression_free_survival',
    label: 'Progression-Free Survival (PFS)',
    description: 'Time from randomization to disease progression or death in oncology.',
  },
  {
    value: 'disease_free_survival',
    label: 'Disease-Free Survival (DFS)',
    description: 'Time from complete response to disease recurrence in adjuvant oncology settings.',
  },
  {
    value: 'hba1c',
    label: 'HbA1c Change from Baseline',
    description: 'Glycated hemoglobin change as a surrogate for glycemic control in diabetes.',
  },
  {
    value: 'ldl_cholesterol',
    label: 'LDL-C Change',
    description: 'Low-density lipoprotein cholesterol change in cardiovascular trials.',
  },
  {
    value: 'fev1',
    label: 'FEV1 Change',
    description: 'Forced expiratory volume in 1 second change in respiratory trials.',
  },
  {
    value: 'viral_load',
    label: 'Viral Load Reduction',
    description: 'Quantitative reduction in viral RNA/DNA copies in infectious disease trials.',
  },

  // ── Patient-reported outcomes ───────────────────────────────────────
  {
    value: 'pro_questionnaire',
    label: 'Patient-Reported Outcome (PRO)',
    description: 'Validated questionnaire completed directly by the patient without interpretation.',
    regulatoryRefs: ['FDA PRO Guidance 2009'],
  },
  {
    value: 'clinro',
    label: 'Clinician-Reported Outcome (ClinRO)',
    description: 'Outcome assessed by a trained clinician using a structured instrument.',
  },
  {
    value: 'observer_ro',
    label: 'Observer-Reported Outcome (ObsRO)',
    description: 'Outcome reported by an observer (e.g., parent/caregiver) who does not interpret.',
  },

  // ── Biomarker endpoints ─────────────────────────────────────────────
  {
    value: 'biomarker_response',
    label: 'Biomarker Response',
    description: 'Change in a qualified or exploratory biomarker as an efficacy signal.',
    regulatoryRefs: ['FDA Biomarker Qualification'],
  },
  {
    value: 'pharmacodynamic',
    label: 'Pharmacodynamic Endpoint',
    description: 'Measurement of a drug\'s biological effect on a target or pathway.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Endpoint type not covered by the predefined categories.',
  },
];

/** Convert ENDPOINT_TYPES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return ENDPOINT_TYPES.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
