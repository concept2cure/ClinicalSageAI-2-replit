/**
 * eTMF service (Capability C2C-08)
 *
 * Tenant-scoped transaction functions over tmf_files / tmf_artifacts. Adding an
 * artifact auto-classifies it into a DIA RM zone (deterministic baseline) when no
 * zone is supplied. Mutations run inside the caller's transaction with the
 * governed-action ledger.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/etmf/etmf-service
 */

import { pool } from '../../db';
import { classifyArtifact } from './etmf-logic';
import type { ArtifactStatus } from '../../../shared/schema/etmf';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class EtmfError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'EtmfError';
  }
}

export async function createTmfTx(client: Queryable, orgId: number, userId: number, input: { title: string; studyId?: number | null }): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO tmf_files (organization_id, study_id, title, tmf_model, status, created_by) VALUES ($1,$2,$3,'dia_rm_v3','active',$4) RETURNING id`,
    [orgId, input.studyId ?? null, input.title, userId],
  );
  return { id: Number(rows[0].id) };
}

async function getTmf(client: Queryable, orgId: number, id: number): Promise<void> {
  const r = await client.query(`SELECT id FROM tmf_files WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  if (r.rows.length === 0) throw new EtmfError('NOT_FOUND', 'TMF not found for this organization.');
}

export interface ArtifactInput {
  artifactName: string;
  zone?: number | null;
  section?: string | null;
  expected?: boolean;
  completenessRequired?: boolean;
  status?: ArtifactStatus;
  documentDate?: string | null;
}

/** Add an artifact. When no zone is given, auto-classify by name (DIA RM). */
export async function addArtifactTx(client: Queryable, orgId: number, userId: number, tmfFileId: number, input: ArtifactInput): Promise<{ id: number; zone: number; classification: 'matched' | 'default' | 'explicit' }> {
  await getTmf(client, orgId, tmfFileId);
  let zone = input.zone ?? null;
  let section = input.section ?? null;
  let classification: 'matched' | 'default' | 'explicit' = 'explicit';
  if (zone == null) {
    const c = classifyArtifact(input.artifactName);
    zone = c.zone;
    section = section ?? c.section;
    classification = c.confidence;
  }
  if (zone < 1 || zone > 11) throw new EtmfError('BAD_INPUT', 'zone must be 1-11.');
  const { rows } = await client.query(
    `INSERT INTO tmf_artifacts (organization_id, tmf_file_id, zone, section, artifact_name, expected, completeness_required, status, document_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [orgId, tmfFileId, zone, section, input.artifactName, input.expected !== false, input.completenessRequired !== false, input.status ?? 'expected', input.documentDate ?? null, userId],
  );
  return { id: Number(rows[0].id), zone, classification };
}

const ARTIFACT_STATUSES = ['expected', 'received', 'in_review', 'final', 'missing', 'not_applicable'];
export async function setArtifactStatusTx(client: Queryable, orgId: number, id: number, status: string, documentDate?: string | null): Promise<void> {
  if (!ARTIFACT_STATUSES.includes(status)) throw new EtmfError('BAD_INPUT', `Invalid status "${status}".`);
  const r = await client.query(
    `UPDATE tmf_artifacts SET status = $3, document_date = COALESCE($4, document_date), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, documentDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new EtmfError('NOT_FOUND', 'Artifact not found for this organization.');
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listTmfFiles(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(`SELECT id, study_id, title, tmf_model, status FROM tmf_files WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [orgId]);
  return rows;
}

export async function listArtifacts(orgId: number, tmfFileId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, zone, section, artifact_name, expected, completeness_required, status, document_date FROM tmf_artifacts
      WHERE tmf_file_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY zone, artifact_name`,
    [tmfFileId, orgId],
  );
  return rows;
}

export async function getCompletenessInput(orgId: number, tmfFileId: number): Promise<Array<{ zone: number; artifactName: string; expected: boolean; completenessRequired: boolean; status: ArtifactStatus }>> {
  const tmf = await pool.query(`SELECT id FROM tmf_files WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [tmfFileId, orgId]);
  if (tmf.rows.length === 0) throw new EtmfError('NOT_FOUND', 'TMF not found for this organization.');
  const { rows } = await pool.query(
    `SELECT zone, artifact_name, expected, completeness_required, status FROM tmf_artifacts WHERE tmf_file_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [tmfFileId, orgId],
  );
  return rows.map((r) => ({ zone: r.zone, artifactName: r.artifact_name, expected: r.expected, completenessRequired: r.completeness_required, status: r.status }));
}
