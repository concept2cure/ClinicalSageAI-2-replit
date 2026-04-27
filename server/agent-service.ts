import { queryHuggingFace, HFModel } from './huggingface-service';
import * as fs from 'fs';
import * as path from 'path';
import { createScopedLogger } from './utils/logger.js';

const log = createScopedLogger('agent-service');

// Use environment variables for API keys
const HF_API_KEY = process.env.HF_API_KEY;

/**
 * Study Design Agent service that leverages Hugging Face's Mixtral model
 * to provide study design advice and protocol optimization suggestions with
 * evidence-based recommendations from our CSR database
 */
export class StudyDesignAgentService {
  private readonly processedCsrDir = path.join(process.cwd(), 'data/processed_csrs');
  private readonly logFile = path.join(process.cwd(), 'data/agent_logs.jsonl');
  private readonly academicCitationsCache = new Map<string, any[]>();

  constructor() {
    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Generate a response from the Study Design Agent with academic evidence
   *
   * @param message - User message/question
   * @param indication - Optional indication filter
   * @param phase - Optional phase filter
   * @param csrIds - Optional array of CSR IDs to use as context
   * @returns AI response object with citations
   */
  async getAgentResponse(
    message: string,
    indication?: string,
    phase?: string,
    csrIds: string[] = []
  ): Promise<{ response: string }> {
    if (!HF_API_KEY) {
      throw new Error('Missing HF_API_KEY environment variable');
    }

    try {
      // Get relevant CSRs based on the query using semantic search
      const relevantCSRs = await this.findRelevantCSRs(message, indication, phase);

      // Combine explicitly requested CSRs with relevant ones
      const allCsrIds = [...new Set([...csrIds, ...relevantCSRs.map(csr => csr.id.toString())])];

      // Get academic citations to include in the response
      const academicCitations = await this.getAcademicEvidence(message, indication);

      // Get context from CSRs
      const csrContext = await this.getCsrContext(allCsrIds);

      // Add academic evidence to context
      const fullContext = this.combineContextWithAcademicEvidence(csrContext, academicCitations);

      // Construct prompt with system instruction, context, and user message
      const promptText = this.constructPrompt(message, fullContext);

      // Call Hugging Face API via our service
      const rawResponseText = await queryHuggingFace(
        promptText,
        HFModel.TEXT, // Using Mixtral model defined in huggingface-service.ts
        0.4, // Temperature
        800 // Max tokens (increased to allow for citations)
      );

      // Process the response to ensure proper citation format
      const responseText = this.formatResponseWithCitations(rawResponseText, academicCitations);

      // Log the interaction
      this.logInteraction(message, allCsrIds, responseText, fullContext);

      return { response: responseText };
    } catch (error: any) {
      log.error('Study Design Agent error:', error);
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }
  }

  /**
   * Log the agent interaction for future analysis and training
   */
  private logInteraction(
    message: string,
    csrIds: string[],
    response: string,
    context?: string
  ): void {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        message,
        csrIds,
        response,
        hasContext: !!context,
      };

      // Append to JSONL file
      fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n', 'utf8');
    } catch (error) {
      // Log but don't break on logging errors
      log.warn('Failed to log agent interaction:', error);
    }
  }

  /**
   * Get context information from CSR files
   *
   * @param csrIds Array of CSR IDs to load
   * @returns Formatted context text
   */
  private async getCsrContext(csrIds: string[]): Promise<string> {
    if (csrIds.length === 0) {
      return '';
    }

    const contextBlocks: string[] = [];

    for (const csrId of csrIds) {
      try {
        const filePath = path.join(this.processedCsrDir, `${csrId}.json`);

        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const csr = JSON.parse(fileContent);

          // Extract key information from the CSR
          const summary = csr.vector_summary || '';

          if (summary) {
            contextBlocks.push(`[${csrId}] ${summary}`);
          }
        }
      } catch (error) {
        log.warn(`Error loading CSR ${csrId}:`, error);
        // Continue with other CSRs
      }
    }

    return contextBlocks.length > 0 ? contextBlocks.join('\n\n') : '';
  }

  /**
   * Find relevant CSRs related to a user query
   *
   * @param query The user's query
   * @param indication Optional indication filter
   * @param phase Optional phase filter
   * @returns Array of relevant CSR objects
   */
  private async findRelevantCSRs(
    query: string,
    indication?: string,
    phase?: string
  ): Promise<any[]> {
    // CSR vector search disabled — csrReports schema is not present in this deployment.
    // Canonical retrieval lives in lumen_data_atoms via searchHybrid(), but that surface
    // requires an organizationUuid for tenant isolation which this entry point does not
    // receive. Returning [] keeps callers (which already handle empty results) intact.
    log.warn(
      '[AgentService] findRelevantCSRs disabled — csrReports schema not present; returning []',
      { query, indication, phase }
    );
    return [];
  }

  /**
   * Retrieve academic evidence and citations for a given query
   *
   * @param query The user's query
   * @param indication Optional indication filter to focus the search
   * @returns Array of academic sources with relevance scores
   */
  private async getAcademicEvidence(query: string, indication?: string): Promise<any[]> {
    // Check cache first
    const cacheKey = `${query}_${indication || ''}`;
    if (this.academicCitationsCache.has(cacheKey)) {
      return this.academicCitationsCache.get(cacheKey) || [];
    }

    // Academic evidence retrieval disabled — depended on the csrReports/csrDetails join
    // which has no equivalent in the current schema. Canonical retrieval (searchHybrid
    // over lumen_data_atoms) cannot be wired here without an organizationUuid.
    log.warn(
      '[AgentService] getAcademicEvidence disabled — csrReports/csrDetails schema not present; returning []',
      { query, indication }
    );

    const sortedSources: any[] = [];
    this.academicCitationsCache.set(cacheKey, sortedSources);
    return sortedSources;
  }

  /**
   * Combine CSR context with academic evidence
   *
   * @param csrContext The base CSR context
   * @param academicCitations Array of academic citations
   * @returns Combined context string
   */
  private combineContextWithAcademicEvidence(csrContext: string, academicCitations: any[]): string {
    if (academicCitations.length === 0) {
      return csrContext;
    }

    const academicEvidenceText = academicCitations
      .map(citation => {
        return `${citation.citationKey} ${citation.title} (${citation.sponsor}, ${citation.date || 'N/A'}) - Phase ${citation.phase}, Indication: ${citation.indication}`;
      })
      .join('\n');

    // Combine CSR context with academic evidence
    return `${csrContext ? csrContext + '\n\n' : ''}ACADEMIC EVIDENCE:\n${academicEvidenceText}`;
  }

  /**
   * Format the AI response to include proper citations
   *
   * @param responseText Raw response from the AI
   * @param academicCitations Available academic citations
   * @returns Formatted response with proper citations
   */
  private formatResponseWithCitations(responseText: string, academicCitations: any[]): string {
    if (academicCitations.length === 0) {
      return responseText;
    }

    // Check if response already contains citations
    if (responseText.includes('[') && responseText.includes(']')) {
      return responseText;
    }

    // If response doesn't have citations, check for keywords from the academic sources
    let citedResponse = responseText;

    // Map citation IDs to full citation texts
    const citationMap = new Map<string, string>();
    academicCitations.forEach(citation => {
      citationMap.set(
        citation.id.toString(),
        `${citation.citationKey} ${citation.title} (${citation.sponsor}, ${citation.date || 'N/A'})`
      );
    });

    // Add citation references section at the end if there are citations to add
    if (citationMap.size > 0) {
      citedResponse += '\n\nReferences:\n';
      citationMap.forEach(citationText => {
        citedResponse += `${citationText}\n`;
      });
    }

    return citedResponse;
  }

  /**
   * Construct the prompt for the Study Design Agent
   */
  private constructPrompt(message: string, fullContext: string): string {
    // Base system prompt with instructions for the agent
    const systemPrompt = `You are Concept2Cure, an expert AI assistant trained on 5,000+ clinical study reports (CSRs) and academic literature. 
Your job is to help clinical teams design better trials by:
- Recommending endpoints based on successful trials in similar indications
- Suggesting study arms or dose ranges based on precedent
- Highlighting precedent examples from relevant CSRs
- Warning of common regulatory pitfalls
- Advising on inclusion/exclusion criteria
- Providing statistical power considerations

Answer questions clearly and concisely in a professional tone. Base your answers on established clinical trial practices and regulatory expectations.

IMPORTANT: When referencing evidence, include citation keys like [NCT12345] from the CSR or academic context provided to you.
Format your citations as follows: "According to [NCT12345], the primary endpoint of weight loss showed a statistically significant improvement in the treatment group."
Include a references section at the end of your response if you've cited any sources.`;

    // Construct the full prompt
    let fullPrompt = systemPrompt + '\n\n';

    // Add full context if provided
    if (fullContext) {
      fullPrompt += `RELEVANT CONTEXT:\n${fullContext}\n\n`;
    }

    // Add user message
    fullPrompt += `User: ${message}\n\nConcept2Cure:`;

    return fullPrompt;
  }
}

// Create and export a singleton instance
export const studyDesignAgentService = new StudyDesignAgentService();
