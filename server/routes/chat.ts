/**
 * Chat API Routes - AnA AI Chat Interface
 *
 * 9-step provenance-tracked RAG pipeline for regulatory guidance.
 * Connects to OpenAI GPT-4 via AI Gateway with org-scoped retrieval.
 * No demo fallback — returns 503 if no provider is available.
 *
 * @module server/routes/chat
 */

import { Router, Request, Response } from 'express';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayResponse, GatewayMessage } from '../services/ai-gateway/types.js';
import { pool } from '../db.js';
import {
  getOrCreateThread,
  getThreadMessages,
  saveChatMessage as saveMessage,
} from '../services/chat-thread-helpers.js';
import { getEmbeddingService } from '../services/enhancedEmbeddingService.js';
import { getIntelligencePrefix } from '../services/lumen-context-builder.js';
import { processResponseActions } from '../services/ana-guidance-executor.js';
import { logKernelDecision } from '../services/kernel-decision-record.js';
import { planKernelExecution } from '../services/kernel-router.js';
import {
  getKernelPolicyHint,
  recordKernelPolicyOutcome,
} from '../services/kernel-adaptive-policy.js';
import { createHash } from 'crypto';
import { interceptChatResponse } from '../services/intelligence/rim-interceptors.js';
import { ALL_CLAUDE_TOOLS } from '../services/claude/ClaudeToolDefinitions.js';
import { executeAgenticLoop } from '../services/claude/ClaudeToolExecutor.js';
import type { ClaudeEnhancedResponse } from '../services/ai-gateway/types.js';
import { buildMemoryContextForChat } from '../services/memory-context-assembler.js';

const router = Router();

// AI Gateway instance (lazy-initialized on first request)
let gateway: ReturnType<typeof getGateway> | null = null;
function ensureGateway() {
  if (!gateway) {
    try {
      gateway = getGateway();
    } catch (e: any) {
      console.error('[AnA] AI Gateway initialization failed:', e?.message);
    }
  }
  return gateway;
}

// System prompt for regulatory AI assistant — powered by AnA RI orchestrator
import { buildAnaRISystemPrompt } from '../services/ana-ri/persona.js';
import { orchestrate } from '../services/ana-ri/orchestrator.js';

// Build the default regulatory system prompt using AnA RI persona
const REGULATORY_SYSTEM_PROMPT = buildAnaRISystemPrompt({
  userRole: 'general',
  intentLens: 'auto',
});

// ── Provenance helpers ─────────────────────────────────────────────────────

/** SHA-256 hex digest of a UTF-8 string */
function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Deterministic JSON.stringify — sorted keys, undefined omitted */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .filter(k => obj[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}

// ── Verifier v1 (deterministic, no model needed) ───────────────────────────

interface VerifierFlag {
  rule: string;
  severity: 'warn' | 'downgrade';
  message: string;
}

// ── Configuration (externalized for tuning without code changes) ─────────
const VERIFIER_LOW_SCORE_THRESHOLD = parseFloat(process.env.ANA_VERIFIER_LOW_SCORE ?? '0.55');
const VERIFIER_LONG_CLAIM_CHARS = parseInt(process.env.ANA_VERIFIER_LONG_CLAIM_CHARS ?? '300', 10);
const RETRIEVAL_TOP_K = parseInt(process.env.ANA_RETRIEVAL_TOP_K ?? '5', 10);
const RETRIEVAL_THRESHOLD = parseFloat(process.env.ANA_RETRIEVAL_THRESHOLD ?? '0.7');
const GENERATION_TEMPERATURE = parseFloat(process.env.ANA_GENERATION_TEMPERATURE ?? '0.7');
const GENERATION_MAX_TOKENS = parseInt(process.env.ANA_GENERATION_MAX_TOKENS ?? '4096', 10);

/**
 * Run deterministic verifier rules on a claim + its citations.
 * Returns flags (possibly empty) and whether the claim should be downgraded to WEAK.
 */
function verifyClaim(
  claimText: string,
  citationScores: number[],
  snippets: string[]
): { flags: VerifierFlag[]; shouldDowngrade: boolean } {
  const flags: VerifierFlag[] = [];

  if (citationScores.length === 0) {
    // No citations — nothing to verify (already UNSUPPORTED)
    return { flags, shouldDowngrade: false };
  }

  const bestScore = Math.max(...citationScores);

  // Rule 1: Best citation score below threshold
  if (bestScore < VERIFIER_LOW_SCORE_THRESHOLD) {
    flags.push({
      rule: 'LOW_RELEVANCE',
      severity: 'downgrade',
      message: `Best citation relevance (${Math.round(bestScore * 100)}%) is below threshold (${Math.round(VERIFIER_LOW_SCORE_THRESHOLD * 100)}%)`,
    });
  }

  // Rule 2: Claim contains numbers but no citation snippet does
  // Normalize: strip commas from numbers, ignore years (1900-2100), trivial refs (≤9),
  // and common regulatory reference numbers (e.g. section numbers like 3.2.S.4.3)
  const stripCommas = (s: string) => s.replace(/(\d),(\d)/g, '$1$2');
  const normalizedClaim = stripCommas(claimText);
  const normalizedSnippets = stripCommas(snippets.join(' '));

  const claimNumbers = normalizedClaim.match(/\d+\.?\d*/g) || [];
  const significantNumbers = claimNumbers.filter(n => {
    const val = parseFloat(n);
    // Filter out: trivial refs (≤9) unless decimal (e.g., 3.14, 0.05)
    if (val <= 9 && !n.includes('.')) return false;
    // Filter out: years (1900-2100)
    if (val >= 1900 && val <= 2100 && !n.includes('.')) return false;
    // Filter out: common CFR/ICH numbers (21, 11, 820, etc.)
    if ([21, 11, 820, 312, 314, 510].includes(val) && !n.includes('.')) return false;
    return true;
  });

  if (significantNumbers.length > 0) {
    // Use word-boundary matching to avoid false positives from substring matches
    const unmatchedNumbers = significantNumbers.filter(n => {
      const escapedN = n.replace(/\./g, '\\.');
      const boundary = new RegExp(`(?:^|\\b)${escapedN}(?:\\b|$)`);
      return !boundary.test(normalizedSnippets);
    });
    if (unmatchedNumbers.length > 0) {
      flags.push({
        rule: 'UNGROUNDED_NUMBERS',
        severity: 'downgrade',
        message: `Claim contains numbers (${unmatchedNumbers.slice(0, 3).join(', ')}) not found in any citation`,
      });
    }
  }

  // Rule 3: Claim is long but only one citation
  if (claimText.length > VERIFIER_LONG_CLAIM_CHARS && citationScores.length === 1) {
    flags.push({
      rule: 'THIN_SUPPORT',
      severity: 'downgrade',
      message: `Claim is ${claimText.length} chars but supported by only 1 citation`,
    });
  }

  const shouldDowngrade = flags.some(f => f.severity === 'downgrade');
  return { flags, shouldDowngrade };
}

// No demo response function — returns 503 when AI providers are unavailable.

/**
 * POST /api/chat/send-message  (and POST /api/chat via root alias)
 * Main chat endpoint — 9-step provenance-tracked RAG pipeline.
 *
 * Steps: RESOLVE_ORG → THREAD → USER_MSG → RETRIEVE → PROMPT → GENERATE → PERSIST → CLAIMS → CITATIONS
 */
/** Normalize useChat payload: map context.projectId → project_id */
function normalizeBody(req: Request) {
  if (req.body.context?.projectId && !req.body.project_id) {
    req.body.project_id = req.body.context.projectId;
  }
}

const sendMessageHandler = async (req: Request, res: Response) => {
  normalizeBody(req);
  try {
    const { message, thread_id, file_id, system_prompt, project_id, preferred_provider } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required',
        code: 'INVALID_MESSAGE',
      });
    }

    // ── STEP 1: RESOLVE ORG (from session only — no header fallback for org) ──
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const rawUserId = (req as any).userId || (req as any).user?.id;
    const userId: number | string = rawUserId ?? 'anonymous';
    const numericOrgId = orgId ? (typeof orgId === 'string' ? Number(orgId) : orgId) : null;
    const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;

    // ── STEP 2: CREATE / VALIDATE THREAD ─────────────────────────────────────────
    const threadId = await getOrCreateThread(thread_id, (req as any).user?.id);

    // Fix B: Enforce thread ownership — if thread_id was supplied, verify org match
    if (thread_id && numericOrgId) {
      try {
        const ownerCheck = await pool.query(
          `SELECT organization_id FROM ai_threads WHERE id = $1`,
          [threadId]
        );
        if (ownerCheck.rows.length > 0) {
          const threadOrg = Number(ownerCheck.rows[0].organization_id);
          if (threadOrg !== numericOrgId) {
            return res.status(403).json({
              error: 'Thread does not belong to this organization',
              code: 'THREAD_ORG_MISMATCH',
            });
          }
        }
      } catch (e: any) {
        // ai_threads table might not exist yet — skip check
        if (e?.code !== '42P01') console.warn('[AnA] Thread ownership check failed:', e.message);
      }
    }

    // Upsert provenance thread (org-scoped)
    if (numericOrgId) {
      try {
        await pool.query(
          `INSERT INTO ai_threads (id, organization_id, project_id, created_by)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [threadId, numericOrgId, project_id || null, userId]
        );
      } catch (e: any) {
        if (e?.code !== '42P01') throw e;
        console.warn('[AnA] ai_threads table missing — provenance disabled');
      }
    }

    const previousMessages = await getThreadMessages(threadId);

    // ── STEP 3: PERSIST USER MESSAGE (provenance chain) ─────────────────
    if (numericOrgId) {
      try {
        await pool.query(
          `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'user', $2)`,
          [threadId, message]
        );
        // Update thread activity timestamp for sort ordering
        await pool
          .query(`UPDATE ai_threads SET updated_at = NOW() WHERE id = $1`, [threadId])
          .catch(() => {}); // Non-blocking
      } catch (e: any) {
        if (e?.code !== '42P01') console.warn('[AnA] ai_messages insert failed:', e.message);
      }
    }

    // ── STEP 3a: AUTO-GENERATE THREAD TITLE FROM FIRST MESSAGE ──────────
    if (previousMessages.length === 0 && message) {
      try {
        // Generate a concise title from the first message (no AI call needed)
        const rawTitle = message.replace(/^\/\w+\s*/, '').trim(); // Strip slash commands
        const title =
          rawTitle.length > 60
            ? rawTitle.slice(0, 57).replace(/\s+\S*$/, '') + '...'
            : rawTitle || 'New conversation';
        await pool.query(`UPDATE ai_threads SET title = $1, updated_at = NOW() WHERE id = $2`, [
          title,
          threadId,
        ]);
      } catch (e: any) {
        // Non-blocking — title generation failure doesn't break chat
        if (e?.code !== '42P01') console.warn('[AnA] Thread title update failed:', e.message);
      }
    }

    // ── STEP 4: RETRIEVE (org-scoped pgvector hybrid search) ────────────
    let sources: Array<{ id: string; title: string; content: string; score: number }> = [];
    let confidence: number | null = null;
    let retrievalRunId: string | null = null;
    let snapshotHashSha256: string | null = null;
    const chunkRows: Array<{ id: string; rank: number; atomId: string; score: number }> = [];
    const orgUuid =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);

    try {
      const embeddingService = getEmbeddingService(pool);
      // Bail early if org UUID is provided but clearly invalid
      if (orgUuid && !/^[0-9a-f-]{36}$/i.test(orgUuid)) {
        console.warn('[AnA] Invalid org UUID, skipping retrieval');
      } else {
        const searchResults = await embeddingService.searchHybrid(
          message,
          RETRIEVAL_TOP_K,
          RETRIEVAL_THRESHOLD,
          orgUuid
        );
        sources = searchResults.map(r => ({
          id: r.id,
          title: r.title,
          content: r.content.length > 500 ? r.content.substring(0, 500) + '…' : r.content,
          score: r.score,
        }));
        if (sources.length > 0) {
          confidence = Math.min(1, sources.reduce((sum, s) => sum + s.score, 0) / sources.length);
        }

        // Persist retrieval run + chunks (provenance chain)
        if (numericOrgId) {
          try {
            const queryHash = sha256(message);
            // Fix C: Snapshot hash includes sourceType + sourceRefId, sorted by rank
            const snapshotData = sources.map((s, i) => ({
              rank: i + 1,
              sourceType: 'atom' as const,
              sourceRefId: s.id,
              score: s.score,
            }));
            snapshotHashSha256 = sha256(stableStringify(snapshotData));

            const rrResult = await pool.query(
              `INSERT INTO ai_retrieval_runs
                 (organization_id, project_id, user_id, scope, embedding_model,
                  query_text, query_hash_sha256, snapshot_hash_sha256, top_k, threshold, result_count)
               VALUES ($1, $2, $3, $4, 'text-embedding-3-small', $5, $6, $7, $8, $9, $10)
               RETURNING id`,
              [
                numericOrgId,
                project_id || null,
                numericUserId,
                orgUuid ? 'org' : 'global',
                message,
                queryHash,
                snapshotHashSha256,
                RETRIEVAL_TOP_K,
                RETRIEVAL_THRESHOLD,
                sources.length,
              ]
            );
            retrievalRunId = rrResult.rows[0].id;

            for (let i = 0; i < sources.length; i++) {
              const s = sources[i];
              const excerptHash = sha256(s.content);
              const crResult = await pool.query(
                `INSERT INTO ai_retrieval_chunks
                   (retrieval_run_id, rank, source_type, atom_id, title,
                    excerpt_hash_sha256, excerpt_preview, score)
                 VALUES ($1, $2, 'atom', $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                  retrievalRunId,
                  i + 1,
                  s.id,
                  s.title,
                  excerptHash,
                  s.content.substring(0, 500),
                  s.score,
                ]
              );
              chunkRows.push({
                id: crResult.rows[0].id,
                rank: i + 1,
                atomId: s.id,
                score: s.score,
              });
            }
          } catch (e: any) {
            if (e?.code !== '42P01') console.warn('[AnA] Retrieval persist failed:', e.message);
          }
        }
      }
    } catch (srcErr: any) {
      // Non-fatal — chat still works, just without grounded evidence
      console.warn('[AnA] Source retrieval failed:', srcErr.message);
    }

    // ── STEP 5: BUILD EVIDENCE-GROUNDED PROMPT ─────────────────────────
    // If we have retrieved evidence, inject it into the system prompt so
    // the model can ground its answer and cite by [SRC-n] reference.
    let evidenceBlock = '';
    let memoryAtomCount = 0;
    let memoryBlockChars = 0;
    let memoryDiagnostics: Record<string, unknown> | null = null;
    if (sources.length > 0) {
      evidenceBlock =
        '\n\n--- RETRIEVED EVIDENCE (cite as [SRC-n]) ---\n' +
        sources.map((s, i) => `[SRC-${i + 1}] "${s.title}"\n${s.content}`).join('\n\n') +
        '\n--- END EVIDENCE ---\n\n' +
        'When your answer relies on information from the evidence above, cite it inline using [SRC-n]. ' +
        'If the evidence does not contain relevant information, answer from your training knowledge and state that no knowledge-base sources were found.';
    }

    let assistantMessage: string;
    let model: string;
    let provider = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let latencyMs: number | null = null;

    // ── STEP 6: GENERATE (no silent demo fallback) ─────────────────────
    const gw = ensureGateway();
    if (!gw || gw.getEnabledProviders().length === 0) {
      return res.status(503).json({
        error: 'No AI providers available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    try {
      // Inject client/project intelligence so AnA reads SKILL/.MD context
      const intelligencePrefix = await getIntelligencePrefix(
        numericOrgId ?? undefined,
        project_id
      ).catch(() => '');

      // Build conversation history for orchestrator continuity analysis
      const conversationHistory = previousMessages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Pre-fetch decision context for AnA explanation grounding (non-blocking)
      let decisionContext: any[] = [];
      if (project_id) {
        try {
          const { decisionLifecycleService } =
            await import('../services/decision-lifecycle-service.js');
          decisionContext = decisionLifecycleService.getDecisionContext(String(project_id), {
            limit: 5,
          });
        } catch {
          /* non-blocking */
        }
      }

      // Run the orchestrator for intent detection, deficiency context, and continuity
      const orchestratorResult = orchestrate({
        message,
        conversationHistory,
        authoringContext: project_id
          ? {
              projectId: String(project_id),
              _decisionContext: decisionContext,
            }
          : undefined,
      });

      console.log(
        `[AnA] Orchestrator: intent=${orchestratorResult.detectedIntent.lens}, ` +
          `submission=${orchestratorResult.detectedSubmissionType || 'none'}, ` +
          `deficiency=${orchestratorResult.orchestrationMeta.deficiencyContextInjected}`
      );

      // Use the orchestrator's enriched system prompt instead of the basic one
      const basePrompt = system_prompt || orchestratorResult.systemPrompt;

      const { memoryBlock, atoms, diagnostics } = await buildMemoryContextForChat({
        threadId,
        organizationId: numericOrgId || undefined,
        projectId: project_id || undefined,
        query: message,
        limitPerLayer: 4,
        maxChars: 3500,
      });
      memoryAtomCount = atoms.length;
      memoryBlockChars = memoryBlock.length;
      memoryDiagnostics = diagnostics;

      // ── IND Context Injection ──────────────────────────────────────────────────
      // When the project is an IND submission, inject the complete CTD structure
      // so AnA knows every section needed and can guide the user through it.
      let indContextBlock = '';
      const detectedType = (orchestratorResult.detectedSubmissionType || '').toUpperCase();
      const contextType = (req.body.context?.productType || '').toUpperCase();
      if (detectedType === 'IND' || contextType === 'IND' || contextType === 'NDA' || contextType === 'BLA') {
        try {
          const { IND_SECTIONS, getModuleStatus } = await import('../services/ind/ind-section-registry.js');
          const sectionList = IND_SECTIONS.map(s =>
            `- ${s.code} ${s.title} (Module ${s.module}, ${s.required ? 'required' : 'optional'}) — ${s.guidance}`
          ).join('\n');
          // Include project context for generation prompts
          const projectContext = req.body.context || {};
          const projectCtx = [
            projectContext.activeProject ? `Project: ${projectContext.activeProject}` : '',
            projectContext.productType ? `Submission type: ${projectContext.productType}` : '',
            projectContext.projectId ? `Project ID: ${projectContext.projectId}` : '',
          ].filter(Boolean).join('\n');

          indContextBlock = `\n\n## IND Submission Context\nThis is an IND (Investigational New Drug) project. You have AnA tools to generate any CTD section.\n${projectCtx}\n\nComplete IND structure (19 sections across 5 modules):\n${sectionList}\n\nWhen the user asks to draft or generate a section:\n1. Use ind_generate_section tool with the section code and project context\n2. The tool will generate regulatory-quality content and save it as a governed artifact\n3. Show the user a summary of what was generated\n\nUse ind_get_status to check which sections are done and which need work.\nGuide the user through the submission systematically — Module 1 first, then 2-5.\n`;
        } catch {
          // IND registry not available — skip
        }
      }

      // ── Device Context Injection ────────────────────────────────────────────────
      let deviceContextBlock = '';
      const deviceTypes = ['510K', 'PMA', 'DE_NOVO', 'CER', 'IVDR'];
      if (deviceTypes.includes(detectedType) || deviceTypes.includes(contextType)) {
        try {
          const { getDeviceSections } = await import('../services/device/device-section-registry.js');
          const deviceType = (deviceTypes.includes(contextType) ? contextType : detectedType) as '510K' | 'PMA' | 'DE_NOVO' | 'CER';
          const sections = getDeviceSections(deviceType);
          if (sections.length > 0) {
            const sectionList = sections.map(s =>
              `- ${s.code} ${s.title} (${s.required ? 'required' : 'optional'}) — ${s.guidance}`
            ).join('\n');
            const projectContext = req.body.context || {};
            deviceContextBlock = `\n\n## ${deviceType} Submission Context\nThis is a ${deviceType} medical device submission project.\n${projectContext.activeProject ? `Project: ${projectContext.activeProject}` : ''}\n\nRequired sections (${sections.filter(s => s.required).length} required, ${sections.length} total):\n${sectionList}\n\nUse the generate_document tool to draft any section. Guide the user through the submission systematically.\n`;
          }
        } catch {
          // Device registry not available
        }
      }

      const systemPrompt = intelligencePrefix + basePrompt + indContextBlock + deviceContextBlock + memoryBlock + evidenceBlock;

      const gwMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...previousMessages
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        { role: 'user' as const, content: message },
      ];

      console.log(`[AnA] Sending through AI Gateway (${sources.length} sources retrieved)...`);
      const routingPlan = planKernelExecution({
        route: '/api/chat',
        messageLength: message.length,
        intentLens: orchestratorResult.detectedIntent.lens,
        intentConfidence: orchestratorResult.detectedIntent.confidence,
        submissionType: orchestratorResult.detectedSubmissionType,
        hasEvidence: sources.length > 0,
        requestedMaxTokens: GENERATION_MAX_TOKENS,
      });
      const policyHint = await getKernelPolicyHint({
        organizationId: numericOrgId ?? null,
        route: '/api/chat',
        taskType: routingPlan.taskType,
      });
      const selectedStrategy = policyHint?.preferredStrategy || routingPlan.strategy;

      // Validate preferred_provider if provided
      const VALID_PROVIDERS = ['anthropic', 'openai', 'moonshot'] as const;
      const validatedChatProvider =
        preferred_provider && VALID_PROVIDERS.includes(preferred_provider)
          ? (preferred_provider as (typeof VALID_PROVIDERS)[number])
          : undefined;

      // ── Agentic tool-use loop: AnA can search, check compliance, generate docs ──
      const baseRequest = {
        taskType: routingPlan.taskType,
        messages: gwMessages,
        temperature: routingPlan.temperature,
        maxTokens: routingPlan.maxTokens,
        callerModule: 'ana-ri-chat' as const,
        organizationId: numericOrgId ?? undefined,
        userId: numericUserId,
        strategy: selectedStrategy,
        tools: ALL_CLAUDE_TOOLS,
        toolChoice: 'auto' as const,
        ...(validatedChatProvider ? { provider: validatedChatProvider } : {}),
      };

      // Use agentic loop for multi-turn tool execution (max 5 rounds)
      const gwResponse: ClaudeEnhancedResponse = await executeAgenticLoop(baseRequest, {
        maxRounds: 5,
        onToolExecution: (toolName, input, result) => {
          // Log tool usage for audit trail
          console.log(`[AnA Tool] ${toolName} called`);
        },
      });

      assistantMessage =
        gwResponse.content ||
        'I apologize, but I was unable to generate a response. Please try again.';
      model = `${gwResponse.provider}/${gwResponse.model}`;
      provider = gwResponse.provider;
      usage = {
        prompt_tokens: gwResponse.usage.inputTokens,
        completion_tokens: gwResponse.usage.outputTokens,
        total_tokens: gwResponse.usage.totalTokens,
      };
      latencyMs = gwResponse.latencyMs;

      console.log(
        `[AnA] AI Gateway response via ${model} (${latencyMs}ms, req=${gwResponse.requestId})`
      );
      void logKernelDecision({
        requestId: gwResponse.requestId,
        threadId,
        route: '/api/chat',
        organizationId: numericOrgId ?? null,
        userId: numericUserId,
        projectId: typeof project_id === 'string' ? parseInt(project_id, 10) : project_id || null,
        plannerVersion: routingPlan.plannerVersion,
        orchestratorName: routingPlan.orchestratorName,
        intentLens: orchestratorResult.detectedIntent.lens,
        intentConfidence: orchestratorResult.detectedIntent.confidence,
        submissionType: orchestratorResult.detectedSubmissionType || null,
        selectedTaskType: routingPlan.taskType,
        selectedProvider: gwResponse.provider,
        selectedModel: gwResponse.model,
        routingStrategy: selectedStrategy,
        selectedTools: [],
        constraints: {
          ...routingPlan.constraints,
          maxTokens: routingPlan.maxTokens,
          temperature: routingPlan.temperature,
          retrievedSources: sources.length,
        },
        decisionRationale: routingPlan.decisionRationale,
        estimatedCostUsd: gwResponse.usage?.estimatedCostUsd ?? null,
        latencyMs: gwResponse.latencyMs,
        outcome: 'success',
      });
    } catch (gwError: any) {
      console.error('[AnA] AI Gateway call failed:', gwError.message);
      void logKernelDecision({
        requestId: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        threadId,
        route: '/api/chat',
        organizationId: numericOrgId ?? null,
        userId: numericUserId,
        projectId: typeof project_id === 'string' ? parseInt(project_id, 10) : project_id || null,
        orchestratorName: 'kernel-router-v1',
        selectedTaskType: 'chat',
        routingStrategy: 'quality_optimized',
        selectedTools: [],
        decisionRationale: 'AnA chat failed during AI Gateway call.',
        outcome: 'failed',
        errorMessage: gwError?.message || 'AI Gateway call failed',
      });
      return res.status(503).json({
        error: 'AI provider call failed',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    // ── STEP 6b: GUIDANCE-TO-ACTION EXECUTION ──────────────────────────
    // Process AnA's response for action signals and execute governed actions.
    // Only runs when project context is available (org + project scoped).
    let executedActions: Array<{
      actionType: string;
      executed: boolean;
      confidence: string;
      artifactId: string | null;
      threadId: string | null;
      error: string | null;
    }> = [];

    if (numericOrgId && project_id) {
      try {
        const actionResult = await processResponseActions(assistantMessage, {
          projectId: typeof project_id === 'string' ? parseInt(project_id, 10) : project_id,
          organizationId: numericOrgId,
          userId: numericUserId,
          userName: (req as any).user?.name || (req as any).user?.email || 'System',
          threadId,
        });

        // Replace message with cleaned text (action blocks stripped)
        if (actionResult.actions.length > 0) {
          assistantMessage = actionResult.cleanedText;
          executedActions = actionResult.actions.map(a => ({
            actionType: a.actionType,
            executed: a.executed,
            confidence: a.confidence,
            artifactId: a.artifactId,
            threadId: a.threadId,
            error: a.error,
          }));
        }
      } catch (actionErr: any) {
        // Non-fatal — chat still works, actions just don't execute
        console.warn('[AnA RI] Guidance action processing failed:', actionErr?.message);
      }
    }

    // Save to legacy chat_messages for backward compat
    await saveMessage(threadId, 'user', message, model);
    await saveMessage(threadId, 'assistant', assistantMessage, model, usage.total_tokens);

    // ── STEP 7: PERSIST GENERATION RUN (provenance chain) ──────────────
    let generationRunId: string | null = null;
    if (numericOrgId) {
      try {
        const answerHash = sha256(assistantMessage);
        const genResult = await pool.query(
          `INSERT INTO ai_generation_runs
             (retrieval_run_id, thread_id, model, provider, answer_hash_sha256,
              prompt_tokens, completion_tokens, total_tokens, latency_ms, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
           RETURNING id`,
          [
            retrievalRunId,
            threadId,
            model,
            provider,
            answerHash,
            usage.prompt_tokens,
            usage.completion_tokens,
            usage.total_tokens,
            latencyMs,
          ]
        );
        generationRunId = genResult.rows[0].id;

        // Persist assistant ai_message with generation linkage
        await pool.query(
          `INSERT INTO ai_messages (thread_id, role, content, generation_run_id)
           VALUES ($1, 'assistant', $2, $3)`,
          [threadId, assistantMessage, generationRunId]
        );
      } catch (e: any) {
        if (e?.code !== '42P01') console.warn('[AnA] Generation persist failed:', e.message);
      }
    }

    // ── STEP 8: CLAIM SPLIT (paragraph-level) ─────────────────────────
    const claimTexts = assistantMessage
      .split(/\n\n+/)
      .map(c => c.trim())
      .filter(c => c.length > 0);

    interface ClaimResponse {
      claimId: string | null;
      claimIndex: number;
      claimText: string;
      status: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';
      citations: Array<{ chunkId: string; sourceId: string; title: string; score: number }>;
      verifierFlags: VerifierFlag[];
    }
    const claims: ClaimResponse[] = [];

    // ── STEP 9: CITATION LINKAGE + VERIFIER (per-claim) ───────────────
    for (let ci = 0; ci < claimTexts.length; ci++) {
      const claimText = claimTexts[ci];
      const claimHash = sha256(claimText);

      // Find [SRC-n] refs in this specific claim
      const claimRefPattern = /\[SRC-(\d+)\]/g;
      const claimRefs = new Set<number>();
      let refMatch;
      while ((refMatch = claimRefPattern.exec(claimText)) !== null) {
        const idx = parseInt(refMatch[1], 10) - 1;
        if (idx >= 0 && idx < sources.length) claimRefs.add(idx);
      }

      // Initial status: SUPPORTED (≥1 citation), UNSUPPORTED (no citations)
      let status: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED' =
        claimRefs.size > 0 ? 'SUPPORTED' : 'UNSUPPORTED';

      let claimId: string | null = null;
      const citationLinks: ClaimResponse['citations'] = [];

      if (numericOrgId && generationRunId) {
        try {
          // Collect citation links first (needed for verifier)
          for (const refIdx of claimRefs) {
            const chunk = chunkRows[refIdx];
            if (chunk) {
              citationLinks.push({
                chunkId: chunk.id,
                sourceId: chunk.atomId,
                title: sources[refIdx]?.title || '',
                score: chunk.score,
              });
            }
          }

          // ── STEP 9b: VERIFIER v1 (deterministic) ────────────────────
          const citScores = citationLinks.map(c => c.score);
          const citSnippets = Array.from(claimRefs).map(idx => sources[idx]?.content || '');
          const { flags: verifierFlags, shouldDowngrade } = verifyClaim(
            claimText,
            citScores,
            citSnippets
          );

          // Downgrade SUPPORTED → WEAK if verifier flags it
          if (status === 'SUPPORTED' && shouldDowngrade) {
            status = 'WEAK';
          }

          // Persist claim with final status + verifier flags
          const claimResult = await pool.query(
            `INSERT INTO ai_claims
               (generation_run_id, claim_index, claim_text, claim_hash_sha256, confidence, status, verifier_flags)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [
              generationRunId,
              ci,
              claimText,
              claimHash,
              claimRefs.size > 0 ? confidence : null,
              status,
              JSON.stringify(verifierFlags),
            ]
          );
          claimId = claimResult.rows[0].id;

          // Persist citation linkages
          for (const link of citationLinks) {
            await pool.query(
              `INSERT INTO ai_claim_citations (claim_id, retrieval_chunk_id, relevance_score)
               VALUES ($1, $2, $3)`,
              [claimId, link.chunkId, link.score]
            );
          }

          claims.push({
            claimId,
            claimIndex: ci,
            claimText,
            status,
            citations: citationLinks,
            verifierFlags,
          });
          continue; // skip fallback below
        } catch (e: any) {
          if (e?.code !== '42P01') console.warn('[AnA] Claim persist failed:', e.message);
        }
      }

      // Fallback: no org/generation — still run verifier for response
      const fallbackScores = citationLinks.map(c => c.score);
      const fallbackSnippets = Array.from(claimRefs).map(idx => sources[idx]?.content || '');
      const { flags: fallbackFlags, shouldDowngrade: fallbackDown } = verifyClaim(
        claimText,
        fallbackScores,
        fallbackSnippets
      );
      if (status === 'SUPPORTED' && fallbackDown) status = 'WEAK';

      claims.push({
        claimId,
        claimIndex: ci,
        claimText,
        status,
        citations: citationLinks,
        verifierFlags: fallbackFlags,
      });
    }

    // ── BUILD BACKWARD-COMPAT CITATIONS MAP ────────────────────────────
    const citedRefs = new Set<number>();
    const refPattern = /\[SRC-(\d+)\]/g;
    let match;
    while ((match = refPattern.exec(assistantMessage)) !== null) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < sources.length) citedRefs.add(idx);
    }

    const citations = sources.map((s, i) => ({
      id: `SRC-${i + 1}`,
      sourceAtomId: s.id,
      sourceType: 'atom' as const, // Rule 5: explicit source type
      title: s.title,
      snippet: s.content?.length > 500 ? s.content.substring(0, 500) + '…' : s.content,
      relevanceScore: s.score,
      cited: citedRefs.has(i),
    }));

    // Fix D: coverage metrics
    const supportedClaims = claims.filter(c => c.status === 'SUPPORTED').length;
    const citationCoverage = sources.length > 0 ? citedRefs.size / sources.length : 0;
    const supportedClaimRate = claims.length > 0 ? supportedClaims / claims.length : 0;
    void recordKernelPolicyOutcome({
      organizationId: numericOrgId ?? null,
      route: '/api/chat',
      taskType: 'chat',
      strategy: 'quality_optimized',
      threadId,
      modelProvider: provider || null,
      modelName: model || null,
      qualityScore: supportedClaimRate,
      latencyMs,
      estimatedCostUsd: null,
      success: true,
      metadata: {
        citationCoverage,
        sourcesRetrieved: sources.length,
        claims: claims.length,
      },
    });

    // ── RIM: Intercept for regulatory pattern capture (non-blocking) ──
    if (numericOrgId) {
      interceptChatResponse({
        organizationId: numericOrgId,
        projectId: parseInt(String(project_id || '0'), 10),
        userId: (req as any).user?.id,
        sectionCode: (req as any).body?.section_code,
        assistantMessage,
        claimCount: claims.length,
        supportedClaimRate,
        model,
        provider,
      });
    }

    // ── RESPONSE (backward compat + provenance chain) ──────────────────
    res.json({
      answer: assistantMessage,
      response: assistantMessage,
      thread_id: threadId,
      usage,
      model,
      provider,
      sources,
      citations,
      confidence,
      retrievalMeta: {
        retrievedCount: sources.length,
        citedCount: citedRefs.size,
        orgScoped: !!orgUuid,
        citationCoverage,
        supportedClaimRate,
        memoryAtomCount,
        memoryBlockChars,
        memoryDiagnostics,
      },
      // Provenance chain
      retrievalRunId,
      snapshotHashSha256,
      generationRunId,
      claims,
      orchestration: {
        detectedIntent: orchestratorResult.detectedIntent,
        detectedSubmissionType: orchestratorResult.detectedSubmissionType,
        appliedRole: orchestratorResult.appliedRole,
        activeWorkstream: orchestratorResult.activeWorkstream,
        workstreamHandoff: orchestratorResult.workstreamHandoff,
        suggestedActions: orchestratorResult.suggestedActions,
        meta: orchestratorResult.orchestrationMeta,
      },
      // AnA 1.0 RI — Executed guidance actions
      executedActions: executedActions.length > 0 ? executedActions : undefined,
    });
  } catch (error: any) {
    console.error('[AnA] Chat error:', error);

    // Rule 6: no raw error.message leak
    res.status(500).json({
      error: 'Failed to process message',
      code: 'CHAT_ERROR',
    });
  }
};

// Register on both /send-message and root / (useChat hook sends to POST /api/chat)
router.post('/send-message', sendMessageHandler);
router.post('/', sendMessageHandler);

/**
 * POST /api/chat/upload
 * Handle file uploads — stores metadata in file_uploads table.
 * When projectId + organizationId are available, also creates a
 * concept2cure_artifact (category='source') for unified Data Room access
 * and embeds content into lumen_data_atoms for pgvector retrieval.
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fileName = (req as any).file?.originalname || req.body?.fileName || 'uploaded_file';
    const mimeType =
      (req as any).file?.mimetype || req.body?.mimeType || 'application/octet-stream';
    const fileSize = (req as any).file?.size || req.body?.fileSize || 0;
    const projectId = req.body?.projectId || req.body?.project_id;
    const userId = (req as any).user?.id || null;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    // Store in uploads directory
    const storagePath = `uploads/${fileId}`;

    // Save metadata to DB
    await pool.query(
      `INSERT INTO file_uploads (id, user_id, original_name, mime_type, file_size, storage_path, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', NOW())`,
      [fileId, userId, fileName, mimeType, fileSize, storagePath]
    );

    // ── Data Room convergence: create artifact + embed for retrieval ──
    let artifactId: string | null = null;
    if (projectId && orgId) {
      try {
        const numericProjectId = parseInt(String(projectId).replace('proj_', ''), 10);
        const numericOrgId = parseInt(String(orgId), 10);
        if (!isNaN(numericProjectId) && !isNaN(numericOrgId)) {
          const artId = `artifact_chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          // Extract text content from file buffer if available
          const fileBuffer = (req as any).file?.buffer;
          const extractedText = fileBuffer && mimeType.startsWith('text/')
            ? fileBuffer.toString('utf8')
            : `[Uploaded via chat: ${fileName}] (${mimeType}, ${fileSize} bytes)`;

          const contentHash = sha256(extractedText);
          await pool.query(
            `INSERT INTO concept2cure_artifacts
               (organization_id, project_id, artifact_id, type, category, title, content, content_hash, version, metadata, created_by_id)
             VALUES ($1, $2, $3, 'source_document', 'source', $4, $5, $6, 1, $7, $8)
             ON CONFLICT DO NOTHING`,
            [
              numericOrgId,
              numericProjectId,
              artId,
              fileName,
              extractedText.substring(0, 100000),
              contentHash,
              JSON.stringify({ uploadSource: 'chat', fileId, mimeType, fileSize }),
              userId,
            ]
          );
          artifactId = artId;

          // Auto-embed into lumen_data_atoms for pgvector retrieval
          try {
            const atomResult = await pool.query(
              `INSERT INTO lumen_data_atoms
                 (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
               VALUES ($1, 'chat_upload', $2, 'source_document', $3, $4, '{source,chat_upload}', 0.85, 'active')
               ON CONFLICT DO NOTHING
               RETURNING id`,
              [numericOrgId, artId, fileName, extractedText.substring(0, 16000)]
            );
            if (atomResult.rows.length > 0) {
              const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
              const embeddingService = getEmbeddingService(pool);
              await embeddingService.embedAtom(atomResult.rows[0].id);
            }
          } catch (embedErr: any) {
            console.warn('[AnA] Chat upload embedding failed (non-fatal):', embedErr.message);
          }
        }
      } catch (artErr: any) {
        console.warn('[AnA] Chat upload artifact creation failed (non-fatal):', artErr.message);
      }
    }

    res.json({
      fileId,
      message: 'File uploaded successfully',
      status: 'ready',
      fileName,
      artifactId,
    });
  } catch (error: any) {
    console.error('[AnA] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      code: 'UPLOAD_ERROR',
    });
  }
});

/**
 * GET /api/chat/threads
 * List threads, optionally filtered by project_id.
 * Used by AnaPersistentPanel to restore previous conversations.
 */
router.get('/threads', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.project_id as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    let query: string;
    let params: unknown[];

    if (projectId) {
      // Try ai_threads first (has project_id), fall back to chat_threads
      try {
        const aiResult = await pool.query(
          `SELECT id, project_id, title, created_at, updated_at FROM ai_threads
           WHERE project_id = $1 ${orgId ? 'AND organization_id = $2' : ''}
           ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ${orgId ? '$3' : '$2'}`,
          orgId ? [projectId, orgId, limit] : [projectId, limit]
        );
        if (aiResult.rows.length > 0) {
          return res.json({ threads: aiResult.rows });
        }
      } catch {
        /* ai_threads may not exist — fall through */
      }

      // Fall back to chat_threads (no project_id column)
      query = `SELECT id, created_at, updated_at FROM chat_threads ORDER BY updated_at DESC LIMIT $1`;
      params = [limit];
    } else {
      query = `SELECT id, created_at, updated_at FROM chat_threads ORDER BY updated_at DESC LIMIT $1`;
      params = [limit];
    }

    const result = await pool.query(query, params);
    res.json({ threads: result.rows });
  } catch (error: any) {
    // Table may not exist yet — return empty
    console.warn('[AnA] Thread listing failed:', error?.message);
    res.json({ threads: [] });
  }
});

/**
 * GET /api/chat/threads/:threadId/messages
 * Retrieve messages for a specific thread.
 * Used by AnaPersistentPanel to restore conversation content.
 */
router.get('/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Verify thread belongs to org before returning messages
    const threadCheck = await pool.query(
      `SELECT id FROM ai_threads WHERE id = $1 AND organization_id = $2`,
      [threadId, orgId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ messages: [], error: 'Thread not found' });
    }

    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const messages = await getThreadMessages(threadId);
    res.json({ messages: messages.slice(-limit) });
  } catch (error: any) {
    console.warn('[AnA] Thread messages failed:', error?.message);
    res.json({ messages: [] });
  }
});

/**
 * GET /api/chat/thread/:threadId
 * Retrieve conversation history from database
 */
router.get('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        error: 'Organization context required',
        code: 'ORG_CONTEXT_REQUIRED',
      });
    }

    const threadResult = await pool.query(
      'SELECT id, created_at FROM chat_threads WHERE id = $1 AND organization_id = $2',
      [threadId, orgId]
    );

    if (threadResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        code: 'THREAD_NOT_FOUND',
      });
    }

    const messages = await getThreadMessages(threadId);

    res.json({
      thread_id: threadId,
      messages,
      created_at: threadResult.rows[0].created_at,
    });
  } catch (error: any) {
    console.error('[AnA] Thread retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve thread',
      code: 'THREAD_RETRIEVAL_ERROR',
    });
  }
});

/**
 * PATCH /api/chat/thread/:threadId
 * Move a conversation to a different project or update thread metadata (E6)
 */
router.patch('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { project_id, title } = req.body;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({ ok: false, error: 'Organization context required' });
    }

    // Verify thread exists and belongs to org
    const threadCheck = await pool.query(
      `SELECT id FROM ai_threads WHERE id = $1 AND organization_id = $2`,
      [threadId, orgId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Thread not found' });
    }

    // Build dynamic SET clause
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (project_id !== undefined) {
      updates.push(`project_id = $${paramIdx++}`);
      values.push(project_id || null);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramIdx++}`);
      values.push(title);
    }
    updates.push(`updated_at = NOW()`);

    values.push(threadId);

    await pool.query(
      `UPDATE ai_threads SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    res.json({ ok: true, threadId, project_id: project_id ?? undefined });
  } catch (error: any) {
    console.error('[AnA] Patch thread error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update thread' });
  }
});

/**
 * DELETE /api/chat/thread/:threadId
 * Delete a conversation thread from database
 */
router.delete('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        error: 'Organization context required',
        code: 'ORG_CONTEXT_REQUIRED',
      });
    }

    const result = await pool.query(
      'DELETE FROM chat_threads WHERE id = $1 AND organization_id = $2',
      [threadId, orgId]
    );
    const deleted = (result.rowCount || 0) > 0;

    res.json({
      success: deleted,
      message: deleted ? 'Thread deleted' : 'Thread not found',
    });
  } catch (error: any) {
    console.error('[AnA] Thread deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete thread',
      code: 'THREAD_DELETE_ERROR',
    });
  }
});

/**
 * POST /api/chat/stream
 * Stream chat responses via Server-Sent Events (SSE).
 * Same provenance pipeline as /send-message but with real-time token delivery.
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const { message, thread_id, system_prompt } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const gw = ensureGateway();
    if (!gw || gw.getEnabledProviders().length === 0) {
      return res.status(503).json({
        error: 'No AI providers available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Build messages — use orchestrator for enriched prompt with intent detection
    const orchestratorResult = orchestrate({ message });
    const systemContent = system_prompt || orchestratorResult.systemPrompt;
    const gwMessages: GatewayMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: message },
    ];

    // If thread_id provided, load previous messages
    if (thread_id) {
      try {
        const history = await getThreadMessages(thread_id);
        if (history.length > 0) {
          // Insert history before the current user message
          const historyMessages = history.slice(-10).map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
          gwMessages.splice(1, 0, ...historyMessages);
        }
      } catch (_e) {
        /* ignore — proceed without history */
      }
    }

    const gwResponse = await gw.route({
      taskType: 'chat',
      messages: gwMessages,
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      onStream: (chunk: string, metadata?: any) => {
        res.write(
          `data: ${JSON.stringify({
            type: metadata?.type || 'text',
            content: chunk,
          })}\n\n`
        );
      },
      callerModule: 'ana-ri-chat-stream',
    });

    // Send final event
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        model: gwResponse.model,
        provider: gwResponse.provider,
        usage: gwResponse.usage,
        latencyMs: gwResponse.latencyMs,
      })}\n\n`
    );

    res.end();
  } catch (error: any) {
    console.error('[Chat Stream] Error:', error.message);
    if (res.headersSent) {
      // SECURITY: Don't leak internal error details to client
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: 'An error occurred while generating the response' })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({ error: 'An error occurred while generating the response' });
    }
  }
});

/**
 * GET /api/chat/health
 * Health check for chat service
 */
router.get('/health', async (req: Request, res: Response) => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;

  let threadCount = 0;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM chat_threads');
    threadCount = result.rows[0]?.count || 0;
  } catch (e) {
    /* ignore */
  }

  res.json({
    status: hasApiKey ? 'healthy' : 'degraded',
    service: 'AnA Chat',
    ai_configured: hasApiKey,
    primary_provider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
    active_threads: threadCount,
    persistence: 'postgresql',
    timestamp: new Date().toISOString(),
  });
});

export default router;
