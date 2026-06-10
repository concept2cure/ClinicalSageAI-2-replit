/**
 * Nonclinical Study + SEND API — Capability C2C-04
 *
 * Governed CRUD for the nonclinical study registry and its SEND dataset
 * packaging. Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT,
 * org-scoped. Study creation threads the IACUC → study → Module 4 provenance
 * chain. Mounted at /api/nonclinical.
 *
 * @module server/routes/nonclinical
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createStudyTx,
  setStudyStatusTx,
  upsertSendDatasetTx,
  listStudies,
  getSendReadinessInput,
} from '../services/nonclinical/nonclinical-service';
import { evaluateSendReadiness, requiredSendDomains } from '../services/nonclinical/nonclinical-logic';
import { recordNonclinicalStudyCreated, recordSendValidation } from '../services/nonclinical-metrics';

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
const STUDY_TYPE = z.enum(['single_dose_tox', 'repeat_dose_tox', 'safety_pharmacology', 'genotoxicity', 'carcinogenicity', 'reproductive_tox', 'local_tolerance', 'adme_pk', 'immunotoxicity', 'other']);

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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'nonclinical' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const studySchema = z.object({
  studyNumber: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  studyType: STUDY_TYPE,
  species: z.string().max(200).optional(),
  glpCompliant: z.boolean().optional(),
  testingFacility: z.string().max(300).optional(),
  noael: z.string().max(200).optional(),
  submissionId: z.number().int().positive().optional(),
  iacucProtocolId: z.number().int().positive().optional(),
  reason,
});

router.post('/studies', async (req, res) => {
  const parsed = studySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, ctdSection, provenanceLinkIds } = await createStudyTx(client, orgId, userId, parsed.data);
    recordNonclinicalStudyCreated(parsed.data.studyType);
    return { target: `nonclinical-study:${id}`, payload: { studyType: parsed.data.studyType, ctdSection, provenanceLinkIds }, body: { id, ctdSection, requiredSendDomains: requiredSendDomains(parsed.data.studyType), provenanceLinkIds } };
  });
});

router.get('/studies', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    res.json(await listStudies(orgId, Number.isFinite(submissionId) ? submissionId : undefined));
  } catch (err) {
    fail(res, err);
  }
});

const statusSchema = z.object({ status: z.enum(['planned', 'in_life', 'in_reporting', 'finalized', 'cancelled']), reportFinalizedDate: z.string().optional(), reason });
router.patch('/studies/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setStudyStatusTx(client, orgId, id, parsed.data.status, parsed.data.reportFinalizedDate);
    return { target: `nonclinical-study:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

const sendSchema = z.object({
  sendigVersion: z.string().max(20).optional(),
  domainsPresent: z.array(z.string().max(8)).default([]),
  defineXmlPresent: z.boolean().optional(),
  nsdrcPresent: z.boolean().optional(),
  validationStatus: z.enum(['not_validated', 'passed', 'warnings', 'errors']).optional(),
  validatorErrorCount: z.number().int().nonnegative().optional(),
  validatorWarningCount: z.number().int().nonnegative().optional(),
  reason,
});

router.put('/studies/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = sendSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: sendId } = await upsertSendDatasetTx(client, orgId, userId, id, parsed.data);
    if (parsed.data.validationStatus) recordSendValidation(parsed.data.validationStatus);
    return { target: `nonclinical-study:${id}`, payload: { sendDatasetId: sendId, validationStatus: parsed.data.validationStatus }, body: { studyId: id, sendDatasetId: sendId } };
  });
});

router.get('/studies/:id/send-readiness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const client = await pool.connect();
  try {
    const input = await getSendReadinessInput(client, orgId, id);
    res.json(evaluateSendReadiness(input));
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

export default router;
