/**
 * /api/c2c/templates/* — AnA client formatting templates.
 *
 * The durable API behind "AnA looks at the form you uploaded and recreates the
 * same fonts, logo, margins and layout, then produces matching Word and PDF
 * files." Endpoints:
 *
 *   GET    /                 list org (+ optional project) templates
 *   POST   /extract          (multipart) extract a TemplateSpec from an upload — preview, no save
 *   POST   /from-upload      (multipart) extract + save in one step
 *   POST   /                 create a template from a provided spec
 *   GET    /:id              fetch one
 *   PUT    /:id              update name / description / spec / verified
 *   DELETE /:id              deactivate (soft delete)
 *   POST   /:id/render       render a document with this template → .docx or .pdf
 *
 * Org-scoped throughout (mounted behind authMiddleware). Template mutations
 * write a lightweight audit_logs row via the store.
 *
 * @module server/routes/c2c/templates
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import {
  extractTemplateFromFile,
  renderDocxWithTemplate,
  templateSpecToHtml,
  normalizeTemplateSpec,
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deactivateTemplate,
} from '../../services/templates';
import type { DocxInput } from '../../services/docx/docxFactory';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    if (/\.(docx|pdf)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx or .pdf files are supported'));
    }
  },
});

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function detectFileType(name: string): 'docx' | 'pdf' {
  return /\.pdf$/i.test(name) ? 'pdf' : 'docx';
}

/** Validate an inbound DocxInput-shaped document payload. */
function validateDocument(input: unknown): { ok: true; doc: DocxInput } | { ok: false; error: string } {
  const d = input as any;
  if (!d || typeof d !== 'object') return { ok: false, error: 'document is required' };
  if (!d.metadata || typeof d.metadata.title !== 'string') {
    return { ok: false, error: 'document.metadata.title is required' };
  }
  if (!Array.isArray(d.sections)) {
    return { ok: false, error: 'document.sections must be an array' };
  }
  return { ok: true, doc: d as DocxInput };
}

// ── list ───────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const templates = await listTemplates(orgId, { projectId });
    return res.json({ templates });
  } catch (err: any) {
    console.error('[c2c/templates] list', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── extract (preview, no save) ───────────────────────────────────────────────

router.post('/extract', upload.single('file'), async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });
  try {
    const result = await extractTemplateFromFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    return res.json(result);
  } catch (err: any) {
    console.error('[c2c/templates] extract', err?.message);
    return res.status(500).json({ error: 'EXTRACTION_FAILED' });
  }
});

// ── extract + save ───────────────────────────────────────────────────────────

router.post('/from-upload', upload.single('file'), async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });
  try {
    const extracted = await extractTemplateFromFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    const name =
      (typeof req.body?.name === 'string' && req.body.name.trim()) ||
      req.file.originalname.replace(/\.(docx|pdf)$/i, '');
    const record = await createTemplate({
      orgId,
      userId,
      name,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : null,
      spec: extracted.spec,
      sourceFileName: req.file.originalname,
      sourceFileType: detectFileType(req.file.originalname),
      extractionConfidence: extracted.confidence,
      extractionWarnings: extracted.warnings,
    });
    return res.status(201).json({ template: record, extraction: extracted });
  } catch (err: any) {
    console.error('[c2c/templates] from-upload', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── create from provided spec ─────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { name, description, projectId, spec } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'NAME_REQUIRED' });
  }
  try {
    const record = await createTemplate({
      orgId,
      userId,
      name: name.trim(),
      description: typeof description === 'string' ? description : undefined,
      projectId: typeof projectId === 'string' ? projectId : null,
      spec: normalizeTemplateSpec(spec),
    });
    return res.status(201).json({ template: record });
  } catch (err: any) {
    console.error('[c2c/templates] create', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── read one ───────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const record = await getTemplate(orgId, String(req.params.id));
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ template: record });
  } catch (err: any) {
    console.error('[c2c/templates] get', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── update ───────────────────────────────────────────────────────────────────

router.put('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { name, description, spec, verified } = req.body ?? {};
  try {
    const record = await updateTemplate(orgId, userId, String(req.params.id), {
      name: typeof name === 'string' ? name : undefined,
      description: typeof description === 'string' ? description : undefined,
      spec: spec !== undefined ? normalizeTemplateSpec(spec) : undefined,
      verified: typeof verified === 'boolean' ? verified : undefined,
    });
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ template: record });
  } catch (err: any) {
    console.error('[c2c/templates] update', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── deactivate ───────────────────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const ok = await deactivateTemplate(orgId, userId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[c2c/templates] delete', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── render a document with a template ────────────────────────────────────────

router.post('/:id/render', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  const format = (req.body?.format ?? 'docx') as string;
  const validation = validateDocument(req.body?.document);
  if (!validation.ok) return res.status(400).json({ error: 'INVALID_DOCUMENT', detail: validation.error });

  try {
    const record = await getTemplate(orgId, String(req.params.id));
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });

    if (format === 'docx') {
      const out = await renderDocxWithTemplate(record.spec, validation.doc);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      return res.send(out.buffer);
    }

    if (format === 'pdf') {
      // Reuse the platform's existing HTML→PDF exporter; the template only
      // supplies the look (CSS derived from the spec). No second PDF engine.
      const { renderHtmlToPdf } = await import('../../export/renderers');
      const html = templateSpecToHtml(record.spec, validation.doc);
      const buffer = await renderHtmlToPdf(html);
      const safe = validation.doc.metadata.title.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safe || 'document'}.pdf"`);
      return res.send(buffer);
    }

    return res.status(400).json({ error: 'UNSUPPORTED_FORMAT', detail: 'format must be docx or pdf' });
  } catch (err: any) {
    console.error('[c2c/templates] render', err?.message);
    return res.status(500).json({ error: 'RENDER_FAILED' });
  }
});

export default router;
