/**
 * IND Validator Service
 *
 * This service validates IND submission fields against regulatory requirements
 * using OpenAI's GPT models and returns structured validation results.
 */

import OpenAI from 'openai';

// Initialize OpenAI client
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('OPENAI_API_KEY not found in environment variables');
}

/**
 * Validates sponsor information against regulatory requirements
 * @param {Object} sponsorInfo - Sponsor information object
 * @returns {Promise<Object>} - Validation results
 */
async function validateSponsorInfo(sponsorInfo) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check API key.');
  }

  try {
    const prompt = `
      Validate the following Sponsor Info Form for IND filing compliance under 21 CFR 312.23:
      
      Sponsor Name: ${sponsorInfo.sponsorName || '[Not Provided]'}
      Address: ${sponsorInfo.address || '[Not Provided]'}
      Contact Person: ${sponsorInfo.contactPerson || '[Not Provided]'}
      FDA Forms Uploaded: ${sponsorInfo.fdaFormsUploaded ? 'Yes' : 'No'}

      List missing required fields, regulatory citations, and recommendations.
      Respond in JSON format with the following structure:
      {
        "validation_findings": [
          {
            "severity": "error|warning|info",
            "issue": "Description of the issue",
            "citation": "Specific regulatory citation",
            "recommendation": "Recommended action"
          }
        ],
        "extracted_metadata": {
          "sponsor_name": "...",
          "contact_person": "..."
        },
        "confidence_score": 0-100
      }
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior FDA regulatory specialist experienced with IND submissions. Be formal, precise, regulatory-focused and respond only with properly formatted JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    });

    // Parse the response into JSON
    const responseText = response.choices[0].message.content;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error validating sponsor info:', error);

    // Return a structured error response
    return {
      validation_findings: [
        {
          severity: 'error',
          issue: 'Validation service error',
          citation: 'N/A',
          recommendation: 'Please try again later or contact support.',
        },
      ],
      error_details: error.message,
      confidence_score: 0,
    };
  }
}

/**
 * Validates protocol information against regulatory requirements
 * @param {Object} protocolInfo - Protocol information object
 * @returns {Promise<Object>} - Validation results
 */
async function validateProtocolInfo(protocolInfo) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check API key.');
  }

  try {
    const prompt = `
      Validate the following Protocol Information for IND filing compliance under 21 CFR 312.23:
      
      Protocol Title: ${protocolInfo.title || '[Not Provided]'}
      Phase: ${protocolInfo.phase || '[Not Provided]'}
      Study Design: ${protocolInfo.studyDesign || '[Not Provided]'}
      Indication: ${protocolInfo.indication || '[Not Provided]'}
      Dose: ${protocolInfo.dose || '[Not Provided]'}

      List missing required fields, regulatory citations, and recommendations.
      Respond in JSON format with severity levels for each finding.
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior FDA regulatory specialist experienced with IND submissions. Be formal, precise, regulatory-focused and respond only with properly formatted JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    });

    // Parse the response into JSON
    const responseText = response.choices[0].message.content;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error validating protocol info:', error);

    // Return a structured error response
    return {
      validation_findings: [
        {
          severity: 'error',
          issue: 'Validation service error',
          citation: 'N/A',
          recommendation: 'Please try again later or contact support.',
        },
      ],
      error_details: error.message,
      confidence_score: 0,
    };
  }
}

/**
 * Predicts the risk of clinical hold based on the provided IND information
 * @param {Object} indInfo - Complete IND information
 * @returns {Promise<Object>} - Risk assessment results
 */
async function predictClinicalHoldRisk(indInfo) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check API key.');
  }

  try {
    // Create a summarized version of the IND info for the prompt
    const indSummary = JSON.stringify(indInfo, null, 2);

    const prompt = `
      Analyze the following IND submission information and predict the risk of receiving a clinical hold:
      
      ${indSummary}

      Based on your regulatory expertise and analysis of historical FDA clinical hold patterns,
      provide:
      1. An overall risk percentage (0-100%)
      2. Key risk factors that could lead to a clinical hold
      3. Specific recommendations to mitigate these risks

      Respond in JSON format.
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior FDA regulatory specialist with experience analyzing IND submissions. Respond only with properly formatted JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
    });

    // Parse the response into JSON
    const responseText = response.choices[0].message.content;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error predicting clinical hold risk:', error);

    // Return a structured error response
    return {
      risk_percentage: 50, // Default to 50% when unable to calculate
      risk_factors: [
        {
          factor: 'Unable to assess risk factors',
          severity: 'unknown',
        },
      ],
      recommendations: ['Consider consulting with a regulatory expert to assess submission risks'],
      error_details: error.message,
    };
  }
}

export { validateSponsorInfo, validateProtocolInfo, predictClinicalHoldRisk };
