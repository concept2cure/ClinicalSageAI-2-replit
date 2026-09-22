/**
 * Protocol Amendments service (Capability C2C-18a)
 *
 * Tenant-scoped transaction functions for authoring an amendment against an
 * authored protocol document: create an amendment (validating the protocol
 * document belongs to the org), append change line items, and walk the status
 * lifecycle (draft → submitted → under_review → approved/rejected → implemented)
 * with validated transitions. Mutations run inside the caller's transaction with
 * the governed-action ledger; reads use the shared pool.
 *
 * @module server/services/protocol-amendments/protocol-amendments-service
 */

import { pool } from '../../db';
import {
  evaluateAmendmentReadiness,
  type AmendmentStatus,
  type AmendmentReadinessResult,
} from './protocol-amendments-logic';
import type { StudyDesign } from '../study-design/study-design-types';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolAmendmentError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolAmendmentError';
  }
}

const AMENDMENT_TYPES = ['major', 'minor', 'administrative'];

/** Allowed status transitions. */
const TRANSITIONS: Record<AmendmentStatus, AmendmentStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['implemented'],
  rejected: [],
  implemented: [],
};

// ─── Amendments ──────────────────────────────────────────────────────────────

export interface AmendmentInput {
  protocolDocumentId: number;
  title: string;
  amendmentNumber?: string | null;
  rationale?: string | null;
  amendmentType?: string | null;
  affectsConsent?: boolean;
  affectsRisk?: boolean;
}

/** Create an amendment after validating the target protocol document belongs to the org. */
export async function createAmendmentTx(client: Queryable, orgId: number, userId: number, input: AmendmentInput): Promise<{ id: number }> {
  if (input.amendmentType != null && !AMENDMENT_TYPES.includes(input.amendmentType)) {
    throw new ProtocolAmendmentError('BAD_INPUT', `Invalid amendment_type "${input.amendmentType}".`);
  }
  const doc = await client.query(
    `SELECT id, study_design_id FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.protocolDocumentId, orgId],
  );
  if (doc.rows.length === 0) throw new ProtocolAmendmentError('NOT_FOUND', 'Protocol document not found for this organization.');

  /* The "before" side of the EU CTR Article 16 comparison, captured now.
     The bound design is overwritten in place as it is edited, so unless it is
     snapshotted at this moment the version this amendment amends is gone by
     the time anyone reviews it. A protocol with no design bound snapshots
     nothing, and the assessment then reports not-assessed rather than
     comparing against a baseline nobody recorded. */
  const snapshot = await snapshotBoundDesign(client, orgId, doc.rows[0].study_design_id);

  const { rows } = await client.query(
    `INSERT INTO protocol_amendments (organization_id, protocol_document_id, amendment_number, title, rationale, amendment_type, affects_consent, affects_risk, status, created_by,
                                      study_design_snapshot, study_design_snapshot_id, study_design_snapshot_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11, CASE WHEN $10::jsonb IS NULL THEN NULL ELSE now() END) RETURNING id`,
    [
      orgId,
      input.protocolDocumentId,
      input.amendmentNumber ?? null,
      input.title,
      input.rationale ?? null,
      input.amendmentType ?? null,
      // NULL = not declared. `?? false` stored "affects neither" for every
      // amendment whose creator did not answer, and substantiality.ts then
      // read that as a declaration (migrations/20260922e).
      input.affectsConsent ?? null,
      input.affectsRisk ?? null,
      userId,
      snapshot.design === null ? null : JSON.stringify(snapshot.design),
      snapshot.studyDesignId,
    ],
  );
  return { id: Number(rows[0].id) };
}

/**
 * The bound design object, read back out of `cdisc_prm_studies.metadata` the
 * same way every other reader does. Returns nulls rather than throwing: a
 * protocol with no design bound, or a design row whose metadata does not
 * round-trip, must not block the author from opening an amendment. What it
 * must not do is invent a baseline, so the snapshot stays null and the
 * assessment says so.
 */
async function snapshotBoundDesign(
  client: Queryable,
  orgId: number,
  studyDesignId: unknown,
): Promise<{ design: unknown | null; studyDesignId: string | null }> {
  const id = typeof studyDesignId === 'string' ? studyDesignId.trim() : '';
  if (!id) return { design: null, studyDesignId: null };
  const res = await client.query(
    `SELECT metadata FROM cdisc_prm_studies WHERE study_id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, orgId],
  );
  if (res.rows.length === 0) return { design: null, studyDesignId: null };
  const { rowsToStudyDesign } = await import('../study-design/study-design-repository');
  const design = rowsToStudyDesign(res.rows[0]);
  return design ? { design, studyDesignId: id } : { design: null, studyDesignId: null };
}

async function loadAmendment(client: Queryable, orgId: number, amendmentId: number): Promise<{ status: AmendmentStatus }> {
  const a = await client.query(
    `SELECT status FROM protocol_amendments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) throw new ProtocolAmendmentError('NOT_FOUND', 'Amendment not found for this organization.');
  return { status: a.rows[0].status };
}

// ─── Change line items ───────────────────────────────────────────────────────

export interface ChangeInput {
  sectionRef?: string | null;
  changeDescription: string;
  previousText?: string | null;
  proposedText?: string | null;
}

/** Append a change line item to a draft amendment. */
export async function addChangeTx(client: Queryable, orgId: number, userId: number, amendmentId: number, input: ChangeInput): Promise<{ id: number }> {
  const amd = await loadAmendment(client, orgId, amendmentId);
  if (amd.status !== 'draft') throw new ProtocolAmendmentError('INVALID_STATE', `Amendment is "${amd.status}"; changes can only be added while draft.`);
  const { rows } = await client.query(
    `INSERT INTO protocol_amendment_changes (organization_id, amendment_id, section_ref, change_description, previous_text, proposed_text, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, amendmentId, input.sectionRef ?? null, input.changeDescription, input.previousText ?? null, input.proposedText ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Status lifecycle ────────────────────────────────────────────────────────

/** Walk the amendment status lifecycle with validated transitions; gates draft→submitted on readiness. */
export async function setAmendmentStatusTx(client: Queryable, orgId: number, amendmentId: number, next: string): Promise<{ status: AmendmentStatus }> {
  const valid: AmendmentStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented'];
  if (!valid.includes(next as AmendmentStatus)) throw new ProtocolAmendmentError('BAD_INPUT', `Invalid status "${next}".`);
  const target = next as AmendmentStatus;
  const amd = await loadAmendment(client, orgId, amendmentId);
  const allowed = TRANSITIONS[amd.status] ?? [];
  if (!allowed.includes(target)) {
    throw new ProtocolAmendmentError('INVALID_STATE', `Cannot transition amendment from "${amd.status}" to "${target}".`);
  }
  if (target === 'submitted') {
    const cnt = await client.query(
      `SELECT count(*)::int n FROM protocol_amendment_changes WHERE amendment_id = $1 AND organization_id = $2`,
      [amendmentId, orgId],
    );
    const readiness = evaluateAmendmentReadiness({ status: amd.status, changeCount: cnt.rows[0].n });
    if (!readiness.readyToSubmit) {
      throw new ProtocolAmendmentError('INVALID_STATE', `Cannot submit — ${readiness.blockers.join(' ')}`);
    }
  }
  const submittedClause = target === 'submitted' ? ', submitted_date = CURRENT_DATE' : '';
  const decidedClause = target === 'approved' || target === 'rejected' ? ', decided_date = CURRENT_DATE' : '';
  await client.query(
    `UPDATE protocol_amendments SET status = $3${submittedClause}${decidedClause}, updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [amendmentId, orgId, target],
  );
  return { status: target };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listAmendments(orgId: number, protocolDocumentId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, protocol_document_id, amendment_number, title, amendment_type, affects_consent, affects_risk, status, submitted_date, decided_date, created_at, updated_at
               FROM protocol_amendments WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (protocolDocumentId != null) { params.push(protocolDocumentId); sql += ` AND protocol_document_id = $2`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getAmendment(orgId: number, amendmentId: number): Promise<any | null> {
  const a = await pool.query(
    `SELECT * FROM protocol_amendments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) return null;
  const changes = await pool.query(
    `SELECT id, section_ref, change_description, previous_text, proposed_text, created_at
       FROM protocol_amendment_changes WHERE amendment_id = $1 AND organization_id = $2 ORDER BY id`,
    [amendmentId, orgId],
  );
  return { ...a.rows[0], changes: changes.rows };
}

/** Read-only submission-readiness assessment (uses the pure evaluateAmendmentReadiness). */
export async function getAmendmentReadiness(orgId: number, amendmentId: number): Promise<AmendmentReadinessResult> {
  const a = await pool.query(
    `SELECT status FROM protocol_amendments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) throw new ProtocolAmendmentError('NOT_FOUND', 'Amendment not found for this organization.');
  const cnt = await pool.query(
    `SELECT count(*)::int n FROM protocol_amendment_changes WHERE amendment_id = $1 AND organization_id = $2`,
    [amendmentId, orgId],
  );
  return evaluateAmendmentReadiness({ status: a.rows[0].status, changeCount: cnt.rows[0].n });
}

// ─── Substantiality (EU CTR 536/2014 Article 16) ─────────────────────────────

/**
 * Assess an amendment's substantiality from the evidence.
 *
 * "Before" is the design snapshotted when the amendment was opened; "after" is
 * the design as it stands now. Where either is missing the comparison is not
 * made and `assessSubstantiality` reports every indicator as not-assessed —
 * which is the honest answer, and pointedly not "non-substantial".
 *
 * Read-only and tenant-scoped. Computes nothing itself: the delta comes from
 * `diffDesigns`, the burden delta from `compareBurden`, and the verdict from
 * `assessSubstantiality`.
 */
export async function getAmendmentSubstantiality(
  orgId: number,
  amendmentId: number,
): Promise<{
  amendmentId: number;
  protocolDocumentId: number;
  /** When the before-design was captured, or null when there is none. */
  snapshotAt: string | null;
  assessment: import('./substantiality').SubstantialityAssessment;
}> {
  const a = await pool.query(
    `SELECT a.id, a.protocol_document_id, a.amendment_type, a.affects_consent, a.affects_risk,
            a.study_design_snapshot, a.study_design_snapshot_at, d.study_design_id
       FROM protocol_amendments a
       JOIN protocol_documents d ON d.id = a.protocol_document_id AND d.organization_id = a.organization_id
      WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL
      LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) {
    throw new ProtocolAmendmentError('NOT_FOUND', 'Amendment not found for this organization.');
  }
  const row = a.rows[0];
  const before = (row.study_design_snapshot ?? null) as StudyDesign | null;
  const after = await currentBoundDesign(orgId, row.study_design_id);

  const { diffDesigns } = await import('./design-delta');
  const { assessSubstantiality } = await import('./substantiality');
  const { burdenProfileForDesign } = await import('../study-design/burden-adapters');
  const { compareBurden } = await import('../study-design/burden-delta');

  const comparable = before !== null && after !== null;
  return {
    amendmentId,
    protocolDocumentId: Number(row.protocol_document_id),
    snapshotAt: row.study_design_snapshot_at ? new Date(String(row.study_design_snapshot_at)).toISOString() : null,
    assessment: assessSubstantiality({
      declared: {
        amendmentType: row.amendment_type ?? null,
        affectsConsent: row.affects_consent ?? null,
        affectsRisk: row.affects_risk ?? null,
      },
      designDelta: comparable ? diffDesigns(before, after) : null,
      burdenDelta: comparable ? compareBurden(burdenProfileForDesign(before), burdenProfileForDesign(after)) : null,
      regions: after?.targetRegions ?? before?.targetRegions ?? null,
    }),
  };
}

/** The bound design as it stands now, or null. Tenant-scoped. */
async function currentBoundDesign(orgId: number, studyDesignId: unknown): Promise<StudyDesign | null> {
  const id = typeof studyDesignId === 'string' ? studyDesignId.trim() : '';
  if (!id) return null;
  const res = await pool.query(
    `SELECT metadata FROM cdisc_prm_studies WHERE study_id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, orgId],
  );
  if (res.rows.length === 0) return null;
  const { rowsToStudyDesign } = await import('../study-design/study-design-repository');
  return rowsToStudyDesign(res.rows[0]);
}
