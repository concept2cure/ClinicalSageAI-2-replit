/**
 * NIH Other Support service (Capability C2C-24A)
 *
 * Tenant-scoped transaction functions for authoring an NIH Other Support document:
 * create a document for a person, add/edit funding-source entries, read the
 * person-month summary + disclosure readiness, and certify behind a deterministic
 * readiness gate. Mutations run inside the caller's transaction with the
 * governed-action ledger.
 *
 * @module server/services/other-support/other-support-service
 */

import { pool } from '../../db';
import {
  computeOtherSupportSummary,
  evaluateOtherSupportReadiness,
  type OtherSupportSummary,
  type OtherSupportReadinessResult,
  type OtherSupportEntryView,
} from './other-support-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class OtherSupportError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'OtherSupportError';
  }
}

const SUPPORT_TYPES = ['grant', 'contract', 'in_kind', 'other'];
const ENTRY_STATUSES = ['active', 'pending'];

// ─── Documents ─────────────────────────────────────────────────────────────────

export interface OtherSupportDocInput {
  personName: string;
  personnelId?: number | null;
  grantProposalId?: number | null;
  eraCommonsId?: string | null;
  role?: string | null;
}

export async function createDocumentTx(client: Queryable, orgId: number, userId: number, input: OtherSupportDocInput): Promise<{ id: number }> {
  if (!input.personName || !input.personName.trim()) throw new OtherSupportError('BAD_INPUT', 'A person name is required.');
  const { rows } = await client.query(
    `INSERT INTO other_support_documents (organization_id, personnel_id, grant_proposal_id, person_name, era_commons_id, role, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [orgId, input.personnelId ?? null, input.grantProposalId ?? null, input.personName.trim(), input.eraCommonsId ?? null, input.role ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function loadDocument(client: Queryable, orgId: number, documentId: number): Promise<{ status: string }> {
  const d = await client.query(`SELECT status FROM other_support_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [documentId, orgId]);
  if (d.rows.length === 0) throw new OtherSupportError('NOT_FOUND', 'Other Support document not found for this organization.');
  return { status: d.rows[0].status };
}

function assertEditable(status: string): void {
  if (status === 'certified') throw new OtherSupportError('INVALID_STATE', 'Other Support is certified; create a new version to edit.');
}

// ─── Entries ───────────────────────────────────────────────────────────────

export interface OtherSupportEntryInput {
  supportType?: string;
  projectTitle: string;
  fundingSource: string;
  status?: string;
  isForeign?: boolean;
  foreignCountry?: string | null;
  personMonthsCalendar?: number;
  personMonthsAcademic?: number;
  personMonthsSummer?: number;
  majorGoals?: string | null;
  overlapStatement?: string | null;
  awardIdentifier?: string | null;
}

export async function addEntryTx(client: Queryable, orgId: number, userId: number, documentId: number, input: OtherSupportEntryInput): Promise<{ id: number }> {
  const doc = await loadDocument(client, orgId, documentId);
  assertEditable(doc.status);
  if (input.supportType && !SUPPORT_TYPES.includes(input.supportType)) throw new OtherSupportError('BAD_INPUT', `Invalid support type "${input.supportType}".`);
  if (input.status && !ENTRY_STATUSES.includes(input.status)) throw new OtherSupportError('BAD_INPUT', `Invalid status "${input.status}".`);
  if (!input.projectTitle || !input.projectTitle.trim()) throw new OtherSupportError('BAD_INPUT', 'A project title is required.');
  if (!input.fundingSource || !input.fundingSource.trim()) throw new OtherSupportError('BAD_INPUT', 'A funding source is required.');
  const order = await client.query(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM other_support_entries WHERE document_id = $1 AND organization_id = $2`, [documentId, orgId]);
  const { rows } = await client.query(
    `INSERT INTO other_support_entries
       (organization_id, document_id, support_type, project_title, funding_source, status, is_foreign, foreign_country,
        person_months_calendar, person_months_academic, person_months_summer, major_goals, overlap_statement, award_identifier, order_index, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [
      orgId, documentId, input.supportType ?? 'grant', input.projectTitle.trim(), input.fundingSource.trim(), input.status ?? 'active',
      input.isForeign === true, input.foreignCountry ?? null,
      input.personMonthsCalendar ?? 0, input.personMonthsAcademic ?? 0, input.personMonthsSummer ?? 0,
      input.majorGoals ?? null, input.overlapStatement ?? null, input.awardIdentifier ?? null, Number(order.rows[0].next), userId,
    ],
  );
  await client.query(`UPDATE other_support_documents SET status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = $1 AND organization_id = $2`, [documentId, orgId]);
  return { id: Number(rows[0].id) };
}

export async function updateEntryTx(client: Queryable, orgId: number, entryId: number, input: Partial<OtherSupportEntryInput>): Promise<void> {
  const el = await client.query(
    `SELECT e.id, d.status AS doc_status, d.id AS doc_id FROM other_support_entries e JOIN other_support_documents d ON d.id = e.document_id
      WHERE e.id = $1 AND e.organization_id = $2 AND e.deleted_at IS NULL LIMIT 1`,
    [entryId, orgId],
  );
  if (el.rows.length === 0) throw new OtherSupportError('NOT_FOUND', 'Other Support entry not found for this organization.');
  assertEditable(el.rows[0].doc_status);
  if (input.supportType && !SUPPORT_TYPES.includes(input.supportType)) throw new OtherSupportError('BAD_INPUT', `Invalid support type "${input.supportType}".`);
  if (input.status && !ENTRY_STATUSES.includes(input.status)) throw new OtherSupportError('BAD_INPUT', `Invalid status "${input.status}".`);
  await client.query(
    `UPDATE other_support_entries SET
        support_type = COALESCE($3, support_type),
        project_title = COALESCE($4, project_title),
        funding_source = COALESCE($5, funding_source),
        status = COALESCE($6, status),
        is_foreign = COALESCE($7, is_foreign),
        foreign_country = COALESCE($8, foreign_country),
        person_months_calendar = COALESCE($9, person_months_calendar),
        person_months_academic = COALESCE($10, person_months_academic),
        person_months_summer = COALESCE($11, person_months_summer),
        major_goals = COALESCE($12, major_goals),
        overlap_statement = COALESCE($13, overlap_statement),
        award_identifier = COALESCE($14, award_identifier),
        updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      entryId, orgId,
      input.supportType ?? null, input.projectTitle ?? null, input.fundingSource ?? null, input.status ?? null,
      typeof input.isForeign === 'boolean' ? input.isForeign : null, input.foreignCountry ?? null,
      input.personMonthsCalendar ?? null, input.personMonthsAcademic ?? null, input.personMonthsSummer ?? null,
      input.majorGoals ?? null, input.overlapStatement ?? null, input.awardIdentifier ?? null,
    ],
  );
}

// ─── Summary + readiness + certify ────────────────────────────────────────────

async function entryViewsFor(orgId: number, documentId: number): Promise<OtherSupportEntryView[]> {
  const { rows } = await pool.query(
    `SELECT support_type, project_title, funding_source, status, is_foreign, foreign_country,
            person_months_calendar, person_months_academic, person_months_summer, major_goals, overlap_statement, award_identifier
       FROM other_support_entries WHERE document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`,
    [documentId, orgId],
  );
  return rows.map((r) => ({
    supportType: r.support_type, projectTitle: r.project_title, fundingSource: r.funding_source, status: r.status,
    isForeign: r.is_foreign, foreignCountry: r.foreign_country,
    personMonthsCalendar: Number(r.person_months_calendar), personMonthsAcademic: Number(r.person_months_academic), personMonthsSummer: Number(r.person_months_summer),
    majorGoals: r.major_goals, overlapStatement: r.overlap_statement, awardIdentifier: r.award_identifier,
  }));
}

export async function getSummary(orgId: number, documentId: number): Promise<OtherSupportSummary> {
  await loadDocument(pool, orgId, documentId);
  return computeOtherSupportSummary(await entryViewsFor(orgId, documentId));
}

export async function getReadiness(orgId: number, documentId: number): Promise<OtherSupportReadinessResult> {
  await loadDocument(pool, orgId, documentId);
  return evaluateOtherSupportReadiness(await entryViewsFor(orgId, documentId));
}

/** Certify — gated on the deterministic readiness check. */
export async function certifyDocumentTx(client: Queryable, orgId: number, userId: number, documentId: number): Promise<{ certified: true; readiness: OtherSupportReadinessResult }> {
  const doc = await loadDocument(client, orgId, documentId);
  if (doc.status === 'certified') throw new OtherSupportError('INVALID_STATE', 'Other Support is already certified.');
  const entries = await client.query(
    `SELECT support_type, project_title, funding_source, status, is_foreign, foreign_country,
            person_months_calendar, person_months_academic, person_months_summer, major_goals, overlap_statement
       FROM other_support_entries WHERE document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`,
    [documentId, orgId],
  );
  const views: OtherSupportEntryView[] = entries.rows.map((r) => ({
    supportType: r.support_type, projectTitle: r.project_title, fundingSource: r.funding_source, status: r.status,
    isForeign: r.is_foreign, foreignCountry: r.foreign_country,
    personMonthsCalendar: Number(r.person_months_calendar), personMonthsAcademic: Number(r.person_months_academic), personMonthsSummer: Number(r.person_months_summer),
    majorGoals: r.major_goals, overlapStatement: r.overlap_statement,
  }));
  const readiness = evaluateOtherSupportReadiness(views);
  if (!readiness.readyToCertify) {
    throw new OtherSupportError('INVALID_STATE', `Cannot certify — ${readiness.blockers.join(' ')}`);
  }
  await client.query(`UPDATE other_support_documents SET status = 'certified', certified_by = $3, certified_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [documentId, orgId, userId]);
  return { certified: true, readiness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDocuments(orgId: number, opts?: { personnelId?: number; grantProposalId?: number }): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, personnel_id, grant_proposal_id, person_name, era_commons_id, role, status, certified_at, created_at, updated_at
               FROM other_support_documents WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (opts?.personnelId != null) { params.push(opts.personnelId); sql += ` AND personnel_id = $${params.length}`; }
  if (opts?.grantProposalId != null) { params.push(opts.grantProposalId); sql += ` AND grant_proposal_id = $${params.length}`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getDocument(orgId: number, documentId: number): Promise<any | null> {
  const d = await pool.query(`SELECT * FROM other_support_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [documentId, orgId]);
  if (d.rows.length === 0) return null;
  const entries = await pool.query(
    `SELECT id, support_type, project_title, funding_source, status, is_foreign, foreign_country,
            person_months_calendar, person_months_academic, person_months_summer, major_goals, overlap_statement, award_identifier, order_index
       FROM other_support_entries WHERE document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`,
    [documentId, orgId],
  );
  return { ...d.rows[0], entries: entries.rows };
}
