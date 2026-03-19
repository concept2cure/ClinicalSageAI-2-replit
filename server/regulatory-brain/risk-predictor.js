/**
 * Risk Predictor Agent
 *
 * This module analyzes a partially completed IND submission and predicts the risk of:
 * - Clinical Hold
 * - Refusal to File (RTF)
 * - Information Request (IR)
 *
 * It provides a competitive advantage by allowing users to identify and mitigate
 * regulatory risks before submission.
 */

// Initialize OpenAI client
let openai;
try {

} catch {
  console.warn('OPENAI_API_KEY not found in environment variables');
}
import { ai } from '../lib/unified-ai-client';

/**
 * Predicts submission risks based on the current state of the IND application
 * @param {Object} submissionDraft - Information about the current submission draft
 * @returns {Promise<Object>} - Risk assessment results
 */
async function predictSubmissionRisk(submissionDraft) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check API key.');
  }

  try {
    const prompt = `
      Given the following partial IND submission draft:

      - Filled Sections: ${JSON.stringify(submissionDraft.filledSections)}
      - Missing Sections: ${JSON.stringify(submissionDraft.missingSections)}
      - Drug Type: ${submissionDraft.drugType || 'Not specified'}
      - Application Type: ${submissionDraft.applicationType || 'Not specified'}

      Estimate the risk percentages for:
      1. Clinical Hold
      2. Refusal to File (RTF)
      3. Information Request (IR)

      Also, explain the main contributing factors.

      Respond in JSON format with the following structure:
      {
        "clinical_hold_risk": number,
        "refusal_to_file_risk": number,
        "information_request_risk": number,
        "key_factors": [string],
        "recommended_actions": [string]
      }
    `;

    const aiResult = await ai.chat({
      model: 'gpt-4o', // Updated to the latest version
      messages: [
        {
          role: 'system',
          content:
            'You are a senior FDA Regulatory Risk Analyst with expertise in IND submissions. Respond only with properly formatted JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.0,
    });

    // Parse the response into JSON
    const responseText = aiResult.content;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error predicting submission risk:', error);

    // Return a structured error response
    return {
      clinical_hold_risk: 50, // Default to 50% when unable to calculate
      refusal_to_file_risk: 30,
      information_request_risk: 60,
      key_factors: ['Unable to assess risk factors due to service error'],
      recommended_actions: [
        'Consult with a regulatory expert to assess submission risks',
        'Ensure all required sections are complete',
        'Review FDA guidance documents for your specific drug type',
      ],
      error_details: error.message,
    };
  }
}

/**
 * Generates a regulatory intelligence report based on the submission and risk assessment
 * @param {Object} submissionData - Information about the submission
 * @param {Object} riskAssessment - Risk assessment results
 * @returns {Promise<Object>} - Regulatory intelligence report
 */
async function generateRegulatoryReport(submissionData, riskAssessment) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check API key.');
  }

  try {
    const prompt = `
      Generate a comprehensive regulatory intelligence report for an IND submission with:

      - Drug Type: ${submissionData.drugType || 'Not specified'}
      - Application Type: ${submissionData.applicationType || 'Not specified'}
      - Risk Assessment: ${JSON.stringify(riskAssessment)}

      The report should include:
      1. Executive Summary
      2. Risk Analysis
      3. Regulatory Strategy Recommendations
      4. Relevant FDA Precedents
      5. Timeline Projections

      Format as a structured JSON report.
    `;

    const aiResult = await ai.chat({
      model: 'gpt-4o', // Updated to the latest version
      messages: [
        {
          role: 'system',
          content:
            'You are a senior FDA regulatory affairs consultant specializing in strategic intelligence. Create a comprehensive and actionable regulatory intelligence report.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
    });

    // Parse the response into JSON
    const responseText = aiResult.content;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error generating regulatory report:', error);

    // Return a structured error response
    return {
      error: 'Failed to generate regulatory intelligence report',
      error_details: error.message,
      partial_report: {
        executive_summary:
          'Unable to generate a complete regulatory report due to technical issues.',
      },
    };
  }
}

/**
 * Analyzes the clinical protocol for potential FDA concerns
 * @param {Object} protocolData - Protocol information
 * @returns {Promise<Object>} - Protocol risk assessment
 */
async function analyzeProtocolRisks(protocolData) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check API key.');
  }

  try {
    const prompt = `
      Analyze the following clinical protocol for potential FDA concerns:

      - Protocol Title: ${protocolData.title || 'Not provided'}
      - Phase: ${protocolData.phase || 'Not provided'}
      - Indication: ${protocolData.indication || 'Not provided'}
      - Patient Population: ${protocolData.population || 'Not provided'}
      - Primary Endpoint: ${protocolData.primaryEndpoint || 'Not provided'}
      - Dosing Regimen: ${protocolData.dosingRegimen || 'Not provided'}
      - Safety Monitoring: ${protocolData.safetyMonitoring || 'Not provided'}

      Identify potential regulatory concerns, citing relevant guidances and precedents.
      Provide a numerical risk score (0-100) for different aspects of the protocol.
      
      Respond in JSON format.
    `;

    const aiResult = await ai.chat({
      model: 'gpt-4o', // Updated to the latest version
      messages: [
        {
          role: 'system',
          content:
            'You are a clinical regulatory expert who specializes in FDA protocol reviews. Respond with detailed analysis in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    });

    // Parse the response into JSON
    const responseText = aiResult.content;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error analyzing protocol risks:', error);

    // Return a structured error response
    return {
      error: 'Failed to analyze protocol risks',
      error_details: error.message,
      recommendation: 'Please consult with a regulatory expert to review your protocol design.',
    };
  }
}

export { predictSubmissionRisk, generateRegulatoryReport, analyzeProtocolRisks };
