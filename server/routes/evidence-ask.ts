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

const router = Router();

const ragService = new ForesightRAGService();

// Rate limit: 15 ask queries per minute per user
const askRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Data Room queries — please wait.' },
  keyGenerator: (req: any) => {
    const userId = req.userId || req.user?.id || 'anon';
    const orgId = req.header('x-organization-id') || 'unknown';
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
 * Response:
 *   answer: string
 *   sources: Array<{ docId, docTitle, text, score }>
 *   confidence: number
 */
router.post('/ask', authMiddleware, askRateLimiter, async (req: Request, res: Response) => {
  try {
    const { question, projectId, context } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({
        error: 'Question is required (minimum 3 characters)',
      });
    }

    // Build context prefix with project info if available
    const contextParts: string[] = [];
    if (projectId) {
      contextParts.push(`Project context: project ID ${projectId}`);
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

    return res.json({
      answer: result.answer,
      sources: result.sources.map(source => ({
        docId: source.docId,
        docTitle: source.docTitle,
        excerpt: source.text?.slice(0, 500) || '',
        relevanceScore: Math.round(source.score * 100) / 100,
      })),
      confidence: Math.round(result.confidence * 100) / 100,
      question: question.trim(),
    });
  } catch (error: any) {
    console.error('[Evidence Ask] Query failed:', error);

    // Graceful degradation: return a structured error the UI can display
    return res.status(502).json({
      error: 'Data Room search is temporarily unavailable',
      message: error.message || 'Please try again later',
      answer: null,
      sources: [],
      confidence: 0,
    });
  }
});

export default router;
