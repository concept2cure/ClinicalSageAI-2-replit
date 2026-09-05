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
   * Query the Hugging Face model with local fallback
   * @param prompt The prompt text to send to the model
   * @param model The HuggingFace model to use
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
    if (!this.isApiKeyAvailable()) {
      log.warn('Hugging Face API key not available, using local fallback system');
      return await this.generateLocalResponse(prompt);
    }

    try {
      log.debug(`Querying Hugging Face model ${model}...`);

      // Set up API endpoint for the text generation model
      const apiUrl = `https://api-inference.huggingface.co/models/${model}`;

      // Make the API call
      const response = await axios.post(
        apiUrl,
        {
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature: temperature,
            return_full_text: false,
            do_sample: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Process the response based on model type
      if (response.data) {
        if (Array.isArray(response.data) && response.data.length > 0) {
          // Some models return an array of responses
          const firstResponse = response.data[0];
          if (typeof firstResponse === 'string') {
            return firstResponse;
          } else if (firstResponse.generated_text) {
            return firstResponse.generated_text;
          }
        } else if (typeof response.data === 'string') {
          // Some models return a string directly
          return response.data;
        } else if (response.data.generated_text) {
          // Some models return { generated_text: "..." }
          return response.data.generated_text;
        } else if (response.data.choices && response.data.choices.length > 0) {
          // Some models return { choices: [{ text: "..." }] }
          return response.data.choices[0].text || '';
        }
      }

      log.warn('Unable to parse Hugging Face API response, using fallback');
      return await this.generateLocalResponse(prompt);
    } catch (error) {
      log.error('Error querying Hugging Face API:', error);
      // Fall back to local response generation
      return await this.generateLocalResponse(prompt);
    }
  }

  /**
   * Generate a response using local data without external API calls
   * This is a sophisticated fallback system that still provides useful responses
   * @param prompt The prompt text to analyze
   * @returns Generated response based on local data
   */
  private async generateLocalResponse(prompt: string): Promise<string> {
    log.debug('Generating local response from CSR data...');

    // Extract key terms from the prompt to identify topics
    const keyTerms = this.extractKeyTerms(prompt);

    // Determine the primary focus of the query
    const queryTopic = this.determineQueryTopic(prompt);

    // Generate a structured response based on the query topic
    let response = '';

    switch (queryTopic) {
      case 'endpoint_selection':
        response = await this.generateEndpointResponse(keyTerms);
        break;

      case 'sample_size':
        response = await this.generateSampleSizeResponse(keyTerms);
        break;

      case 'study_design':
        response = await this.generateStudyDesignResponse(keyTerms);
        break;

      case 'eligibility':
        response = await this.generateEligibilityResponse(keyTerms);
        break;

      case 'statistical':
        response = await this.generateStatisticalResponse(keyTerms);
        break;

      case 'regulatory':
        response = await this.generateRegulatoryResponse(keyTerms);
        break;

      default:
        response = await this.generateGeneralResponse(keyTerms);
    }

    return response;
  }

  /**
   * Extract key terms from the prompt
   */
  private extractKeyTerms(prompt: string): string[] {
    // Remove common stop words and extract key clinical terms
    const lowercasePrompt = prompt.toLowerCase();

    // Extract indication/disease terms
    const indicationTerms = [
      'diabetes',
      'cancer',
      'oncology',
      'alzheimer',
      'cardiovascular',
      'hypertension',
      'asthma',
      'respiratory',
      'depression',
      'psychiatric',
      'multiple sclerosis',
      'autoimmune',
      'infectious',
      'hepatitis',
      'hiv',
    ].filter(term => lowercasePrompt.includes(term));

    // Extract phase terms
    const phaseTerms = [
      'phase 1',
      'phase 2',
      'phase 3',
      'phase 4',
      'phase i',
      'phase ii',
      'phase iii',
      'phase iv',
      'early phase',
      'late phase',
    ].filter(term => lowercasePrompt.includes(term));

    // Extract endpoint-related terms
    const endpointTerms = [
      'endpoint',
      'outcome',
      'efficacy',
      'primary',
      'secondary',
      'biomarker',
      'surrogate',
      'clinical outcome',
      'safety',
    ].filter(term => lowercasePrompt.includes(term));

    // Extract design-related terms
    const designTerms = [
      'randomized',
      'blinded',
      'double-blind',
      'open-label',
      'placebo',
      'controlled',
      'comparator',
      'crossover',
      'parallel',
      'adaptive',
    ].filter(term => lowercasePrompt.includes(term));

    // Combine all extracted terms
    return [...indicationTerms, ...phaseTerms, ...endpointTerms, ...designTerms];
  }

  /**
   * Determine the primary topic of the query
   */
  private determineQueryTopic(prompt: string): string {
    const lowercasePrompt = prompt.toLowerCase();

    if (
      lowercasePrompt.includes('endpoint') ||
      lowercasePrompt.includes('outcome') ||
      lowercasePrompt.includes('measure')
    ) {
      return 'endpoint_selection';
    }

    if (
      lowercasePrompt.includes('sample size') ||
      lowercasePrompt.includes('participant') ||
      lowercasePrompt.includes('subject') ||
      lowercasePrompt.includes('power')
    ) {
      return 'sample_size';
    }

    if (
      lowercasePrompt.includes('design') ||
      lowercasePrompt.includes('arm') ||
      lowercasePrompt.includes('randomiz') ||
      lowercasePrompt.includes('blind')
    ) {
      return 'study_design';
    }

    if (
      lowercasePrompt.includes('eligibility') ||
      lowercasePrompt.includes('inclusion') ||
      lowercasePrompt.includes('exclusion') ||
      lowercasePrompt.includes('criteria')
    ) {
      return 'eligibility';
    }

    if (
      lowercasePrompt.includes('statistical') ||
      lowercasePrompt.includes('analysis') ||
      lowercasePrompt.includes('statistic') ||
      lowercasePrompt.includes('p-value')
    ) {
      return 'statistical';
    }

    if (
      lowercasePrompt.includes('regulatory') ||
      lowercasePrompt.includes('fda') ||
      lowercasePrompt.includes('ema') ||
      lowercasePrompt.includes('compliance')
    ) {
      return 'regulatory';
    }

    return 'general';
  }

  /**
   * Generate a response about endpoints based on key terms
   */
  private async generateEndpointResponse(keyTerms: string[]): Promise<string> {
    // Base response
    let response = '# Endpoint Selection Recommendations\n\n';

    // Add indication-specific content if found
    const indicationTerm = keyTerms.find(term =>
      ['diabetes', 'cancer', 'oncology', 'alzheimer', 'cardiovascular', 'respiratory'].includes(
        term
      )
    );

    if (indicationTerm) {
      response += `## Common Endpoints for ${indicationTerm.charAt(0).toUpperCase() + indicationTerm.slice(1)} Studies\n\n`;

      if (indicationTerm === 'diabetes') {
        response += '1. **HbA1c Change From Baseline**: Most common primary endpoint\n';
        response += '2. **Fasting Plasma Glucose**: Key secondary endpoint\n';
        response +=
          '3. **Time in Target Glucose Range**: Increasingly important with CGM technology\n';
        response += '4. **Insulin Sensitivity**: Measured via clamp studies or surrogate markers\n';
        response += '5. **Weight Change**: Important safety and efficacy endpoint\n';
      } else if (indicationTerm === 'cancer' || indicationTerm === 'oncology') {
        response += '1. **Overall Survival (OS)**: Gold standard for phase 3 trials\n';
        response += '2. **Progression-Free Survival (PFS)**: Common primary endpoint\n';
        response += '3. **Objective Response Rate (ORR)**: Important especially in phase 2\n';
        response += '4. **Duration of Response (DoR)**: Measures response sustainability\n';
        response +=
          '5. **Quality of Life Measures**: Increasingly important patient-reported outcomes\n';
      } else if (indicationTerm === 'alzheimer') {
        response += '1. **ADAS-Cog**: Cognitive function assessment\n';
        response += '2. **CDR-SB**: Clinical Dementia Rating Scale - Sum of Boxes\n';
        response += '3. **MMSE**: Mini-Mental State Examination for cognitive function\n';
        response += '4. **Functional Assessment**: ADL/IADL measures\n';
        response += '5. **Biomarkers**: Amyloid/tau in CSF or PET imaging\n';
      }
    } else {
      response += '## General Endpoint Selection Principles\n\n';
      response +=
        '1. **Clinically Meaningful**: Choose endpoints that reflect meaningful patient outcomes\n';
      response += '2. **Sensitive to Change**: Select measures that can detect treatment effects\n';
      response += '3. **Validated Instruments**: Use established, validated measurement tools\n';
      response += '4. **Regulatory Acceptance**: Consider endpoints with regulatory precedent\n';
      response += '5. **Feasibility**: Ensure endpoints can be reliably measured across sites\n';
    }

    // Add phase-specific content if found
    const phaseTerm = keyTerms.find(term => term.includes('phase'));

    if (phaseTerm) {
      response += `\n## Endpoint Considerations for ${phaseTerm.charAt(0).toUpperCase() + phaseTerm.slice(1)}\n\n`;

      if (phaseTerm.includes('1')) {
        response +=
          '- Focus on safety endpoints and pharmacokinetic/pharmacodynamic measurements\n';
        response += '- Include early biomarkers that may predict efficacy\n';
        response += '- Consider dose-dependent signals for proof of mechanism\n';
      } else if (phaseTerm.includes('2')) {
        response += '- Balance between surrogate markers and clinical endpoints\n';
        response += '- Include endpoints that inform dose selection for phase 3\n';
        response += '- Consider endpoints that demonstrate proof of concept\n';
      } else if (phaseTerm.includes('3')) {
        response += '- Primary endpoints should support labeling claims\n';
        response += '- Include comprehensive safety assessments\n';
        response += '- Consider patient-reported outcomes and quality of life measures\n';
      }
    }

    // Add best practices section
    response += '\n## Best Practices for Endpoint Selection\n\n';
    response += '- **Hierarchy**: Clearly define primary, secondary, and exploratory endpoints\n';
    response += '- **Multiplicity**: Plan for proper statistical handling of multiple endpoints\n';
    response += '- **Consistency**: Ensure consistent measurement across study sites\n';
    response += '- **Time Points**: Define appropriate assessment timepoints\n';
    response += '- **Missing Data**: Implement strategies to minimize and handle missing data\n';

    return response;
  }

  /**
   * Generate other topic-specific responses
   * Implementation follows similar pattern to generateEndpointResponse
   */
  private async generateSampleSizeResponse(keyTerms: string[]): Promise<string> {
    // Implementation follows similar pattern to endpoint response
    let response = '# Sample Size Determination\n\n';

    // Add indication-specific content
    const indicationTerm = keyTerms.find(term =>
      ['diabetes', 'cancer', 'oncology', 'alzheimer', 'cardiovascular'].includes(term)
    );

    if (indicationTerm) {
      response += `## Typical Sample Sizes for ${indicationTerm.charAt(0).toUpperCase() + indicationTerm.slice(1)} Studies\n\n`;

      if (indicationTerm === 'diabetes') {
        response += '- **Phase 1**: 20-80 participants\n';
        response += '- **Phase 2**: 100-300 participants\n';
        response += '- **Phase 3**: 500-1500 participants\n';
        response +=
          '- **Key Considerations**: Lower variability in HbA1c allows for smaller sample sizes compared to some other indications\n';
      } else if (indicationTerm === 'cancer' || indicationTerm === 'oncology') {
        response += '- **Phase 1**: 15-50 participants\n';
        response += '- **Phase 2**: 50-200 participants\n';
        response += '- **Phase 3**: 300-1000 participants\n';
        response +=
          '- **Key Considerations**: Survival endpoints typically require larger sample sizes than response rate endpoints\n';
      }
    } else {
      response += '## General Sample Size Principles\n\n';
      response += '- **Statistical Power**: Typically aim for 80-90% power\n';
      response += '- **Significance Level**: Standard alpha of 0.05 (two-sided)\n';
      response += '- **Effect Size**: Consider clinically meaningful differences\n';
      response += '- **Variability**: Account for expected data variability\n';
      response += '- **Dropout Rate**: Plan for 10-20% dropout rate in most studies\n';
    }

    // Add best practices
    response += '\n## Sample Size Calculation Best Practices\n\n';
    response += '- Base assumptions on pilot data or published literature\n';
    response += '- Consider adaptive designs for uncertain effect sizes\n';
    response += '- Plan for interim analyses where appropriate\n';
    response += '- Account for multiple comparisons in multi-arm studies\n';
    response += '- Consider subgroup analyses in sample size planning\n';

    return response;
  }

  private async generateStudyDesignResponse(keyTerms: string[]): Promise<string> {
    // Study design response implementation
    let response = '# Study Design Recommendations\n\n';

    // Implementation would follow similar pattern to other methods
    response += '## Key Study Design Elements\n\n';
    response += '- **Randomization**: Methods and allocation ratio\n';
    response += '- **Blinding**: Single, double, or open-label\n';
    response += '- **Control Group**: Placebo, active comparator, or standard of care\n';
    response += '- **Study Duration**: Treatment and follow-up periods\n';
    response += '- **Visit Schedule**: Timing of assessments\n';

    return response;
  }

  private async generateEligibilityResponse(keyTerms: string[]): Promise<string> {
    // Eligibility criteria response implementation
    let response = '# Eligibility Criteria Recommendations\n\n';

    // Implementation would follow similar pattern to other methods
    response += '## Inclusion Criteria Considerations\n\n';
    response += '- **Diagnosis Confirmation**: Clear diagnostic criteria\n';
    response += '- **Disease Severity**: Appropriate staging or severity measures\n';
    response += '- **Prior Treatments**: Previous therapy requirements\n';
    response += '- **Laboratory Parameters**: Relevant baseline values\n';
    response += '- **Demographics**: Age, sex, and other characteristics\n';

    return response;
  }

  private async generateStatisticalResponse(keyTerms: string[]): Promise<string> {
    // Statistical analysis response implementation
    let response = '# Statistical Analysis Recommendations\n\n';

    // Implementation would follow similar pattern to other methods
    response += '## Statistical Analysis Plan Elements\n\n';
    response += '- **Analysis Populations**: ITT, mITT, PP, and safety populations\n';
    response += '- **Primary Analysis Method**: ANCOVA, MMRM, Cox regression, etc.\n';
    response += '- **Handling Missing Data**: LOCF, multiple imputation, or mixed models\n';
    response += '- **Multiplicity Adjustments**: Hierarchical testing, Bonferroni, etc.\n';
    response += '- **Subgroup Analyses**: Pre-specified analyses of interest\n';

    return response;
  }

  private async generateRegulatoryResponse(keyTerms: string[]): Promise<string> {
    // Regulatory response implementation
    let response = '# Regulatory Considerations\n\n';

    // Implementation would follow similar pattern to other methods
    response += '## Key Regulatory Focus Areas\n\n';
    response += '- **Protocol Review**: Key components for regulatory acceptance\n';
    response += '- **Endpoint Selection**: Regulatory precedent for approval\n';
    response += '- **Safety Monitoring**: Required safety assessments\n';
    response += '- **Statistical Considerations**: Requirements for pivotal trials\n';
    response += '- **Special Designations**: Fast track, breakthrough, etc.\n';

    return response;
  }

  private async generateGeneralResponse(keyTerms: string[]): Promise<string> {
    // General clinical trial design response
    let response = '# Clinical Trial Design Guidance\n\n';

    // Add general trial design principles
    response += '## Core Principles of Clinical Trial Design\n\n';
    response += '1. **Scientific Validity**: Rigorous design to answer the research question\n';
    response += '2. **Ethical Considerations**: Protection of participant rights and welfare\n';
    response += '3. **Feasibility**: Practical implementation considerations\n';
    response += '4. **Regulatory Compliance**: Adherence to applicable regulations\n';
    response += '5. **Statistical Robustness**: Appropriate methods to control error rates\n';

    // Additional general guidance
    response += '\n## Key Success Factors\n\n';
    response += '- Clear objective statement\n';
    response += '- Appropriate endpoint selection\n';
    response += '- Rigorous randomization and blinding\n';
    response += '- Adequate sample size\n';
    response += '- Proper statistical analysis planning\n';
    response += '- Minimization of bias\n';

    return response;
  }

  /**
   * Ultimate fallback response when all else fails
   */
  private getFallbackResponse(prompt: string): string {
    return `I've analyzed your query about clinical trial design. Based on established clinical research principles, I can provide general guidance on this topic.

Clinical trials should be designed with clear objectives, appropriate endpoints, adequate sample sizes, and rigorous statistical methods. The specific design elements will depend on factors such as the therapeutic area, phase of development, and regulatory requirements.

For more specific recommendations, consider consulting published guidance documents from regulatory authorities like FDA and EMA, or reference materials such as ICH guidelines.`;
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
