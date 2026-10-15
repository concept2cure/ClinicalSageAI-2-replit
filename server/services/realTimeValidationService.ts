/**
 * Real-Time Editor Validation Service
 *
 * Provides AI-powered real-time validation and suggestions for document editors
 * with regulatory compliance checking and intelligent content recommendations.
 *
 * Features:
 * - Real-time content validation as users type
 * - AI-powered suggestions for regulatory compliance
 * - Grammar and terminology checking
 * - Citation validation and reference checking
 * - Regulatory requirement matching
 * - Cross-reference validation
 */

import { EventEmitter } from 'events';
import { generateUUID } from '../utils/id-generator';
import { db } from '../db';
import { coauthorValidationHistory } from '../../shared/schema';
import type { ValidationFinding } from '../../shared/types/ai-actions';
import { ai } from '../lib/unified-ai-client';
import { classifyGatewayError } from './ai-gateway/gateway-error-map';

/**
 * Whether the AI content analysis actually covered the content.
 *
 * Until 2026-09-23 this was not recorded at all, and three stacked `catch`
 * blocks turned an AI failure into "no issues found": a refusal, an outage or
 * an unparseable reply produced `isValid: true`, and run_validation set the
 * target's status to 'validated' and offered "Promote to document — Validation
 * passed". The analysis also only ever saw the first 3,000 characters, and
 * said nothing about the rest. A validation that did not look is not a pass.
 */
export interface AiAnalysisCoverage {
  status: 'complete' | 'partial' | 'not_run';
  analysedChars: number;
  totalChars: number;
  /** Why it is not complete, in words safe to show the author. */
  note?: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  suggestions: Suggestion[];
  /**
   * 0-100 from the findings, or null when the AI analysis did not cover the
   * whole content. It was 100 whenever no issue was recorded — including when
   * the analysis never ran or saw only part of the content — and that 100 was
   * recorded with the run (2026-10-15).
   */
  complianceScore: number | null;
  aiAnalysis: AiAnalysisCoverage;
}

/**
 * How much of a document the AI analysis is given. Content beyond this is not
 * analysed, and the result says so (`aiAnalysis.status: 'partial'`) rather than
 * reporting the whole document validated.
 */
export const AI_ANALYSIS_MAX_CHARS = 60_000;

interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  position: { start: number; end: number };
  severity: 'critical' | 'major' | 'minor';
  category: string;
}

interface Suggestion {
  type: 'content' | 'terminology' | 'compliance' | 'citation';
  text: string;
  replacement?: string;
  /**
   * Nothing here computes a confidence, so it is null. It was 0.8 for a
   * spelling match, 0.9 / 0.85 / 0.8 for canned advice, and 0.7 for a model
   * suggestion that gave none — and the model was asked for one, a figure no
   * deterministic engine produced (CLAUDE.md RULE 2) (2026-10-15).
   */
  confidence: number | null;
  reasoning: string;
}

/**
 * One run of run_validation, as coauthor_validation_history records it.
 *
 * The row this replaces said performedBy 'system' with the user known;
 * agency 'FDA' when none was named, though nothing in these checks is
 * agency-specific; document_id set to an artifact or unified-document id in
 * a column that references coauthor_documents; passedRules 0 and failedRules
 * the issue count, when no rule set is counted; and nothing of the project,
 * the target or whether the run passed. The readiness engine needs those, so
 * it read run_validation's audit row instead — which carries no result — and
 * took every run for a pass with a score of 0 (2026-10-15).
 */
export interface ValidationRunRecord {
  organizationId: number;
  projectId: number | null;
  /** What was validated, as the caller names it; null for inline content. */
  target: { type: string; id: string | number } | null;
  /** The validated object's title, as the caller read it. */
  title: string | null;
  documentType: string;
  /** The agency the caller named, or null. */
  agency: string | null;
  performedByUserId: number;
  /** The person's name or email, as the request authenticated them. */
  performedBy: string;
  content: string;
  result: ValidationResult;
  /** The findings as the caller reported them. */
  findings: ValidationFinding[];
}

/**
 * Record one validation run. A failure to write throws: a validation with no
 * record is not one a reviewer can rely on, so the caller does not apply it.
 * It used to be logged and the run applied anyway (2026-10-15).
 */
export async function recordValidationRun(run: ValidationRunRecord): Promise<void> {
  const count = (severity: ValidationFinding['severity']) =>
    run.findings.filter((f) => f.severity === severity).length;
  await db.insert(coauthorValidationHistory).values({
    validationId: generateUUID(),
    organizationId: run.organizationId,
    // The column references coauthor_documents, and run_validation validates
    // artifacts and unified documents: the target is named in metadata
    // rather than linked to a different document that shares its id.
    documentId: null,
    module: run.documentType,
    agency: run.agency,
    totalIssues: run.findings.length,
    criticalIssues: count('critical'),
    majorIssues: count('major'),
    minorIssues: count('minor'),
    informationalIssues: count('info'),
    complianceScore: run.result.complianceScore,
    // No rule set is counted: the checks are section, terminology and
    // citation scans and the AI analysis.
    passedRules: null,
    failedRules: null,
    skippedRules: null,
    validationResults: {
      isValid: run.result.isValid,
      aiAnalysis: run.result.aiAnalysis,
      findings: run.findings,
    },
    performedBy: run.performedBy,
    performedByUserId: run.performedByUserId,
    performedAt: new Date(),
    metadata: {
      validationType: run.documentType,
      projectId: run.projectId,
      target: run.target,
      title: run.title,
      contentSnapshot: run.content.substring(0, 500),
    },
  });
}

class RealTimeValidationService extends EventEmitter {
  private validationCache: Map<string, ValidationResult>;
  private debounceTimers: Map<string, NodeJS.Timeout>;
  private regulatoryTerms: Set<string>;
  private validationRules: Map<string, any> = new Map();
  private ai = ai;

  constructor() {
    super();

    // Initialize validation cache
    this.validationCache = new Map();
    this.debounceTimers = new Map();

    // Initialize regulatory terms database
    this.regulatoryTerms = new Set([
      'GMP',
      'GCP',
      'GLP',
      'ICH',
      'FDA',
      'EMA',
      'PMDA',
      'IND',
      'NDA',
      'ANDA',
      'BLA',
      'MAA',
      'CTA',
      'Phase I',
      'Phase II',
      'Phase III',
      'Phase IV',
      'adverse event',
      'serious adverse event',
      'protocol deviation',
      'informed consent',
      'investigator',
      'sponsor',
      'clinical trial',
      'pivotal study',
      'bioequivalence',
      'pharmacokinetics',
      'pharmacodynamics',
      'efficacy',
      'safety',
      'CMC',
      'API',
      'drug substance',
      'drug product',
      'stability',
      'impurity',
      'specification',
      'validation',
      'quality control',
      'quality assurance',
    ]);

    // Initialize validation rules
    this.initializeValidationRules();
  }

  /**
   * Initialize validation rules for different document types
   */
  private initializeValidationRules() {
    this.validationRules = new Map([
      [
        'clinical_protocol',
        {
          required_sections: [
            'study objectives',
            'study design',
            'study population',
            'inclusion criteria',
            'exclusion criteria',
            'endpoints',
            'statistical analysis',
            'safety monitoring',
          ],
          terminology_check: true,
          citation_required: true,
          max_deviation_allowed: 5,
        },
      ],
      [
        'regulatory_submission',
        {
          required_sections: [
            'executive summary',
            'quality module',
            'nonclinical module',
            'clinical module',
            'administrative information',
          ],
          compliance_check: true,
          reference_validation: true,
          format_requirements: 'eCTD',
        },
      ],
      [
        'manufacturing_documentation',
        {
          required_sections: [
            'process description',
            'batch records',
            'quality control',
            'stability data',
            'validation reports',
          ],
          gmp_compliance: true,
          specification_check: true,
          change_control_required: true,
        },
      ],
    ]);
  }

  /**
   * Validate content in real-time with debouncing. Recording a run is the
   * caller's, with recordValidationRun: only it knows who asked, on what.
   */
  async validateContent(
    sessionId: string,
    content: string,
    documentType: string,
    immediateMode: boolean = false
  ): Promise<ValidationResult> {
    // Clear existing debounce timer
    if (this.debounceTimers.has(sessionId)) {
      clearTimeout(this.debounceTimers.get(sessionId)!);
    }

    // Return cached result if available and not immediate mode
    if (!immediateMode && this.validationCache.has(sessionId)) {
      return this.validationCache.get(sessionId)!;
    }

    // Debounce validation unless immediate mode
    if (!immediateMode) {
      return new Promise(resolve => {
        const timer = setTimeout(async () => {
          const result = await this.performValidation(content, documentType);
          this.validationCache.set(sessionId, result);
          this.emit('validation-complete', { sessionId, result });
          resolve(result);
        }, 500); // 500ms debounce

        this.debounceTimers.set(sessionId, timer);
      });
    }

    // Perform immediate validation
    const result = await this.performValidation(content, documentType);
    this.validationCache.set(sessionId, result);

    this.emit('validation-complete', { sessionId, result });
    return result;
  }

  /**
   * Perform actual validation
   */
  private async performValidation(
    content: string,
    documentType: string
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const suggestions: Suggestion[] = [];

    // Get validation rules for document type
    const rules = this.validationRules.get(documentType) || {};

    // 1. Check for required sections
    if (rules.required_sections) {
      for (const section of rules.required_sections) {
        if (!content.toLowerCase().includes(section.toLowerCase())) {
          issues.push({
            type: 'warning',
            message: `Missing required section: ${section}`,
            position: { start: 0, end: 0 },
            severity: 'major',
            category: 'structure',
          });
        }
      }
    }

    // 2. Terminology validation
    if (rules.terminology_check) {
      const terms = this.extractTerminology(content);
      for (const term of terms) {
        if (!this.isValidTerminology(term)) {
          const position = content.indexOf(term);
          issues.push({
            type: 'warning',
            message: `Non-standard terminology: "${term}"`,
            position: { start: position, end: position + term.length },
            severity: 'minor',
            category: 'terminology',
          });

          // Suggest correct terminology
          const suggestion = await this.suggestTerminology(term);
          if (suggestion) {
            suggestions.push(suggestion);
          }
        }
      }
    }

    // 3. AI-powered content analysis. A failure here is recorded, not
    //    swallowed: it makes the result not-valid (see aiAnalysis above).
    let aiAnalysis: AiAnalysisCoverage;
    try {
      const analysed = await this.analyzeContentWithAI(content, documentType);
      issues.push(...analysed.issues);
      suggestions.push(...analysed.suggestions);
      aiAnalysis = analysed.coverage;
    } catch (error) {
      const { message } = classifyGatewayError(error);
      console.error('AI analysis failed:', error);
      aiAnalysis = {
        status: 'not_run',
        analysedChars: 0,
        totalChars: content.length,
        note: `The AI content analysis did not run: ${message}`,
      };
    }

    // 4. Citation and reference validation
    if (rules.citation_required) {
      const citations = this.extractCitations(content);
      const references = this.extractReferences(content);

      // Check for uncited references
      for (const ref of references) {
        if (!citations.some(c => c.includes(ref.id))) {
          issues.push({
            type: 'info',
            message: `Reference "${ref.id}" is not cited in the text`,
            position: { start: 0, end: 0 },
            severity: 'minor',
            category: 'citation',
          });
        }
      }

      // Check for missing references
      for (const citation of citations) {
        if (!references.some(r => citation.includes(r.id))) {
          const position = content.indexOf(citation);
          issues.push({
            type: 'error',
            message: `Citation "${citation}" has no corresponding reference`,
            position: { start: position, end: position + citation.length },
            severity: 'major',
            category: 'citation',
          });
        }
      }
    }

    // 5. Compliance scoring — over content the analysis covered in full only.
    const complianceScore =
      aiAnalysis.status === 'complete' ? this.calculateComplianceScore(issues) : null;

    // 6. Generate smart suggestions based on context
    if (issues.length > 0) {
      const contextualSuggestions = await this.generateContextualSuggestions(
        content,
        issues,
        documentType
      );
      suggestions.push(...contextualSuggestions);
    }

    return {
      // Valid only when nothing is wrong AND the analysis looked at all of it.
      isValid: issues.filter(i => i.type === 'error').length === 0 && aiAnalysis.status === 'complete',
      issues,
      suggestions,
      complianceScore,
      aiAnalysis,
    };
  }

  /**
   * Analyze content using AI.
   *
   * Routed as `regulatory_review`, so only a model approved for high-risk
   * regulatory work serves it; it used to pin `gpt-4o`, which the approved-models
   * registry does not approve for that. Throws on any failure — the caller
   * records it as `not_run` — and never answers "no issues" for content it did
   * not analyse.
   */
  private async analyzeContentWithAI(
    content: string,
    documentType: string
  ): Promise<{ issues: ValidationIssue[]; suggestions: Suggestion[]; coverage: AiAnalysisCoverage }> {
    const analysed = content.slice(0, AI_ANALYSIS_MAX_CHARS);
    const completion = await this.ai.chat(
        {
          taskType: 'regulatory_review',
          callerModule: 'realTimeValidationService.analyzeContentWithAI',
          messages: [
            {
              role: 'system',
              content: `You are a regulatory document validation expert. Analyze the following ${documentType} content for:
            1. Regulatory compliance issues
            2. Missing required information
            3. Clarity and consistency problems
            4. Technical accuracy issues

            Return a JSON object with:
            - issues: array of {type, message, severity, category}
            - suggestions: array of {type, text, replacement, reasoning}`,
            },
            {
              role: 'user',
              content: analysed,
            },
          ],
        },
        { jsonMode: true, temperature: 0.3, maxTokens: 1000 }
      );

      // An unparseable reply throws here, and is recorded as not_run: "no
      // issues" is an answer, and nothing was answered.
      const result = JSON.parse(completion.content ?? '');
      if (!result || typeof result !== 'object' || !Array.isArray(result.issues)) {
        throw new Error('the AI analysis returned no issues list');
      }

      // Map AI results to our format
      const issues: ValidationIssue[] = (result.issues || []).map((issue: any) => ({
        type: issue.type || 'warning',
        message: issue.message,
        position: { start: 0, end: 0 }, // AI doesn't provide positions
        severity: issue.severity || 'minor',
        category: issue.category || 'general',
      }));

      const suggestions: Suggestion[] = (result.suggestions || []).map((sug: any) => ({
        type: sug.type || 'content',
        text: sug.text,
        replacement: sug.replacement,
        confidence: null,
        reasoning: sug.reasoning || '',
      }));

      const partial = content.length > analysed.length;
      return {
        issues,
        suggestions,
        coverage: {
          status: partial ? 'partial' : 'complete',
          analysedChars: analysed.length,
          totalChars: content.length,
          ...(partial
            ? {
                note:
                  `The AI content analysis covered the first ${analysed.length.toLocaleString('en-US')} of ` +
                  `${content.length.toLocaleString('en-US')} characters; the rest was not analysed.`,
              }
            : {}),
        },
      };
  }

  /**
   * Extract terminology from content
   */
  private extractTerminology(content: string): string[] {
    // Extract capitalized terms and acronyms
    const terms: string[] = [];
    const regex = /\b[A-Z]{2,}\b|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      terms.push(match[0]);
    }

    return [...new Set(terms)]; // Remove duplicates
  }

  /**
   * Check if terminology is valid
   */
  private isValidTerminology(term: string): boolean {
    return (
      this.regulatoryTerms.has(term) ||
      this.regulatoryTerms.has(term.toUpperCase()) ||
      term.length <= 3
    ); // Allow short acronyms
  }

  /**
   * Suggest correct terminology
   */
  private async suggestTerminology(incorrectTerm: string): Promise<Suggestion | null> {
    // Find similar terms in our database
    const similarTerms = Array.from(this.regulatoryTerms).filter(
      term => this.calculateSimilarity(term.toLowerCase(), incorrectTerm.toLowerCase()) > 0.7
    );

    if (similarTerms.length > 0) {
      return {
        type: 'terminology',
        text: `Consider using standard terminology: "${similarTerms[0]}"`,
        replacement: similarTerms[0],
        confidence: null,
        reasoning: 'Standard regulatory terminology improves clarity and compliance',
      };
    }

    return null;
  }

  /**
   * Calculate string similarity (Levenshtein distance based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Extract citations from content
   */
  private extractCitations(content: string): string[] {
    const citations: string[] = [];
    const regex = /\[(\d+)\]|\(([^)]+,\s*\d{4})\)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      citations.push(match[0]);
    }

    return citations;
  }

  /**
   * Extract references from content
   */
  private extractReferences(content: string): Array<{ id: string; text: string }> {
    const references: Array<{ id: string; text: string }> = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Look for numbered references
      const match = line.match(/^(\d+)\.\s+(.+)/);
      if (match) {
        references.push({ id: match[1], text: match[2] });
      }
    }

    return references;
  }

  /**
   * Calculate compliance score based on issues
   */
  private calculateComplianceScore(issues: ValidationIssue[]): number {
    if (issues.length === 0) return 100;

    let score = 100;
    const weights = {
      critical: 15,
      major: 10,
      minor: 5,
    };

    for (const issue of issues) {
      if (issue.type === 'error') {
        score -= weights[issue.severity] * 1.5;
      } else if (issue.type === 'warning') {
        score -= weights[issue.severity];
      } else {
        score -= weights[issue.severity] * 0.5;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate contextual suggestions based on issues
   */
  private async generateContextualSuggestions(
    content: string,
    issues: ValidationIssue[],
    documentType: string
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Group issues by category
    const issuesByCategory = new Map<string, ValidationIssue[]>();
    for (const issue of issues) {
      if (!issuesByCategory.has(issue.category)) {
        issuesByCategory.set(issue.category, []);
      }
      issuesByCategory.get(issue.category)!.push(issue);
    }

    // Generate suggestions for each category
    for (const [category, categoryIssues] of issuesByCategory) {
      if (category === 'structure' && categoryIssues.length > 2) {
        suggestions.push({
          type: 'content',
          text: 'Consider using a standard template for this document type',
          confidence: null,
          reasoning: `Multiple structural issues detected. Using a template ensures compliance with regulatory requirements.`,
        });
      }

      // A terminology suggestion here said "Enable terminology assistance for
      // real-time suggestions" — there is no such setting (2026-10-15).

      if (category === 'citation' && categoryIssues.length > 0) {
        suggestions.push({
          type: 'citation',
          text: 'Use reference management tools to maintain citation consistency',
          confidence: null,
          reasoning: 'Proper citation management reduces errors and improves document quality',
        });
      }
    }

    return suggestions;
  }

  /**
   * Clear validation cache for a session
   */
  clearSession(sessionId: string): void {
    this.validationCache.delete(sessionId);
    if (this.debounceTimers.has(sessionId)) {
      clearTimeout(this.debounceTimers.get(sessionId)!);
      this.debounceTimers.delete(sessionId);
    }
  }
}

// Export singleton instance
export const realTimeValidationService = new RealTimeValidationService();
export default realTimeValidationService;
