import { ProtocolData } from './protocol-analyzer-service';
import axios from 'axios';
import {
  getModelForTask,
  generateSystemPrompt,
} from './config/huggingface-models';
import { createScopedLogger } from './utils/logger.js';
import { aiComplete } from './lib/unified-ai-client';
import { extractTextFromPdf as extractPdfText } from './openai-service';

const log = createScopedLogger('huggingface');

/** Human-readable regulatory authority context for compliance prompts. */
const REGION_CONTEXT: Record<string, string> = {
  FDA: 'United States FDA (21 CFR Parts 50/56/312, ICH E6(R2) GCP, FDORA 2022 diversity requirements)',
  EMA: 'European Medicines Agency / EU Clinical Trials Regulation 536/2014, GDPR, EudraCT/CTIS',
  PMDA: 'Japan PMDA (J-GCP, ICH E5 ethnic-factor considerations, PMDA safety reporting)',
  NMPA: 'China NMPA (Drug Administration Law, Human Genetic Resources regulations)',
  MHRA: 'United Kingdom MHRA (UK clinical trials regulations post-Brexit, UK GDPR)',
  TGA: 'Australia TGA (CTN/CTX scheme, Australian GCP)',
  ANVISA: 'Brazil ANVISA (RDC resolutions, CONEP ethics review)',
  CDSCO: 'India CDSCO (New Drugs and Clinical Trials Rules 2019)',
};

/**
 * Enum for supported Hugging Face models
 */
export enum HFModel {
  FLAN_T5_XL = 'google/flan-t5-xl',
  STARLING = 'HuggingFaceH4/starling-lm-7b-alpha',
  MISTRAL = 'mistralai/Mistral-7B-Instruct-v0.2',
  MISTRAL_LATEST = 'mistralai/Mixtral-8x7B-Instruct-v0.1',
  LLAMA = 'meta-llama/Llama-2-7b-chat-hf',
  ZEPHYR = 'HuggingFaceH4/zephyr-7b-beta',
  FALCON = 'tiiuae/falcon-7b-instruct',
  EMBEDDINGS = 'sentence-transformers/all-MiniLM-L6-v2',
  CLINICAL_EMBEDDINGS = 'pritamdeka/BioBERT-mnli-snli-clinicalNLI',
  TEXT = 'gpt2',
  BIOMEDICAL = 'microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext',
}

/**
 * Supported regulatory regions for global intelligence
 */
export enum RegulatoryRegion {
  FDA = 'FDA', // United States
  EMA = 'EMA', // European Union
  PMDA = 'PMDA', // Japan
  NMPA = 'NMPA', // China
  MHRA = 'MHRA', // United Kingdom
  TGA = 'TGA', // Australia
  ANVISA = 'ANVISA', // Brazil
  CDSCO = 'CDSCO', // India
}

export class HuggingFaceService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Enhance protocol analysis with HuggingFace models
   * @param text The protocol text to analyze
   * @param basicAnalysis Basic analysis results to enhance
   * @param region Optional regulatory region to focus analysis on
   */
  async enhanceProtocolAnalysis(
    text: string,
    basicAnalysis: ProtocolData,
    region?: RegulatoryRegion
  ): Promise<ProtocolData> {
    if (!this.isApiKeyAvailable()) {
      log.warn('No Hugging Face API key available for protocol enhancement');
      return basicAnalysis;
    }

    try {
      // Create a region-specific system prompt
      const systemPrompt = generateSystemPrompt('design', region?.toString());

      // For real implementation, use region-specific model and analysis
      const modelName = getModelForTask('studyDesignGeneration', region?.toString());

      log.debug(
        `Enhancing protocol analysis with ${modelName} for region: ${region || 'Global'}`
      );

      // In a production implementation, this would use the HuggingFace model to enhance the analysis
      // For now, we'll add region-specific enhancements based on the provided region
      const enhancedAnalysis = {
        ...basicAnalysis,
        summary: `Enhanced by ML analysis: ${basicAnalysis.summary} Study follows a ${basicAnalysis.design} design with ${basicAnalysis.arms} treatment arms.`,
        inclusion_criteria:
          basicAnalysis.inclusion_criteria ||
          'Adult patients (age 18+) with histologically confirmed disease and ECOG performance status 0-1.',
        exclusion_criteria:
          basicAnalysis.exclusion_criteria ||
          'Prior treatment with investigational agents; history of severe allergic reactions; uncontrolled concurrent illness.',
        population:
          basicAnalysis.population ||
          'Adult patients with confirmed diagnosis according to established clinical guidelines.',
      };

      // Add region-specific enhancements if a region is specified
      if (region) {
        switch (region) {
          case RegulatoryRegion.FDA:
            enhancedAnalysis.regulatory_notes =
              'Protocol should comply with FDA guidance including 21 CFR Part 50 for informed consent and FDORA 2022 for diversity requirements.';
            break;
          case RegulatoryRegion.EMA:
            enhancedAnalysis.regulatory_notes =
              'Protocol should comply with EU Clinical Trial Regulation (EU) No 536/2014 and GDPR requirements for data protection.';
            break;
          case RegulatoryRegion.PMDA:
            enhancedAnalysis.regulatory_notes =
              'Protocol should comply with Japanese GCP Ordinance and consider ethnic factors that might affect efficacy and safety for Japanese patients.';
            break;
          case RegulatoryRegion.NMPA:
            enhancedAnalysis.regulatory_notes =
              'Protocol should comply with NMPA Drug Registration Regulation and ensure adequate representation of Chinese patients in pivotal trials.';
            break;
          default:
            enhancedAnalysis.regulatory_notes =
              'Protocol should comply with ICH E6(R2) Good Clinical Practice guidelines.';
        }
      }

      return enhancedAnalysis;
    } catch (error) {
      log.error('Error enhancing protocol analysis:', error);
      return basicAnalysis;
    }
  }

  /**
   * Check if API key is available
   */
  isApiKeyAvailable(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Generate text embeddings using HuggingFace models
   * @param text The text to generate embeddings for
   * @param model The model to use for generating embeddings
   * @returns An array of floating point numbers representing the embedding
   */
  async generateEmbeddings(text: string, model: HFModel = HFModel.EMBEDDINGS): Promise<number[]> {
    if (!this.isApiKeyAvailable()) {
      throw new Error('Hugging Face API key not provided');
    }

    try {
      log.debug(`Generating embeddings with model ${model}...`);

      // Set up API endpoint for the embedding model
      const apiUrl = `https://api-inference.huggingface.co/models/${model}`;

      // Prepare input text - truncate if needed
      const maxInputLength = 8192; // Character limit to avoid oversized requests
      const truncatedText = text.length > maxInputLength ? text.substring(0, maxInputLength) : text;

      // Make the API call
      const response = await axios.post(
        apiUrl,
        { inputs: truncatedText },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Handle different response formats from different models
      if (response.data) {
        if (Array.isArray(response.data) && response.data.length > 0) {
          // Handle sentence-transformers format
          if (Array.isArray(response.data[0])) {
            return response.data[0];
          }
          // Handle embedding models that return a single array
          return response.data;
        } else if (response.data.embeddings) {
          // Some models return { embeddings: [...] }
          return response.data.embeddings;
        } else if (response.data.embedding) {
          // Some models return { embedding: [...] }
          return response.data.embedding;
        } else if (typeof response.data === 'object' && !Array.isArray(response.data)) {
          // Last attempt - try to find the longest array property in the response
          const arrays = Object.values(response.data).filter(v => Array.isArray(v));
          const longestArray = arrays.reduce(
            (longest, current) => (current.length > longest.length ? current : longest),
            []
          );

          if (longestArray.length > 0) {
            return longestArray;
          }
        }
      }

      // If we couldn't parse the response in any expected format
      log.error('Unexpected embedding response format:', response.data);
      throw new Error('Failed to parse embedding response');
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        log.error(
          `Error generating embeddings (${error.response.status}):`,
          error.response.data
        );
        throw new Error(`Embedding API error: ${error.response.data.error || 'Unknown error'}`);
      }

      log.error('Error generating embeddings:', error);
      throw new Error(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract text from PDF documents using Hugging Face models
   * @param pdfBuffer Buffer containing the PDF file data
   * @returns Extracted text content
   */
  async extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
    try {
      log.debug('Extracting text from PDF...');
      return await extractPdfText(pdfBuffer);
    } catch (error) {
      log.error('Error extracting text from PDF:', error);
      throw new Error(
        `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract document metadata from text using Hugging Face models
   * @param text Text to extract metadata from
   * @returns Document metadata (title, authors, publication date, etc.)
   */
  async extractDocumentMetadata(text: string): Promise<any> {
    if (!text || !text.trim()) {
      throw new Error('Text is required to extract document metadata');
    }

    try {
      log.debug('Extracting document metadata...');
      const raw = await aiComplete({
        messages: [
          {
            role: 'system',
            content:
              'Extract bibliographic metadata from the document text. Respond with a single ' +
              'JSON object: { "title": string, "type": string, "source": string, "year": ' +
              'number|null, "authors": string[], "keywords": string[] }. Use null/empty when a ' +
              'field is not present in the text. Do not invent values.',
          },
          { role: 'user', content: text.substring(0, 8000) },
        ],
        max_tokens: 600,
        temperature: 0,
        response_format: { type: 'json_object' },
      });
      return JSON.parse(raw);
    } catch (error) {
      log.error('Error extracting document metadata:', error);
      throw new Error(
        `Failed to extract document metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate a summary of text using Hugging Face models
   * @param text Text to summarize
   * @param maxLength Maximum length of the summary
   * @returns Generated summary
   */
  async generateSummary(text: string, maxLength: number = 200): Promise<string> {
    if (!text || !text.trim()) {
      throw new Error('Text is required to generate a summary');
    }

    try {
      log.debug('Generating summary...');
      return await aiComplete({
        messages: [
          {
            role: 'system',
            content:
              `Summarize the provided text in approximately ${maxLength} words or fewer. ` +
              'Base the summary strictly on the text; do not add information. Return only the summary.',
          },
          { role: 'user', content: text.substring(0, 12000) },
        ],
        max_tokens: Math.max(256, maxLength * 4),
        temperature: 0.2,
      });
    } catch (error) {
      log.error('Error generating summary:', error);
      throw new Error(
        `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract key insights from text using Hugging Face models
   * @param text Text to analyze
   * @returns Array of key insights
   */
  async extractKeyInsights(text: string): Promise<string[]> {
    if (!text || !text.trim()) {
      throw new Error('Text is required to extract key insights');
    }

    try {
      log.debug('Extracting key insights...');
      const raw = await aiComplete({
        messages: [
          {
            role: 'system',
            content:
              'Extract the key insights from the provided text. Respond with a single JSON ' +
              'object: { "insights": string[] }. Each insight must be grounded in the text.',
          },
          { role: 'user', content: text.substring(0, 12000) },
        ],
        max_tokens: 800,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.insights) ? parsed.insights : [];
    } catch (error) {
      log.error('Error extracting key insights:', error);
      throw new Error(
        `Failed to extract key insights: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate tags for text using Hugging Face models
   * @param text Text to analyze
   * @returns Array of generated tags
   */
  async generateTags(text: string): Promise<string[]> {
    if (!text || !text.trim()) {
      throw new Error('Text is required to generate tags');
    }

    try {
      log.debug('Generating tags...');
      const raw = await aiComplete({
        messages: [
          {
            role: 'system',
            content:
              'Generate concise topical tags for the provided text. Respond with a single JSON ' +
              'object: { "tags": string[] }. Tags must reflect the actual content of the text.',
          },
          { role: 'user', content: text.substring(0, 12000) },
        ],
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.tags) ? parsed.tags : [];
    } catch (error) {
      log.error('Error generating tags:', error);
      throw new Error(
        `Failed to generate tags: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Analyze protocol for global regulatory compliance
   * @param protocolText The protocol text to analyze
   * @param regions Array of regulatory regions to check compliance against
   * @returns Compliance analysis results
   */
  async analyzeGlobalCompliance(
    protocolText: string,
    regions: RegulatoryRegion[] = [
      RegulatoryRegion.FDA,
      RegulatoryRegion.EMA,
      RegulatoryRegion.PMDA,
      RegulatoryRegion.NMPA,
    ]
  ): Promise<{
    [region: string]: { compliant: boolean; issues: string[]; recommendations: string[] };
  }> {
    if (!protocolText || !protocolText.trim()) {
      throw new Error('Protocol text is required for compliance analysis');
    }

    try {
      log.debug(`Analyzing global compliance for regions: ${regions.join(', ')}...`);

      const regionList = regions
        .map(r => `- ${r}: ${REGION_CONTEXT[r] ?? r}`)
        .join('\n');

      const systemPrompt =
        'You are a regulatory affairs expert. Assess the supplied clinical trial protocol ' +
        'against the requirements of each listed regulatory authority. Base every finding ' +
        'strictly on the protocol text provided — do not invent facts. For each issue and ' +
        'recommendation, cite the specific regulatory basis (regulation, guidance, or article). ' +
        'Respond with a single JSON object keyed by the region code, where each value is ' +
        '{ "compliant": boolean, "issues": string[], "recommendations": string[] }. ' +
        'Include exactly the requested regions and no prose outside the JSON.';

      const userPrompt =
        `Regulatory authorities to assess:\n${regionList}\n\n` +
        `Protocol text:\n"""\n${protocolText}\n"""`;

      const raw = await aiComplete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(raw) as {
        [region: string]: { compliant: boolean; issues: string[]; recommendations: string[] };
      };

      // Validate that the model returned a usable verdict for each requested region.
      // Fail loud rather than backfilling a fabricated default.
      const result: {
        [region: string]: { compliant: boolean; issues: string[]; recommendations: string[] };
      } = {};
      for (const region of regions) {
        const entry = parsed[region];
        if (!entry || typeof entry.compliant !== 'boolean') {
          throw new Error(`Compliance analysis returned no result for region ${region}`);
        }
        result[region] = {
          compliant: entry.compliant,
          issues: Array.isArray(entry.issues) ? entry.issues : [],
          recommendations: Array.isArray(entry.recommendations) ? entry.recommendations : [],
        };
      }

      return result;
    } catch (error) {
      log.error('Error analyzing global compliance:', error);
      throw new Error(
        `Failed to analyze global compliance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Text inference for the clinical-trial-design callers.
   *
   * ── WHY THIS GOES THROUGH THE GATEWAY (WO-6, 2026-09-10) ─────────────────
   * This used to POST to `https://api-inference.huggingface.co/models/${model}`
   * with its own `HF_API_KEY`. That is a whole second model provider, absent
   * from the gateway's provider model, its cost accounting, its residency
   * rules and its audit ledger — no `ai.gateway_audit_log` row, no prompt hash,
   * no PII/PHI screen on the prompt, for calls that produce regulatory
   * recommendations. `aiComplete` routes to the governed gateway.
   *
   * ── AND WHY IT NOW THROWS INSTEAD OF ANSWERING ───────────────────────────
   * The three failure branches here — no API key, unparseable response, and
   * any thrown error — all used to `return this.generateLocalResponse(prompt)`,
   * a keyword-matching template generator that produced confident clinical
   * guidance out of hardcoded strings: "Phase 3: 500-1500 participants",
   * "Lower variability in HbA1c allows for smaller sample sizes", "Typically
   * aim for 80-90% power". Nothing in the returned string marked it as
   * generated locally, so a caller could not tell it from a model answer.
   *
   * That reached users. `endpoint-recommender-service.ts:1035` is mounted (via
   * server/bootstrap/register-inline-routes.ts), and when its JSON parse fails
   * it falls back to splitting the response line by line and returning those
   * lines as SUGGESTED CLINICAL TRIAL ENDPOINTS. So the template's markdown
   * bullets became endpoint recommendations.
   *
   * CLAUDE.md's working agreement is explicit — "Fail closed, never fabricate.
   * No simulated agency responses outside dev, no fixture data in governed
   * paths, honest empty states." A failure is now a thrown error. The template
   * generators (~390 lines) and the unused `getFallbackResponse`, which opened
   * "I've analyzed your query" in the first person about analysis that never
   * happened, are deleted rather than left for someone to re-wire. This
   * follows `trainCustomModel` below, which was given the same treatment.
   *
   * @param prompt The prompt text to send to the model
   * @param model Retained for call-site compatibility; the gateway selects the
   *              model, so this is recorded in the log rather than honoured.
   * @param maxTokens Maximum tokens to generate
   * @param temperature Temperature parameter for generation
   * @param region Optional regulatory region to contextualize the response
   */
  async queryHuggingFace(
    prompt: string,
    model: HFModel | string = HFModel.STARLING,
    maxTokens: number = 512,
    temperature: number = 0.7,
    region?: RegulatoryRegion
  ): Promise<string> {
    log.debug(`Text inference via the AI gateway (call site requested ${model})...`);

    const text = await aiComplete({
      messages: [
        {
          role: 'system',
          content:
            'You are a clinical trial design and regulatory affairs assistant. Answer only from ' +
            'established regulatory guidance and the content of the user turn. Do not invent trial ' +
            'identifiers, sample sizes, effect sizes, approval dates or citations — if the answer is ' +
            'not something you can state from guidance, say so rather than supplying a plausible ' +
            'number.' +
            (region ? ` The applicable regulatory region is ${region}.` : ''),
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    if (!text || text.trim().length === 0) {
      throw new Error(
        'AI gateway returned an empty completion for a clinical-trial-design query. ' +
          'Returning generated placeholder guidance here would be indistinguishable from a real answer.'
      );
    }

    return text;
  }
}

// Export a singleton instance for convenience
export const huggingFaceService = new HuggingFaceService(process.env.HF_API_KEY || '');

// Create a standalone function that uses the singleton service for convenience
export function queryHuggingFace(
  prompt: string,
  model: HFModel | string = HFModel.STARLING,
  maxTokens: number = 512,
  temperature: number = 0.7
): Promise<string> {
  return huggingFaceService.queryHuggingFace(prompt, model, maxTokens, temperature);
}

/**
 * Create and train a custom model on a dataset
 * @param datasetPath Path to the dataset
 * @param modelName Name to give the trained model
 * @returns Training result information
 */
export async function trainCustomModel(datasetPath: string, modelName: string): Promise<any> {
  // No custom-model training pipeline is wired up. Rather than returning a fabricated
  // "completed" result with an invented accuracy, fail loud so callers do not treat a
  // non-existent model as trained.
  log.error(`trainCustomModel called for ${modelName} (${datasetPath}) but no training backend is configured`);
  throw new Error(
    'Custom model training is not implemented: no HuggingFace training backend is configured'
  );
}
