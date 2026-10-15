import pdfParse from './utils/pdfParse';
import fs from 'fs';
import { getGateway } from './services/ai-gateway/index.js';
import { getEmbeddingProvider } from './services/ai-gateway/embeddings/embedding-provider';

// Embeddings run through the governed seam (getEmbeddingProvider); chat
// completions route through the AI Gateway (getGateway), which defaults to Claude.
// A real embedder is available when an OpenAI key or a self-hosted embedding
// endpoint is configured (the seam resolves which one at call time).
const embeddingsEnabled = Boolean(
  process.env.OPENAI_API_KEY ||
    process.env.EMBEDDING_LOCAL_BASE_URL ||
    process.env.LOCAL_AI_BASE_URL
);

/**
 * Check if an AI API key is available (Anthropic preferred, OpenAI fallback)
 * @returns boolean indicating if an API key is configured
 */
export function isApiKeyAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
}

/**
 * Generate embeddings for a text using OpenAI
 * @param text Text to generate embeddings for
 * @returns Vector embedding
 */
export async function generateEmbeddings(text: string): Promise<number[]> {
  if (!embeddingsEnabled) {
    throw new Error(
      'Embedding generation requires an embedding provider. Set OPENAI_API_KEY ' +
      '(or a local EMBEDDING_LOCAL_BASE_URL). Claude does not provide an embedding API.'
    );
  }
  try {
    const { embeddings } = await getEmbeddingProvider().embed({
      model: 'text-embedding-3-small',
      input: text,
    });

    return embeddings[0];
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw new Error(
      `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate a structured response from OpenAI
 * @param prompt The prompt to structure
 * @param systemPrompt Optional system prompt
 * @returns JSON structure
 */
export async function generateStructuredResponse(
  prompt: string,
  systemPrompt?: string
): Promise<any> {
  try {
    const gw = getGateway();
    return await gw.structuredOutput(prompt, undefined, {
      taskType: 'structured_output',
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      callerModule: 'openai-service/generateStructuredResponse',
    });
  } catch (error) {
    console.error('Error generating structured response:', error);
    throw new Error(
      `Failed to generate structured response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Analyzes text using OpenAI's API
 * @param prompt The user prompt to analyze
 * @param systemPrompt Optional system prompt to guide the analysis
 * @param temperature Optional temperature parameter (default: 0.5)
 * @param maxTokens Optional max tokens parameter (default: 3000)
 * @returns The generated content
 */
export async function analyzeText(
  prompt: string,
  systemPrompt: string = 'You are a helpful assistant specializing in clinical trial research and regulatory documentation.',
  temperature: number = 0.5,
  maxTokens: number = 3000
): Promise<string> {
  try {
    const gw = getGateway();
    const response = await gw.route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      maxTokens,
      callerModule: 'openai-service/analyzeText',
    });

    return response.content || '';
  } catch (error: any) {
    console.error('Error in OpenAI service:', error);
    throw new Error(`OpenAI analysis failed: ${error.message}`);
  }
}

/**
 * Generate a concise context summary for search results
 * Explains why a search result matched the query and highlights key information
 *
 * @param searchQuery The original search query
 * @param csrData CSR data containing the study details
 * @param maxLength Maximum summary length in characters (default: 150)
 * @returns A concise summary explaining the relevance
 */
export async function generateSearchContextSummary(
  searchQuery: string,
  csrData: any,
  maxLength: number = 150
): Promise<string> {
  try {
    if (!isApiKeyAvailable()) {
      return ''; // Return empty if OpenAI isn't available
    }

    // Extract key CSR information for the summary
    const csrInfo = {
      title: csrData.title || 'Untitled CSR',
      phase: csrData.phase || 'Unknown phase',
      indication: csrData.indication || 'Unknown indication',
      sample_size: csrData.sample_size || 'Unspecified sample size',
      outcome: csrData.outcome || 'Unknown outcome',
      sponsor: csrData.sponsor || 'Unknown sponsor',
    };

    // Format the prompt
    const prompt = `
      I'm searching for clinical studies with this query: "${searchQuery}"

      I found this study in the database:
      Title: ${csrInfo.title}
      Phase: ${csrInfo.phase}
      Indication: ${csrInfo.indication}
      Sample Size: ${csrInfo.sample_size}
      Outcome: ${csrInfo.outcome}
      Sponsor: ${csrInfo.sponsor}

      In 150 characters or less, explain why this study is relevant to my search and highlight the most important aspects that match my query.
    `;

    const systemPrompt =
      'You are a clinical research expert. Provide extremely concise, focused summaries that highlight the most relevant aspects of clinical studies based on search queries.';

    const gw = getGateway();
    const aiResponse = await gw.route({
      taskType: 'summarization',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 100,
      callerModule: 'openai-service/generateSearchContextSummary',
    });

    const summary = aiResponse.content || '';

    // Truncate if needed and add ellipsis
    if (summary.length > maxLength) {
      return summary.substring(0, maxLength - 3) + '...';
    }

    return summary;
  } catch (error) {
    console.error('Error generating search context summary:', error);
    return ''; // Return empty string on error
  }
}

/**
 * Analyzes multiple sections of a protocol using OpenAI's API
 * @param sections Map of section names to their content
 * @param systemPrompt Optional system prompt to guide the analysis
 * @returns Object with responses for each section
 */
export async function analyzeProtocolSections(
  sections: Record<string, string>,
  systemPrompt: string = 'You are a clinical protocol analysis expert.'
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  try {
    // Process each section in parallel
    const sectionPromises = Object.entries(sections).map(async ([sectionName, content]) => {
      if (!content || content.trim() === '') {
        results[sectionName] = '';
        return;
      }

      const sectionPrompt = `Analyze the following ${sectionName} section from a clinical trial protocol and provide your expert assessment:\n\n${content}`;
      const result = await analyzeText(sectionPrompt, systemPrompt);
      results[sectionName] = result;
    });

    await Promise.all(sectionPromises);
    return results;
  } catch (error: any) {
    console.error('Error in protocol section analysis:', error);
    throw new Error(`Section analysis failed: ${error.message}`);
  }
}

/**
 * A narrative protocol recommendation, from supplied evidence only.
 *
 * ── 2026-10-01 ───────────────────────────────────────────────────────────────
 * The prompt this replaces told the model to "Cite EXACT successful approaches
 * from similar CSRs … with SPECIFIC details", to cite "specific journal
 * articles", to "Reference specific FDA/EMA guidances or precedent approvals"
 * and to provide "COMPETITIVE INTELLIGENCE" — and then, in the same message,
 * said "No specific matching CSRs available." and "No specific academic
 * references available.", which is what the caller always sent. It asked for
 * citations to sources it had not supplied, so any it got were invented. It
 * also sent its own source comment ("// Limit to first 4000 chars…") to the
 * model inside the protocol text.
 *
 * Now the model narrates evidence computed elsewhere (CLAUDE.md RULE 2: the
 * numbers come from the deterministic comparison; the model narrates) and is
 * told to cite nothing it was not given.
 *
 * @param protocolText The protocol text (may be empty when only a summary exists)
 * @param protocolMeta Indication and phase the comparison matched on
 * @param comparableTrials Corpus trials, as the caller read them
 * @param evidenceSummary The deterministic comparison, as plain text
 */
export async function generateTailoredProtocolRecommendations(
  protocolText: string,
  protocolMeta: {
    indication: string;
    phase: string;
    studyType?: string;
    title?: string;
  },
  comparableTrials: any[],
  evidenceSummary: string
): Promise<string> {
  const systemPrompt = [
    'You review a clinical trial protocol against the evidence supplied with it.',
    'Rules:',
    '1. Use only the protocol text and the evidence in the user message. Do not cite or name any study, publication, guidance, approval or precedent that is not in that evidence.',
    '2. Do not state any number that is not in the protocol text or the evidence. The comparison with comparable trials has already been computed; quote it, do not recompute or extend it.',
    '3. Where the evidence is insufficient to support a recommendation, say so plainly instead of filling the gap.',
    '4. Write 3 to 6 recommendations, each under a heading in markdown ** formatting, each naming the protocol element it concerns and the supplied evidence it rests on.',
  ].join('\n');

  const trialsContext =
    comparableTrials.length > 0
      ? comparableTrials
          .map((t, i) =>
            [
              `Trial ${i + 1}: ${t.title || 'Untitled'}${t.nct_id ? ` (${t.nct_id})` : ''}`,
              t.design ? `- Design: ${t.design}` : null,
              t.sample_size ? `- Enrolment: ${t.sample_size}` : null,
              t.duration_weeks ? `- Duration: ${t.duration_weeks} weeks` : null,
              t.primary_endpoint ? `- Primary endpoint: ${t.primary_endpoint}` : null,
              t.registry_status ? `- Registry status: ${t.registry_status}` : null,
              t.efficacy_data ? `- Recorded efficacy results: ${t.efficacy_data}` : null,
            ]
              .filter(Boolean)
              .join('\n')
          )
          .join('\n\n')
      : 'No comparable trials were found in the corpus for this indication and phase.';

  const userPrompt = [
    `Protocol: ${protocolMeta.title ?? '(untitled)'} — ${protocolMeta.indication}, ${protocolMeta.phase}` +
      (protocolMeta.studyType ? `, study type ${protocolMeta.studyType}` : ''),
    '',
    'PROTOCOL TEXT (first 4000 characters):',
    protocolText.trim() ? protocolText.substring(0, 4000) : '(no protocol text was supplied)',
    '',
    'COMPARISON WITH COMPARABLE TRIALS (computed):',
    evidenceSummary,
    '',
    'COMPARABLE TRIALS:',
    trialsContext,
  ].join('\n');

  try {
    return await analyzeText(userPrompt, systemPrompt, 0.3, 3000);
  } catch (error: any) {
    console.error('Error generating tailored protocol recommendations:', error);
    throw new Error(`Failed to generate tailored recommendations: ${error.message}`);
  }
}

/**
 * Extract text from a PDF file
 * @param pdfBuffer PDF file buffer
 * @returns Extracted text content
 */
export async function extractTextFromPdf(pdfPathOrBuffer: string | Buffer): Promise<string> {
  try {
    let buffer: Buffer;

    if (typeof pdfPathOrBuffer === 'string') {
      const fs = require('fs');
      buffer = fs.readFileSync(pdfPathOrBuffer);
    } else {
      buffer = pdfPathOrBuffer;
    }

    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Analyze CSR content to extract structured data
 * @param text The CSR text content to analyze
 * @returns Structured analysis results
 */
export async function analyzeCsrContent(text: string): Promise<any> {
  const systemPrompt = `
    You are a clinical study report (CSR) analysis expert. Analyze the provided CSR text and extract
    structured information about the study design, objectives, methods, endpoints, and results.
    Format your response as a structured JSON object.
  `;

  try {
    const response = await analyzeText(
      `Extract structured information from the following CSR text. Include the study design,
      primary objective, inclusion/exclusion criteria, treatment arms, endpoints, sample size,
      results, safety information, and any other key elements.

      CSR TEXT:
      ${text.substring(0, 8000)}`, // Limit text size to avoid token limits
      systemPrompt,
      0.2,
      4000
    );

    try {
      // Try to parse the response as JSON
      const jsonResponse = JSON.parse(response);
      return {
        studyDesign: jsonResponse.studyDesign || null,
        primaryObjective: jsonResponse.primaryObjective || null,
        inclusionCriteria: jsonResponse.inclusionCriteria || null,
        exclusionCriteria: jsonResponse.exclusionCriteria || null,
        treatmentArms: jsonResponse.treatmentArms || [],
        endpoints: jsonResponse.endpoints || [],
        sampleSize: jsonResponse.sampleSize || null,
        results: jsonResponse.results || {},
        safety: jsonResponse.safety || {},
        studyDuration: jsonResponse.studyDuration || null,
        ageRange: jsonResponse.ageRange || null,
        gender: jsonResponse.gender || {},
        statisticalMethods: jsonResponse.statisticalMethods || [],
        adverseEvents: jsonResponse.adverseEvents || [],
        efficacyResults: jsonResponse.efficacyResults || {},
        saeCount: jsonResponse.saeCount || null,
        teaeCount: jsonResponse.teaeCount || null,
        completionRate: jsonResponse.completionRate || null,
      };
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      // Return an empty result object with default structure
      return {
        studyDesign: null,
        primaryObjective: null,
        inclusionCriteria: null,
        exclusionCriteria: null,
        treatmentArms: [],
        endpoints: [],
        sampleSize: null,
        results: {},
        safety: {},
        studyDuration: null,
        ageRange: null,
        gender: {},
        statisticalMethods: [],
        adverseEvents: [],
        efficacyResults: {},
        saeCount: null,
        teaeCount: null,
        completionRate: null,
      };
    }
  } catch (error) {
    console.error('Error in analyzeCsrContent:', error);
    throw error;
  }
}

/**
 * Generate a concise summary of a CSR document
 * @param text The CSR text content to summarize
 * @returns A summary of the CSR
 */
export async function generateCsrSummary(text: string): Promise<string> {
  const systemPrompt = `
    You are a clinical study report (CSR) summarization expert. Create a concise yet comprehensive
    summary of the provided CSR text focusing on the key aspects of the study design,
    objectives, methods, results, and conclusions.
  `;

  try {
    const response = await analyzeText(
      `Generate a concise summary (about 250-500 words) of the following clinical study report.
      Focus on the study design, objectives, key findings, and conclusions.

      CSR TEXT:
      ${text.substring(0, 8000)}`, // Limit text size to avoid token limits
      systemPrompt,
      0.5,
      1000
    );

    return response;
  } catch (error) {
    console.error('Error in generateCsrSummary:', error);
    throw error;
  }
}

/**
 * Analyze CER (Clinical Evaluation Report) content to extract structured data
 * @param text The CER text content to analyze
 * @returns Structured analysis results
 */
export async function analyzeCerContent(text: string): Promise<any> {
  const systemPrompt = `
    You are a clinical evaluation report (CER) analysis expert. Analyze the provided CER text and extract
    structured information about the medical device, complaints, safety issues, and performance evaluation.
    Format your response as a structured JSON object.
  `;

  try {
    const response = await analyzeText(
      `Extract structured information from the following Clinical Evaluation Report (CER) text. Include the device name,
      manufacturer, indication, safety issues, complaint rates, adverse events, performance evaluation, and any other key elements.

      CER TEXT:
      ${text.substring(0, 8000)}`, // Limit text size to avoid token limits
      systemPrompt,
      0.2,
      4000
    );

    try {
      // Try to parse the response as JSON
      const jsonResponse = JSON.parse(response);
      return {
        title: jsonResponse.title || null,
        device_name: jsonResponse.device_name || jsonResponse.deviceName || null,
        manufacturer: jsonResponse.manufacturer || null,
        indication: jsonResponse.indication || null,
        report_date: jsonResponse.report_date || jsonResponse.reportDate || null,
        report_period_start:
          jsonResponse.report_period_start || jsonResponse.reportPeriodStart || null,
        report_period_end: jsonResponse.report_period_end || jsonResponse.reportPeriodEnd || null,
        version: jsonResponse.version || null,
        complaint_summary: jsonResponse.complaint_summary || jsonResponse.complaintSummary || null,
        safety_issues: jsonResponse.safety_issues || jsonResponse.safetyIssues || [],
        complaint_rates: jsonResponse.complaint_rates || jsonResponse.complaintRates || {},
        adverse_events: jsonResponse.adverse_events || jsonResponse.adverseEvents || {},
        performance_evaluation:
          jsonResponse.performance_evaluation || jsonResponse.performanceEvaluation || null,
        clinical_data: jsonResponse.clinical_data || jsonResponse.clinicalData || {},
        risk_analysis: jsonResponse.risk_analysis || jsonResponse.riskAnalysis || null,
      };
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      // Return an empty result object with default structure
      return {
        title: null,
        device_name: null,
        manufacturer: null,
        indication: null,
        report_date: null,
        report_period_start: null,
        report_period_end: null,
        version: null,
        complaint_summary: null,
        safety_issues: [],
        complaint_rates: {},
        adverse_events: {},
        performance_evaluation: null,
        clinical_data: {},
        risk_analysis: null,
      };
    }
  } catch (error) {
    console.error('Error in analyzeCerContent:', error);
    throw error;
  }
}

/**
 * Generate a concise summary of a CER document
 * @param text The CER text content to summarize
 * @returns A summary of the CER
 */
export async function generateCerSummary(text: string): Promise<string> {
  const systemPrompt = `
    You are a clinical evaluation report (CER) summarization expert. Create a concise yet comprehensive
    summary of the provided CER text focusing on the key aspects of the device performance,
    safety issues, complaint rates, and overall evaluation.
  `;

  try {
    const response = await analyzeText(
      `Generate a concise summary (about 250-500 words) of the following clinical evaluation report.
      Focus on the device performance, safety issues, complaint rates, and key findings.

      CER TEXT:
      ${text.substring(0, 8000)}`, // Limit text size to avoid token limits
      systemPrompt,
      0.5,
      1000
    );

    return response;
  } catch (error) {
    console.error('Error in generateCerSummary:', error);
    throw error;
  }
}

/**
 * Process a natural language query for the CER dashboard
 * @param query The natural language query from the user
 * @returns Structured filtering parameters
 */
export async function processCerNlpQuery(query: string): Promise<any> {
  const systemPrompt = `
    You are an expert in clinical evaluation reports and FDA adverse event data.
    Interpret the user's natural language query about adverse events and transform it into a structured
    filtering request. Focus on understanding queries related to patient demographics, event types,
    severity levels, and timeframes.
  `;

  try {
    return await generateStructuredResponse(query, systemPrompt);
  } catch (error) {
    console.error('Error in processCerNlpQuery:', error);
    // Return a basic filter structure if the advanced parsing fails
    return {
      filters: [{ type: 'keyword', value: query }],
      sort: 'frequency',
      limit: 50,
      group_by: 'event',
      intent: 'basic_search',
    };
  }
}

export default {
  analyzeText,
  analyzeProtocolSections,
  extractTextFromPdf,
  analyzeCsrContent,
  analyzeCerContent,
  generateCsrSummary,
  generateCerSummary,
  isApiKeyAvailable,
  generateEmbeddings,
  generateStructuredResponse,
  processCerNlpQuery,
};
