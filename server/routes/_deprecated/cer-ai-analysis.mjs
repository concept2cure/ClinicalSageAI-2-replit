/**
 * CER AI Analysis API Routes
 *
 * This module provides endpoints for AI-powered analysis of Clinical Evaluation Report components,
 * including GSPR mapping, literature review, and clinical data analysis.
 */

import express from 'express';
import { OpenAI } from 'openai';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * AI-powered GSPR Analysis endpoint
 * POST /api/cer/ai-gspr-analysis
 */
router.post('/ai-gspr-analysis', async (req, res) => {
  try {
    const { deviceName, gspr, evidenceContext, currentAnalysis } = req.body;

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OpenAI API key is required for regulatory analysis. Please add this to environment variables.'
      );
    }

    // Generate AI analysis
    const analysisResults = await analyzeGsprWithGpt4o(
      deviceName,
      gspr,
      evidenceContext,
      currentAnalysis
    );

    res.json(analysisResults);
  } catch (error) {
    console.error('Error in AI GSPR analysis:', error);
    res.status(500).json({
      error: 'Failed to analyze GSPR',
      message: error.message,
    });
  }
});

/**
 * Analyze GSPR with GPT-4o model
 * @param {string} deviceName - The name of the device
 * @param {Object} gspr - The GSPR requirement details
 * @param {Array} evidenceContext - Clinical evidence sources
 * @param {Object} currentAnalysis - Current analysis state
 * @returns {Promise<Object>} - AI analysis results
 */
async function analyzeGsprWithGpt4o(deviceName, gspr, evidenceContext, currentAnalysis) {
  try {
    // Create comprehensive prompt for the AI model
    const prompt = `
      You are an expert regulatory consultant specializing in EU MDR compliance for medical devices.
      You are conducting a thorough analysis of a General Safety and Performance Requirement (GSPR)
      for the device "${deviceName || 'Medical Device'}" to determine compliance.
      
      GSPR DETAILS:
      - ID: ${gspr.id || 'Unknown'}
      - Title: ${gspr.title || 'Unknown'}
      - Description: ${gspr.description || 'Unknown'}
      
      CLINICAL EVIDENCE SOURCES:
      ${JSON.stringify(evidenceContext, null, 2) || 'No evidence provided'}
      
      CURRENT ANALYSIS STATE:
      ${JSON.stringify(currentAnalysis, null, 2) || 'No current analysis'}
      
      Based on the evidence provided, analyze this GSPR for the device and provide:
      
      1. REGULATORY INTERPRETATION: A clear interpretation of what this GSPR means specifically for this device
      2. ACCEPTANCE CRITERIA: Measurable criteria to determine when this GSPR is satisfied
      3. COMPLIANCE STATEMENT: A concise statement explaining how the evidence supports compliance
      4. CLINICAL RELEVANCE: Explanation of the clinical importance of this requirement
      5. EVIDENCE STRENGTH: Assessment of the evidence strength (low, medium, high)
      6. GAPS IDENTIFIED: Boolean indicating if evidence gaps exist
      7. GAP STATEMENT: Description of any identified gaps in evidence (if applicable)
      8. GAP IMPACT: Assessment of how gaps impact compliance (if applicable)
      9. NEXT STEPS: Recommended actions to address gaps (if applicable)
      10. COMPLIANCE STATUS: Overall compliance status (pending, partial, compliant)
      11. RISK: Assessment of risk related to this requirement (low, medium, high)
      
      Return your analysis in the following JSON format only:
      {
        "regulatoryInterpretation": string,
        "acceptanceCriteria": string,
        "complianceStatement": string,
        "clinicalRelevance": string,
        "evidenceStrength": "low"|"medium"|"high",
        "gapsIdentified": boolean,
        "gapStatement": string,
        "gapImpact": string,
        "nextSteps": string,
        "complianceStatus": "pending"|"partial"|"compliant",
        "risk": "low"|"medium"|"high"
      }
    `;

    // Call the OpenAI API with the latest GPT-4o model
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory consultant for medical device Clinical Evaluation Reports with deep knowledge of EU MDR, FDA, UKCA, Health Canada, and ICH requirements. You specialize in mapping clinical evidence to regulatory requirements and evaluating compliance with GSPRs. All responses must be in valid JSON format.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    // Parse the AI response
    const aiAnalysis = JSON.parse(response.choices[0].message.content);

    // Return the analysis
    return {
      ...aiAnalysis,
      analysisByGpt4o: true,
      analysisDate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error analyzing GSPR with GPT-4o:', error);

    // Don't fallback to simulation - throw the error to be handled by the caller
    throw new Error(
      `GPT-4o GSPR analysis failed: ${error.message}. Please ensure your OpenAI API key is valid and has sufficient credits.`
    );
  }
}

// Export the router
export default router;
