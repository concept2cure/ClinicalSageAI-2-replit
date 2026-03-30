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
} from '../services/ana-ri/index.js';
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
  getFirecrawlQuotaStatus,
  recordSuccessfulFirecrawlScrape,
} from '../integrations/firecrawl/usage';
import {
  routeEvidenceRequest,
  persistEvidence,
  normalizeEvidence,
} from '../services/research-intelligence';

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
      user_role,
      project_context,
      document_context,
      submission_type,
      conversation_history,
      authoring_context,
      preferred_provider,
      useFirecrawl,
    } = req.body;

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

    // ── Build authoring context block for system prompt enrichment ──
    let authoringContextBlock = '';
    if (authoring_context && typeof authoring_context === 'object') {
      const ac = authoring_context;
      const parts: string[] = ['<authoring_context>'];
      if (ac.workflowStage) parts.push(`  <workflow_stage>${ac.workflowStage}</workflow_stage>`);
      if (ac.sectionCode) parts.push(`  <section_code>${ac.sectionCode}</section_code>`);
      if (ac.sectionTitle) parts.push(`  <section_title>${ac.sectionTitle}</section_title>`);
      if (ac.moduleCode) parts.push(`  <module_code>${ac.moduleCode}</module_code>`);
      if (ac.artifactId) parts.push(`  <artifact_id>${ac.artifactId}</artifact_id>`);
      if (ac.artifactVersionId)
        parts.push(`  <artifact_version_id>${ac.artifactVersionId}</artifact_version_id>`);
      if (ac.artifactStatus)
        parts.push(`  <artifact_status>${ac.artifactStatus}</artifact_status>`);
      if (ac.submissionType)
        parts.push(`  <submission_type>${ac.submissionType}</submission_type>`);
      if (ac.readiness) {
        parts.push(
          `  <readiness score="${ac.readiness.score ?? 'unknown'}" blocked="${
            ac.readiness.blocked ?? false
          }">`
        );
        if (ac.readiness.blockers?.length) {
          for (const b of ac.readiness.blockers) {
            parts.push(
              `    <blocker severity="${b.severity}" code="${b.code}">${b.message}</blocker>`
            );
          }
        }
        parts.push('  </readiness>');
      }
      if (ac.contradictions?.length) {
        parts.push('  <contradictions>');
        for (const c of ac.contradictions) {
          parts.push(
            `    <contradiction id="${c.id}" type="${c.type}" severity="${c.severity}">${c.explanation}</contradiction>`
          );
        }
        parts.push('  </contradictions>');
      }
      parts.push('</authoring_context>');
      authoringContextBlock = parts.join('\n');
    }

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

    // Orchestrate — build the complete system prompt
    const orchestratorInput: OrchestratorInput = {
      message,
      intentLens: validatedLens,
      userRole: effectiveRole,
      projectContext: project_context,
      documentContext: document_context,
      submissionType: submission_type as SubmissionType | undefined,
      conversationHistory: conversation_history,
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
    const chatProjectId = req.body.project_id || req.body.context?.projectId;
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

    const enrichedSystemPrompt =
      chatIntelligencePrefix +
      orchestration.systemPrompt +
      chatMemoryResult.memoryBlock +
      chatEnrichment.block;

    // Build message history — prefer server thread history, fall back to client
    const messages: GatewayMessage[] = [{ role: 'system', content: enrichedSystemPrompt }];

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

    // Add current message (use rewritten version if slash command detected)
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
        await saveMessage(resolvedThreadId, 'assistant', response.content);
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

    // RIM interception — capture intelligence signals (non-blocking)
    const projectIdForRim = req.body.project_id || req.body.context?.projectId;
    if (response.content && projectIdForRim) {
      interceptChatResponse({
        organizationId: orgId ? Number(orgId) : 0,
        projectId: projectIdForRim ? Number(projectIdForRim) : 0,
        userId: typeof userId === 'number' ? userId : undefined,
        assistantMessage: response.content,
        claimCount: 0,
        supportedClaimRate: 0.5,
        model: response.model || 'unknown',
        provider: response.provider || 'unknown',
      }).catch(() => {});
    }

    // Evidence validation — semantic grounding check (beyond regex-based enforcement)
    const evidenceVerdict = validateEvidence(response.content, 'ana-ri');

    // Guidance executor — auto-create artifacts if response contains action signals
    // (Parity with /stream — previously only ran on stream path)
    let executedActions: any[] = [];
    const chatProjectIdForActions = req.body.project_id || req.body.context?.projectId;
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
      } catch (e: any) {
        console.warn('[AnA RI Chat] Guidance executor failed:', e?.message);
      }
    }

    // Command executor — execute operational commands (create project, artifact, task, etc.)
    // (Parity with /stream — previously only ran on stream path)
    let executedCommands: any[] = [];
    if (response.content && orgId) {
      try {
        const cmdCtx: CommandContext = {
          userId: typeof userId === 'number' ? userId : 0,
          organizationId: Number(orgId),
          activeProjectId: chatProjectIdForActions
            ? typeof chatProjectIdForActions === 'string'
              ? Number.parseInt(chatProjectIdForActions, 10)
              : chatProjectIdForActions
            : undefined,
        };
        const cmdResult = await processCommandsInResponse(response.content, cmdCtx);
        executedCommands = cmdResult.executedCommands;
        if (executedCommands.length > 0) {
          console.log(`[AnA RI Chat] Executed ${executedCommands.length} command(s)`);
        }
      } catch (e: any) {
        console.warn('[AnA RI Chat] Command executor failed:', e?.message);
      }
    }

    // Build queue metadata
    const queueMeta = buildQueueMeta({
      threadId: resolvedThreadId,
      persistenceFailed,
    });

    const responsePayload = {
      response: response.content,
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
      _meta: {
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

    // SSE headers deferred until after context building (M-5 fix)
    // This allows pre-stream failures to return proper HTTP error codes.

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

    // Build authoring context block
    let authoringContextBlock = '';
    if (authoring_context && typeof authoring_context === 'object') {
      const ac = authoring_context;
      const parts: string[] = ['<authoring_context>'];
      if (ac.workflowStage) parts.push(`  <workflow_stage>${ac.workflowStage}</workflow_stage>`);
      if (ac.sectionCode) parts.push(`  <section_code>${ac.sectionCode}</section_code>`);
      if (ac.sectionTitle) parts.push(`  <section_title>${ac.sectionTitle}</section_title>`);
      if (ac.moduleCode) parts.push(`  <module_code>${ac.moduleCode}</module_code>`);
      if (ac.artifactId) parts.push(`  <artifact_id>${ac.artifactId}</artifact_id>`);
      if (ac.artifactStatus)
        parts.push(`  <artifact_status>${ac.artifactStatus}</artifact_status>`);
      if (ac.submissionType)
        parts.push(`  <submission_type>${ac.submissionType}</submission_type>`);
      parts.push('</authoring_context>');
      authoringContextBlock = parts.join('\n');
    }

    // Orchestrate
    const orchestration = orchestrate({
      message,
      intentLens: validatedLens,
      userRole: effectiveRole,
      projectContext: project_context,
      documentContext: document_context,
      submissionType: submission_type as SubmissionType | undefined,
      conversationHistory: conversation_history,
    });

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

    // Intelligence + memory + enrichment — run in PARALLEL for speed
    const [intelligencePrefix, memoryResult, enrichment] = await Promise.all([
      getIntelligencePrefix(orgId ? Number(orgId) : undefined, project_id).catch(err => {
        console.warn('[AnA RI] Intelligence prefix failed:', err?.message);
        return '';
      }),
      buildMemoryContextForChat({
        threadId: thread_id || undefined,
        organizationId: orgId ? Number(orgId) : undefined,
        projectId: project_id || undefined,
        query: message,
        limitPerLayer: 4,
        maxChars: 3500,
      }).catch(err => {
        console.warn('[AnA RI] Memory context failed:', err?.message);
        return { memoryBlock: '', atoms: [], diagnostics: null };
      }),
      enrichContextForChat({
        message,
        projectId: project_id,
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

    // Use rewritten message if slash command was detected
    const effectiveMessage = enrichment.rewrittenMessage || message;

    const fullSystemPrompt =
      intelligencePrefix + orchestration.systemPrompt + memoryBlock + enrichment.block;

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
    const messages: GatewayMessage[] = [{ role: 'system', content: fullSystemPrompt }];

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

    // Set SSE headers NOW (after all context building, before first write)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send thread_id immediately so client can track
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

    // Stream via gateway
    const gwResponse = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
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

    // Persist assistant response
    if (orgId && threadId && fullContent) {
      try {
        await saveMessage(threadId, 'assistant', fullContent);
      } catch (e: any) {
        console.error('[AnA RI Stream] Assistant persist failed:', e?.message);
        persistenceFailed = true;
      }
    }

    // RIM interception — capture intelligence signals (non-blocking)
    if (fullContent && project_id) {
      interceptChatResponse({
        organizationId: orgId ? Number(orgId) : 0,
        projectId: project_id ? Number(project_id) : 0,
        userId: typeof userId === 'number' ? userId : undefined,
        assistantMessage: fullContent,
        claimCount: 0,
        supportedClaimRate: 0.5,
        model: gwResponse.model || 'unknown',
        provider: gwResponse.provider || 'unknown',
      }).catch(() => {});
    }

    // Guidance executor — auto-create artifacts if response contains action signals
    let executedActions: any[] = [];
    if (fullContent && project_id && orgId) {
      try {
        const guidance = await processResponseActions(fullContent, {
          projectId: typeof project_id === 'string' ? Number.parseInt(project_id, 10) : project_id,
          organizationId: Number(orgId),
          userId: typeof userId === 'number' ? userId : 0,
          userName: 'AnA',
          threadId: threadId || undefined,
        });
        executedActions = guidance.actions;
      } catch (e: any) {
        console.warn('[AnA RI Stream] Guidance executor failed:', e?.message);
      }
    }

    // Command executor — execute operational commands (create project, artifact, task, etc.)
    let executedCommands: any[] = [];
    if (fullContent && orgId) {
      try {
        const cmdCtx: CommandContext = {
          userId: typeof userId === 'number' ? userId : 0,
          organizationId: Number(orgId),
          activeProjectId: project_id
            ? typeof project_id === 'string'
              ? Number.parseInt(project_id, 10)
              : project_id
            : undefined,
        };
        const { processCommandsInResponse } =
          await import('../services/ana-ri/command-executor.js');
        const cmdResult = await processCommandsInResponse(fullContent, cmdCtx);
        executedCommands = cmdResult.executedCommands;
        if (executedCommands.length > 0) {
          console.log(`[AnA RI Stream] Executed ${executedCommands.length} command(s)`);
        }
      } catch (e: any) {
        console.warn('[AnA RI Stream] Command executor failed:', e?.message);
      }
    }

    // Warn client if thread persistence failed
    if (persistenceFailed) {
      res.write(
        `data: ${JSON.stringify({ type: 'warning', message: 'Thread persistence failed' })}\n\n`
      );
    }

    // Evidence discipline + structure checks (parity with /chat)
    const streamEvidenceCheck = fullContent ? checkEvidenceDiscipline(fullContent) : null;
    const streamStructureCheck = fullContent ? validateResponseStructure(fullContent) : null;

    // Evidence validation — semantic grounding check (non-blocking)
    const streamEvidenceVerdict = fullContent ? validateEvidence(fullContent, 'ana-ri') : null;

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

    // Send done event
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        model: gwResponse.model,
        provider: gwResponse.provider,
        usage: gwResponse.usage,
        latencyMs: gwResponse.latencyMs,
        executedActions: executedActions.length > 0 ? executedActions : undefined,
        executedCommands: executedCommands.length > 0 ? executedCommands : undefined,
        enrichmentSources: enrichment.sources.length > 0 ? enrichment.sources : undefined,
        evidence: streamEvidenceVerdict || undefined,
        evidenceDiscipline: streamEvidenceCheck ? {
          compliant: streamEvidenceCheck.compliant,
          labels: streamEvidenceCheck.totalLabels,
          hasOverclaims: streamEvidenceCheck.hasOverclaims,
        } : undefined,
        structure: streamStructureCheck ? {
          valid: streamStructureCheck.valid,
          score: streamStructureCheck.score,
          maxScore: streamStructureCheck.maxScore,
        } : undefined,
        queueMeta: streamQueueMeta,
      })}\n\n`
    );

    res.end();
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

    if (!result.success) {
      return sendError(
        res,
        502,
        result.error || 'Artifact generation failed',
        null,
        'GENERATION_FAILED'
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

export default router;
