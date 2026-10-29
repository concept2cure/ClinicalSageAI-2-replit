/**
 * The GMP deviation record's writes (P-50, 2026-10-29): record one, move it
 * along its lifecycle with its investigation, and close it.
 *
 * The store is qc_deviations (migrations/20261029g_qc_deviations.sql). Every
 * move is checked against DEVIATION_TRANSITIONS
 * (shared/constants/deviation-lifecycle.ts) and guarded on the status it was
 * read in, so two people moving one record cannot both succeed. A deviation
 * goes for approval only with its root cause and resolution recorded. The close
 * runs on the signing transaction (routes/mdx-qms-deviations.ts) and dates
 * itself; it is the only way to `closed`.
 *
 * @module server/services/qms/deviations
 */
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import type { RequestConnectable } from '../../db/requestDb';
import { DEVIATION_TRANSITIONS, type DeviationStatus } from '../../../shared/constants/deviation-lifecycle';

interface SqlClient { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, any>> }> }

export const DEVIATION_CODE_STATUS: Readonly<Record<string, number>> = {
  DEVIATION_NOT_FOUND: 404, DEVIATION_NUMBER_TAKEN: 409, DEVIATION_MOVE_REFUSED: 422, DEVIATION_NOT_READY: 409,
};

export class DeviationRefused extends Error {
  constructor(readonly code: keyof typeof DEVIATION_CODE_STATUS, message: string) { super(message); }
  get status(): number { return DEVIATION_CODE_STATUS[this.code]; }
}

export interface NewDeviation {
  deviationNumber: string;
  title: string;
  description: string;
  deviationType: string;
  classification: string;
  detectedDate: string;
  category?: string | null;
  location?: string | null;
  department?: string | null;
  batchNumber?: string | null;
  productName?: string | null;
  processStep?: string | null;
  targetClosureDate?: string | null;
}

export async function recordNewDeviation(
  client: SqlClient, organizationId: number, userId: number | null, d: NewDeviation, connection?: RequestConnectable,
): Promise<{ row: Record<string, any>; auditTrail: AuditRowOutcome }> {
  let rows: Array<Record<string, any>>;
  try {
    ({ rows } = await client.query(`INSERT INTO qc_deviations (
         organization_id, deviation_number, deviation_type, classification, category, title, description,
         detected_date, detected_by, location, department, batch_number, product_name, process_step,
         target_closure_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open')
       RETURNING *`,
    [organizationId, d.deviationNumber, d.deviationType, d.classification, d.category ?? null, d.title, d.description,
      d.detectedDate, userId == null ? null : String(userId), d.location ?? null, d.department ?? null,
      d.batchNumber ?? null, d.productName ?? null, d.processStep ?? null, d.targetClosureDate ?? null]));
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      throw new DeviationRefused('DEVIATION_NUMBER_TAKEN', `Deviation ${d.deviationNumber} is already recorded in this organization.`);
    }
    throw err;
  }
  const auditTrail = await recordAuditRow({
    tenantId: organizationId, userId: userId ?? undefined,
    action: 'mdx.qms.deviation.create',
    resourceType: 'qc_deviation', resourceId: String(rows[0].id),
    details: { deviationNumber: d.deviationNumber, classification: d.classification, deviationType: d.deviationType },
  }, connection);
  return { row: rows[0], auditTrail };
}

export interface DeviationUpdate {
  status?: DeviationStatus;
  classification?: string;
  category?: string | null;
  impactLevel?: string | null;
  rootCause?: string | null;
  resolutionDescription?: string | null;
  immediateActions?: string | null;
  targetClosureDate?: string | null;
}

/* Each field the update may set, and its column. A fixed map: no column name comes from the request. */
const COLUMN: Record<Exclude<keyof DeviationUpdate, 'immediateActions'>, string> = {
  status: 'status', classification: 'classification', category: 'category', impactLevel: 'impact_level',
  rootCause: 'root_cause', resolutionDescription: 'resolution_description', targetClosureDate: 'target_closure_date',
};

async function readForMove(client: SqlClient, organizationId: number, id: number) {
  const { rows } = await client.query(
    `SELECT status, root_cause, resolution_description FROM qc_deviations WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
  if (rows.length === 0) throw new DeviationRefused('DEVIATION_NOT_FOUND', 'That deviation is not in this organization.');
  return rows[0] as { status: DeviationStatus; root_cause: string | null; resolution_description: string | null };
}

function refusedMove(from: DeviationStatus, u: DeviationUpdate, current: Awaited<ReturnType<typeof readForMove>>): string | null {
  if (from === 'closed') return 'A closed deviation is not changed.';
  if (!u.status || u.status === from) return null;
  if (!DEVIATION_TRANSITIONS[from].includes(u.status)) {
    return `A deviation that is ${from.replace('_', ' ')} moves to ${DEVIATION_TRANSITIONS[from].join(' or ') || 'nothing'}; it is closed only by a signature.`;
  }
  const rootCause = u.rootCause !== undefined ? u.rootCause : current.root_cause;
  const resolution = u.resolutionDescription !== undefined ? u.resolutionDescription : current.resolution_description;
  if (u.status === 'pending_approval' && (!rootCause?.trim() || !resolution?.trim())) {
    return 'A deviation goes for approval with its root cause and resolution recorded.';
  }
  return null;
}

/** Record the next fact about a deviation, and its status move when there is one. */
export async function updateDeviation(
  client: SqlClient, organizationId: number, id: number, u: DeviationUpdate,
): Promise<Record<string, any>> {
  const current = await readForMove(client, organizationId, id);
  const refusal = refusedMove(current.status, u, current);
  if (refusal) throw new DeviationRefused('DEVIATION_MOVE_REFUSED', refusal);
  const sets: string[] = []; const args: unknown[] = [id, organizationId, current.status];
  for (const [key, column] of Object.entries(COLUMN) as Array<[keyof typeof COLUMN, string]>) {
    if (u[key] === undefined) continue;
    args.push(u[key]); sets.push(`${column} = $${args.length}`);
  }
  if (u.immediateActions !== undefined) { args.push(JSON.stringify(u.immediateActions ? [u.immediateActions] : [])); sets.push(`immediate_actions = $${args.length}::json`); }
  if (u.rootCause !== undefined) { args.push(Boolean(u.rootCause?.trim())); sets.push(`root_cause_identified = $${args.length}`); }
  if (u.status === 'under_investigation') sets.push(`investigation_status = 'in_progress'`);
  if (u.status === 'pending_approval') sets.push(`investigation_status = 'completed'`);
  if (sets.length === 0) throw new DeviationRefused('DEVIATION_MOVE_REFUSED', 'Nothing to record.');
  const { rows } = await client.query(`UPDATE qc_deviations SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = $3 RETURNING *`, args);
  if (rows.length === 0) throw new DeviationRefused('DEVIATION_MOVE_REFUSED', 'The deviation changed while you were recording this. Reload it and try again.');
  return rows[0];
}

/** On the signing transaction: close a deviation that is pending approval with its investigation recorded. */
export async function closeDeviation(client: SqlClient, organizationId: number, id: number, signerId: number): Promise<Record<string, any>> {
  const { rows } = await client.query(`UPDATE qc_deviations
        SET status = 'closed', actual_closure_date = CURRENT_DATE, qa_approved_by = $3, qa_approved_date = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'pending_approval'
        AND COALESCE(btrim(root_cause), '') <> '' AND COALESCE(btrim(resolution_description), '') <> ''
      RETURNING *`, [id, organizationId, String(signerId)]);
  if (rows.length === 1) return rows[0];
  const current = await readForMove(client, organizationId, id);
  throw new DeviationRefused('DEVIATION_NOT_READY', current.status === 'closed'
    ? 'This deviation is already closed. Nothing was signed.'
    : 'A deviation is closed once it is pending approval with its root cause and resolution recorded. Nothing was signed.');
}
