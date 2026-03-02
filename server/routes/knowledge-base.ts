/**
 * Knowledge Base BFF Proxy — Phase 7.1
 *
 * Server-side proxy to Shadow Service /knowledge/* endpoints.
 * Keeps REVIEW_ADMIN_TOKEN server-side only; the browser never sees it.
 *
 * Mounted at: /api/knowledge-base
 *
 * Routes proxied:
 *   POST /upload                     → /knowledge/ingest-files  (multipart)
 *   GET  /context/:projectId         → /knowledge/project-context/{id}
 *   POST /generate-docx              → /knowledge/generate-docx
 *   POST /generate-ind-package       → /knowledge/generate-ind-package
 *   POST /generate-ind-section       → /knowledge/generate-ind-section
 *
 * Env vars:
 *   SHADOW_SERVICE_URL   — default http://localhost:8001
 *   REVIEW_ADMIN_TOKEN   — shared admin token
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

function shadowUrl(): string {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function adminToken(): string {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}

function requireToken(res: Response): boolean {
  if (!adminToken()) {
    res
      .status(503)
      .json({ error: 'Knowledge Base not configured', detail: 'REVIEW_ADMIN_TOKEN is not set' });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — proxy a JSON request, return raw response
// ─────────────────────────────────────────────────────────────────────────────

async function proxyJson(
  path: string,
  method: string,
  body?: unknown,
  queryParams?: Record<string, string>
): Promise<{ status: number; body: string; contentType: string }> {
  const url = new URL(path, shadowUrl());
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = { 'X-Admin-Token': adminToken() };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url.toString(), init);
  const text = await resp.text();
  return {
    status: resp.status,
    body: text,
    contentType: resp.headers.get('content-type') || 'application/json',
  };
}

// Helper — proxy and pipe binary (DOCX) response
async function proxyBinary(
  path: string,
  method: string,
  body: unknown,
  res: Response
): Promise<void> {
  const url = new URL(path, shadowUrl());
  const resp = await fetch(url.toString(), {
    method,
    headers: {
      'X-Admin-Token': adminToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Copy status + headers that matter
  res.status(resp.status);
  const cd = resp.headers.get('content-disposition');
  if (cd) res.setHeader('Content-Disposition', cd);
  const ct = resp.headers.get('content-type') || 'application/octet-stream';
  res.setHeader('Content-Type', ct);

  const xsg = resp.headers.get('x-sections-generated');
  const xsf = resp.headers.get('x-sections-failed');
  if (xsg) res.setHeader('X-Sections-Generated', xsg);
  if (xsf) res.setHeader('X-Sections-Failed', xsf);

  const buf = await resp.arrayBuffer();
  res.send(Buffer.from(buf));
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/upload
// Accepts multipart/form-data with project_id (field) + files[]
// ═════════════════════════════════════════════════════════════════════════════

router.post('/upload', upload.array('files'), async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  const projectId = String(req.body?.project_id || '');
  if (!projectId) return void res.status(422).json({ error: 'project_id is required' });

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return void res.status(422).json({ error: 'At least one file is required' });
  }

  try {
    // Re-assemble as FormData for the Python service
    const form = new FormData();
    form.append('project_id', projectId);
    for (const f of files) {
      form.append('files', new Blob([f.buffer], { type: f.mimetype }), f.originalname);
    }

    const url = new URL('/knowledge/ingest-files', shadowUrl());
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken() },
      body: form,
    });
    const json = await resp.json();
    res.status(resp.status).json(json);
  } catch (err: any) {
    console.error('[knowledge-base] upload proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/knowledge-base/context/:projectId
// ═════════════════════════════════════════════════════════════════════════════

router.get('/context/:projectId', async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  const { projectId } = req.params;

  try {
    const qp: Record<string, string> = {};
    if (req.query.max_chars_per_doc) qp.max_chars_per_doc = String(req.query.max_chars_per_doc);
    if (req.query.max_total_chars) qp.max_total_chars = String(req.query.max_total_chars);

    const result = await proxyJson(`/knowledge/project-context/${projectId}`, 'GET', undefined, qp);
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[knowledge-base] context proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-docx
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-docx', async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  try {
    await proxyBinary('/knowledge/generate-docx', 'POST', req.body, res);
  } catch (err: any) {
    console.error('[knowledge-base] generate-docx proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-ind-package
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-ind-package', async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  try {
    await proxyBinary('/knowledge/generate-ind-package', 'POST', req.body, res);
  } catch (err: any) {
    console.error('[knowledge-base] generate-ind-package proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-ind-section
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-ind-section', async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  try {
    const result = await proxyJson('/knowledge/generate-ind-section', 'POST', req.body);
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[knowledge-base] generate-ind-section proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

export default router;
