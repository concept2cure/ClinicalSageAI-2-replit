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
import { db } from '../../db';
import { regulatoryPrograms } from '@shared/schema';
import { authenticateToken } from '../middleware/auth';

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
      detail: err.message,
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
  result: { status: number; body: string; contentType: string; rawBuffer?: Buffer; rawHeaders?: Record<string, string> }
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
  }
});

router.get('/candidates', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow('/predicate/candidates', {
      query: { program_id: String(req.query.program_id) },
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
  }
});

router.get('/candidates/:id', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const result = await proxyToShadow(`/predicate/candidates/${req.params.id}`, {
      query: { program_id: String(req.query.program_id) },
    });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
      res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
  }
});

router.get('/defense-preview', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const query: Record<string, string> = { program_id: String(req.query.program_id) };
    if (req.query.candidate_id) query.candidate_id = String(req.query.candidate_id);
    const result = await proxyToShadow('/predicate/defense-preview', { query });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
  }
});

router.get('/se-matrix', requireConfigured, requireProgramAccess, async (req, res) => {
  try {
    const query: Record<string, string> = { program_id: String(req.query.program_id) };
    if (req.query.candidate_id) query.candidate_id = String(req.query.candidate_id);
    const result = await proxyToShadow('/predicate/se-matrix', { query });
    sendProxyResponse(res, result);
  } catch (err: any) {
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.B — Predicate Suggestion (Strategy Engine)
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/device/predicate-suggest',
  requireConfigured,
  requireProgramAccess,
  async (req, res) => {
    try {
      const result = await proxyToShadow('/predicate/device/predicate-suggest', {
        method: 'POST',
        body: req.body,
      });
      sendProxyResponse(res, result);
    } catch (err: any) {
      res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
    res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
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
      res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

export default router;
