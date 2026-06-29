/**
 * CITI Training full-integration service (Capability C2C-01/02, training)
 *
 * Tenant-scoped functions over research_personnel / personnel_training for the
 * CITI workflow: bulk-import completion records, the org training matrix, and the
 * expiring-soon report. Mutations reuse the roster service's addTrainingTx (which
 * validates org ownership) and run inside the caller's transaction. Reads cast
 * dates to text so the pure logic (citi-logic.ts) receives ISO strings.
 *
 * @module server/services/citi/citi-service
 */

import { pool } from '../../db';
import { addTrainingTx } from '../research-compliance/roster-service';
import { buildTrainingMatrix, expiringSoon, EXPIRING_WINDOW_DAYS, type TrainingMatrix, type ExpiringResult } from './citi-logic';
import type { TrainingType } from '../../../shared/schema/research-compliance';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class CitiError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'CitiError';
  }
}

const TRAINING_TYPES = ['citi_human_subjects', 'citi_gcp', 'citi_animal', 'citi_rcr', 'biosafety', 'bloodborne_pathogens', 'iata_shipping', 'hipaa', 'fcoi_disclosure', 'other'];

export interface CitiRecordInput {
  trainingType: TrainingType;
  completedDate?: string | null;
  expiresDate?: string | null;
  certificateRef?: string | null;
}

/**
 * Bulk-import CITI completion records for one person (reuses addTrainingTx, which
 * verifies the personnel record belongs to the org). Returns the created ids and
 * a per-type count for metrics.
 */
export async function importCitiRecordsTx(client: Queryable, orgId: number, userId: number, personnelId: number, records: CitiRecordInput[]): Promise<{ ids: number[]; byType: Record<string, number> }> {
  if (!Array.isArray(records) || records.length === 0) throw new CitiError('BAD_INPUT', 'At least one training record is required.');
  const ids: number[] = [];
  const byType: Record<string, number> = {};
  for (const r of records) {
    if (!TRAINING_TYPES.includes(r.trainingType)) throw new CitiError('BAD_INPUT', `Invalid training_type "${r.trainingType}".`);
    const { id } = await addTrainingTx(client, orgId, userId, personnelId, {
      trainingType: r.trainingType,
      completedDate: r.completedDate ?? null,
      expiresDate: r.expiresDate ?? null,
      certificateRef: r.certificateRef ?? null,
    });
    ids.push(id);
    byType[r.trainingType] = (byType[r.trainingType] ?? 0) + 1;
  }
  return { ids, byType };
}

/** Org-wide training matrix: every person with a cell per known training type. Optionally surface required-but-missing types. */
export async function getTrainingMatrix(orgId: number, requiredTypes: ReadonlyArray<TrainingType> = []): Promise<TrainingMatrix> {
  const today = new Date().toISOString().slice(0, 10);
  const personnel = await pool.query(`SELECT id, full_name, role FROM research_personnel WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY full_name`, [orgId]);
  const records = await pool.query(
    `SELECT personnel_id, training_type, completed_date::text AS completed_date, expires_date::text AS expires_date
       FROM personnel_training WHERE organization_id = $1 AND deleted_at IS NULL`,
    [orgId],
  );
  return buildTrainingMatrix(
    personnel.rows.map((p) => ({ id: p.id, name: p.full_name, role: p.role })),
    records.rows.map((r) => ({ personnelId: r.personnel_id, trainingType: r.training_type, completedDate: r.completed_date, expiresDate: r.expires_date })),
    today,
    requiredTypes,
  );
}

/** Org-wide expiring-soon training report, soonest first. */
export async function getExpiringTraining(orgId: number, withinDays: number = EXPIRING_WINDOW_DAYS): Promise<ExpiringResult[]> {
  const today = new Date().toISOString().slice(0, 10);
  const records = await pool.query(
    `SELECT t.personnel_id, p.full_name, t.training_type, t.completed_date::text AS completed_date, t.expires_date::text AS expires_date
       FROM personnel_training t JOIN research_personnel p ON p.id = t.personnel_id
      WHERE t.organization_id = $1 AND t.deleted_at IS NULL`,
    [orgId],
  );
  return expiringSoon(
    records.rows.map((r) => ({ personnelId: r.personnel_id, personnelName: r.full_name, trainingType: r.training_type, completedDate: r.completed_date, expiresDate: r.expires_date })),
    today,
    withinDays,
  );
}
