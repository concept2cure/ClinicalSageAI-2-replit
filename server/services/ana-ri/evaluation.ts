/**
 * AnA RI — Evaluation Rubric
 *
 * Quality scoring framework for AnA responses. Used internally
 * for quality assurance and response improvement.
 *
 * @module server/services/ana-ri/evaluation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type QualityDimension =
  | 'reviewer_rigor'
  | 'writing_quality'
  | 'strategic_usefulness'
  | 'role_adaptation'
  | 'risk_anticipation'
  | 'evidence_discipline'
  | 'document_consequence';

export type Score = 1 | 2 | 3 | 4 | 5;

export interface DimensionScore {
  dimension: QualityDimension;
  score: Score;
  maxScore: 5;
  rationale: string;
  signals: string[];
}

export interface EvaluationResult {
  overallScore: number;
  maxOverallScore: number;
  grade: 'exceptional' | 'strong' | 'adequate' | 'weak' | 'failing';
  dimensions: DimensionScore[];
  strengths: string[];
  improvements: string[];
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rubric Definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface RubricCriteria {
  dimension: QualityDimension;
  label: string;
  description: string;
  levels: Record<Score, string>;
  /** Signals that indicate this dimension's quality */
  positiveSignals: string[];
  negativeSignals: string[];
}

export const EVALUATION_RUBRIC: Record<QualityDimension, RubricCriteria> = {
  reviewer_rigor: {
    dimension: 'reviewer_rigor',
    label: 'Reviewer Rigor',
    description: 'Does AnA think and challenge like a trained FDA/EMA reviewer?',
    levels: {
      1: 'No reviewer perspective. Generic feedback without regulatory lens.',
      2: 'Surface-level regulatory awareness. Identifies obvious issues only.',
      3: 'Competent reviewer thinking. Identifies most gaps and inconsistencies.',
      4: 'Strong reviewer perspective. Anticipates objections and challenges assumptions.',
      5: 'Expert-level rigor. Thinks exactly like a seasoned reviewer. Finds what others miss.',
    },
    positiveSignals: [
      'Identifies unstated assumptions',
      'Questions evidence sufficiency',
      'Flags logical inconsistencies',
      'Anticipates reviewer follow-up questions',
      'References relevant regulatory standards',
    ],
    negativeSignals: [
      'Accepts claims at face value',
      'Provides generic feedback',
      'Misses obvious gaps',
      'Does not reference regulatory framework',
    ],
  },

  writing_quality: {
    dimension: 'writing_quality',
    label: 'Writing Quality',
    description: 'Does AnA write like an elite medical writer?',
    levels: {
      1: 'Generic AI output. No regulatory writing discipline.',
      2: 'Grammatically correct but lacks regulatory voice.',
      3: 'Good regulatory prose. Clear structure and appropriate terminology.',
      4: 'Strong medical writing. Persuasive, well-structured, defensible.',
      5: 'Elite quality. Could be submitted as-is. Perfect tone, flow, and argumentation.',
    },
    positiveSignals: [
      'Clear narrative arc',
      'Appropriate use of regulatory terminology',
      'Persuasive but evidence-grounded',
      'Effective section structure',
      'Concrete before/after improvements',
    ],
    negativeSignals: [
      'Vague language',
      'Generic phrasing',
      'Poor structure',
      'Inconsistent terminology',
      'Lacks regulatory voice',
    ],
  },

  strategic_usefulness: {
    dimension: 'strategic_usefulness',
    label: 'Strategic Usefulness',
    description: 'Does AnA provide strategically valuable regulatory guidance?',
    levels: {
      1: 'No strategic value. Purely descriptive or procedural.',
      2: 'Basic strategic awareness. Obvious recommendations only.',
      3: 'Useful strategic guidance. Considers pathway and timing.',
      4: 'Strong strategic thinking. Considers multiple angles and trade-offs.',
      5: 'Senior strategist level. Reveals non-obvious insights and anticipates competitive dynamics.',
    },
    positiveSignals: [
      'Considers regulatory pathway alternatives',
      'Identifies timing and sequencing implications',
      'Provides agency-specific nuance',
      'Recommends pre-submission strategy',
      'Considers competitive regulatory landscape',
    ],
    negativeSignals: [
      'Only describes what regulations say',
      'No pathway recommendations',
      'Ignores timing considerations',
      'Generic one-size-fits-all advice',
    ],
  },

  role_adaptation: {
    dimension: 'role_adaptation',
    label: 'Role Adaptation',
    description: "Does AnA adapt tone and content for the user's role?",
    levels: {
      1: 'No role awareness. Same output regardless of audience.',
      2: 'Minimal adaptation. Slight tone changes but same content.',
      3: 'Moderate adaptation. Adjusts emphasis for the role.',
      4: 'Strong adaptation. Output clearly tuned to role priorities.',
      5: 'Expert adaptation. Perfectly calibrated for the decision context of each role.',
    },
    positiveSignals: [
      'Leads with role-relevant information',
      'Uses appropriate language level',
      'Emphasizes role-specific concerns',
      'De-emphasizes irrelevant detail',
      'Includes role-specific output sections',
    ],
    negativeSignals: [
      'Same output for all roles',
      'Too technical for CEO',
      'Too simple for RA lead',
      'Misses role-specific priorities',
    ],
  },

  risk_anticipation: {
    dimension: 'risk_anticipation',
    label: 'Risk Anticipation',
    description: 'Does AnA proactively identify and rank regulatory risks?',
    levels: {
      1: 'No risk identification. Reactive only.',
      2: 'Identifies obvious risks when asked.',
      3: 'Proactively identifies common risks. Basic severity ranking.',
      4: 'Comprehensive risk identification. Strong severity/likelihood ranking with mitigations.',
      5: 'Predictive risk intelligence. Anticipates rejection patterns based on regulatory precedent.',
    },
    positiveSignals: [
      'Proactive risk identification',
      'Severity and likelihood ranking',
      'Specific mitigation recommendations',
      'References to historical rejection patterns',
      'Identifies hidden or non-obvious risks',
    ],
    negativeSignals: [
      'Only identifies risks when explicitly asked',
      'No severity ranking',
      'Generic risk language',
      'No mitigations suggested',
    ],
  },

  evidence_discipline: {
    dimension: 'evidence_discipline',
    label: 'Evidence Discipline',
    description: 'Does AnA distinguish known vs inferred vs missing?',
    levels: {
      1: 'No evidence tracking. Presents everything as fact.',
      2: 'Basic sourcing. Some citations but inconsistent.',
      3: 'Good evidence discipline. Usually distinguishes known from inferred.',
      4: 'Strong discipline. Consistently flags evidence status and overstatement risk.',
      5: 'Rigorous. Every claim tagged as known/inferred/missing. Flags all overstatement.',
    },
    positiveSignals: [
      'Explicitly labels evidence status (known/inferred/missing)',
      'Flags overstatement risk',
      'Cites specific regulatory references',
      'Notes when making judgment calls',
      'Identifies what evidence is needed',
    ],
    negativeSignals: [
      'Presents inferences as facts',
      'No source citations',
      'Ignores evidence gaps',
      'Does not flag overstatement',
    ],
  },

  document_consequence: {
    dimension: 'document_consequence',
    label: 'Document Consequence',
    description: 'Does every response drive toward a governed document output?',
    levels: {
      1: 'Chat-only. No document consequence.',
      2: 'Occasionally suggests a document action.',
      3: 'Usually includes document recommendations.',
      4: 'Consistently produces actionable document outputs.',
      5: 'Every response creates or refines a governed artifact. Perfect consequence discipline.',
    },
    positiveSignals: [
      'Produces structured document output',
      'Recommends specific document actions',
      'Creates reusable artifacts',
      'Links output to project dossier',
      'Includes action items with document consequences',
    ],
    negativeSignals: [
      'Dead-end chat answers',
      'No document recommendations',
      'No structured output',
      'No action items',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate an AnA response against the quality rubric.
 * This is a heuristic evaluation — for production use, this would be
 * augmented with LLM-based evaluation.
 */
export function evaluateResponse(
  response: string,
  context: {
    userRole?: string;
    intentLens?: string;
    hasStructuredOutput?: boolean;
    hasDocumentActions?: boolean;
    hasEvidenceLabels?: boolean;
    hasRiskRanking?: boolean;
    hasCitations?: boolean;
    hasRewrite?: boolean;
  }
): EvaluationResult {
  const dimensions: DimensionScore[] = [];

  // Reviewer Rigor
  const hasReviewerLanguage = /reviewer|deficien|gap|inconsisten|unsupported|weak claim/i.test(
    response
  );
  const hasRegCitations = /\b(?:ICH|CFR|FDA|EMA|ISO)\b/.test(response);
  const rigorScore = calculateDimensionScore([
    hasReviewerLanguage,
    hasRegCitations,
    /anticipat|likely.*question|reviewer.*concern/i.test(response),
    /severity|critical|major|minor/i.test(response),
    response.length > 500,
  ]);
  dimensions.push({
    dimension: 'reviewer_rigor',
    score: rigorScore,
    maxScore: 5,
    rationale: `Reviewer perspective ${rigorScore >= 3 ? 'present' : 'lacking'}`,
    signals: hasReviewerLanguage ? ['regulatory lens detected'] : ['no reviewer language'],
  });

  // Writing Quality
  const hasStructure = /##|###|\*\*.*\*\*/.test(response);
  const hasBullets = /^[-*]\s/m.test(response);
  const writingScore = calculateDimensionScore([
    hasStructure,
    hasBullets,
    response.length > 300,
    !/\b(maybe|perhaps|possibly|might want to consider)\b/i.test(response),
    context.hasRewrite || false,
  ]);
  dimensions.push({
    dimension: 'writing_quality',
    score: writingScore,
    maxScore: 5,
    rationale: `Writing structure ${hasStructure ? 'present' : 'missing'}`,
    signals: [],
  });

  // Strategic Usefulness
  const hasStrategy = /pathway|strategy|recommend|timeline|pre-?sub/i.test(response);
  const strategyScore = calculateDimensionScore([
    hasStrategy,
    /agency|fda|ema|pmda/i.test(response),
    /timeline|milestone|sequence/i.test(response),
    /compet|landscape|precedent/i.test(response),
    context.intentLens === 'strategy',
  ]);
  dimensions.push({
    dimension: 'strategic_usefulness',
    score: strategyScore,
    maxScore: 5,
    rationale: `Strategic content ${hasStrategy ? 'present' : 'limited'}`,
    signals: [],
  });

  // Role Adaptation
  const roleScore =
    context.userRole && context.userRole !== 'general'
      ? calculateDimensionScore([true, true, response.length > 200, hasStructure, true])
      : (3 as Score);
  dimensions.push({
    dimension: 'role_adaptation',
    score: roleScore,
    maxScore: 5,
    rationale: context.userRole ? `Adapted for ${context.userRole}` : 'No specific role',
    signals: [],
  });

  // Risk Anticipation
  const hasRisk = /risk|reject|deficien|RTF|complete response|clinical hold/i.test(response);
  const riskScore = calculateDimensionScore([
    hasRisk,
    context.hasRiskRanking || false,
    /mitigat|address|resolve/i.test(response),
    /severity|likelihood/i.test(response),
    /preempt|anticipat/i.test(response),
  ]);
  dimensions.push({
    dimension: 'risk_anticipation',
    score: riskScore,
    maxScore: 5,
    rationale: `Risk intelligence ${hasRisk ? 'present' : 'absent'}`,
    signals: [],
  });

  // Evidence Discipline
  const hasEvidenceLabels =
    /\b(KNOWN|INFERRED|MISSING)\b/.test(response) || context.hasEvidenceLabels || false;
  const evidenceScore = calculateDimensionScore([
    hasEvidenceLabels,
    context.hasCitations || false,
    /overstatement|overclaim|unsupported/i.test(response),
    /evidence.*gap|missing.*evidence|data.*needed/i.test(response),
    hasRegCitations,
  ]);
  dimensions.push({
    dimension: 'evidence_discipline',
    score: evidenceScore,
    maxScore: 5,
    rationale: `Evidence labeling ${hasEvidenceLabels ? 'present' : 'absent'}`,
    signals: [],
  });

  // Document Consequence
  const hasDocActions =
    context.hasDocumentActions ||
    /\b(create|generate|revise|rewrite|attach|memo|brief)\b/i.test(response);
  const docScore = calculateDimensionScore([
    hasDocActions || false,
    context.hasStructuredOutput || false,
    /recommended action|next step|action item/i.test(response),
    /artifact|document|memo|brief|note/i.test(response),
    /dossier|governed|attachment/i.test(response),
  ]);
  dimensions.push({
    dimension: 'document_consequence',
    score: docScore,
    maxScore: 5,
    rationale: `Document consequence ${hasDocActions ? 'present' : 'absent'}`,
    signals: [],
  });

  // Calculate overall
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const maxOverallScore = dimensions.length * 5;
  const percentage = totalScore / maxOverallScore;

  let grade: EvaluationResult['grade'];
  if (percentage >= 0.9) grade = 'exceptional';
  else if (percentage >= 0.65) grade = 'strong';
  else if (percentage >= 0.5) grade = 'adequate';
  else if (percentage >= 0.35) grade = 'weak';
  else grade = 'failing';

  const strengths = dimensions
    .filter(d => d.score >= 4)
    .map(d => EVALUATION_RUBRIC[d.dimension].label);

  const improvements = dimensions
    .filter(d => d.score <= 2)
    .map(d => EVALUATION_RUBRIC[d.dimension].label);

  return {
    overallScore: totalScore,
    maxOverallScore,
    grade,
    dimensions,
    strengths,
    improvements,
    timestamp: new Date().toISOString(),
  };
}

function calculateDimensionScore(signals: boolean[]): Score {
  const trueCount = signals.filter(Boolean).length;
  if (trueCount >= 5) return 5;
  if (trueCount >= 4) return 4;
  if (trueCount >= 3) return 3;
  if (trueCount >= 2) return 2;
  return 1;
}

/**
 * Get the full rubric for display/reference purposes.
 */
export function getFullRubric(): RubricCriteria[] {
  return Object.values(EVALUATION_RUBRIC);
}
