/**
 * POST /api/ana-ri/chat — the canonical non-streaming AnA RI chat endpoint.
 *
 * Kept for firecrawl-enabled flows (which depend on chat-side evidence
 * pre-routing) and as a Cortex fallback when /stream is unavailable.
 *
 * Extracted from ana-ri.ts. Mounted via {@link mountChatRoute}.
 *
 * @module server/routes/ana-ri/chat
 */

import type { Request, Response, Router } from 'express';

import { getPool } from '../../db.js';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import {
  orchestrate,
  type OrchestratorInput,
  type IntentLens,
  type UserRole,
} from '../../services/ana-ri/orchestrator.js';
import type { SubmissionType } from '../../services/ana-ri/deficiency-taxonomy.js';
import { evaluateResponse } from '../../services/ana-ri/evaluation.js';
import { inferRole } from '../../services/ana-ri/role-adapter.js';
import {
  logGeneration,
  checkEvidenceDiscipline,
  validateResponseStructure,
} from '../../services/ana-ri/enforcement.js';
import { validateEvidence } from '../../services/ana-ri/evidence-validation.js';
import { buildQueueMeta } from '../../services/ana-ri/response-contract.js';
import { recordAnaTurn } from '../../services/ana-ri-metrics.js';
import {
  getOrCreateThread,
  getThreadMessages,
  saveChatMessage as saveMessage,
} from '../../services/chat-thread-helpers.js';
import { logKernelDecision } from '../../services/kernel-decision-record.js';
import { replanGoalPlan } from '../../services/kernel-goal-planner.js';
import {
  buildKernelExecutionContext,
  recordKernelSuccess,
} from '../../services/ana-kernel-orchestrator.js';
import { buildMemoryContextForChat } from '../../services/memory-context-assembler.js';
import {
  getIntelligencePrefix,
  buildSectionSpecificPrompt,
} from '../../services/lumen-context-builder.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
import { getCachedSignalReliability } from '../../services/intelligence/learning-loop-service.js';
import { enrichContextForChat } from '../../services/ana-ri/context-enrichment.js';
import { processResponseActions } from '../../services/ana-guidance-executor.js';
import {
  processCommandsInResponse,
  type CommandContext,
} from '../../services/ana-ri/command-executor.js';
import {
  buildAuthoringContextBlock,
  buildOrchestratorAuthoringContext,
  buildRouteContextBlock,
  prefetchRouteIntelligenceContext,
  resolveProjectIdFromBody,
} from '../../services/ana-ri/chat-context-builder.js';
import {
  getFirecrawlQuotaStatus,
  recordSuccessfulFirecrawlScrape,
} from '../../integrations/firecrawl/usage';
import {
  routeEvidenceRequest,
  persistEvidence,
  normalizeEvidence,
} from '../../services/research-intelligence';
import {
  sendSuccess,
  sendError,
  extractRequestContext,
  ensureGateway,
  VALID_LENSES,
  VALID_ROLES,
} from './shared.js';

// Idempotency cache — per-request-id memoisation so a client retry within
// IDEMPOTENCY_TTL_MS replays the prior response instead of re-generating.
// Lives in this module because only /chat uses it (SSE streams can't replay).
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

// Thin facade over getPool() so the extracted body keeps its `dbPool.query(...)`
// shape without needing to touch the original handler.
const dbPool = {
  query: (...args: Parameters<ReturnType<typeof getPool>['query']>) => getPool().query(...args),
};

/** Register POST /chat on the given router. */
export function mountChatRoute(router: Router): void {
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

    const chatThinkingConfig =
      routingPlan.riskTier === 'high'
        ? { enabled: true, budgetTokens: 10_000 }
        : undefined;
    const response = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
      promptCache: { enabled: true, type: 'ephemeral' },
      ...(chatThinkingConfig ? { thinking: chatThinkingConfig } : {}),
      ...(validatedProvider ? { provider: validatedProvider } : {}),
    });

    if (!response.content) {
      return sendError(res, 502, 'No response from AI provider', null, 'EMPTY_RESPONSE');
    }

    // Metrics: /chat doesn't have the same per-phase instrumentation as
    // /stream (it's the firecrawl-only path), but we still record turns,
    // cache hits, and thinking opt-in for cross-route comparison.
    recordAnaTurn({
      route: 'chat',
      cache: { hit: (response as any)?.cacheHit },
      thinkingEnabled: !!chatThinkingConfig,
    });

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

    // RIM interception — capture intelligence signals (non-blocking, sync void).
    // Grounded metrics: claimCount from structure check, supportedClaimRate from
    // evaluation score so signals reflect the actual turn quality instead of a flat 0.5.
    const projectIdForRim = chatProjectId;
    if (finalAssistantContent && projectIdForRim && orgId) {
      const ratedClaimCount = Math.max(
        evidenceCheck.totalLabels || 0,
        structureCheck.score > 0 ? 1 : 0,
      );
      const qualityRate =
        evaluation.maxOverallScore > 0
          ? evaluation.overallScore / evaluation.maxOverallScore
          : 0.5;
      interceptChatResponse({
        organizationId: Number(orgId),
        projectId: Number(projectIdForRim),
        userId: typeof userId === 'number' ? userId : undefined,
        sectionCode: chatSectionCode,
        assistantMessage: finalAssistantContent,
        claimCount: ratedClaimCount,
        supportedClaimRate: qualityRate,
        model: response.model || 'unknown',
        provider: response.provider || 'unknown',
      });
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

    // Cached reliability lookup (5-min TTL) — surfaced so future UI can show
    // AnA's self-assessed accuracy on this project.
    const chatReliability =
      chatProjectId && orgId
        ? await getCachedSignalReliability(Number(chatProjectId), Number(orgId)).catch(() => null)
        : null;

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
      reliability: chatReliability,
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
}
