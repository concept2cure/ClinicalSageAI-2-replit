/**
 * Data Importer for ClinicalTrials.gov API V2
 *
 * This module provides functions for transforming data from
 * the ClinicalTrials.gov API v2 format to our system format
 */

// InsertCsrDetails was removed from the canonical schema export — use a
// loose shape until callers migrate to the new csrDetails import.
import { InsertCsrReport } from 'shared/schema';
type InsertCsrDetails = Record<string, any>;

/**
 * Convert a study from the ClinicalTrials.gov API v2 format to our CSR Report format
 */
export function convertV2StudyToCsrReport(study: any): Partial<InsertCsrReport> {
  try {
    // Extract data from the study object
    const protocol = study.protocolSection || {};
    const identification = protocol.identificationModule || {};
    const statusModule = protocol.statusModule || {};
    const sponsorModule = protocol.sponsorCollaboratorsModule || {};
    const conditions = protocol.conditionsModule || {};
    const design = protocol.designModule || {};
    const phase = design?.phases?.[0] || 'Unknown';

    // Get the primary sponsor
    const primarySponsor = sponsorModule?.leadSponsor?.name || 'Unknown';

    // Get the title
    const title = identification?.briefTitle || identification?.officialTitle || 'Untitled Study';

    // Get the condition/indication
    const indication = conditions?.conditions?.[0] || 'Unknown';

    // Get the NCT ID
    const nctrialId = identification?.nctId || null;

    // Get the status
    const status = statusModule?.overallStatus || 'Unknown';

    // Get the study completion date
    const completionDate = statusModule?.completionDate?.date || null;

    // Format the data to match our schema
    const reportData: Partial<InsertCsrReport> = {
      title,
      sponsor: primarySponsor,
      indication,
      phase,
      status,
      date: completionDate,
      fileName: `${nctrialId || 'unknown'}.pdf`,
      fileSize: 0, // We don't have file size from the API
      filePath: null, // We don't have file path from the API
      nctrialId,
      studyId: nctrialId,
      drugName: protocol?.interventionsModule?.interventions?.[0]?.name || null,
      region: null, // We don't have region information from the API
    };

    return reportData;
  } catch (error) {
    console.error('Error converting study to CSR report format:', error);
    return {
      title: 'Error Processing Study',
      sponsor: 'Unknown',
      indication: 'Unknown',
      phase: 'Unknown',
    };
  }
}

/**
 * Convert a study from the ClinicalTrials.gov API v2 format to our CSR Details format
 */
export function convertV2StudyToCsrDetails(
  study: any,
  reportId: number
): Partial<InsertCsrDetails> {
  try {
    // Extract data from the study object
    const protocol = study.protocolSection || {};
    const design = protocol.designModule || {};
    const eligibility = protocol.eligibilityModule || {};
    const description = protocol.descriptionModule || {};
    const arms = protocol.armsInterventionsModule || {};
    const outcomes = protocol.outcomesModule || {};

    // Get the primary objective
    const primaryObjective = description?.briefSummary || null;

    // Get the study design
    const studyDesign = [
      design?.studyType,
      design?.phases?.[0],
      design?.designInfo?.allocation,
      design?.designInfo?.interventionModel,
      design?.designInfo?.primaryPurpose,
      design?.designInfo?.maskingInfo?.masking,
    ]
      .filter(Boolean)
      .join(', ');

    // Get inclusion criteria
    const inclusionCriteria = eligibility?.inclusionCriteria || null;

    // Get exclusion criteria
    const exclusionCriteria = eligibility?.exclusionCriteria || null;

    // Get treatment arms
    const treatmentArms =
      arms?.arms?.map((arm: any) => ({
        name: arm.name || 'Unknown Arm',
        description: arm.description || '',
        type: arm.type || 'Experimental',
        interventions: arm.interventionNames || [],
      })) || [];

    // Get endpoints
    const endpoints = [
      ...(outcomes?.primaryOutcomes || []),
      ...(outcomes?.secondaryOutcomes || []),
    ].map(outcome => ({
      name: outcome.measure || 'Unknown Endpoint',
      description: outcome.description || '',
      timeFrame: outcome.timeFrame || '',
      type: outcome === outcomes?.primaryOutcomes?.[0] ? 'Primary' : 'Secondary',
    }));

    // Get sample size
    const sampleSize = eligibility?.maximumAge ? parseInt(eligibility.maximumAge) || null : null;

    // Get age range
    const ageRange =
      eligibility?.minimumAge && eligibility?.maximumAge
        ? `${eligibility.minimumAge} - ${eligibility.maximumAge}`
        : null;

    // Get gender
    const gender = {
      male: eligibility?.sex?.includes('Male') || false,
      female: eligibility?.sex?.includes('Female') || false,
      unknown: !eligibility?.sex || eligibility?.sex === 'All',
    };

    // Prepare details data
    const detailsData: Partial<InsertCsrDetails> = {
      reportId,
      studyDesign,
      primaryObjective,
      studyDescription: description?.detailedDescription || null,
      inclusionCriteria,
      exclusionCriteria,
      treatmentArms,
      studyDuration: design?.studyDesign || null,
      endpoints,
      results: {},
      safety: {},
      processed: true,
      processingStatus: 'imported_from_api_v2',
      sampleSize,
      ageRange,
      gender,
      statisticalMethods: [],
      adverseEvents: [],
      efficacyResults: {},
    };

    return detailsData;
  } catch (error) {
    console.error('Error converting study to CSR details format:', error);
    return {
      reportId,
      processed: false,
      processingStatus: 'error_during_import',
    };
  }
}

/**
 * Import studies from ClinicalTrials.gov API v2 data
 */
export function processApiV2Data(data: any): {
  studies: Array<{
    report: Partial<InsertCsrReport>;
    details: Partial<InsertCsrDetails>;
  }>;
} {
  if (!data || !data.studies || !Array.isArray(data.studies)) {
    return { studies: [] };
  }

  // Convert each study to our format
  const processedStudies = data.studies.map((study: any) => {
    const report = convertV2StudyToCsrReport(study);
    // Temporary reportId to be replaced during database insertion
    const tempReportId = -1;
    const details = convertV2StudyToCsrDetails(study, tempReportId);

    return { report, details };
  });

  return { studies: processedStudies };
}
