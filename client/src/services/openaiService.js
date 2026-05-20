/**
 * AI Service (Client-side)
 *
 * Routes all AI calls through the server-side /api/ai/completion endpoint.
 * Uses Claude/Anthropic as the primary AI provider via the unified AI client.
 *
 * Migrated from direct OpenAI SDK to server proxy — no API keys in the browser.
 */

/**
 * Helper: call the server-side AI completion endpoint
 */
async function callAI({ systemPrompt, userPrompt, jsonMode = false, temperature = 0.2, maxTokens }) {
  const response = await fetch('/api/ai/completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode,
      temperature,
      maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`AI completion failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return jsonMode ? data : data.content;
}

/**
 * Generate a Clinical Evaluation Report based on provided device information and data
 */
export async function generateCER(deviceData, clinicalData, literature, templateSettings) {
  try {
    const result = await callAI({
      systemPrompt: `You are an expert medical device regulatory writer specialized in Clinical Evaluation Reports
        for EU MDR compliance. Generate structured, professional CER content based on the provided data.
        Ensure all content meets regulatory standards and follows professional medical writing conventions.`,
      userPrompt: JSON.stringify({ task: 'Generate a Clinical Evaluation Report', deviceData, clinicalData, literature, templateSettings }),
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 4000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error generating CER:', error);
    throw new Error(`Failed to generate CER: ${error.message}`);
  }
}

/**
 * Analyze clinical data and extract key findings
 */
export async function analyzeClinicalData(clinicalData) {
  try {
    const result = await callAI({
      systemPrompt: `You are an expert medical data analyst specialized in analyzing clinical data for
        medical devices. Extract and summarize key findings, safety endpoints, efficacy results,
        and identify potential concerns or positive outcomes.`,
      userPrompt: JSON.stringify({ task: 'Analyze clinical data and extract key findings', clinicalData }),
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 2000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error analyzing clinical data:', error);
    throw new Error(`Failed to analyze clinical data: ${error.message}`);
  }
}

/**
 * Generate a literature review based on provided literature references
 */
export async function generateLiteratureReview(literatureItems, deviceData) {
  try {
    const result = await callAI({
      systemPrompt: `You are an expert medical literature review specialist. Create a comprehensive
        literature review for a medical device CER based on the provided references. Analyze methodologies,
        outcomes, and relevance to the device. Identify key findings and their significance.`,
      userPrompt: JSON.stringify({ task: 'Generate a literature review for a CER', deviceData, literatureItems }),
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 3000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error generating literature review:', error);
    throw new Error(`Failed to generate literature review: ${error.message}`);
  }
}

/**
 * Generate a risk assessment based on device information and clinical data
 */
export async function generateRiskAssessment(deviceData, clinicalData, riskScore) {
  try {
    const result = await callAI({
      systemPrompt: `You are an expert medical device risk assessment specialist. Create a comprehensive
        risk assessment for a medical device CER based on the provided data. Identify potential risks,
        their severity, probability, and recommended mitigations. Evaluate the benefit-risk ratio.`,
      userPrompt: JSON.stringify({ task: 'Generate a risk assessment for a CER', deviceData, clinicalData, riskScore }),
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 2000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error generating risk assessment:', error);
    throw new Error(`Failed to generate risk assessment: ${error.message}`);
  }
}

/**
 * Perform document analysis on an uploaded PDF or document
 */
export async function analyzeDocument(documentText, documentType) {
  try {
    const result = await callAI({
      systemPrompt: `You are an expert document analyst specialized in medical and regulatory documents.
        Extract key information, structure, and findings from the provided document text based on its type.
        Identify author, publication details, methodology, results, and conclusions where applicable.`,
      userPrompt: JSON.stringify({
        task: 'Analyze document and extract key information',
        documentType,
        documentText: documentText.substring(0, 15000),
      }),
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 2000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error analyzing document:', error);
    throw new Error(`Failed to analyze document: ${error.message}`);
  }
}

/**
 * Generate executive summary for the CER
 */
export async function generateExecutiveSummary(cerData) {
  try {
    const content = await callAI({
      systemPrompt: `You are an expert medical writer specializing in executive summaries for clinical
        evaluation reports. Create a concise, professional executive summary that captures the key
        findings, conclusions, and significance of the CER. Highlight the benefit-risk ratio and
        regulatory compliance status.`,
      userPrompt: JSON.stringify({ task: 'Generate an executive summary for a CER', cerData }),
      temperature: 0.3,
      maxTokens: 1000,
    });
    return typeof content === 'string' ? content : content.content;
  } catch (error) {
    console.error('Error generating executive summary:', error);
    throw new Error(`Failed to generate executive summary: ${error.message}`);
  }
}

/**
 * Generate method validation protocol
 */
export async function generateMethodValidationProtocol(methodData) {
  try {
    const result = await callAI({
      systemPrompt: `You are an expert analytical chemist and regulatory specialist. Generate comprehensive method validation protocols following ICH guidelines and industry best practices.`,
      userPrompt: JSON.stringify({ task: 'Generate method validation protocol', methodData }),
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 3000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error generating method validation protocol:', error);
    throw new Error(`Failed to generate method validation protocol: ${error.message}`);
  }
}

/**
 * Assess regulatory compliance for specifications
 */
export async function assessRegulatoryCompliance(specData) {
  try {
    const result = await callAI({
      systemPrompt: `You are a regulatory compliance expert specializing in pharmaceutical specifications. Assess compliance with relevant guidelines and provide recommendations.`,
      userPrompt: JSON.stringify({ task: 'Assess regulatory compliance', specData }),
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 2000,
    });
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch (error) {
    console.error('Error assessing regulatory compliance:', error);
    throw new Error(`Failed to assess regulatory compliance: ${error.message}`);
  }
}

export async function analyzeRegulatoryCompliance(documentContent, moduleType, section) {
  return assessRegulatoryCompliance({ documentContent, moduleType, section });
}

/**
 * Generate batch documentation
 */
export async function generateBatchDocumentation(batchData) {
  try {
    return await aiRequest('/api/ai/completion', {
      taskType: 'document_drafting',
      systemPrompt: 'You are a pharmaceutical manufacturing expert. Generate batch documentation.',
      userPrompt: JSON.stringify({ task: 'Generate batch documentation', batchData }),
      jsonMode: true,
      maxTokens: 3000,
      temperature: 0.2,
    });
  } catch (error) {
    console.error('Error generating batch documentation:', error);
    throw new Error(`Failed to generate batch documentation: ${error.message}`);
  }
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
  generateBatchDocumentation,
};
