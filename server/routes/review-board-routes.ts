/**
 * Review & Approval Board API Routes
 *
 * Read-only aggregation endpoint that powers the Concept2Cure v2 "review"
 * surface (client/src/concept2cure/v2/surfaces/Review.tsx). It joins the
 * unified document-workflow tables into the exact display shape the surface
 * renders — a review queue, per-workflow multi-step approval templates, and a
 * threaded comment list — all org-scoped from the verified JWT.
 *
 * Real data model (shared/schema/unified_workflow.ts) — the same tables the
 * ApprovalOrchestrator writes:
 *   document_workflows          → one row per review-in-flight   (the queue)
 *   workflow_approvals          → per-step approval state        (the steps)
 *   workflow_steps              → step name / actions / approver type
 *   workflow_templates          → template id + human name
 *   unified_documents           → title / status / metadata / latest body
 *   workflow_document_versions  → latest content.body (passage under review)
 *   document_comments           → threaded review comments
 *   users                       → name + title resolution
 *
 * GET /board is HTTP + shaping only, idempotent and safe. Every field that has
 * no real server source is returned as a documented null (never fabricated) —
 * see the module caveats in the PR description.
 *
 * POST /workflows/:workflowId/change-request is the module's one write: a
 * reviewer asking the author to revise. It records the request as a comment on
 * the document and in workflow_history, and deliberately leaves the approval
 * step pending — see the block comment on the route for why none of the three
 * existing "reject"/"request changes" endpoints was the right thing to call.
 *
 * @module server/routes/review-board-routes
 */

import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import {
  documentWorkflows,
  workflowApprovals,
  workflowSteps,
  workflowTemplates,
  unifiedDocuments,
  workflowDocumentVersions,
  workflowHistory,
  documentComments,
} from '../../shared/schema/unified_workflow';
import { users } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('review-board-routes');

// Upper bound on a change-request reason. It is a request to revise, not the
// revision — anything past this is a client bug, and the value is rendered back
// into the review thread.
const MAX_CHANGE_REQUEST_CHARS = 5_000;

// ─── Display shape (mirrors client .../v2/fixtures/review-data.ts) ────────────

interface ReviewItem {
  id: string;
  doc: string;
  prog: string | null;
  pid: string;
  secKey: string;
  reviewer: string;
  role: string;
  due: string;
  tone: string;
  state: string;
  comments: number;
  esig: string;
  conf: number | null;
  prov: string | null;
  passage: string;
  // True when the caller owns the workflow's current step. The client used to
  // count every org-wide sign-off step as "at YOUR sign-off step" because
  // ownership was only ever decided here, under scope=mine, and never sent.
  mine: boolean;
}

interface ReviewWorkflowStep {
  id: number;
  order: number;
  name: string;
  approverType: string;
  approver: string;
  requiredActions: string[];
  status: string;
  at: string | null;
}

interface ReviewWorkflow {
  templateId: string;
  template: string;
  steps: ReviewWorkflowStep[];
}

interface ReviewComment {
  id: string;
  author: string;
  role: string;
  when: string;
  state: string;
  body: string;
  ai: boolean;
}

interface ReviewBoard {
  queue: ReviewItem[];
  workflows: Record<string, ReviewWorkflow>;
  thread: ReviewComment[];
  meta: {
    scope: 'all' | 'mine';
    total: number;
    threadItemId: string | null;
    threadDocumentId: number | null;
    generatedAt: string;
  };
}

// ─── Pure helpers ────────────────────────────────────────────────────────────────

const MS_DAY = 86_400_000;

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/** "2h ago" / "yesterday" / "3 d ago" for a past instant; null when absent. */
function relTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return 'just now';
  if (ms < 3_600_000) {
    const m = Math.max(1, Math.round(ms / 60_000));
    return `${m}m ago`;
  }
  if (ms < MS_DAY) {
    const h = Math.round(ms / 3_600_000);
    return `${h}h ago`;
  }
  const days = Math.round(ms / MS_DAY);
  return days === 1 ? 'yesterday' : `${days} d ago`;
}

/** Human due label used by the surface (it filters on the literal "Today"). */
function dueLabel(due: Date | null): string {
  if (!due) return '';
  const diff = Math.round((startOfDay(due) - startOfDay(new Date())) / MS_DAY);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

function dueTone(due: Date | null): string {
  if (!due) return '';
  const diff = Math.round((startOfDay(due) - startOfDay(new Date())) / MS_DAY);
  if (diff <= 0) return 'err';
  if (diff <= 2) return 'warn';
  return 'ok';
}

/** Optional due date sourced from workflow metadata (matches ApprovalOrchestrator). */
function parseDue(meta: Record<string, unknown> | null | undefined): Date | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>).due ?? (meta as Record<string, unknown>).dueDate;
  if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
    const d = new Date(raw as string | number | Date);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** document_workflows.status → surface review state. */
function uiState(status: string): string {
  switch (status) {
    case 'active':
      return 'in-review';
    case 'completed':
      return 'approved';
    case 'rejected':
      return 'changes-requested';
    default:
      return 'in-review';
  }
}

/**
 * Derived e-sign disposition. The surface does not render this field, so it is
 * structural only — no dedicated e-signature manifestation table is joined here.
 */
function esigState(status: string, currentRequiredActions: string[] | null): string {
  if (status === 'completed') return 'signed';
  if (currentRequiredActions && currentRequiredActions.includes('sign')) return 'pending';
  return 'queued';
}

function stepUiStatus(
  apprStatus: string,
  stepOrder: number,
  currentStep: number,
  wfStatus: string,
): string {
  if (apprStatus === 'approved') return 'approved';
  if (apprStatus === 'rejected') return 'current';
  if (wfStatus === 'active' && stepOrder === currentStep) return 'current';
  return 'pending';
}

function excerpt(text: string, max = 600): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createReviewBoardRoutes(): Router {
  const router = Router();

  function getOrgId(req: Request): number {
    const raw =
      (req as any).user?.organizationId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).organizationId ??
      (req as any).tenantId;
    const n = Number(raw);
    if (raw == null || !Number.isFinite(n)) {
      throw new Error('REVIEW_NO_TENANT: Organization context required');
    }
    return n;
  }

  function getUserId(req: Request): string {
    return String((req as any).user?.userId ?? (req as any).user?.id ?? '');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/review/board
  //   scope=all|mine   (mine → only items where the caller owns the current step)
  //   limit=1..100     (queue cap, default 25)
  //   itemId=<wfId>    (which returned item's comment thread to include; default first)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/board', async (req: Request, res: Response) => {
    let orgId: number;
    try {
      orgId = getOrgId(req);
    } catch {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }

    // Honest query-param shaping (this is a read; no zod write-body validation).
    const scope: 'all' | 'mine' = String(req.query.scope ?? 'all') === 'mine' ? 'mine' : 'all';
    const itemId = req.query.itemId != null ? String(req.query.itemId) : undefined;
    let limit = 25;
    if (req.query.limit != null) {
      const n = Number(req.query.limit);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        return res.status(400).json({ success: false, error: 'limit must be an integer between 1 and 100' });
      }
      limit = n;
    }
    const userId = getUserId(req);

    try {
      // Request-scoped, RLS-enforcing DB client. New tenant-facing routes must
      // use requestDb(req) (ci:requestdb-coverage gate), not the shared pool —
      // the shared pool has no tenant session vars set.
      const db = requestDb(req);

      // 1. Org-scoped workflows (the review pipeline). Cancelled ones are excluded.
      const wfRowsRaw = await db
        .select()
        .from(documentWorkflows)
        .where(eq(documentWorkflows.organizationId, orgId))
        .orderBy(desc(documentWorkflows.startedAt))
        .limit(200);

      // active first, otherwise most-recent first (query is already desc by startedAt;
      // Array.prototype.sort is stable so intra-group ordering is preserved).
      const wfRows = wfRowsRaw
        .filter(w => w.status !== 'cancelled')
        .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1));

      if (wfRows.length === 0) {
        const empty: ReviewBoard = {
          queue: [],
          workflows: {},
          thread: [],
          meta: {
            scope,
            total: 0,
            threadItemId: null,
            threadDocumentId: null,
            generatedAt: new Date().toISOString(),
          },
        };
        return res.json({ success: true, data: empty });
      }

      const workflowIds = wfRows.map(w => w.id);
      const documentIds = Array.from(new Set(wfRows.map(w => w.documentId)));
      const templateIds = Array.from(new Set(wfRows.map(w => w.templateId)));

      // 2. Related rows in bounded batches.
      const [docRows, templateRows, approvalRows, versionRows, commentRows] = await Promise.all([
        db.select().from(unifiedDocuments).where(inArray(unifiedDocuments.id, documentIds)),
        db.select().from(workflowTemplates).where(inArray(workflowTemplates.id, templateIds)),
        db
          .select({
            id: workflowApprovals.id,
            workflowId: workflowApprovals.workflowId,
            stepOrder: workflowApprovals.stepOrder,
            status: workflowApprovals.status,
            assignedTo: workflowApprovals.assignedTo,
            assignmentType: workflowApprovals.assignmentType,
            requiredActions: workflowApprovals.requiredActions,
            completedBy: workflowApprovals.completedBy,
            completedAt: workflowApprovals.completedAt,
            stepName: workflowSteps.name,
          })
          .from(workflowApprovals)
          .leftJoin(workflowSteps, eq(workflowApprovals.stepId, workflowSteps.id))
          .where(inArray(workflowApprovals.workflowId, workflowIds))
          .orderBy(workflowApprovals.stepOrder),
        db
          .select({
            documentId: workflowDocumentVersions.documentId,
            version: workflowDocumentVersions.version,
            content: workflowDocumentVersions.content,
          })
          .from(workflowDocumentVersions)
          .where(inArray(workflowDocumentVersions.documentId, documentIds))
          .orderBy(workflowDocumentVersions.version),
        db
          .select()
          .from(documentComments)
          .where(inArray(documentComments.documentId, documentIds))
          .orderBy(documentComments.createdAt),
      ]);

      // 3. Resolve numeric user ids → name/title. Columns may hold a numeric user
      //    id (string form), a role label, or a plain name; resolve numeric ids and
      //    pass everything else through literally.
      const tokenSet = new Set<string>();
      for (const w of wfRows) if (w.startedBy) tokenSet.add(String(w.startedBy));
      for (const a of approvalRows) {
        (a.assignedTo || []).forEach(t => tokenSet.add(String(t)));
        if (a.completedBy) tokenSet.add(String(a.completedBy));
      }
      for (const c of commentRows) if (c.createdBy) tokenSet.add(String(c.createdBy));
      for (const d of docRows) if (d.updatedBy) tokenSet.add(String(d.updatedBy));

      const numericUserIds = Array.from(tokenSet)
        .map(t => Number(t))
        .filter(n => Number.isFinite(n) && n > 0);
      const userRows = numericUserIds.length
        ? await db
            .select({ id: users.id, name: users.name, title: users.title, department: users.department })
            .from(users)
            .where(inArray(users.id, numericUserIds))
        : [];
      const userById = new Map(userRows.map(u => [u.id, u]));

      const resolveName = (token: string | null | undefined): string => {
        if (!token) return '';
        if (token === '*') return 'Anyone';
        const n = Number(token);
        if (Number.isFinite(n) && userById.has(n)) return userById.get(n)!.name;
        return token;
      };
      const resolveTitle = (token: string | null | undefined): string => {
        if (!token) return '';
        const n = Number(token);
        if (Number.isFinite(n) && userById.has(n)) {
          const u = userById.get(n)!;
          return u.title || u.department || '';
        }
        return '';
      };

      // 4. Index helpers.
      const docById = new Map(docRows.map(d => [d.id, d]));
      const templateById = new Map(templateRows.map(t => [t.id, t]));

      const approvalsByWf = new Map<number, typeof approvalRows>();
      for (const a of approvalRows) {
        const list = approvalsByWf.get(a.workflowId) ?? [];
        list.push(a);
        approvalsByWf.set(a.workflowId, list);
      }

      // rows are ordered by version asc → last write per doc is the latest body
      const latestBodyByDoc = new Map<number, string>();
      for (const v of versionRows) {
        const body = (v.content as { body?: unknown } | null)?.body;
        if (typeof body === 'string') latestBodyByDoc.set(v.documentId, body);
      }

      const commentsByDoc = new Map<number, typeof commentRows>();
      for (const c of commentRows) {
        const list = commentsByDoc.get(c.documentId) ?? [];
        list.push(c);
        commentsByDoc.set(c.documentId, list);
      }

      // 5. Build queue + workflows map.
      const queue: ReviewItem[] = [];
      const workflows: Record<string, ReviewWorkflow> = {};

      for (const wf of wfRows) {
        const wfId = String(wf.id);
        const doc = docById.get(wf.documentId);
        const meta = (doc?.metadata as Record<string, any> | null) ?? {};
        const steps = (approvalsByWf.get(wf.id) ?? []).slice().sort((a, b) => a.stepOrder - b.stepOrder);

        const currentApproval =
          steps.find(s => s.status === 'pending' && s.stepOrder === wf.currentStep) ??
          steps.find(s => s.status === 'pending') ??
          null;

        // Ownership of the current step, sent on every item so the client can
        // say "your sign-off" only about steps that are actually the caller's.
        const mine =
          !!currentApproval &&
          (currentApproval.assignedTo.includes(userId) || currentApproval.assignedTo.includes('*'));
        // scope=mine → keep only items the caller currently owns
        if (scope === 'mine' && !mine) continue;

        const lastCompleted = [...steps].reverse().find(s => s.completedBy);

        // reviewer / role = owner of the current step (fallbacks: last actor, initiator)
        let reviewer = '';
        let role = '';
        if (currentApproval) {
          const first = currentApproval.assignedTo[0];
          if (currentApproval.assignmentType === 'user') {
            reviewer = resolveName(first);
            role = resolveTitle(first);
          } else {
            reviewer = first ? String(first) : '';
            role = first ? String(first) : '';
          }
        } else if (lastCompleted) {
          reviewer = resolveName(lastCompleted.completedBy);
          role = resolveTitle(lastCompleted.completedBy);
        } else {
          reviewer = resolveName(wf.startedBy);
          role = resolveTitle(wf.startedBy);
        }

        const due = parseDue(wf.metadata as Record<string, unknown> | null);
        const passageSource =
          (typeof meta.content === 'string' && meta.content) ||
          latestBodyByDoc.get(wf.documentId) ||
          '';

        // provenance line composed from real audit/metadata fields (not a stored narrative)
        const provBits: string[] = [];
        if (doc?.latestVersion) provBits.push(`v${doc.latestVersion}`);
        const changedBy = doc?.updatedBy ?? (typeof meta.lastVersionedBy === 'string' ? meta.lastVersionedBy : undefined);
        if (changedBy) provBits.push(`last changed by ${resolveName(String(changedBy))}`);
        if (typeof meta.lastChangeReason === 'string' && meta.lastChangeReason) provBits.push(meta.lastChangeReason);

        const prog =
          (typeof meta.program === 'string' && meta.program) ||
          (typeof meta.programCode === 'string' && meta.programCode) ||
          (typeof meta.submission === 'string' && meta.submission) ||
          (typeof meta.submissionId === 'string' && meta.submissionId) ||
          null;

        queue.push({
          id: wfId,
          doc: doc?.title ?? 'Untitled document',
          prog,
          pid: String(wf.documentId),
          secKey: typeof meta.section === 'string' ? meta.section : '',
          reviewer,
          role,
          due: dueLabel(due),
          tone: dueTone(due),
          state: uiState(wf.status),
          comments: commentsByDoc.get(wf.documentId)?.length ?? 0,
          esig: esigState(wf.status, currentApproval?.requiredActions ?? null),
          conf: null, // no server source for AnA confidence — see caveats
          prov: provBits.length ? provBits.join(' · ') : null,
          passage: excerpt(passageSource),
          mine,
        });

        const template = templateById.get(wf.templateId);
        workflows[wfId] = {
          templateId: String(wf.templateId),
          template: template?.name ?? `Template ${wf.templateId}`,
          steps: steps.map(s => ({
            id: s.id,
            order: s.stepOrder,
            name: s.stepName ?? `Step ${s.stepOrder}`,
            approverType: s.assignmentType,
            approver:
              s.assignmentType === 'user'
                ? (s.assignedTo || []).map(resolveName).join(', ')
                : (s.assignedTo || []).join(', '),
            requiredActions: s.requiredActions ?? [],
            status: stepUiStatus(s.status, s.stepOrder, wf.currentStep, wf.status),
            at: relTime(s.completedAt),
          })),
        };
      }

      // 6. Apply queue cap + prune the workflows map to the returned ids.
      const limitedQueue = queue.slice(0, limit);
      const limitedIds = new Set(limitedQueue.map(q => q.id));
      const limitedWorkflows: Record<string, ReviewWorkflow> = {};
      for (const id of Object.keys(workflows)) {
        if (limitedIds.has(id)) limitedWorkflows[id] = workflows[id];
      }

      // 7. Comment thread for the selected (or first) returned item.
      const threadItem =
        (itemId ? limitedQueue.find(q => q.id === itemId) : undefined) ?? limitedQueue[0] ?? null;
      const threadDocumentId = threadItem ? Number(threadItem.pid) : null;
      const thread: ReviewComment[] =
        threadDocumentId != null && Number.isFinite(threadDocumentId)
          ? (commentsByDoc.get(threadDocumentId) ?? []).map(c => ({
              id: String(c.id),
              author: resolveName(c.createdBy),
              role: resolveTitle(c.createdBy),
              when: relTime(c.createdAt) ?? '',
              state: c.isResolved ? 'resolved' : 'open',
              body: c.content,
              ai: !!(c.metadata as { ai?: unknown } | null)?.ai,
            }))
          : [];

      const board: ReviewBoard = {
        queue: limitedQueue,
        workflows: limitedWorkflows,
        thread,
        meta: {
          scope,
          total: limitedQueue.length,
          threadItemId: threadItem?.id ?? null,
          threadDocumentId: threadDocumentId != null && Number.isFinite(threadDocumentId) ? threadDocumentId : null,
          generatedAt: new Date().toISOString(),
        },
      };

      return res.json({ success: true, data: board });
    } catch (error) {
      logger.error('review board error', { err: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ success: false, error: 'Failed to build review board' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/review/workflows/:workflowId/change-request
  //   body: { reason: string }
  //
  // A reviewer asks the author to revise, WITHOUT approving and without
  // terminating the workflow.
  //
  // WHY THIS ROUTE EXISTS RATHER THAN A CALL TO AN EXISTING ONE. Three routes
  // looked like they already did this. None of them does:
  //
  //   • POST /api/approval-workflows/:id/reject — real and mounted, but it calls
  //     processApproval({ action: 'reject' }) and TERMINATES the workflow.
  //     "Please revise §3.2.P.5" is not "this submission is rejected", and
  //     escalating one into the other is worse than recording nothing.
  //   • POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviews/submit
  //     has exactly the right vocabulary — approve | request_changes | reject —
  //     but it addresses a concept2cure ARTIFACT inside a PROJECT. This board is
  //     built from document_workflows over unified_documents. Different id
  //     spaces: the ids the surface holds are not the ids that route takes, and
  //     integer ids that collide across two stores fail silently rather than
  //     404ing.
  //   • EvidenceManagementService.requestChanges addresses evidence FILES.
  //
  // WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. It writes the change
  // request as a comment on the document the workflow is running against, and
  // records the act in workflow_history. It does NOT touch the reviewer's
  // workflow_approvals row: `approval_status` is an enum of exactly
  // ('pending','approved','rejected') — there is no "changes requested" member,
  // and the honest reading of an unfinished review is the one already there,
  // `pending`. Inventing a state by writing 'rejected' would terminate the very
  // workflow the reviewer is trying to keep alive.
  //
  // The comment lands in the same document_comments table GET /board reads for
  // its thread, so the request appears in the thread on the next load — a real
  // round trip, not an optimistic local append.
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/workflows/:workflowId/change-request', async (req: Request, res: Response) => {
    let orgId: number;
    try {
      orgId = getOrgId(req);
    } catch {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authenticated user required' });
    }

    const workflowId = Number(req.params.workflowId);
    if (!Number.isInteger(workflowId) || workflowId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid workflow id' });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }
    if (reason.length > MAX_CHANGE_REQUEST_CHARS) {
      return res.status(413).json({
        success: false,
        error: `reason exceeds ${MAX_CHANGE_REQUEST_CHARS} characters`,
      });
    }

    try {
      const db = requestDb(req);

      // The workflow carries the tenant AND the document. Reading documentId
      // from here rather than from the body is what stops a caller pointing a
      // change request at a document they can see the id of but not review.
      const [wf] = await db
        .select({
          id: documentWorkflows.id,
          documentId: documentWorkflows.documentId,
          status: documentWorkflows.status,
          currentStep: documentWorkflows.currentStep,
        })
        .from(documentWorkflows)
        .where(
          and(
            eq(documentWorkflows.id, workflowId),
            eq(documentWorkflows.organizationId, orgId)
          )
        )
        .limit(1);

      if (!wf) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }
      if (wf.status !== 'active') {
        // A completed or rejected workflow has nothing left to revise into.
        return res.status(409).json({
          success: false,
          error: `Workflow is ${wf.status}; only an active workflow can take a change request`,
        });
      }

      // Only someone the workflow is actually waiting on may do this. Without
      // this check any authenticated member of the org could inject a change
      // request into a governed review they have no part in.
      const pendingSteps = await db
        .select({
          id: workflowApprovals.id,
          stepOrder: workflowApprovals.stepOrder,
          assignedTo: workflowApprovals.assignedTo,
        })
        .from(workflowApprovals)
        .where(
          and(
            eq(workflowApprovals.workflowId, workflowId),
            eq(workflowApprovals.status, 'pending')
          )
        );

      // `assigned_to` holds user-id strings, role labels, or '*' (anyone) —
      // the same token vocabulary GET /board resolves for display.
      const mine = pendingSteps.find(s =>
        (s.assignedTo || []).some(t => String(t) === userId || String(t) === '*')
      );
      if (!mine) {
        return res.status(403).json({
          success: false,
          error: 'You are not an assigned reviewer on a pending step of this workflow',
        });
      }

      const [comment] = await db
        .insert(documentComments)
        .values({
          documentId: wf.documentId,
          content: reason,
          createdBy: userId,
          metadata: {
            kind: 'change_request',
            workflowId,
            stepOrder: mine.stepOrder,
          },
        })
        .returning({ id: documentComments.id });

      await db.insert(workflowHistory).values({
        workflowId,
        action: 'change_requested',
        performedBy: userId,
        details: { stepOrder: mine.stepOrder, commentId: comment.id, reasonChars: reason.length },
      });

      return res.json({
        success: true,
        data: {
          commentId: comment.id,
          documentId: wf.documentId,
          stepOrder: mine.stepOrder,
          /** The approval step is deliberately left pending — see the block
           *  comment above. Returned so the client states this rather than
           *  implying the step advanced. */
          approvalStatus: 'pending',
        },
      });
    } catch (error: any) {
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('review workflow tables not available; returning 503', { code: error.code });
        return res.status(503).json({ success: false, error: 'REVIEW_TABLES_MISSING' });
      }
      logger.error('change request failed', {
        workflowId,
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to record the change request' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // The three writes the Review surface was missing entirely.
  //
  // Review.tsx recorded an APPROVAL DECISION with `onSigned ? onSigned() :
  // onClose()` — the queue row flipped to "Review decision recorded", and the
  // decision existed in one browser tab until the next refresh. It delegated an
  // approval by pushing a line into local thread state. It posted and resolved
  // review comments with `setThread` and no request at all. All of it looked
  // like a governed review and none of it reached the database.
  //
  // Each of these authorises the same way the change-request route does — the
  // workflow carries the tenant AND the document, and only someone the workflow
  // is actually waiting on may act — and records the act in workflow_history.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The caller's pending approval step on `workflowId`, or null.
   *
   * Reading the assignment from the workflow rather than from the request is
   * what stops an authenticated member of the org acting on a governed review
   * they have no part in. `assigned_to` holds user-id strings, role labels, or
   * '*' (anyone) — the same token vocabulary GET /board resolves for display.
   */
  async function pendingStepFor(db: ReturnType<typeof requestDb>, workflowId: number, userId: string) {
    const steps = await db
      .select({
        id: workflowApprovals.id,
        stepOrder: workflowApprovals.stepOrder,
        assignedTo: workflowApprovals.assignedTo,
      })
      .from(workflowApprovals)
      .where(and(eq(workflowApprovals.workflowId, workflowId), eq(workflowApprovals.status, 'pending')));
    return steps.find(s => (s.assignedTo || []).some(t => String(t) === userId || String(t) === '*')) ?? null;
  }

  /** The active workflow `workflowId` in this org, or null. */
  async function activeWorkflow(db: ReturnType<typeof requestDb>, workflowId: number, orgId: number) {
    const [wf] = await db
      .select({
        id: documentWorkflows.id,
        documentId: documentWorkflows.documentId,
        status: documentWorkflows.status,
        currentStep: documentWorkflows.currentStep,
      })
      .from(documentWorkflows)
      .where(and(eq(documentWorkflows.id, workflowId), eq(documentWorkflows.organizationId, orgId)))
      .limit(1);
    return wf ?? null;
  }

  /** Shared 503/500 handling for a missing or broken review store. */
  function reviewWriteFailed(res: Response, what: string, workflowId: number, error: any) {
    if (error?.code === '42P01' || error?.code === '42703') {
      logger.warn('review workflow tables not available; returning 503', { code: error.code });
      return res.status(503).json({ success: false, error: 'REVIEW_TABLES_MISSING' });
    }
    logger.error(`${what} failed`, {
      workflowId,
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ success: false, error: `Failed to ${what}` });
  }

  /**
   * Guard the common preamble: org, user, a valid workflow id, an ACTIVE
   * workflow in this org, and a pending step the caller owns. Returns null and
   * has already answered when any of them fails.
   */
  async function reviewerContext(req: Request, res: Response) {
    let orgId: number;
    try { orgId = getOrgId(req); } catch {
      res.status(403).json({ success: false, error: 'Organization context required' });
      return null;
    }
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authenticated user required' });
      return null;
    }
    const workflowId = Number(req.params.workflowId);
    if (!Number.isInteger(workflowId) || workflowId <= 0) {
      res.status(400).json({ success: false, error: 'Invalid workflow id' });
      return null;
    }
    const db = requestDb(req);
    const wf = await activeWorkflow(db, workflowId, orgId);
    if (!wf) {
      res.status(404).json({ success: false, error: 'Workflow not found' });
      return null;
    }
    if (wf.status !== 'active') {
      res.status(409).json({
        success: false,
        error: `Workflow is ${wf.status}; only an active workflow can be acted on`,
      });
      return null;
    }
    const mine = await pendingStepFor(db, workflowId, userId);
    if (!mine) {
      res.status(403).json({
        success: false,
        error: 'You are not an assigned reviewer on a pending step of this workflow',
      });
      return null;
    }
    return { orgId, userId, workflowId, db, wf, mine };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/review/workflows/:workflowId/decision   { decision, reason? }
  //
  // Record the reviewer's decision on their pending step. `approve` completes
  // the step; if it was the last pending step the workflow completes, otherwise
  // the workflow advances to the next one. `reject` rejects the step AND the
  // workflow — a rejected review does not silently continue to the next
  // approver — and requires a reason, because a rejection nobody can read the
  // grounds for is not a reviewable record.
  // ═══════════════════════════════════════════════════════════════════════════
  router.post('/workflows/:workflowId/decision', async (req: Request, res: Response) => {
    const ctx = await reviewerContext(req, res);
    if (!ctx) return;
    const { userId, workflowId, db, wf, mine } = ctx;

    const decision = String(req.body?.decision ?? '');
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ success: false, error: "decision must be 'approve' or 'reject'" });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (decision === 'reject' && reason.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'A rejection needs a reason of at least 8 characters — it is what the next author has to act on.',
      });
    }
    if (reason.length > MAX_CHANGE_REQUEST_CHARS) {
      return res.status(413).json({ success: false, error: `reason exceeds ${MAX_CHANGE_REQUEST_CHARS} characters` });
    }
    // 21 CFR 11.50: a signature manifestation carries the MEANING of the
    // signing. The surface sends the meaning the reviewer selected; it is
    // recorded verbatim and never inferred from the decision.
    const meaning = typeof req.body?.meaning === 'string' ? req.body.meaning.trim().slice(0, 200) : '';
    const now = new Date();

    try {
      await db
        .update(workflowApprovals)
        .set({
          status: decision === 'approve' ? 'approved' : 'rejected',
          completedBy: userId,
          completedAt: now,
          comments: reason || null,
        })
        .where(eq(workflowApprovals.id, mine.id));

      // What remains pending AFTER this decision decides whether the workflow
      // moves on or is finished. Asking the database rather than assuming keeps
      // a parallel step (two approvers on one order) from ending the review
      // when only one of them has answered.
      const remaining = await db
        .select({ stepOrder: workflowApprovals.stepOrder })
        .from(workflowApprovals)
        .where(and(eq(workflowApprovals.workflowId, workflowId), eq(workflowApprovals.status, 'pending')));

      let workflowStatus: 'active' | 'completed' | 'rejected' = 'active';
      if (decision === 'reject') {
        workflowStatus = 'rejected';
        await db
          .update(documentWorkflows)
          .set({ status: 'rejected', rejectedBy: userId, rejectedAt: now })
          .where(eq(documentWorkflows.id, workflowId));
      } else if (remaining.length === 0) {
        workflowStatus = 'completed';
        await db
          .update(documentWorkflows)
          .set({ status: 'completed', completedBy: userId, completedAt: now })
          .where(eq(documentWorkflows.id, workflowId));
      } else {
        const nextStep = Math.min(...remaining.map(r => r.stepOrder));
        await db.update(documentWorkflows).set({ currentStep: nextStep }).where(eq(documentWorkflows.id, workflowId));
      }

      // The decision's grounds belong in the thread the next reviewer reads,
      // not only in the approval row nobody renders.
      let commentId: number | null = null;
      if (reason) {
        const [c] = await db
          .insert(documentComments)
          .values({
            documentId: wf.documentId,
            content: reason,
            createdBy: userId,
            metadata: { kind: 'review_decision', decision, workflowId, stepOrder: mine.stepOrder },
          })
          .returning({ id: documentComments.id });
        commentId = c?.id ?? null;
      }

      await db.insert(workflowHistory).values({
        workflowId,
        action: decision === 'approve' ? 'step_approved' : 'step_rejected',
        performedBy: userId,
        details: { stepOrder: mine.stepOrder, meaning: meaning || null, workflowStatus, commentId },
      });

      return res.json({
        success: true,
        data: {
          workflowId,
          stepOrder: mine.stepOrder,
          approvalStatus: decision === 'approve' ? 'approved' : 'rejected',
          workflowStatus,
          commentId,
        },
      });
    } catch (error: any) {
      return reviewWriteFailed(res, 'record the review decision', workflowId, error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/review/workflows/:workflowId/delegate   { to, reason }
  //
  // Hand the caller's pending step to someone else. The step's assignment is
  // REPLACED rather than appended to: a delegation that leaves the delegator
  // assigned has not delegated anything. A reason is required — who a governed
  // review was handed to, and why, is the whole point of recording it.
  // ═══════════════════════════════════════════════════════════════════════════
  router.post('/workflows/:workflowId/delegate', async (req: Request, res: Response) => {
    const ctx = await reviewerContext(req, res);
    if (!ctx) return;
    const { userId, workflowId, db, wf, mine } = ctx;

    const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    if (!to) return res.status(400).json({ success: false, error: 'to is required' });
    if (to === userId) {
      return res.status(400).json({ success: false, error: 'You cannot delegate a step to yourself.' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'A delegation needs a reason of at least 8 characters.',
      });
    }
    if (reason.length > MAX_CHANGE_REQUEST_CHARS) {
      return res.status(413).json({ success: false, error: `reason exceeds ${MAX_CHANGE_REQUEST_CHARS} characters` });
    }

    try {
      await db
        .update(workflowApprovals)
        .set({ assignedTo: [to] })
        .where(eq(workflowApprovals.id, mine.id));

      const [c] = await db
        .insert(documentComments)
        .values({
          documentId: wf.documentId,
          content: reason,
          createdBy: userId,
          metadata: { kind: 'delegation', workflowId, stepOrder: mine.stepOrder, delegatedTo: to },
        })
        .returning({ id: documentComments.id });

      await db.insert(workflowHistory).values({
        workflowId,
        action: 'step_delegated',
        performedBy: userId,
        details: { stepOrder: mine.stepOrder, delegatedTo: to, commentId: c?.id ?? null },
      });

      return res.json({
        success: true,
        data: { workflowId, stepOrder: mine.stepOrder, delegatedTo: to, commentId: c?.id ?? null },
      });
    } catch (error: any) {
      return reviewWriteFailed(res, 'delegate the review step', workflowId, error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/review/workflows/:workflowId/comments   { content }
  //
  // A thread comment on the document under review. Unlike a decision or a
  // delegation, commenting is open to any reviewer on the workflow — including
  // one whose own step is already answered — so this does NOT go through
  // reviewerContext's pending-step check. It still requires the workflow to be
  // in this org, which is what keeps the document id out of the request body.
  // ═══════════════════════════════════════════════════════════════════════════
  router.post('/workflows/:workflowId/comments', async (req: Request, res: Response) => {
    let orgId: number;
    try { orgId = getOrgId(req); } catch {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authenticated user required' });
    const workflowId = Number(req.params.workflowId);
    if (!Number.isInteger(workflowId) || workflowId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid workflow id' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ success: false, error: 'content is required' });
    if (content.length > MAX_CHANGE_REQUEST_CHARS) {
      return res.status(413).json({ success: false, error: `content exceeds ${MAX_CHANGE_REQUEST_CHARS} characters` });
    }
    const parentIdRaw = req.body?.parentId;
    const parentId =
      parentIdRaw == null || parentIdRaw === '' ? null : Number.isInteger(Number(parentIdRaw)) ? Number(parentIdRaw) : NaN;
    if (Number.isNaN(parentId)) {
      return res.status(400).json({ success: false, error: 'parentId must be a comment id' });
    }

    try {
      const db = requestDb(req);
      const wf = await activeWorkflow(db, workflowId, orgId);
      if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });

      const [c] = await db
        .insert(documentComments)
        .values({
          documentId: wf.documentId,
          content,
          createdBy: userId,
          parentId,
          metadata: { kind: 'review_comment', workflowId },
        })
        .returning({ id: documentComments.id, createdAt: documentComments.createdAt });

      return res.status(201).json({
        success: true,
        data: { commentId: c.id, documentId: wf.documentId, createdAt: c.createdAt, createdBy: userId },
      });
    } catch (error: any) {
      return reviewWriteFailed(res, 'post the review comment', workflowId, error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /api/review/comments/:commentId/resolve   { resolved?: boolean }
  //
  // Resolve (or reopen) a review comment. Scoped by joining the comment to a
  // workflow in the caller's org — document_comments carries no organization_id
  // of its own, so without the join any comment id in the deployment would be
  // resolvable by anyone.
  // ═══════════════════════════════════════════════════════════════════════════
  router.patch('/comments/:commentId/resolve', async (req: Request, res: Response) => {
    let orgId: number;
    try { orgId = getOrgId(req); } catch {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authenticated user required' });
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid comment id' });
    }
    const resolved = req.body?.resolved === undefined ? true : Boolean(req.body.resolved);

    try {
      const db = requestDb(req);
      const [row] = await db
        .select({ id: documentComments.id })
        .from(documentComments)
        .innerJoin(documentWorkflows, eq(documentWorkflows.documentId, documentComments.documentId))
        .where(and(eq(documentComments.id, commentId), eq(documentWorkflows.organizationId, orgId)))
        .limit(1);
      if (!row) return res.status(404).json({ success: false, error: 'Comment not found' });

      await db
        .update(documentComments)
        .set({
          isResolved: resolved,
          resolvedBy: resolved ? userId : null,
          resolvedAt: resolved ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(documentComments.id, commentId));

      return res.json({ success: true, data: { commentId, isResolved: resolved, resolvedBy: resolved ? userId : null } });
    } catch (error: any) {
      return reviewWriteFailed(res, 'resolve the review comment', commentId, error);
    }
  });

  return router;
}
