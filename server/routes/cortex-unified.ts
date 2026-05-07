/**
 * Unified Cortex Routes
 *
 * Consolidates all Cortex (AI advisory) routes into a single entry point.
 *
 * Consolidated from:
 * - cortexRoutes.ts (main Cortex operations)
 * - cortexAdvisoryRoutes.ts (advisory features)
 * - cortexManagementRoutes.ts (management features)
 * - cortexQueryRoutes.ts (query operations)
 * - ana-cortex.ts (AnA 1.0 RI integration)
 *
 * @version 2.0.0
 * @module server/routes/cortex-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { createScopedLogger } from '../utils/logger';
import { requireAuth } from '../middleware/auth.js';
import { buildContextAwarePrompt } from '../services/ana-context-builder.js';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayResponse } from '../services/ai-gateway/types.js';
import {
  getOrCreateThread,
  getThreadMessages,
  getWindowedMessages,
  saveChatMessage,
} from '../services/chat-thread-helpers.js';
import { pool } from '../db.js';
import jwt from 'jsonwebtoken';
import { getTool, toOpenAITools, fromOpenAIName, logToolRun } from '../services/toolRegistry';
import '../services/tools/index'; // ensure tools are registered
import { ai } from '../lib/unified-ai-client';
import {
  orchestrate,
  detectIntent,
  detectSubmissionType,
} from '../services/ana-ri/orchestrator.js';
import type { UserRole, IntentLens } from '../services/ana-ri/persona.js';
import { planKernelExecution } from '../services/kernel-router.js';
import {
  parseSharedMemoryContract,
  renderSharedMemoryForPrompt,
} from '../services/shared-memory-contract.js';
import { executeGovernedAnaOperation } from '../services/governed-ana-execution.js';

const logger = createScopedLogger('cortex-unified');
const router = Router();

// Security constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 50; // Lower limit for AI queries

// Bounded rate limiter for expensive AI operations (max 10,000 entries to prevent memory leak)
const RATE_LIMIT_MAP_MAX = 10_000;
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const MAX_TOOL_CALLS = 3;
const MAX_TOOL_CHAIN_DEPTH = 2;
const MAX_TOOL_ARG_CHARS = 2000;
const TOOL_NAME_ALLOWLIST = /^[a-z0-9_.-]+$/i;

function sanitizeToolArgs(input: Record<string, string>): Record<string, string> {
  const entries = Object.entries(input || {}).slice(0, 20);
  return Object.fromEntries(
    entries.map(([key, value]) => {
      const safeKey = String(key).slice(0, 100);
      const safeValue =
        typeof value === 'string'
          ? value.slice(0, MAX_TOOL_ARG_CHARS)
          : JSON.stringify(value).slice(0, MAX_TOOL_ARG_CHARS);
      return [safeKey, safeValue];
    })
  );
}

function isSafeToolName(toolName: string): boolean {
  return TOOL_NAME_ALLOWLIST.test(toolName);
}

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const clientId = String(
    (req as any).user?.organizationId || (req as any).tenantId || req.ip || 'anonymous'
  );
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let record = rateLimitMap.get(clientId);

  if (!record || record.resetTime < windowStart) {
    // Evict stale entries if map is at capacity
    if (rateLimitMap.size >= RATE_LIMIT_MAP_MAX) {
      for (const [key, val] of rateLimitMap) {
        if (val.resetTime < windowStart) rateLimitMap.delete(key);
        if (rateLimitMap.size < RATE_LIMIT_MAP_MAX) break;
      }
    }
    record = { count: 1, resetTime: now };
    rateLimitMap.set(clientId, record);
  } else {
    record.count++;
  }

  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    logger.warn(`Rate limit exceeded for Cortex client: ${clientId}`);
    return res.status(429).json({
      error: 'Too many AI requests',
      retryAfter: Math.ceil((record.resetTime + RATE_LIMIT_WINDOW_MS - now) / 1000),
    });
  }

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count));
  next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const organizationId = String((req as any).user?.organizationId || '') || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;

  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module: 'cortex',
  };
  next();
};

const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Cortex route error:', { error: err.message, path: req.path });
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.headers['x-request-id'] || 'unknown',
  });
};

router.use(rateLimiter);
router.use(extractTenantContext);

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'cortex-unified-api',
    version: '2.0.0',
    modules: ['advisory', 'management', 'query', 'ana'],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Cortex AI Advisory Unified API',
    version: '2.0.0',
    description: 'Consolidated API for all AI advisory and assistance operations',
    endpoints: {
      '/main': {
        description: 'Core Cortex operations',
        methods: ['GET', 'POST'],
        legacyPath: '/api/cortex/*',
      },
      '/advisory': {
        description: 'AI advisory features',
        methods: ['GET', 'POST'],
        legacyPath: '/api/cortex/advisory/*',
      },
      '/management': {
        description: 'Cortex session and configuration management',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        legacyPath: '/api/cortex/management/*',
      },
      '/query': {
        description: 'AI query operations',
        methods: ['POST'],
        legacyPath: '/api/cortex/query/*',
      },
      '/ana': {
        description: 'AnA 1.0 RI integration features',
        methods: ['GET', 'POST'],
        legacyPath: '/api/ana-cortex/*',
      },
    },
    rateLimit: {
      limit: 50,
      windowMs: 60000,
      description: '50 AI requests per minute per organization',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT-AWARE CHAT ENDPOINT
// POST /api/cortex/chat — Primary endpoint for ZenChat / AnA RI
// ═══════════════════════════════════════════════════════════════════════════════

// AI Gateway instance (lazy-initialized)
let chatGateway: ReturnType<typeof getGateway> | null = null;
function ensureChatGateway() {
  if (!chatGateway) {
    try {
      chatGateway = getGateway();
    } catch {
      /* demo mode */
    }
  }
  return chatGateway;
}

/**
 * POST /api/cortex/chat
 * Context-aware chat endpoint for AnA RI.
 * Accepts project_id and automatically injects project context into the system prompt.
 */
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      message,
      thread_id,
      project_id,
      submission_type,
      system_prompt,
      stream,
      section_code,
      chatMode,
      context: clientContext,
    } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
    }

    const organizationId =
      Number((req as any).user?.organizationId) || Number((req as any).tenantId);
    if (!organizationId || organizationId <= 0) {
      return res.status(400).json({ error: 'Organization context required', code: 'MISSING_ORG' });
    }
    const userId = (req as any).userId || (req as any).user?.id || null;

    // Resolve project ID — strip "proj_" prefix if present (concept2cure format)
    let numericProjectId: number | undefined;
    if (project_id) {
      const cleaned = String(project_id).replace(/^proj_/, '');
      numericProjectId = parseInt(cleaned, 10) || undefined;
    }

    // Build context-aware system prompt (with optional section-specific guidance)
    // Augment with chatMode and client context when sent from Ana
    let modePrefix = '';
    if (chatMode === 'standard' || !chatMode) {
      // Standard AnA co-pilot mode — inject screen context if available
      if (clientContext?.screen) {
        modePrefix = `The user is currently on the "${clientContext.screen}" screen.`;
        if (clientContext.project) modePrefix += ` Active project: ${clientContext.project}.`;
        if (clientContext.userRole) modePrefix += ` User role: ${clientContext.userRole}.`;
        // Inject module context (active tab, description) for deeper awareness
        if (clientContext.moduleContext) {
          const mc = clientContext.moduleContext;
          if (mc.activeTab) modePrefix += ` Active tab: ${mc.activeTabLabel || mc.activeTab}.`;
          if (mc.tabDescription) modePrefix += ` Context: ${mc.tabDescription}.`;
        }
        modePrefix +=
          '\nAdapt your responses to be relevant to their current workflow context.\n\n';
      }

      // Governed intelligence context: inject live contradiction/assumption data when on precedent-intelligence
      if (clientContext?.screen === 'precedent-intelligence' && numericProjectId) {
        try {
          const { contradictionEngineService } = await import(
            '../services/contradiction-engine-service'
          );
          const findings = await contradictionEngineService.searchFindings({
            organizationId,
            projectId: numericProjectId,
            reviewState: 'unresolved',
            limit: 5,
          });
          if (findings.length > 0) {
            modePrefix += `\n[LIVE GOVERNED INTELLIGENCE — ${findings.length} unresolved contradiction(s) in this project]\n`;
            for (const f of findings) {
              modePrefix += `- ${f.severity.toUpperCase()}: ${f.title} (${
                f.contradictionType
              }, authority: ${f.authorityState}, source: ${f.sourceClassification})\n`;
            }
            modePrefix += `\nWhen asked about contradictions, provide this real data. Do not summarize vaguely.\n\n`;
          }
        } catch {
          // Table may not exist — silently skip
        }
      }
    }

    const { systemPrompt: baseSystemPrompt, context } = await buildContextAwarePrompt({
      projectId: numericProjectId,
      organizationId,
      userId,
      submissionType: submission_type || clientContext?.productType,
      customSystemPrompt: system_prompt,
      sectionCode: section_code || undefined,
    });

    // Get or create thread (prefix 'cortex' to distinguish from legacy chat)
    const threadId = await getOrCreateThread(thread_id, userId, 'cortex');

    // Token budget: model max (128k for gpt-4o-mini) minus system prompt, new message, and response buffer
    const MODEL_MAX_TOKENS = 128_000;
    const RESPONSE_BUFFER = 4_000;

    // Load working memory summary if available
    let workingMemorySummary: string | null = null;
    try {
      const wmResult = await pool.query(
        `SELECT summary FROM conversation_working_memory
         WHERE thread_id = $1 ORDER BY generated_at DESC LIMIT 1`,
        [threadId]
      );
      if (wmResult.rows.length > 0) {
        workingMemorySummary = wmResult.rows[0].summary;
      }
    } catch {
      // Table may not exist yet — silently skip
    }

    // ── ORCHESTRATOR: Enrich system prompt with intent detection, deficiency
    //    context, submission-type intelligence, and conversation continuity ──
    // Load conversation history first (needed for continuity context)
    const systemTokenEstimate = Math.ceil(baseSystemPrompt.length / 4);
    const messageTokenEstimate = Math.ceil(message.length / 4);
    const historyBudget =
      MODEL_MAX_TOKENS - systemTokenEstimate - messageTokenEstimate - RESPONSE_BUFFER;

    const { messages: previousMessages, wasTruncated } = await getWindowedMessages(
      threadId,
      historyBudget,
      workingMemorySummary
    );

    if (wasTruncated) {
      logger.info(`Thread ${threadId}: conversation truncated to fit token budget`);
    }

    // Map user role from client context
    const userRoleMap: Record<string, UserRole> = {
      ceo: 'ceo',
      founder: 'ceo',
      executive: 'ceo',
      ra_lead: 'ra_lead',
      regulatory: 'ra_lead',
      regulatory_affairs: 'ra_lead',
      medical_writer: 'medical_writer',
      writer: 'medical_writer',
      clinical_lead: 'clinical_lead',
      clinical: 'clinical_lead',
      cmc_lead: 'cmc_lead',
      cmc: 'cmc_lead',
      investor: 'investor',
      diligence: 'investor',
    };
    const resolvedUserRole: UserRole =
      (clientContext?.userRole && userRoleMap[clientContext.userRole.toLowerCase()]) || 'general';

    // Build conversation history for orchestrator continuity analysis
    const conversationHistory = previousMessages
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Run the orchestrator — intent detection + deficiency context + role adaption + continuity
    const orchestratorResult = orchestrate({
      message,
      userRole: resolvedUserRole,
      projectContext: context.project
        ? {
            productName: context.project.name,
            therapeuticArea: context.project.therapeuticArea || undefined,
            submissionType: context.project.submissionType,
            targetAgency: undefined,
            phase: context.project.phase || undefined,
          }
        : undefined,
      submissionType: submission_type || undefined,
      conversationHistory,
    });
    const contradictionCount = Number(clientContext?.contradictionCount || 0);
    const criticalContradictionCount = Number(clientContext?.criticalContradictionCount || 0);
    const executionPlan = planKernelExecution({
      route: '/api/cortex/chat',
      messageLength: message.length,
      intentLens: orchestratorResult.detectedIntent.lens,
      intentConfidence: orchestratorResult.detectedIntent.confidence,
      submissionType: orchestratorResult.detectedSubmissionType,
      hasEvidence: !!workingMemorySummary,
      contradictionCount: Number.isFinite(contradictionCount) ? contradictionCount : 0,
      criticalContradictionCount: Number.isFinite(criticalContradictionCount)
        ? criticalContradictionCount
        : 0,
    });

    // Compose the final system prompt: base context + orchestrator enrichments
    // The base prompt (from ana-context-builder) already has the core AnA identity,
    // project context, user intelligence, and section-specific guidance.
    // The orchestrator adds: intent lens, deficiency patterns, role-adaptive context,
    // conversation continuity, and document action context.
    const orchestratorEnrichment = orchestratorResult.systemPrompt;

    // Extract only the dynamic overlays (skip the base identity which is already in baseSystemPrompt)
    // The orchestrator prompt starts with the core AnA RI prompt, then appends overlays.
    // We want just the overlays — everything after the core prompt ends.
    const overlayMarkers = [
      '## CURRENT USER ROLE',
      '## ACTIVE INTENT LENS',
      '## CURRENT PROJECT CONTEXT',
      '## CURRENT DOCUMENT CONTEXT',
      '## ACTIVE WORKSTREAM',
      '## WORKSTREAM HANDOFF',
      '## DEFICIENCY',
      '## DOCUMENT ACTION',
      '## ROLE-ADAPTIVE',
      '## OPERATIONAL COMMANDS',
      '## CONVERSATION CONTINUITY',
    ];
    const overlayParts: string[] = [];
    for (const marker of overlayMarkers) {
      const idx = orchestratorEnrichment.indexOf(marker);
      if (idx !== -1) {
        // Find the next marker or end of string
        let endIdx = orchestratorEnrichment.length;
        for (const nextMarker of overlayMarkers) {
          if (nextMarker === marker) continue;
          const nextIdx = orchestratorEnrichment.indexOf(nextMarker, idx + marker.length);
          if (nextIdx !== -1 && nextIdx < endIdx && nextIdx > idx) {
            endIdx = nextIdx;
          }
        }
        overlayParts.push(orchestratorEnrichment.substring(idx, endIdx).trim());
      }
    }

    const dynamicOverlays = overlayParts.length > 0 ? '\n\n' + overlayParts.join('\n\n') : '';

    // Log orchestration metadata for debugging
    logger.info(
      `[AnA RI] Orchestrator: intent=${orchestratorResult.detectedIntent.lens} ` +
        `(${
          orchestratorResult.orchestrationMeta.intentSource
        }, conf=${orchestratorResult.detectedIntent.confidence.toFixed(2)}), ` +
        `submission=${orchestratorResult.detectedSubmissionType || 'none'} ` +
        `(${orchestratorResult.orchestrationMeta.submissionTypeSource}), ` +
        `role=${orchestratorResult.appliedRole}, ` +
        `deficiency=${orchestratorResult.orchestrationMeta.deficiencyContextInjected}, ` +
        `docActions=${orchestratorResult.orchestrationMeta.documentActionContextInjected}, ` +
        `workstream=${orchestratorResult.activeWorkstream.stream}`
    );

    const systemPrompt = (modePrefix ? modePrefix : '') + baseSystemPrompt + dynamicOverlays;

    // Shared message array for both paths
    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Inject working memory summary between system prompt and history
    if (workingMemorySummary) {
      const sharedMemory = parseSharedMemoryContract(workingMemorySummary);
      aiMessages.push({
        role: 'system',
        content: renderSharedMemoryForPrompt(sharedMemory),
      });
    }

    // Add windowed history + new message
    aiMessages.push(
      ...previousMessages.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message }
    );

    // ── STREAMING PATH (SSE) ────────────────────────────────────────────────
    if (stream === true) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let fullContent = '';
      let streamModel = 'ana-cortex-demo';
      let streamAborted = false;
      const toolArtifacts: Array<{
        type: string;
        id: string;
        title: string;
        status: string;
        data?: unknown;
      }> = [];

      // Handle client disconnect to prevent orphaned async work
      res.on('close', () => {
        streamAborted = true;
        logger.debug('[Stream] Client disconnected');
      });
      res.on('error', err => {
        streamAborted = true;
        logger.warn(`[Stream] Response error: ${err.message}`);
      });

      // Send initial intelligence metadata so UI can display intent/context immediately
      if (!streamAborted) {
        res.write(
          `data: ${JSON.stringify({
            type: 'thinking',
            intent: orchestratorResult.detectedIntent.lens,
            intentConfidence: orchestratorResult.detectedIntent.confidence,
            submissionType: orchestratorResult.detectedSubmissionType,
            role: orchestratorResult.appliedRole,
            activeWorkstream: orchestratorResult.activeWorkstream,
            workstreamHandoff: orchestratorResult.workstreamHandoff,
            phase: 'analyzing',
          })}\n\n`
        );
      }

      try {
        const openaiTools = toOpenAITools();

        if (openaiTools.length === 0) {
          // ── Fast path: no tools registered — stream directly ─────────────
          const streamResponse = await ai.chat(aiMessages as any, {
            taskType: 'chat',
            maxTokens: 4000,
            temperature: 0.7,
            callerModule: 'cortex-unified/chat-stream',
            onStream: (chunk: string) => {
              if (!streamAborted && chunk) {
                fullContent += chunk;
                res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
              }
            },
          });
          streamModel = `${streamResponse.provider}/${streamResponse.model}`;
          // If onStream wasn't invoked (provider didn't stream), send full content
          if (!fullContent && streamResponse.content) {
            fullContent = streamResponse.content;
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: fullContent })}\n\n`);
          }
        } else {
          // ── Phase 1: Non-streaming call with tool schemas ──────────────────
          const initialResponse = await ai.chat({
            taskType: 'chat',
            messages: aiMessages as any,
            tools: openaiTools.length > 0 ? (openaiTools as any) : undefined,
            maxTokens: 4000,
            temperature: 0.7,
            callerModule: 'cortex-unified/chat-stream',
          });
          streamModel = `${initialResponse.provider}/${initialResponse.model}`;
          const initialContent = initialResponse.content || '';

          // ── Phase 2: Check for tool invocations from the AI response ────
          // Parse tool calls from the response if the AI suggests tool usage
          const toolCallPattern = /\[TOOL_CALL:(\w+)\((.*?)\)\]/g;
          const detectedToolCalls: Array<{ name: string; args: Record<string, string> }> = [];
          let match;
          while ((match = toolCallPattern.exec(initialContent)) !== null) {
            try {
              detectedToolCalls.push({ name: match[1], args: JSON.parse(match[2] || '{}') });
            } catch {
              /* skip malformed */
            }
          }

          if (detectedToolCalls.length > 0 && openaiTools.length > 0) {
            if (!executionPlan.allowToolExecution) {
              logger.warn('[Chat] Tool execution blocked by kernel risk policy for this request');
              aiMessages.push({
                role: 'user' as const,
                content:
                  'Tool execution is disabled for this high-risk context. Continue with reasoning only.',
              });
            }

            const toolCalls = executionPlan.allowToolExecution
              ? detectedToolCalls.slice(0, Math.min(MAX_TOOL_CALLS, executionPlan.maxToolCalls))
              : [];

            // Loop detection: reject if LLM requests the same tool twice
            const seenTools = new Set<string>();
            const dedupedCalls = toolCalls.filter(tc => {
              const name = fromOpenAIName(tc.name);
              if (seenTools.has(name)) {
                logger.warn(
                  `[Chat] Loop detected: LLM requested "${name}" twice — skipping duplicate`
                );
                return false;
              }
              seenTools.add(name);
              return true;
            });

            // Notify client that tools are being executed
            res.write(
              `data: ${JSON.stringify({
                type: 'thinking',
                phase: 'executing_tools',
                toolCount: dedupedCalls.length,
              })}\n\n`
            );
            res.write(
              `data: ${JSON.stringify({
                type: 'status',
                text: `Running ${dedupedCalls.length} tool(s)...`,
              })}\n\n`
            );

            // Push the assistant message
            aiMessages.push({ role: 'assistant', content: initialContent });

            for (const toolCall of dedupedCalls) {
              const toolName = fromOpenAIName(toolCall.name);
              const toolArgs = sanitizeToolArgs(toolCall.args);

              if (!isSafeToolName(toolName)) {
                logger.warn(`[Chat] Unsafe tool name blocked: ${toolName}`);
                aiMessages.push({
                  role: 'user' as const,
                  content: `Tool "${toolName}" is blocked by policy. Continue without it.`,
                });
                continue;
              }

              const t0 = Date.now();
              const tool = getTool(toolName);
              if (!tool) {
                logger.warn(`[Chat] LLM requested unknown tool: ${toolName}`);
                aiMessages.push({
                  role: 'user' as const,
                  content: `Tool "${toolName}" was not found. Please respond without it.`,
                });
                logToolRun({
                  threadId,
                  projectId: numericProjectId,
                  userId,
                  organizationId,
                  toolName,
                  arguments: toolArgs,
                  result: {},
                  status: 'not_found',
                  errorMessage: `Tool "${toolName}" not found`,
                  latencyMs: Date.now() - t0,
                });
                continue;
              }

              try {
                const toolContext = {
                  organizationId: String(organizationId),
                  userId: userId ? String(userId) : null,
                  projectId: numericProjectId ? `proj_${numericProjectId}` : null,
                };

                const result = await tool.execute(toolArgs, toolContext);
                const latencyMs = Date.now() - t0;

                // Collect artifacts for the response
                if (result.artifact) {
                  toolArtifacts.push(result.artifact);
                }

                const resultPayload = result.artifact || { message: result.message.content };
                aiMessages.push({
                  role: 'user' as const,
                  content: `Tool "${toolName}" result: ${JSON.stringify(resultPayload)}`,
                });

                // Guardrailed tool chaining (bounded depth + dedupe)
                const chainQueue = Array.isArray(result.chain) ? [...result.chain] : [];
                const executedChain = new Set<string>([toolName]);
                let depth = 0;
                while (
                  chainQueue.length > 0 &&
                  depth < Math.min(MAX_TOOL_CHAIN_DEPTH, executionPlan.maxToolChainDepth)
                ) {
                  const nextToolName = chainQueue.shift()!;
                  if (executedChain.has(nextToolName)) {
                    logger.warn(`[Chat] Skipping duplicate chained tool: ${nextToolName}`);
                    continue;
                  }
                  if (!isSafeToolName(nextToolName)) {
                    logger.warn(`[Chat] Blocked chained tool by name policy: ${nextToolName}`);
                    continue;
                  }
                  const nextTool = getTool(nextToolName);
                  if (!nextTool) {
                    logger.warn(`[Chat] Chained tool not found: ${nextToolName}`);
                    continue;
                  }

                  executedChain.add(nextToolName);
                  depth += 1;
                  const ct0 = Date.now();
                  try {
                    const chained = await nextTool.execute(toolArgs, toolContext);
                    const chainLatencyMs = Date.now() - ct0;
                    const chainPayload = chained.artifact || {
                      message: chained.message?.content || 'ok',
                    };
                    if (chained.artifact) toolArtifacts.push(chained.artifact);
                    aiMessages.push({
                      role: 'user' as const,
                      content: `Tool "${nextToolName}" result: ${JSON.stringify(chainPayload)}`,
                    });
                    logToolRun({
                      threadId,
                      projectId: numericProjectId,
                      userId,
                      organizationId,
                      toolName: nextToolName,
                      arguments: toolArgs,
                      result: chainPayload as Record<string, unknown>,
                      status: 'success',
                      latencyMs: chainLatencyMs,
                    });
                  } catch (chainErr: any) {
                    const chainLatencyMs = Date.now() - ct0;
                    logger.warn(
                      `[Chat] Chained tool "${nextToolName}" failed: ${chainErr?.message}`
                    );
                    logToolRun({
                      threadId,
                      projectId: numericProjectId,
                      userId,
                      organizationId,
                      toolName: nextToolName,
                      arguments: toolArgs,
                      result: {},
                      status: 'error',
                      errorMessage: chainErr?.message || 'chain tool error',
                      latencyMs: chainLatencyMs,
                    });
                  }
                }

                logger.info(`[Chat] Tool "${toolName}" executed in ${latencyMs}ms`);
                logToolRun({
                  threadId,
                  projectId: numericProjectId,
                  userId,
                  organizationId,
                  toolName,
                  arguments: toolArgs,
                  result: resultPayload as Record<string, unknown>,
                  status: 'success',
                  latencyMs,
                });
              } catch (toolErr: any) {
                const latencyMs = Date.now() - t0;
                logger.error(
                  `[Chat] Tool "${toolName}" failed in ${latencyMs}ms: ${toolErr.message}`
                );
                aiMessages.push({
                  role: 'user' as const,
                  content: `Tool "${toolName}" failed: ${toolErr.message}. Please respond without it.`,
                });
                logToolRun({
                  threadId,
                  projectId: numericProjectId,
                  userId,
                  organizationId,
                  toolName,
                  arguments: toolArgs,
                  result: {},
                  status: 'error',
                  errorMessage: toolErr.message,
                  latencyMs,
                });
              }
            }

            // ── Phase 3: Stream the final LLM response with tool results ───
            const finalResponse = await ai.chat(aiMessages as any, {
              taskType: 'chat',
              maxTokens: 4000,
              temperature: 0.4,
              callerModule: 'cortex-unified/chat-stream-final',
              onStream: (chunk: string) => {
                if (!streamAborted && chunk) {
                  fullContent += chunk;
                  res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
                }
              },
            });
            // If onStream wasn't invoked (provider didn't stream), send the full content
            if (!fullContent && finalResponse.content) {
              fullContent = finalResponse.content;
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: fullContent })}\n\n`);
            }
          } else {
            // ── No tool calls — stream the content directly ──────────────────
            fullContent = initialContent;
            if (fullContent) {
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: fullContent })}\n\n`);
            }
          }
        } // close tools path else
      } catch (streamErr: any) {
        logger.warn(`[Chat] AI stream failed, using demo response: ${streamErr.message}`);
        fullContent = generateContextAwareDemoResponse(message, context);
        res.write(
          `data: ${JSON.stringify({
            type: 'demo_warning',
            message: 'AI service unavailable — showing pre-generated response',
          })}\n\n`
        );
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: fullContent })}\n\n`);
      }

      // Persist both messages after stream completes
      await saveChatMessage(threadId, 'user', message, streamModel);
      await saveChatMessage(threadId, 'assistant', fullContent, streamModel, 0);

      // ── AUTO-SUMMARIZE: Generate working memory summary after extended conversations ──
      // This runs async (fire-and-forget) to avoid blocking the response
      if (previousMessages.length >= 10 && !streamAborted) {
        generateWorkingMemorySummary(
          threadId,
          previousMessages,
          message,
          fullContent,
          organizationId
        ).catch((err: any) =>
          logger.warn(`[WorkingMemory] Auto-summarization failed: ${err.message}`)
        );
      }

      // Include artifacts in the done event so the client can display them
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          thread_id: threadId,
          artifacts: toolArtifacts.length > 0 ? toolArtifacts : undefined,
          intelligence: {
            intent: orchestratorResult.detectedIntent.lens,
            intentConfidence: orchestratorResult.detectedIntent.confidence,
            submissionType: orchestratorResult.detectedSubmissionType,
            activeWorkstream: orchestratorResult.activeWorkstream,
            workstreamHandoff: orchestratorResult.workstreamHandoff,
            suggestedActions: orchestratorResult.suggestedActions,
          },
        })}\n\n`
      );
      res.end();
      return;
    }

    // ── NON-STREAMING PATH (JSON) ───────────────────────────────────────────
    let assistantMessage: string;
    let model = 'ana-cortex-demo';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Route through AI Gateway
    const gw = ensureChatGateway();
    if (gw && gw.getEnabledProviders().length > 0) {
      try {
        logger.info(
          `[Chat] Sending context-aware message (project=${numericProjectId || 'none'}, sub=${
            context.project?.submissionType || 'none'
          }, section=${section_code || 'none'})`
        );

        const gwResponse: GatewayResponse = await gw.route({
          taskType: 'chat',
          messages: aiMessages,
          temperature: 0.7,
          maxTokens: 4000,
          callerModule: 'ana-cortex-chat',
          organizationId: String(organizationId),
          userId: userId ? String(userId) : undefined,
          projectId: numericProjectId ? String(numericProjectId) : undefined,
        });

        assistantMessage =
          gwResponse.content ||
          'I apologize, but I was unable to generate a response. Please try again.';
        model = `${gwResponse.provider}/${gwResponse.model}`;
        usage = {
          prompt_tokens: gwResponse.usage.inputTokens,
          completion_tokens: gwResponse.usage.outputTokens,
          total_tokens: gwResponse.usage.totalTokens,
        };
      } catch (gwError: any) {
        logger.warn(`[Chat] AI Gateway call failed, using demo mode: ${gwError.message}`);
        assistantMessage = generateContextAwareDemoResponse(message, context);
        model = 'ana-cortex-demo';
      }
    } else {
      assistantMessage = generateContextAwareDemoResponse(message, context);
    }

    // Persist messages (parallel — independent operations)
    await Promise.all([
      saveChatMessage(threadId, 'user', message, model),
      saveChatMessage(threadId, 'assistant', assistantMessage, model, usage.total_tokens),
    ]);

    // Auto-summarize for long conversations (fire-and-forget)
    if (previousMessages.length >= 10) {
      generateWorkingMemorySummary(
        threadId,
        previousMessages,
        message,
        assistantMessage,
        organizationId
      ).catch((err: any) =>
        logger.warn(`[WorkingMemory] Auto-summarization failed: ${err.message}`)
      );
    }

    res.json({
      answer: assistantMessage,
      response: assistantMessage,
      thread_id: threadId,
      usage,
      model,
      demo: model === 'ana-cortex-demo', // Flag demo fallback so UI can warn users
      context: {
        projectName: context.project?.name || null,
        submissionType: context.project?.submissionType || submission_type || null,
        progress: context.project?.progress || null,
        documentsTotal: context.documents?.totalDocuments || 0,
        documentsCompleted: context.documents?.completedDocuments || 0,
        sectionCode: section_code || null,
      },
      intelligence: {
        intent: orchestratorResult.detectedIntent.lens,
        intentConfidence: orchestratorResult.detectedIntent.confidence,
        submissionType: orchestratorResult.detectedSubmissionType,
        activeWorkstream: orchestratorResult.activeWorkstream,
        workstreamHandoff: orchestratorResult.workstreamHandoff,
        suggestedActions: orchestratorResult.suggestedActions,
      },
      orchestration: {
        detectedIntent: orchestratorResult.detectedIntent,
        detectedSubmissionType: orchestratorResult.detectedSubmissionType,
        appliedRole: orchestratorResult.appliedRole,
        activeWorkstream: orchestratorResult.activeWorkstream,
        workstreamHandoff: orchestratorResult.workstreamHandoff,
        suggestedActions: orchestratorResult.suggestedActions,
        meta: orchestratorResult.orchestrationMeta,
      },
    });
  } catch (error: any) {
    logger.error(`[Chat] Error: ${error.message}`);
    res.status(500).json({
      error: 'Failed to process message',
      code: 'CHAT_ERROR',
      message: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE DRAFT — Persist AI-generated content as a tagged artifact
// POST /api/cortex/save-draft
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/save-draft', requireAuth, async (req: Request, res: Response) => {
  try {
    const { project_id, section_code, title, content, status } = req.body || {};

    if (!project_id || !section_code || !content) {
      return res.status(400).json({
        error: 'project_id, section_code, and content are required',
      });
    }

    const organizationId =
      Number((req as any).user?.organizationId) || Number((req as any).tenantId);
    if (!organizationId || organizationId <= 0) {
      return res.status(400).json({ error: 'Organization context required', code: 'MISSING_ORG' });
    }
    const userId = (req as any).userId || (req as any).user?.id || null;

    const numericProjectId = parseInt(String(project_id).replace(/^proj_/, ''), 10);
    if (!numericProjectId) {
      return res.status(400).json({ error: 'Invalid project_id' });
    }

    const execution = await executeGovernedAnaOperation({
      evaluationInput: {
        context: {
          organizationId: String(organizationId),
          projectId: String(numericProjectId),
          actorId: String(userId || 'system'),
          intendedAction: 'create',
          documentType: 'cortex_draft',
          sectionCode: section_code,
          ctdSection: section_code,
          originSurface: 'cortex-save-draft',
        },
        documentState: {
          hasContent: Boolean(content?.trim()),
          hasEvidence: /\[(KNOWN|INFERRED|MISSING)\]/.test(content),
          hasBeenReviewed: false,
          hasApproval: false,
          hasPlacement: Boolean(section_code),
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: 0,
          criticalContradictionCount: 0,
        },
      },
      artifactMutation: {
        projectId: numericProjectId,
        organizationId,
        documentType: 'cortex_draft',
        artifactClass: 'ana_cortex_draft',
        sectionCode: section_code,
        title: title || `Draft: ${section_code}`,
        content,
        status: status || 'draft',
        source: 'AnA',
        intentLens: 'auto',
        originSurface: 'cortex-save-draft',
        provenance: { savedVia: 'cortex-save-draft' },
        structureSections: [],
        qualityGate: { grade: 'pending', pass: true, issues: [] },
        versioningMode: 'create',
      },
    });

    if (execution.persistenceStatus !== 'persisted' || !execution.artifactMutation) {
      return res.status(409).json({
        error: 'Governed draft persistence rejected',
        code: 'GOVERNED_PERSISTENCE_REJECTED',
        details: {
          persistenceStatus: execution.persistenceStatus,
          decisionReference: execution.decisionReference,
        },
      });
    }

    logger.info(
      `[SaveDraft] Artifact ${execution.artifactMutation.isNew ? 'created' : 'updated'}: ${
        execution.artifactMutation.artifactId
      } for section ${section_code}`
    );

    res.json({
      success: true,
      artifactId: execution.artifactMutation.artifactId,
      sectionCode: execution.artifactMutation.sectionCode,
      isNew: execution.artifactMutation.isNew,
      sectionStatusUpdated: execution.artifactMutation.sectionStatusUpdated,
      decisionReference: execution.decisionReference,
    });
  } catch (error: any) {
    logger.error(`[SaveDraft] Error: ${error.message}`);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

/**
 * Demo response generator that uses project context for relevance.
 */
function generateContextAwareDemoResponse(
  message: string,
  context: import('../services/ana-context-builder.js').AnAContext
): string {
  const lower = message.toLowerCase().trim();
  const projectName = context.project?.name || 'your project';
  const subType = context.project?.submissionType || 'regulatory submission';
  const progress = context.project?.progress || 0;
  const userName = context.userName || '';

  // Greetings
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|greetings|yo)\b/i.test(lower)) {
    const greeting = userName ? `Hello, ${userName}!` : 'Hello!';
    return `## ${greeting}

Welcome to **${projectName}**. I'm AnA, your regulatory intelligence co-pilot.

${
  progress > 0
    ? `Your **${subType}** is at **${progress}%** progress.${
        context.documents
          ? ` You have ${context.documents.completedDocuments}/${context.documents.totalDocuments} documents completed.`
          : ''
      }`
    : `I see you're working on a **${subType}**. Let's make progress together.`
}

### What I can help with right now
- **Draft** any CTD module section or regulatory document
- **Review** your existing documents for compliance gaps
- **Strategize** your submission timeline and approach

What would you like to work on?`;
  }

  if (lower.includes('status') || lower.includes('progress') || lower.includes('where')) {
    return `## ${projectName} — Status Overview

**Submission Type**: ${subType}
**Overall Progress**: ${progress}%
${
  context.documents
    ? `**Documents**: ${context.documents.completedDocuments}/${context.documents.totalDocuments} completed`
    : ''
}

### Recommended Next Steps

1. ${
      progress < 30
        ? 'Complete Module 1 administrative forms (FDA 1571, 1572)'
        : progress < 60
        ? 'Finalize Module 2 summaries and Module 3 CMC data'
        : 'Complete QA review and prepare eCTD package for submission'
    }
2. Review any open document gaps in the CTD section navigator
3. Run a compliance check before advancing to the next phase

Would you like me to focus on a specific module or document section?`;
  }

  if (
    lower.includes('ind') ||
    lower.includes('module') ||
    lower.includes('ctd') ||
    lower.includes('ectd')
  ) {
    return `## IND CTD Structure for ${projectName}

The IND application follows the ICH Common Technical Document (CTD) format with 5 modules:

| Module | Content | Status |
|--------|---------|--------|
| **M1** | Regional Administrative (FDA Forms, Cover Letter) | ${
      progress > 20 ? '✅ In Progress' : '⬜ Not Started'
    } |
| **M2** | CTD Summaries (QOS, Nonclinical/Clinical Overviews) | ${
      progress > 40 ? '✅ In Progress' : '⬜ Not Started'
    } |
| **M3** | Quality/CMC (Drug Substance S.1-S.7, Drug Product P.1-P.8) | ${
      progress > 50 ? '✅ In Progress' : '⬜ Not Started'
    } |
| **M4** | Nonclinical Study Reports (Pharm, PK, Tox) | ${
      progress > 60 ? '✅ In Progress' : '⬜ Not Started'
    } |
| **M5** | Clinical (Phase 1 Protocol, Study Reports) | ${
      progress > 70 ? '✅ In Progress' : '⬜ Not Started'
    } |

### Key References
- **21 CFR 312.23(a)** — Content and format of an IND
- **ICH M4** — The Common Technical Document
- **ICH M8** — eCTD v4.0 Implementation Guide

What specific module or section would you like help with?`;
  }

  if (lower.includes('help') || lower.includes('what can') || lower.includes('how')) {
    return `## How I Can Help with ${projectName}

I'm AnA, your AI regulatory intelligence engine. For your **${subType}** submission, I can:

1. **Draft Documents** — Generate eCTD-compliant sections for any CTD module
2. **Review Content** — Check documents against regulatory requirements and flag gaps
3. **Guide Strategy** — Recommend submission strategies and timeline optimization
4. **Track Compliance** — Monitor 21 CFR Part 11, ICH, and agency-specific requirements
5. **Analyze Risks** — Identify potential deficiencies before FDA review

### Quick Actions
- "Draft Module 2.3 Quality Overall Summary"
- "What sections are missing for my IND?"
- "Review my drug substance characterization"
- "Create a submission timeline"

What would you like to work on?`;
  }

  return `Thank you for your question about **${projectName}** (${subType}).

I'd be happy to help. Based on your current progress (${progress}%), here are some thoughts:

${
  context.documents && context.documents.totalDocuments > 0
    ? `You have **${context.documents.completedDocuments}** of **${context.documents.totalDocuments}** documents completed. `
    : "It looks like you're in the early stages of document preparation. "
}

To give you the most relevant guidance, could you specify:
1. Which CTD module or section you're working on?
2. Whether you need help drafting, reviewing, or strategizing?

I can also provide a full gap analysis of your submission package if that would be helpful.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER MOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

async function mountSubRouters() {
  // Main Cortex routes
  try {
    const cortexModule = await import('./cortexRoutes');
    router.use('/', cortexModule.default); // Legacy-compatible root mount
    router.use('/main', cortexModule.default);
    logger.info('Mounted: / (legacy) and /main (core Cortex)');
  } catch (error) {
    logger.error('Failed to mount core Cortex routes:', error);
  }

  // Advisory routes
  try {
    const advisoryModule = await import('./cortexAdvisoryRoutes');
    router.use('/advisory', advisoryModule.default);
    logger.info('Mounted: /advisory (AI advisory)');
  } catch (error) {
    logger.error('Failed to mount advisory routes:', error);
  }

  // Management routes (from cortexManagementRoutes.ts)
  // Note: This route exports a factory function requiring a database pool.
  // Skipping auto-mount - must be initialized at application startup.
  // try {
  //   const managementModule = await import('./cortexManagementRoutes');
  //   router.use('/management', managementModule.createCortexManagementRoutes(pool));
  //   logger.info('Mounted: /management (Cortex management)');
  // } catch (error) {
  //   logger.error('Failed to mount management routes:', error);
  // }
  logger.warn('Cortex management routes require explicit initialization with database pool');

  // Query routes
  try {
    const queryModule = await import('./cortexQueryRoutes');
    router.use('/query', queryModule.default);
    logger.info('Mounted: /query (AI queries)');
  } catch (error) {
    logger.error('Failed to mount query routes:', error);
  }

  // AnA 1.0 RI integration
  try {
    const anaModule = await import('./ana-cortex');
    router.use('/ana', anaModule.default);
    logger.info('Mounted: /ana (AnA 1.0 RI integration)');
  } catch (error) {
    logger.error('Failed to mount AnA 1.0 RI routes:', error);
  }

  // Clinical intelligence (Foresight capabilities under Cortex gateway)
  try {
    const foresightAdvancedModule = await import('./foresight-ai-advanced');
    router.use('/clinical', foresightAdvancedModule.default);
    logger.info('Mounted: /clinical (Foresight advanced capabilities)');
  } catch (error) {
    logger.error('Failed to mount clinical routes:', error);
  }

  // Feedback orchestration (Foresight feedback under Cortex gateway)
  try {
    const foresightFeedbackModule = await import('./foresight-feedback');
    router.use('/feedback', foresightFeedbackModule.default);
    logger.info('Mounted: /feedback (Foresight feedback)');
  } catch (error) {
    logger.error('Failed to mount feedback routes:', error);
  }

  // Legacy foresight core (exposed under Cortex gateway)
  try {
    const foresightCoreModule = await import('./foresight-api');
    router.use('/foresight', foresightCoreModule.default);
    logger.info('Mounted: /foresight (Foresight core)');
  } catch (error) {
    logger.error('Failed to mount foresight core routes:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREAD MANAGEMENT — list, get, create, delete conversation threads
// ═══════════════════════════════════════════════════════════════════════════════

function extractUserId(req: Request): number | null {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as any;
    return decoded?.userId ? Number(decoded.userId) : null;
  } catch {
    return null;
  }
}

function requireAuthenticatedUserId(
  req: Request,
  res: Response,
  code:
    | 'CORTEX_THREADS_AUTH_REQUIRED'
    | 'CORTEX_THREAD_AUTH_REQUIRED'
    | 'CORTEX_THREAD_CREATE_AUTH_REQUIRED'
    | 'CORTEX_THREAD_UPDATE_AUTH_REQUIRED'
    | 'CORTEX_THREAD_DELETE_AUTH_REQUIRED'
): number | null {
  const userId = extractUserId(req);
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code,
    });
    return null;
  }
  return userId;
}

/** GET /api/cortex/threads — list threads for the current user */
router.get('/threads', async (req: Request, res: Response) => {
  try {
    const userId = requireAuthenticatedUserId(req, res, 'CORTEX_THREADS_AUTH_REQUIRED');
    if (!userId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const projectId = req.query.project_id as string | undefined;

    let query = `
      SELECT ct.id, ct.title, ct.metadata, ct.created_at, ct.updated_at,
             COUNT(cm.id)::int AS message_count
      FROM chat_threads ct
      LEFT JOIN chat_messages cm ON cm.thread_id = ct.id
      WHERE ct.user_id = $1
    `;
    const params: any[] = [userId];

    if (projectId) {
      params.push(projectId);
      query += ` AND ct.metadata->>'projectId' = $${params.length}`;
    }

    query += ` GROUP BY ct.id ORDER BY ct.updated_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const threads = result.rows.map(r => ({
      id: r.id,
      title: r.title || 'Untitled conversation',
      projectId: r.metadata?.projectId || null,
      submissionType: r.metadata?.submissionType || null,
      messageCount: r.message_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      metadata: r.metadata,
    }));

    return res.json({ success: true, threads, total: threads.length });
  } catch (err: any) {
    logger.error('GET /threads error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to load cortex threads',
      code: 'CORTEX_THREADS_FETCH_FAILED',
    });
  }
});

/** GET /api/cortex/threads/:threadId — get a single thread with messages */
router.get('/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const userId = requireAuthenticatedUserId(req, res, 'CORTEX_THREAD_AUTH_REQUIRED');
    if (!userId) return;
    const threadResult = await pool.query(
      'SELECT id, title, model, created_at, updated_at, user_id, metadata FROM chat_threads WHERE id = $1',
      [threadId]
    );
    if (!threadResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }
    const thread = threadResult.rows[0];
    const threadOwnerId = Number(thread.user_id);
    if (!Number.isFinite(threadOwnerId) || threadOwnerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Thread access denied',
        code: 'CORTEX_THREAD_ACCESS_DENIED',
      });
    }
    const msgResult = await pool.query(
      'SELECT id, role, content, model, tokens_used, created_at FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
      [threadId]
    );
    res.json({
      success: true,
      id: thread.id,
      title: thread.title || 'Untitled conversation',
      projectId: thread.metadata?.projectId || null,
      submissionType: thread.metadata?.submissionType || null,
      messages: msgResult.rows.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        metadata: { model: m.model, tokenUsage: m.tokens_used },
      })),
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      metadata: thread.metadata,
    });
  } catch (err: any) {
    logger.error('GET /threads/:threadId error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thread',
      code: 'CORTEX_THREAD_FETCH_FAILED',
    });
  }
});

/** POST /api/cortex/threads — create a new thread */
router.post('/threads', async (req: Request, res: Response) => {
  try {
    const userId = requireAuthenticatedUserId(req, res, 'CORTEX_THREAD_CREATE_AUTH_REQUIRED');
    if (!userId) return;
    const { title, projectId, submissionType, systemPrompt } = req.body || {};
    const newId = `cortex_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const metadata = { projectId: projectId || null, submissionType: submissionType || null };

    await pool.query(
      'INSERT INTO chat_threads (id, user_id, title, system_prompt, metadata, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())',
      [newId, userId, title || 'New conversation', systemPrompt || null, JSON.stringify(metadata)]
    );

    res.status(201).json({
      success: true,
      id: newId,
      title: title || 'New conversation',
      projectId: projectId || null,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (err: any) {
    logger.error('POST /threads error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create thread',
      code: 'CORTEX_THREAD_CREATE_FAILED',
    });
  }
});

/** PATCH /api/cortex/threads/:threadId — update thread title */
router.patch('/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const userId = requireAuthenticatedUserId(req, res, 'CORTEX_THREAD_UPDATE_AUTH_REQUIRED');
    if (!userId) return;
    const { title } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    const trimmed = title.trim().slice(0, 200);
    const result = await pool.query(
      'UPDATE chat_threads SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id',
      [trimmed, threadId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Thread not found or access denied' });
    }
    res.json({ success: true, title: trimmed });
  } catch (err: any) {
    logger.error('PATCH /threads/:threadId error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update thread title',
      code: 'CORTEX_THREAD_UPDATE_FAILED',
    });
  }
});

/** DELETE /api/cortex/threads/:threadId — delete a thread */
router.delete('/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const userId = requireAuthenticatedUserId(req, res, 'CORTEX_THREAD_DELETE_AUTH_REQUIRED');
    if (!userId) return;

    // Verify the requester owns this thread before deleting
    const ownerCheck = await pool.query(
      'SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2',
      [threadId, userId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Thread not found or access denied' });
    }

    await pool.query('DELETE FROM chat_messages WHERE thread_id = $1', [threadId]);
    await pool.query('DELETE FROM chat_threads WHERE id = $1', [threadId]);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('DELETE /threads/:threadId error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete thread',
      code: 'CORTEX_THREAD_DELETE_FAILED',
    });
  }
});

// Initialize sub-routers
mountSubRouters().catch(error => {
  logger.error('Failed to initialize Cortex unified router:', error);
});

// Cleanup interval for rate limiter
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  Array.from(rateLimitMap.entries()).forEach(([key, value]) => {
    if (value.resetTime < windowStart) {
      rateLimitMap.delete(key);
    }
  });
}, 5 * 60 * 1000);

router.use(errorHandler);

export default router;
