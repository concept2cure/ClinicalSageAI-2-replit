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
import { components, documents, coauthorValidationHistory } from '../../shared/schema';
import { eq, and, ilike, desc, gte, sql } from 'drizzle-orm';

interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  suggestions: Suggestion[];
  complianceScore: number;
}

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
  confidence: number;
  reasoning: string;
}
import { ai } from '../lib/unified-ai-client';

class RealTimeValidationService extends EventEmitter {
  private validationCache: Map<string, ValidationResult>;
  private debounceTimers: Map<string, NodeJS.Timeout>;
  private regulatoryTerms: Set<string>;
  private validationRules: Map<string, any> = new Map();

  constructor() {
    super();

    // Initialize OpenAI client
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
   * Validate content in real-time with debouncing
   */
  async validateContent(
    sessionId: string,
    content: string,
    documentType: string,
    immediateMode: boolean = false,
    organizationId?: number,
    documentId?: number,
    agency?: string
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

    // Persist to database if organization and document info provided
    if (organizationId && documentId && db) {
      try {
        await db.insert(coauthorValidationHistory).values({
          validationId: generateUUID(),
          organizationId,
          documentId,
          module: documentType,
          agency: agency || 'FDA',
          totalIssues: result.issues.length,
          criticalIssues: result.issues.filter(i => i.severity === 'critical').length,
          majorIssues: result.issues.filter(i => i.severity === 'major').length,
          minorIssues: result.issues.filter(i => i.severity === 'minor').length,
          informationalIssues: result.issues.filter(i => i.type === 'info').length,
          complianceScore: result.complianceScore,
          passedRules: 0,
          failedRules: result.issues.length,
          skippedRules: 0,
          validationResults: {
            issues: result.issues,
            suggestions: result.suggestions,
          },
          performedBy: 'system',
          performedAt: new Date(),
          metadata: {
            validationType: documentType,
            contentSnapshot: content.substring(0, 500),
          },
        });
      } catch (error) {
        console.error('Failed to persist validation history:', error);
        // Don't fail the validation if persistence fails
      }
    }

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

    // 3. AI-powered content analysis
    try {
      const aiAnalysis = await this.analyzeContentWithAI(content, documentType);
      issues.push(...aiAnalysis.issues);
      suggestions.push(...aiAnalysis.suggestions);
    } catch (error) {
      console.error('AI analysis failed:', error);
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

    // 5. Compliance scoring
    const complianceScore = this.calculateComplianceScore(issues);

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
      isValid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      suggestions,
      complianceScore,
    };
  }

  /**
   * Analyze content using AI
   */
  private async analyzeContentWithAI(
    content: string,
    documentType: string
  ): Promise<{ issues: ValidationIssue[]; suggestions: Suggestion[] }> {
    try {
      const completion = await this.ai.chat(
        {
          model: 'gpt-4o',
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
            - suggestions: array of {type, text, replacement, confidence, reasoning}`,
            },
            {
              role: 'user',
              content: content.substring(0, 3000),
            },
          ],
        },
        { jsonMode: true, temperature: 0.3, maxTokens: 1000 }
      );

      const result = JSON.parse(completion.content || '{}');

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
        confidence: sug.confidence || 0.7,
        reasoning: sug.reasoning || '',
      }));

      return { issues, suggestions };
    } catch (error) {
      console.error('AI analysis error:', error);
      return { issues: [], suggestions: [] };
    }
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
        confidence: 0.8,
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
          confidence: 0.9,
          reasoning: `Multiple structural issues detected. Using a template ensures compliance with regulatory requirements.`,
        });
      }

      if (category === 'terminology' && categoryIssues.length > 3) {
        suggestions.push({
          type: 'terminology',
          text: 'Enable terminology assistance for real-time suggestions',
          confidence: 0.85,
          reasoning: 'Consistent terminology improves document clarity and regulatory acceptance',
        });
      }

      if (category === 'citation' && categoryIssues.length > 0) {
        suggestions.push({
          type: 'citation',
          text: 'Use reference management tools to maintain citation consistency',
          confidence: 0.8,
          reasoning: 'Proper citation management reduces errors and improves document quality',
        });
      }
    }

    return suggestions;
  }

  /**
   * Get validation statistics for reporting
   */
  async getValidationStatistics(organizationId: number, days: number = 30): Promise<any> {
    if (!db) {
      return {
        totalValidations: 0,
        averageComplianceScore: 0,
        commonIssues: [],
        trendsLastWeek: { complianceImprovement: 0, issuesReduced: 0 },
      };
    }

    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      // Get all validations for the organization in the timeframe
      const validations = await db
        .select()
        .from(coauthorValidationHistory)
        .where(
          and(
            eq(coauthorValidationHistory.organizationId, organizationId),
            gte(coauthorValidationHistory.performedAt, sinceDate)
          )
        )
        .orderBy(desc(coauthorValidationHistory.performedAt));

      if (validations.length === 0) {
        return {
          totalValidations: 0,
          averageComplianceScore: 0,
          commonIssues: [],
          trendsLastWeek: { complianceImprovement: 0, issuesReduced: 0 },
        };
      }

      // Calculate statistics
      const totalValidations = validations.length;
      const averageComplianceScore = Math.round(
        validations.reduce((sum, v) => sum + (v.complianceScore || 0), 0) / totalValidations
      );

      // Analyze common issues
      const issueCategories = new Map<string, number>();
      for (const validation of validations) {
        const results = validation.validationResults as any;
        const issues = Array.isArray(results?.issues) ? results.issues : [];
        for (const issue of issues) {
          const category = issue.category || 'unknown';
          issueCategories.set(category, (issueCategories.get(category) || 0) + 1);
        }
      }

      const commonIssues = Array.from(issueCategories.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Calculate weekly trends
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentValidations = validations.filter(v => new Date(v.performedAt) >= weekAgo);
      const olderValidations = validations.filter(v => new Date(v.performedAt) < weekAgo);

      const recentAvgScore =
        recentValidations.length > 0
          ? recentValidations.reduce((sum, v) => sum + (v.complianceScore || 0), 0) /
            recentValidations.length
          : 0;

      const olderAvgScore =
        olderValidations.length > 0
          ? olderValidations.reduce((sum, v) => sum + (v.complianceScore || 0), 0) /
            olderValidations.length
          : recentAvgScore;

      const recentAvgIssues =
        recentValidations.length > 0
          ? recentValidations.reduce((sum, v) => sum + (v.totalIssues || 0), 0) /
            recentValidations.length
          : 0;

      const olderAvgIssues =
        olderValidations.length > 0
          ? olderValidations.reduce((sum, v) => sum + (v.totalIssues || 0), 0) /
            olderValidations.length
          : recentAvgIssues;

      return {
        totalValidations,
        averageComplianceScore,
        commonIssues,
        trendsLastWeek: {
          complianceImprovement: Math.round((recentAvgScore - olderAvgScore) * 10) / 10,
          issuesReduced: Math.round((olderAvgIssues - recentAvgIssues) * 10) / 10,
        },
        recentActivity: recentValidations.length,
        highestScore: Math.max(...validations.map(v => v.complianceScore || 0)),
        lowestScore: Math.min(...validations.map(v => v.complianceScore || 0)),
      };
    } catch (error) {
      console.error('Error getting validation statistics:', error);
      return {
        totalValidations: 0,
        averageComplianceScore: 0,
        commonIssues: [],
        trendsLastWeek: { complianceImprovement: 0, issuesReduced: 0 },
      };
    }
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
