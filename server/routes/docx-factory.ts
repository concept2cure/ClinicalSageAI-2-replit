/**
 * DOCX Factory BFF Proxy — server-side proxy to Shadow Service
 *
 * Keeps REVIEW_ADMIN_TOKEN server-side only. The browser never sees it.
 * All /api/docx-factory/* calls are proxied to the Shadow Service's
 * /docx/* FastAPI endpoints with the admin token injected.
 *
 * Env vars:
 *   SHADOW_SERVICE_URL   — e.g. http://localhost:8001 (default)
 *   REVIEW_ADMIN_TOKEN   — the shared A8 ops token
 *
 * @version 1.0.0
 * @phase 6.3 — DOCX Factory BFF Proxy
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth.js';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';
import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs.js';

const router = Router();

// All DOCX Factory routes require a logged-in user (JWT)
router.use(authenticateToken);

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
      error: 'DOCX Factory not configured',
      detail: 'REVIEW_ADMIN_TOKEN is not set',
    });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware — program ownership guard (IDOR prevention)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifies the authenticated user's organization owns the requested program_id.
 * Extracts program_id from req.query OR req.body and checks
 * regulatoryPrograms.organizationId.
 *
 * Returns 422 if program_id is missing, 403 if ownership check fails.
 */
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
      console.warn(`[docx-factory] IDOR blocked: org=${orgId} tried program=${programId}`);
      return res.status(403).json({
        error: 'Access denied',
        detail: 'You do not have access to this program',
      });
    }

    next();
  } catch (err: any) {
    console.error('[docx-factory] program access check failed:', err.message);
    return res.status(500).json({
      error: 'Program access check failed',
      detail: err.message,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper — proxy a JSON request to the shadow service
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

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { 'X-Admin-Token': token };
  const fetchOptions: RequestInit = { method: options.method || 'GET', headers };

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
// Routes — Templates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/docx-factory/templates
 *
 * Register a new document template. Body: { program_id, name, doc_type?, status? }
 */
router.post(
  '/templates',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const result = await proxyToShadow('/docx/templates', {
        method: 'POST',
        body: req.body,
      });
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] create template proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

/**
 * GET /api/docx-factory/templates?program_id=...
 *
 * List all templates for a program.
 */
router.get(
  '/templates',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = String(req.query.program_id || '');
    try {
      const result = await proxyToShadow('/docx/templates', {
        query: { program_id: programId },
      });
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] list templates proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Routes — Template Versions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/docx-factory/templates/:templateId/versions?program_id=...
 *
 * Register a new version of a template. Body: { storage_key, sha256 }
 */
router.post(
  '/templates/:templateId/versions',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const result = await proxyToShadow(
        `/docx/templates/${encodeURIComponent(req.params.templateId)}/versions`,
        { method: 'POST', body: req.body }
      );
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] create version proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

/**
 * GET /api/docx-factory/templates/:templateId/versions?program_id=...
 *
 * List all versions for a template.
 */
router.get(
  '/templates/:templateId/versions',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = String(req.query.program_id || '');
    try {
      const result = await proxyToShadow(
        `/docx/templates/${encodeURIComponent(req.params.templateId)}/versions`,
        { query: { program_id: programId } }
      );
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] list versions proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Routes — Renders
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/docx-factory/renders
 *
 * Create a render request. Body: { program_id, template_version_id, inputs_json? }
 */
router.post(
  '/renders',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const result = await proxyToShadow('/docx/renders', {
        method: 'POST',
        body: req.body,
      });
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] create render proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

/**
 * GET /api/docx-factory/renders?program_id=...
 *
 * List all renders for a program.
 */
router.get(
  '/renders',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = String(req.query.program_id || '');
    try {
      const result = await proxyToShadow('/docx/renders', {
        query: { program_id: programId },
      });
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] list renders proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

/**
 * GET /api/docx-factory/renders/:renderId?program_id=...
 *
 * Get a specific render by ID.
 */
router.get(
  '/renders/:renderId',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = String(req.query.program_id || '');
    try {
      const result = await proxyToShadow(
        `/docx/renders/${encodeURIComponent(req.params.renderId)}`,
        { query: { program_id: programId } }
      );
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] get render proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Routes — Render Events (read-only audit trail)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/docx-factory/renders/:renderId/events?program_id=...
 *
 * List all events for a render, chronologically. Read-only audit trail.
 */
router.get(
  '/renders/:renderId/events',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = String(req.query.program_id || '');
    try {
      const result = await proxyToShadow(
        `/docx/renders/${encodeURIComponent(req.params.renderId)}/events`,
        { query: { program_id: programId } }
      );
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] list render events proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Routes — Render Execution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/docx-factory/renders/:renderId/execute?program_id=...
 *
 * Execute a queued render. Transitions: queued → running → completed/failed.
 */
router.post(
  '/renders/:renderId/execute',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const programId = String(req.query.program_id || req.body?.program_id || '');
      const result = await proxyToShadow(
        `/docx/renders/${encodeURIComponent(req.params.renderId)}/execute`,
        { method: 'POST', query: { program_id: programId } }
      );
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] execute render proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Routes — Artifact Download (binary streaming)
// ═══════════════════════════════════════════════════════════════════════════════

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * GET /api/docx-factory/artifacts/:artifactId/download?program_id=...
 *
 * Download a rendered DOCX artifact. Streams binary to browser.
 * Forwards X-Artifact-SHA256 header for client-side integrity verification.
 */
router.get(
  '/artifacts/:artifactId/download',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const programId = String(req.query.program_id || '');
      const url = new URL(
        `/docx/artifacts/${encodeURIComponent(req.params.artifactId)}/download`,
        getShadowUrl()
      );
      url.searchParams.set('program_id', programId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-Admin-Token': getAdminToken() },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return res.status(response.status).type('application/json').send(errorBody);
      }

      // Forward headers from shadow service
      const contentType = response.headers.get('content-type') || DOCX_MIME;
      const contentDisposition =
        response.headers.get('content-disposition') ||
        `attachment; filename="artifact-${req.params.artifactId}.docx"`;
      const sha256Header = response.headers.get('x-artifact-sha256');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', contentDisposition);
      if (sha256Header) {
        res.setHeader('X-Artifact-SHA256', sha256Header);
      }

      // Register governed export (fail-closed for regulated exports)
      const user = (req as any).user;
      await registerExportGovernanceQuick({
        organizationId: user?.organizationId || 1,
        projectId: Number(programId) || 0,
        userId: user?.id || 0,
        userName: user?.name || user?.email || 'unknown',
        title: `DOCX Artifact: ${req.params.artifactId}`,
        exportFormat: 'docx',
        exportFilename: `artifact-${req.params.artifactId}.docx`,
        exportFileSize: 0,
        docType: 'docx_artifact',
        backendRoute: `/api/docx-factory/artifacts/${req.params.artifactId}/download`,
        ipAddress: req.ip,
      });

      if (response.body) {
        const stream = Readable.fromWeb(response.body as any);
        res.status(200);
        stream.pipe(res);
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.status(200).send(buffer);
    } catch (err: any) {
      console.error('[docx-factory] artifact download proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Routes — Seed Templates + Demo Packs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/docx-factory/seed?program_id=...
 *
 * Seed starter templates into a program (idempotent).
 * Optional filters: doc_family, doc_type.
 */
router.post(
  '/seed',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const programId = String(req.query.program_id || req.body?.program_id || '');
      const query: Record<string, string> = { program_id: programId };
      if (req.query.doc_family) {
        query.doc_family = String(req.query.doc_family);
      }
      if (req.query.doc_type) {
        query.doc_type = String(req.query.doc_type);
      }
      const result = await proxyToShadow('/docx/seed', {
        method: 'POST',
        query,
      });
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (err: any) {
      console.error('[docx-factory] seed proxy error:', err.message);
      res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
    }
  }
);

/**
 * GET /api/docx-factory/demo-packs?doc_type=...
 *
 * List available demo input packs. No DB required — reads from static JSON files.
 * Optionally filter by doc_type and/or doc_family.
 */
router.get('/demo-packs', requireConfigured, async (req: Request, res: Response) => {
  try {
    const query: Record<string, string> = {};
    if (req.query.doc_type) {
      query.doc_type = String(req.query.doc_type);
    }
    if (req.query.doc_family) {
      query.doc_family = String(req.query.doc_family);
    }
    const result = await proxyToShadow('/docx/demo-packs', { query });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[docx-factory] demo-packs proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

/**
 * GET /api/docx-factory/catalog/families
 *
 * List supported document families from the DOCX seed catalog.
 */
router.get('/catalog/families', requireConfigured, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToShadow('/docx/catalog/families');
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[docx-factory] catalog families proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

/**
 * GET /api/docx-factory/catalog/doc-types?doc_family=...
 *
 * List supported template doc_type values, optionally scoped by family.
 */
router.get('/catalog/doc-types', requireConfigured, async (req: Request, res: Response) => {
  try {
    const query: Record<string, string> = {};
    if (req.query.doc_family) {
      query.doc_family = String(req.query.doc_family);
    }
    const result = await proxyToShadow('/docx/catalog/doc-types', { query });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[docx-factory] catalog doc-types proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

/**
 * GET /api/docx-factory/catalog/templates?doc_family=...&doc_type=...
 *
 * List seed template metadata, optionally scoped by family and/or doc type.
 */
router.get('/catalog/templates', requireConfigured, async (req: Request, res: Response) => {
  try {
    const query: Record<string, string> = {};
    if (req.query.doc_family) {
      query.doc_family = String(req.query.doc_family);
    }
    if (req.query.doc_type) {
      query.doc_type = String(req.query.doc_type);
    }
    const result = await proxyToShadow('/docx/catalog/templates', { query });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[docx-factory] catalog templates proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

export default router;
