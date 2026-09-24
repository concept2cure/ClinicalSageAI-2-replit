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
  resolveApiEffort,
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
  saveChatMessage as saveMessage, programIdForThread } from '../../services/chat-thread-helpers.js';
import { planKernelExecution } from '../../services/kernel-router.js';
import { getKernelPolicyHint } from '../../services/kernel-adaptive-policy.js';
import { buildMemoryContextForChat } from '../../services/memory-context-assembler.js';
import { governedToolsetFor } from '../../services/ana/governed-toolset.js';
import { getToolHandler, servedModelOf } from '../../services/ana/AnaToolExecutor.js';
import { requestsGovernedDraft } from '../../services/ana/governed-write-tools.js';
import { getUnhealthyTools } from '../../services/ana/tool-telemetry.js';
import {
  directiveFromToolResult,
  surfaceActionFromToolResult,
  demoStartFromToolResult,
  type DemoStartDirective,
} from '../../services/ana-ri/navigation-actions.js';
import {
  resolveDriveState,
  buildDriveStateEvent,
  buildDriveNavigationEvent,
  buildDriveActionEvent,
  buildLiveDrivePromptBlock,
  buildOfferedMovesPromptBlock,
  auditDriveNavigation,
  auditDriveAction,
  driveBudgetFor,
  DEMO_MAX_ROUNDS,
} from '../../services/ana-ri/live-drive.js';
import auditService from '../../services/auditService.js';
import { parseLockedScreens } from '../../services/ana-ri/drive-context.js';
import type { NavigationDirective } from '../../../shared/navigation/index.js';
import type { SurfaceActionDirective } from '../../../shared/navigation/surface-actions.js';
import {
  runAgenticToolLoop,
  resolveMaxRounds,
  resolveRoundExtension,
  capToolResultForModel,
  assistantTurnContent,
  budgetToolResultsForModel,
  buildAdaptationNote,
  mapWithConcurrency,
  describeToolPlan,
  lostToolInputResult,
  abortRace,
  ToolRunCancelled,
  CANCELLED_TOOL_RESULT,
  type ToolCall,
  type ToolResultEntry,
  type ModelTurn,
  type FailedToolCall,
} from '../../services/ana/agentic-loop.js';
import { buildSteerMessage } from '../../services/ana/operator-channel.js';
import type { ProvenanceRecord } from '../../services/evidence/provenance.js';
import {
  buildTraceEntry,
  collectTracesFromHistory,
  formatTraceForContext,
  type ToolTraceEntry,
} from '../../services/ana/tool-trace.js';
import { runStreamPostProcessing } from './post-processing.js';
import { reflectAfterTurn } from '../../services/ana-ri/relational-profile-service.js';
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
import { invokedAppHints, invokedAppPins } from '../../services/ana-ri/invoked-apps-block.js';
import {
  sendError,
  extractRequestContext,
  ensureGateway,
  VALID_LENSES,
  VALID_ROLES,
  VALID_LANGUAGES,
} from './shared.js';
import {
  applyControl,
  beginRun,
  endRun,
  localOnlyRunHandle,
  readStatus,
  readRun,
  releaseLocalRun,
  consumeInterjections,
  requestApproval,
  recordApprovalDecision,
  readApprovalDecision,
  stopRunInternally,
  resumeAbandonedRun,
  reapOrphanedRuns,
  type RunHandle,
} from '../../services/ana/run-control.js';
import { MAX_PAUSE_MS, type HumanControlEvent } from '../../services/ana/run-status.js';
import { classifyToolCall } from '../../services/ana/governed-tool-gate.js';
import {
  describeServerToolStep,
  summariseServerToolResult,
} from '../../services/ana/server-tool-steps.js';
import type { GatewayServerToolUse } from '../../services/ai-gateway/types.js';
import { resolveOrgId, resolveUserId } from '../../types/auth-request.js';
import { clientIpOf } from '../../utils/client-ip';

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
    // pause / steer / cancel via the control endpoint. Declared out here so the
    // finally can always close the run. Empty when no run was opened.
    let runId = '';
    // The per-process half of the run: an abort signal and a wake latch, and
    // deliberately no status — see services/ana/run-control.ts. Undefined when
    // the request carried no resolvable tenant, in which case no run was opened
    // and the client was given no control strip to press.
    let runHandle: RunHandle | undefined;
    // Set in the catch so the finally can close the run honestly. A turn that
    // threw is `failed`, not `finished`.
    let streamFailed = false;
    // The run is closed exactly once, by whichever of the disconnect handler and
    // the finally block gets there first.
    let runSettled = false;
    // The tenant the run row was stamped with, for the turn-end read-back.
    let runOrgIdForEvents: number | null = null;
    // The round the keepalive stamps on each heartbeat. Updated at every
    // checkpoint so a reaped-and-resumed row still reports where it got to.
    let heartbeatRound = 0;
    /**
     * Prompt-cache totals for the WHOLE turn, every model call included.
     *
     * The telemetry reported only the first gateway call, so the agentic rounds
     * — which is where a turn spends most of its input tokens, and where a
     * cache miss costs the most because the conversation is longest — were
     * invisible. That made the one number the plan says to judge a caching
     * change by ("log cache_read_input_tokens across three consecutive turns;
     * if it is zero after, a silent invalidator is still in the prefix")
     * impossible to read honestly: a turn could report a healthy first-call hit
     * while every round behind it rebuilt the prefix.
     *
     * `missedCalls` is the one that answers the question. Reads and writes can
     * both look busy while half the calls are missing.
     */
    const turnCache = { calls: 0, missedCalls: 0, readTokens: 0, createTokens: 0 };
    const recordCacheUsage = (response: unknown): void => {
      const stats = (response as any)?.cacheStats;
      turnCache.calls += 1;
      if (!stats) {
        // No stats at all is not a hit. A provider that reports nothing and a
        // prefix that missed are different facts, but neither is a read.
        turnCache.missedCalls += 1;
        return;
      }
      const read = Number(stats.cacheReadInputTokens ?? 0);
      turnCache.readTokens += read;
      turnCache.createTokens += Number(stats.cacheCreationInputTokens ?? 0);
      if (read === 0) turnCache.missedCalls += 1;
    };
    /**
     * Put Anthropic-executed work — a web search, a web fetch — into AnA's work
     * trace, so the person sees it the same way they see her own tools.
     *
     * The gateway used to drop these blocks entirely, so a turn that searched
     * the web looked exactly like one that did not: the answer carried
     * citations while the step that found them was absent, and the trace read
     * as complete. That is the worst shape for a record to be wrong in.
     *
     * Each step is emitted as a `tool_use` AND its `tool_result`, back to back.
     * The client opens a "running" row on the first and resolves it on the
     * second, matched by name; emitting only the use would leave a spinner
     * running forever for work that had already finished — the interface
     * claiming something is in progress that is over.
     *
     * The result is summarised rather than forwarded: a web fetch returns a
     * whole document, and the trace needs what was consulted, not its text.
     */
    const emitServerToolSteps = (response: unknown, round: number): void => {
      const steps = (response as any)?.serverToolUses as GatewayServerToolUse[] | undefined;
      if (!steps || steps.length === 0 || res.writableEnded) return;
      for (const step of steps) {
        const label = describeServerToolStep(step);
        const status = step.isError ? 'error' : 'success';
        res.write(`data: ${JSON.stringify({ type: 'tool_use', round, name: step.name, label, input: step.input ?? {} })}\n\n`);
        res.write(
          `data: ${JSON.stringify({
            type: 'tool_result',
            round,
            name: step.name,
            label,
            status,
            ...(step.isError ? { message: 'This search did not return results.' } : {}),
            result: JSON.stringify(summariseServerToolResult(step)),
          })}\n\n`
        );
      }
    };
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
        locked_screens,
      } = req.body;
      // Screens closed to this person, from the shell's copy of the server's
      // own verdict set — the self-drive tools refuse them honestly.
      const lockedScreens = parseLockedScreens(locked_screens);

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
          ipAddress: clientIpOf(req) ?? undefined,
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
        // The run's heartbeat rides the keepalive that already exists rather
        // than a second timer. It has to: the reaper's staleness ceiling
        // (STALE_AFTER_MS, 5 min) is SHORTER than the pause ceiling
        // (MAX_PAUSE_MS, 10 min), so a beat taken only at round boundaries left
        // a paused run — or any single round over five minutes — to be marked
        // failed/orphaned by another request's sweep while it was still
        // running. Beating here covers every phase of the turn, including the
        // final generation after the loop.
        if (runId && runHandle) void runHandle.heartbeat(heartbeatRound);
      }, STREAM_KEEPALIVE_MS);
      const stopKeepalive = () => clearInterval(streamKeepalive);
      res.on('close', stopKeepalive);
      res.on('finish', stopKeepalive);
      req.on('close', stopKeepalive);

      // Open a durable control record for this turn (pause / steer / cancel).
      // The client uses the emitted runId to call
      // POST /api/ana-ri/stream/:runId/control; the agentic loop's checkpoint
      // (below) reads the row at each round boundary, and the handle's abort
      // signal stops work already in flight.
      //
      // The org is resolved with resolveOrgId — the canonical resolver, and a
      // strict superset of this module's extractRequestContext, which misses
      // req.organizationId and req.user.organizationId. Two resolvers
      // disagreeing is exactly what breaks run ownership.
      //
      // No org means NO RUN AND NO `run_started`. The column is NOT NULL and a
      // run nobody owns cannot be authorised, so the honest outcome is a client
      // that renders no control strip — rather than buttons that 404 on press.
      const runOrgId = resolveOrgId(req);
      runOrgIdForEvents = runOrgId;
      const runUserId = resolveUserId(req);
      if (runOrgId !== null) {
        try {
          const opened = await beginRun({
            pool: getPool(),
            organizationId: runOrgId,
            userId: runUserId,
            threadId: typeof thread_id === 'string' ? thread_id : null,
            projectId: typeof project_id === 'string' ? project_id : null,
            surface: 'ana-ri-stream',
          });
          runId = opened.runId;
          runHandle = opened.handle;
          // A restart leaves rows claiming `running` with nobody executing them;
          // sweep them opportunistically rather than adding a timer.
          void reapOrphanedRuns(getPool()).catch(() => {});
          res.write(`data: ${JSON.stringify({ type: 'run_started', runId })}\n\n`);
        } catch (err: any) {
          // Control is an enhancement; the answer is the product. A run row we
          // could not open costs the person their controls, not their turn —
          // and because no `run_started` is emitted, the strip renders nothing
          // rather than buttons that would 404.
          console.error('[AnA RI Stream] run control unavailable:', err?.message);
        }
      }
      // A turn with no row still gets an abort signal, so Stop still stops the
      // model and the tools. Only the DURABLE half — pause, steer, the audit
      // record, control from another instance — needs the row. Without this the
      // client aborted its socket while the server generated on unseen, which
      // is the interface claiming something the server did not do.
      runHandle ??= localOnlyRunHandle();
      // Handed to the gateway and the tool dispatcher so a stop lands on work
      // already in flight, rather than waiting for the next round boundary.
      const runSignal = runHandle?.cancelSignal;
      // A dropped socket is not a human decision, and the audit must not say it
      // was — so this records `client_disconnected`, not `cancelled`.
      //
      // 'close' fires on a NORMAL end too, and it races the finally below. Both
      // writes are guarded on a live status, so whichever landed first would
      // win — meaning a turn that completed could be recorded as a disconnect.
      // Hence two conditions: the response must not have ended (a finished
      // response is not a dropped socket), and the run settles exactly once.
      const disconnectRun = () => {
        if (!runId || runSettled || res.writableEnded) return;
        runSettled = true;
        // Pressing Stop sends the cancel AND drops the socket. Fired in
        // parallel, the close usually landed first, so a person's decision was
        // recorded as `client_disconnected` and their cancel then arrived at a
        // run already terminal and was refused — inverting the one distinction
        // this audit exists to draw.
        //
        // What orders them is the CLIENT awaiting the cancel before aborting
        // (useAnaChat.stop). Deferring this write by a tick was tried and is
        // not the fix: the control is a separate HTTP request, so no amount of
        // local deferral orders it. The backstop is stopRunInternally's own
        // live-status guard, which makes this a no-op once the cancel has
        // landed.
        void stopRunInternally(getPool(), runId, 'client_disconnected', runOrgId ?? undefined);
      };
      res.on('close', disconnectRun);
      req.on('close', disconnectRun);

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
      /* The tenant's permitted tool surface, resolved in parallel with context
         assembly. Composed by governedToolsetFor so this path and
         POST /api/chat/send-message cannot drift on whether the deny-list is
         applied — which they had. */
      const toolPolicyPromise = governedToolsetFor(getPool(), orgId == null ? null : Number(orgId));

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
            projectRef: streamProjectId ? String(streamProjectId) : null,
          });
          const parsed = JSON.parse(resultStr);
          if (parsed?.status === 'intelligence_question' && parsed.question) {
            res.write(
              `data: ${JSON.stringify({
                type: 'intelligence_question',
                question: parsed.question,
                flowState: parsed.flowState,
                /* The durable interview session. A client that carries this
                   back as session_id on each answer keeps the interview
                   across a dropped conversation; flow_state alone does not. */
                sessionId: parsed.session_id ?? null,
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
                sessionId: parsed.session_id ?? null,
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
      // `let`: a turn that asks for a demonstration in plain words is promoted to
      // demo mode when start_product_demo answers (see the tool loop below).
      let driveState = await driveStatePromise;
      if (driveState.requested) {
        res.write(`data: ${JSON.stringify(buildDriveStateEvent(driveState))}\n\n`);
      }
      const streamStablePrefix = intelligencePrefix + orchestration.systemPrompt;
      const streamVolatileSuffix =
        memoryBlock +
        enrichment.block +
        (driveState.enabled ? buildLiveDrivePromptBlock(driveState.mode) : buildOfferedMovesPromptBlock());

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
            Number(orgId),
            // The program the shell has open (its regulatory_programs UUID), so
            // the thread can be listed under — and resumed from — that project.
            programIdForThread(project_id || resolveProjectIdFromBody(req.body))
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
      /* How many turns preceded this one. It decides whether this is the START
         of a session, which is the only point the rehydration below fires. */
      let streamPriorTurns = 0;
      if (threadId) {
        try {
          const serverHistory = await getThreadMessages(threadId);
          // Exclude the message we just saved (it's the current user message)
          const previousMsgs = serverHistory.slice(0, -1);
          streamPriorTurns = previousMsgs.length;
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
          streamPriorTurns += 1;
        }
      }

      /* Session-start rehydration — the same block POST /api/chat/send-message
         injects, which this path did not.

         The memory assembled above is QUERY-DRIVEN: it answers what the user
         just typed. It never tells AnA what the client's project folder holds,
         where each file is filed, what it is for, or which files the client
         attached in past conversations — so on the streaming path, the one a
         chat UI actually uses, she began every session not knowing a document
         existed until someone named it. That is the "she doesn't remember the
         file is there" this workstream exists to end, and it was still true
         here because the rehydration was wired to the other endpoint.

         Fires only at session start (no prior turns), degrades to nothing, and
         rides as a system turn ahead of the user's message, exactly like the
         memory and enrichment blocks above. */
      const { sessionBootstrapBlockFor } = await import('../../services/ana-session-bootstrap.js');
      /* streamProjectId is whatever the client sent — 'proj_7', '7', 7, or a
         program UUID — and the project-atom loader takes the numeric projects.id.
         Normalized here rather than passed through: a UUID reaching an integer
         column raises 22P02, which the loader's own fault tolerance would
         swallow into "this project has no memory". Anything that is not a
         positive integer is simply omitted, and the org-level half of the
         rehydration (client atoms, lessons, the vault files) still lands. */
      const streamBootstrapProjectId = ((): number | undefined => {
        const raw = typeof streamProjectId === 'string'
          ? streamProjectId.replace(/^proj_/, '')
          : streamProjectId;
        const n = Number(raw);
        return Number.isInteger(n) && n > 0 ? n : undefined;
      })();
      const streamBootstrapBlock = await sessionBootstrapBlockFor({
        priorMessageCount: streamPriorTurns,
        organizationId: orgId ? Number(orgId) : null,
        projectId: streamBootstrapProjectId,
        threadId: threadId ?? undefined,
        atomLimit: 6,
      });
      if (streamBootstrapBlock) {
        messages.push({ role: 'system', content: streamBootstrapBlock });
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
                      // Ask for citations. This is what lets AnA say "page 34 of
                      // Protocol v3.2 says" instead of asserting it unsourced —
                      // the difference between a draft a reviewer checks line by
                      // line and one they can spot-check against the document.
                      // Note this makes the turn ineligible for a JSON schema;
                      // the gateway refuses that pair rather than letting the
                      // API 400 it.
                      citations: { enabled: true },
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
        requestsGovernedDraft: requestsGovernedDraft(message),
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

      // The API's own effort — how hard the chosen model works, as opposed to
      // which model gets chosen. Only the second half was ever sent, so a user
      // asking for Thorough got a better model that then reasoned at the same
      // depth as Fast.
      //
      // The same governance rule applies: a kernel-pinned strategy always wins,
      // so a tenant pinned to quality cannot be dropped to 'low' from the
      // composer. When a policy hint is present the user's effort is not in
      // force, and sending its API effort would smuggle the override back in
      // through the other half of the control.
      const apiEffort = policyHint?.preferredStrategy
        ? undefined
        : resolveApiEffort(effortUsed);

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
      /**
       * The human controls taken during this turn, read back from the run row
       * at turn end and projected onto the assistant message's metadata, which
       * is what the lineage dossier reads. The projection is what the dossier
       * is built from; the run row is operational state, purged with the tenant
       * and not part of the retained record.
       *
       * Read from the ROW rather than accumulated in this process, for two
       * reasons: a control may have been accepted by a different instance and
       * would otherwise be missing from the lineage, and the row is written at
       * the moment of acceptance so a crash during the turn cannot lose a
       * decision a person made. One writer, one source of truth, one derived
       * projection.
       */
      const readControlEvents = async (): Promise<HumanControlEvent[] | undefined> => {
        if (!runId || runOrgIdForEvents === null) return [];
        try {
          const row = await readRun(getPool(), runId, runOrgIdForEvents);
          return row?.controlEvents ?? [];
        } catch (err: any) {
          // A FAILED read is not "no controls were taken". Returning [] here
          // would write an empty decision lineage onto the turn and make a
          // person's pause or steer disappear from the record — an error
          // rendered as an empty result, in a Part 11 audit surface. Undefined
          // omits the key instead, so the projection carries no claim rather
          // than a false one.
          console.error('[AnA RI Stream] control lineage read failed:', err?.message);
          return undefined;
        }
      };
      // A steering interjection queued by the checkpoint, spliced into the next
      // model turn's user message (same mechanism as the adaptation note).
      // Steers accepted at a round boundary, held as OPERATOR TURNS rather
      // than a string. They used to be concatenated onto the tool-result user
      // message, which put a human's redirect in the same turn as tool output
      // — the untrusted half of the transcript — with nothing to tell the two
      // apart. See services/ana/operator-channel.ts.
      let pendingOperatorTurns: GatewayMessage[] = [];
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
      // Demonstrations fetched WITHOUT Live Drive this turn — the moves can only
      // be offered, so the start itself is offered as a chip that runs the same
      // one-click start as the rail's Control menu (navigation-actions.ts).
      const collectedDemoStarts: DemoStartDirective[] = [];
      // Live Drive: how many directives were emitted for immediate application
      // this turn, per kind. Budgets come from the shared per-mode policy
      // (assist = the chip budget, so driving can never move a person more
      // times than offering would have offered; demo = a full-tour allowance).
      let driveBudget = driveBudgetFor(driveState.mode);
      // What AnA has changed on the person's screen so far this turn (the
      // program she opened) — read by the self-drive tools between rounds.
      const driveTurnState: { program: { id: string; name?: string; code?: string } | null } = {
        program: null,
      };
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
        /** Set when the draft was persisted as an authoring document
            (draft_authoring_document) — post-processing then leaves
            concept2cure_artifacts alone; the authoring store holds it. */
        authoringDocId?: string;
        programId?: string;
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
      const governedTools = await toolPolicyPromise;
      // Governance first (tenant deny-list), then offer the subset relevant to this
      // turn's intent + context. The platform command bridge is always retained, so
      // intent selection never removes a capability — anything dropped stays
      // reachable through execute_platform_command. User-pinned tools are honoured.
      const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
      const streamTools = selectToolsForTurn(
        governedTools,
        typeof message === 'string' ? message : '',
        {
          // A driving turn MUST be offered the self-drive tools whatever the
          // message's wording scores — a demo ask like "run the sales demo"
          // must never lose navigate_to/act_on_screen to relevance trimming.
          pinned: [
            ...(Array.isArray(selected_tools)
              ? selected_tools.filter((t: unknown): t is string => typeof t === 'string')
              : []),
            // An @app mention names a capability; operating it needs the
            // self-drive tools whatever the wording scores.
            ...invokedAppPins(message),
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
            // The invoked app's id, label and words, so its tools survive the
            // relevance cap (shared/navigation/callable-apps).
            hints: invokedAppHints(message),
          },
          // Reliability-aware: trim currently-unhealthy tools first when over the cap
          // (the always-on core + platform bridge are unaffected). Per-tenant when an
          // org is in context, else the global view.
          deprioritize: new Set(getUnhealthyTools(3, orgId ?? undefined).map(t => t.tool)),
        }
      );

      const gwResponse = await gw.route({
        taskType: routingPlan.taskType,
        // The kernel's risk judgment, not its surface label: every turn here is
        // labelled regulatory_review, and the gateway reads riskTier to decide
        // whether only an approved model may serve it.
        riskTier: routingPlan.riskTier,
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
        // Stop means stop generating, not just stop rendering.
        signal: runSignal,
        apiEffort,
        ...(streamThinkingConfig ? { thinking: streamThinkingConfig } : {}),
        ...(streamTools.length > 0 ? { tools: streamTools } : {}),
        stream: true,
        onStream: (chunk: string, metadata?: any) => {
          // Cancelled mid-generation → stop emitting (and accumulating) at
          // once. The model call is aborted too (runSignal is passed to the
          // gateway above); this is what stops the chunks already in flight
          // from being rendered.
          if (runHandle?.cancelSignal.aborted) return;
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
      /* Which model produced the tool calls about to run. The governed-write
         gate (registerToolHandler, server/services/ana/governed-write-tools.ts)
         refuses to store model-authored text in a governed record unless this
         model is approved for high-risk work. Updated after every round,
         because each round's calls come from that round's response. */
      let lastServedModel = servedModelOf(gwResponse);
      recordCacheUsage(gwResponse);
      // The first model call is round 1's call; its server tools ran inside it.
      emitServerToolSteps(gwResponse, 1);
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
          inputParseError?: string;
        }): ToolCall => ({
          id: c.id,
          name: c.name,
          input: (c.input ?? {}) as Record<string, unknown>,
          // Carried, not dropped: `input` is `{}` either way, and executeTools
          // needs to tell a zero-argument call from one whose arguments the
          // stream lost.
          ...(c.inputParseError ? { inputParseError: c.inputParseError } : {}),
        });

        // Execute one round: announce the step, stream tool_use/result events, run
        // the handler, log telemetry, and surface any generated document draft.
        /**
         * One SSE control frame.
         *
         * Declared HERE, above its first use, rather than beside the checkpoint
         * where it used to sit: the approval gate below also emits through it,
         * and that only worked because executeTools happens to be invoked after
         * the checkpoint is built. Relying on that ordering is a temporal dead
         * zone waiting for someone to move a block.
         */
        const emitControl = (obj: Record<string, unknown>) => {
          if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
        };

        /**
         * Settle every tool call in this round that a person has to authorise.
         *
         * Returns one entry per GOVERNED call; ungoverned calls are absent and
         * dispatch normally. Every entry is a real tool result — a denial, a
         * timeout and a disconnect all produce one, because an empty result is
         * an error rendered as nothing, and here it would read to the model as
         * a step that was never asked for.
         */
        const settleApprovals = async (
          calls: ToolCall[],
          round: number
        ): Promise<Map<string, { ok: boolean; result: unknown; why?: string }>> => {
          const out = new Map<string, { ok: boolean; result: unknown; why?: string }>();
          for (const toolUse of calls) {
            const verdict = classifyToolCall(toolUse);
            if (verdict.kind === 'UNGOVERNED') continue;

            if (verdict.kind === 'UNDECIDABLE') {
              // A call nobody could read is refused, never dispatched. Before
              // the streamed-tool-input fix this was EVERY call on this path,
              // which is why it is its own outcome rather than a quiet pass.
              out.set(toolUse.id, {
                ok: false,
                why: verdict.why,
                result: {
                  error: 'GOVERNED_CALL_UNREADABLE',
                  tool: toolUse.name,
                  message:
                    `This action could not be read well enough to put to a person (${verdict.why}), ` +
                    'so it was not run. Re-issue it with the arguments spelled out.',
                },
              });
              continue;
            }

            if (!runId || !runHandle) {
              // No durable run means no way to ask and no way to wait. Refusing
              // is the only honest outcome: the alternative is running a
              // governed action with nobody having authorised it.
              out.set(toolUse.id, {
                ok: false,
                why: 'no controllable run',
                result: {
                  error: 'HUMAN_CONFIRMATION_REQUIRED',
                  action: verdict.command,
                  message:
                    'This action changes the official record, so a person has to take it. ' +
                    'This turn has no controllable run, so it could not be put to anyone — ' +
                    'ask them to run it from the surface it belongs to.',
                },
              });
              continue;
            }

            out.set(toolUse.id, await awaitDecision(toolUse, verdict, round));
          }
          return out;
        };

        /** Put one action to the person and hold the turn until they answer. */
        const awaitDecision = async (
          toolUse: ToolCall,
          verdict: Extract<ReturnType<typeof classifyToolCall>, { kind: 'NEEDS_APPROVAL' }>,
          round: number
        ): Promise<{ ok: boolean; result: unknown; why?: string }> => {
          const refused = (why: string, message: string) => ({
            ok: false,
            why,
            result: {
              error: 'HUMAN_CONFIRMATION_DECLINED',
              action: verdict.command,
              message,
              // She must not try again inside this turn. A person said no, or
              // nobody said anything; retrying would be asking the same
              // question louder.
              retry: false,
            },
          });

          const opened = await requestApproval(getPool(), runId, {
            toolUseId: toolUse.id,
            command: verdict.command,
            params: verdict.params,
            tier: verdict.tier,
            requestedAt: new Date().toISOString(),
            rationale: typeof (verdict.params as any)?.reason === 'string'
              ? String((verdict.params as any).reason)
              : undefined,
          }).catch(() => false);
          if (!opened) {
            return refused(
              'the run would not hold',
              'This action needs a person to authorise it, and the run could not be held to ask. ' +
                'It was not run.'
            );
          }

          // The envelope the client already understands — the same shape
          // buildHumanConfirmationRequiredResult produces, so GovernedActionSignoff
          // opens on it unchanged. runId + toolUseId are what let the decision
          // come back to THIS waiting turn instead of running on its own.
          emitControl({
            type: 'approval_required',
            round,
            runId,
            toolUseId: toolUse.id,
            action: verdict.command,
            openModal: 'esign',
            data: {
              reasonRequired: true,
              signatureRequired: verdict.tier === 'esignature',
              proposedByAgent: true,
              retry: { command: verdict.command, params: verdict.params },
            },
            message:
              'This action changes the official record, so it has to be taken by a person rather ' +
              'than on your behalf. Review it and confirm to continue — your reason for the change ' +
              'is recorded with it. AnA is waiting on this before she goes on.',
          });

          // The wait. Same machinery as pause: woken by the decision, with the
          // ceiling only bounding a wake that never arrives.
          const WAKE_CEILING_MS = 5_000;
          const started = Date.now();
          for (;;) {
            if (runHandle!.cancelSignal.aborted) {
              return refused('the run was stopped', 'The run was stopped before anyone decided, so this action did not run.');
            }
            if (res.writableEnded) {
              await stopRunInternally(getPool(), runId, 'client_disconnected', runOrgId ?? undefined);
              return refused('the client disconnected', 'The connection dropped before anyone decided, so this action did not run.');
            }
            const decision = await readApprovalDecision(getPool(), runId, toolUse.id).catch(() => null);
            if (decision) {
              emitControl({ type: 'approval_decided', round, toolUseId: toolUse.id, decided: decision.decided });
              if (decision.decided === 'approved' && decision.error === undefined) {
                return { ok: true, result: decision.result ?? { success: true } };
              }
              return refused(
                decision.error ?? 'declined',
                decision.error
                  ? `A person authorised this, but it did not complete: ${decision.error}`
                  : 'A person reviewed this and declined it, so it did not run.'
              );
            }
            if (Date.now() - started > MAX_PAUSE_MS) {
              // Timeout DENIES. The same ceiling as an abandoned pause, so
              // there is one number for "the human is not coming back" rather
              // than two that can drift apart.
              await recordApprovalDecision(getPool(), runId, {
                toolUseId: toolUse.id,
                decided: 'denied',
                decidedAt: new Date().toISOString(),
                byUserId: null,
                error: 'no decision within the approval window',
              }).catch(() => false);
              return refused(
                'nobody decided in time',
                'Nobody authorised this within the time allowed, so it did not run. Nothing was changed.'
              );
            }
            await runHandle!.wake(WAKE_CEILING_MS);
          }
        };

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
          // ── Anything that needs a person is settled FIRST, one at a time ──
          //
          // Before this, a governed command reached executeCommands, was
          // refused with HUMAN_CONFIRMATION_REQUIRED, and AnA's turn ENDED. The
          // person then signed in a modal and the action ran on its own, with
          // no way for her to carry on from it. She asked, but she could not
          // wait for the answer.
          //
          // Serial on purpose, and not a missed parallelism: a person decides
          // one action at a time, and two gates open at once would mean
          // authorising one thing while the row described another. Everything
          // ungoverned still runs concurrently below.
          const approvals = await settleApprovals(calls, round);

          const ran = await mapWithConcurrency(
            calls,
            async toolUse => {
              const handler = getToolHandler(toolUse.name);
              const toolStart = Date.now();
              let resultStr: string;
              let toolStatus: 'success' | 'error' | 'not_found' | 'cancelled' = 'success';
              let toolErrorMessage: string | undefined;
              const lostInput = lostToolInputResult(toolUse);
              const approval = approvals.get(toolUse.id);
              if (approval) {
                // Already settled by a person (or refused because it could not
                // be put to one). The handler is NOT called: when the action
                // ran, it ran inside the governed-action route, which is the
                // single place that stamps humanConfirmed. What comes back here
                // is that execution's result, so there is still one execution,
                // one signature and one audit row.
                resultStr = JSON.stringify(approval.result);
                toolStatus = approval.ok ? 'success' : 'error';
                toolErrorMessage = approval.ok ? undefined : approval.why;
              } else if (runSignal?.aborted) {
                // Stopped before this step got its turn. It never ran, and
                // saying so is the honest record — a step that silently
                // vanishes reads as one that was never asked for.
                resultStr = JSON.stringify(CANCELLED_TOOL_RESULT(toolUse.name));
                toolStatus = 'cancelled';
              } else if (lostInput) {
                // The model chose arguments and the stream lost them; never
                // dispatch on `{}`. See lostToolInputResult for why the
                // message blames the transport rather than the request.
                resultStr = JSON.stringify(lostInput);
                toolStatus = 'error';
                toolErrorMessage = toolUse.inputParseError;
              } else if (handler) {
                try {
                  // Raced against the stop. The handler's own promise is not
                  // cancellable — an orphaned call settles into a void — but
                  // the ROUND stops waiting for it, which is the difference
                  // between a stop that lands in a second and one that waits
                  // out a forty-second search.
                  resultStr = await Promise.race([
                    handler(toolUse.input, {
                      servingModel: lastServedModel,
                      organizationId: orgId,
                      userId: userId || null,
                      projectId: streamProjectId ? Number(streamProjectId) || null : null,
                      projectRef: streamProjectId ? String(streamProjectId) : null,
                      // Lets navigate_to tell the model the truth about what its
                      // directive does this turn (applied live vs offered chip).
                      liveDrive: driveState.enabled,
                      lockedScreens,
                      turnState: driveTurnState,
                      signal: runSignal,
                    }),
                    abortRace(runSignal),
                  ]);
                } catch (toolErr: any) {
                  if (toolErr instanceof ToolRunCancelled) {
                    // Not an error: the person stopped it. Falls through to
                    // the same telemetry and result path as any other outcome,
                    // so the step is still recorded — just recorded truthfully.
                    resultStr = JSON.stringify(CANCELLED_TOOL_RESULT(toolUse.name));
                    toolStatus = 'cancelled';
                    toolErrorMessage = undefined;
                  } else {
                  resultStr = JSON.stringify({
                    error: `Tool execution failed: ${toolErr?.message || 'unknown error'}`,
                    tool: toolUse.name,
                  });
                  toolStatus = 'error';
                  toolErrorMessage = toolErr?.message || 'unknown error';
                  }
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
          /* The model reads `entries`, not the stream. A directive the drive
             budget stops from being applied must not reach it as "being applied
             now": the screen will not move, and she would narrate a move that
             did not happen. It is offered as a chip instead, and she is told. */
          const amendForModel = (
            toolUseId: string,
            parsedResult: Record<string, unknown> | null,
            kind: 'navigation' | 'action'
          ) => {
            const entry = entries.find(e => e.tool_use_id === toolUseId);
            if (!entry || !parsedResult) return;
            entry.content = JSON.stringify({
              ...parsedResult,
              applied: false,
              instruction:
                `This turn's ${kind} budget is used up, so this ${kind} was NOT made on their screen — ` +
                'it is offered as a one-click chip under your answer. Say so plainly and do not narrate it as done.',
            });
          };
          const roundFailures: FailedToolCall[] = [];
          for (const { toolUse, resultStr, toolStatus, toolErrorMessage, latencyMs } of ran) {
            entries.push({ tool_use_id: toolUse.id, content: resultStr, name: toolUse.name });
            const stepLabel = describeToolPlan([toolUse])[0].label;
            // Record this call in the turn's tool-trace memory + evidence corpus.
            toolTrace.push(buildTraceEntry(toolUse.name, stepLabel, toolStatus, resultStr));
            // Failures collected for the round's adaptation note (see below).
            // A cancelled step is NOT a failure to adapt to: the note tells the
            // model "these did not work, try something else", and the run is
            // ending — there is no next attempt to steer, and telling her to
            // work around a step the person stopped would invite her to do the
            // very thing she was stopped from doing.
            if (toolStatus !== 'success' && toolStatus !== 'cancelled') {
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
                : toolStatus === 'cancelled'
                ? `You stopped ${humanStep} before it finished.`
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
                  // Past the turn's budget the move is NOT applied — say so to
                  // the model instead of the handler's "being applied now".
                  if (driveState.enabled && driveNavigationsApplied >= driveBudget.navigations) {
                    amendForModel(toolUse.id, parsed, 'navigation');
                  }
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
                  if (driveState.enabled && driveActionsApplied >= driveBudget.actions) {
                    amendForModel(toolUse.id, parsed, 'action');
                  }
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
                const demoStart = demoStartFromToolResult(toolUse.name, resultStr);
                if (demoStart) collectedDemoStarts.push(demoStart);
                // A demonstration asked for in plain words ("give me the sales
                // demo") arrives as an ordinary driving turn. Once the script
                // is fetched, the turn IS a demonstration: promote it so the
                // tour gets the demo budgets, prompt and round ceiling, and tell
                // the client so its caps (and the next turns) follow.
                if (
                  toolUse.name === 'start_product_demo' &&
                  parsed?.status === 'demo_ready' &&
                  parsed?.driven === true &&
                  driveState.enabled &&
                  driveState.mode !== 'demo'
                ) {
                  driveState = { ...driveState, mode: 'demo' };
                  driveBudget = driveBudgetFor('demo');
                  res.write(`data: ${JSON.stringify(buildDriveStateEvent(driveState))}\n\n`);
                  pendingOperatorTurns.push({
                    role: 'system',
                    inlineSystem: true,
                    content: buildLiveDrivePromptBlock('demo').trim(),
                  });
                }
                if (parsed?.status === 'intelligence_question' && parsed.question) {
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'intelligence_question',
                      question: parsed.question,
                      flowState: parsed.flowState,
                      sessionId: parsed.session_id ?? null,
                    })}\n\n`
                  );
                }
                if (parsed?.status === 'intelligence_flow_complete' && parsed.completion) {
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'intelligence_flow_complete',
                      completion: parsed.completion,
                      flowState: parsed.flowState,
                      sessionId: parsed.session_id ?? null,
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
                  /* An authoring document (draft_authoring_document): the draft
                     already lives in the editor's store under this id, in this
                     program. The event carries both so the client renders the
                     document canvas over that id instead of an artifact card,
                     and post-processing does not write a second copy. */
                  const authoringDocId: string | undefined =
                    typeof parsed.authoringDocId === 'string' && parsed.authoringDocId
                      ? parsed.authoringDocId
                      : undefined;
                  const authoringProgramId: string | undefined =
                    authoringDocId && typeof parsed.programId === 'string' && parsed.programId
                      ? parsed.programId
                      : undefined;
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
                    ...(authoringDocId ? { authoringDocId, programId: authoringProgramId } : {}),
                  });
                  res.write(
                    `data: ${JSON.stringify({
                      type: 'artifact_draft',
                      title: draftTitle,
                      content: parsed.content,
                      documentType: parsed.documentType,
                      source: toolUse.name,
                      ...(authoringDocId ? { authoringDocId, programId: authoringProgramId } : {}),
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
        /* Stage one round's turns onto loopMessages: what the model said last,
           the tool results it now has, and any operator steer waiting.

           Separated from callModel below because it is bookkeeping over three
           closure variables and callModel is where the round's MODEL decisions
           live; reading them interleaved made both harder to follow, and the
           mix pushed callModel past the complexity limit. */
        const stageRound = (results: ToolResultEntry[], priorText: string): void => {
          loopMessages.push({ role: 'assistant', content: assistantTurnContent(priorText, results) });
          // Entries arrive pre-budgeted from executeTools, so the per-result cap
          // here is a no-op safety net. The adaptation note (when a tool failed
          // last round) rides the same user turn so the model course-corrects
          // instead of retrying the identical call.
          const adaptationSuffix = pendingAdaptationNote ? `\n\n${pendingAdaptationNote}` : '';
          pendingAdaptationNote = '';
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
              adaptationSuffix,
          });
          // Steers ride AFTER the tool results, as operator turns. Order
          // matters twice over: the gateway requires an inline system turn to
          // follow a user turn, and a redirect read after the evidence is a
          // redirect the model applies to this round rather than one it has
          // already reasoned past.
          if (pendingOperatorTurns.length > 0) {
            loopMessages.push(...pendingOperatorTurns);
            pendingOperatorTurns = [];
          }
        };

        const callModel = async (
          results: ToolResultEntry[],
          priorText: string,
          round: number,
          includeTools: boolean
        ): Promise<ModelTurn> => {
          stageRound(results, priorText);

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
            riskTier: routingPlan.riskTier,
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
            signal: runSignal,
            // Pinned per TURN, not per round: changing effort mid-conversation
            // invalidates the messages cache, and the follow-up rounds are the
            // same piece of work as the first.
            apiEffort,
            // The tools array stays on the request for EVERY round, including
            // the terminal one. Withdrawing it is what the terminal round used
            // to do, and it cost the whole prompt cache once per turn:
            // Anthropic's cache prefix renders tools -> system -> messages, and
            // a tool-definition change (add, remove or reorder) is the one
            // change that preserves NO cache tier. Dropping the array on the
            // last round therefore rebuilt tools, system AND messages, every
            // turn, at exactly the point the conversation was longest.
            //
            // `tool_choice: 'none'` gets the same behaviour — a grounded text
            // answer with no further tool calls — while changing only a
            // parameter that preserves the tools and system caches. Same
            // outcome, one cache tier instead of none.
            ...(streamTools.length > 0 ? { tools: streamTools } : {}),
            ...(includeTools ? {} : { toolChoice: 'none' as const }),
            stream: true,
            onStream: (chunk: string, metadata?: any) => {
              if (runHandle?.cancelSignal.aborted) return;
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
          recordCacheUsage(roundResponse);
          emitServerToolSteps(roundResponse, round);
          lastServedModel = servedModelOf(roundResponse);
          const nextUses = (roundResponse as AnaGatewayResponse).toolUses;
          return { text: roundText, toolCalls: (nextUses ?? []).map(toToolCall) };
        };

        // Round-boundary human control. Consulted by the loop before each
        // round: hold while paused, splice queued steers into the next model
        // turn, and abort on cancel.
        //
        // Status is read from the ROW, never from a process-local copy — the
        // control may have been accepted by a different instance. The abort
        // signal is the one exception and is not a cached status: it is the
        // abort itself, and it is read per streamed chunk, so it has to be
        // synchronous.
        //
        // The control EVENTS are not recorded here. They are written to the row
        // by the control endpoint at the moment of acceptance, so a crash of
        // this process cannot lose a human decision; what happens below is only
        // telling the client what the server did.
        let pauseAnnounced = false;
        const checkpoint = async (upcomingRound: number): Promise<'continue' | 'abort'> => {
          if (!runId || !runHandle) return 'continue';
          if (runHandle.cancelSignal.aborted) {
            emitControl({ type: 'cancelled', round: upcomingRound });
            return 'abort';
          }
          heartbeatRound = upcomingRound;
          void runHandle.heartbeat(upcomingRound);

          // Pause: hold at the round boundary until resumed / cancelled. The
          // wait is woken by the control write (NOTIFY, or directly when the
          // control landed on this instance) rather than by a 200ms poll; the
          // timeout is only a ceiling on how long a missed wake can stall it.
          const WAKE_CEILING_MS = 5_000;
          const pauseStart = Date.now();
          let status = await readStatus(getPool(), runId);
          while (status === 'paused') {
            if (!pauseAnnounced) {
              emitControl({ type: 'paused', round: upcomingRound });
              pauseAnnounced = true;
            }
            if (res.writableEnded) {
              await stopRunInternally(getPool(), runId, 'client_disconnected', runOrgId ?? undefined);
              break;
            }
            if (Date.now() - pauseStart > MAX_PAUSE_MS) {
              // Nobody came back. Resuming is a server decision, so it is
              // recorded as one — no control event, attributed to no user.
              await resumeAbandonedRun(getPool(), runId);
              // Take the new status with us. Breaking on the stale 'paused'
              // skipped the `resumed` emit below, leaving the client showing
              // Paused for a run that was already working again.
              status = 'running';
              break;
            }
            await runHandle.wake(WAKE_CEILING_MS);
            status = await readStatus(getPool(), runId);
          }
          if (pauseAnnounced && status === 'running') {
            emitControl({ type: 'resumed', round: upcomingRound });
            pauseAnnounced = false;
          }

          // Steers: splice each queued redirect into the next model turn. The
          // drain is atomic, so a steer cannot be applied twice.
          const drainedSteers: string[] = [];
          for (const inj of await consumeInterjections(getPool(), runId)) {
            const framed = buildSteerMessage(inj);
            if (framed) {
              pendingOperatorTurns.push({
                role: 'system',
                inlineSystem: true,
                // Scanned, not exempt. It is the operator's channel, but the
                // words are still typed by a human into a text box, and
                // `origin: 'app'` is reserved for content our own code
                // authored verbatim (see GatewayMessage.origin).
                origin: 'external',
                content: framed,
              });
            }
            drainedSteers.push(inj);
          }

          if (runHandle.cancelSignal.aborted || status === 'cancelled') {
            emitControl({ type: 'cancelled', round: upcomingRound });
            return 'abort';
          }

          /* `interjected` is announced AFTER the cancel check, not beside the
             drain above.

             The client renders this event as "You steered AnA:" on the turn.
             Emitted at drain time it could say so and then be immediately
             followed by an abort on the very next line — the steer drained out
             of the queue, never reached a model turn, and the transcript
             claimed it had. Cancel is the one outcome reachable between the two
             points, so moving the announcement past it removes that window
             entirely rather than retracting the claim afterwards.

             This is an announcement of delivery-to-the-next-turn, which is what
             the person is told. The AUDIT record is a different thing and is
             written elsewhere, at queue time by the control endpoint
             (services/ana/run-control.ts queueSteer) — where it means "the
             operator submitted this steer", which is true whether or not the
             run went on to consume it. The two must not be conflated. */
          for (const inj of drainedSteers) {
            emitControl({ type: 'interjected', round: upcomingRound, message: inj });
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
            // A turn promoted to demo mode mid-way gets the demo ceiling from
            // that point on (read every round).
            maxRoundsFloor: () =>
              driveState.enabled && driveState.mode === 'demo' ? DEMO_MAX_ROUNDS : 0,
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
                // Every model call this turn, not just the first. `missedCalls`
                // is what a caching change is judged on: a turn can show a
                // healthy first-call hit while each round behind it rebuilt the
                // whole prefix, and the first-call number alone cannot tell
                // those apart.
                turn: { ...turnCache },
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
        humanControls: await readControlEvents(),
        toolEvidenceCorpus,
        collectedProvenance,
        collectedNavigation,
        collectedSurfaceActions,
        collectedDemoStarts,
        collectedDrafts,
        messages,
        model: gwResponse.model,
        provider: gwResponse.provider,
        enrichment,
      });
    } catch (error: any) {
      streamFailed = true;
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
      // Close the run. Guarded on a live status inside endRun, so a turn that
      // unwinds after a cancel cannot rewrite the row as finished.
      // The local half is released on EVERY exit path, not only this one: a run
      // that ended by disconnect settles the row without reaching endRun, and
      // used to leak its LocalRun and AbortController for the life of the
      // process.
      if (runId) releaseLocalRun(runId);
      if (runId && !runSettled) {
        runSettled = true;
        await endRun(
          getPool(),
          runId,
          streamFailed ? 'failed' : 'finished',
          streamFailed ? 'error' : 'no_more_tools',
        );
      }
    }
  });

  /**
   * How a control refusal reaches the client.
   *
   * The two "no" answers are deliberately different. A run in another tenant is
   * 404, because its existence must not be confirmable from outside the org. A
   * colleague's run in the same tenant is 403: inside a tenant the row is not a
   * secret, and "not found" would be a lie they could disprove by watching the
   * run keep going.
   */
  const refusalResponse = (
    result: { code?: string; status: string | null },
    action: string,
  ): { httpStatus: number; error: string } => {
    switch (result.code) {
      case 'NOT_FOUND':
        return { httpStatus: 404, error: 'Run not found or already finished' };
      case 'NOT_YOURS':
        return { httpStatus: 403, error: 'That run belongs to someone else' };
      case 'INVALID':
        return { httpStatus: 409, error: `Cannot ${action} a run that is ${result.status}` };
      default:
        return { httpStatus: 409, error: `Run already ${result.status}` };
    }
  };

  /**
   * POST /api/ana-ri/stream/:runId/control
   *
   * Mid-run human control for an in-flight turn: pause / resume / steer /
   * cancel. Durable and instance-independent — the control is a row write, so
   * it is accepted wherever it lands, and the instance actually holding the run
   * is woken to act on it.
   *
   * Ownership, which the bearer-capability version had none of:
   *
   *   another ORG's run   404. Its existence must not be confirmable from
   *                       outside the tenant.
   *   another USER's run  403. Inside a tenant the row is not a secret, but
   *                       taking a colleague's run is a different act, and
   *                       "not found" would be a lie they could disprove by
   *                       watching the run continue.
   *   a settled run       409, as before.
   *
   * Body: { action: 'pause' | 'resume' | 'interject' | 'cancel', message?: string }
   */
  router.post('/stream/:runId/control', async (req: Request, res: Response) => {
    const runId = String(req.params.runId);
    const action = String(req.body?.action || '');
    const message = typeof req.body?.message === 'string' ? req.body.message : undefined;

    if (!['pause', 'resume', 'interject', 'cancel'].includes(action)) {
      return res.status(400).json({ ok: false, error: `Unknown control action: ${action}` });
    }
    if (action === 'interject' && !message?.trim()) {
      return res.status(400).json({ ok: false, error: 'interject requires a non-empty message' });
    }

    // resolveOrgId, not extractRequestContext: the canonical resolver, and the
    // same one beginRun stamped the row with. Two resolvers disagreeing is
    // exactly what breaks run ownership.
    const organizationId = resolveOrgId(req);
    if (organizationId === null) {
      return res.status(404).json({ ok: false, error: 'Run not found or already finished' });
    }

    const result = await applyControl({
      pool: getPool(),
      runId,
      organizationId,
      userId: resolveUserId(req),
      action: action as 'pause' | 'resume' | 'interject' | 'cancel',
      message,
    });

    if (!result.ok) {
      const { httpStatus, error } = refusalResponse(result, action);
      return res.status(httpStatus).json({ ok: false, runId, action, status: result.status, error });
    }

    return res.status(200).json({
      ok: true,
      runId,
      action,
      status: result.status,
      pendingInterjections: result.pendingInterjections ?? 0,
    });
  });
}
