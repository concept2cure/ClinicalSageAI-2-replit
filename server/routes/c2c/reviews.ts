/**
 * Document review — threads, comments, tasks, queues and the review pulse
 * (PHASE 13), mounted at /api/concept2cure alongside the main router.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * `routes/concept2cure.ts` was 18,675 lines holding 158 handlers and their SQL
 * (ledger L53). It is a route file, not a registry, so it has to be split by
 * domain rather than indexed. This is the first domain out: the 2,175 lines
 * that touch only the review tables, the PM projection they feed, and the
 * notifications they suppress. Nothing here changed in behaviour — the
 * handlers, their middleware chain (rate limit → auth → tenant context →
 * organization check) and their paths are the same; the parity test beside
 * this file pins that the main router no longer answers any of them.
 *
 * The helpers this router shares with the main file (tenant and user
 * resolution, project access, the response envelope, content sanitising, the
 * error logger) are imported from it. Moving that helper web into its own
 * module is the next seam; taking it in the same change as the first domain
 * would have made a 2,000-line move a 5,000-line one.
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureArtifacts,
  concept2cureNotifications,
  concept2cureProvenanceEvents,
  concept2cureReviewTasks,
  concept2cureReviewThreads,
  concept2cureThreadComments,
  projectActivities,
  users,
} from '../../../shared/schema';
import {
  concept2cureRateLimiter,
  getClientIp,
  getOrganizationId,
  getUserId,
  logConcept2cureError,
  paramStr,
  sanitizeContent,
  sendError,
  sendSuccess,
} from './shared';
import { verifyProjectAccess } from './project-access';
import { createNotification, upsertProjectWorkItem } from './notifications';

const logger = createScopedLogger('concept2cure-reviews');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 13 — REVIEW THREADS, COMMENTS & TASKS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Permission helper ────────────────────────────────────────────────────────

type ThreadPermission = 'read' | 'comment' | 'request_changes' | 'resolve' | 'assign';

function getThreadPermissions(role: string): Set<ThreadPermission> {
  const r = role.toLowerCase();
  if (['admin', 'approver'].includes(r)) {
    return new Set(['read', 'comment', 'request_changes', 'resolve', 'assign']);
  }
  if (r === 'reviewer') {
    return new Set(['read', 'comment', 'request_changes', 'resolve']);
  }
  if (r === 'author' || r === 'user') {
    return new Set(['read', 'comment']);
  }
  // viewer
  return new Set(['read']);
}

// ── Auto-propagation: Document events → Project Management signals ───────────

/**
 * Propagates a document-level review event into the project management layer.
 * Creates a projectActivities record so PM dashboards, readiness strips,
 * and milestone views can ingest review activity without polling.
 */
async function propagateReviewSignal(params: {
  organizationId: number;
  projectId: number;
  userId: number;
  activityType: string;
  entityType: string;
  entityId: string;
  description: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.insert(projectActivities).values({
      organizationId: params.organizationId,
      projectId: params.projectId,
      userId: params.userId,
      activityType: params.activityType,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
      details: params.details || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (err) {
    // Non-fatal: log but don't block the primary operation
    logger.warn('Failed to propagate review signal to PM layer', { error: (err as Error).message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW THREADS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-threads
 * List all review threads for an artifact (all versions), optionally filtered by status.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/review-threads',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const statusFilter = req.query.status as string | undefined;
      const conditions = [
        eq(concept2cureReviewThreads.artifactId, artifact.id),
        eq(concept2cureReviewThreads.orgId, organizationId),
      ];
      if (statusFilter && ['open', 'resolved'].includes(statusFilter)) {
        conditions.push(eq(concept2cureReviewThreads.status, statusFilter));
      }

      const threads = await db
        .select()
        .from(concept2cureReviewThreads)
        .where(and(...conditions))
        .orderBy(desc(concept2cureReviewThreads.createdAt));

      // Get comment counts per thread
      const threadIds = threads.map(t => t.id);
      const commentCounts = new Map<number, number>();
      if (threadIds.length > 0) {
        const counts = await db
          .select({
            threadId: concept2cureThreadComments.threadId,
            count: sql<number>`count(*)::int`,
          })
          .from(concept2cureThreadComments)
          .where(
            and(
              inArray(concept2cureThreadComments.threadId, threadIds),
              isNull(concept2cureThreadComments.deletedAt)
            )
          )
          .groupBy(concept2cureThreadComments.threadId);
        for (const c of counts) {
          commentCounts.set(c.threadId, c.count);
        }
      }

      return sendSuccess(res, {
        artifactId: paramStr(req.params.artifactId),
        totalThreads: threads.length,
        threads: threads.map(t => ({
          threadId: t.threadId,
          title: t.title,
          status: t.status,
          priority: t.priority,
          anchorType: t.anchorType,
          anchorKey: t.anchorKey,
          anchorLabel: t.anchorLabel,
          versionId: t.versionId,
          createdById: t.createdById,
          createdByName: t.createdByName,
          createdByRole: t.createdByRole,
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName,
          commentCount: commentCounts.get(t.id) || 0,
          resolvedAt: t.resolvedAt,
          resolvedByName: t.resolvedByName,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list review threads', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list review threads');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-threads
 * Create a new review thread on an artifact.
 * Body: { title, anchorType?, anchorKey?, anchorLabel?, versionId?, priority?, assigneeId?, initialComment? }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/review-threads',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const perms = getThreadPermissions(userRole);
      if (!perms.has('comment')) {
        return sendError(res, 403, 'Your role does not permit creating threads');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const projectDbId = parseInt(paramStr(req.params.projectId), 10);
      if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const {
        title,
        anchorType,
        anchorKey,
        anchorLabel,
        versionId,
        priority,
        assigneeId,
        initialComment,
      } = req.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title is required');
      }
      if (title.length > 500) return sendError(res, 400, 'title must not exceed 500 characters');

      // Validate anchorType
      const validAnchors = ['section', 'heading', 'range', 'general'];
      if (anchorType && !validAnchors.includes(anchorType)) {
        return sendError(res, 400, `anchorType must be one of: ${validAnchors.join(', ')}`);
      }

      // Validate priority
      const validPriorities = ['low', 'medium', 'high'];
      if (priority && !validPriorities.includes(priority)) {
        return sendError(res, 400, `priority must be one of: ${validPriorities.join(', ')}`);
      }

      // Resolve assignee name if assigneeId is provided
      let resolvedAssigneeName: string | null = null;
      if (assigneeId) {
        if (!perms.has('assign')) {
          return sendError(res, 403, 'Your role does not permit assigning threads');
        }
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assigneeId)))
          .limit(1);
        resolvedAssigneeName = assignee?.name || null;
      }

      const threadIdStr = `thr_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const actorName = (req as any).userName || req.userEmail || 'unknown';

      const [thread] = await db
        .insert(concept2cureReviewThreads)
        .values({
          threadId: threadIdStr,
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          versionId: versionId ? Number(versionId) : null,
          createdById: userId,
          createdByName: actorName,
          createdByRole: userRole,
          title: sanitizeContent(title.trim()),
          anchorType: anchorType || null,
          anchorKey: anchorKey ? sanitizeContent(anchorKey) : null,
          anchorLabel: anchorLabel ? sanitizeContent(anchorLabel) : null,
          status: 'open',
          priority: priority || null,
          assigneeId: assigneeId ? Number(assigneeId) : null,
          assigneeName: resolvedAssigneeName,
        })
        .returning();

      // Create initial comment if provided
      let comment = null;
      if (
        initialComment &&
        typeof initialComment === 'string' &&
        initialComment.trim().length > 0
      ) {
        if (initialComment.length > 10000) {
          return sendError(res, 400, 'initialComment must not exceed 10000 characters');
        }
        const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const [inserted] = await db
          .insert(concept2cureThreadComments)
          .values({
            commentId: commentIdStr,
            orgId: organizationId,
            threadId: thread.id,
            artifactId: artifact.id,
            versionId: versionId ? Number(versionId) : null,
            authorId: userId,
            authorName: actorName,
            authorRole: userRole,
            body: sanitizeContent(initialComment.trim()),
            kind: 'comment',
          })
          .returning();
        comment = {
          commentId: inserted.commentId,
          authorId: inserted.authorId,
          authorName: inserted.authorName,
          body: inserted.body,
          kind: inserted.kind,
          createdAt: inserted.createdAt,
        };
      }

      // Provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'thread_created',
        sourceDescription: `Review thread created: "${title.trim()}"`,
        actorId: userId,
        actorName,
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/review-threads`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { threadId: threadIdStr, title: title.trim(), anchorType, anchorKey },
      });

      // ── PM propagation: surface thread in project activity feed ──
      await propagateReviewSignal({
        organizationId,
        projectId: projectDbId,
        userId,
        activityType: 'review_thread_created',
        entityType: 'review_thread',
        entityId: threadIdStr,
        description: `Review thread opened on "${artifact.title}": ${title.trim()}`,
        details: {
          threadId: threadIdStr,
          artifactId: paramStr(req.params.artifactId),
          artifactTitle: artifact.title,
          priority: priority || null,
          assigneeId: assigneeId ? Number(assigneeId) : null,
          assigneeName: resolvedAssigneeName,
          anchorLabel: anchorLabel || null,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
      });

      // ── PM work item: project thread as open work ──
      await upsertProjectWorkItem({
        orgId: organizationId,
        projectId: projectDbId,
        sourceType: 'review_thread',
        sourceId: thread.id,
        artifactId: artifact.id,
        ctdSection: artifact.ctdSection || null,
        ownerId: assigneeId ? Number(assigneeId) : null,
        ownerName: resolvedAssigneeName,
        title: `Thread: ${title.trim()}`,
        status: 'open',
        priority: priority || null,
        dueAt: req.body.dueAt || null,
        blockerType: 'unresolved_review',
      });

      // ── Notification: assignment ──
      if (assigneeId && Number(assigneeId) !== userId) {
        await createNotification({
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          threadId: thread.id,
          recipientUserId: Number(assigneeId),
          recipientName: resolvedAssigneeName,
          actorUserId: userId,
          actorName: actorName,
          notificationType: 'assignment',
          title: `Assigned: "${title.trim()}"`,
          body: `${actorName} assigned you a review thread on "${artifact.title}".`,
          severity: priority === 'high' ? 'warning' : 'info',
          dueAt: req.body.dueAt || null,
        });
      }

      return sendSuccess(res, {
        threadId: thread.threadId,
        title: thread.title,
        status: thread.status,
        priority: thread.priority,
        anchorType: thread.anchorType,
        anchorKey: thread.anchorKey,
        anchorLabel: thread.anchorLabel,
        versionId: thread.versionId,
        createdById: thread.createdById,
        createdByName: thread.createdByName,
        assigneeId: thread.assigneeId,
        assigneeName: thread.assigneeName,
        createdAt: thread.createdAt,
        initialComment: comment,
      });
    } catch (error: any) {
      logConcept2cureError('create review thread', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to create review thread');
    }
  }
);

/**
 * PATCH /api/concept2cure/review-threads/:threadId
 * Update thread metadata (title, priority, assignee).
 */
router.patch('/review-threads/:threadId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, paramStr(req.params.threadId)),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');

    const updates: Record<string, any> = { updatedAt: new Date() };
    const { title, priority, assigneeId } = req.body;

    if (title !== undefined) {
      if (!perms.has('comment')) return sendError(res, 403, 'Cannot edit thread');
      if (typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title cannot be empty');
      }
      if (title.length > 500) return sendError(res, 400, 'title must not exceed 500 characters');
      updates.title = sanitizeContent(title.trim());
    }

    if (priority !== undefined) {
      const validPriorities = ['low', 'medium', 'high'];
      if (priority !== null && !validPriorities.includes(priority)) {
        return sendError(
          res,
          400,
          `priority must be one of: ${validPriorities.join(', ')} or null`
        );
      }
      updates.priority = priority;
    }

    if (assigneeId !== undefined) {
      if (!perms.has('assign')) return sendError(res, 403, 'Your role cannot reassign threads');
      if (assigneeId === null) {
        updates.assigneeId = null;
        updates.assigneeName = null;
      } else {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assigneeId)))
          .limit(1);
        updates.assigneeId = Number(assigneeId);
        updates.assigneeName = assignee?.name || null;
      }
    }

    await db
      .update(concept2cureReviewThreads)
      .set(updates)
      .where(eq(concept2cureReviewThreads.id, thread.id));

    return sendSuccess(res, { threadId: thread.threadId, ...updates });
  } catch (error: any) {
    logConcept2cureError('update review thread', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to update thread');
  }
});

/**
 * POST /api/concept2cure/review-threads/:threadId/resolve
 * Resolve a thread.
 */
router.post('/review-threads/:threadId/resolve', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);
    if (!perms.has('resolve')) {
      return sendError(res, 403, 'Your role cannot resolve threads');
    }

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, paramStr(req.params.threadId)),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');
    if (thread.status === 'resolved') return sendError(res, 400, 'Thread is already resolved');

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const now = new Date();

    await db
      .update(concept2cureReviewThreads)
      .set({
        status: 'resolved',
        resolvedAt: now,
        resolvedById: userId,
        resolvedByName: actorName,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewThreads.id, thread.id));

    // System comment
    const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureThreadComments).values({
      commentId: commentIdStr,
      orgId: organizationId,
      threadId: thread.id,
      artifactId: thread.artifactId,
      authorId: userId,
      authorName: actorName,
      authorRole: userRole,
      body: `Thread resolved by ${actorName}`,
      kind: 'system',
    });

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: thread.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'thread_resolved',
      sourceDescription: `Thread "${thread.title}" resolved`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      backendRoute: `/review-threads/${req.params.threadId}/resolve`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { threadId: thread.threadId },
    });

    // ── PM propagation: thread resolved ──
    await propagateReviewSignal({
      organizationId,
      projectId: thread.projectId,
      userId,
      activityType: 'review_thread_resolved',
      entityType: 'review_thread',
      entityId: thread.threadId,
      description: `Review thread resolved: "${thread.title}"`,
      details: { threadId: thread.threadId, artifactId: thread.artifactId },
      ipAddress: getClientIp(req),
    });

    // ── PM work item: close linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: thread.projectId,
      sourceType: 'review_thread',
      sourceId: thread.id,
      title: `Thread: ${thread.title}`,
      status: 'resolved',
    });

    // ── Suppress stale notifications ──
    await suppressNotificationsForSource({ threadId: thread.id });

    // ── Notify thread creator / assignee ──
    if (thread.createdById && thread.createdById !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.createdById,
        recipientName: thread.createdByName,
        actorUserId: userId,
        actorName,
        notificationType: 'thread_resolved',
        title: `Resolved: "${thread.title}"`,
        body: `${actorName} resolved the review thread "${thread.title}".`,
      });
    }

    return sendSuccess(res, {
      threadId: thread.threadId,
      status: 'resolved',
      resolvedAt: now,
      resolvedByName: actorName,
    });
  } catch (error: any) {
    logConcept2cureError('resolve thread', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to resolve thread');
  }
});

/**
 * POST /api/concept2cure/review-threads/:threadId/reopen
 * Reopen a resolved thread.
 */
router.post('/review-threads/:threadId/reopen', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);
    if (!perms.has('resolve')) {
      return sendError(res, 403, 'Your role cannot reopen threads');
    }

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, paramStr(req.params.threadId)),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');
    if (thread.status === 'open') return sendError(res, 400, 'Thread is already open');

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const now = new Date();

    await db
      .update(concept2cureReviewThreads)
      .set({
        status: 'open',
        resolvedAt: null,
        resolvedById: null,
        resolvedByName: null,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewThreads.id, thread.id));

    // System comment
    const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureThreadComments).values({
      commentId: commentIdStr,
      orgId: organizationId,
      threadId: thread.id,
      artifactId: thread.artifactId,
      authorId: userId,
      authorName: actorName,
      authorRole: userRole,
      body: `Thread reopened by ${actorName}`,
      kind: 'system',
    });

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: thread.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'thread_reopened',
      sourceDescription: `Thread "${thread.title}" reopened`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      backendRoute: `/review-threads/${req.params.threadId}/reopen`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { threadId: thread.threadId },
    });

    // ── PM propagation: thread reopened ──
    await propagateReviewSignal({
      organizationId,
      projectId: thread.projectId,
      userId,
      activityType: 'review_thread_reopened',
      entityType: 'review_thread',
      entityId: thread.threadId,
      description: `Review thread reopened: "${thread.title}"`,
      details: { threadId: thread.threadId, artifactId: thread.artifactId },
      ipAddress: getClientIp(req),
    });

    // ── PM work item: reopen linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: thread.projectId,
      sourceType: 'review_thread',
      sourceId: thread.id,
      artifactId: thread.artifactId,
      title: `Thread: ${thread.title}`,
      status: 'open',
      priority: thread.priority || null,
      blockerType: 'unresolved_review',
    });

    // ── Notify assignee that thread was reopened ──
    if (thread.assigneeId && thread.assigneeId !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.assigneeId,
        recipientName: thread.assigneeName,
        actorUserId: userId,
        actorName,
        notificationType: 'assignment',
        title: `Reopened: "${thread.title}"`,
        body: `${actorName} reopened the review thread "${thread.title}".`,
        severity: 'warning',
      });
    }

    return sendSuccess(res, {
      threadId: thread.threadId,
      status: 'open',
      reopenedAt: now,
    });
  } catch (error: any) {
    logConcept2cureError('reopen thread', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to reopen thread');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// THREAD COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/review-threads/:threadId/comments
 * List all comments in a thread, newest first.
 */
router.get('/review-threads/:threadId/comments', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, paramStr(req.params.threadId)),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');

    const comments = await db
      .select()
      .from(concept2cureThreadComments)
      .where(
        and(
          eq(concept2cureThreadComments.threadId, thread.id),
          isNull(concept2cureThreadComments.deletedAt)
        )
      )
      .orderBy(concept2cureThreadComments.createdAt);

    return sendSuccess(res, {
      threadId: thread.threadId,
      totalComments: comments.length,
      comments: comments.map(c => ({
        commentId: c.commentId,
        authorId: c.authorId,
        authorName: c.authorName,
        authorRole: c.authorRole,
        body: c.body,
        kind: c.kind,
        parentCommentId: c.parentCommentId,
        versionId: c.versionId,
        createdAt: c.createdAt,
        editedAt: c.editedAt,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('list thread comments', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to list comments');
  }
});

/**
 * POST /api/concept2cure/review-threads/:threadId/comments
 * Add a comment to a thread.
 * Body: { body, kind?, parentCommentId?, versionId? }
 */
router.post('/review-threads/:threadId/comments', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const { body, kind, parentCommentId, versionId } = req.body;

    // Permission check based on kind
    const commentKind = kind || 'comment';
    if (commentKind === 'request_changes' && !perms.has('request_changes')) {
      return sendError(res, 403, 'Your role cannot request changes');
    }
    if (commentKind === 'comment' && !perms.has('comment')) {
      return sendError(res, 403, 'Your role does not permit commenting');
    }

    const validKinds = ['comment', 'request_changes'];
    if (!validKinds.includes(commentKind)) {
      return sendError(res, 400, `kind must be one of: ${validKinds.join(', ')}`);
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return sendError(res, 400, 'body is required');
    }
    if (body.length > 10000) return sendError(res, 400, 'body must not exceed 10000 characters');

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, paramStr(req.params.threadId)),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    const [inserted] = await db
      .insert(concept2cureThreadComments)
      .values({
        commentId: commentIdStr,
        orgId: organizationId,
        threadId: thread.id,
        artifactId: thread.artifactId,
        versionId: versionId ? Number(versionId) : null,
        parentCommentId: parentCommentId ? Number(parentCommentId) : null,
        authorId: userId,
        authorName: actorName,
        authorRole: userRole,
        body: sanitizeContent(body.trim()),
        kind: commentKind,
      })
      .returning();

    // Update thread's updatedAt
    await db
      .update(concept2cureReviewThreads)
      .set({ updatedAt: new Date() })
      .where(eq(concept2cureReviewThreads.id, thread.id));

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: thread.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: commentKind === 'request_changes' ? 'change_requested' : 'comment_added',
      sourceDescription: `Comment added to thread "${thread.title}"`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      backendRoute: `/review-threads/${req.params.threadId}/comments`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { threadId: thread.threadId, commentId: commentIdStr, kind: commentKind },
    });

    // ── Notification: reply to thread assignee / creator ──
    const notifyTargets = new Set<number>();
    if (thread.assigneeId && thread.assigneeId !== userId) notifyTargets.add(thread.assigneeId);
    if (thread.createdById && thread.createdById !== userId) notifyTargets.add(thread.createdById);

    for (const targetId of notifyTargets) {
      if (commentKind === 'request_changes') {
        await createNotification({
          orgId: organizationId,
          projectId: thread.projectId,
          artifactId: thread.artifactId,
          threadId: thread.id,
          recipientUserId: targetId,
          actorUserId: userId,
          actorName,
          notificationType: 'changes_requested',
          title: `Changes requested: "${thread.title}"`,
          body: `${actorName} requested changes on thread "${thread.title}".`,
          severity: 'warning',
        });
      } else {
        await createNotification({
          orgId: organizationId,
          projectId: thread.projectId,
          artifactId: thread.artifactId,
          threadId: thread.id,
          recipientUserId: targetId,
          actorUserId: userId,
          actorName,
          notificationType: 'thread_reply',
          title: `Reply: "${thread.title}"`,
          body: `${actorName} replied to thread "${thread.title}".`,
        });
      }
    }

    // ── PM work item: if request_changes, create/update blocker ──
    if (commentKind === 'request_changes') {
      await upsertProjectWorkItem({
        orgId: organizationId,
        projectId: thread.projectId,
        sourceType: 'requested_changes',
        sourceId: thread.id,
        artifactId: thread.artifactId,
        title: `Changes requested: ${thread.title}`,
        status: 'open',
        priority: thread.priority || 'medium',
        blockerType: 'requested_changes',
        ownerId: thread.assigneeId || thread.createdById,
        ownerName: thread.assigneeName || thread.createdByName,
      });
    }

    return sendSuccess(res, {
      commentId: inserted.commentId,
      threadId: thread.threadId,
      authorId: inserted.authorId,
      authorName: inserted.authorName,
      authorRole: inserted.authorRole,
      body: inserted.body,
      kind: inserted.kind,
      parentCommentId: inserted.parentCommentId,
      versionId: inserted.versionId,
      createdAt: inserted.createdAt,
    });
  } catch (error: any) {
    logConcept2cureError('add thread comment', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to add comment');
  }
});

/**
 * PATCH /api/concept2cure/review-comments/:commentId
 * Edit a comment's body. Only the author can edit, and only non-system comments.
 */
router.patch('/review-comments/:commentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const [comment] = await db
      .select()
      .from(concept2cureThreadComments)
      .where(
        and(
          eq(concept2cureThreadComments.commentId, paramStr(req.params.commentId)),
          eq(concept2cureThreadComments.orgId, organizationId),
          isNull(concept2cureThreadComments.deletedAt)
        )
      )
      .limit(1);

    if (!comment) return sendError(res, 404, 'Comment not found');
    if (comment.authorId !== userId) {
      return sendError(res, 403, 'Only the comment author can edit');
    }
    if (comment.kind === 'system') {
      return sendError(res, 400, 'System comments cannot be edited');
    }

    const { body } = req.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return sendError(res, 400, 'body is required');
    }
    if (body.length > 10000) return sendError(res, 400, 'body must not exceed 10000 characters');

    const now = new Date();
    await db
      .update(concept2cureThreadComments)
      .set({
        body: sanitizeContent(body.trim()),
        editedAt: now,
        updatedAt: now,
      })
      .where(eq(concept2cureThreadComments.id, comment.id));

    return sendSuccess(res, {
      commentId: comment.commentId,
      body: sanitizeContent(body.trim()),
      editedAt: now,
    });
  } catch (error: any) {
    logConcept2cureError('edit comment', error, { commentId: req.params.commentId });
    return sendError(res, 500, 'Failed to edit comment');
  }
});

/**
 * DELETE /api/concept2cure/review-comments/:commentId
 * Soft-delete a comment. Only author or admin can delete.
 */
router.delete('/review-comments/:commentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();

    const [comment] = await db
      .select()
      .from(concept2cureThreadComments)
      .where(
        and(
          eq(concept2cureThreadComments.commentId, paramStr(req.params.commentId)),
          eq(concept2cureThreadComments.orgId, organizationId),
          isNull(concept2cureThreadComments.deletedAt)
        )
      )
      .limit(1);

    if (!comment) return sendError(res, 404, 'Comment not found');
    if (comment.kind === 'system') {
      return sendError(res, 400, 'System comments cannot be deleted');
    }
    if (comment.authorId !== userId && userRole !== 'admin') {
      return sendError(res, 403, 'Only the comment author or admin can delete');
    }

    await db
      .update(concept2cureThreadComments)
      .set({ deletedAt: new Date() })
      .where(eq(concept2cureThreadComments.id, comment.id));

    return sendSuccess(res, { commentId: comment.commentId, deleted: true });
  } catch (error: any) {
    logConcept2cureError('delete comment', error, { commentId: req.params.commentId });
    return sendError(res, 500, 'Failed to delete comment');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW TASKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-tasks
 * List review tasks for an artifact.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/review-tasks',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const statusFilter = req.query.status as string | undefined;
      const conditions = [
        eq(concept2cureReviewTasks.artifactId, artifact.id),
        eq(concept2cureReviewTasks.orgId, organizationId),
      ];
      if (statusFilter && ['open', 'in_progress', 'resolved', 'closed'].includes(statusFilter)) {
        conditions.push(eq(concept2cureReviewTasks.status, statusFilter));
      }

      const tasks = await db
        .select()
        .from(concept2cureReviewTasks)
        .where(and(...conditions))
        .orderBy(desc(concept2cureReviewTasks.createdAt));

      return sendSuccess(res, {
        artifactId: paramStr(req.params.artifactId),
        totalTasks: tasks.length,
        tasks: tasks.map(t => ({
          taskId: t.taskId,
          title: t.title,
          description: t.description,
          taskType: t.taskType,
          status: t.status,
          createdById: t.createdById,
          createdByName: t.createdByName,
          assignedToId: t.assignedToId,
          assignedToName: t.assignedToName,
          threadId: t.threadId,
          versionId: t.versionId,
          dueAt: t.dueAt,
          resolvedAt: t.resolvedAt,
          resolvedByName: t.resolvedByName,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list review tasks', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list review tasks');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-tasks
 * Create a review task on an artifact.
 * Body: { title, description?, taskType?, assignedToId?, threadId?, versionId?, dueAt? }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/review-tasks',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const perms = getThreadPermissions(userRole);
      if (!perms.has('request_changes')) {
        return sendError(res, 403, 'Your role does not permit creating tasks');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const projectDbId = parseInt(paramStr(req.params.projectId), 10);
      if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const { title, description, taskType, assignedToId, threadId, versionId, dueAt } = req.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title is required');
      }
      if (title.length > 500) return sendError(res, 400, 'title must not exceed 500 characters');

      const validTypes = ['change_request', 'follow_up', 'review_task'];
      const resolvedType = taskType || 'review_task';
      if (!validTypes.includes(resolvedType)) {
        return sendError(res, 400, `taskType must be one of: ${validTypes.join(', ')}`);
      }

      // Resolve assignee name
      let resolvedAssigneeName: string | null = null;
      if (assignedToId) {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assignedToId)))
          .limit(1);
        resolvedAssigneeName = assignee?.name || null;
      }

      // Validate threadId if provided
      let resolvedThreadDbId: number | null = null;
      if (threadId) {
        const [thr] = await db
          .select({ id: concept2cureReviewThreads.id })
          .from(concept2cureReviewThreads)
          .where(
            and(
              eq(concept2cureReviewThreads.threadId, threadId),
              eq(concept2cureReviewThreads.orgId, organizationId)
            )
          )
          .limit(1);
        if (!thr) return sendError(res, 400, 'Thread not found');
        resolvedThreadDbId = thr.id;
      }

      const taskIdStr = `task_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const actorName = (req as any).userName || req.userEmail || 'unknown';

      const [inserted] = await db
        .insert(concept2cureReviewTasks)
        .values({
          taskId: taskIdStr,
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          versionId: versionId ? Number(versionId) : null,
          threadId: resolvedThreadDbId,
          createdById: userId,
          createdByName: actorName,
          assignedToId: assignedToId ? Number(assignedToId) : null,
          assignedToName: resolvedAssigneeName,
          title: sanitizeContent(title.trim()),
          description: description ? sanitizeContent(description.trim()) : null,
          taskType: resolvedType,
          status: 'open',
          dueAt: dueAt ? new Date(dueAt) : null,
        })
        .returning();

      // Provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'task_created',
        sourceDescription: `Task created: "${title.trim()}"`,
        actorId: userId,
        actorName,
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/review-tasks`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { taskId: taskIdStr, title: title.trim(), taskType: resolvedType },
      });

      // ── PM propagation: task created ──
      await propagateReviewSignal({
        organizationId,
        projectId: projectDbId,
        userId,
        activityType: 'review_task_created',
        entityType: 'review_task',
        entityId: taskIdStr,
        description: `Review task created on "${artifact.title}": ${title.trim()}`,
        details: {
          taskId: taskIdStr,
          artifactId: paramStr(req.params.artifactId),
          artifactTitle: artifact.title,
          taskType: resolvedType,
          dueAt: dueAt || null,
          assignedToId: assignedToId ? Number(assignedToId) : null,
          assignedToName: resolvedAssigneeName,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
      });

      // ── PM work item: project task as open work ──
      await upsertProjectWorkItem({
        orgId: organizationId,
        projectId: projectDbId,
        sourceType: 'review_task',
        sourceId: inserted.id,
        artifactId: artifact.id,
        ctdSection: artifact.ctdSection || null,
        ownerId: assignedToId ? Number(assignedToId) : null,
        ownerName: resolvedAssigneeName,
        title: `Task: ${title.trim()}`,
        status: 'open',
        priority: req.body.priority || null,
        dueAt: dueAt || null,
        blockerType:
          resolvedType === 'change_request'
            ? 'requested_changes'
            : resolvedType === 'approval_task'
            ? 'approval_pending'
            : 'unresolved_review',
      });

      // ── Notification: assignment ──
      if (assignedToId && Number(assignedToId) !== userId) {
        await createNotification({
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          reviewTaskId: inserted.id,
          recipientUserId: Number(assignedToId),
          recipientName: resolvedAssigneeName,
          actorUserId: userId,
          actorName,
          notificationType: resolvedType === 'approval_task' ? 'approval_needed' : 'assignment',
          title:
            resolvedType === 'approval_task'
              ? `Approval needed: "${title.trim()}"`
              : `Assigned: "${title.trim()}"`,
          body: `${actorName} assigned you a ${resolvedType.replace('_', ' ')} on "${
            artifact.title
          }".`,
          severity: resolvedType === 'change_request' ? 'warning' : 'info',
          dueAt: dueAt || null,
        });
      }

      return sendSuccess(res, {
        taskId: inserted.taskId,
        title: inserted.title,
        description: inserted.description,
        taskType: inserted.taskType,
        status: inserted.status,
        assignedToId: inserted.assignedToId,
        assignedToName: inserted.assignedToName,
        createdById: inserted.createdById,
        createdByName: inserted.createdByName,
        threadId: threadId || null,
        versionId: inserted.versionId,
        dueAt: inserted.dueAt,
        createdAt: inserted.createdAt,
      });
    } catch (error: any) {
      logConcept2cureError('create review task', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to create review task');
    }
  }
);

/**
 * PATCH /api/concept2cure/review-tasks/:taskId
 * Update task metadata (title, description, assignee, status, dueAt).
 */
router.patch('/review-tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const [task] = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.taskId, paramStr(req.params.taskId)),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1);

    if (!task) return sendError(res, 404, 'Task not found');

    if (!perms.has('request_changes') && task.assignedToId !== userId) {
      return sendError(
        res,
        403,
        'You can only update tasks assigned to you or with reviewer+ role'
      );
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    const { title, description, assignedToId, status, dueAt } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title cannot be empty');
      }
      updates.title = sanitizeContent(title.trim());
    }

    if (description !== undefined) {
      updates.description = description ? sanitizeContent(description.trim()) : null;
    }

    if (assignedToId !== undefined) {
      if (assignedToId === null) {
        updates.assignedToId = null;
        updates.assignedToName = null;
      } else {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assignedToId)))
          .limit(1);
        updates.assignedToId = Number(assignedToId);
        updates.assignedToName = assignee?.name || null;
      }
    }

    if (status !== undefined) {
      const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) {
        return sendError(res, 400, `status must be one of: ${validStatuses.join(', ')}`);
      }
      updates.status = status;
    }

    if (dueAt !== undefined) {
      updates.dueAt = dueAt ? new Date(dueAt) : null;
    }

    await db
      .update(concept2cureReviewTasks)
      .set(updates)
      .where(eq(concept2cureReviewTasks.id, task.id));

    return sendSuccess(res, { taskId: task.taskId, ...updates });
  } catch (error: any) {
    logConcept2cureError('update review task', error, { taskId: req.params.taskId });
    return sendError(res, 500, 'Failed to update task');
  }
});

/**
 * POST /api/concept2cure/review-tasks/:taskId/resolve
 * Resolve a task.
 */
router.post('/review-tasks/:taskId/resolve', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const [task] = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.taskId, paramStr(req.params.taskId)),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1);

    if (!task) return sendError(res, 404, 'Task not found');
    if (task.status === 'resolved' || task.status === 'closed') {
      return sendError(res, 400, `Task is already ${task.status}`);
    }

    if (!perms.has('resolve') && task.assignedToId !== userId) {
      return sendError(res, 403, 'Only the assignee or reviewer+ can resolve tasks');
    }

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const now = new Date();

    await db
      .update(concept2cureReviewTasks)
      .set({
        status: 'resolved',
        resolvedAt: now,
        resolvedById: userId,
        resolvedByName: actorName,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewTasks.id, task.id));

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: task.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'task_resolved',
      sourceDescription: `Task "${task.title}" resolved`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      backendRoute: `/review-tasks/${req.params.taskId}/resolve`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { taskId: task.taskId },
    });

    // ── PM propagation: task resolved ──
    await propagateReviewSignal({
      organizationId,
      projectId: task.projectId,
      userId,
      activityType: 'review_task_resolved',
      entityType: 'review_task',
      entityId: task.taskId,
      description: `Review task resolved: "${task.title}"`,
      details: { taskId: task.taskId, artifactId: task.artifactId },
      ipAddress: getClientIp(req),
    });

    // ── PM work item: close linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: task.projectId,
      sourceType: 'review_task',
      sourceId: task.id,
      title: `Task: ${task.title}`,
      status: 'resolved',
    });

    // ── Suppress stale notifications ──
    await suppressNotificationsForSource({ reviewTaskId: task.id });

    // ── Notify task creator ──
    if (task.createdById && task.createdById !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.createdById,
        recipientName: task.createdByName,
        actorUserId: userId,
        actorName,
        notificationType: 'task_resolved',
        title: `Resolved: "${task.title}"`,
        body: `${actorName} resolved the review task "${task.title}".`,
      });
    }

    return sendSuccess(res, {
      taskId: task.taskId,
      status: 'resolved',
      resolvedAt: now,
      resolvedByName: actorName,
    });
  } catch (error: any) {
    logConcept2cureError('resolve task', error, { taskId: req.params.taskId });
    return sendError(res, 500, 'Failed to resolve task');
  }
});

/**
 * POST /api/concept2cure/review-tasks/:taskId/reopen
 * Reopen a resolved/closed task.
 */
router.post('/review-tasks/:taskId/reopen', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);
    if (!perms.has('resolve')) {
      return sendError(res, 403, 'Your role cannot reopen tasks');
    }

    const [task] = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.taskId, paramStr(req.params.taskId)),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1);

    if (!task) return sendError(res, 404, 'Task not found');
    if (task.status === 'open' || task.status === 'in_progress') {
      return sendError(res, 400, `Task is already ${task.status}`);
    }

    const now = new Date();
    await db
      .update(concept2cureReviewTasks)
      .set({
        status: 'open',
        resolvedAt: null,
        resolvedById: null,
        resolvedByName: null,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewTasks.id, task.id));

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: task.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'task_reopened',
      sourceDescription: `Task "${task.title}" reopened`,
      actorId: userId,
      actorName: (req as any).userName || req.userEmail || 'unknown',
      actorEmail: req.userEmail || 'unknown',
      backendRoute: `/review-tasks/${req.params.taskId}/reopen`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { taskId: task.taskId },
    });

    const actorName = (req as any).userName || req.userEmail || 'unknown';

    // ── PM work item: reopen linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: task.projectId,
      sourceType: 'review_task',
      sourceId: task.id,
      artifactId: task.artifactId,
      title: `Task: ${task.title}`,
      status: 'open',
      priority: task.priority || null,
      dueAt: task.dueAt || null,
      blockerType: task.taskType === 'change_request' ? 'requested_changes' : 'unresolved_review',
    });

    // ── Notify assignee that task was reopened ──
    if (task.assignedToId && task.assignedToId !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.assignedToId,
        recipientName: task.assignedToName,
        actorUserId: userId,
        actorName,
        notificationType: 'assignment',
        title: `Reopened: "${task.title}"`,
        body: `${actorName} reopened the review task "${task.title}".`,
        severity: 'warning',
      });
    }

    return sendSuccess(res, {
      taskId: task.taskId,
      status: 'open',
      reopenedAt: now,
    });
  } catch (error: any) {
    logConcept2cureError('reopen task', error, { taskId: req.params.taskId });
    return sendError(res, 500, 'Failed to reopen task');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW QUEUES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/reviews/my-queue
 * Returns all open threads, tasks assigned to the current user across all artifacts.
 */
router.get('/reviews/my-queue', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    // Threads assigned to me that are open
    const myThreads = await db
      .select({
        threadId: concept2cureReviewThreads.threadId,
        title: concept2cureReviewThreads.title,
        status: concept2cureReviewThreads.status,
        priority: concept2cureReviewThreads.priority,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        projectId: concept2cureReviewThreads.projectId,
        anchorLabel: concept2cureReviewThreads.anchorLabel,
        createdByName: concept2cureReviewThreads.createdByName,
        createdAt: concept2cureReviewThreads.createdAt,
        updatedAt: concept2cureReviewThreads.updatedAt,
      })
      .from(concept2cureReviewThreads)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewThreads.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewThreads.assigneeId, userId),
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open')
        )
      )
      .orderBy(desc(concept2cureReviewThreads.updatedAt));

    // Tasks assigned to me that are open/in_progress
    const myTasks = await db
      .select({
        taskId: concept2cureReviewTasks.taskId,
        title: concept2cureReviewTasks.title,
        description: concept2cureReviewTasks.description,
        taskType: concept2cureReviewTasks.taskType,
        status: concept2cureReviewTasks.status,
        dueAt: concept2cureReviewTasks.dueAt,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        projectId: concept2cureReviewTasks.projectId,
        createdByName: concept2cureReviewTasks.createdByName,
        createdAt: concept2cureReviewTasks.createdAt,
        updatedAt: concept2cureReviewTasks.updatedAt,
      })
      .from(concept2cureReviewTasks)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewTasks.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewTasks.assignedToId, userId),
          eq(concept2cureReviewTasks.orgId, organizationId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress'])
        )
      )
      .orderBy(concept2cureReviewTasks.dueAt, desc(concept2cureReviewTasks.updatedAt));

    // Unread notifications for current user
    const [unreadCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    const now = new Date();
    const overdueTasks = myTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);
    const dueSoonTasks = myTasks.filter(t => {
      if (!t.dueAt) return false;
      const d = new Date(t.dueAt);
      return d >= now && d <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
    });
    const changeRequestTasks = myTasks.filter(t => t.taskType === 'change_request');
    const approvalTasks = myTasks.filter(t => t.taskType === 'approval_task');

    // Tell the client what this caller may actually do, so it can stop
    // rendering governed actions that the server will refuse. Resolve and
    // request-changes are role-gated (getThreadPermissions), and my-queue
    // deliberately contains threads ASSIGNED to the caller — an admin can
    // assign a thread to an author, who would then see a Resolve button that
    // 403s every time. Deriving this from the same function the enforcement
    // uses means the button and the guard cannot drift apart.
    const perms = getThreadPermissions(String((req as any).userRole || ''));

    return sendSuccess(res, {
      threads: myThreads,
      tasks: myTasks,
      totalThreads: myThreads.length,
      totalTasks: myTasks.length,
      unreadNotifications: unreadCount?.count || 0,
      overdueTasks: overdueTasks.length,
      dueSoonTasks: dueSoonTasks.length,
      changeRequests: changeRequestTasks.length,
      approvalsNeeded: approvalTasks.length,
      permissions: {
        canComment: perms.has('comment'),
        canRequestChanges: perms.has('request_changes'),
        canResolve: perms.has('resolve'),
      },
    });
  } catch (error: any) {
    logConcept2cureError('my review queue', error);
    return sendError(res, 500, 'Failed to fetch review queue');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/reviews/project-queue
 * Returns all open threads and tasks for a project, for admin/project-level overview.
 */
router.get('/projects/:projectId/reviews/project-queue', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // All open threads in project
    const projectThreads = await db
      .select({
        threadId: concept2cureReviewThreads.threadId,
        title: concept2cureReviewThreads.title,
        status: concept2cureReviewThreads.status,
        priority: concept2cureReviewThreads.priority,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        anchorLabel: concept2cureReviewThreads.anchorLabel,
        assigneeId: concept2cureReviewThreads.assigneeId,
        assigneeName: concept2cureReviewThreads.assigneeName,
        createdByName: concept2cureReviewThreads.createdByName,
        createdAt: concept2cureReviewThreads.createdAt,
        updatedAt: concept2cureReviewThreads.updatedAt,
      })
      .from(concept2cureReviewThreads)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewThreads.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewThreads.projectId, projectDbId),
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open')
        )
      )
      .orderBy(desc(concept2cureReviewThreads.updatedAt))
      .limit(500);

    // All open/in_progress tasks in project
    const projectTasks = await db
      .select({
        taskId: concept2cureReviewTasks.taskId,
        title: concept2cureReviewTasks.title,
        description: concept2cureReviewTasks.description,
        taskType: concept2cureReviewTasks.taskType,
        status: concept2cureReviewTasks.status,
        dueAt: concept2cureReviewTasks.dueAt,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        assignedToId: concept2cureReviewTasks.assignedToId,
        assignedToName: concept2cureReviewTasks.assignedToName,
        createdByName: concept2cureReviewTasks.createdByName,
        createdAt: concept2cureReviewTasks.createdAt,
        updatedAt: concept2cureReviewTasks.updatedAt,
      })
      .from(concept2cureReviewTasks)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewTasks.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewTasks.projectId, projectDbId),
          eq(concept2cureReviewTasks.orgId, organizationId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress'])
        )
      )
      .orderBy(concept2cureReviewTasks.dueAt, desc(concept2cureReviewTasks.updatedAt))
      .limit(500);

    const now = new Date();
    const overdueProjectTasks = projectTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);

    // Escalated items count
    const [escalatedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.projectId, projectDbId),
          sql`${concept2cureNotifications.escalationLevel} >= 1`,
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    // Group by owner
    const ownerMap = new Map<string, { threads: number; tasks: number; overdue: number }>();
    for (const t of projectThreads) {
      const key = t.assigneeName || 'Unassigned';
      if (!ownerMap.has(key)) ownerMap.set(key, { threads: 0, tasks: 0, overdue: 0 });
      ownerMap.get(key)!.threads++;
    }
    for (const t of projectTasks) {
      const key = t.assignedToName || 'Unassigned';
      if (!ownerMap.has(key)) ownerMap.set(key, { threads: 0, tasks: 0, overdue: 0 });
      ownerMap.get(key)!.tasks++;
      if (t.dueAt && new Date(t.dueAt) < now) ownerMap.get(key)!.overdue++;
    }

    // Group by artifact
    const artifactMap = new Map<string, { title: string; threads: number; tasks: number }>();
    for (const t of projectThreads) {
      const key = t.artifactId;
      if (!artifactMap.has(key))
        artifactMap.set(key, { title: t.artifactTitle, threads: 0, tasks: 0 });
      artifactMap.get(key)!.threads++;
    }
    for (const t of projectTasks) {
      const key = t.artifactId;
      if (!artifactMap.has(key))
        artifactMap.set(key, { title: t.artifactTitle, threads: 0, tasks: 0 });
      artifactMap.get(key)!.tasks++;
    }

    return sendSuccess(res, {
      projectId: paramStr(req.params.projectId),
      threads: projectThreads,
      tasks: projectTasks,
      totalThreads: projectThreads.length,
      totalTasks: projectTasks.length,
      overdueTasks: overdueProjectTasks.length,
      escalatedItems: escalatedCount?.count || 0,
      byOwner: Array.from(ownerMap.entries()).map(([name, data]) => ({ name, ...data })),
      byArtifact: Array.from(artifactMap.entries()).map(([artifactId, data]) => ({
        artifactId,
        ...data,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('project review queue', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to fetch project review queue');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 13B — PM REVIEW PULSE (Orchestration & Visibility Layer)
// Documents first, projects second. The PM system reflects document
// review activity without replacing the governed document workflow.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/concept2cure/projects/:projectId/review-pulse
 *
 * Aggregated project-management signals derived from document-level review activity.
 * Returns:
 *   - summary counts (open threads, overdue tasks, unassigned, by priority)
 *   - per-artifact review readiness (which docs are clear vs. blocked)
 *   - recent activity feed (last N review events)
 *   - risk signals (overdue tasks, high-priority open threads, stale threads)
 *
 * This is the orchestration view — it tells PM dashboards what is happening
 * inside the document workspace without users ever leaving that workspace.
 */
router.get('/projects/:projectId/review-pulse', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const now = new Date();
    const staleDays = 7;
    const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

    // ── 1. Thread summary ────────────────────────────────────────────────
    const allThreads = await db
      .select({
        id: concept2cureReviewThreads.id,
        threadId: concept2cureReviewThreads.threadId,
        title: concept2cureReviewThreads.title,
        status: concept2cureReviewThreads.status,
        priority: concept2cureReviewThreads.priority,
        assigneeId: concept2cureReviewThreads.assigneeId,
        assigneeName: concept2cureReviewThreads.assigneeName,
        artifactId: concept2cureReviewThreads.artifactId,
        updatedAt: concept2cureReviewThreads.updatedAt,
        createdAt: concept2cureReviewThreads.createdAt,
      })
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.projectId, projectDbId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1000);

    const openThreads = allThreads.filter(t => t.status === 'open');
    const resolvedThreads = allThreads.filter(t => t.status === 'resolved');
    const highPriorityOpen = openThreads.filter(t => t.priority === 'high');
    const unassignedThreads = openThreads.filter(t => !t.assigneeId);
    const staleThreads = openThreads.filter(
      t => t.updatedAt && new Date(t.updatedAt) < staleThreshold
    );

    // ── 2. Task summary ─────────────────────────────────────────────────
    const allTasks = await db
      .select({
        id: concept2cureReviewTasks.id,
        taskId: concept2cureReviewTasks.taskId,
        title: concept2cureReviewTasks.title,
        status: concept2cureReviewTasks.status,
        taskType: concept2cureReviewTasks.taskType,
        dueAt: concept2cureReviewTasks.dueAt,
        assignedToId: concept2cureReviewTasks.assignedToId,
        assignedToName: concept2cureReviewTasks.assignedToName,
        artifactId: concept2cureReviewTasks.artifactId,
        createdAt: concept2cureReviewTasks.createdAt,
        updatedAt: concept2cureReviewTasks.updatedAt,
      })
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.projectId, projectDbId),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1000);

    const activeTasks = allTasks.filter(t => ['open', 'in_progress'].includes(t.status));
    const overdueTasks = activeTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);
    const changeRequests = activeTasks.filter(t => t.taskType === 'change_request');
    const unassignedTasks = activeTasks.filter(t => !t.assignedToId);

    // ── 3. Per-artifact readiness ────────────────────────────────────────
    const artifacts = await db
      .select({
        id: concept2cureArtifacts.id,
        artifactId: concept2cureArtifacts.artifactId,
        title: concept2cureArtifacts.title,
        ctdSection: concept2cureArtifacts.ctdSection,
        status: concept2cureArtifacts.status,
      })
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      )
      .limit(500);

    const artifactReadiness = artifacts.map(a => {
      const artThreads = openThreads.filter(t => t.artifactId === a.id);
      const artTasks = activeTasks.filter(t => t.artifactId === a.id);
      const artOverdue = overdueTasks.filter(t => t.artifactId === a.id);
      const artHighPriority = artThreads.filter(t => t.priority === 'high');
      const blocked = artHighPriority.length > 0 || artOverdue.length > 0;

      return {
        artifactId: a.artifactId,
        title: a.title,
        ctdSection: a.ctdSection,
        documentStatus: a.status,
        openThreads: artThreads.length,
        activeTasks: artTasks.length,
        overdueTasks: artOverdue.length,
        highPriorityThreads: artHighPriority.length,
        reviewStatus: blocked ? 'blocked' : artThreads.length > 0 ? 'in_review' : 'clear',
      };
    });

    // ── 4. Recent review activity (from projectActivities) ───────────────
    const recentActivity = await db
      .select()
      .from(projectActivities)
      .where(
        and(
          eq(projectActivities.projectId, projectDbId),
          eq(projectActivities.organizationId, organizationId),
          sql`${projectActivities.activityType} LIKE 'review_%'`
        )
      )
      .orderBy(desc(projectActivities.createdAt))
      .limit(20);

    // ── 5. Assignee workload ─────────────────────────────────────────────
    const assigneeMap = new Map<
      number,
      { name: string; threads: number; tasks: number; overdue: number }
    >();
    for (const t of openThreads) {
      if (t.assigneeId) {
        const entry = assigneeMap.get(t.assigneeId) || {
          name: t.assigneeName || 'Unknown',
          threads: 0,
          tasks: 0,
          overdue: 0,
        };
        entry.threads++;
        assigneeMap.set(t.assigneeId, entry);
      }
    }
    for (const t of activeTasks) {
      if (t.assignedToId) {
        const entry = assigneeMap.get(t.assignedToId) || {
          name: t.assignedToName || 'Unknown',
          threads: 0,
          tasks: 0,
          overdue: 0,
        };
        entry.tasks++;
        if (t.dueAt && new Date(t.dueAt) < now) entry.overdue++;
        assigneeMap.set(t.assignedToId, entry);
      }
    }

    // ── Risk signals ─────────────────────────────────────────────────────
    const riskSignals: Array<{
      severity: string;
      signal: string;
      entityId: string;
      entityType: string;
    }> = [];
    for (const t of overdueTasks) {
      riskSignals.push({
        severity: 'high',
        signal: `Overdue task: "${t.title}" (due ${
          t.dueAt ? new Date(t.dueAt).toLocaleDateString() : 'unknown'
        })`,
        entityId: t.taskId,
        entityType: 'review_task',
      });
    }
    for (const t of staleThreads) {
      riskSignals.push({
        severity: 'medium',
        signal: `Stale thread (${staleDays}+ days): "${t.title}"`,
        entityId: t.threadId,
        entityType: 'review_thread',
      });
    }
    for (const t of unassignedThreads.filter(t => t.priority === 'high')) {
      riskSignals.push({
        severity: 'high',
        signal: `High-priority unassigned thread: "${t.title}"`,
        entityId: t.threadId,
        entityType: 'review_thread',
      });
    }

    return sendSuccess(res, {
      projectId: paramStr(req.params.projectId),
      generatedAt: now.toISOString(),

      summary: {
        totalThreads: allThreads.length,
        openThreads: openThreads.length,
        resolvedThreads: resolvedThreads.length,
        highPriorityOpen: highPriorityOpen.length,
        unassignedThreads: unassignedThreads.length,
        staleThreads: staleThreads.length,
        totalTasks: allTasks.length,
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        changeRequests: changeRequests.length,
        unassignedTasks: unassignedTasks.length,
        reviewCompletionRate:
          allThreads.length > 0
            ? Math.round((resolvedThreads.length / allThreads.length) * 100)
            : 100,
      },

      artifactReadiness,

      riskSignals,

      assigneeWorkload: Array.from(assigneeMap.entries()).map(([userId, data]) => ({
        userId,
        ...data,
      })),

      recentActivity: recentActivity.map(a => ({
        activityType: a.activityType,
        entityType: a.entityType,
        entityId: a.entityId,
        description: a.description,
        createdAt: a.createdAt,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('review pulse', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to generate review pulse');
  }
});

/**
 * Suppresses (dismisses) all unread notifications for a resolved source.
 */
async function suppressNotificationsForSource(params: {
  threadId?: number | null;
  reviewTaskId?: number | null;
}): Promise<void> {
  try {
    const condition = params.threadId
      ? eq(concept2cureNotifications.threadId, params.threadId)
      : params.reviewTaskId
      ? eq(concept2cureNotifications.reviewTaskId, params.reviewTaskId)
      : null;

    if (!condition) return;

    await db
      .update(concept2cureNotifications)
      .set({
        status: 'dismissed',
        dismissedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(condition, eq(concept2cureNotifications.status, 'unread')));
  } catch (err) {
    logger.warn('Failed to suppress notifications', { error: (err as Error).message });
  }
}

export default router;
