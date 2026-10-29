/**
 * The GMP deviation register's routes under /api/mdx/qms, mounted by
 * mdx-qms.ts (P-49, 2026-10-29).
 *
 *   GET    /api/mdx/qms/deviations              list, newest first
 *   POST   /api/mdx/qms/deviations              record one (open)
 *   PATCH  /api/mdx/qms/deviations/:id          its investigation, and its status move
 *   POST   /api/mdx/qms/deviations/:id/close    close it, by electronic signature
 *
 * The writes are server/services/qms/deviations.ts; the lifecycle is
 * shared/constants/deviation-lifecycle.ts. Each write records its audit row,
 * and the close is the platform's one signing ceremony. These replace the
 * /api/qc/deviations stub, which had no store and answered 501.
 *
 * @module server/routes/mdx-qms-deviations
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { ok, created, clientError, orgRequired, serverError } from '../lib/api-response';
import { requestConnectable } from '../db/requestDb';
import { recordAuditRow } from '../services/audit/audit-write-outcome';
import { requireEditorAccess } from '../middleware/orgMembership';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import {
  DEVIATION_CODE_STATUS, DeviationRefused, closeDeviation, recordNewDeviation, updateDeviation,
} from '../services/qms/deviations';
import { scheduleDeviationTask, type DeviationTaskSource } from '../services/qms/qms-record-tasks';
import {
  DEVIATION_CATEGORIES, DEVIATION_CLASSIFICATIONS, DEVIATION_STATUSES, DEVIATION_TYPES,
} from '../../shared/constants/deviation-lifecycle';
import { getOrgId, getUserId, qmsClient } from './mdx-qms-context';

const router = Router();
const log = createScopedLogger('mdx-qms');

const text = (max: number) => z.string().trim().min(1).max(max);
const deviationCreate = z.object({
  deviationNumber:   text(100),
  title:             text(300),
  description:       text(8000),
  deviationType:     z.enum(DEVIATION_TYPES),
  classification:    z.enum(DEVIATION_CLASSIFICATIONS),
  detectedDate:      z.string().date(),
  category:          z.enum(DEVIATION_CATEGORIES).optional().nullable(),
  location:          z.string().max(300).optional().nullable(),
  department:        z.string().max(100).optional().nullable(),
  batchNumber:       z.string().max(100).optional().nullable(),
  productName:       z.string().max(300).optional().nullable(),
  processStep:       z.string().max(300).optional().nullable(),
  targetClosureDate: z.string().date().optional().nullable(),
});
const deviationPatch = z.object({
  status:                z.enum(DEVIATION_STATUSES).optional(),
  classification:        z.enum(DEVIATION_CLASSIFICATIONS).optional(),
  category:              z.enum(DEVIATION_CATEGORIES).optional().nullable(),
  impactLevel:           z.enum(['low', 'medium', 'high', 'critical']).optional().nullable(),
  rootCause:             z.string().max(8000).optional().nullable(),
  resolutionDescription: z.string().max(8000).optional().nullable(),
  immediateActions:      z.string().max(8000).optional().nullable(),
  targetClosureDate:     z.string().date().optional().nullable(),
});

function refused(res: Response, err: unknown): Response | null {
  return err instanceof DeviationRefused ? clientError(res, err.status as 404 | 409 | 422, err.message, { code: err.code }) : null;
}

router.get('/qms/deviations', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await qmsClient(req).query(
      `SELECT * FROM qc_deviations WHERE organization_id = $1 ORDER BY detected_date DESC, id DESC LIMIT 500`, [orgId]);
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'deviation-list', err); }
});

router.post('/qms/deviations', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = deviationCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const actor = getUserId(req);
    const { row, auditTrail } = await recordNewDeviation(qmsClient(req), orgId, actor, parsed.data, requestConnectable(req));
    if (actor) await scheduleDeviationTask(orgId, row as DeviationTaskSource, actor);
    return created(res, row, { auditTrail });
  } catch (err) { return refused(res, err) ?? serverError(res, log, 'deviation-create', err); }
});

router.patch('/qms/deviations/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  const parsed = deviationPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const row = await updateDeviation(qmsClient(req), orgId, id, parsed.data);
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.deviation.update',
      resourceType: 'qc_deviation', resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data), status: parsed.data.status ?? null },
    }, requestConnectable(req));
    const actor = getUserId(req);
    if (actor) await scheduleDeviationTask(orgId, row as DeviationTaskSource, actor);
    return ok(res, row, { auditTrail });
  } catch (err) { return refused(res, err) ?? serverError(res, log, 'deviation-update', err); }
});

/* The close is a signed decision (approval or responsibility): the signer
   answers for the investigation, the root cause and the resolution. Only a
   deviation pending approval with both recorded can close. */
router.post('/qms/deviations/:id/close', requireEditorAccess, signedActAttempts, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 400, 'id must be a positive integer. Nothing was signed.');
  const target = `qms-deviation:${id}`;
  let row: Record<string, unknown> | null = null;
  await signGovernedAct(req, res, {
    domain: 'qms',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: DEVIATION_CODE_STATUS,
    run: async (client, orgId, userId) => {
      row = await closeDeviation(client, orgId, id, userId);
      return { target, payload: { deviationNumber: row.deviation_number, classification: row.classification }, body: { data: row } };
    },
    afterCommit: async (_result, orgId, userId) => {
      if (row) await scheduleDeviationTask(orgId, row as unknown as DeviationTaskSource, userId);
    },
  });
});

export default router;
