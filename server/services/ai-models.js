/**
 * AI Models Service
 *
 * This service provides advanced AI modeling capabilities for the TrialSage platform,
 * including predictive analytics, natural language processing, and machine learning models
 * specialized for regulatory and clinical data.
 */

import { OpenAI } from 'openai';
import { db } from '../db.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a predictive model for submission success
 * @param {string} submissionType - Submission type
 * @param {string} productType - Product type
 * @param {Array} historicalData - Historical submission data
 * @returns {Object} - Predictive model
 */
export async function generatePredictiveModel(submissionType, productType, historicalData) {
  console.log(`Generating predictive model for ${submissionType} (${productType})`);

  try {
    // Analyze historical data with AI
    const historicalAnalysis = await analyzeHistoricalData(
      submissionType,
      productType,
      historicalData
    );

    // Create model configuration
    const modelConfig = {
      submissionType,
      productType,
      factors: historicalAnalysis.factors,
      weights: historicalAnalysis.weights,
      threshold: historicalAnalysis.threshold,
      confidenceInterval: historicalAnalysis.confidenceInterval,
      version: '1.0',
      createdAt: new Date().toISOString(),
    };

    // Store model configuration in database
    await db.query(
      `
      INSERT INTO predictive_models
      (model_type, submission_type, product_type, configuration, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `,
      ['submission_success', submissionType, productType, JSON.stringify(modelConfig)]
    );

    // Return prediction function
    return {
      predict: submissionData => predictSubmissionSuccess(submissionData, modelConfig),
      version: modelConfig.version,
      factors: modelConfig.factors,
      createdAt: modelConfig.createdAt,
    };
  } catch (error) {
    console.error('Error generating predictive model:', error);
    throw error;
  }
}

/**
 * Analyze historical submission data to identify success factors
 * @param {string} submissionType - Submission type
 * @param {string} productType - Product type
 * @param {Array} historicalData - Historical submission data
 * @returns {Object} - Analysis results with factors and weights
 */
async function analyzeHistoricalData(submissionType, productType, historicalData) {
  try {
    // If we have enough historical data, analyze it
    if (historicalData.length >= 10) {
      // In a real implementation, this would use statistical analysis
      // For now, we'll use OpenAI to analyze the patterns

      const prompt = `
        You are an AI analyzing historical submission outcomes for regulatory submissions.
        
        Submission Type: ${submissionType}
        Product Type: ${productType}
        
        Historical Data: ${JSON.stringify(historicalData)}
        
        Based on this historical data, identify:
        1. The key factors that contribute to submission success
        2. The relative weights of these factors (0-1)
        3. A confidence threshold for prediction
        4. A reasonable confidence interval for predictions
        
        Format your response as a JSON object with the following structure:
        {
          "factors": [string],
          "weights": [number],
          "threshold": number,
          "confidenceInterval": number
        }
      `;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      return JSON.parse(completion.choices[0].message.content);
    } else {
      // Not enough data, use default model
      return {
        factors: [
          'complete_documentation',
          'protocol_quality',
          'statistical_analysis',
          'safety_data_quality',
          'manufacturing_compliance',
          'prior_interactions',
        ],
        weights: [0.25, 0.2, 0.15, 0.2, 0.1, 0.1],
        threshold: 0.7,
        confidenceInterval: 0.15,
      };
    }
  } catch (error) {
    console.error('Error analyzing historical data:', error);

    // Fallback to default model
    return {
      factors: [
        'complete_documentation',
        'protocol_quality',
        'statistical_analysis',
        'safety_data_quality',
        'manufacturing_compliance',
        'prior_interactions',
      ],
      weights: [0.25, 0.2, 0.15, 0.2, 0.1, 0.1],
      threshold: 0.7,
      confidenceInterval: 0.15,
    };
  }
}

/**
 * Predict submission success probability
 * @param {Object} submissionData - Submission data
 * @param {Object} modelConfig - Model configuration
 * @returns {Object} - Prediction result
 */
function predictSubmissionSuccess(submissionData, modelConfig) {
  try {
    // Extract factors from submission data
    let totalScore = 0;
    let totalWeight = 0;

    // Calculate weighted score
    modelConfig.factors.forEach((factor, index) => {
      const factorValue = submissionData[factor] || 0;
      const factorWeight = modelConfig.weights[index];

      totalScore += factorValue * factorWeight;
      totalWeight += factorWeight;
    });

    // Normalize score
    const probabilityScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Calculate confidence interval
    const lowerBound = Math.max(0, probabilityScore - modelConfig.confidenceInterval);
    const upperBound = Math.min(1, probabilityScore + modelConfig.confidenceInterval);

    return {
      probability: probabilityScore,
      confidenceInterval: [lowerBound, upperBound],
      success: probabilityScore >= modelConfig.threshold,
      factors: modelConfig.factors,
      modelVersion: modelConfig.version,
    };
  } catch (error) {
    console.error('Error predicting submission success:', error);

    // Return default prediction
    return {
      probability: 0.5,
      confidenceInterval: [0.35, 0.65],
      success: false,
      factors: modelConfig.factors,
      modelVersion: modelConfig.version,
      error: true,
    };
  }
}

/**
 * Generate text with AI for regulatory content
 * @param {string} prompt - Generation prompt
 * @param {Object} options - Generation options
 * @returns {Promise<string>} - Generated text
 */
export async function generateRegulatoryText(prompt, options = {}) {
  try {
    const systemPrompt =
      options.systemPrompt ||
      'You are an AI specialized in regulatory writing for pharmaceutical and biotech industries. ' +
        'Write in a clear, concise, and scientifically accurate manner. ' +
        'Follow all regulatory guidelines and standards in your writing.';

    const completion = await openai.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature || 0.2,
      max_tokens: options.maxTokens || 2000,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating regulatory text:', error);
    throw error;
  }
}

/**
 * Extract structured data from regulatory text
 * @param {string} text - Text to extract from
 * @param {Array} fields - Fields to extract
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Extracted data
 */
export async function extractRegulatoryData(text, fields, options = {}) {
  try {
    const systemPrompt =
      options.systemPrompt ||
      'You are an AI specialized in extracting structured information from regulatory documents. ' +
        'Extract the requested fields accurately, maintaining the original information without interpretation.';

    const fieldsList = fields.join(', ');
    const prompt = `
      Extract the following fields from this regulatory text:
      ${fieldsList}
      
      Text:
      ${text}
      
      Return the extracted data as a JSON object with the fields as keys.
      If a field is not found, set its value to null.
    `;

    const completion = await openai.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Error extracting regulatory data:', error);
    throw error;
  }
}

/**
 * Analyze text for regulatory compliance
 * @param {string} text - Text to analyze
 * @param {string} standard - Regulatory standard to check against
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} - Compliance analysis
 */
export async function analyzeRegulatoryCompliance(text, standard, options = {}) {
  try {
    const systemPrompt =
      options.systemPrompt ||
      'You are an AI specialized in regulatory compliance analysis. ' +
        'Evaluate the text against the specified regulatory standard or guideline. ' +
        'Provide a detailed compliance assessment with specific issues and recommendations.';

    const prompt = `
      Analyze this text for compliance with the following regulatory standard:
      ${standard}
      
      Text:
      ${text}
      
      Provide a compliance analysis in JSON format with:
      1. Overall compliance assessment (compliant, partially compliant, non-compliant)
      2. List of compliance issues
      3. Recommendations for addressing each issue
      4. Compliance score (0-100)
    `;

    const completion = await openai.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing regulatory compliance:', error);
    throw error;
  }
}

/**
 * Generate summary of regulatory document
 * @param {string} text - Document text
 * @param {Object} options - Summary options
 * @returns {Promise<string>} - Generated summary
 */
export async function generateRegulatoryDocumentSummary(text, options = {}) {
  try {
    const systemPrompt =
      options.systemPrompt ||
      'You are an AI specialized in summarizing regulatory documents. ' +
        'Create concise, accurate summaries that capture the key information ' +
        'while maintaining scientific integrity and regulatory accuracy.';

    const prompt = `
      Summarize the following regulatory document:
      
      ${text}
      
      ${options.length ? `Create a ${options.length} summary.` : 'Create a concise summary.'}
      ${options.focus ? `Focus on aspects related to ${options.focus}.` : ''}
      ${options.includeHeadings ? 'Include section headings in the summary.' : ''}
    `;

    const completion = await openai.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: options.maxTokens || 1000,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating regulatory document summary:', error);
    throw error;
  }
}
