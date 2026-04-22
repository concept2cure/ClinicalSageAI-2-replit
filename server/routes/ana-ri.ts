/**
 * AnA RI Routes — Regulatory Intelligence Copilot API
 *
 * Endpoints for the AnA 1.0 RI intelligence layer:
 * - POST /api/ana-ri/chat — Main AnA RI chat with orchestrated intelligence
 * - GET  /api/ana-ri/deficiencies — Deficiency taxonomy queries
 * - GET  /api/ana-ri/actions — Available document actions
 * - GET  /api/ana-ri/rubric — Evaluation rubric
 * - POST /api/ana-ri/evaluate — Evaluate response quality
 *
 * @module server/routes/ana-ri
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db.ts';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayMessage } from '../services/ai-gateway/types.js';
import {
  orchestrate,
  type OrchestratorInput,
  type IntentLens,
  type UserRole,
} from '../services/ana-ri/orchestrator.js';
import {
  DEFICIENCY_TAXONOMY,
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  getDeficiencyCategories,
  type SubmissionType,
} from '../services/ana-ri/deficiency-taxonomy.js';
import { getAllActions, getActionsForLens } from '../services/ana-ri/document-actions.js';
import { evaluateResponse, getFullRubric } from '../services/ana-ri/evaluation.js';
import { inferRole } from '../services/ana-ri/role-adapter.js';
import {
  logGeneration,
  getGenerationLog,
  getGenerationStats,
  checkEvidenceDiscipline,
  validateResponseStructure,
} from '../services/ana-ri/enforcement.js';
import { validateEvidence } from '../services/ana-ri/evidence-validation.js';
import { buildQueueMeta } from '../services/ana-ri/response-contract.js';
import {
  getOrCreateThread,
  getThreadMessages,
  saveChatMessage as saveMessage,
} from '../services/chat-thread-helpers.js';
import { logKernelDecision } from '../services/kernel-decision-record.js';
import { planKernelExecution } from '../services/kernel-router.js';
import { buildGoalPlan, replanGoalPlan } from '../services/kernel-goal-planner.js';
import {
  createGoalPlanRun,
  getGoalPlanRun,
  advanceGoalPlanStep,
  executeNextGoalPlanStep,
  listGoalPlanEvents,
} from '../services/kernel-plan-runtime.js';
import {
  recordProtocolEvent,
  listProtocolEvents,
  validateProtocolEvent,
} from '../services/kernel-agent-protocol.js';
import { getKernelMetrics } from '../services/kernel-observability.js';
import { getKernelBetaReadiness } from '../services/kernel-beta-readiness.js';
import {
  buildKernelExecutionContext,
  recordKernelSuccess,
} from '../services/ana-kernel-orchestrator.js';
import { getKernelPolicyHint } from '../services/kernel-adaptive-policy.js';
import { buildMemoryContextForChat } from '../services/memory-context-assembler.js';
import {
  getIntelligencePrefix,
  buildSectionSpecificPrompt,
} from '../services/lumen-context-builder.js';
import { interceptChatResponse } from '../services/intelligence/rim-interceptors.js';
import { enrichContextForChat } from '../services/ana-ri/context-enrichment.js';
import { processResponseActions } from '../services/ana-guidance-executor.js';
import {
  processCommandsInResponse,
  type CommandContext,
} from '../services/ana-ri/command-executor.js';
import {
  buildAuthoringContextBlock,
  buildOrchestratorAuthoringContext,
  buildRouteContextBlock,
  prefetchRouteIntelligenceContext,
  resolveProjectIdFromBody,
} from '../services/ana-ri/chat-context-builder.js';
import {
  getFirecrawlQuotaStatus,
  recordSuccessfulFirecrawlScrape,
} from '../integrations/firecrawl/usage';
import {
  routeEvidenceRequest,
  persistEvidence,
  normalizeEvidence,
} from '../services/research-intelligence';
import { decisionLifecycleService } from '../services/decision-lifecycle-service.js';

const router = Router();

const dbPool = {
  query: (...args: Parameters<ReturnType<typeof getPool>['query']>) => getPool().query(...args),
};

function isDatabaseAvailable(): Promise<boolean> {
  try {
    const p = getPool();
    return p
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

// ── Response envelope helpers (matches concept2cure.ts contract) ──
const sendSuccess = <T>(res: Response, data: T, meta?: Record<string, unknown>) => {
  if (meta) return res.json({ success: true, data, meta });
  return res.json({ success: true, data });
};
const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: unknown,
  code?: string
) => res.status(status).json({ success: false, error: { message, code, details } });

// Idempotency cache: key -> { response, timestamp }
const idempotencyCache = new Map<string, { response: any; timestamp: number }>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup every 10 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of idempotencyCache.entries()) {
      if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
        idempotencyCache.delete(key);
      }
    }
  },
  10 * 60 * 1000
);

// AI Gateway instance
let gateway: ReturnType<typeof getGateway> | null = null;
function ensureGateway() {
  if (!gateway) {
    try {
      gateway = getGateway();
    } catch (e: any) {
      console.error('[AnA RI] AI Gateway initialization failed:', e?.message);
    }
  }
  return gateway;
}

// ─── Shared validation constants ─────────────────────────────────────────────
const VALID_LENSES = new Set<IntentLens>([
  'auto',
  'audit',
  'improve',
  'risk',
  'strategy',
  'compare',
]);
const VALID_ROLES = new Set<UserRole>([
  'ceo',
  'ra_lead',
  'medical_writer',
  'clinical_lead',
  'cmc_lead',
  'investor',
  'general',
]);

// ─── Request context extraction (typed, replaces (req as any) casts) ─────────
function extractRequestContext(req: Request) {
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId || null;
  const userId = (req as any).userId || (req as any).user?.id || 'anonymous';
  return {
    orgId: orgId ? Number(orgId) : null,
    userId: typeof userId === 'number' ? userId : 0,
    numericOrgId: orgId ? Number(orgId) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/chat — Main AnA RI Chat
// ─────────────────────────────────────────────────────────────────────────────

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      message,
      idempotency_key,
      thread_id,
      intent_lens,
      source_surface,
      user_role,
      project_context,
      document_context,
      submission_type,
      conversation_history,
      authoring_context,
      preferred_provider,
      useFirecrawl,
    } = req.body;

    const correlationId =
      String(req.headers['x-correlation-id'] || '').trim() ||
      `ana-ri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    res.setHeader('x-correlation-id', correlationId);

    // Check idempotency cache — return cached response on client retry
    if (idempotency_key && typeof idempotency_key === 'string') {
      const cached = idempotencyCache.get(idempotency_key);
      if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
        return sendSuccess(res, { ...cached.response, _cached: true });
      }
    }

    if (!message || typeof message !== 'string') {
      return sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE');
    }

    // Validate intent_lens if provided
    const validatedLens: IntentLens | undefined =
      intent_lens && VALID_LENSES.has(intent_lens as IntentLens)
        ? (intent_lens as IntentLens)
        : undefined;

    // Validate user_role if provided
    const validatedRole: UserRole | undefined =
      user_role && VALID_ROLES.has(user_role as UserRole) ? (user_role as UserRole) : undefined;

    // Resolve org/user context
    const { orgId, userId } = extractRequestContext(req);

    // Infer role if not provided
    const effectiveRole: UserRole =
      validatedRole ||
      inferRole({
        screenName: req.body.context?.screenName,
        title: req.body.context?.userTitle,
        department: req.body.context?.department,
      });

    // Shared builder parity: keep authoring-context serialization identical across chat/stream.
    const authoringContextBlock = buildAuthoringContextBlock(authoring_context);

    // Optional governed external evidence pre-routing (AnA-owned orchestration)
    const evidenceUsage: any = {
      firecrawlRequested: Boolean(useFirecrawl),
      firecrawlUsed: false,
      quotaConsumed: 0,
      quotaRemaining: 0,
      evidenceDocumentIds: [],
      sourcesSummary: [],
    };
    if (useFirecrawl && orgId) {
      const quota = await getFirecrawlQuotaStatus(Number(orgId));
      if (!quota.allowed) {
        return sendError(
          res,
          429,
          'Workspace daily Firecrawl allowance is exhausted',
          { quota },
          'quota_exhausted'
        );
      }
      evidenceUsage.quotaConsumed = 0;
      evidenceUsage.quotaRemaining = quota.remaining;
      const route = await routeEvidenceRequest(message, true).catch(() => null);
      evidenceUsage.firecrawlUsed = route?.route === 'fallback_firecrawl';
      evidenceUsage.sourcesSummary = [
        route?.route || 'no_external_needed',
        route?.decision?.reason || 'no decision rationale available',
      ];

      const docs = route?.data?.scrapedDocuments;
      if (Array.isArray(docs) && docs.length > 0) {
        const persistedIds: number[] = [];
        for (const doc of docs) {
          let id: number | null = null;
          try {
            const normalized = normalizeEvidence({
              provider: 'firecrawl',
              url: doc.url,
              title: doc.title,
              markdown: doc.markdown,
              html: doc.html,
              metadata: doc.metadata,
            });
            id = await persistEvidence({
              tenantId: Number(orgId),
              conversationId: thread_id || undefined,
              sourceProvider: 'firecrawl',
              acquisitionMethod: 'search+scrape',
              url: normalized.url,
              title: normalized.title,
              rawMarkdown: normalized.payload?.markdown,
              rawHtml: normalized.payload?.html,
              metadata: {
                route: route.route,
                source: 'ana-ri-chat',
                taxonomy: 'external_evidence_mode',
                domain: normalized.domain,
                canonicalUrl: normalized.canonicalUrl,
                normalizedAt: normalized.normalizedAt,
                regulatorySignals: normalized.regulatorySignals,
              },
            }).catch(() => null);
          } catch (normalizationError: any) {
            console.warn('[AnA RI] normalization_failed', normalizationError?.message);
          }
          if (id) persistedIds.push(id);
        }

        if (persistedIds.length > 0) {
          evidenceUsage.evidenceDocumentIds = persistedIds;
        }
        const units = Number(route?.data?.quotaUnitsToCharge || docs.length || 0);
        if (units > 0) {
          await recordSuccessfulFirecrawlScrape(Number(orgId), units).catch(() => {});
          const updatedQuota = await getFirecrawlQuotaStatus(Number(orgId)).catch(() => null);
          if (updatedQuota) {
            evidenceUsage.quotaConsumed = units;
            evidenceUsage.quotaRemaining = updatedQuota.remaining;
          }
        }
      }
    }

    const chatProjectId = resolveProjectIdFromBody(req.body);
    const chatAuthoringContext =
      authoring_context && typeof authoring_context === 'object'
        ? ({ ...authoring_context } as Record<string, unknown>)
        : undefined;

    const prefetchedChatContext = await prefetchRouteIntelligenceContext({
      projectId: chatProjectId,
      organizationId: orgId,
      authoringContext: chatAuthoringContext,
    });
    const chatDecisionContext = prefetchedChatContext.decisionContext;
    const chatFeedbackContext = prefetchedChatContext.feedbackContext;
    const chatProjectProfile = prefetchedChatContext.projectProfile;
    const chatRimContext = prefetchedChatContext.rimContext;
    const orchestratorAuthoringContext = buildOrchestratorAuthoringContext({
      authoringContext: chatAuthoringContext,
      projectId: chatProjectId,
      organizationId: orgId,
      decisionContext: chatDecisionContext,
      rimContext: chatRimContext,
    });

    // Orchestrate — build the complete system prompt
    const orchestratorInput: OrchestratorInput = {
      message,
      intentLens: validatedLens,
      userRole: effectiveRole,
      projectContext: project_context,
      documentContext: document_context,
      submissionType: submission_type as SubmissionType | undefined,
      conversationHistory: conversation_history,
      authoringContext: orchestratorAuthoringContext,
      _feedbackContext: chatFeedbackContext,
      _projectIntelligenceProfile: chatProjectProfile,
    };

    const orchestration = orchestrate(orchestratorInput);
    const executionCtx = await buildKernelExecutionContext({
      route: '/api/ana-ri/chat',
      message,
      organizationId: orgId ? Number(orgId) : null,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      requestedMaxTokens: 4096,
    });
    const routingPlan = executionCtx.routingPlan;
    const selectedStrategy = executionCtx.selectedStrategy;
    let goalPlan = executionCtx.goalPlan;

    // Inject UI route context so AnA knows which screen/project the user is on
    // even when no specific artifact is attached (Home, list views, etc.).
    const chatRouteBlock = buildRouteContextBlock(req.body.context);
    if (chatRouteBlock) {
      orchestration.systemPrompt += `\n\n## Current UI Route\n\nThis is where the user is right now in the app. Use it to resolve "this project", "here", "this screen":\n\n${chatRouteBlock}`;
    }

    // Inject authoring context into system prompt if available
    if (authoringContextBlock) {
      orchestration.systemPrompt += `\n\n## Current Authoring Context\n\nYou have access to the user's current authoring context. Use this to provide section-specific, artifact-aware responses. When the user asks about "this section", "this document", "what's blocking", or similar, reference this context:\n\n${authoringContextBlock}`;
    }

    // Inject section-specific ICH M4 guidance when drafting a CTD section
    const chatSectionCode = authoring_context?.sectionCode || req.body.context?.sectionCode;
    if (chatSectionCode) {
      const chatSectionGuide = buildSectionSpecificPrompt(chatSectionCode);
      if (chatSectionGuide) {
        orchestration.systemPrompt += `\n\n${chatSectionGuide}`;
      }
    }

    // Intelligence + memory + enrichment — run in PARALLEL for speed
    const [chatIntelligencePrefix, chatMemoryResult, chatEnrichment] = await Promise.all([
      getIntelligencePrefix(orgId ? Number(orgId) : undefined, chatProjectId).catch(err => {
        console.warn('[AnA RI] Intelligence prefix failed:', err?.message);
        return '';
      }),
      buildMemoryContextForChat({
        threadId: thread_id || undefined,
        organizationId: orgId ? Number(orgId) : undefined,
        projectId: chatProjectId || undefined,
        query: message,
        limitPerLayer: 4,
        maxChars: 3500,
      }).catch(err => {
        console.warn('[AnA RI] Memory context failed:', err?.message);
        return { memoryBlock: '', atoms: [], diagnostics: null };
      }),
      enrichContextForChat({
        message,
        projectId: chatProjectId,
        organizationId: orgId ? Number(orgId) : undefined,
        submissionType: orchestration.detectedSubmissionType || undefined,
      }).catch(err => {
        console.warn('[AnA RI] Context enrichment failed:', err?.message);
        return { block: '', sources: [] as string[] };
      }),
    ]);

    // Split into stable prefix (cached) + volatile suffix (per-turn) so the
    // Claude API can reuse the prefix across turns on the same screen/project.
    // Stable = intelligence + orchestration (incl route/authoring/section guide).
    // Volatile = memory (query-dependent) + enrichment (message-dependent).
    const chatStablePrefix = chatIntelligencePrefix + orchestration.systemPrompt;
    const chatVolatileSuffix = chatMemoryResult.memoryBlock + chatEnrichment.block;

    // Build message history — prefer server thread history, fall back to client
    const messages: GatewayMessage[] = [
      { role: 'system', content: chatStablePrefix, cacheControl: true },
    ];
    if (chatVolatileSuffix && chatVolatileSuffix.trim().length > 0) {
      messages.push({ role: 'system', content: chatVolatileSuffix });
    }

    let historyLoaded = false;
    if (thread_id) {
      try {
        const serverHistory = await getThreadMessages(thread_id);
        if (serverHistory.length > 0) {
          for (const msg of serverHistory.slice(-20)) {
            messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
          historyLoaded = true;
        }
      } catch {
        /* fall through to client history */
      }
    }
    if (!historyLoaded && conversation_history && Array.isArray(conversation_history)) {
      const MAX_HISTORY_MSGS = 20;
      const MAX_MSG_LENGTH = 50000;
      for (const msg of conversation_history.slice(-MAX_HISTORY_MSGS)) {
        if (!msg.role || !['user', 'assistant'].includes(msg.role)) continue;
        if (typeof msg.content !== 'string' || msg.content.length > MAX_MSG_LENGTH) continue;
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    // Place a cache breakpoint on the last assistant message in history so
    // conversational turns reuse the whole prefix (system + all prior turns).
    // Each new turn extends the cached prefix by one user/assistant pair.
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        messages[i].cacheControl = true;
        break;
      }
    }

    // Inject file context if file_ids provided
    const fileIds = req.body.file_ids;
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      try {
        const fileResult = await dbPool.query(
          `SELECT id, original_name, mime_type FROM file_uploads WHERE id = ANY($1) AND organization_id = $2`,
          [fileIds, orgId ? Number(orgId) : 0]
        );
        if (fileResult.rows.length > 0) {
          const fileContext = fileResult.rows
            .map((f: any) => `- ${f.original_name} (${f.mime_type}) [ID: ${f.id}]`)
            .join('\n');
          messages.push({
            role: 'user' as const,
            content: `[The user has attached the following files to this message:\n${fileContext}\nReference these files in your response when relevant.]`,
          });
        }
      } catch {
        /* non-blocking */
      }
    }

    // Add current message (use rewritten version if slash command or @app mention detected)
    const chatEffectiveMessage = chatEnrichment.rewrittenMessage || message;
    messages.push({ role: 'user', content: chatEffectiveMessage });

    // Call AI Gateway
    const gw = ensureGateway();
    if (!gw) {
      return sendError(res, 503, 'AI services unavailable', null, 'GATEWAY_UNAVAILABLE');
    }

    // Validate preferred_provider if provided
    const VALID_PROVIDERS = ['anthropic', 'openai', 'moonshot'] as const;
    const validatedProvider =
      preferred_provider && VALID_PROVIDERS.includes(preferred_provider)
        ? (preferred_provider as (typeof VALID_PROVIDERS)[number])
        : undefined;

    const response = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
      promptCache: { enabled: true, type: 'ephemeral' },
      ...(validatedProvider ? { provider: validatedProvider } : {}),
    });

    if (!response.content) {
      return sendError(res, 502, 'No response from AI provider', null, 'EMPTY_RESPONSE');
    }

    // Evaluate response quality (async, non-blocking)
    const evaluation = evaluateResponse(response.content, {
      userRole: effectiveRole,
      intentLens: orchestration.detectedIntent.lens,
      hasStructuredOutput: /##|###/.test(response.content),
      hasDocumentActions: /create|generate|memo|brief/i.test(response.content),
      hasEvidenceLabels: /KNOWN|INFERRED|MISSING/i.test(response.content),
      hasRiskRanking: /critical|major|minor|severity/i.test(response.content),
      hasCitations: /ICH|CFR|FDA|EMA|ISO/i.test(response.content),
      hasRewrite: /rewrite|revised|improved version/i.test(response.content),
    });

    // Persist message and response if we have org context
    let resolvedThreadId = thread_id;
    let persistenceFailed = false;
    if (orgId) {
      try {
        // getOrCreateThread(resolvedThreadId, userId?, prefix?) — returns thread ID string
        resolvedThreadId = await getOrCreateThread(
          thread_id || null,
          typeof userId === 'number' ? userId : undefined,
          'ana-ri'
        );
        await saveMessage(resolvedThreadId, 'user', message);
      } catch (e: any) {
        console.error('[AnA RI] Thread persistence failed:', e?.message);
        persistenceFailed = true;
      }
    }

    // Check evidence discipline and structure
    const evidenceCheck = checkEvidenceDiscipline(response.content);
    const structureCheck = validateResponseStructure(response.content);
    if (!evidenceCheck.compliant) {
      goalPlan = replanGoalPlan(goalPlan, 'evidence_failure');
    } else if (!structureCheck.valid) {
      goalPlan = replanGoalPlan(goalPlan, 'structure_failure');
    }

    // Log generation event for observability
    logGeneration({
      timestamp: new Date().toISOString(),
      route: '/api/ana-ri/chat',
      action: 'chat',
      projectId: req.body.project_context?.projectId,
      organizationId: orgId ? Number(orgId) : undefined,
      userId,
      artifactCreated: false,
      anaRiOrchestrated: true,
      evidenceCompliant: evidenceCheck.compliant,
      structureScore: structureCheck.score,
      provider: response.provider,
      model: response.model,
    });

    // Unified kernel success recording (KDR + adaptive-policy outcome)
    recordKernelSuccess({
      route: '/api/ana-ri/chat',
      threadId: resolvedThreadId || null,
      projectId: req.body.project_context?.projectId
        ? Number(req.body.project_context.projectId)
        : null,
      organizationId: orgId ? Number(orgId) : null,
      userId,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      routingPlan,
      selectedStrategy,
      provider: response.provider,
      model: response.model,
      latencyMs: response.latencyMs ?? null,
      estimatedCostUsd: response.usage?.estimatedCostUsd ?? null,
      qualityScore: evaluation.overallScore / Math.max(evaluation.maxOverallScore, 1),
      metadata: {
        intent: orchestration.detectedIntent.lens,
        submissionType: orchestration.detectedSubmissionType,
        evidenceCompliant: evidenceCheck.compliant,
      },
    }).catch(() => {});

    // Guidance executor — auto-create artifacts if response contains action signals
    // (Parity with /stream — previously only ran on stream path)
    let executedActions: any[] = [];
    const chatProjectIdForActions = chatProjectId;
    let postGuidanceResponseContent = response.content;
    if (response.content && chatProjectIdForActions && orgId) {
      try {
        const guidance = await processResponseActions(response.content, {
          projectId:
            typeof chatProjectIdForActions === 'string'
              ? Number.parseInt(chatProjectIdForActions, 10)
              : chatProjectIdForActions,
          organizationId: Number(orgId),
          userId: typeof userId === 'number' ? userId : 0,
          userName: 'AnA',
          threadId: resolvedThreadId || undefined,
        });
        executedActions = guidance.actions;
        postGuidanceResponseContent = guidance.cleanedText || response.content;
      } catch (e: any) {
        console.warn('[AnA RI Chat] Guidance executor failed:', e?.message);
      }
    }

    // Command executor — execute operational commands (create project, artifact, task, etc.)
    // (Parity with /stream — previously only ran on stream path)
    let executedCommands: any[] = [];
    let cleanedResponseContent = postGuidanceResponseContent;
    if (postGuidanceResponseContent && orgId) {
      try {
        const cmdCtx: CommandContext = {
          userId: typeof userId === 'number' ? userId : 0,
          organizationId: Number(orgId),
          activeProjectId: chatProjectIdForActions
            ? typeof chatProjectIdForActions === 'string'
              ? Number.parseInt(chatProjectIdForActions, 10)
              : chatProjectIdForActions
            : undefined,
          userName: (req as any).user?.name,
          userRole: effectiveRole,
        };
        const cmdResult = await processCommandsInResponse(postGuidanceResponseContent, cmdCtx);
        executedCommands = cmdResult.executedCommands;
        cleanedResponseContent = cmdResult.cleanedText
          ? cmdResult.cleanedText
          : postGuidanceResponseContent;
        if (executedCommands.length > 0) {
          console.log(`[AnA RI Chat] Executed ${executedCommands.length} command(s)`);
        }
      } catch (e: any) {
        console.warn('[AnA RI Chat] Command executor failed:', e?.message);
      }
    }

    const finalAssistantContent =
      cleanedResponseContent && cleanedResponseContent.trim().length > 0
        ? cleanedResponseContent
        : executedActions.length > 0 || executedCommands.length > 0
          ? 'Action executed successfully.'
          : response.content;

    // RIM interception — capture intelligence signals (non-blocking) using cleaned content
    const projectIdForRim = chatProjectId;
    if (finalAssistantContent && projectIdForRim) {
      interceptChatResponse({
        organizationId: orgId ? Number(orgId) : 0,
        projectId: projectIdForRim ? Number(projectIdForRim) : 0,
        userId: typeof userId === 'number' ? userId : undefined,
        assistantMessage: finalAssistantContent,
        claimCount: 0,
        supportedClaimRate: 0.5,
        model: response.model || 'unknown',
        provider: response.provider || 'unknown',
      }).catch(() => {});
    }

    // Evidence validation — semantic grounding check (beyond regex-based enforcement)
    const evidenceVerdict = validateEvidence(finalAssistantContent, 'ana-ri');

    // Persist assistant response after guidance/command cleanup so thread history
    // matches what users actually saw in chat.
    if (orgId && resolvedThreadId && response.content) {
      try {
        await saveMessage(resolvedThreadId, 'assistant', finalAssistantContent);
      } catch (e: any) {
        console.error('[AnA RI] Assistant persist failed:', e?.message);
        persistenceFailed = true;
      }
    }

    // Build queue metadata
    const queueMeta = buildQueueMeta({
      threadId: resolvedThreadId,
      persistenceFailed,
    });

    const responsePayload = {
      response: finalAssistantContent,
      thread_id: resolvedThreadId,
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
        appliedRole: orchestration.appliedRole,
        activeWorkstream: orchestration.activeWorkstream,
        workstreamHandoff: orchestration.workstreamHandoff,
        suggestedActions: orchestration.suggestedActions,
        meta: orchestration.orchestrationMeta,
        goalPlan,
      },
      evaluation: {
        grade: evaluation.grade,
        overallScore: evaluation.overallScore,
        maxScore: evaluation.maxOverallScore,
      },
      evidence: {
        compliant: evidenceCheck.compliant,
        labels: evidenceCheck.totalLabels,
        verdict: evidenceVerdict,
      },
      structure: {
        valid: structureCheck.valid,
        score: structureCheck.score,
        maxScore: structureCheck.maxScore,
      },
      provider: response.provider,
      model: response.model,
      usage: response.usage,
      persistenceFailed,
      executedActions: executedActions.length > 0 ? executedActions : undefined,
      executedCommands: executedCommands.length > 0 ? executedCommands : undefined,
      memory: {
        atomCount: chatMemoryResult.atoms?.length || 0,
        diagnostics: chatMemoryResult.diagnostics || null,
        available: Boolean(chatMemoryResult.memoryBlock),
      },
      queueMeta,
      enrichmentSources: chatEnrichment.sources?.length > 0 ? chatEnrichment.sources : undefined,
      enrichmentMeta: chatEnrichment.enrichmentMeta || undefined,
      _meta: {
        ...(correlationId && { correlationId }),
        ...(source_surface ? { sourceSurface: source_surface } : {}),
        ...(persistenceFailed && { persistenceWarning: 'Messages may not have been saved' }),
      },
      evidenceUsage,
    };

    // Cache response for idempotency on client retry
    if (idempotency_key && typeof idempotency_key === 'string') {
      idempotencyCache.set(idempotency_key, { response: responsePayload, timestamp: Date.now() });
    }

    return sendSuccess(res, responsePayload);
  } catch (error: any) {
    console.error('[AnA RI] Chat error:', error);
    logKernelDecision({
      requestId: `ana-ri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      route: '/api/ana-ri/chat',
      orchestratorName: 'kernel-router-v1',
      selectedTaskType: 'regulatory_review',
      routingStrategy: 'quality_optimized',
      selectedTools: [],
      outcome: 'failed',
      errorMessage: error?.message || 'unknown error',
      decisionRationale: 'AnA RI route failed before completion.',
    }).catch(() => {});
    return sendError(res, 500, error?.message || 'Internal server error', null, 'INTERNAL_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/stream — SSE streaming chat (Claude-like real-time tokens)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/stream', async (req: Request, res: Response) => {
  try {
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
      project_id,
    } = req.body;

    if (!message || typeof message !== 'string') {
      return sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE');
    }

    const gw = ensureGateway();
    const deterministicMode = gw?.isDeterministicMode?.() || false;
    if (!gw || (!deterministicMode && gw.getEnabledProviders().length === 0)) {
      return sendError(res, 503, 'No AI providers available.', null, 'GATEWAY_UNAVAILABLE');
    }

    // Pre-stream validation is done. Open SSE now so the client sees progress
    // during context assembly (orchestration + intelligence/memory/enrichment).
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Status: orchestrating (planning the response, running route prefetch)
    res.write(
      `data: ${JSON.stringify({
        type: 'status',
        phase: 'orchestrating',
        message: 'Planning response…',
      })}\n\n`
    );

    // Resolve context
    const { orgId, userId } = extractRequestContext(req);

    const validatedLens: IntentLens | undefined =
      intent_lens && VALID_LENSES.has(intent_lens as IntentLens)
        ? (intent_lens as IntentLens)
        : undefined;

    const validatedRole: UserRole | undefined =
      user_role && VALID_ROLES.has(user_role as UserRole) ? (user_role as UserRole) : undefined;

    const effectiveRole: UserRole =
      validatedRole ||
      inferRole({
        screenName: req.body.context?.screenName,
        title: req.body.context?.userTitle,
        department: req.body.context?.department,
      });

    // Shared builder parity: keep authoring-context serialization identical across chat/stream.
    const authoringContextBlock = buildAuthoringContextBlock(authoring_context);

    const streamProjectId = project_id || resolveProjectIdFromBody(req.body);
    const streamAuthoringContext =
      authoring_context && typeof authoring_context === 'object'
        ? ({ ...authoring_context } as Record<string, unknown>)
        : undefined;

    const prefetchedStreamContext = await prefetchRouteIntelligenceContext({
      projectId: streamProjectId,
      organizationId: orgId,
      authoringContext: streamAuthoringContext,
    });
    const streamDecisionContext = prefetchedStreamContext.decisionContext;
    const streamFeedbackContext = prefetchedStreamContext.feedbackContext;
    const streamProjectProfile = prefetchedStreamContext.projectProfile;
    const streamRimContext = prefetchedStreamContext.rimContext;
    const streamOrchestratorAuthoringContext = buildOrchestratorAuthoringContext({
      authoringContext: streamAuthoringContext,
      projectId: streamProjectId,
      organizationId: orgId,
      decisionContext: streamDecisionContext,
      rimContext: streamRimContext,
    });

    // Orchestrate
    const orchestration = orchestrate({
      message,
      intentLens: validatedLens,
      userRole: effectiveRole,
      projectContext: project_context,
      documentContext: document_context,
      submissionType: submission_type as SubmissionType | undefined,
      conversationHistory: conversation_history,
      authoringContext: streamOrchestratorAuthoringContext,
      _feedbackContext: streamFeedbackContext,
      _projectIntelligenceProfile: streamProjectProfile,
    });

    const streamRouteBlock = buildRouteContextBlock(req.body.context);
    if (streamRouteBlock) {
      orchestration.systemPrompt += `\n\n## Current UI Route\n${streamRouteBlock}`;
    }

    if (authoringContextBlock) {
      orchestration.systemPrompt += `\n\n## Current Authoring Context\n${authoringContextBlock}`;
    }

    // Inject section-specific ICH M4 guidance when drafting a CTD section
    const sectionCode = authoring_context?.sectionCode || req.body.context?.sectionCode;
    if (sectionCode) {
      const sectionGuide = buildSectionSpecificPrompt(sectionCode);
      if (sectionGuide) {
        orchestration.systemPrompt += `\n\n${sectionGuide}`;
      }
    }

    // Status: loading_context (about to fetch intelligence prefix, memory atoms, enrichment)
    res.write(
      `data: ${JSON.stringify({
        type: 'status',
        phase: 'loading_context',
        message: 'Loading project memory…',
      })}\n\n`
    );

    // Intelligence + memory + enrichment — run in PARALLEL for speed
    const [intelligencePrefix, memoryResult, enrichment] = await Promise.all([
      getIntelligencePrefix(orgId ? Number(orgId) : undefined, streamProjectId).catch(err => {
        console.warn('[AnA RI] Intelligence prefix failed:', err?.message);
        return '';
      }),
      buildMemoryContextForChat({
        threadId: thread_id || undefined,
        organizationId: orgId ? Number(orgId) : undefined,
        projectId: streamProjectId || undefined,
        query: message,
        limitPerLayer: 4,
        maxChars: 3500,
      }).catch(err => {
        console.warn('[AnA RI] Memory context failed:', err?.message);
        return { memoryBlock: '', atoms: [], diagnostics: null };
      }),
      enrichContextForChat({
        message,
        projectId: streamProjectId,
        organizationId: orgId ? Number(orgId) : undefined,
        submissionType: orchestration.detectedSubmissionType || undefined,
      }).catch(err => {
        console.warn('[AnA RI] Context enrichment failed:', err?.message);
        return { block: '', sources: [] as string[] };
      }),
    ]);

    const memoryBlock = memoryResult.memoryBlock;

    if (enrichment.sources.length > 0) {
      console.log(`[AnA RI Stream] Context enriched with: ${enrichment.sources.join(', ')}`);
    }

    // Use rewritten message if slash command or @app mention was detected
    const effectiveMessage = enrichment.rewrittenMessage || message;

    // Split into stable prefix (cached) + volatile suffix (per-turn) — see /chat
    // handler for rationale. The Claude gateway marks the stable block with
    // cache_control so subsequent turns on the same screen/project hit cache.
    const streamStablePrefix = intelligencePrefix + orchestration.systemPrompt;
    const streamVolatileSuffix = memoryBlock + enrichment.block;

    // Thread resolution (before message building so we can load server history)
    let threadId = thread_id;
    let persistenceFailed = false;
    if (orgId) {
      try {
        threadId = await getOrCreateThread(
          thread_id || null,
          typeof userId === 'number' ? userId : undefined,
          'ana-ri'
        );
        await saveMessage(threadId, 'user', message);
      } catch (e: any) {
        console.error('[AnA RI Stream] Thread persistence failed:', e?.message);
        persistenceFailed = true;
      }
    }

    // Build messages — prefer server thread history, fall back to client
    const messages: GatewayMessage[] = [
      { role: 'system', content: streamStablePrefix, cacheControl: true },
    ];
    if (streamVolatileSuffix && streamVolatileSuffix.trim().length > 0) {
      messages.push({ role: 'system', content: streamVolatileSuffix });
    }

    let streamHistoryLoaded = false;
    if (threadId) {
      try {
        const serverHistory = await getThreadMessages(threadId);
        // Exclude the message we just saved (it's the current user message)
        const previousMsgs = serverHistory.slice(0, -1);
        if (previousMsgs.length > 0) {
          for (const msg of previousMsgs.slice(-20)) {
            messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
          streamHistoryLoaded = true;
        }
      } catch {
        /* fall through to client history */
      }
    }
    if (!streamHistoryLoaded && conversation_history && Array.isArray(conversation_history)) {
      const MAX_HISTORY_MSGS = 20;
      const MAX_MSG_LENGTH = 50000;
      for (const msg of conversation_history.slice(-MAX_HISTORY_MSGS)) {
        if (!msg.role || !['user', 'assistant'].includes(msg.role)) continue;
        if (typeof msg.content !== 'string' || msg.content.length > MAX_MSG_LENGTH) continue;
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    // Place a cache breakpoint on the last assistant message in history so
    // conversational turns reuse the whole prefix (system + all prior turns).
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        messages[i].cacheControl = true;
        break;
      }
    }

    // Inject file context if file_ids provided
    const streamFileIds = req.body.file_ids;
    if (streamFileIds && Array.isArray(streamFileIds) && streamFileIds.length > 0) {
      try {
        const fileResult = await dbPool.query(
          `SELECT id, original_name, mime_type FROM file_uploads WHERE id = ANY($1) AND organization_id = $2`,
          [streamFileIds, orgId ? Number(orgId) : 0]
        );
        if (fileResult.rows.length > 0) {
          const fileContext = fileResult.rows
            .map((f: any) => `- ${f.original_name} (${f.mime_type}) [ID: ${f.id}]`)
            .join('\n');
          messages.push({
            role: 'user' as const,
            content: `[The user has attached the following files:\n${fileContext}\nReference these files in your response when relevant.]`,
          });
        }
      } catch {
        /* non-blocking */
      }
    }

    messages.push({ role: 'user', content: effectiveMessage });

    // Status: generating (context is built, about to stream tokens from the model)
    res.write(
      `data: ${JSON.stringify({
        type: 'status',
        phase: 'generating',
        message: 'Generating response…',
      })}\n\n`
    );

    // Send thread_id so client can track (headers were written before context assembly)
    res.write(`data: ${JSON.stringify({ type: 'thread_id', thread_id: threadId })}\n\n`);

    // Send orchestration metadata
    res.write(
      `data: ${JSON.stringify({
        type: 'orchestration',
        orchestration: {
          detectedIntent: orchestration.detectedIntent,
          detectedSubmissionType: orchestration.detectedSubmissionType,
          appliedRole: orchestration.appliedRole,
          activeWorkstream: orchestration.activeWorkstream,
          workstreamHandoff: orchestration.workstreamHandoff,
          suggestedActions: orchestration.suggestedActions,
        },
      })}\n\n`
    );

    // Routing plan
    const routingPlan = planKernelExecution({
      route: '/api/ana-ri/stream',
      messageLength: message.length,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      requestedMaxTokens: 4096,
    });

    const policyHint = await getKernelPolicyHint({
      organizationId: orgId ? Number(orgId) : null,
      route: '/api/ana-ri/stream',
      taskType: routingPlan.taskType,
    });
    const selectedStrategy = policyHint?.preferredStrategy || routingPlan.strategy;

    let fullContent = '';
    let cleanedFullContent = '';

    // Stream via gateway
    const gwResponse = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
      promptCache: { enabled: true, type: 'ephemeral' },
      stream: true,
      onStream: (chunk: string, metadata?: any) => {
        fullContent += chunk;
        res.write(
          `data: ${JSON.stringify({
            type: metadata?.type || 'text',
            content: chunk,
          })}\n\n`
        );
      },
      callerModule: 'ana-ri-stream',
    });

    // RIM interception — capture intelligence signals (non-blocking)
    if (fullContent && streamProjectId) {
      interceptChatResponse({
        organizationId: orgId ? Number(orgId) : 0,
        projectId: streamProjectId ? Number(streamProjectId) : 0,
        userId: typeof userId === 'number' ? userId : undefined,
        assistantMessage: fullContent,
        claimCount: 0,
        supportedClaimRate: 0.5,
        model: gwResponse.model || 'unknown',
        provider: gwResponse.provider || 'unknown',
      }).catch(() => {});
    }

    // Emit `done` as soon as the last token is out. Carries the minimal
    // metadata the client needs to close the assistant turn. Heavier
    // post-processing (guidance + command executors, persistence, evidence,
    // grounding strip) runs in the background and arrives later via `post_done`.
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        model: gwResponse.model,
        provider: gwResponse.provider,
        usage: gwResponse.usage,
        latencyMs: gwResponse.latencyMs,
        response: fullContent || undefined,
      })}\n\n`
    );

    // Background post-processing. We intentionally do NOT await this at the
    // top level — the client already has `done`. When the executors finish
    // (or fail) we emit `post_done` with cleanedResponse + executed actions/
    // commands + evidence, then close the stream.
    (async () => {
      let executedActions: any[] = [];
      let contentForCommandProcessing = fullContent;
      let executedCommands: any[] = [];

      // Guidance executor — auto-create artifacts if response contains action signals
      if (fullContent && streamProjectId && orgId) {
        try {
          const guidance = await processResponseActions(fullContent, {
            projectId:
              typeof streamProjectId === 'string'
                ? Number.parseInt(streamProjectId, 10)
                : streamProjectId,
            organizationId: Number(orgId),
            userId: typeof userId === 'number' ? userId : 0,
            userName: 'AnA',
            threadId: threadId || undefined,
          });
          executedActions = guidance.actions;
          contentForCommandProcessing = guidance.cleanedText || fullContent;
        } catch (e: any) {
          console.warn('[AnA RI Stream] Guidance executor failed:', e?.message);
        }
      }

      // Command executor — execute operational commands (create project, artifact, task, etc.)
      if (contentForCommandProcessing && orgId) {
        try {
          const cmdCtx: CommandContext = {
            userId: typeof userId === 'number' ? userId : 0,
            organizationId: Number(orgId),
            activeProjectId: streamProjectId
              ? typeof streamProjectId === 'string'
                ? Number.parseInt(streamProjectId, 10)
                : streamProjectId
              : undefined,
            userName: (req as any).user?.name,
            userRole: effectiveRole,
          };
          const { processCommandsInResponse } =
            await import('../services/ana-ri/command-executor.js');
          const cmdResult = await processCommandsInResponse(contentForCommandProcessing, cmdCtx);
          executedCommands = cmdResult.executedCommands;
          cleanedFullContent = cmdResult.cleanedText ? cmdResult.cleanedText : contentForCommandProcessing;
          if (executedCommands.length > 0) {
            console.log(`[AnA RI Stream] Executed ${executedCommands.length} command(s)`);
          }
        } catch (e: any) {
          console.warn('[AnA RI Stream] Command executor failed:', e?.message);
        }
      }

      const finalAssistantContent =
        cleanedFullContent && cleanedFullContent.trim().length > 0
          ? cleanedFullContent
          : executedActions.length > 0 || executedCommands.length > 0
            ? 'Action executed successfully.'
            : contentForCommandProcessing || fullContent;

      // Persist assistant response using cleaned text when command blocks were present.
      // This happens inside the background flow so persistence waits on executors
      // (so we store the cleaned text) but does not block the `done` event.
      if (orgId && threadId && fullContent) {
        try {
          await saveMessage(threadId, 'assistant', finalAssistantContent);
        } catch (e: any) {
          console.error('[AnA RI Stream] Assistant persist failed:', e?.message);
          persistenceFailed = true;
        }
      }

      // Warn client if thread persistence failed
      if (persistenceFailed) {
        res.write(
          `data: ${JSON.stringify({ type: 'warning', message: 'Thread persistence failed' })}\n\n`
        );
      }

      // Evidence discipline + structure checks (parity with /chat)
      const streamEvidenceCheck = finalAssistantContent ? checkEvidenceDiscipline(finalAssistantContent) : null;
      const streamStructureCheck = finalAssistantContent ? validateResponseStructure(finalAssistantContent) : null;

      // Evidence validation — semantic grounding check (non-blocking)
      const streamEvidenceVerdict = finalAssistantContent
        ? validateEvidence(finalAssistantContent, 'ana-ri')
        : null;

      // Build queue metadata
      const streamQueueMeta = buildQueueMeta({
        threadId,
        persistenceFailed,
      });

      // Send grounding strip (evidence verdict summary for client UI)
      if (streamEvidenceVerdict) {
        res.write(
          `data: ${JSON.stringify({
            type: 'grounding_strip',
            evidence: streamEvidenceVerdict,
          })}\n\n`
        );
      }

      // Send post_done event — deferred metadata from background post-processing
      res.write(
        `data: ${JSON.stringify({
          type: 'post_done',
          cleanedResponse: finalAssistantContent || undefined,
          executedActions: executedActions.length > 0 ? executedActions : undefined,
          executedCommands: executedCommands.length > 0 ? executedCommands : undefined,
          enrichmentSources: enrichment.sources.length > 0 ? enrichment.sources : undefined,
          enrichmentMeta: enrichment.enrichmentMeta || undefined,
          evidence: streamEvidenceVerdict || undefined,
          evidenceDiscipline: streamEvidenceCheck
            ? {
                compliant: streamEvidenceCheck.compliant,
                labels: streamEvidenceCheck.totalLabels,
                hasOverclaims: streamEvidenceCheck.hasOverclaims,
              }
            : undefined,
          structure: streamStructureCheck
            ? {
                valid: streamStructureCheck.valid,
                score: streamStructureCheck.score,
                maxScore: streamStructureCheck.maxScore,
              }
            : undefined,
          queueMeta: streamQueueMeta,
        })}\n\n`
      );

      res.end();
    })().catch((postErr: any) => {
      // If the background flow itself blows up, fall back to a post_done
      // carrying the raw content so the client turn still closes cleanly.
      console.error('[AnA RI Stream] Post-processing failed:', postErr?.message);
      try {
        res.write(
          `data: ${JSON.stringify({
            type: 'post_done',
            cleanedResponse: fullContent || undefined,
            executedActions: undefined,
            executedCommands: undefined,
          })}\n\n`
        );
        res.end();
      } catch {
        /* connection already gone */
      }
    });
  } catch (error: any) {
    console.error('[AnA RI Stream] Error:', error.message);
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: 'An error occurred while generating the response',
        })}\n\n`
      );
      res.end();
    } else {
      sendError(res, 500, 'Internal server error');
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan — Return planner preview without generation
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { message, intent_lens, submission_type, persist, thread_id } = req.body || {};
    if (!message || typeof message !== 'string') {
      return sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE');
    }

    const orchestration = orchestrate({
      message,
      intentLens: intent_lens,
      submissionType: submission_type,
    });
    const routingPlan = planKernelExecution({
      route: '/api/ana-ri/chat',
      messageLength: message.length,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      requestedMaxTokens: 4096,
    });
    const goalPlan = buildGoalPlan({
      message,
      intentLens: orchestration.detectedIntent.lens,
      riskTier: routingPlan.riskTier,
      submissionType: orchestration.detectedSubmissionType,
    });

    let planRunId: string | null = null;
    if (persist) {
      const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
      const persisted = await createGoalPlanRun({
        organizationId: orgId ? Number(orgId) : null,
        threadId: thread_id || null,
        route: '/api/ana-ri/plan',
        goalPlan,
        metadata: {
          intentLens: orchestration.detectedIntent.lens,
          submissionType: orchestration.detectedSubmissionType,
        },
      });
      planRunId = persisted.id;
    }

    return sendSuccess(res, {
      routingPlan,
      goalPlan,
      planRunId,
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
      },
    });
  } catch (error: any) {
    return sendError(res, 500, error?.message || 'Failed to compute plan', null, 'PLANNER_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId — Fetch persisted goal plan run
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId', async (req: Request, res: Response) => {
  const planRun = await getGoalPlanRun(req.params.planRunId);
  if (!planRun) {
    return sendError(res, 404, 'Plan run not found', null, 'PLAN_NOT_FOUND');
  }
  return sendSuccess(res, planRun);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/advance — Advance step status
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/advance', async (req: Request, res: Response) => {
  const { stepId, nextStatus } = req.body || {};
  if (!stepId || !nextStatus) {
    return sendError(res, 400, 'stepId and nextStatus are required', null, 'INVALID_INPUT');
  }
  const allowedStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'replanned'] as const;
  if (!allowedStatuses.includes(nextStatus)) {
    return sendError(res, 400, 'Invalid nextStatus', null, 'INVALID_STATUS');
  }

  const result = await advanceGoalPlanStep({
    planRunId: req.params.planRunId,
    stepId,
    nextStatus,
  });
  if (!result.ok) {
    return sendError(res, 400, result.message, null, 'PLAN_ADVANCE_FAILED');
  }
  return sendSuccess(res, { ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/execute-next — Execute next runnable step
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/execute-next', async (req: Request, res: Response) => {
  const result = await executeNextGoalPlanStep(req.params.planRunId);
  if (!result.ok) {
    return sendError(res, 400, result.message, null, 'PLAN_EXECUTION_FAILED');
  }
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  await recordProtocolEvent({
    planRunId: req.params.planRunId,
    organizationId: orgId ? Number(orgId) : null,
    actorType: 'system',
    actorId: 'kernel-runtime',
    messageType: 'decision',
    payload: {
      decision: 'execute_next_step',
      rationale: 'Automatically executed next dependency-satisfied step',
      stepId: result.executedStepId,
    },
  });
  return sendSuccess(res, result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId/events — Step event audit trail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId/events', async (req: Request, res: Response) => {
  const events = await listGoalPlanEvents(req.params.planRunId);
  return sendSuccess(res, { events });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/protocol — Append protocol event
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
  const { actorType, actorId, messageType, payload, metadata } = req.body || {};
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const event = {
    planRunId: req.params.planRunId,
    organizationId: orgId ? Number(orgId) : null,
    actorType,
    actorId,
    messageType,
    payload,
    metadata,
  };
  const validation = validateProtocolEvent(event as any);
  if (!validation.ok) {
    return sendError(res, 400, validation.message, null, 'INVALID_PROTOCOL_EVENT');
  }

  const recorded = await recordProtocolEvent(event as any);
  if (!recorded.ok) {
    return sendError(res, 500, 'Failed to record protocol event', null, 'PROTOCOL_WRITE_FAILED');
  }
  return sendSuccess(res, { ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId/protocol — List protocol events
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
  const events = await listProtocolEvents(req.params.planRunId);
  return sendSuccess(res, { events });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/kernel/metrics — Kernel observability summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kernel/metrics', async (req: Request, res: Response) => {
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const windowDays = req.query.window_days ? Number(req.query.window_days) : 7;
  const metrics = await getKernelMetrics({
    organizationId: orgId ? Number(orgId) : null,
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 7,
  });
  return sendSuccess(res, metrics);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/kernel/readiness — Beta launch readiness checks
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kernel/readiness', async (_req: Request, res: Response) => {
  const readiness = await getKernelBetaReadiness();
  return sendSuccess(res, readiness);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/kernel/decisions — List kernel decision records (audit trail)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kernel/decisions', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const pool = getPool();

    // Build WHERE clause with tenant scoping
    const conditions: string[] = [];
    const params: (number | null)[] = [];
    let paramIdx = 1;

    if (orgId) {
      conditions.push(`organization_id = $${paramIdx++}`);
      params.push(Number(orgId));
    }
    if (projectId && Number.isFinite(projectId)) {
      conditions.push(`project_id = $${paramIdx++}`);
      params.push(projectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ai_kernel_decision_records ${where}`,
      params,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    params.push(limit as any);
    params.push(offset as any);

    const result = await pool.query(
      `SELECT
         id, created_at, request_id, thread_id, route,
         organization_id, user_id, project_id,
         planner_version, orchestrator_name,
         intent_lens, intent_confidence, submission_type,
         selected_task_type, selected_provider, selected_model,
         routing_strategy, selected_tools, alternatives, constraints,
         decision_rationale, estimated_cost_usd, latency_ms,
         outcome, error_message
       FROM ai_kernel_decision_records
       ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params,
    );

    return sendSuccess(res, {
      decisions: result.rows.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        requestId: r.request_id,
        threadId: r.thread_id,
        route: r.route,
        organizationId: r.organization_id,
        userId: r.user_id,
        projectId: r.project_id,
        plannerVersion: r.planner_version,
        orchestratorName: r.orchestrator_name,
        intentLens: r.intent_lens,
        intentConfidence: r.intent_confidence ? Number(r.intent_confidence) : null,
        submissionType: r.submission_type,
        selectedTaskType: r.selected_task_type,
        selectedProvider: r.selected_provider,
        selectedModel: r.selected_model,
        routingStrategy: r.routing_strategy,
        selectedTools: r.selected_tools,
        alternatives: r.alternatives,
        constraints: r.constraints,
        decisionRationale: r.decision_rationale,
        estimatedCostUsd: r.estimated_cost_usd ? Number(r.estimated_cost_usd) : null,
        latencyMs: r.latency_ms,
        outcome: r.outcome,
        errorMessage: r.error_message,
      })),
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    return sendError(res, 500, error?.message || 'Failed to fetch kernel decisions');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/generate — Generate Governed Artifact
// ─────────────────────────────────────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      action_type,
      conversation_context,
      project_id,
      title,
      section_code,
      user_role,
      intent_lens,
    } = req.body;

    const VALID_ACTIONS = [
      'risk_memo',
      'deficiency_preemption_memo',
      'evidence_memo',
      'strategy_note',
      'reviewer_question_brief',
      'rewritten_section',
      'revised_artifact',
      'attach_to_dossier',
    ];
    if (!action_type || typeof action_type !== 'string' || !VALID_ACTIONS.includes(action_type)) {
      return sendError(
        res,
        400,
        `Invalid action_type. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        null,
        'INVALID_ACTION'
      );
    }

    if (
      !conversation_context ||
      !Array.isArray(conversation_context) ||
      conversation_context.length === 0
    ) {
      return sendError(res, 400, 'conversation_context is required', null, 'INVALID_CONTEXT');
    }

    if (!project_id) {
      return sendError(res, 400, 'project_id is required', null, 'MISSING_PROJECT');
    }

    const { orgId, userId } = extractRequestContext(req);

    if (!orgId) {
      return sendError(res, 403, 'Organization context required', null, 'NO_ORG');
    }

    const { generateArtifact } = await import('../services/ana-ri/artifact-generator.js');

    const result = await generateArtifact({
      actionType: action_type,
      conversationContext: conversation_context,
      projectId: Number(project_id),
      organizationId: orgId ? Number(orgId) : undefined,
      userId: userId ? Number(userId) : undefined,
      userRole: user_role,
      intentLens: intent_lens,
      title,
      sectionCode: section_code,
    });

    if (!result.success || result.persistenceStatus !== 'persisted') {
      return sendError(
        res,
        502,
        result.error || result.persistenceError || 'Artifact generation failed',
        {
          persisted: result.persisted,
          persistenceStatus: result.persistenceStatus,
        },
        result.persistenceStatus && result.persistenceStatus !== 'persisted'
          ? 'PERSISTENCE_FAILED'
          : 'GENERATION_FAILED'
      );
    }

    return sendSuccess(res, {
      content: result.content,
      title: result.title,
      artifactId: result.artifactId,
      isNew: result.isNew,
      provider: result.provider,
      model: result.model,
    });
  } catch (error: any) {
    console.error('[AnA RI] Generate error:', error);
    return sendError(res, 500, error?.message || 'Internal server error', null, 'INTERNAL_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/deficiencies — Query Deficiency Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deficiencies', (_req: Request, res: Response) => {
  const { submission_type, category, severity } = _req.query;

  let results = [...DEFICIENCY_TAXONOMY];

  if (submission_type) {
    results = getDeficienciesBySubmissionType(submission_type as SubmissionType);
  }

  if (category) {
    results = results.filter(d => d.category.toLowerCase() === (category as string).toLowerCase());
  }

  if (severity) {
    results = results.filter(d => d.severity === severity);
  }

  return sendSuccess(res, {
    count: results.length,
    deficiencies: results,
    categories: getDeficiencyCategories(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/deficiencies/critical — Critical deficiencies only
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deficiencies/critical', (_req: Request, res: Response) => {
  const { submission_type } = _req.query;
  const type = (submission_type as SubmissionType) || 'general';
  const critical = getCriticalDeficiencies(type);

  return sendSuccess(res, {
    count: critical.length,
    submissionType: type,
    deficiencies: critical,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/actions — Available Document Actions
// ─────────────────────────────────────────────────────────────────────────────

router.get('/actions', (_req: Request, res: Response) => {
  const { lens } = _req.query;

  const actions = lens ? getActionsForLens(lens as IntentLens) : getAllActions();

  return sendSuccess(res, {
    count: actions.length,
    actions: actions.map(a => ({
      type: a.type,
      label: a.label,
      description: a.description,
      icon: a.icon,
      template: a.template,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/rubric — Evaluation Rubric
// ─────────────────────────────────────────────────────────────────────────────

router.get('/rubric', (_req: Request, res: Response) => {
  const rubric = getFullRubric();
  return sendSuccess(res, { dimensions: rubric });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/health — AnA runtime readiness snapshot
// ─────────────────────────────────────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  const gw = ensureGateway();
  const enabledProviders = gw?.getEnabledProviders() || [];
  const providerHealth = gw?.getProviderHealth?.() || [];
  const deterministicMode = gw?.isDeterministicMode?.() || false;
  const databaseAvailable = await isDatabaseAvailable();

  const hasHealthyProvider = providerHealth.some((provider: any) => provider.healthy);
  const providerHealthUnavailable = providerHealth.length === 0 && enabledProviders.length > 0;

  const checks = {
    gateway: deterministicMode || enabledProviders.length > 0,
    providersHealthy: deterministicMode || hasHealthyProvider || providerHealthUnavailable,
    database: databaseAvailable,
  };

  const status =
    checks.gateway && checks.providersHealthy && checks.database ? 'healthy' : 'degraded';

  return sendSuccess(res, {
    status,
    checks,
    providers: enabledProviders,
    providerHealth,
    deterministicMode,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/evaluate — Evaluate a response
// ─────────────────────────────────────────────────────────────────────────────

router.post('/evaluate', (req: Request, res: Response) => {
  const { response, context } = req.body;

  if (!response || typeof response !== 'string') {
    return sendError(res, 400, 'Response text is required');
  }

  const evaluation = evaluateResponse(response, context || {});
  return sendSuccess(res, evaluation);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/observability — Runtime generation stats and log
// ─────────────────────────────────────────────────────────────────────────────

router.get('/observability', (_req: Request, res: Response) => {
  const stats = getGenerationStats();
  return sendSuccess(res, stats);
});

router.get('/observability/log', (_req: Request, res: Response) => {
  const { route, artifact, orchestrated, limit } = _req.query;
  const log = getGenerationLog({
    route: route as string | undefined,
    artifactCreated: artifact === 'true' ? true : artifact === 'false' ? false : undefined,
    anaRiOrchestrated:
      orchestrated === 'true' ? true : orchestrated === 'false' ? false : undefined,
    limit: limit ? Number(limit) : 100,
  });
  return sendSuccess(res, { count: log.length, events: log });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/execute — Execute AnA commands (project/doc/task ops)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { command, params } = req.body;

    if (!command || typeof command !== 'string') {
      return sendError(res, 400, 'command is required', null, 'INVALID_COMMAND');
    }

    const { orgId, userId } = extractRequestContext(req);

    if (!orgId || !userId) {
      return sendError(res, 403, 'Authentication required', null, 'NO_AUTH');
    }

    // CommandContext is a TypeScript interface — cannot destructure at runtime
    const executor = await import('../services/ana-ri/command-executor.js');

    const ctx = {
      userId: Number(userId),
      organizationId: orgId ? Number(orgId) : undefined,
      activeProjectId: params?.projectId ? Number(params.projectId) : undefined,
      userName: (req as any).user?.name,
      userRole: (req as any).user?.role || (req as any).user?.title,
    };

    const isKnownCommand = executor.COMMAND_REGISTRY.some((c: any) => c.name === command);
    if (!isKnownCommand) {
      return sendError(
        res,
        400,
        `Unknown command: ${command}`,
        { availableCommands: executor.COMMAND_REGISTRY.map((c: any) => c.name) },
        'UNKNOWN_COMMAND'
      );
    }

    const [result] = await executor.executeCommands([{ command, params: params || {} }], ctx);

    return sendSuccess(
      res,
      result || {
        success: false,
        action: command,
        message: `Command ${command} did not produce a result.`,
      }
    );
  } catch (error: any) {
    console.error('[AnA RI] Command execution error:', error);
    return sendError(
      res,
      500,
      error?.message || 'Command execution failed',
      null,
      'EXECUTION_ERROR'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/commands — List available commands
// ─────────────────────────────────────────────────────────────────────────────

router.get('/commands', async (_req: Request, res: Response) => {
  try {
    const { COMMAND_REGISTRY } = await import('../services/ana-ri/command-executor.js');
    if (!Array.isArray(COMMAND_REGISTRY)) {
      throw new Error('Command registry unavailable');
    }
    return sendSuccess(res, { commands: COMMAND_REGISTRY });
  } catch (error: any) {
    return sendError(
      res,
      503,
      error?.message || 'Command registry unavailable',
      null,
      'COMMANDS_UNAVAILABLE'
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/decisions — Decision audit trail for current project
// ─────────────────────────────────────────────────────────────────────────────
router.get('/decisions', async (req: Request, res: Response) => {
  try {
    const { project_id, section_code, module_code, limit } = req.query;

    if (!project_id || typeof project_id !== 'string') {
      return sendError(
        res,
        400,
        'project_id query parameter is required',
        null,
        'MISSING_PROJECT_ID',
      );
    }

    const decisionLimit = Number(limit);
    const safeLimit =
      Number.isFinite(decisionLimit) && decisionLimit > 0
        ? Math.min(Math.floor(decisionLimit), 50)
        : 20;

    const context = decisionLifecycleService.getContradictionDecisionContext(project_id, {
      sectionCode: typeof section_code === 'string' ? section_code : undefined,
      moduleCode: typeof module_code === 'string' ? module_code : undefined,
      limit: safeLimit,
    });

    const decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(project_id, {
      moduleCode: typeof module_code === 'string' ? module_code : undefined,
    });

    return sendSuccess(res, {
      projectId: project_id,
      count: context.length,
      decisionAwareStatus,
      decisions: context,
    });
  } catch (error: any) {
    return sendError(
      res,
      500,
      error?.message || 'Failed to load decision audit trail',
      null,
      'DECISIONS_FETCH_FAILED',
    );
  }
});

export default router;
