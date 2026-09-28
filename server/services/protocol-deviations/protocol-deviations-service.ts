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
  isAssessed,
  type DeviationCategory,
  type DeviationSeverity,
  type CapaActionStatus,
  type ReportabilityResult,
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

export interface DeviationWriteResult extends ReportabilityResult {
  id: number;
  assessed: boolean;
}

/**
 * Record a protocol deviation. Severity, category and safety impact are stored
 * as given and NULL when not given — an unrecorded severity is not "minor"
 * (it used to be defaulted, which made the deviation "not reportable" on an
 * assessment nobody made). When the reporter supplies both severity and
 * safety impact, that IS their assessment and is recorded as such.
 */
export async function createDeviationTx(
  client: Queryable,
  orgId: number,
  userId: number,
  input: DeviationInput,
): Promise<DeviationWriteResult> {
  const category = input.category ?? null;
  const severity = input.severity ?? null;
  const affectsSafety = typeof input.affectsSafety === 'boolean' ? input.affectsSafety : null;
  if (category !== null && !CATEGORIES.includes(category)) throw new ProtocolDeviationsError('BAD_INPUT', `Invalid category "${category}".`);
  if (severity !== null && !SEVERITIES.includes(severity)) throw new ProtocolDeviationsError('BAD_INPUT', `Invalid severity "${severity}".`);

  const doc = await client.query(
    `SELECT id FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.protocolDocumentId, orgId],
  );
  if (doc.rows.length === 0) throw new ProtocolDeviationsError('NOT_FOUND', 'Protocol document not found for this organization.');

  const report = assessReportability({ severity, category, affectsSafety });
  const assessed = isAssessed({ severity, affectsSafety });
  const { rows } = await client.query(
    `INSERT INTO protocol_deviations
       (organization_id, protocol_document_id, deviation_number, description, category, severity, affects_safety, is_reportable,
        root_cause, discovered_date, status, created_by, assessed_by, assessed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12, CASE WHEN $12::int IS NULL THEN NULL ELSE now() END) RETURNING id`,
    [
      orgId, input.protocolDocumentId, input.deviationNumber ?? null, input.description, category, severity, affectsSafety,
      report.reportable, input.rootCause ?? null, input.discoveredDate ?? null, userId, assessed ? userId : null,
    ],
  );
  return { id: Number(rows[0].id), assessed, ...report };
}

interface LoadedDeviation {
  status: string;
  category: DeviationCategory | null;
  severity: DeviationSeverity | null;
  affectsSafety: boolean | null;
}

async function loadDeviation(client: Queryable, orgId: number, devId: number): Promise<LoadedDeviation> {
  const d = await client.query(
    `SELECT status, category, severity, affects_safety FROM protocol_deviations
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [devId, orgId],
  );
  if (d.rows.length === 0) throw new ProtocolDeviationsError('NOT_FOUND', 'Deviation not found for this organization.');
  const r = d.rows[0];
  return { status: r.status, category: r.category ?? null, severity: r.severity ?? null, affectsSafety: r.affects_safety ?? null };
}

export interface DeviationAssessmentInput {
  severity: DeviationSeverity;
  affectsSafety: boolean;
  /** Why this severity — written to the deviation, alongside who and when. */
  rationale: string;
}

/**
 * Record a person's assessment of a deviation: severity, effect on subject
 * safety, and the rationale, stamped with who and when. Recomputes what the
 * assessment indicates about reporting. This is how a deviation recorded
 * without an assessment — including every legacy row — becomes closable.
 */
export async function assessDeviationTx(
  client: Queryable,
  orgId: number,
  userId: number,
  devId: number,
  input: DeviationAssessmentInput,
): Promise<DeviationWriteResult> {
  if (!SEVERITIES.includes(input.severity)) throw new ProtocolDeviationsError('BAD_INPUT', `Invalid severity "${input.severity}".`);
  if (typeof input.affectsSafety !== 'boolean') throw new ProtocolDeviationsError('BAD_INPUT', 'State whether the deviation affected subject safety.');
  const rationale = (input.rationale ?? '').trim();
  if (rationale.length < 8) throw new ProtocolDeviationsError('BAD_INPUT', 'Give the rationale for this assessment (at least 8 characters).');
  const dev = await loadDeviation(client, orgId, devId);
  if (dev.status === 'closed') throw new ProtocolDeviationsError('INVALID_STATE', 'Deviation is closed; its assessment cannot be changed.');
  const report = assessReportability({ severity: input.severity, category: dev.category, affectsSafety: input.affectsSafety });
  await client.query(
    `UPDATE protocol_deviations
        SET severity = $3, affects_safety = $4, is_reportable = $5,
            assessed_by = $6, assessed_at = now(), assessment_rationale = $7, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [devId, orgId, input.severity, input.affectsSafety, report.reportable, userId, rationale],
  );
  return { id: devId, assessed: true, ...report };
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
  const gate = evaluateCapaClosure({
    deviationStatus: dev.status as any,
    capaActions,
    assessed: isAssessed({ severity: dev.severity, affectsSafety: dev.affectsSafety }),
  });
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
  let sql = `SELECT id, protocol_document_id, deviation_number, description, category, severity, affects_safety, is_reportable, assessed_by, assessed_at, status, discovered_date, created_at
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

/**
 * Read-only closure assessment — the same loaders and gate closeDeviationTx
 * uses, so the preview and the enforcement cannot disagree (this used to read
 * status alone and would have said "ready" for a deviation nobody assessed).
 */
export async function getCapaClosure(orgId: number, devId: number): Promise<{ readyToClose: boolean; blockers: string[] }> {
  const dev = await loadDeviation(pool, orgId, devId);
  const capaActions = await capaStatusesFor(pool, orgId, devId);
  return evaluateCapaClosure({
    deviationStatus: dev.status as any,
    capaActions,
    assessed: isAssessed({ severity: dev.severity, affectsSafety: dev.affectsSafety }),
  });
}
