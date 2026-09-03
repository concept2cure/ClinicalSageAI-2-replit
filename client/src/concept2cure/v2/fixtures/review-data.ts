/**
 * View-model types + presentation config for the Review & Approval surface.
 *
 * This module ships NO fabricated review data. The surface renders the real,
 * org-scoped board from GET /api/review/board (server/routes/review-board-routes.ts)
 * or an honest empty/error state — it never falls back to a sample queue. What
 * remains here is deterministic: the render-contract types (mirroring the server
 * shapes) and two lookup tables — a status→tone map and the 21 CFR Part 11
 * signature-meaning enum. Neither is fabricated content.
 */

/* ---- Types ---- */

export interface ReviewItem {
  id: string;
  doc: string;
  prog: string;
  pid: string;
  secKey: string;
  reviewer: string;
  role: string;
  due: string;
  tone: string;
  state: string;
  comments: number;
  esig: string;
  // null when AnA has no governed confidence / provenance for the item — the
  // backend returns null rather than fabricating a score or source.
  conf: number | null;
  prov: string | null;
  passage: string;
  // Caller owns the current step (server-decided). Absent → not known to be yours.
  mine?: boolean;
}

export interface WorkflowStep {
  id: number;
  order: number;
  name: string;
  approverType: string;
  approver: string;
  requiredActions: string[];
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
  state: string;
  body: string;
  ai?: boolean;
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
};

/* ---- E-signature meanings (21 CFR Part 11) ---- */

export const ESIGN_MEANINGS: string[] = [
  'APPROVER',
  'REVIEWER',
  'AUTHOR',
  'VERIFIER',
];
