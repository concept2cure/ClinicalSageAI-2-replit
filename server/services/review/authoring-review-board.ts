/**
 * Review board read model over the AUTHORING review store.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * VSR-001 finding F-6: a review requested and submitted in Authoring was not
 * visible on the Review board. Authoring writes `authoring_reviews` (review
 * requests and verdicts — POST /api/authoring/documents/:id/request-review and
 * POST /api/authoring/documents/:id/review) and `authoring_workflow_steps` (the
 * approval chain — POST /api/authoring/docs/:id/submit, advanced by the §11.50
 * signature route POST /api/authoring/docs/:id/sign). The board read a second
 * store, `document_workflows` / `workflow_approvals`, which no launch surface
 * writes. Decision (control tower, 2026-09-21): the authoring store is
 * canonical, the board reads it, and the board's decisions are the authoring
 * router's own transitions. This module is the read; it writes nothing.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 * One queue row per authoring document that has OPEN review work in the
 * caller's organisation: a review request not yet approved (pending, changes
 * requested or rejected — the last two are open work for the author), a
 * PENDING approval step, or a document whose status is IN_REVIEW. Scope
 * `requested` is the exception: it lists everything the caller asked for,
 * decided or not, so a requester sees the verdict rather than a vanished row.
 * Ownership is decided here, per row, from the store:
 *   awaitingMyReview — a pending authoring_reviews row names the caller
 *   requestedByMe    — the caller asked for a review on it
 *   atMySignOff      — the CURRENT pending step's approver_email is the caller
 *                      (the signature itself is applied in the authoring
 *                      workspace; the board never signs)
 *
 * ── Tenant scoping ───────────────────────────────────────────────────────────
 * Every statement carries `tenant_id = $1` AND runs on the request-scoped
 * client (RLS session vars set), which the route hands in. Both, on purpose:
 * the predicate is what the source guard can read, the client is what RLS
 * enforces when a predicate is forgotten.
 *
 * ── Type casts ───────────────────────────────────────────────────────────────
 * `authoring_reviews.doc_id` is TEXT on databases that got the table from
 * db/migrations/20260725_authoring_document_loop_tables.sql and UUID on those
 * that got it from migrations/20260728_authoring_reviews.sql; the workflow,
 * comment and section tables key by UUID. Joins cast both sides to text so the
 * read model is correct on either lineage instead of 42883 on one of them.
 *
 * @module server/services/review/authoring-review-board
 */

import type { RequestSqlClient } from '../../db/requestDb';

export type ReviewScope = 'mine' | 'requested' | 'all';

export interface ReviewRequestView {
  id: string;
  reviewerId: string;
  reviewer: string;
  reviewerEmail: string | null;
  status: string;
  comments: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
}

export interface ReviewItemView {
  /** authoring_documents.id */
  id: string;
  doc: string;
  prog: string | null;
  programId: string | null;
  /** Same as `id`; kept for the AnA context bridge and the OQ probe. */
  pid: string;
  module: string | null;
  docStatus: string;
  state: 'in-review' | 'approved' | 'changes-requested' | 'rejected';
  reviews: ReviewRequestView[];
  myReviewId: string | null;
  myReviewStatus: string | null;
  awaitingMyReview: boolean;
  requestedByMe: boolean;
  atMySignOff: boolean;
  mine: boolean;
  reviewer: string;
  role: string;
  /** No due date exists in the authoring store; returned empty, never invented. */
  due: string;
  tone: string;
  comments: number;
  esig: 'signed' | 'pending' | 'queued' | 'none';
  conf: null;
  prov: string | null;
  passage: string;
  /** Where a board-level comment is posted (POST /sections/:id/comment). */
  firstSectionId: string | null;
  requestedAt: string | null;
}

export interface ReviewWorkflowStepView {
  id: string;
  order: number;
  name: string;
  approverType: 'user';
  approver: string;
  requiredActions: string[];
  status: 'approved' | 'current' | 'pending' | 'rejected';
  at: string | null;
}

export interface ReviewWorkflowView {
  templateId: string;
  template: string;
  steps: ReviewWorkflowStepView[];
}

export interface ReviewCommentView {
  id: string;
  author: string;
  role: string;
  when: string;
  state: 'open' | 'resolved';
  body: string;
  ai: false;
  sectionId: string | null;
  parentId: string | null;
}

export interface ReviewBoardView {
  queue: ReviewItemView[];
  workflows: Record<string, ReviewWorkflowView>;
  thread: ReviewCommentView[];
  meta: {
    scope: ReviewScope;
    programId: string | null;
    total: number;
    threadItemId: string | null;
    threadDocumentId: string | null;
    generatedAt: string;
  };
}

export interface BuildReviewBoardInput {
  sql: RequestSqlClient;
  orgId: number;
  userId: string;
  userEmail: string | null;
  scope: ReviewScope;
  programId: string | null;
  limit: number;
  itemId: string | null;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

const MS_DAY = 86_400_000;

/** "2h ago" / "yesterday" / "3 d ago" for a past instant; null when absent. */
export function relTime(value: string | Date | null | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ms = now - d.getTime();
  if (ms < 0) return 'just now';
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (ms < MS_DAY) return `${Math.round(ms / 3_600_000)}h ago`;
  const days = Math.round(ms / MS_DAY);
  return days === 1 ? 'yesterday' : `${days} d ago`;
}

/** Plain-text excerpt of a section body (authoring stores HTML). */
export function excerpt(html: string | null | undefined, max = 600): string {
  if (!html) return '';
  const clean = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const same = (a: unknown, b: unknown): boolean =>
  a != null && b != null && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * The document's review state from its own status and the verdicts on it.
 * An approved document (the last signature cleared the chain) is approved
 * whatever the request rows say; otherwise the most restrictive verdict wins.
 */
export function deriveState(docStatus: string, reviews: Array<{ status: string }>): ReviewItemView['state'] {
  if (String(docStatus).toUpperCase() === 'APPROVED') return 'approved';
  if (reviews.some((r) => r.status === 'rejected')) return 'rejected';
  if (reviews.some((r) => r.status === 'changes_requested')) return 'changes-requested';
  if (reviews.length > 0 && reviews.every((r) => r.status === 'approved')) return 'approved';
  return 'in-review';
}

/** Is there anything left to do on this document, for anyone? */
export function isOpenWork(
  docStatus: string,
  reviews: Array<{ status: string }>,
  steps: Array<{ status: string }>,
): boolean {
  if (String(docStatus).toUpperCase() === 'IN_REVIEW') return true;
  if (reviews.some((r) => r.status !== 'approved')) return true;
  return steps.some((s) => String(s.status).toUpperCase() === 'PENDING');
}

// ─── Rows ────────────────────────────────────────────────────────────────────

interface DocRow {
  id: string;
  title: string;
  module: string | null;
  status: string;
  program_id: string | null;
  program_name: string | null;
  workflow_id: string | null;
  version: string | null;
  updated_at: string | Date | null;
  created_by: string | null;
}
interface ReviewRow {
  id: string;
  doc_id: string;
  reviewer_id: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  review_status: string;
  review_comments: string | null;
  reviewed_at: string | Date | null;
  requested_at: string | Date | null;
  requested_by: string | null;
}
interface StepRow {
  id: string;
  workflow_id: string;
  doc_id: string;
  step_no: number;
  role: string;
  approver_email: string | null;
  status: string;
  decision_note: string | null;
  decided_at: string | Date | null;
}
interface CommentCountRow { doc_id: string; open_count: number | string; total: number | string }
interface SectionRow { doc_id: string; id: string; code: string | null; title: string | null; content: string | null }
interface CommentRow {
  id: string;
  doc_id: string;
  section_id: string | null;
  body: string;
  status: string | null;
  created_by: string | null;
  user_name: string | null;
  user_email: string | null;
  parent_comment_id: string | null;
  created_at: string | Date | null;
  section_code: string | null;
}

const groupBy = <T extends { doc_id: string }>(rows: T[]): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.doc_id) ?? [];
    list.push(r);
    m.set(r.doc_id, list);
  }
  return m;
};

// ─── The read ────────────────────────────────────────────────────────────────

export async function buildAuthoringReviewBoard(input: BuildReviewBoardInput): Promise<ReviewBoardView> {
  const { sql, orgId, userId, userEmail, scope, programId, limit, itemId } = input;
  const generatedAt = new Date().toISOString();
  const empty = (): ReviewBoardView => ({
    queue: [],
    workflows: {},
    thread: [],
    meta: { scope, programId, total: 0, threadItemId: null, threadDocumentId: null, generatedAt },
  });

  // 1. Documents in this organisation that carry any review request or
  //    approval step (or sit IN_REVIEW). Bounded; the open/ownership filters
  //    below are applied in memory over this set.
  const docs = (await sql.query(
    `SELECT d.id::text AS id, d.title, d.module, d.status,
            d.client_program_id::text AS program_id,
            p.name AS program_name,
            d.current_workflow_id::text AS workflow_id,
            d.version, d.updated_at, d.created_by
       FROM authoring_documents d
       LEFT JOIN regulatory_programs p
         ON p.id = d.client_program_id AND p.organization_id = d.tenant_id
      WHERE d.tenant_id = $1
        AND ($2::text IS NULL OR d.client_program_id::text = $2::text)
        AND (
          upper(d.status) = 'IN_REVIEW'
          OR EXISTS (SELECT 1 FROM authoring_reviews r
                      WHERE r.tenant_id = d.tenant_id AND r.doc_id::text = d.id::text)
          OR EXISTS (SELECT 1 FROM authoring_workflow_steps s
                      WHERE s.tenant_id = d.tenant_id AND s.doc_id::text = d.id::text)
        )
      ORDER BY d.updated_at DESC NULLS LAST
      LIMIT 200`,
    [orgId, programId],
  )).rows as unknown as DocRow[];
  if (docs.length === 0) return empty();

  const docIds = docs.map((d) => d.id);

  // 2. Related rows in bounded batches, all tenant-scoped.
  const [reviewRows, stepRows, countRows, sectionRows] = await Promise.all([
    sql.query(
      `SELECT id::text AS id, doc_id::text AS doc_id, reviewer_id, reviewer_name, reviewer_email,
              review_status, review_comments, reviewed_at, requested_at, requested_by
         FROM authoring_reviews
        WHERE tenant_id = $1 AND doc_id::text = ANY($2::text[])
        ORDER BY requested_at DESC NULLS LAST, created_at DESC`,
      [orgId, docIds],
    ).then((r) => r.rows as unknown as ReviewRow[]),
    sql.query(
      `SELECT id::text AS id, workflow_id::text AS workflow_id, doc_id::text AS doc_id,
              step_no, role, approver_email, status, decision_note, decided_at
         FROM authoring_workflow_steps
        WHERE tenant_id = $1 AND doc_id::text = ANY($2::text[])
        ORDER BY step_no ASC`,
      [orgId, docIds],
    ).then((r) => r.rows as unknown as StepRow[]),
    sql.query(
      `SELECT doc_id::text AS doc_id,
              COUNT(*) FILTER (WHERE status = 'open') AS open_count,
              COUNT(*) AS total
         FROM authoring_comments
        WHERE tenant_id = $1 AND doc_id::text = ANY($2::text[])
        GROUP BY doc_id`,
      [orgId, docIds],
    ).then((r) => r.rows as unknown as CommentCountRow[]),
    sql.query(
      `SELECT DISTINCT ON (doc_id) doc_id::text AS doc_id, id::text AS id, code, title, content
         FROM authoring_sections
        WHERE tenant_id = $1 AND doc_id::text = ANY($2::text[])
        ORDER BY doc_id, order_index ASC NULLS LAST, created_at ASC`,
      [orgId, docIds],
    ).then((r) => r.rows as unknown as SectionRow[]),
  ]);

  const reviewsByDoc = groupBy(reviewRows);
  const stepsByDoc = groupBy(stepRows);
  const openCommentsByDoc = new Map(countRows.map((c) => [c.doc_id, Number(c.open_count)]));
  const firstSectionByDoc = new Map(sectionRows.map((s) => [s.doc_id, s]));

  const isMe = (idOrEmail: unknown): boolean =>
    same(idOrEmail, userId) || (userEmail != null && same(idOrEmail, userEmail));

  // 3. Build queue + workflows.
  const queue: ReviewItemView[] = [];
  const workflows: Record<string, ReviewWorkflowView> = {};

  for (const d of docs) {
    const reviews = reviewsByDoc.get(d.id) ?? [];
    // Only the CURRENT workflow's steps are the document's approval chain; an
    // earlier submission's steps stay in the table as history.
    const steps = (stepsByDoc.get(d.id) ?? []).filter((s) => !d.workflow_id || same(s.workflow_id, d.workflow_id));
    const reviewViews: ReviewRequestView[] = reviews.map((r) => ({
      id: r.id,
      reviewerId: String(r.reviewer_id),
      reviewer: r.reviewer_name || r.reviewer_email || String(r.reviewer_id),
      reviewerEmail: r.reviewer_email ?? null,
      status: r.review_status,
      comments: r.review_comments ?? null,
      requestedBy: r.requested_by ?? null,
      requestedAt: iso(r.requested_at),
      reviewedAt: iso(r.reviewed_at),
    }));
    const open = isOpenWork(d.status, reviewViews, steps);

    const myReview = reviews.find((r) => isMe(r.reviewer_id) || isMe(r.reviewer_email)) ?? null;
    const awaitingMyReview = !!myReview && myReview.review_status === 'pending';
    // The submitter of the approval chain is not recorded on the steps; the
    // document's creator is the closest attributable stand-in for "asked for
    // this sign-off" when no review request names a requester.
    const requestedByMe =
      reviews.some((r) => isMe(r.requested_by)) || (steps.length > 0 && isMe(d.created_by));
    const currentStep = steps.find((s) => String(s.status).toUpperCase() === 'PENDING') ?? null;
    const atMySignOff = !!currentStep && isMe(currentStep.approver_email);
    const mine = awaitingMyReview || atMySignOff;

    // "all" and "mine" are OPEN work. "requested" is everything the caller
    // asked for, decided or not — a requester who is never shown the verdict
    // has been shown a review that silently vanished.
    if (scope === 'requested') {
      if (!requestedByMe) continue;
    } else if (!open || (scope === 'mine' && !mine)) {
      continue;
    }

    const pendingReview = reviews.find((r) => r.review_status === 'pending') ?? null;
    let reviewer = '';
    let role = '';
    if (pendingReview) {
      reviewer = pendingReview.reviewer_name || pendingReview.reviewer_email || String(pendingReview.reviewer_id);
      role = 'Reviewer';
    } else if (currentStep) {
      reviewer = currentStep.approver_email ?? '';
      role = `${currentStep.role} sign-off`;
    } else if (reviews[0]) {
      reviewer = reviews[0].reviewer_name || reviews[0].reviewer_email || String(reviews[0].reviewer_id);
      role = 'Reviewer';
    }

    const provBits: string[] = [];
    if (d.version) provBits.push(`v${d.version}`);
    provBits.push(String(d.status).toLowerCase().replace(/_/g, ' '));
    const requester = reviews[0]?.requested_by;
    if (requester) provBits.push(`review requested by ${requester}`);

    const firstSection = firstSectionByDoc.get(d.id) ?? null;
    const state = deriveState(d.status, reviewViews);
    const esig: ReviewItemView['esig'] =
      String(d.status).toUpperCase() === 'APPROVED' ? 'signed'
      : currentStep ? 'pending'
      : steps.length > 0 ? 'queued'
      : 'none';

    queue.push({
      id: d.id,
      doc: d.title || 'Untitled document',
      prog: d.program_name ?? null,
      programId: d.program_id ?? null,
      pid: d.id,
      module: d.module ?? null,
      docStatus: d.status,
      state,
      reviews: reviewViews,
      myReviewId: myReview?.id ?? null,
      myReviewStatus: myReview?.review_status ?? null,
      awaitingMyReview,
      requestedByMe,
      atMySignOff,
      mine,
      reviewer,
      role,
      due: '',
      tone: '',
      comments: openCommentsByDoc.get(d.id) ?? 0,
      esig,
      conf: null,
      prov: provBits.length ? provBits.join(' · ') : null,
      passage: excerpt(firstSection?.content),
      firstSectionId: firstSection?.id ?? null,
      requestedAt: reviewViews[0]?.requestedAt ?? null,
    });

    if (steps.length > 0) {
      let seenCurrent = false;
      workflows[d.id] = {
        templateId: steps[0].workflow_id,
        template: 'Authoring approval workflow',
        steps: steps.map((s) => {
          const st = String(s.status).toUpperCase();
          let status: ReviewWorkflowStepView['status'];
          if (st === 'APPROVED') status = 'approved';
          else if (st === 'REJECTED') status = 'rejected';
          else if (!seenCurrent) { status = 'current'; seenCurrent = true; }
          else status = 'pending';
          return {
            id: s.id,
            order: Number(s.step_no),
            name: s.role,
            approverType: 'user',
            approver: s.approver_email ?? '',
            requiredActions: ['sign'],
            status,
            at: relTime(s.decided_at),
          };
        }),
      };
    }
  }

  // 4. Queue cap, then the thread for the selected (or first) returned item.
  const limited = queue.slice(0, limit);
  const limitedIds = new Set(limited.map((q) => q.id));
  const limitedWorkflows: Record<string, ReviewWorkflowView> = {};
  for (const id of Object.keys(workflows)) if (limitedIds.has(id)) limitedWorkflows[id] = workflows[id];

  const threadItem = (itemId ? limited.find((q) => q.id === itemId) : undefined) ?? limited[0] ?? null;
  let thread: ReviewCommentView[] = [];
  if (threadItem) {
    const commentRows = (await sql.query(
      `SELECT c.id::text AS id, c.doc_id::text AS doc_id, c.section_id::text AS section_id, c.body, c.status,
              c.created_by, c.user_name, c.user_email, c.parent_comment_id::text AS parent_comment_id,
              c.created_at, s.code AS section_code
         FROM authoring_comments c
         LEFT JOIN authoring_sections s ON s.id = c.section_id AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1 AND c.doc_id::text = $2::text
        ORDER BY c.created_at ASC`,
      [orgId, threadItem.id],
    )).rows as unknown as CommentRow[];
    thread = commentRows.map((c) => ({
      id: c.id,
      author: c.user_name || c.user_email || c.created_by || '',
      role: c.section_code ? `§${c.section_code}` : '',
      when: relTime(c.created_at) ?? '',
      state: c.status === 'resolved' ? 'resolved' : 'open',
      body: c.body,
      ai: false,
      sectionId: c.section_id ?? null,
      parentId: c.parent_comment_id ?? null,
    }));
  }

  return {
    queue: limited,
    workflows: limitedWorkflows,
    thread,
    meta: {
      scope,
      programId,
      total: limited.length,
      threadItemId: threadItem?.id ?? null,
      threadDocumentId: threadItem?.id ?? null,
      generatedAt,
    },
  };
}
