/**
 * IND Tips Routes
 *
 * Provides AI-powered gap analysis for IND submissions,
 * helping users identify missing modules and documents.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import aiUtils from '../services/aiUtils.js';

const router = Router();

/**
 * GET /api/ind/tips - Get IND gap analysis tips
 *
 * Analyzes the current document set and provides suggestions
 * for missing modules and documents for a complete IND submission.
 */
router.get('/api/ind/tips', async (req, res) => {
  try {
    const { ind_id, project_id } = req.query;

    // Validate required parameters
    if (!ind_id && !project_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: ind_id or project_id',
      });
    }

    const client = await pool.connect();
    try {
      // Get all documents for the specified IND or project
      let query = `
        SELECT d.id, d.title, d.file_path, d.module_id, d.module_name, d.document_type, d.content_summary
        FROM documents d
        WHERE `;

      const queryParams = [];
      if (ind_id) {
        query += `d.ind_id = $1`;
        queryParams.push(ind_id);
      } else {
        query += `d.project_id = $1`;
        queryParams.push(project_id);
      }

      const result = await client.query(query, queryParams);
      const documents = result.rows;

      // Get IND requirements structure
      const indRequirements = await getIndRequirements();

      // Build document map by module
      const documentsByModule = {};
      documents.forEach(doc => {
        if (!documentsByModule[doc.module_id]) {
          documentsByModule[doc.module_id] = [];
        }
        documentsByModule[doc.module_id].push(doc);
      });

      // Analyze gaps
      const gaps = analyzeGaps(documentsByModule, indRequirements);

      // Generate AI-powered suggestions
      const suggestions = await generateSuggestions(gaps, documents);

      res.json({
        success: true,
        analysis: {
          total_documents: documents.length,
          coverage: calculateCoverage(documentsByModule, indRequirements),
          gaps,
          suggestions,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('IND tips error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating IND tips',
      error: error.message,
    });
  }
});

/**
 * Get IND requirements structure
 *
 * @returns {Promise<Object>} IND requirements by module
 */
async function getIndRequirements() {
  // This would typically come from a database, but we'll hardcode for now
  return {
    1: {
      name: 'Administrative Information',
      required_documents: [
        'Cover Letter',
        'Form FDA 1571',
        'Table of Contents',
        'Introductory Statement',
      ],
      importance: 'critical',
    },
    2: {
      name: 'CMC Information',
      required_documents: [
        'Drug Substance Information',
        'Drug Product Information',
        'Placebo Information',
        'Environmental Assessment',
      ],
      importance: 'critical',
    },
    3: {
      name: 'Pharmacology and Toxicology Information',
      required_documents: ['Pharmacology Studies', 'Toxicology Studies', 'Integrated Summary'],
      importance: 'critical',
    },
    4: {
      name: 'Clinical Information',
      required_documents: [
        'Protocol',
        "Investigator's Brochure",
        'Previous Human Experience',
        'CMC Information',
      ],
      importance: 'critical',
    },
    5: {
      name: 'Additional Information',
      required_documents: ['Sample of Drug Products', 'Labeling', 'Patent Information'],
      importance: 'optional',
    },
  };
}

/**
 * Analyze gaps in the document collection
 *
 * @param {Object} documentsByModule - Map of documents by module ID
 * @param {Object} indRequirements - IND requirements structure
 * @returns {Object} - Gaps analysis by module
 */
function analyzeGaps(documentsByModule, indRequirements) {
  const gaps = {};

  // Iterate through each required module
  Object.entries(indRequirements).forEach(([moduleId, moduleInfo]) => {
    const moduleDocs = documentsByModule[moduleId] || [];
    const moduleDocTypes = new Set(moduleDocs.map(doc => doc.document_type.toLowerCase()));

    // Check for missing documents in this module
    const missingDocs = moduleInfo.required_documents.filter(
      docType => !moduleDocTypes.has(docType.toLowerCase())
    );

    if (missingDocs.length > 0 || moduleDocs.length === 0) {
      gaps[moduleId] = {
        module_name: moduleInfo.name,
        importance: moduleInfo.importance,
        missing_documents: missingDocs,
        module_complete: missingDocs.length === 0 && moduleDocs.length > 0,
      };
    }
  });

  return gaps;
}

/**
 * Calculate overall coverage percentage
 *
 * @param {Object} documentsByModule - Map of documents by module ID
 * @param {Object} indRequirements - IND requirements structure
 * @returns {number} - Coverage percentage
 */
function calculateCoverage(documentsByModule, indRequirements) {
  let totalRequired = 0;
  let totalPresent = 0;

  // Count total required documents and present documents
  Object.entries(indRequirements).forEach(([moduleId, moduleInfo]) => {
    const moduleDocs = documentsByModule[moduleId] || [];
    const moduleDocTypes = new Set(moduleDocs.map(doc => doc.document_type.toLowerCase()));

    // Only count critical modules towards coverage
    if (moduleInfo.importance === 'critical') {
      totalRequired += moduleInfo.required_documents.length;

      // Count present documents
      moduleInfo.required_documents.forEach(docType => {
        if (moduleDocTypes.has(docType.toLowerCase())) {
          totalPresent++;
        }
      });
    }
  });

  // Calculate percentage
  return totalRequired > 0 ? Math.round((totalPresent / totalRequired) * 100) : 0;
}

/**
 * Generate AI-powered suggestions for completing the IND submission
 *
 * @param {Object} gaps - Gaps analysis by module
 * @param {Array} documents - Existing documents
 * @returns {Promise<Object>} - Prioritized suggestions
 */
async function generateSuggestions(gaps, documents) {
  // Convert gaps to a format suitable for AI analysis
  const gapsText = Object.entries(gaps)
    .map(([moduleId, moduleInfo]) => {
      return `Module ${moduleId} (${moduleInfo.module_name}): Missing ${moduleInfo.missing_documents.join(', ')}`;
    })
    .join('\n');

  // Summarize existing documents
  const docsText = documents
    .map(doc => {
      return `${doc.title} (${doc.document_type})`;
    })
    .join('\n');

  // Prepare AI prompt
  const prompt = `
  Based on the following information about an IND submission:
  
  EXISTING DOCUMENTS:
  ${docsText || 'No documents uploaded yet.'}
  
  GAPS IDENTIFIED:
  ${gapsText || 'No gaps identified.'}
  
  Please provide prioritized suggestions for completing this IND submission. Focus on:
  1. Critical modules that should be addressed first
  2. Specific document types needed in each module
  3. Any potential issues or warnings based on the current document set
  
  Format your response as 3-5 prioritized action items.
  `;

  try {
    // Get AI-powered suggestions
    const aiSuggestions = await aiUtils.processWithOpenAI(
      prompt,
      'Provide prioritized suggestions for completing an IND submission based on the identified gaps.'
    );

    // Parse and structure the suggestions
    const suggestionLines = aiSuggestions
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .slice(0, 5); // Limit to 5 suggestions

    return {
      prioritized_actions: suggestionLines,
      critical_next_steps: getCriticalNextSteps(gaps),
    };
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    // Fallback to basic suggestions if AI fails
    return {
      prioritized_actions: getBasicSuggestions(gaps),
      critical_next_steps: getCriticalNextSteps(gaps),
    };
  }
}

/**
 * Get critical next steps based on gap analysis
 *
 * @param {Object} gaps - Gaps analysis by module
 * @returns {Array} - Critical next steps
 */
function getCriticalNextSteps(gaps) {
  const criticalSteps = [];

  // Add steps for critical modules first
  Object.entries(gaps).forEach(([moduleId, moduleInfo]) => {
    if (moduleInfo.importance === 'critical' && moduleInfo.missing_documents.length > 0) {
      criticalSteps.push({
        module_id: moduleId,
        module_name: moduleInfo.module_name,
        action: `Complete Module ${moduleId} by adding: ${moduleInfo.missing_documents.join(', ')}`,
      });
    }
  });

  return criticalSteps.slice(0, 3); // Return top 3 critical steps
}

/**
 * Generate basic suggestions without AI
 *
 * @param {Object} gaps - Gaps analysis by module
 * @returns {Array} - Basic suggestions
 */
function getBasicSuggestions(gaps) {
  const suggestions = [];

  // Add suggestions for critical modules first
  Object.entries(gaps).forEach(([moduleId, moduleInfo]) => {
    if (moduleInfo.importance === 'critical') {
      suggestions.push(
        `Complete Module ${moduleId} (${moduleInfo.module_name}) by adding the missing documents.`
      );
    }
  });

  // General suggestion
  suggestions.push(
    'Review each module to ensure all required documents are included and properly formatted.'
  );

  return suggestions;
}

export default router;
