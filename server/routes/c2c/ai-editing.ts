/**
 * AI editing for Concept2Cure artifacts — the section editor with source
 * traceability, template generation, autocomplete, compliance scan, citation
 * search, batch edit, reference validation, inconsistency check and
 * metadata extraction. The seventh domain carved out of
 * routes/concept2cure.ts (ledger L53, slice 9), mounted at the same prefix
 * ahead of it with the same middleware chain; the handlers moved verbatim
 * with the helpers only they use, and their dynamic service imports
 * re-pointed one directory up.
 *
 * @module server/routes/c2c/ai-editing
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import * as crypto from 'crypto';
import { db, pool } from '../../db';
import { concept2cureArtifacts } from '../../../shared/schema';
import { interceptComplianceScan } from '../../services/intelligence/rim-interceptors.js';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  sendError,
  sendSuccess,
} from './shared';

const logger = createScopedLogger('concept2cure-ai-editing');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);


const aiEditSchema = z
  .object({
    action: z.enum(['rewrite', 'expand', 'summarize', 'regulatory-tone', 'add-references']),
    text: z.string().min(1).max(50000),
    sectionTitle: z.string().optional(),
    submissionType: z.string().optional(),
    context: z.string().optional(),
    projectId: z.union([z.string(), z.number()]).optional(),
    artifactId: z.union([z.string(), z.number()]).optional(),
    contextAttachment: z.enum(['project', 'adhoc']).optional(),
    ctdSection: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.projectId && value.contextAttachment !== 'adhoc') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextAttachment'],
        message: 'contextAttachment must be "adhoc" when projectId is not provided',
      });
    }
    if (value.contextAttachment === 'project' && !value.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'projectId is required when contextAttachment is "project"',
      });
    }
  });

// ── Source traceability helpers for ai/edit-section ──────────────────────────

/** SHA-256 hash helper */
function aiEditSha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Split AI-generated text into sentences for claim analysis */
function splitSentences(text: string): string[] {
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Corp|vs|etc|al|Fig|Sec|Vol|No)\./gi, '$1\u2024')
    .replace(/\b(\d+)\./g, '$1\u2024');
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u2024/g, '.').trim())
    .filter(s => s.length > 20);
}

/** Patterns indicating verifiable claims needing source attribution */
const CLAIM_PATTERNS_EDIT = [
  /\b\d+(\.\d+)?%\s+(of\s+)?(patients?|subjects?|participants?)/i,
  /\bp[\s<>=]+0?\.\d+/i,
  /\b(hazard ratio|odds ratio|relative risk|confidence interval|CI)\b/i,
  /\b(statistically significant|clinically significant)\b/i,
  /\b(study|trial|investigation)\s+(showed?|demonstrated?|found|indicated)\b/i,
  /\b(phase\s+[I1-4]{1,3})\b/i,
  /\bNCT\d{8}\b/i,
  /\b(FDA|EMA|ICH|21\s*CFR)\b/i,
  /\b(guidance|guideline|regulation)\s+(states?|requires?|recommends?)\b/i,
  /\b(et\s+al\.?|published|peer-reviewed|meta-analysis|systematic review)\b/i,
  /\b(adverse events?|AE|SAE)\b/i,
  /\b(efficacy|safety|bioequivalence|pharmacokinetic)\b/i,
  /\b(primary endpoint|secondary endpoint|outcome measure)\b/i,
];

/**
 * POST /api/concept2cure/ai/edit-section
 * AI-powered section editing with sentence-level source traceability.
 *
 * When projectId is provided, retrieves Data Room evidence via pgvector
 * hybrid search, injects it as an evidence block, and persists the full
 * provenance chain: retrieval_run → retrieval_chunks → claims → citations.
 */
router.post('/ai/edit-section', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const rawData = aiEditSchema.parse(req.body);
    const data = {
      ...rawData,
      contextAttachment:
        rawData.contextAttachment ||
        (rawData.projectId ? ('project' as const) : ('adhoc' as const)),
    };

    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    // ── STEP 1: RETRIEVE Data Room evidence (org-scoped pgvector) ─────────
    const RETRIEVAL_TOP_K = 5;
    const RETRIEVAL_THRESHOLD = 0.65;
    let sources: Array<{ id: string; title: string; content: string; score: number }> = [];
    let retrievalRunId: string | null = null;
    const chunkRows: Array<{ id: string; rank: number; atomId: string; score: number }> = [];
    let evidenceBlock = '';

    if (data.projectId) {
      try {
        const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
        const embeddingService = getEmbeddingService(pool);
        const orgUuid =
          (req as any).tenantContext?.organizationUuid ||
          (req.headers['x-org-uuid'] as string | undefined);

        // Build search query from section title + first 200 chars of content
        const searchQuery = [
          data.sectionTitle || '',
          data.ctdSection ? `CTD section ${data.ctdSection}` : '',
          data.text.substring(0, 200),
        ]
          .filter(Boolean)
          .join(' ');

        const searchResults = await embeddingService.searchHybrid(
          searchQuery,
          RETRIEVAL_TOP_K,
          RETRIEVAL_THRESHOLD,
          orgUuid
        );
        sources = searchResults.map((r: any) => ({
          id: r.id,
          title: r.title,
          content: r.content.length > 600 ? r.content.substring(0, 600) + '…' : r.content,
          score: r.score,
        }));

        // Persist retrieval run + chunks for provenance chain
        if (sources.length > 0) {
          try {
            const queryHash = aiEditSha256(searchQuery);
            const snapshotData = sources.map((s, i) => ({
              rank: i + 1,
              sourceType: 'atom' as const,
              sourceRefId: s.id,
              score: s.score,
            }));
            const snapshotHash = aiEditSha256(JSON.stringify(snapshotData));

            const rrResult = await pool.query(
              `INSERT INTO ai_retrieval_runs
                 (organization_id, project_id, user_id, scope, embedding_model,
                  query_text, query_hash_sha256, snapshot_hash_sha256, top_k, threshold, result_count)
               VALUES ($1, $2, $3, 'org', 'text-embedding-3-small', $4, $5, $6, $7, $8, $9)
               RETURNING id`,
              [
                organizationId,
                data.projectId,
                userId,
                searchQuery,
                queryHash,
                snapshotHash,
                RETRIEVAL_TOP_K,
                RETRIEVAL_THRESHOLD,
                sources.length,
              ]
            );
            retrievalRunId = rrResult.rows[0].id;

            for (let i = 0; i < sources.length; i++) {
              const s = sources[i];
              const excerptHash = aiEditSha256(s.content);
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
            if (e?.code !== '42P01') logger.warn('Retrieval persist failed', { error: e.message });
          }

          // Build evidence block for injection into prompt
          evidenceBlock =
            '\n\n--- RETRIEVED EVIDENCE (cite as [SRC-n]) ---\n' +
            sources.map((s, i) => `[SRC-${i + 1}] "${s.title}"\n${s.content}`).join('\n\n') +
            '\n--- END EVIDENCE ---\n\n' +
            'When your output relies on evidence above, cite it inline using [SRC-n]. ' +
            'If a claim is not supported by retrieved evidence, do NOT fabricate citations.';
        }
      } catch (srcErr: any) {
        logger.warn('Source retrieval failed (non-fatal)', { error: srcErr.message });
      }
    }

    // ── STEP 1.5: RIM INTELLIGENCE CONTEXT (non-blocking) ──────────────
    let rimBlock = '';
    if (data.projectId) {
      try {
        const { computeReadinessScore, generateRecommendations } = await import(
          '../../services/intelligence/index.js'
        );
        const projId = Number(data.projectId);
        const [readiness, recs] = await Promise.all([
          computeReadinessScore({ organizationId, projectId: projId }).catch(() => null),
          generateRecommendations({
            organizationId,
            projectId: projId,
            triggeredBy: 'ai_edit',
          }).catch(() => null),
        ]);

        const rimParts: string[] = [];

        if (readiness) {
          const dims = readiness.dimensions;
          rimParts.push(
            `Submission readiness: ${Math.round(readiness.overallScore)}% overall ` +
              `(completeness ${Math.round(dims.completeness)}%, quality ${Math.round(
                dims.quality
              )}%, ` +
              `consistency ${Math.round(dims.consistency)}%, compliance ${Math.round(
                dims.compliance
              )}%).`
          );
          if (readiness.gaps && readiness.gaps.length > 0) {
            const topGaps = readiness.gaps
              .filter((g: any) => g.severity === 'critical' || g.severity === 'high')
              .slice(0, 3);
            if (topGaps.length > 0) {
              rimParts.push(
                'Key gaps: ' +
                  topGaps.map((g: any) => `${g.description} (${g.severity})`).join('; ') +
                  '.'
              );
            }
          }
        }

        if (recs?.recommendations) {
          const activeRecs = recs.recommendations
            .filter(
              (r: any) =>
                r.status === 'active' && (r.severity === 'critical' || r.severity === 'high')
            )
            .slice(0, 3);
          if (activeRecs.length > 0) {
            rimParts.push(
              'Active recommendations: ' +
                activeRecs.map((r: any) => r.suggestedAction).join('; ') +
                '.'
            );
          }
        }

        if (rimParts.length > 0) {
          rimBlock =
            '\n\n--- REGULATORY INTELLIGENCE CONTEXT ---\n' +
            rimParts.join(' ') +
            '\nUse this intelligence to inform your writing. Address identified gaps where relevant. ' +
            'Strengthen areas flagged as weak. Do not mention these scores directly in the output.\n' +
            '--- END INTELLIGENCE ---\n';
        }
      } catch {
        /* Non-blocking — continue without RIM context */
      }
    }

    // ── STEP 2: BUILD PROMPT with evidence context ────────────────────────
    const actionPrompts: Record<string, string> = {
      rewrite:
        'Rewrite the following regulatory document section to improve clarity, precision, and readability while preserving all factual claims and regulatory language. Return only the rewritten text.',
      expand:
        'Expand the following regulatory document section with additional detail, supporting evidence references, and regulatory justifications. Maintain the same tone and structure. Return only the expanded text.',
      summarize:
        'Summarize the following regulatory document section into a concise executive summary suitable for a regulatory submission cover letter. Return only the summary.',
      'regulatory-tone':
        'Revise the following text to use formal regulatory submission language appropriate for FDA/EMA filings. Ensure passive voice where appropriate, precise quantitative language, and proper regulatory terminology. Return only the revised text.',
      'add-references':
        'Add inline reference placeholders (e.g., [REF-001], [REF-002]) to claims in the following text that would require supporting evidence in a regulatory submission. After the text, add a "References" section listing what type of evidence each reference should cite. Return the full annotated text.',
      'generate-table':
        'Analyze the following regulatory document text and generate a well-structured HTML table that organizes the key data, findings, or comparisons mentioned. The table should have a proper header row (<thead>) and data rows (<tbody>). Use regulatory-appropriate column headers. If the text contains numerical data, study results, or comparisons, organize them into the table. If the text is descriptive, create a summary table with appropriate categorization. Return ONLY the HTML table markup (no surrounding text).',
    };

    const systemPrompt = [
      'You are a senior regulatory medical writer with expertise in FDA and EMA submissions.',
      data.submissionType ? `This is for a ${data.submissionType} submission.` : '',
      data.sectionTitle ? `Section: "${data.sectionTitle}".` : '',
      data.ctdSection ? `CTD section: ${data.ctdSection}.` : '',
      data.context || '',
      evidenceBlock,
      rimBlock,
      actionPrompts[data.action],
    ]
      .filter(Boolean)
      .join(' ');

    // ── STEP 3: AI GENERATION ─────────────────────────────────────────────
    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: data.text },
      ],
      temperature: data.action === 'summarize' ? 0.3 : 0.4,
      maxTokens: 4000,
      callerModule: 'concept2cure/ai-edit-section',
    });

    const result = gwResponse.content || '';
    const latencyMs = Date.now() - startMs;

    // ── STEP 4: PERSIST GENERATION RUN (provenance chain) ─────────────────
    let generationRunId: string | null = null;
    if (retrievalRunId) {
      try {
        const answerHash = aiEditSha256(result);
        const genResult = await pool.query(
          `INSERT INTO ai_generation_runs
             (retrieval_run_id, model, provider, answer_hash_sha256,
              prompt_tokens, completion_tokens, total_tokens, latency_ms, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
           RETURNING id`,
          [
            retrievalRunId,
            gwResponse.model || 'unknown',
            gwResponse.provider || 'unknown',
            answerHash,
            gwResponse.usage?.inputTokens || 0,
            gwResponse.usage?.outputTokens || 0,
            gwResponse.usage?.totalTokens || 0,
            latencyMs,
          ]
        );
        generationRunId = genResult.rows[0].id;
      } catch (e: any) {
        if (e?.code !== '42P01') logger.warn('Generation run persist failed', { error: e.message });
      }
    }

    // ── STEP 5: CLAIM EXTRACTION + CITATION LINKAGE ───────────────────────
    interface SourceCitation {
      sentenceIndex: number;
      sentenceText: string;
      sourceRefs: Array<{ chunkId: string; sourceId: string; title: string; score: number }>;
      status: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';
    }
    const sourceCitationResults: SourceCitation[] = [];
    const pendingClaims: Array<{
      si: number;
      sentence: string;
      claimHash: string;
      bestScore: number | null;
      status: string;
      citLinks: SourceCitation['sourceRefs'];
    }> = [];

    if (sources.length > 0) {
      const sentences = splitSentences(result);
      for (let si = 0; si < sentences.length; si++) {
        const sentence = sentences[si];
        const isClaim = CLAIM_PATTERNS_EDIT.some(p => p.test(sentence));

        // Find [SRC-n] references in this sentence
        const refPattern = /\[SRC-(\d+)\]/g;
        const refs = new Set<number>();
        let m;
        while ((m = refPattern.exec(sentence)) !== null) {
          const idx = parseInt(m[1], 10) - 1;
          if (idx >= 0 && idx < sources.length) refs.add(idx);
        }

        if (isClaim || refs.size > 0) {
          const citLinks: SourceCitation['sourceRefs'] = [];
          for (const refIdx of refs) {
            const chunk = chunkRows[refIdx];
            if (chunk) {
              citLinks.push({
                chunkId: chunk.id,
                sourceId: chunk.atomId,
                title: sources[refIdx]?.title || '',
                score: chunk.score,
              });
            }
          }

          const status: SourceCitation['status'] =
            refs.size > 0 ? 'SUPPORTED' : isClaim ? 'UNSUPPORTED' : 'SUPPORTED';

          // Collect claim data for batch persist below
          if (generationRunId) {
            const claimHash = aiEditSha256(sentence);
            const bestScore = citLinks.length > 0 ? Math.max(...citLinks.map(c => c.score)) : null;
            pendingClaims.push({ si, sentence, claimHash, bestScore, status, citLinks });
          }

          sourceCitationResults.push({
            sentenceIndex: si,
            sentenceText: sentence.substring(0, 500),
            sourceRefs: citLinks,
            status,
          });
        }
      }
    }

    // ── STEP 5b: BATCH PERSIST claims + citation linkages ─────────────────
    if (generationRunId && pendingClaims.length > 0) {
      try {
        // Batch INSERT all claims in one query
        const claimValues: any[] = [];
        const claimPlaceholders: string[] = [];
        let pi = 1;
        for (const c of pendingClaims) {
          claimPlaceholders.push(
            `($${pi}, $${pi + 1}, $${pi + 2}, $${pi + 3}, $${pi + 4}, $${pi + 5})`
          );
          claimValues.push(generationRunId, c.si, c.sentence, c.claimHash, c.bestScore, c.status);
          pi += 6;
        }
        const claimResult = await pool.query(
          `INSERT INTO ai_claims
             (generation_run_id, claim_index, claim_text, claim_hash_sha256, confidence, status)
           VALUES ${claimPlaceholders.join(', ')} RETURNING id, claim_index`,
          claimValues
        );
        // Correlate returned ids by claim_index — RETURNING row order is not
        // guaranteed to match the VALUES order.
        const claimIdByIndex = new Map<number, string>(
          claimResult.rows.map((r: any) => [Number(r.claim_index), r.id])
        );

        // Batch INSERT all citation linkages in one query
        const citValues: any[] = [];
        const citPlaceholders: string[] = [];
        let ci = 1;
        for (let idx = 0; idx < pendingClaims.length; idx++) {
          const claimId = claimIdByIndex.get(pendingClaims[idx].si);
          if (!claimId) continue;
          for (const link of pendingClaims[idx].citLinks) {
            citPlaceholders.push(`($${ci}, $${ci + 1}, $${ci + 2})`);
            citValues.push(claimId, link.chunkId, link.score);
            ci += 3;
          }
        }
        if (citPlaceholders.length > 0) {
          await pool.query(
            `INSERT INTO ai_claim_citations (claim_id, retrieval_chunk_id, relevance_score)
             VALUES ${citPlaceholders.join(', ')}`,
            citValues
          );
        }
      } catch (e: any) {
        if (e?.code !== '42P01') logger.warn('Claim persist failed', { error: e.message });
      }
    }

    // ── STEP 6 (RETIRED): sentence-level source_citations persist ─────────
    // This block batch-inserted model-inferred sentence→chunk matches into
    // `source_citations` — a table with no DDL anywhere in the repo, so the
    // insert was swallowed by the 42P01 guard on every deployed database and
    // never persisted a row. It could not simply be given a schema: the ids
    // written here were concept2cure_artifacts ids, while the table's only
    // reader (the Source Tracer) joined them against documents.id — a different
    // serial sequence — so provisioning the table would have rendered one
    // document's sentences under another document's title.
    //
    // The claims themselves are not lost: STEP 5b above persists them (with
    // their chunk linkages and scores) to the ai-trace-chain tables, where they
    // are labelled as what they are — model-asserted support, not lineage. The
    // Source Tracer now reads RECORDED citations (authoring_citations via
    // source-usage.service), because inferred matches must never be presented
    // as locked source lineage.

    // Audit log
    await logAuditEntry(req, 'AI_EDIT', 'document_section', `ai-edit-${Date.now()}`, null, {
      action: data.action,
      sectionTitle: data.sectionTitle || null,
      inputLength: data.text.length,
      outputLength: result.length,
      model: gwResponse.model,
      sourcesRetrieved: sources.length,
      claimsExtracted: sourceCitationResults.length,
      latencyMs,
    });

    logger.info('AI edit completed with source traceability', {
      action: data.action,
      userId,
      sourcesRetrieved: sources.length,
      claimsExtracted: sourceCitationResults.length,
      latencyMs,
    });

    return sendSuccess(res, {
      result,
      action: data.action,
      provenance: {
        retrievalRunId,
        generationRunId,
        sourcesRetrieved: sources.length,
        sources: sources.map((s, i) => ({
          ref: `SRC-${i + 1}`,
          id: s.id,
          title: s.title,
          score: s.score,
        })),
        claims: sourceCitationResults,
        latencyMs,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('AI edit failed', { error: error.message });
    return sendError(res, 500, 'AI editing failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE PROMPT BLOCKS — AI templates with variable insertion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regulatory writing templates with variable slots.
 * Each template has:
 * - `id`: unique identifier
 * - `name`: display name
 * - `category`: grouping (ctd, csr, ind, regulatory, safety)
 * - `variables`: array of variable slots with name, label, placeholder, required flag
 * - `systemPrompt`: the AI prompt template with {{VARIABLE}} placeholders
 * - `outputGuidance`: instructions for output structure
 */
interface PromptVariable {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
}

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: PromptVariable[];
  systemPrompt: string;
  outputGuidance: string;
  estimatedWords: number;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'ctd-clinical-overview',
    name: 'Clinical Overview (2.5)',
    category: 'ctd',
    description:
      'Generate a comprehensive CTD Module 2.5 Clinical Overview with proper regulatory structure.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., Pembrolizumab',
        required: true,
        type: 'text',
      },
      {
        name: 'INDICATION',
        label: 'Indication',
        placeholder: 'e.g., Non-small cell lung cancer',
        required: true,
        type: 'text',
      },
      {
        name: 'MECHANISM',
        label: 'Mechanism of Action',
        placeholder: 'e.g., PD-1 checkpoint inhibitor',
        required: false,
        type: 'text',
      },
      {
        name: 'PHASE',
        label: 'Development Phase',
        placeholder: 'e.g., Phase III',
        required: true,
        type: 'select',
        options: ['Phase I', 'Phase II', 'Phase III', 'Phase IV'],
      },
      {
        name: 'KEY_STUDIES',
        label: 'Pivotal Studies',
        placeholder: 'e.g., KEYNOTE-024, KEYNOTE-189',
        required: false,
        type: 'textarea',
      },
      {
        name: 'REGION',
        label: 'Target Agency',
        placeholder: 'FDA',
        required: true,
        type: 'select',
        options: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      },
    ],
    systemPrompt: `You are a senior regulatory medical writer drafting CTD Module 2.5 (Clinical Overview) for {{PRODUCT_NAME}} for the treatment of {{INDICATION}}.
Target agency: {{REGION}}.
Product mechanism: {{MECHANISM}}.
Development phase: {{PHASE}}.
{{KEY_STUDIES}}

Follow ICH M4E(R2) guidelines. Structure the overview as:
1. Product Development Rationale
2. Overview of Biopharmaceutics
3. Overview of Clinical Pharmacology
4. Overview of Efficacy
5. Overview of Safety
6. Benefits and Risks Conclusions

Use formal regulatory language, third-person passive voice, and cite pivotal study data where provided.`,
    outputGuidance:
      'Output publication-ready regulatory prose with proper CTD subheadings. 800-1500 words.',
    estimatedWords: 1200,
  },
  {
    id: 'ctd-quality-summary',
    name: 'Quality Overall Summary (2.3)',
    category: 'ctd',
    description: 'Generate CTD Module 2.3 Quality Overall Summary for drug substance and product.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., Amlodipine Besylate',
        required: true,
        type: 'text',
      },
      {
        name: 'DOSAGE_FORM',
        label: 'Dosage Form',
        placeholder: 'e.g., Tablets, 5mg and 10mg',
        required: true,
        type: 'text',
      },
      {
        name: 'ROUTE',
        label: 'Route of Administration',
        placeholder: 'e.g., Oral',
        required: true,
        type: 'select',
        options: [
          'Oral',
          'Intravenous',
          'Subcutaneous',
          'Intramuscular',
          'Topical',
          'Inhalation',
          'Ophthalmic',
        ],
      },
      {
        name: 'MANUFACTURER',
        label: 'Manufacturer',
        placeholder: 'e.g., PharmaCo Manufacturing LLC',
        required: false,
        type: 'text',
      },
      {
        name: 'REGION',
        label: 'Target Agency',
        placeholder: 'FDA',
        required: true,
        type: 'select',
        options: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      },
    ],
    systemPrompt: `You are drafting CTD Module 2.3 (Quality Overall Summary) for {{PRODUCT_NAME}} ({{DOSAGE_FORM}}, {{ROUTE}}).
Manufacturer: {{MANUFACTURER}}.
Target agency: {{REGION}}.

Follow ICH Q guidelines. Cover:
1. Drug Substance (S): general info, manufacture, characterization, control, stability
2. Drug Product (P): description, pharmaceutical development, manufacture, control, stability
3. Appendices: facilities, adventitious agents, novel excipients

Reference ICH Q1A-Q1F for stability, Q3A/Q3B for impurities, Q6A/Q6B for specifications.`,
    outputGuidance: 'Structured regulatory prose with CMC detail. 600-1000 words.',
    estimatedWords: 800,
  },
  {
    id: 'csr-synopsis',
    name: 'CSR Synopsis',
    category: 'csr',
    description: 'Generate a Clinical Study Report synopsis per ICH E3 guidelines.',
    variables: [
      {
        name: 'STUDY_TITLE',
        label: 'Study Title',
        placeholder: 'A Phase III, Randomized, Double-Blind...',
        required: true,
        type: 'textarea',
      },
      {
        name: 'PROTOCOL',
        label: 'Protocol Number',
        placeholder: 'e.g., ABC-123-001',
        required: true,
        type: 'text',
      },
      {
        name: 'PRODUCT_NAME',
        label: 'Investigational Product',
        placeholder: 'e.g., Drug X 100mg',
        required: true,
        type: 'text',
      },
      {
        name: 'INDICATION',
        label: 'Indication',
        placeholder: 'e.g., Major depressive disorder',
        required: true,
        type: 'text',
      },
      {
        name: 'DESIGN',
        label: 'Study Design',
        placeholder: 'e.g., Randomized, double-blind, placebo-controlled',
        required: true,
        type: 'text',
      },
      {
        name: 'SAMPLE_SIZE',
        label: 'Sample Size',
        placeholder: 'e.g., N=450',
        required: false,
        type: 'text',
      },
      {
        name: 'PRIMARY_ENDPOINT',
        label: 'Primary Endpoint',
        placeholder: 'e.g., Change from baseline in MADRS',
        required: true,
        type: 'text',
      },
      {
        name: 'DURATION',
        label: 'Treatment Duration',
        placeholder: 'e.g., 8 weeks',
        required: false,
        type: 'text',
      },
    ],
    systemPrompt: `You are writing a CSR Synopsis per ICH E3 for:
Study: {{STUDY_TITLE}}
Protocol: {{PROTOCOL}}
Product: {{PRODUCT_NAME}}
Indication: {{INDICATION}}
Design: {{DESIGN}}
Sample size: {{SAMPLE_SIZE}}
Primary endpoint: {{PRIMARY_ENDPOINT}}
Duration: {{DURATION}}

Structure per ICH E3:
- Name of Sponsor, Product, Protocol
- Study Title, Phase, Indication
- Study Design, Objectives
- Test Product/Dose/Mode/Batch
- Duration of Treatment
- Criteria for Inclusion/Exclusion (summarize)
- Number of Patients (planned/randomized/completed)
- Efficacy Results (primary and key secondary)
- Safety Results (AEs, SAEs, deaths, discontinuations)
- Conclusions`,
    outputGuidance:
      'Structured synopsis with all ICH E3 required elements. Use [brackets] for missing data. 500-800 words.',
    estimatedWords: 700,
  },
  {
    id: 'safety-narrative',
    name: 'Individual Safety Narrative',
    category: 'safety',
    description: 'Generate an individual patient safety narrative for serious adverse events.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., Drug X',
        required: true,
        type: 'text',
      },
      {
        name: 'PROTOCOL',
        label: 'Protocol Number',
        placeholder: 'e.g., ABC-123-001',
        required: true,
        type: 'text',
      },
      {
        name: 'SUBJECT_ID',
        label: 'Subject ID',
        placeholder: 'e.g., 001-0042',
        required: true,
        type: 'text',
      },
      {
        name: 'EVENT',
        label: 'Adverse Event',
        placeholder: 'e.g., Hepatotoxicity, Grade 3',
        required: true,
        type: 'text',
      },
      {
        name: 'DEMOGRAPHICS',
        label: 'Demographics',
        placeholder: 'e.g., 58-year-old male, 82kg',
        required: false,
        type: 'text',
      },
      {
        name: 'MEDICAL_HISTORY',
        label: 'Relevant Medical History',
        placeholder: 'e.g., Hypertension, Type 2 diabetes',
        required: false,
        type: 'textarea',
      },
      {
        name: 'OUTCOME',
        label: 'Outcome',
        placeholder: 'e.g., Resolved with dose reduction',
        required: false,
        type: 'text',
      },
    ],
    systemPrompt: `You are writing an individual patient safety narrative for a regulatory submission.
Product: {{PRODUCT_NAME}}
Protocol: {{PROTOCOL}}
Subject: {{SUBJECT_ID}}
Event: {{EVENT}}
Demographics: {{DEMOGRAPHICS}}
Medical History: {{MEDICAL_HISTORY}}
Outcome: {{OUTCOME}}

Follow CIOMS/ICH E2B(R3) format. Include:
1. Patient demographics and baseline characteristics
2. Relevant medical history and concomitant medications
3. Study drug administration details
4. Description of the event (onset, course, severity, treatment)
5. Laboratory/diagnostic findings
6. Outcome and follow-up
7. Investigator's assessment of causality
8. Sponsor's assessment (if applicable)

Use [brackets] for any missing data elements.`,
    outputGuidance: 'Clinical safety narrative in formal medical writing style. 300-500 words.',
    estimatedWords: 400,
  },
  {
    id: 'ind-cover-letter',
    name: 'IND Cover Letter',
    category: 'ind',
    description: 'Generate an IND cover letter for FDA submission.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., ABC-1234',
        required: true,
        type: 'text',
      },
      {
        name: 'INDICATION',
        label: 'Indication',
        placeholder: 'e.g., Advanced melanoma',
        required: true,
        type: 'text',
      },
      {
        name: 'SPONSOR',
        label: 'Sponsor Name',
        placeholder: 'e.g., BioPharma Inc.',
        required: true,
        type: 'text',
      },
      {
        name: 'IND_NUMBER',
        label: 'IND Number',
        placeholder: 'e.g., IND 123456 (or New)',
        required: false,
        type: 'text',
      },
      {
        name: 'SUBMISSION_TYPE',
        label: 'Submission Type',
        placeholder: 'Initial IND',
        required: true,
        type: 'select',
        options: ['Initial IND', 'IND Amendment', 'IND Annual Report', 'IND Safety Report'],
      },
      {
        name: 'DIVISION',
        label: 'FDA Review Division',
        placeholder: 'e.g., Division of Oncology Products 1',
        required: false,
        type: 'text',
      },
    ],
    systemPrompt: `You are drafting an IND cover letter for FDA.
Product: {{PRODUCT_NAME}}
Indication: {{INDICATION}}
Sponsor: {{SPONSOR}}
IND Number: {{IND_NUMBER}}
Submission Type: {{SUBMISSION_TYPE}}
Review Division: {{DIVISION}}

Follow 21 CFR 312.23 requirements. Include:
1. Formal address to FDA CDER/CBER
2. Reference to IND number and serial number
3. Purpose of submission
4. Summary of contents
5. Highlight any urgent safety information
6. Regulatory history if applicable
7. Contact information placeholder
8. Signature block placeholder

Use formal regulatory correspondence language.`,
    outputGuidance: 'Formal FDA correspondence. 200-400 words.',
    estimatedWords: 300,
  },
];

/**
 * GET /api/concept2cure/ai/templates
 * Returns available prompt templates with their variable schemas.
 */
router.get('/ai/templates', (_req: Request, res: Response) => {
  const templates = PROMPT_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    variables: t.variables,
    estimatedWords: t.estimatedWords,
  }));
  return sendSuccess(res, { templates });
});

/**
 * POST /api/concept2cure/ai/templates/:templateId/generate
 * Generate content from a template with variable values filled in.
 */
const templateGenerateSchema = z
  .object({
    variables: z.record(z.string(), z.string()),
    projectId: z.union([z.string(), z.number()]).optional(),
    artifactId: z.union([z.string(), z.number()]).optional(),
    contextAttachment: z.enum(['project', 'adhoc']).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.projectId && value.contextAttachment !== 'adhoc') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextAttachment'],
        message: 'contextAttachment must be "adhoc" when projectId is not provided',
      });
    }
    if (value.contextAttachment === 'project' && !value.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'projectId is required when contextAttachment is "project"',
      });
    }
  });

router.post('/ai/templates/:templateId/generate', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const { templateId } = req.params;
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const rawData = templateGenerateSchema.parse(req.body);
    const data = {
      ...rawData,
      contextAttachment:
        rawData.contextAttachment ||
        (rawData.projectId ? ('project' as const) : ('adhoc' as const)),
    };

    const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return sendError(res, 404, `Template '${templateId}' not found`);
    }

    // Validate required variables
    const missingVars = template.variables
      .filter(v => v.required && (!data.variables[v.name] || data.variables[v.name].trim() === ''))
      .map(v => v.label);
    if (missingVars.length > 0) {
      return sendError(res, 400, `Missing required variables: ${missingVars.join(', ')}`);
    }

    // Replace {{VARIABLE}} placeholders with provided values
    let prompt = template.systemPrompt;
    for (const [key, value] of Object.entries(data.variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `[${key}]`);
    }
    // Replace any remaining unset variables with bracket placeholders
    prompt = prompt.replace(/\{\{([A-Z_]+)\}\}/g, '[$1]');

    // ── Retrieve Data Room evidence if project context available ─────
    let evidenceBlock = '';
    let sourcesRetrieved = 0;
    if (data.projectId) {
      try {
        const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
        const embeddingService = getEmbeddingService(pool);
        const orgUuid =
          (req as any).tenantContext?.organizationUuid ||
          (req.headers['x-org-uuid'] as string | undefined);

        const searchQuery = Object.values(data.variables)
          .filter(Boolean)
          .join(' ')
          .substring(0, 300);
        const searchResults = await embeddingService.searchHybrid(searchQuery, 5, 0.65, orgUuid);
        if (searchResults.length > 0) {
          sourcesRetrieved = searchResults.length;
          evidenceBlock =
            '\n\n--- RETRIEVED EVIDENCE FROM DATA ROOM (cite as [SRC-n]) ---\n' +
            searchResults
              .map((r: any, i: number) => {
                const content =
                  r.content.length > 500 ? r.content.substring(0, 500) + '…' : r.content;
                return `[SRC-${i + 1}] "${r.title}"\n${content}`;
              })
              .join('\n\n') +
            '\n--- END EVIDENCE ---\n\n' +
            'Cite evidence inline using [SRC-n] where supported. Do NOT fabricate citations.';
        }
      } catch (e: any) {
        logger.warn('Template generation: Data Room retrieval failed', { error: e.message });
      }
    }

    // ── RIM Intelligence Context (non-blocking) ─────────────────────────
    let rimBlock = '';
    if (data.projectId) {
      try {
        const { computeReadinessScore, generateRecommendations } = await import(
          '../../services/intelligence/index.js'
        );
        const projId = Number(data.projectId);
        const [readiness, recs] = await Promise.all([
          computeReadinessScore({ organizationId, projectId: projId }).catch(() => null),
          generateRecommendations({
            organizationId,
            projectId: projId,
            triggeredBy: 'template_gen',
          }).catch(() => null),
        ]);

        const rimParts: string[] = [];
        if (readiness) {
          const dims = readiness.dimensions;
          rimParts.push(
            `Submission readiness: ${Math.round(readiness.overallScore)}% ` +
              `(completeness ${Math.round(dims.completeness)}%, quality ${Math.round(
                dims.quality
              )}%, ` +
              `consistency ${Math.round(dims.consistency)}%, compliance ${Math.round(
                dims.compliance
              )}%).`
          );
          if (readiness.gaps?.length > 0) {
            const topGaps = readiness.gaps
              .filter((g: any) => g.severity === 'critical' || g.severity === 'high')
              .slice(0, 3);
            if (topGaps.length > 0) {
              rimParts.push(
                'Key gaps: ' +
                  topGaps.map((g: any) => `${g.description} (${g.severity})`).join('; ') +
                  '.'
              );
            }
          }
        }
        if (recs?.recommendations) {
          const activeRecs = recs.recommendations
            .filter(
              (r: any) =>
                r.status === 'active' && (r.severity === 'critical' || r.severity === 'high')
            )
            .slice(0, 3);
          if (activeRecs.length > 0) {
            rimParts.push(
              'Active recommendations: ' +
                activeRecs.map((r: any) => r.suggestedAction).join('; ') +
                '.'
            );
          }
        }
        if (rimParts.length > 0) {
          rimBlock =
            '\n\n--- REGULATORY INTELLIGENCE ---\n' +
            rimParts.join(' ') +
            '\nAddress identified gaps where relevant. Do not mention these scores in your output.\n' +
            '--- END INTELLIGENCE ---\n';
        }
      } catch {
        /* Non-blocking — continue without RIM context */
      }
    }

    // ── Generate with AI Gateway ────────────────────────────────────────
    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        {
          role: 'system',
          content: prompt + evidenceBlock + rimBlock + '\n\n' + template.outputGuidance,
        },
        { role: 'user', content: 'Generate the document content now.' },
      ],
      temperature: 0.35,
      maxTokens: 4000,
      callerModule: 'concept2cure/ai-template-generate',
    });

    const result = gwResponse.content || '';
    const latencyMs = Date.now() - startMs;
    const wordCount = result.split(/\s+/).length;

    await logAuditEntry(req, 'AI_TEMPLATE_GENERATE', 'prompt_template', templateId, null, {
      templateName: template.name,
      variablesFilled: Object.keys(data.variables).length,
      outputLength: result.length,
      wordCount,
      sourcesRetrieved,
      latencyMs,
      model: gwResponse.model,
    });

    logger.info('Template generation completed', {
      templateId,
      userId,
      wordCount,
      sourcesRetrieved,
      latencyMs,
    });

    return sendSuccess(res, {
      result,
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
      },
      metrics: {
        wordCount,
        latencyMs,
        sourcesRetrieved,
        wordsPerMinute: latencyMs > 0 ? Math.round(wordCount / (latencyMs / 60000)) : 0,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Template generation failed', { error: error.message });
    return sendError(res, 500, 'Template generation failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI AUTOCOMPLETE (Sprint 1A — Copilot-style inline completions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/autocomplete
 * Returns a short inline completion for the editor ghost text.
 * Low latency, low temperature, max ~80 tokens.
 */
router.post('/ai/autocomplete', async (req: Request, res: Response) => {
  try {
    const { textBefore, context, maxTokens = 80 } = req.body;
    if (!textBefore || typeof textBefore !== 'string' || textBefore.length < 10) {
      return sendError(res, 400, 'textBefore is required (min 10 chars)');
    }

    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured');
    }

    const systemPrompt = [
      'You are an inline autocomplete engine for regulatory document authoring.',
      'Given the text so far, predict the NEXT 1-2 sentences the author is likely to write.',
      'Match the tone, style, and formality of the existing text.',
      'Use precise regulatory language appropriate for FDA/EMA submissions.',
      context?.submissionType ? `Submission type: ${context.submissionType}.` : '',
      context?.ctdSection ? `CTD Section: ${context.ctdSection}.` : '',
      context?.documentType ? `Document type: ${context.documentType}.` : '',
      'Return ONLY the completion text — no explanation, no quotes, no preamble.',
      'If you cannot predict a useful continuation, return an empty string.',
    ]
      .filter(Boolean)
      .join(' ');

    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textBefore },
      ],
      temperature: 0.3,
      maxTokens: Math.min(maxTokens, 150),
      callerModule: 'concept2cure/ai-autocomplete',
    });

    const completion = (gwResponse.content || '').trim();
    return sendSuccess(res, { completion });
  } catch (error: any) {
    logger.error('AI autocomplete failed', { error: error.message });
    return sendError(res, 500, 'Autocomplete failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI COMPLIANCE SCAN (Sprint 1C — real-time regulatory scanning)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/compliance-scan
 * Deep AI-powered compliance scan of document content.
 * Returns structured issues with severity, rule, and suggested fix.
 */
router.post('/ai/compliance-scan', async (req: Request, res: Response) => {
  try {
    const { content, documentType, submissionType, ctdSection } = req.body;
    if (!content || typeof content !== 'string') {
      return sendError(res, 400, 'content is required');
    }

    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured');
    }

    const systemPrompt = [
      'You are an FDA/EMA regulatory compliance reviewer. Analyze the document content and identify compliance issues.',
      'For each issue, provide: type (error/warning/info), rule (regulation reference), message (what is wrong), and suggestion (how to fix).',
      submissionType ? `Submission type: ${submissionType}.` : '',
      ctdSection ? `CTD Section: ${ctdSection}.` : '',
      documentType ? `Document type: ${documentType}.` : '',
      'Return a JSON array of issues: [{"type": "error|warning|info", "rule": "21 CFR 314.50(d)", "message": "...", "suggestion": "..."}]',
      'Focus on: missing required content, regulatory language violations, formatting issues, and cross-reference gaps.',
      'Return ONLY valid JSON array, no other text.',
    ]
      .filter(Boolean)
      .join(' ');

    // Use only first 3000 chars to keep latency low
    const truncated = content.replace(/<[^>]+>/g, ' ').slice(0, 3000);

    const gwResponse = await gw.route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: truncated },
      ],
      temperature: 0.2,
      maxTokens: 2000,
      callerModule: 'concept2cure/ai-compliance-scan',
    });

    let issues = [];
    try {
      const raw = (gwResponse.content || '').trim();
      // Extract JSON array from response
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        issues = JSON.parse(match[0]);
      }
    } catch {
      issues = [];
    }

    // RIM: capture compliance signals (non-blocking)
    const orgId = (req as any).organizationId || (req as any).user?.organizationId;
    if (orgId && issues.length > 0) {
      interceptComplianceScan({
        organizationId: orgId,
        projectId: parseInt(req.body.projectId || '0', 10),
        userId: (req as any).user?.id,
        sectionCode: ctdSection,
        documentType,
        submissionType,
        issues,
        scannedLength: truncated.length,
      });
    }

    return sendSuccess(res, { issues, scannedLength: truncated.length });
  } catch (error: any) {
    logger.error('Compliance scan failed', { error: error.message });
    return sendError(res, 500, 'Compliance scan failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI CITATION SEARCH (Sprint 1B — Smart Citation Insertion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/citation-search
 * Search for citable references across project artifacts and CSR database.
 * Returns formatted citations with metadata for insertion.
 */
router.post('/ai/citation-search', async (req: Request, res: Response) => {
  try {
    const { query, projectId, limit = 10 } = req.body;
    if (!query || typeof query !== 'string' || query.length < 2) {
      return sendError(res, 400, 'query is required (min 2 chars)');
    }

    const results: Array<{
      id: string;
      title: string;
      authors: string;
      year: string;
      sourceType: string;
      excerpt: string;
      citationText: string;
    }> = [];

    // Search project artifacts if projectId provided
    if (projectId) {
      try {
        const artifactResult = await pool.query(
          `SELECT id, title, content, type, created_at
           FROM concept2cure_artifacts
           WHERE project_id = $1
             AND (title ILIKE $2 OR content ILIKE $2)
           ORDER BY updated_at DESC
           LIMIT $3`,
          [projectId, `%${query}%`, Math.min(limit, 20)]
        );
        for (const row of artifactResult.rows) {
          const year = new Date(row.created_at).getFullYear().toString();
          const plainText = (row.content || '').replace(/<[^>]+>/g, ' ').trim();
          results.push({
            id: `artifact-${row.id}`,
            title: row.title,
            authors: 'Project Team',
            year,
            sourceType: row.type || 'document',
            excerpt: plainText.slice(0, 200),
            citationText: `[Project Team, ${year}]`,
          });
        }
      } catch {
        // Non-fatal — continue with other sources
      }
    }

    // Search CSR knowledge base
    try {
      const csrResult = await pool.query(
        `SELECT id, title, sponsor, indication, phase, approval_date
         FROM csr_reports
         WHERE title ILIKE $1 OR sponsor ILIKE $1 OR indication ILIKE $1
         ORDER BY approval_date DESC NULLS LAST
         LIMIT $2`,
        [`%${query}%`, Math.min(limit, 20)]
      );
      for (const row of csrResult.rows) {
        const year = row.approval_date
          ? new Date(row.approval_date).getFullYear().toString()
          : 'N/A';
        results.push({
          id: `csr-${row.id}`,
          title: row.title,
          authors: row.sponsor || 'Unknown',
          year,
          sourceType: `CSR Phase ${row.phase || '?'}`,
          excerpt: `${row.indication || ''} — ${row.sponsor || ''}`.trim(),
          citationText: `[${row.sponsor || 'Unknown'}, ${year}]`,
        });
      }
    } catch {
      // CSR table may not exist — non-fatal
    }

    return sendSuccess(res, { results: results.slice(0, limit), total: results.length });
  } catch (error: any) {
    logger.error('Citation search failed', { error: error.message });
    return sendError(res, 500, 'Citation search failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI BATCH SECTION EDIT (Sprint 1D — Batch AI Operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/batch-edit
 * Process multiple document sections with an AI action in sequence.
 * Accepts array of sections, returns array of results.
 */
router.post('/ai/batch-edit', async (req: Request, res: Response) => {
  try {
    const { sections, action, submissionType } = req.body;
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return sendError(res, 400, 'sections array is required');
    }
    if (!action || typeof action !== 'string') {
      return sendError(res, 400, 'action is required');
    }

    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured');
    }

    const actionPrompts: Record<string, string> = {
      rewrite:
        'Rewrite this section for clarity, precision, and professional regulatory language. Maintain all factual content.',
      expand:
        'Expand this section with more detail, evidence references, and supporting data. Keep regulatory tone.',
      summarize:
        'Create a concise executive summary of this section. Keep key data points and conclusions.',
      'regulatory-tone':
        'Rewrite in formal FDA/EMA regulatory submission language. Use "shall" for requirements, "should" for recommendations.',
      'add-references':
        'Add reference placeholders [Ref X] where claims need supporting evidence. Note what type of reference is needed.',
    };

    const systemPrompt = [
      actionPrompts[action] || `Apply the "${action}" transformation to this text.`,
      submissionType ? `Submission type: ${submissionType}.` : '',
      'Return ONLY the transformed text — no preamble, no explanation.',
    ]
      .filter(Boolean)
      .join(' ');

    const results = [];
    for (const section of sections.slice(0, 20)) {
      try {
        const text = (section.content || '')
          .replace(/<[^>]+>/g, ' ')
          .trim()
          .slice(0, 3000);
        if (text.length < 10) {
          results.push({ sectionTitle: section.title, result: section.content, error: null });
          continue;
        }

        const gwResponse = await gw.route({
          taskType: 'document_drafting',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Section: ${section.title || 'Untitled'}\n\n${text}` },
          ],
          temperature: 0.4,
          maxTokens: 2000,
          callerModule: 'concept2cure/ai-batch-edit',
        });

        results.push({
          sectionTitle: section.title,
          result: (gwResponse.content || '').trim(),
          error: null,
        });
      } catch (err: any) {
        results.push({
          sectionTitle: section.title,
          result: section.content,
          error: err.message,
        });
      }
    }

    return sendSuccess(res, { results, processedCount: results.length });
  } catch (error: any) {
    logger.error('Batch edit failed', { error: error.message });
    return sendError(res, 500, 'Batch edit failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-REFERENCE VALIDATION (Sprint 2C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/validate-references
 * Validate cross-references found in document content against project artifacts.
 */
router.post('/ai/validate-references', async (req: Request, res: Response) => {
  try {
    const { references, projectId } = req.body;
    if (!references || !Array.isArray(references)) {
      return sendError(res, 400, 'references array is required');
    }

    const refsSlice = references.slice(0, 50);

    // Batch: fetch all project artifacts once instead of N SELECTs
    let artifactRows: Array<{ id: number; title: string; ctd_section: string | null }> = [];
    if (projectId) {
      try {
        const artResult = await pool.query(
          `SELECT id, title, ctd_section FROM concept2cure_artifacts WHERE project_id = $1`,
          [projectId]
        );
        artifactRows = artResult.rows;
      } catch {
        // fall through — all refs will be 'unlinked'
      }
    }

    const validatedRefs = refsSlice.map((ref: any) => {
      let status: 'valid' | 'broken' | 'unlinked' = 'unlinked';
      let targetTitle = '';

      if (projectId && ref.targetSection) {
        const needle = ref.targetSection.toLowerCase();
        const match = artifactRows.find(
          a =>
            (a.ctd_section && a.ctd_section.toLowerCase().includes(needle)) ||
            a.title.toLowerCase().includes(needle)
        );
        if (match) {
          status = 'valid';
          targetTitle = match.title;
        } else {
          status = 'broken';
        }
      }

      return { ...ref, status, targetTitle };
    });

    return sendSuccess(res, { references: validatedRefs });
  } catch (error: any) {
    logger.error('Reference validation failed', { error: error.message });
    return sendError(res, 500, 'Reference validation failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INCONSISTENCY INTELLIGENCE (Sprint 2C — ARTOS-inspired)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/check-inconsistency
 * Cross-section change impact detection. When content changes in one section,
 * identifies other sections in the same project that may need updating.
 */
router.post('/ai/check-inconsistency', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { changedText, changedSectionTitle, projectId, artifactId } = req.body;

    if (!changedText || !projectId) {
      return sendError(res, 400, 'changedText and projectId are required');
    }

    // Fetch all other artifacts in the project
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectId),
          ne(concept2cureArtifacts.id, artifactId || '')
        )
      );

    if (allArtifacts.length === 0) {
      return sendSuccess(res, { sections: [] });
    }

    // Build context of other sections (limit to first 500 chars each)
    const otherSections = allArtifacts.slice(0, 10).map((a: any) => ({
      id: a.id,
      title: a.title,
      excerpt: (a.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500),
    }));

    const prompt = `You are a regulatory document consistency checker. A user changed content in the section "${
      changedSectionTitle || 'Unknown'
    }".

Changed content:
"${changedText.slice(0, 1500)}"

Other sections in the same project:
${otherSections.map((s: any) => `- [${s.id}] "${s.title}": ${s.excerpt}`).join('\n')}

Identify which other sections (if any) reference similar data points, claims, or statistics as the changed content and may need updating for consistency. Return a JSON array of affected sections:
[{ "artifactId": "...", "artifactTitle": "...", "affectedText": "relevant excerpt", "reason": "why it may be inconsistent", "severity": "high|medium|low" }]

If no sections are affected, return an empty array []. Only return the JSON array, nothing else.`;

    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    const gwResponse = await gw.route({
      taskType: 'document_analysis',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2000,
      callerModule: 'concept2cure/inconsistency-check',
    });

    let sections: Array<Record<string, unknown>> = [];
    try {
      const content = gwResponse.content || '[]';
      // Try multiple extraction strategies for robustness
      // 1. Direct JSON array match
      const jsonMatch = content.match(/\[[\s\S]*?\](?=[^[\]]*$)/);
      if (jsonMatch) {
        sections = JSON.parse(jsonMatch[0]);
      } else {
        // 2. Try parsing within markdown code fence
        const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          sections = JSON.parse(fenceMatch[1].trim());
        } else {
          // 3. Try parsing entire content as JSON
          const trimmed = content.trim();
          if (trimmed.startsWith('[')) {
            sections = JSON.parse(trimmed);
          }
        }
      }
      // Validate array shape
      if (!Array.isArray(sections)) sections = [];
    } catch {
      logger.warn('Inconsistency check: AI returned unparseable response, returning empty');
      sections = [];
    }

    logger.info('Inconsistency check completed', {
      userId,
      projectId,
      affectedCount: sections.length,
    });
    return sendSuccess(res, { sections });
  } catch (error: any) {
    logger.error('Inconsistency check failed', { error: error.message });
    return sendError(res, 500, 'Inconsistency analysis failed');
  }
});

/**
 * POST /api/concept2cure/ai/extract-metadata
 * AI-powered metadata extraction from source documents.
 * Extracts study endpoints, sample sizes, key findings, p-values.
 */
router.post('/ai/extract-metadata', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { projectId, artifactId } = req.body;

    if (!projectId || !artifactId) {
      return sendError(res, 400, 'projectId and artifactId are required');
    }

    // Fetch the artifact content
    const [artifact] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.id, artifactId),
          eq(concept2cureArtifacts.projectId, projectId)
        )
      );

    if (!artifact) {
      return sendError(res, 404, 'Artifact not found');
    }

    const plainContent = ((artifact as any).content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    const prompt = `Extract key metadata from this regulatory/clinical document. Return a JSON object with these fields (use null for missing):
{
  "studyType": "e.g. Phase III RCT, observational, meta-analysis",
  "endpoints": ["primary endpoint", "secondary endpoints..."],
  "sampleSize": "N=...",
  "keyFindings": ["finding 1", "finding 2"],
  "pValues": ["p<0.001 for primary endpoint", ...],
  "therapeuticArea": "e.g. oncology, cardiology",
  "phase": "e.g. Phase I, Phase II, Phase III"
}

Document content:
"${plainContent}"

Return only the JSON object, nothing else.`;

    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw2 = getGateway();
    if (gw2.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    const gwResponse = await gw2.route({
      taskType: 'document_analysis',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 1000,
      callerModule: 'concept2cure/extract-metadata',
    });

    let metadata = {};
    try {
      const content = gwResponse.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      metadata = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      metadata = {};
    }

    logger.info('Metadata extraction completed', { userId, projectId, artifactId });
    return sendSuccess(res, metadata);
  } catch (error: any) {
    logger.error('Metadata extraction failed', { error: error.message });
    return sendError(res, 500, 'Metadata extraction failed');
  }
});

export default router;
