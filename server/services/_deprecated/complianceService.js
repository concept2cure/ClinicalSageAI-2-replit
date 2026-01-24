/**
 * Compliance Service
 *
 * Provides shared functionality for running compliance checks across
 * CER and 510(k) modules. Supports various document types and configurable
 * rule sets for both modules.
 */

import { summarizeText } from './aiService.js';

// Default rule sets for both document types
const RULE_SETS = {
  '510k': [
    {
      id: 'substantial_equivalence',
      name: 'Substantial Equivalence',
      severity: 'error',
      check: hasSubstantialEquivalence,
    },
    {
      id: 'predicate_device',
      name: 'Predicate Device',
      severity: 'error',
      check: hasPredicateDevice,
    },
    {
      id: 'device_description',
      name: 'Device Description',
      severity: 'error',
      check: hasDeviceDescription,
    },
    {
      id: 'indications_for_use',
      name: 'Indications for Use',
      severity: 'error',
      check: hasIndicationsForUse,
    },
    {
      id: 'testing_methodology',
      name: 'Testing Methodology',
      severity: 'warning',
      check: hasTestingMethodology,
    },
    {
      id: 'literature_references',
      name: 'Literature References',
      severity: 'warning',
      check: hasLiteratureReferences,
    },
  ],
  cer: [
    { id: 'device_profile', name: 'Device Profile', severity: 'error', check: hasDeviceProfile },
    {
      id: 'literature_review',
      name: 'Literature Review',
      severity: 'error',
      check: hasLiteratureReview,
    },
    {
      id: 'equivalence_analysis',
      name: 'Equivalence Analysis',
      severity: 'error',
      check: hasEquivalenceAnalysis,
    },
    { id: 'clinical_data', name: 'Clinical Data', severity: 'error', check: hasClinicalData },
    { id: 'state_of_art', name: 'State of the Art', severity: 'warning', check: hasStateOfArt },
    {
      id: 'post_market_surveillance',
      name: 'Post-Market Surveillance',
      severity: 'warning',
      check: hasPostMarketSurveillance,
    },
    {
      id: 'benefit_risk',
      name: 'Benefit-Risk Analysis',
      severity: 'error',
      check: hasBenefitRiskAnalysis,
    },
    { id: 'conclusions', name: 'Conclusions', severity: 'error', check: hasConclusions },
    {
      id: 'consistent_formatting',
      name: 'Consistent Formatting',
      severity: 'warning',
      check: hasConsistentFormatting,
    },
  ],
};

/**
 * Run compliance check on a project
 *
 * @param {string} projectId - The project ID to check
 * @param {string} type - The document type (510k or cer)
 * @param {Object} options - Additional options for the check
 * @returns {Promise<Object>} The compliance check results
 */
export async function runComplianceCheck(projectId, type = '510k', options = {}) {
  try {
    if (!projectId) {
      throw new Error('Project ID is required for compliance check');
    }

    // Validate document type
    if (!['510k', 'cer'].includes(type)) {
      throw new Error(`Invalid document type: ${type}`);
    }

    // Get the appropriate rule set
    const ruleSet = RULE_SETS[type];

    // Fetch project data (this would connect to your database)
    const projectData = await fetchProjectData(projectId, type);

    // Apply each rule
    const results = {
      projectId,
      type,
      timestamp: new Date().toISOString(),
      passed: [],
      warnings: [],
      errors: [],
    };

    for (const rule of ruleSet) {
      const ruleResult = await rule.check(projectData);
      const resultItem = {
        id: rule.id,
        name: rule.name,
        message: ruleResult.message,
      };

      if (ruleResult.passed) {
        results.passed.push(resultItem);
      } else if (rule.severity === 'warning') {
        results.warnings.push(resultItem);
      } else {
        results.errors.push(resultItem);
      }
    }

    // Generate an AI summary of the compliance check if requested
    if (options.generateSummary) {
      results.summary = await generateComplianceSummary(results);
    }

    return results;
  } catch (error) {
    console.error('Error in runComplianceCheck:', error);
    throw new Error(`Failed to run compliance check: ${error.message}`);
  }
}

/**
 * Generate a summary of compliance check results using AI
 *
 * @param {Object} results - The compliance check results
 * @returns {Promise<string>} The generated summary
 */
async function generateComplianceSummary(results) {
  try {
    const context = {
      documentType:
        results.type === '510k' ? 'FDA 510(k) Submission' : 'Clinical Evaluation Report',
      passedCount: results.passed.length,
      warningCount: results.warnings.length,
      errorCount: results.errors.length,
      passed: results.passed.map(item => item.name),
      warnings: results.warnings.map(item => ({ name: item.name, message: item.message })),
      errors: results.errors.map(item => ({ name: item.name, message: item.message })),
    };

    const summaryText = await summarizeText(
      `Compliance review for ${context.documentType}:\n` +
        `Passed: ${context.passedCount} checks\n` +
        `Warnings: ${context.warningCount} items\n` +
        `Errors: ${context.errorCount} items\n\n` +
        `Detail: ${JSON.stringify(context, null, 2)}`,
      300
    );

    return summaryText;
  } catch (error) {
    console.error('Error generating compliance summary:', error);
    return 'Unable to generate compliance summary due to an error.';
  }
}

/**
 * Fetch project data from the database
 *
 * @param {string} projectId - The project ID to fetch
 * @param {string} type - The document type
 * @returns {Promise<Object>} The project data
 */
async function fetchProjectData(projectId, type) {
  // This would be replaced with an actual database query
  // For now, return a mock object for development
  return {
    id: projectId,
    type,
    // Other fields would be populated from the database
    sections: {
      deviceDescription: { present: true, wordCount: 450 },
      substantialEquivalence: { present: true, wordCount: 350 },
      predicateDevice: { present: true, wordCount: 200 },
      indicationsForUse: { present: true, wordCount: 150 },
      testingMethodology: { present: true, wordCount: 600 },
      literatureReferences: { present: true, count: 12 },
      deviceProfile: { present: true, wordCount: 300 },
      literatureReview: { present: true, wordCount: 800 },
      equivalenceAnalysis: { present: true, wordCount: 500 },
      clinicalData: { present: true, wordCount: 700 },
      stateOfArt: { present: true, wordCount: 450 },
      postMarketSurveillance: { present: true, wordCount: 350 },
      benefitRiskAnalysis: { present: true, wordCount: 400 },
      conclusions: { present: true, wordCount: 250 },
    },
    formatting: {
      consistent: true,
      fonts: ['Arial', 'Times New Roman'],
      headingLevels: 3,
    },
  };
}

// Rule check functions
async function hasSubstantialEquivalence(data) {
  return {
    passed: data.sections.substantialEquivalence?.present === true,
    message: data.sections.substantialEquivalence?.present
      ? 'Substantial equivalence section is present'
      : 'Missing substantial equivalence section',
  };
}

async function hasPredicateDevice(data) {
  return {
    passed: data.sections.predicateDevice?.present === true,
    message: data.sections.predicateDevice?.present
      ? 'Predicate device section is present'
      : 'Missing predicate device section',
  };
}

async function hasDeviceDescription(data) {
  return {
    passed: data.sections.deviceDescription?.present === true,
    message: data.sections.deviceDescription?.present
      ? 'Device description section is present'
      : 'Missing device description section',
  };
}

async function hasIndicationsForUse(data) {
  return {
    passed: data.sections.indicationsForUse?.present === true,
    message: data.sections.indicationsForUse?.present
      ? 'Indications for use section is present'
      : 'Missing indications for use section',
  };
}

async function hasTestingMethodology(data) {
  return {
    passed: data.sections.testingMethodology?.present === true,
    message: data.sections.testingMethodology?.present
      ? 'Testing methodology section is present'
      : 'Missing testing methodology section',
  };
}

async function hasLiteratureReferences(data) {
  const minReferences = 5;
  return {
    passed:
      data.sections.literatureReferences?.present === true &&
      data.sections.literatureReferences?.count >= minReferences,
    message:
      data.sections.literatureReferences?.present === true &&
      data.sections.literatureReferences?.count >= minReferences
        ? `Literature references section has ${data.sections.literatureReferences.count} references`
        : data.sections.literatureReferences?.present
          ? `Literature references section has only ${data.sections.literatureReferences.count} references, minimum ${minReferences} required`
          : 'Missing literature references section',
  };
}

async function hasDeviceProfile(data) {
  return {
    passed: data.sections.deviceProfile?.present === true,
    message: data.sections.deviceProfile?.present
      ? 'Device profile section is present'
      : 'Missing device profile section',
  };
}

async function hasLiteratureReview(data) {
  return {
    passed: data.sections.literatureReview?.present === true,
    message: data.sections.literatureReview?.present
      ? 'Literature review section is present'
      : 'Missing literature review section',
  };
}

async function hasEquivalenceAnalysis(data) {
  return {
    passed: data.sections.equivalenceAnalysis?.present === true,
    message: data.sections.equivalenceAnalysis?.present
      ? 'Equivalence analysis section is present'
      : 'Missing equivalence analysis section',
  };
}

async function hasClinicalData(data) {
  return {
    passed: data.sections.clinicalData?.present === true,
    message: data.sections.clinicalData?.present
      ? 'Clinical data section is present'
      : 'Missing clinical data section',
  };
}

async function hasStateOfArt(data) {
  return {
    passed: data.sections.stateOfArt?.present === true,
    message: data.sections.stateOfArt?.present
      ? 'State of the art section is present'
      : 'Missing state of the art section',
  };
}

async function hasPostMarketSurveillance(data) {
  return {
    passed: data.sections.postMarketSurveillance?.present === true,
    message: data.sections.postMarketSurveillance?.present
      ? 'Post-market surveillance section is present'
      : 'Missing post-market surveillance section',
  };
}

async function hasBenefitRiskAnalysis(data) {
  return {
    passed: data.sections.benefitRiskAnalysis?.present === true,
    message: data.sections.benefitRiskAnalysis?.present
      ? 'Benefit-risk analysis section is present'
      : 'Missing benefit-risk analysis section',
  };
}

async function hasConclusions(data) {
  return {
    passed: data.sections.conclusions?.present === true,
    message: data.sections.conclusions?.present
      ? 'Conclusions section is present'
      : 'Missing conclusions section',
  };
}

async function hasConsistentFormatting(data) {
  return {
    passed: data.formatting?.consistent === true,
    message: data.formatting?.consistent
      ? 'Document has consistent formatting'
      : 'Document has inconsistent formatting',
  };
}

export default {
  runComplianceCheck,
};
