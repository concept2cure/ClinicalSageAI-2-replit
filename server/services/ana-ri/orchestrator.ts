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

import {
  buildAnaRISystemPrompt,
  type AnaRIPromptOptions,
  type IntentLens,
  type UserRole,
  type WorkstreamContext,
  type WorkstreamHandoff,
  type WorkstreamPhase,
  type WorkstreamType,
} from './persona.js';
import { buildDeficiencyContext, type SubmissionType } from './deficiency-taxonomy.js';
import { buildDocumentActionContext, type DocumentActionType } from './document-actions.js';
import { buildRoleAdaptiveContext } from './role-adapter.js';
import { buildCommandContextForPrompt } from './command-executor.js';

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
  /** Authoring context with optional pre-fetched decision context (_decisionContext) */
  authoringContext?: {
    projectId?: string;
    sectionCode?: string;
    moduleCode?: string;
    [key: string]: unknown;
  };
}

export interface OrchestratorOutput {
  systemPrompt: string;
  detectedIntent: DetectedIntent;
  detectedSubmissionType: SubmissionType | null;
  appliedRole: UserRole;
  activeWorkstream: WorkstreamContext;
  workstreamHandoff: WorkstreamHandoff | null;
  /** Suggested document actions based on the interaction */
  suggestedActions: DocumentActionType[];
  /** Metadata about what was orchestrated */
  orchestrationMeta: {
    intentSource: 'explicit' | 'detected' | 'default';
    submissionTypeSource: 'explicit' | 'detected' | 'none';
    roleSource: 'explicit' | 'default';
    deficiencyContextInjected: boolean;
    documentActionContextInjected: boolean;
    workstreamContextInjected: boolean;
    workstreamHandoffInjected: boolean;
  };
}

/**
 * The core orchestrator — assembles the complete AnA RI system prompt
 * by analyzing the user's message, context, and role.
 */
export function orchestrate(input: OrchestratorInput): OrchestratorOutput {
  // 1. Detect intent
  const detectedIntent =
    input.intentLens && input.intentLens !== 'auto'
      ? { lens: input.intentLens, confidence: 1, signals: ['explicit'] }
      : detectIntent(input.message);

  const intentSource =
    input.intentLens && input.intentLens !== 'auto'
      ? ('explicit' as const)
      : detectedIntent.lens !== 'auto'
        ? ('detected' as const)
        : ('default' as const);

  // 2. Detect submission type
  const detectedSubmissionType = input.submissionType || detectSubmissionType(input.message);
  const submissionTypeSource = input.submissionType
    ? ('explicit' as const)
    : detectedSubmissionType
      ? ('detected' as const)
      : ('none' as const);

  // 3. Determine role
  const appliedRole = input.userRole || 'general';
  const roleSource = input.userRole ? ('explicit' as const) : ('default' as const);

  // 4. Build base system prompt
  const promptOptions: AnaRIPromptOptions = {
    userRole: appliedRole,
    intentLens: detectedIntent.lens,
    projectContext: input.projectContext,
    documentContext: input.documentContext,
  };

  const activeWorkstream = detectWorkstream(input, detectedIntent.lens, detectedSubmissionType);
  const workstreamHandoff = detectWorkstreamHandoff(input, activeWorkstream);
  promptOptions.workstreamContext = activeWorkstream;
  if (workstreamHandoff) {
    promptOptions.workstreamHandoff = workstreamHandoff;
  }

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

  // 8. Inject command capabilities (condensed to save tokens)
  systemPrompt +=
    '\n\n## OPERATIONAL COMMANDS\nYou can execute platform commands. Available: create_project, list_projects, update_project, create_artifact, update_artifact, update_artifact_status, list_artifacts, place_in_dossier, create_task, update_task, list_tasks, check_dossier_readiness, create_submission_package, create_review_thread, add_review_comment, search_artifacts, list_team_members, list_artifact_versions, run_compliance_scan, export_artifact, compare_versions, review_version_impact, create_milestone, update_milestone, list_milestones, revert_to_version, load_user_context, load_conversation_history.\n\nWhen you decide to act (not just advise), embed commands:\n```command\n{"command":"command_name","params":{...}}\n```\nMultiple commands execute sequentially. Chain stops on failure.';

  // 8b. Inject decision architecture context for grounded explanations.
  // The chat route layer (async) pre-fetches decision context and attaches it
  // as _decisionContext on the authoringContext object. This keeps orchestrate() sync.
  if (input.authoringContext?.projectId) {
    try {
      const decisionCtx = (input.authoringContext as any)?._decisionContext as
        Array<{ decision: any; receipt?: any }> | undefined;
      if (decisionCtx && decisionCtx.length > 0) {
        const decisionBlock = decisionCtx.map(({ decision, receipt }: any) => {
          let line = `- [${decision.status?.toUpperCase?.() || '?'}] ${decision.kind}: ${decision.summary}`;
          if (decision.authority?.level) line += ` (authority: ${decision.authority.level})`;
          if (decision.sourceSignals?.length > 0) line += ` — ${decision.sourceSignals.length} signal(s)`;
          if (receipt) {
            if (receipt.execution?.executed) line += ' → executed';
            if (receipt.pendingApprovals?.length > 0) line += ` → ${receipt.pendingApprovals.length} pending approval(s)`;
            if (receipt.provisionalItems?.length > 0) line += ` → ${receipt.provisionalItems.length} provisional`;
          }
          return line;
        }).join('\n');
        systemPrompt += `\n\n## DECISION CONTEXT\nRecent decisions for this project/section:\n${decisionBlock}\n\nWhen explaining results, reference these decisions. Answer "why" from source signals and rationale. Answer "what happened" from receipts. Answer "what needs approval" from pending approvals. Never invent explanations — if no decision record exists, say so.`;
      }
    } catch { /* non-blocking */ }
  }

  // 8c. Inject document-state intelligence when authoring context includes artifact status
  if (input.authoringContext) {
    const artifactStatus = (input.authoringContext as any)?.artifactStatus as string | undefined;
    const sectionCode = input.authoringContext?.sectionCode;
    const moduleCode = input.authoringContext?.moduleCode;

    if (artifactStatus) {
      const statusLower = (artifactStatus || '').toLowerCase();
      let stateDirective = '';
      if (statusLower === 'draft') {
        stateDirective = `\n\n## DOCUMENT STATE: DRAFT\nThis artifact is in DRAFT status. Your behavior should be:\n- Constructive and building-forward\n- Offer to write, expand, fill gaps, restructure\n- Flag missing subsections and weak claims\n- Suggest running /audit or /scan before moving to review\n- Recommend evidence that needs gathering`;
      } else if (statusLower === 'review' || statusLower === 'in_review') {
        stateDirective = `\n\n## DOCUMENT STATE: IN REVIEW\nThis artifact is in REVIEW status. Your behavior should be:\n- Evaluative and precise — act as a reviewer\n- Identify issues that would block approval\n- Focus on completeness, consistency, defensibility\n- Do NOT suggest major rewrites — suggest targeted fixes\n- Recommend specific review actions and reviewers`;
      } else if (statusLower === 'approved') {
        stateDirective = `\n\n## DOCUMENT STATE: APPROVED\nThis artifact is APPROVED. Your behavior should be:\n- Cautious — warn before suggesting changes ("This is approved; changes require re-review")\n- Focus on pre-submission checks: cross-references, formatting, eCTD placement\n- Suggest /preflight or /checklist rather than edits\n- Verification-focused, not editing-focused`;
      } else if (statusLower === 'locked' || statusLower === 'frozen') {
        stateDirective = `\n\n## DOCUMENT STATE: LOCKED\nThis artifact is LOCKED/FROZEN and IMMUTABLE. Your behavior should be:\n- Do NOT suggest edits — this document cannot be changed\n- If user asks to edit: "This document is locked. Create a new version to make changes."\n- Focus on interpretation, comparison, or export actions\n- Read-only and informational`;
      }
      if (stateDirective) {
        systemPrompt += stateDirective;
      }
    }

    if (sectionCode) {
      systemPrompt += `\n\n## ACTIVE SECTION: ${sectionCode}${moduleCode ? ` (Module ${moduleCode})` : ''}\nThe user is working in a specific CTD section. Tailor all guidance to this section. When the user says "this section" or "here", they mean ${sectionCode}. Be section-specific, not generic.`;
    }
  }

  // 9. Inject conversation continuity context
  if (input.conversationHistory && input.conversationHistory.length > 0) {
    const continuityContext = buildContinuityContext(
      input.conversationHistory,
      detectedSubmissionType
    );
    if (continuityContext) {
      systemPrompt += '\n\n' + continuityContext;
    }
  }

  // 10. Inject command context — tells AnA what operational commands are available
  systemPrompt += '\n\n' + buildCommandContextForPrompt();

  // 11. Determine suggested document actions
  const suggestedActions = getSuggestedActions(
    detectedIntent.lens,
    detectedSubmissionType,
    activeWorkstream
  );

  return {
    systemPrompt,
    detectedIntent,
    detectedSubmissionType,
    appliedRole,
    activeWorkstream,
    workstreamHandoff,
    suggestedActions,
    orchestrationMeta: {
      intentSource,
      submissionTypeSource,
      roleSource,
      deficiencyContextInjected,
      documentActionContextInjected,
      workstreamContextInjected: true,
      workstreamHandoffInjected: !!workstreamHandoff,
    },
  };
}

/**
 * Determine which document actions to suggest based on intent and submission type.
 */
function getSuggestedActions(
  lens: IntentLens,
  submissionType: SubmissionType | null,
  workstream: WorkstreamContext
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

  switch (workstream.stream) {
    case 'document_authoring':
      actions.unshift('rewritten_section', 'revised_artifact');
      break;
    case 'deficiency_response':
      actions.unshift('deficiency_preemption_memo', 'reviewer_question_brief');
      break;
    case 'evidence_development':
      actions.unshift('evidence_memo');
      break;
    case 'submission_strategy':
      actions.unshift('strategy_note');
      break;
    case 'review_preparation':
      actions.unshift('reviewer_question_brief', 'risk_memo');
      break;
    case 'program_risk':
      actions.unshift('risk_memo');
      break;
    default:
      break;
  }

  if (submissionType === 'ectd' || submissionType === 'nda' || submissionType === 'bla') {
    actions.push('attach_to_dossier');
  }

  return [...new Set(actions)];
}

function detectWorkstream(
  input: OrchestratorInput,
  lens: IntentLens,
  submissionType: SubmissionType | null
): WorkstreamContext {
  const recentHistory = (input.conversationHistory || []).slice(-6);
  const historyText = recentHistory.map(message => message.content).join(' ');
  const contextText = [
    input.message,
    historyText,
    input.projectContext?.submissionType,
    input.projectContext?.phase,
    input.documentContext?.documentType,
    input.documentContext?.section,
    input.documentContext?.module,
  ]
    .filter(Boolean)
    .join(' ');

  const stream = detectWorkstreamType(contextText, lens);
  const phase = detectWorkstreamPhase(input, stream);
  const currentFocus = detectCurrentFocus(input, historyText, stream);
  const blockers = detectBlockers(contextText, recentHistory);

  return {
    stream,
    phase,
    objective: summarizeObjective(input.message, stream, submissionType),
    currentFocus,
    blockers,
    nextStep: inferNextStep(stream, phase, lens, submissionType),
    collaborationMode: inferCollaborationMode(stream, phase, lens),
  };
}

function detectWorkstreamHandoff(
  input: OrchestratorInput,
  activeWorkstream: WorkstreamContext
): WorkstreamHandoff | null {
  const history = input.conversationHistory || [];
  if (history.length < 3) {
    return null;
  }

  const previousHistory = history.slice(0, -1);
  const previousText = previousHistory.map(message => message.content).join(' ');
  if (!previousText.trim()) {
    return null;
  }

  const previousLens = detectIntent(previousText).lens;
  const previousSubmissionType = detectSubmissionType(previousText);
  const previousStream = detectWorkstreamType(previousText, previousLens);

  if (previousStream === 'general' || previousStream === activeWorkstream.stream) {
    return null;
  }

  const carryForward = extractCarryForwardItems(previousHistory);
  const openLoops = detectBlockers(previousText, previousHistory);
  const transitionReason = inferTransitionReason(
    previousStream,
    activeWorkstream.stream,
    input.message
  );

  return {
    from: previousStream,
    to: activeWorkstream.stream,
    carryForward,
    openLoops:
      openLoops.length > 0
        ? openLoops
        : inferOpenLoopsFromStream(previousStream, previousSubmissionType),
    transitionReason,
  };
}

function detectWorkstreamType(text: string, lens: IntentLens): WorkstreamType {
  const lower = text.toLowerCase();

  if (
    /deficien|information request|complete response|crl|rtf|reviewer question|response matrix/i.test(
      lower
    )
  ) {
    return 'deficiency_response';
  }
  if (
    /rewrite|revise|redraft|draft|author|edit.*section|clinical overview|module [1-5]/i.test(lower)
  ) {
    return 'document_authoring';
  }
  if (/pathway|strategy|pre-ind|pre-sub|meeting|submission plan|sequence/i.test(lower)) {
    return 'submission_strategy';
  }

  const scores: Array<{ stream: WorkstreamType; score: number }> = [
    {
      stream: 'submission_strategy',
      score: scorePatterns(lower, [
        /pathway|strategy|timeline|meeting|pre-ind|pre-sub|submission plan|sequence|agency/i,
        /fda|ema|pmda|global|regional/i,
      ]),
    },
    {
      stream: 'document_authoring',
      score: scorePatterns(lower, [
        /rewrite|revise|redraft|edit|author|draft|section|module|narrative/i,
        /clinical overview|summary|module 2|module 3|cer|briefing book/i,
      ]),
    },
    {
      stream: 'deficiency_response',
      score: scorePatterns(lower, [
        /deficien|information request|complete response|crl|rtf|reviewer question|response/i,
        /objection|agency feedback|inspection finding|483/i,
      ]),
    },
    {
      stream: 'evidence_development',
      score: scorePatterns(lower, [
        /evidence|support|justify|validation|dataset|study|citation|source/i,
        /endpoint|safety|exposure|comparability|stability|specification/i,
      ]),
    },
    {
      stream: 'review_preparation',
      score: scorePatterns(lower, [
        /audit|review|readiness|mock review|gap assessment|checklist/i,
        /reviewer|inspection readiness|due diligence/i,
      ]),
    },
    {
      stream: 'program_risk',
      score: scorePatterns(lower, [
        /risk|threat|vulnerab|what could go wrong|mitigation|exposure/i,
        /delay|timeline impact|probability|approval odds/i,
      ]),
    },
    {
      stream: 'cross_function_alignment',
      score: scorePatterns(lower, [
        /team|owner|stakeholder|handoff|alignment|decision maker|cross-functional/i,
        /clinical|cmc|regulatory|quality.*together|dependencies/i,
      ]),
    },
  ];

  scores.sort((left, right) => right.score - left.score);
  if (scores[0].score > 0) {
    return scores[0].stream;
  }

  switch (lens) {
    case 'improve':
      return 'document_authoring';
    case 'audit':
      return 'review_preparation';
    case 'risk':
      return 'program_risk';
    case 'strategy':
      return 'submission_strategy';
    case 'compare':
      return 'evidence_development';
    default:
      return 'general';
  }
}

function scorePatterns(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function detectWorkstreamPhase(input: OrchestratorInput, stream: WorkstreamType): WorkstreamPhase {
  const lower = input.message.toLowerCase();
  const phaseFromThread = input.conversationHistory?.length
    ? detectConversationPhase(input.conversationHistory)
    : 'initial';

  if (/approve|decide|go\/no-go|recommend final|which option/i.test(lower)) {
    return 'decision';
  }
  if (/implement|execute|run|create|generate|send|file|submit/i.test(lower)) {
    return 'execution';
  }
  if (/rewrite|redraft|draft|author|compose/i.test(lower)) {
    return 'drafting';
  }
  if (/refine|tighten|improve|adjust|revise|make it/i.test(lower)) {
    return 'refinement';
  }
  if (
    stream === 'review_preparation' ||
    stream === 'program_risk' ||
    /audit|assess|analyze|evaluate/i.test(lower)
  ) {
    return 'analysis';
  }
  if (phaseFromThread === 'iterative_refinement') {
    return 'refinement';
  }
  if (phaseFromThread === 'deep_dive' || phaseFromThread === 'follow_up') {
    return 'analysis';
  }
  return 'triage';
}

function detectCurrentFocus(
  input: OrchestratorInput,
  historyText: string,
  stream: WorkstreamType
): string | undefined {
  const text = `${input.message} ${historyText}`;
  const sectionMatch = text.match(
    /(?:Section|Module|Chapter)\s+[\d.]+[A-Za-z]?(?:\s*[-–:]\s*[^\n.]{3,60})?/i
  );
  if (sectionMatch) {
    return sectionMatch[0].trim();
  }
  if (input.documentContext?.section) {
    return input.documentContext.section;
  }
  if (input.documentContext?.documentType) {
    return input.documentContext.documentType;
  }

  switch (stream) {
    case 'submission_strategy':
      return 'Regulatory pathway and sequencing';
    case 'document_authoring':
      return 'Draft quality and claim architecture';
    case 'deficiency_response':
      return 'Response package and reviewer objections';
    case 'evidence_development':
      return 'Evidence chain and support gaps';
    case 'review_preparation':
      return 'Submission readiness';
    case 'program_risk':
      return 'Risk ranking and mitigation';
    case 'cross_function_alignment':
      return 'Owners, dependencies, and unresolved decisions';
    default:
      return undefined;
  }
}

function detectBlockers(
  text: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string[] {
  const lower = `${text} ${history.map(message => message.content).join(' ')}`.toLowerCase();
  const blockers: string[] = [];
  const blockerPatterns: Array<{ pattern: RegExp; blocker: string }> = [
    {
      pattern: /missing|insufficient|inadequate|gap|not.*enough|lack of evidence/i,
      blocker: 'Critical evidence is missing or insufficient',
    },
    {
      pattern: /unresolved|safety signal|toxicit|adverse event concern|clinical hold/i,
      blocker: 'Safety concerns remain unresolved',
    },
    {
      pattern: /unclear pathway|which pathway|regulatory strategy|agency expectation/i,
      blocker: 'Pathway or agency strategy is not settled',
    },
    {
      pattern: /weak prose|rewrite|narrative|unclear section|structure/i,
      blocker: 'Narrative quality is not yet submission-defensible',
    },
    {
      pattern: /owner|alignment|handoff|dependency|waiting on/i,
      blocker: 'Cross-functional dependencies are still open',
    },
  ];

  for (const { pattern, blocker } of blockerPatterns) {
    if (pattern.test(lower)) {
      blockers.push(blocker);
    }
  }

  return [...new Set(blockers)].slice(0, 3);
}

function extractCarryForwardItems(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string[] {
  const text = history.map(message => message.content).join(' ');
  const carryForward = new Set<string>();

  const sectionMatches = text.match(
    /(?:Section|Module|Chapter)\s+[\d.]+[A-Za-z]?(?:\s*[-–:]\s*[^\n.]{3,60})?/gi
  );
  if (sectionMatches) {
    sectionMatches.slice(0, 2).forEach(match => carryForward.add(match.trim()));
  }

  const termMatches = extractKeyRegTerms(text);
  termMatches.slice(0, 3).forEach(term => carryForward.add(term));

  return [...carryForward].slice(0, 4);
}

function inferTransitionReason(
  previousStream: WorkstreamType,
  currentStream: WorkstreamType,
  message: string
): string {
  const lower = message.toLowerCase();

  if (/now|next|switch|instead|move to|shift/i.test(lower)) {
    return 'The user explicitly pivoted to the next regulatory workstream.';
  }
  if (currentStream === 'document_authoring') {
    return `The thread moved from ${previousStream} into drafting so analysis can become governed text.`;
  }
  if (currentStream === 'deficiency_response') {
    return `The thread moved from ${previousStream} into reviewer-response planning.`;
  }
  if (currentStream === 'submission_strategy') {
    return `The thread moved from ${previousStream} into a program-level regulatory decision.`;
  }

  return `The thread shifted from ${previousStream} to ${currentStream} while preserving unresolved regulatory context.`;
}

function inferOpenLoopsFromStream(
  stream: WorkstreamType,
  submissionType: SubmissionType | null
): string[] {
  switch (stream) {
    case 'submission_strategy':
      return [
        `Pathway decision remains open${submissionType ? ` for ${submissionType.toUpperCase()}` : ''}`,
      ];
    case 'document_authoring':
      return ['Draft still needs a stronger claim-to-evidence chain'];
    case 'deficiency_response':
      return ['Reviewer objections still need mapped responses and evidence'];
    case 'evidence_development':
      return ['Evidence gaps still need to be closed or explicitly risk-accepted'];
    case 'review_preparation':
      return ['Readiness issues still need to be ranked and assigned'];
    case 'program_risk':
      return ['Top risks still need mitigation owners and timeline impact'];
    case 'cross_function_alignment':
      return ['Cross-functional dependencies still need owners and deadlines'];
    default:
      return [];
  }
}

function summarizeObjective(
  message: string,
  stream: WorkstreamType,
  submissionType: SubmissionType | null
): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length > 0 && normalized.length <= 180) {
    return normalized;
  }

  const submissionLabel = submissionType ? `${submissionType.toUpperCase()} ` : '';
  switch (stream) {
    case 'submission_strategy':
      return `Resolve the ${submissionLabel}regulatory pathway and execution sequence.`;
    case 'document_authoring':
      return 'Turn the current draft into submission-defensible language.';
    case 'deficiency_response':
      return 'Preempt or answer reviewer objections with evidence-backed responses.';
    case 'evidence_development':
      return 'Map what evidence exists, what is missing, and what must be strengthened.';
    case 'review_preparation':
      return 'Pressure-test the package the way an agency reviewer would.';
    case 'program_risk':
      return 'Rank approval risk and define concrete mitigations.';
    case 'cross_function_alignment':
      return 'Convert unresolved cross-functional issues into an executable plan.';
    default:
      return 'Advance the user toward a clearer regulatory decision or artifact.';
  }
}

function inferNextStep(
  stream: WorkstreamType,
  phase: WorkstreamPhase,
  lens: IntentLens,
  submissionType: SubmissionType | null
): string {
  const submissionLabel = submissionType ? `${submissionType.toUpperCase()} ` : '';

  switch (stream) {
    case 'submission_strategy':
      return `Decide the ${submissionLabel}pathway, key agency interaction, and the evidence required before the next milestone.`;
    case 'document_authoring':
      return phase === 'drafting'
        ? 'Produce revised text with a tighter claim-to-evidence chain and explicit regulatory support.'
        : 'Tighten the current draft, remove overstatement, and prepare the next review-ready version.';
    case 'deficiency_response':
      return 'Draft a deficiency response matrix that maps each likely question to evidence, owner, and mitigation.';
    case 'evidence_development':
      return 'Build an evidence inventory, mark critical gaps, and decide what can be defended now versus what needs new support.';
    case 'review_preparation':
      return 'Run a reviewer-style audit, rank the issues by severity, and convert the highest-risk items into assigned fixes.';
    case 'program_risk':
      return 'Rank the top risks by severity and likelihood, then define mitigations with timeline consequences.';
    case 'cross_function_alignment':
      return 'Translate the open issues into owners, dependencies, and a single decision path for the team.';
    default:
      return lens === 'improve'
        ? 'Rewrite the weak material into a defensible version and identify the evidence still needed.'
        : 'Clarify the blocking issue and convert it into the next concrete regulatory action.';
  }
}

function inferCollaborationMode(
  stream: WorkstreamType,
  phase: WorkstreamPhase,
  lens: IntentLens
): 'drive' | 'coauthor' | 'advise' {
  if (
    stream === 'document_authoring' ||
    phase === 'drafting' ||
    phase === 'refinement' ||
    lens === 'improve'
  ) {
    return 'coauthor';
  }
  if (
    stream === 'submission_strategy' ||
    stream === 'deficiency_response' ||
    stream === 'program_risk' ||
    phase === 'decision' ||
    phase === 'execution'
  ) {
    return 'drive';
  }
  return 'advise';
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation Continuity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract working context from conversation history to maintain short-horizon continuity.
 * Prevents AnA from acting memoryless inside an active thread.
 *
 * @param currentSubmissionType - The submission type already detected from the current message,
 *   so we don't inject a conflicting one from history.
 */
function buildContinuityContext(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentSubmissionType: SubmissionType | null
): string | null {
  if (history.length < 2) return null;

  const lines: string[] = ['## CONVERSATION CONTINUITY'];

  // Only look at recent messages (last 6) to avoid noise from old context
  const recentHistory = history.slice(-6);

  // Extract the active document/section under discussion from recent messages only
  const recentText = recentHistory.map(m => m.content).join(' ');
  const sectionMatches = recentText.match(
    /(?:Section|Module|Chapter)\s+[\d.]+[A-Za-z]?(?:\s*[-–:]\s*[^\n.]{3,60})?/gi
  );
  if (sectionMatches) {
    const uniqueSections = [...new Set(sectionMatches.map(s => s.trim()))].slice(0, 3);
    lines.push('');
    lines.push('**Document/Section Under Discussion:**');
    uniqueSections.forEach(s => lines.push(`- ${s}`));
  }

  // Detect active concern themes from recent assistant messages
  // Use narrower patterns that require problem-context, not just mention
  const recentAssistant = recentHistory
    .filter(m => m.role === 'assistant')
    .slice(-2)
    .map(m => m.content);

  const concerns: string[] = [];
  const concernPatterns: Array<{ pattern: RegExp; label: string }> = [
    // Require problem-indicating context words alongside domain terms
    {
      pattern:
        /(?:inadequate|insufficient|incomplete|missing|weak|deficient)\s+\w*\s*(?:evidence|data|support|justification)/i,
      label: 'Evidence adequacy',
    },
    {
      pattern:
        /safety signal|adverse event.*(?:concern|risk|unresolved)|toxicity.*(?:finding|signal)/i,
      label: 'Safety concerns',
    },
    {
      pattern:
        /endpoint.*(?:weak|inadequate|not.*justified|concern)|efficacy.*(?:insufficient|marginal)/i,
      label: 'Efficacy/endpoint defensibility',
    },
    {
      pattern:
        /(?:process validation|manufacturing).*(?:insufficient|inadequate|gap)|specification.*(?:not.*justified|weak)/i,
      label: 'CMC/manufacturing quality',
    },
    {
      pattern: /(?:predicate|equivalence).*(?:inadequate|not.*demonstrated|weak)/i,
      label: 'Device equivalence',
    },
    {
      pattern: /(?:labeling|claim).*(?:unsupported|overstate|not.*reflect)/i,
      label: 'Labeling/claims',
    },
    {
      pattern: /(?:statistical|multiplicity|sample size).*(?:inadequate|concern|not.*controlled)/i,
      label: 'Statistical rigor',
    },
  ];

  for (const { pattern, label } of concernPatterns) {
    if (recentAssistant.some(text => pattern.test(text))) {
      concerns.push(label);
    }
  }

  if (concerns.length > 0) {
    lines.push('');
    lines.push('**Active Concern Themes:**');
    concerns.slice(0, 4).forEach(c => lines.push(`- ${c}`));
  }

  // Detect any previously recommended actions from the last assistant message only
  const lastAssistant = recentAssistant[recentAssistant.length - 1] || '';
  const actionMentions: string[] = [];
  if (/(?:create|generate).*risk memo|risk assessment.*(?:recommend|suggest)/i.test(lastAssistant))
    actionMentions.push('Risk assessment in progress');
  if (/(?:create|generate).*deficiency|preemption.*memo/i.test(lastAssistant))
    actionMentions.push('Deficiency preemption analysis');
  if (/(?:rewrite|revise).*(?:section|document|text)/i.test(lastAssistant))
    actionMentions.push('Document improvement');
  if (/(?:strategy|pathway).*(?:recommend|note|assessment)/i.test(lastAssistant))
    actionMentions.push('Strategy development');

  if (actionMentions.length > 0) {
    lines.push('');
    lines.push('**Active Work Stream:**');
    actionMentions.slice(0, 3).forEach(a => lines.push(`- ${a}`));
  }

  // Only inject historical submission type if no current detection exists
  // This prevents conflicts between deficiency context (built from current) and continuity
  if (!currentSubmissionType) {
    const histSubmission = detectSubmissionType(recentText);
    if (histSubmission) {
      lines.push('');
      lines.push(`**Submission Context (from conversation):** ${histSubmission.toUpperCase()}`);
    }
  }

  // Detect conversation phase (depth of engagement)
  const phase = detectConversationPhase(history);
  if (phase !== 'initial') {
    lines.push('');
    lines.push(`**Conversation Phase:** ${phase}`);
    switch (phase) {
      case 'deep_dive':
        lines.push(
          'The user is drilling into detail. Give comprehensive, specific answers. Avoid high-level summaries they have already seen.'
        );
        break;
      case 'iterative_refinement':
        lines.push(
          'The user is refining previous output. Focus only on what changed or what they asked to modify. Do NOT regenerate unchanged content.'
        );
        break;
      case 'topic_shift':
        lines.push(
          'The user has shifted topics. Acknowledge the pivot naturally and bring relevant context from earlier discussion if applicable.'
        );
        break;
      case 'follow_up':
        lines.push(
          'The user is following up on your last response. Reference your previous analysis directly. Do not repeat context they already have.'
        );
        break;
      case 'summarization':
        lines.push(
          'The user wants a summary or synthesis. Consolidate the discussion into actionable intelligence.'
        );
        break;
    }
  }

  // Extract key entities/terms mentioned across the conversation to maintain vocabulary consistency
  const keyTerms = extractKeyRegTerms(recentHistory.map(m => m.content).join(' '));
  if (keyTerms.length > 0) {
    lines.push('');
    lines.push('**Key Regulatory Terms in Thread:**');
    lines.push(keyTerms.slice(0, 8).join(', '));
  }

  lines.push('');
  lines.push(
    '**Continuity instruction:** Build on the above context. Do not re-introduce yourself or ask the user to re-state what they already told you. Continue the working thread.'
  );

  return lines.length > 2 ? lines.join('\n') : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation Phase Detection
// ─────────────────────────────────────────────────────────────────────────────

type ConversationPhase =
  | 'initial'
  | 'deep_dive'
  | 'iterative_refinement'
  | 'topic_shift'
  | 'follow_up'
  | 'summarization';

/**
 * Detect what phase the conversation is in based on message patterns.
 * This helps AnA calibrate the depth and style of the response.
 */
function detectConversationPhase(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): ConversationPhase {
  if (history.length < 2) return 'initial';

  const userMessages = history.filter(m => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1]?.content || '';
  const prevUser = userMessages[userMessages.length - 2]?.content || '';
  const lower = lastUser.toLowerCase();

  // Summarization phase
  if (
    /\b(summarize|summary|synthesize|wrap up|consolidate|key takeaways|action items|recap)\b/i.test(
      lower
    )
  ) {
    return 'summarization';
  }

  // Iterative refinement — user is asking to modify/adjust previous output
  if (
    /\b(change|modify|adjust|tweak|make it|instead|rather|also add|remove the|less|more)\b/i.test(
      lower
    ) &&
    lower.length < 200
  ) {
    return 'iterative_refinement';
  }

  // Follow-up — short message that references "it", "that", "this" or "the above"
  if (
    lower.length < 100 &&
    /\b(what about|how about|and |also |can you|tell me more|explain|elaborate|expand|the above|that|this)\b/i.test(
      lower
    )
  ) {
    return 'follow_up';
  }

  // Topic shift — new message introduces very different keywords from previous
  if (prevUser) {
    const prevTerms = new Set(prevUser.toLowerCase().match(/\b[a-z]{4,}\b/g) || []);
    const currTerms = new Set(lower.match(/\b[a-z]{4,}\b/g) || []);
    const overlap = [...currTerms].filter(t => prevTerms.has(t)).length;
    const unionSize = new Set([...prevTerms, ...currTerms]).size;
    if (unionSize > 5 && overlap / unionSize < 0.15) {
      return 'topic_shift';
    }
  }

  // Deep dive — long detailed message in a multi-turn conversation
  if (userMessages.length >= 3 && lastUser.length > 200) {
    return 'deep_dive';
  }

  return 'follow_up';
}

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory Term Extraction
// ─────────────────────────────────────────────────────────────────────────────

/** Extract key regulatory terms used in the conversation for vocabulary consistency */
function extractKeyRegTerms(text: string): string[] {
  const patterns: RegExp[] = [
    /\b(?:IND|NDA|BLA|510\(?k\)?|PMA|De Novo|CER|IVDR|EU MDR|eCTD)\b/gi,
    /\bICH [A-Z]\d+(?:\([A-Z]\d+\))?/gi,
    /\b21 CFR (?:Part )?\d+(?:\.\d+)?/gi,
    /\b(?:Module [1-5]|Section \d+\.\d+(?:\.\d+)?)\b/gi,
    /\b(?:RTF|CRL|REMS|ETASU|PDUFA|GDUFA|MDUFA|BsUFA)\b/g,
    /\b(?:pre-?IND|pre-?NDA|pre-?BLA|pre-?submission|Type [A-D] meeting)\b/gi,
    /\b(?:substantial equivalence|bioequivalence|clinical hold|refuse to file|complete response)\b/gi,
    /\b(?:breakthrough therapy|fast track|priority review|accelerated approval|orphan drug)\b/gi,
  ];

  const terms = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) matches.forEach(m => terms.add(m.trim()));
  }
  return [...terms];
}
