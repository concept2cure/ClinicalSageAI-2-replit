/**
 * AI Service — Routes through server-side AI Gateway (Claude-first)
 *
 * All AI calls go through the server API which routes to Claude via the AI Gateway.
 * No API keys are exposed to the browser.
 *
 * @see server/lib/unified-ai-client.ts — Server-side Claude integration
 */

async function aiRequest(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `AI request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Generate a Clinical Evaluation Report based on provided device information and data
 */
export async function generateCER(deviceData, clinicalData, literature, templateSettings) {
  try {
    return await aiRequest('/api/ai/completion', {
      taskType: 'document_drafting',
      systemPrompt: `You are an expert medical device regulatory writer specialized in Clinical Evaluation Reports
        for EU MDR compliance. Generate structured, professional CER content based on the provided data.
        Ensure all content meets regulatory standards and follows professional medical writing conventions.`,
      userPrompt: JSON.stringify({
        task: 'Generate a Clinical Evaluation Report',
        deviceData, clinicalData, literature, templateSettings,
      }),
      jsonMode: true,
      maxTokens: 4000,
      temperature: 0.2,
    });
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
    return await aiRequest('/api/ai/completion', {
      taskType: 'document_analysis',
      systemPrompt: `You are an expert medical data analyst specialized in analyzing clinical data for
        medical devices. Extract and summarize key findings, safety endpoints, efficacy results,
        and identify potential concerns or positive outcomes.`,
      userPrompt: JSON.stringify({
        task: 'Analyze clinical data and extract key findings',
        clinicalData,
      }),
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.1,
    });
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
    return await aiRequest('/api/ai/completion', {
      taskType: 'document_drafting',
      systemPrompt: `You are an expert medical literature review specialist. Create a comprehensive
        literature review for a medical device CER based on the provided references.`,
      userPrompt: JSON.stringify({
        task: 'Generate a literature review for a CER',
        deviceData, literatureItems,
      }),
      jsonMode: true,
      maxTokens: 3000,
      temperature: 0.2,
    });
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
    return await aiRequest('/api/ai/completion', {
      taskType: 'regulatory_review',
      systemPrompt: `You are an expert medical device risk assessment specialist. Create a comprehensive
        risk assessment for a medical device CER based on the provided data.`,
      userPrompt: JSON.stringify({
        task: 'Generate a risk assessment for a CER',
        deviceData, clinicalData, riskScore,
      }),
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.1,
    });
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
    return await aiRequest('/api/ai/completion', {
      taskType: 'document_analysis',
      systemPrompt: `You are an expert document analyst specialized in medical and regulatory documents.
        Extract key information, structure, and findings from the provided document text.`,
      userPrompt: JSON.stringify({
        task: 'Analyze document and extract key information',
        documentType,
        documentText: documentText.substring(0, 15000),
      }),
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.1,
    });
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
    const result = await aiRequest('/api/ai/completion', {
      taskType: 'document_drafting',
      systemPrompt: `You are an expert medical writer specializing in executive summaries for clinical
        evaluation reports. Create a concise, professional executive summary.`,
      userPrompt: JSON.stringify({
        task: 'Generate an executive summary for a CER',
        cerData,
      }),
      maxTokens: 1000,
      temperature: 0.3,
    });
    return result.content || result;
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
    return await aiRequest('/api/ai/completion', {
      taskType: 'document_drafting',
      systemPrompt: `You are an expert analytical chemist and regulatory specialist. Generate comprehensive method validation protocols following ICH guidelines.`,
      userPrompt: JSON.stringify({ task: 'Generate method validation protocol', methodData }),
      jsonMode: true,
      maxTokens: 3000,
      temperature: 0.2,
    });
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
    return await aiRequest('/api/ai/completion', {
      taskType: 'regulatory_review',
      systemPrompt: `You are a regulatory compliance expert specializing in pharmaceutical specifications. Assess compliance with relevant guidelines.`,
      userPrompt: JSON.stringify({ task: 'Assess regulatory compliance', specData }),
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.1,
    });
  } catch (error) {
    console.error('Error assessing regulatory compliance:', error);
    throw new Error(`Failed to assess regulatory compliance: ${error.message}`);
  }
}

export async function analyzeRegulatoryCompliance(documentContent, moduleType, section) {
  return assessRegulatoryCompliance({ documentContent, moduleType, section });
}

/**
 * Simulate response for development/testing
 */
export async function simulateOpenAIResponse(prompt) {
  return {
    content: `Simulated response for: ${prompt}`,
    status: 'simulated',
    timestamp: new Date().toISOString(),
  };
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
  simulateOpenAIResponse,
  generateBatchDocumentation,
};
