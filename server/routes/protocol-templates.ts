/**
 * Protocol Templates API — Capability C2C-20a
 *
 * Governed template curation + cloning: create templates, add sections, clone a
 * template into a new protocol document (required-aware), and save an existing
 * document as a template. Mutations run BEGIN → Tx → recordGovernedAction → COMMIT,
 * org-scoped. Mounted at /api/protocol-templates.
 *
 * @module server/routes/protocol-templates
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { createTemplateTx, addTemplateSectionTx, cloneTemplateToDocumentTx, saveDocumentAsTemplateTx, listTemplates, getTemplate } from '../services/protocol-templates/protocol-templates-service';
import { recordProtocolTemplateCreated, recordProtocolTemplateCloned, recordProtocolTemplateSaved } from '../services/protocol-templates-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) { res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const KIND = z.enum(['iacuc', 'irb', 'clinical', 'ibc']);

async function governed(req: Request, res: Response, command: string, reasonText: string, run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>): Promise<void> {
  const userId = resolveUserId(req); const orgId = resolveOrgId(req);
  if (!userId || !orgId) { res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) { await client.query('ROLLBACK').catch(() => undefined); fail(res, err); } finally { client.release(); }
}

const createSchema = z.object({ name: z.string().min(1).max(300), protocolKind: KIND, designType: z.string().max(60).optional(), description: z.string().max(2000).optional(), reason });
router.post('/templates', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createTemplateTx(client, orgId, userId, parsed.data);
    recordProtocolTemplateCreated();
    return { target: `protocol-template:${id}`, payload: { kind: parsed.data.protocolKind }, body: { id } };
  });
});

const sectionSchema = z.object({ sectionKey: z.string().min(1).max(80), title: z.string().min(1).max(300), content: z.string().max(50000).optional(), required: z.boolean().optional(), orderIndex: z.number().int().optional(), reason });
router.post('/templates/:id/sections', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = sectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: sid } = await addTemplateSectionTx(client, orgId, userId, id, parsed.data);
    return { target: `protocol-template:${id}`, payload: { sectionId: sid }, body: { templateId: id, sectionId: sid } };
  });
});

const cloneSchema = z.object({ title: z.string().min(1).max(500), protocolNumber: z.string().max(120).optional(), reason });
router.post('/templates/:id/clone', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = cloneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { documentId, sectionsSeeded } = await cloneTemplateToDocumentTx(client, orgId, userId, id, parsed.data);
    recordProtocolTemplateCloned();
    return { target: `protocol-document:${documentId}`, payload: { templateId: id, sectionsSeeded }, body: { documentId, sectionsSeeded } };
  });
});

const saveSchema = z.object({ name: z.string().min(1).max(300), description: z.string().max(2000).optional(), reason });
router.post('/documents/:id/save-as-template', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = saveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { templateId, sectionsCopied } = await saveDocumentAsTemplateTx(client, orgId, userId, id, parsed.data);
    recordProtocolTemplateSaved();
    return { target: `protocol-template:${templateId}`, payload: { fromDocument: id, sectionsCopied }, body: { templateId, sectionsCopied } };
  });
});

router.get('/templates', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listTemplates(orgId, typeof req.query.kind === 'string' ? req.query.kind : undefined)); } catch (err) { fail(res, err); }
});

router.get('/templates/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const t = await getTemplate(orgId, id);
    if (!t) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found.' } });
    res.json(t);
  } catch (err) { fail(res, err); }
});

export default router;
