/**
 * Pattern Registry — Regulatory Prior Knowledge
 *
 * A growing internal dataset of:
 *   - real deficiency patterns (what regulators flag)
 *   - reviewer question patterns (what reviewers ask)
 *   - rejection logic (why submissions get rejected)
 *   - phrasing that triggers pushback
 *   - phrasing that passes cleanly
 *
 * This is Concept2Cure's "regulatory prior knowledge" — the encoded
 * experience of what works and what doesn't in regulatory submissions.
 *
 * Patterns are:
 *   - deterministic (no LLM needed to match)
 *   - expandable (new patterns added as data accumulates)
 *   - used to reinforce prompts, augment analysis, improve consistency
 *
 * @module server/services/intelligence/pattern-registry
 */

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION — bumped when seed patterns change or matching logic changes
// ═══════════════════════════════════════════════════════════════════════════════

export const PATTERN_REGISTRY_VERSION = '1.1.0';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type PatternCategory =
  | 'deficiency'           // Patterns that lead to deficiency letters
  | 'reviewer_trigger'     // Language/structures that trigger reviewer questions
  | 'rejection'            // Patterns associated with rejections
  | 'strong_language'      // Phrasing that passes cleanly
  | 'weak_language'        // Phrasing that gets challenged
  | 'data_gap'             // Common data gaps
  | 'consistency_issue'    // Cross-section inconsistency patterns
  | 'formatting'           // Formatting issues regulators flag
  | 'risk_signal';         // Generic risk signal

export type RegulatoryAgency =
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'NMPA'
  | 'Health_Canada'
  | 'MHRA'
  | 'TGA'
  | 'ANVISA'
  | 'ICH'
  | 'any';

export type SubmissionType =
  | 'NDA'
  | 'BLA'
  | '510k'
  | 'PMA'
  | 'ANDA'
  | 'IND'
  | 'MAA'
  | 'CTD'
  | 'any';

export type CTDModule =
  | '1'    // Administrative
  | '2.1'  // TOC
  | '2.2'  // Introduction
  | '2.3'  // Quality Overall Summary
  | '2.4'  // Nonclinical Overview
  | '2.5'  // Clinical Overview
  | '2.6'  // Nonclinical Written/Tabulated Summaries
  | '2.7'  // Clinical Summary
  | '3'    // Quality (CMC)
  | '4'    // Nonclinical Study Reports
  | '5'    // Clinical Study Reports
  | 'any';

export interface RegulatoryPattern {
  readonly id: string;
  readonly category: PatternCategory;
  readonly name: string;
  readonly description: string;
  readonly agency: RegulatoryAgency;
  readonly submissionType: SubmissionType;
  readonly ctdModule: CTDModule;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly triggerPhrases: readonly string[];
  readonly strongAlternatives: readonly string[];
  readonly reviewerQuestion: string;
  readonly remediation: string;
  readonly regulatoryBasis: string;
  readonly source: 'seed' | 'learned' | 'user_contributed';
  readonly confidence: number; // 0-100
  readonly hitCount: number; // how many times this pattern has been matched
  readonly lastMatchedAt: string | null;
  readonly createdAt: string;
}

export interface PatternMatch {
  readonly patternId: string;
  readonly matchedText: string;
  readonly matchLocation: string; // section or field reference
  readonly matchConfidence: number; // 0-100
  readonly pattern: RegulatoryPattern;
}

export interface PatternSearchCriteria {
  readonly category?: PatternCategory;
  readonly agency?: RegulatoryAgency;
  readonly submissionType?: SubmissionType;
  readonly ctdModule?: CTDModule;
  readonly minSeverity?: 'critical' | 'high' | 'medium' | 'low';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED PATTERNS — Regulatory Prior Knowledge
//
// These are the starting patterns. As the system processes more documents,
// new patterns are added via addLearnedPattern().
// ═══════════════════════════════════════════════════════════════════════════════

const SEED_PATTERNS: RegulatoryPattern[] = [
  // ── Deficiency patterns ──
  {
    id: 'DEF-001',
    category: 'deficiency',
    name: 'Missing primary endpoint justification',
    description: 'Clinical study report lacks adequate justification for primary endpoint selection',
    agency: 'FDA',
    submissionType: 'NDA',
    ctdModule: '2.5',
    severity: 'critical',
    triggerPhrases: ['endpoint was selected', 'primary endpoint is', 'we chose'],
    strongAlternatives: [
      'The primary endpoint was selected based on',
      'Regulatory precedent supports this endpoint selection (cite)',
      'This endpoint is consistent with the FDA guidance for [indication]',
    ],
    reviewerQuestion: 'Please provide the scientific rationale for the selection of the primary endpoint.',
    remediation: 'Add a dedicated subsection in 2.5 justifying primary endpoint selection with regulatory precedent and scientific rationale',
    regulatoryBasis: 'FDA Guidance: Adaptive Design Clinical Trials; ICH E9',
    source: 'seed',
    confidence: 95,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'DEF-002',
    category: 'deficiency',
    name: 'Inadequate stability data',
    description: 'Module 3 (Quality) lacks sufficient stability data to support proposed shelf life',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '3',
    severity: 'critical',
    triggerPhrases: ['stability data supports', 'shelf life of', 'preliminary stability'],
    strongAlternatives: [
      'Long-term stability data (X months) under ICH conditions (25°C/60%RH) demonstrate',
      'Accelerated stability data (X months, 40°C/75%RH) confirm',
    ],
    reviewerQuestion: 'Provide long-term stability data supporting the proposed shelf life claim.',
    remediation: 'Ensure Module 3.2.P.8 contains complete stability study reports covering the proposed shelf life period',
    regulatoryBasis: 'ICH Q1A(R2); ICH Q1E',
    source: 'seed',
    confidence: 95,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'DEF-003',
    category: 'deficiency',
    name: 'Inconsistent safety data across sections',
    description: 'Adverse event counts or rates differ between clinical summary and individual study reports',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '2.7',
    severity: 'critical',
    triggerPhrases: [],
    strongAlternatives: [
      'All safety data in Module 2.7 are derived directly from and consistent with Module 5 study reports',
    ],
    reviewerQuestion: 'Please reconcile the discrepancy in adverse event data between Section 2.7 and Study Report [X].',
    remediation: 'Cross-validate all safety tables in Module 2.7 against source study reports in Module 5',
    regulatoryBasis: 'ICH E3; ICH M4E(R2)',
    source: 'seed',
    confidence: 90,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },

  // ── Reviewer trigger patterns ──
  {
    id: 'RT-001',
    category: 'reviewer_trigger',
    name: 'Vague efficacy language',
    description: 'Efficacy claims use vague or unquantified language that invites reviewer follow-up',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '2.5',
    severity: 'high',
    triggerPhrases: [
      'clinically meaningful improvement',
      'substantial benefit',
      'significant improvement',
      'favorable outcome',
      'demonstrated efficacy',
    ],
    strongAlternatives: [
      'Treatment group showed a [X]% reduction in [endpoint] (p=[value], 95% CI [range])',
      'The difference in [endpoint] between groups was [X] units (95% CI [range])',
    ],
    reviewerQuestion: 'Please quantify the claimed clinical benefit with specific statistical measures.',
    remediation: 'Replace vague efficacy statements with quantified results including effect sizes, confidence intervals, and p-values',
    regulatoryBasis: 'ICH E9(R1); FDA Guidance on Clinical Trial Endpoints',
    source: 'seed',
    confidence: 90,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'RT-002',
    category: 'reviewer_trigger',
    name: 'Missing subgroup analysis',
    description: 'Clinical overview lacks key subgroup analyses (age, sex, race, disease severity)',
    agency: 'FDA',
    submissionType: 'NDA',
    ctdModule: '2.5',
    severity: 'high',
    triggerPhrases: [
      'overall population',
      'all patients',
      'full analysis set',
    ],
    strongAlternatives: [
      'Subgroup analyses by [age, sex, race, baseline disease severity] are presented in Section [X]',
      'Forest plots for key subgroups are provided in [appendix reference]',
    ],
    reviewerQuestion: 'Please provide subgroup analyses by age, sex, race, and baseline disease severity.',
    remediation: 'Add subgroup analysis results to Module 2.7.3 with appropriate forest plots',
    regulatoryBasis: 'ICH E9; FDA Guidance: Collection of Race and Ethnicity Data',
    source: 'seed',
    confidence: 85,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },

  // ── Weak language patterns ──
  {
    id: 'WL-001',
    category: 'weak_language',
    name: 'Hedging language in safety conclusions',
    description: 'Safety conclusions use hedging that undermines confidence in the safety profile',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '2.7',
    severity: 'medium',
    triggerPhrases: [
      'appears to be safe',
      'seems to be well tolerated',
      'no major safety concerns were identified',
      'generally well tolerated',
      'safety profile appears acceptable',
    ],
    strongAlternatives: [
      'The safety profile is characterized by [specific AE profile]',
      'The incidence of [AE] was X% in the treatment group vs Y% in placebo (p=[value])',
      'No deaths or treatment-related serious adverse events were reported',
    ],
    reviewerQuestion: 'Please provide a more definitive characterization of the safety profile.',
    remediation: 'Replace hedging language with specific, quantified safety data',
    regulatoryBasis: 'ICH E2C(R2); ICH M4E(R2)',
    source: 'seed',
    confidence: 85,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'WL-002',
    category: 'weak_language',
    name: 'Unsupported superiority claims',
    description: 'Claims of superiority without adequate comparative data',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '2.5',
    severity: 'high',
    triggerPhrases: [
      'superior to',
      'better than',
      'more effective than',
      'outperforms',
      'exceeds the efficacy of',
    ],
    strongAlternatives: [
      'In the head-to-head comparison (Study [X]), [drug] showed [quantified difference] vs [comparator]',
      'Non-inferiority was demonstrated with a margin of [X] (95% CI [range])',
    ],
    reviewerQuestion: 'Please provide the statistical basis for the superiority claim.',
    remediation: 'Either support superiority claims with pre-specified superiority analysis results or rephrase as non-inferiority/descriptive comparison',
    regulatoryBasis: 'ICH E9(R1); FDA Guidance on Non-Inferiority Trials',
    source: 'seed',
    confidence: 90,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },

  // ── Data gap patterns ──
  {
    id: 'DG-001',
    category: 'data_gap',
    name: 'Missing carcinogenicity data',
    description: 'Nonclinical package lacks carcinogenicity studies for a chronically administered drug',
    agency: 'any',
    submissionType: 'NDA',
    ctdModule: '4',
    severity: 'critical',
    triggerPhrases: [
      'carcinogenicity studies are not required',
      'carcinogenicity data will be provided post-approval',
      'carcinogenicity assessment is ongoing',
    ],
    strongAlternatives: [
      'Two-year carcinogenicity studies in [species] are presented in Module 4.2.3.4',
      'A carcinogenicity waiver was granted by [agency] based on [rationale] (reference [X])',
    ],
    reviewerQuestion: 'Please provide carcinogenicity study reports or justification for their omission.',
    remediation: 'Include completed carcinogenicity studies or provide documented waiver/scientific justification per ICH S1',
    regulatoryBasis: 'ICH S1A; ICH S1B(R1)',
    source: 'seed',
    confidence: 90,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'DG-002',
    category: 'data_gap',
    name: 'Insufficient characterization of impurities',
    description: 'Drug substance or drug product impurity profile is incomplete',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '3',
    severity: 'high',
    triggerPhrases: [
      'impurities are within limits',
      'impurity profile is acceptable',
      'impurities were controlled',
    ],
    strongAlternatives: [
      'All specified and unspecified impurities are identified, qualified, and controlled per ICH Q3A/Q3B thresholds',
      'Impurity [name]: identified as [structure], qualified at [level] per [toxicology study reference]',
    ],
    reviewerQuestion: 'Provide complete impurity identification, qualification, and specification justification.',
    remediation: 'Complete impurity characterization in Module 3.2.S.3.2 and 3.2.P.5.5 per ICH Q3A/Q3B',
    regulatoryBasis: 'ICH Q3A(R2); ICH Q3B(R2); ICH Q3D',
    source: 'seed',
    confidence: 90,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },

  // ── Formatting patterns ──
  {
    id: 'FMT-001',
    category: 'formatting',
    name: 'Non-compliant eCTD granularity',
    description: 'Documents are not split into eCTD-compliant granularity for electronic submission',
    agency: 'FDA',
    submissionType: 'any',
    ctdModule: 'any',
    severity: 'medium',
    triggerPhrases: [],
    strongAlternatives: [],
    reviewerQuestion: 'Please reformat the submission to comply with eCTD granularity requirements.',
    remediation: 'Split combined documents into individual eCTD leaves per FDA eCTD guidance',
    regulatoryBasis: 'FDA eCTD Guidance; ICH M8',
    source: 'seed',
    confidence: 80,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },

  // ── Consistency issue patterns ──
  {
    id: 'CI-001',
    category: 'consistency_issue',
    name: 'Protocol vs CSR endpoint mismatch',
    description: 'Primary endpoints described in the CSR do not match the protocol',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '5',
    severity: 'critical',
    triggerPhrases: [],
    strongAlternatives: [
      'The primary endpoint [X] as specified in Protocol Section [Y] was evaluated as described below',
    ],
    reviewerQuestion: 'The primary endpoint in the CSR appears to differ from the protocol. Please clarify.',
    remediation: 'Ensure CSR Section 9 endpoints exactly match Protocol Section [X]. Document any protocol amendments that changed endpoints.',
    regulatoryBasis: 'ICH E3; 21 CFR 314.50',
    source: 'seed',
    confidence: 95,
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: new Date().toISOString(),
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PatternRegistryImpl {
  private patterns: Map<string, RegulatoryPattern> = new Map();

  constructor() {
    // Seed with initial patterns
    for (const pattern of SEED_PATTERNS) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Get all patterns, optionally filtered.
   */
  getPatterns(criteria?: PatternSearchCriteria): RegulatoryPattern[] {
    let results = Array.from(this.patterns.values());

    if (criteria?.category) {
      results = results.filter(p => p.category === criteria.category);
    }
    if (criteria?.agency) {
      results = results.filter(p => p.agency === criteria.agency || p.agency === 'any');
    }
    if (criteria?.submissionType) {
      results = results.filter(p => p.submissionType === criteria.submissionType || p.submissionType === 'any');
    }
    if (criteria?.ctdModule) {
      results = results.filter(p => p.ctdModule === criteria.ctdModule || p.ctdModule === 'any');
    }
    if (criteria?.minSeverity) {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const minOrder = severityOrder[criteria.minSeverity];
      results = results.filter(p => severityOrder[p.severity] <= minOrder);
    }

    return results;
  }

  /**
   * Get a single pattern by ID.
   */
  getPattern(id: string): RegulatoryPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Scan text for matching patterns. Returns all matches found.
   */
  scanText(
    text: string,
    location: string,
    criteria?: PatternSearchCriteria,
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const lowerText = text.toLowerCase();
    const candidates = this.getPatterns(criteria);

    for (const pattern of candidates) {
      if (pattern.triggerPhrases.length === 0) continue;

      for (const phrase of pattern.triggerPhrases) {
        const lowerPhrase = phrase.toLowerCase();
        const idx = lowerText.indexOf(lowerPhrase);
        if (idx !== -1) {
          // Extract surrounding context (up to 100 chars each side)
          const start = Math.max(0, idx - 100);
          const end = Math.min(text.length, idx + phrase.length + 100);
          const matchedText = text.substring(start, end);

          matches.push({
            patternId: pattern.id,
            matchedText,
            matchLocation: location,
            matchConfidence: pattern.confidence,
            pattern,
          });

          // Record hit
          this.recordHit(pattern.id);

          // Only match once per pattern per scan
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Add a new learned pattern (from accumulated analysis data).
   */
  addLearnedPattern(
    pattern: Omit<RegulatoryPattern, 'id' | 'source' | 'hitCount' | 'lastMatchedAt' | 'createdAt'>,
  ): RegulatoryPattern {
    const id = `LP-${String(this.patterns.size + 1).padStart(4, '0')}`;
    const full: RegulatoryPattern = {
      ...pattern,
      id,
      source: 'learned',
      hitCount: 0,
      lastMatchedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.patterns.set(id, full);
    return full;
  }

  /**
   * Record a hit against a pattern (for tracking which patterns fire most).
   */
  private recordHit(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Immutable update
    this.patterns.set(patternId, {
      ...pattern,
      hitCount: pattern.hitCount + 1,
      lastMatchedAt: new Date().toISOString(),
    });
  }

  /**
   * Get the most frequently matched patterns (most valuable patterns).
   */
  getTopPatterns(limit: number = 10): RegulatoryPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, limit);
  }

  /**
   * Get the registry version (base version + learned pattern count).
   * Format: "1.1.0+L5" means base v1.1.0 with 5 learned patterns added.
   */
  get version(): string {
    const learnedCount = Array.from(this.patterns.values())
      .filter(p => p.source === 'learned').length;
    return learnedCount > 0
      ? `${PATTERN_REGISTRY_VERSION}+L${learnedCount}`
      : PATTERN_REGISTRY_VERSION;
  }

  /**
   * Get total pattern count.
   */
  get size(): number {
    return this.patterns.size;
  }

  /**
   * Export all patterns (for persistence/backup).
   */
  exportPatterns(): RegulatoryPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns (from persistence/backup).
   */
  importPatterns(patterns: RegulatoryPattern[]): void {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const patternRegistry = new PatternRegistryImpl();
