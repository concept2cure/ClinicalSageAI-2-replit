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
import {
  getOrCreateThread,
  getThreadMessages,
  saveChatMessage as saveMessage,
} from '../services/chat-thread-helpers.js';
import { logKernelDecision } from '../services/kernel-decision-record.js';
import { planKernelExecution } from '../services/kernel-router.js';
import {
  getKernelPolicyHint,
  recordKernelPolicyOutcome,
} from '../services/kernel-adaptive-policy.js';
import { buildGoalPlan, replanGoalPlan } from '../services/kernel-goal-planner.js';
import { buildMemoryContextForChat } from '../services/memory-context-assembler.js';
import { getIntelligencePrefix, buildSectionSpecificPrompt } from '../services/lumen-context-builder.js';
import { interceptChatResponse } from '../services/intelligence/rim-interceptors.js';
import { enrichContextForChat } from '../services/ana-ri/context-enrichment.js';
import { processResponseActions } from '../services/ana-guidance-executor.js';
import { processCommandsInResponse, type CommandContext } from '../services/ana-ri/command-executor.js';

const router = Router();


const dbPool = {
  query: (...args: Parameters<ReturnType<typeof getPool>['query']>) => getPool().query(...args),
};

function isDatabaseAvailable(): boolean {
  try {
    getPool();
    return true;
  } catch {
    return false;
  }
}

// ── Response envelope helpers (matches concept2cure.ts contract) ──
const sendSuccess = <T>(res: Response, data: T, meta?: Record<string, unknown>) => {
  if (meta) return res.json({ success: true, data, meta });
  return res.json({ success: true, data });
};
const sendError = (res: Response, status: number, message: string, details?: unknown, code?: string) =>
  res.status(status).json({ success: false, error: { message, code, details } });

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
const VALID_LENSES: IntentLens[] = ['auto', 'audit', 'improve', 'risk', 'strategy', 'compare'];
const VALID_ROLES: UserRole[] = ['ceo', 'ra_lead', 'medical_writer', 'clinical_lead', 'cmc_lead', 'investor', 'general'];

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
      thread_id,
      intent_lens,
      user_role,
      project_context,
      document_context,
      submission_type,
      conversation_history,
      authoring_context,
    } = req.body;

    if (!message || typeof message !== 'string') {
      return sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE');
    }

    // Validate intent_lens if provided
    const validatedLens: IntentLens | undefined =
      intent_lens && VALID_LENSES.includes(intent_lens) ? (intent_lens as IntentLens) : undefined;

    // Validate user_role if provided
    const validatedRole: UserRole | undefined =
      user_role && VALID_ROLES.includes(user_role) ? (user_role as UserRole) : undefined;

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
      if (ac.artifactVersionId) parts.push(`  <artifact_version_id>${ac.artifactVersionId}</artifact_version_id>`);
      if (ac.artifactStatus) parts.push(`  <artifact_status>${ac.artifactStatus}</artifact_status>`);
      if (ac.submissionType) parts.push(`  <submission_type>${ac.submissionType}</submission_type>`);
      if (ac.readiness) {
        parts.push(`  <readiness score="${ac.readiness.score ?? 'unknown'}" blocked="${ac.readiness.blocked ?? false}">`);
        if (ac.readiness.blockers?.length) {
          for (const b of ac.readiness.blockers) {
            parts.push(`    <blocker severity="${b.severity}" code="${b.code}">${b.message}</blocker>`);
          }
        }
        parts.push('  </readiness>');
      }
      if (ac.contradictions?.length) {
        parts.push('  <contradictions>');
        for (const c of ac.contradictions) {
          parts.push(`    <contradiction id="${c.id}" type="${c.type}" severity="${c.severity}">${c.explanation}</contradiction>`);
        }
        parts.push('  </contradictions>');
      }
      parts.push('</authoring_context>');
      authoringContextBlock = parts.join('\n');
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
    const routingPlan = planKernelExecution({
      route: '/api/ana-ri/chat',
      messageLength: message.length,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      requestedMaxTokens: 4096,
    });
    let goalPlan = buildGoalPlan({
      message,
      intentLens: orchestration.detectedIntent.lens,
      riskTier: routingPlan.riskTier,
      submissionType: orchestration.detectedSubmissionType,
    });

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
      getIntelligencePrefix(orgId ? Number(orgId) : undefined, chatProjectId).catch(() => ''),
      buildMemoryContextForChat({
        threadId: thread_id || undefined,
        organizationId: orgId ? Number(orgId) : undefined,
        projectId: chatProjectId || undefined,
        query: message,
        limitPerLayer: 4,
        maxChars: 3500,
      }).catch(() => ({ memoryBlock: '', atoms: [], diagnostics: null })),
      enrichContextForChat({
        message,
        projectId: chatProjectId,
        organizationId: orgId ? Number(orgId) : undefined,
        submissionType: orchestration.detectedSubmissionType || undefined,
      }).catch(() => ({ block: '', sources: [] as string[] })),
    ]);

    const enrichedSystemPrompt = chatIntelligencePrefix + orchestration.systemPrompt + chatMemoryResult.memoryBlock + chatEnrichment.block;

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
      } catch { /* fall through to client history */ }
    }
    if (!historyLoaded && conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-20)) {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    // Inject file context if file_ids provided
    const fileIds = req.body.file_ids;
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      try {
        const fileResult = await dbPool.query(
          `SELECT id, original_name, mime_type FROM file_uploads WHERE id = ANY($1)`,
          [fileIds]
        );
        if (fileResult.rows.length > 0) {
          const fileContext = fileResult.rows.map((f: any) =>
            `- ${f.original_name} (${f.mime_type}) [ID: ${f.id}]`
          ).join('\n');
          messages.push({
            role: 'user' as const,
            content: `[The user has attached the following files to this message:\n${fileContext}\nReference these files in your response when relevant.]`,
          });
        }
      } catch { /* non-blocking */ }
    }

    // Add current message (use rewritten version if slash command detected)
    const chatEffectiveMessage = chatEnrichment.rewrittenMessage || message;
    messages.push({ role: 'user', content: chatEffectiveMessage });

    // Call AI Gateway
    const gw = ensureGateway();
    if (!gw) {
      return sendError(res, 503, 'AI services unavailable', null, 'GATEWAY_UNAVAILABLE');
    }

    const policyHint = await getKernelPolicyHint({
      organizationId: orgId ? Number(orgId) : null,
      route: '/api/ana-ri/chat',
      taskType: routingPlan.taskType,
    });
    const selectedStrategy = policyHint?.preferredStrategy || routingPlan.strategy;

    const response = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
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
      organizationId: orgIdNum ?? undefined,
      userId,
      artifactCreated: false,
      anaRiOrchestrated: true,
      evidenceCompliant: evidenceCheck.compliant,
      structureScore: structureCheck.score,
      provider: response.provider,
      model: response.model,
    });

    // Kernel Decision Record (best effort, non-blocking)
    void logKernelDecision({
      requestId: `ana-ri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      threadId: resolvedThreadId || null,
      route: '/api/ana-ri/chat',
      organizationId: orgId ? Number(orgId) : null,
      userId,
      projectId: req.body.project_context?.projectId
        ? Number(req.body.project_context.projectId)
        : null,
      plannerVersion: routingPlan.plannerVersion,
      orchestratorName: routingPlan.orchestratorName,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType || null,
      selectedTaskType: routingPlan.taskType,
      selectedProvider: response.provider,
      selectedModel: response.model,
      routingStrategy: selectedStrategy,
      selectedTools: [],
      constraints: {
        ...routingPlan.constraints,
        maxTokens: routingPlan.maxTokens,
        temperature: routingPlan.temperature,
      },
      decisionRationale: routingPlan.decisionRationale,
      estimatedCostUsd: response.usage?.estimatedCostUsd ?? null,
      latencyMs: response.latencyMs ?? null,
      outcome: 'success',
    });
    void recordKernelPolicyOutcome({
      organizationId: orgId ? Number(orgId) : null,
      route: '/api/ana-ri/chat',
      taskType: routingPlan.taskType,
      strategy: selectedStrategy,
      threadId: resolvedThreadId || null,
      modelProvider: response.provider,
      modelName: response.model,
      qualityScore: evaluation.overallScore / Math.max(evaluation.maxOverallScore, 1),
      latencyMs: response.latencyMs ?? null,
      estimatedCostUsd: response.usage?.estimatedCostUsd ?? null,
      success: true,
      metadata: {
        intent: orchestration.detectedIntent.lens,
        submissionType: orchestration.detectedSubmissionType,
        evidenceCompliant: evidenceCheck.compliant,
      },
    });

    // RIM interception — capture intelligence signals (non-blocking)
    const projectIdForRim = req.body.project_id || req.body.context?.projectId;
    if (response.content && projectIdForRim) {
      void interceptChatResponse({
        projectId: String(projectIdForRim),
        organizationId: orgId ? Number(orgId) : undefined,
        threadId: resolvedThreadId || undefined,
        userMessage: message,
        assistantMessage: response.content,
        submissionType: orchestration.detectedSubmissionType || undefined,
      }).catch(() => {});
    }

    return sendSuccess(res, {
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
      },
      structure: {
        valid: structureCheck.valid,
        score: structureCheck.score,
        maxScore: structureCheck.maxScore,
      },
      provider: response.provider,
      model: response.model,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('[AnA RI] Chat error:', error);
    void logKernelDecision({
      requestId: `ana-ri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      route: '/api/ana-ri/chat',
      orchestratorName: 'kernel-router-v1',
      selectedTaskType: 'regulatory_review',
      routingStrategy: 'quality_optimized',
      selectedTools: [],
      outcome: 'failed',
      errorMessage: error?.message || 'unknown error',
      decisionRationale: 'AnA RI route failed before completion.',
    });
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
    if (!gw || gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'No AI providers available.', null, 'GATEWAY_UNAVAILABLE');
    }

    // SSE headers deferred until after context building (M-5 fix)
    // This allows pre-stream failures to return proper HTTP error codes.

    // Resolve context
    const { orgId, userId } = extractRequestContext(req);

    const validatedLens: IntentLens | undefined =
      intent_lens && VALID_LENSES.includes(intent_lens) ? (intent_lens as IntentLens) : undefined;

    const validatedRole: UserRole | undefined =
      user_role && VALID_ROLES.includes(user_role) ? (user_role as UserRole) : undefined;

    const effectiveRole: UserRole = validatedRole || inferRole({
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
      if (ac.artifactStatus) parts.push(`  <artifact_status>${ac.artifactStatus}</artifact_status>`);
      if (ac.submissionType) parts.push(`  <submission_type>${ac.submissionType}</submission_type>`);
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
      getIntelligencePrefix(
        orgId ? Number(orgId) : undefined,
        project_id
      ).catch(() => ''),
      buildMemoryContextForChat({
        threadId: thread_id || undefined,
        organizationId: orgId ? Number(orgId) : undefined,
        projectId: project_id || undefined,
        query: message,
        limitPerLayer: 4,
        maxChars: 3500,
      }).catch(() => ({ memoryBlock: '', atoms: [], diagnostics: null })),
      enrichContextForChat({
        message,
        projectId: project_id,
        organizationId: orgId ? Number(orgId) : undefined,
        submissionType: orchestration.detectedSubmissionType || undefined,
    }).catch(() => ({ block: '', sources: [] as string[] })),
    ]);

    const memoryBlock = memoryResult.memoryBlock;

    if (enrichment.sources.length > 0) {
      console.log(`[AnA RI Stream] Context enriched with: ${enrichment.sources.join(', ')}`);
    }

    // Use rewritten message if slash command was detected
    const effectiveMessage = enrichment.rewrittenMessage || message;

    const fullSystemPrompt = intelligencePrefix + orchestration.systemPrompt + memoryBlock + enrichment.block;

    // Thread resolution (before message building so we can load server history)
    let threadId = thread_id;
    if (orgId) {
      try {
        threadId = await getOrCreateThread(thread_id || null, typeof userId === 'number' ? userId : undefined, 'ana-ri');
        await saveMessage(threadId, 'user', message);
      } catch (e: any) {
        console.error('[AnA RI Stream] Thread persistence failed:', e?.message);
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
      } catch { /* fall through to client history */ }
    }
    if (!streamHistoryLoaded && conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-20)) {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    // Inject file context if file_ids provided
    const streamFileIds = req.body.file_ids;
    if (streamFileIds && Array.isArray(streamFileIds) && streamFileIds.length > 0) {
      try {
        const fileResult = await dbPool.query(
          `SELECT id, original_name, mime_type FROM file_uploads WHERE id = ANY($1)`,
          [streamFileIds]
        );
        if (fileResult.rows.length > 0) {
          const fileContext = fileResult.rows.map((f: any) =>
            `- ${f.original_name} (${f.mime_type}) [ID: ${f.id}]`
          ).join('\n');
          messages.push({
            role: 'user' as const,
            content: `[The user has attached the following files:\n${fileContext}\nReference these files in your response when relevant.]`,
          });
        }
      } catch { /* non-blocking */ }
    }

    messages.push({ role: 'user', content: effectiveMessage });

    // Set SSE headers NOW (after all context building, before first write)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send thread_id immediately so client can track
    res.write(`data: ${JSON.stringify({ type: 'thread_id', thread_id: threadId })}\n\n`);

    // Send orchestration metadata
    res.write(`data: ${JSON.stringify({
      type: 'orchestration',
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
        appliedRole: orchestration.appliedRole,
        activeWorkstream: orchestration.activeWorkstream,
        workstreamHandoff: orchestration.workstreamHandoff,
        suggestedActions: orchestration.suggestedActions,
      },
    })}\n\n`);

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
        res.write(`data: ${JSON.stringify({
          type: metadata?.type || 'text',
          content: chunk,
        })}\n\n`);
      },
      callerModule: 'ana-ri-stream',
    });

    // Persist assistant response
    if (orgId && threadId && fullContent) {
      try {
        await saveMessage(threadId, 'assistant', fullContent);
      } catch (e: any) {
        console.error('[AnA RI Stream] Assistant persist failed:', e?.message);
      }
    }

    // RIM interception — capture intelligence signals (non-blocking)
    if (fullContent && project_id) {
      void interceptChatResponse({
        projectId: String(project_id),
        organizationId: orgId ? Number(orgId) : undefined,
        threadId: threadId || undefined,
        userMessage: message,
        assistantMessage: fullContent,
        submissionType: orchestration.detectedSubmissionType || undefined,
      }).catch(() => {});
    }

    // Guidance executor — auto-create artifacts if response contains action signals
    let executedActions: any[] = [];
    if (fullContent && project_id && orgId) {
      try {
        const guidance = await processResponseActions(fullContent, {
          projectId: typeof project_id === 'string' ? parseInt(project_id, 10) : project_id,
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
          activeProjectId: project_id ? (typeof project_id === 'string' ? parseInt(project_id, 10) : project_id) : undefined,
        };
        const cmdResult = await processCommandsInResponse(fullContent, cmdCtx);
        executedCommands = cmdResult.executedCommands;
        if (executedCommands.length > 0) {
          console.log(`[AnA RI Stream] Executed ${executedCommands.length} command(s)`);
        }
      } catch (e: any) {
        console.warn('[AnA RI Stream] Command executor failed:', e?.message);
      }
    }

    // Send done event
    res.write(`data: ${JSON.stringify({
      type: 'done',
      model: gwResponse.model,
      provider: gwResponse.provider,
      usage: gwResponse.usage,
      latencyMs: gwResponse.latencyMs,
      executedActions: executedActions.length > 0 ? executedActions : undefined,
      executedCommands: executedCommands.length > 0 ? executedCommands : undefined,
      enrichmentSources: enrichment.sources.length > 0 ? enrichment.sources : undefined,
    })}\n\n`);

    res.end();
  } catch (error: any) {
    console.error('[AnA RI Stream] Error:', error.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'An error occurred while generating the response' })}\n\n`);
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
    const { message, intent_lens, submission_type } = req.body || {};
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

    return sendSuccess(res, {
      routingPlan,
      goalPlan,
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
// POST /api/ana-ri/plan — Return planner preview without generation
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { message, intent_lens, submission_type, persist, thread_id } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
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

    return res.json({
      routingPlan,
      goalPlan,
      planRunId,
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to compute plan',
      code: 'PLANNER_ERROR',
      message: error?.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId — Fetch persisted goal plan run
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId', async (req: Request, res: Response) => {
  const planRun = await getGoalPlanRun(req.params.planRunId);
  if (!planRun) {
    return res.status(404).json({ error: 'Plan run not found', code: 'PLAN_NOT_FOUND' });
  }
  return res.json(planRun);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/advance — Advance step status
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/advance', async (req: Request, res: Response) => {
  const { stepId, nextStatus } = req.body || {};
  if (!stepId || !nextStatus) {
    return res
      .status(400)
      .json({ error: 'stepId and nextStatus are required', code: 'INVALID_INPUT' });
  }
  const allowedStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'replanned'] as const;
  if (!allowedStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: 'Invalid nextStatus', code: 'INVALID_STATUS' });
  }

  const result = await advanceGoalPlanStep({
    planRunId: req.params.planRunId,
    stepId,
    nextStatus,
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.message, code: 'PLAN_ADVANCE_FAILED' });
  }
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/execute-next — Execute next runnable step
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/execute-next', async (req: Request, res: Response) => {
  const result = await executeNextGoalPlanStep(req.params.planRunId);
  if (!result.ok) {
    return res.status(400).json({ error: result.message, code: 'PLAN_EXECUTION_FAILED' });
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
  return res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId/events — Step event audit trail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId/events', async (req: Request, res: Response) => {
  const events = await listGoalPlanEvents(req.params.planRunId);
  return res.json({ events });
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
    return res.status(400).json({ error: validation.message, code: 'INVALID_PROTOCOL_EVENT' });
  }

  const recorded = await recordProtocolEvent(event as any);
  if (!recorded.ok) {
    return res
      .status(500)
      .json({ error: 'Failed to record protocol event', code: 'PROTOCOL_WRITE_FAILED' });
  }
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId/protocol — List protocol events
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
  const events = await listProtocolEvents(req.params.planRunId);
  return res.json({ events });
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
  return res.json(metrics);
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
      return sendError(res, 400, `Invalid action_type. Must be one of: ${VALID_ACTIONS.join(', ')}`, null, 'INVALID_ACTION');
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
      organizationId: orgIdNum,
      userId: userId ? Number(userId) : undefined,
      userRole: user_role,
      intentLens: intent_lens,
      title,
      sectionCode: section_code,
    });

    if (!result.success) {
      return sendError(res, 502, result.error || 'Artifact generation failed', null, 'GENERATION_FAILED');
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

router.get('/health', (_req: Request, res: Response) => {
  const gw = ensureGateway();
  const enabledProviders = gw?.getEnabledProviders() || [];
  const databaseAvailable = isDatabaseAvailable();

  const checks = {
    gateway: enabledProviders.length > 0,
    database: databaseAvailable,
  };

  const status = checks.gateway && checks.database ? 'healthy' : 'degraded';

  return sendSuccess(res, {
    status,
    checks,
    providers: enabledProviders,
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
      organizationId: orgIdNum,
      activeProjectId: params?.projectId ? Number(params.projectId) : undefined,
      userName: (req as any).user?.name,
      userRole: (req as any).user?.title,
    };

    let result;
    switch (command) {
      case 'create_project':
        result = await executor.createProject(ctx, params || {});
        break;
      case 'list_projects':
        result = await executor.listProjects(ctx);
        break;
      case 'update_project':
        result = await executor.updateProject(ctx, params?.projectId, params?.updates || {});
        break;
      case 'create_artifact':
        result = await executor.createArtifact(ctx, params || {});
        break;
      case 'update_artifact':
        result = await executor.updateArtifact(ctx, params || {});
        break;
      case 'update_artifact_status':
        result = await executor.updateArtifactStatus(ctx, params || {});
        break;
      case 'list_artifacts':
        result = await executor.listArtifacts(ctx, params?.projectId, params?.filters);
        break;
      case 'place_in_dossier':
        result = await executor.placeInDossier(ctx, params || {});
        break;
      case 'create_task':
        result = await executor.createTask(ctx, params || {});
        break;
      case 'update_task':
        result = await executor.updateTask(ctx, params || {});
        break;
      case 'list_tasks':
        result = await executor.listTasks(ctx, params?.projectId, params?.filters);
        break;
      case 'check_dossier_readiness':
        result = await executor.checkDossierReadiness(ctx, params?.projectId);
        break;
      case 'create_submission_package':
        result = await executor.createSubmissionPackage(ctx, params || {});
        break;
      case 'create_review_thread':
        result = await executor.createReviewThread(ctx, params || {});
        break;
      case 'add_review_comment':
        result = await executor.addReviewComment(ctx, params || {});
        break;
      case 'list_artifact_versions':
        result = await executor.listArtifactVersions(ctx, params || {});
        break;
      case 'run_compliance_scan':
        result = await executor.runComplianceScan(ctx, params || {});
        break;
      case 'export_artifact':
        result = await executor.exportArtifact(ctx, params || {});
        break;
      case 'compare_versions':
        result = await executor.compareVersions(ctx, params || {});
        break;
      case 'review_version_impact':
        result = await executor.reviewVersionImpact(ctx, params || {});
        break;
      case 'create_milestone':
        result = await executor.createMilestone(ctx, params || {});
        break;
      case 'update_milestone':
        result = await executor.updateMilestone(ctx, params || {});
        break;
      case 'list_milestones':
        result = await executor.listMilestones(ctx, params?.packageId);
        break;
      case 'revert_to_version':
        result = await executor.revertToVersion(ctx, params || {});
        break;
      case 'search_artifacts':
        result = await executor.searchArtifacts(ctx, params || {});
        break;
      case 'list_team_members':
        result = await executor.listTeamMembers(ctx);
        break;
      case 'load_user_context':
        result = await executor.loadUserContext(ctx);
        break;
      case 'load_conversation_history':
        result = await executor.loadConversationHistory(ctx, params);
        break;
      default:
        return sendError(res, 400, `Unknown command: ${command}`, { availableCommands: executor.COMMAND_REGISTRY.map((c: any) => c.name) }, 'UNKNOWN_COMMAND');
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error('[AnA RI] Command execution error:', error);
    return sendError(res, 500, error?.message || 'Command execution failed', null, 'EXECUTION_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/commands — List available commands
// ─────────────────────────────────────────────────────────────────────────────

router.get('/commands', async (_req: Request, res: Response) => {
  const { COMMAND_REGISTRY } = await import('../services/ana-ri/command-executor.js');
  return sendSuccess(res, { commands: COMMAND_REGISTRY });
});

export default router;
