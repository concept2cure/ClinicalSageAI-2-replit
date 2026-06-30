/**
 * Research Agreements (MTA/DUA/CDA) service (Capability C2C-27)
 *
 * Tenant-scoped transaction functions for material/data/confidentiality agreements:
 * create an agreement, edit it, read the deterministic HIPAA execution-readiness
 * gate, read a portfolio roll-up, and execute behind that gate. Mutations run inside
 * the caller's transaction with the governed-action ledger.
 *
 * @module server/services/research-agreements/research-agreements-service
 */

import { pool } from '../../db';
import {
  evaluateAgreementReadiness,
  summarizeAgreementPortfolio,
  type AgreementReadinessResult,
  type AgreementPortfolioSummary,
  type AgreementView,
} from './research-agreements-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ResearchAgreementError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ResearchAgreementError';
  }
}

const TYPES = ['mta', 'dua', 'cda'];
const DIRECTIONS = ['incoming', 'outgoing'];
const STATUSES = ['draft', 'under_review', 'negotiation', 'executed', 'expired', 'terminated'];

export interface AgreementInput {
  agreementType?: string;
  direction?: string;
  title: string;
  ourParty?: string | null;
  otherParty: string;
  materialOrDataDescription?: string | null;
  containsPhi?: boolean;
  containsHumanData?: boolean;
  isDeidentified?: boolean;
  limitedDataSet?: boolean;
  ipRightsTerms?: string | null;
  publicationRights?: boolean;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  grantProposalId?: number | null;
  protocolDocumentId?: number | null;
}

export async function createAgreementTx(client: Queryable, orgId: number, userId: number, input: AgreementInput): Promise<{ id: number }> {
  if (!input.title || !input.title.trim()) throw new ResearchAgreementError('BAD_INPUT', 'An agreement title is required.');
  if (!input.otherParty || !input.otherParty.trim()) throw new ResearchAgreementError('BAD_INPUT', 'The counterparty (other party) is required.');
  if (input.agreementType && !TYPES.includes(input.agreementType)) throw new ResearchAgreementError('BAD_INPUT', `Invalid agreement type "${input.agreementType}".`);
  if (input.direction && !DIRECTIONS.includes(input.direction)) throw new ResearchAgreementError('BAD_INPUT', `Invalid direction "${input.direction}".`);
  const { rows } = await client.query(
    `INSERT INTO research_agreements
       (organization_id, grant_proposal_id, protocol_document_id, agreement_type, direction, title, our_party, other_party,
        material_or_data_description, contains_phi, contains_human_data, is_deidentified, limited_data_set, ip_rights_terms, publication_rights,
        effective_date, expiration_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft',$18) RETURNING id`,
    [
      orgId, input.grantProposalId ?? null, input.protocolDocumentId ?? null, input.agreementType ?? 'mta', input.direction ?? 'incoming',
      input.title.trim(), input.ourParty ?? null, input.otherParty.trim(), input.materialOrDataDescription ?? null,
      input.containsPhi === true, input.containsHumanData === true, input.isDeidentified === true, input.limitedDataSet === true,
      input.ipRightsTerms ?? null, input.publicationRights !== false, input.effectiveDate ?? null, input.expirationDate ?? null, userId,
    ],
  );
  return { id: Number(rows[0].id) };
}

async function loadAgreement(client: Queryable, orgId: number, id: number): Promise<any> {
  const a = await client.query(`SELECT * FROM research_agreements WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  if (a.rows.length === 0) throw new ResearchAgreementError('NOT_FOUND', 'Research agreement not found for this organization.');
  return a.rows[0];
}

function assertEditable(status: string): void {
  if (status === 'executed') throw new ResearchAgreementError('INVALID_STATE', 'Agreement is executed; amend via a new agreement.');
}

export async function updateAgreementTx(client: Queryable, orgId: number, id: number, input: Partial<AgreementInput> & { status?: string }): Promise<void> {
  const a = await loadAgreement(client, orgId, id);
  assertEditable(a.status);
  if (input.agreementType && !TYPES.includes(input.agreementType)) throw new ResearchAgreementError('BAD_INPUT', `Invalid agreement type "${input.agreementType}".`);
  if (input.direction && !DIRECTIONS.includes(input.direction)) throw new ResearchAgreementError('BAD_INPUT', `Invalid direction "${input.direction}".`);
  if (input.status && !STATUSES.includes(input.status)) throw new ResearchAgreementError('BAD_INPUT', `Invalid status "${input.status}".`);
  if (input.status === 'executed') throw new ResearchAgreementError('BAD_INPUT', 'Use the execute endpoint to execute an agreement.');
  await client.query(
    `UPDATE research_agreements SET
        agreement_type = COALESCE($3, agreement_type),
        direction = COALESCE($4, direction),
        title = COALESCE($5, title),
        our_party = COALESCE($6, our_party),
        other_party = COALESCE($7, other_party),
        material_or_data_description = COALESCE($8, material_or_data_description),
        contains_phi = COALESCE($9, contains_phi),
        contains_human_data = COALESCE($10, contains_human_data),
        is_deidentified = COALESCE($11, is_deidentified),
        limited_data_set = COALESCE($12, limited_data_set),
        ip_rights_terms = COALESCE($13, ip_rights_terms),
        publication_rights = COALESCE($14, publication_rights),
        effective_date = COALESCE($15, effective_date),
        expiration_date = COALESCE($16, expiration_date),
        status = COALESCE($17, status),
        updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      id, orgId,
      input.agreementType ?? null, input.direction ?? null, input.title ?? null, input.ourParty ?? null, input.otherParty ?? null,
      input.materialOrDataDescription ?? null,
      typeof input.containsPhi === 'boolean' ? input.containsPhi : null,
      typeof input.containsHumanData === 'boolean' ? input.containsHumanData : null,
      typeof input.isDeidentified === 'boolean' ? input.isDeidentified : null,
      typeof input.limitedDataSet === 'boolean' ? input.limitedDataSet : null,
      input.ipRightsTerms ?? null,
      typeof input.publicationRights === 'boolean' ? input.publicationRights : null,
      input.effectiveDate ?? null, input.expirationDate ?? null, input.status ?? null,
    ],
  );
}

function viewFromRow(a: any): AgreementView {
  return {
    agreementType: a.agreement_type, direction: a.direction, title: a.title, ourParty: a.our_party, otherParty: a.other_party,
    materialOrDataDescription: a.material_or_data_description, containsPhi: a.contains_phi === true, containsHumanData: a.contains_human_data === true,
    isDeidentified: a.is_deidentified === true, limitedDataSet: a.limited_data_set === true, publicationRights: a.publication_rights !== false,
    protocolDocumentId: a.protocol_document_id, expirationDate: a.expiration_date ? String(a.expiration_date).slice(0, 10) : null,
  };
}

/** Read-only execution readiness. */
export async function getReadiness(orgId: number, id: number): Promise<AgreementReadinessResult> {
  const a = await loadAgreement(pool, orgId, id);
  return evaluateAgreementReadiness(viewFromRow(a));
}

/** Read-only portfolio roll-up. `asOf` defaults to today. */
export async function getPortfolio(orgId: number, asOf?: string): Promise<AgreementPortfolioSummary> {
  const { rows } = await pool.query(
    `SELECT agreement_type, status, contains_phi, expiration_date FROM research_agreements WHERE organization_id = $1 AND deleted_at IS NULL`,
    [orgId],
  );
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  return summarizeAgreementPortfolio(
    rows.map((r) => ({ agreementType: r.agreement_type, status: r.status, containsPhi: r.contains_phi === true, expirationDate: r.expiration_date ? String(r.expiration_date).slice(0, 10) : null })),
    today,
  );
}

/** Execute — gated on the deterministic readiness check. */
export async function executeAgreementTx(client: Queryable, orgId: number, userId: number, id: number): Promise<{ executed: true; readiness: AgreementReadinessResult }> {
  const a = await loadAgreement(client, orgId, id);
  if (a.status === 'executed') throw new ResearchAgreementError('INVALID_STATE', 'Agreement is already executed.');
  const readiness = evaluateAgreementReadiness(viewFromRow(a));
  if (!readiness.readyToExecute) throw new ResearchAgreementError('INVALID_STATE', `Cannot execute — ${readiness.blockers.join(' ')}`);
  await client.query(`UPDATE research_agreements SET status = 'executed', executed_by = $3, executed_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [id, orgId, userId]);
  return { executed: true, readiness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listAgreements(orgId: number, opts?: { status?: string; agreementType?: string; grantProposalId?: number }): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, grant_proposal_id, protocol_document_id, agreement_type, direction, title, other_party, contains_phi, status, effective_date, expiration_date, created_at, updated_at
               FROM research_agreements WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (opts?.status) { params.push(opts.status); sql += ` AND status = $${params.length}`; }
  if (opts?.agreementType) { params.push(opts.agreementType); sql += ` AND agreement_type = $${params.length}`; }
  if (opts?.grantProposalId != null) { params.push(opts.grantProposalId); sql += ` AND grant_proposal_id = $${params.length}`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getAgreement(orgId: number, id: number): Promise<any | null> {
  const a = await pool.query(`SELECT * FROM research_agreements WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  return a.rows[0] ?? null;
}
