/**
 * Send-message handler — the 9-step provenance-tracked RAG pipeline.
 *
 * Steps: RESOLVE_ORG → THREAD → USER_MSG → RETRIEVE → PROMPT → GENERATE →
 * PERSIST → CLAIMS → CITATIONS.
 *
 * Extracted from the monolithic server/routes/chat.ts as part of Phase 4
 * architecture consolidation. Behavior is byte-for-byte preserved.
 *
 * @module server/routes/chat/send-message
 */

import type { Request, Response } from 'express';
import { pool } from '../../db.js';
import {
  getOrCreateThread,
  getThreadMessages,
  ThreadAccessError,
  saveChatMessage as saveMessage,
} from '../../services/chat-thread-helpers.js';
import { getEmbeddingService } from '../../services/enhancedEmbeddingService.js';
import { getIntelligencePrefix } from '../../services/lumen-context-builder.js';
import { processResponseActions } from '../../services/ana-guidance-executor.js';
import { logKernelDecision } from '../../services/kernel-decision-record.js';
import { planKernelExecution } from '../../services/kernel-router.js';
import {
  getKernelPolicyHint,
  recordKernelPolicyOutcome,
} from '../../services/kernel-adaptive-policy.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
import { getAllEnabledTools } from '../../services/ana/AnaToolDefinitions.js';
import { selectToolsForTurn } from '../../services/ana/tool-selection.js';
import { executeAgenticLoop } from '../../services/ana/AnaToolExecutor.js';
import { resolveMaxRounds } from '../../services/ana/agentic-loop.js';
import {
  isSubstantiveTurn,
  resolveModelTier,
  resolveTierModel,
} from '../../services/ai-gateway/reasoning.js';
import { logToolRun } from '../../services/toolRegistry.js';
import type { AnaGatewayResponse } from '../../services/ai-gateway/types.js';
import { buildMemoryContextForChat, type MemoryAssemblyDiagnostics } from '../../services/memory-context-assembler.js';
import { summarizeAndStoreWorkingMemoryForThread } from '../../services/working-memory.js';
import { getProjectInstructionsBlock } from '../../services/projects/project-instructions.js';
import {
  getProjectRetrievalMode,
  assembleProjectKnowledgeCorpus,
} from '../../services/projects/retrieval-mode.js';
import { getCachedSignalReliability } from '../../services/intelligence/learning-loop-service.js';
import type { SignalReliability } from '../../services/intelligence/learning-loop-service.js';
import { orchestrate, type OrchestratorOutput } from '../../services/ana-ri/orchestrator.js';
import {
  directiveFromToolResult,
  surfaceActionFromToolResult,
  toNavigationActions,
  toSurfaceActionChips,
  type NavigationAction,
  type SurfaceActionChip,
} from '../../services/ana-ri/navigation-actions.js';
import type { NavigationDirective } from '../../../shared/navigation/index.js';
import type { SurfaceActionDirective } from '../../../shared/navigation/surface-actions.js';
import {
  handleSubmissionChat,
  isPostSectionGenerationTurn,
} from '../../services/ana/submission-chat-handler.js';
import { ensureGateway, normalizeBody } from './shared.js';
import { sha256, stableStringify } from './provenance.js';
import { verifyClaim, type VerifierFlag } from './verifier.js';

// ── Retrieval + generation tuning (externalized for runtime changes) ────────
const RETRIEVAL_TOP_K = parseInt(process.env.ANA_RETRIEVAL_TOP_K ?? '5', 10);
const RETRIEVAL_THRESHOLD = parseFloat(process.env.ANA_RETRIEVAL_THRESHOLD ?? '0.7');
const GENERATION_MAX_TOKENS = parseInt(process.env.ANA_GENERATION_MAX_TOKENS ?? '4096', 10);
// Projects spec A2: dark-launch flag for in-context full-corpus injection. Off
// by default — the retrieval mode is still computed and surfaced via the
// knowledge endpoint; this flag only controls whether the chat path injects the
// full project corpus into the prompt (pending cost/cache validation in a live
// environment). When off, this path does zero extra work.
const INCONTEXT_INJECTION_ENABLED =
  process.env.PROJECT_INCONTEXT_INJECTION_ENABLED === 'true';

/**
 * POST /api/chat/send-message  (and POST /api/chat via root alias)
 * Main chat endpoint — 9-step provenance-tracked RAG pipeline.
 */
export const sendMessageHandler = async (req: Request, res: Response) => {
  normalizeBody(req);
  try {
    const { message, thread_id, file_id, system_prompt, project_id, preferred_provider, selected_tools, tool_context } = req.body;

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
    const requestedThreadId = Array.isArray(thread_id) ? thread_id[0] : thread_id;
    // Resolved AS THE CALLER: in this organization, and to this user's own
    // thread. A colleague's thread id is refused; an unknown or foreign id
    // mints a fresh thread rather than touching a row nothing verified.
    let threadId: string;
    try {
      threadId = await getOrCreateThread(
        requestedThreadId ?? null,
        (req as any).user?.id,
        'thread',
        numericOrgId
      );
    } catch (e: any) {
      if (e instanceof ThreadAccessError) {
        return res.status(403).json({
          error: 'That conversation belongs to another user',
          code: e.code,
        });
      }
      throw e;
    }

    // Fix B: Enforce thread ownership — if thread_id was supplied, verify org match
    if (requestedThreadId && numericOrgId) {
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

    // ── STEP 2b: SUBMISSION-CHAT AUTO-FLIP ──────────────────────────────
    // If the user supplied an artifactId in context AND the previous assistant
    // turn was a section generation, route this message through the
    // submission-chat handler so retrieval scope expands to the entire
    // dossier instead of just the active document.
    const clientCtxEarly = (req.body.context ?? {}) as Record<string, any>;
    const submissionChatArtifactId =
      clientCtxEarly.artifactId || req.body.artifact_id;
    const submissionChatExplicit = req.body.mode === 'submission-chat';
    const shouldRunSubmissionChat =
      typeof submissionChatArtifactId === 'string' &&
      submissionChatArtifactId.length > 0 &&
      (submissionChatExplicit ||
        isPostSectionGenerationTurn(previousMessages));

    if (shouldRunSubmissionChat) {
      try {
        const orgUuid =
          (req as any).tenantContext?.organizationUuid ||
          (req.headers['x-org-uuid'] as string | undefined);
        const sub = await handleSubmissionChat({
          threadId,
          artifactId: submissionChatArtifactId,
          question: message,
          organizationId: numericOrgId ?? null,
          organizationUuid: orgUuid ?? null,
          userId: numericUserId || null,
        });

        // Persist user + assistant turn to legacy chat_messages so the thread
        // remains continuous when the next message flips back to normal mode.
        await saveMessage(threadId, 'user', message, sub.model);
        await saveMessage(
          threadId,
          'assistant',
          sub.answer,
          sub.model,
          sub.usage.totalTokens
        );

        return res.json({
          answer: sub.answer,
          response: sub.answer,
          thread_id: threadId,
          model: sub.model,
          provider: sub.provider,
          usage: {
            prompt_tokens: sub.usage.promptTokens,
            completion_tokens: sub.usage.completionTokens,
            total_tokens: sub.usage.totalTokens,
          },
          mode: 'submission-chat',
          citations: sub.citations,
          submissionChat: {
            artifactId: sub.artifactId,
            projectId: sub.projectId,
            intent: sub.intent,
            rewrite: sub.rewrite,
            retrieval: sub.retrieval,
            conversation: sub.conversation,
          },
        });
      } catch (err: any) {
        // Fall through to the normal chat path on failure — the user still
        // gets an answer, just without the cross-dossier scope.
        console.warn(
          '[AnA] submission-chat auto-flip failed, falling back to normal chat:',
          err?.message
        );
      }
    }

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
          .catch(err =>
            console.warn('[AnA] thread updated_at touch failed (non-blocking):', err?.message)
          );
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

    const normalizedProjectId = project_id
      ? String(project_id).replace(/^proj_/, '')
      : undefined;

    // ── STEP 4: RETRIEVE (org-scoped + project-scoped when available) ───
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
          orgUuid,
          normalizedProjectId
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

            // AnA fix F9: batch all retrieval chunks into one multi-row INSERT
            // (replaces a sequential N+1 loop — RETRIEVAL_TOP_K queries became 1).
            if (sources.length > 0) {
              const valuesSql: string[] = [];
              const params: unknown[] = [];
              const paramsPerRow = 7;
              for (let i = 0; i < sources.length; i++) {
                const s = sources[i];
                const o = i * paramsPerRow;
                valuesSql.push(
                  `($${o + 1}, $${o + 2}, 'atom', $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`
                );
                params.push(
                  retrievalRunId,
                  i + 1,
                  s.id,
                  s.title,
                  sha256(s.content),
                  s.content.substring(0, 500),
                  s.score
                );
              }
              const crResult = await pool.query(
                `INSERT INTO ai_retrieval_chunks
                   (retrieval_run_id, rank, source_type, atom_id, title,
                    excerpt_hash_sha256, excerpt_preview, score)
                 VALUES ${valuesSql.join(', ')}
                 RETURNING id, rank, atom_id, score`,
                params
              );
              for (const row of crResult.rows) {
                chunkRows.push({
                  id: row.id,
                  rank: row.rank,
                  atomId: row.atom_id,
                  score: Number(row.score),
                });
              }
              chunkRows.sort((a, b) => a.rank - b.rank);
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
    let memoryDiagnostics: MemoryAssemblyDiagnostics | null = null;
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
    // Hoisted so the response serializer (after the try/catch) can read it.
    // The catch block returns 503, so reaching the response site implies
    // the assignment inside the try succeeded — hence non-null at use.
    let orchestratorResult: OrchestratorOutput | null = null;
    // Validated navigation directives the agentic loop's navigate_to produced
    // this turn. Hoisted for the same reason: collected inside the try (the
    // loop's onToolExecution), offered as chips by the action step after it.
    // This caller used to DROP them silently — AnA resolved a target, told the
    // user she could take them there, and no chip ever reached this client.
    const collectedNavigation: NavigationDirective[] = [];
    // Surface actions ride the same carrier: act_on_screen results become
    // offer-chips here too (this route never applies anything live).
    const collectedSurfaceActions: SurfaceActionDirective[] = [];

    // ── STEP 6: GENERATE (no silent demo fallback) ─────────────────────
    const gw = ensureGateway();
    if (!gw || gw.getEnabledProviders().length === 0) {
      return res.status(503).json({
        error: 'No AI providers available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    try {
      // Build conversation history for orchestrator continuity analysis
      const conversationHistory = previousMessages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Pre-fetch decision context for AnA explanation grounding (non-blocking)
      let decisionContext: any[] = [];
      if (project_id) {
        try {
          const { decisionLifecycleService } =
            await import('../../services/decision-lifecycle-service.js');
          // Scoped to the caller's tenant: this context is fed to the
          // orchestrator as grounding, so an unscoped read would not just
          // leak another organization's decisions, it would let the model
          // quote them back in an answer. numericOrgId is resolved above and
          // used throughout this handler; the decision read was the one that
          // did not pass it.
          decisionContext = numericOrgId
            ? decisionLifecycleService.getDecisionContext(String(project_id), {
                limit: 5,
                organizationId: numericOrgId,
              })
            : [];
        } catch {
          /* non-blocking */
        }
      }

      // Run the orchestrator for intent detection, deficiency context, and continuity
      // AnA fix F1: forward project + document + role metadata into the
      // orchestrator so AnA can ground responses on the active project /
      // artifact instead of guessing from message text alone.
      const clientCtx = (req.body.context ?? {}) as Record<string, any>;
      const orchestratorProjectContext = project_id
        ? {
            productName: clientCtx.activeProject || clientCtx.productName,
            therapeuticArea: clientCtx.therapeuticArea,
            submissionType: clientCtx.productType || clientCtx.submissionType,
            targetAgency: clientCtx.targetAgency,
            phase: clientCtx.phase,
          }
        : undefined;
      const orchestratorDocumentContext =
        clientCtx.artifactId || clientCtx.sectionCode || clientCtx.module
          ? {
              documentType: clientCtx.documentType || clientCtx.artifactType,
              section: clientCtx.sectionCode,
              module: clientCtx.module || clientCtx.moduleCode,
            }
          : undefined;

      orchestratorResult = orchestrate({
        message,
        conversationHistory,
        projectContext: orchestratorProjectContext,
        documentContext: orchestratorDocumentContext,
        userRole: clientCtx.userRole,
        authoringContext: project_id
          ? {
              projectId: String(project_id),
              sectionCode: clientCtx.sectionCode,
              moduleCode: clientCtx.module || clientCtx.moduleCode,
              artifactStatus: clientCtx.artifactStatus,
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

      // AnA fix F6: fetch intelligence prefix and persistent-memory context
      // in parallel — they're independent and were previously awaited
      // sequentially, costing ~100–200 ms per chat. AnA fix F10: log silent
      // intelligence-prefix failures instead of swallowing them.
      const [intelligencePrefix, memoryResult] = await Promise.all([
        getIntelligencePrefix(numericOrgId ?? undefined, project_id).catch(err => {
          console.warn(
            '[AnA] intelligence prefix load failed (continuing without):',
            err?.message
          );
          return '';
        }),
        buildMemoryContextForChat({
          threadId,
          organizationId: numericOrgId || undefined,
          projectId: project_id || undefined,
          query: message,
          limitPerLayer: 4,
          maxChars: 3500,
        }),
      ]);
      const { memoryBlock, atoms, diagnostics } = memoryResult;
      memoryAtomCount = atoms.length;
      memoryBlockChars = memoryBlock.length;
      memoryDiagnostics = diagnostics;

      // Session bootstrap — so a conversation never starts cold. At session
      // start (no prior messages in this thread) rehydrate query-independently:
      // the latest working summary, the most important project/client atoms,
      // and AnA's own past lessons (which the query-driven memory assembler
      // never loads). Gated to session start to avoid re-injecting every turn,
      // fault-tolerant, and disableable via ANA_SESSION_BOOTSTRAP_AUTO=false.
      let sessionBootstrapBlock = '';
      try {
        const { shouldAutoBootstrap, buildSessionBootstrapContext } = await import(
          '../../services/ana-session-bootstrap.js'
        );
        if (
          shouldAutoBootstrap({
            priorMessageCount: previousMessages.length,
            organizationId: numericOrgId ?? null,
            disabled: process.env.ANA_SESSION_BOOTSTRAP_AUTO === 'false',
          })
        ) {
          const pid =
            typeof project_id === 'string'
              ? parseInt(project_id.replace(/^proj_/, ''), 10)
              : project_id;
          const block = await buildSessionBootstrapContext({
            organizationId: numericOrgId as number,
            projectId: Number.isFinite(pid) && (pid as number) > 0 ? (pid as number) : undefined,
            threadId,
            atomLimit: 6,
          });
          if (block) sessionBootstrapBlock = `\n\n${block}\n`;
        }
      } catch (err) {
        console.warn('[AnA] session bootstrap failed (continuing without):', (err as any)?.message);
      }

      // ── IND Context Injection ──────────────────────────────────────────────────
      // When the project is an IND submission, inject the complete CTD structure
      // so AnA knows every section needed and can guide the user through it.
      let indContextBlock = '';
      const detectedType = (orchestratorResult.detectedSubmissionType || '').toUpperCase();
      const contextType = (req.body.context?.productType || '').toUpperCase();
      if (detectedType === 'IND' || contextType === 'IND' || contextType === 'NDA' || contextType === 'BLA') {
        try {
          const { IND_SECTIONS, getModuleStatus } = await import('../../services/ind/ind-section-registry.js');
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
          const { getDeviceSections } = await import('../../services/device/device-section-registry.js');
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

      // Project instructions injection (spec A1.1) — read the project's
      // authored instructions + knowledge context and prepend to the system
      // context. Shared helper so this and submission-chat cannot drift; it is
      // tenant-scoped and graceful (empty string when absent or on error).
      const projectInstructionsBlock = await getProjectInstructionsBlock(
        project_id,
        numericOrgId
      );

      // A2 in-context mode (dark-launched behind INCONTEXT_INJECTION_ENABLED):
      // when the project runs in_context, inject the full project knowledge
      // corpus. Off by default → zero extra work and no behaviour change. The
      // mode itself is surfaced separately by GET /projects/:id/knowledge.
      let projectKnowledgeCorpusBlock = '';
      if (INCONTEXT_INJECTION_ENABLED && project_id && numericOrgId) {
        const pidNum =
          typeof project_id === 'string'
            ? parseInt(project_id.replace(/^proj_/, ''), 10)
            : project_id;
        if (Number.isFinite(pidNum) && pidNum > 0) {
          try {
            const modeState = await getProjectRetrievalMode(pidNum, numericOrgId);
            if (modeState.mode === 'in_context') {
              projectKnowledgeCorpusBlock = await assembleProjectKnowledgeCorpus(
                pidNum,
                numericOrgId
              );
            }
          } catch {
            /* non-fatal — fall back to retrieval-only */
          }
        }
      }

      // AnA fix F2: always prepend a CONTEXT SNAPSHOT block so AnA can see
      // exactly what context is loaded right now — including explicit
      // "NOT LOADED" / "NONE" markers when something is missing. The Context
      // Clarity Protocol in the persona forbids inferring what isn't here.
      const snapshotProductName = clientCtx.activeProject || clientCtx.productName;
      const snapshotSubmission = clientCtx.productType || clientCtx.submissionType;
      const snapshotArtifactTitle = clientCtx.artifactTitle;
      const snapshotSection = clientCtx.sectionCode;
      const snapshotUserRole = clientCtx.userRole || 'general';
      const workingMemoryPresent = atoms.some(a => a.layer === 'working_memory');
      const semanticMemoryCount = atoms.filter(a => a.layer !== 'working_memory').length;
      const contextSnapshot =
        '## CONTEXT SNAPSHOT\n' +
        `- Project: ${
          project_id
            ? `${snapshotProductName || 'unnamed'} (${snapshotSubmission || 'submission type unknown'})`
            : 'NOT LOADED'
        }\n` +
        `- Active artifact: ${
          snapshotArtifactTitle
            ? `${snapshotArtifactTitle}${snapshotSection ? ` — ${snapshotSection}` : ''}`
            : 'NONE'
        }\n` +
        `- Memory: working=${workingMemoryPresent ? 'yes' : 'no'}, semantic atoms=${semanticMemoryCount}\n` +
        `- Retrieved sources: ${sources.length}\n` +
        `- User role: ${snapshotUserRole}\n\n`;

      const systemPrompt =
        contextSnapshot +
        intelligencePrefix +
        projectInstructionsBlock +
        basePrompt +
        indContextBlock +
        deviceContextBlock +
        projectKnowledgeCorpusBlock +
        sessionBootstrapBlock +
        memoryBlock +
        evidenceBlock;

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

      // Cost-tiered model selection — same policy and precedence as the
      // ana-ri paths: yields to an explicit provider preference and to a
      // governance-pinned strategy; opt-out via ANA_MODEL_TIERING=off; tier
      // remap via ANA_TIER_*_MODEL. No effort picker on this path, so it
      // resolves at the default Balanced effort. The pinned model rides the
      // whole agentic loop (the request carries it into every round).
      const chatTieredModel = (() => {
        if (validatedChatProvider) return null; // user pinned a provider
        if (policyHint?.preferredStrategy) return null; // governance owns the strategy
        if ((process.env.ANA_MODEL_TIERING ?? 'on').toLowerCase() === 'off') return null;
        const tier = resolveModelTier({
          effort: 'balanced',
          riskTier: routingPlan.riskTier,
          intentLens: orchestratorResult.detectedIntent?.lens,
          taskType: routingPlan.taskType,
          substantive: isSubstantiveTurn({
            messageLength: typeof message === 'string' ? message.length : 0,
            intentLens: orchestratorResult.detectedIntent?.lens,
          }),
        });
        const enabledModels =
          typeof gw.getModels === 'function' ? gw.getModels().filter((m) => m.enabled) : [];
        return resolveTierModel(tier, enabledModels, process.env);
      })();

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
        // Offer the tools relevant to this turn's intent + context (the platform
        // command bridge is always included, so nothing is ever truly out of
        // reach), honouring any tools the user pinned in the tool picker.
        tools: selectToolsForTurn(getAllEnabledTools(), typeof message === 'string' ? message : '', {
          pinned: Array.isArray(selected_tools) ? selected_tools.filter((t: unknown): t is string => typeof t === 'string') : undefined,
          context: tool_context && typeof tool_context === 'object' ? tool_context : undefined,
        }),
        toolChoice: 'auto' as const,
        ...(validatedChatProvider ? { provider: validatedChatProvider } : {}),
        // Mutually exclusive with validatedChatProvider (the tier yields to it).
        ...(chatTieredModel
          ? { provider: chatTieredModel.provider, model: chatTieredModel.model }
          : {}),
        // A2: cache the (large, stable) in-context corpus prefix when injected.
        ...(projectKnowledgeCorpusBlock
          ? { promptCache: { enabled: true, type: 'ephemeral' as const } }
          : {}),
      };

      // Use agentic loop for multi-turn tool execution. This generic path has no
      // effort picker, so it runs at the default (Balanced) round ceiling — up
      // from the old flat 5 so a deeper investigation can run to completion.
      const gwResponse: AnaGatewayResponse = await executeAgenticLoop(baseRequest, {
        maxRounds: resolveMaxRounds('balanced'),
        toolContext: {
          organizationId: numericOrgId,
          userId: numericUserId || null,
          projectId:
            typeof project_id === 'string' ? parseInt(project_id, 10) || null : project_id || null,
          // Tenant UUID so the project_knowledge_search tool can scope retrieval.
          organizationUuid: orgUuid ?? null,
          // Situational context (surface/project/document type) — same signal the
          // tool selector uses; threaded to handlers for telemetry + tailoring.
          surface: tool_context && typeof tool_context === 'object' ? ((tool_context as any).surface ?? null) : null,
          projectType: tool_context && typeof tool_context === 'object' ? ((tool_context as any).projectType ?? null) : null,
          documentType: tool_context && typeof tool_context === 'object' ? ((tool_context as any).documentType ?? null) : null,
        },
        onToolExecution: (toolName, input, result) => {
          // A navigate_to that resolved against the governed registry becomes
          // an offer-chip in the response (same contract as the SSE path;
          // refusals yield null here and never become one).
          const directive = directiveFromToolResult(toolName, result);
          if (directive) collectedNavigation.push(directive);
          // An act_on_screen that resolved against the surface-action registry
          // becomes an offer-chip the same way (refusals yield null).
          const actionDirective = surfaceActionFromToolResult(toolName, result);
          if (actionDirective) collectedSurfaceActions.push(actionDirective);
          // Persist the invocation for usage analytics. Latency is 0 here
          // because the agentic-loop hook fires post-success without a
          // start timestamp; the streaming path captures real latency.
          // Errors aren't surfaced through this hook either — see
          // AnaToolExecutor.executeAgenticLoop's catch branch.
          void logToolRun({
            threadId,
            projectId: typeof project_id === 'string' ? parseInt(project_id, 10) || null : project_id || null,
            userId: numericUserId || null,
            organizationId: numericOrgId,
            toolName,
            arguments: (input ?? {}) as Record<string, unknown>,
            result: { resultBytes: result.length },
            status: 'success',
            latencyMs: 0,
          });
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
    let executedActions: Array<
      | {
          actionType: string;
          executed: boolean;
          confidence: string;
          artifactId: string | null;
          threadId: string | null;
          error: string | null;
        }
      | NavigationAction
      | SurfaceActionChip
    > = [];

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

    // Navigation chips AFTER guidance actions — same ordering rationale as the
    // SSE path's post-processing: an artifact the turn actually created still
    // leads. Deduped + capped by toNavigationActions (first occurrence wins).
    if (collectedNavigation.length > 0) {
      executedActions = [...executedActions, ...toNavigationActions(collectedNavigation)];
    }

    // Surface-action chips under the identical offered-not-performed contract.
    if (collectedSurfaceActions.length > 0) {
      executedActions = [...executedActions, ...toSurfaceActionChips(collectedSurfaceActions)];
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

          // AnA fix F9: persist all citation linkages in one multi-row INSERT
          // per claim (replaces a per-citation sequential loop).
          if (citationLinks.length > 0) {
            const valuesSql: string[] = [];
            const params: unknown[] = [];
            for (let li = 0; li < citationLinks.length; li++) {
              const o = li * 3;
              valuesSql.push(`($${o + 1}, $${o + 2}, $${o + 3})`);
              params.push(claimId, citationLinks[li].chunkId, citationLinks[li].score);
            }
            await pool.query(
              `INSERT INTO ai_claim_citations (claim_id, retrieval_chunk_id, relevance_score)
               VALUES ${valuesSql.join(', ')}`,
              params
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
        projectId: parseInt(String(normalizedProjectId || '0'), 10),
        userId: (req as any).user?.id,
        sectionCode: (req as any).body?.section_code,
        assistantMessage,
        claimCount: claims.length,
        supportedClaimRate,
        model,
        provider,
      });
    }

    // ── Cached reliability lookup (5-min TTL, surfaced in response) ─────
    let reliability: SignalReliability | null = null;
    if (numericOrgId && normalizedProjectId) {
      const projectIdNum = parseInt(String(normalizedProjectId), 10);
      if (Number.isFinite(projectIdNum) && projectIdNum > 0) {
        try {
          reliability = await getCachedSignalReliability(projectIdNum, numericOrgId);
        } catch {
          // Non-blocking — chat completes without the reliability badge.
        }
      }
    }

    // ── Working-memory write-back (fire-and-forget) ────────────────────
    // Compress multi-turn history into structured working memory once the
    // conversation crosses WORKING_MEMORY_THRESHOLD messages. The helper
    // short-circuits when no refresh is needed so the summarizer only fires
    // every ~20 turns, not per-message.
    if (numericOrgId && threadId) {
      const writebackMessages = [
        ...previousMessages
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any) => ({ role: m.role as string, content: m.content as string })),
        { role: 'user', content: message },
        { role: 'assistant', content: assistantMessage },
      ];
      void summarizeAndStoreWorkingMemoryForThread({
        threadId,
        organizationId: numericOrgId,
        messages: writebackMessages,
        projectId: normalizedProjectId
          ? parseInt(String(normalizedProjectId), 10) || null
          : null,
      });
    }

    // ── Data Lineage: record retrieval→generation chain (non-blocking) ──
    if (numericOrgId && generationRunId && sources.length > 0) {
      try {
        const { recordLineageBatch } = await import('../../services/data-lineage-service');
        const projectIdNum = parseInt(String(normalizedProjectId || '0'), 10);
        const entries = sources.filter((_s, i) => citedRefs.has(i)).map((s, _i) => ({
          organizationId: numericOrgId,
          projectId: projectIdNum || undefined,
          sourceObjectType: 'retrieval_chunk' as const,
          sourceObjectId: s.id || `src-${_i}`,
          sourceTitle: s.title,
          sourceContent: s.content?.substring(0, 500),
          targetObjectType: 'generation_run' as const,
          targetObjectId: String(generationRunId),
          targetField: threadId,
          linkageType: 'cited_by' as const,
          transformationType: 'ai_generation' as const,
          confidenceScore: (s.score ?? 0) * 100,
          confidenceBasis: 'ai_inferred' as const,
          aiModelUsed: model,
          retrievalRunId: retrievalRunId ? Number(retrievalRunId) : undefined,
          generationRunId: Number(generationRunId),
        }));
        if (entries.length > 0) {
          recordLineageBatch(entries).catch(err =>
            console.warn('[AnA] data lineage batch failed (non-blocking):', err?.message)
          );
        }
      } catch { /* non-blocking */ }
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
        reliability,
      },
      // Provenance chain
      retrievalRunId,
      snapshotHashSha256,
      generationRunId,
      claims,
      orchestration: {
        detectedIntent: orchestratorResult!.detectedIntent,
        detectedSubmissionType: orchestratorResult!.detectedSubmissionType,
        appliedRole: orchestratorResult!.appliedRole,
        activeWorkstream: orchestratorResult!.activeWorkstream,
        workstreamHandoff: orchestratorResult!.workstreamHandoff,
        suggestedActions: orchestratorResult!.suggestedActions,
        meta: orchestratorResult!.orchestrationMeta,
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
