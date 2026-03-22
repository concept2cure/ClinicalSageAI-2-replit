/**
 * AnA RI — Intelligence Orchestrator
 *
 * Dynamically orchestrates AnA's internal reasoning modes based on
 * user intent, document context, and risk level. This is the brain
 * that makes AnA feel like a single intelligent operator rather than
 * a toolbox of modes.
 *
 * @module server/services/ana-ri/orchestrator
 */

import { buildAnaRISystemPrompt, type AnaRIPromptOptions, type IntentLens, type UserRole } from './persona.js';
import { buildDeficiencyContext, type SubmissionType } from './deficiency-taxonomy.js';
import { buildDocumentActionContext, type DocumentActionType } from './document-actions.js';
import { buildRoleAdaptiveContext } from './role-adapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Intent Detection
// ─────────────────────────────────────────────────────────────────────────────

interface DetectedIntent {
  lens: IntentLens;
  confidence: number;
  signals: string[];
}

/** Keyword patterns for intent detection */
const INTENT_PATTERNS: Record<IntentLens, RegExp[]> = {
  audit: [
    /\b(audit|review|check|assess|evaluate|examine|inspect|validate|verify)\b/i,
    /\b(gap[s]?|miss(?:ing|ed)|incomplete|deficien|weakness|issue[s]?)\b/i,
    /\b(compli(?:ance|ant)|conform|non-?conform)\b/i,
    /\blike a reviewer\b/i,
    /\bwhat (?:would|will|might) (?:a |the )?(?:reviewer|fda|ema)\b/i,
  ],
  improve: [
    /\b(improve|enhance|strengthen|rewrite|revise|refine|polish|edit)\b/i,
    /\b(better|stronger|clearer|more (?:persuasive|compelling|defensible))\b/i,
    /\b(fix|correct|update|optimize)\b/i,
    /\bmedical writ(?:ing|er)\b/i,
    /\bmake (?:it|this) (?:better|stronger|clearer)\b/i,
  ],
  risk: [
    /\b(risk[s]?|reject(?:ion|ed)?|deficien(?:cy|cies)|rtf|refuse to file)\b/i,
    /\b(complete response|crl|information request|clinical hold)\b/i,
    /\b(what (?:could|might|will) go wrong)\b/i,
    /\b(vulnerabilit|threat|danger|concern|worry)\b/i,
    /\b(predict|anticipate|foresee|preempt)\b/i,
  ],
  strategy: [
    /\b(strateg(?:y|ic|ize)|pathway|approach|plan|roadmap)\b/i,
    /\b(pre-?(?:ind|sub|submission)|meeting|interaction)\b/i,
    /\b(accelerat(?:ed|ion)|breakthrough|fast track|priority review|orphan)\b/i,
    /\b(regulatory pathway|submission (?:plan|strategy|timeline))\b/i,
    /\b(fda vs|ema vs|region|global)\b/i,
  ],
  compare: [
    /\b(compare|comparison|versus|vs\.?|differ(?:ence|ent)|side.by.side)\b/i,
    /\b(predicate|equivalent|similar (?:product|device|drug))\b/i,
    /\b(benchmark|competitive|landscape)\b/i,
    /\b(version|revision|change[s]? (?:between|from|since))\b/i,
  ],
  auto: [], // Never matched — fallback
};

/**
 * Detect the user's intent from their message.
 * Returns the best-matching lens with confidence score.
 */
export function detectIntent(message: string): DetectedIntent {
  const scores: Array<{ lens: IntentLens; score: number; signals: string[] }> = [];

  for (const [lens, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (lens === 'auto') continue;
    const signals: string[] = [];
    let score = 0;
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        score += 1;
        signals.push(match[0]);
      }
    }
    if (score > 0) {
      scores.push({ lens: lens as IntentLens, score, signals });
    }
  }

  if (scores.length === 0) {
    return { lens: 'auto', confidence: 0, signals: [] };
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const maxPossible = INTENT_PATTERNS[best.lens].length;
  const confidence = Math.min(best.score / Math.max(maxPossible, 1), 1);

  return { lens: best.lens, confidence, signals: best.signals };
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission Type Detection
// ─────────────────────────────────────────────────────────────────────────────

const SUBMISSION_PATTERNS: Record<SubmissionType, RegExp[]> = {
  ind: [/\bIND\b/, /\binvestigational new drug\b/i, /\bpre-?IND\b/i, /\b21 CFR 312\b/],
  nda: [/\bNDA\b/, /\bnew drug application\b/i, /\b21 CFR 314\b/],
  bla: [/\bBLA\b/, /\bbiologics? license\b/i, /\b21 CFR 601\b/],
  '510k': [/\b510\(?k\)?\b/, /\bsubstantial equivalence\b/i, /\bpredicate\b/i],
  pma: [/\bPMA\b/, /\bpremarket approval\b/i],
  de_novo: [/\bde novo\b/i, /\bnovel device\b/i],
  cer: [/\bCER\b/, /\bclinical evaluation report\b/i, /\bMEDDEV\b/i, /\bEU MDR\b/i],
  ectd: [/\beCTD\b/, /\bcommon technical document\b/i, /\bModule [1-5]\b/],
  general: [], // Never matched
};

/**
 * Detect submission type from message content.
 */
export function detectSubmissionType(message: string): SubmissionType | null {
  for (const [type, patterns] of Object.entries(SUBMISSION_PATTERNS)) {
    if (type === 'general') continue;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return type as SubmissionType;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  message: string;
  /** Explicit intent lens from UI (overrides auto-detection) */
  intentLens?: IntentLens;
  /** User role (from profile or context) */
  userRole?: UserRole;
  /** Project context */
  projectContext?: AnaRIPromptOptions['projectContext'];
  /** Document context */
  documentContext?: AnaRIPromptOptions['documentContext'];
  /** Submission type override */
  submissionType?: SubmissionType;
  /** Conversation history for context */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface OrchestratorOutput {
  systemPrompt: string;
  detectedIntent: DetectedIntent;
  detectedSubmissionType: SubmissionType | null;
  appliedRole: UserRole;
  /** Suggested document actions based on the interaction */
  suggestedActions: DocumentActionType[];
  /** Metadata about what was orchestrated */
  orchestrationMeta: {
    intentSource: 'explicit' | 'detected' | 'default';
    submissionTypeSource: 'explicit' | 'detected' | 'none';
    roleSource: 'explicit' | 'default';
    deficiencyContextInjected: boolean;
    documentActionContextInjected: boolean;
  };
}

/**
 * The core orchestrator — assembles the complete AnA RI system prompt
 * by analyzing the user's message, context, and role.
 */
export function orchestrate(input: OrchestratorInput): OrchestratorOutput {
  // 1. Detect intent
  const detectedIntent = input.intentLens && input.intentLens !== 'auto'
    ? { lens: input.intentLens, confidence: 1, signals: ['explicit'] }
    : detectIntent(input.message);

  const intentSource = input.intentLens && input.intentLens !== 'auto'
    ? 'explicit' as const
    : detectedIntent.lens !== 'auto' ? 'detected' as const : 'default' as const;

  // 2. Detect submission type
  const detectedSubmissionType = input.submissionType || detectSubmissionType(input.message);
  const submissionTypeSource = input.submissionType
    ? 'explicit' as const
    : detectedSubmissionType ? 'detected' as const : 'none' as const;

  // 3. Determine role
  const appliedRole = input.userRole || 'general';
  const roleSource = input.userRole ? 'explicit' as const : 'default' as const;

  // 4. Build base system prompt
  const promptOptions: AnaRIPromptOptions = {
    userRole: appliedRole,
    intentLens: detectedIntent.lens,
    projectContext: input.projectContext,
    documentContext: input.documentContext,
  };

  let systemPrompt = buildAnaRISystemPrompt(promptOptions);

  // 5. Inject deficiency context if submission type is known
  let deficiencyContextInjected = false;
  if (detectedSubmissionType) {
    const deficiencyContext = buildDeficiencyContext(detectedSubmissionType);
    if (deficiencyContext) {
      systemPrompt += '\n\n' + deficiencyContext;
      deficiencyContextInjected = true;
    }
  }

  // 6. Inject document action context
  const documentActionContext = buildDocumentActionContext(detectedIntent.lens);
  let documentActionContextInjected = false;
  if (documentActionContext) {
    systemPrompt += '\n\n' + documentActionContext;
    documentActionContextInjected = true;
  }

  // 7. Inject role-adaptive context
  if (appliedRole !== 'general') {
    const roleContext = buildRoleAdaptiveContext(appliedRole, detectedSubmissionType);
    systemPrompt += '\n\n' + roleContext;
  }

  // 8. Inject conversation continuity context
  if (input.conversationHistory && input.conversationHistory.length > 0) {
    const continuityContext = buildContinuityContext(input.conversationHistory);
    if (continuityContext) {
      systemPrompt += '\n\n' + continuityContext;
    }
  }

  // 9. Determine suggested document actions
  const suggestedActions = getSuggestedActions(detectedIntent.lens, detectedSubmissionType);

  return {
    systemPrompt,
    detectedIntent,
    detectedSubmissionType,
    appliedRole,
    suggestedActions,
    orchestrationMeta: {
      intentSource,
      submissionTypeSource,
      roleSource,
      deficiencyContextInjected,
      documentActionContextInjected,
    },
  };
}

/**
 * Determine which document actions to suggest based on intent and submission type.
 */
function getSuggestedActions(
  lens: IntentLens,
  submissionType: SubmissionType | null
): DocumentActionType[] {
  const actions: DocumentActionType[] = [];

  switch (lens) {
    case 'audit':
      actions.push('deficiency_preemption_memo', 'risk_memo', 'reviewer_question_brief');
      break;
    case 'improve':
      actions.push('rewritten_section', 'evidence_memo');
      break;
    case 'risk':
      actions.push('risk_memo', 'deficiency_preemption_memo', 'strategy_note');
      break;
    case 'strategy':
      actions.push('strategy_note', 'risk_memo');
      break;
    case 'compare':
      actions.push('evidence_memo', 'strategy_note');
      break;
    default:
      // Auto — suggest the most universally useful actions
      actions.push('risk_memo', 'rewritten_section', 'strategy_note');
  }

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation Continuity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract working context from conversation history to maintain short-horizon continuity.
 * Prevents AnA from acting memoryless inside an active thread.
 */
function buildContinuityContext(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null {
  if (history.length < 2) return null;

  const lines: string[] = ['## CONVERSATION CONTINUITY'];

  // Extract the active document/section under discussion
  const allText = history.map(m => m.content).join(' ');

  // Detect active document or section
  const sectionMatches = allText.match(/(?:Section|Module|Chapter)\s+[\d.]+[A-Za-z]?(?:\s*[-–:]\s*[^\n.]{3,60})?/gi);
  if (sectionMatches) {
    const uniqueSections = [...new Set(sectionMatches.map(s => s.trim()))].slice(0, 3);
    lines.push('');
    lines.push('**Document/Section Under Discussion:**');
    uniqueSections.forEach(s => lines.push(`- ${s}`));
  }

  // Detect active concern themes from recent assistant messages
  const recentAssistant = history
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .map(m => m.content);

  const concerns: string[] = [];
  const concernPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /inadequate|insufficient|incomplete|missing/i, label: 'Evidence adequacy' },
    { pattern: /safety signal|adverse event|toxicity/i, label: 'Safety concerns' },
    { pattern: /endpoint|efficacy|clinical benefit/i, label: 'Efficacy/endpoint defensibility' },
    { pattern: /specification|process validation|manufacturing/i, label: 'CMC/manufacturing quality' },
    { pattern: /predicate|substantial equivalence/i, label: 'Device equivalence' },
    { pattern: /labeling|indication|claim/i, label: 'Labeling/claims' },
    { pattern: /statistical|multiplicity|sample size/i, label: 'Statistical rigor' },
    { pattern: /timeline|milestone|delay/i, label: 'Timeline/feasibility' },
  ];

  for (const { pattern, label } of concernPatterns) {
    if (recentAssistant.some(text => pattern.test(text))) {
      concerns.push(label);
    }
  }

  if (concerns.length > 0) {
    lines.push('');
    lines.push('**Active Concern Themes:**');
    concerns.slice(0, 5).forEach(c => lines.push(`- ${c}`));
  }

  // Detect any previously recommended actions that the user might be following up on
  const lastAssistant = recentAssistant[recentAssistant.length - 1] || '';
  const actionMentions: string[] = [];
  if (/risk memo|risk assessment/i.test(lastAssistant)) actionMentions.push('Risk assessment in progress');
  if (/deficiency|preemption/i.test(lastAssistant)) actionMentions.push('Deficiency preemption analysis');
  if (/rewrite|revise|improve/i.test(lastAssistant)) actionMentions.push('Document improvement');
  if (/strategy|pathway/i.test(lastAssistant)) actionMentions.push('Strategy development');

  if (actionMentions.length > 0) {
    lines.push('');
    lines.push('**Active Work Stream:**');
    actionMentions.slice(0, 3).forEach(a => lines.push(`- ${a}`));
  }

  // Detect submission type from history if not caught in current message
  const histSubmission = detectSubmissionType(allText);
  if (histSubmission) {
    lines.push('');
    lines.push(`**Submission Context (from conversation):** ${histSubmission.toUpperCase()}`);
  }

  lines.push('');
  lines.push('**Continuity instruction:** Build on the above context. Do not re-introduce yourself or ask the user to re-state what they already told you. Continue the working thread.');

  return lines.length > 2 ? lines.join('\n') : null;
}
