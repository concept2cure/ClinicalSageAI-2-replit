/**
 * Quality Management System (QMS) service.
 *
 * Activates the previously-inactive qms_* tables (migrations/20260511_qms_and_
 * labeling.sql) that the audit flagged as "schema only — no routes/services".
 * Org-scoped raw-SQL service covering document control, training, supplier
 * qualification, internal audits, management reviews, and nonconforming
 * product per 21 CFR 820 / QMSR / ISO 13485:2016.
 */

import { pool } from '../../db';

// ─── enums ──────────────────────────────────────────────────────────────────
export const DOC_TYPES = ['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol'] as const;
export const DOC_STATES = ['draft', 'in_review', 'effective', 'superseded', 'retired'] as const;
export const SUPPLIER_CRITICALITY = ['critical', 'major', 'minor'] as const;
export const SUPPLIER_STATES = ['pending', 'approved', 'conditional', 'revoked'] as const;
export const NC_DISPOSITIONS = ['use_as_is', 'rework', 'regrade', 'scrap', 'return_to_supplier', 'pending'] as const;

// Allowed document-control state transitions (controlled lifecycle).
const DOC_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_review', 'retired'],
  in_review: ['effective', 'draft'],
  effective: ['superseded', 'retired'],
  superseded: ['retired'],
  retired: [],
};

// ─── Documents (820.40 / ISO 13485 §4.2.4) ──────────────────────────────────

export async function createDocument(orgId: number, p: {
  docNumber: string; title: string; docType: string; category?: string | null; version?: string;
  authorId?: number | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, category, version, author_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, p.docNumber, p.title, p.docType, p.category ?? null, p.version ?? '1.0', p.authorId ?? null]
  );
  return rows[0];
}

export async function listDocuments(orgId: number, opts: { status?: string; docType?: string } = {}) {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (opts.status) { args.push(opts.status); where += ` AND status = $${args.length}`; }
  if (opts.docType) { args.push(opts.docType); where += ` AND doc_type = $${args.length}`; }
  const { rows } = await pool.query(`SELECT * FROM qms_documents WHERE ${where} ORDER BY doc_number ASC`, args);
  return rows;
}

export async function getDocument(orgId: number, id: number) {
  const { rows } = await pool.query(
    `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, orgId]
  );
  return rows[0] ?? null;
}

export class InvalidTransitionError extends Error {}

export async function transitionDocument(orgId: number, id: number, to: string, approverId?: number | null) {
  const doc = await getDocument(orgId, id);
  if (!doc) return null;
  const allowed = DOC_TRANSITIONS[doc.status] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(`Cannot move document from ${doc.status} to ${to}`);
  }
  // Becoming effective stamps the approval + effective date.
  const setApproval = to === 'effective';
  const { rows } = await pool.query(
    `UPDATE qms_documents
        SET status = $1,
            approver_id = COALESCE($2, approver_id),
            approved_at = CASE WHEN $3 THEN now() ELSE approved_at END,
            effective_date = CASE WHEN $3 THEN CURRENT_DATE ELSE effective_date END,
            updated_at = now()
      WHERE id = $4 AND organization_id = $5
      RETURNING *`,
    [to, approverId ?? null, setApproval, id, orgId]
  );
  return rows[0];
}

// ─── Training records (820.25 / ISO 13485 §6.2) ─────────────────────────────

export async function recordTraining(orgId: number, p: {
  userId: number; documentId: number; documentVersion: string;
  acknowledgmentMethod?: string | null; trainerId?: number | null; quizScore?: number | null; expiresAt?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO qms_training_records
       (organization_id, user_id, document_id, document_version, acknowledgment_method, trainer_id, quiz_score, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [orgId, p.userId, p.documentId, p.documentVersion, p.acknowledgmentMethod ?? null, p.trainerId ?? null, p.quizScore ?? null, p.expiresAt ?? null]
  );
  return rows[0];
}

/**
 * Training compliance: for every effective document, how many distinct users
 * have a current (non-expired) acknowledgment of the current version.
 */
export async function trainingCompliance(orgId: number) {
  const { rows } = await pool.query(
    `SELECT d.id AS document_id, d.doc_number, d.version,
            COUNT(DISTINCT t.user_id) FILTER (
              WHERE t.document_version = d.version
                AND (t.expires_at IS NULL OR t.expires_at > now())
            ) AS current_trained
       FROM qms_documents d
       LEFT JOIN qms_training_records t
         ON t.document_id = d.id AND t.organization_id = d.organization_id
      WHERE d.organization_id = $1 AND d.status = 'effective' AND d.deleted_at IS NULL
      GROUP BY d.id, d.doc_number, d.version
      ORDER BY d.doc_number ASC`,
    [orgId]
  );
  return rows;
}

// ─── Suppliers (820.50 / ISO 13485 §7.4) ────────────────────────────────────

export async function createSupplier(orgId: number, p: {
  supplierName: string; supplierCode?: string | null; scope?: string | null;
  criticality: string; isoCertifications?: string[];
}) {
  const { rows } = await pool.query(
    `INSERT INTO qms_suppliers (organization_id, supplier_name, supplier_code, scope, criticality, iso_certifications)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [orgId, p.supplierName, p.supplierCode ?? null, p.scope ?? null, p.criticality, p.isoCertifications ?? null]
  );
  return rows[0];
}

export async function listSuppliers(orgId: number, opts: { status?: string } = {}) {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (opts.status) { args.push(opts.status); where += ` AND approval_status = $${args.length}`; }
  const { rows } = await pool.query(`SELECT * FROM qms_suppliers WHERE ${where} ORDER BY supplier_name ASC`, args);
  return rows;
}

export async function setSupplierApproval(orgId: number, id: number, p: {
  approvalStatus: string; approvalDate?: string | null; reapprovalDate?: string | null;
}) {
  const { rows } = await pool.query(
    `UPDATE qms_suppliers
        SET approval_status = $1, approval_date = COALESCE($2, approval_date),
            reapproval_date = COALESCE($3, reapproval_date), updated_at = now()
      WHERE id = $4 AND organization_id = $5 AND deleted_at IS NULL
      RETURNING *`,
    [p.approvalStatus, p.approvalDate ?? null, p.reapprovalDate ?? null, id, orgId]
  );
  return rows[0] ?? null;
}

// ─── Internal audits (820.22 / ISO 13485 §8.2.4) ────────────────────────────

export async function createAudit(orgId: number, p: {
  auditNumber: string; scope: string; auditStandard?: string | null; plannedDate?: string | null; auditorLeadId?: number | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO qms_internal_audits (organization_id, audit_number, scope, audit_standard, planned_date, auditor_lead_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [orgId, p.auditNumber, p.scope, p.auditStandard ?? null, p.plannedDate ?? null, p.auditorLeadId ?? null]
  );
  return rows[0];
}

export async function listAudits(orgId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM qms_internal_audits WHERE organization_id = $1 ORDER BY planned_date DESC NULLS LAST`, [orgId]
  );
  return rows;
}

// ─── Management reviews (ISO 13485 §5.6) ────────────────────────────────────

export async function createManagementReview(orgId: number, p: {
  reviewDate: string; period: string; chairId?: number | null; inputs?: unknown; outputs?: unknown;
}) {
  const { rows } = await pool.query(
    `INSERT INTO qms_management_reviews (organization_id, review_date, period, chair_id, inputs, outputs)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [orgId, p.reviewDate, p.period, p.chairId ?? null, p.inputs ?? null, p.outputs ?? null]
  );
  return rows[0];
}

export async function listManagementReviews(orgId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM qms_management_reviews WHERE organization_id = $1 ORDER BY review_date DESC`, [orgId]
  );
  return rows;
}

// ─── Nonconforming product (820.90 / ISO 13485 §8.3) ────────────────────────

export async function createNonconformance(orgId: number, p: {
  ncNumber: string; description: string; deviceName?: string | null; lotOrSerial?: string | null; source?: string | null; detectedBy?: number | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO qms_nonconforming_products (organization_id, nc_number, description, device_name, lot_or_serial, source, detected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, p.ncNumber, p.description, p.deviceName ?? null, p.lotOrSerial ?? null, p.source ?? null, p.detectedBy ?? null]
  );
  return rows[0];
}

export async function listNonconformances(orgId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM qms_nonconforming_products WHERE organization_id = $1 ORDER BY detected_at DESC`, [orgId]
  );
  return rows;
}

export async function setNcDisposition(orgId: number, id: number, p: { disposition: string; rationale?: string | null; capaLinked?: boolean }) {
  const { rows } = await pool.query(
    `UPDATE qms_nonconforming_products
        SET disposition = $1, disposition_rationale = COALESCE($2, disposition_rationale),
            disposition_at = now(), capa_linked = COALESCE($3, capa_linked), updated_at = now()
      WHERE id = $4 AND organization_id = $5
      RETURNING *`,
    [p.disposition, p.rationale ?? null, p.capaLinked ?? null, id, orgId]
  );
  return rows[0] ?? null;
}

// ─── QMS compliance summary ─────────────────────────────────────────────────

export async function qmsComplianceSummary(orgId: number) {
  const [docs, suppliers, audits, reviews, ncs] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'effective') AS effective,
         COUNT(*) FILTER (WHERE status = 'draft') AS draft,
         COUNT(*) FILTER (WHERE status = 'in_review') AS in_review,
         COUNT(*) FILTER (WHERE status = 'effective' AND next_review_date IS NOT NULL AND next_review_date < CURRENT_DATE) AS overdue_review
       FROM qms_documents WHERE organization_id = $1 AND deleted_at IS NULL`, [orgId]),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE approval_status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE reapproval_date IS NOT NULL AND reapproval_date < CURRENT_DATE) AS reapproval_overdue
       FROM qms_suppliers WHERE organization_id = $1 AND deleted_at IS NULL`, [orgId]),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status != 'closed' AND status != 'cancelled') AS open,
              COALESCE(SUM(major_findings),0) AS major_findings_total
         FROM qms_internal_audits WHERE organization_id = $1`, [orgId]),
    pool.query(
      `SELECT MAX(review_date) AS last_review FROM qms_management_reviews WHERE organization_id = $1`, [orgId]),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE disposition IS NULL OR disposition = 'pending') AS open_dispositions
         FROM qms_nonconforming_products WHERE organization_id = $1`, [orgId]),
  ]);

  const d = docs.rows[0], s = suppliers.rows[0], a = audits.rows[0], r = reviews.rows[0], n = ncs.rows[0];
  const blockers: string[] = [];
  if (Number(d.effective) === 0) blockers.push('No effective controlled documents.');
  if (Number(d.overdue_review) > 0) blockers.push(`${d.overdue_review} controlled document(s) overdue for periodic review.`);
  if (Number(s.reapproval_overdue) > 0) blockers.push(`${s.reapproval_overdue} supplier(s) overdue for re-approval.`);
  if (Number(a.major_findings_total) > 0) blockers.push(`${a.major_findings_total} major internal-audit finding(s) recorded.`);
  if (!r.last_review) blockers.push('No management review on record (ISO 13485 §5.6).');
  if (Number(n.open_dispositions) > 0) blockers.push(`${n.open_dispositions} nonconforming product(s) awaiting disposition.`);

  return {
    documents: d,
    suppliers: s,
    audits: a,
    managementReview: { lastReview: r.last_review },
    nonconformingProduct: n,
    blockers,
    healthy: blockers.length === 0,
  };
}
