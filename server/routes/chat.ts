/**
 * Chat API Routes - Lumen Cortex AI Chat Interface
 *
 * Provides Claude-like conversational AI for regulatory guidance.
 * Connects to OpenAI GPT-4 with context-aware regulatory knowledge.
 * Includes intelligent fallback for demo/development environments.
 *
 * @module server/routes/chat
 */

import { Router, Request, Response } from 'express';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayResponse } from '../services/ai-gateway/types.js';
import { pool } from '../db.js';
import {
  getOrCreateThread,
  getThreadMessages,
  saveChatMessage as saveMessage,
} from '../services/chat-thread-helpers.js';
import { getEmbeddingService } from '../services/enhancedEmbeddingService.js';
import { createHash } from 'crypto';

const router = Router();

// AI Gateway instance (lazy-initialized on first request)
let gateway: ReturnType<typeof getGateway> | null = null;
function ensureGateway() {
  if (!gateway) {
    try {
      gateway = getGateway();
    } catch (e) {
      console.warn('[Lumen Cortex] AI Gateway initialization failed, using demo mode');
    }
  }
  return gateway;
}

const isDev = process.env.NODE_ENV !== 'production';

// System prompt for regulatory AI assistant
const REGULATORY_SYSTEM_PROMPT = `You are Lumen Cortex, an expert AI assistant for regulatory affairs in the life sciences industry. You specialize in:

- FDA 510(k) medical device submissions
- IND (Investigational New Drug) applications
- Clinical trial design and protocol optimization
- 21 CFR Part 11 compliance
- EU MDR (Medical Device Regulation)
- Clinical Evaluation Reports (CER)
- eCTD submissions
- CMC (Chemistry, Manufacturing, Controls)

You provide:
1. Clear, actionable regulatory guidance
2. Risk assessments and gap analyses
3. Document review and improvement suggestions
4. Submission strategy recommendations
5. Timeline and milestone planning

Always cite relevant FDA guidance documents, ISO standards, or regulations when applicable. Be precise, professional, and thorough in your responses. If you're unsure about something, say so and suggest where the user might find authoritative information.

Format your responses with clear structure using:
- Headers for main sections
- Bullet points for lists
- **Bold** for key terms
- Code blocks for regulatory references`;

/**
 * Intelligent demo response generator for when OpenAI is unavailable
 */
function generateDemoResponse(message: string): string {
  const lowerMessage = message.toLowerCase();

  // 510(k) related queries
  if (lowerMessage.includes('510(k)') || lowerMessage.includes('510k')) {
    return `## FDA 510(k) Premarket Notification Requirements

A 510(k) submission requires demonstrating **substantial equivalence** to a legally marketed predicate device. Here are the key requirements:

### Essential Components

1. **Device Description**
   - Intended use and indications for use
   - Technological characteristics
   - Operating principles and specifications

2. **Predicate Device Comparison**
   - Identify predicate device(s) with 510(k) number
   - Side-by-side comparison table
   - Technological and performance equivalence

3. **Performance Testing**
   - Bench testing data
   - Biocompatibility (if applicable per ISO 10993)
   - Electrical safety (IEC 60601-1 for powered devices)
   - Software documentation (IEC 62304 for devices with software)

4. **Labeling**
   - Package labeling
   - Instructions for Use (IFU)
   - User manual

### Regulatory References
- **21 CFR Part 807 Subpart E** - Premarket Notification Procedures
- **FDA Guidance**: "The 510(k) Program: Evaluating Substantial Equivalence"
- **FDA Guidance**: "Refuse to Accept Policy for 510(k)s"

### Timeline
Typical FDA review: **90-180 days** (Traditional 510(k))

Would you like me to elaborate on any specific aspect of the 510(k) process?`;
  }

  // IND related queries
  if (lowerMessage.includes('ind') || lowerMessage.includes('investigational new drug')) {
    return `## IND (Investigational New Drug) Application Overview

An IND application enables a sponsor to begin clinical trials in humans for a new drug. Here's the essential structure:

### IND Components (21 CFR 312.23)

1. **Form FDA 1571** - Cover sheet
2. **Table of Contents**
3. **Introductory Statement**
4. **General Investigational Plan**
5. **Investigator's Brochure (IB)**
6. **Protocols**
   - Phase 1, 2, or 3 protocol(s)
   - Informed consent forms
7. **Chemistry, Manufacturing, and Controls (CMC)**
   - Drug substance
   - Drug product
   - Placebo (if applicable)
8. **Pharmacology and Toxicology**
   - Nonclinical studies
   - ADME studies
9. **Previous Human Experience**
10. **Additional Information**

### Key Regulatory References
- **21 CFR Part 312** - Investigational New Drug Application
- **ICH M4** - Common Technical Document (CTD) format
- **ICH E6(R2)** - Good Clinical Practice

### Timeline
- FDA has **30 days** to review and place on hold if concerns exist
- No response = "safe to proceed"

Would you like details on any specific IND section?`;
  }

  // CER related queries
  if (lowerMessage.includes('cer') || lowerMessage.includes('clinical evaluation')) {
    return `## Clinical Evaluation Report (CER) Requirements

A CER demonstrates clinical safety and performance of medical devices under **EU MDR 2017/745** and **IVDR 2017/746**.

### CER Structure (MEDDEV 2.7/1 Rev 4)

1. **Scope**
   - Device description and specifications
   - Intended purpose and target population

2. **Clinical Background**
   - Current knowledge and standards
   - State of the art for indication

3. **Literature Search Protocol**
   - Databases searched (PubMed, Embase, Cochrane)
   - Search strings and date ranges
   - Selection criteria

4. **Clinical Data Analysis**
   - Appraisal methodology
   - Data extraction tables
   - Equivalence demonstration (if applicable)

5. **Clinical Evidence Summary**
   - Benefit-risk analysis
   - Gap analysis
   - Residual risks

6. **Conclusions**
   - Conformity with GSPRs
   - Post-market surveillance needs

### Key Standards
- **MEDDEV 2.7/1 Rev 4** - Clinical Evaluation Guidelines
- **EU MDR Annex XIV** - Clinical Evaluation Requirements
- **ISO 14155** - Clinical Investigation of Medical Devices

Would you like me to explain any section in more detail?`;
  }

  // Compliance queries
  if (
    lowerMessage.includes('compliance') ||
    lowerMessage.includes('21 cfr') ||
    lowerMessage.includes('part 11')
  ) {
    return `## 21 CFR Part 11 Compliance Requirements

Part 11 establishes requirements for electronic records and electronic signatures in FDA-regulated industries.

### Core Requirements

**1. Electronic Records**
- System validation
- Audit trails (date, time, operator ID)
- Record retention and retrieval
- Limited system access
- Operational checks

**2. Electronic Signatures**
- Unique user identification
- Signature manifestation (name, date/time, meaning)
- Signature linking to records
- Non-repudiation controls

**3. Closed vs Open Systems**
- **Closed**: Additional controls for access
- **Open**: Encryption and digital signatures required

### Key Controls
| Control | Requirement |
|---------|-------------|
| Access | Role-based permissions |
| Audit Trail | Immutable, timestamped |
| Passwords | Unique, periodically updated |
| Training | Documented training records |

### FDA Guidance
- **Scope and Application** (2003 Guidance)
- **Data Integrity and Compliance** (2018)

Would you like specific guidance on implementing any of these controls?`;
  }

  // Default comprehensive response
  return `## Lumen Cortex Regulatory Intelligence

Thank you for your query. I'm Lumen Cortex, your AI-powered regulatory affairs assistant. I can help with:

### My Capabilities

**🏥 Medical Devices**
- FDA 510(k) submissions
- De Novo classification requests
- PMA applications
- EU MDR compliance & CER preparation

**💊 Pharmaceuticals**
- IND applications
- NDA/ANDA submissions
- CMC documentation
- Clinical trial design

**📋 Compliance**
- 21 CFR Part 11 (electronic records)
- GxP requirements (GMP, GLP, GCP)
- ISO 13485 quality management
- Risk management (ISO 14971)

**📄 Documentation**
- eCTD structure and formatting
- Regulatory strategy development
- Gap analysis and remediation
- Submission timeline planning

### How I Can Help

1. **Ask specific questions** about regulatory requirements
2. **Request document reviews** for compliance gaps
3. **Get submission checklists** for your product type
4. **Explore predicate devices** for 510(k) submissions
5. **Understand timelines** for different submission pathways

What regulatory challenge can I help you with today?`;
}

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

/**
 * POST /api/chat/send-message
 * Main chat endpoint — 9-step provenance-tracked RAG pipeline.
 *
 * Steps: RESOLVE_ORG → THREAD → USER_MSG → RETRIEVE → PROMPT → GENERATE → PERSIST → CLAIMS → CITATIONS
 */
router.post('/send-message', async (req: Request, res: Response) => {
  try {
    const { message, thread_id, file_id, system_prompt, project_id } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required',
        code: 'INVALID_MESSAGE',
      });
    }

    // ── STEP 1: RESOLVE ORG (from session only — no header fallback for org) ──
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const userId = (req as any).userId || (req as any).user?.id || 'anonymous';
    const numericOrgId = orgId ? (typeof orgId === 'string' ? Number(orgId) : orgId) : null;

    // ── STEP 2: CREATE / VALIDATE THREAD ─────────────────────────────────────────
    const threadId = await getOrCreateThread(thread_id, (req as any).user?.id);

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
        console.warn('[Lumen Cortex] ai_threads table missing — provenance disabled');
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
      } catch (e: any) {
        if (e?.code !== '42P01')
          console.warn('[Lumen Cortex] ai_messages insert failed:', e.message);
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
        console.warn('[Lumen Cortex] Invalid org UUID, skipping retrieval');
      } else {
        const searchResults = await embeddingService.searchHybrid(message, 5, 0.7, orgUuid);
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
            const snapshotData = sources.map((s, i) => ({
              rank: i + 1,
              atomId: s.id,
              score: s.score,
            }));
            snapshotHashSha256 = sha256(stableStringify(snapshotData));

            const rrResult = await pool.query(
              `INSERT INTO ai_retrieval_runs
                 (organization_id, project_id, user_id, scope, embedding_model,
                  query_text, query_hash_sha256, snapshot_hash_sha256, top_k, threshold, result_count)
               VALUES ($1, $2, $3, $4, 'text-embedding-3-small', $5, $6, $7, 5, 0.7, $8)
               RETURNING id`,
              [
                numericOrgId,
                project_id || null,
                userId,
                orgUuid ? 'org' : 'global',
                message,
                queryHash,
                snapshotHashSha256,
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
            if (e?.code !== '42P01')
              console.warn('[Lumen Cortex] Retrieval persist failed:', e.message);
          }
        }
      }
    } catch (srcErr: any) {
      // Non-fatal — chat still works, just without grounded evidence
      console.warn('[Lumen Cortex] Source retrieval failed:', srcErr.message);
    }

    // ── STEP 5: BUILD EVIDENCE-GROUNDED PROMPT ─────────────────────────
    // If we have retrieved evidence, inject it into the system prompt so
    // the model can ground its answer and cite by [SRC-n] reference.
    let evidenceBlock = '';
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
        error: 'No AI providers available. Configure OPENAI_API_KEY or another provider.',
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    try {
      const systemPrompt = (system_prompt || REGULATORY_SYSTEM_PROMPT) + evidenceBlock;

      const gwMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...previousMessages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: message },
      ];

      console.log(
        `[Lumen Cortex] Sending through AI Gateway (${sources.length} sources retrieved)...`
      );

      const gwResponse: GatewayResponse = await gw.route({
        taskType: 'chat',
        messages: gwMessages,
        temperature: 0.7,
        maxTokens: 2000,
        callerModule: 'lumen-cortex-chat',
        organizationId: numericOrgId ?? undefined,
        userId,
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
        `[Lumen Cortex] AI Gateway response via ${model} (${latencyMs}ms, req=${gwResponse.requestId})`
      );
    } catch (gwError: any) {
      console.error('[Lumen Cortex] AI Gateway call failed:', gwError.message);
      return res.status(503).json({
        error: 'AI provider call failed',
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: gwError.message,
      });
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
        if (e?.code !== '42P01')
          console.warn('[Lumen Cortex] Generation persist failed:', e.message);
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
    }
    const claims: ClaimResponse[] = [];

    // ── STEP 9: CITATION LINKAGE (per-claim) ──────────────────────────
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

      // Status: SUPPORTED (≥1 citation), WEAK (0 but sources exist), UNSUPPORTED (no sources)
      const status: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED' =
        claimRefs.size > 0 ? 'SUPPORTED' : sources.length > 0 ? 'WEAK' : 'UNSUPPORTED';

      let claimId: string | null = null;
      const citationLinks: ClaimResponse['citations'] = [];

      if (numericOrgId && generationRunId) {
        try {
          const claimResult = await pool.query(
            `INSERT INTO ai_claims
               (generation_run_id, claim_index, claim_text, claim_hash_sha256, confidence, status)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [
              generationRunId,
              ci,
              claimText,
              claimHash,
              claimRefs.size > 0 ? confidence : null,
              status,
            ]
          );
          claimId = claimResult.rows[0].id;

          // Persist citation linkages
          for (const refIdx of claimRefs) {
            const chunk = chunkRows[refIdx];
            if (chunk) {
              await pool.query(
                `INSERT INTO ai_claim_citations (claim_id, retrieval_chunk_id, relevance_score)
                 VALUES ($1, $2, $3)`,
                [claimId, chunk.id, chunk.score]
              );
              citationLinks.push({
                chunkId: chunk.id,
                sourceId: chunk.atomId,
                title: sources[refIdx]?.title || '',
                score: chunk.score,
              });
            }
          }
        } catch (e: any) {
          if (e?.code !== '42P01') console.warn('[Lumen Cortex] Claim persist failed:', e.message);
        }
      }

      claims.push({ claimId, claimIndex: ci, claimText, status, citations: citationLinks });
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
      title: s.title,
      snippet: s.content,
      relevanceScore: s.score,
      cited: citedRefs.has(i),
    }));

    // ── RESPONSE (backward compat + provenance chain) ──────────────────
    res.json({
      answer: assistantMessage,
      thread_id: threadId,
      usage,
      model,
      sources,
      citations,
      confidence,
      retrievalMeta: {
        retrievedCount: sources.length,
        citedCount: citedRefs.size,
        orgScoped: !!orgUuid,
      },
      // Provenance chain
      retrievalRunId,
      snapshotHashSha256,
      generationRunId,
      claims,
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Chat error:', error);

    res.status(500).json({
      error: 'Failed to process message',
      code: 'CHAT_ERROR',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/chat/upload
 * Handle file uploads — stores metadata in file_uploads table
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fileName = (req as any).file?.originalname || req.body?.fileName || 'uploaded_file';
    const mimeType =
      (req as any).file?.mimetype || req.body?.mimeType || 'application/octet-stream';
    const fileSize = (req as any).file?.size || req.body?.fileSize || 0;

    // Store in uploads directory
    const storagePath = `uploads/${fileId}`;

    // Save metadata to DB
    await pool.query(
      `INSERT INTO file_uploads (id, user_id, original_name, mime_type, file_size, storage_path, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', NOW())`,
      [fileId, (req as any).user?.id || null, fileName, mimeType, fileSize, storagePath]
    );

    res.json({
      fileId,
      message: 'File uploaded successfully',
      status: 'ready',
      fileName,
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      message: error.message,
    });
  }
});

/**
 * GET /api/chat/thread/:threadId
 * Retrieve conversation history from database
 */
router.get('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const threadResult = await pool.query('SELECT id, created_at FROM chat_threads WHERE id = $1', [
      threadId,
    ]);

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
    console.error('[Lumen Cortex] Thread retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve thread',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/chat/thread/:threadId
 * Delete a conversation thread from database
 */
router.delete('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const result = await pool.query('DELETE FROM chat_threads WHERE id = $1', [threadId]);
    const deleted = (result.rowCount || 0) > 0;

    res.json({
      success: deleted,
      message: deleted ? 'Thread deleted' : 'Thread not found',
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Thread deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete thread',
      message: error.message,
    });
  }
});

/**
 * GET /api/chat/health
 * Health check for chat service
 */
router.get('/health', async (req: Request, res: Response) => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  let threadCount = 0;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM chat_threads');
    threadCount = result.rows[0]?.count || 0;
  } catch (e) {
    /* ignore */
  }

  res.json({
    status: hasApiKey ? 'healthy' : 'degraded',
    service: 'Lumen Cortex Chat',
    openai_configured: hasApiKey,
    active_threads: threadCount,
    persistence: 'postgresql',
    timestamp: new Date().toISOString(),
  });
});

export default router;
