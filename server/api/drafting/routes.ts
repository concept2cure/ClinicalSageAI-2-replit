/**
 * Defensible Drafting Service - Chain of Verification AI Generation
 *
 * GxP-compliant AI drafting service that:
 * 1. Uses Hybrid Search (Vector + Entity) for context retrieval
 * 2. Prioritizes TABLE atoms for data-driven queries
 * 3. Returns reasoning_trace for audit logging (21 CFR Part 11)
 * 4. Generates citations with confidence scores
 *
 * This is the "Cognitive Fabric" that transforms raw evidence into
 * defensible regulatory content.
 */
import { Router, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getRequestDbClient, type RequestDbClient } from '../../middleware/tenantContext';
import { ai } from '../../lib/unified-ai-client';

// Types
interface DraftingRequest {
  prompt: string;
  promptType:
    | 'section_draft'
    | 'table_summary'
    | 'safety_analysis'
    | 'efficacy_summary'
    | 'pk_analysis'
    | 'clinical_overview'
    | 'nonclinical_summary'
    | 'cmc_summary'
    | 'regulatory_response'
    | 'label_update'
    | 'custom';
  documentId?: string;
  programId?: string;
  projectId?: string;
  entityFilters?: {
    STUDY_ID?: string;
    DRUG_NAME?: string;
    PROTOCOL_NUMBER?: string;
  };
  options?: {
    prioritizeTables?: boolean;
    maxChunks?: number;
    temperature?: number;
    includeReasoning?: boolean;
  };
}

interface Citation {
  sourceId: string;
  documentTitle?: string;
  page: number;
  contentType: string;
  confidence: number;
  excerpt: string;
}

interface DraftingResponse {
  sessionId: string;
  draftText: string;
  reasoningTrace: string;
  citations: Citation[];
  metadata: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    generationTimeMs: number;
    chunksUsed: number;
    tablesReferenced: number;
    confidenceScore: number;
  };
}

interface SearchResult {
  chunk_id: string;
  document_id: string;
  content_type: string;
  chunk_text: string;
  structured_content: any;
  page_number: number;
  vector_score: number;
  entity_score: number;
  combined_score: number;
  matched_entities: any[];
}

// Configuration
const CONFIG = {
  model: 'gpt-4o',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  maxChunks: 15,
  defaultTemperature: 0.3,
  tableBoost: 1.5,
};

type Queryable = Pool | RequestDbClient;

// OpenAI client
// GxP-Hardened System Prompt
const SYSTEM_PROMPT = `You are a Senior Regulatory Scientist with expertise in FDA submissions, ICH guidelines, and clinical regulatory writing.

CRITICAL INSTRUCTIONS:
1. You have access to Evidence Atoms extracted from clinical documents.
2. Atoms marked as [TABLE] contain structured clinical data - PRIORITIZE these for numerical claims.
3. Atoms marked as [FIGURE] contain visual data descriptions.
4. Atoms marked as [TEXT] contain narrative content.

OUTPUT FORMAT (JSON):
You MUST return a valid JSON object with these exact fields:
{
  "draft_text": "Your regulatory-grade content here. Use precise language. Cite sources as [Source X].",
  "reasoning_trace": "Brief explanation of WHY you selected specific data points. What evidence supports each claim?",
  "citations": [
    {
      "sourceId": "chunk_id from the evidence",
      "page": page_number,
      "confidence": 0.0-1.0,
      "excerpt": "The specific text or data you're citing"
    }
  ]
}

RULES:
- NEVER fabricate data. If evidence is insufficient, state this clearly.
- Prefer TABLE data over TEXT for numerical claims (patient counts, p-values, confidence intervals).
- Every quantitative claim MUST have a citation.
- Use hedging language ("may", "suggests") when evidence confidence is below 0.7.
- Flag any inconsistencies between sources.`;

/**
 * Generate embedding for query
 */
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: CONFIG.embeddingModel,
    input: text.slice(0, 8000),
    dimensions: CONFIG.embeddingDimensions,
  });
  return response.data[0].embedding;
}

/**
 * Perform hybrid search combining vector similarity and entity matching
 */
async function hybridSearch(
  queryEmbedding: number[],
  db: Queryable,
  options: {
    documentId?: string;
    entityFilters?: Record<string, string>;
    prioritizeTables?: boolean;
    limit?: number;
  }
): Promise<SearchResult[]> {
  const { documentId, entityFilters, prioritizeTables, limit = CONFIG.maxChunks } = options;

  if (prioritizeTables) {
    // Use table-priority search
    const result = await db.query(`SELECT * FROM vault.table_priority_search($1, $2, $3, $4)`, [
      JSON.stringify(queryEmbedding),
      documentId || null,
      limit,
      CONFIG.tableBoost,
    ]);
    return result.rows.map(row => ({
      ...row,
      vector_score: row.similarity_score,
      entity_score: 0,
      combined_score: row.boosted_score,
      matched_entities: [],
    }));
  }

  // Use full hybrid search
  const result = await db.query(`SELECT * FROM vault.hybrid_search($1, $2, $3, $4, $5)`, [
    JSON.stringify(queryEmbedding),
    entityFilters ? JSON.stringify(entityFilters) : null,
    documentId || null,
    ['TEXT', 'TABLE', 'FIGURE'],
    limit,
  ]);
  return result.rows;
}

/**
 * Format evidence for the AI prompt
 */
function formatEvidenceForPrompt(chunks: SearchResult[]): string {
  return chunks
    .map((chunk, i) => {
      const typeTag = `[${chunk.content_type || 'TEXT'}]`;
      const score = chunk.combined_score?.toFixed(2) || chunk.vector_score?.toFixed(2) || '0.00';

      let content = chunk.chunk_text;

      // For tables, include structured content if available
      if (chunk.content_type === 'TABLE' && chunk.structured_content) {
        try {
          const structured =
            typeof chunk.structured_content === 'string'
              ? JSON.parse(chunk.structured_content)
              : chunk.structured_content;
          if (structured.markdown) {
            content = structured.markdown;
          }
        } catch (e) {
          // Use raw text
        }
      }

      return `--- Evidence Atom ${i + 1} ${typeTag} (Score: ${score}, Page: ${chunk.page_number || 'N/A'}) ---
Source ID: ${chunk.chunk_id}
${content}
---`;
    })
    .join('\n\n');
}

/**
 * Parse AI response into structured format
 */
function parseAIResponse(content: string): {
  draftText: string;
  reasoningTrace: string;
  citations: Citation[];
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        draftText: parsed.draft_text || parsed.draftText || '',
        reasoningTrace: parsed.reasoning_trace || parsed.reasoningTrace || '',
        citations: (parsed.citations || []).map((c: any) => ({
          sourceId: c.sourceId || c.source_id || '',
          page: c.page || 0,
          confidence: c.confidence || 0.5,
          excerpt: c.excerpt || '',
        })),
      };
    }
  } catch (e) {
    console.warn('[Drafting] Failed to parse JSON response, using raw text');
  }

  // Fallback: return raw content
  return {
    draftText: content,
    reasoningTrace: 'Response was not in structured JSON format.',
    citations: [],
  };
}

/**
 * Log drafting session for audit trail
 */
async function logDraftingSession(
  db: Queryable,
  sessionId: string,
  request: DraftingRequest,
  response: DraftingResponse,
  chunkIds: string[],
  userId?: string
): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO vault.drafting_sessions (
        id, program_id, project_id, user_id,
        prompt_text, prompt_type, context_chunks,
        draft_text, reasoning_trace, citations,
        model_used, temperature, token_count_prompt, token_count_completion,
        generation_time_ms, citation_count, table_references, confidence_score,
        status, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        'completed', NOW()
      )
    `,
      [
        sessionId,
        request.programId || null,
        request.projectId || null,
        userId || null,
        request.prompt,
        request.promptType,
        chunkIds,
        response.draftText,
        response.reasoningTrace,
        JSON.stringify(response.citations),
        response.metadata.model,
        request.options?.temperature || CONFIG.defaultTemperature,
        response.metadata.promptTokens,
        response.metadata.completionTokens,
        response.metadata.generationTimeMs,
        response.citations.length,
        response.metadata.tablesReferenced,
        response.metadata.confidenceScore,
      ]
    );
  } catch (error) {
    console.error('[Drafting] Failed to log session:', error);
    // Don't throw - logging failure shouldn't break the response
  }
}

// Express Router
const router = Router();

/**
 * POST /api/gcc/drafting/generate
 * Generate regulatory content with Chain of Verification
 */
router.post('/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const sessionId = uuidv4();

  try {
    const dbClient = getRequestDbClient(req);
    const request: DraftingRequest = req.body;

    if (!request.prompt || !request.promptType) {
      return res.status(400).json({
        error: 'Missing required fields: prompt, promptType',
      });
    }

    console.log(`[Drafting] Session ${sessionId}: ${request.promptType}`);

    // Step 1: Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(request.prompt);

    // Step 2: Hybrid search for relevant evidence
    const searchResults = await hybridSearch(queryEmbedding, dbClient, {
      documentId: request.documentId,
      entityFilters: request.entityFilters,
      prioritizeTables:
        request.options?.prioritizeTables ??
        ['table_summary', 'pk_analysis', 'safety_analysis'].includes(request.promptType),
      limit: request.options?.maxChunks || CONFIG.maxChunks,
    });

    if (searchResults.length === 0) {
      return res.status(404).json({
        error: 'No relevant evidence found for this query',
        sessionId,
      });
    }

    // Step 3: Format evidence for prompt
    const evidenceText = formatEvidenceForPrompt(searchResults);
    const tableCount = searchResults.filter(r => r.content_type === 'TABLE').length;

    // Step 4: Generate draft with AI
    const userPrompt = `TASK: ${request.promptType.replace(/_/g, ' ').toUpperCase()}

USER REQUEST:
${request.prompt}

EVIDENCE ATOMS:
${evidenceText}

Generate a regulatory-grade response using the evidence above. Remember to output valid JSON with draft_text, reasoning_trace, and citations.`;

    const aiResult = await ai.chat({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: request.options?.temperature || CONFIG.defaultTemperature,
      max_tokens: 4000,
    });

    const aiContent = aiResult.content || '';
    const parsed = parseAIResponse(aiContent);

    // Step 5: Enrich citations with document info
    const enrichedCitations: Citation[] = parsed.citations.map(c => {
      const matchingChunk = searchResults.find(r => r.chunk_id === c.sourceId);
      return {
        ...c,
        documentTitle: matchingChunk?.document_id
          ? `Document ${matchingChunk.document_id}`
          : undefined,
        contentType: matchingChunk?.content_type || 'TEXT',
        page: c.page || matchingChunk?.page_number || 0,
      };
    });

    // Step 6: Calculate confidence score
    const avgVectorScore =
      searchResults.reduce((sum, r) => sum + (r.vector_score || 0), 0) / searchResults.length;
    const citationCoverage = enrichedCitations.length / Math.max(1, searchResults.length);
    const confidenceScore = Math.min(1, avgVectorScore * 0.6 + citationCoverage * 0.4);

    // Step 7: Build response
    const response: DraftingResponse = {
      sessionId,
      draftText: parsed.draftText,
      reasoningTrace: parsed.reasoningTrace,
      citations: enrichedCitations,
      metadata: {
        model: CONFIG.model,
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        generationTimeMs: Date.now() - startTime,
        chunksUsed: searchResults.length,
        tablesReferenced: tableCount,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
      },
    };

    // Step 8: Log for audit trail (async, don't block response)
    const chunkIds = searchResults.map(r => r.chunk_id);
    logDraftingSession(dbClient, sessionId, request, response, chunkIds, req.body.userId);

    console.log(
      `[Drafting] Session ${sessionId} complete: ${response.metadata.generationTimeMs}ms, ${enrichedCitations.length} citations`
    );

    return res.json(response);
  } catch (error: any) {
    console.error(`[Drafting] Session ${sessionId} failed:`, error.message);
    return res.status(500).json({
      error: 'Drafting generation failed',
      message: error.message,
      sessionId,
    });
  }
});

/**
 * GET /api/gcc/drafting/sessions
 * List drafting sessions for audit review
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { programId, limit = 50, offset = 0 } = req.query;
    const dbClient = getRequestDbClient(req);

    const result = await dbClient.query(
      `
      SELECT
        id, program_id, project_id, user_id,
        prompt_type,
        LEFT(prompt_text, 200) as prompt_preview,
        LEFT(draft_text, 500) as draft_preview,
        citation_count, table_references, confidence_score,
        model_used, generation_time_ms,
        status, created_at
      FROM vault.drafting_sessions
      WHERE ($1::UUID IS NULL OR program_id = $1)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [programId || null, limit, offset]
    );

    return res.json({
      sessions: result.rows,
      count: result.rowCount,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/gcc/drafting/sessions/:id
 * Get full drafting session details
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbClient = getRequestDbClient(req);

    const result = await dbClient.query(
      `
      SELECT * FROM vault.drafting_sessions WHERE id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ session: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gcc/drafting/extract-entities
 * Extract entities from text for hybrid search
 */
router.post('/extract-entities', async (req: Request, res: Response) => {
  try {
    const { text, chunkId } = req.body;
    const dbClient = getRequestDbClient(req);

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Use AI to extract entities
    const extraction = await ai.chat({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract clinical/regulatory entities from the text. Return JSON array:
[{"type": "STUDY_ID|DRUG_NAME|PATIENT_COUNT|P_VALUE|ADVERSE_EVENT|...", "value": "...", "confidence": 0.0-1.0}]
Only extract entities you're confident about.`,
        },
        { role: 'user', content: text.slice(0, 4000) },
      ],
      temperature: 0,
      max_tokens: 1000,
    });

    const content = extraction.choices[0]?.message?.content || '[]';
    let entities = [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        entities = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[Drafting] Entity extraction parse failed');
    }

    // Store entities if chunkId provided
    if (chunkId && entities.length > 0) {
      for (const entity of entities) {
        await dbClient.query(
          `
          INSERT INTO vault.extracted_entities (
            chunk_id, entity_type, entity_value, entity_normalized, confidence
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `,
          [
            chunkId,
            entity.type,
            entity.value,
            entity.value.toLowerCase().replace(/[^a-z0-9]/g, ''),
            entity.confidence || 0.8,
          ]
        );
      }
    }

    return res.json({ entities, stored: chunkId ? entities.length : 0 });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/gcc/drafting/stats
 * Get drafting service statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const result = await dbClient.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT program_id) as programs_served,
        AVG(generation_time_ms)::INT as avg_generation_time_ms,
        AVG(citation_count)::NUMERIC(4,1) as avg_citations,
        AVG(table_references)::NUMERIC(4,1) as avg_table_refs,
        AVG(confidence_score)::NUMERIC(3,2) as avg_confidence,
        SUM(token_count_prompt + token_count_completion) as total_tokens,
        COUNT(*) FILTER (WHERE prompt_type = 'table_summary') as table_summaries,
        COUNT(*) FILTER (WHERE prompt_type = 'safety_analysis') as safety_analyses,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM vault.drafting_sessions
    `);

    const entityResult = await dbClient.query(`
      SELECT entity_type, COUNT(*) as count
      FROM vault.extracted_entities
      GROUP BY entity_type
      ORDER BY count DESC
    `);

    return res.json({
      stats: result.rows[0],
      entityDistribution: entityResult.rows,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
