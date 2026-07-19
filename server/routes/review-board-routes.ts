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
 * HTTP + shaping only; no business writes. GET is idempotent and safe. Every
 * field that has no real server source is returned as a documented null (never
 * fabricated) — see the module caveats in the PR description.
 *
 * @module server/routes/review-board-routes
 */

import { Router, Request, Response } from 'express';
import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
  documentWorkflows,
  workflowApprovals,
  workflowSteps,
  workflowTemplates,
  unifiedDocuments,
  workflowDocumentVersions,
  documentComments,
} from '../../shared/schema/unified_workflow';
import { users } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('review-board-routes');

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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

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

// ─── Router Factory ───────────────────────────────────────────────────────────

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

        // scope=mine → keep only items the caller currently owns
        if (scope === 'mine') {
          const mine =
            !!currentApproval &&
            (currentApproval.assignedTo.includes(userId) || currentApproval.assignedTo.includes('*'));
          if (!mine) continue;
        }

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

  return router;
}
