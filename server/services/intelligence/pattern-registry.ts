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

export const PATTERN_REGISTRY_VERSION = '1.3.0';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type PatternCategory =
  | 'deficiency' // Patterns that lead to deficiency letters
  | 'reviewer_trigger' // Language/structures that trigger reviewer questions
  | 'rejection' // Patterns associated with rejections
  | 'strong_language' // Phrasing that passes cleanly
  | 'weak_language' // Phrasing that gets challenged
  | 'data_gap' // Common data gaps
  | 'consistency_issue' // Cross-section inconsistency patterns
  | 'formatting' // Formatting issues regulators flag
  | 'risk_signal'; // Generic risk signal

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
  | '1' // Administrative
  | '2.1' // TOC
  | '2.2' // Introduction
  | '2.3' // Quality Overall Summary
  | '2.4' // Nonclinical Overview
  | '2.5' // Clinical Overview
  | '2.6' // Nonclinical Written/Tabulated Summaries
  | '2.7' // Clinical Summary
  | '3' // Quality (CMC)
  | '4' // Nonclinical Study Reports
  | '5' // Clinical Study Reports
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
    description:
      'Clinical study report lacks adequate justification for primary endpoint selection',
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
    reviewerQuestion:
      'Please provide the scientific rationale for the selection of the primary endpoint.',
    remediation:
      'Add a dedicated subsection in 2.5 justifying primary endpoint selection with regulatory precedent and scientific rationale',
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
    description:
      'Module 3 (Quality) lacks sufficient stability data to support proposed shelf life',
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
    remediation:
      'Ensure Module 3.2.P.8 contains complete stability study reports covering the proposed shelf life period',
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
    description:
      'Adverse event counts or rates differ between clinical summary and individual study reports',
    agency: 'any',
    submissionType: 'any',
    ctdModule: '2.7',
    severity: 'critical',
    triggerPhrases: [],
    strongAlternatives: [
      'All safety data in Module 2.7 are derived directly from and consistent with Module 5 study reports',
    ],
    reviewerQuestion:
      'Please reconcile the discrepancy in adverse event data between Section 2.7 and Study Report [X].',
    remediation:
      'Cross-validate all safety tables in Module 2.7 against source study reports in Module 5',
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
    description:
      'Efficacy claims use vague or unquantified language that invites reviewer follow-up',
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
    reviewerQuestion:
      'Please quantify the claimed clinical benefit with specific statistical measures.',
    remediation:
      'Replace vague efficacy statements with quantified results including effect sizes, confidence intervals, and p-values',
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
    triggerPhrases: ['overall population', 'all patients', 'full analysis set'],
    strongAlternatives: [
      'Subgroup analyses by [age, sex, race, baseline disease severity] are presented in Section [X]',
      'Forest plots for key subgroups are provided in [appendix reference]',
    ],
    reviewerQuestion:
      'Please provide subgroup analyses by age, sex, race, and baseline disease severity.',
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
    remediation:
      'Either support superiority claims with pre-specified superiority analysis results or rephrase as non-inferiority/descriptive comparison',
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
    description:
      'Nonclinical package lacks carcinogenicity studies for a chronically administered drug',
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
    reviewerQuestion:
      'Please provide carcinogenicity study reports or justification for their omission.',
    remediation:
      'Include completed carcinogenicity studies or provide documented waiver/scientific justification per ICH S1',
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
    reviewerQuestion:
      'Provide complete impurity identification, qualification, and specification justification.',
    remediation:
      'Complete impurity characterization in Module 3.2.S.3.2 and 3.2.P.5.5 per ICH Q3A/Q3B',
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
    description:
      'Documents are not split into eCTD-compliant granularity for electronic submission',
    agency: 'FDA',
    submissionType: 'any',
    ctdModule: 'any',
    severity: 'medium',
    triggerPhrases: [],
    strongAlternatives: [],
    reviewerQuestion:
      'Please reformat the submission to comply with eCTD granularity requirements.',
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
    reviewerQuestion:
      'The primary endpoint in the CSR appears to differ from the protocol. Please clarify.',
    remediation:
      'Ensure CSR Section 9 endpoints exactly match Protocol Section [X]. Document any protocol amendments that changed endpoints.',
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
      results = results.filter(
        p => p.submissionType === criteria.submissionType || p.submissionType === 'any'
      );
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
  scanText(text: string, location: string, criteria?: PatternSearchCriteria): PatternMatch[] {
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
    pattern: Omit<RegulatoryPattern, 'id' | 'source' | 'hitCount' | 'lastMatchedAt' | 'createdAt'>
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
   * Heuristically check whether text reads like a regulatory deficiency
   * statement that *would* match a pattern, even though no registered pattern
   * caught it. Used to nominate candidate patterns for the registry.
   *
   * Two-token check keeps false positives down: a deficiency trigger word
   * ("incomplete", "missing", etc.) AND a regulatory anchor (CFR, ICH, Module,
   * etc.). General phrases that mention only one of the two don't qualify.
   */
  looksLikeUnregisteredDeficiency(text: string): boolean {
    if (!text || text.length < 60) return false;
    const lower = text.toLowerCase();

    const deficiencyTriggers = [
      'incomplete', 'missing', 'insufficient', 'fail to', 'does not meet',
      'lacking', 'absent', 'not provided', 'not addressed', 'inadequate',
      'unsupported', 'unsubstantiated', 'no evidence', 'cannot be assessed',
    ];
    const regulatoryAnchors = [
      'ich ', 'cfr', 'fda', 'ema', 'chmp', 'pmda', 'mhra', 'tga',
      'module ', 'section ', 'annex', 'guideline', 'regulation',
      '510(k)', 'pma', 'mdr', 'ivdr', 'gcp', 'glp', 'gmp',
    ];

    const hasDeficiency = deficiencyTriggers.some(t => lower.includes(t));
    if (!hasDeficiency) return false;
    return regulatoryAnchors.some(a => lower.includes(a));
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
    const learnedCount = Array.from(this.patterns.values()).filter(
      p => p.source === 'learned'
    ).length;
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
// PERSISTENCE — save/load learned patterns to survive restarts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist learned patterns and hit counts to the database.
 * Call periodically or on significant pattern changes.
 */
export async function persistPatternRegistry(
  organizationId: number
): Promise<{ success: boolean; patternCount: number; error?: string }> {
  try {
    // Dynamic import to avoid circular dependencies
    const { db } = await import('../../db.js');
    const { projectIntelligenceProfiles, projectMemoryEntries } = await import(
      '../../../shared/schema.js'
    );
    const { eq } = await import('drizzle-orm');

    // Find any profile for this org to store patterns
    const [profile] = await db
      .select({
        id: projectIntelligenceProfiles.id,
        projectId: projectIntelligenceProfiles.projectId,
      })
      .from(projectIntelligenceProfiles)
      .where(eq(projectIntelligenceProfiles.organizationId, organizationId))
      .limit(1);

    if (!profile) {
      return { success: false, patternCount: 0, error: 'No intelligence profile found' };
    }

    const patterns = patternRegistry.exportPatterns();
    const learnedPatterns = patterns.filter(p => p.source === 'learned');
    const hitPatterns = patterns.filter(p => p.hitCount > 0);

    await db.insert(projectMemoryEntries).values({
      projectProfileId: profile.id,
      projectId: profile.projectId,
      organizationId,
      category: 'rim_pattern_registry',
      subcategory: 'pattern_export',
      title: 'RIM Pattern Registry Export',
      content: JSON.stringify({
        version: patternRegistry.version,
        learnedPatterns,
        hitCounts: Object.fromEntries(hitPatterns.map(p => [p.id, p.hitCount])),
        lastMatchDates: Object.fromEntries(
          hitPatterns.filter(p => p.lastMatchedAt).map(p => [p.id, p.lastMatchedAt])
        ),
        exportedAt: new Date().toISOString(),
        totalPatterns: patterns.length,
        learnedCount: learnedPatterns.length,
        activePatterns: hitPatterns.length,
      }),
      sourceDocumentName: 'rim-pattern-registry',
      sourceDocumentType: 'system',
      confidenceScore: 1,
      importanceLevel: 'high',
      extractedBy: 'system',
    });

    return { success: true, patternCount: patterns.length };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[RIM] Pattern registry persistence failed: ${errorMsg}`);
    return { success: false, patternCount: 0, error: errorMsg };
  }
}

/**
 * Load learned patterns from the database on startup.
 */
export async function loadPatternRegistry(
  organizationId: number
): Promise<{ loaded: boolean; learnedCount: number; error?: string }> {
  try {
    const { db } = await import('../../db.js');
    const { projectMemoryEntries } = await import('../../../shared/schema.js');
    const { eq, and, desc } = await import('drizzle-orm');

    // Find the most recent pattern registry export
    const [entry] = await db
      .select({ content: projectMemoryEntries.content })
      .from(projectMemoryEntries)
      .where(
        and(
          eq(projectMemoryEntries.organizationId, organizationId),
          eq(projectMemoryEntries.category, 'rim_pattern_registry')
        )
      )
      .orderBy(desc(projectMemoryEntries.createdAt))
      .limit(1);

    if (!entry?.content) {
      return { loaded: false, learnedCount: 0 };
    }

    const data = JSON.parse(entry.content);

    // Import learned patterns
    if (data.learnedPatterns && Array.isArray(data.learnedPatterns)) {
      patternRegistry.importPatterns(data.learnedPatterns);
    }

    // Restore hit counts
    if (data.hitCounts) {
      for (const [id, count] of Object.entries(data.hitCounts)) {
        const pattern = patternRegistry.getPattern(id);
        if (pattern && typeof count === 'number') {
          // Update hit count by re-importing with correct count
          patternRegistry.importPatterns([
            {
              ...pattern,
              hitCount: count as number,
              lastMatchedAt: data.lastMatchDates?.[id] ?? pattern.lastMatchedAt,
            },
          ]);
        }
      }
    }

    const learnedCount = data.learnedPatterns?.length ?? 0;
    return { loaded: true, learnedCount };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.warn(`[RIM] Pattern registry load failed: ${errorMsg}`);
    return { loaded: false, learnedCount: 0, error: errorMsg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATE PATTERN NOMINATION — auto-mining from intercepted text
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist a candidate pattern derived from intercepted text that looked like
 * a regulatory deficiency but matched no registered pattern. Candidates land
 * in `projectMemoryEntries` with category `candidate_learned_pattern` and
 * await human curation before promotion to the live registry.
 *
 * Deduplicated by content hash within an org/project so a recurring phrase
 * doesn't spam the candidate list.
 *
 * Fire-and-forget. Errors are logged and swallowed.
 */
export async function nominateCandidatePattern(params: {
  organizationId: number;
  projectId: number;
  text: string;
  sectionCode?: string;
  sourceContext: string;
}): Promise<void> {
  const { organizationId, projectId, text, sectionCode, sourceContext } = params;
  if (!Number.isFinite(organizationId) || organizationId <= 0) return;
  if (!Number.isFinite(projectId) || projectId <= 0) return;
  if (!patternRegistry.looksLikeUnregisteredDeficiency(text)) return;

  try {
    const { db } = await import('../../db.js');
    const { projectIntelligenceProfiles, projectMemoryEntries } = await import(
      '../../../shared/schema.js'
    );
    const { eq, and } = await import('drizzle-orm');

    const [profile] = await db
      .select({ id: projectIntelligenceProfiles.id })
      .from(projectIntelligenceProfiles)
      .where(and(
        eq(projectIntelligenceProfiles.projectId, projectId),
        eq(projectIntelligenceProfiles.organizationId, organizationId),
      ))
      .limit(1);

    if (!profile) return;

    // Snapshot a 240-char window centered on the strongest deficiency token
    // — keeps the candidate human-reviewable without storing the entire chat.
    const snippet = extractDeficiencySnippet(text);
    const contentHash = hashSnippet(snippet);

    // Dedup: skip if we already have a candidate with this content hash for
    // this project. Cheap because category + project filter is indexed.
    const existing = await db
      .select({ id: projectMemoryEntries.id })
      .from(projectMemoryEntries)
      .where(and(
        eq(projectMemoryEntries.projectId, projectId),
        eq(projectMemoryEntries.organizationId, organizationId),
        eq(projectMemoryEntries.category, 'candidate_learned_pattern'),
        eq(projectMemoryEntries.subcategory, contentHash),
      ))
      .limit(1);

    if (existing.length > 0) return;

    await db.insert(projectMemoryEntries).values({
      projectProfileId: profile.id,
      projectId,
      organizationId,
      category: 'candidate_learned_pattern',
      subcategory: contentHash,
      title: `Candidate pattern: ${snippet.slice(0, 80)}${snippet.length > 80 ? '…' : ''}`,
      content: JSON.stringify({
        snippet,
        sectionCode,
        sourceContext,
        registryVersion: patternRegistry.version,
        nominatedAt: new Date().toISOString(),
        status: 'pending_review',
      }),
      sourceDocumentName: 'rim-pattern-nomination',
      sourceDocumentType: 'system',
      confidenceScore: 0.5,
      importanceLevel: 'medium',
      extractedBy: 'system',
    } as any);
  } catch (err) {
    console.warn(
      '[RIM] nominateCandidatePattern failed (non-blocking):',
      err instanceof Error ? err.message : err,
    );
  }
}

function extractDeficiencySnippet(text: string): string {
  const lower = text.toLowerCase();
  const triggers = ['incomplete', 'missing', 'insufficient', 'fail to', 'does not meet', 'inadequate', 'unsupported'];
  let center = -1;
  for (const t of triggers) {
    const idx = lower.indexOf(t);
    if (idx >= 0) { center = idx; break; }
  }
  if (center < 0) return text.slice(0, 240);
  const start = Math.max(0, center - 80);
  const end = Math.min(text.length, center + 160);
  return text.slice(start, end).trim();
}

function hashSnippet(snippet: string): string {
  // Cheap deterministic hash — collisions are fine here, we just need
  // duplicate detection for nominations from the same project.
  let h = 5381;
  const normalized = snippet.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h) ^ normalized.charCodeAt(i);
  }
  return `cand_${(h >>> 0).toString(16)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const patternRegistry = new PatternRegistryImpl();
