/**
 * CER2V Interop Compliance Engine Service
 *
 * This service is responsible for evaluating CER documents against regulatory
 * requirements with intelligent section targeting based on QMP objectives.
 *
 * It reads each quality objective's scope to determine which sections to
 * evaluate, enabling precise validation for specific document parts.
 *
 * Version: 1.0.0
 * Last Updated: May 8, 2025
 */

import { fileURLToPath } from 'url';
import path from 'path';
import logger from '../utils/logger.js';

// Use built-in fetch from global scope instead of node-fetch
const fetch = global.fetch;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Regulatory frameworks supported for compliance checking
const SUPPORTED_FRAMEWORKS = {
  mdr: {
    name: 'EU MDR (2017/745)',
    weight: 1.0,
    criticalSections: ['Clinical Data', 'Safety', 'Benefit-Risk Analysis'],
  },
  ivdr: {
    name: 'EU IVDR (2017/746)',
    weight: 0.9,
    criticalSections: ['Performance Evaluation', 'Safety', 'Benefit-Risk Analysis'],
  },
  iso14155: {
    name: 'ISO 14155:2020',
    weight: 0.8,
    criticalSections: ['Clinical Investigation Plan', 'Risk Management'],
  },
  fda: {
    name: 'FDA 21 CFR 812',
    weight: 0.9,
    criticalSections: ['IDE Requirements', 'Study Design'],
  },
  meddev: {
    name: 'MEDDEV 2.7/1 Rev 4',
    weight: 1.0,
    criticalSections: ['Clinical Evaluation', 'Literature Search', 'State of the Art'],
  },
};

// Cache for QMP data to avoid redundant API calls
let qmpDataCache = null;
let qmpCacheTimestamp = null;
const CACHE_TTL = 30000; // 30 seconds cache lifetime

/**
 * Fetch and cache QMP data from QMP API
 */
async function getQmpData() {
  // Return cached data if still fresh
  if (qmpDataCache && qmpCacheTimestamp && Date.now() - qmpCacheTimestamp < CACHE_TTL) {
    return qmpDataCache;
  }

  try {
    // Fetch fresh data from QMP API
    const response = await fetch('http://localhost:5000/api/qmp-api/data');

    if (!response.ok) {
      throw new Error(`Failed to fetch QMP data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Update cache
    qmpDataCache = data;
    qmpCacheTimestamp = Date.now();

    return data;
  } catch (error) {
    logger.error('Error fetching QMP data for compliance engine', {
      module: 'cer-compliance-engine',
      error: error.message,
    });

    throw error;
  }
}

/**
 * Evaluate document compliance with intelligent section targeting
 * based on QMP objectives
 *
 * @param {string} documentId - ID of the document to evaluate
 * @param {Object} document - The CER document content with sections
 * @param {string} framework - The regulatory framework to evaluate against
 * @param {boolean} useQmpScope - Whether to use QMP objectives to scope the evaluation
 * @returns {Promise<Object>} - Compliance evaluation results
 */
export async function evaluateCompliance(
  documentId,
  document,
  framework = 'mdr',
  useQmpScope = true
) {
  try {
    logger.info('Starting compliance evaluation', {
      module: 'cer-compliance-engine',
      documentId,
      framework,
      useQmpScope,
    });

    const frameworkInfo = SUPPORTED_FRAMEWORKS[framework] || SUPPORTED_FRAMEWORKS.mdr;

    // Determine which sections to evaluate
    let sectionsToEvaluate = document.sections || [];
    let scopedByObjectives = false;

    // If QMP scoping is enabled, read objectives to determine sections
    if (useQmpScope) {
      try {
        const qmpData = await getQmpData();
        const objectives = qmpData.objectives || [];

        // Extract all unique sections targeted by quality objectives
        const targetedSections = new Set();
        objectives.forEach(objective => {
          if (objective.scopeSections && Array.isArray(objective.scopeSections)) {
            objective.scopeSections.forEach(section => targetedSections.add(section));
          }
        });

        if (targetedSections.size > 0) {
          // Filter document sections that match targeted sections from objectives
          sectionsToEvaluate = sectionsToEvaluate.filter(
            section => targetedSections.has(section.type) || targetedSections.has(section.title)
          );

          scopedByObjectives = true;

          logger.info('Scoped evaluation using QMP objectives', {
            module: 'cer-compliance-engine',
            targetedSectionCount: targetedSections.size,
            matchingSectionCount: sectionsToEvaluate.length,
          });
        }
      } catch (error) {
        logger.warn('Failed to scope by QMP objectives, evaluating all sections', {
          module: 'cer-compliance-engine',
          error: error.message,
        });
      }
    }

    // Ensure critical sections are included in evaluation even if not targeted
    if (
      scopedByObjectives &&
      frameworkInfo.criticalSections &&
      frameworkInfo.criticalSections.length > 0
    ) {
      const criticalSectionSet = new Set(frameworkInfo.criticalSections);
      const includedSectionTitles = new Set(sectionsToEvaluate.map(s => s.title));

      const missingCriticalSections = document.sections.filter(
        section =>
          criticalSectionSet.has(section.title) && !includedSectionTitles.has(section.title)
      );

      if (missingCriticalSections.length > 0) {
        logger.info('Adding critical sections to evaluation scope', {
          module: 'cer-compliance-engine',
          addedSections: missingCriticalSections.map(s => s.title),
        });

        sectionsToEvaluate = [...sectionsToEvaluate, ...missingCriticalSections];
      }
    }

    // Map objectives to sections for enhanced compliance context
    let objectiveSectionMap = {};
    if (useQmpScope) {
      try {
        const qmpData = await getQmpData();
        const objectives = qmpData.objectives || [];

        // Build mapping of section titles to their associated objectives
        objectives.forEach(objective => {
          if (objective.scopeSections && Array.isArray(objective.scopeSections)) {
            objective.scopeSections.forEach(section => {
              if (!objectiveSectionMap[section]) {
                objectiveSectionMap[section] = [];
              }
              objectiveSectionMap[section].push({
                id: objective.id,
                title: objective.title,
                status: objective.status,
              });
            });
          }
        });
      } catch (error) {
        logger.warn('Failed to map objectives to sections', {
          module: 'cer-compliance-engine',
          error: error.message,
        });
      }
    }

    // Perform compliance evaluation for each section
    const sectionResults = [];
    for (const section of sectionsToEvaluate) {
      const result = await evaluateSection(section, framework);

      // Enhance with objective information if available
      if (objectiveSectionMap[section.title] || objectiveSectionMap[section.type]) {
        result.relatedObjectives =
          objectiveSectionMap[section.title] || objectiveSectionMap[section.type] || [];
      }

      sectionResults.push(result);
    }

    // Aggregate results to calculate overall compliance
    const issues = sectionResults.flatMap(result => result.issues || []);
    const recommendations = sectionResults.flatMap(result => result.recommendations || []);

    // Calculate compliance score
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const majorIssues = issues.filter(i => i.severity === 'major').length;
    const minorIssues = issues.filter(i => i.severity === 'minor').length;

    // Weighted score calculation
    const score = calculateComplianceScore(
      criticalIssues,
      majorIssues,
      minorIssues,
      frameworkInfo.weight
    );

    logger.info('Completed compliance evaluation', {
      module: 'cer-compliance-engine',
      documentId,
      framework,
      score,
      issueCount: issues.length,
    });

    return {
      documentId,
      framework: frameworkInfo.name,
      timestamp: new Date().toISOString(),
      scopedByObjectives,
      evaluatedSections: sectionsToEvaluate.map(s => s.title),
      validationResults: {
        summary: {
          overallScore: score,
          criticalIssues,
          majorIssues,
          minorIssues,
          recommendations: recommendations.length,
        },
        sections: sectionResults,
        issues,
        recommendations,
      },
    };
  } catch (error) {
    logger.error('Error in compliance evaluation', {
      module: 'cer-compliance-engine',
      error: error.message,
      documentId,
      framework,
    });

    throw error;
  }
}

/**
 * Evaluate a single section for compliance
 *
 * @param {Object} section - The section to evaluate
 * @param {string} framework - The regulatory framework to evaluate against
 * @returns {Promise<Object>} - Section compliance results
 */
async function evaluateSection(section, framework) {
  // Create section identifier for referencing in results
  const sectionId = section.type || section.title.toLowerCase().replace(/\s+/g, '_');

  // Perform section-specific evaluation
  let issues = [];
  let recommendations = [];

  // Determine compliance rules based on section type and framework
  const rules = getSectionComplianceRules(section.type || section.title, framework);

  // Check content against rules
  const content = section.content || '';
  const wordCount = content.split(/\s+/).length;

  // Check word count - overly short sections likely lack detail
  if (wordCount < rules.minWordCount) {
    issues.push({
      type: 'insufficient_detail',
      message: `${section.title} section has insufficient content (${wordCount} words)`,
      severity: 'major',
      location: `section:${sectionId}`,
      regulatoryReference: rules.reference,
    });

    recommendations.push({
      id: `rec-${sectionId}-1`,
      type: 'expand_content',
      message: `Expand ${section.title} section to include more detailed information as required by ${rules.authority}`,
      location: `section:${sectionId}`,
    });
  }

  // Check for required elements based on section type
  for (const element of rules.requiredElements) {
    if (!content.toLowerCase().includes(element.toLowerCase())) {
      issues.push({
        type: 'missing_required_element',
        message: `${section.title} section is missing required element: ${element}`,
        severity: element.critical ? 'critical' : 'major',
        location: `section:${sectionId}`,
        regulatoryReference: rules.reference,
      });

      recommendations.push({
        id: `rec-${sectionId}-element-${element.replace(/\s+/g, '_').toLowerCase()}`,
        type: 'add_required_element',
        message: `Add ${element} to the ${section.title} section`,
        location: `section:${sectionId}`,
      });
    }
  }

  // Calculate section score
  const criticalIssues = issues.filter(i => i.severity === 'critical').length;
  const majorIssues = issues.filter(i => i.severity === 'major').length;
  const minorIssues = issues.filter(i => i.severity === 'minor').length;

  const sectionScore = calculateComplianceScore(criticalIssues, majorIssues, minorIssues);

  return {
    title: section.title,
    type: section.type,
    score: sectionScore,
    wordCount,
    issues,
    recommendations,
  };
}

/**
 * Calculate compliance score based on issue counts
 *
 * @param {number} criticalIssues - Count of critical issues
 * @param {number} majorIssues - Count of major issues
 * @param {number} minorIssues - Count of minor issues
 * @param {number} frameworkWeight - Weight factor for the framework (1.0 is standard)
 * @returns {number} - Compliance score (0-100)
 */
function calculateComplianceScore(criticalIssues, majorIssues, minorIssues, frameworkWeight = 1.0) {
  // Base penalties per issue type
  const criticalPenalty = 15;
  const majorPenalty = 7;
  const minorPenalty = 2;

  // Apply penalties
  const penalty =
    criticalIssues * criticalPenalty + majorIssues * majorPenalty + minorIssues * minorPenalty;

  // Apply framework weighting
  const weightedPenalty = penalty * frameworkWeight;

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, 100 - weightedPenalty));
}

/**
 * Get compliance rules for a specific section type and framework
 *
 * @param {string} sectionType - The section type or title
 * @param {string} framework - The regulatory framework
 * @returns {Object} - Compliance rules for the section
 */
function getSectionComplianceRules(sectionType, framework) {
  const normalizedType = sectionType.toLowerCase();

  // Default rules
  const defaultRules = {
    minWordCount: 200,
    requiredElements: [],
    reference: 'General compliance requirements',
    authority: SUPPORTED_FRAMEWORKS[framework]?.name || 'Regulatory framework',
  };

  // Framework-specific section rules
  const frameworkRules = {
    mdr: {
      'clinical data': {
        minWordCount: 500,
        requiredElements: [
          'clinical investigations',
          'post-market',
          'analysis',
          { text: 'benefit-risk', critical: true },
        ],
        reference: 'EU MDR Annex XIV, Part A, Section 3',
        authority: 'EU MDR (2017/745)',
      },
      safety: {
        minWordCount: 400,
        requiredElements: [
          'adverse events',
          { text: 'risk analysis', critical: true },
          'mitigations',
        ],
        reference: 'EU MDR Annex I, Section 3',
        authority: 'EU MDR (2017/745)',
      },
    },
    ivdr: {
      'performance evaluation': {
        minWordCount: 500,
        requiredElements: [
          'analytical performance',
          'clinical performance',
          { text: 'scientific validity', critical: true },
        ],
        reference: 'EU IVDR Annex XIII, Section 1.3',
        authority: 'EU IVDR (2017/746)',
      },
    },
    meddev: {
      'literature search': {
        minWordCount: 300,
        requiredElements: [
          'search strategy',
          'inclusion criteria',
          'exclusion criteria',
          { text: 'search terms', critical: true },
        ],
        reference: 'MEDDEV 2.7/1 Rev 4, Section A5',
        authority: 'MEDDEV 2.7/1 Rev 4',
      },
      'state of the art': {
        minWordCount: 400,
        requiredElements: [
          'current knowledge',
          'available treatment options',
          { text: 'comparison', critical: true },
        ],
        reference: 'MEDDEV 2.7/1 Rev 4, Section A5',
        authority: 'MEDDEV 2.7/1 Rev 4',
      },
    },
  };

  // Get framework-specific rules or default to an empty object
  const specificFrameworkRules = frameworkRules[framework] || {};

  // Find the best matching rule based on section type
  for (const [ruleType, rules] of Object.entries(specificFrameworkRules)) {
    if (normalizedType.includes(ruleType)) {
      // Process required elements to standardize format
      const standardizedElements = rules.requiredElements.map(element =>
        typeof element === 'object' ? element : { text: element, critical: false }
      );

      return {
        ...defaultRules,
        ...rules,
        requiredElements: standardizedElements,
      };
    }
  }

  return defaultRules;
}

/**
 * Calculate compliance scores for all objectives based on section results
 *
 * @param {Object} complianceResults - The overall compliance evaluation results
 * @returns {Promise<Object>} - Objective-specific compliance scores
 */
export async function calculateObjectiveCompliance(complianceResults) {
  try {
    const qmpData = await getQmpData();
    const objectives = qmpData.objectives || [];

    // Map sections to their scores
    const sectionScores = {};
    complianceResults.validationResults.sections.forEach(section => {
      sectionScores[section.title] = section.score;
      if (section.type) {
        sectionScores[section.type] = section.score;
      }
    });

    // Calculate objective-specific scores
    const objectiveScores = objectives.map(objective => {
      // Skip objectives without scoped sections
      if (
        !objective.scopeSections ||
        !Array.isArray(objective.scopeSections) ||
        objective.scopeSections.length === 0
      ) {
        return {
          id: objective.id,
          title: objective.title,
          status: objective.status,
          score: null,
          message: 'No scoped sections defined',
          sections: [],
        };
      }

      // Get scores for all sections related to this objective
      const scores = objective.scopeSections
        .filter(section => sectionScores[section] !== undefined)
        .map(section => ({
          section,
          score: sectionScores[section],
        }));

      // Calculate average score if we have any matching sections
      const averageScore =
        scores.length > 0
          ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length)
          : null;

      // Determine status message based on score
      let message = 'Not evaluated';
      if (averageScore !== null) {
        if (averageScore >= 90) {
          message = 'Excellent compliance';
        } else if (averageScore >= 75) {
          message = 'Good compliance';
        } else if (averageScore >= 60) {
          message = 'Moderate compliance issues';
        } else {
          message = 'Significant compliance issues';
        }
      }

      return {
        id: objective.id,
        title: objective.title,
        status: objective.status,
        score: averageScore,
        message,
        sections: scores,
      };
    });

    return {
      framework: complianceResults.framework,
      timestamp: complianceResults.timestamp,
      overallScore: complianceResults.validationResults.summary.overallScore,
      objectiveScores,
    };
  } catch (error) {
    logger.error('Error calculating objective compliance', {
      module: 'cer-compliance-engine',
      error: error.message,
    });

    throw error;
  }
}

export default {
  evaluateCompliance,
  calculateObjectiveCompliance,
};
