/** Fixed columns preserve null-first values that a first-row-derived table loses. */
import type { LabelCurrencyMatrix } from '../label-currency-matrix';
import type { InsightAtomRef } from '../providers/types';
import type { ReportBlock, ReportSection } from './types';

export function labelCurrencyMatrixOf(domain: Record<string, unknown> | undefined): LabelCurrencyMatrix | null {
  const matrix = domain?.labelCurrencyMatrix;
  if (matrix == null) return null;
  if (typeof matrix !== 'object' || Array.isArray(matrix)) throw new Error('Invalid recorded label matrix.');
  const value = matrix as Record<string, unknown>;
  if (value.schemaVersion !== 1 || typeof value.observedAt !== 'string' || !['products', 'registrations', 'labels', 'obligations', 'gaps', 'limits'].every(key => Array.isArray(value[key]))) throw new Error('Unsupported or incomplete recorded label matrix.');
  return matrix as LabelCurrencyMatrix;
}

export function renderLabelCurrencyMatrix(matrix: LabelCurrencyMatrix, provenance: InsightAtomRef[]): ReportSection[] {
  const table = (columns: string[], rows: Array<Array<string | number | null>>): ReportBlock => ({ kind: 'table', columns, rows, provenance });
  return [
    { id: 'label-matrix', title: 'Recorded label matrix', blocks: [
      { kind: 'summary', text: `Organization-wide recorded labeling facts observed at ${matrix.observedAt}. Legal currency remains unknown; an approved record is not a current-label certification.` },
      table(['Product ID', 'Product', 'Market (null = unassigned/core)', 'Label ID', 'Label type', 'Version', 'Recorded status', 'Approval date', 'Approved records in slot', 'Approval evidence', 'Legal currency'], matrix.labels.map(row => [row.productId, row.productName, row.market, row.labelId, row.labelType, row.version, row.recordedStatus, row.approvedDate, row.approvedRecordsInSlot, row.approvalEvidence, row.legalCurrency])),
      ...(matrix.labels.length ? [] : [{ kind: 'summary' as const, text: 'No label matrix rows could be populated from the recorded inputs.' }]),
    ] },
    { id: 'label-products', title: 'Recorded products', blocks: [table(['Product ID', 'Product', 'Recorded status'], matrix.products.map(row => [row.id, row.product_name, row.status]))] },
    { id: 'label-registrations', title: 'Recorded registrations', blocks: [table(['Registration ID', 'Product ID', 'Market', 'Recorded status', 'Registration number', 'Approval date', 'Renewal due date'], matrix.registrations.map(row => [row.id, row.product_id, row.country, row.market_status, row.registration_number, row.approval_date, row.renewal_due_date]))] },
    { id: 'label-obligations', title: 'Independent lifecycle obligations', blocks: [
      { kind: 'summary', text: 'These records have no label-version link. Productless obligations remain unlinked; recorded regions are not converted to markets.' },
      table(['Obligation ID', 'Product ID', 'Product', 'Region', 'Type', 'Classification', 'Title', 'Recorded status', 'Due date', 'Submitted date', 'Date standing'], matrix.obligations.map(row => [row.id, row.product_id, row.productName, row.region, row.obligation_type, row.classification, row.title, row.status, row.due_date, row.submitted_date, row.urgency])),
    ] },
    { id: 'label-matrix-limits', title: 'Method and limits', blocks: matrix.limits.map(text => ({ kind: 'summary', text })) },
  ];
}
