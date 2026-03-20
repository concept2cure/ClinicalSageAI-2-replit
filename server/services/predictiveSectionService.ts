/**
 * Predictive Document Section Suggestions Service
 *
 * This service analyzes document context and provides intelligent suggestions
 * for next sections based on regulatory patterns, AI analysis, and ICH guidelines.
 */

interface DocumentContext {
  currentSection?: string;
  documentType: string;
  submissionType: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'Other';
  therapeuticArea?: string;
  studyPhase?: string;
  existingSections: string[];
  documentContent?: string;
  regulatoryRegion: 'FDA' | 'EMA' | 'PMDA' | 'HC' | 'TGA' | 'Global';
}

type SupportedSubmissionType = 'IND' | 'NDA' | '510k';
type SectionMetadataKey = '2.5' | '2.7' | '3.2.S' | '3.2.P' | '5.3.5.1';

interface SectionSuggestion {
  sectionCode: string;
  sectionTitle: string;
  priority: 'High' | 'Medium' | 'Low';
  confidence: number;
  reasoning: string;
  dependencies: string[];
  estimatedEffort: 'Quick' | 'Medium' | 'Complex';
  regulatoryRequirement: 'Mandatory' | 'Recommended' | 'Optional';
  aiGenerated: boolean;
  templateAvailable: boolean;
}

interface PredictionResponse {
  suggestions: SectionSuggestion[];
  completionProgress: number;
  nextMilestone: string;
  criticalPath: string[];
  regulatoryGaps: string[];
}
import { ai } from '../lib/unified-ai-client';

class PredictiveSectionService {
  private sectionPatterns: Record<SupportedSubmissionType, Record<string, string[]>> = {
    IND: {
      Module1: [
        '1.1',
        '1.2',
        '1.3',
        '1.4',
        '1.5',
        '1.6',
        '1.7',
        '1.8',
        '1.9',
        '1.10',
        '1.11',
        '1.12',
        '1.13',
        '1.14',
      ],
      Module2: ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
      Module3: ['3.1', '3.2.S', '3.2.P', '3.2.A', '3.2.R'],
      Module4: ['4.1', '4.2', '4.3'],
      Module5: ['5.1', '5.2', '5.3', '5.4'],
    },
    NDA: {
      Module1: [
        '1.1',
        '1.2',
        '1.3',
        '1.4',
        '1.5',
        '1.6',
        '1.7',
        '1.8',
        '1.9',
        '1.10',
        '1.11',
        '1.12',
        '1.13',
        '1.14',
      ],
      Module2: ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
      Module3: ['3.1', '3.2.S', '3.2.P', '3.2.A', '3.2.R'],
      Module4: ['4.1', '4.2', '4.3'],
      Module5: ['5.1', '5.2', '5.3', '5.4'],
    },
    '510k': {
      DeviceDescription: ['510k.1', '510k.2', '510k.3'],
      SubstantialEquivalence: ['510k.4', '510k.5', '510k.6'],
      PerformanceData: ['510k.7', '510k.8', '510k.9'],
      Labeling: ['510k.10', '510k.11'],
    },
  };

  private sectionMetadata = {
    '2.5': {
      title: 'Clinical Overview',
      dependencies: ['2.4'],
      effort: 'Complex',
      requirement: 'Mandatory',
      description: 'Comprehensive clinical overview integrating all clinical data',
    },
    '2.7': {
      title: 'Clinical Summary',
      dependencies: ['2.5', '5.2', '5.3'],
      effort: 'Complex',
      requirement: 'Mandatory',
      description: 'Detailed clinical summary supporting benefit-risk assessment',
    },
    '3.2.S': {
      title: 'Drug Substance',
      dependencies: [],
      effort: 'Complex',
      requirement: 'Mandatory',
      description: 'Complete drug substance information including manufacturing',
    },
    '3.2.P': {
      title: 'Drug Product',
      dependencies: ['3.2.S'],
      effort: 'Complex',
      requirement: 'Mandatory',
      description: 'Drug product development and manufacturing information',
    },
    '5.3.5.1': {
      title: 'Study Reports of Controlled Clinical Studies',
      dependencies: ['2.5'],
      effort: 'Complex',
      requirement: 'Mandatory',
      description: 'Individual study reports for pivotal clinical trials',
    },
  };

  /**
   * Get predictive section suggestions based on document context
   */
  async getSectionSuggestions(context: DocumentContext): Promise<PredictionResponse> {
    try {
      // Analyze current document state
      const currentProgress = this.calculateProgress(context);
      const availableSections = this.getAvailableSections(context);

      // Use AI to enhance predictions
      const aiSuggestions = await this.getAISuggestions(context);

      // Combine rule-based and AI suggestions
      const suggestions = this.rankSuggestions([...availableSections, ...aiSuggestions], context);

      // Identify critical path and gaps
      const criticalPath = this.getCriticalPath(context);
      const regulatoryGaps = this.identifyRegulatoryGaps(context);

      return {
        suggestions: suggestions.slice(0, 8), // Top 8 suggestions
        completionProgress: currentProgress,
        nextMilestone: this.getNextMilestone(context),
        criticalPath,
        regulatoryGaps,
      };
    } catch (error) {
      console.error('Error generating section suggestions:', error);
      throw new Error('Failed to generate predictive suggestions');
    }
  }

  /**
   * Get AI-enhanced section suggestions using OpenAI
   */
  private async getAISuggestions(context: DocumentContext): Promise<SectionSuggestion[]> {
    try {
      const prompt = `
        As a regulatory affairs expert, analyze this submission context and suggest the next most logical document sections:

        Submission Type: ${context.submissionType}
        Document Type: ${context.documentType}
        Current Section: ${context.currentSection || 'None'}
        Therapeutic Area: ${context.therapeuticArea || 'Not specified'}
        Study Phase: ${context.studyPhase || 'Not specified'}
        Regulatory Region: ${context.regulatoryRegion}
        Existing Sections: ${context.existingSections.join(', ') || 'None'}

        Provide suggestions in JSON format with the following structure:
        {
          "suggestions": [
            {
              "sectionCode": "string",
              "sectionTitle": "string",
              "priority": "High|Medium|Low",
              "confidence": number (0-100),
              "reasoning": "string",
              "dependencies": ["array of section codes"],
              "estimatedEffort": "Quick|Medium|Complex",
              "regulatoryRequirement": "Mandatory|Recommended|Optional"
            }
          ]
        }

        Focus on ICH M4 structure for pharmaceutical submissions and FDA guidance for device submissions.
        Consider logical document flow and regulatory requirements.
      `;

      const aiResult = await ai.chat({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory affairs consultant specializing in pharmaceutical and medical device submissions. Provide accurate, actionable section recommendations based on regulatory guidelines.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = aiResult.content || '{}';
      const result = JSON.parse(content);
      const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];

      return suggestions.map((suggestion: any) => ({
        ...suggestion,
        aiGenerated: true,
        templateAvailable: this.hasTemplate(suggestion.sectionCode),
      }));
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      return [];
    }
  }

  /**
   * Get rule-based section suggestions
   */
  private getAvailableSections(context: DocumentContext): SectionSuggestion[] {
    const normalizedType = this.normalizeSubmissionType(context.submissionType);
    const patterns = this.sectionPatterns[normalizedType] || {};
    const suggestions: SectionSuggestion[] = [];

    (Object.entries(patterns) as Array<[string, string[]]>).forEach(([module, sections]) => {
      sections.forEach((sectionCode: string) => {
        if (!context.existingSections.includes(sectionCode)) {
          const metadata = this.sectionMetadata[sectionCode as SectionMetadataKey];

          // Check if dependencies are met
          const dependenciesMet =
            !metadata?.dependencies ||
            metadata.dependencies.every((dep: string) => context.existingSections.includes(dep));

          if (dependenciesMet) {
            suggestions.push({
              sectionCode,
              sectionTitle: metadata?.title || `Section ${sectionCode}`,
              priority: this.calculatePriority(sectionCode, context),
              confidence: this.calculateConfidence(sectionCode, context),
              reasoning: this.generateReasoning(sectionCode, context),
              dependencies: metadata?.dependencies || [],
              estimatedEffort: (metadata?.effort as any) || 'Medium',
              regulatoryRequirement: (metadata?.requirement as any) || 'Recommended',
              aiGenerated: false,
              templateAvailable: this.hasTemplate(sectionCode),
            });
          }
        }
      });
    });

    return suggestions;
  }

  /**
   * Rank suggestions by relevance and priority
   */
  private rankSuggestions(
    suggestions: SectionSuggestion[],
    context: DocumentContext
  ): SectionSuggestion[] {
    return suggestions.sort((a, b) => {
      // Priority weight
      const priorityWeight = { High: 3, Medium: 2, Low: 1 };
      const priorityScore = (priorityWeight[b.priority] - priorityWeight[a.priority]) * 100;

      // Confidence weight
      const confidenceScore = b.confidence - a.confidence;

      // Regulatory requirement weight
      const reqWeight = { Mandatory: 3, Recommended: 2, Optional: 1 };
      const reqScore =
        (reqWeight[b.regulatoryRequirement] - reqWeight[a.regulatoryRequirement]) * 50;

      return priorityScore + confidenceScore + reqScore;
    });
  }

  /**
   * Calculate completion progress
   */
  private calculateProgress(context: DocumentContext): number {
    const totalSections = this.getTotalSections(
      this.normalizeSubmissionType(context.submissionType)
    );
    const completedSections = context.existingSections.length;
    return Math.round((completedSections / totalSections) * 100);
  }

  /**
   * Get critical path sections
   */
  private getCriticalPath(context: DocumentContext): string[] {
    const normalizedType = this.normalizeSubmissionType(context.submissionType);
    const criticalSections = {
      IND: ['2.5', '3.2.S', '3.2.P', '4.2', '5.2'],
      NDA: ['2.5', '2.7', '3.2.S', '3.2.P', '5.3.5.1'],
      '510k': ['510k.2', '510k.5', '510k.8'],
    };

    return criticalSections[normalizedType] || [];
  }

  /**
   * Identify regulatory gaps
   */
  private identifyRegulatoryGaps(context: DocumentContext): string[] {
    const gaps: string[] = [];
    const criticalSections = this.getCriticalPath(context);

    criticalSections.forEach(section => {
      if (!context.existingSections.includes(section)) {
        const metadata = this.sectionMetadata[section as SectionMetadataKey];
        gaps.push(`Missing critical section: ${section} - ${metadata?.title || section}`);
      }
    });

    return gaps;
  }

  /**
   * Get next milestone
   */
  private getNextMilestone(context: DocumentContext): string {
    const progress = this.calculateProgress(context);

    if (progress < 25) return 'Complete Module 1 Administrative Information';
    if (progress < 50) return 'Complete Module 2 Summaries';
    if (progress < 75) return 'Complete Module 3 Quality Information';
    if (progress < 90) return 'Complete Clinical Sections';
    return 'Final Review and Submission';
  }

  /**
   * Helper methods
   */
  private calculatePriority(
    sectionCode: string,
    context: DocumentContext
  ): 'High' | 'Medium' | 'Low' {
    const criticalSections = this.getCriticalPath(context);
    if (criticalSections.includes(sectionCode)) return 'High';

    const metadata = this.sectionMetadata[sectionCode as SectionMetadataKey];
    if (metadata?.requirement === 'Mandatory') return 'High';
    if (metadata?.requirement === 'Recommended') return 'Medium';
    return 'Low';
  }

  private calculateConfidence(sectionCode: string, context: DocumentContext): number {
    let confidence = 70; // Base confidence

    // Boost confidence for logical next sections
    if (context.currentSection) {
      const currentNum = parseFloat(context.currentSection.replace(/[^\d.]/g, ''));
      const sectionNum = parseFloat(sectionCode.replace(/[^\d.]/g, ''));

      if (sectionNum > currentNum && sectionNum - currentNum <= 1) {
        confidence += 20;
      }
    }

    // Boost for mandatory sections
    const metadata = this.sectionMetadata[sectionCode as SectionMetadataKey];
    if (metadata?.requirement === 'Mandatory') confidence += 15;

    return Math.min(confidence, 95);
  }

  private generateReasoning(sectionCode: string, context: DocumentContext): string {
    const metadata = this.sectionMetadata[sectionCode as SectionMetadataKey];
    const reasons: string[] = [];

    if (metadata?.requirement === 'Mandatory') {
      reasons.push('Required by regulatory guidelines');
    }

    if (metadata?.dependencies?.length > 0) {
      const completedDeps = metadata.dependencies.filter((dep: string) =>
        context.existingSections.includes(dep)
      );
      if (completedDeps.length === metadata.dependencies.length) {
        reasons.push('All dependencies completed');
      }
    }

    if (this.getCriticalPath(context).includes(sectionCode)) {
      reasons.push('On critical path for submission');
    }

    return reasons.length > 0 ? reasons.join('; ') : 'Logical next section in sequence';
  }

  private hasTemplate(sectionCode: string): boolean {
    // Check if template exists for this section
    const templatedSections = ['2.5', '2.7', '3.2.S', '3.2.P', '510k.2', '510k.5'];
    return templatedSections.includes(sectionCode);
  }

  private getTotalSections(submissionType: SupportedSubmissionType): number {
    const patterns = this.sectionPatterns[submissionType] || {};
    return Object.values(patterns).flat().length;
  }

  private normalizeSubmissionType(
    submissionType: DocumentContext['submissionType']
  ): SupportedSubmissionType {
    if (submissionType === 'BLA' || submissionType === 'PMA') {
      return 'NDA';
    }
    if (submissionType === 'Other') {
      return 'IND';
    }
    return submissionType;
  }
}

export default new PredictiveSectionService();
