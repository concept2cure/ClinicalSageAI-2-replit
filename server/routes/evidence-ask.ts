/**
 * Evidence Ask — Single-shot, grounded Q&A over the project Data Room.
 *
 * `POST /api/evidence/ask` powers the Ask-Data-Room flow described in
 * `docs/audits/WEAVE_PARITY_MATRIX_2026-03-27.md` (use case #3) and Phase 4
 * of `docs/plans/FINAL_DOCUMENT_SYSTEM_PROJECT_AND_BUILD_PLAN_2026-03-27.md`.
 * It is the simpler sibling of `POST /api/chat/send-message`:
 *
 *   retrieve (hybrid) → prompt (cite [SRC-n]) → generate → persist provenance
 *
 * Pipeline differences vs. the chat handler:
 *   - no thread history: every call is a one-shot ask
 *   - no tools loop, no claim splitting, no orchestrator/RIM
 *   - the system prompt forces grounding and refuses on insufficient evidence
 *   - retrieval defaults: top_k = 8, threshold = 0.6 (slightly broader than chat)
 *
 * Retrieval is the canonical layer — `getEmbeddingService(pool).searchHybrid`
 * over `lumen_data_atoms` (see `docs/audits/RETRIEVAL_ENTRYPOINTS.md`). LLM
 * dispatch goes through the AI gateway (`getGateway()`); no direct provider
 * SDK calls. Provenance writes to `ai_retrieval_runs` + `ai_retrieval_chunks`
 * + `ai_generation_runs` are best-effort (mirrors send-message.ts).
 *
 * @module server/routes/evidence-ask
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { getEmbeddingService } from '../services/enhancedEmbeddingService.js';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayResponse } from '../services/ai-gateway/types.js';
import { sha256, stableStringify } from './chat/provenance.js';
import { randomUUID } from 'crypto';

// ── Retrieval + generation tuning (env-overridable) ─────────────────────────
// Single-shot Q&A casts a slightly wider net than chat: top_k=8 vs chat's 5,
// and a more permissive threshold (0.6 vs 0.7) since this endpoint cannot
// fall back on multi-turn clarification.
const RETRIEVAL_TOP_K = parseInt(process.env.EVIDENCE_ASK_TOP_K ?? '8', 10);
const RETRIEVAL_THRESHOLD = parseFloat(process.env.EVIDENCE_ASK_THRESHOLD ?? '0.6');
const GENERATION_MAX_TOKENS = parseInt(
  process.env.EVIDENCE_ASK_MAX_TOKENS ?? '2048',
  10
);

const SYSTEM_PROMPT_BASE =
  'You are a regulatory evidence assistant for a life sciences submission ' +
  'team (FDA, EMA, PMDA, Health Canada). Answer the user\'s question using ' +
  'ONLY the retrieved evidence below. Cite every supporting fact inline as ' +
  '[SRC-n] using the numbers from the evidence block. Be concise, neutral, ' +
  'and regulatory in tone — no marketing language, no speculation. ' +
  'If the evidence does not contain a clear answer, say ' +
  '"I don\'t have enough evidence to answer that" rather than guessing.';

const router = Router();

/**
 * POST /api/evidence/ask
 *
 * Request body:
 *   message:        string (required) — the user's question. `question` is
 *                                       accepted as an alias for legacy callers.
 *   projectId?:     string | number    — optional project scoping
 *   organizationId?: number            — optional explicit org. When omitted,
 *                                       resolved from `req.tenantId` /
 *                                       `req.tenantContext.organizationId`.
 *   topK?:          number             — override default top_k
 *   threshold?:     number             — override default semantic threshold
 *
 * Response shape (mirrors `/api/chat/send-message`'s simpler return so the UI
 * can reuse rendering):
 *   { answer, sources, citations, confidence, retrievalMeta,
 *     retrievalRunId, generationRunId }
 */
router.post('/ask', async (req: Request, res: Response) => {
  try {
    // ── INPUT VALIDATION ─────────────────────────────────────────────────
    const rawMessage = req.body?.message ?? req.body?.question;
    const message: string = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message) {
      return res.status(400).json({
        error: 'message is required',
        code: 'INVALID_REQUEST',
      });
    }

    // Org context: explicit body field wins, then tenant middleware.
    const tenantOrgId =
      (req as any).tenantId ?? (req as any).tenantContext?.organizationId;
    const bodyOrgId = req.body?.organizationId;
    const numericOrgId: number | null = (() => {
      const candidate = bodyOrgId ?? tenantOrgId;
      if (candidate === undefined || candidate === null || candidate === '')
        return null;
      const n = typeof candidate === 'string' ? Number(candidate) : Number(candidate);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    if (!numericOrgId) {
      return res.status(400).json({
        error: 'organizationId is required (provide explicitly or via tenant middleware)',
        code: 'INVALID_REQUEST',
      });
    }

    const rawProjectId = req.body?.projectId;
    const projectId: string | undefined =
      rawProjectId !== undefined && rawProjectId !== null && rawProjectId !== ''
        ? String(rawProjectId)
        : undefined;
    const normalizedProjectId = projectId
      ? projectId.replace(/^proj_/, '')
      : undefined;

    const topK = (() => {
      const n = Number(req.body?.topK);
      return Number.isFinite(n) && n > 0 && n <= 50 ? Math.floor(n) : RETRIEVAL_TOP_K;
    })();
    const threshold = (() => {
      const n = Number(req.body?.threshold);
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : RETRIEVAL_THRESHOLD;
    })();

    const rawUserId = (req as any).userId ?? (req as any).user?.id;
    const userId: number | string = rawUserId ?? 'anonymous';
    const numericUserId =
      typeof userId === 'string' ? parseInt(userId, 10) || 0 : Number(userId);

    // ── GATEWAY AVAILABILITY ─────────────────────────────────────────────
    let gw: ReturnType<typeof getGateway>;
    try {
      gw = getGateway();
    } catch (e: any) {
      console.error('[Evidence Ask] AI Gateway init failed:', e?.message);
      return res.status(503).json({
        error: 'No AI providers available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }
    if (!gw || gw.getEnabledProviders().length === 0) {
      return res.status(503).json({
        error: 'No AI providers available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    // ── RETRIEVAL (hybrid, tenant-scoped) ────────────────────────────────
    const orgUuid: string | undefined =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);

    let sources: Array<{ id: string; title: string; content: string; score: number }> =
      [];
    let confidence: number | null = null;

    try {
      if (orgUuid && !/^[0-9a-f-]{36}$/i.test(orgUuid)) {
        console.warn('[Evidence Ask] Invalid org UUID, skipping tenant-scoped retrieval');
      } else {
        const embeddingService = getEmbeddingService(pool);
        const searchResults = await embeddingService.searchHybrid(
          message,
          topK,
          threshold,
          orgUuid,
          normalizedProjectId
        );
        sources = searchResults.map(r => ({
          id: r.id,
          title: r.title,
          content:
            r.content.length > 500 ? r.content.substring(0, 500) + '…' : r.content,
          score: r.score,
        }));
        if (sources.length > 0) {
          confidence = Math.min(
            1,
            sources.reduce((sum, s) => sum + s.score, 0) / sources.length
          );
        }
      }
    } catch (srcErr: any) {
      // Non-fatal — answer can still be produced (with the refusal fallback).
      console.warn('[Evidence Ask] Source retrieval failed:', srcErr?.message);
    }

    // ── PROVENANCE: persist retrieval run + chunks (non-blocking) ────────
    let retrievalRunId: string | null = null;
    let snapshotHashSha256: string | null = null;
    const chunkRows: Array<{ id: string; rank: number; atomId: string; score: number }> =
      [];
    try {
      const queryHash = sha256(message);
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
          projectId || null,
          String(numericUserId || userId),
          orgUuid ? 'org' : 'global',
          message,
          queryHash,
          snapshotHashSha256,
          topK,
          threshold,
          sources.length,
        ]
      );
      retrievalRunId = rrResult.rows[0].id;

      if (sources.length > 0 && retrievalRunId) {
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
      if (e?.code !== '42P01') {
        console.warn('[Evidence Ask] Retrieval persist failed:', e?.message);
      }
    }

    // ── PROMPT ASSEMBLY (evidence-grounded, refusal-on-empty) ────────────
    const evidenceBlock =
      sources.length > 0
        ? '\n\n--- RETRIEVED EVIDENCE (cite as [SRC-n]) ---\n' +
          sources
            .map((s, i) => `[SRC-${i + 1}] "${s.title}"\n${s.content}`)
            .join('\n\n') +
          '\n--- END EVIDENCE ---\n'
        : '\n\n--- RETRIEVED EVIDENCE ---\n(none)\n--- END EVIDENCE ---\n';

    const projectScope = projectId
      ? `Project scope: ${projectId}\n`
      : 'Project scope: organization-wide (no project filter)\n';
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${projectScope}${evidenceBlock}`;

    // ── GENERATION ───────────────────────────────────────────────────────
    let assistantMessage: string;
    let model: string;
    let provider = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let latencyMs: number | null = null;

    try {
      const gwResponse: GatewayResponse = await gw.route({
        taskType: 'chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.2,
        maxTokens: GENERATION_MAX_TOKENS,
        callerModule: 'evidence-ask',
        organizationId: numericOrgId,
        userId: numericUserId,
        projectId: projectId,
      });
      assistantMessage =
        gwResponse.content ||
        "I don't have enough evidence to answer that.";
      model = `${gwResponse.provider}/${gwResponse.model}`;
      provider = gwResponse.provider;
      usage = {
        prompt_tokens: gwResponse.usage.inputTokens,
        completion_tokens: gwResponse.usage.outputTokens,
        total_tokens: gwResponse.usage.totalTokens,
      };
      latencyMs = gwResponse.latencyMs;
    } catch (gwError: any) {
      console.error('[Evidence Ask] AI Gateway call failed:', gwError?.message);
      return res.status(503).json({
        error: 'AI provider call failed',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    // ── PROVENANCE: persist generation run (non-blocking) ────────────────
    // ai_generation_runs.thread_id is NOT NULL and FK-constrained, so we
    // create a synthetic ad-hoc thread for this single-shot ask.
    let generationRunId: string | null = null;
    try {
      const adhocThreadId = `evidence-ask-${randomUUID()}`;
      await pool.query(
        `INSERT INTO ai_threads (id, organization_id, project_id, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [
          adhocThreadId,
          numericOrgId,
          projectId || null,
          String(numericUserId || userId),
        ]
      );
      const answerHash = sha256(assistantMessage);
      const genResult = await pool.query(
        `INSERT INTO ai_generation_runs
           (retrieval_run_id, thread_id, model, provider, answer_hash_sha256,
            prompt_tokens, completion_tokens, total_tokens, latency_ms, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
         RETURNING id`,
        [
          retrievalRunId,
          adhocThreadId,
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
    } catch (e: any) {
      if (e?.code !== '42P01') {
        console.warn('[Evidence Ask] Generation persist failed:', e?.message);
      }
    }

    // ── CITATIONS (which sources were referenced in the answer) ──────────
    const citedRefs = new Set<number>();
    const refPattern = /\[SRC-(\d+)\]/g;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = refPattern.exec(assistantMessage)) !== null) {
      const idx = parseInt(refMatch[1], 10) - 1;
      if (idx >= 0 && idx < sources.length) citedRefs.add(idx);
    }
    const citations = sources.map((s, i) => ({
      id: `SRC-${i + 1}`,
      sourceAtomId: s.id,
      sourceType: 'atom' as const,
      title: s.title,
      snippet: s.content,
      relevanceScore: s.score,
      cited: citedRefs.has(i),
    }));

    const citationCoverage = sources.length > 0 ? citedRefs.size / sources.length : 0;

    return res.json({
      answer: assistantMessage,
      sources,
      citations,
      confidence,
      retrievalMeta: {
        retrievedCount: sources.length,
        citedCount: citedRefs.size,
        orgScoped: !!orgUuid,
        citationCoverage,
        topK,
        threshold,
      },
      retrievalRunId,
      snapshotHashSha256,
      generationRunId,
      model,
      provider,
      usage,
    });
  } catch (error: any) {
    console.error('[Evidence Ask] Unhandled error:', error);
    return res.status(500).json({
      error: 'Failed to process evidence question',
      code: 'EVIDENCE_ASK_ERROR',
    });
  }
});

export default router;
