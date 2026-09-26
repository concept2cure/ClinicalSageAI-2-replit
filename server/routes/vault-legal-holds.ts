/**
 * Legal holds on vault records (security audit 2026-09-24, DP-20; plan P1-22;
 * Annex 11 §17, GDPR Art. 17(3)(b), 21 CFR 11.10(c)).
 *
 * `vault.legal_holds` existed and the retention sweep honoured it, but nothing
 * could place or lift a hold: no route, no tool. A hold is a governed record —
 * who placed it, why and when; who lifted it, why and when — so each change is
 * one transaction with its chained audit row (`writeChainedAuditRow`), the way
 * vault ingest and program archive write theirs: the hold and its record
 * commit together or not at all.
 *
 * Authority: the roles that run QA and administration (owner, admin, manager,
 * the audit-trail readers of P1-20) or a platform administrator. The target
 * must be the organisation's own program or document; anything else is 404,
 * never a hint that it exists.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { pool } from '../db';
import { isPlatformAdmin } from '../middleware/requirePlatformAdmin';
import { AUDIT_READER_ROLES } from '../services/audit/audit-api-authority';
import { writeChainedAuditRow } from '../services/auditService';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('vault-legal-holds');

/** The roles that may place or lift a hold: the same set that reads the audit trail. */
const HOLD_AUTHORITY_ROLES: readonly string[] = AUDIT_READER_ROLES;

const HOLD_COLUMNS =
  'id, organization_id, reference, reason, scope, program_id, document_id, placed_by, placed_at, lifted_at, lifted_by, lift_reason';

const placeSchema = z
  .object({
    scope: z.enum(['program', 'document']),
    programId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    reference: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(3).max(2000),
  })
  .refine(
    (b) => (b.scope === 'program' ? Boolean(b.programId) && !b.documentId : Boolean(b.documentId) && !b.programId),
    { message: 'A program hold names programId and a document hold names documentId, and nothing else.' },
  );

const liftSchema = z.object({ liftReason: z.string().trim().min(3).max(2000) });

interface HoldRow {
  id: string;
  organization_id: number;
  reference: string;
  reason: string;
  scope: string;
  program_id: string | null;
  document_id: string | null;
  placed_by: number | null;
  placed_at: Date | string;
  lifted_at: Date | string | null;
  lifted_by: number | null;
  lift_reason: string | null;
}

function presentHold(row: HoldRow) {
  return {
    id: row.id,
    reference: row.reference,
    reason: row.reason,
    scope: row.scope,
    programId: row.program_id,
    documentId: row.document_id,
    placedBy: row.placed_by,
    placedAt: row.placed_at,
    liftedAt: row.lifted_at,
    liftedBy: row.lifted_by,
    liftReason: row.lift_reason,
    active: row.lifted_at === null,
  };
}

/** The organisation and actor of a session that may manage holds, else the refusal already sent. */
function holdAuthority(req: Request, res: Response): { orgId: number; actorId: number } | null {
  const roles = [String(req.user?.role ?? ''), ...(req.user?.roles ?? []).map(String)].map((r) => r.toLowerCase());
  const permitted = Boolean(req.user) && (isPlatformAdmin(req) || HOLD_AUTHORITY_ROLES.some((r) => roles.includes(r)));
  if (!permitted) {
    res.status(403).json({
      error: 'HOLD_AUTHORITY_REQUIRED',
      message: 'Legal holds are placed and lifted by organisation administrators and managers.',
    });
    return null;
  }
  const orgId = authedOrgId(req);
  const actorId = Number((req as { userId?: unknown }).userId ?? req.user?.id);
  if (orgId === null || orgId <= 0 || !Number.isInteger(actorId) || actorId <= 0) {
    res.status(403).json({ error: 'Tenant context required' });
    return null;
  }
  return { orgId, actorId };
}

/** Whether the target is this organisation's own program or (undeleted) document. */
async function targetOwned(orgId: number, body: z.infer<typeof placeSchema>): Promise<boolean> {
  if (body.scope === 'program') {
    // tenant-isolation-safe: the program is read with the session's organisation as a predicate.
    const r = await pool.query('SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1', [body.programId, orgId]);
    return r.rowCount === 1;
  }
  // tenant-isolation-safe: the document's program must belong to the session's organisation.
  const r = await pool.query(
    `SELECT d.id FROM vault.documents d
       JOIN regulatory_programs p ON p.id = d.program_id
      WHERE d.id = $1 AND p.organization_id = $2 AND d.deleted_at IS NULL
      LIMIT 1`,
    [body.documentId, orgId],
  );
  return r.rowCount === 1;
}

const WRITE_FAILED = { error: 'HOLD_WRITE_FAILED', message: 'The hold could not be recorded. Nothing was changed.' };

/** The organisation's holds, active first. */
async function listHolds(req: Request, res: Response): Promise<void> {
  const auth = holdAuthority(req, res);
  if (!auth) return;
  try {
    // tenant-isolation-safe: holds are read by the session's organisation.
    const r = await pool.query(
      `SELECT ${HOLD_COLUMNS} FROM vault.legal_holds
        WHERE organization_id = $1
        ORDER BY (lifted_at IS NULL) DESC, placed_at DESC
        LIMIT 500`,
      [auth.orgId],
    );
    res.json({ holds: (r.rows as HoldRow[]).map(presentHold) });
  } catch (err) {
    log.error('Legal holds could not be listed', { orgId: auth.orgId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'HOLDS_UNAVAILABLE', message: 'The holds could not be read.' });
  }
}

/** Place a hold: the row and its chained audit row, in one transaction. */
async function placeHold(req: Request, res: Response): Promise<void> {
  const auth = holdAuthority(req, res);
  if (!auth) return;
  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'HOLD_INVALID', message: parsed.error.issues[0]?.message ?? 'Invalid hold.' });
    return;
  }
  const body = parsed.data;
  if (!(await targetOwned(auth.orgId, body))) {
    res.status(404).json({ error: 'HOLD_TARGET_NOT_FOUND', message: 'No such program or document in this organisation.' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id, document_id, placed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${HOLD_COLUMNS}`,
      [auth.orgId, body.reference, body.reason, body.scope, body.programId ?? null, body.documentId ?? null, auth.actorId],
    );
    const hold = inserted.rows[0] as HoldRow;
    await writeChainedAuditRow(
      client,
      {
        action: 'vault.legal_hold.placed',
        userId: auth.actorId,
        resourceType: 'vault_legal_hold',
        resourceId: hold.id,
        details: { scope: body.scope, programId: body.programId ?? null, documentId: body.documentId ?? null, reference: body.reference, reason: body.reason },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
      auth.orgId,
      hold.id,
    );
    await client.query('COMMIT');
    res.status(201).json({ hold: presentHold(hold) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    log.error('Legal hold could not be placed', { orgId: auth.orgId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json(WRITE_FAILED);
  } finally {
    client.release();
  }
}

/** Lift a hold: who, why and when, with its chained audit row, in one transaction. */
async function liftHold(req: Request, res: Response): Promise<void> {
  const auth = holdAuthority(req, res);
  if (!auth) return;
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = liftSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: 'HOLD_INVALID', message: 'A lift names the hold and gives a reason.' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // tenant-isolation-safe: the hold is updated by id within the session's organisation only.
    const updated = await client.query(
      `UPDATE vault.legal_holds SET lifted_at = NOW(), lifted_by = $2, lift_reason = $3
        WHERE id = $1 AND organization_id = $4 AND lifted_at IS NULL
        RETURNING ${HOLD_COLUMNS}`,
      [id.data, auth.actorId, parsed.data.liftReason, auth.orgId],
    );
    if (updated.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'HOLD_NOT_ACTIVE', message: 'No active hold with that id in this organisation.' });
      return;
    }
    const hold = updated.rows[0] as HoldRow;
    await writeChainedAuditRow(
      client,
      {
        action: 'vault.legal_hold.lifted',
        userId: auth.actorId,
        resourceType: 'vault_legal_hold',
        resourceId: hold.id,
        details: { scope: hold.scope, programId: hold.program_id, documentId: hold.document_id, reference: hold.reference, liftReason: parsed.data.liftReason },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
      auth.orgId,
      hold.id,
    );
    await client.query('COMMIT');
    res.json({ hold: presentHold(hold) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    log.error('Legal hold could not be lifted', { orgId: auth.orgId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json(WRITE_FAILED);
  } finally {
    client.release();
  }
}

export function createVaultLegalHoldRoutes(): Router {
  const router = Router();
  router.get('/', listHolds);
  router.post('/', placeHold);
  router.post('/:id/lift', liftHold);
  return router;
}

export default createVaultLegalHoldRoutes;
