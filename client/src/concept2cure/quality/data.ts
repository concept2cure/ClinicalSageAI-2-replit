/**
 * Quality / SOP register — typed model, the Quality system template family, and
 * fixtures.
 *
 * The surface renders `live ?? fixture` (see hooks.ts): live data comes from
 * /api/mdx/qms/*; these fixtures keep the register populated during load and on
 * error. Mirrors the design reference in ui_kits/mdx/surfaces/Quality.jsx,
 * reframed for controlled-document control.
 *
 * @module client/src/concept2cure/quality/data
 */

export type DocStatus = 'draft' | 'in_review' | 'effective' | 'superseded' | 'retired';
export type DocType =
  | 'manual'
  | 'policy'
  | 'sop'
  | 'wi'
  | 'form'
  | 'spec'
  | 'protocol'
  | 'curriculum';

export interface SopSection {
  key: string;
  label: string;
  order: number;
  hint?: string;
}

export interface SopTemplate {
  key: string;
  label: string;
  docType: DocType;
  family: string;
  description: string;
  numberPrefix: string;
  category: string;
  sections: SopSection[];
}

export interface QmsDoc {
  id: number;
  docNumber: string;
  title: string;
  docType: DocType;
  category: string | null;
  version: string;
  status: DocStatus;
  effectiveDate: string | null;
  nextReviewDate: string | null;
  updatedAt: string | null;
}

export interface ReviewDueRow {
  id: number;
  docNumber: string;
  title: string;
  nextReviewDate: string | null;
  overdue: boolean;
  status: DocStatus;
}

export interface TrainingRow {
  doc: string;
  current: number;
  of: number;
  lastCycle: string;
}

/* ─── Labels + tone maps ───────────────────────────────────────── */

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  manual: 'Quality manual',
  policy: 'Policy',
  sop: 'SOP',
  wi: 'Work instruction',
  form: 'Form',
  spec: 'Specification',
  protocol: 'Validation protocol',
  curriculum: 'Training curriculum',
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Draft',
  in_review: 'Under review',
  effective: 'Effective',
  superseded: 'Superseded',
  retired: 'Retired',
};

export type StatusTone = 'draft' | 'review' | 'effective' | 'muted';
export const STATUS_TONE: Record<DocStatus, StatusTone> = {
  draft: 'draft',
  in_review: 'review',
  effective: 'effective',
  superseded: 'muted',
  retired: 'muted',
};

/** Today, as an ISO date — kept as a constant so fixtures + overdue logic agree
 *  in the absence of live data. Live rows carry a server-computed `overdue`. */
const TODAY = '2026-06-04';

export function isReviewOverdue(
  nextReviewDate: string | null | undefined,
  today: string = TODAY,
): boolean {
  if (!nextReviewDate) return false;
  return String(nextReviewDate).slice(0, 10) < today;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

/* ─── The standard controlled-procedure section skeleton ───────── */

export const STANDARD_SECTIONS: SopSection[] = [
  { key: 'purpose',          label: 'Purpose',          order: 1 },
  { key: 'scope',            label: 'Scope',            order: 2 },
  { key: 'responsibilities', label: 'Responsibilities', order: 3 },
  { key: 'definitions',      label: 'Definitions',      order: 4 },
  { key: 'procedure',        label: 'Procedure',        order: 5 },
  { key: 'references',       label: 'References',       order: 6 },
  { key: 'attachments',      label: 'Attachments',      order: 7 },
  { key: 'revision_history', label: 'Revision history', order: 8 },
  { key: 'approval',         label: 'Approval',         order: 9 },
];

/* ─── Quality system template family — fixture mirror of the server catalog
       at /api/mdx/qms/templates. ────────────────────────────────── */

export const SOP_TEMPLATES: SopTemplate[] = [
  { key: 'quality_manual',      label: 'Quality manual',              docType: 'manual',     family: 'Quality system', numberPrefix: 'QM-',   category: 'mgmt',       description: 'Top-level description of your quality system and how it meets ISO 13485 and 21 CFR 820.', sections: STANDARD_SECTIONS },
  { key: 'policy',              label: 'Policy',                      docType: 'policy',     family: 'Quality system', numberPrefix: 'POL-',  category: 'mgmt',       description: 'A governing statement of intent — quality policy, data-integrity policy, or training policy.', sections: STANDARD_SECTIONS },
  { key: 'sop',                 label: 'Standard operating procedure', docType: 'sop',       family: 'Quality system', numberPrefix: 'SOP-',  category: 'production', description: 'A controlled, step-by-step procedure for a repeatable process.', sections: STANDARD_SECTIONS },
  { key: 'work_instruction',    label: 'Work instruction',            docType: 'wi',         family: 'Quality system', numberPrefix: 'WI-',   category: 'production', description: 'Task-level detail that supports an SOP — how to perform one step.', sections: STANDARD_SECTIONS },
  { key: 'form',                label: 'Form',                        docType: 'form',       family: 'Quality system', numberPrefix: 'FORM-', category: 'misc',       description: 'A controlled template that captures a record when completed.', sections: STANDARD_SECTIONS },
  { key: 'validation_protocol', label: 'Validation protocol',         docType: 'protocol',   family: 'Quality system', numberPrefix: 'VP-',   category: 'design',     description: 'An IQ/OQ/PQ or process-validation protocol with acceptance criteria.', sections: STANDARD_SECTIONS },
  { key: 'training_curriculum', label: 'Training curriculum',         docType: 'curriculum', family: 'Quality system', numberPrefix: 'TC-',   category: 'training',   description: 'The role-based training plan that ties controlled documents to their required readers.', sections: STANDARD_SECTIONS },
];

/* ─── Fixtures ─────────────────────────────────────────────────── */

export const FIXTURE_DOCS: QmsDoc[] = [
  { id: 1, docNumber: 'QM-001',      title: 'Quality manual',                          docType: 'manual',     category: 'mgmt',       version: '4.0', status: 'effective',  effectiveDate: '2025-09-01', nextReviewDate: '2026-09-01', updatedAt: '2025-09-01' },
  { id: 2, docNumber: 'POL-002',     title: 'Data integrity policy',                   docType: 'policy',     category: 'mgmt',       version: '2.1', status: 'effective',  effectiveDate: '2025-11-15', nextReviewDate: '2026-05-15', updatedAt: '2025-11-15' },
  { id: 3, docNumber: 'SOP-820-50',  title: 'Supplier controls procedure',             docType: 'sop',        category: 'purchasing', version: '3.1', status: 'in_review',  effectiveDate: '2024-12-01', nextReviewDate: '2026-05-20', updatedAt: '2026-05-30' },
  { id: 4, docNumber: 'SOP-820-100', title: 'Corrective and preventive action (CAPA)', docType: 'sop',        category: 'capa',       version: '5.0', status: 'effective',  effectiveDate: '2026-03-30', nextReviewDate: '2027-03-30', updatedAt: '2026-03-30' },
  { id: 5, docNumber: 'WI-014',      title: 'Incoming inspection — dimensional check',  docType: 'wi',         category: 'production', version: '1.2', status: 'draft',      effectiveDate: null,         nextReviewDate: null,        updatedAt: '2026-06-01' },
  { id: 6, docNumber: 'VP-7',        title: 'Sterilizer OQ/PQ validation protocol',     docType: 'protocol',   category: 'design',     version: '1.0', status: 'effective',  effectiveDate: '2025-08-10', nextReviewDate: '2026-02-10', updatedAt: '2025-08-10' },
  { id: 7, docNumber: 'TC-1',        title: 'New-hire quality system curriculum',        docType: 'curriculum', category: 'training',   version: '2.0', status: 'effective',  effectiveDate: '2026-01-05', nextReviewDate: '2026-07-05', updatedAt: '2026-01-05' },
  { id: 8, docNumber: 'SOP-803',     title: 'Medical device reporting (MDR)',            docType: 'sop',        category: 'misc',       version: '2.3', status: 'superseded', effectiveDate: '2024-04-01', nextReviewDate: null,        updatedAt: '2026-04-01' },
];

export const FIXTURE_TRAINING: TrainingRow[] = [
  { doc: 'SOP-820-30 design controls',   current: 44, of: 47, lastCycle: '2026-04-15' },
  { doc: 'SOP-820-50 supplier controls', current: 43, of: 47, lastCycle: '2026-04-22' },
  { doc: 'SOP-820-100 CAPA',             current: 47, of: 47, lastCycle: '2026-03-30' },
  { doc: 'SOP-803 MDR reporting',        current: 47, of: 47, lastCycle: '2026-04-01' },
  { doc: 'TC-1 new-hire curriculum',     current: 38, of: 47, lastCycle: '2026-02-18' },
];

/** Derive the review-due list from a document set — used as the fixture
 *  fallback when /api/mdx/qms/documents/review-due is unavailable. */
export function deriveReviewDue(docs: QmsDoc[], today: string = TODAY): ReviewDueRow[] {
  return docs
    .filter((d) => (d.status === 'effective' || d.status === 'in_review') && d.nextReviewDate)
    .map((d) => ({
      id: d.id,
      docNumber: d.docNumber,
      title: d.title,
      nextReviewDate: d.nextReviewDate,
      overdue: isReviewOverdue(d.nextReviewDate, today),
      status: d.status,
    }))
    .sort((a, b) => String(a.nextReviewDate).localeCompare(String(b.nextReviewDate)));
}
