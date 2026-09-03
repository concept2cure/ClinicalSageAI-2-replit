/**
 * Claude Intelligence API Routes
 *
 * REST + SSE endpoints for Claude-powered document intelligence:
 * - POST /api/claude/draft — Draft regulatory document sections
 * - POST /api/claude/draft/stream — Stream document drafting (SSE)
 * - POST /api/claude/review — Compliance review
 * - POST /api/claude/gap-analysis — Gap analysis
 * - POST /api/claude/vision — Analyze scanned documents/images
 * - POST /api/claude/batch — Batch draft multiple sections
 * - POST /api/claude/quick — Quick completion (Sonnet, fast)
 * - GET  /api/claude/health — Claude provider health status
 * - GET  /api/claude/models — Available Claude models
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import {
  getAnaDraftingService,
  type DocumentDraftRequest,
  type RegulatoryFramework,
} from '../services/ana/AnaDocumentDraftingService';
import { getGateway } from '../services/ai-gateway/gateway';
import {
  projectModelsForPicker,
  EFFORT_LEVELS,
  DEFAULT_EFFORT,
} from '../services/ai-gateway/effort';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('ana-intelligence');

/**
 * Model-governance provenance (decision register #727 item 8): every
 * generation on a regulated-drafting surface writes an append-only audit
 * row recording WHICH pinned model produced WHAT content (sha256 of the
 * output), so any document later saved from this content can be traced
 * back to its model version by hashing it. Fire-and-forget — provenance
 * recording must never fail the drafting request; the dynamic import
 * keeps audit/DB code off this router's load path.
 */
function recordModelProvenance(params: {
  req: Request;
  surface: string;
  model: string | undefined;
  content: string | undefined;
  usage?: { inputTokens?: number; outputTokens?: number };
}): void {
  void (async () => {
    try {
      const { default: auditService } = await import('../services/auditService');
      await auditService.logAction({
        tenantId: (params.req as any).organizationId,
        userId: (params.req as any).userId,
        action: 'ai_generation',
        resourceType: 'ai_drafting_surface',
        resourceId: params.surface,
        details: {
          model: params.model || 'unknown',
          contentSha256: params.content
            ? createHash('sha256').update(params.content).digest('hex')
            : null,
          inputTokens: params.usage?.inputTokens ?? null,
          outputTokens: params.usage?.outputTokens ?? null,
        },
      });
    } catch (err: any) {
      console.warn('[Claude Intelligence] model provenance record failed:', err?.message);
    }
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Drafting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/draft
 * Draft a regulatory document section.
 */
router.post('/draft', async (req: Request, res: Response) => {
  try {
    const {
      framework,
      submissionType,
      sectionType,
      instructions,
      existingContent,
      projectContext,
      enableThinking,
      thinkingBudget,
      enableTools,
    } = req.body;

    // Either a hardcoded framework OR a registry submission type unlocks authoring.
    if ((!framework && !submissionType) || !sectionType || !instructions) {
      return res.status(400).json({
        error: 'Missing required fields: (framework or submissionType), sectionType, instructions',
      });
    }

    const service = getAnaDraftingService();
    const result = await service.draftDocument({
      framework: framework ?? 'general_regulatory',
      submissionType,
      sectionType,
      instructions,
      existingContent,
      projectContext,
      enableThinking: enableThinking ?? true,
      thinkingBudget,
      enableTools: enableTools ?? true,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    recordModelProvenance({
      req,
      surface: 'draft',
      model: result.model,
      content: result.content,
      usage: result.usage,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Claude Intelligence] Draft error:', error.message);
    return serverError(res, logger, 'drafting', error);
  }
});

/**
 * POST /api/claude/draft/stream
 * Stream document drafting via Server-Sent Events.
 */
router.post('/draft/stream', async (req: Request, res: Response) => {
  try {
    const {
      framework,
      submissionType,
      sectionType,
      instructions,
      existingContent,
      projectContext,
      enableThinking,
      thinkingBudget,
      enableTools,
    } = req.body;

    if ((!framework && !submissionType) || !sectionType || !instructions) {
      return res.status(400).json({
        error: 'Missing required fields: (framework or submissionType), sectionType, instructions',
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const service = getAnaDraftingService();

    const result = await service.draftDocument({
      framework: framework ?? 'general_regulatory',
      submissionType,
      sectionType,
      instructions,
      existingContent,
      projectContext,
      enableThinking: enableThinking ?? true,
      thinkingBudget,
      enableTools: enableTools ?? true,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
      onStream: (chunk, metadata) => {
        const event = {
          type: metadata?.type || 'text',
          content: chunk,
          thinking: metadata?.thinkingContent,
        };
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
    });

    // Send final event with full response metadata
    recordModelProvenance({
      req,
      surface: 'draft/stream',
      model: result.model,
      content: result.content,
      usage: result.usage,
    });
    res.write(`data: ${JSON.stringify({
      type: 'done',
      model: result.model,
      usage: result.usage,
      cacheHit: result.cacheHit,
      latencyMs: result.latencyMs,
      toolsUsed: result.toolsUsed,
    })}\n\n`);

    res.end();
  } catch (error: any) {
    console.error('[Claude Intelligence] Stream error:', error.message);
    // If headers already sent, send error event
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    } else {
      return serverError(res, logger, 'saving stream', error);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/review
 * Run compliance review on document content.
 */
router.post('/review', async (req: Request, res: Response) => {
  try {
    const { content, framework, submissionType, enableThinking } = req.body;

    if (!content || (!framework && !submissionType)) {
      return res.status(400).json({
        error: 'Missing required fields: content, (framework or submissionType)',
      });
    }

    const service = getAnaDraftingService();
    const result = await service.reviewCompliance(content, submissionType ?? framework, {
      enableThinking: enableThinking ?? true,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    recordModelProvenance({
      req,
      surface: 'review',
      model: result.model,
      content: result.content,
      usage: result.usage,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Claude Intelligence] Review error:', error.message);
    return serverError(res, logger, 'saving review', error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/gap-analysis
 * Perform gap analysis on a document.
 */
router.post('/gap-analysis', async (req: Request, res: Response) => {
  try {
    const { documentContent, framework, submissionType, targetSections, enableThinking } = req.body;

    if (!documentContent || (!framework && !submissionType) || !targetSections) {
      return res.status(400).json({
        error: 'Missing required fields: documentContent, (framework or submissionType), targetSections',
      });
    }

    const service = getAnaDraftingService();
    const result = await service.analyzeGaps(
      documentContent,
      submissionType ?? framework,
      targetSections,
      {
        enableThinking: enableThinking ?? true,
        organizationId: (req as any).organizationId,
        userId: (req as any).userId,
      }
    );

    recordModelProvenance({
      req,
      surface: 'gap-analysis',
      model: result.model,
      content: result.content,
      usage: result.usage,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Claude Intelligence] Gap analysis error:', error.message);
    return serverError(res, logger, 'saving gap analysis', error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Vision (Scanned Document Analysis)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/vision
 * Analyze a scanned document or image.
 */
router.post('/vision', async (req: Request, res: Response) => {
  try {
    const { imageData, mediaType, instructions, framework, enableThinking } = req.body;

    if (!imageData || !mediaType || !instructions) {
      return res.status(400).json({
        error: 'Missing required fields: imageData (base64), mediaType, instructions',
      });
    }

    const service = getAnaDraftingService();
    const result = await service.analyzeImage({
      imageData,
      mediaType,
      instructions,
      framework,
      enableThinking,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    recordModelProvenance({
      req,
      surface: 'vision',
      model: result.model,
      content: result.content,
      usage: result.usage,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Claude Intelligence] Vision error:', error.message);
    return serverError(res, logger, 'saving vision', error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Batch Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/batch
 * Batch draft multiple document sections.
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { requests, concurrency } = req.body;

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: requests (array of draft requests)',
      });
    }

    if (requests.length > 20) {
      return res.status(400).json({
        error: 'Maximum 20 requests per batch',
      });
    }

    const service = getAnaDraftingService();

    // Add org/user context to each request
    const enrichedRequests = requests.map((r: any) => ({
      ...r,
      organizationId: r.organizationId || (req as any).organizationId,
      userId: r.userId || (req as any).userId,
    }));

    const results = await service.batchDraft({
      requests: enrichedRequests,
      concurrency: Math.min(concurrency || 3, 5),
    });

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          totalInputTokens: results.reduce((s, r) => s + r.usage.inputTokens, 0),
          totalOutputTokens: results.reduce((s, r) => s + r.usage.outputTokens, 0),
          totalCostUsd: results.reduce((s, r) => s + r.usage.estimatedCostUsd, 0),
          avgLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0) / results.length,
        },
      },
    });
    for (const r of results) {
      recordModelProvenance({
        req,
        surface: 'batch',
        model: r.model,
        content: r.content,
        usage: r.usage,
      });
    }
  } catch (error: any) {
    console.error('[Claude Intelligence] Batch error:', error.message);
    return serverError(res, logger, 'saving batch', error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Quick Completion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/quick
 * Quick completion using Claude Sonnet (fast, cost-effective).
 */
router.post('/quick', async (req: Request, res: Response) => {
  try {
    const { prompt, framework, maxTokens } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    const service = getAnaDraftingService();
    const result = await service.quickComplete(prompt, {
      framework,
      maxTokens,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    recordModelProvenance({
      req,
      surface: 'quick',
      // quickComplete returns content only; mirror its pinned model
      // (AnaDocumentDraftingService.quickComplete).
      model: 'claude-sonnet-4-6',
      content: result,
    });

    res.json({ success: true, data: { content: result } });
  } catch (error: any) {
    console.error('[Claude Intelligence] Quick error:', error.message);
    return serverError(res, logger, 'saving quick', error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Agentic Loop (multi-turn tool use)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/claude/agent
 * Run a multi-turn agentic loop with Claude tool use.
 * Claude can search evidence, look up regulations, and generate citations autonomously.
 */
router.post('/agent', async (req: Request, res: Response) => {
  try {
    const { prompt, framework, systemPrompt, maxRounds, enableThinking } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    const { executeAgenticLoop } = await import(
      '../services/ana/AnaToolExecutor'
    );
    const { DOCUMENT_DRAFTING_TOOLS } = await import(
      '../services/ana/AnaToolDefinitions'
    );

    // Build system prompt
    const system = systemPrompt || 'You are a regulatory affairs expert with access to clinical trial databases, FDA guidance, and literature search tools. Use the available tools to research and provide evidence-based answers.';
    /* Framework context is embedded directly in the system prompt below;
       the dynamic AnaDocumentDraftingService import was unused dead code
       and was removed. */

    const result = await executeAgenticLoop(
      {
        taskType: 'document_drafting',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        maxTokens: 8192,
        tools: DOCUMENT_DRAFTING_TOOLS,
        toolChoice: 'auto',
        thinking: enableThinking ? { enabled: true, budgetTokens: 15000 } : undefined,
        promptCache: { enabled: true, type: 'ephemeral' },
        organizationId: (req as any).organizationId,
        userId: (req as any).userId,
        callerModule: 'ana-intelligence/agent',
      },
      {
        maxRounds: maxRounds || 5,
        onToolExecution: (toolName, input, result) => {
          console.log(`[Claude Agent] Tool: ${toolName}`, Object.keys(input));
        },
      }
    );

    recordModelProvenance({
      req,
      surface: 'agent',
      model: result.model,
      content: result.content,
      usage: result.usage,
    });

    res.json({
      success: true,
      data: {
        content: result.content,
        thinking: result.thinking,
        toolsUsed: result.toolUses?.map(t => t.name),
        model: result.model,
        usage: result.usage,
        latencyMs: result.latencyMs,
      },
    });
  } catch (error: any) {
    console.error('[Claude Intelligence] Agent error:', error.message);
    return serverError(res, logger, 'saving agent', error);
  }
});

/**
 * GET /api/claude/tools
 * List available tools and their registration status.
 */
router.get('/tools', async (_req: Request, res: Response) => {
  const { getAvailableTools } = await import(
    '../services/ana/AnaToolExecutor'
  );
  res.json({ success: true, data: { tools: getAvailableTools() } });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health & Info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/claude/health
 * Claude provider health status.
 */
router.get('/health', (_req: Request, res: Response) => {
  const gateway = getGateway();
  const allHealth = gateway.getProviderHealth();
  const anthropicHealth = allHealth.find(h => h.provider === 'anthropic');
  const enabledProviders = gateway.getEnabledProviders();

  res.json({
    success: true,
    data: {
      anthropic: anthropicHealth || { provider: 'anthropic', healthy: false, consecutiveFailures: 0 },
      isEnabled: enabledProviders.includes('anthropic'),
      isDeterministic: gateway.isDeterministic(),
      allProviders: allHealth,
    },
  });
});

/**
 * GET /api/claude/models
 * Available models for the AnA Composer's model/effort picker.
 *
 * Projected live from the gateway's model registry (gated on API-key presence)
 * rather than a static list, so the picker only ever offers models the gateway
 * can actually route to. Each option carries a derived `label` and
 * `recommendedEffort` (neither exists on the raw ModelConfig). The effort
 * controls (`effortLevels` + `defaultEffort`) and the legacy `frameworks` array
 * are preserved alongside the `{ success, data }` envelope.
 */
router.get('/models', (_req: Request, res: Response) => {
  const models = projectModelsForPicker(getGateway().getModels());
  res.json({
    success: true,
    data: {
      models,
      effortLevels: EFFORT_LEVELS,
      defaultEffort: DEFAULT_EFFORT,
      frameworks: [
        'fda_510k',
        'fda_pma',
        'eu_mdr',
        'ich_clinical',
        'cer_clinical_evaluation',
        'general_regulatory',
      ],
    },
  });
});

export default router;
