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
import { randomUUID } from 'crypto';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger.js';
import { recordGovernedAction } from './c2c/actions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
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
const logger = createScopedLogger('nonclinical');

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

/**
 * Answer a failure without disclosing how the system is built.
 *
 * The classified branch (400 / 404 / 409) keeps `err.message`, and should: those
 * are DOMAIN errors this module raises itself, and their text is deliberate copy
 * — "Provide a reason of at least 8 characters." is the sentence the user needs.
 *
 * The unclassified branch did the same thing, and there the message is whatever
 * threw. While diagnosing BP-W0-2 this endpoint answered a browser with
 *
 *     { error: { code: 'INTERNAL', message: 'column s.duration_label does not exist' } }
 *
 * which the surface then rendered. That is a schema disclosure to whoever holds
 * the session, and the work order's guardrail 3 forbids exactly it: no exception
 * text in client UI.
 *
 * The house already decided how to answer this, in server/routes/c2c/projects.ts:
 * the detail goes to the LOG keyed by the request id the requestId middleware
 * sets and echoes as X-Request-Id, and the client gets a sentence plus that id.
 * Nothing is lost — the operator question is answered by one log lookup on an id
 * the user can read off the screen and quote.
 */
function fail(res: Response, err: unknown, req?: Request): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  const correlationId = (req as unknown as { requestId?: string } | undefined)?.requestId ?? randomUUID();
  logger.error('nonclinical request failed', {
    correlationId,
    driverCode: code ?? null,
    detail: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'The nonclinical registry could not complete that request.',
      correlationId,
    },
  });
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
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'nonclinical' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err, req);
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
    fail(res, err, req);
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
    fail(res, err, req);
  } finally {
    client.release();
  }
});

export default router;
