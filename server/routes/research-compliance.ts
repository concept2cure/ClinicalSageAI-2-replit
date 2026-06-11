/**
 * Research Compliance API — shared foundation (roster + checklist + training gate)
 *
 * The compliance-checklist reasoning engine and the "no index until trained"
 * training gate that the IRB/IACUC/IBC committees and sponsored programs draw on.
 * Governed CRUD for the personnel roster + training records; read-only checklist
 * and gate endpoints. Mounted at /api/research-compliance.
 *
 * @module server/routes/research-compliance
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { createPersonnelTx, addTrainingTx, listPersonnel, loadRosterForGate } from '../services/research-compliance/roster-service';
import { resolveComplianceChecklist, evaluateTrainingGate, type ActivityProfile } from '../services/research-compliance/compliance-checklist';

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
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
function today(): string { return new Date().toISOString().slice(0, 10); }

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
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'research_compliance' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const profileSchema = z.object({
  involvesHumanSubjects: z.boolean().default(false),
  involvesAnimals: z.boolean().default(false),
  involvesRecombinantDNA: z.boolean().default(false),
  involvesHumanGeneTransfer: z.boolean().default(false),
  fundingSource: z.enum(['nih', 'nsf', 'barda', 'dod', 'industry', 'internal', 'other']).default('other'),
  region: z.enum(['us', 'eu', 'other']).default('us'),
});

// ─── Roster ──────────────────────────────────────────────────────────────────

const personnelSchema = z.object({
  fullName: z.string().min(1).max(300),
  role: z.enum(['principal_investigator', 'co_investigator', 'coordinator', 'research_staff', 'veterinarian', 'biosafety_officer', 'other']),
  email: z.string().max(300).optional(),
  institution: z.string().max(300).optional(),
  userId: z.number().int().positive().optional(),
  reason,
});
router.post('/personnel', async (req, res) => {
  const parsed = personnelSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createPersonnelTx(client, orgId, userId, parsed.data);
    return { target: `research-personnel:${id}`, payload: { role: parsed.data.role }, body: { id } };
  });
});

router.get('/personnel', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listPersonnel(orgId)); } catch (err) { fail(res, err); }
});

const trainingSchema = z.object({
  trainingType: z.enum(['citi_human_subjects', 'citi_gcp', 'citi_animal', 'citi_rcr', 'biosafety', 'bloodborne_pathogens', 'iata_shipping', 'hipaa', 'fcoi_disclosure', 'other']),
  completedDate: z.string().optional(),
  expiresDate: z.string().optional(),
  certificateRef: z.string().max(200).optional(),
  reason,
});
router.post('/personnel/:id/training', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = trainingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: tid } = await addTrainingTx(client, orgId, userId, id, parsed.data);
    return { target: `research-personnel:${id}`, payload: { trainingId: tid, trainingType: parsed.data.trainingType }, body: { personnelId: id, trainingId: tid } };
  });
});

// ─── Compliance checklist (read-only reasoning engine) ───────────────────────

router.post('/checklist', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  res.json(resolveComplianceChecklist(parsed.data as ActivityProfile));
});

// ─── Training gate ("no index until trained") ─────────────────────────────────

const gateSchema = profileSchema.extend({ personnelIds: z.array(z.number().int().positive()).default([]) });
router.post('/gate', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = gateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const checklist = resolveComplianceChecklist(parsed.data as ActivityProfile);
    const roster = await loadRosterForGate(orgId, parsed.data.personnelIds);
    const gate = evaluateTrainingGate(roster.personnel, checklist.requiredTraining, roster.records, today());
    res.json({ checklist, gate });
  } catch (err) { fail(res, err); }
});

export default router;
