/**
 * Evidence Fabric BFF Proxy — server-side proxy to Shadow Service
 *
 * Keeps REVIEW_ADMIN_TOKEN server-side only. The browser never sees it.
 * All /api/evidence-fabric/* calls are proxied to the Shadow Service's
 * /evidence/* FastAPI endpoints with the admin token injected.
 *
 * Env vars:
 *   SHADOW_SERVICE_URL   — e.g. http://localhost:8001 (default)
 *   REVIEW_ADMIN_TOKEN   — the shared A8 ops token
 *
 * @version 1.0.0
 * @phase 5.3.B — Truth Machine UI
 */

import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration — read at request time so env changes are picked up
// ═══════════════════════════════════════════════════════════════════════════════

function getShadowUrl(): string {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function getAdminToken(): string {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware — fail-closed if not configured
// ═══════════════════════════════════════════════════════════════════════════════

function requireConfigured(_req: Request, res: Response, next: NextFunction) {
  if (!getAdminToken()) {
    return res.status(503).json({
      error: 'Evidence Fabric not configured',
      detail: 'REVIEW_ADMIN_TOKEN is not set',
    });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper — proxy a request to the shadow service
// ═══════════════════════════════════════════════════════════════════════════════

async function proxyToShadow(
  shadowPath: string,
  options: {
    method?: string;
    query?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: string; contentType: string }> {
  const url = new URL(shadowPath, getShadowUrl());
  const token = getAdminToken();

  // Append query params
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    'X-Admin-Token': token,
  };

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), fetchOptions);
  const body = await response.text();
  const contentType = response.headers.get('content-type') || 'application/json';

  return { status: response.status, body, contentType };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence-fabric/health-summary?program_id=...
 *
 * Dashboard health panel data — latest scan, claims, sources, contradictions.
 */
router.get('/health-summary', requireConfigured, async (req: Request, res: Response) => {
  const programId = String(req.query.program_id || '');
  if (!programId) {
    return res.status(422).json({ error: 'program_id is required' });
  }

  try {
    const result = await proxyToShadow('/evidence/health-summary', {
      query: { program_id: programId },
    });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[evidence-fabric] health-summary proxy error:', err.message);
    res.status(502).json({
      error: 'Shadow service unreachable',
      detail: err.message,
    });
  }
});

/**
 * POST /api/evidence-fabric/contradiction-scans?program_id=...&triggered_by=...&scan_type=...&section_ref=...
 *
 * Trigger a new contradiction scan.
 */
router.post('/contradiction-scans', requireConfigured, async (req: Request, res: Response) => {
  const programId = String(req.query.program_id || '');
  if (!programId) {
    return res.status(422).json({ error: 'program_id is required' });
  }

  try {
    const query: Record<string, string> = { program_id: programId };
    if (req.query.triggered_by) query.triggered_by = String(req.query.triggered_by);
    if (req.query.scan_type) query.scan_type = String(req.query.scan_type);
    if (req.query.section_ref) query.section_ref = String(req.query.section_ref);

    const result = await proxyToShadow('/evidence/contradiction-scans', {
      method: 'POST',
      query,
    });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[evidence-fabric] contradiction-scans proxy error:', err.message);
    res.status(502).json({
      error: 'Shadow service unreachable',
      detail: err.message,
    });
  }
});

/**
 * GET /api/evidence-fabric/contradiction-scans?program_id=...&limit=...&offset=...
 *
 * List contradiction scans for a program.
 */
router.get('/contradiction-scans', requireConfigured, async (req: Request, res: Response) => {
  const programId = String(req.query.program_id || '');
  if (!programId) {
    return res.status(422).json({ error: 'program_id is required' });
  }

  try {
    const query: Record<string, string> = { program_id: programId };
    if (req.query.limit) query.limit = String(req.query.limit);
    if (req.query.offset) query.offset = String(req.query.offset);

    const result = await proxyToShadow('/evidence/contradiction-scans', { query });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[evidence-fabric] list contradiction-scans proxy error:', err.message);
    res.status(502).json({
      error: 'Shadow service unreachable',
      detail: err.message,
    });
  }
});

/**
 * GET /api/evidence-fabric/contradiction-scans/:scanId?program_id=...
 *
 * Get a specific contradiction scan by ID.
 */
router.get(
  '/contradiction-scans/:scanId',
  requireConfigured,
  async (req: Request, res: Response) => {
    const programId = String(req.query.program_id || '');
    if (!programId) {
      return res.status(422).json({ error: 'program_id is required' });
    }

    try {
      const result = await proxyToShadow(
        `/evidence/contradiction-scans/${encodeURIComponent(req.params.scanId)}`,
        { query: { program_id: programId } }
      );
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[evidence-fabric] get scan proxy error:', err.message);
      res.status(502).json({
        error: 'Shadow service unreachable',
        detail: err.message,
      });
    }
  }
);

export default router;
