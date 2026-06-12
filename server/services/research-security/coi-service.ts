/**
 * Research Security / COI service (add-on) — governed Tx fns. DB-verified.
 * @module server/services/research-security/coi-service
 */
import { pool } from '../../db';
import type { CoiDisclosureType, CoiStatus } from '../../../shared/schema/research-security';

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; }
export class CoiError extends Error { constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) { super(message); this.name = 'CoiError'; } }

export interface DisclosureInput {
  personnelId: number;
  disclosureType: CoiDisclosureType;
  entityName: string;
  country?: string | null;
  description?: string | null;
  monetaryValue?: string | number | null;
  relatedToResearch?: string | null;
  disclosedDate?: string | null;
}

export async function createDisclosureTx(client: Queryable, orgId: number, userId: number, input: DisclosureInput): Promise<{ id: number; foreignFlag: boolean }> {
  const owner = await client.query(`SELECT id FROM research_personnel WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1`, [input.personnelId, orgId]);
  if (owner.rows.length === 0) throw new CoiError('NOT_FOUND', 'Personnel not found for this organization.');
  const { rows } = await client.query(
    `INSERT INTO coi_disclosures (organization_id, personnel_id, disclosure_type, entity_name, country, description, monetary_value, related_to_research, status, disclosed_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9,$10) RETURNING id`,
    [orgId, input.personnelId, input.disclosureType, input.entityName, input.country ?? null, input.description ?? null, input.monetaryValue ?? null, input.relatedToResearch ?? null, input.disclosedDate ?? new Date().toISOString().slice(0, 10), userId]);
  // Foreign appointment/support is a research-security flag (NSPM-33 / NOT-OD-26-017).
  const foreignFlag = (input.disclosureType === 'foreign_appointment' || input.disclosureType === 'foreign_support') || (input.country != null && input.country.toUpperCase() !== 'US');
  return { id: Number(rows[0].id), foreignFlag };
}

const STATUSES = ['submitted', 'under_review', 'no_conflict', 'managed', 'conflict', 'denied'];
export async function reviewDisclosureTx(client: Queryable, orgId: number, userId: number, id: number, input: { status: string; managementPlan?: string | null }): Promise<void> {
  if (!STATUSES.includes(input.status)) throw new CoiError('BAD_INPUT', `Invalid status "${input.status}".`);
  const r = await client.query(
    `UPDATE coi_disclosures SET status=$3, reviewed_by=$4, reviewed_at=now(), management_plan=COALESCE($5, management_plan), updated_at=now()
      WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
    [id, orgId, input.status, userId, input.managementPlan ?? null]);
  if ((r as any).rowCount === 0) throw new CoiError('NOT_FOUND', 'Disclosure not found for this organization.');
}

export async function listDisclosures(orgId: number, personnelId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, personnel_id, disclosure_type, entity_name, country, status, disclosed_date FROM coi_disclosures WHERE organization_id=$1 AND deleted_at IS NULL`;
  if (personnelId != null) { params.push(personnelId); sql += ` AND personnel_id=$2`; }
  sql += ` ORDER BY created_at DESC`;
  return (await pool.query(sql, params)).rows;
}
