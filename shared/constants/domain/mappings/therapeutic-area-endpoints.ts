/**
 * Therapeutic area → common clinical endpoints mapping.
 * Used by the intelligence questioning engine to auto-suggest endpoints.
 * @module shared/constants/domain/mappings/therapeutic-area-endpoints
 */

import type { TherapeuticArea } from '../therapeutic-areas.js';
import type { EndpointType } from '../endpoint-types.js';

export interface EndpointRecommendation {
  endpoint: EndpointType;
  /** Whether this is a typical primary endpoint for the area. */
  typicallyPrimary: boolean;
  /** Regulatory note on using this endpoint. */
  regulatoryNote?: string;
}

export const THERAPEUTIC_AREA_ENDPOINTS: Partial<Record<TherapeuticArea, EndpointRecommendation[]>> = {
  oncology: [
    { endpoint: 'overall_survival', typicallyPrimary: true, regulatoryNote: 'Gold standard for regular approval' },
    { endpoint: 'progression_free_survival', typicallyPrimary: true, regulatoryNote: 'Acceptable for regular approval in some settings (FDA)' },
    { endpoint: 'objective_response_rate', typicallyPrimary: false, regulatoryNote: 'Supports accelerated approval (21 CFR 314.510)' },
    { endpoint: 'disease_free_survival', typicallyPrimary: true, regulatoryNote: 'Adjuvant setting primary endpoint' },
    { endpoint: 'event_free_survival', typicallyPrimary: true, regulatoryNote: 'Hematologic malignancies' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false },
    { endpoint: 'biomarker_response', typicallyPrimary: false, regulatoryNote: 'Companion Dx may be required' },
  ],
  cardiology: [
    { endpoint: 'major_adverse_events', typicallyPrimary: true, regulatoryNote: 'MACE composite per FDA CV Guidance' },
    { endpoint: 'all_cause_mortality', typicallyPrimary: true },
    { endpoint: 'ldl_cholesterol', typicallyPrimary: true, regulatoryNote: 'Surrogate for lipid-lowering agents' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false, regulatoryNote: 'Heart failure: KCCQ' },
  ],
  neurology: [
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'Disease-specific scales: EDSS (MS), UPDRS (PD), ADAS-Cog (AD)' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false },
    { endpoint: 'biomarker_response', typicallyPrimary: false, regulatoryNote: 'Amyloid PET, NfL — emerging surrogates' },
  ],
  metabolic: [
    { endpoint: 'hba1c', typicallyPrimary: true, regulatoryNote: 'FDA-accepted surrogate for T2DM' },
    { endpoint: 'clinical_response', typicallyPrimary: false },
    { endpoint: 'major_adverse_events', typicallyPrimary: false, regulatoryNote: 'CVOT required for T2DM per FDA 2008 guidance' },
  ],
  endocrinology: [
    { endpoint: 'hba1c', typicallyPrimary: true, regulatoryNote: 'Primary for diabetes' },
    { endpoint: 'clinical_response', typicallyPrimary: true },
    { endpoint: 'biomarker_response', typicallyPrimary: false },
  ],
  respiratory: [
    { endpoint: 'fev1', typicallyPrimary: true, regulatoryNote: 'FDA-accepted for asthma/COPD' },
    { endpoint: 'clinical_response', typicallyPrimary: false, regulatoryNote: 'Exacerbation rate as co-primary' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false, regulatoryNote: 'SGRQ, ACQ' },
  ],
  infectious_disease: [
    { endpoint: 'viral_load', typicallyPrimary: true, regulatoryNote: 'SVR for HCV, viral suppression for HIV' },
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'Clinical cure rate for antibacterials' },
    { endpoint: 'all_cause_mortality', typicallyPrimary: false },
  ],
  immunology: [
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'ACR20/50/70 (RA), PASI75/90 (psoriasis), EASI-75 (AD)' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false, regulatoryNote: 'HAQ-DI, DLQI' },
    { endpoint: 'biomarker_response', typicallyPrimary: false },
  ],
  rare_disease: [
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'Disease-specific; FDA may accept single-arm with historical control' },
    { endpoint: 'biomarker_response', typicallyPrimary: true, regulatoryNote: 'Surrogate may support accelerated approval for serious conditions' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false },
  ],
  ophthalmology: [
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'BCVA (ETDRS letters), central subfield thickness' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false, regulatoryNote: 'NEI VFQ-25' },
  ],
  hematology: [
    { endpoint: 'overall_survival', typicallyPrimary: true },
    { endpoint: 'event_free_survival', typicallyPrimary: true },
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'Complete remission rate, transfusion independence' },
  ],
  gastroenterology: [
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'Clinical remission (CDAI for Crohn\'s, Mayo score for UC)' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false },
    { endpoint: 'biomarker_response', typicallyPrimary: false, regulatoryNote: 'Endoscopic improvement as co-primary' },
  ],
  psychiatry: [
    { endpoint: 'clinical_response', typicallyPrimary: true, regulatoryNote: 'MADRS (depression), PANSS (schizophrenia), CGI' },
    { endpoint: 'pro_questionnaire', typicallyPrimary: false, regulatoryNote: 'PHQ-9, GAD-7' },
  ],
};

/** Get recommended endpoints for a therapeutic area. */
export function getEndpointsForArea(area: TherapeuticArea): EndpointRecommendation[] {
  return THERAPEUTIC_AREA_ENDPOINTS[area] ?? [];
}

/** Get primary endpoint suggestions for a therapeutic area. */
export function getPrimaryEndpoints(area: TherapeuticArea): EndpointRecommendation[] {
  return getEndpointsForArea(area).filter(e => e.typicallyPrimary);
}
