/**
 * Protocol Deviations & CAPA service (Capability C2C-18b)
 *
 * Tenant-scoped transaction functions: record a deviation (with deterministic
 * reportability assessment), attach CAPA actions, advance CAPA status, and close
 * a deviation behind the deterministic CAPA-closure gate. Reads list deviations
 * (optionally by protocol document) and fetch a deviation with its CAPA actions.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 *
 * @module server/services/protocol-deviations/protocol-deviations-service
 */

import { pool } from '../../db';
import {
  assessReportability,
  evaluateCapaClosure,
  type DeviationCategory,
  type DeviationSeverity,
  type CapaActionStatus,
} from './protocol-deviations-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolDeviationsError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolDeviationsError';
  }
}

const CATEGORIES = ['enrollment', 'consent', 'procedure', 'safety', 'data', 'other'];
const SEVERITIES = ['minor', 'major', 'critical'];
const CAPA_STATUSES = ['open', 'in_progress', 'completed', 'verified'];

// ─── Deviations ──────────────────────────────────────────────────────────────

export interface DeviationInput {
  protocolDocumentId: number;
  description: string;
  category?: DeviationCategory;
  severity?: DeviationSeverity;
  affectsSafety?: boolean;
  rootCause?: string | null;
  deviationNumber?: string | null;
  discoveredDate?: string | null;
}

/** Record a protocol deviation; reportability is computed deterministically. */
export async function createDeviationTx(
  client: Queryable,
  orgId: number,
  userId: number,
  input: DeviationInput,
): Promise<{ id: number; reportable: boolean; timelinessDays: number; basis: string }> {
  const category = input.category ?? 'other';
  const severity = input.severity ?? 'minor';
  if (!CATEGORIES.includes(category)) throw new ProtocolDeviationsError('BAD_INPUT', `Invalid category "${category}".`);
  if (!SEVERITIES.includes(severity)) throw new ProtocolDeviationsError('BAD_INPUT', `Invalid severity "${severity}".`);

  const doc = await client.query(
    `SELECT id FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.protocolDocumentId, orgId],
  );
  if (doc.rows.length === 0) throw new ProtocolDeviationsError('NOT_FOUND', 'Protocol document not found for this organization.');

  const report = assessReportability({ severity, category, affectsSafety: input.affectsSafety });
  const { rows } = await client.query(
    `INSERT INTO protocol_deviations
       (organization_id, protocol_document_id, deviation_number, description, category, severity, is_reportable, root_cause, discovered_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10) RETURNING id`,
    [orgId, input.protocolDocumentId, input.deviationNumber ?? null, input.description, category, severity, report.reportable, input.rootCause ?? null, input.discoveredDate ?? null, userId],
  );
  return { id: Number(rows[0].id), reportable: report.reportable, timelinessDays: report.timelinessDays, basis: report.basis };
}

async function loadDeviation(client: Queryable, orgId: number, devId: number): Promise<{ status: string }> {
  const d = await client.query(
    `SELECT status FROM protocol_deviations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [devId, orgId],
  );
  if (d.rows.length === 0) throw new ProtocolDeviationsError('NOT_FOUND', 'Deviation not found for this organization.');
  return { status: d.rows[0].status };
}

// ─── CAPA actions ────────────────────────────────────────────────────────────

export interface CapaActionInput {
  action: string;
  owner?: string | null;
  dueDate?: string | null;
}

/** Attach a CAPA action to a deviation; moves the deviation to capa_pending. */
export async function addCapaActionTx(
  client: Queryable,
  orgId: number,
  userId: number,
  devId: number,
  input: CapaActionInput,
): Promise<{ id: number }> {
  const dev = await loadDeviation(client, orgId, devId);
  if (dev.status === 'closed') throw new ProtocolDeviationsError('INVALID_STATE', 'Deviation is closed; reopen to add CAPA actions.');
  const { rows } = await client.query(
    `INSERT INTO protocol_capa_actions (organization_id, deviation_id, action, owner, due_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'open',$6) RETURNING id`,
    [orgId, devId, input.action, input.owner ?? null, input.dueDate ?? null, userId],
  );
  await client.query(
    `UPDATE protocol_deviations SET status = CASE WHEN status IN ('open','under_review') THEN 'capa_pending' ELSE status END, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [devId, orgId],
  );
  return { id: Number(rows[0].id) };
}

/** Advance a CAPA action's status; stamps completed_date when completed/verified. */
export async function setCapaStatusTx(
  client: Queryable,
  orgId: number,
  capaId: number,
  status: CapaActionStatus,
): Promise<void> {
  if (!CAPA_STATUSES.includes(status)) throw new ProtocolDeviationsError('BAD_INPUT', `Invalid CAPA status "${status}".`);
  const c = await client.query(
    `SELECT id FROM protocol_capa_actions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [capaId, orgId],
  );
  if (c.rows.length === 0) throw new ProtocolDeviationsError('NOT_FOUND', 'CAPA action not found for this organization.');
  const stampCompleted = status === 'completed' || status === 'verified';
  await client.query(
    `UPDATE protocol_capa_actions
        SET status = $3,
            completed_date = CASE WHEN $4::boolean THEN COALESCE(completed_date, CURRENT_DATE) ELSE completed_date END,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [capaId, orgId, status, stampCompleted],
  );
}

// ─── Closure ─────────────────────────────────────────────────────────────────

async function capaStatusesFor(client: Queryable, orgId: number, devId: number): Promise<{ status: CapaActionStatus }[]> {
  const { rows } = await client.query(
    `SELECT status FROM protocol_capa_actions WHERE deviation_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [devId, orgId],
  );
  return rows.map((r) => ({ status: r.status as CapaActionStatus }));
}

/** Close a deviation — gated on the deterministic CAPA-closure check. */
export async function closeDeviationTx(
  client: Queryable,
  orgId: number,
  devId: number,
): Promise<{ closed: true }> {
  const dev = await loadDeviation(client, orgId, devId);
  const capaActions = await capaStatusesFor(client, orgId, devId);
  const gate = evaluateCapaClosure({ deviationStatus: dev.status as any, capaActions });
  if (!gate.readyToClose) {
    throw new ProtocolDeviationsError('INVALID_STATE', `Cannot close — ${gate.blockers.join(' ')}`);
  }
  await client.query(
    `UPDATE protocol_deviations SET status = 'closed', updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [devId, orgId],
  );
  return { closed: true };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDeviations(orgId: number, protocolDocumentId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, protocol_document_id, deviation_number, description, category, severity, is_reportable, status, discovered_date, created_at
               FROM protocol_deviations WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (protocolDocumentId != null) { params.push(protocolDocumentId); sql += ` AND protocol_document_id = $2`; }
  sql += ` ORDER BY created_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getDeviation(orgId: number, devId: number): Promise<any | null> {
  const d = await pool.query(
    `SELECT * FROM protocol_deviations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [devId, orgId],
  );
  if (d.rows.length === 0) return null;
  const capa = await pool.query(
    `SELECT id, action, owner, due_date, status, completed_date FROM protocol_capa_actions
      WHERE deviation_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [devId, orgId],
  );
  return { ...d.rows[0], capaActions: capa.rows };
}

/** Read-only closure assessment (uses the pure evaluateCapaClosure). */
export async function getCapaClosure(orgId: number, devId: number): Promise<{ readyToClose: boolean; blockers: string[] }> {
  const dev = await pool.query(
    `SELECT status FROM protocol_deviations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [devId, orgId],
  );
  if (dev.rows.length === 0) throw new ProtocolDeviationsError('NOT_FOUND', 'Deviation not found for this organization.');
  const capa = await pool.query(
    `SELECT status FROM protocol_capa_actions WHERE deviation_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [devId, orgId],
  );
  return evaluateCapaClosure({ deviationStatus: dev.rows[0].status, capaActions: capa.rows.map((r) => ({ status: r.status })) });
}
