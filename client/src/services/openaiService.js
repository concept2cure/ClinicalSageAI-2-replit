import OpenAI from 'openai';

// Initialize the OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Note: In production, API calls should be made server-side
});

/**
 * Generate a Clinical Evaluation Report based on provided device information and data
 * @param {Object} deviceData - Information about the medical device
 * @param {Object} clinicalData - Clinical data for the medical device
 * @param {Array} literature - Selected literature references
 * @param {Object} templateSettings - Template configuration and settings
 * @returns {Promise<Object>} Generated CER content
 */
export async function generateCER(deviceData, clinicalData, literature, templateSettings) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical device regulatory writer specialized in Clinical Evaluation Reports
            for EU MDR compliance. Generate structured, professional CER content based on the provided data.
            Ensure all content meets regulatory standards and follows professional medical writing conventions.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate a Clinical Evaluation Report',
            deviceData,
            clinicalData,
            literature,
            templateSettings,
          }),
        },
      ],
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating CER:', error);
    throw new Error(`Failed to generate CER: ${error.message}`);
  }
}

/**
 * Analyze clinical data and extract key findings
 * @param {Object} clinicalData - Raw clinical data
 * @returns {Promise<Object>} Structured analysis results
 */
export async function analyzeClinicalData(clinicalData) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical data analyst specialized in analyzing clinical data for
            medical devices. Extract and summarize key findings, safety endpoints, efficacy results,
            and identify potential concerns or positive outcomes.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Analyze clinical data and extract key findings',
            clinicalData,
          }),
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing clinical data:', error);
    throw new Error(`Failed to analyze clinical data: ${error.message}`);
  }
}

/**
 * Generate a literature review based on provided literature references
 * @param {Array} literatureItems - Selected literature references
 * @param {Object} deviceData - Basic device information for context
 * @returns {Promise<Object>} Structured literature review
 */
export async function generateLiteratureReview(literatureItems, deviceData) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical literature review specialist. Create a comprehensive
            literature review for a medical device CER based on the provided references. Analyze methodologies,
            outcomes, and relevance to the device. Identify key findings and their significance.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate a literature review for a CER',
            deviceData,
            literatureItems,
          }),
        },
      ],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating literature review:', error);
    throw new Error(`Failed to generate literature review: ${error.message}`);
  }
}

/**
 * Generate a risk assessment based on device information and clinical data
 * @param {Object} deviceData - Device information
 * @param {Object} clinicalData - Clinical data
 * @param {number} riskScore - Risk score from 0-100
 * @returns {Promise<Object>} Risk assessment results
 */
export async function generateRiskAssessment(deviceData, clinicalData, riskScore) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical device risk assessment specialist. Create a comprehensive
            risk assessment for a medical device CER based on the provided data. Identify potential risks,
            their severity, probability, and recommended mitigations. Evaluate the benefit-risk ratio.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate a risk assessment for a CER',
            deviceData,
            clinicalData,
            riskScore,
          }),
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating risk assessment:', error);
    throw new Error(`Failed to generate risk assessment: ${error.message}`);
  }
}

/**
 * Perform document analysis on an uploaded PDF or document
 * @param {string} documentText - Extracted text from document
 * @param {string} documentType - Type of document (literature, clinical, etc.)
 * @returns {Promise<Object>} Document analysis results
 */
export async function analyzeDocument(documentText, documentType) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert document analyst specialized in medical and regulatory documents.
            Extract key information, structure, and findings from the provided document text based on its type.
            Identify author, publication details, methodology, results, and conclusions where applicable.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Analyze document and extract key information',
            documentType,
            documentText: documentText.substring(0, 15000), // Truncate for token limits
          }),
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing document:', error);
    throw new Error(`Failed to analyze document: ${error.message}`);
  }
}

/**
 * Generate executive summary for the CER
 * @param {Object} cerData - Complete CER data
 * @returns {Promise<string>} Executive summary text
 */
export async function generateExecutiveSummary(cerData) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical writer specializing in executive summaries for clinical
            evaluation reports. Create a concise, professional executive summary that captures the key
            findings, conclusions, and significance of the CER. Highlight the benefit-risk ratio and
            regulatory compliance status.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate an executive summary for a CER',
            cerData,
          }),
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating executive summary:', error);
    throw new Error(`Failed to generate executive summary: ${error.message}`);
  }
}

/**
 * Generate method validation protocol
 * @param {Object} methodData - Method information and parameters
 * @returns {Promise<Object>} Generated protocol content
 */
export async function generateMethodValidationProtocol(methodData) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert analytical chemist and regulatory specialist. Generate comprehensive method validation protocols following ICH guidelines and industry best practices.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate method validation protocol',
            methodData,
          }),
        },
      ],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating method validation protocol:', error);
    throw new Error(`Failed to generate method validation protocol: ${error.message}`);
  }
}

/**
 * Assess regulatory compliance for specifications
 * @param {Object} specData - Specification data to assess
 * @returns {Promise<Object>} Compliance assessment results
 */
export async function assessRegulatoryCompliance(specData) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a regulatory compliance expert specializing in pharmaceutical specifications. Assess compliance with relevant guidelines and provide recommendations.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Assess regulatory compliance',
            specData,
          }),
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error assessing regulatory compliance:', error);
    throw new Error(`Failed to assess regulatory compliance: ${error.message}`);
  }
}

export async function analyzeRegulatoryCompliance(documentContent, moduleType, section) {
  return assessRegulatoryCompliance({
    documentContent,
    moduleType,
    section,
  });
}

/**
 * Simulate OpenAI response for development/testing
 * @param {string} prompt - Input prompt
 * @returns {Promise<Object>} Simulated response
 */
export async function simulateOpenAIResponse(prompt) {
  // Return a structured response that matches expected format
  return {
    content: `Simulated response for: ${prompt}`,
    status: 'simulated',
    timestamp: new Date().toISOString(),
  };
}

export default {
  generateCER,
  analyzeClinicalData,
  generateLiteratureReview,
  generateRiskAssessment,
  analyzeDocument,
  generateExecutiveSummary,
  generateMethodValidationProtocol,
  assessRegulatoryCompliance,
  analyzeRegulatoryCompliance,
  simulateOpenAIResponse,
};
