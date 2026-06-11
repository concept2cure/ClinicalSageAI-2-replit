/**
 * Research Compliance roster service (shared foundation)
 *
 * Tenant-scoped transaction functions over research_personnel / personnel_training.
 * Provides the data the training gate ("no index until trained") consumes.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 *
 * DB-backed — verified against live Postgres (scripts/db-verify).
 *
 * @module server/services/research-compliance/roster-service
 */

import { pool } from '../../db';
import type { PersonnelRole, TrainingType } from '../../../shared/schema/research-compliance';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class RosterError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'RosterError';
  }
}

export interface PersonnelInput {
  fullName: string;
  role: PersonnelRole;
  email?: string | null;
  institution?: string | null;
  userId?: number | null;
}

export async function createPersonnelTx(client: Queryable, orgId: number, userId: number, input: PersonnelInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO research_personnel (organization_id, user_id, full_name, email, role, institution, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, input.userId ?? null, input.fullName, input.email ?? null, input.role, input.institution ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export interface TrainingInput {
  trainingType: TrainingType;
  completedDate?: string | null;
  expiresDate?: string | null;
  certificateRef?: string | null;
}

export async function addTrainingTx(client: Queryable, orgId: number, userId: number, personnelId: number, input: TrainingInput): Promise<{ id: number }> {
  const owner = await client.query(`SELECT id FROM research_personnel WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [personnelId, orgId]);
  if (owner.rows.length === 0) throw new RosterError('NOT_FOUND', 'Personnel not found for this organization.');
  const { rows } = await client.query(
    `INSERT INTO personnel_training (organization_id, personnel_id, training_type, completed_date, expires_date, certificate_ref, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, personnelId, input.trainingType, input.completedDate ?? null, input.expiresDate ?? null, input.certificateRef ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function listPersonnel(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(`SELECT id, full_name, email, role, institution FROM research_personnel WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY full_name`, [orgId]);
  return rows;
}

/** Load personnel + their training records for the training gate. Org-scoped. */
export async function loadRosterForGate(orgId: number, personnelIds: number[]): Promise<{
  personnel: Array<{ id: number; name: string; role: string }>;
  records: Array<{ personnelId: number; personnelName: string; trainingType: string; completedDate: string | null; expiresDate: string | null }>;
}> {
  if (personnelIds.length === 0) return { personnel: [], records: [] };
  const p = await pool.query(
    `SELECT id, full_name, role FROM research_personnel WHERE organization_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL`,
    [orgId, personnelIds],
  );
  const t = await pool.query(
    `SELECT t.personnel_id, p.full_name, t.training_type, t.completed_date, t.expires_date
       FROM personnel_training t JOIN research_personnel p ON p.id = t.personnel_id
      WHERE t.organization_id = $1 AND t.personnel_id = ANY($2::int[]) AND t.deleted_at IS NULL`,
    [orgId, personnelIds],
  );
  return {
    personnel: p.rows.map((r) => ({ id: r.id, name: r.full_name, role: r.role })),
    records: t.rows.map((r) => ({ personnelId: r.personnel_id, personnelName: r.full_name, trainingType: r.training_type, completedDate: r.completed_date, expiresDate: r.expires_date })),
  };
}
