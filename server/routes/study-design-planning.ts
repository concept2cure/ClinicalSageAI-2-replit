/**
 * POST /api/study-design/:studyId/planning — the governed partial write of
 * sponsor planning inputs on a persisted study design.
 *
 * Records ONE block — dose escalation, accrual plan, MMRM assumptions,
 * external-control plan, master protocol, or one SoA activity's location and
 * specimen (`services/study-design/planning-inputs.ts`). The block is
 * validated strictly before a connection is taken; the design is read
 * FOR UPDATE inside the transaction that writes it back through the one
 * writer (`persistStudyDesignTx`), so a concurrent edit cannot be overwritten
 * from a stale read; the governed-action row carries the reason.
 * `value: null` clears the block.
 *
 * Mounted by `study-design.ts` behind `requireEditorAccess`: the route is
 * gated itself, because that router's POST projections are reads a viewer
 * may use.
 *
 * @module server/routes/study-design-planning
 */
import type { Request, Response } from 'express';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  validateDesign,
  persistStudyDesignTx,
  rowsToStudyDesign,
  StudyDesignPersistRefusal,
  STUDY_DESIGN_REFUSAL_STATUS,
} from '../services/study-design';
import { applyPlanningInput, parsePlanningInput, PlanningInputError } from '../services/study-design/planning-inputs';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { resolveOrgId, resolveUserId } from '../types/auth-request';

const MIN_REASON = 8;

export async function recordPlanningInput(req: Request, res: Response) {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < MIN_REASON) {
    return res.status(400).json({ error: 'REASON_REQUIRED', detail: `Provide a reason of at least ${MIN_REASON} characters.` });
  }
  const parsed = parsePlanningInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: 'INVALID_PLANNING_INPUT', details: parsed.issues });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const row = await client.query(
      `SELECT study_id, metadata FROM cdisc_prm_studies WHERE study_id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE`,
      [studyId, orgId],
    );
    const current = row.rows.length ? rowsToStudyDesign(row.rows[0]) : null;
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const next = applyPlanningInput({ ...current, id: current.id ?? studyId }, parsed.input);
    await persistStudyDesignTx(client, next, { tenantId: orgId, userId });
    const gov = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'update',
      target: `study-design:${studyId}`,
      reason,
      payload: { studyId, block: parsed.input.block, cleared: parsed.input.value === null },
      domain: 'mdx',
      surface: 'api',
    });
    await client.query('COMMIT');
    return res.json({ studyId, block: parsed.input.block, ...gov, validation: validateDesign(next) });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof PlanningInputError) return res.status(409).json({ error: err.code, detail: err.message });
    if (err instanceof StudyDesignPersistRefusal) {
      return res.status(STUDY_DESIGN_REFUSAL_STATUS[err.code]).json({ error: err.code, detail: err.message });
    }
    console.error('[study-design/planning]', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'PLANNING_WRITE_FAILED' });
  } finally {
    client.release();
  }
}
