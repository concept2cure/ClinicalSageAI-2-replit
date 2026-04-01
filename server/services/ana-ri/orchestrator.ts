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
  getIntelligencePriorities,
  type AnaRIPromptOptions,
  type IntentLens,
  type RoleIntelligencePriorities,
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
import {
  getProjectIntelligence,
  computeReadinessScore,
  getProjectSignals,
  enrichProjectIntelligence,
  type ProjectIntelligenceSummary,
  type RiskFactor,
  type OpenQuestion,
  type KeyDecision,
  type LearnedInsight,
  type ReadinessContext,
  type IntelligenceUpdatePayload,
} from '../intelligence/index.js';
import { getGateway } from '../ai-gateway/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// CTD Section Guidance — compact regulatory knowledge per section
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_GUIDANCE: Record<string, string> = {
  '2.2': 'Introduction to the CTD: brief overview of the drug product, pharmacological class, proposed indication, and route of administration. Keep concise — typically 1-2 pages.',
  '2.3': 'Quality Overall Summary (QOS): summarize all Module 3 CMC data. Cover drug substance, drug product, manufacturing, controls, stability. Must be self-contained.',
  '2.4': 'Nonclinical Overview: integrated assessment of pharmacology, PK, and toxicology. Expert narrative, not a summary of studies. Must support the proposed clinical use.',
  '2.5': 'Clinical Overview: integrated benefit-risk assessment. Cover efficacy, safety, dosing, special populations. This is the most critical Module 2 section — reviewers read this first.',
  '2.6': 'Nonclinical Written and Tabulated Summaries: study-level summaries organized by pharmacology (2.6.2), PK (2.6.4), and toxicology (2.6.6). Tabulated format per ICH M4S.',
  '2.7': 'Clinical Summary: detailed clinical data summaries. 2.7.1 (biopharmaceutics), 2.7.2 (PK), 2.7.3 (PD), 2.7.4 (efficacy), 2.7.5 (safety), 2.7.6 (individual studies).',
  '2.7.1': 'Summary of Biopharmaceutic Studies and Associated Analytical Methods: BA/BE studies, dissolution, food effect, formulation bridging.',
  '2.7.2': 'Summary of Clinical Pharmacology Studies: PK characterization, dose-response, DDI, special populations, PK modeling.',
  '2.7.3': 'Summary of Clinical Pharmacodynamics: PD biomarkers, dose-response relationships, PK/PD modeling.',
  '2.7.4': 'Summary of Clinical Efficacy: pivotal trial results, endpoints, statistical analyses. Must align with the benefit claim in 2.5.',
  '2.7.5': 'Summary of Clinical Safety: adverse events, deaths, lab abnormalities, vital signs, special populations. Aggregate across all studies.',
  '2.7.6': 'Synopses of Individual Studies: one synopsis per clinical study following ICH E3 format.',
  '3.2.S': 'Drug Substance: characterization, manufacturing, controls, stability. Each topic needs its own subsection per ICH M4Q.',
  '3.2.P': 'Drug Product: formulation, manufacturing process, controls, container closure, stability. Critical for process validation and shelf life.',
  '5.3.5': 'Reports of Efficacy and Safety Studies: full clinical study reports (CSRs) per ICH E3. Each pivotal study needs a complete CSR.',
  '1.2': 'Cover Letter: formal submission letter to the health authority. Reference regulatory pathway, submission type, and any pre-submission agreements.',
  '1.3': 'Administrative Information: prescribing information, labels, patent certificates, exclusivity claims.',
  '1.14': 'Environmental Assessment: required for NDAs. Justify categorical exclusion or provide full EA.',
};

function getSectionGuidance(sectionCode: string): string | null {
  // Direct match
  if (SECTION_GUIDANCE[sectionCode]) return SECTION_GUIDANCE[sectionCode];
  // Try prefix match (e.g., "2.7.4.1" matches "2.7.4")
  const parts = sectionCode.split('.');
  while (parts.length > 1) {
    parts.pop();
    const prefix = parts.join('.');
    if (SECTION_GUIDANCE[prefix]) return SECTION_GUIDANCE[prefix];
  }
  return null;
}

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
    /\b(cms|medicare|medicaid|payer|coverage|reimbursement|coding strategy)\b/i,
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
    organizationId?: number;
    sectionCode?: string;
    moduleCode?: string;
    artifactStatus?: string;
    _decisionContext?: Array<{ decision: unknown; receipt?: unknown }>;
    /** Pre-fetched RIM context block (loaded by route layer via preloadRIMContext) */
    _rimContext?: string;
    [key: string]: unknown;
  };
  /** Pre-fetched project intelligence profile (loaded by route layer, injected into system prompt) */
  _projectIntelligenceProfile?: ProjectIntelligenceSummary | null;
  /** Pre-fetched user feedback patterns from the learning loop (async, injected by chat-context-builder) */
  _feedbackContext?: {
    totalFeedback: number;
    acceptanceRate: number;
    topDismissedTypes: Array<{ type: string; count: number }>;
  } | null;
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
  /** Grounding context available to AnA for this request */
  groundingContext: {
    hasProjectContext: boolean;
    hasArtifactContext: boolean;
    hasSectionContext: boolean;
    hasWorkflowContext: boolean;
    hasEvidenceContext: boolean;
    hasMemoryContext: boolean;
    documentStatus: string | null;
    enrichmentSources: string[];
    enrichmentFailures: string[];
  };
  /** Metadata about what was orchestrated */
  orchestrationMeta: {
    intentSource: 'explicit' | 'detected' | 'default';
    submissionTypeSource: 'explicit' | 'detected' | 'none';
    roleSource: 'explicit' | 'default';
    deficiencyContextInjected: boolean;
    documentActionContextInjected: boolean;
    workstreamContextInjected: boolean;
    workstreamHandoffInjected: boolean;
    projectIntelligenceInjected: boolean;
    rimContextInjected: boolean;
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

  // 4b. Inject project intelligence profile (pre-fetched by route layer)
  //     Role-based priorities filter WHAT intelligence surfaces, not just tone.
  let projectIntelligenceInjected = false;
  if (input._projectIntelligenceProfile) {
    const rolePriorities = getIntelligencePriorities(appliedRole);
    const profileBlock = formatProjectIntelligenceBlock(input._projectIntelligenceProfile, rolePriorities);
    if (profileBlock) {
      systemPrompt += '\n\n' + profileBlock;
      projectIntelligenceInjected = true;
    }
  }

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

  // 8. (Command capabilities injected via buildCommandContextForPrompt() in step 10)

  // 8b. Inject decision architecture context for grounded explanations.
  // The chat route layer (async) pre-fetches decision context and attaches it
  // as _decisionContext on the authoringContext object. This keeps orchestrate() sync.
  if (input.authoringContext?.projectId) {
    try {
      const decisionCtx = input.authoringContext._decisionContext;
      if (decisionCtx && decisionCtx.length > 0) {
        const decisionBlock = decisionCtx.map(({ decision, receipt }: { decision: unknown; receipt?: unknown }) => {
          const d = decision as Record<string, unknown>;
          const r = receipt as Record<string, unknown> | undefined;
          let line = `- [${(d.status as string)?.toUpperCase?.() || '?'}] ${d.kind}: ${d.summary}`;
          const authority = d.authority as Record<string, unknown> | undefined;
          if (authority?.level) line += ` (authority: ${authority.level})`;
          const sourceSignals = d.sourceSignals as unknown[] | undefined;
          if (sourceSignals && sourceSignals.length > 0) line += ` — ${sourceSignals.length} signal(s)`;
          if (r) {
            const execution = r.execution as Record<string, unknown> | undefined;
            if (execution?.executed) line += ' → executed';
            const pendingApprovals = r.pendingApprovals as unknown[] | undefined;
            if (pendingApprovals && pendingApprovals.length > 0) line += ` → ${pendingApprovals.length} pending approval(s)`;
            const provisionalItems = r.provisionalItems as unknown[] | undefined;
            if (provisionalItems && provisionalItems.length > 0) line += ` → ${provisionalItems.length} provisional`;
          }
          return line;
        }).join('\n');
        systemPrompt += `\n\n## DECISION CONTEXT\nRecent decisions for this project/section:\n${decisionBlock}\n\nWhen explaining results, reference these decisions. Answer "why" from source signals and rationale. Answer "what happened" from receipts. Answer "what needs approval" from pending approvals. Never invent explanations — if no decision record exists, say so.`;
      }
    } catch { /* non-blocking */ }
  }

  // 8b2. Inject RIM (Regulatory Intelligence Model) context for document-scoped conversations.
  // Pre-fetched by the route layer via preloadRIMContext() and attached as _rimContext.
  // Only injected when the user is working on a specific section or artifact — not for general chat.
  let rimContextInjected = false;
  if (
    input.authoringContext?._rimContext &&
    (input.authoringContext?.sectionCode || input.authoringContext?.artifactId)
  ) {
    try {
      const rimBlock = input.authoringContext._rimContext;
      if (rimBlock.trim().length > 0) {
        systemPrompt += '\n\n' + rimBlock;
        rimContextInjected = true;
      }
    } catch { /* non-blocking */ }
  }

  // 8c. Inject document-state intelligence when authoring context includes artifact status
  if (input.authoringContext) {
    const artifactStatus = input.authoringContext?.artifactStatus;
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
      const sectionGuidance = getSectionGuidance(sectionCode);
      systemPrompt += `\n\n## ACTIVE SECTION: ${sectionCode}${moduleCode ? ` (Module ${moduleCode})` : ''}\nThe user is working in a specific CTD section. Tailor all guidance to this section. When the user says "this section" or "here", they mean ${sectionCode}. Be section-specific, not generic.${sectionGuidance ? `\n\n### Section Requirements\n${sectionGuidance}` : ''}`;
    }
  }

  // 8d. Inject context-freshness signal when conversation is long
  if (input.conversationHistory && input.conversationHistory.length > 12) {
    systemPrompt += `\n\n## CONTEXT FRESHNESS WARNING\nThis conversation has ${input.conversationHistory.length} messages. Project context was injected at the start and may not reflect recent changes. If the user asks about current state, suggest running /status or /readiness for a live check rather than relying on stale context. If you're unsure whether data is current, say so.`;
  }

  // 8e. Inject user feedback patterns from learning loop (pre-fetched by chat-context-builder)
  if (input._feedbackContext && input._feedbackContext.totalFeedback > 0 && input._feedbackContext.acceptanceRate < 100) {
    const fb = input._feedbackContext;
    const dismissedWithCounts = fb.topDismissedTypes
      .filter(d => d.count > 1)
      .slice(0, 3);
    if (dismissedWithCounts.length > 0) {
      const lines = dismissedWithCounts.map(d => {
        const typeRate = fb.totalFeedback > 0
          ? Math.round(((fb.totalFeedback - d.count) / fb.totalFeedback) * 100)
          : 0;
        return `- ${d.type}: dismissed ${d.count} times (acceptance rate: ${typeRate}%)`;
      }).join('\n');
      systemPrompt += `\n\n## USER FEEDBACK PATTERNS\nThe user has previously dismissed or rejected the following types of recommendations for this project:\n${lines}\n\nAvoid repeating these exact patterns. If you must recommend something similar, acknowledge the prior dismissal and explain why the recommendation is still relevant, or offer an alternative approach.`;
    }
  }

  // 8f. Inject proactive intelligence surfacing protocol + intelligence usage directives + citation protocol
  systemPrompt += `

## USING INJECTED INTELLIGENCE
When you receive PROJECT INTELLIGENCE PROFILE, REGULATORY INTELLIGENCE CONTEXT, PERSISTENT MEMORY CONTEXT, or USER FEEDBACK PATTERNS sections above, you MUST:
1. Reference specific items from these sections in your responses when relevant
2. Never contradict a documented decision without flagging the contradiction
3. Cite sources using the Evidence Citation Protocol below
4. Adjust recommendation confidence based on evidence sufficiency scores
5. When readiness is low for a section, lead with what's missing before addressing the user's question

## EVIDENCE CITATION PROTOCOL
When your response draws on specific knowledge from the injected context above, cite the source inline using this format:

- For memory atoms: [Source: {category} — {title}]
- For readiness scores: [Readiness: {section} at {score}%]
- For regulatory signals: [Signal: {type} — {description}]
- For precedent data: [Precedent: {case/decision reference}]
- For project decisions: [Decision: {decision summary}]
- For risk factors: [Risk: {severity} — {risk description}]
- For learned insights: [Insight: {insight summary}]

Citation rules:
1. Cite when making specific factual claims derived from injected context, not for general regulatory knowledge
2. Maximum 3 citations per response — do not over-cite
3. Place citations at the end of the relevant sentence or paragraph, not mid-sentence
4. If no specific source exists for a claim, say "Based on general regulatory practice" — never fabricate a citation
5. When confidence is below 70%, explicitly state: "This recommendation has moderate confidence — {reason}"
6. Memory atoms injected above use the format [category | "title"] — use those values in your citations

## PROACTIVE INTELLIGENCE PROTOCOL
You are expected to proactively surface relevant intelligence when contextually appropriate. Do NOT wait to be asked. Specifically:

1. **Risk alerts**: If the user is working on a section or artifact that has known risks from the project intelligence profile, mention them upfront. Example: "Before we proceed with Module 2.5, note that the evidence sufficiency score for this section is 62% — you may want to address the data gaps first."

2. **Consistency warnings**: If the user's current request could create inconsistency with prior decisions or other sections, flag it. Example: "This dosing rationale differs from what was established in Section 2.7.4 — should I reconcile them?"

3. **Memory-informed suggestions**: If you have memory atoms relevant to the current task, reference them naturally. Example: "Based on the regulatory feedback captured last week, the reviewer was concerned about the primary endpoint justification."

4. **Deadline/milestone awareness**: If the project has milestones approaching, mention them when relevant. Example: "The Module 3 freeze date is in 5 days — this section should be finalized soon."

5. **Pattern recognition**: If you notice the user asking similar questions repeatedly, offer to create a reusable template or persistent knowledge atom.

Rules for proactive surfacing:
- Maximum ONE proactive insight per response (don't overwhelm)
- Only surface if confidence > 70% that it's relevant to the current message
- Prefix proactive insights with a subtle marker: "**Note:**" or "**Context:**"
- Never repeat a proactive insight you've already surfaced in this thread
- If you have nothing proactive to add, say nothing — silence is better than noise`;

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

  // 12. Build grounding context metadata
  const groundingContext = {
    hasProjectContext: !!(input.projectContext?.productName || input.projectContext?.submissionType || input.authoringContext?.projectId),
    hasArtifactContext: !!(input.documentContext?.documentType || input.documentContext?.title),
    hasSectionContext: !!(input.documentContext?.section || input.authoringContext?.sectionCode),
    hasWorkflowContext: !!(activeWorkstream.stream !== 'general'),
    hasEvidenceContext: deficiencyContextInjected,
    hasMemoryContext: !!(input.conversationHistory && input.conversationHistory.length > 0),
    documentStatus: input.documentContext?.status ?? null,
    enrichmentSources: [] as string[], // populated by caller after enrichment
    enrichmentFailures: [] as string[], // populated by caller if enrichment fails
  };

  return {
    systemPrompt,
    detectedIntent,
    detectedSubmissionType,
    appliedRole,
    activeWorkstream,
    workstreamHandoff,
    suggestedActions,
    groundingContext,
    orchestrationMeta: {
      intentSource,
      submissionTypeSource,
      roleSource,
      deficiencyContextInjected,
      documentActionContextInjected,
      workstreamContextInjected: true,
      workstreamHandoffInjected: !!workstreamHandoff,
      projectIntelligenceInjected,
      rimContextInjected,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RIM Context Pre-loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-fetch RIM intelligence context for injection into the orchestrator.
 *
 * Call this in the async route layer BEFORE calling `orchestrate()`, then
 * attach the result as `authoringContext._rimContext`. This follows the
 * same pattern used for `_decisionContext`.
 *
 * Only call when the user is working on a specific document section or
 * artifact — skip for general chat to avoid unnecessary overhead.
 *
 * The returned block is capped at ~400 tokens to avoid prompt bloat.
 *
 * @param projectId - The project ID
 * @param organizationId - The organization ID (for live readiness scoring)
 * @returns A formatted markdown block or empty string if no data
 */
export async function preloadRIMContext(
  projectId: string,
  organizationId?: number,
): Promise<string> {
  try {
    const parts: string[] = [];

    // 1. Readiness score (live computation if org available, else skip)
    if (organizationId) {
      try {
        const ctx: ReadinessContext = {
          organizationId,
          projectId: Number(projectId),
        };
        const score = await computeReadinessScore(ctx);
        const gapLines = score.gaps
          .slice(0, 5)
          .map(
            (g) =>
              `- [${g.severity.toUpperCase()}] ${g.module}: ${g.description}`,
          )
          .join('\n');
        parts.push(
          `**Readiness: ${score.overallScore}/100** | Trend: ${score.trend?.direction || 'unknown'}` +
            (gapLines ? `\nTop gaps:\n${gapLines}` : ''),
        );
      } catch (e: unknown) {
        console.warn(
          '[rim-preload] Readiness scoring failed:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // 2. Accumulated RIM signals (in-memory, synchronous)
    if (organizationId) {
      try {
      const summary = getProjectSignals(organizationId, Number(projectId));
      if (summary && summary.totalSignals > 0) {
        const riskLines = Object.entries(summary.byRiskLevel)
          .filter(([, count]) => Number(count) > 0)
          .map(([risk, count]) => `- ${risk}: ${count}`)
          .join('\n');
        const patternLine =
          summary.topPatternIds.length > 0
            ? `Top patterns: ${summary.topPatternIds.slice(0, 5).join(', ')}`
            : 'Top patterns: none captured yet';
        parts.push(
          `**${summary.totalSignals} intelligence signals**\n` +
          `Trend: ${summary.overallTrend} (${summary.trendConfidence}, n=${summary.trendSampleSize})\n` +
          `Average score: ${summary.averageScore}\n` +
          `${patternLine}\n` +
          `Risk distribution:\n${riskLines || '- none'}`,
        );
      }
      } catch (e: unknown) {
        console.warn(
          '[rim-preload] Signal retrieval failed:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    if (parts.length === 0) return '';

    return (
      `## REGULATORY INTELLIGENCE CONTEXT (cite as [Readiness: section at score%] or [Signal: type — description])\n` +
      parts.join('\n\n') +
      `\n\nUse this intelligence to inform your response. Flag sections with low readiness. When citing readiness scores or signals, use the Evidence Citation Protocol format.`
    );
  } catch (e: unknown) {
    console.warn(
      '[rim-preload] Failed to build RIM context:',
      e instanceof Error ? e.message : String(e),
    );
    return '';
  }
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
  if (
    /cms|medicare|medicaid|payer|reimbursement|coverage determination|coding strategy|hcpcs|cpt|drg|apc/i.test(
      lower
    )
  ) {
    return 'submission_strategy';
  }

  const scores: Array<{ stream: WorkstreamType; score: number }> = [
    {
      stream: 'submission_strategy',
      score: scorePatterns(lower, [
        /pathway|strategy|timeline|meeting|pre-ind|pre-sub|submission plan|sequence|agency/i,
        /fda|ema|pmda|global|regional/i,
        /cms|medicare|medicaid|payer|reimbursement|coverage|coding strategy|hcpcs|cpt|drg|apc/i,
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
        /diagnostic|ivd|companion diagnostic|analytical validation|clinical performance|sensitivity|specificity/i,
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

// ─────────────────────────────────────────────────────────────────────────────
// Thread Intelligence Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracted intelligence structure from conversation analysis.
 */
interface ExtractedIntelligence {
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  insights: string[];
}

const EXTRACTION_PROMPT = `Analyze this conversation and extract regulatory intelligence. Return JSON:
{
  "decisions": ["decision text..."],
  "risks": ["risk description..."],
  "openQuestions": ["question..."],
  "insights": ["insight..."]
}
Only include items that are NEW and SPECIFIC to this project. Skip generic advice. Be concise — one sentence per item. Return empty arrays if nothing qualifies.`;

/**
 * Extract intelligence from a conversation thread and persist to the project
 * intelligence profile. Should be called non-blocking (fire-and-forget).
 *
 * Only processes the last 6 messages to keep extraction focused and cost-effective.
 * Requires at least 6 messages (3+ exchanges) to have enough substance.
 */
export async function extractThreadIntelligence(
  messages: Array<{ role: string; content: string }>,
  projectId: number | string,
  organizationId: number | string,
): Promise<void> {
  // Guard: need at least 6 messages (3 exchanges) for meaningful extraction
  if (messages.length < 6) return;

  const numericProjectId = typeof projectId === 'string' ? parseInt(projectId, 10) : projectId;
  const numericOrgId = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId;

  if (isNaN(numericProjectId) || isNaN(numericOrgId)) return;

  const gw = getGateway();
  if (!gw) return;

  // Only use the last 6 messages to keep the extraction prompt short
  const recentMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-6);

  if (recentMessages.length < 4) return; // Need at least 2 exchanges in the window

  const conversationText = recentMessages
    .map(m => `[${m.role}]: ${m.content.slice(0, 2000)}`)
    .join('\n\n');

  const extractionPrompt = `${EXTRACTION_PROMPT}\n\nConversation:\n${conversationText}`;

  // Call AI gateway with short max_tokens for cost efficiency
  const response = await gw.route({
    taskType: 'structured_output',
    messages: [{ role: 'user', content: extractionPrompt }],
    maxTokens: 500,
    temperature: 0.1,
    jsonMode: true,
  });

  if (!response.content) return;

  // Parse the structured response
  let extracted: ExtractedIntelligence;
  try {
    const parsed = JSON.parse(response.content);
    extracted = {
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: unknown) => typeof d === 'string' && d.length > 0) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.filter((r: unknown) => typeof r === 'string' && r.length > 0) : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.filter((q: unknown) => typeof q === 'string' && q.length > 0) : [],
      insights: Array.isArray(parsed.insights) ? parsed.insights.filter((i: unknown) => typeof i === 'string' && i.length > 0) : [],
    };
  } catch (e: unknown) {
    console.warn('[AnA RI] Intelligence extraction JSON parse failed:', e instanceof Error ? e.message : String(e));
    return;
  }

  // Skip if nothing was extracted
  const totalItems = extracted.decisions.length + extracted.risks.length +
    extracted.openQuestions.length + extracted.insights.length;
  if (totalItems === 0) return;

  // Build the update payload for the project intelligence profile
  const now = new Date().toISOString();
  const payload: IntelligenceUpdatePayload = {};

  if (extracted.decisions.length > 0) {
    payload.keyDecisions = extracted.decisions.map(d => ({
      decision: d,
      rationale: 'Extracted from AnA conversation',
      date: now,
      source: 'ana-thread-extraction',
    }));
  }

  if (extracted.risks.length > 0) {
    payload.risks = extracted.risks.map(r => ({
      risk: r,
      likelihood: 'medium',
      impact: 'medium',
      mitigation: undefined,
    }));
  }

  if (extracted.openQuestions.length > 0) {
    payload.openQuestions = extracted.openQuestions.map(q => ({
      question: q,
      context: 'Raised during AnA conversation',
      priority: 'medium',
    }));
  }

  if (extracted.insights.length > 0) {
    payload.learnedInsights = extracted.insights.map(i => ({
      insight: i,
      source: 'ana-thread-extraction',
      confidence: 0.7,
      extractedAt: now,
    }));
  }

  // Persist to the project intelligence profile (additive merge)
  await enrichProjectIntelligence(numericProjectId, numericOrgId, payload);

  console.log(
    `[AnA RI] Intelligence extracted: ${extracted.decisions.length} decisions, ` +
    `${extracted.risks.length} risks, ${extracted.openQuestions.length} questions, ` +
    `${extracted.insights.length} insights (project ${numericProjectId})`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Intelligence Profile — context injection for conversation continuity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a project intelligence profile into a concise system prompt block.
 * When priorities are provided, filters and limits content based on the user's role.
 * Returns null if the profile has no meaningful content to inject.
 */
function formatProjectIntelligenceBlock(
  profile: ProjectIntelligenceSummary,
  priorities?: RoleIntelligencePriorities,
): string | null {
  const parts: string[] = [];

  // Limits — use priorities if provided, otherwise defaults that match prior behavior
  const maxRisks = priorities?.maxRisks ?? 5;
  const maxDecisions = priorities?.maxDecisions ?? 5;
  const maxInsights = priorities?.maxInsights ?? 5;
  const maxQuestions = priorities?.maxQuestions ?? 5;
  const header = priorities?.intelligenceHeader ?? 'PROJECT INTELLIGENCE PROFILE';

  // Header
  parts.push(`## ${header}`);
  parts.push(`**Project ID:** ${profile.projectId} | **Status:** ${profile.profileStatus}`);
  if (profile.targetIndication || profile.targetPopulation) {
    const meta: string[] = [];
    if (profile.targetIndication) meta.push(`**Indication:** ${profile.targetIndication}`);
    if (profile.targetPopulation) meta.push(`**Population:** ${profile.targetPopulation}`);
    parts.push(meta.join(' | '));
  }

  // Readiness directive (role-gated — prompts AnA to surface readiness proactively)
  if (priorities?.includeReadiness) {
    parts.push('');
    parts.push('### Readiness');
    parts.push('This user role prioritizes readiness visibility. Proactively surface readiness scores and gap analysis. Use /readiness data when available.');
  }

  // Regulatory Strategy
  parts.push('');
  parts.push('### Regulatory Strategy');
  parts.push(profile.regulatoryStrategy || 'Not yet defined');

  // Known Risks — filtered by riskFocus and limited by maxRisks
  const risks = profile.riskFactors as readonly RiskFactor[];
  if (risks.length > 0) {
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const riskFocusSet = priorities?.riskFocus
      ? new Set(priorities.riskFocus as string[])
      : null;
    const filteredRisks = riskFocusSet
      ? risks.filter((r) => riskFocusSet.has((r.impact ?? '').toLowerCase()))
      : [...risks];
    const sortedRisks = [...filteredRisks].sort((a, b) => {
      const aScore = severityOrder[a.impact?.toLowerCase() ?? ''] ?? 4;
      const bScore = severityOrder[b.impact?.toLowerCase() ?? ''] ?? 4;
      return aScore - bScore;
    });
    const topRisks = sortedRisks.slice(0, maxRisks);
    if (topRisks.length > 0) {
      parts.push('');
      parts.push(`### Known Risks (${filteredRisks.length})`);
      for (const r of topRisks) {
        parts.push(`- [${(r.impact || 'unknown').toUpperCase()}] ${r.risk} (likelihood: ${r.likelihood || 'unknown'})`);
      }
      if (filteredRisks.length > maxRisks) {
        parts.push(`- ... and ${filteredRisks.length - maxRisks} more`);
      }
    }
  }

  // Open Questions — limited by maxQuestions
  const questions = profile.openQuestions as readonly OpenQuestion[];
  if (questions.length > 0 && maxQuestions > 0) {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortedQuestions = [...questions].sort((a, b) => {
      const aScore = priorityOrder[a.priority?.toLowerCase() ?? ''] ?? 4;
      const bScore = priorityOrder[b.priority?.toLowerCase() ?? ''] ?? 4;
      return aScore - bScore;
    });
    const topQuestions = sortedQuestions.slice(0, maxQuestions);
    parts.push('');
    parts.push(`### Open Questions (${questions.length})`);
    for (const q of topQuestions) {
      const priorityTag = q.priority ? `[${q.priority.toUpperCase()}] ` : '';
      parts.push(`- ${priorityTag}${q.question}`);
    }
    if (questions.length > maxQuestions) {
      parts.push(`- ... and ${questions.length - maxQuestions} more`);
    }
  }

  // Key Decisions — limited by maxDecisions
  const decisions = profile.keyDecisions as readonly KeyDecision[];
  if (decisions.length > 0 && maxDecisions > 0) {
    const sortedDecisions = [...decisions].sort((a, b) => {
      return (b.date || '').localeCompare(a.date || '');
    });
    const topDecisions = sortedDecisions.slice(0, maxDecisions);
    parts.push('');
    parts.push(`### Key Decisions (${decisions.length})`);
    for (const d of topDecisions) {
      const dateTag = d.date ? ` (${d.date})` : '';
      parts.push(`- ${d.decision}${dateTag} — ${d.rationale}`);
    }
    if (decisions.length > maxDecisions) {
      parts.push(`- ... and ${decisions.length - maxDecisions} more`);
    }
  }

  // Learned Insights — limited by maxInsights
  const insights = profile.learnedInsights as readonly LearnedInsight[];
  if (insights.length > 0 && maxInsights > 0) {
    const sortedInsights = [...insights].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const topInsights = sortedInsights.slice(0, maxInsights);
    parts.push('');
    parts.push('### Learned Insights');
    for (const i of topInsights) {
      parts.push(`- ${i.insight} (source: ${i.source}, confidence: ${Math.round((i.confidence ?? 0) * 100)}%)`);
    }
    if (insights.length > maxInsights) {
      parts.push(`- ... and ${insights.length - maxInsights} more`);
    }
  }

  // Signal trends (role-gated)
  if (priorities?.includeSignalTrends) {
    parts.push('');
    parts.push('### Signal Trends');
    parts.push('Signal trend analysis is active for this role. Use /signals to inspect recent patterns.');
  }

  // Check if there's any meaningful content beyond the header
  const hasContent = risks.length > 0 || questions.length > 0 || decisions.length > 0 ||
    insights.length > 0 || profile.regulatoryStrategy;
  if (!hasContent) return null;

  // Closing directive
  parts.push('');
  parts.push('Use this profile to maintain continuity. Reference known risks and open questions proactively. Do not repeat recommendations that contradict prior decisions. When citing items from this profile, use the Evidence Citation Protocol format: [Risk: severity — description], [Decision: summary], [Insight: summary].');

  return parts.join('\n');
}

/**
 * Pre-fetch the project intelligence profile for injection into the orchestrator.
 * Call this in route handlers before calling orchestrate(), then pass the result
 * as `_projectIntelligenceProfile` on the OrchestratorInput.
 *
 * Non-blocking: returns null on any failure.
 */
export async function prefetchProjectIntelligence(
  projectId: number | undefined | null,
  organizationId: number | undefined | null,
): Promise<ProjectIntelligenceSummary | null> {
  if (!projectId || !organizationId) return null;
  try {
    return await getProjectIntelligence(projectId, organizationId);
  } catch (e: unknown) {
    console.warn(
      '[orchestrator] Failed to prefetch project intelligence profile:',
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
