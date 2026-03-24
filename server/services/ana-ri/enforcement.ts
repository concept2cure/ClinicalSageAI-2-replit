/**
 * AnA RI — Enforcement Layer
 *
 * System-law enforcement for AnA outputs:
 * 1. Response structure validator — rejects structureless output
 * 2. Evidence discipline checker — flags missing KNOWN/INFERRED/MISSING
 * 3. Artifact quality gates — blocks garbage from persistence
 * 4. Generation guard — logs/warns on untracked AI generation
 * 5. Runtime observability — traces the full lifecycle
 *
 * @module server/services/ana-ri/enforcement
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Response Structure Validator
// ─────────────────────────────────────────────────────────────────────────────

export interface StructureValidationResult {
  valid: boolean;
  score: number;
  maxScore: number;
  missing: string[];
  present: string[];
}

const REQUIRED_SECTIONS = [
  {
    pattern: /##?\s*(?:Overall\s+Assessment|Executive\s+Summary|Assessment)/i,
    label: 'Overall Assessment',
  },
  {
    pattern: /##?\s*(?:Reviewer\s+Concern|Risk\s+Signal|Critical\s+Risk|Major\s+Risk)/i,
    label: 'Reviewer Concerns / Risks',
  },
  {
    pattern: /##?\s*(?:Recommend|Next\s+Step|Action|Document\s+Action)/i,
    label: 'Recommended Actions',
  },
];

const EVIDENCE_SECTIONS = [
  { pattern: /\[KNOWN[^\]]*\]/i, label: 'Evidence: Known' },
  { pattern: /\[INFERRED[^\]]*\]/i, label: 'Evidence: Inferred' },
  { pattern: /\[MISSING[^\]]*\]/i, label: 'Evidence: Missing' },
];

const OPTIONAL_SECTIONS = [
  { pattern: /##?\s*(?:Weak\s+Claim|Gap|Missing\s+Evidence)/i, label: 'Weak Claims / Gaps' },
  { pattern: /##?\s*(?:Strateg|Pathway|Timeline)/i, label: 'Strategic Notes' },
];

/**
 * Validate that an AnA response follows the required output structure.
 * Returns a score and list of missing sections.
 *
 * This is NOT a blocker — it's a quality signal. Use it to:
 * - Flag low-quality responses in logs
 * - Score responses in evaluation
 * - Warn in dev mode
 */
export function validateResponseStructure(response: string): StructureValidationResult {
  const present: string[] = [];
  const missing: string[] = [];

  // Check required sections
  for (const { pattern, label } of REQUIRED_SECTIONS) {
    if (pattern.test(response)) {
      present.push(label);
    } else {
      missing.push(label);
    }
  }

  // Check evidence labels
  for (const { pattern, label } of EVIDENCE_SECTIONS) {
    if (pattern.test(response)) {
      present.push(label);
    } else {
      missing.push(label);
    }
  }

  // Check optional sections (bonus points, not penalized)
  for (const { pattern, label } of OPTIONAL_SECTIONS) {
    if (pattern.test(response)) {
      present.push(label);
    }
  }

  const requiredCount = REQUIRED_SECTIONS.length + EVIDENCE_SECTIONS.length;
  const presentRequired = present.filter(p =>
    [...REQUIRED_SECTIONS, ...EVIDENCE_SECTIONS].some(s => s.label === p)
  ).length;

  return {
    valid: presentRequired >= Math.ceil(requiredCount * 0.5), // At least 50% of required sections
    score: presentRequired,
    maxScore: requiredCount,
    missing,
    present,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Evidence Discipline Checker
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidenceDisciplineResult {
  compliant: boolean;
  knownCount: number;
  inferredCount: number;
  missingCount: number;
  totalLabels: number;
  /** Whether any substantive claims lack evidence labels */
  hasUnlabeledClaims: boolean;
}

/**
 * Check whether a response properly uses evidence discipline labels.
 * Returns compliance status and counts.
 */
export function checkEvidenceDiscipline(response: string): EvidenceDisciplineResult {
  const knownMatches = response.match(/\[KNOWN[^\]]*\]/gi) || [];
  const inferredMatches = response.match(/\[INFERRED[^\]]*\]/gi) || [];
  const missingMatches = response.match(/\[MISSING[^\]]*\]/gi) || [];

  const totalLabels = knownMatches.length + inferredMatches.length + missingMatches.length;

  // Check for substantive responses that should have labels but don't
  const isSubstantive =
    response.length > 250 &&
    /##|###|\*\*/.test(response) &&
    /risk|deficien|evidence|claim|endpoint|safety|strategy/i.test(response);

  const hasUnlabeledClaims = isSubstantive && totalLabels === 0;

  return {
    compliant: !hasUnlabeledClaims,
    knownCount: knownMatches.length,
    inferredCount: inferredMatches.length,
    missingCount: missingMatches.length,
    totalLabels,
    hasUnlabeledClaims,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Artifact Quality Gates
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtifactQualityResult {
  pass: boolean;
  score: number;
  maxScore: number;
  grade: 'high' | 'medium' | 'low' | 'rejected';
  issues: string[];
}

/** Patterns that indicate generic AI filler — not governed-quality content */
const FILLER_PATTERNS = [
  /\bI'd be happy to help\b/i,
  /\bLet me know if you'd like\b/i,
  /\bHere's (?:a|an) (?:example|sample|template)\b/i,
  /\bFeel free to\b/i,
  /\bDon't hesitate to\b/i,
  /\bI hope this helps\b/i,
  /\bAs an AI\b/i,
  /\bI cannot provide\b/i,
  /\bComing soon\b/i,
  /\bTODO\b/,
  /\bplaceholder\b/i,
  /\bLorem ipsum\b/i,
  /\b\[insert.*here\]/i,
  /\b\[your.*here\]/i,
  /\bTBD\b/,
];

/**
 * Quality gate for artifacts before persistence.
 * Rejects garbage, flags low-confidence, passes good content.
 */
export function validateArtifactQuality(
  content: string,
  actionType: string
): ArtifactQualityResult {
  const issues: string[] = [];
  let score = 0;
  const depthTypes = ['risk_memo', 'deficiency_preemption_memo', 'reviewer_question_brief'];
  const maxScore = depthTypes.includes(actionType) ? 12 : 10;

  // Gate 1: Minimum content length
  if (content.length < 200) {
    issues.push('Content too short (< 200 chars)');
  } else if (content.length >= 500) {
    score += 2;
  } else {
    score += 1;
  }

  // Gate 2: No placeholder text
  const fillerCount = FILLER_PATTERNS.filter(p => p.test(content)).length;
  if (fillerCount > 2) {
    issues.push(`Contains ${fillerCount} generic AI filler patterns`);
  } else if (fillerCount === 0) {
    score += 2;
  } else {
    score += 1;
  }

  // Gate 3: Structured sections present
  const sectionHeaders = (content.match(/^##?\s+.+$/gm) || []).length;
  if (sectionHeaders === 0) {
    issues.push('No structured sections (missing ## headers)');
  } else if (sectionHeaders >= 3) {
    score += 2;
  } else {
    score += 1;
  }

  // Gate 4: Evidence labels present (for analytical artifacts)
  const analyticalTypes = [
    'risk_memo',
    'deficiency_preemption_memo',
    'evidence_memo',
    'reviewer_question_brief',
  ];
  if (analyticalTypes.includes(actionType)) {
    const evidenceResult = checkEvidenceDiscipline(content);
    if (evidenceResult.totalLabels >= 3) {
      score += 2;
    } else if (evidenceResult.totalLabels > 0) {
      score += 1;
    } else {
      issues.push('Missing evidence labels [KNOWN/INFERRED/MISSING]');
    }
  } else {
    score += 1; // Non-analytical artifacts get a free point
  }

  // Gate 5: Intent alignment — content mentions the document type
  const typeKeywords: Record<string, RegExp> = {
    risk_memo: /risk|severity|mitigation|critical|major/i,
    deficiency_preemption_memo: /deficien|anticipat|preempt|reviewer.*question/i,
    evidence_memo: /evidence|known|inferred|missing|gap/i,
    strategy_note: /strateg|pathway|recommend|timeline/i,
    reviewer_question_brief: /reviewer|question|anticipat|brief/i,
    rewritten_section: /rewrite|revise|original|improved/i,
    revised_artifact: /revis|change|updated|modified/i,
    attach_to_dossier: /dossier|attach|document|classification/i,
  };
  const typePattern = typeKeywords[actionType];
  if (typePattern && typePattern.test(content)) {
    score += 2;
  } else if (typePattern) {
    issues.push(`Content does not match expected ${actionType} structure`);
  }

  // Gate 6: Semantic depth — check substance, not just structure
  if (depthTypes.includes(actionType)) {
    // Check for root cause analysis (not just restating the problem)
    const hasRootCause =
      /because|due to|caused by|mechanism|underlying|root cause|driven by|only\s+\d+.*\b(?:vs|versus)\b.*\brequired\b|inadequate\s+\w+|insufficient\s+\w+/i.test(
        content
      );
    // Check for specific evidence references (not vague)
    const hasSpecificEvidence =
      /\b(?:study|trial|data|finding|result|ICH|CFR|ISO|FDA|EMA)\s+\S+/i.test(content);
    // Check for actionable mitigations (not platitudes)
    const hasActionable =
      /\b(?:conduct|gather|provide|revise|modify|submit|generate|perform|complete|draft)\b/i.test(
        content
      );

    if (hasRootCause && hasSpecificEvidence && hasActionable) {
      score += 2;
    } else {
      const depthIssues: string[] = [];
      if (!hasRootCause) depthIssues.push('no root cause analysis');
      if (!hasSpecificEvidence) depthIssues.push('no specific evidence references');
      if (!hasActionable) depthIssues.push('no actionable mitigations');
      issues.push(`Lacks semantic depth: ${depthIssues.join(', ')}`);
    }
  }

  // Determine grade
  let grade: ArtifactQualityResult['grade'];
  if (issues.length > 2 || content.length < 100) {
    grade = 'rejected';
  } else if (score >= maxScore * 0.8) {
    grade = 'high';
  } else if (score >= maxScore * 0.5) {
    grade = 'medium';
  } else {
    grade = 'low';
  }

  return {
    pass: grade !== 'rejected',
    score,
    maxScore,
    grade,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Generation Guard
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerationEvent {
  timestamp: string;
  route: string;
  action: string;
  projectId?: number;
  organizationId?: number;
  userId?: number | string;
  artifactCreated: boolean;
  artifactId?: number;
  provider?: string;
  model?: string;
  /** Whether this generation went through AnA RI orchestration */
  anaRiOrchestrated: boolean;
  /** Quality gate result if artifact was created */
  qualityGrade?: string;
  /** Evidence discipline compliance */
  evidenceCompliant?: boolean;
  /** Structure validation score */
  structureScore?: number;
  /** Duration in ms */
  durationMs?: number;
}

/** In-memory generation log for observability (last 1000 events) */
const generationLog: GenerationEvent[] = [];
const MAX_LOG_SIZE = 1000;

/**
 * Log a generation event. Call this from every AI generation path.
 */
export function logGeneration(event: GenerationEvent): void {
  generationLog.push(event);
  if (generationLog.length > MAX_LOG_SIZE) {
    generationLog.splice(0, generationLog.length - MAX_LOG_SIZE);
  }

  // Console warning for non-artifact generation
  if (
    !event.artifactCreated &&
    event.action !== 'chat' &&
    event.action !== 'autocomplete' &&
    event.action !== 'compliance-scan'
  ) {
    console.warn(
      `[AnA GUARD] Generation without artifact: route=${event.route} action=${event.action} ` +
        `orchestrated=${event.anaRiOrchestrated} project=${event.projectId || 'none'}`
    );
  }

  // Console warning for non-AnA-orchestrated artifact generation
  if (event.artifactCreated && !event.anaRiOrchestrated) {
    console.warn(
      `[AnA GUARD] Artifact created outside AnA RI: route=${event.route} action=${event.action} ` +
        `artifactId=${event.artifactId || 'unknown'}`
    );
  }
}

/**
 * Get the generation log for observability.
 */
export function getGenerationLog(filters?: {
  route?: string;
  artifactCreated?: boolean;
  anaRiOrchestrated?: boolean;
  limit?: number;
}): GenerationEvent[] {
  let results = [...generationLog];

  if (filters?.route) {
    results = results.filter(e => e.route === filters.route);
  }
  if (filters?.artifactCreated !== undefined) {
    results = results.filter(e => e.artifactCreated === filters.artifactCreated);
  }
  if (filters?.anaRiOrchestrated !== undefined) {
    results = results.filter(e => e.anaRiOrchestrated === filters.anaRiOrchestrated);
  }

  return results.slice(-(filters?.limit || 100));
}

/**
 * Get summary stats from the generation log.
 */
export function getGenerationStats(): {
  total: number;
  withArtifact: number;
  withoutArtifact: number;
  anaRiOrchestrated: number;
  bypassedAnA: number;
  evidenceCompliant: number;
  evidenceNonCompliant: number;
  avgQualityScore: number;
  byRoute: Record<string, number>;
} {
  const stats = {
    total: generationLog.length,
    withArtifact: 0,
    withoutArtifact: 0,
    anaRiOrchestrated: 0,
    bypassedAnA: 0,
    evidenceCompliant: 0,
    evidenceNonCompliant: 0,
    avgQualityScore: 0,
    byRoute: {} as Record<string, number>,
  };

  let qualitySum = 0;
  let qualityCount = 0;

  for (const event of generationLog) {
    if (event.artifactCreated) stats.withArtifact++;
    else stats.withoutArtifact++;

    if (event.anaRiOrchestrated) stats.anaRiOrchestrated++;
    else if (event.artifactCreated) stats.bypassedAnA++;

    if (event.evidenceCompliant === true) stats.evidenceCompliant++;
    else if (event.evidenceCompliant === false) stats.evidenceNonCompliant++;

    if (event.structureScore !== undefined) {
      qualitySum += event.structureScore;
      qualityCount++;
    }

    stats.byRoute[event.route] = (stats.byRoute[event.route] || 0) + 1;
  }

  stats.avgQualityScore = qualityCount > 0 ? qualitySum / qualityCount : 0;

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Document Action Contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The standardized contract for every document action in the system.
 * No variation allowed across flows.
 */
export interface GovernedArtifactContract {
  /** Document classification */
  documentType: string;
  /** Project binding (required) */
  projectId: number;
  /** Tenant isolation (required) */
  organizationId: number;
  /** AnA RI as source */
  source: 'ana_ri';
  /** Active intent lens */
  intentLens: string;
  /** User role for audit trail */
  userRole: string;
  /** The artifact content */
  content: string;
  /** Structured sections present in content */
  structureSections: string[];
  /** Provenance metadata */
  provenance: {
    generatedAt: string;
    generatedBy: string;
    aiProvider: string;
    aiModel: string;
    conversationContext: number;
    qualityGrade: string;
    evidenceLabels: number;
  };
  /** Version (always starts at 1) */
  version: number;
  /** Initial status */
  status: 'draft';
}

/**
 * Build a governed artifact contract from generation results.
 * This is the single source of truth for artifact structure.
 */
export function buildArtifactContract(params: {
  documentType: string;
  projectId: number;
  organizationId: number;
  intentLens: string;
  userRole: string;
  content: string;
  provider: string;
  model: string;
  conversationLength: number;
}): GovernedArtifactContract {
  // Extract section headers from content
  const sectionHeaders = (params.content.match(/^##?\s+(.+)$/gm) || []).map(h =>
    h.replace(/^##?\s+/, '').trim()
  );

  // Count evidence labels
  const evidenceLabels = (params.content.match(/\[(KNOWN|INFERRED|MISSING)[^\]]*\]/gi) || [])
    .length;

  // Run quality gate
  const quality = validateArtifactQuality(params.content, params.documentType);

  return {
    documentType: params.documentType,
    projectId: params.projectId,
    organizationId: params.organizationId,
    source: 'ana_ri',
    intentLens: params.intentLens,
    userRole: params.userRole,
    content: params.content,
    structureSections: sectionHeaders,
    provenance: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'AnA RI',
      aiProvider: params.provider,
      aiModel: params.model,
      conversationContext: params.conversationLength,
      qualityGrade: quality.grade,
      evidenceLabels,
    },
    version: 1,
    status: 'draft',
  };
}
