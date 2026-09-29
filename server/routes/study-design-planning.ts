/**
 * POST /api/study-design/:studyId/planning — the governed partial write of
 * sponsor planning inputs on a persisted study design.
 *
 * Records ONE block — dose escalation, accrual plan, MMRM assumptions,
 * external-control plan, master protocol, or one SoA activity's location and
 * specimen (`services/study-design/planning-inputs.ts`). The block and the
 * reason are validated strictly before a connection is taken; the design is
 * read FOR UPDATE inside the transaction that writes it back through the one
 * writer (`persistStudyDesignTx`); the governed-action row carries the reason.
 * `value: null` clears the block.
 *
 * Concurrency: the body carries `expected` — the block as the writer read it
 * (`null` when it was not recorded; for an activity, its `{ location,
 * specimen }`). When the design now records something else, another author
 * wrote the block in between, and the write is refused (409 STALE_BLOCK)
 * rather than silently replacing theirs. The FOR UPDATE read serialises the
 * check against a concurrent write of any block.
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
import {
  applyPlanningInput,
  parsePlanningInput,
  PlanningInputError,
  recordedBlock,
  sameRecorded,
  type PlanningInput,
} from '../services/study-design/planning-inputs';
import type { StudyDesign } from '../services/study-design/study-design-types';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { resolveOrgId, resolveUserId } from '../types/auth-request';

const MIN_REASON = 8;

type Refusal = { status: number; body: { error: string; detail?: string; details?: string[] } };

/** Everything that can be refused before a connection is taken. */
function precheck(body: unknown): Refusal | { input: PlanningInput; reason: string; expected: unknown } {
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < MIN_REASON) {
    return { status: 400, body: { error: 'REASON_REQUIRED', detail: `Provide a reason of at least ${MIN_REASON} characters.` } };
  }
  const parsed = parsePlanningInput(body);
  if (!parsed.ok) return { status: 400, body: { error: 'INVALID_PLANNING_INPUT', details: parsed.issues } };
  if (!Object.prototype.hasOwnProperty.call(b, 'expected')) {
    return {
      status: 400,
      body: { error: 'PRECONDITION_REQUIRED', detail: 'Send `expected`: the block as it was read before this edit (null when it was not recorded).' },
    };
  }
  return { input: parsed.input, reason, expected: b.expected };
}

/** What the audit row says was done: a block set or cleared; for an activity, which attribute was set or cleared. */
function auditPayload(studyId: string, input: PlanningInput): Record<string, unknown> {
  if (input.block !== 'activityAttributes') return { studyId, block: input.block, cleared: input.value === null };
  const v = input.value;
  const act = (x: unknown) => (x === null ? 'cleared' : 'set');
  return {
    studyId,
    block: input.block,
    activityId: v.activityId,
    ...('location' in v ? { location: act(v.location) } : {}),
    ...('specimen' in v ? { specimen: act(v.specimen) } : {}),
  };
}

/** The design check, after the commit. A failure here does not make a committed write look unwritten. */
function validationOf(next: StudyDesign): { validation: ReturnType<typeof validateDesign> | null; validationNote?: string } {
  try {
    return { validation: validateDesign(next) };
  } catch (err: unknown) {
    console.error('[study-design/planning] validation after commit', err instanceof Error ? err.message : String(err));
    return { validation: null, validationNote: 'The block was recorded; the design check could not be computed for this response.' };
  }
}

export async function recordPlanningInput(req: Request, res: Response) {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  const pre = precheck(req.body);
  if ('status' in pre) return res.status(pre.status).json(pre.body);
  const { input, reason, expected } = pre;

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
    const next = applyPlanningInput({ ...current, id: current.id ?? studyId }, input);
    if (!sameRecorded(recordedBlock(current, input), expected)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'STALE_BLOCK',
        detail: 'This block changed after it was read — another write recorded it. Re-open it to see what is recorded now.',
      });
    }
    await persistStudyDesignTx(client, next, { tenantId: orgId, userId });
    const gov = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'update',
      target: `study-design:${studyId}`,
      reason,
      payload: auditPayload(studyId, input),
      domain: 'mdx',
      surface: 'api',
    });
    await client.query('COMMIT');
    return res.json({ studyId, block: input.block, ...gov, ...validationOf(next) });
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
