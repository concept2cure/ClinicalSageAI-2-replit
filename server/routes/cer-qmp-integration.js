/**
 * CER-QMP Integration API
 *
 * This module provides endpoints that integrate Quality Management Plan (QMP) data
 * with the Clinical Evaluation Report (CER) validation and compliance engine.
 * It enables:
 *
 * 1. Scoped validation based on QMP objectives
 * 2. Compliance checking against specific sections defined in objectives
 * 3. Dashboard metrics for QMP objective status and completion tracking
 *
 * Version: 1.1.0
 * Last Updated: May 8, 2025
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import complianceEngine from '../services/cer-compliance-engine.js';

// Use built-in fetch from global scope instead of node-fetch
const fetch = global.fetch;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
    logger.error('Error fetching QMP data for integration', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    throw error;
  }
}

/**
 * GET /api/cer/qmp-integration/dashboard-metrics
 * Get enhanced dashboard metrics with QMP objective information
 */
router.get('/dashboard-metrics', async (req, res) => {
  try {
    const qmpData = await getQmpData();

    // Calculate enhanced metrics
    const enhancedMetrics = {
      ...qmpData.metrics,
      objectivesByStatus: qmpData.metrics.objectivesByStatus || {
        complete: 0,
        inProgress: 0,
        planned: 0,
        blocked: 0,
      },
      objectivesBreakdown: {
        total: qmpData.objectives?.length || 0,
        complete: qmpData.metrics?.objectivesByStatus?.complete || 0,
        inProgress: qmpData.metrics?.objectivesByStatus?.inProgress || 0,
        planned: qmpData.metrics?.objectivesByStatus?.planned || 0,
        blocked: qmpData.metrics?.objectivesByStatus?.blocked || 0,
      },
      completionPercentage: qmpData.metrics?.overallCompletion || 0,
      cerSectionCoverage: {
        percentage: qmpData.metrics?.sectionCoverage || 0,
        coveredSections: getCoveredSections(qmpData.objectives || []),
        uncoveredCriticalSections: getUncoveredCriticalSections(qmpData.objectives || []),
      },
      objectiveCompletionTimeline: generateCompletionTimeline(qmpData.objectives || []),
      highPriorityObjectives: getHighPriorityObjectives(qmpData.objectives || []),
    };

    logger.info('Generated enhanced QMP dashboard metrics', {
      module: 'cer-qmp-integration',
    });

    res.json(enhancedMetrics);
  } catch (error) {
    logger.error('Error generating enhanced dashboard metrics', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to generate enhanced dashboard metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/cer/qmp-integration/compliance-metrics
 * Get compliance metrics for dashboard showing objective compliance status
 */
router.get('/compliance-metrics', async (req, res) => {
  try {
    const { documentId = 'current', framework = 'mdr' } = req.query;

    // Get QMP data
    const qmpData = await getQmpData();
    const objectives = qmpData.objectives || [];

    if (objectives.length === 0) {
      return res.json({
        documentId,
        framework,
        timestamp: new Date().toISOString(),
        message: 'No objectives defined',
        overallComplianceScore: null,
        objectivesByComplianceStatus: {},
        sectionComplianceScores: {},
        complianceBreakdown: {
          excellent: 0,
          good: 0,
          needsImprovement: 0,
          criticalIssues: 0,
          notEvaluated: 0,
        },
      });
    }

    // Create a mock document for demonstration
    // In production, this would be fetched from the database
    const documentSections = [];

    // Get all unique sections from objectives
    const allSections = new Set();
    objectives.forEach(obj => {
      if (obj.scopeSections && Array.isArray(obj.scopeSections)) {
        obj.scopeSections.forEach(section => allSections.add(section));
      }
    });

    // Create mock sections for each unique section found
    Array.from(allSections).forEach(sectionName => {
      documentSections.push({
        title: sectionName,
        type: sectionName.toLowerCase().replace(/\s+/g, '_'),
        content: `Sample content for ${sectionName} section. This would be the actual content from the CER document in production.`,
        wordCount: 250,
      });
    });

    const document = {
      documentId,
      title: 'Clinical Evaluation Report',
      sections: documentSections,
    };

    // Get compliance results using our engine
    const complianceResults = await complianceEngine.evaluateCompliance(
      documentId,
      document,
      framework,
      true // Use QMP objectives scoping
    );

    // Calculate objective-specific compliance scores
    const objectiveCompliance =
      await complianceEngine.calculateObjectiveCompliance(complianceResults);

    // Process results for dashboard metrics
    const objectiveScores = objectiveCompliance.objectiveScores || [];

    // Categorize objectives by compliance status
    const objectivesByComplianceStatus = {
      excellent: objectiveScores.filter(obj => obj.score !== null && obj.score >= 90).length,
      good: objectiveScores.filter(obj => obj.score !== null && obj.score >= 75 && obj.score < 90)
        .length,
      needsImprovement: objectiveScores.filter(
        obj => obj.score !== null && obj.score >= 60 && obj.score < 75
      ).length,
      criticalIssues: objectiveScores.filter(obj => obj.score !== null && obj.score < 60).length,
      notEvaluated: objectiveScores.filter(obj => obj.score === null).length,
    };

    // Compile section compliance scores
    const sectionComplianceScores = {};

    objectiveScores.forEach(objective => {
      if (objective.sections && Array.isArray(objective.sections)) {
        objective.sections.forEach(sectionScore => {
          if (!sectionComplianceScores[sectionScore.section]) {
            sectionComplianceScores[sectionScore.section] = [];
          }
          sectionComplianceScores[sectionScore.section].push(sectionScore.score);
        });
      }
    });

    // Calculate average score for each section
    Object.keys(sectionComplianceScores).forEach(section => {
      const scores = sectionComplianceScores[section];
      sectionComplianceScores[section] = {
        averageScore:
          scores.length > 0
            ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
            : null,
        objectiveCount: scores.length,
      };
    });

    // Calculate overall compliance percentage
    const scoredObjectives = objectiveScores.filter(obj => obj.score !== null);
    const overallComplianceScore =
      scoredObjectives.length > 0
        ? Math.round(
            scoredObjectives.reduce((sum, obj) => sum + obj.score, 0) / scoredObjectives.length
          )
        : null;

    logger.info('Generated compliance metrics for dashboard', {
      module: 'cer-qmp-integration',
      documentId,
      framework,
      objectiveCount: objectives.length,
      evaluatedCount: scoredObjectives.length,
      overallScore: overallComplianceScore,
    });

    res.json({
      documentId,
      framework: complianceResults.framework,
      timestamp: complianceResults.timestamp,
      overallComplianceScore,
      objectivesByComplianceStatus,
      sectionComplianceScores,
      complianceBreakdown: {
        excellent: objectivesByComplianceStatus.excellent,
        good: objectivesByComplianceStatus.good,
        needsImprovement: objectivesByComplianceStatus.needsImprovement,
        criticalIssues: objectivesByComplianceStatus.criticalIssues,
        notEvaluated: objectivesByComplianceStatus.notEvaluated,
      },
      totalObjectives: objectives.length,
      evaluatedObjectives: scoredObjectives.length,
      completionPercentage: qmpData.metrics?.overallCompletion || 0,
    });
  } catch (error) {
    logger.error('Error generating compliance metrics', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to generate compliance metrics',
      message: error.message,
    });
  }
});

/**
 * POST /api/cer/qmp-integration/validate-scoped
 * Validate CER document with compliance scope defined by QMP objectives
 */
router.post('/validate-scoped', async (req, res) => {
  try {
    const { documentId, framework = 'mdr' } = req.body;

    if (!documentId) {
      return res.status(400).json({
        error: 'Document ID is required',
      });
    }

    // Get QMP data for scoping
    const qmpData = await getQmpData();

    // Extract scoped sections from QMP objectives
    const scopedSections = extractScopedSections(qmpData.objectives);

    // Get document from storage
    // In a real implementation, you would fetch the document from the database
    // For now, we'll simulate with a mock document

    // Call validation with the scoped sections
    // In a real implementation, you would make an actual call to the validation service
    // For now, we'll simulate the validation results
    const validationResults = await performScopedValidation(documentId, framework, scopedSections);

    // Add QMP-specific validation context
    const enhancedResults = enhanceWithQmpContext(validationResults, qmpData);

    logger.info('Performed QMP-scoped validation', {
      module: 'cer-qmp-integration',
      documentId,
      framework,
      scopedSectionCount: scopedSections.length,
    });

    res.json(enhancedResults);
  } catch (error) {
    logger.error('Error performing QMP-scoped validation', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to perform QMP-scoped validation',
      message: error.message,
    });
  }
});

/**
 * POST /api/cer/qmp-integration/objective-compliance
 * Check compliance for a specific objective using the compliance engine
 */
router.post('/objective-compliance', async (req, res) => {
  try {
    const { objectiveId, documentId, framework = 'mdr' } = req.body;

    if (!objectiveId) {
      return res.status(400).json({
        error: 'Objective ID is required',
      });
    }

    if (!documentId) {
      return res.status(400).json({
        error: 'Document ID is required',
      });
    }

    // Get QMP data
    const qmpData = await getQmpData();

    // Find the specific objective
    const objective = qmpData.objectives.find(
      obj => obj.id === parseInt(objectiveId) || obj.id === objectiveId
    );

    if (!objective) {
      return res.status(404).json({
        error: 'Objective not found',
      });
    }

    // Extract sections for the objective
    const objectiveSections = objective.scopeSections || [];

    if (objectiveSections.length === 0) {
      return res.status(400).json({
        error: 'Objective has no scoped sections defined',
        message:
          'Please update the quality objective to include target CER sections before validating compliance.',
      });
    }

    // Fetch the document (from DB in production)
    // For now, we're creating a sample document with named sections
    const documentSections = [];

    // Create sections corresponding to the objective's scope
    objectiveSections.forEach(sectionName => {
      documentSections.push({
        title: sectionName,
        type: sectionName.toLowerCase().replace(/\s+/g, '_'),
        content: `Sample content for ${sectionName} section. This would be the actual content from the CER document in production.`,
        wordCount: 250,
      });
    });

    const document = {
      documentId,
      title: 'Clinical Evaluation Report',
      sections: documentSections,
    };

    // Use the compliance engine directly for this specific objective
    try {
      // Get compliance results for the whole document first
      const complianceResults = await complianceEngine.evaluateCompliance(
        documentId,
        document,
        framework,
        false // No QMP scoping here since we're already using objective-specific sections
      );

      // Now calculate the objective-specific score using our engine
      const objectiveCompliance =
        await complianceEngine.calculateObjectiveCompliance(complianceResults);

      // Find this objective's score in the results
      const objectiveResult = objectiveCompliance.objectiveScores.find(
        score => score.id === objective.id || score.id === parseInt(objectiveId)
      );

      logger.info('Checked objective compliance with engine', {
        module: 'cer-qmp-integration',
        objectiveId,
        documentId,
        framework,
        score: objectiveResult?.score,
      });

      // Return the enhanced result
      res.json({
        objectiveId,
        title: objective.title,
        description: objective.description,
        status: objective.status,
        sections: objectiveSections,
        complianceScore: objectiveResult?.score || 0,
        complianceStatus: objectiveResult?.message || 'Not evaluated',
        sectionScores: objectiveResult?.sections || [],
        framework: complianceResults.framework,
        timestamp: complianceResults.timestamp,
        // Include related issues and recommendations filtered to this objective's sections
        issues: complianceResults.validationResults.issues.filter(issue =>
          objectiveSections.some(section =>
            issue.location?.toLowerCase().includes(section.toLowerCase().replace(/\s+/g, '_'))
          )
        ),
        recommendations: complianceResults.validationResults.recommendations.filter(rec =>
          objectiveSections.some(section =>
            rec.location?.toLowerCase().includes(section.toLowerCase().replace(/\s+/g, '_'))
          )
        ),
      });
    } catch (error) {
      logger.error('Error in compliance engine for objective', {
        module: 'cer-qmp-integration',
        objectiveId,
        error: error.message,
      });

      // Fallback to original method if engine fails
      const validationResults = await performScopedValidation(
        documentId,
        framework,
        objectiveSections
      );
      const complianceScore = calculateObjectiveComplianceScore(validationResults, objective);

      res.json({
        objectiveId,
        title: objective.title,
        description: objective.description,
        status: objective.status,
        sections: objectiveSections,
        complianceScore,
        complianceStatus:
          complianceScore >= 90
            ? 'Excellent'
            : complianceScore >= 75
              ? 'Good'
              : complianceScore >= 60
                ? 'Needs Improvement'
                : 'Critical Issues',
        usingFallback: true,
        issues: validationResults.validationResults.issues.filter(issue =>
          objectiveSections.some(section =>
            issue.location?.toLowerCase().includes(section.toLowerCase().replace(/\s+/g, '_'))
          )
        ),
        recommendations: validationResults.validationResults.recommendations.filter(rec =>
          objectiveSections.some(section =>
            rec.location?.toLowerCase().includes(section.toLowerCase().replace(/\s+/g, '_'))
          )
        ),
      });
    }
  } catch (error) {
    logger.error('Error checking objective compliance', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to check objective compliance',
      message: error.message,
    });
  }
});

/**
 * GET /api/cer/qmp-integration/section-objectives/:section
 * Get objectives that cover a specific CER section
 */
router.get('/section-objectives/:section', async (req, res) => {
  try {
    const { section } = req.params;

    if (!section) {
      return res.status(400).json({
        error: 'Section name is required',
      });
    }

    // Get QMP data
    const qmpData = await getQmpData();

    // Find objectives that cover this section
    const relevantObjectives = qmpData.objectives.filter(
      obj => obj.scopeSections && obj.scopeSections.includes(section)
    );

    logger.info('Retrieved section objectives', {
      module: 'cer-qmp-integration',
      section,
      objectiveCount: relevantObjectives.length,
    });

    res.json({
      section,
      objectives: relevantObjectives,
      count: relevantObjectives.length,
    });
  } catch (error) {
    logger.error('Error retrieving section objectives', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve section objectives',
      message: error.message,
    });
  }
});

/**
 * Helper function to extract all sections covered by objectives
 */
function extractScopedSections(objectives) {
  const sections = new Set();

  objectives.forEach(objective => {
    if (objective.scopeSections && Array.isArray(objective.scopeSections)) {
      objective.scopeSections.forEach(section => sections.add(section));
    }
  });

  return Array.from(sections);
}

/**
 * Helper function to get all sections covered by objectives
 */
function getCoveredSections(objectives) {
  const coveredSections = new Set();

  objectives.forEach(objective => {
    if (objective.scopeSections && Array.isArray(objective.scopeSections)) {
      objective.scopeSections.forEach(section => coveredSections.add(section));
    }
  });

  return Array.from(coveredSections);
}

/**
 * Helper function to get critical sections not covered by any objective
 */
function getUncoveredCriticalSections(objectives) {
  const criticalSections = [
    'Clinical Data',
    'Safety',
    'State of the Art',
    'Risk Management',
    'Benefit-Risk Analysis',
  ];

  const coveredSections = getCoveredSections(objectives);

  return criticalSections.filter(section => !coveredSections.includes(section));
}

/**
 * Helper function to generate completion timeline for objectives
 */
function generateCompletionTimeline(objectives) {
  // In a real implementation, you would generate a timeline based on objective dates
  // For now, we'll return a simple object with counts by month
  return {
    'May 2025': 2,
    'June 2025': 1,
    'July 2025': 1,
  };
}

/**
 * Helper function to get high priority objectives
 */
function getHighPriorityObjectives(objectives) {
  // In a real implementation, you would determine priority based on objective attributes
  // For now, we'll return objectives with blocked status or with critical sections
  const criticalSections = [
    'Clinical Data',
    'Safety',
    'State of the Art',
    'Risk Management',
    'Benefit-Risk Analysis',
  ];

  return objectives.filter(
    obj =>
      obj.status === 'blocked' ||
      (obj.scopeSections && obj.scopeSections.some(section => criticalSections.includes(section)))
  );
}

/**
 * Helper function to perform scoped validation using the compliance engine
 */
async function performScopedValidation(documentId, framework, sections) {
  try {
    // Fetch document from storage (would be database in production)
    // For now, we'll create a sample document with the requested sections
    const documentSections = sections.map(sectionName => ({
      title: sectionName,
      type: sectionName.toLowerCase().replace(/\s+/g, '_'),
      content: `Sample content for ${sectionName} section. This would be the actual content from the CER document in production.`,
      wordCount: 250,
    }));

    const document = {
      documentId,
      title: 'Clinical Evaluation Report',
      sections: documentSections,
    };

    // Use the compliance engine to evaluate the document with scoped sections
    const complianceResults = await complianceEngine.evaluateCompliance(
      documentId,
      document,
      framework,
      true // Use QMP objectives scoping
    );

    logger.info('Performed compliance evaluation using engine', {
      module: 'cer-qmp-integration',
      documentId,
      framework,
      score: complianceResults.validationResults.summary.overallScore,
    });

    return complianceResults;
  } catch (error) {
    logger.error('Error in compliance engine evaluation', {
      module: 'cer-qmp-integration',
      error: error.message,
    });

    // Fallback to simplified validation if engine fails
    // Generate basic issues based on the sections
    const issues = [];
    const recommendations = [];

    // Add section-specific issues and recommendations
    sections.forEach(section => {
      if (section === 'Clinical Data') {
        issues.push({
          type: 'incomplete_section',
          message: `${section} section is incomplete`,
          severity: 'major',
          location: `section:${section.toLowerCase().replace(/\s+/g, '_')}`,
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 3',
        });

        recommendations.push({
          id: `rec-${section.toLowerCase().replace(/\s+/g, '_')}-1`,
          type: 'update_section',
          message: `Include statistical analysis methods in ${section} section`,
          location: `section:${section.toLowerCase().replace(/\s+/g, '_')}`,
        });
      }

      if (section === 'State of the Art') {
        issues.push({
          type: 'outdated_references',
          message: `${section} contains outdated references`,
          severity: 'minor',
          location: `section:${section.toLowerCase().replace(/\s+/g, '_')}`,
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 2',
        });

        recommendations.push({
          id: `rec-${section.toLowerCase().replace(/\s+/g, '_')}-1`,
          type: 'update_references',
          message: `Update references in ${section} to include publications from the last 3 years`,
          location: `section:${section.toLowerCase().replace(/\s+/g, '_')}`,
        });
      }
    });

    // Calculate score based on issues
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const majorIssues = issues.filter(i => i.severity === 'major').length;
    const minorIssues = issues.filter(i => i.severity === 'minor').length;

    // Calculate score: deduct 10 for critical, 5 for major, 2 for minor
    const score = Math.max(0, 100 - criticalIssues * 10 - majorIssues * 5 - minorIssues * 2);

    return {
      documentId,
      framework,
      timestamp: new Date().toISOString(),
      validationResults: {
        summary: {
          overallScore: score,
          criticalIssues,
          majorIssues,
          minorIssues,
          recommendations: recommendations.length,
        },
        issues,
        recommendations,
      },
      error: error.message,
      usingFallback: true,
    };
  }
}

/**
 * Helper function to enhance validation results with QMP context
 */
function enhanceWithQmpContext(validationResults, qmpData) {
  // Map issues to objectives
  const issuesWithObjectives = validationResults.validationResults.issues.map(issue => {
    // Extract section from location (e.g., 'section:clinical_data' -> 'clinical_data')
    const sectionMatch = issue.location.match(/section:([a-z_]+)/);
    const section = sectionMatch
      ? // Convert back to title case for matching with objectives
        sectionMatch[1]
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : null;

    // Find objectives that cover this section
    const relatedObjectives = section
      ? qmpData.objectives.filter(obj => obj.scopeSections && obj.scopeSections.includes(section))
      : [];

    return {
      ...issue,
      relatedObjectives: relatedObjectives.map(obj => ({
        id: obj.id,
        title: obj.title,
        status: obj.status,
      })),
    };
  });

  // Replace original issues with enhanced ones
  validationResults.validationResults.issues = issuesWithObjectives;

  // Add QMP metadata context
  validationResults.qmpContext = {
    planName: qmpData.metadata.planName,
    version: qmpData.metadata.version,
    lastValidated: qmpData.metrics.lastValidatedDate,
    objectivesCount: qmpData.objectives.length,
    completionPercentage: qmpData.metrics.overallCompletion,
  };

  return validationResults;
}

/**
 * Helper function to calculate objective-specific compliance score
 */
function calculateObjectiveComplianceScore(validationResults, objective) {
  // Extract issues related to the objective's sections
  const relevantIssues = validationResults.issues.filter(issue =>
    objective.scopeSections.some(section => issue.location.includes(section))
  );

  // Calculate score: start with 100 and deduct based on issues
  const criticalIssues = relevantIssues.filter(i => i.severity === 'critical').length;
  const majorIssues = relevantIssues.filter(i => i.severity === 'major').length;
  const minorIssues = relevantIssues.filter(i => i.severity === 'minor').length;

  // More severe deductions for objective-specific score
  return Math.max(0, 100 - criticalIssues * 20 - majorIssues * 10 - minorIssues * 3);
}

export default router;
