/**
 * CER AI Integration Service
 *
 * Routes all AI calls through the server-side /api/ai/completion endpoint
 * to avoid exposing API keys in the browser.
 *
 * Migrated from direct OpenAI SDK to server proxy (Claude/Anthropic backend).
 */

import OpenAI from 'openai';

// SECURITY: OpenAI calls must go through the backend API gateway.
// Direct client-side calls with API keys are forbidden in production.
// This stub preserves the interface while routing through /api/ai/*.
const openai = null; // Removed: never expose API keys in the browser bundle

// Queue for managing concurrent OpenAI API requests to avoid rate limits
// This is a simple implementation of request throttling
// Queue for managing concurrent API requests to avoid rate limits
class RequestQueue {
  constructor(maxConcurrent = 3, cooldownMs = 200) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
    this.cooldownMs = cooldownMs;
    this.lastRequestTime = 0;
  }

  async add(asyncFn) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.running++;
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.cooldownMs) {
            await new Promise(r => setTimeout(r, this.cooldownMs - timeSinceLastRequest));
          }
          this.lastRequestTime = Date.now();
          const result = await asyncFn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      };
      this.queue.push(task);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      task();
    }
  }
}

const apiRequestQueue = new RequestQueue(3, 1000);

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
 * Generate a clinical evaluation section
 */
export const generateCERSection = async (
  deviceData,
  clinicalData,
  regulatoryFrameworks = ['EU MDR', 'ISO 14155'],
  options = {}
) => {
  const { temperature = 0.2, maxAttempts = 3 } = options;

  let attempts = 0;
  let lastError = null;

  const systemPrompt = `You are a regulatory medical device expert specializing in creating Clinical Evaluation Reports.
  Follow these guidelines:
  - Use formal, scientific language appropriate for regulatory submissions
  - Reference clinical data and literature when making claims
  - Ensure compliance with ${regulatoryFrameworks.join(', ')} requirements
  - Format your response in a structured manner with clear sections
  - Use evidence-based approaches to demonstrate safety and performance
  - Be concise but comprehensive
  - Highlight critical safety and performance aspects`;

  const userPrompt = `Generate a detailed clinical evaluation section for the following medical device:

  Device Information:
  ${JSON.stringify(deviceData, null, 2)}

  Clinical Data:
  ${JSON.stringify(clinicalData, null, 2)}

  Please structure the content with appropriate headings, citations, and regulatory compliance considerations.
  Respond in JSON format with the following structure:
  {
    "title": "Section title",
    "content": "Complete formatted content with paragraphs",
    "summary": "Brief executive summary",
    "regulatoryConsiderations": ["List of applicable regulations addressed"],
    "citations": ["List of citations used"],
    "riskBenefitAnalysis": "Assessment of risks vs benefits"
  }`;

  while (attempts < maxAttempts) {
    try {
      console.log(`Generating CER section attempt ${attempts + 1}/${maxAttempts}`);

      const result = await apiRequestQueue.add(() =>
        callAI({ systemPrompt, userPrompt, jsonMode: true, temperature })
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const requiredFields = ['title', 'content', 'summary'];
      const missingFields = requiredFields.filter(field => !parsed[field]);
      if (missingFields.length > 0) {
        throw new Error(`Response missing required fields: ${missingFields.join(', ')}`);
      }
      return parsed;
    } catch (error) {
      lastError = error;
      attempts++;
      console.error(`CER section generation attempt ${attempts} failed:`, error);
      if (attempts < maxAttempts) {
        const backoffTime = Math.pow(2, attempts - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  throw new Error(
    `Failed to generate CER content after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Perform regulatory compliance analysis
 */
export const analyzeRegulatoryCERCompliance = async (
  documentContent,
  regulatoryFrameworks = ['EU MDR', 'ISO 14155'],
  options = {}
) => {
  const { temperature = 0.2, maxRetries = 2, truncateLength = 30000 } = options;

  let attempts = 0;
  let lastError = null;

  const truncatedContent =
    documentContent.length > truncateLength
      ? documentContent.substring(0, truncateLength) +
        `\n\n[Content truncated due to length. Analysis based on first ${truncateLength} characters.]\n`
      : documentContent;

  const systemPrompt = `You are a regulatory compliance expert specializing in medical device documentation.
  Your task is to analyze a Clinical Evaluation Report for compliance with ${regulatoryFrameworks.join(', ')}.

  Specifically assess compliance with:
  - EU MDR Article 61 (Clinical Evaluation)
  - Annex XIV (Clinical Evaluation and Post-Market Clinical Follow-up)
  - MEDDEV 2.7/1 Rev 4 (Clinical Evaluation) guidance document
  - ISO 14155 (Clinical investigation of medical devices for human subjects)

  Be specific in your feedback and provide actionable recommendations.`;

  const userPrompt = `Analyze the following Clinical Evaluation Report content for regulatory compliance:

  ${truncatedContent}

  Respond in JSON format with the following structure:
  {
    "complianceScore": 85,
    "summary": "Brief overall assessment",
    "compliance": { "compliant": [], "nonCompliant": [] },
    "gaps": [{ "issue": "", "details": "", "impact": "High/Medium/Low", "recommendation": "" }],
    "strengths": [],
    "recommendations": [],
    "regulatoryIssues": [{ "regulation": "", "issue": "", "severity": "High/Medium/Low", "recommendation": "" }]
  }`;

  while (attempts < maxRetries) {
    try {
      console.log(`Analyzing CER compliance (attempt ${attempts + 1}/${maxRetries})`);

      const result = await apiRequestQueue.add(() =>
        callAI({ systemPrompt, userPrompt, jsonMode: true, temperature })
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      if (!parsed.complianceScore && parsed.complianceScore !== 0) {
        throw new Error('Response missing required field: complianceScore');
      }

      return {
        ...parsed,
        analysisMetadata: {
          analyzedAt: new Date().toISOString(),
          frameworksAnalyzed: regulatoryFrameworks,
          contentLength: documentContent.length,
          wasTruncated: documentContent.length > truncateLength,
        },
      };
    } catch (error) {
      lastError = error;
      attempts++;
      console.error(`CER compliance analysis attempt ${attempts} failed:`, error);
      if (attempts < maxRetries) {
        const backoffTime = Math.pow(2, attempts - 1) * 1000 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  return {
    complianceScore: 50,
    summary: 'Automated compliance analysis failed. Manual review recommended.',
    compliance: { compliant: ['Unable to determine automatically'], nonCompliant: ['Unable to determine automatically'] },
    gaps: [{ issue: 'Automated analysis failed', details: lastError?.message || 'Unknown error', impact: 'High', recommendation: 'Please perform manual regulatory compliance review' }],
    strengths: ['Unable to analyze automatically'],
    recommendations: ['Retry analysis later', 'Perform manual compliance review with regulatory expert'],
    error: lastError?.message || 'Unknown error occurred',
    analysisMetadata: { error: true, attemptsMade: attempts, analyzedAt: new Date().toISOString(), frameworksAnalyzed: regulatoryFrameworks },
  };
};

/**
 * Generate a complete CER report
 */
export const generateCompleteCERReport = async (deviceData, clinicalData, options = {}) => {
  const {
    regulatoryFrameworks = ['EU MDR', 'MEDDEV 2.7/1 Rev 4', 'ISO 14155'],
    riskClass = deviceData.riskClass || 'IIb',
    includeExecutiveSummary = true,
    includePMSPlan = true,
    detailLevel = 80,
    format = 'json',
    temperature = 0.2,
    maxAttempts = 2,
  } = options;

  let attempts = 0;
  let lastError = null;

  const systemPrompt = `You are a senior medical device regulatory expert specializing in Clinical Evaluation Reports.
  You're creating a complete CER for a Class ${riskClass} medical device under ${regulatoryFrameworks.join(', ')}.

  Create a comprehensive, scientifically-sound report with these key characteristics:
  - Structure strictly following MEDDEV 2.7/1 Rev 4 guidance
  - All mandatory sections required by EU MDR for a Class ${riskClass} device
  - Evidence-based statements with proper citations to the provided clinical data
  - Detailed evaluation of benefits and risks with quantitative analysis where possible
  - ${includePMSPlan ? 'Detailed post-market surveillance plan' : 'Summary of post-market considerations'}
  - ${detailLevel >= 80 ? 'Comprehensive and thorough analysis' : 'Focused analysis covering all essential elements concisely'}

  Important: Base your analysis ONLY on the device and clinical data provided.`;

  const responseStructure = format === 'json'
    ? `Respond in JSON format with this structure:
  {
    "title": "Clinical Evaluation Report for [Device Name]",
    "metadata": { "device": "", "manufacturer": "", "riskClass": "", "date": "", "regulatoryFrameworks": [] },
    "sections": [{ "title": "Section Title", "content": "Complete content", "subsections": [{ "title": "", "content": "" }] }],
    "references": []
  }`
    : `Format as a structured document with clear section numbering.`;

  while (attempts < maxAttempts) {
    try {
      console.log(`Generating CER report (attempt ${attempts + 1}/${maxAttempts})`);
      const maxTokens = format === 'json' ? 4000 : 8000;

      const result = await apiRequestQueue.add(() =>
        callAI({
          systemPrompt,
          userPrompt: `Generate a comprehensive Clinical Evaluation Report:

          Device Information:
          ${JSON.stringify(deviceData, null, 2)}

          Clinical Data:
          ${JSON.stringify(clinicalData, null, 2)}

          ${responseStructure}`,
          jsonMode: format === 'json',
          temperature,
          maxTokens,
        })
      );

      let reportContent;
      if (format === 'json') {
        reportContent = typeof result === 'string' ? JSON.parse(result) : result;
        if (!reportContent.title || !reportContent.sections || !Array.isArray(reportContent.sections)) {
          throw new Error('Response JSON is missing required fields: title or sections array');
        }
      } else {
        reportContent = typeof result === 'string' ? result : result.content;
      }

      return {
        report: reportContent,
        generatedAt: new Date().toISOString(),
        metadata: {
          deviceName: deviceData.name || 'Medical Device',
          manufacturer: deviceData.manufacturer || 'Unknown',
          regulatoryFrameworks,
          riskClass,
          generationOptions: { includeExecutiveSummary, includePMSPlan, detailLevel, format },
          completionTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      lastError = error;
      attempts++;
      console.error(`CER report generation attempt ${attempts} failed:`, error);
      if (attempts < maxAttempts) {
        const backoffTime = Math.pow(2, attempts - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  throw new Error(
    `Failed to generate CER report after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Generate literature review summary and analysis
 */
export const generateLiteratureReviewAnalysis = async (literatureItems, deviceData, options = {}) => {
  const { temperature = 0.3, maxRetries = 2, maxLiteratureItems = 15 } = options;

  let attempts = 0;
  let lastError = null;

  if (!literatureItems || !Array.isArray(literatureItems) || literatureItems.length === 0) {
    throw new Error('No literature items provided for analysis');
  }

  const sortedItems = [...literatureItems]
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, maxLiteratureItems);

  const trimmedItems = sortedItems.map(item => ({
    id: item.id, title: item.title, abstract: item.abstract, journal: item.journal,
    publicationDate: item.publicationDate, relevance: item.relevance, authors: item.authors,
  }));

  const systemPrompt = `You are a medical literature analysis expert specialized in clinical evaluation reports for medical devices under EU MDR regulations.
  Focus on extracting safety and performance data, evaluating evidence strength using GRADE methodology, and identifying gaps.`;

  const userPrompt = `Analyze the following ${trimmedItems.length} literature items for this medical device:

  Device Information:
  ${JSON.stringify(deviceData, null, 2)}

  Literature Items:
  ${JSON.stringify(trimmedItems, null, 2)}

  Respond in JSON format with this structure:
  {
    "summary": "", "keyFindings": [], "evidenceQuality": { "overall": "", "rationale": "" },
    "gaps": [], "regulatoryImplications": "", "safetyPerformanceSupport": "",
    "recommendedActions": [], "individualAssessments": [{ "id": "", "title": "", "relevance": "", "evidenceLevel": "", "keyContributions": [] }]
  }`;

  while (attempts < maxRetries) {
    try {
      console.log(`Generating literature review analysis (attempt ${attempts + 1}/${maxRetries})`);

      const result = await apiRequestQueue.add(() =>
        callAI({ systemPrompt, userPrompt, jsonMode: true, temperature })
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      if (!parsed.summary || !parsed.keyFindings || !Array.isArray(parsed.keyFindings)) {
        throw new Error('Response missing required fields: summary or keyFindings');
      }

      return {
        ...parsed,
        analysisMetadata: {
          analyzedAt: new Date().toISOString(),
          deviceName: deviceData.name || 'Medical Device',
          itemsAnalyzed: trimmedItems.length,
          totalItemsAvailable: literatureItems.length,
        },
      };
    } catch (error) {
      lastError = error;
      attempts++;
      console.error(`Literature review analysis attempt ${attempts} failed:`, error);
      if (attempts < maxRetries) {
        const backoffTime = Math.pow(2, attempts - 1) * 1000 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  throw new Error(
    `Failed to analyze literature after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

export default {
  generateCERSection,
  analyzeRegulatoryCERCompliance,
  generateCompleteCERReport,
  generateLiteratureReviewAnalysis,
};
