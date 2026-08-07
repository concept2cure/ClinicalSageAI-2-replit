/**
 * Protocol Development API — Capability C2C-17
 *
 * Governed protocol authoring: create a document (auto-seeded sections), edit
 * sections, add objectives / eligibility / schedule visits / study team, snapshot
 * versions, read completeness, and finalize behind the deterministic completeness
 * gate. Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped.
 * Mounted at /api/protocol-development.
 *
 * @module server/routes/protocol-development
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createProtocolDocumentTx,
  updateSynopsisTx,
  updateSectionTx,
  addObjectiveTx,
  addEligibilityCriterionTx,
  addVisitTx,
  addTeamMemberTx,
  getCompleteness,
  snapshotVersionTx,
  finalizeProtocolTx,
  listProtocolDocuments,
  getProtocolDocument,
} from '../services/protocol-development/protocol-development-service';
import {
  recordProtocolDocCreated, recordProtocolSectionUpdated, recordProtocolObjectiveAdded,
  recordProtocolEligibilityAdded, recordProtocolVisitAdded, recordProtocolVersionSnapshot, recordProtocolFinalized,
} from '../services/protocol-development-metrics';
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
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const KIND = z.enum(['iacuc', 'irb', 'clinical', 'ibc']);

async function governed(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Documents ───────────────────────────────────────────────────────────────

const docSchema = z.object({
  protocolKind: KIND,
  title: z.string().min(1).max(500),
  protocolNumber: z.string().max(120).optional(),
  designType: z.enum(['interventional', 'observational', 'expanded_access', 'animal_study', 'basic_science', 'registry', 'other']).optional(),
  phase: z.string().max(40).optional(),
  therapeuticArea: z.string().max(120).optional(),
  linkedProtocolId: z.number().int().positive().optional(),
  synopsis: z.string().max(8000).optional(),
  reason,
});
router.post('/documents', async (req, res) => {
  const parsed = docSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, sectionsSeeded } = await createProtocolDocumentTx(client, orgId, userId, parsed.data);
    recordProtocolDocCreated(parsed.data.protocolKind);
    return { target: `protocol-document:${id}`, payload: { kind: parsed.data.protocolKind, sectionsSeeded }, body: { id, sectionsSeeded } };
  });
});

router.get('/documents', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listProtocolDocuments(orgId, typeof req.query.kind === 'string' ? req.query.kind : undefined)); } catch (err) { fail(res, err); }
});

router.get('/documents/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const doc = await getProtocolDocument(orgId, id);
    if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Protocol document not found.' } });
    res.json(doc);
  } catch (err) { fail(res, err); }
});

router.get('/documents/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getCompleteness(orgId, id)); } catch (err) { fail(res, err); }
});

const synopsisSchema = z.object({ synopsis: z.string().min(1).max(8000), reason });
router.patch('/documents/:id/synopsis', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = synopsisSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    await updateSynopsisTx(client, orgId, id, parsed.data.synopsis, userId);
    return { target: `protocol-document:${id}`, body: { id } };
  });
});

// ─── Sections ────────────────────────────────────────────────────────────────

const sectionSchema = z.object({ content: z.string().max(50000).optional(), status: z.enum(['not_started', 'draft', 'complete']).optional(), reason });
router.patch('/sections/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = sectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    await updateSectionTx(client, orgId, id, parsed.data, userId);
    recordProtocolSectionUpdated();
    return { target: `protocol-section:${id}`, payload: { status: parsed.data.status }, body: { id } };
  });
});

// ─── Structured components ───────────────────────────────────────────────────

const objectiveSchema = z.object({ objectiveType: z.enum(['primary', 'secondary', 'exploratory']).optional(), objective: z.string().min(1).max(2000), endpoint: z.string().max(2000).optional(), timepoint: z.string().max(200).optional(), reason });
router.post('/documents/:id/objectives', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = objectiveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: oid } = await addObjectiveTx(client, orgId, userId, id, parsed.data);
    recordProtocolObjectiveAdded();
    return { target: `protocol-document:${id}`, payload: { objectiveId: oid }, body: { documentId: id, objectiveId: oid } };
  });
});

const eligibilitySchema = z.object({ kind: z.enum(['inclusion', 'exclusion']), criterion: z.string().min(1).max(2000), reason });
router.post('/documents/:id/eligibility', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = eligibilitySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: eid } = await addEligibilityCriterionTx(client, orgId, userId, id, parsed.data);
    recordProtocolEligibilityAdded();
    return { target: `protocol-document:${id}`, payload: { criterionId: eid, kind: parsed.data.kind }, body: { documentId: id, criterionId: eid } };
  });
});

const visitSchema = z.object({ visitName: z.string().min(1).max(200), timepoint: z.string().max(120).optional(), procedures: z.array(z.string().max(300)).max(100).optional(), reason });
router.post('/documents/:id/visits', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = visitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: vid } = await addVisitTx(client, orgId, userId, id, parsed.data);
    recordProtocolVisitAdded();
    return { target: `protocol-document:${id}`, payload: { visitId: vid }, body: { documentId: id, visitId: vid } };
  });
});

const teamSchema = z.object({
  memberName: z.string().min(1).max(300),
  role: z.enum(['principal_investigator', 'co_investigator', 'sub_investigator', 'coordinator', 'biostatistician', 'data_manager', 'pharmacist', 'veterinarian', 'regulatory', 'other']).optional(),
  personnelId: z.number().int().positive().optional(),
  userId: z.number().int().positive().optional(),
  responsibilities: z.string().max(1000).optional(),
  reason,
});
router.post('/documents/:id/team', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = teamSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: mid } = await addTeamMemberTx(client, orgId, userId, id, parsed.data);
    return { target: `protocol-document:${id}`, payload: { memberId: mid }, body: { documentId: id, memberId: mid } };
  });
});

// ─── Versioning + finalize ───────────────────────────────────────────────────

const versionSchema = z.object({ changeSummary: z.string().max(2000).optional(), reason });
router.post('/documents/:id/versions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = versionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { version } = await snapshotVersionTx(client, orgId, userId, id, parsed.data.changeSummary);
    recordProtocolVersionSnapshot();
    return { target: `protocol-document:${id}`, payload: { version }, body: { documentId: id, version } };
  });
});

router.post('/documents/:id/finalize', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await finalizeProtocolTx(client, orgId, userId, id);
    recordProtocolFinalized();
    return { target: `protocol-document:${id}`, payload: { version: result.version }, body: { documentId: id, ...result } };
  });
});

export default router;
