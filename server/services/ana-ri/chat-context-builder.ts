/**
 * AnA RI — Shared Chat Context Builder
 *
 * Eliminates duplication between /chat and /stream endpoints.
 * Both endpoints call buildChatContext() to get the fully assembled
 * system prompt, messages array, and orchestration metadata.
 *
 * Extracted per QA finding H-3.
 *
 * @module server/services/ana-ri/chat-context-builder
 */

import type { Request } from 'express';
import type { GatewayMessage } from '../ai-gateway/types.js';
import { pool } from '../../db.js';
import { orchestrate, type OrchestratorInput, type IntentLens, type UserRole } from './index.js';
import { prefetchProjectIntelligence, preloadRIMContext } from './orchestrator.js';
import type { SubmissionType } from './deficiency-taxonomy.js';
import { resolveToDeficiencyType } from '../../../shared/regulatory/submission-type-bridge.js';
import { inferRole } from './role-adapter.js';
import { buildMemoryContextForChat } from '../memory-context-assembler.js';
import { getIntelligencePrefix, buildSectionSpecificPrompt } from '../lumen-context-builder.js';
import { enrichContextForChat } from './context-enrichment.js';
import type { EnrichmentResult } from './context-enrichment.js';
import { getThreadMessages, resolveAccessibleThread } from '../chat-thread-helpers.js';
import { getFeedbackSummary } from '../intelligence/learning-loop-service.js';
import { decisionLifecycleService } from '../decision-lifecycle-service.js';
import { buildMdxContextBlock } from './mdx-context-resolver.js';
import { buildSurfaceContextBlock } from './surface-context-block.js';
import { loadRelationalOverlay } from './relational-profile-service.js';
import { buildExternalIntelBlock } from '../external-intelligence/index.js';
import { getDeadlineRadar, buildDeadlineRadarBlock } from '../ana/deadline-radar.js';
import {
  getOpenContradictionsForOrg,
  buildContradictionWatchBlock,
} from '../ana/contradiction-watch.js';
import { getSessionBriefing } from '../ana/session-briefing.js';
import { parseIntegerProjectId } from '../../lib/project-id.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_LENSES: IntentLens[] = ['auto', 'audit', 'improve', 'risk', 'strategy', 'compare'];
const VALID_ROLES: UserRole[] = [
  'ceo',
  'ra_lead',
  'medical_writer',
  'clinical_lead',
  'cmc_lead',
  'biostatistician',
  'pharmacovigilance',
  'quality',
  'investor',
  'general',
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatContext {
  messages: GatewayMessage[];
  effectiveMessage: string;
  orchestration: ReturnType<typeof orchestrate>;
  orgId: number | null;
  userId: number | string;
  effectiveRole: UserRole;
  enrichmentSources: string[];
  threadId: string | undefined;
}

export interface PrefetchedRouteIntelligenceContext {
  projectIdNumber: number | null;
  feedbackContext: OrchestratorInput['_feedbackContext'];
  projectProfile: OrchestratorInput['_projectIntelligenceProfile'];
  rimContext: string;
  decisionContext: Array<{ decision: unknown; receipt?: unknown }>;
  orchestratorAuthoringContext?: OrchestratorInput['authoringContext'];
  /** AnA's self-developed RELATIONAL CONTEXT block ('' when nothing learned yet). */
  relationalOverlay: string;
  /** Fresh nightly-sweep findings block ('' when nothing fresh). */
  externalIntelBlock: string;
  /** Proactive OVERDUE/DUE-SOON regulatory-deadline block ('' when nothing pressing). */
  deadlineRadarBlock: string;
  /** Session-start situational briefing block ('' except on the first turn). */
  sessionBriefingBlock: string;
  /**
   * Open contradiction-engine findings block ('' when none). Unlike the
   * briefing/deadline pair this does NOT alternate by turn: an unresolved
   * finding that blocks promotion is live on every turn until someone
   * resolves it, and until this field existed the block had a builder, a
   * docstring promising the chat context, and no caller — findings that
   * blocked promotion were invisible in chat.
   */
  contradictionWatchBlock: string;
  /** Optional reads that failed or exceeded their deadline; never a clean empty result. */
  unavailableSources?: string[];
  contextAvailabilityBlock?: string;
}

// The route and authoring context blocks live in context-blocks.ts.
export { buildRouteContextBlock, buildAuthoringContextBlock } from './context-blocks.js';
import { buildAuthoringContextBlock } from './context-blocks.js';

export function resolveProjectIdFromBody(body: any): string | number | undefined {
  return body?.project_id || body?.context?.projectId || body?.project_context?.projectId;
}

/**
 * Race a promise against a timeout, resolving to `fallback` if it doesn't settle
 * in time. Used to bound OPTIONAL context enrichment so a slow DB can never stall
 * AnA's time-to-first-token — the worst case is a turn without that one block.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), timeout]);
}

/** Max wait for the optional proactive block (deadline radar / session briefing). */
const PROACTIVE_PREFETCH_TIMEOUT_MS = 1500;
/** Narrative recall is optional; execution/approval policy reads remain outside this budget. */
const OPTIONAL_PREFETCH_TIMEOUT_MS = 3000;

type ProactiveBlock = { kind: 'briefing' | 'deadline' | 'none'; block: string };

type ProjectPrefetchResults = [
  PromiseSettledResult<Awaited<ReturnType<typeof getFeedbackSummary>>>,
  PromiseSettledResult<Awaited<ReturnType<typeof prefetchProjectIntelligence>>>,
  PromiseSettledResult<Awaited<ReturnType<typeof preloadRIMContext>>>
];

export async function prefetchRouteIntelligenceContext(params: {
  projectId?: string | number | null;
  /**
   * The integer projects.id the route resolved from `projectId` (a program UUID
   * through its linked projects row, services/c2c/project-ref.ts). Omitted:
   * only an integer `projectId` names a project here.
   */
  projectIdNumber?: number | null;
  organizationId?: number | null;
  authoringContext?: Record<string, unknown>;
  /** Numeric user id — enables AnA's per-user relational personality overlay. */
  userId?: number | null;
  /** Target agency of the active program — scopes the external intel block. */
  targetAgency?: string | null;
  /** First turn of a session — surface the full situational briefing instead of just deadlines. */
  sessionStart?: boolean;
}): Promise<PrefetchedRouteIntelligenceContext> {
  const { projectId, organizationId, authoringContext, userId, targetAgency, sessionStart } =
    params;
  /* Number(projectId) was NaN for a program UUID (ana-14): the project reads
     below were skipped, and the relational overlay and session briefing were
     sent NaN and failed. parseIntegerProjectId is fail-closed: never NaN, and
     never the integer a UUID's leading digits spell. */
  const projectIdNumber = params.projectIdNumber !== undefined
    ? params.projectIdNumber
    : parseIntegerProjectId(projectId);
  const unavailable = new Set<string>();
  const bounded = async <T>(source: string, load: () => Promise<T>, ms = OPTIONAL_PREFETCH_TIMEOUT_MS): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(load),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Optional context deadline exceeded')), ms);
        }),
      ]);
    } catch (error) {
      unavailable.add(source);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  let feedbackContext: OrchestratorInput['_feedbackContext'] = null;
  let projectProfile: OrchestratorInput['_projectIntelligenceProfile'] = null;
  let rimContext = '';
  let decisionContext: Array<{ decision: unknown; receipt?: unknown }> = [];

  // All context sources are independent. Start project-scoped work alongside
  // the global/user-scoped work so pre-gateway latency is bounded by the slowest
  // source rather than the sum of two sequential batches.
  const projectContextPromise: Promise<ProjectPrefetchResults> =
    projectIdNumber &&
    Number.isFinite(projectIdNumber) &&
    organizationId &&
    Number.isFinite(organizationId)
      ? (Promise.allSettled([
          bounded('project feedback', () => getFeedbackSummary(projectIdNumber, organizationId)),
          bounded('project intelligence', () => prefetchProjectIntelligence(projectIdNumber, organizationId)),
          authoringContext?.sectionCode || authoringContext?.artifactId
            ? bounded('regulatory snapshot', () => preloadRIMContext(String(projectIdNumber), organizationId))
            : Promise.resolve(''),
        ]) as Promise<ProjectPrefetchResults>)
      : Promise.resolve([
          { status: 'rejected' as const, reason: 'project context not requested' },
          { status: 'rejected' as const, reason: 'project context not requested' },
          { status: 'rejected' as const, reason: 'project context not requested' },
        ] as ProjectPrefetchResults);

  // The relational overlay needs only org + user, and the external-intel block
  // is global (and process-cached).
  const [
    [relationalResult, externalIntelResult, deadlineResult, contradictionResult],
    projectResults,
  ] = await Promise.all([
    Promise.allSettled([
      bounded('conversation preferences', () => loadRelationalOverlay({
        organizationId: organizationId ?? null,
        userId: userId ?? null,
        projectId: projectIdNumber,
      })),
      bounded('external intelligence', () => buildExternalIntelBlock(targetAgency ?? null)),
      // Proactive risk surfacing — org-scoped, fail-soft. On the FIRST turn of a
      // session, surface the full situational briefing (deadlines + recent
      // decisions); on later turns, just the deadline block (overdue + due-soon).
      // Only one is non-empty per turn, so deadlines are never duplicated.
      organizationId && Number.isFinite(organizationId)
        ? bounded<ProactiveBlock>(
            sessionStart ? 'session briefing' : 'deadlines',
            () => sessionStart
              ? getSessionBriefing({ organizationId, projectId: projectIdNumber }).then(r => ({
                  kind: 'briefing' as const,
                  block: r.block,
                }))
              : getDeadlineRadar({ organizationId }).then(r => ({
                  kind: 'deadline' as const,
                  block: buildDeadlineRadarBlock(r),
                })),
            PROACTIVE_PREFETCH_TIMEOUT_MS
          )
        : Promise.resolve({ kind: 'none' as const, block: '' }),
      // Open contradiction findings stay live on every turn until resolved.
      organizationId && Number.isFinite(organizationId)
        ? bounded<string>(
            'open contradictions',
            () => getOpenContradictionsForOrg(organizationId).then(items =>
              buildContradictionWatchBlock(items)
            ),
            PROACTIVE_PREFETCH_TIMEOUT_MS
          )
        : Promise.resolve(''),
    ]),
    projectContextPromise,
  ]);
  const relationalOverlay = relationalResult.status === 'fulfilled' ? relationalResult.value : '';
  const externalIntelBlock =
    externalIntelResult.status === 'fulfilled' ? externalIntelResult.value : '';
  const proactive =
    deadlineResult.status === 'fulfilled'
      ? deadlineResult.value
      : { kind: 'none' as const, block: '' };
  const deadlineRadarBlock = proactive.kind === 'deadline' ? proactive.block : '';
  const sessionBriefingBlock = proactive.kind === 'briefing' ? proactive.block : '';
  const contradictionWatchBlock =
    contradictionResult.status === 'fulfilled' ? contradictionResult.value : '';

  if (
    projectIdNumber &&
    Number.isFinite(projectIdNumber) &&
    organizationId &&
    Number.isFinite(organizationId)
  ) {
    const [feedbackResult, profileResult, rimResult] = projectResults;

    if (feedbackResult.status === 'fulfilled' && feedbackResult.value.totalFeedback > 0) {
      feedbackContext = {
        totalFeedback: feedbackResult.value.totalFeedback,
        acceptanceRate: feedbackResult.value.acceptanceRate,
        topDismissedTypes: feedbackResult.value.topDismissedTypes,
      };
    }

    if (profileResult.status === 'fulfilled') {
      projectProfile = profileResult.value;
    }

    if (rimResult.status === 'fulfilled') {
      rimContext = rimResult.value;
    }

    try {
      decisionContext = decisionLifecycleService.getDecisionContext(String(projectIdNumber), {
        sectionCode:
          typeof authoringContext?.sectionCode === 'string'
            ? authoringContext.sectionCode
            : undefined,
        moduleCode:
          typeof authoringContext?.moduleCode === 'string'
            ? authoringContext.moduleCode
            : undefined,
        limit: 10,
        organizationId:
          organizationId && Number.isFinite(organizationId) ? organizationId : undefined,
      });
    } catch {
      // Non-blocking — decision context is optional enrichment.
      unavailable.add('project decisions');
    }
  }

  let orchestratorAuthoringContext: OrchestratorInput['authoringContext'] | undefined;
  if (authoringContext || projectId || organizationId) {
    orchestratorAuthoringContext = {
      ...(authoringContext || {}),
      ...(projectId ? { projectId: String(projectId) } : {}),
      ...(organizationId ? { organizationId } : {}),
    };
    if (decisionContext.length > 0) {
      orchestratorAuthoringContext._decisionContext = decisionContext;
    }
    if (rimContext) {
      orchestratorAuthoringContext._rimContext = rimContext;
    }
  }

  const unavailableSources = [...unavailable].sort();
  const contextAvailabilityBlock = unavailableSources.length > 0
    ? `\n\n## Context availability\nOptional context unavailable this turn: ${unavailableSources.join(', ')}. ` +
      'Do not infer that missing context, prior decisions, deadlines, or unresolved findings do not exist. ' +
      'Check the relevant records before relying on their absence or claiming the project has no blockers.\n'
    : '';
  return {
    projectIdNumber,
    feedbackContext,
    projectProfile,
    rimContext,
    decisionContext,
    orchestratorAuthoringContext,
    relationalOverlay,
    externalIntelBlock,
    deadlineRadarBlock,
    sessionBriefingBlock,
    contradictionWatchBlock,
    unavailableSources,
    contextAvailabilityBlock,
  };
}

export function buildOrchestratorAuthoringContext(params: {
  authoringContext?: Record<string, unknown>;
  projectId?: string | number | null;
  organizationId?: number | null;
  decisionContext?: Array<{ decision: unknown; receipt?: unknown }>;
  rimContext?: string;
}): OrchestratorInput['authoringContext'] | undefined {
  const { authoringContext, projectId, organizationId, decisionContext, rimContext } = params;
  if (!authoringContext && !projectId && !organizationId) return undefined;

  const assembled: OrchestratorInput['authoringContext'] = {
    ...(authoringContext || {}),
    ...(projectId ? { projectId: String(projectId) } : {}),
    ...(organizationId ? { organizationId } : {}),
  };
  if (decisionContext && decisionContext.length > 0) {
    assembled._decisionContext = decisionContext;
  }
  if (rimContext) {
    assembled._rimContext = rimContext;
  }
  return assembled;
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Build the complete chat context from a request.
 * Used by both /chat and /stream endpoints.
 */
export async function buildChatContext(req: Request): Promise<ChatContext> {
  const {
    message,
    thread_id,
    intent_lens,
    user_role,
    project_context,
    document_context,
    submission_type,
    conversation_history,
    authoring_context,
    module_context,
  } = req.body;

  // Validate inputs
  const validatedLens: IntentLens | undefined =
    intent_lens && VALID_LENSES.includes(intent_lens) ? (intent_lens as IntentLens) : undefined;
  const validatedRole: UserRole | undefined =
    user_role && VALID_ROLES.includes(user_role) ? (user_role as UserRole) : undefined;

  // Resolve org/user context
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const userId = (req as any).userId || (req as any).user?.id || 'anonymous';
  const numericOrgId = orgId ? Number(orgId) : null;
  const projectId = resolveProjectIdFromBody(req.body);
  const normalizedAuthoringContext =
    authoring_context && typeof authoring_context === 'object'
      ? ({ ...authoring_context } as Record<string, unknown>)
      : undefined;

  // Infer role
  const effectiveRole: UserRole =
    validatedRole ||
    inferRole({
      screenName: req.body.context?.screenName,
      title: req.body.context?.userTitle,
      department: req.body.context?.department,
    });

  // Build authoring context
  const authoringContextBlock = buildAuthoringContextBlock(authoring_context);

  // Org/project intelligence does not depend on route prefetch. Attach its
  // failure handler immediately so an early rejection is always handled.
  const intelligencePrefixPromise = getIntelligencePrefix(numericOrgId ?? undefined, projectId).catch(() => '');

  // Private conversation memory and history share one caller-scoped access check.
  const accessibleThreadPromise = thread_id
    ? resolveAccessibleThread(thread_id, numericOrgId, userId).catch(() => null)
    : Promise.resolve(null);

  const prefetchedContext = await prefetchRouteIntelligenceContext({
    projectId,
    organizationId: numericOrgId,
    authoringContext: normalizedAuthoringContext,
    userId: typeof userId === 'number' ? userId : Number(userId) || null,
    targetAgency:
      typeof project_context?.targetAgency === 'string' ? project_context.targetAgency : null,
    sessionStart: !Array.isArray(conversation_history) || conversation_history.length === 0,
  });

  // Orchestrate
  const orchestratorInput: OrchestratorInput = {
    message,
    intentLens: validatedLens,
    userRole: effectiveRole,
    projectContext: project_context,
    documentContext: document_context,
    submissionType: submission_type
      ? (resolveToDeficiencyType(submission_type) as SubmissionType)
      : undefined,
    conversationHistory: conversation_history,
    authoringContext: prefetchedContext.orchestratorAuthoringContext,
    _feedbackContext: prefetchedContext.feedbackContext,
    _projectIntelligenceProfile: prefetchedContext.projectProfile,
    _relationalOverlay: prefetchedContext.relationalOverlay,
    _externalIntelBlock: prefetchedContext.externalIntelBlock,
    _deadlineRadarBlock: prefetchedContext.deadlineRadarBlock,
    _sessionBriefingBlock: prefetchedContext.sessionBriefingBlock,
    _contradictionWatchBlock: prefetchedContext.contradictionWatchBlock,
  };
  const orchestration = orchestrate(orchestratorInput);
  orchestration.systemPrompt += prefetchedContext.contextAvailabilityBlock ?? '';

  // Inject authoring context
  if (authoringContextBlock) {
    orchestration.systemPrompt += `\n\n## Current Authoring Context\n\nYou have access to the user's current authoring context. Use this to provide section-specific, artifact-aware responses.\n\n${authoringContextBlock}`;
  }

  // Inject section-specific ICH M4 guidance
  const sectionCode = authoring_context?.sectionCode || req.body.context?.sectionCode;
  if (sectionCode) {
    const sectionGuide = buildSectionSpecificPrompt(sectionCode);
    if (sectionGuide) {
      orchestration.systemPrompt += `\n\n${sectionGuide}`;
    }
  }

  // Intelligence prefix + memory + enrichment (parallel)
  const [intelligencePrefix, memoryResult, enrichment] = await Promise.all([
    intelligencePrefixPromise,
    accessibleThreadPromise.then(accessible => buildMemoryContextForChat({
      threadId: accessible?.id ?? '',
      organizationId: numericOrgId ?? undefined,
      projectId: projectId != null ? Number(projectId) : undefined,
      query: message,
      limitPerLayer: 4,
      maxChars: 3500,
    })).catch(() => ({ memoryBlock: '', atoms: [], diagnostics: null })),
    enrichContextForChat({
      message,
      projectId,
      organizationId: numericOrgId ?? undefined,
      submissionType: orchestration.detectedSubmissionType || undefined,
      userRole: effectiveRole,
    }).catch((): EnrichmentResult => ({ block: '', sources: [] })),
  ]);

  const effectiveMessage =
    ('rewrittenMessage' in enrichment && enrichment.rewrittenMessage) || message;

  // === Governed context enrichment (fabric state) ===
  let governedContextBlock = '';
  try {
    const { buildGovernedContextEnvelope } = await import('./governed-context-envelope.js');
    const governedEnvelope = await buildGovernedContextEnvelope({
      organizationId: String(numericOrgId ?? ''),
      projectId: String(projectId ?? ''),
      actorId: String(userId),
    });
    if (governedEnvelope.hasMeaningfulContext) {
      governedContextBlock = '\n\n' + governedEnvelope.promptBlock;
    }
  } catch {
    // Governed context unavailable — continue without
  }

  // === Account skill bundles, terms, templates, and regulatory context ===
  // Single canonical context loader. Resolves org-level execution bundles
  // scoped by submission type + project. Includes:
  //   - Prompt fragments (priority-sorted execution instructions)
  //   - Evidence preferences and citation style
  //   - Term dictionary (approved terms, do-not-use terms)
  //   - Template registry (section overrides, formatting rules)
  //   - Policy bindings (enforcement rules)
  //   - Authority response style
  // All loaded automatically by project type — no UI needed.
  let skillBundleBlock = '';
  if (numericOrgId) {
    try {
      const { resolveAccountContext, formatResolvedContextForPrompt } = await import(
        '../../services/account-canon.js'
      );
      const resolved = await resolveAccountContext({
        organizationId: numericOrgId,
        submissionType: orchestration.detectedSubmissionType || undefined,
        projectId: projectId ? Number(projectId) : undefined,
      });
      if (
        resolved &&
        (resolved.bundles?.length > 0 ||
          resolved.terms?.length > 0 ||
          resolved.templates?.length > 0)
      ) {
        skillBundleBlock = '\n\n' + formatResolvedContextForPrompt(resolved);
      }
    } catch {
      // Account context unavailable — continue without
    }
  }

  // ── MDX workstream block ──
  // When the user is in the medical-device workstream, append the MDX
  // context resolver's output: active surface knowledge, onboarding
  // milestone, proactive alerts (deadlines / blockers / stale sections),
  // relevant tools, governed-mutation contract reminder. Failures
  // degrade silently — AnA still gets every other block.
  let mdxContextBlock = '';
  if (
    module_context &&
    typeof module_context === 'object' &&
    (module_context as any).workstream === 'mdx' &&
    numericOrgId !== null &&
    pool
  ) {
    try {
      const result = await buildMdxContextBlock(pool, {
        organizationId: numericOrgId,
        activeNav:
          typeof (module_context as any).activeNav === 'string'
            ? (module_context as any).activeNav
            : undefined,
        activeProgramCode:
          typeof (module_context as any).activeProgramCode === 'string'
            ? (module_context as any).activeProgramCode
            : null,
      });
      mdxContextBlock = '\n\n' + result.systemPromptBlock;
    } catch {
      // fail-soft
    }
  }

  /* ── Active-surface block (EVERY surface) ──
     A surface publishes what it is showing through
     client/.../v2/surfaceContext.ts; V2App forwards it to useAnaChat, which
     sends it as `module_context` on every turn. Until now the only server-side
     reader was the MDX branch above, so every other surface published into a
     void — the client half of "AnA can see the screen she is on" shipped
     without a consumer.

     This is generic on purpose: one block for all surfaces rather than a
     second special case beside MDX. The payload is CLIENT-CONTROLLED and is
     entering a system prompt, so buildSurfaceContextBlock fences it, labels it
     as observed screen state rather than instruction, sanitises every string
     and bounds the whole thing — see that module's header. */
  const surfaceContextBlock = buildSurfaceContextBlock(module_context);

  const fullSystemPrompt =
    intelligencePrefix +
    orchestration.systemPrompt +
    governedContextBlock +
    skillBundleBlock +
    memoryResult.memoryBlock +
    enrichment.block +
    mdxContextBlock +
    surfaceContextBlock;

  // Build messages array
  const messages: GatewayMessage[] = [{ role: 'system', content: fullSystemPrompt }];

  // Load thread history (prefer server, fall back to client). The id is the
  // client's; it is resolved AS THE CALLER first — in this organization, to
  // this user's own thread — and a thread that does not resolve contributes
  // no history. Reading it unscoped put another user's transcript into the
  // model context on the strength of an id alone.
  let historyLoaded = false;
  if (thread_id) {
    try {
      const accessible = await accessibleThreadPromise;
      const serverHistory = accessible ? await getThreadMessages(accessible.id) : [];
      if (serverHistory.length > 0) {
        for (const msg of serverHistory.slice(-20)) {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }
        historyLoaded = true;
      }
    } catch {
      /* Fall through to client history */
    }
  }
  if (!historyLoaded && conversation_history && Array.isArray(conversation_history)) {
    for (const msg of conversation_history.slice(-20)) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  // Inject file context
  const fileIds = req.body.file_ids;
  if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    try {
      // SECURITY: this lookup previously had NO tenant filter at all — any
      // caller who supplied (or guessed) an upload id received that file's
      // name and MIME type regardless of which organization owned it. The
      // shared helper enforces both the organization column and the
      // storage-path prefix. See uploaded-file-access.ts.
      const { loadUploadedFileMetadata } = await import('../ana/uploaded-file-access.js');
      const attachedFiles = await loadUploadedFileMetadata(fileIds, numericOrgId);
      if (attachedFiles.length > 0) {
        const fileContext = attachedFiles
          .map(f => `- ${f.fileName} (${f.mimeType}) [ID: ${f.fileId}]`)
          .join('\n');
        messages.push({
          role: 'user' as const,
          content: `[The user has attached the following files:\n${fileContext}\nReference these files when relevant.]`,
        });
      }
    } catch (fileErr: any) {
      console.warn('[AnA chat-context] Attachment context failed:', fileErr?.message);
    }
  }

  // Add the actual user message
  messages.push({ role: 'user', content: effectiveMessage });

  return {
    messages,
    effectiveMessage,
    orchestration,
    orgId: numericOrgId,
    userId,
    effectiveRole,
    enrichmentSources: enrichment.sources,
    threadId: thread_id,
  };
}
