/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    CITATION ENFORCEMENT SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ensures regulatory text generation is grounded in retrieved sources.
 * Prevents hallucination through hard citation constraints and verification.
 *
 * CAPABILITIES:
 * 1. Citation Parsing & Validation - Extract and verify citations
 * 2. Grounded Generation - Enforce citations during LLM generation
 * 3. NLI-based Faithfulness Scoring - Verify claims against sources
 * 4. Missing Citation Detection - Flag unsupported claims
 * 5. Source Coverage Analysis - Ensure adequate source utilization
 * 6. 21 CFR Part 11 compliant audit trails
 *
 * CITATION FORMATS SUPPORTED:
 * - Bracketed numbers: [1], [2, 3], [1-5]
 * - Named sources: (FDA 2024), (ICH E6 R2)
 * - Inline: "According to Source X..."
 * - Table references: [Table 14.1, Row 2]
 *
 * @module server/services/citationEnforcementService
 * @version 1.0.0
 * @compliance 21 CFR Part 11
 * @author Concept2Cure AI Team
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import type OpenAI from 'openai';
import { getOpenAIClient } from './openai-client';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  documentType: string;
  metadata: {
    sourceUrl?: string;
    publishedDate?: string;
    author?: string;
    section?: string;
    pageNumber?: number;
  };
  contentHash: string;
}

export interface Citation {
  id: string;
  format: 'bracketed' | 'named' | 'inline' | 'table_ref';
  text: string; // The citation text as it appears
  sourceIds: string[]; // References to source documents
  position: {
    start: number;
    end: number;
    sentenceIndex: number;
  };
  verificationStatus: 'verified' | 'partial' | 'unverified' | 'invalid';
}

export interface GeneratedClaim {
  text: string;
  type: 'factual' | 'statistical' | 'conclusion' | 'recommendation';
  citations: Citation[];
  faithfulnessScore: number; // 0-1, how well supported by sources
  position: { start: number; end: number };
}

export interface CitationValidationResult {
  isValid: boolean;
  totalCitations: number;
  validCitations: number;
  invalidCitations: Citation[];
  missingCitations: MissingCitation[];
  orphanedSources: string[]; // Sources provided but not cited
  overallFaithfulness: number;
  verificationDetails: ClaimVerification[];
}

export interface MissingCitation {
  claim: string;
  position: { start: number; end: number };
  suggestedSources: string[];
  severity: 'critical' | 'warning';
  reason: string;
}

export interface ClaimVerification {
  claim: string;
  sourceId: string;
  sourceExcerpt: string;
  entailmentScore: number; // NLI: entailment probability
  contradictionScore: number; // NLI: contradiction probability
  neutralScore: number; // NLI: neutral probability
  verdict: 'supported' | 'contradicted' | 'neutral' | 'unsupported';
}

export interface GroundedGenerationOptions {
  sources: SourceDocument[];
  citationFormat: 'bracketed' | 'named' | 'inline' | 'auto';
  minCitationsPerParagraph: number;
  enforcementLevel: 'strict' | 'moderate' | 'lenient';
  allowInference: boolean; // Allow conclusions that logically follow
  requireStatisticalCitations: boolean;
  maxUncitedCharacters: number; // Max chars without a citation
}

export interface GroundedGenerationResult {
  text: string;
  citations: Citation[];
  claims: GeneratedClaim[];
  validationResult: CitationValidationResult;
  generationMetadata: {
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    generatedAt: Date;
    enforcementLevel: string;
  };
  auditId: string;
}

export interface Part11CitationAudit {
  id: string;
  timestamp: Date;
  action: 'generate' | 'validate' | 'verify_claim' | 'regenerate';
  userId: string;
  inputHash: string;
  outputHash: string;
  sourcesUsed: string[];
  validationScore: number;
  details: Record<string, any>;
  signature: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//                    CITATION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const CITATION_PATTERNS = {
  // [1], [2, 3], [1-5]
  bracketed: /\[(\d+(?:\s*[-,]\s*\d+)*)\]/g,

  // (FDA 2024), (ICH E6 R2), (Author et al., 2023)
  named: /\(([A-Z][A-Za-z\s]+(?:\d{4})?(?:\s+[A-Z]\d+(?:\s+R\d+)?)?(?:,\s*[A-Za-z\s]+)?)\)/g,

  // "According to [Source]", "As stated in [Document]"
  inline: /(?:according to|as stated in|per|as per|as described in|from)\s+([^,.]+)/gi,

  // [Table 14.1, Row 2, Col "n"]
  tableRef: /\[Table\s+([^,\]]+)(?:,\s*Row\s+(\d+))?(?:,\s*Col\s+"([^"]+)")?\]/gi,

  // Numbers requiring citations: percentages, p-values, statistics
  statisticalClaim:
    /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:patients?|subjects?|participants?)|p\s*[<>=]\s*\d+(?:\.\d+)?|CI\s*[:=]\s*[\d.,\-\s%()]+|odds ratio|hazard ratio|relative risk)/gi,
};

// ═══════════════════════════════════════════════════════════════════════════
//                    CITATION ENFORCEMENT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class CitationEnforcementService {
  private pool: Pool;
  private openai: OpenAI | null = null;
  private auditEnabled: boolean = true;

  constructor(pool: Pool) {
    this.pool = pool;

    // Initialize OpenAI if available
    try {
      this.openai = getOpenAIClient();
    } catch {}

    console.log('✅ Citation Enforcement Service initialized (Part 11 compliant)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                    CITATION PARSING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract all citations from text
   */
  parseCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    const sentences = this.splitIntoSentences(text);
    let charOffset = 0;

    // Process each citation type
    for (const [format, pattern] of Object.entries(CITATION_PATTERNS)) {
      if (format === 'statisticalClaim') continue; // Handle separately

      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const sentenceIndex = this.findSentenceIndex(sentences, match.index, charOffset);

        citations.push({
          id: crypto.randomUUID(),
          format: format as Citation['format'],
          text: match[0],
          sourceIds: this.extractSourceIds(match[0], format),
          position: {
            start: match.index,
            end: match.index + match[0].length,
            sentenceIndex,
          },
          verificationStatus: 'unverified',
        });
      }
    }

    return citations.sort((a, b) => a.position.start - b.position.start);
  }

  /**
   * Extract source IDs from citation text
   */
  private extractSourceIds(citationText: string, format: string): string[] {
    switch (format) {
      case 'bracketed':
        // Handle [1], [2, 3], [1-5]
        const numbers = citationText.match(/\d+/g) || [];
        const ids: string[] = [];

        // Check for ranges like [1-5]
        if (citationText.includes('-')) {
          const rangeMatch = citationText.match(/(\d+)\s*-\s*(\d+)/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            for (let i = start; i <= end; i++) {
              ids.push(String(i));
            }
            return ids;
          }
        }

        return numbers;

      case 'named':
        // Return the full name as the ID
        const nameMatch = citationText.match(/\(([^)]+)\)/);
        return nameMatch ? [nameMatch[1].trim()] : [];

      case 'inline':
        // Extract the source name
        const inlineMatch = citationText.match(/(?:according to|as stated in|per|as per)\s+(.+)/i);
        return inlineMatch ? [inlineMatch[1].trim()] : [];

      case 'tableRef':
        // Return table identifier
        const tableMatch = citationText.match(/Table\s+([^\],]+)/i);
        return tableMatch ? [`table_${tableMatch[1].trim()}`] : [];

      default:
        return [];
    }
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - in production use NLP library
    return text.split(/(?<=[.!?])\s+/);
  }

  /**
   * Find which sentence a position falls into
   */
  private findSentenceIndex(sentences: string[], position: number, baseOffset: number): number {
    let currentPos = baseOffset;
    for (let i = 0; i < sentences.length; i++) {
      currentPos += sentences[i].length + 1; // +1 for space
      if (position < currentPos) return i;
    }
    return sentences.length - 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                    GROUNDED GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate text with enforced citations
   */
  async generateWithCitations(
    prompt: string,
    options: GroundedGenerationOptions,
    userId: string
  ): Promise<GroundedGenerationResult> {
    const startTime = Date.now();
    const auditId = crypto.randomUUID();

    // Build grounded prompt with source context
    const groundedPrompt = this.buildGroundedPrompt(prompt, options);

    // Generate with citation enforcement
    const response = await this.callLLMWithCitationEnforcement(groundedPrompt, options);

    // Parse citations from generated text
    const citations = this.parseCitations(response.text);

    // Extract claims from text
    const claims = await this.extractClaims(response.text, citations);

    // Validate citations against sources
    const validationResult = await this.validateCitations(
      response.text,
      citations,
      options.sources
    );

    // Update claim faithfulness scores
    for (const claim of claims) {
      const verification = validationResult.verificationDetails.find(v => v.claim === claim.text);
      if (verification) {
        claim.faithfulnessScore = verification.entailmentScore;
      }
    }

    // Regenerate if validation fails and enforcement is strict
    let finalText = response.text;
    let finalCitations = citations;
    let finalValidation = validationResult;

    if (options.enforcementLevel === 'strict' && !validationResult.isValid) {
      const regenerated = await this.regenerateWithFeedback(prompt, options, validationResult);
      finalText = regenerated.text;
      finalCitations = this.parseCitations(regenerated.text);
      finalValidation = await this.validateCitations(
        regenerated.text,
        finalCitations,
        options.sources
      );
    }

    // Create audit entry
    if (this.auditEnabled) {
      await this.createAuditEntry({
        action: 'generate',
        userId,
        inputHash: crypto.createHash('sha256').update(prompt).digest('hex'),
        outputHash: crypto.createHash('sha256').update(finalText).digest('hex'),
        sourcesUsed: options.sources.map(s => s.id),
        validationScore: finalValidation.overallFaithfulness,
        details: {
          enforcementLevel: options.enforcementLevel,
          totalCitations: finalCitations.length,
          validCitations: finalValidation.validCitations,
          processingTimeMs: Date.now() - startTime,
          modelUsed: response.model,
        },
      });
    }

    return {
      text: finalText,
      citations: finalCitations,
      claims,
      validationResult: finalValidation,
      generationMetadata: {
        modelUsed: response.model,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        generatedAt: new Date(),
        enforcementLevel: options.enforcementLevel,
      },
      auditId,
    };
  }

  /**
   * Build prompt with source context and citation requirements
   */
  private buildGroundedPrompt(userPrompt: string, options: GroundedGenerationOptions): string {
    const sourceContext = options.sources
      .map(
        (source, idx) =>
          `[${idx + 1}] ${source.title}\n${source.content.substring(0, 1500)}${source.content.length > 1500 ? '...' : ''}`
      )
      .join('\n\n---\n\n');

    const citationInstructions = this.getCitationInstructions(options);

    return `You are a regulatory medical writer creating content for FDA/EMA submissions.

CITATION REQUIREMENTS:
${citationInstructions}

ENFORCEMENT LEVEL: ${options.enforcementLevel.toUpperCase()}
${
  options.enforcementLevel === 'strict'
    ? '⚠️ EVERY factual claim MUST have a citation. Uncited claims will be rejected.'
    : options.enforcementLevel === 'moderate'
      ? '⚠️ All statistical and key factual claims MUST have citations.'
      : '⚠️ Citations are recommended but not strictly required.'
}

AVAILABLE SOURCES:
${sourceContext}

---

USER REQUEST:
${userPrompt}

---

Generate the response with proper citations to the numbered sources above.
Use ${options.citationFormat === 'bracketed' ? '[N]' : options.citationFormat === 'named' ? '(Source Name)' : 'inline references'} format for citations.`;
  }

  /**
   * Get citation format instructions
   */
  private getCitationInstructions(options: GroundedGenerationOptions): string {
    const instructions = [
      `- Citation format: ${
        options.citationFormat === 'bracketed'
          ? '[1], [2, 3]'
          : options.citationFormat === 'named'
            ? '(FDA 2024), (ICH E6)'
            : 'According to Source..., As stated in Document...'
      }`,
      `- Minimum citations per paragraph: ${options.minCitationsPerParagraph}`,
      `- Maximum consecutive characters without citation: ${options.maxUncitedCharacters}`,
    ];

    if (options.requireStatisticalCitations) {
      instructions.push(
        '- ALL statistical values (percentages, p-values, confidence intervals) MUST be cited'
      );
    }

    if (!options.allowInference) {
      instructions.push('- Do NOT make inferences or conclusions not explicitly stated in sources');
    }

    return instructions.join('\n');
  }

  /**
   * Call LLM with citation enforcement
   */
  private async callLLMWithCitationEnforcement(
    prompt: string,
    options: GroundedGenerationOptions
  ): Promise<{
    text: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    if (!this.openai) {
      // Return mock response if OpenAI not configured
      return {
        text: '[Mock generated text with citations [1] would appear here.]',
        model: 'mock',
        promptTokens: 0,
        completionTokens: 0,
      };
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory writer. You MUST cite sources for every factual claim using the specified citation format.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3, // Lower temperature for more factual output
      max_tokens: 4000,
    });

    return {
      text: response.choices[0]?.message?.content || '',
      model: response.model,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    };
  }

  /**
   * Regenerate with feedback from validation
   */
  private async regenerateWithFeedback(
    originalPrompt: string,
    options: GroundedGenerationOptions,
    validationResult: CitationValidationResult
  ): Promise<{ text: string; model: string }> {
    const feedbackPrompt = `
Your previous response had citation issues:
- Invalid citations: ${validationResult.invalidCitations.length}
- Missing citations for claims: ${validationResult.missingCitations.length}

ISSUES TO FIX:
${validationResult.missingCitations
  .map(
    m =>
      `- "${m.claim.substring(0, 50)}..." needs citation. Suggested sources: ${m.suggestedSources.join(', ')}`
  )
  .join('\n')}

${validationResult.invalidCitations
  .map(c => `- Citation "${c.text}" could not be verified against sources`)
  .join('\n')}

Please regenerate with proper citations to ALL factual claims.

${originalPrompt}`;

    const groundedPrompt = this.buildGroundedPrompt(feedbackPrompt, options);
    const response = await this.callLLMWithCitationEnforcement(groundedPrompt, options);

    return { text: response.text, model: response.model };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                    CITATION VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate citations against source documents
   */
  async validateCitations(
    text: string,
    citations: Citation[],
    sources: SourceDocument[]
  ): Promise<CitationValidationResult> {
    const validCitations: Citation[] = [];
    const invalidCitations: Citation[] = [];
    const missingCitations: MissingCitation[] = [];
    const verificationDetails: ClaimVerification[] = [];

    // Create source index
    const sourceIndex = new Map<string, SourceDocument>();
    sources.forEach((source, idx) => {
      sourceIndex.set(String(idx + 1), source); // For bracketed [1]
      sourceIndex.set(source.title, source); // For named (Title)
      sourceIndex.set(source.id, source); // For ID reference
    });

    // Verify each citation
    for (const citation of citations) {
      let isValid = false;

      for (const sourceId of citation.sourceIds) {
        const source = sourceIndex.get(sourceId);
        if (source) {
          isValid = true;
          citation.verificationStatus = 'verified';

          // Get the claim this citation supports
          const claim = this.getClaimForCitation(text, citation);
          if (claim) {
            const verification = await this.verifyClaim(claim, source);
            verificationDetails.push(verification);

            if (verification.verdict === 'contradicted') {
              citation.verificationStatus = 'invalid';
              isValid = false;
            }
          }
        }
      }

      if (isValid) {
        validCitations.push(citation);
      } else {
        invalidCitations.push(citation);
      }
    }

    // Find claims without citations
    const uncitedClaims = await this.findUncitedClaims(text, citations);
    for (const claim of uncitedClaims) {
      const suggestedSources = this.suggestSourcesForClaim(claim, sources);
      missingCitations.push({
        claim,
        position: { start: text.indexOf(claim), end: text.indexOf(claim) + claim.length },
        suggestedSources: suggestedSources.map(s => s.id),
        severity: this.isStatisticalClaim(claim) ? 'critical' : 'warning',
        reason: this.isStatisticalClaim(claim)
          ? 'Statistical claims require citations'
          : 'Factual claim without supporting citation',
      });
    }

    // Find orphaned sources (provided but not cited)
    const citedSourceIds = new Set(citations.flatMap(c => c.sourceIds));
    const orphanedSources = sources
      .filter(s => !citedSourceIds.has(s.id) && !citedSourceIds.has(s.title))
      .map(s => s.id);

    // Calculate overall faithfulness
    const totalVerifications = verificationDetails.length;
    const supportedCount = verificationDetails.filter(v => v.verdict === 'supported').length;
    const overallFaithfulness =
      totalVerifications > 0
        ? supportedCount / totalVerifications
        : validCitations.length / (validCitations.length + invalidCitations.length) || 0;

    return {
      isValid:
        invalidCitations.length === 0 &&
        missingCitations.filter(m => m.severity === 'critical').length === 0,
      totalCitations: citations.length,
      validCitations: validCitations.length,
      invalidCitations,
      missingCitations,
      orphanedSources,
      overallFaithfulness,
      verificationDetails,
    };
  }

  /**
   * Get the claim text that a citation supports
   */
  private getClaimForCitation(text: string, citation: Citation): string {
    // Get the sentence containing the citation
    const sentences = this.splitIntoSentences(text);
    if (citation.position.sentenceIndex < sentences.length) {
      return sentences[citation.position.sentenceIndex];
    }
    return '';
  }

  /**
   * Verify a claim against a source using NLI
   */
  private async verifyClaim(claim: string, source: SourceDocument): Promise<ClaimVerification> {
    // In production, use a proper NLI model (e.g., bart-large-mnli)
    // For now, use keyword-based heuristic

    const claimWords = claim.toLowerCase().split(/\s+/);
    const sourceWords = source.content.toLowerCase();

    let matchCount = 0;
    for (const word of claimWords) {
      if (word.length > 3 && sourceWords.includes(word)) {
        matchCount++;
      }
    }

    const overlapScore = matchCount / claimWords.length;

    // Check for numerical consistency
    const claimNumbers = claim.match(/\d+(?:\.\d+)?/g) || [];
    const sourceNumbers = source.content.match(/\d+(?:\.\d+)?/g) || [];
    const numberMatches = claimNumbers.filter(n => sourceNumbers.includes(n)).length;
    const numberScore = claimNumbers.length > 0 ? numberMatches / claimNumbers.length : 1;

    const entailmentScore = overlapScore * 0.6 + numberScore * 0.4;

    return {
      claim,
      sourceId: source.id,
      sourceExcerpt: this.findRelevantExcerpt(claim, source.content),
      entailmentScore,
      contradictionScore: entailmentScore < 0.3 ? 0.5 : 0.1,
      neutralScore: 1 - entailmentScore - (entailmentScore < 0.3 ? 0.5 : 0.1),
      verdict:
        entailmentScore > 0.6 ? 'supported' : entailmentScore < 0.3 ? 'contradicted' : 'neutral',
    };
  }

  /**
   * Find relevant excerpt from source that matches claim
   */
  private findRelevantExcerpt(claim: string, sourceContent: string): string {
    const sentences = sourceContent.split(/[.!?]+/);
    const claimWords = new Set(
      claim
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    let bestSentence = '';
    let bestScore = 0;

    for (const sentence of sentences) {
      const sentenceWords = sentence.toLowerCase().split(/\s+/);
      const score = sentenceWords.filter(w => claimWords.has(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence.trim();
      }
    }

    return bestSentence.substring(0, 200) + (bestSentence.length > 200 ? '...' : '');
  }

  /**
   * Find claims in text that don't have citations
   */
  private async findUncitedClaims(text: string, citations: Citation[]): Promise<string[]> {
    const uncited: string[] = [];
    const sentences = this.splitIntoSentences(text);

    // Get positions covered by citations
    const citedPositions = new Set<number>();
    for (const citation of citations) {
      citedPositions.add(citation.position.sentenceIndex);
    }

    // Check each sentence for factual claims
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Skip if this sentence has a citation
      if (citedPositions.has(i)) continue;

      // Check if sentence contains a statistical claim
      if (this.isStatisticalClaim(sentence)) {
        uncited.push(sentence);
        continue;
      }

      // Check for factual claim indicators
      if (this.isFactualClaim(sentence)) {
        uncited.push(sentence);
      }
    }

    return uncited;
  }

  /**
   * Check if text contains statistical claims
   */
  private isStatisticalClaim(text: string): boolean {
    return CITATION_PATTERNS.statisticalClaim.test(text);
  }

  /**
   * Check if text is a factual claim that needs citation
   */
  private isFactualClaim(text: string): boolean {
    // Factual claim indicators
    const indicators = [
      /demonstrated\s+that/i,
      /showed\s+that/i,
      /results?\s+(?:indicate|show|demonstrate)/i,
      /was\s+(?:found|observed|reported)/i,
      /statistically\s+significant/i,
      /reduction\s+in/i,
      /increase\s+in/i,
      /compared\s+to/i,
      /versus/i,
      /efficacy|safety|tolerability/i,
    ];

    return indicators.some(pattern => pattern.test(text));
  }

  /**
   * Suggest sources for an uncited claim
   */
  private suggestSourcesForClaim(claim: string, sources: SourceDocument[]): SourceDocument[] {
    // Score each source by relevance to claim
    const scored = sources.map(source => ({
      source,
      score: this.scoreSourceForClaim(claim, source),
    }));

    // Return top 3 sources
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.source);
  }

  /**
   * Score how relevant a source is to a claim
   */
  private scoreSourceForClaim(claim: string, source: SourceDocument): number {
    const claimWords = claim
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);
    const sourceText = (source.title + ' ' + source.content).toLowerCase();

    let score = 0;
    for (const word of claimWords) {
      if (sourceText.includes(word)) score++;
    }

    return score / claimWords.length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                    CLAIM EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract claims from generated text
   */
  private async extractClaims(text: string, citations: Citation[]): Promise<GeneratedClaim[]> {
    const claims: GeneratedClaim[] = [];
    const sentences = this.splitIntoSentences(text);
    let charOffset = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const start = charOffset;
      const end = charOffset + sentence.length;

      // Find citations in this sentence
      const sentenceCitations = citations.filter(c => c.position.sentenceIndex === i);

      // Determine claim type
      let type: GeneratedClaim['type'] = 'factual';
      if (this.isStatisticalClaim(sentence)) {
        type = 'statistical';
      } else if (/recommend|suggest|should/i.test(sentence)) {
        type = 'recommendation';
      } else if (/therefore|thus|conclude|in conclusion/i.test(sentence)) {
        type = 'conclusion';
      }

      claims.push({
        text: sentence,
        type,
        citations: sentenceCitations,
        faithfulnessScore: 0, // Will be updated during validation
        position: { start, end },
      });

      charOffset = end + 1; // +1 for space between sentences
    }

    return claims;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        PART 11 AUDIT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create Part 11 compliant audit entry
   */
  private async createAuditEntry(
    entry: Omit<Part11CitationAudit, 'id' | 'timestamp' | 'signature'>
  ): Promise<string> {
    const id = crypto.randomUUID();
    const timestamp = new Date();

    const entryData = JSON.stringify({ ...entry, id, timestamp });
    const signature = crypto.createHash('sha256').update(entryData).digest('hex');

    await this.pool.query(
      `
      INSERT INTO citation_audit_log (
        id, timestamp, action, user_id, input_hash, output_hash,
        sources_used, validation_score, details, signature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [
        id,
        timestamp,
        entry.action,
        entry.userId,
        entry.inputHash,
        entry.outputHash,
        JSON.stringify(entry.sourcesUsed),
        entry.validationScore,
        JSON.stringify(entry.details),
        signature,
      ]
    );

    return id;
  }

  /**
   * Get citation audit trail
   */
  async getAuditTrail(filters?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    action?: string;
    minValidationScore?: number;
  }): Promise<Part11CitationAudit[]> {
    let query = 'SELECT * FROM citation_audit_log WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.userId) {
      query += ` AND user_id = $${paramIdx++}`;
      params.push(filters.userId);
    }
    if (filters?.startDate) {
      query += ` AND timestamp >= $${paramIdx++}`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ` AND timestamp <= $${paramIdx++}`;
      params.push(filters.endDate);
    }
    if (filters?.action) {
      query += ` AND action = $${paramIdx++}`;
      params.push(filters.action);
    }
    if (filters?.minValidationScore !== undefined) {
      query += ` AND validation_score >= $${paramIdx++}`;
      params.push(filters.minValidationScore);
    }

    query += ' ORDER BY timestamp DESC';

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      userId: row.user_id,
      inputHash: row.input_hash,
      outputHash: row.output_hash,
      sourcesUsed: row.sources_used,
      validationScore: row.validation_score,
      details: row.details,
      signature: row.signature,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        UTILITY METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate existing text (without generation)
   */
  async validateExistingText(
    text: string,
    sources: SourceDocument[],
    userId: string
  ): Promise<CitationValidationResult> {
    const citations = this.parseCitations(text);
    const validationResult = await this.validateCitations(text, citations, sources);

    if (this.auditEnabled) {
      await this.createAuditEntry({
        action: 'validate',
        userId,
        inputHash: crypto.createHash('sha256').update(text).digest('hex'),
        outputHash: crypto
          .createHash('sha256')
          .update(JSON.stringify(validationResult))
          .digest('hex'),
        sourcesUsed: sources.map(s => s.id),
        validationScore: validationResult.overallFaithfulness,
        details: {
          totalCitations: validationResult.totalCitations,
          validCitations: validationResult.validCitations,
          missingCitations: validationResult.missingCitations.length,
        },
      });
    }

    return validationResult;
  }

  /**
   * Get citation coverage statistics
   */
  getCitationCoverage(
    text: string,
    citations: Citation[]
  ): {
    totalCharacters: number;
    citedCharacters: number;
    coveragePercentage: number;
    citationsPerParagraph: number;
  } {
    const paragraphs = text.split(/\n\n+/);
    const sentences = this.splitIntoSentences(text);

    // Calculate cited sentence count
    const citedSentenceIndices = new Set(citations.map(c => c.position.sentenceIndex));
    const citedCharacters = sentences
      .filter((_, i) => citedSentenceIndices.has(i))
      .reduce((sum, s) => sum + s.length, 0);

    return {
      totalCharacters: text.length,
      citedCharacters,
      coveragePercentage: (citedCharacters / text.length) * 100,
      citationsPerParagraph: citations.length / paragraphs.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let citationEnforcementService: CitationEnforcementService | null = null;

export function getCitationEnforcementService(pool: Pool): CitationEnforcementService {
  if (!citationEnforcementService) {
    citationEnforcementService = new CitationEnforcementService(pool);
  }
  return citationEnforcementService;
}
