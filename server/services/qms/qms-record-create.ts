/**
 * Recording a new nonconformance or a new supplier: one writer for the QMS
 * routes and for AnA's tools (2026-10-29).
 *
 * AnA's log_nonconforming_product and register_supplier inserted the same rows
 * through the pool with no §11.10(e) row, beside the routes' audited inserts:
 * two writers of each record, one of them unaudited. Both callers now write
 * through these, and each record carries the route's audit row
 * (`mdx.qms.nonconforming.create`, `mdx.qms.supplier.qualify`), whose outcome
 * the caller reports. Admission stays with each caller, before anything is
 * written: the project (admitProject; the tool registry's foreignProgramRefusal)
 * and the quality agreement. A new supplier is pending; its standing is signed
 * (supplier-approval.ts).
 *
 * @module server/services/qms/qms-record-create
 */
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import type { RequestConnectable } from '../../db/requestDb';

interface SqlClient { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, any>> }> }
interface Written { row: Record<string, any>; auditTrail: AuditRowOutcome }

export interface NewNonconformance {
  ncNumber: string;
  description: string;
  deviceName?: string | null;
  lotOrSerial?: string | null;
  source?: string | null;
  /** regulatory_programs.id, already admitted as this organization's, or null. */
  programId: string | null;
}

export async function recordNewNonconformance(
  client: SqlClient, organizationId: number, userId: number | null, nc: NewNonconformance, connection?: RequestConnectable,
): Promise<Written> {
  const { rows } = await client.query(`INSERT INTO qms_nonconforming_products (
       organization_id, nc_number, device_name, lot_or_serial, source, description,
       detected_by, disposition, program_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
     RETURNING *`,
  [organizationId, nc.ncNumber, nc.deviceName ?? null, nc.lotOrSerial ?? null, nc.source ?? null, nc.description, userId, nc.programId]);
  const auditTrail = await recordAuditRow({
    tenantId: organizationId, userId: userId ?? undefined,
    action: 'mdx.qms.nonconforming.create',
    resourceType: 'qms_nonconforming_product', resourceId: String(rows[0].id),
    details: { ncNumber: nc.ncNumber, lotOrSerial: nc.lotOrSerial ?? null, source: nc.source ?? null, programId: nc.programId },
  }, connection);
  return { row: rows[0], auditTrail };
}

export interface NewSupplier {
  supplierName: string;
  criticality: string;
  supplierCode?: string | null;
  scope?: string | null;
  reapprovalDate?: string | null;
  /** qms_documents.id, already admitted as this organization's controlled document, or null. */
  qualityAgreementId?: number | null;
  lastAuditDate?: string | null;
  nextAuditDate?: string | null;
  isoCertifications?: string[] | null;
}

export async function recordNewSupplier(
  client: SqlClient, organizationId: number, userId: number | null, s: NewSupplier, connection?: RequestConnectable,
): Promise<Written> {
  const { rows } = await client.query(`INSERT INTO qms_suppliers (
       organization_id, supplier_name, supplier_code, scope, criticality,
       approval_status, reapproval_date, quality_agreement_id,
       last_audit_date, next_audit_date, iso_certifications
     ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10)
     RETURNING *`,
  [organizationId, s.supplierName, s.supplierCode ?? null, s.scope ?? null, s.criticality, s.reapprovalDate ?? null,
    s.qualityAgreementId ?? null, s.lastAuditDate ?? null, s.nextAuditDate ?? null, s.isoCertifications ?? null]);
  const auditTrail = await recordAuditRow({
    tenantId: organizationId, userId: userId ?? undefined,
    action: 'mdx.qms.supplier.qualify',
    resourceType: 'qms_supplier', resourceId: rows[0]?.id,
    details: { supplierName: s.supplierName, criticality: s.criticality },
  }, connection);
  return { row: rows[0], auditTrail };
}
