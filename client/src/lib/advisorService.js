// client/src/lib/advisorService.js

/**
 * Concept2Cure Advisor Service
 * Provides resilient data fetching for regulatory advisor features
 * with intelligent fallback mechanisms
 */

// Get advisor readiness data for a specific playbook
export async function getAdvisorReadiness(playbookType = 'Fast IND Playbook') {
  try {
    // Try to get data from the API first
    const response = await fetch(
      `/api/advisor/check-readiness?playbook=${encodeURIComponent(playbookType)}`
    );

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        console.log(`Successfully fetched advisor data for ${playbookType}`);
        return data;
      }
    }

    console.error('Failed to load Advisor Readiness.');
    // API failure: return an honest "unavailable" state. We do NOT
    // fabricate a readiness score / delay / submission date — the prior
    // fallback invented per-playbook numbers (e.g. readinessScore 65,
    // estimatedDelayDays 49, "August 15, 2025") that were presented as a
    // real assessment. The playbook's required-section checklist is template
    // reference data and is safe to surface.
    return getPlaybookUnavailableState(playbookType);
  } catch (error) {
    console.error('Error fetching Advisor data:', error);
    return getPlaybookUnavailableState(playbookType);
  }
}

// Honest "readiness unavailable" state for when the API can't be reached.
// No fabricated metrics — only the static playbook checklist + recommendations.
function getPlaybookUnavailableState(playbookType) {
  return {
    success: false,
    readinessComputed: false,
    readinessScore: null,
    missingSections: getMissingSectionsForPlaybook(playbookType),
    riskLevel: null,
    estimatedDelayDays: null,
    estimatedSubmissionDate: null,
    playbookUsed: playbookType,
    recommendations: getRecommendationsForPlaybook(playbookType),
  };
}

// Get missing sections based on playbook type
function getMissingSectionsForPlaybook(playbookType) {
  const commonMissingItems = ['CMC Stability Study', 'Drug Substance Specs', 'Drug Product Specs'];

  if (playbookType === 'Fast IND Playbook') {
    return [
      ...commonMissingItems,
      'Clinical Study Reports (CSR)',
      'Toxicology Reports',
      'Pharmacology Reports',
      'Investigator Brochure Updates',
    ];
  } else if (playbookType === 'Full NDA Playbook') {
    return [
      ...commonMissingItems,
      'Clinical Study Reports (CSR)',
      'Toxicology Reports',
      'Pharmacology Reports',
      'ADME Studies',
      'Carcinogenicity Reports',
      'Genotoxicity Reports',
      'Quality Overall Summary',
      'Nonclinical Overview',
      'Clinical Summary',
      'Intro Summary',
      'GMP Certificates',
      'Clinical Safety Reports',
    ];
  } else {
    // EMA IMPD Playbook
    return [
      ...commonMissingItems,
      'GMP Certificates',
      'Clinical Overview',
      'Clinical Safety Reports',
    ];
  }
}

// Get recommendations based on playbook type
function getRecommendationsForPlaybook(playbookType) {
  const baseRecommendations = [
    'Upload CMC Stability Data immediately.',
    'Upload Drug Substance Specs immediately.',
    'Upload Drug Product Specs immediately.',
  ];

  if (playbookType === 'Fast IND Playbook') {
    return [
      ...baseRecommendations,
      'Upload Clinical Study Reports (CSR) immediately.',
      'Upload Toxicology Reports immediately.',
    ];
  } else if (playbookType === 'Full NDA Playbook') {
    return [
      ...baseRecommendations,
      'Upload Clinical Study Reports (CSR) immediately.',
      'Upload Toxicology Reports immediately.',
      'Upload Quality Overall Summary immediately.',
      'Upload ADME Studies immediately.',
      'Upload Carcinogenicity Studies immediately.',
    ];
  } else {
    // EMA IMPD Playbook
    return [
      ...baseRecommendations,
      'Upload GMP Certificates immediately.',
      'Upload Clinical Overview immediately.',
    ];
  }
}
