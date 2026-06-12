/**
 * Effort Certification service (add-on) — governed Tx fns. DB-verified.
 * @module server/services/effort-certification/effort-service
 */
import { pool } from '../../db';
import { validateEffort, computeEffortContentHash, type EffortLineView } from './effort-logic';

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; }
export class EffortError extends Error { constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) { super(message); this.name = 'EffortError'; } }

export async function createCertificationTx(client: Queryable, orgId: number, userId: number, input: { personnelId: number; periodStart: string; periodEnd: string }): Promise<{ id: number }> {
  const owner = await client.query(`SELECT id FROM research_personnel WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1`, [input.personnelId, orgId]);
  if (owner.rows.length === 0) throw new EffortError('NOT_FOUND', 'Personnel not found for this organization.');
  const { rows } = await client.query(
    `INSERT INTO effort_certifications (organization_id, personnel_id, period_start, period_end, status, created_by) VALUES ($1,$2,$3,$4,'draft',$5) RETURNING id`,
    [orgId, input.personnelId, input.periodStart, input.periodEnd, userId]);
  return { id: Number(rows[0].id) };
}

export async function addLineTx(client: Queryable, orgId: number, userId: number, certId: number, input: { activityLabel: string; committedPct: number; actualPct: number; awardId?: number | null }): Promise<{ id: number }> {
  const c = await client.query(`SELECT status FROM effort_certifications WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1`, [certId, orgId]);
  if (c.rows.length === 0) throw new EffortError('NOT_FOUND', 'Effort statement not found for this organization.');
  if (c.rows[0].status === 'certified') throw new EffortError('INVALID_STATE', 'Cannot add lines to a certified statement.');
  const { rows } = await client.query(
    `INSERT INTO effort_lines (organization_id, certification_id, award_id, activity_label, committed_pct, actual_pct, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, certId, input.awardId ?? null, input.activityLabel, input.committedPct, input.actualPct, userId]);
  return { id: Number(rows[0].id) };
}

export async function loadStatement(client: Queryable, orgId: number, certId: number): Promise<{ row: any; lines: EffortLineView[] }> {
  const c = await client.query(`SELECT * FROM effort_certifications WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1`, [certId, orgId]);
  if (c.rows.length === 0) throw new EffortError('NOT_FOUND', 'Effort statement not found for this organization.');
  const l = await client.query(`SELECT award_id, activity_label, committed_pct, actual_pct FROM effort_lines WHERE certification_id=$1 AND organization_id=$2 AND deleted_at IS NULL ORDER BY id`, [certId, orgId]);
  return { row: c.rows[0], lines: l.rows.map((r) => ({ awardId: r.award_id, activityLabel: r.activity_label, committedPct: Number(r.committed_pct), actualPct: Number(r.actual_pct) })) };
}

/** Certify the statement: deterministic gate is the floor (no high-risk certify); binds the content hash. */
export async function certifyTx(client: Queryable, orgId: number, userId: number, certId: number): Promise<{ contentHash: string; needsRecertification: boolean }> {
  const { row, lines } = await loadStatement(client, orgId, certId);
  if (row.status === 'certified') throw new EffortError('INVALID_STATE', 'Statement is already certified.');
  const v = validateEffort(lines);
  if (v.riskLevel === 'high') throw new EffortError('INVALID_STATE', `Cannot certify — ${v.findings.filter((f) => f.severity === 'critical').map((f) => f.message).join('; ')}`);
  const contentHash = computeEffortContentHash(lines, row.period_start, row.period_end);
  await client.query(`UPDATE effort_certifications SET status='certified', certified_by=$3, certified_at=now(), content_hash=$4, updated_at=now() WHERE id=$1 AND organization_id=$2`, [certId, orgId, userId, contentHash]);
  return { contentHash, needsRecertification: v.needsRecertification };
}

export async function listCertifications(orgId: number, personnelId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, personnel_id, period_start, period_end, status, certified_at FROM effort_certifications WHERE organization_id=$1 AND deleted_at IS NULL`;
  if (personnelId != null) { params.push(personnelId); sql += ` AND personnel_id=$2`; }
  sql += ` ORDER BY period_start DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}
