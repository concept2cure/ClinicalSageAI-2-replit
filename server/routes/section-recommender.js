/**
 * Section Recommender API Routes
 *
 * This module handles the server-side API endpoints for the intelligent document
 * section recommender feature, including section recommendations, content suggestions,
 * and document gap analysis.
 */

const express = require('express');
const router = express.Router();
const { validateAuth, checkOrganizationAccess } = require('../middleware/auth.cjs');
const { OpenAI } = require('openai');
const { handleApiError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Get section recommendations for a document
 * @route POST /section-recommender/recommendations
 */
router.post('/recommendations', validateAuth, async (req, res) => {
  try {
    const { deviceProfile, documentType, organizationId } = req.body;

    if (!deviceProfile || !documentType) {
      return res.status(400).json({ error: 'Device profile and document type are required' });
    }

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    // Generate recommendations using OpenAI
    const recommendations = await generateSectionRecommendations(deviceProfile, documentType);

    logger.info(`Generated section recommendations for document type: ${documentType}`);

    return res.json(recommendations);
  } catch (error) {
    logger.error('Error in section recommendations: ' + error.message);
    return handleApiError(res, error, 'Failed to generate section recommendations');
  }
});

/**
 * Get content suggestions for a specific section
 * @route POST /section-recommender/content-suggestions
 */
router.post('/content-suggestions', validateAuth, async (req, res) => {
  try {
    const { deviceProfile, documentType, sectionKey, organizationId } = req.body;

    if (!deviceProfile || !documentType || !sectionKey) {
      return res.status(400).json({
        error: 'Device profile, document type, and section key are required',
      });
    }

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    // Generate content suggestions using OpenAI
    const suggestions = await generateContentSuggestions(deviceProfile, documentType, sectionKey);

    logger.info(`Generated content suggestions for section: ${sectionKey}`);

    return res.json(suggestions);
  } catch (error) {
    logger.error('Error in content suggestions: ' + error.message);
    return handleApiError(res, error, 'Failed to generate content suggestions');
  }
});

/**
 * Get gap analysis for a document
 * @route POST /section-recommender/gap-analysis
 */
router.post('/gap-analysis', validateAuth, async (req, res) => {
  try {
    const { deviceProfile, documentType, currentContent, organizationId } = req.body;

    if (!deviceProfile || !documentType || !currentContent) {
      return res.status(400).json({
        error: 'Device profile, document type, and current content are required',
      });
    }

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    // Generate gap analysis using OpenAI
    const analysis = await generateGapAnalysis(deviceProfile, documentType, currentContent);

    logger.info(`Generated gap analysis for document type: ${documentType}`);

    return res.json(analysis);
  } catch (error) {
    logger.error('Error in gap analysis: ' + error.message);
    return handleApiError(res, error, 'Failed to generate gap analysis');
  }
});

/**
 * Get section prioritization for a document
 * @route POST /section-recommender/section-priorities
 */
router.post('/section-priorities', validateAuth, async (req, res) => {
  try {
    const { deviceProfile, documentType, currentState, organizationId } = req.body;

    if (!deviceProfile || !documentType) {
      return res.status(400).json({
        error: 'Device profile and document type are required',
      });
    }

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    // Generate section prioritization using OpenAI
    const prioritization = await generateSectionPrioritization(
      deviceProfile,
      documentType,
      currentState || {}
    );

    logger.info(`Generated section prioritization for document type: ${documentType}`);

    return res.json(prioritization);
  } catch (error) {
    logger.error('Error in section prioritization: ' + error.message);
    return handleApiError(res, error, 'Failed to generate section prioritization');
  }
});

/**
 * Generate section recommendations using OpenAI
 */
async function generateSectionRecommendations(deviceProfile, documentType) {
  try {
    // Format prompt for OpenAI
    const prompt = formatPromptForSectionRecommendations(deviceProfile, documentType);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in document structure and organization. You analyze device profiles and provide intelligent recommendations for document organization.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    // Parse response
    const response = JSON.parse(completion.choices[0].message.content);

    return {
      recommendations: response.recommendations || [],
      priorityOrder: response.priorityOrder || [],
      insightSummary: response.insightSummary || '',
    };
  } catch (error) {
    logger.error('Error generating section recommendations: ' + error.message);
    throw new Error('Failed to generate section recommendations');
  }
}

/**
 * Generate content suggestions using OpenAI
 */
async function generateContentSuggestions(deviceProfile, documentType, sectionKey) {
  try {
    // Format prompt for OpenAI
    const prompt = formatPromptForContentSuggestions(deviceProfile, documentType, sectionKey);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory content expert. You provide detailed, regulation-compliant content suggestions for specific document sections.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    // Parse response
    const response = JSON.parse(completion.choices[0].message.content);

    return {
      suggestions: response.suggestions || [],
      keyPoints: response.keyPoints || [],
      regulatoryRequirements: response.regulatoryRequirements || [],
    };
  } catch (error) {
    logger.error('Error generating content suggestions: ' + error.message);
    throw new Error('Failed to generate content suggestions');
  }
}

/**
 * Generate gap analysis using OpenAI
 */
async function generateGapAnalysis(deviceProfile, documentType, currentContent) {
  try {
    // Format prompt for OpenAI
    const prompt = formatPromptForGapAnalysis(deviceProfile, documentType, currentContent);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory compliance expert. You analyze documents for gaps and provide actionable recommendations for improvement.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    // Parse response
    const response = JSON.parse(completion.choices[0].message.content);

    return {
      gaps: response.gaps || [],
      completeness: response.completeness || 0,
      recommendations: response.recommendations || [],
    };
  } catch (error) {
    logger.error('Error generating gap analysis: ' + error.message);
    throw new Error('Failed to generate gap analysis');
  }
}

/**
 * Generate section prioritization using OpenAI
 */
async function generateSectionPrioritization(deviceProfile, documentType, currentState) {
  try {
    // Format prompt for OpenAI
    const prompt = formatPromptForSectionPrioritization(deviceProfile, documentType, currentState);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory workflow expert. You analyze device profiles and document states to recommend optimal section completion order.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    // Parse response
    const response = JSON.parse(completion.choices[0].message.content);

    return {
      priorityOrder: response.priorityOrder || [],
      rationale: response.rationale || {},
      nextSteps: response.nextSteps || [],
    };
  } catch (error) {
    logger.error('Error generating section prioritization: ' + error.message);
    throw new Error('Failed to generate section prioritization');
  }
}

/**
 * Format prompt for section recommendations
 */
function formatPromptForSectionRecommendations(deviceProfile, documentType) {
  return `
Please analyze this medical device profile and provide recommendations for organizing a ${documentType.toUpperCase()} document.

Device Profile:
${JSON.stringify(deviceProfile, null, 2)}

Please respond with a JSON object containing:
1. "recommendations": An array of objects, each with:
   - "sectionKey": A unique key for the section (e.g., "intended_use", "device_description")
   - "sectionTitle": A human-readable title for the section
   - "priority": Priority level ("critical", "high", "medium", "low")
   - "rationale": Brief explanation of why this section is important
   - "keyPoints": Array of key points that should be included in this section

2. "priorityOrder": An ordered array of sectionKeys indicating the recommended order of completion

3. "insightSummary": A brief summary of key insights about the document structure based on the device profile

Base your recommendations on regulatory requirements for ${documentType.toUpperCase()} documents and the specific characteristics of this device.
`;
}

/**
 * Format prompt for content suggestions
 */
function formatPromptForContentSuggestions(deviceProfile, documentType, sectionKey) {
  return `
Please provide detailed content suggestions for the "${sectionKey}" section of a ${documentType.toUpperCase()} document for the following medical device:

Device Profile:
${JSON.stringify(deviceProfile, null, 2)}

Section: ${sectionKey}

Please respond with a JSON object containing:
1. "suggestions": An array of content suggestion objects, each with:
   - "title": A title for the suggestion
   - "description": A brief description of what this suggestion covers
   - "contentType": The type of content (e.g., "text", "table", "list", "figure")
   - "content": The actual suggested content
   - "regulatoryRequirements": Array of regulatory requirements this content addresses
   - "keyPoints": Array of key points covered by this content

2. "keyPoints": An array of overall key points that should be addressed in this section

3. "regulatoryRequirements": An array of regulatory requirements relevant to this section

Base your suggestions on regulatory requirements for ${documentType.toUpperCase()} documents and the specific characteristics of this device.
`;
}

/**
 * Format prompt for gap analysis
 */
function formatPromptForGapAnalysis(deviceProfile, documentType, currentContent) {
  return `
Please analyze the current content of a ${documentType.toUpperCase()} document for the following medical device and identify any gaps or deficiencies:

Device Profile:
${JSON.stringify(deviceProfile, null, 2)}

Current Document Content:
${JSON.stringify(currentContent, null, 2)}

Please respond with a JSON object containing:
1. "gaps": An array of gap objects, each with:
   - "title": A title for the gap
   - "description": A description of what is missing or deficient
   - "severity": Severity level ("critical", "high", "medium", "low")
   - "regulatory": Regulatory impact of this gap (if applicable)
   - "recommendation": Recommendation to address the gap
   - "sectionKey": The section key where this gap should be addressed (if applicable)

2. "completeness": A value between 0 and 1 indicating the overall completeness of the document

3. "recommendations": An array of general recommendations for improving the document

Base your analysis on regulatory requirements for ${documentType.toUpperCase()} documents and the specific characteristics of this device.
`;
}

/**
 * Format prompt for section prioritization
 */
function formatPromptForSectionPrioritization(deviceProfile, documentType, currentState) {
  return `
Please analyze this medical device profile and current document state to recommend the optimal order for completing the remaining sections of a ${documentType.toUpperCase()} document:

Device Profile:
${JSON.stringify(deviceProfile, null, 2)}

Current Document State:
${JSON.stringify(currentState, null, 2)}

Please respond with a JSON object containing:
1. "priorityOrder": An ordered array of section keys indicating the recommended order of completion

2. "rationale": An object with section keys as properties and rationale for the priority as values

3. "nextSteps": An array of recommended next steps to efficiently complete the document

Base your prioritization on regulatory requirements for ${documentType.toUpperCase()} documents, dependencies between sections, and the specific characteristics of this device.
`;
}

module.exports = router;
