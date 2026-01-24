/**
 * Document Intelligence Hub
 *
 * This service integrates AI capabilities into the document editing workflow,
 * providing intelligent document analysis, content generation, and quality
 * assessment features.
 */

import * as msCopilotService from './msCopilotService';

/**
 * Initialize the document intelligence system for a document
 * @param {string} documentId - Document ID
 * @param {string} documentType - Document type (e.g., 'clinical-overview', 'csr')
 * @returns {Promise<object>} Intelligence session details
 */
export async function initializeIntelligence(documentId, documentType) {
  try {
    // Initialize Microsoft Copilot for this document
    const copilotSession = await msCopilotService.initializeCopilot(documentId);

    return {
      sessionId: `intel-${documentId}-${Date.now()}`,
      copilotSessionId: copilotSession.sessionId,
      active: true,
      documentType,
      capabilities: [
        'contentGeneration',
        'documentAnalysis',
        'qualityAssessment',
        'regulatoryCompliance',
        'patternRecognition',
      ],
    };
  } catch (error) {
    console.error('Failed to initialize document intelligence:', error);
    throw new Error('Could not initialize document intelligence');
  }
}

/**
 * Generate content for a specific document section
 * @param {string} sessionId - Intelligence session ID
 * @param {string} sectionType - Section type (e.g., 'safety', 'efficacy')
 * @param {object} context - Document context
 * @returns {Promise<object>} Generated content
 */
export async function generateSectionContent(sessionId, sectionType, context = {}) {
  try {
    let prompt = '';

    // Build appropriate prompt based on section type
    switch (sectionType) {
      case 'safety':
        prompt = 'Generate a comprehensive safety profile section based on clinical data';
        break;
      case 'efficacy':
        prompt = 'Generate an efficacy results section highlighting statistical significance';
        break;
      case 'methods':
        prompt = 'Generate a detailed methods section for a clinical study';
        break;
      case 'discussion':
        prompt = 'Generate a balanced discussion section interpreting results in context';
        break;
      default:
        prompt = `Generate content for ${sectionType} section following regulatory guidelines`;
    }

    // Extract copilot session ID from intelligence session ID
    const copilotSessionId = sessionId.replace('intel-', 'copilot-');

    // Use Microsoft Copilot to generate the content
    const result = await msCopilotService.generateContent(prompt, copilotSessionId);

    return {
      content: result.content,
      sectionType,
      quality: result.quality,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to generate section content:', error);
    throw new Error('Could not generate section content');
  }
}

/**
 * Analyze document for quality issues
 * @param {string} sessionId - Intelligence session ID
 * @param {string} documentId - Document ID
 * @returns {Promise<object>} Analysis results
 */
export async function analyzeDocumentQuality(sessionId, documentId) {
  try {
    // Extract copilot session ID from intelligence session ID
    const copilotSessionId = sessionId.replace('intel-', 'copilot-');

    // Use Microsoft Copilot to analyze the document
    const analysis = await msCopilotService.analyzeDocument(documentId, copilotSessionId);

    // Enhance with regulatory-specific analysis
    return {
      ...analysis,
      overallScore: calculateOverallScore(analysis),
      regulatoryItems: [
        {
          type: 'ICH_E3',
          compliance: 88,
          missingElements: ['Complete AE tables by SOC', 'Protocol deviations list'],
        },
        {
          type: 'CTD_FORMAT',
          compliance: 95,
          issues: ['Inconsistent heading levels in Module 2.5 subsections'],
        },
      ],
      recommendations: generateRecommendations(analysis),
    };
  } catch (error) {
    console.error('Failed to analyze document quality:', error);
    throw new Error('Could not analyze document quality');
  }
}

/**
 * Get writing improvement suggestions for document text
 * @param {string} sessionId - Intelligence session ID
 * @param {string} text - Document text
 * @returns {Promise<Array>} Writing suggestions
 */
export async function getWritingImprovements(sessionId, text) {
  try {
    // Extract copilot session ID from intelligence session ID
    const copilotSessionId = sessionId.replace('intel-', 'copilot-');

    // Get base suggestions from Microsoft Copilot
    const baseSuggestions = await msCopilotService.getWritingSuggestions(text, copilotSessionId);

    // Enhance with additional regulatory-specific suggestions
    const regulatorySuggestions = generateRegulatorySuggestions(text);

    return [...baseSuggestions, ...regulatorySuggestions];
  } catch (error) {
    console.error('Failed to get writing improvements:', error);
    throw new Error('Could not get writing improvement suggestions');
  }
}

/**
 * End an intelligence session
 * @param {string} sessionId - Intelligence session ID
 * @returns {Promise<boolean>} Whether the session was successfully ended
 */
export async function endIntelligenceSession(sessionId) {
  try {
    // Extract copilot session ID from intelligence session ID
    const copilotSessionId = sessionId.replace('intel-', 'copilot-');

    // End the Microsoft Copilot session
    await msCopilotService.endCopilotSession(copilotSessionId);

    return true;
  } catch (error) {
    console.error('Failed to end intelligence session:', error);
    return false;
  }
}

// Helper functions

/**
 * Calculate overall document quality score
 * @param {object} analysis - Document analysis results
 * @returns {number} Overall score
 */
function calculateOverallScore(analysis) {
  const weights = {
    readability: 0.25,
    clinicalAccuracy: 0.35,
    regulatoryCompliance: 0.25,
    formattingConsistency: 0.15,
  };

  return Math.round(
    analysis.readability.score * weights.readability +
      analysis.clinicalAccuracy.score * weights.clinicalAccuracy +
      analysis.regulatoryCompliance.score * weights.regulatoryCompliance +
      analysis.formattingConsistency.score * weights.formattingConsistency
  );
}

/**
 * Generate document recommendations based on analysis
 * @param {object} analysis - Document analysis results
 * @returns {Array} Recommendations
 */
function generateRecommendations(analysis) {
  const recommendations = [];

  // Add readability recommendations
  if (analysis.readability.score < 70) {
    recommendations.push(
      'Improve overall readability by simplifying technical language',
      'Break down complex sentences into shorter, clearer statements'
    );
  }

  // Add clinical accuracy recommendations
  if (analysis.clinicalAccuracy.score < 90) {
    recommendations.push(
      'Ensure consistent reporting of statistical results across tables and text',
      'Include confidence intervals for all efficacy endpoints'
    );
  }

  // Add regulatory compliance recommendations
  if (analysis.regulatoryCompliance.score < 95) {
    recommendations.push(
      'Add missing subject disposition diagram in Section 10.1',
      'Complete adverse event categorization by system organ class in Section 12.2.2'
    );
  }

  // Add formatting recommendations
  if (analysis.formattingConsistency.score < 80) {
    recommendations.push(
      'Standardize heading levels throughout the document',
      'Apply consistent table formatting for all results tables'
    );
  }

  return recommendations;
}

/**
 * Generate regulatory-specific writing suggestions
 * @param {string} text - Document text
 * @returns {Array} Regulatory suggestions
 */
function generateRegulatorySuggestions(text) {
  // In a real implementation, this would analyze the text for regulatory-specific issues

  // For demo purposes, return predetermined suggestions
  return [
    {
      type: 'regulatory-precision',
      original: 'The drug was generally safe.',
      suggestion:
        'The safety profile of the investigational product was characterized by predominantly mild to moderate adverse events, with no unexpected safety signals identified.',
      position: { start: 400, end: 425 },
    },
    {
      type: 'regulatory-compliance',
      original: 'We saw good results in the trial.',
      suggestion:
        'The primary endpoint was met with statistical significance (p<0.001), demonstrating clinical efficacy in accordance with the pre-specified analysis plan.',
      position: { start: 500, end: 530 },
    },
    {
      type: 'regulatory-consistency',
      original: 'adverse reactions included headache and nausea.',
      suggestion: 'Adverse reactions included headache (12.4%) and nausea (8.2%).',
      position: { start: 600, end: 650 },
    },
  ];
}
