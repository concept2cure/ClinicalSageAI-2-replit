/**
 * Protocol Export API — Capability C2C-20c
 *
 * Read-only assembly of a protocol document: structured export + Markdown, and a
 * ClinicalTrials.gov PRS registration draft (FDAAA 801). Mounted at
 * /api/protocol-export.
 *
 * @module server/routes/protocol-export
 */

import { Router, type Request, type Response } from 'express';
import { getProtocolExport, getCtGovDraft, getProtocolDocx } from '../services/protocol-export/protocol-export-service';
import { sendDocxAttachment } from '../lib/api-response';
import { recordProtocolExport, recordCtGovDraft, recordProtocolDocxExport } from '../services/protocol-export-metrics';

const router = Router();

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'NOT_FOUND') { res.status(404).json({ error: { code, message: err instanceof Error ? err.message : 'Not found.' } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}

router.get('/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { const out = await getProtocolExport(orgId, id); recordProtocolExport(); res.json(out); } catch (err) { fail(res, err); }
});

router.get('/:id/ctgov-draft', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { const draft = await getCtGovDraft(orgId, id); recordCtGovDraft(); res.json(draft); } catch (err) { fail(res, err); }
});

/**
 * GET /:id/docx — the assembled protocol as a Word document, through the one
 * DOCX factory. The date on the cover is read from the clock HERE, at the
 * boundary, and injected into the pure mapper; nothing below this line reads
 * a clock. A section nobody wrote renders as a bracketed gap marker, never as
 * prose (see protocol-export/protocol-docx.ts).
 */
router.get('/:id/docx', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const out = await getProtocolDocx(orgId, id, new Date().toISOString().slice(0, 10));
    recordProtocolDocxExport();
    return sendDocxAttachment(res, out.buffer, out.filename);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
