/**
 * The context-integrity and intelligence endpoints for Concept2Cure —
 * conversation health, working memory, summarise, promote and decision
 * extraction; the intelligence engine's analyze and evaluate; the precedent,
 * patent and compliance reads; team workload; and feedback. The tenth and
 * last non-project domain carved out of routes/concept2cure.ts (ledger L53,
 * slice 12), mounted at the same prefix ahead of it with the same middleware
 * chain; the handlers moved verbatim, their dynamic service imports
 * re-pointed one directory up.
 *
 * @module server/routes/c2c/context-intelligence
 */

import { Router, type Request, type Response } from 'express';
import { concept2cureArtifacts, concept2cureProvenanceEvents } from '../../../shared/schema';
import { db, pool } from '../../db';
import { resolveGovernedContext } from '../../services/concept2cure/governedDocumentContractService';
import { computeConversationHealth } from '../../services/conversation-health.js';
import { buildWorkingMemoryPrompt, formatWorkingMemoryForPrompt, getLatestWorkingMemory, storeWorkingMemory } from '../../services/working-memory.js';
import * as crypto from 'crypto';
import { z } from 'zod';
import { ai } from '../../lib/unified-ai-client';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  DOMPurify,
  concept2cureRateLimiter,
  getUserId,
  logAuditEntry,
  logConcept2cureError,
  paramStr,
  sendError,
  sendSuccess,
} from './shared';

const logger = createScopedLogger('concept2cure-context-intelligence');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);


/**
 * GET /api/concept2cure/conversations/:conversationId/health
 * Compute and return conversation health report.
 */
router.get(
  '/conversations/:conversationId/health',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId);
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      const report = await computeConversationHealth(conversationId, organizationId);
      return sendSuccess(res, report);
    } catch (error: any) {
      logConcept2cureError('conversation health', error);
      return sendError(res, 500, 'Failed to compute conversation health');
    }
  }
);

/**
 * GET /api/concept2cure/conversations/:conversationId/working-memory
 * Get the latest working memory summary for a conversation.
 */
router.get(
  '/conversations/:conversationId/working-memory',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId);
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      const memory = await getLatestWorkingMemory(conversationId, organizationId);
      if (!memory) {
        return sendSuccess(res, null, { message: 'No working memory generated yet' });
      }

      return sendSuccess(res, {
        ...memory,
        formatted: formatWorkingMemoryForPrompt(memory),
      });
    } catch (error: any) {
      logConcept2cureError('working memory retrieval', error);
      return sendError(res, 500, 'Failed to retrieve working memory');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/summarize
 * Generate or refresh the working memory summary for a conversation.
 * Uses AI to analyze conversation messages and produce a structured summary.
 */
router.post(
  '/conversations/:conversationId/summarize',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId);
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load conversation messages
      const messagesResult = await pool.query(
        `SELECT role, content FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
        [conversationId, organizationId]
      );
      const messages = messagesResult.rows;

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages found for this conversation');
      }

      // Get previous summary for chaining
      const existingMemory = await getLatestWorkingMemory(conversationId, organizationId);
      const previousSummary = existingMemory
        ? formatWorkingMemoryForPrompt(existingMemory)
        : undefined;

      // Build the summarization prompt
      const summaryPrompt = buildWorkingMemoryPrompt(messages, previousSummary);

      // Use OpenAI to generate the structured summary
      let structured: any;
      try {
        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a regulatory affairs analyst. Produce concise, structured summaries.',
            },
            { role: 'user', content: summaryPrompt },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        });

        const responseText = aiResult.content || '{}';
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        structured = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : {
              objective: 'Unable to parse summary',
              lockedFacts: [],
              decisions: [],
              openQuestions: [],
              nextActions: [],
              createdArtifacts: [],
              exclusions: [],
            };
      } catch (aiError: any) {
        logger.error(`AI summarization failed: ${aiError.message}`);
        // Fallback: generate a basic summary without AI
        structured = {
          objective: `Conversation with ${messages.length} messages`,
          lockedFacts: [],
          decisions: [],
          openQuestions: messages
            .filter((m: any) => m.role === 'user' && m.content?.trim().endsWith('?'))
            .slice(-5)
            .map((m: any) => m.content.trim().slice(0, 200)),
          nextActions: [],
          createdArtifacts: [],
          exclusions: [],
        };
      }

      // Format as readable summary
      const formattedSummary = [
        `**Objective**: ${structured.objective}`,
        structured.lockedFacts?.length > 0
          ? `**Key Facts**: ${structured.lockedFacts.join('; ')}`
          : '',
        structured.decisions?.length > 0 ? `**Decisions**: ${structured.decisions.join('; ')}` : '',
        structured.openQuestions?.length > 0
          ? `**Open Questions**: ${structured.openQuestions.join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Get thread ID for cross-system linking
      const convResult = await pool.query(
        'SELECT thread_id FROM concept2cure_conversations WHERE id = $1',
        [conversationId]
      );
      const threadId = convResult.rows[0]?.thread_id || null;

      // Store
      await storeWorkingMemory({
        conversationId,
        threadId,
        organizationId,
        summary: formattedSummary,
        structured,
        messageCountAtGeneration: messages.length,
      });

      return sendSuccess(res, {
        summary: formattedSummary,
        structured,
        messageCount: messages.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logConcept2cureError('working memory generation', error);
      return sendError(res, 500, 'Failed to generate working memory summary');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/promote
 * Promote conversation content to a governed artifact.
 */
router.post(
  '/conversations/:conversationId/promote',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId) ||
        null;
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }
      const userId = (req as any).userId || (req as any).user?.id || null;

      const promoteSchema = z.object({
        type: z.enum([
          'strategy_memo',
          'evidence_brief',
          'module_draft',
          'decision_log',
          'handoff_memo',
        ]),
        title: z.string().min(1).max(500),
        messageStart: z.number().optional(),
        messageEnd: z.number().optional(),
      });

      const parsed = promoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid promotion request', parsed.error.format());
      }
      const { type, title, messageStart, messageEnd } = parsed.data;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load conversation and verify it belongs to this org
      const convResult = await pool.query(
        'SELECT id, project_id, conversation_id FROM concept2cure_conversations WHERE id = $1 AND organization_id = $2',
        [conversationId, organizationId]
      );
      if (convResult.rows.length === 0) {
        return sendError(res, 404, 'Conversation not found');
      }
      const conversation = convResult.rows[0];

      // Load messages (optionally filtered by range)
      const messagesQuery = `SELECT role, content, created_at FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`;
      const messagesResult = await pool.query(messagesQuery, [conversationId, organizationId]);
      let messages = messagesResult.rows;

      if (messageStart !== undefined || messageEnd !== undefined) {
        const start = messageStart ?? 0;
        const end = messageEnd ?? messages.length;
        messages = messages.slice(start, end);
      }

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages in specified range');
      }

      // Generate document content using AI + Intelligence Engine
      let documentContent: string;
      try {
        const conversationText = messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n');

        // Run intelligence pipeline on conversation content for structured signals
        let intelligenceContext = '';
        try {
          const { runIntelligencePipeline, buildConstrainedPrompt } = await import(
            '../../services/intelligence-engine/index.js'
          );
          const analysis = runIntelligencePipeline(conversationText);
          intelligenceContext = buildConstrainedPrompt(analysis, 'generate_memo');
        } catch {
          // Graceful degradation
        }

        const systemPrompt =
          intelligenceContext ||
          `You are a regulatory affairs document specialist. Extract and organize the conversation content into a formal ${type.replace(
            /_/g,
            ' '
          )} document. Use proper document structure with headings, and maintain regulatory precision. Output in Markdown format.`;

        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Create a "${title}" (${type.replace(
                /_/g,
                ' '
              )}) from this conversation:\n\n${conversationText}`,
            },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });
        documentContent = aiResult.content || '';

        // Evaluation gate: check output quality
        try {
          const { evaluateOutput } = await import('../../services/intelligence-engine/index.js');
          const evaluation = evaluateOutput(documentContent);
          if (!evaluation.passed && intelligenceContext) {
            // Regenerate with tighter constraints
            const retryResult = await ai.chat({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `${systemPrompt}\n\nIMPORTANT: Your output MUST include: a clear verdict/recommendation, prioritized findings with severity levels, specific evidence references, and actionable next steps. Rejected reasons: ${evaluation.rejectionReasons.join(
                    '; '
                  )}`,
                },
                {
                  role: 'user',
                  content: `Create a "${title}" (${type.replace(
                    /_/g,
                    ' '
                  )}) from this conversation:\n\n${conversationText}`,
                },
              ],
              max_tokens: 4000,
              temperature: 0.2,
            });
            documentContent = retryResult.content || documentContent;
          }
        } catch {
          // Use original if evaluation/retry fails
        }
      } catch {
        // Fallback: raw conversation export
        documentContent =
          `# ${title}\n\n_Promoted from conversation on ${new Date().toISOString()}_\n\n` +
          messages
            .map(
              (m: any) =>
                `### ${m.role === 'user' ? 'User' : 'Assistant'} (${new Date(
                  m.created_at
                ).toLocaleString()})\n\n${m.content}`
            )
            .join('\n\n---\n\n');
      }

      // Create artifact
      const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const contentHash = crypto.createHash('sha256').update(documentContent).digest('hex');

      const promotedMetadata = {
        promotedFrom: type,
        sourceMessageCount: messages.length,
      };
      const governedPromotion = resolveGovernedContext({
        req,
        projectId: conversation.project_id,
        artifactId: null,
        documentType: type,
        generationMode: 'ai_generated',
        lifecycleStatus: 'draft',
        originSurface: 'ri_copilot',
        title: DOMPurify.sanitize(title),
        content: documentContent,
        sourceRefs: [`conversation:${conversationId}`],
        provider: 'openai',
        model: 'gpt-4o-mini',
        eventType: 'artifact.created',
      });
      if (!governedPromotion.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: governedPromotion.validation.errors,
            warnings: governedPromotion.validation.warnings,
            resolved: governedPromotion.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const artifactResult = await db
        .insert(concept2cureArtifacts)
        .values({
          artifactId,
          projectId: conversation.project_id,
          conversationId,
          organizationId,
          type: 'markdown',
          category: 'document',
          title: DOMPurify.sanitize(title),
          content: documentContent,
          contentHash,
          version: 1,
          status: 'draft',
          createdById: userId,
          metadata: {
            ...promotedMetadata,
            harness: {
              clientTrack: governedPromotion.contract.clientTrack,
              submissionProgram: governedPromotion.contract.submissionProgram,
              persona: governedPromotion.contract.persona,
              regulatorScope: governedPromotion.contract.regulatorScope,
              documentClass: governedPromotion.contract.documentClass,
              readinessGate: governedPromotion.contract.readinessGate,
              workspaceTarget: governedPromotion.contract.workspaceTarget,
              originSurface: governedPromotion.contract.originSurface,
              recommendationSource: governedPromotion.contract.recommendationSource,
              regulatorIntent: governedPromotion.contract.regulatorIntent,
              gateChecks: governedPromotion.contract.exportEligibility.gateChecks,
              blockingReasons: governedPromotion.contract.exportEligibility.blockingReasons,
              readinessOutcome: governedPromotion.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .returning();

      // Log provenance event
      if (artifactResult.length > 0) {
        await db.insert(concept2cureProvenanceEvents).values({
          eventId: `prov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          artifactId: artifactResult[0].id,
          organizationId,
          eventType: 'creation',
          eventAction: 'promoted_from_conversation',
          actorId: userId || undefined,
          actorName: 'User',
          sourceDescription: `Promoted from conversation ${conversationId} as ${type}`,
          details: {
            conversationId,
            messageRange: { start: messageStart ?? 0, end: messageEnd ?? messages.length },
            sourceType: type,
          },
          backendService: 'concept2cure',
          backendRoute: `POST /api/concept2cure/conversations/${conversationId}/promote`,
        });
      }

      return sendSuccess(res, {
        artifact: artifactResult[0],
        artifactId,
        title,
        type,
        messageCount: messages.length,
      });
    } catch (error: any) {
      logConcept2cureError('document promotion', error);
      return sendError(res, 500, 'Failed to promote conversation to document');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/extract-decisions
 * Extract decisions, risks, and open questions from a conversation.
 */
router.post(
  '/conversations/:conversationId/extract-decisions',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number(
          (req as any).organizationId || (req as any).user?.organizationId || (req as any).tenantId
        ) || 0;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load messages
      const messagesResult = await pool.query(
        `SELECT role, content FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
        [conversationId, organizationId]
      );
      const messages = messagesResult.rows;

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages found');
      }

      try {
        const conversationText = messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n');

        // Run intelligence pipeline for structured risk/decision signals
        let intelligenceSignals: Record<string, unknown> = {};
        try {
          const { runIntelligencePipeline } = await import(
            '../../services/intelligence-engine/index.js'
          );
          const analysis = runIntelligencePipeline(conversationText);
          intelligenceSignals = {
            defensibilityScore: analysis.defensibility.score,
            riskLevel: analysis.defensibility.riskLevel,
            riskClassifications: analysis.riskClassifications.classifications.map(r => ({
              category: r.category,
              severity: r.severity,
              finding: r.finding,
            })),
            reviewerQuestions: analysis.reviewerQuestions.map(q => ({
              question: q.question,
              severity: q.severity,
              category: q.category,
            })),
          };
        } catch {
          // Graceful degradation
        }

        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Extract structured information from this regulatory conversation. You have intelligence signals available. Return ONLY valid JSON.${
                Object.keys(intelligenceSignals).length > 0
                  ? `\n\nIntelligence signals:\n${JSON.stringify(intelligenceSignals, null, 2)}`
                  : ''
              }`,
            },
            {
              role: 'user',
              content: `Extract all decisions, risks, open questions, and action items from this conversation:\n\n${conversationText}\n\nRespond with JSON: { "decisions": [...], "risks": [...], "openQuestions": [...], "actionItems": [...], "intelligenceSignals": {...} }`,
            },
          ],
          max_tokens: 2000,
          temperature: 0.2,
        });

        const responseText = aiResult.content || '{}';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const extracted = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : {
              decisions: [],
              risks: [],
              openQuestions: [],
              actionItems: [],
            };

        // Merge intelligence signals into response
        if (Object.keys(intelligenceSignals).length > 0) {
          extracted.intelligenceSignals = intelligenceSignals;
        }

        return sendSuccess(res, extracted);
      } catch (aiError: any) {
        logger.error(`Decision extraction failed: ${aiError.message}`);
        return sendError(res, 500, 'AI extraction failed');
      }
    } catch (error: any) {
      logConcept2cureError('decision extraction', error);
      return sendError(res, 500, 'Failed to extract decisions');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE — Deterministic regulatory intelligence analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/concept2cure/intelligence/analyze
 *
 * Runs the full Intelligence Engine pipeline on provided content.
 * Returns deterministic analysis: claim/evidence alignment, consistency,
 * defensibility scoring, risk classification, and reviewer questions.
 *
 * No LLM dependency — all results are reproducible.
 */
router.post('/intelligence/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { runIntelligencePipeline, emitRIMSignals, buildConstrainedPrompt } = await import(
      '../../services/intelligence-engine/index.js'
    );

    const analyzeSchema = z.object({
      content: z.string().min(10).max(200000),
      sections: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            content: z.string(),
          })
        )
        .optional(),
      includeConstrainedPrompt: z
        .enum(['explain_risk', 'suggest_remediation', 'generate_memo', 'rewrite_section'])
        .optional(),
    });

    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'Invalid analysis request', parsed.error.format());
    }

    const { content, sections, includeConstrainedPrompt } = parsed.data;
    const startTime = Date.now();

    // Run full deterministic pipeline
    const analysis = runIntelligencePipeline(content, sections);
    const rimSignals = emitRIMSignals(analysis);

    // Optionally build a constrained LLM prompt
    let constrainedPrompt: string | undefined;
    if (includeConstrainedPrompt) {
      constrainedPrompt = buildConstrainedPrompt(analysis, includeConstrainedPrompt);
    }

    return sendSuccess(res, {
      analysis,
      rimSignals,
      constrainedPrompt,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    logger.error(`Intelligence analysis failed: ${error.message}`);
    return sendError(res, 500, 'Intelligence analysis failed');
  }
});

/**
 * POST /api/concept2cure/intelligence/evaluate
 *
 * Run the evaluation gate on any output text to check quality.
 */
router.post('/intelligence/evaluate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { evaluateOutput } = await import('../../services/intelligence-engine/index.js');

    const evalSchema = z.object({
      output: z.string().min(1).max(100000),
    });

    const parsed = evalSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'Invalid evaluation request', parsed.error.format());
    }

    const evaluation = evaluateOutput(parsed.data.output);
    return sendSuccess(res, evaluation);
  } catch (error: any) {
    logger.error(`Evaluation gate failed: ${error.message}`);
    return sendError(res, 500, 'Evaluation failed');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRECEDENTS — Regulatory precedent/predicate data for Intelligence Hub
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/precedents', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    // Try to load precedents from the precedent engine or predicate intelligence tables
    let precedents: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, device_name as name, pathway, decision_date as "decisionDate",
                predicate_device as "predicateDevice", outcome, similarity,
                key_questions as "keyQuestions"
         FROM predicate_intelligence_results
         WHERE organization_id = $1
         ORDER BY decision_date DESC
         LIMIT 50`,
        [orgId]
      );
      precedents = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return sendSuccess(res, precedents);
  } catch (error: any) {
    logConcept2cureError('precedents fetch', error);
    return sendError(res, 500, 'Failed to fetch precedent data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATENTS — IP portfolio data for Legal Center
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/patents', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    let patents: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, title, patent_number as "patentNumber", jurisdiction,
                status, filing_date as "filingDate", expiration_date as "expirationDate",
                inventors, category, fto_status as "ftoStatus",
                related_compounds as "relatedCompounds"
         FROM patent_portfolio
         WHERE organization_id = $1
         ORDER BY filing_date DESC`,
        [orgId]
      );
      patents = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return res.json(patents);
  } catch (error: any) {
    logConcept2cureError('patents fetch', error);
    return sendError(res, 500, 'Failed to fetch patent data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE — Compliance tracking data for Legal Center
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/compliance', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    let complianceItems: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, framework, requirement, status,
                last_audit_date as "lastAuditDate", next_audit_date as "nextAuditDate",
                findings, capa_count as "capaCount", owner, risk_level as "riskLevel"
         FROM compliance_tracking
         WHERE organization_id = $1
         ORDER BY next_audit_date ASC`,
        [orgId]
      );
      complianceItems = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return res.json(complianceItems);
  } catch (error: any) {
    logConcept2cureError('compliance fetch', error);
    return sendError(res, 500, 'Failed to fetch compliance data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM WORKLOAD — Task workload per team member for Mission Control
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/team/workload', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Aggregate task counts by assignee from project_tasks — the one task
    // table this repo creates (migrations/0000) and the one routes/c2c/tasks.ts
    // writes. The status vocabulary is that table's: todo, in-progress,
    // review, done, blocked. A failed read is a 500, never an empty roster.
    const result = await pool.query(
      `SELECT
         u.id as "memberId",
         u.name as "memberName",
         COALESCE(SUM(CASE WHEN t.status IN ('todo', 'in-progress') THEN 1 ELSE 0 END), 0)::int as assigned,
         COALESCE(SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END), 0)::int as "inReview",
         COALESCE(SUM(CASE WHEN t.due_date < NOW() AND t.status <> 'done' THEN 1 ELSE 0 END), 0)::int as overdue
       FROM users u
       LEFT JOIN project_tasks t ON t.assignee_id = u.id AND t.organization_id = $1
       WHERE u.organization_id = $1
       GROUP BY u.id, u.name
       ORDER BY u.name`,
      [orgId]
    );
    const workload = result.rows;

    return res.json(workload);
  } catch (error: any) {
    logConcept2cureError('team workload fetch', error);
    return sendError(res, 500, 'Failed to fetch workload data');
  }
});

/**
 * POST /api/concept2cure/feedback
 * Persist user feedback (thumbs up/down) on AI responses.
 * Critical for RLHF quality loop — was previously console.info only.
 */
router.post('/feedback', authMiddleware, async (req: Request, res: Response) => {
  try {
    const organizationId =
      Number((req as any).tenantContext?.organizationId) ||
      Number((req as any).tenantId) ||
      Number((req as any).user?.organizationId);
    if (!organizationId) {
      return sendError(res, 403, 'Organization context required');
    }
    const userId = getUserId(req);
    const { messageId, positive, conversationId, comment } = req.body;

    if (messageId === undefined || positive === undefined) {
      return sendError(res, 400, 'messageId and positive (boolean) are required');
    }

    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ai_feedback (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          user_id INTEGER,
          message_id TEXT NOT NULL,
          conversation_id TEXT,
          positive BOOLEAN NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`
      );
      await pool.query(
        `INSERT INTO ai_feedback (organization_id, user_id, message_id, conversation_id, positive, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          organizationId,
          userId,
          String(messageId),
          conversationId || null,
          positive,
          comment || null,
        ]
      );
    } catch (dbErr: any) {
      console.warn('[Feedback] DB persist failed:', dbErr.message);
    }

    // Also log to audit trail for compliance
    await logAuditEntry(req, 'FEEDBACK', 'ai_response', String(messageId), null, {
      positive,
      conversationId,
    });

    // Feed back to RIM learning loop (non-blocking)
    try {
      const { interceptFeedback } = await import('../../services/intelligence/rim-interceptors.js');
      interceptFeedback({
        organizationId,
        projectId: req.body.projectId ? Number(req.body.projectId) : 0,
        userId,
        feedbackType: positive ? 'accepted' : 'rejected',
      });
    } catch {
      /* non-blocking */
    }

    return sendSuccess(res, { recorded: true });
  } catch (error: any) {
    logConcept2cureError('feedback submission', error);
    return sendError(res, 500, 'Failed to record feedback');
  }
});

export default router;
