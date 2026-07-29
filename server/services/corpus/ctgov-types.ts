/**
 * ClinicalTrials.gov API v2 study shape (the subset we consume).
 *
 * This mirrors the nested `protocolSection` structure returned by
 * https://clinicaltrials.gov/api/v2/studies. It is intentionally a partial
 * type — every field is optional because the public API omits fields freely —
 * so consuming code must treat everything as possibly-absent.
 *
 * Kept in one place so the connector, the normalizer, and the ingestion
 * pipeline all agree on field paths.
 */

export interface CtgovStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
      organization?: { fullName?: string };
    };
    statusModule?: {
      overallStatus?: string;
      whyStopped?: string;
      startDateStruct?: { date?: string };
      completionDateStruct?: { date?: string };
      primaryCompletionDateStruct?: { date?: string };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string; class?: string };
    };
    descriptionModule?: {
      briefSummary?: string;
      detailedDescription?: string;
    };
    designModule?: {
      phases?: string[];
      studyType?: string;
      enrollmentInfo?: { count?: number; type?: string };
      designInfo?: {
        allocation?: string;
        interventionModel?: string;
        primaryPurpose?: string;
        maskingInfo?: { masking?: string };
      };
    };
    conditionsModule?: {
      conditions?: string[];
      keywords?: string[];
    };
    armsInterventionsModule?: {
      armGroups?: Array<{ label?: string; type?: string; description?: string }>;
      interventions?: Array<{ type?: string; name?: string; description?: string }>;
    };
    outcomesModule?: {
      primaryOutcomes?: Array<{ measure?: string; timeFrame?: string; description?: string }>;
      secondaryOutcomes?: Array<{ measure?: string; timeFrame?: string; description?: string }>;
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
      healthyVolunteers?: boolean;
    };
  };
}

export interface CtgovStudiesResponse {
  studies?: CtgovStudy[];
  nextPageToken?: string;
  totalCount?: number;
}
