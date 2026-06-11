/**
 * Inspection Readiness service (Capability C2C-13)
 *
 * Tenant-scoped transaction functions over inspections / inspection_findings /
 * finding_responses / readiness_assessments. Mutations run inside the caller's
 * transaction with the governed-action ledger. Adding a finding response
 * defaults its due date to 15 business days from the inspection end date (the
 * 483 clock).
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/inspection/inspection-service
 */

import { pool } from '../../db';
import { responseDueDate } from './inspection-logic';
import type { InspectionType, InspectionAgency, InspectionOutcome, FindingClassification, ReadinessAreaStatus } from '../../../shared/schema/inspection';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class InspectionError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'InspectionError';
  }
}

export interface InspectionInput {
  inspectionType: InspectionType;
  agency: InspectionAgency;
  siteName: string;
  scheduledDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createInspectionTx(client: Queryable, orgId: number, userId: number, input: InspectionInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO inspections (organization_id, inspection_type, agency, site_name, scheduled_date, start_date, end_date, status, outcome, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled','pending',$8) RETURNING id`,
    [orgId, input.inspectionType, input.agency, input.siteName, input.scheduledDate ?? null, input.startDate ?? null, input.endDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function getInspection(client: Queryable, orgId: number, id: number): Promise<any> {
  const { rows } = await client.query(`SELECT * FROM inspections WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  if (rows.length === 0) throw new InspectionError('NOT_FOUND', 'Inspection not found for this organization.');
  return rows[0];
}

const INSP_STATUSES = ['scheduled', 'in_progress', 'completed', 'closed'];
const OUTCOMES = ['pending', 'nai', 'vai', 'oai'];
export async function setInspectionStatusTx(client: Queryable, orgId: number, id: number, status?: string, outcome?: string, endDate?: string | null): Promise<void> {
  if (status && !INSP_STATUSES.includes(status)) throw new InspectionError('BAD_INPUT', `Invalid status "${status}".`);
  if (outcome && !OUTCOMES.includes(outcome)) throw new InspectionError('BAD_INPUT', `Invalid outcome "${outcome}".`);
  await getInspection(client, orgId, id);
  await client.query(
    `UPDATE inspections SET status = COALESCE($3, status), outcome = COALESCE($4, outcome), end_date = COALESCE($5, end_date), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status ?? null, outcome ?? null, endDate ?? null],
  );
}

export async function addFindingTx(client: Queryable, orgId: number, userId: number, inspectionId: number, input: { observationNumber: number; description: string; classification: FindingClassification }): Promise<{ id: number }> {
  await getInspection(client, orgId, inspectionId);
  const { rows } = await client.query(
    `INSERT INTO inspection_findings (organization_id, inspection_id, observation_number, description, classification, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'open',$6) RETURNING id`,
    [orgId, inspectionId, input.observationNumber, input.description, input.classification, userId],
  );
  return { id: Number(rows[0].id) };
}

/** Add a CAPA response to a finding. Due date defaults to 15 business days from the inspection end date. */
export async function addResponseTx(client: Queryable, orgId: number, userId: number, findingId: number, input: { responseDescription: string; dueDate?: string | null }): Promise<{ id: number; dueDate: string | null }> {
  const f = await client.query(
    `SELECT f.id, i.end_date FROM inspection_findings f JOIN inspections i ON i.id = f.inspection_id
      WHERE f.id = $1 AND f.organization_id = $2 AND f.deleted_at IS NULL LIMIT 1`,
    [findingId, orgId],
  );
  if (f.rows.length === 0) throw new InspectionError('NOT_FOUND', 'Finding not found for this organization.');
  const dueDate = input.dueDate ?? responseDueDate(f.rows[0].end_date);
  const { rows } = await client.query(
    `INSERT INTO finding_responses (organization_id, finding_id, response_description, due_date, status, created_by)
     VALUES ($1,$2,$3,$4,'draft',$5) RETURNING id`,
    [orgId, findingId, input.responseDescription, dueDate, userId],
  );
  await client.query(`UPDATE inspection_findings SET status = 'responded', updated_at = now() WHERE id = $1 AND organization_id = $2`, [findingId, orgId]);
  return { id: Number(rows[0].id), dueDate };
}

export async function upsertReadinessTx(client: Queryable, orgId: number, userId: number, input: { inspectionId?: number | null; area: string; status: ReadinessAreaStatus; gaps?: string | null }): Promise<{ id: number }> {
  if (input.inspectionId != null) await getInspection(client, orgId, input.inspectionId);
  const existing = await client.query(
    `SELECT id FROM readiness_assessments WHERE organization_id = $1 AND area = $2 AND (inspection_id IS NOT DISTINCT FROM $3) AND deleted_at IS NULL LIMIT 1`,
    [orgId, input.area, input.inspectionId ?? null],
  );
  if (existing.rows.length > 0) {
    const id = Number(existing.rows[0].id);
    await client.query(`UPDATE readiness_assessments SET status = $3, gaps = COALESCE($4, gaps), updated_at = now() WHERE id = $1 AND organization_id = $2`, [id, orgId, input.status, input.gaps ?? null]);
    return { id };
  }
  const { rows } = await client.query(
    `INSERT INTO readiness_assessments (organization_id, inspection_id, area, status, gaps, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [orgId, input.inspectionId ?? null, input.area, input.status, input.gaps ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listInspections(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, inspection_type, agency, site_name, scheduled_date, start_date, end_date, status, outcome
       FROM inspections WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY COALESCE(scheduled_date, created_at::date) DESC, id DESC`,
    [orgId],
  );
  return rows;
}

export async function listFindings(orgId: number, inspectionId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, observation_number, description, classification, status FROM inspection_findings
      WHERE inspection_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY observation_number`,
    [inspectionId, orgId],
  );
  return rows;
}

export async function listReadinessAreas(orgId: number, inspectionId?: number): Promise<Array<{ area: string; status: ReadinessAreaStatus }>> {
  const params: unknown[] = [orgId];
  let sql = `SELECT area, status FROM readiness_assessments WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (inspectionId != null) { params.push(inspectionId); sql += ` AND inspection_id = $2`; }
  sql += ` ORDER BY area`;
  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({ area: r.area, status: r.status }));
}
