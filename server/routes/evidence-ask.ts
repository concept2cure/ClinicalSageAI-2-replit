/**
 * Evidence Ask Endpoint — Data Room / Ask capability
 *
 * POST /api/evidence/ask
 *
 * Wires the AskDataRoomPanel UI to ForesightRAGService backend.
 * Enables semantic Q&A over project documents with source citations.
 *
 * Per directive: "Data Room / Ask Must Be Surfaced as a First-Class Document Support Loop"
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth';
import { ForesightRAGService } from '../services/foresight-rag-service.js';
import rateLimit from 'express-rate-limit';
import {
  getProjectIntelligence,
  getProjectIngestedDocuments,
} from '../services/client-intelligence-memory.js';

const router = Router();

const ragService = new ForesightRAGService();

// ── Response envelope helpers (per UI standards skill §6) ─────────────────────

function sendSuccess(res: Response, data: unknown, meta?: Record<string, unknown>) {
  return res.json({ success: true, data, ...(meta || {}) });
}

function sendError(res: Response, status: number, message: string, details?: unknown, code?: string) {
  return res.status(status).json({ success: false, error: message, details, code });
}

// Rate limit: 15 ask queries per minute per user
const askRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Data Room queries — please wait.' },
  keyGenerator: (req: Request) => {
    const userId = (req as Record<string, unknown>).userId as string || 'anon';
    const orgId = String((req as any).user?.organizationId || (req as any).tenantId || 'unknown');
    return `evidence-ask:${orgId}:${userId}`;
  },
});

/**
 * POST /api/evidence/ask
 *
 * Request body:
 *   question: string (required)
 *   projectId?: string
 *   context?: string (optional additional context)
 *
 * Response (envelope):
 *   success: true
 *   data: { answer, sources, confidence, question, projectId }
 */
router.post('/ask', authMiddleware, askRateLimiter, async (req: Request, res: Response) => {
  try {
    const { question, projectId, context } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return sendError(res, 400, 'Question is required (minimum 3 characters)', null, 'VALIDATION_ERROR');
    }

    // Tenant scoping — ensure queries are scoped to the user's organization
    const userId = (req as Record<string, unknown>).userId as number | undefined;
    const orgId = String((req as any).user?.organizationId || (req as any).tenantId || '');

    // Build context prefix with project and tenant info
    const contextParts: string[] = [];
    if (projectId) {
      contextParts.push(`Project context: project ID ${projectId}`);
      contextParts.push('Scope retrieval and answering to project-specific evidence when available.');
      const numericProjectId = parseInt(String(projectId), 10);
      if (!Number.isNaN(numericProjectId) && numericProjectId > 0) {
        try {
          const profile = await getProjectIntelligence(numericProjectId);
          if (profile?.id) {
            const docs = await getProjectIngestedDocuments(profile.id);
            if (docs.length > 0) {
              const docNames = docs
                .slice(0, 10)
                .map(d => d.fileName)
                .filter(Boolean)
                .join(', ');
              contextParts.push(`Prioritize these uploaded project documents: ${docNames}`);
            }
          }
        } catch (error) {
          console.warn('[Evidence Ask] Failed to enrich with project-intelligence docs', error);
        }
      }
    }
    if (orgId) {
      contextParts.push(`Organization: ${orgId}`);
    }
    if (context) {
      contextParts.push(context);
    }

    const result = await ragService.query({
      query: question.trim(),
      context: contextParts.length > 0 ? contextParts.join('\n') : undefined,
      maxTokens: 1500,
      temperature: 0.2,
    });

    return sendSuccess(res, {
      answer: result.answer,
      sources: result.sources.map(source => ({
        docId: source.docId,
        docTitle: source.docTitle,
        excerpt: source.text?.slice(0, 500) || '',
        relevanceScore: Math.round(source.score * 100) / 100,
      })),
      confidence: Math.round(result.confidence * 100) / 100,
      question: question.trim(),
      projectId: projectId || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Evidence Ask] Query failed:', message);

    return sendError(res, 502, 'Data Room search is temporarily unavailable', { message }, 'RAG_UNAVAILABLE');
  }
});

export default router;
