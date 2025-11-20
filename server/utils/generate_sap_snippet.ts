/**
 * Statistical Analysis Plan (SAP) Generator
 *
 * This module generates SAP text snippets based on protocol data.
 * The generated SAP text covers key statistical aspects including:
 * - Primary analysis methods
 * - Sample size justification
 * - Handling missing data
 * - Interim analyses (if applicable)
 * - Subgroup analyses
 */

export interface ProtocolData {
  indication: string;
  phase: string;
  sample_size: number;
  duration_weeks: number;
  dropout_rate: number;
  endpoint_primary: string;
  endpoint_secondary?: string[];
  arms?: number;
  blinding?: string;
  randomization?: string;
  population?: string;
  inclusion_criteria?: string[];
  exclusion_criteria?: string[];
}

/**
 * Generate a Statistical Analysis Plan snippet based on protocol data
 */
export function generateSAP(protocol: ProtocolData): string {
  // Extract key parameters
  const {
    indication,
    phase,
    sample_size,
    duration_weeks,
    dropout_rate,
    endpoint_primary,
    endpoint_secondary = [],
    arms = 2,
    blinding = 'double-blind',
    randomization = '1:1',
    population = 'adult patients',
  } = protocol;

  // Determine analysis method based on endpoint type and phase
  const primaryAnalysisMethod = determineAnalysisMethod(endpoint_primary, phase);

  // Calculate adjusted sample size accounting for dropout
  const adjustedSampleSize = Math.ceil(sample_size / (1 - dropout_rate));

  // Generate SAP sections
  const sections = [
    generateStudyDesignSection(phase, arms, blinding, randomization),
    generateSampleSizeSection(sample_size, adjustedSampleSize, dropout_rate),
    generateAnalysisPopulationsSection(population, indication),
    generatePrimaryAnalysisSection(endpoint_primary, primaryAnalysisMethod),
    generateSecondaryAnalysesSection(endpoint_secondary),
    generateMissingDataSection(dropout_rate),
    generateInterimAnalysisSection(phase, duration_weeks),
    generateSubgroupAnalysesSection(indication),
  ];

  return sections.join('\n\n');
}

/**
 * Determine appropriate analysis method based on endpoint and phase
 */
function determineAnalysisMethod(endpoint: string, phase: string): string {
  // Check for continuous endpoints
  const continuousPatterns = [
    /score/i,
    /level/i,
    /concentration/i,
    /change from baseline/i,
    /reduction/i,
    /improvement/i,
    /increase/i,
    /decrease/i,
    /measurement/i,
    /value/i,
    /scale/i,
    /index/i,
  ];

  // Check for time-to-event endpoints
  const survivalPatterns = [
    /survival/i,
    /time to/i,
    /progression/i,
    /recurrence/i,
    /relapse/i,
    /free/i,
    /event/i,
    /death/i,
  ];

  // Check for binary endpoints
  const binaryPatterns = [
    /response/i,
    /responder/i,
    /remission/i,
    /cure/i,
    /success/i,
    /failure/i,
    /resolution/i,
    /achievement/i,
  ];

  // Determine endpoint type
  let endpointType = 'unknown';

  if (continuousPatterns.some(pattern => pattern.test(endpoint))) {
    endpointType = 'continuous';
  } else if (survivalPatterns.some(pattern => pattern.test(endpoint))) {
    endpointType = 'survival';
  } else if (binaryPatterns.some(pattern => pattern.test(endpoint))) {
    endpointType = 'binary';
  }

  // Return appropriate analysis method
  switch (endpointType) {
    case 'continuous':
      return phase === '1'
        ? 'Descriptive statistics and ANCOVA adjusting for baseline'
        : 'Mixed model for repeated measures (MMRM) with baseline as covariate';

    case 'survival':
      return phase === '1'
        ? 'Kaplan-Meier estimates and descriptive statistics'
        : 'Cox proportional hazards model stratified by randomization factors';

    case 'binary':
      return phase === '1'
        ? "Frequency tables and Fisher's exact test"
        : 'Logistic regression adjusting for stratification factors';

    default:
      return 'Statistical methods appropriate for the endpoint type';
  }
}

/**
 * Generate Study Design section
 */
function generateStudyDesignSection(
  phase: string,
  arms: number,
  blinding: string,
  randomization: string
): string {
  return `1. STUDY DESIGN\nThis is a Phase ${phase}, ${arms}-arm, ${blinding}, randomized (${randomization}) clinical trial. The statistical analyses will align with this design and follow the principles outlined in ICH E9.`;
}

/**
 * Generate Sample Size section with justification
 */
function generateSampleSizeSection(
  sampleSize: number,
  adjustedSampleSize: number,
  dropoutRate: number
): string {
  const dropoutPercentage = (dropoutRate * 100).toFixed(1);

  return `2. SAMPLE SIZE JUSTIFICATION\nThe planned enrollment is ${sampleSize} participants. Accounting for an anticipated dropout rate of ${dropoutPercentage}%, the target adjusted sample size is ${adjustedSampleSize} participants. This sample size provides approximately 80% power to detect the primary endpoint at a two-sided significance level of 0.05.`;
}

/**
 * Generate Analysis Populations section
 */
function generateAnalysisPopulationsSection(population: string, indication: string): string {
  return `3. ANALYSIS POPULATIONS\n- Intent-to-Treat (ITT) Population: All randomized ${population} with ${indication}.\n- Per-Protocol (PP) Population: All ITT participants who complete the study without major protocol deviations.\n- Safety Population: All randomized participants who receive at least one dose of study treatment.`;
}

/**
 * Generate Primary Analysis section
 */
function generatePrimaryAnalysisSection(primaryEndpoint: string, analysisMethod: string): string {
  return `4. PRIMARY ANALYSIS\nThe primary endpoint is ${primaryEndpoint}. The primary analysis will use ${analysisMethod}. Statistical significance will be determined at the two-sided alpha level of 0.05.`;
}

/**
 * Generate Secondary Analyses section
 */
function generateSecondaryAnalysesSection(secondaryEndpoints: string[]): string {
  if (!secondaryEndpoints.length) {
    return `5. SECONDARY ANALYSES\nSecondary endpoints will be analyzed using appropriate statistical methods based on the type of endpoint. No formal adjustment for multiplicity will be applied to secondary endpoints, and results will be considered supportive.`;
  }

  const endpointList = secondaryEndpoints
    .map((endpoint, index) => `   ${index + 1}. ${endpoint}`)
    .join('\n');

  return `5. SECONDARY ANALYSES\nThe following secondary endpoints will be analyzed:\n${endpointList}\n\nAnalyses will use appropriate statistical methods based on the type of each endpoint. No formal adjustment for multiplicity will be applied to secondary endpoints, and results will be considered supportive.`;
}

/**
 * Generate Missing Data handling section
 */
function generateMissingDataSection(dropoutRate: number): string {
  // Determine missing data approach based on dropout rate
  let approach = '';

  if (dropoutRate < 0.1) {
    approach =
      'The primary analysis will use all available data without imputation. Sensitivity analyses will assess the impact of missing data using multiple imputation.';
  } else if (dropoutRate < 0.2) {
    approach =
      'Missing data will be handled using multiple imputation. Sensitivity analyses will include complete case analysis and pattern mixture models.';
  } else {
    approach =
      'Due to the anticipated high dropout rate, a careful strategy for missing data is necessary. The primary approach will use multiple imputation with sensitivity analyses using pattern mixture models and tipping point analyses.';
  }

  return `6. HANDLING OF MISSING DATA\n${approach}`;
}

/**
 * Generate Interim Analysis section
 */
function generateInterimAnalysisSection(phase: string, durationWeeks: number): string {
  // Determine if interim analysis is appropriate
  let interimAnalysis = '';

  if (phase === '3' && durationWeeks > 26) {
    interimAnalysis =
      "An interim analysis for efficacy and futility will be conducted when approximately 50% of participants have completed the primary endpoint assessment. The O'Brien-Fleming spending function will be used to control the overall type I error rate.";
  } else if (phase === '2' && durationWeeks > 16) {
    interimAnalysis =
      'An interim analysis for futility only will be conducted when approximately 50% of participants have completed the primary endpoint assessment. No efficacy claims will be made based on this interim analysis.';
  } else {
    interimAnalysis = 'No interim analyses are planned for this study.';
  }

  return `7. INTERIM ANALYSES\n${interimAnalysis}`;
}

/**
 * Generate Subgroup Analyses section
 */
function generateSubgroupAnalysesSection(indication: string): string {
  return `8. SUBGROUP ANALYSES\nExploratory subgroup analyses for the primary endpoint will be performed for the following factors:\n- Age groups (< 65 vs. ≥ 65 years)\n- Sex (male vs. female)\n- Disease severity at baseline\n- Geographic region\n\nThese analyses will be considered exploratory and will be used to assess the consistency of the treatment effect across subgroups of interest in ${indication}.`;
}
