/**
 * CER OpenAI Integration Service
 *
 * This service provides integration with OpenAI for advanced CER report generation,
 * content analysis, and regulatory compliance checking.
 */

import OpenAI from 'openai';

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // For client-side usage - in production, proxy through backend
  timeout: 60000, // 60 second timeout for API calls
  maxRetries: 3, // Retry up to 3 times for failed requests
});

// Queue for managing concurrent OpenAI API requests to avoid rate limits
// This is a simple implementation of request throttling
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
          // Ensure minimum time between requests
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

// Create a global request queue for OpenAI API calls
const apiRequestQueue = new RequestQueue(3, 1000); // Max 3 concurrent requests, 1 second cooldown

/**
 * Generate a clinical evaluation section with OpenAI
 *
 * @param {Object} deviceData - Information about the device
 * @param {Array} clinicalData - Clinical data and references
 * @param {Array} regulatoryFrameworks - Applicable regulatory frameworks
 * @returns {Promise<Object>} Generated CER section content
 */
/**
 * Generate a clinical evaluation section with OpenAI
 * Includes robust error handling, retry logic, and fallback mechanisms
 *
 * @param {Object} deviceData - Information about the device
 * @param {Array} clinicalData - Clinical data and references
 * @param {Array} regulatoryFrameworks - Applicable regulatory frameworks
 * @param {Object} options - Additional options (model, temperature, etc)
 * @returns {Promise<Object>} Generated CER section content
 */
export const generateCERSection = async (
  deviceData,
  clinicalData,
  regulatoryFrameworks = ['EU MDR', 'ISO 14155'],
  options = {}
) => {
  // Set default options with fallbacks
  const {
    model = 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    temperature = 0.2, // Lower temperature for more consistent, factual outputs
    maxAttempts = 3, // Maximum retry attempts
    fallbackModel = 'gpt-4', // Fallback model if primary fails
  } = options;

  let attempts = 0;
  let lastError = null;

  // Format system prompt with regulatory frameworks
  const systemPrompt = `You are a regulatory medical device expert specializing in creating Clinical Evaluation Reports.
  Follow these guidelines:
  - Use formal, scientific language appropriate for regulatory submissions
  - Reference clinical data and literature when making claims
  - Ensure compliance with ${regulatoryFrameworks.join(', ')} requirements
  - Format your response in a structured manner with clear sections
  - Use evidence-based approaches to demonstrate safety and performance
  - Be concise but comprehensive
  - Highlight critical safety and performance aspects`;

  // Format user prompt with device and clinical data
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

  // Retry loop with exponential backoff
  while (attempts < maxAttempts) {
    try {
      // Determine which model to use based on attempt number
      const currentModel = attempts === 0 ? model : fallbackModel;

      // Add attempt info to logs for debugging
      console.log(
        `Generating CER section attempt ${attempts + 1}/${maxAttempts} using model: ${currentModel}`
      );

      // Make the API call with the current configuration through our request queue
      const response = await apiRequestQueue.add(() =>
        openai.chat.completions.create({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: temperature,
        })
      );

      // Parse the response to verify it's valid JSON
      const content = response.choices[0].message.content;
      const result = JSON.parse(content);

      // Validate the response has required fields
      const requiredFields = ['title', 'content', 'summary'];
      const missingFields = requiredFields.filter(field => !result[field]);

      if (missingFields.length > 0) {
        throw new Error(`Response missing required fields: ${missingFields.join(', ')}`);
      }

      // If we get here, the response is valid - return it
      return result;
    } catch (error) {
      lastError = error;
      attempts++;

      // Log error details
      console.error(`CER section generation attempt ${attempts} failed:`, error);

      if (attempts < maxAttempts) {
        // Wait with exponential backoff before retrying (1s, 2s, 4s, etc.)
        const backoffTime = Math.pow(2, attempts - 1) * 1000;
        console.log(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  // If we've exhausted all attempts, throw the last error
  throw new Error(
    `Failed to generate CER content after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Perform regulatory compliance analysis with OpenAI
 *
 * @param {string} documentContent - The CER document content to analyze
 * @param {Array} regulatoryFrameworks - Applicable regulatory frameworks to check against
 * @param {Object} options - Additional options (temperature, max tokens, etc)
 * @returns {Promise<Object>} Compliance analysis results
 */
export const analyzeRegulatoryCERCompliance = async (
  documentContent,
  regulatoryFrameworks = ['EU MDR', 'ISO 14155'],
  options = {}
) => {
  // Set default options with fallbacks
  const {
    model = 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    temperature = 0.2,
    maxRetries = 2,
    fallbackModel = 'gpt-4',
    truncateLength = 30000, // Max chars to use from document (to avoid token limits)
  } = options;

  let attempts = 0;
  let lastError = null;

  // Truncate the document content if it's too long
  // This helps prevent hitting OpenAI token limits
  const truncatedContent =
    documentContent.length > truncateLength
      ? documentContent.substring(0, truncateLength) +
        `\n\n[Content truncated due to length. Analysis based on first ${truncateLength} characters.]\n`
      : documentContent;

  // Create more robust system prompt with specific regulatory details
  const systemPrompt = `You are a regulatory compliance expert specializing in medical device documentation.
  Your task is to analyze a Clinical Evaluation Report for compliance with ${regulatoryFrameworks.join(', ')}.
  
  Specifically assess compliance with:
  - EU MDR Article 61 (Clinical Evaluation)
  - Annex XIV (Clinical Evaluation and Post-Market Clinical Follow-up)
  - MEDDEV 2.7/1 Rev 4 (Clinical Evaluation) guidance document
  - ISO 14155 (Clinical investigation of medical devices for human subjects)
  
  Focus on:
  - Thoroughness of clinical data evaluation
  - Adequacy of literature search methodology
  - Scientific validity of conclusions
  - Benefit-risk determination
  - Gaps in evidence
  - Post-market surveillance planning
  - Documentation completeness
  
  Be specific in your feedback and provide actionable recommendations.`;

  const userPrompt = `Analyze the following Clinical Evaluation Report content for regulatory compliance:
  
  ${truncatedContent}
  
  Please provide a detailed compliance analysis including:
  1. Overall compliance score (0-100%)
  2. Identified gaps or missing elements
  3. Strengths of the documentation
  4. Recommendations for improvement
  5. Specific regulatory sections that need addressing
  
  Respond in JSON format with the following structure:
  {
    "complianceScore": 85,
    "summary": "Brief overall assessment",
    "compliance": {
      "compliant": ["List of compliant elements"],
      "nonCompliant": ["List of non-compliant elements"]
    },
    "gaps": [
      {
        "issue": "Description of gap",
        "details": "More detailed explanation",
        "impact": "High/Medium/Low",
        "recommendation": "How to address"
      }
    ],
    "strengths": ["List of strengths"],
    "recommendations": ["List of recommendations"],
    "regulatoryIssues": [
      {
        "regulation": "EU MDR Article X",
        "issue": "Description of the issue",
        "severity": "High/Medium/Low",
        "recommendation": "How to address it"
      }
    ]
  }`;

  // Implement retry loop with exponential backoff
  while (attempts < maxRetries) {
    try {
      // Use fallback model if not first attempt
      const currentModel = attempts === 0 ? model : fallbackModel;

      console.log(
        `Analyzing CER compliance (attempt ${attempts + 1}/${maxRetries}) using model: ${currentModel}`
      );

      const response = await apiRequestQueue.add(() =>
        openai.chat.completions.create({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: temperature,
        })
      );

      // Parse and validate the response
      const content = response.choices[0].message.content;
      const result = JSON.parse(content);

      // Validate required fields
      if (!result.complianceScore && result.complianceScore !== 0) {
        throw new Error('Response missing required field: complianceScore');
      }

      // Add metadata about the analysis
      return {
        ...result,
        analysisMetadata: {
          model: currentModel,
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
        // Exponential backoff with jitter
        const backoffTime = Math.pow(2, attempts - 1) * 1000 + Math.random() * 500;
        console.log(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  // If we've exhausted all attempts, create a fallback response
  // This ensures the UI can continue to function even if analysis fails
  console.error(`Failed to analyze compliance after ${maxRetries} attempts`);

  return {
    complianceScore: 50, // Default to middle score
    summary: 'Automated compliance analysis failed. Manual review recommended.',
    compliance: {
      compliant: ['Unable to determine automatically'],
      nonCompliant: ['Unable to determine automatically'],
    },
    gaps: [
      {
        issue: 'Automated analysis failed',
        details: lastError?.message || 'Unknown error occurred',
        impact: 'High',
        recommendation: 'Please perform manual regulatory compliance review',
      },
    ],
    strengths: ['Unable to analyze automatically'],
    recommendations: [
      'Retry analysis later',
      'Perform manual compliance review with regulatory expert',
    ],
    error: lastError?.message || 'Unknown error occurred',
    analysisMetadata: {
      error: true,
      attemptsMade: attempts,
      analyzedAt: new Date().toISOString(),
      frameworksAnalyzed: regulatoryFrameworks,
    },
  };
};

/**
 * Generate a complete CER report with OpenAI
 *
 * @param {Object} deviceData - Comprehensive device information
 * @param {Object} clinicalData - All clinical data, literature, and post-market data
 * @param {Object} options - Additional options for report generation
 * @returns {Promise<Object>} Complete CER report content
 */
export const generateCompleteCERReport = async (deviceData, clinicalData, options = {}) => {
  // Default options with fallbacks
  const {
    regulatoryFrameworks = ['EU MDR', 'MEDDEV 2.7/1 Rev 4', 'ISO 14155'],
    riskClass = deviceData.riskClass || 'IIb',
    includeExecutiveSummary = true,
    includePMSPlan = true,
    detailLevel = 80, // 0-100 scale for report detail level
    format = 'json',
    model = 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    temperature = 0.2,
    maxAttempts = 2,
    fallbackModel = 'gpt-4',
  } = options;

  // Tracking and retry variables
  let attempts = 0;
  let lastError = null;

  // Prepare the system prompt based on device risk class and regulatory requirements
  const systemPrompt = `You are a senior medical device regulatory expert specializing in Clinical Evaluation Reports.
  You're creating a complete CER for a Class ${riskClass} medical device under ${regulatoryFrameworks.join(', ')}.
  
  Create a comprehensive, scientifically-sound report with these key characteristics:
  - Structure strictly following MEDDEV 2.7/1 Rev 4 guidance
  - All mandatory sections required by EU MDR for a Class ${riskClass} device
  - Evidence-based statements with proper citations to the provided clinical data
  - Detailed evaluation of benefits and risks with quantitative analysis where possible
  - Clear assessment of available clinical evidence and identified gaps
  - Definitive conclusions on clinical safety and performance
  - ${includePMSPlan ? 'Detailed post-market surveillance plan and PMCF requirements' : 'Summary of post-market considerations'}
  - ${detailLevel >= 80 ? 'Comprehensive and thorough analysis with extensive detail' : 'Focused analysis covering all essential elements concisely'}
  
  Your report must be thorough, scientifically defensible, and comply with all relevant regulatory standards.
  Use formal scientific language appropriate for regulatory submissions.
  
  Important: Base your analysis ONLY on the device and clinical data provided, without introducing fictional data or studies.`;

  // Define the structure we want OpenAI to use for the full report
  const responseStructure = `
  Please generate a complete Clinical Evaluation Report following this structure:
  
  ${
    format === 'json'
      ? `Respond in JSON format with this exact structure:
  {
    "title": "Clinical Evaluation Report for [Device Name]",
    "metadata": {
      "device": "[Device Name]",
      "manufacturer": "[Manufacturer]",
      "riskClass": "[Class]",
      "date": "[Date]",
      "regulatoryFrameworks": ["List of frameworks"]
    },
    "sections": [
      {
        "title": "Executive Summary",
        "content": "Complete formatted content with paragraphs"
      },
      {
        "title": "Device Description and Intended Purpose",
        "content": "Complete description",
        "subsections": [
          {
            "title": "Technical Specifications",
            "content": "Technical details"
          },
          {
            "title": "Intended Use",
            "content": "Intended use description"
          }
        ]
      },
      ...additional sections with appropriate structure...
    ],
    "references": ["List of references used"]
  }`
      : `Format as a structured document with clear section numbering:

  1. EXECUTIVE SUMMARY
  2. DEVICE DESCRIPTION
     2.1 Intended Purpose
     2.2 Technical Specifications
     2.3 Classification
  3. SCOPE OF THE CLINICAL EVALUATION
     3.1 Clinical Evaluation Team
     3.2 Search Parameters and Strategy
  4. CLINICAL BACKGROUND AND STATE OF THE ART
  5. CLINICAL DATA IDENTIFICATION AND ANALYSIS
     5.1 Literature Data
     5.2 Clinical Investigation Data
     5.3 Post-Market Data
  6. EQUIVALENCE ANALYSIS (IF APPLICABLE)
  7. RISK-BENEFIT ANALYSIS
  8. POST-MARKET SURVEILLANCE PLAN
  9. CONCLUSIONS
  10. REFERENCES`
  }
  
  Each section must include complete, detailed content based on the provided data.`;

  // Retry loop with fallback mechanisms
  while (attempts < maxAttempts) {
    try {
      // Use fallback model if not first attempt
      const currentModel = attempts === 0 ? model : fallbackModel;

      console.log(
        `Attempting to generate CER report (attempt ${attempts + 1}/${maxAttempts}) using model: ${currentModel}`
      );

      // Adjust token/length parameters based on model and format
      const maxTokens = format === 'json' ? 4000 : 8000;

      const response = await apiRequestQueue.add(() =>
        openai.chat.completions.create({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Generate a comprehensive Clinical Evaluation Report for the following device and clinical data:
              
              Device Information:
              ${JSON.stringify(deviceData, null, 2)}
              
              Clinical Data:
              ${JSON.stringify(clinicalData, null, 2)}
              
              ${responseStructure}`,
            },
          ],
          temperature: temperature,
          max_tokens: maxTokens,
          response_format: format === 'json' ? { type: 'json_object' } : undefined,
        })
      );

      // Process the response based on format
      const responseContent = response.choices[0].message.content;
      let reportContent;

      if (format === 'json') {
        try {
          // Parse and validate JSON response
          reportContent = JSON.parse(responseContent);

          // Check if the response has the expected structure
          if (
            !reportContent.title ||
            !reportContent.sections ||
            !Array.isArray(reportContent.sections)
          ) {
            throw new Error('Response JSON is missing required fields: title or sections array');
          }

          // Make sure each section has title and content
          const invalidSections = reportContent.sections.filter(s => !s.title || !s.content);
          if (invalidSections.length > 0) {
            throw new Error(
              `Some sections (${invalidSections.length}) are missing title or content`
            );
          }
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
          throw new Error(`Failed to parse JSON response: ${parseError.message}`);
        }
      } else {
        // For text format, just use as-is
        reportContent = responseContent;
      }

      // Return the complete report package with metadata
      return {
        report: reportContent,
        generatedAt: new Date().toISOString(),
        model: currentModel,
        metadata: {
          deviceName: deviceData.name || 'Medical Device',
          manufacturer: deviceData.manufacturer || 'Unknown',
          regulatoryFrameworks,
          riskClass,
          generationOptions: {
            includeExecutiveSummary,
            includePMSPlan,
            detailLevel,
            format,
          },
          tokens: response.usage || { total_tokens: 'unknown' },
          completionTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      lastError = error;
      attempts++;

      console.error(`CER report generation attempt ${attempts} failed:`, error);

      // If we have attempts left, retry with backoff
      if (attempts < maxAttempts) {
        const backoffTime = Math.pow(2, attempts - 1) * 1000;
        console.log(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  // If we've exhausted all attempts, throw the last error
  console.error(`Failed to generate CER report after ${maxAttempts} attempts:`, lastError);
  throw new Error(
    `Failed to generate CER report after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Generate literature review summary and analysis with robust error handling
 *
 * @param {Array} literatureItems - Array of literature items with abstracts
 * @param {Object} deviceData - Basic device information for context
 * @param {Object} options - Additional options for generation
 * @returns {Promise<Object>} Literature review summary and analysis
 */
export const generateLiteratureReviewAnalysis = async (
  literatureItems,
  deviceData,
  options = {}
) => {
  // Default options with fallbacks
  const {
    model = 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    temperature = 0.3,
    maxRetries = 2,
    fallbackModel = 'gpt-4',
    maxLiteratureItems = 15, // Limit number of items to analyze to avoid token limits
  } = options;

  // Tracking variables
  let attempts = 0;
  let lastError = null;

  // Ensure we have valid input
  if (!literatureItems || !Array.isArray(literatureItems) || literatureItems.length === 0) {
    throw new Error('No literature items provided for analysis');
  }

  if (!deviceData || !deviceData.name) {
    console.warn('Limited device information provided for literature analysis');
  }

  // Limit number of items to analyze (taking highest relevance items first)
  const sortedItems = [...literatureItems]
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, maxLiteratureItems);

  // Trim items to essential data only to reduce token usage
  const trimmedItems = sortedItems.map(item => ({
    id: item.id,
    title: item.title,
    abstract: item.abstract,
    journal: item.journal,
    publicationDate: item.publicationDate,
    relevance: item.relevance,
    authors: item.authors,
  }));

  // Enhanced system prompt for better regulatory context
  const systemPrompt = `You are a medical literature analysis expert specialized in clinical evaluation reports for medical devices under EU MDR regulations.
  
  Your task is to analyze the provided literature for a ${deviceData.riskClass || ''} class medical device 
  according to MEDDEV 2.7/1 Rev 4 guidance on clinical evaluation.
  
  Focus specifically on:
  - Extracting safety and performance data relevant to the device's intended use
  - Evaluating the strength and quality of evidence using GRADE methodology
  - Identifying major gaps in the available literature evidence
  - Assessing how well the literature supports safety and performance claims
  - Determining literature adequacy for meeting EU MDR Article 61 requirements
  
  Be thorough but concise, prioritizing regulatory relevance in your analysis.`;

  // Detailed user prompt with expected output format
  const userPrompt = `Analyze the following ${trimmedItems.length} literature items in the context of this medical device:
  
  Device Information:
  ${JSON.stringify(deviceData, null, 2)}
  
  Literature Items:
  ${JSON.stringify(trimmedItems, null, 2)}
  
  Provide a comprehensive, regulatory-focused analysis with:
  1. Executive summary of key findings relevant to the device
  2. Systematic evaluation of evidence strength (using GRADE approach)
  3. Critical gaps in the literature that may need addressing
  4. Assessment of how the literature supports safety and performance claims
  5. Overall adequacy determination for EU MDR compliance
  
  Respond in JSON format with exactly this structure:
  {
    "summary": "Overall summary of literature findings",
    "keyFindings": ["List of key findings relevant to safety and performance"],
    "evidenceQuality": {
      "overall": "High/Moderate/Low/Very Low",
      "rationale": "Explanation of evidence quality assessment"
    },
    "gaps": ["Identified gaps in literature"],
    "regulatoryImplications": "Implications for EU MDR compliance",
    "safetyPerformanceSupport": "Assessment of how literature supports safety/performance claims",
    "recommendedActions": ["List of recommended actions based on literature review"],
    "individualAssessments": [
      {
        "id": "Publication ID",
        "title": "Title of literature item",
        "relevance": "High/Medium/Low",
        "evidenceLevel": "I/II/III/IV",
        "keyContributions": ["Specific contributions to understanding device"]
      }
    ]
  }`;

  // Implement retry loop with exponential backoff
  while (attempts < maxRetries) {
    try {
      // Use fallback model if not first attempt
      const currentModel = attempts === 0 ? model : fallbackModel;

      console.log(
        `Generating literature review analysis (attempt ${attempts + 1}/${maxRetries}) using model: ${currentModel}`
      );

      const response = await apiRequestQueue.add(() =>
        openai.chat.completions.create({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: temperature,
        })
      );

      // Parse and validate the response
      const content = response.choices[0].message.content;
      const result = JSON.parse(content);

      // Validate minimum required fields
      if (!result.summary || !result.keyFindings || !Array.isArray(result.keyFindings)) {
        throw new Error('Response missing required fields: summary or keyFindings');
      }

      // Add metadata to the response
      return {
        ...result,
        analysisMetadata: {
          analyzedAt: new Date().toISOString(),
          deviceName: deviceData.name || 'Medical Device',
          itemsAnalyzed: trimmedItems.length,
          totalItemsAvailable: literatureItems.length,
          model: currentModel,
        },
      };
    } catch (error) {
      lastError = error;
      attempts++;

      console.error(`Literature review analysis attempt ${attempts} failed:`, error);

      if (attempts < maxRetries) {
        // Exponential backoff with jitter
        const backoffTime = Math.pow(2, attempts - 1) * 1000 + Math.random() * 500;
        console.log(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  // If all attempts failed, throw a descriptive error
  console.error(`Failed to generate literature review after ${maxRetries} attempts:`, lastError);
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
