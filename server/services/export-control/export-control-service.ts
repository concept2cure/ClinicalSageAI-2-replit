/**
 * Export Control review service (Capability C2C-26)
 *
 * Tenant-scoped transaction functions for export-control screening: create a
 * review, edit its inputs, read the deterministic ITAR/EAR/OFAC assessment, and
 * finalize a determination behind a deterministic readiness gate (persisting the
 * computed jurisdiction outcome / license-required result). Mutations run inside
 * the caller's transaction with the governed-action ledger.
 *
 * @module server/services/export-control/export-control-service
 */

import { pool } from '../../db';
import {
  evaluateExportControl,
  evaluateExportReviewReadiness,
  type ExportControlAssessment,
  type ExportReviewReadinessResult,
} from './export-control-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ExportControlError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ExportControlError';
  }
}

const JURISDICTIONS = ['itar', 'ear', 'ofac', 'not_subject', 'pending'];

export interface ExportReviewInput {
  projectTitle: string;
  description?: string | null;
  jurisdiction?: string;
  classification?: string | null;
  involvesForeignNationals?: boolean;
  foreignCountries?: string | null;
  hasPublicationRestrictions?: boolean;
  hasProprietaryRestrictions?: boolean;
  involvesPhysicalExport?: boolean;
  grantProposalId?: number | null;
}

export async function createReviewTx(client: Queryable, orgId: number, userId: number, input: ExportReviewInput): Promise<{ id: number }> {
  if (!input.projectTitle || !input.projectTitle.trim()) throw new ExportControlError('BAD_INPUT', 'A project title is required.');
  if (input.jurisdiction && !JURISDICTIONS.includes(input.jurisdiction)) throw new ExportControlError('BAD_INPUT', `Invalid jurisdiction "${input.jurisdiction}".`);
  const { rows } = await client.query(
    `INSERT INTO export_control_reviews
       (organization_id, grant_proposal_id, project_title, description, jurisdiction, classification, involves_foreign_nationals, foreign_countries,
        has_publication_restrictions, has_proprietary_restrictions, involves_physical_export, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12) RETURNING id`,
    [
      orgId, input.grantProposalId ?? null, input.projectTitle.trim(), input.description ?? null, input.jurisdiction ?? 'pending',
      input.classification ?? null, input.involvesForeignNationals === true, input.foreignCountries ?? null,
      input.hasPublicationRestrictions === true, input.hasProprietaryRestrictions === true, input.involvesPhysicalExport === true, userId,
    ],
  );
  return { id: Number(rows[0].id) };
}

async function loadReview(client: Queryable, orgId: number, id: number): Promise<any> {
  const r = await client.query(`SELECT * FROM export_control_reviews WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  if (r.rows.length === 0) throw new ExportControlError('NOT_FOUND', 'Export-control review not found for this organization.');
  return r.rows[0];
}

function assertEditable(status: string): void {
  if (status === 'determined') throw new ExportControlError('INVALID_STATE', 'Determination is final; open a new review to re-assess.');
}

export async function updateReviewTx(client: Queryable, orgId: number, id: number, input: Partial<ExportReviewInput>): Promise<void> {
  const r = await loadReview(client, orgId, id);
  assertEditable(r.status);
  if (input.jurisdiction && !JURISDICTIONS.includes(input.jurisdiction)) throw new ExportControlError('BAD_INPUT', `Invalid jurisdiction "${input.jurisdiction}".`);
  await client.query(
    `UPDATE export_control_reviews SET
        project_title = COALESCE($3, project_title),
        description = COALESCE($4, description),
        jurisdiction = COALESCE($5, jurisdiction),
        classification = COALESCE($6, classification),
        involves_foreign_nationals = COALESCE($7, involves_foreign_nationals),
        foreign_countries = COALESCE($8, foreign_countries),
        has_publication_restrictions = COALESCE($9, has_publication_restrictions),
        has_proprietary_restrictions = COALESCE($10, has_proprietary_restrictions),
        involves_physical_export = COALESCE($11, involves_physical_export),
        status = CASE WHEN status = 'draft' THEN 'under_review' ELSE status END,
        updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      id, orgId,
      input.projectTitle ?? null, input.description ?? null, input.jurisdiction ?? null, input.classification ?? null,
      typeof input.involvesForeignNationals === 'boolean' ? input.involvesForeignNationals : null, input.foreignCountries ?? null,
      typeof input.hasPublicationRestrictions === 'boolean' ? input.hasPublicationRestrictions : null,
      typeof input.hasProprietaryRestrictions === 'boolean' ? input.hasProprietaryRestrictions : null,
      typeof input.involvesPhysicalExport === 'boolean' ? input.involvesPhysicalExport : null,
    ],
  );
}

function inputFromRow(r: any) {
  return {
    jurisdiction: r.jurisdiction,
    classification: r.classification,
    involvesForeignNationals: r.involves_foreign_nationals === true,
    foreignCountries: r.foreign_countries,
    hasPublicationRestrictions: r.has_publication_restrictions === true,
    hasProprietaryRestrictions: r.has_proprietary_restrictions === true,
    involvesPhysicalExport: r.involves_physical_export === true,
  };
}

/** Read-only deterministic assessment. */
export async function getAssessment(orgId: number, id: number): Promise<ExportControlAssessment> {
  const r = await loadReview(pool, orgId, id);
  return evaluateExportControl(inputFromRow(r));
}

/** Read-only determination readiness. */
export async function getReadiness(orgId: number, id: number): Promise<ExportReviewReadinessResult> {
  const r = await loadReview(pool, orgId, id);
  return evaluateExportReviewReadiness(inputFromRow(r));
}

/** Finalize the determination — gated on the deterministic readiness check; persists the computed license outcome. */
export async function determineReviewTx(client: Queryable, orgId: number, userId: number, id: number): Promise<{ determined: true; readiness: ExportReviewReadinessResult }> {
  const r = await loadReview(client, orgId, id);
  if (r.status === 'determined') throw new ExportControlError('INVALID_STATE', 'Determination is already final.');
  const readiness = evaluateExportReviewReadiness(inputFromRow(r));
  if (!readiness.readyToDetermine) throw new ExportControlError('INVALID_STATE', `Cannot determine — ${readiness.blockers.join(' ')}`);
  await client.query(
    `UPDATE export_control_reviews SET status = 'determined', license_required = $3, fundamental_research_exclusion = $4, determined_by = $5, determined_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [id, orgId, readiness.assessment.licenseRequired, readiness.assessment.freApplies, userId],
  );
  return { determined: true, readiness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listReviews(orgId: number, opts?: { status?: string; jurisdiction?: string; grantProposalId?: number }): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, grant_proposal_id, project_title, jurisdiction, classification, involves_foreign_nationals, license_required, fundamental_research_exclusion, status, created_at, updated_at
               FROM export_control_reviews WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (opts?.status) { params.push(opts.status); sql += ` AND status = $${params.length}`; }
  if (opts?.jurisdiction) { params.push(opts.jurisdiction); sql += ` AND jurisdiction = $${params.length}`; }
  if (opts?.grantProposalId != null) { params.push(opts.grantProposalId); sql += ` AND grant_proposal_id = $${params.length}`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getReview(orgId: number, id: number): Promise<any | null> {
  const r = await pool.query(`SELECT * FROM export_control_reviews WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  return r.rows[0] ?? null;
}
