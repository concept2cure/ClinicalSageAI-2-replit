/** Recorded RIM labeling facts. An approved database status is not legal currency. */
import { pool } from '../../db';
import { obligationUrgency } from '../lifecycle-obligations/lifecycle-logic';
import type { DomainReportResult } from './research-compliance-report-providers';
import type { InsightAtomRef } from './providers/types';

export const LABEL_CURRENCY_TYPE = 'global.label_currency_matrix';
export const LABEL_CURRENCY_LIMIT = 'Legal label currency is unknown: the recorded label status, version and approval date do not establish effective dates, expiry or the current agency-authorized text.';
export interface MatrixProduct { id: number; organization_id: number; product_name: string; status: string }
export interface MatrixRegistration { id: number; product_id: number; country: string; market_status: string; registration_number: string | null; approval_date: string | null; renewal_due_date: string | null }
export interface MatrixLabel { id: number; product_id: number; country: string | null; label_type: string; version: string; status: string; approved_date: string | null }
export interface MatrixObligation { id: number; product_id: number | null; region: string; obligation_type: string; classification: string | null; title: string; status: string; due_date: string | null; submitted_date: string | null }
export interface LabelMatrixSnapshot {
  observed_at: string | Date;
  products: MatrixProduct[];
  registrations: MatrixRegistration[];
  labels: MatrixLabel[];
  obligations: MatrixObligation[];
}
export interface LabelMatrixGap { title: string; message: string; severity: 'critical' | 'high' | 'medium' }
export interface LabelMatrixRow {
  productId: number;
  productName: string;
  market: string | null;
  labelId: number | null;
  labelType: string | null;
  version: string | null;
  recordedStatus: string | null;
  approvedDate: string | null;
  approvedRecordsInSlot: number;
  approvalEvidence: 'recorded approved' | 'ambiguous approved records' | 'no approved record' | 'no label record';
  legalCurrency: 'unknown';
}
export interface LabelCurrencyMatrix {
  schemaVersion: 1;
  observedAt: string;
  products: MatrixProduct[];
  registrations: MatrixRegistration[];
  labels: LabelMatrixRow[];
  obligations: Array<MatrixObligation & { productName: string | null; urgency: string }>;
  gaps: LabelMatrixGap[];
  limits: string[];
}

/** One statement means all four sources are observed on the same MVCC snapshot.
 * Every child must match a live parent in the same tenant; nullable product
 * obligations remain explicitly unlinked. No guessed programme association. */
export const LABEL_MATRIX_SNAPSHOT_SQL = `
WITH visible_products AS (
  SELECT id, organization_id, product_name, status FROM rim_products
  WHERE organization_id = $1 AND deleted_at IS NULL
), visible_registrations AS (
  SELECT r.id, r.product_id, r.country, r.market_status, r.registration_number, r.approval_date, r.renewal_due_date
  FROM rim_registrations r JOIN visible_products p ON p.id = r.product_id AND p.organization_id = r.organization_id
  WHERE r.organization_id = $1 AND r.deleted_at IS NULL
), visible_labels AS (
  SELECT l.id, l.product_id, l.country, l.label_type, l.version, l.status, l.approved_date
  FROM rim_labels l JOIN visible_products p ON p.id = l.product_id AND p.organization_id = l.organization_id
  WHERE l.organization_id = $1 AND l.deleted_at IS NULL
), visible_obligations AS (
  SELECT o.id, o.product_id, o.region, o.obligation_type, o.classification, o.title, o.status, o.due_date, o.submitted_date
  FROM lifecycle_obligations o
  WHERE o.organization_id = $1 AND o.deleted_at IS NULL
    AND (o.product_id IS NULL OR EXISTS (SELECT 1 FROM visible_products p WHERE p.id = o.product_id AND p.organization_id = o.organization_id))
)
SELECT CURRENT_TIMESTAMP AS observed_at,
  COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM visible_products p), '[]'::jsonb) AS products,
  COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM visible_registrations r), '[]'::jsonb) AS registrations,
  COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM visible_labels l), '[]'::jsonb) AS labels,
  COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM visible_obligations o), '[]'::jsonb) AS obligations`;

const marketKey = (value: string | null) => value == null ? null : value.trim().toUpperCase();
const slotKey = (label: MatrixLabel) => JSON.stringify([label.product_id, marketKey(label.country), label.label_type]);
const dated = (value: string | null): boolean => value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);

function appendSourceGaps(snapshot: LabelMatrixSnapshot, gaps: LabelMatrixGap[]): void {
  for (const product of snapshot.products) {
    if (!snapshot.registrations.some(reg => reg.product_id === product.id)) gaps.push({ title: `Product ${product.id}: no registrations recorded`, message: 'Market coverage cannot be determined from this product record.', severity: 'high' });
  }
  if (!snapshot.products.length || !snapshot.registrations.length || !snapshot.labels.length) gaps.push({ title: 'Source records missing', message: 'Products, registrations and label versions must all have recorded inputs to populate the matrix. Empty inputs do not establish currency.', severity: 'critical' });
}

/** Pure calculation over the exact recorded snapshot; version strings are never ordered. */
export function calculateLabelCurrencyMatrix(snapshot: LabelMatrixSnapshot): LabelCurrencyMatrix {
  const observedAt = new Date(snapshot.observed_at).toISOString();
  const today = observedAt.slice(0, 10);
  const products = new Map(snapshot.products.map(product => [product.id, product]));
  const gaps: LabelMatrixGap[] = [{ title: 'Legal currency not established', message: LABEL_CURRENCY_LIMIT, severity: 'critical' }];
  const approvedBySlot = new Map<string, number>();
  for (const label of snapshot.labels) if (label.status === 'approved') approvedBySlot.set(slotKey(label), (approvedBySlot.get(slotKey(label)) ?? 0) + 1);
  const reportedSlots = new Set<string>();
  const labels: LabelMatrixRow[] = snapshot.labels.map(label => {
    const approved = approvedBySlot.get(slotKey(label)) ?? 0;
    if (!reportedSlots.has(slotKey(label))) {
      reportedSlots.add(slotKey(label));
      if (approved !== 1) gaps.push({ title: `Label slot for product ${label.product_id}, ${label.country ?? 'unassigned market'}, ${label.label_type}`, message: approved > 1 ? `${approved} records are marked approved. No current version is selected.` : 'No record in this slot is marked approved.', severity: 'high' });
    }
    if (!label.version.trim()) gaps.push({ title: `Label ${label.id}: missing version`, message: 'The stored version is empty; no replacement version is inferred.', severity: 'high' });
    if (label.status === 'approved' && (!dated(label.approved_date) || label.approved_date! > today)) gaps.push({ title: `Label ${label.id}: approval date unresolved`, message: !dated(label.approved_date) ? 'The record is marked approved without a recorded approval date.' : `The approval date ${label.approved_date} is after the observation date ${today}.`, severity: 'high' });
    return { productId: label.product_id, productName: products.get(label.product_id)!.product_name, market: label.country, labelId: label.id,
      labelType: label.label_type, version: label.version, recordedStatus: label.status, approvedDate: label.approved_date,
      approvedRecordsInSlot: approved, approvalEvidence: approved > 1 ? 'ambiguous approved records' : approved === 1 ? 'recorded approved' : 'no approved record', legalCurrency: 'unknown' };
  });
  appendSourceGaps(snapshot, gaps);
  const seenMarkets = new Set<string>();
  for (const registration of snapshot.registrations) {
    const key = JSON.stringify([registration.product_id, marketKey(registration.country)]);
    if (seenMarkets.has(key)) continue;
    seenMarkets.add(key);
    const registrations = snapshot.registrations.filter(reg => reg.product_id === registration.product_id && marketKey(reg.country) === marketKey(registration.country));
    if (registrations.length > 1) gaps.push({ title: `Product ${registration.product_id}, ${registration.country}: ambiguous registrations`, message: `${registrations.length} registration records share this market. All are retained; no winning status is inferred.`, severity: 'high' });
    if (!snapshot.labels.some(label => label.product_id === registration.product_id && marketKey(label.country) === marketKey(registration.country))) {
      labels.push({ productId: registration.product_id, productName: products.get(registration.product_id)!.product_name, market: registration.country,
        labelId: null, labelType: null, version: null, recordedStatus: null, approvedDate: null, approvedRecordsInSlot: 0, approvalEvidence: 'no label record', legalCurrency: 'unknown' });
      gaps.push({ title: `Product ${registration.product_id}, ${registration.country}: no label record`, message: 'No label is recorded for this exact market. A global core data sheet is not substituted.', severity: 'high' });
    }
    if (['JP', 'JPN', 'JAPAN'].includes(marketKey(registration.country) ?? '')) gaps.push({ title: `Product ${registration.product_id}: J-Label source unavailable`, message: 'The canonical label-type schema has no J-Label record. This report cannot establish Japanese label currency.', severity: 'high' });
  }
  for (const label of snapshot.labels) if (label.country != null && !snapshot.registrations.some(reg => reg.product_id === label.product_id && marketKey(reg.country) === marketKey(label.country))) gaps.push({ title: `Label ${label.id}: no matching registration`, message: 'No registration is recorded for this exact product and market. Its registration status is unknown.', severity: 'medium' });
  const terminal = new Set(['approved', 'closed', 'submitted']);
  return { schemaVersion: 1, observedAt, products: snapshot.products, registrations: snapshot.registrations, labels,
    obligations: snapshot.obligations.map(obligation => ({ ...obligation, productName: obligation.product_id == null ? null : products.get(obligation.product_id)!.product_name, urgency: obligationUrgency({ dueDate: obligation.due_date, terminal: terminal.has(obligation.status) }, today) })), gaps,
    limits: [LABEL_CURRENCY_LIMIT,
      'The data covers the organization. A project or program is context, not a product or client-workspace filter.',
      'All stored versions and statuses are shown. Version strings are not ranked and approved status is not an effective-date assertion.',
      'J-Label is not supported by the canonical label-type schema. No CCDS or other label type is substituted for it or for an unknown market.',
      'Lifecycle obligations are independent product/region records; they are not linked to a specific label. Region is not mapped to country, and overdue dates do not establish labeling noncompliance.'],
  };
}

/** The normal domain dispatcher has already refused unsupported client filters. */
export async function computeLabelCurrencyReport(organizationId: number): Promise<DomainReportResult> {
  const response = await pool.query(LABEL_MATRIX_SNAPSHOT_SQL, [organizationId]);
  const snapshot = response.rows[0] as LabelMatrixSnapshot | undefined;
  if (!snapshot || !['products', 'registrations', 'labels', 'obligations'].every(key => Array.isArray(snapshot[key as keyof LabelMatrixSnapshot]))) throw new Error('The label matrix snapshot could not be read.');
  const matrix = calculateLabelCurrencyMatrix(snapshot);
  const atoms: InsightAtomRef[] = [
    ...snapshot.products.map(row => ({ sourceTable: 'rim_products', recordId: row.id, transformation: 'direct_copy' as const })),
    ...snapshot.registrations.map(row => ({ sourceTable: 'rim_registrations', recordId: row.id, transformation: 'direct_copy' as const })),
    ...snapshot.labels.map(row => ({ sourceTable: 'rim_labels', recordId: row.id, transformation: 'direct_copy' as const })),
    ...snapshot.obligations.map(row => ({ sourceTable: 'lifecycle_obligations', recordId: row.id, transformation: 'direct_copy' as const })),
  ];
  return { summary: { labelCurrencyMatrix: matrix }, computedScope: 'organization', criticalBlockers: [LABEL_CURRENCY_LIMIT],
    provider: { provider: 'rim_label_currency_matrix', observedAt: matrix.observedAt, status: !snapshot.products.length || !snapshot.registrations.length || !snapshot.labels.length ? 'missing' : 'partial', blocker: LABEL_CURRENCY_LIMIT, atoms,
      calculation: { method: 'Recorded label-slot cardinality and open-obligation due-date comparison; no regulatory currency inference', snapshot: 'single-statement', computedScope: 'organization', asOfDate: matrix.observedAt.slice(0, 10) } },
    provenance: { organizationId, computedScope: 'organization', observedAt: matrix.observedAt, queries: [{ query: LABEL_MATRIX_SNAPSHOT_SQL, parameters: [organizationId], rows: response.rows }] },
  };
}
