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

import type { QueryResult, QueryResultRow } from 'pg';

import { getPool } from '../../db.js';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import { orchestrate } from '../../services/ana-ri/orchestrator.js';
import type { IntentLens, UserRole } from '../../services/ana-ri/persona.js';
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
import { summarizeAndStoreWorkingMemoryForThread } from '../../services/working-memory.js';
import { getCachedSignalReliability } from '../../services/intelligence/learning-loop-service.js';
import {
  getEnabledServerTools,
  getAllEnabledTools,
  ALL_ANA_TOOLS,
} from '../../services/ana/AnaToolDefinitions.js';
import { getToolHandler } from '../../services/ana/AnaToolExecutor.js';
import { logToolRun } from '../../services/toolRegistry.js';
import type { AnaGatewayResponse } from '../../services/ai-gateway/types.js';
import {
  getIntelligencePrefix,
  buildSectionSpecificPrompt,
} from '../../services/lumen-context-builder.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
import {
  enrichContextForChat,
  type EnrichmentResult,
} from '../../services/ana-ri/context-enrichment.js';
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
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<R>> => getPool().query<R>(text, values as unknown[]),
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
    const deterministicMode = gw?.isDeterministic?.() || false;
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

    // Keepalive ping. Long-running orchestration / context assembly (and the
    // AI's first-token latency on large prompts) can leave the socket silent
    // for >30s, which trips proxy idle timeouts (Vite dev proxy, nginx 60s,
    // Cloudflare 100s, dev tunnels, etc.) and surfaces to the client as a
    // "Stream Idle Timeout" error before any real token arrives. A 15s
    // SSE-comment heartbeat keeps every intermediary alive without
    // disturbing the client's `data:` frame parser. Cleared in the same
    // teardown branches as the abort handler below.
    const STREAM_KEEPALIVE_MS = 15_000;
    const streamKeepalive = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(streamKeepalive);
      }
    }, STREAM_KEEPALIVE_MS);
    const stopKeepalive = () => clearInterval(streamKeepalive);
    res.on('close', stopKeepalive);
    res.on('finish', stopKeepalive);
    req.on('close', stopKeepalive);

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
      }).catch((err): EnrichmentResult => {
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
    // Full tool suite on the streaming path: custom JSON-schema tools
    // (PubMed search, FDA guidance lookup, predicate device analysis, etc.)
    // plus any env-enabled Anthropic server tools (web_search, web_fetch,
    // code_execution). Server tools resolve in Anthropic's infra; custom
    // tools dispatch locally via the single-round agentic block below.
    const streamTools = getAllEnabledTools();

    const gwResponse = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
      promptCache: { enabled: true, type: 'ephemeral' },
      ...(streamThinkingConfig ? { thinking: streamThinkingConfig } : {}),
      ...(streamTools.length > 0 ? { tools: streamTools } : {}),
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

    // Single-round agentic tool execution. If Claude called custom tools,
    // dispatch them locally, stream transparency events to the client, then
    // make one non-streaming follow-up call with the tool results so Claude
    // can deliver the final grounded answer. Multi-round is out of scope
    // here — for regulatory lookups one round covers the common case, and
    // the non-streaming send-message.ts path still handles multi-round.
    const streamToolUses = (gwResponse as AnaGatewayResponse).toolUses;
    if (streamToolUses && streamToolUses.length > 0) {
      const toolResultEntries: Array<{ tool_use_id: string; content: string; name: string }> = [];
      for (const toolUse of streamToolUses) {
        // Announce the tool invocation to the client so the UI can show
        // "Checking FDA guidance…" affordances instead of an opaque pause.
        res.write(
          `data: ${JSON.stringify({
            type: 'tool_use',
            name: toolUse.name,
            input: toolUse.input,
          })}\n\n`
        );

        const handler = getToolHandler(toolUse.name);
        const toolStart = Date.now();
        let resultStr: string;
        let toolStatus: 'success' | 'error' | 'not_found' = 'success';
        let toolErrorMessage: string | undefined;
        if (handler) {
          try {
            resultStr = await handler(toolUse.input, {
              organizationId: orgId,
              userId: userId || null,
              projectId: streamProjectId ? Number(streamProjectId) || null : null,
            });
          } catch (toolErr: any) {
            resultStr = JSON.stringify({
              error: `Tool execution failed: ${toolErr?.message || 'unknown error'}`,
              tool: toolUse.name,
            });
            toolStatus = 'error';
            toolErrorMessage = toolErr?.message || 'unknown error';
          }
        } else {
          // Unknown tool name — could be an Anthropic server tool that
          // Anthropic resolved server-side (in which case the result is
          // already in the content stream, nothing to do) or a schema drift.
          // Either way we don't want to block the conversation.
          resultStr = JSON.stringify({
            note: `No local handler for ${toolUse.name}; may be a server-resolved tool.`,
          });
          toolStatus = 'not_found';
        }
        // Telemetry: persist the tool invocation so we can measure how
        // often each tool fires and decide whether eager schema loading
        // (all 18 tool schemas on every turn) is worth keeping vs
        // moving to a deferred / tool-search pattern. Fire-and-forget;
        // logToolRun swallows its own errors.
        void logToolRun({
          threadId: thread_id,
          projectId: streamProjectId ? Number(streamProjectId) || null : null,
          userId: userId || null,
          organizationId: orgId,
          toolName: toolUse.name,
          arguments: (toolUse.input ?? {}) as Record<string, unknown>,
          result: { resultBytes: resultStr.length },
          status: toolStatus,
          errorMessage: toolErrorMessage,
          latencyMs: Date.now() - toolStart,
        });
        toolResultEntries.push({
          tool_use_id: toolUse.id,
          content: resultStr,
          name: toolUse.name,
        });

        res.write(
          `data: ${JSON.stringify({
            type: 'tool_result',
            name: toolUse.name,
            result: resultStr,
          })}\n\n`
        );
      }

      // Compose the follow-up turn: prior messages + Claude's partial text
      // (which often narrates "let me check…") + a user message bundling
      // the tool results. Force a text response by dropping tools on the
      // follow-up call — we only want one round here.
      const followupMessages: GatewayMessage[] = [
        ...messages,
        { role: 'assistant', content: fullContent || '' },
        {
          role: 'user',
          content: toolResultEntries
            .map(tr => `[Tool Result for ${tr.name} (${tr.tool_use_id})]:\n${tr.content}`)
            .join('\n\n'),
        },
      ];

      const followupResponse = await gw.route({
        taskType: routingPlan.taskType,
        messages: followupMessages,
        maxTokens: routingPlan.maxTokens,
        temperature: routingPlan.temperature,
        strategy: selectedStrategy,
        promptCache: { enabled: true, type: 'ephemeral' },
        callerModule: 'ana-ri-stream-followup',
      });

      const followupText = followupResponse.content || '';
      if (followupText) {
        // Emit the follow-up answer. Not true token-by-token streaming —
        // the follow-up call was non-streaming — but the client receives
        // it as a standard text chunk so the UI renders it the same way
        // as normal streamed content.
        fullContent += (fullContent ? '\n\n' : '') + followupText;
        res.write(
          `data: ${JSON.stringify({ type: 'text', content: followupText })}\n\n`
        );
      }
    }

    // RIM interception moved to the background post-processing block below,
    // so it scans the *cleaned* content (guidance/command blocks stripped) and
    // can ground its claim metrics on evidence + structure scores instead of a
    // hardcoded 0.5. Keeps the `done` event on the critical path latency-free.

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
            await import('../../services/ana-ri/command-executor.js');
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

      // RIM interception — fire sync, non-blocking, on the cleaned content.
      // Claim metrics are grounded in the structure + evidence checks above so
      // RIM receives an actual turn-quality signal instead of a flat 0.5.
      if (finalAssistantContent && streamProjectId && orgId) {
        const ratedClaimCount = Math.max(
          streamEvidenceCheck?.totalLabels || 0,
          streamStructureCheck && streamStructureCheck.score > 0 ? 1 : 0,
        );
        const qualityRate =
          streamStructureCheck && streamStructureCheck.maxScore > 0
            ? streamStructureCheck.score / streamStructureCheck.maxScore
            : 0.5;
        interceptChatResponse({
          organizationId: Number(orgId),
          projectId: Number(streamProjectId),
          userId: typeof userId === 'number' ? userId : undefined,
          sectionCode,
          assistantMessage: finalAssistantContent,
          claimCount: ratedClaimCount,
          supportedClaimRate: qualityRate,
          model: gwResponse.model || 'unknown',
          provider: gwResponse.provider || 'unknown',
        });
      }

      // Working-memory write-back — threshold-gated, non-blocking.
      // Reuses the gateway message history already built for the turn and
      // appends the cleaned assistant reply so the summarizer sees the full
      // exchange, not just the prefix.
      if (threadId && orgId && finalAssistantContent) {
        const writebackMessages = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content }))
          .concat({ role: 'assistant', content: finalAssistantContent });
        void summarizeAndStoreWorkingMemoryForThread({
          threadId,
          organizationId: Number(orgId),
          messages: writebackMessages,
        });
      }

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

      // Cached reliability lookup (5-min TTL) — included in post_done so
      // client UI can render AnA's self-assessed accuracy on this project
      // once the Phase 2 chat shell ships. Failure is silently null.
      const streamReliability =
        streamProjectId && orgId
          ? await getCachedSignalReliability(Number(streamProjectId), Number(orgId)).catch(
              () => null,
            )
          : null;

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
          reliability: streamReliability || undefined,
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
