/**
 * AnA Gold Standard Pack — Regulatory Document Quality Benchmark
 *
 * Provides rubric-based quality scoring for regulatory documents across:
 * - Regulatory compliance (CFR/ICH/CTD adherence)
 * - Scientific rigor (evidence quality, statistical methodology)
 * - Narrative coherence (logical flow, argumentation structure)
 * - Completeness (required elements present per submission type)
 * - Clarity & precision (readability, unambiguous language, FDA-preferred phrasing)
 *
 * Scoring model:
 *   Each dimension scored 0-100, weighted by submission type.
 *   Overall score = weighted average → mapped to grade (A+/A/B/C/D/F).
 *
 * @module server/services/ana-gold-standard
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('ana-gold-standard');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoldStandardInput {
  /** Section content to evaluate */
  content: string;
  /** CTD section identifier (e.g., "2.5", "2.7.1", "3.2.S") */
  sectionId: string;
  /** Submission type for context-specific rubric */
  submissionType: string;
  /** Target agency for agency-specific expectations */
  targetAgency?: string;
  /** Document metadata */
  metadata?: {
    productName?: string;
    indication?: string;
    therapeuticArea?: string;
    wordCount?: number;
  };
}

export interface DimensionScore {
  dimension: string;
  score: number;
  weight: number;
  grade: string;
  findings: Finding[];
  benchmark: {
    industry75th: number;
    industryMedian: number;
    minimum: number;
  };
}

export interface Finding {
  id: string;
  type: 'strength' | 'weakness' | 'critical_gap' | 'opportunity';
  description: string;
  location?: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  autoFixable: boolean;
  /** Reference to regulatory guidance supporting this finding */
  guidanceRef?: string;
}

export interface GoldStandardResult {
  sectionId: string;
  submissionType: string;
  targetAgency: string;
  overallScore: number;
  overallGrade: string;
  dimensions: DimensionScore[];
  findings: Finding[];
  improvementPlan: ImprovementAction[];
  readinessAssessment: {
    ready: boolean;
    blockers: string[];
    recommendations: string[];
    estimatedEffort: string;
  };
  benchmarkComparison: {
    percentile: number;
    comparedTo: string;
    aboveAverage: boolean;
  };
}

export interface ImprovementAction {
  priority: number;
  action: string;
  dimension: string;
  expectedScoreGain: number;
  effort: 'minimal' | 'moderate' | 'significant';
  description: string;
}

// ─── Rubric Definitions ─────────────────────────────────────────────────────

interface RubricCriterion {
  id: string;
  label: string;
  dimension: string;
  weight: number;
  checkFn: (content: string, ctx: GoldStandardInput) => { score: number; findings: Finding[] };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class GoldStandardEngine {

  async evaluate(input: GoldStandardInput): Promise<GoldStandardResult> {
    log.info(`Gold Standard evaluation: section=${input.sectionId}, type=${input.submissionType}`);

    const targetAgency = input.targetAgency || 'FDA';
    const criteria = this.getRubricCriteria(input.sectionId, input.submissionType, targetAgency);

    // Score each dimension
    const dimensionMap = new Map<string, { scores: number[]; weights: number[]; findings: Finding[] }>();

    for (const criterion of criteria) {
      const result = criterion.checkFn(input.content, input);
      const dim = dimensionMap.get(criterion.dimension) || { scores: [], weights: [], findings: [] };
      dim.scores.push(result.score);
      dim.weights.push(criterion.weight);
      dim.findings.push(...result.findings);
      dimensionMap.set(criterion.dimension, dim);
    }

    const dimensions: DimensionScore[] = [];
    for (const [dimension, data] of dimensionMap) {
      const totalWeight = data.weights.reduce((a, b) => a + b, 0);
      const weightedScore = data.scores.reduce((sum, s, i) => sum + s * data.weights[i], 0) / (totalWeight || 1);
      const score = Math.round(weightedScore);

      dimensions.push({
        dimension,
        score,
        weight: totalWeight / criteria.reduce((s, c) => s + c.weight, 0),
        grade: this.scoreToGrade(score),
        findings: data.findings,
        benchmark: this.getBenchmark(dimension, input.submissionType),
      });
    }

    // Calculate overall score
    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
    const overallScore = Math.round(
      dimensions.reduce((s, d) => s + d.score * d.weight, 0) / (totalWeight || 1)
    );

    // Aggregate findings
    const allFindings = dimensions.flatMap(d => d.findings);
    allFindings.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Build improvement plan
    const improvementPlan = this.buildImprovementPlan(dimensions, allFindings);

    // Readiness assessment
    const criticalGaps = allFindings.filter(f => f.type === 'critical_gap');
    const highPriority = allFindings.filter(f => f.priority === 'high' || f.priority === 'critical');

    const ready = criticalGaps.length === 0 && overallScore >= 70;
    const blockers = criticalGaps.map(g => g.description);
    const recommendations = highPriority.slice(0, 5).map(f => f.recommendation);

    const estimatedEffort = criticalGaps.length > 3 ? '2-4 weeks'
      : criticalGaps.length > 0 ? '1-2 weeks'
        : highPriority.length > 3 ? '3-5 days'
          : highPriority.length > 0 ? '1-2 days'
            : 'Ready for submission';

    // Benchmark comparison
    const percentile = this.calculatePercentile(overallScore, input.submissionType);

    return {
      sectionId: input.sectionId,
      submissionType: input.submissionType,
      targetAgency,
      overallScore,
      overallGrade: this.scoreToGrade(overallScore),
      dimensions,
      findings: allFindings,
      improvementPlan,
      readinessAssessment: {
        ready,
        blockers,
        recommendations,
        estimatedEffort,
      },
      benchmarkComparison: {
        percentile,
        comparedTo: `${input.submissionType} submissions (${targetAgency})`,
        aboveAverage: percentile > 50,
      },
    };
  }

  private getRubricCriteria(sectionId: string, submissionType: string, agency: string): RubricCriterion[] {
    const criteria: RubricCriterion[] = [];
    let findingIdx = 0;

    // ── REGULATORY COMPLIANCE ──────────────────────────────────────────

    criteria.push({
      id: 'reg-structure',
      label: 'CTD Structure Compliance',
      dimension: 'Regulatory Compliance',
      weight: 3,
      checkFn: (content, ctx) => {
        const findings: Finding[] = [];
        let score = 85;

        // Check for CTD section headers
        const hasHeaders = /^#{1,3}\s+\d+\.\d+/m.test(content) || /^Module\s+\d/im.test(content);
        if (!hasHeaders && content.length > 500) {
          score -= 15;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: 'Missing CTD section headers — document should follow Module/Section numbering per ICH M4',
            recommendation: 'Add proper CTD section numbering (e.g., 2.5.1, 2.5.2) per ICH M4 organization',
            priority: 'high',
            autoFixable: true,
            guidanceRef: 'ICH M4(R4)',
          });
        }

        // Check for required regulatory language
        const regulatoryPhrases = [
          'intended use', 'indication', 'mechanism of action', 'benefit-risk',
          'safety', 'efficacy', 'dosing', 'administration',
        ];
        const foundPhrases = regulatoryPhrases.filter(p => content.toLowerCase().includes(p));
        if (foundPhrases.length < 3 && content.length > 1000) {
          score -= 10;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: `Only ${foundPhrases.length} of ${regulatoryPhrases.length} expected regulatory terms found`,
            recommendation: 'Ensure section addresses core regulatory elements: indication, mechanism, benefit-risk, safety, efficacy',
            priority: 'medium',
            autoFixable: false,
            guidanceRef: 'FDA Guidance for Industry: Format and Content',
          });
        }

        return { score: Math.max(0, score), findings };
      },
    });

    criteria.push({
      id: 'reg-citations',
      label: 'Regulatory Citation Quality',
      dimension: 'Regulatory Compliance',
      weight: 2,
      checkFn: (content) => {
        const findings: Finding[] = [];
        let score = 80;

        // Check for CFR citations
        const cfrCitations = (content.match(/21\s*CFR\s*\d+/gi) || []).length;
        const ichCitations = (content.match(/ICH\s+[A-Z]\d+/gi) || []).length;
        const guidanceCitations = (content.match(/FDA\s+[Gg]uidance/gi) || []).length;

        const totalCitations = cfrCitations + ichCitations + guidanceCitations;
        if (totalCitations > 0) {
          score += Math.min(totalCitations * 3, 15);
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'strength',
            description: `${totalCitations} regulatory citation(s) found (${cfrCitations} CFR, ${ichCitations} ICH, ${guidanceCitations} FDA guidance)`,
            recommendation: 'Good regulatory grounding — ensure citations are current',
            priority: 'low',
            autoFixable: false,
          });
        } else if (content.length > 2000) {
          score -= 20;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'critical_gap',
            description: 'No regulatory citations (CFR, ICH, FDA guidance) found in a substantive section',
            recommendation: 'Add relevant CFR references, ICH guideline citations, and FDA guidance references to support regulatory claims',
            priority: 'critical',
            autoFixable: false,
            guidanceRef: 'ICH CTD M4 requires appropriate regulatory references',
          });
        }

        return { score: Math.max(0, Math.min(100, score)), findings };
      },
    });

    // ── SCIENTIFIC RIGOR ───────────────────────────────────────────────

    criteria.push({
      id: 'sci-evidence',
      label: 'Evidence Quality',
      dimension: 'Scientific Rigor',
      weight: 3,
      checkFn: (content) => {
        const findings: Finding[] = [];
        let score = 75;

        // Check for quantitative evidence
        const hasNumbers = /\d+\.?\d*\s*%|\d+\.?\d*\s*mg|p\s*[<>=]\s*0\.\d+|HR\s*=?\s*\d+\.\d+|CI\s*[:\s]*\d+/i.test(content);
        if (hasNumbers) {
          score += 10;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'strength',
            description: 'Quantitative evidence (statistics, measurements, confidence intervals) present',
            recommendation: 'Continue providing specific numerical data to support claims',
            priority: 'low',
            autoFixable: false,
          });
        } else if (content.length > 1500) {
          score -= 15;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: 'No quantitative evidence found — section relies on qualitative assertions only',
            recommendation: 'Add specific numerical data: response rates, p-values, confidence intervals, hazard ratios',
            priority: 'high',
            autoFixable: false,
          });
        }

        // Check for hedging language (weak claims)
        const hedgingPatterns = /\b(might|could potentially|may possibly|it is believed|it appears|seems to|arguably)\b/gi;
        const hedges = (content.match(hedgingPatterns) || []).length;
        if (hedges > 3) {
          score -= hedges * 3;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: `${hedges} hedging phrases detected ("might", "could potentially", "it appears") — weakens scientific confidence`,
            recommendation: 'Replace hedging language with direct, evidence-backed statements. FDA prefers definitive language supported by data.',
            priority: 'medium',
            autoFixable: true,
          });
        }

        // Check for unsupported superlatives
        const superlatives = /\b(best|greatest|most effective|superior|unprecedented|revolutionary|groundbreaking|first-ever)\b/gi;
        const supCount = (content.match(superlatives) || []).length;
        if (supCount > 0) {
          score -= supCount * 5;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: `${supCount} unsupported superlative(s) detected — these trigger FDA scrutiny unless backed by head-to-head data`,
            recommendation: 'Remove superlatives or provide comparative clinical evidence supporting superiority claims',
            priority: 'high',
            autoFixable: true,
            guidanceRef: 'FDA does not accept superiority claims without adequate comparative data',
          });
        }

        return { score: Math.max(0, Math.min(100, score)), findings };
      },
    });

    // ── NARRATIVE COHERENCE ────────────────────────────────────────────

    criteria.push({
      id: 'narr-flow',
      label: 'Logical Flow & Argumentation',
      dimension: 'Narrative Coherence',
      weight: 2,
      checkFn: (content) => {
        const findings: Finding[] = [];
        let score = 80;

        // Check paragraph structure
        const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
        if (paragraphs.length < 2 && content.length > 1000) {
          score -= 15;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: 'Document lacks paragraph breaks — reads as a single block of text',
            recommendation: 'Break content into logical paragraphs with clear topic sentences',
            priority: 'medium',
            autoFixable: true,
          });
        }

        // Check for transition language
        const transitions = /\b(therefore|consequently|furthermore|in addition|moreover|however|in contrast|specifically|notably|importantly|as a result)\b/gi;
        const transCount = (content.match(transitions) || []).length;
        if (transCount >= 3) {
          score += 5;
        } else if (content.length > 2000 && transCount < 2) {
          score -= 10;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'opportunity',
            description: 'Limited transitional language — narrative may feel disconnected',
            recommendation: 'Add logical connectors (therefore, consequently, furthermore) to strengthen argumentative flow',
            priority: 'low',
            autoFixable: true,
          });
        }

        // Check for conclusion/summary presence
        const hasConclusion = /\b(in summary|in conclusion|overall|taken together|collectively)\b/i.test(content);
        if (!hasConclusion && content.length > 2000) {
          score -= 5;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'opportunity',
            description: 'No concluding summary detected',
            recommendation: 'Add a concluding paragraph that synthesizes key findings and regulatory implications',
            priority: 'low',
            autoFixable: false,
          });
        }

        return { score: Math.max(0, Math.min(100, score)), findings };
      },
    });

    // ── COMPLETENESS ───────────────────────────────────────────────────

    criteria.push({
      id: 'comp-elements',
      label: 'Required Element Coverage',
      dimension: 'Completeness',
      weight: 3,
      checkFn: (content, ctx) => {
        const findings: Finding[] = [];
        let score = 70;

        const wordCount = content.split(/\s+/).length;
        const sectionExpectations = this.getSectionExpectations(ctx.sectionId, ctx.submissionType);

        // Check minimum word count
        if (wordCount < sectionExpectations.minWords) {
          score -= 20;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'critical_gap',
            description: `Section is ${wordCount} words — below minimum expectation of ${sectionExpectations.minWords} words for ${ctx.sectionId}`,
            recommendation: `Expand section to at least ${sectionExpectations.minWords} words with required regulatory content`,
            priority: 'critical',
            autoFixable: false,
          });
        } else {
          score += 10;
        }

        // Check for required subsections
        let foundSubsections = 0;
        for (const sub of sectionExpectations.requiredElements) {
          if (content.toLowerCase().includes(sub.toLowerCase())) {
            foundSubsections++;
          } else {
            findings.push({
              id: `F-${++findingIdx}`,
              type: 'weakness',
              description: `Missing required element: "${sub}"`,
              recommendation: `Add content addressing "${sub}" per ${ctx.submissionType} requirements`,
              priority: 'high',
              autoFixable: false,
            });
          }
        }

        const coverage = sectionExpectations.requiredElements.length > 0
          ? foundSubsections / sectionExpectations.requiredElements.length
          : 1;
        score = Math.round(score * (0.5 + 0.5 * coverage));

        if (coverage >= 0.8) {
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'strength',
            description: `${Math.round(coverage * 100)}% of required elements present (${foundSubsections}/${sectionExpectations.requiredElements.length})`,
            recommendation: 'Good completeness — address any remaining gaps',
            priority: 'low',
            autoFixable: false,
          });
        }

        return { score: Math.max(0, Math.min(100, score)), findings };
      },
    });

    // ── CLARITY & PRECISION ────────────────────────────────────────────

    criteria.push({
      id: 'clarity-readability',
      label: 'Clarity & Precision',
      dimension: 'Clarity & Precision',
      weight: 2,
      checkFn: (content) => {
        const findings: Finding[] = [];
        let score = 80;

        // Check sentence length (regulatory writing should be clear, not convoluted)
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const avgLength = sentences.length > 0
          ? sentences.reduce((s, sent) => s + sent.split(/\s+/).length, 0) / sentences.length
          : 0;

        if (avgLength > 35) {
          score -= 15;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: `Average sentence length is ${Math.round(avgLength)} words — exceeds 35-word threshold for regulatory readability`,
            recommendation: 'Break long sentences. FDA reviewers process hundreds of pages — clarity accelerates review.',
            priority: 'medium',
            autoFixable: true,
          });
        } else if (avgLength > 0 && avgLength <= 25) {
          score += 5;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'strength',
            description: `Average sentence length of ${Math.round(avgLength)} words — excellent readability for regulatory documents`,
            recommendation: 'Good clarity — maintain this standard',
            priority: 'low',
            autoFixable: false,
          });
        }

        // Check for passive voice overuse
        const passivePatterns = /\b(was|were|been|being|is|are)\s+((?:\w+ed|made|done|given|taken|shown|found|seen|known|used))\b/gi;
        const passiveCount = (content.match(passivePatterns) || []).length;
        const passiveRatio = sentences.length > 0 ? passiveCount / sentences.length : 0;

        if (passiveRatio > 0.4) {
          score -= 10;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: `${Math.round(passiveRatio * 100)}% passive voice usage — excessive for regulatory writing`,
            recommendation: 'Convert passive constructions to active voice where possible (e.g., "The study demonstrated" not "It was demonstrated")',
            priority: 'medium',
            autoFixable: true,
          });
        }

        // Check for ambiguous language
        const ambiguous = /\b(various|several|some|many|few|certain|generally|typically|usually|often|sometimes)\b/gi;
        const ambigCount = (content.match(ambiguous) || []).length;
        if (ambigCount > 5) {
          score -= ambigCount * 2;
          findings.push({
            id: `F-${++findingIdx}`,
            type: 'weakness',
            description: `${ambigCount} ambiguous quantifiers detected ("various", "several", "some") — FDA expects precision`,
            recommendation: 'Replace vague quantifiers with specific numbers (e.g., "3 studies" not "several studies")',
            priority: 'medium',
            autoFixable: true,
          });
        }

        return { score: Math.max(0, Math.min(100, score)), findings };
      },
    });

    return criteria;
  }

  private getSectionExpectations(sectionId: string, submissionType: string): {
    minWords: number;
    requiredElements: string[];
  } {
    const expectations: Record<string, { minWords: number; requiredElements: string[] }> = {
      '2.5': {
        minWords: 3000,
        requiredElements: [
          'product development rationale',
          'overview of clinical pharmacology',
          'overview of efficacy',
          'overview of safety',
          'benefit-risk assessment',
        ],
      },
      '2.7': {
        minWords: 5000,
        requiredElements: [
          'summary of biopharmaceutics',
          'summary of clinical pharmacology',
          'summary of clinical efficacy',
          'summary of clinical safety',
          'synopses of individual studies',
        ],
      },
      '2.3': {
        minWords: 2000,
        requiredElements: [
          'drug substance',
          'drug product',
          'manufacturing process',
          'specifications',
          'stability',
        ],
      },
      '2.4': {
        minWords: 2000,
        requiredElements: [
          'pharmacology',
          'pharmacokinetics',
          'toxicology',
          'integrated overview',
        ],
      },
      '3.2.S': {
        minWords: 3000,
        requiredElements: [
          'general information',
          'manufacture',
          'characterisation',
          'control of drug substance',
          'reference standards',
          'container closure',
          'stability',
        ],
      },
      '3.2.P': {
        minWords: 3000,
        requiredElements: [
          'description and composition',
          'pharmaceutical development',
          'manufacture',
          'control of excipients',
          'control of drug product',
          'reference standards',
          'container closure system',
          'stability',
        ],
      },
    };

    // Default for unknown sections
    return expectations[sectionId] || {
      minWords: 500,
      requiredElements: ['purpose', 'methods', 'results', 'conclusions'],
    };
  }

  private getBenchmark(dimension: string, submissionType: string): DimensionScore['benchmark'] {
    // Industry benchmarks (based on typical regulatory submission quality)
    const benchmarks: Record<string, DimensionScore['benchmark']> = {
      'Regulatory Compliance': { industry75th: 85, industryMedian: 72, minimum: 55 },
      'Scientific Rigor': { industry75th: 82, industryMedian: 68, minimum: 50 },
      'Narrative Coherence': { industry75th: 78, industryMedian: 65, minimum: 45 },
      'Completeness': { industry75th: 88, industryMedian: 75, minimum: 60 },
      'Clarity & Precision': { industry75th: 80, industryMedian: 70, minimum: 50 },
    };
    return benchmarks[dimension] || { industry75th: 80, industryMedian: 65, minimum: 50 };
  }

  private scoreToGrade(score: number): string {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'B-';
    if (score >= 65) return 'C+';
    if (score >= 60) return 'C';
    if (score >= 55) return 'C-';
    if (score >= 50) return 'D';
    return 'F';
  }

  private calculatePercentile(score: number, _submissionType: string): number {
    // Approximate percentile based on score distribution
    if (score >= 95) return 99;
    if (score >= 90) return 95;
    if (score >= 85) return 88;
    if (score >= 80) return 78;
    if (score >= 75) return 65;
    if (score >= 70) return 50;
    if (score >= 65) return 38;
    if (score >= 60) return 25;
    if (score >= 50) return 12;
    return 5;
  }

  private buildImprovementPlan(dimensions: DimensionScore[], findings: Finding[]): ImprovementAction[] {
    const actions: ImprovementAction[] = [];
    let priority = 0;

    // Critical gaps first
    for (const finding of findings.filter(f => f.type === 'critical_gap')) {
      actions.push({
        priority: ++priority,
        action: finding.recommendation,
        dimension: dimensions.find(d => d.findings.includes(finding))?.dimension || 'General',
        expectedScoreGain: 15,
        effort: 'significant',
        description: finding.description,
      });
    }

    // High-priority weaknesses
    for (const finding of findings.filter(f => f.priority === 'high' && f.type === 'weakness')) {
      actions.push({
        priority: ++priority,
        action: finding.recommendation,
        dimension: dimensions.find(d => d.findings.includes(finding))?.dimension || 'General',
        expectedScoreGain: 8,
        effort: finding.autoFixable ? 'minimal' : 'moderate',
        description: finding.description,
      });
    }

    // Lowest-scoring dimension improvement
    const weakestDimension = dimensions.reduce((min, d) => d.score < min.score ? d : min, dimensions[0]);
    if (weakestDimension && weakestDimension.score < 70) {
      actions.push({
        priority: ++priority,
        action: `Focus on improving "${weakestDimension.dimension}" — currently at ${weakestDimension.score}/100 (${weakestDimension.grade})`,
        dimension: weakestDimension.dimension,
        expectedScoreGain: 12,
        effort: 'moderate',
        description: `This dimension is pulling down the overall score. Benchmark median is ${weakestDimension.benchmark.industryMedian}.`,
      });
    }

    return actions.slice(0, 10);
  }
}

export const goldStandardEngine = new GoldStandardEngine();
