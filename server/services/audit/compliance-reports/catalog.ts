/**
 * The catalog of compliance reports an organisation can run for an inspector,
 * in the order a client lists them.
 *
 * Seven are run by GET /api/audit/reports/:reportId (routes/audit-compliance-reports.ts).
 * The eighth, the full audit trail, is a catalog entry only: its run is the
 * existing signed export (GET /api/audit/export/signed), which this module
 * names and does not duplicate.
 *
 * @module server/services/audit/compliance-reports/catalog
 */
import { accessReview } from './queries/access-review';
import { administrativeChanges } from './queries/administrative-changes';
import { auditTrailIntegrity } from './queries/audit-trail-integrity';
import { authenticationEvents } from './queries/authentication-events';
import { controlledDocuments } from './queries/controlled-documents';
import { electronicSignatures } from './queries/electronic-signatures';
import { retentionLegalHolds } from './queries/retention-legal-holds';
import { columns } from './queries/section';
import type { ReportDefinition, ReportSummary } from './types';

export const FULL_AUDIT_TRAIL_ID = 'audit-trail';

/** The full audit trail: run by the signed export, listed here so a client finds it beside the rest. */
const fullAuditTrail: ReportDefinition = {
  id: FULL_AUDIT_TRAIL_ID,
  title: 'Full audit trail',
  purpose: "Exports every row of this organisation's two audit stores for the period as one signed, tamper-evident file.",
  basis: ['21 CFR 11.10(b)', '21 CFR 11.10(e)', 'EU GMP Annex 11 §9'],
  period: 'range',
  sections: [
    {
      key: 'rows',
      title: 'Audit records from both stores',
      columns: columns([
        ['source', 'Record store'],
        ['timestamp', 'Occurred'],
        ['event_type', 'Event'],
        ['entity_type', 'Record type'],
        ['entity_id', 'Record'],
        ['user_id', 'User id'],
      ]),
    },
  ],
  notRecorded: [
    'One export carries at most 50,000 rows; the export says when it stopped there, and a longer period is exported in parts.',
    'Sign-in attempts against an address with no account are recorded outside any organisation, so they are not in this export.',
  ],
  endpoint: '/api/audit/export/signed',
};

export const COMPLIANCE_REPORT_CATALOG: readonly ReportDefinition[] = Object.freeze([
  accessReview,
  authenticationEvents,
  administrativeChanges,
  electronicSignatures,
  auditTrailIntegrity,
  retentionLegalHolds,
  controlledDocuments,
  fullAuditTrail,
]);

const BY_ID: ReadonlyMap<string, ReportDefinition> = new Map(COMPLIANCE_REPORT_CATALOG.map((r) => [r.id, r]));

/** The report with this id, or undefined. A Map, so no inherited key ('constructor') is ever a report. */
export function findReport(id: string): ReportDefinition | undefined {
  return BY_ID.get(id);
}

/** The catalog as a client receives it: the contract fields, nothing executable. */
export function reportSummaries(): ReportSummary[] {
  return COMPLIANCE_REPORT_CATALOG.map((r) => ({
    id: r.id,
    title: r.title,
    purpose: r.purpose,
    basis: [...r.basis],
    period: r.period,
    sections: r.sections.map((s) => ({ key: s.key, title: s.title })),
    notRecorded: [...r.notRecorded],
    ...(r.endpoint ? { endpoint: r.endpoint } : {}),
  }));
}
