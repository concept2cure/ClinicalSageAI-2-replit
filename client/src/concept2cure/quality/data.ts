import type { RouteRoundView } from '../v2/reviewRoute/routeRound';
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
  /** Canonical editing copy; null for a legacy entry awaiting explicit binding. */
  authoringDocumentId?: string | null;
  programId?: string | null;
  /** While a revision is open: the signed version that still governs the work (server in-force-release.ts). */
  inForce?: { version: string; effectiveDate: string | null } | null;
  /** The last signed periodic review of the version in force (server periodic-review.ts). */
  lastReview?: PeriodicReviewSummary | null;
  /** The next review date the approval signed. `nextReviewDate` is when it is due, after any review. */
  signedReviewDate?: string | null;
  /** The latest review route and its round (RR4, server review-route-standing.ts readRouteRounds); null when none was sent. */
  reviewRoute?: RouteRoundView | null;
  /** The route could not be read: never "no route". */
  reviewRouteUnread?: boolean;
}

/** A signed periodic review, as the register shows it. */
export interface PeriodicReviewSummary {
  signatureId: number;
  outcome: 'current' | 'revision-required';
  reviewedAt: string;
  reviewerName: string | null;
  /** The reason the reviewer signed with: for "revision required", what needs revising. */
  reason: string | null;
  /** The date the reviewer set; null when a revision is required. */
  nextReviewDate: string | null;
  version: string;
}

export interface ReviewDueRow {
  id: number;
  docNumber: string;
  title: string;
  /** When the version in force is next due: after its last signed review, or the date its approval signed. */
  nextReviewDate: string | null;
  overdue: boolean;
  status: DocStatus;
  version?: string;
  /** A revision is open: the version in force stays due, and the revision's approval sets the next review. */
  underRevision?: boolean;
  lastReview?: PeriodicReviewSummary | null;
  /** The next review date the approval signed; "revision required" leaves the document due on it. */
  signedReviewDate?: string | null;
}

export interface TrainingRow {
  /** Canonical document id from the live coverage route; fixtures have none. */
  documentId?: number;
  documentVersion?: string;
  eligible?: boolean;
  unavailableReason?: string | null;
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

/** Today, as the UTC day (YYYY-MM-DD) the server's review-due read also uses.
 *  Until 2026-10-29 this was the constant '2026-06-04', left from the removed
 *  fixtures, so every review that fell due after that day showed as not
 *  overdue in the register and in the Record review drawer (CAT2-22). Live
 *  review-due rows carry the server's own `overdue`. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

export function isReviewOverdue(
  nextReviewDate: string | null | undefined,
  today: string = todayUtc(),
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

/* REMOVED 2026-10-14: SOP_TEMPLATES (a client copy of the server catalog in
   server/services/qms/sopTemplates.ts — the register reads that catalog from
   /api/mdx/qms/templates), FIXTURE_DOCS (eight example controlled documents,
   six of them "effective") and FIXTURE_TRAINING (training counts such as
   "SOP-820-100 CAPA, 47 of 47"), shown under sample mode. */

/** Derive the review-due list from a document set — used when
 *  /api/mdx/qms/documents/review-due has not answered. */
export function deriveReviewDue(docs: QmsDoc[], today: string = todayUtc()): ReviewDueRow[] {
  return docs
    .filter((d) => (d.status === 'effective' || d.status === 'in_review') && d.nextReviewDate)
    .map((d) => reviewRowOf(d, today))
    .sort((a, b) => String(a.nextReviewDate).localeCompare(String(b.nextReviewDate)));
}

/** A register document as a periodic review row: what Record review needs, from the panel or the register. */
export function reviewRowOf(d: QmsDoc, today: string = todayUtc()): ReviewDueRow {
  return {
    id: d.id,
    docNumber: d.docNumber,
    title: d.title,
    nextReviewDate: d.nextReviewDate,
    overdue: isReviewOverdue(d.nextReviewDate, today),
    status: d.status,
    version: d.inForce?.version ?? d.version,
    underRevision: !!d.inForce,
    lastReview: d.lastReview ?? null,
    signedReviewDate: d.signedReviewDate ?? null,
  };
}
