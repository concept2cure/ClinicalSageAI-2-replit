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
import {
  resolveEffortLevel,
  resolveEffortStrategy,
  resolveStrategyWithPrecedence,
  resolveModelOverride,
} from '../../services/ai-gateway/effort.js';
import {
  resolveThinkingConfig,
  isSubstantiveTurn,
  resolveOutputBudget,
  resolveModelTier,
  resolveTierModel,
} from '../../services/ai-gateway/reasoning.js';
import { orchestrate } from '../../services/ana-ri/orchestrator.js';
import type { IntentLens, UserRole } from '../../services/ana-ri/persona.js';
import type { DetectedDocumentTemplatePayload } from '../../../shared/types/ana-document-detection.js';
import type { SubmissionType } from '../../services/ana-ri/deficiency-taxonomy.js';
import { inferRole } from '../../services/ana-ri/role-adapter.js';
import { recordAnaTurn } from '../../services/ana-ri-metrics.js';
import {
  getOrCreateThread,
  getThreadMessages,
  ThreadAccessError,
  saveChatMessage as saveMessage,
} from '../../services/chat-thread-helpers.js';
import { planKernelExecution } from '../../services/kernel-router.js';
import { getKernelPolicyHint } from '../../services/kernel-adaptive-policy.js';
import { buildMemoryContextForChat } from '../../services/memory-context-assembler.js';
import { getAllEnabledTools } from '../../services/ana/AnaToolDefinitions.js';
import { getToolHandler } from '../../services/ana/AnaToolExecutor.js';
import { getUnhealthyTools } from '../../services/ana/tool-telemetry.js';
import {
  directiveFromToolResult,
  surfaceActionFromToolResult,
} from '../../services/ana-ri/navigation-actions.js';
import {
  resolveDriveState,
  buildDriveStateEvent,
  buildDriveNavigationEvent,
  buildDriveActionEvent,
  buildLiveDrivePromptBlock,
  auditDriveNavigation,
  auditDriveAction,
  driveBudgetFor,
  DEMO_MAX_ROUNDS,
} from '../../services/ana-ri/live-drive.js';
import auditService from '../../services/auditService.js';
import type { NavigationDirective } from '../../../shared/navigation/index.js';
import type { SurfaceActionDirective } from '../../../shared/navigation/surface-actions.js';
import {
  runAgenticToolLoop,
  resolveMaxRounds,
  resolveRoundExtension,
  capToolResultForModel,
  budgetToolResultsForModel,
  buildAdaptationNote,
  mapWithConcurrency,
  describeToolPlan,
  type ToolCall,
  type ToolResultEntry,
  type ModelTurn,
  type FailedToolCall,
} from '../../services/ana/agentic-loop.js';
import type { ProvenanceRecord } from '../../services/evidence/provenance.js';
import {
  buildTraceEntry,
  collectTracesFromHistory,
  formatTraceForContext,
  type ToolTraceEntry,
} from '../../services/ana/tool-trace.js';
import { runStreamPostProcessing } from './post-processing.js';
import { reflectAfterTurn } from '../../services/ana-ri/relational-profile-service.js';
import { loadAnaToolPolicy, filterToolsByPolicy } from '../../services/ana-ri/mdx-tool-policy.js';
import { selectToolsForTurn } from '../../services/ana/tool-selection.js';
import { guardUserInput, PromptInjectionError } from '../../services/ana/ana-input-guard.js';
import { isPdfIntakeEnabled, readLocalUploadBuffer } from '../../services/anthropic-files.js';
import { logToolRun } from '../../services/toolRegistry.js';
import type { AnaGatewayResponse } from '../../services/ai-gateway/types.js';
import {
  getIntelligencePrefix,
  buildSectionSpecificPrompt,
} from '../../services/lumen-context-builder.js';
import {
  enrichContextForChat,
  type EnrichmentResult,
} from '../../services/ana-ri/context-enrichment.js';
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
  VALID_LANGUAGES,
} from './shared.js';
import { randomUUID } from 'node:crypto';
import {
  runControlRegistry,
  type HumanControlEvent,
} from '../../services/ana/run-control-registry.js';

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
    // Opaque id for this run, emitted to the client as `run_started` so it can
    // pause / interject / cancel via the control endpoint. Declared out here so
    // the finally can always deregister it. Assigned once SSE is open.
    let runId = '';
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
        selected_tools,
        language,
        model_override,
        effort_level,
        live_drive,
        drive_mode,
      } = req.body;

      if (!message || typeof message !== 'string') {
        return sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE');
      }

      // ── Prompt-injection inspection (coverage: EVERY user turn) ──────────
      // Wires the existing prompt-injection defense (server/lib/prompt-injection-
      // protection) into the streaming hot path. Detection + high-risk audit
      // logging ALWAYS run; hard-block and content encapsulation are opt-in via
      // PROMPT_INJECTION_ENFORCE / PROMPT_INJECTION_ENCAPSULATE (both default OFF),
      // so with default config this is pure observation — output is unchanged.
      // Runs before the SSE headers are written so an enforced block returns a
      // clean 400 rather than a mid-stream error.
      const { orgId: guardOrgId, userId: guardUserId } = extractRequestContext(req);
      let injectionGuard;
      try {
        injectionGuard = await guardUserInput(message, {
          organizationId: guardOrgId,
          userId: guardUserId,
          route: '/api/ana-ri/stream',
          threadId: thread_id,
          projectId: project_id || resolveProjectIdFromBody(req.body),
          ipAddress:
            (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            undefined,
          userAgent: req.headers['user-agent'] as string | undefined,
        });
      } catch (guardErr) {
        if (guardErr instanceof PromptInjectionError) {
          return sendError(
            res,
            400,
            'Message was blocked by the input safety policy',
            null,
            'PROMPT_INJECTION_BLOCKED'
          );
        }
        throw guardErr;
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
      let streamFirstTokenMs: number | undefined;

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

      // Register this run for mid-flight human control (pause / interject /
      // cancel). The client uses the emitted runId to call
      // POST /api/ana-ri/stream/:runId/control; the agentic loop's checkpoint
      // (below) honors the control state at each round boundary. A client
      // disconnect cancels the run so the server stops between rounds rather than
      // running the whole investigation to completion unseen.
      runId = `run_${randomUUID()}`;
      runControlRegistry.register(runId);
      const cancelRun = () => runControlRegistry.requestCancel(runId);
      res.on('close', cancelRun);
      req.on('close', cancelRun);
      res.write(`data: ${JSON.stringify({ type: 'run_started', runId })}\n\n`);

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
      const toolPolicyPromise = orgId
        ? loadAnaToolPolicy(getPool(), Number(orgId))
        : Promise.resolve({});

      // ── Live Drive (opt-in screen driving) ─────────────────────────────
      // The client sends `live_drive: true` only while the person has the
      // toggle on, plus `drive_mode: 'demo'` for an explicitly started
      // demonstration (bigger budgets, demo prompt block — same entitlement).
      // Entitlement (`ana_live_drive`, ENTITLEMENTS_ENFORCE modes) is resolved
      // in parallel with context assembly; a deny is an honest `drive_state`
      // event, never a dead turn. No request → zero queries.
      const driveStatePromise = resolveDriveState(
        live_drive === true,
        orgId != null ? Number(orgId) : null,
        { driveMode: drive_mode },
      );

      // ── Intelligence answer fast-path ──────────────────────────────────
      // When the client submits a structured intelligence flow answer, skip
      // the full AI pipeline and call the tool handler directly.
      const INTELLIGENCE_ANSWER_PREFIX = '[INTELLIGENCE_ANSWER]';
      if (typeof message === 'string' && message.startsWith(INTELLIGENCE_ANSWER_PREFIX)) {
        try {
          const payload = JSON.parse(message.slice(INTELLIGENCE_ANSWER_PREFIX.length));
          const handler = getToolHandler('answer_intelligence_question');
          if (!handler) throw new Error('answer_intelligence_question handler not registered');
          const streamProjectId = project_id || resolveProjectIdFromBody(req.body);
          const resultStr = await handler(payload, {
            organizationId: orgId,
            userId: userId || null,
            projectId: streamProjectId ? Number(streamProjectId) || null : null,
          });
          const parsed = JSON.parse(resultStr);
          if (parsed?.status === 'intelligence_question' && parsed.question) {
            res.write(
              `data: ${JSON.stringify({
                type: 'intelligence_question',
                question: parsed.question,
                flowState: parsed.flowState,
              })}\n\n`
            );
            res.write(
              `data: ${JSON.stringify({
                type: 'text',
                content: `**${parsed.question.node.question}**\n\n${
                  parsed.question.node.guidance || ''
                }`,
              })}\n\n`
            );
          } else if (parsed?.status === 'intelligence_flow_complete' && parsed.completion) {
            res.write(
              `data: ${JSON.stringify({
                type: 'intelligence_flow_complete',
                completion: parsed.completion,
                flowState: parsed.flowState,
              })}\n\n`
            );
            res.write(
              `data: ${JSON.stringify({ type: 'text', content: parsed.completion.summary })}\n\n`
            );
          } else if (parsed?.error) {
            res.write(
              `data: ${JSON.stringify({ type: 'text', content: `Error: ${parsed.error}` })}\n\n`
            );
          }
          res.write(
            `data: ${JSON.stringify({
              type: 'done',
              latencyMs: Date.now() - streamPhaseStart,
            })}\n\n`
          );
          res.write(`data: ${JSON.stringify({ type: 'post_done' })}\n\n`);
          stopKeepalive();
          res.end();
          return;
        } catch (err: any) {
          res.write(
            `data: ${JSON.stringify({
              type: 'text',
              content: `Error processing intelligence answer: ${err?.message}`,
            })}\n\n`
          );
          res.write(
            `data: ${JSON.stringify({
              type: 'done',
              latencyMs: Date.now() - streamPhaseStart,
            })}\n\n`
          );
          res.write(`data: ${JSON.stringify({ type: 'post_done' })}\n\n`);
          stopKeepalive();
          res.end();
          return;
        }
      }

      const validatedLens: IntentLens | undefined =
        intent_lens && VALID_LENSES.has(intent_lens as IntentLens)
          ? (intent_lens as IntentLens)
          : undefined;

      const validatedRole: UserRole | undefined =
        user_role && VALID_ROLES.has(user_role as UserRole) ? (user_role as UserRole) : undefined;

      const validatedLanguage = VALID_LANGUAGES.has(language) ? language : undefined;

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
        userId: typeof userId === 'number' ? userId : Number(userId) || null,
        targetAgency:
          typeof project_context?.targetAgency === 'string' ? project_context.targetAgency : null,
        sessionStart: !Array.isArray(conversation_history) || conversation_history.length === 0,
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
        language: validatedLanguage,
        projectContext: project_context,
        documentContext: document_context,
        submissionType: submission_type as SubmissionType | undefined,
        conversationHistory: conversation_history,
        authoringContext: streamOrchestratorAuthoringContext,
        _feedbackContext: streamFeedbackContext,
        _projectIntelligenceProfile: streamProjectProfile,
        _relationalOverlay: prefetchedStreamContext.relationalOverlay,
        _externalIntelBlock: prefetchedStreamContext.externalIntelBlock,
        _deadlineRadarBlock: prefetchedStreamContext.deadlineRadarBlock,
        _sessionBriefingBlock: prefetchedStreamContext.sessionBriefingBlock,
        _contradictionWatchBlock: prefetchedStreamContext.contradictionWatchBlock,
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
          userRole: effectiveRole,
        }).catch((err): EnrichmentResult => {
          console.warn('[AnA RI] Context enrichment failed:', err?.message);
          return { block: '', sources: [] as string[] };
        }),
      ]);
      streamContextMs = Date.now() - streamContextStart;

      const memoryBlock = memoryResult.memoryBlock;

      if (enrichment.sources.length > 0) {
        console.info(`[AnA RI Stream] Context enriched with: ${enrichment.sources.join(', ')}`);
      }

      // Use rewritten message if slash command or @app mention was detected
      const effectiveMessage = (enrichment as any).rewrittenMessage || message;

      // Split into stable prefix (cached) + volatile suffix (per-turn) — see /chat
      // handler for rationale. The Claude gateway marks the stable block with
      // cache_control so subsequent turns on the same screen/project hit cache.
      // Live Drive rides the VOLATILE suffix: the mode is per-turn, so putting
      // it in the cached prefix would poison the cache across toggle flips.
      const driveState = await driveStatePromise;
      if (driveState.requested) {
        res.write(`data: ${JSON.stringify(buildDriveStateEvent(driveState))}\n\n`);
      }
      const streamStablePrefix = intelligencePrefix + orchestration.systemPrompt;
      const streamVolatileSuffix =
        memoryBlock +
        enrichment.block +
        (driveState.enabled ? buildLiveDrivePromptBlock(driveState.mode) : '');

      // Thread resolution (before message building so we can load server history).
      //
      // The id the CLIENT sent is never used as-is. getOrCreateThread resolves
      // it in the caller's organization and to the caller's own thread, or
      // mints a fresh one; a colleague's thread id is refused outright. If the
      // resolution fails for any other reason, `threadId` stays null so that
      // NO history is loaded from an id nothing has verified — the previous
      // shape kept the caller-supplied id and read its transcript into the
      // model context even after persistence had failed.
      let threadId: string | null = null;
      let persistenceFailed = false;
      if (orgId) {
        try {
          threadId = await getOrCreateThread(
            thread_id || null,
            typeof userId === 'number' || typeof userId === 'string' ? userId : undefined,
            'ana-ri',
            Number(orgId)
          );
          await saveMessage(threadId, 'user', message);
        } catch (e: any) {
          if (e instanceof ThreadAccessError) {
            console.warn('[AnA RI Stream] Refused caller-supplied thread id:', e.code);
            res.write(
              `data: ${JSON.stringify({
                type: 'error',
                code: e.code,
                error: 'That conversation belongs to another user.',
              })}\n\n`
            );
            res.end();
            return;
          }
          console.error('[AnA RI Stream] Thread persistence failed:', e?.message);
          persistenceFailed = true;
          threadId = null;
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
            // Tool-trace memory: carry forward a compact summary of the tools AnA
            // already ran in earlier turns (stored on each assistant message's
            // metadata) so she reuses prior findings instead of re-running them.
            const traceNote = formatTraceForContext(collectTracesFromHistory(previousMsgs));
            if (traceNote) {
              messages.push({ role: 'system', content: traceNote });
            }
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

      // Inject file context from freshly-attached files AND from sources the user
      // picked in the Data Room.
      //
      // `source_ids` are cre_evidence_sources identities; they resolve back to the
      // uploads their bytes live in and then take exactly the same tenant-scoped
      // path as an attachment. One grounding mechanism, two ways of choosing — a
      // separate reader for selected sources would be a second thing to get
      // tenancy wrong in.
      const streamFileIds: string[] = [];
      if (Array.isArray(req.body.file_ids)) {
        for (const id of req.body.file_ids) {
          if (typeof id === 'string' && id && !streamFileIds.includes(id)) streamFileIds.push(id);
        }
      }
      if (Array.isArray(req.body.source_ids) && req.body.source_ids.length > 0) {
        try {
          const { resolveSourceUploadIds } = await import(
            '../../services/clinical-regulatory-evidence/evidence-spine.service.js'
          );
          const fromSources = await resolveSourceUploadIds(
            Number(orgId),
            req.body.source_ids as Array<number | string>
          );
          if (fromSources.length < req.body.source_ids.length) {
            // A selected source with no readable upload must not pass silently —
            // the user chose it expecting it to be read.
            console.warn(
              `[AnA RI Stream] ${req.body.source_ids.length - fromSources.length} of ${
                req.body.source_ids.length
              } selected source(s) have no readable upload`
            );
          }
          for (const id of fromSources) {
            if (!streamFileIds.includes(id)) streamFileIds.push(id);
          }
        } catch (srcErr: any) {
          console.warn('[AnA RI Stream] Source selection resolution failed:', srcErr?.message);
        }
      }
      if (streamFileIds.length > 0) {
        try {
          // Tenant scoping is enforced by the shared helper, which checks BOTH
          // the organization column and the storage-path prefix. This route used
          // to hand-roll `WHERE ... AND organization_id = $2` against a table
          // whose INSERT never wrote that column, so the lookup always returned
          // zero rows and every attachment was silently dropped.
          const { loadUploadedFileMetadata } = await import(
            '../../services/ana/uploaded-file-access.js'
          );
          const attachedFiles = await loadUploadedFileMetadata(
            streamFileIds,
            orgId != null ? Number(orgId) : null
          );
          if (attachedFiles.length < streamFileIds.length) {
            console.warn(
              `[AnA RI Stream] ${streamFileIds.length - attachedFiles.length} of ${
                streamFileIds.length
              } attachment(s) not resolvable for this tenant`
            );
          }
          if (attachedFiles.length > 0) {
            const fileContext = attachedFiles
              .map(f => `- ${f.fileName} (${f.mimeType}) [ID: ${f.fileId}]`)
              .join('\n');
            messages.push({
              role: 'user' as const,
              content: `[The user has attached the following files:\n${fileContext}\nReference these files in your response when relevant.]`,
            });

            // PDF intake: when enabled, send the actual bytes inline as base64
            // document blocks so ANA can READ the file, not just see its name.
            // GA path (no beta header). Capped per file to stay within the
            // model's document limit; oversize/unreadable files degrade to the
            // metadata-only mention above.
            if (isPdfIntakeEnabled()) {
              const MAX_DOC_BYTES = 30 * 1024 * 1024; // ~30MB raw, under Anthropic's limit
              for (const f of attachedFiles) {
                const mime = (f.mimeType || '').toLowerCase();
                const docMime: 'application/pdf' | 'text/plain' | null =
                  mime === 'application/pdf'
                    ? 'application/pdf'
                    : mime === 'text/plain' || mime === 'text/markdown'
                    ? 'text/plain'
                    : null;
                if (!docMime || !f.storagePath) continue;
                const buf = await readLocalUploadBuffer(f.storagePath);
                if (!buf || buf.length === 0 || buf.length > MAX_DOC_BYTES) continue;
                messages.push({
                  role: 'user' as const,
                  content: `Read the attached document "${f.fileName}" and use it to answer.`,
                  contentBlocks: [
                    {
                      type: 'document',
                      source: { type: 'base64', media_type: docMime, data: buf.toString('base64') },
                      title: f.fileName,
                    },
                    { type: 'text', text: `Attached document: ${f.fileName}` },
                  ],
                });
              }
            }
          }
        } catch (fileErr: any) {
          // Non-blocking: the turn still runs without the attachment. But it must
          // not fail silently — a swallowed error here is indistinguishable to
          // the user from "AnA read my file and ignored it".
          console.warn('[AnA RI Stream] Attachment context failed:', fileErr?.message);
        }
      }

      // Default path uses `effectiveMessage` unchanged. Only when
      // PROMPT_INJECTION_ENCAPSULATE is enabled does the guard hand back the
      // injection-resistant encapsulated form for the model to see as data.
      messages.push({
        role: 'user',
        content: injectionGuard.encapsulated ? injectionGuard.text : effectiveMessage,
      });

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
            detectedDocumentTemplate: orchestration.detectedDocumentTemplate
              ? ({
                  id: orchestration.detectedDocumentTemplate.template.id,
                  displayName: orchestration.detectedDocumentTemplate.template.displayName,
                  chipLabel: orchestration.detectedDocumentTemplate.template.chipLabel,
                  authority: orchestration.detectedDocumentTemplate.template.authority,
                  submissionFamily:
                    orchestration.detectedDocumentTemplate.template.submissionFamily,
                  confidence: orchestration.detectedDocumentTemplate.confidence,
                  // Forward the document's section structure so the client can
                  // render the ICH/FDA outline. `guidance` is deliberately dropped
                  // — it is prompt material, not UI. See WO-3 / shared contract.
                  sections: orchestration.detectedDocumentTemplate.template.sections.map(s => ({
                    heading: s.heading,
                    code: s.code,
                    required: s.required,
                    targetWords: s.targetWords,
                  })),
                } satisfies DetectedDocumentTemplatePayload)
              : null,
            appliedRole: orchestration.appliedRole,
            activeWorkstream: orchestration.activeWorkstream,
            workstreamHandoff: orchestration.workstreamHandoff,
            suggestedActions: orchestration.suggestedActions,
          },
        })}\n\n`
      );

      // Effort (Fast/Balanced/Thorough) resolved early so output headroom and
      // reasoning depth can both scale with it. An unknown/absent value resolves
      // to 'balanced' (never a 4xx).
      const effortUsed = resolveEffortLevel(effort_level);

      // Routing plan — output budget scales with effort (Thorough drafting gets
      // more room; the planner still clamps to its own [512, 8192] range).
      const routingPlan = planKernelExecution({
        route: '/api/ana-ri/stream',
        messageLength: message.length,
        intentLens: orchestration.detectedIntent.lens,
        intentConfidence: orchestration.detectedIntent.confidence,
        submissionType: orchestration.detectedSubmissionType,
        requestedMaxTokens: resolveOutputBudget(effortUsed),
      });

      const policyHint = await getKernelPolicyHint({
        organizationId: orgId ? Number(orgId) : null,
        route: '/api/ana-ri/stream',
        taskType: routingPlan.taskType,
      });

      // ── Model / effort picker (flag-gated client; server is permissive) ──────
      // Effort (resolved above) is a calm Fast/Balanced/Thorough abstraction over
      // routing strategy.
      const effortStrategy = resolveEffortStrategy(effortUsed);

      // Governance-safe precedence: a kernel-pinned policyHint ALWAYS wins, so a
      // user's effort choice can never override a governance-pinned strategy. When
      // no policy hint is present, effort takes effect; else the routing plan.
      const selectedStrategy = resolveStrategyWithPrecedence({
        policyHintStrategy: policyHint?.preferredStrategy,
        effortStrategy,
        routingPlanStrategy: routingPlan.strategy,
      });

      // Optional explicit model override. Validated against THIS tenant's enabled
      // model set; an invalid / disabled / absent value is DROPPED SILENTLY and we
      // fall back to the (effort-derived) strategy above. The override does not
      // bypass governance — the gateway still enforces residency/ZDR placement.
      // In deterministic mode (or any gateway substrate without a model registry)
      // there is nothing to override against — pass an empty set so the override
      // resolves to none and we fall back to the effort-derived strategy.
      const overrideCandidates =
        typeof gw.getModels === 'function' ? gw.getModels().filter(m => m.enabled) : [];
      const resolvedOverride = resolveModelOverride(model_override, overrideCandidates);

      // Substantive-turn signal — drives BOTH the reasoning depth and the cost
      // tier below, computed once so they agree.
      const substantiveTurn = isSubstantiveTurn({
        messageLength: typeof message === 'string' ? message.length : 0,
        intentLens: orchestration.detectedIntent?.lens,
      });

      // ── Cost-tiered model selection ──────────────────────────────────────────
      // Keep the everyday path off the expensive flagship: Economy (Haiku) for
      // routine turns, Standard (Sonnet) for real drafting/review, Flagship (Opus)
      // only for a high kernel risk-tier or an explicit Thorough request. So the
      // expensive model is the exception, not the default. This yields to an
      // explicit user model pin and to a governance-pinned strategy, only uses
      // enabled registry models (per-deployment tier remap via ANA_TIER_*_MODEL),
      // and is opt-out via ANA_MODEL_TIERING=off.
      const tieredModel = (() => {
        if (resolvedOverride) return null; // user pinned a specific model
        if (policyHint?.preferredStrategy) return null; // governance owns the strategy
        if ((process.env.ANA_MODEL_TIERING ?? 'on').toLowerCase() === 'off') return null;
        const tier = resolveModelTier({
          effort: effortUsed,
          riskTier: routingPlan.riskTier,
          intentLens: orchestration.detectedIntent?.lens,
          taskType: routingPlan.taskType,
          substantive: substantiveTurn,
        });
        return resolveTierModel(tier, overrideCandidates, process.env);
      })();

      let fullContent = '';
      // AnA's extended-thinking / reasoning accumulated across the turn (first
      // model call + every agentic follow-up round). Streamed live as `thinking`
      // events AND persisted on the assistant message metadata by post-processing
      // so the thought process survives reload and is auditable — it was
      // previously live-only and lost on reload.
      let fullThinking = '';
      // Human control actions taken against this run (pause/resume/interject/
      // cancel), persisted on the assistant metadata so a mid-run redirection is
      // part of the auditable decision lineage. Populated by the loop checkpoint.
      const controlEvents: HumanControlEvent[] = [];
      // A steering interjection queued by the checkpoint, spliced into the next
      // model turn's user message (same mechanism as the adaptation note).
      let pendingInterjection = '';
      // Structured record of the tools run this turn (persisted on the assistant
      // message's metadata for cross-turn memory; see tool-trace.ts).
      const toolTrace: ToolTraceEntry[] = [];
      // Failure-adaptation guidance from the most recent tool round; appended to
      // the next model turn (then cleared) so a failed round becomes a course
      // correction instead of an identical retry the thrash guard has to kill.
      let pendingAdaptationNote = '';
      // Raw tool output this turn — the evidence corpus the final answer is
      // verified against in the self-verification round (see answer-grounding.ts).
      const toolEvidenceCorpus: string[] = [];
      // Provenance envelopes emitted by evidence tools this turn — persisted to the
      // durable lineage trail (data_lineage_records) by post-processing. Capped so a
      // pathological multi-round turn can't accumulate unbounded records.
      const collectedProvenance: ProvenanceRecord[] = [];
      const PROVENANCE_CAP = 200;
      // Validated navigation directives from `navigate_to` this turn. Post-processing
      // turns them into `actionType: 'navigate'` chips on `post_done`, which is the
      // only path from a model decision to a screen change — see
      // services/ana-ri/navigation-actions.ts for why it is tool-driven and offered
      // rather than performed.
      const collectedNavigation: NavigationDirective[] = [];
      // Validated surface-action directives from `act_on_screen` this turn —
      // same carrier contract: offered as chips by post-processing, applied
      // live under Drive within the mode's action budget.
      const collectedSurfaceActions: SurfaceActionDirective[] = [];
      // Live Drive: how many directives were emitted for immediate application
      // this turn, per kind. Budgets come from the shared per-mode policy
      // (assist = the chip budget, so driving can never move a person more
      // times than offering would have offered; demo = a full-tour allowance).
      const driveBudget = driveBudgetFor(driveState.mode);
      let driveNavigationsApplied = 0;
      let driveActionsApplied = 0;
      // Document drafts emitted this turn — persisted to the governed artifact
      // version history (concept2cure_artifacts / _artifact_versions) by
      // post-processing so Document Studio version history survives the session.
      const collectedDrafts: {
        title: string;
        content: string;
        documentType?: string;
        reasonForChange?: string;
      }[] = [];

      // Stream via gateway
      const streamGatewayStart = Date.now();
      // Extended thinking — effort-scaled reasoning policy (see reasoning.ts).
      // AnA reasons on genuinely substantive turns by default (Balanced), not only
      // when the kernel flags high risk, and reasons harder on Thorough. Casual
      // one-line turns stay Fast so greetings never pay reasoning latency. On the
      // flagship reasoning-only model thinking is adaptive (self-budgeting); the
      // budget hint only bites the legacy fallback surface, where the gateway
      // clamps it below max_tokens. Gateway forces temperature=1 when thinking is
      // enabled on that legacy surface. (substantiveTurn computed above.)
      const streamThinkingResolved = resolveThinkingConfig({
        effort: effortUsed,
        riskTier: routingPlan.riskTier,
        // A demonstration turn runs a validated script — per-round private
        // reasoning would only slow the tour down, so demo drops the
        // substantive nudge. High-stakes ('high' riskTier) and an explicit
        // Thorough effort still reason: resolveThinkingConfig enables those
        // regardless of this flag, so governance keeps its floor.
        substantive:
          substantiveTurn && !(driveState.enabled && driveState.mode === 'demo'),
      });
      const streamThinkingConfig = streamThinkingResolved.enabled
        ? streamThinkingResolved
        : undefined;
      // Full tool suite on the streaming path: custom JSON-schema tools
      // (PubMed search, FDA guidance lookup, predicate device analysis, etc.)
      // plus any env-enabled Anthropic server tools (web_search, web_fetch,
      // code_execution). Server tools resolve in Anthropic's infra; custom
      // tools dispatch locally via the single-round agentic block below.
      // Per-tenant tool governance: a tenant can disable individual tools
      // (e.g. outbound FDA letters, adverse-event lookups) via
      // organizations.settings.anaToolPolicy.deny. Honour the deny-list on
      // the assembled toolset so disabled tools are never offered to the
      // model. Loader is fail-open (default-allow) on any DB issue.
      const allTools = getAllEnabledTools();
      const toolPolicy = await toolPolicyPromise;
      // Governance first (tenant deny-list), then offer the subset relevant to this
      // turn's intent + context. The platform command bridge is always retained, so
      // intent selection never removes a capability — anything dropped stays
      // reachable through execute_platform_command. User-pinned tools are honoured.
      const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
      const streamTools = selectToolsForTurn(
        filterToolsByPolicy(allTools, toolPolicy),
        typeof message === 'string' ? message : '',
        {
          // A driving turn MUST be offered the self-drive tools whatever the
          // message's wording scores — a demo ask like "run the sales demo"
          // must never lose navigate_to/act_on_screen to relevance trimming.
          pinned: [
            ...(Array.isArray(selected_tools)
              ? selected_tools.filter((t: unknown): t is string => typeof t === 'string')
              : []),
            ...(driveState.enabled
              ? [
                  'list_app_screens',
                  'navigate_to',
                  'list_screen_actions',
                  'act_on_screen',
                  'list_demo_scripts',
                  'start_product_demo',
                ]
              : []),
          ],
          context: {
            projectType: asStr(submission_type),
            documentType: asStr(document_context),
            surface: asStr(intent_lens) ?? asStr(authoring_context),
          },
          // Reliability-aware: trim currently-unhealthy tools first when over the cap
          // (the always-on core + platform bridge are unaffected). Per-tenant when an
          // org is in context, else the global view.
          deprioritize: new Set(getUnhealthyTools(3, orgId ?? undefined).map(t => t.tool)),
        }
      );

      const gwResponse = await gw.route({
        taskType: routingPlan.taskType,
        messages,
        maxTokens: routingPlan.maxTokens,
        temperature: routingPlan.temperature,
        strategy: selectedStrategy,
        // Explicit-model path: a user pin wins; otherwise the cost tier picks the
        // model (Economy/Standard/Flagship). Either hands the gateway an explicit
        // provider+model so selectModel() short-circuits to it (still subject to
        // placement/health). With neither, the effort-derived strategy selects.
        ...(resolvedOverride
          ? { provider: resolvedOverride.provider, model: resolvedOverride.model }
          : tieredModel
          ? { provider: tieredModel.provider, model: tieredModel.model }
          : {}),
        promptCache: { enabled: true, type: 'ephemeral' },
        ...(streamThinkingConfig ? { thinking: streamThinkingConfig } : {}),
        ...(streamTools.length > 0 ? { tools: streamTools } : {}),
        stream: true,
        onStream: (chunk: string, metadata?: any) => {
          // Cancelled mid-generation → stop emitting (and accumulating) at once.
          // The underlying model call finishes server-side (the gateway exposes
          // no abort signal), but the user sees output halt immediately.
          if (runControlRegistry.isCancelled(runId)) return;
          const hasOutputDelta =
            Boolean(chunk) || (metadata?.type === 'thinking' && Boolean(metadata?.thinkingContent));
          if (hasOutputDelta && streamFirstTokenMs === undefined) {
            streamFirstTokenMs = Date.now() - streamPhaseStart;
          }
          // Extended-thinking deltas arrive with chunk='' and the thinking
          // text in metadata.thinkingContent. Forward them as a separate
          // SSE event type so the client can render reasoning in a
          // collapsible section and keep it out of the answer prose.
          if (metadata?.type === 'thinking') {
            const thinkingChunk: string = metadata?.thinkingContent || '';
            if (thinkingChunk) {
              fullThinking += thinkingChunk;
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

      // Multi-round agentic tool execution via the orchestrator
      // (server/services/ana/agentic-loop.ts): the model proposes tool calls, we
      // execute them and stream transparency, then feed the results back so it can
      // chain another step (extract structure → search → compare versions) or
      // produce a grounded answer. Bounded + thrash-resistant; the loop core is
      // unit-tested independently of the gateway and this SSE transport.
      const streamToolUses = (gwResponse as AnaGatewayResponse).toolUses;
      if (streamToolUses && streamToolUses.length > 0) {
        const toToolCall = (c: {
          id: string;
          name: string;
          input?: Record<string, unknown>;
        }): ToolCall => ({
          id: c.id,
          name: c.name,
          input: (c.input ?? {}) as Record<string, unknown>,
        });

        // Execute one round: announce the step, stream tool_use/result events, run
        // the handler, log telemetry, and surface any generated document draft.
        const executeTools = async (
          calls: ToolCall[],
          round: number
        ): Promise<ToolResultEntry[]> => {
          /* Say what she is actually doing right now.
           *
           * The last status before this point is `generating`, and the client
           * clears the phase outright on the first `tool_use`. So the tool loop
           * ran with NO live line at all: settled rows, nothing saying she was
           * still going. That clearing was correct when the rail rendered the
           * phase as its single line — a phase and a tool row competed for the
           * same slot. The work record renders them as different things (the
           * round, and the steps within it), so they now coexist and the round
           * gets to speak.
           *
           * Both numbers are read off the real round: `calls.length` is what the
           * model actually asked for this pass, and `round` is the real
           * agentic-loop round, so a second pass says so rather than looking like
           * a slow first one. The step LABELS are deliberately not repeated —
           * they are already the rows directly beneath this line. */
          const stepCount = calls.length;
          const stepWord = stepCount === 1 ? 'step' : 'steps';
          res.write(
            `data: ${JSON.stringify({
              type: 'status',
              phase: 'running_tools',
              message:
                round === 1
                  ? `Running ${stepCount} ${stepWord}…`
                  : `Round ${round} — running ${stepCount} more ${stepWord}…`,
            })}\n\n`
          );
          res.write(
            `data: ${JSON.stringify({
              type: 'step',
              round,
              tools: calls.map(c => c.name),
              plan: describeToolPlan(calls),
            })}\n\n`
          );
          // Announce all tool invocations in order, then run their handlers with
          // bounded concurrency (network-bound tools like PubMed/ClinicalTrials
          // run in parallel), and finally emit results in the original order so
          // the client UI stays deterministic.
          for (const toolUse of calls) {
            res.write(
              `data: ${JSON.stringify({
                type: 'tool_use',
                round,
                name: toolUse.name,
                label: describeToolPlan([toolUse])[0].label,
                input: toolUse.input,
              })}\n\n`
            );
          }
          const ran = await mapWithConcurrency(
            calls,
            async toolUse => {
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
                    // Lets navigate_to tell the model the truth about what its
                    // directive does this turn (applied live vs offered chip).
                    liveDrive: driveState.enabled,
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
                resultStr = JSON.stringify({
                  note: `No local handler for ${toolUse.name}; may be a server-resolved tool.`,
                });
                toolStatus = 'not_found';
              }
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
              // The same server-measured duration the telemetry row gets, so the
              // client's work panel can show how long each step really took
              // rather than timing the round-trip from its own side.
              return { toolUse, resultStr, toolStatus, toolErrorMessage, latencyMs: Date.now() - toolStart };
            },
            4
          );

          const entries: ToolResultEntry[] = [];
          const roundFailures: FailedToolCall[] = [];
          for (const { toolUse, resultStr, toolStatus, toolErrorMessage, latencyMs } of ran) {
            entries.push({ tool_use_id: toolUse.id, content: resultStr, name: toolUse.name });
            const stepLabel = describeToolPlan([toolUse])[0].label;
            // Record this call in the turn's tool-trace memory + evidence corpus.
            toolTrace.push(buildTraceEntry(toolUse.name, stepLabel, toolStatus, resultStr));
            // Failures collected for the round's adaptation note (see below).
            if (toolStatus !== 'success') {
              roundFailures.push({
                name: toolUse.name,
                label: stepLabel,
                error:
                  toolErrorMessage ||
                  (toolStatus === 'not_found' ? 'no handler available' : undefined),
              });
            }
            // Calm, human-facing message for a non-success step so the client can
            // render an honest state ("AnA couldn't finish X") instead of a raw
            // error string — trust is the interface, including when something
            // fails. The lower-cased label reads naturally mid-sentence.
            const humanStep = stepLabel.charAt(0).toLowerCase() + stepLabel.slice(1);
            const humanMessage =
              toolStatus === 'error'
                ? `AnA couldn't finish ${humanStep}. She'll continue with what she has.`
                : toolStatus === 'not_found'
                ? `This step (${humanStep}) isn't available here. AnA will work around it.`
                : undefined;
            res.write(
              `data: ${JSON.stringify({
                type: 'tool_result',
                round,
                name: toolUse.name,
                label: stepLabel,
                status: toolStatus,
                latencyMs,
                ...(humanMessage ? { message: humanMessage } : {}),
                result: resultStr,
              })}\n\n`
            );
            if (toolStatus === 'success') {
              try {
                const parsed = JSON.parse(resultStr);
                // Accumulate any provenance envelope this evidence tool emitted, for
                // durable persistence to the lineage trail in post-processing.
                if (Array.isArray(parsed?.provenance)) {
                  for (const p of parsed.provenance) {
                    if (collectedProvenance.length >= PROVENANCE_CAP) break;
                    if (p && typeof p === 'object') collectedProvenance.push(p as ProvenanceRecord);
                  }
                }
                // A validated navigation target AnA resolved this turn. Collected
                // here, offered as a chip by post-processing; a refused target
                // (unknown id, missing param) yields null and never becomes one.
                const directive = directiveFromToolResult(toolUse.name, resultStr);
                if (directive) {
                  collectedNavigation.push(directive);
                  // Live Drive: the person opted in and is entitled, so the
                  // directive is ALSO emitted now for immediate application —
                  // budgeted per mode, audited, and re-validated client-side
                  // against the same shared registry before the screen moves.
                  if (driveState.enabled && driveNavigationsApplied < driveBudget.navigations) {
                    driveNavigationsApplied += 1;
                    res.write(
                      `data: ${JSON.stringify(buildDriveNavigationEvent(directive, round))}\n\n`
                    );
                    auditDriveNavigation(
                      {
                        organizationId: orgId,
                        userId: userId ?? null,
                        threadId,
                        runId,
                        round,
                        directive,
                        driveMode: driveState.mode,
                      },
                      entry => auditService.logAction(entry)
                    );
                  }
                }
                // A validated surface action AnA resolved this turn — the same
                // carrier contract as navigation: chip via post-processing,
                // applied live under Drive within the mode's action budget,
                // audited per applied operation, client re-validates and only
                // performs through a handler the mounted surface registered.
                const actionDirective = surfaceActionFromToolResult(toolUse.name, resultStr);
                if (actionDirective) {
                  collectedSurfaceActions.push(actionDirective);
                  if (driveState.enabled && driveActionsApplied < driveBudget.actions) {
                    driveActionsApplied += 1;
                    res.write(
                      `data: ${JSON.stringify(buildDriveActionEvent(actionDirective, round))}\n\n`
                    );
                    auditDriveAction(
                      {
                        organizationId: orgId,
                        userId: userId ?? null,
                        threadId,
                        runId,
                        round,
                        directive: actionDirective,
                        driveMode: driveState.mode,
                      },
                      entry => auditService.logAction(entry)
                    );
                  }
                }
                if (parsed?.status === 'intelligence_question' && parsed.question) {
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'intelligence_question',
                      question: parsed.question,
                      flowState: parsed.flowState,
                    })}\n\n`
                  );
                }
                if (parsed?.status === 'intelligence_flow_complete' && parsed.completion) {
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'intelligence_flow_complete',
                      completion: parsed.completion,
                      flowState: parsed.flowState,
                    })}\n\n`
                  );
                }
                // War Game report — forward to client as a dedicated SSE event
                if (parsed?.war_game_report) {
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'war_game_report',
                      report: parsed.war_game_report,
                    })}\n\n`
                  );
                }
                // Reporting Canvas — a governed report render or a best-practices
                // suggestion set from the reporting tools. Forwarded verbatim so the
                // client canvas renders it (report → ReportView; suggestions → chips).
                if (parsed?.report_canvas) {
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'report_canvas',
                      canvas: parsed.report_canvas,
                      source: toolUse.name,
                    })}\n\n`
                  );
                }
                if (
                  parsed &&
                  parsed.status === 'generated' &&
                  typeof parsed.content === 'string' &&
                  parsed.content.length > 0
                ) {
                  const draftTitle: string = parsed.title || 'Generated document';
                  // Record for durable version-history persistence in post-processing.
                  collectedDrafts.push({
                    title: draftTitle,
                    content: parsed.content,
                    documentType:
                      typeof parsed.documentType === 'string' ? parsed.documentType : undefined,
                    reasonForChange:
                      typeof parsed.reasonForChange === 'string'
                        ? parsed.reasonForChange
                        : undefined,
                  });
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'artifact_draft',
                      title: draftTitle,
                      content: parsed.content,
                      documentType: parsed.documentType,
                      source: toolUse.name,
                    })}\n\n`
                  );
                }
              } catch {
                // Non-JSON tool result — nothing to surface as a draft.
              }
            }
          }

          // Budget the whole round's results before they reach the model, so a
          // many-tool round can't bloat every later round's context (deep loops
          // carry all prior results forward). Small rounds pass through under the
          // classic per-result caps, byte-identical to before.
          const budgeted = budgetToolResultsForModel(entries);
          // Ground against what the MODEL saw, not the raw results. If the
          // grounding round verified the answer against fuller text than the model
          // was fed, a claim sitting in the truncated-away middle would be marked
          // "grounded" though the model never read it — a false pass in the one
          // direction that lets a fabrication through. The corpus therefore gets
          // exactly the budgeted strings the model gets.
          for (const b of budgeted) toolEvidenceCorpus.push(b.content);
          // Failure guidance for the next model turn (cleared after use).
          pendingAdaptationNote = buildAdaptationNote(roundFailures, calls.length);
          /* The round is done and the loop is about to hand these results back to
           * the model. That is a genuinely different activity from running the
           * tools, and it is the moment AnA decides whether she has enough or
           * goes back for more — so it gets its own line rather than leaving the
           * previous "Running N steps…" standing over work that has finished.
           *
           * This is also the longest silent window in a turn: the model may take
           * many seconds to compose from a full round of results, and until this
           * existed the user watched settled rows with no sign anything was still
           * happening. */
          res.write(
            `data: ${JSON.stringify({
              type: 'status',
              phase: 'reading_results',
              message: 'Reading the results…',
            })}\n\n`
          );
          return budgeted;
        };

        // Call the model with the latest tool results, streaming its narration. On
        // the terminal round includeTools is false to force a grounded answer.
        const loopMessages: GatewayMessage[] = [...messages];
        const callModel = async (
          results: ToolResultEntry[],
          priorText: string,
          round: number,
          includeTools: boolean
        ): Promise<ModelTurn> => {
          loopMessages.push({ role: 'assistant', content: priorText || '' });
          // Entries arrive pre-budgeted from executeTools, so the per-result cap
          // here is a no-op safety net. The adaptation note (when a tool failed
          // last round) rides the same user turn so the model course-corrects
          // instead of retrying the identical call.
          const adaptationSuffix = pendingAdaptationNote ? `\n\n${pendingAdaptationNote}` : '';
          pendingAdaptationNote = '';
          // A human interjection queued at the round boundary rides the same user
          // turn as the tool results so the model course-corrects toward the steer
          // on this round. `pendingInterjection` already carries its own label.
          const interjectionSuffix = pendingInterjection;
          pendingInterjection = '';
          loopMessages.push({
            role: 'user',
            content:
              results
                .map(
                  tr =>
                    `[Tool Result for ${tr.name} (${tr.tool_use_id})]:\n${capToolResultForModel(
                      tr.content
                    )}`
                )
                .join('\n\n') +
              adaptationSuffix +
              interjectionSuffix,
          });

          // Model tiering (S3) — opt-in via ANA_LOOP_TIERING=on, default OFF so
          // production behavior is byte-identical until deliberately enabled and
          // validated. When on, intermediate follow-up rounds (round >= 2 that
          // still carry tools) run on the latency-optimized tier so routine
          // tool-result summarization stops paying top-tier latency. It NEVER
          // downgrades a user-pinned model (resolvedOverride) and NEVER the forced
          // final grounded answer (includeTools === false) — that stays on the
          // resolved strategy, so the truthfulness/quality of the answer the user
          // reads is unchanged.
          const roundStrategy =
            process.env.ANA_LOOP_TIERING === 'on' && !resolvedOverride && includeTools && round >= 2
              ? 'latency_optimized'
              : selectedStrategy;

          let roundText = '';
          const roundResponse = await gw.route({
            taskType: routingPlan.taskType,
            messages: loopMessages,
            maxTokens: routingPlan.maxTokens,
            temperature: routingPlan.temperature,
            strategy: roundStrategy,
            // Keep the same explicit model (user pin or cost tier) across the
            // agentic follow-up rounds so the whole turn stays on one tier.
            ...(resolvedOverride
              ? { provider: resolvedOverride.provider, model: resolvedOverride.model }
              : tieredModel
              ? { provider: tieredModel.provider, model: tieredModel.model }
              : {}),
            promptCache: { enabled: true, type: 'ephemeral' },
            ...(includeTools && streamTools.length > 0 ? { tools: streamTools } : {}),
            stream: true,
            onStream: (chunk: string, metadata?: any) => {
              if (runControlRegistry.isCancelled(runId)) return;
              if (metadata?.type === 'thinking') {
                const thinkingChunk: string = metadata?.thinkingContent || '';
                if (thinkingChunk) {
                  fullThinking += thinkingChunk;
                  res.write(
                    `data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}\n\n`
                  );
                }
                return;
              }
              roundText += chunk;
              fullContent += chunk;
              res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            },
            callerModule: 'ana-ri-stream-followup',
          });
          if (!roundText && roundResponse.content) {
            roundText = roundResponse.content;
            fullContent += (fullContent ? '\n\n' : '') + roundText;
            res.write(`data: ${JSON.stringify({ type: 'text', content: roundText })}\n\n`);
          }
          const nextUses = (roundResponse as AnaGatewayResponse).toolUses;
          return { text: roundText, toolCalls: (nextUses ?? []).map(toToolCall) };
        };

        // Round-boundary human control. Consulted by the loop before each round:
        // hold while paused, splice queued interjections into the next model turn,
        // and abort on cancel. Every action is recorded onto controlEvents so the
        // redirection is part of the turn's auditable decision lineage.
        let pauseAnnounced = false;
        const emitControl = (obj: Record<string, unknown>) => {
          if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
        };
        const recordControl = (
          action: HumanControlEvent['action'],
          round: number,
          message?: string
        ) => {
          controlEvents.push({ action, message, round, at: new Date().toISOString() });
        };
        const checkpoint = async (upcomingRound: number): Promise<'continue' | 'abort'> => {
          if (runControlRegistry.isCancelled(runId)) {
            emitControl({ type: 'cancelled', round: upcomingRound });
            recordControl('cancel', upcomingRound);
            return 'abort';
          }

          // Pause: hold at the round boundary until resumed / cancelled, with a
          // safety timeout so an abandoned pause can never hang the request.
          const PAUSE_POLL_MS = 200;
          const MAX_PAUSE_MS = 10 * 60 * 1000;
          const pauseStart = Date.now();
          while (runControlRegistry.getStatus(runId) === 'paused') {
            if (!pauseAnnounced) {
              emitControl({ type: 'paused', round: upcomingRound });
              recordControl('pause', upcomingRound);
              pauseAnnounced = true;
            }
            if (res.writableEnded) {
              runControlRegistry.requestCancel(runId);
              break;
            }
            if (Date.now() - pauseStart > MAX_PAUSE_MS) {
              runControlRegistry.requestResume(runId);
              break;
            }
            await new Promise(r => setTimeout(r, PAUSE_POLL_MS));
          }
          if (pauseAnnounced && runControlRegistry.getStatus(runId) === 'running') {
            emitControl({ type: 'resumed', round: upcomingRound });
            recordControl('resume', upcomingRound);
            pauseAnnounced = false;
          }

          // Interjections: splice each queued steer into the next model turn.
          for (const inj of runControlRegistry.consumeInterjections(runId)) {
            pendingInterjection += `\n\n[User interjection]: ${inj}`;
            emitControl({ type: 'interjected', round: upcomingRound, message: inj });
            recordControl('interject', upcomingRound, inj);
          }

          if (runControlRegistry.isCancelled(runId)) {
            emitControl({ type: 'cancelled', round: upcomingRound });
            recordControl('cancel', upcomingRound);
            return 'abort';
          }
          return 'continue';
        };

        await runAgenticToolLoop(
          { text: fullContent, toolCalls: streamToolUses.map(toToolCall) },
          { executeTools, callModel, checkpoint },
          // Effort-scaled agentic depth: Thorough can chase a multi-tool
          // investigation all the way down; Balanced clears the old flat cap of 5.
          // The ceiling is soft — a loop still discovering novel ground earns up
          // to resolveRoundExtension() extra rounds; a circling loop never does.
          {
            // Demo mode raises (never lowers) the ceiling: a narrated tour
            // spends roughly one round per stop, so a full script must not be
            // cut off at the effort ceiling mid-demonstration.
            maxRounds:
              driveState.enabled && driveState.mode === 'demo'
                ? Math.max(resolveMaxRounds(effortUsed), DEMO_MAX_ROUNDS)
                : resolveMaxRounds(effortUsed),
            progressExtension: resolveRoundExtension(effortUsed),
          }
        );
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
          firstTokenMs: streamFirstTokenMs,
        },
        cache:
          (gwResponse as any)?.cacheHit !== undefined
            ? {
                hit: (gwResponse as any).cacheHit,
                stats: (gwResponse as any).cacheStats || undefined,
              }
            : undefined,
        memory: streamMemoryDiag
          ? {
              layerOutcomes: streamMemoryDiag.layerOutcomes,
              workingMemoryMode: streamMemoryDiag.workingMemoryMode,
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
              workingMemoryMode: streamMemoryDiag.workingMemoryMode,
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
          // The cost tier the router selected (economy/standard/flagship), or null
          // when tiering yielded (user pin / governance strategy / opt-out). Lets
          // ops confirm the everyday path is staying off the flagship. Additive.
          modelTier: tieredModel?.tier ?? null,
          // Echo the resolved effort back so the client can confirm what ran (the
          // effort the server actually used — which may differ from the request
          // when a governance policyHint pinned the strategy). Additive field.
          effortUsed,
          usage: gwResponse.usage,
          latencyMs: gwResponse.latencyMs,
          response: fullContent || undefined,
          telemetry: streamTelemetry,
        })}\n\n`
      );

      // AnA's relational self-development: reflect on this turn and update her
      // notes about the user + project (throttled inside; background only).
      void reflectAfterTurn({
        organizationId: orgId ? Number(orgId) : null,
        userId: typeof userId === 'number' ? userId : Number(userId) || null,
        projectId: streamProjectId != null ? Number(streamProjectId) : null,
        userMessage: message,
        assistantMessage: fullContent,
      }).catch(() => {});

      // Background post-processing. We intentionally do NOT await this at the
      // top level — the client already has `done`. When the executors finish
      // (or fail) we emit `post_done` with cleanedResponse + executed actions/
      // commands + evidence, then close the stream.
      void runStreamPostProcessing({
        res,
        fullContent,
        persistenceFailed,
        streamProjectId,
        orgId,
        userId: typeof userId === 'number' ? userId : undefined,
        threadId: threadId ?? undefined,
        userName: (req as any).user?.name,
        effectiveRole,
        sectionCode,
        toolTrace,
        reasoning: fullThinking,
        humanControls: controlEvents,
        toolEvidenceCorpus,
        collectedProvenance,
        collectedNavigation,
        collectedSurfaceActions,
        collectedDrafts,
        messages,
        model: gwResponse.model,
        provider: gwResponse.provider,
        enrichment,
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
    } finally {
      // Control state is only needed while the run is live; drop it once the
      // handler returns (post-processing already holds the collected controlEvents
      // by reference, so this never races their persistence).
      if (runId) runControlRegistry.deregister(runId);
    }
  });

  /**
   * POST /api/ana-ri/stream/:runId/control
   *
   * Mid-run human control for an in-flight streaming turn: pause / resume /
   * interject a steer / cancel. The `runId` is the unguessable id the stream
   * emitted to the owning client as `run_started` (a bearer capability — only the
   * client that opened the stream holds it). The stream's round-boundary
   * checkpoint applies the requested control on the next round.
   *
   * Body: { action: 'pause' | 'resume' | 'interject' | 'cancel', message?: string }
   */
  router.post('/stream/:runId/control', (req: Request, res: Response) => {
    const runId = String(req.params.runId);
    const action = String(req.body?.action || '');
    const message = typeof req.body?.message === 'string' ? req.body.message : undefined;

    if (!runControlRegistry.has(runId)) {
      // 404 also covers the multi-instance case: control that lands on an instance
      // not running this stream simply reports the run as unknown here.
      return res.status(404).json({ ok: false, error: 'Run not found or already finished' });
    }

    let ok = false;
    switch (action) {
      case 'pause':
        ok = runControlRegistry.requestPause(runId);
        break;
      case 'resume':
        ok = runControlRegistry.requestResume(runId);
        break;
      case 'cancel':
        ok = runControlRegistry.requestCancel(runId);
        break;
      case 'interject':
        if (!message || !message.trim()) {
          return res
            .status(400)
            .json({ ok: false, error: 'interject requires a non-empty message' });
        }
        ok = runControlRegistry.requestInterject(runId, message);
        break;
      default:
        return res.status(400).json({ ok: false, error: `Unknown control action: ${action}` });
    }

    const snapshot = runControlRegistry.snapshot(runId);
    return res.status(ok ? 200 : 409).json({ ok, runId, action, status: snapshot?.status ?? null });
  });
}
