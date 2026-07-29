/**
 * FCOI service — 21 CFR 54 financial disclosure persistence (Capability C2C-01)
 *
 * Tenant-scoped transaction functions over clinical_investigators /
 * financial_disclosures / disclosure_interests. Mutations run inside the
 * caller's transaction so the row write and the governed-action ledger commit
 * together (the route wraps each in BEGIN…COMMIT + recordGovernedAction).
 *
 * Form type is DERIVED (deriveFormType), never trusted from input. Certifying
 * binds a content hash and writes a provenance link to Module 1; editing a
 * signed disclosure invalidates the signature and reverts it to draft.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment (see docs handoff).
 *
 * @module server/services/financial-disclosures/fcoi-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import { deriveFormType, computeDisclosureContentHash, type DisclosureSnapshot } from './fcoi-logic';
import type { FcoiInterestType, InvestigatorRole } from '../../../shared/schema/financial-disclosures';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class FcoiError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'FcoiError';
  }
}

// ─── Investigators ───────────────────────────────────────────────────────────

export interface InvestigatorInput {
  fullName: string;
  role: InvestigatorRole;
  institution?: string | null;
  studyId?: number | null;
}

export async function createInvestigatorTx(
  client: Queryable,
  orgId: number,
  userId: number,
  input: InvestigatorInput,
): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO clinical_investigators (organization_id, full_name, role, institution, study_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [orgId, input.fullName, input.role, input.institution ?? null, input.studyId ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function listInvestigators(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, full_name, role, institution, study_id, created_at
       FROM clinical_investigators
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY full_name`,
    [orgId],
  );
  return rows;
}

// ─── Disclosures ─────────────────────────────────────────────────────────────

export interface DisclosureInput {
  investigatorId: number;
  submissionId?: number | null;
  disclosurePeriodStart?: string | null;
  disclosurePeriodEnd?: string | null;
  hasDisclosableInterests: boolean;
  certificationStatement?: string | null;
}

export async function createDisclosureTx(
  client: Queryable,
  orgId: number,
  userId: number,
  input: DisclosureInput,
): Promise<{ id: number; formType: string }> {
  // The investigator must belong to this org.
  const inv = await client.query(
    `SELECT id FROM clinical_investigators WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.investigatorId, orgId],
  );
  if (inv.rows.length === 0) throw new FcoiError('NOT_FOUND', 'Investigator not found for this organization.');

  const formType = deriveFormType(input.hasDisclosableInterests);
  const { rows } = await client.query(
    `INSERT INTO financial_disclosures
       (organization_id, investigator_id, submission_id, disclosure_period_start, disclosure_period_end,
        has_disclosable_interests, form_type, status, certification_statement, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9) RETURNING id`,
    [
      orgId, input.investigatorId, input.submissionId ?? null,
      input.disclosurePeriodStart ?? null, input.disclosurePeriodEnd ?? null,
      input.hasDisclosableInterests, formType, input.certificationStatement ?? null, userId,
    ],
  );
  return { id: Number(rows[0].id), formType };
}

export interface DisclosurePatch {
  submissionId?: number | null;
  disclosurePeriodStart?: string | null;
  disclosurePeriodEnd?: string | null;
  hasDisclosableInterests?: boolean;
  certificationStatement?: string | null;
}

/**
 * Patch a disclosure. Re-derives form_type from has_disclosable_interests. If
 * the disclosure was signed, the edit INVALIDATES the signature (status → draft,
 * signature columns cleared) per 21 CFR 11 — a signed record cannot silently
 * change underneath its signature.
 */
export async function updateDisclosureTx(
  client: Queryable,
  orgId: number,
  id: number,
  patch: DisclosurePatch,
): Promise<{ formType: string; signatureInvalidated: boolean }> {
  const cur = await getDisclosureRow(client, orgId, id);
  const hasInterests = patch.hasDisclosableInterests ?? cur.has_disclosable_interests;
  const formType = deriveFormType(hasInterests);
  const wasSigned = cur.status === 'signed' || cur.status === 'certified';

  await client.query(
    `UPDATE financial_disclosures SET
        submission_id = COALESCE($3, submission_id),
        disclosure_period_start = COALESCE($4, disclosure_period_start),
        disclosure_period_end = COALESCE($5, disclosure_period_end),
        has_disclosable_interests = $6,
        form_type = $7,
        certification_statement = COALESCE($8, certification_statement),
        status = CASE WHEN status IN ('signed','certified') THEN 'draft' ELSE status END,
        content_hash = CASE WHEN status IN ('signed','certified') THEN NULL ELSE content_hash END,
        signed_by = CASE WHEN status IN ('signed','certified') THEN NULL ELSE signed_by END,
        signed_at = CASE WHEN status IN ('signed','certified') THEN NULL ELSE signed_at END,
        signature_meaning = CASE WHEN status IN ('signed','certified') THEN NULL ELSE signature_meaning END,
        updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [
      id, orgId, patch.submissionId ?? null,
      patch.disclosurePeriodStart ?? null, patch.disclosurePeriodEnd ?? null,
      hasInterests, formType, patch.certificationStatement ?? null,
    ],
  );
  return { formType, signatureInvalidated: wasSigned };
}

export async function softDeleteDisclosureTx(client: Queryable, orgId: number, id: number): Promise<void> {
  const r = await client.query(
    `UPDATE financial_disclosures SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  if ((r as any).rowCount === 0) throw new FcoiError('NOT_FOUND', 'Disclosure not found for this organization.');
}

// ─── Interests ───────────────────────────────────────────────────────────────

export interface InterestInput {
  interestType: FcoiInterestType;
  description: string;
  monetaryValue?: string | number | null;
  arrangementsToMinimizeBias?: string | null;
}

export async function addInterestTx(
  client: Queryable,
  orgId: number,
  userId: number,
  disclosureId: number,
  interest: InterestInput,
): Promise<{ id: number }> {
  const d = await getDisclosureRow(client, orgId, disclosureId);
  if (d.status === 'signed') throw new FcoiError('INVALID_STATE', 'Cannot add interests to a signed disclosure; edit re-opens it first.');
  const { rows } = await client.query(
    `INSERT INTO disclosure_interests
       (organization_id, disclosure_id, interest_type, description, monetary_value, arrangements_to_minimize_bias, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [orgId, disclosureId, interest.interestType, interest.description, interest.monetaryValue ?? null, interest.arrangementsToMinimizeBias ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Snapshot / certify ──────────────────────────────────────────────────────

async function getDisclosureRow(client: Queryable, orgId: number, id: number): Promise<any> {
  const { rows } = await client.query(
    `SELECT * FROM financial_disclosures WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, orgId],
  );
  if (rows.length === 0) throw new FcoiError('NOT_FOUND', 'Disclosure not found for this organization.');
  return rows[0];
}

/** Build the canonical snapshot (disclosure + interest rows) for hashing/validation. */
export async function loadDisclosureSnapshot(client: Queryable, orgId: number, id: number): Promise<DisclosureSnapshot & { row: any }> {
  const row = await getDisclosureRow(client, orgId, id);
  const { rows: interests } = await client.query(
    `SELECT interest_type, description, monetary_value, arrangements_to_minimize_bias
       FROM disclosure_interests WHERE disclosure_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [id, orgId],
  );
  return {
    row,
    hasDisclosableInterests: row.has_disclosable_interests,
    formType: row.form_type,
    disclosurePeriodStart: row.disclosure_period_start,
    disclosurePeriodEnd: row.disclosure_period_end,
    interests: interests.map((it) => ({
      interestType: it.interest_type,
      description: it.description,
      monetaryValue: it.monetary_value,
      arrangementsToMinimizeBias: it.arrangements_to_minimize_bias,
    })),
  };
}

/**
 * Certify a disclosure: bind the content hash, set signed, record the signer +
 * meaning, and (when the disclosure supports a submission) write the provenance
 * link financial_disclosure → submission_module1, role 'supports'.
 * Caller must have re-authenticated (route enforces) — this is a high-risk action.
 */
export async function certifyDisclosureTx(
  client: Queryable,
  orgId: number,
  userId: number,
  id: number,
  meaning = 'Certified',
): Promise<{ contentHash: string; provenanceLinkId: number | null }> {
  const snap = await loadDisclosureSnapshot(client, orgId, id);
  if (snap.row.status === 'signed') throw new FcoiError('INVALID_STATE', 'Disclosure is already signed.');

  const contentHash = computeDisclosureContentHash(snap);
  await client.query(
    `UPDATE financial_disclosures
        SET status = 'signed', content_hash = $3, signed_by = $4, signed_at = now(),
            signature_meaning = $5, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, contentHash, userId, meaning],
  );

  let provenanceLinkId: number | null = null;
  if (snap.row.submission_id != null) {
    const link = await linkProvenanceTx(client, {
      organizationId: orgId,
      userId,
      sourceType: 'financial_disclosure',
      sourceId: id,
      targetType: 'submission_module1',
      targetId: Number(snap.row.submission_id),
      linkRole: 'supports',
    });
    provenanceLinkId = link.id;
  }
  return { contentHash, provenanceLinkId };
}

export async function listDisclosures(orgId: number, submissionId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql =
    `SELECT id, investigator_id, submission_id, has_disclosable_interests, form_type, status,
            disclosure_period_start, disclosure_period_end, signed_at, created_at
       FROM financial_disclosures
      WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (submissionId != null) {
    params.push(submissionId);
    sql += ` AND submission_id = $2`;
  }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}
