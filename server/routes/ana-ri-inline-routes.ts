/**
 * ana-ri-inline-routes.ts
 * Express Router for the AnA 1.0 RI endpoint + compatibility facades
 * Extracted from server/index.ts for maintainability.
 *
 * Mount with: app.use('/api', createAnaRiInlineRoutes(pool, deps))
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import type { Request, Response } from 'express';

interface AnaRiDeps {
  csrSearchService: any;
  getEndpointRecommenderService: () => any;
  /**
   * Retained only so the composition root's existing call site keeps
   * typechecking. Its sole consumer was the retired /ask-ana-ri handler, so it
   * is now unused here; drop it together with the register-inline-routes.ts
   * injection in a follow-up that can touch that 1,236-line file safely.
   */
  sanitizeAskAnaInput?: (input: any) => any;
}

export function createAnaRiInlineRoutes(pool: Pool, deps: AnaRiDeps): Router {
  const router = Router();
  const { csrSearchService, getEndpointRecommenderService } = deps;

router.post('/search/vector', async (req: Request, res: Response) => {
  try {
    const query = String(req.body?.query || '').trim();
    const k = Math.max(1, parseInt(String(req.body?.k || 5), 10));
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const searchResult = await csrSearchService.searchCSRs({
      query_text: query,
      limit: Math.min(50, k),
    });

    const vectorLikeRows = (searchResult.csrs || []).slice(0, k).map((csr: any, idx: number) => ({
      content: csr.summary || csr.context_summary || csr.outcome || csr.title || '',
      relevance:
        typeof csr.relevance_score === 'number'
          ? csr.relevance_score
          : typeof csr.similarity === 'number'
          ? csr.similarity
          : null,
      document_id: csr.id || csr.csr_id || idx,
      document_title: csr.title || 'Untitled CSR',
      source_page: csr.source_page ?? null,
      source_section: csr.source_section || csr.phase || null,
    }));

    return res.json(vectorLikeRows);
  } catch (error) {
    console.error('Vector search failed:', error);
    return res.status(500).json({ error: 'Vector search failed' });
  }
});

// Endpoint recommendation compatibility facade (P0 route recovery)
router.post('/endpoint/recommend', async (req: Request, res: Response) => {
  try {
    const indication = String(req.body?.indication || 'General');
    const phase = String(req.body?.phase || 'Phase 2');
    const therapeuticArea = String(req.body?.therapeuticArea || '');
    const service = getEndpointRecommenderService();
    const recommendations = await service.getComprehensiveEndpointRecommendations(
      indication,
      phase,
      10,
      therapeuticArea
    );

    return res.json(
      recommendations.map((rec: any) => ({
        endpoint: rec.endpoint,
        summary:
          rec.evidence?.[0]?.reference_text ||
          `${phase} ${indication} endpoint recommendation based on available evidence.`,
        matchCount: rec.occurrence_count ?? 0,
        successRate:
          typeof rec.success_rate === 'number'
            ? rec.success_rate > 1
              ? rec.success_rate / 100
              : rec.success_rate
            : null,
        reference: rec.evidence?.[0]?.title || null,
      }))
    );
  } catch (error) {
    console.error('Endpoint recommendation failed:', error);
    return res.status(500).json({ error: 'Endpoint recommendation failed' });
  }
});

// Retention policy compatibility facade (P0 route recovery)
const RETENTION_SERVICE_UNAVAILABLE = {
  success: false,
  error: 'Retention service unavailable',
  message:
    'Retention policy APIs are temporarily disabled until persistent storage and job execution are fully wired.',
};

router.get('/retention/policies', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.get('/retention/document-types', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.post('/retention/policies', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.put('/retention/policies/:id', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.delete('/retention/policies/:id', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.post('/retention/run-job', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

// AnA 1.0 RI endpoint — RETIRED, fails closed.
//
// This route used to answer regulatory questions two ways, and both were wrong.
//
// Its only inference branch was `model === 'gemini' && GOOGLE_API_KEY`, calling
// GoogleGenerativeAI directly. That bypasses the AI gateway entirely — no
// residency decision, no zero-retention posture, no PII screen, no audit row.
// scripts/ci/gateway-bypass-baseline.json already records it as exactly that.
//
// Worse: the request default is `model = 'openai'`, which matched no branch, so
// the DEFAULT call fell through to an `else` that returned hand-written prose —
// "Based on current FDA guidelines, I recommend..." — in AnA's first person,
// citing ICH Q, ICH E3 and REMS, with the caller's own query interpolated back
// in so it read as a considered answer. No model was consulted. For a regulatory
// product that is the trust-destroying event the platform exists to prevent:
// fabricated guidance, indistinguishable from real analysis, at HTTP 200.
//
// It has no callers — none in client/, server/, tests/ or scripts/ — and the
// beta contract already says "Do not expose /api/ask-ana-ri" and treats it as a
// parallel legacy surface. So it is retired rather than repaired: rebuilding it
// would mean a third full-capability brain beside /api/ana-ri/stream and
// /api/chat/send-message, which the zero-duplication rule forbids.
//
// Callers wanting a real answer should use POST /api/ana-ri/stream (canonical,
// streaming) or POST /api/chat/send-message (canonical, non-streaming JSON).
// Both carry the full tool surface, memory assembly and governed provenance.
const ASK_ANA_RI_RETIRED = {
  success: false,
  error: 'Endpoint retired',
  message:
    'POST /api/ask-ana-ri has been retired. It returned hand-written template ' +
    'guidance rather than model output on its default path, and bypassed the AI ' +
    'gateway on the other. Use POST /api/ana-ri/stream (streaming) or ' +
    'POST /api/chat/send-message (non-streaming) — both carry the full tool ' +
    'surface, memory, and governed provenance.',
  canonicalEndpoints: ['/api/ana-ri/stream', '/api/chat/send-message'],
};

router.post('/ask-ana-ri', async (_req: Request, res: Response) => {
  return res.status(503).json(ASK_ANA_RI_RETIRED);
});

  return router;
}
