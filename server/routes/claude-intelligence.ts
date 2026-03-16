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
import {
  getClaudeDraftingService,
  type DocumentDraftRequest,
  type RegulatoryFramework,
} from '../services/claude/ClaudeDocumentDraftingService';
import { getGateway } from '../services/ai-gateway/gateway';

const router = Router();

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
      sectionType,
      instructions,
      existingContent,
      projectContext,
      enableThinking,
      thinkingBudget,
      enableTools,
    } = req.body;

    if (!framework || !sectionType || !instructions) {
      return res.status(400).json({
        error: 'Missing required fields: framework, sectionType, instructions',
      });
    }

    const service = getClaudeDraftingService();
    const result = await service.draftDocument({
      framework,
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

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Claude Intelligence] Draft error:', error.message);
    res.status(500).json({
      error: 'Document drafting failed',
      details: error.message,
    });
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
      sectionType,
      instructions,
      existingContent,
      projectContext,
      enableThinking,
      thinkingBudget,
      enableTools,
    } = req.body;

    if (!framework || !sectionType || !instructions) {
      return res.status(400).json({
        error: 'Missing required fields: framework, sectionType, instructions',
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const service = getClaudeDraftingService();

    const result = await service.draftDocument({
      framework,
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
      res.status(500).json({ error: error.message });
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
    const { content, framework, enableThinking } = req.body;

    if (!content || !framework) {
      return res.status(400).json({
        error: 'Missing required fields: content, framework',
      });
    }

    const service = getClaudeDraftingService();
    const result = await service.reviewCompliance(content, framework, {
      enableThinking: enableThinking ?? true,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Claude Intelligence] Review error:', error.message);
    res.status(500).json({ error: error.message });
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
    const { documentContent, framework, targetSections, enableThinking } = req.body;

    if (!documentContent || !framework || !targetSections) {
      return res.status(400).json({
        error: 'Missing required fields: documentContent, framework, targetSections',
      });
    }

    const service = getClaudeDraftingService();
    const result = await service.analyzeGaps(
      documentContent,
      framework,
      targetSections,
      {
        enableThinking: enableThinking ?? true,
        organizationId: (req as any).organizationId,
        userId: (req as any).userId,
      }
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Claude Intelligence] Gap analysis error:', error.message);
    res.status(500).json({ error: error.message });
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

    const service = getClaudeDraftingService();
    const result = await service.analyzeImage({
      imageData,
      mediaType,
      instructions,
      framework,
      enableThinking,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Claude Intelligence] Vision error:', error.message);
    res.status(500).json({ error: error.message });
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

    const service = getClaudeDraftingService();

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
  } catch (error: any) {
    console.error('[Claude Intelligence] Batch error:', error.message);
    res.status(500).json({ error: error.message });
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

    const service = getClaudeDraftingService();
    const result = await service.quickComplete(prompt, {
      framework,
      maxTokens,
      organizationId: (req as any).organizationId,
      userId: (req as any).userId,
    });

    res.json({ success: true, data: { content: result } });
  } catch (error: any) {
    console.error('[Claude Intelligence] Quick error:', error.message);
    res.status(500).json({ error: error.message });
  }
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
 * Available Claude models.
 */
router.get('/models', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      models: [
        {
          id: 'claude-opus-4',
          model: 'claude-opus-4-20250514',
          description: 'Most capable model — regulatory document drafting, complex analysis, extended thinking',
          contextWindow: 200000,
          maxOutput: 32768,
          pricing: { input: '$15/MTok', output: '$75/MTok' },
          features: ['extended_thinking', 'tool_use', 'vision', 'prompt_caching', 'streaming'],
          bestFor: ['document_drafting', 'regulatory_review', 'gap_analysis', 'complex_reasoning'],
        },
        {
          id: 'claude-sonnet-4',
          model: 'claude-sonnet-4-20250514',
          description: 'Best balance of speed and capability — chat, analysis, vision, code',
          contextWindow: 200000,
          maxOutput: 16384,
          pricing: { input: '$3/MTok', output: '$15/MTok' },
          features: ['extended_thinking', 'tool_use', 'vision', 'prompt_caching', 'streaming'],
          bestFor: ['chat', 'document_analysis', 'structured_output', 'vision'],
        },
        {
          id: 'claude-haiku-4',
          model: 'claude-haiku-4-5-20251001',
          description: 'Fastest and most affordable — summaries, simple queries, structured extraction',
          contextWindow: 200000,
          maxOutput: 8192,
          pricing: { input: '$0.80/MTok', output: '$4/MTok' },
          features: ['tool_use', 'vision', 'streaming'],
          bestFor: ['chat', 'summarization', 'structured_output'],
        },
      ],
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
