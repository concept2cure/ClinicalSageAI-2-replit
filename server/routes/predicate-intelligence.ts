/**
 * Phase 6.6 — Predicate Intelligence BFF Routes
 *
 * Proxy routes from the BFF to the Shadow Service's /predicate/* endpoints.
 * All routes require JWT auth + program ownership verification.
 *
 * Endpoints:
 *   POST /api/predicate-intelligence/candidates            → /predicate/candidates
 *   GET  /api/predicate-intelligence/candidates             → /predicate/candidates
 *   GET  /api/predicate-intelligence/candidates/:id         → /predicate/candidates/:id
 *   PATCH /api/predicate-intelligence/candidates/:id/status → /predicate/candidates/:id/status
 *   POST /api/predicate-intelligence/analyze                → /predicate/analyze
 *   POST /api/predicate-intelligence/defense-preview        → /predicate/defense-preview
 *   GET  /api/predicate-intelligence/defense-preview        → /predicate/defense-preview
 *   POST /api/predicate-intelligence/se-matrix              → /predicate/se-matrix
 *   GET  /api/predicate-intelligence/se-matrix              → /predicate/se-matrix
 *   PATCH /api/predicate-intelligence/se-matrix/:id         → /predicate/se-matrix/:id
 *   GET  /api/predicate-intelligence/radar                  → /predicate/radar
 *   POST /api/predicate-intelligence/generate-510k-preview  → /predicate/generate-510k-preview
 *
 * @phase 6.6 — Predicate Intelligence
 */

import { Router, Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { regulatoryPrograms } from '../../shared/schema/programs.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

function getShadowUrl(): string {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function getAdminToken(): string {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════════

router.use(authenticateToken);

function requireConfigured(_req: Request, res: Response, next: NextFunction) {
  if (!getAdminToken()) {
    return res.status(503).json({
      error: 'Predicate Intelligence not configured',
      detail: 'REVIEW_ADMIN_TOKEN is not set',
    });
  }
  next();
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction) {
  const programId = String(req.query.program_id || req.body?.program_id || '');
  if (!programId) {
    return res.status(422).json({ error: 'program_id is required' });
  }

  const userOrgId = (req as any).user?.organizationId;
  if (!userOrgId) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  try {
    const orgId = typeof userOrgId === 'string' ? parseInt(userOrgId, 10) : userOrgId;
    if (isNaN(orgId)) {
      return res.status(403).json({ error: 'Invalid organization context' });
    }

    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId))
      )
      .limit(1);

    if (!program) {
      console.warn(`[predicate-intel] IDOR blocked: org=${orgId} tried program=${programId}`);
      return res.status(403).json({
        error: 'Access denied',
        detail: 'You do not have access to this program',
      });
    }

    next();
  } catch (err: any) {
    console.error('[predicate-intel] program access check failed:', err.message);
    return res.status(500).json({
      error: 'Program access check failed',
      detail: 'Service unavailable',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Proxy helper
// ═══════════════════════════════════════════════════════════════════════════════

async function proxyToShadow(
  shadowPath: string,
  options: {
    method?: string;
    query?: Record<string, string>;
    body?: unknown;
    binary?: boolean;
  } = {}
): Promise<{
  status: number;
  body: string;
  contentType: string;
  rawBuffer?: Buffer;
  rawHeaders?: Record<string, string>;
}> {
  const url = new URL(shadowPath, getShadowUrl());
  const token = getAdminToken();

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { 'X-Admin-Token': token };
  const fetchOptions: Record<string, unknown> = { method: options.method || 'GET', headers };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), fetchOptions);
  const contentType = response.headers.get('content-type') || 'application/json';

  // Binary mode: return raw buffer for DOCX/ZIP downloads
  if (options.binary) {
    const arrayBuf = await response.arrayBuffer();
    const rawHeaders: Record<string, string> = {};
    const cd = response.headers.get('content-disposition');
    if (cd) rawHeaders['content-disposition'] = cd;
    return {
      status: response.status,
      body: '',
      contentType,
      rawBuffer: Buffer.from(arrayBuf),
      rawHeaders,
    };
  }

  const body = await response.text();
  return { status: response.status, body, contentType };
}

function sendProxyResponse(
  res: Response,
  result: {
    status: number;
    body: string;
    contentType: string;
    rawBuffer?: Buffer;
    rawHeaders?: Record<string, string>;
  }
) {
  // Binary responses: forward buffer directly
  if (result.rawBuffer) {
    if (result.rawHeaders) {
      for (const [k, v] of Object.entries(result.rawHeaders)) {
        res.set(k, v);
      }
    }
    res.status(result.status).set('Content-Type', result.contentType).send(result.rawBuffer);
    return;
  }
  res.status(result.status).set('Content-Type', result.contentType).send(result.body);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suggest — Phase 6.6.B Predicate Suggestion Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/predicate-intelligence/suggest?program_id=...
 *
 * Returns top 5 predicate suggestions with explainability.
 * Body: { program_id, product_code, device_name, intended_use, technology_description, ...optional fields }
 *
 * Error normalization per spec:
 *   403 → "You don't have access to this program."
 *   503 → "Predicate universe not configured or stale."
 *   422 → validation errors passthrough
 *   others → passthrough
 */
router.post('/suggest', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/suggest', {
      method: 'POST',
      body: req.body,
    });

    // Normalize shadow errors per spec
    if (result.status === 503) {
      try {
        const parsed = JSON.parse(result.body);
        return res.status(503).json({
          error: 'Predicate universe not configured or stale',
          detail: parsed.detail || 'FDA universe not ready',
        });
      } catch {
        return res.status(503).json({ error: 'Predicate universe not configured or stale' });
      }
    }

    sendProxyResponse(res, result);
  } catch (err: any) {
    console.error('[predicate-intel] suggest proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Candidates
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/candidates', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/candidates', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

router.get('/candidates', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/candidates', {
      query: { program_id: String(req.query.program_id) },
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

router.get('/candidates/:id', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow(`/predicate/candidates/${req.params.id}`, {
      query: { program_id: String(req.query.program_id) },
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

router.patch(
  '/candidates/:id/status',
  requireConfigured,
  requireProgramAccess,
  async (req, res) => {
    try {
      const result = await proxyToShadow(`/predicate/candidates/${req.params.id}/status`, {
        method: 'PATCH',
        body: req.body,
      });
      sendProxyResponse(res, result);
    } catch (err: any) {
      res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Analysis
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/analyze', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/analyze', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Defense Preview (Shadow 510(k) Reviewer)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/defense-preview', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/defense-preview', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

router.get('/defense-preview', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const query: Record<string, string> = { program_id: String(req.query.program_id) };
    if (req.query.candidate_id) query.candidate_id = String(req.query.candidate_id);
    const result = await proxyToShadow('/predicate/defense-preview', { query });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SE Matrix
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/se-matrix', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/se-matrix', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

router.get('/se-matrix', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const query: Record<string, string> = { program_id: String(req.query.program_id) };
    if (req.query.candidate_id) query.candidate_id = String(req.query.candidate_id);
    const result = await proxyToShadow('/predicate/se-matrix', { query });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

router.patch('/se-matrix/:id', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow(`/predicate/se-matrix/${req.params.id}`, {
      method: 'PATCH',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Predicate Radar (scatter plot data)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/radar', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/radar', {
      query: { program_id: String(req.query.program_id) },
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full Pipeline — Generate 510(k) Preview
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/generate-510k-preview', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/generate-510k-preview', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — Generate SE Matrix (auto-populated)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/generate-se-matrix', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/generate-se-matrix', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A — Predicate Universe Health Check
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', requireConfigured, async (_req, res) => {
  try {
    const result = await proxyToShadow('/predicate/health');
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.B — Deterministic Reviewer Questions
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/reviewer-questions', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/reviewer-questions', {
      method: 'POST',
      body: req.body,
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A — Toxic Predicate Detail (with signal citations)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/toxic-detail/:kNumber', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow(`/predicate/toxic-detail/${req.params.kNumber}`, {
      query: { program_id: String(req.query.program_id) },
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — Render SE Matrix DOCX (binary stream)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/render-se-docx', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/render-se-docx', {
      method: 'POST',
      body: req.body,
      responseType: 'stream',
    });
    // Forward the binary stream directly
    if (result.headers) {
      const cd = result.headers['content-disposition'];
      if (cd) res.set('Content-Disposition', cd);
    }
    res.set(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.D — Download Defense Packet (ZIP stream)
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/download-defense-packet',
  requireConfigured,
  requireProgramAccess,
  async (req, res) => {
    try {
      const result = await proxyToShadow('/predicate/download-defense-packet', {
        method: 'POST',
        body: req.body,
        responseType: 'stream',
      });
      if (result.headers) {
        const cd = result.headers['content-disposition'];
        if (cd) res.set('Content-Disposition', cd);
      }
      res.set('Content-Type', 'application/zip');
      sendProxyResponse(res, result);
    } catch (err: any) {
      res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Program-scoped convenience route per spec 6.6.B.2
// POST /api/predicate-intelligence/programs/:programId/suggestions
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/programs/:programId/suggestions', requireConfigured, async (req, res, next) => {
  // Inject programId into body and query for downstream middleware/proxy
  const programId = req.params.programId;
  req.body = { ...req.body, program_id: programId };
  req.query = { ...req.query, program_id: programId };
  // Run through program access check then forward to suggest
  requireProgramAccess(req, res, async () => {
    try {
      const result = await proxyToShadow('/predicate/suggest', {
        method: 'POST',
        body: req.body,
      });

      if (result.status === 503) {
        try {
          const parsed = JSON.parse(result.body);
          return res.status(503).json({
            error: 'Predicate universe not configured or stale',
            detail: parsed.detail || 'FDA universe not ready',
          });
        } catch {
          return res.status(503).json({ error: 'Predicate universe not configured or stale' });
        }
      }

      sendProxyResponse(res, result);
    } catch (err: any) {
      console.error('[predicate-intel] program-scoped suggest error:', err.message);
      res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C-V2 — Evidence-Linked SE Matrix (risk_code + evidence_task_ids)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/predicate-intelligence/generate-se-matrix-v2
 *
 * Generate V2 SE matrix with risk_code → evidence_task_ids linkage.
 * Returns: SEMatrixPayloadV2 with comparison_rows, evidence_tasks, score.
 */
router.post('/generate-se-matrix-v2', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/generate-se-matrix-v2', {
      method: 'POST',
      body: req.body,
    });

    if (result.status === 503) {
      try {
        const parsed = JSON.parse(result.body);
        return res.status(503).json({
          error: 'Predicate Intelligence not ready',
          detail: parsed.detail || 'Shadow service degraded',
        });
      } catch {
        return res.status(503).json({ error: 'Predicate Intelligence not ready' });
      }
    }

    sendProxyResponse(res, result);
  } catch (err: any) {
    console.error('[predicate-intel] SE matrix V2 generation error:', err.message);
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

/**
 * POST /api/predicate-intelligence/render-se-docx-v2
 *
 * Render V2 Evidence-Linked SE Matrix as downloadable DOCX with evidence
 * footnotes, risk_code badges, and yellow-highlighted missing evidence cells.
 */
router.post('/render-se-docx-v2', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/render-se-docx-v2', {
      method: 'POST',
      body: req.body,
      binary: true,
    });

    if (result.status === 503) {
      try {
        const parsed = JSON.parse(result.body);
        return res.status(503).json({
          error: 'Predicate Intelligence not ready',
          detail: parsed.detail || 'Shadow service degraded',
        });
      } catch {
        return res.status(503).json({ error: 'Predicate Intelligence not ready' });
      }
    }

    if (result.rawBuffer && result.contentType?.includes('openxmlformats')) {
      const disposition =
        result.rawHeaders?.['content-disposition'] || 'attachment; filename="SE_Matrix_V2.docx"';
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', disposition);
      return res.status(result.status).send(result.rawBuffer);
    }

    sendProxyResponse(res, result);
  } catch (err: any) {
    console.error('[predicate-intel] SE DOCX V2 render error:', err.message);
    res.status(502).json({ error: 'Shadow service unavailable', detail: 'Service unavailable' });
  }
});

export default router;
