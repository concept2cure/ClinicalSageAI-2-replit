/**
 * POST /api/ana-ri/stream — SSE streaming AnA RI chat.
 *
 * Tokens stream as they arrive, with:
 *  - pre-token `status` events during orchestration / context assembly
 *  - `thread_id` + `orchestration` metadata before first token
 *  - `text` tokens during gateway generation
 *  - `warning` events when server-side degradation occurs
 *  - `grounding_strip`, `done`, and `post_done` events after last token
 *
 * Background post-processing (guidance executor, command executor, persistence,
 * evidence validation) runs after `done` so clients can unblock immediately.
 *
 * Extracted from ana-ri.ts. Mounted via {@link mountStreamRoute}.
 *
 * @module server/routes/ana-ri/stream
 */

import type { Request, Response, Router } from 'express';

import { getPool } from '../../db.js';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import {
  orchestrate,
  type IntentLens,
  type UserRole,
} from '../../services/ana-ri/orchestrator.js';
import type { SubmissionType } from '../../services/ana-ri/deficiency-taxonomy.js';
import { inferRole } from '../../services/ana-ri/role-adapter.js';
import {
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
import { planKernelExecution } from '../../services/kernel-router.js';
import { getKernelPolicyHint } from '../../services/kernel-adaptive-policy.js';
import { buildMemoryContextForChat } from '../../services/memory-context-assembler.js';
import {
  getIntelligencePrefix,
  buildSectionSpecificPrompt,
} from '../../services/lumen-context-builder.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
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
  sendError,
  extractRequestContext,
  ensureGateway,
  VALID_LENSES,
  VALID_ROLES,
} from './shared.js';

// Thin facade over getPool() so the extracted body keeps its `dbPool.query(...)`
// shape without needing to touch the original handler.
const dbPool = {
  query: (...args: Parameters<ReturnType<typeof getPool>['query']>) => getPool().query(...args),
};

/** Register POST /stream on the given router. */
export function mountStreamRoute(router: Router): void {
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

    // Phase-level wall clocks so /done can carry per-phase telemetry for
    // observability. Clients can ignore these; ops can track regressions.
    const streamPhaseStart = Date.now();
    let streamOrchestrationMs = 0;
    let streamContextMs = 0;
    let streamGatewayMs = 0;

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
    streamOrchestrationMs = Date.now() - streamPhaseStart;

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
    const streamContextStart = Date.now();
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
    streamContextMs = Date.now() - streamContextStart;

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
          'ana-ri',
          Number(orgId)
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
    const streamGatewayStart = Date.now();
    // Extended thinking opt-in: kernel router flags genuinely high-stakes turns
    // (audit/risk lens, critical contradictions). Use Claude's thinking budget
    // to deepen reasoning on those without imposing latency on conversational
    // turns. Gateway will force temperature=1 when thinking is enabled.
    const streamThinkingConfig =
      routingPlan.riskTier === 'high'
        ? { enabled: true, budgetTokens: 10_000 }
        : undefined;
    const gwResponse = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
      promptCache: { enabled: true, type: 'ephemeral' },
      ...(streamThinkingConfig ? { thinking: streamThinkingConfig } : {}),
      stream: true,
      onStream: (chunk: string, metadata?: any) => {
        // Extended-thinking deltas arrive with chunk='' and the thinking
        // text in metadata.thinkingContent. Forward them as a separate
        // SSE event type so the client can render reasoning in a
        // collapsible section and keep it out of the answer prose.
        if (metadata?.type === 'thinking') {
          const thinkingChunk: string = metadata?.thinkingContent || '';
          if (thinkingChunk) {
            res.write(
              `data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}\n\n`
            );
          }
          return;
        }
        fullContent += chunk;
        res.write(
          `data: ${JSON.stringify({
            type: 'text',
            content: chunk,
          })}\n\n`
        );
      },
      callerModule: 'ana-ri-stream',
    });
    streamGatewayMs = Date.now() - streamGatewayStart;

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

    // Telemetry attached to the `done` event. Phase timings let ops spot
    // regressions in orchestration / context assembly / generation; cache
    // stats confirm prompt caching is actually hitting; memory diagnostics
    // show degraded layers without scraping logs.
    const streamMemoryDiag = (memoryResult as any)?.diagnostics || null;
    const streamTelemetry = {
      phases: {
        orchestrationMs: streamOrchestrationMs,
        contextMs: streamContextMs,
        gatewayMs: streamGatewayMs,
      },
      cache: (gwResponse as any)?.cacheHit !== undefined
        ? {
            hit: (gwResponse as any).cacheHit,
            stats: (gwResponse as any).cacheStats || undefined,
          }
        : undefined,
      memory: streamMemoryDiag
        ? {
            layerOutcomes: streamMemoryDiag.layerOutcomes,
            semanticSearchMs: streamMemoryDiag.semanticSearchMs,
          }
        : undefined,
    };

    // Record into in-memory metrics so /api/metrics surfaces aggregates.
    recordAnaTurn({
      route: 'stream',
      phases: streamTelemetry.phases,
      cache: { hit: (gwResponse as any)?.cacheHit },
      memory: streamMemoryDiag
        ? {
            layerOutcomes: streamMemoryDiag.layerOutcomes,
            semanticSearchMs: streamMemoryDiag.semanticSearchMs,
          }
        : undefined,
      thinkingEnabled: !!streamThinkingConfig,
    });

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
        telemetry: streamTelemetry,
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

      // Run persistence concurrent with the synchronous evidence / structure
      // checks. saveMessage is a DB roundtrip (tens to hundreds of ms); the
      // checks are CPU-only and finish instantly. Awaiting them together
      // collapses the tail to max(db, cpu) instead of db + cpu.
      const persistPromise: Promise<void> =
        orgId && threadId && fullContent
          ? saveMessage(threadId, 'assistant', finalAssistantContent)
              .then(() => undefined)
              .catch((e: any) => {
                console.error('[AnA RI Stream] Assistant persist failed:', e?.message);
                persistenceFailed = true;
              })
          : Promise.resolve();

      // Evidence discipline + structure checks are synchronous — run inline.
      const streamEvidenceCheck = finalAssistantContent
        ? checkEvidenceDiscipline(finalAssistantContent)
        : null;
      const streamStructureCheck = finalAssistantContent
        ? validateResponseStructure(finalAssistantContent)
        : null;
      const streamEvidenceVerdict = finalAssistantContent
        ? validateEvidence(finalAssistantContent, 'ana-ri')
        : null;

      // Wait for persistence to settle before emitting warning/post_done so
      // `persistenceFailed` reflects the actual DB outcome.
      await persistPromise;

      // Warn client if thread persistence failed
      if (persistenceFailed) {
        res.write(
          `data: ${JSON.stringify({ type: 'warning', message: 'Thread persistence failed' })}\n\n`
        );
      }

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
}
