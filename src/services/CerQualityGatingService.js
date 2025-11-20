/**
 * CER Quality Gating Service
 *
 * This service handles section-specific gating based on CtQ factor completion status.
 * It enforces risk-based quality controls by preventing section generation when
 * required quality controls are not satisfied.
 */

import { cerApiService } from './CerAPIService';
import axios from 'axios';

/**
 * Maps CER section types to their CtQ factor section names in the QMP
 */
const sectionTypeToQmpMapping = {
  'benefit-risk': 'Benefit-Risk Analysis',
  safety: 'Safety Analysis',
  'clinical-background': 'Clinical Background',
  'device-description': 'Device Description',
  'state-of-art': 'State of the Art Review',
  equivalence: 'Equivalence Assessment',
  'literature-analysis': 'Literature Review',
  'pms-data': 'Post-Market Surveillance',
  conclusion: 'Conclusion',
};

// Debug mappings for development
console.log('Available CtQ section mappings:', sectionTypeToQmpMapping);

/**
 * Check if all required CtQ factors for a given section type are satisfied
 *
 * @param {string} sectionType - The type of section to check
 * @returns {Promise<Object>} - Status and details of CtQ factor checks
 */
export const checkSectionCtqFactors = async sectionType => {
  try {
    // Map section type to QMP section name
    const qmpSectionName = sectionTypeToQmpMapping[sectionType] || sectionType;

    console.log(
      `Checking CtQ factors for section type "${sectionType}" → mapped to "${qmpSectionName}"`
    );

    // Get CtQ factors related to this section
    const response = await axios.get(
      `/api/qmp/ctq-for-section/${encodeURIComponent(qmpSectionName)}`
    );

    if (!response.data || !response.data.ctqFactors) {
      return {
        canProceed: true,
        ctqFactors: [],
        message: 'No CtQ factors found for this section',
        highRiskBlockers: 0,
        mediumRiskBlockers: 0,
        lowRiskBlockers: 0,
      };
    }

    const ctqFactors = response.data.ctqFactors;

    // Check for incomplete high/medium risk factors
    const highRiskBlockers = ctqFactors.filter(
      factor => factor.riskLevel === 'high' && factor.status !== 'complete'
    );

    const mediumRiskBlockers = ctqFactors.filter(
      factor => factor.riskLevel === 'medium' && factor.status !== 'complete'
    );

    const lowRiskBlockers = ctqFactors.filter(
      factor => factor.riskLevel === 'low' && factor.status !== 'complete'
    );

    // High risk CtQ factors block section generation
    // Medium risk CtQ factors show a warning but allow proceeding
    return {
      canProceed: highRiskBlockers.length === 0,
      ctqFactors,
      message: generateStatusMessage(highRiskBlockers, mediumRiskBlockers, lowRiskBlockers),
      highRiskBlockers: highRiskBlockers.length,
      mediumRiskBlockers: mediumRiskBlockers.length,
      lowRiskBlockers: lowRiskBlockers.length,
      severity: determineSeverity(highRiskBlockers, mediumRiskBlockers),
    };
  } catch (error) {
    console.error('Error checking section CtQ factors:', error);

    // Default to allowing section generation if there's an error fetching CtQ factors
    return {
      canProceed: true,
      ctqFactors: [],
      message: 'Could not check CtQ factors, proceeding with caution',
      error: error.message,
      severity: 'warning',
    };
  }
};

/**
 * Generate a status message based on blocked CtQ factors
 */
function generateStatusMessage(highRiskBlockers, mediumRiskBlockers, lowRiskBlockers) {
  if (
    highRiskBlockers.length === 0 &&
    mediumRiskBlockers.length === 0 &&
    lowRiskBlockers.length === 0
  ) {
    return 'All quality requirements satisfied';
  }

  if (highRiskBlockers.length > 0) {
    const factorNames = highRiskBlockers.map(f => `"${f.name}"`).join(', ');
    return `${highRiskBlockers.length} high-risk quality requirement(s) not satisfied: ${factorNames}. These must be completed before section generation.`;
  }

  if (mediumRiskBlockers.length > 0) {
    return `${mediumRiskBlockers.length} medium-risk quality requirement(s) not satisfied. Proceeding may affect regulatory compliance.`;
  }

  return `${lowRiskBlockers.length} low-risk quality requirement(s) not satisfied. Consider addressing these for optimal quality.`;
}

/**
 * Determine severity level for UI display
 */
function determineSeverity(highRiskBlockers, mediumRiskBlockers) {
  if (highRiskBlockers.length > 0) {
    return 'error';
  }

  if (mediumRiskBlockers.length > 0) {
    return 'warning';
  }

  return 'info';
}
