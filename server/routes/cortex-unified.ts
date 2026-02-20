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
 * - lumen-cortex.ts (Lumen integration)
 *
 * @version 2.0.0
 * @module server/routes/cortex-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { buildContextAwarePrompt } from '../services/lumen-context-builder.js';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayResponse } from '../services/ai-gateway/types.js';
import {
  getOrCreateThread,
  getThreadMessages,
  saveChatMessage,
} from '../services/chat-thread-helpers.js';

const logger = createScopedLogger('cortex-unified');
const router = Router();

// Security constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 50; // Lower limit for AI queries

// Rate limiter for expensive AI operations
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const clientId = (req.headers['x-organization-id'] as string) || req.ip || 'anonymous';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let record = rateLimitMap.get(clientId);

  if (!record || record.resetTime < windowStart) {
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
  const organizationId = (req.headers['x-organization-id'] as string) || null;
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
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
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
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'cortex-unified-api',
    version: '2.0.0',
    modules: ['advisory', 'management', 'query', 'lumen'],
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
      '/lumen': {
        description: 'Lumen integration features',
        methods: ['GET', 'POST'],
        legacyPath: '/api/lumen-cortex/*',
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
// POST /api/cortex/chat — Primary endpoint for ZenChat / Lumen Cortex
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
 * Context-aware chat endpoint for Lumen Cortex.
 * Accepts project_id and automatically injects project context into the system prompt.
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, thread_id, project_id, submission_type, system_prompt, stream } =
      req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
    }

    const organizationId =
      parseInt((req as any).tenantContext?.organizationId, 10) ||
      parseInt(req.headers['x-organization-id'] as string, 10) ||
      1;
    const userId = (req as any).userId || (req as any).user?.id || null;

    // Resolve project ID — strip "proj_" prefix if present (concept2cure format)
    let numericProjectId: number | undefined;
    if (project_id) {
      const cleaned = String(project_id).replace(/^proj_/, '');
      numericProjectId = parseInt(cleaned, 10) || undefined;
    }

    // Build context-aware system prompt
    const { systemPrompt, context } = await buildContextAwarePrompt({
      projectId: numericProjectId,
      organizationId,
      userId,
      submissionType: submission_type,
      customSystemPrompt: system_prompt,
    });

    // Get or create thread (prefix 'cortex' to distinguish from legacy chat)
    const threadId = await getOrCreateThread(thread_id, userId, 'cortex');
    const previousMessages = await getThreadMessages(threadId);

    let assistantMessage: string;
    let model = 'lumen-cortex-demo';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Route through AI Gateway
    const gw = ensureChatGateway();
    if (gw && gw.getEnabledProviders().length > 0) {
      try {
        const gwMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...previousMessages.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user' as const, content: message },
        ];

        logger.info(
          `[Chat] Sending context-aware message (project=${numericProjectId || 'none'}, sub=${context.project?.submissionType || 'none'})`
        );

        const gwResponse: GatewayResponse = await gw.route({
          taskType: 'chat',
          messages: gwMessages,
          temperature: 0.7,
          maxTokens: 4000,
          callerModule: 'lumen-cortex-chat',
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
        model = 'lumen-cortex-demo';
      }
    } else {
      assistantMessage = generateContextAwareDemoResponse(message, context);
    }

    // Persist messages
    await saveChatMessage(threadId, 'user', message, model);
    await saveChatMessage(threadId, 'assistant', assistantMessage, model, usage.total_tokens);

    res.json({
      answer: assistantMessage,
      response: assistantMessage,
      thread_id: threadId,
      usage,
      model,
      context: {
        projectName: context.project?.name || null,
        submissionType: context.project?.submissionType || submission_type || null,
        progress: context.project?.progress || null,
        documentsTotal: context.documents?.totalDocuments || 0,
        documentsCompleted: context.documents?.completedDocuments || 0,
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

/**
 * Demo response generator that uses project context for relevance.
 */
function generateContextAwareDemoResponse(
  message: string,
  context: import('../services/lumen-context-builder.js').LumenContext
): string {
  const lower = message.toLowerCase();
  const projectName = context.project?.name || 'your project';
  const subType = context.project?.submissionType || 'regulatory submission';
  const progress = context.project?.progress || 0;

  if (lower.includes('status') || lower.includes('progress') || lower.includes('where')) {
    return `## ${projectName} — Status Overview

**Submission Type**: ${subType}
**Overall Progress**: ${progress}%
${context.documents ? `**Documents**: ${context.documents.completedDocuments}/${context.documents.totalDocuments} completed` : ''}

### Recommended Next Steps

1. ${progress < 30 ? 'Complete Module 1 administrative forms (FDA 1571, 1572)' : progress < 60 ? 'Finalize Module 2 summaries and Module 3 CMC data' : 'Complete QA review and prepare eCTD package for submission'}
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
| **M1** | Regional Administrative (FDA Forms, Cover Letter) | ${progress > 20 ? '✅ In Progress' : '⬜ Not Started'} |
| **M2** | CTD Summaries (QOS, Nonclinical/Clinical Overviews) | ${progress > 40 ? '✅ In Progress' : '⬜ Not Started'} |
| **M3** | Quality/CMC (Drug Substance S.1-S.7, Drug Product P.1-P.8) | ${progress > 50 ? '✅ In Progress' : '⬜ Not Started'} |
| **M4** | Nonclinical Study Reports (Pharm, PK, Tox) | ${progress > 60 ? '✅ In Progress' : '⬜ Not Started'} |
| **M5** | Clinical (Phase 1 Protocol, Study Reports) | ${progress > 70 ? '✅ In Progress' : '⬜ Not Started'} |

### Key References
- **21 CFR 312.23(a)** — Content and format of an IND
- **ICH M4** — The Common Technical Document
- **ICH M8** — eCTD v4.0 Implementation Guide

What specific module or section would you like help with?`;
  }

  if (lower.includes('help') || lower.includes('what can') || lower.includes('how')) {
    return `## How I Can Help with ${projectName}

I'm Lumen Cortex, your AI regulatory intelligence engine. For your **${subType}** submission, I can:

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

  // Lumen integration
  try {
    const lumenModule = await import('./lumen-cortex');
    router.use('/lumen', lumenModule.default);
    logger.info('Mounted: /lumen (Lumen integration)');
  } catch (error) {
    logger.error('Failed to mount Lumen routes:', error);
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

// Initialize sub-routers
mountSubRouters().catch(error => {
  logger.error('Failed to initialize Cortex unified router:', error);
});

// Cleanup interval for rate limiter
setInterval(
  () => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    Array.from(rateLimitMap.entries()).forEach(([key, value]) => {
      if (value.resetTime < windowStart) {
        rateLimitMap.delete(key);
      }
    });
  },
  5 * 60 * 1000
);

router.use(errorHandler);

export default router;
