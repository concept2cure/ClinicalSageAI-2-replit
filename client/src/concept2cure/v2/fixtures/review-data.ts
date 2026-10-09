/**
 * View-model types + presentation config for the Review & Approval surface.
 *
 * This module ships NO fabricated review data. The surface renders the real,
 * org-scoped board from GET /api/review/board (server/routes/review-board-routes.ts)
 * or an honest empty/error state — it never falls back to a sample queue. What
 * remains here is deterministic: the render-contract types (mirroring the server
 * shapes in server/services/review/authoring-review-board.ts) and two lookup
 * tables — a status→tone map and the 21 CFR Part 11 signature-meaning enum.
 * Neither is fabricated content.
 *
 * The board is built from the AUTHORING review store (authoring_reviews /
 * authoring_workflow_steps / authoring_comments — VSR-001 F-6): a queue row is
 * an authoring document with open review work, its review requests and
 * verdicts, its approval chain, and the thread of its comments.
 */

/* ---- Types ---- */

/** One review request on a document (an `authoring_reviews` row). */
export interface ReviewRequest {
  id: string;
  reviewerId: string;
  reviewer: string;
  reviewerEmail: string | null;
  /** pending | approved | changes_requested | rejected */
  status: string;
  comments: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
}

export interface ReviewItem {
  /** The authoring document id — the id every authoring transition takes. */
  id: string;
  doc: string;
  prog: string | null;
  programId: string | null;
  pid: string;
  module: string | null;
  /** The authoring document's status. Optional: a row from a server that
   *  could not read it carries none, and the board renders no chip rather
   *  than failing. */
  docStatus?: string;
  /** in-review | approved | changes-requested | rejected */
  state: string;
  /** Optional for the same reason as docStatus — absent, not empty, when the
   *  read could not include them. */
  reviews?: ReviewRequest[];
  myReviewId: string | null;
  myReviewStatus: string | null;
  /** Server-decided ownership, per row. */
  awaitingMyReview: boolean;
  requestedByMe: boolean;
  atMySignOff: boolean;
  mine: boolean;
  reviewer: string;
  role: string;
  /** The authoring store holds no due date; empty, never invented. */
  due: string;
  tone: string;
  comments: number;
  esig: string;
  // null when AnA has no governed confidence / provenance for the item — the
  // backend returns null rather than fabricating a score or source.
  conf: number | null;
  prov: string | null;
  passage: string;
  /** Where a board-level comment is posted; null when the document has no section yet. */
  firstSectionId: string | null;
  requestedAt: string | null;
}

export interface WorkflowStep {
  id: string;
  order: number;
  name: string;
  approverType: string;
  approver: string;
  requiredActions: string[];
  /** approved | current | pending | rejected */
  status: string;
  at: string | null;
}

export interface ReviewWorkflow {
  templateId: string;
  template: string;
  steps: WorkflowStep[];
}

export interface ReviewComment {
  id: string;
  author: string;
  role: string;
  when: string;
  /** open | resolved */
  state: string;
  body: string;
  ai?: boolean;
  sectionId: string | null;
  parentId: string | null;
}

/* ---- Status tone map ---- */

export const STATUS_TONE: Record<string, string> = {
  draft: 'idle',
  review: 'warn',
  approved: 'ok',
  'in-review': 'warn',
  active: 'ai',
  blocked: 'err',
  complete: 'ok',
  'changes-requested': 'warn',
  rejected: 'err',
};

/* ---- E-signature meanings (21 CFR Part 11) ----
   Reference configuration for the authoring e-sign route; the Review board no
   longer offers a "meaning of signature" because it records no signature. */

export const ESIGN_MEANINGS: string[] = [
  'APPROVER',
  'REVIEWER',
  'AUTHOR',
  'VERIFIER',
];
