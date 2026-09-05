/**
 * Notifications, PM work items and reminder/escalation processing for
 * Concept2Cure — the second domain carved out of routes/concept2cure.ts
 * (ledger L53, slice 3). Mounted at the same prefix as the main router, ahead
 * of it, with the same middleware chain; the handlers moved verbatim.
 *
 * The two writers (upsertProjectWorkItem, createNotification) live here
 * because this is the domain that owns those tables; the reviews router
 * imports them from here.
 *
 * @module server/routes/c2c/notifications
 */

import { Router, type Request, type Response } from 'express';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import { db } from '../../db';
import {
  c2cProjectWorkItems,
  concept2cureArtifacts,
  concept2cureNotifications,
  concept2cureReviewTasks,
  concept2cureReviewThreads,
} from '../../../shared/schema';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logConcept2cureError,
  paramStr,
  sendError,
  sendSuccess,
} from './shared';
import { verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-notifications');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates or updates a PM work item projected from a document review object.
 */
export async function upsertProjectWorkItem(params: {
  orgId: number;
  projectId: number;
  sourceType: string;
  sourceId: number;
  artifactId?: number | null;
  versionId?: number | null;
  ctdSection?: string | null;
  ownerId?: number | null;
  ownerName?: string | null;
  title: string;
  status: string;
  priority?: string | null;
  dueAt?: Date | string | null;
  blockerType?: string | null;
}): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(c2cProjectWorkItems)
      .where(
        and(
          eq(c2cProjectWorkItems.sourceType, params.sourceType),
          eq(c2cProjectWorkItems.sourceId, params.sourceId),
          eq(c2cProjectWorkItems.orgId, params.orgId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(c2cProjectWorkItems)
        .set({
          title: params.title,
          status: params.status,
          priority: params.priority || null,
          dueAt: params.dueAt ? new Date(params.dueAt as string) : null,
          ownerId: params.ownerId || null,
          ownerName: params.ownerName || null,
          blockerType: params.blockerType || null,
          resolvedAt:
            params.status === 'resolved' || params.status === 'closed' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(c2cProjectWorkItems.id, existing[0].id));
    } else {
      const workItemId = `pwi_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      await db.insert(c2cProjectWorkItems).values({
        workItemId,
        orgId: params.orgId,
        projectId: params.projectId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        artifactId: params.artifactId || null,
        versionId: params.versionId || null,
        ctdSection: params.ctdSection || null,
        ownerId: params.ownerId || null,
        ownerName: params.ownerName || null,
        title: params.title,
        status: params.status,
        priority: params.priority || null,
        dueAt: params.dueAt ? new Date(params.dueAt as string) : null,
        blockerType: params.blockerType || null,
      });
    }
  } catch (err) {
    logger.warn('Failed to upsert PM work item', { error: (err as Error).message });
  }
}

/**
 * Creates a notification for a user.
 */
export async function createNotification(params: {
  orgId: number;
  projectId?: number | null;
  artifactId?: number | null;
  versionId?: number | null;
  threadId?: number | null;
  reviewTaskId?: number | null;
  projectWorkItemId?: number | null;
  recipientUserId: number;
  recipientName?: string | null;
  actorUserId?: number | null;
  actorName?: string | null;
  notificationType: string;
  title: string;
  body: string;
  severity?: string;
  actionUrl?: string | null;
  dueAt?: Date | string | null;
}): Promise<void> {
  try {
    // Guard: skip if no valid recipient
    if (!params.recipientUserId || params.recipientUserId <= 0) return;

    // Avoid duplicate unread notifications of the same type for the same source
    const sourceCondition = params.threadId
      ? eq(concept2cureNotifications.threadId, params.threadId)
      : params.reviewTaskId
      ? eq(concept2cureNotifications.reviewTaskId, params.reviewTaskId)
      : null;

    const existing = await db
      .select({ id: concept2cureNotifications.id })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, params.orgId),
          eq(concept2cureNotifications.recipientUserId, params.recipientUserId),
          eq(concept2cureNotifications.notificationType, params.notificationType),
          eq(concept2cureNotifications.status, 'unread'),
          ...(sourceCondition ? [sourceCondition] : [])
        )
      )
      .limit(1);

    if (existing.length > 0) return; // suppress duplicate

    const notifId = `ntf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureNotifications).values({
      notificationId: notifId,
      orgId: params.orgId,
      projectId: params.projectId || null,
      artifactId: params.artifactId || null,
      versionId: params.versionId || null,
      threadId: params.threadId || null,
      reviewTaskId: params.reviewTaskId || null,
      projectWorkItemId: params.projectWorkItemId || null,
      recipientUserId: params.recipientUserId,
      recipientName: params.recipientName || null,
      actorUserId: params.actorUserId || null,
      actorName: params.actorName || null,
      notificationType: params.notificationType,
      title: params.title,
      body: params.body,
      severity: params.severity || 'info',
      status: 'unread',
      actionUrl: params.actionUrl || null,
      dueAt: params.dueAt ? new Date(params.dueAt as string) : null,
      lastNotifiedAt: new Date(),
      escalationLevel: 0,
    });
  } catch (err) {
    logger.warn('Failed to create notification', { error: (err as Error).message });
  }
}


// ── Notification API Routes ──────────────────────────────────────────────────

/**
 * GET /api/concept2cure/notifications/my
 * Returns the current user's notifications, newest first.
 */
router.get('/notifications/my', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const statusFilter = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions = [
      eq(concept2cureNotifications.orgId, organizationId),
      eq(concept2cureNotifications.recipientUserId, userId),
    ];
    if (statusFilter && ['unread', 'read', 'dismissed'].includes(statusFilter)) {
      conditions.push(eq(concept2cureNotifications.status, statusFilter));
    }

    const notifs = await db
      .select()
      .from(concept2cureNotifications)
      .where(and(...conditions))
      .orderBy(desc(concept2cureNotifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    return sendSuccess(res, {
      notifications: notifs,
      unreadCount: countResult?.count || 0,
      total: notifs.length,
      offset,
    });
  } catch (error: any) {
    logConcept2cureError('get my notifications', error);
    return sendError(res, 500, 'Failed to fetch notifications');
  }
});

/**
 * POST /api/concept2cure/notifications/:id/read
 */
router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const notifId = parseInt(paramStr(req.params.id), 10);
    if (isNaN(notifId)) return sendError(res, 400, 'Invalid notification ID');

    const [notif] = await db
      .select()
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.id, notifId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.orgId, organizationId)
        )
      )
      .limit(1);

    if (!notif) return sendError(res, 404, 'Notification not found');

    await db
      .update(concept2cureNotifications)
      .set({ status: 'read', readAt: new Date(), updatedAt: new Date() })
      .where(eq(concept2cureNotifications.id, notifId));

    return sendSuccess(res, { id: notifId, status: 'read' });
  } catch (error: any) {
    logConcept2cureError('mark notification read', error);
    return sendError(res, 500, 'Failed to mark notification as read');
  }
});

/**
 * POST /api/concept2cure/notifications/:id/dismiss
 */
router.post('/notifications/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const notifId = parseInt(paramStr(req.params.id), 10);
    if (isNaN(notifId)) return sendError(res, 400, 'Invalid notification ID');

    const [notif] = await db
      .select()
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.id, notifId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.orgId, organizationId)
        )
      )
      .limit(1);

    if (!notif) return sendError(res, 404, 'Notification not found');

    await db
      .update(concept2cureNotifications)
      .set({ status: 'dismissed', dismissedAt: new Date(), updatedAt: new Date() })
      .where(eq(concept2cureNotifications.id, notifId));

    return sendSuccess(res, { id: notifId, status: 'dismissed' });
  } catch (error: any) {
    logConcept2cureError('dismiss notification', error);
    return sendError(res, 500, 'Failed to dismiss notification');
  }
});

/**
 * POST /api/concept2cure/notifications/mark-all-read
 */
router.post('/notifications/mark-all-read', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const result = await db
      .update(concept2cureNotifications)
      .set({ status: 'read', readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.status, 'unread')
        )
      )
      .returning({ id: concept2cureNotifications.id });

    return sendSuccess(res, { markedRead: result.length });
  } catch (error: any) {
    logConcept2cureError('mark all notifications read', error);
    return sendError(res, 500, 'Failed to mark all notifications as read');
  }
});

/**
 * GET /api/concept2cure/notifications/project
 * Project-scoped notifications for admin/review leads.
 */
router.get('/notifications/project', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) return sendError(res, 400, 'projectId is required');

    const hasAccess = await verifyProjectAccess(req, String(projectId));
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const notifs = await db
      .select()
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.projectId, projectId)
        )
      )
      .orderBy(desc(concept2cureNotifications.createdAt))
      .limit(limit);

    return sendSuccess(res, { notifications: notifs });
  } catch (error: any) {
    logConcept2cureError('get project notifications', error);
    return sendError(res, 500, 'Failed to fetch project notifications');
  }
});

// ── PM Work Items Routes ─────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/work-items
 * Returns all PM work items for a project.
 */
router.get('/projects/:projectId/work-items', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const statusFilter = req.query.status as string | undefined;
    const conditions = [
      eq(c2cProjectWorkItems.orgId, organizationId),
      eq(c2cProjectWorkItems.projectId, projectDbId),
    ];
    if (statusFilter && ['open', 'in_progress', 'resolved', 'closed'].includes(statusFilter)) {
      conditions.push(eq(c2cProjectWorkItems.status, statusFilter));
    }

    const items = await db
      .select()
      .from(c2cProjectWorkItems)
      .where(and(...conditions))
      .orderBy(desc(c2cProjectWorkItems.createdAt));

    return sendSuccess(res, { workItems: items });
  } catch (error: any) {
    logConcept2cureError('get work items', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to fetch work items');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/readiness-summary
 * Full project readiness aggregation from review state.
 */
router.get('/projects/:projectId/readiness-summary', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const now = new Date();

    // Artifacts
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const totalArtifacts = allArtifacts.length;
    const draftCount = allArtifacts.filter(a => (a.status || 'draft') === 'draft').length;
    const reviewCount = allArtifacts.filter(a => a.status === 'review').length;
    const approvedCount = allArtifacts.filter(a => a.status === 'approved').length;
    const lockedCount = allArtifacts.filter(a => a.status === 'locked').length;

    // Threads
    const allThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.projectId, projectDbId)
        )
      );

    const openThreads = allThreads.filter(t => t.status === 'open');
    const resolvedThreads = allThreads.filter(t => t.status === 'resolved');

    // Tasks
    const allTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, organizationId),
          eq(concept2cureReviewTasks.projectId, projectDbId)
        )
      );

    const openTasks = allTasks.filter(t => t.status === 'open' || t.status === 'in_progress');
    const overdueTasks = openTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);
    const changeRequestTasks = allTasks.filter(
      t => t.taskType === 'change_request' && t.status !== 'resolved' && t.status !== 'closed'
    );

    // PM work items
    const workItems = await db
      .select()
      .from(c2cProjectWorkItems)
      .where(
        and(
          eq(c2cProjectWorkItems.orgId, organizationId),
          eq(c2cProjectWorkItems.projectId, projectDbId)
        )
      );

    const openWorkItems = workItems.filter(w => w.status === 'open' || w.status === 'in_progress');
    const blockedWorkItems = workItems.filter(w => w.blockerType !== null && w.status === 'open');

    // Escalated notifications
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

    // Per-artifact unresolved review density
    const artifactReviewMap = new Map<
      number,
      {
        title: string;
        ctdSection: string | null;
        openThreads: number;
        openTasks: number;
        overdue: number;
        status: string;
      }
    >();
    for (const art of allArtifacts) {
      artifactReviewMap.set(art.id, {
        title: art.title,
        ctdSection: art.ctdSection || null,
        openThreads: 0,
        openTasks: 0,
        overdue: 0,
        status: art.status || 'draft',
      });
    }
    for (const t of openThreads) {
      const entry = artifactReviewMap.get(t.artifactId);
      if (entry) entry.openThreads++;
    }
    for (const t of openTasks) {
      const entry = artifactReviewMap.get(t.artifactId);
      if (entry) {
        entry.openTasks++;
        if (t.dueAt && new Date(t.dueAt) < now) entry.overdue++;
      }
    }

    // Per-section readiness
    const sectionReadiness = new Map<string, { total: number; ready: number; blocked: number }>();
    for (const art of allArtifacts) {
      const sec = art.ctdSection || 'unplaced';
      if (!sectionReadiness.has(sec)) sectionReadiness.set(sec, { total: 0, ready: 0, blocked: 0 });
      const entry = sectionReadiness.get(sec)!;
      entry.total++;
      if (art.status === 'approved' || art.status === 'locked') entry.ready++;
      const artReview = artifactReviewMap.get(art.id);
      if (artReview && (artReview.openThreads > 0 || artReview.openTasks > 0)) entry.blocked++;
    }

    // Approval bottlenecks
    const approvalsWaiting = allTasks.filter(
      t => t.taskType === 'approval_task' && (t.status === 'open' || t.status === 'in_progress')
    );

    return sendSuccess(res, {
      artifacts: {
        total: totalArtifacts,
        draft: draftCount,
        review: reviewCount,
        approved: approvedCount,
        locked: lockedCount,
      },
      threads: {
        total: allThreads.length,
        open: openThreads.length,
        resolved: resolvedThreads.length,
      },
      tasks: {
        total: allTasks.length,
        open: openTasks.length,
        overdue: overdueTasks.length,
        changeRequests: changeRequestTasks.length,
        approvalsWaiting: approvalsWaiting.length,
      },
      workItems: {
        total: workItems.length,
        open: openWorkItems.length,
        blocked: blockedWorkItems.length,
      },
      escalations: escalatedCount?.count || 0,
      sectionReadiness: Array.from(sectionReadiness.entries()).map(([section, data]) => ({
        section,
        ...data,
        readyPercent: data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0,
      })),
      artifactDetails: Array.from(artifactReviewMap.entries())
        .filter(([, data]) => data.openThreads > 0 || data.openTasks > 0)
        .map(([id, data]) => ({
          artifactId: id,
          ...data,
        })),
    });
  } catch (error: any) {
    logConcept2cureError('readiness summary', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to generate readiness summary');
  }
});

// ── Reminder / Escalation Processing ─────────────────────────────────────────

/**
 * POST /api/concept2cure/escalation/process
 * Scans open threads/tasks for overdue items and creates/escalates notifications.
 * Designed to be called periodically (cron, scheduler, or manually).
 */
router.post('/escalation/process', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h ahead

    let dueSoonCreated = 0;
    let overdueCreated = 0;
    let escalated = 0;

    // ── Process overdue threads ──
    const overdueThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open'),
          sql`${concept2cureReviewThreads.dueAt} IS NOT NULL AND ${concept2cureReviewThreads.dueAt} < ${now}`
        )
      );

    // ── Batch-process overdue threads (N+1 → 3 queries) ──
    const assignedThreads = overdueThreads.filter(t => t.assigneeId);
    const threadIds = assignedThreads.map(t => t.id);

    // Batch-fetch existing unread notifications for all overdue threads
    const existingThreadNotifs =
      threadIds.length > 0
        ? await db
            .select({
              threadId: concept2cureNotifications.threadId,
              escalationLevel: concept2cureNotifications.escalationLevel,
              notificationType: concept2cureNotifications.notificationType,
            })
            .from(concept2cureNotifications)
            .where(
              and(
                inArray(concept2cureNotifications.threadId, threadIds),
                inArray(concept2cureNotifications.notificationType, ['escalation', 'overdue']),
                eq(concept2cureNotifications.status, 'unread')
              )
            )
        : [];

    // Build a map of threadId → max existing escalation level
    const threadEscMap = new Map<number, number>();
    for (const n of existingThreadNotifs) {
      const cur = threadEscMap.get(n.threadId!) ?? -1;
      threadEscMap.set(n.threadId!, Math.max(cur, n.escalationLevel ?? 0));
    }

    // Compute needed notifications
    const threadNotifsToInsert: any[] = [];
    for (const thread of assignedThreads) {
      const overdueDuration = now.getTime() - new Date(thread.dueAt!).getTime();
      let newLevel = 0;
      if (overdueDuration > 72 * 60 * 60 * 1000) newLevel = 2;
      else if (overdueDuration > 24 * 60 * 60 * 1000) newLevel = 1;

      const existingLevel = threadEscMap.get(thread.id) ?? -1;
      if (existingLevel >= newLevel) continue;

      const notifId = `ntf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      threadNotifsToInsert.push({
        notificationId: notifId,
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.assigneeId,
        recipientName: thread.assigneeName,
        actorUserId: null,
        actorName: 'System',
        notificationType: newLevel > 0 ? 'escalation' : 'overdue',
        title:
          newLevel > 0
            ? `Escalation L${newLevel}: "${thread.title}" is overdue`
            : `Overdue: "${thread.title}" review thread`,
        body: `Review thread "${
          thread.title
        }" was due ${thread.dueAt!.toISOString()} and remains unresolved.`,
        severity: newLevel >= 2 ? 'critical' : newLevel >= 1 ? 'warning' : 'info',
        status: 'unread',
        dueAt: thread.dueAt,
        escalationLevel: newLevel,
        lastNotifiedAt: now,
        nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        escalatesAt: newLevel < 2 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
      });

      if (newLevel > 0) escalated++;
      else overdueCreated++;
    }

    // Batch-insert all thread notifications
    if (threadNotifsToInsert.length > 0) {
      await db.insert(concept2cureNotifications).values(threadNotifsToInsert);
    }

    // ── Process overdue tasks ──
    const overdueTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, organizationId),
          or(
            eq(concept2cureReviewTasks.status, 'open'),
            eq(concept2cureReviewTasks.status, 'in_progress')
          ),
          sql`${concept2cureReviewTasks.dueAt} IS NOT NULL AND ${concept2cureReviewTasks.dueAt} < ${now}`
        )
      );

    // ── Batch-process overdue tasks (N+1 → 3 queries) ──
    const assignedTasks = overdueTasks.filter(t => t.assignedToId);
    const taskIds = assignedTasks.map(t => t.id);

    // Batch-fetch existing unread notifications for all overdue tasks
    const existingTaskNotifs =
      taskIds.length > 0
        ? await db
            .select({
              reviewTaskId: concept2cureNotifications.reviewTaskId,
              escalationLevel: concept2cureNotifications.escalationLevel,
              notificationType: concept2cureNotifications.notificationType,
            })
            .from(concept2cureNotifications)
            .where(
              and(
                inArray(concept2cureNotifications.reviewTaskId, taskIds),
                inArray(concept2cureNotifications.notificationType, ['escalation', 'overdue']),
                eq(concept2cureNotifications.status, 'unread')
              )
            )
        : [];

    // Build a map of taskId → max existing escalation level
    const taskEscMap = new Map<number, number>();
    for (const n of existingTaskNotifs) {
      const cur = taskEscMap.get(n.reviewTaskId!) ?? -1;
      taskEscMap.set(n.reviewTaskId!, Math.max(cur, n.escalationLevel ?? 0));
    }

    // Compute needed notifications
    const taskNotifsToInsert: any[] = [];
    for (const task of assignedTasks) {
      const overdueDuration = now.getTime() - new Date(task.dueAt!).getTime();
      let newLevel = 0;
      if (overdueDuration > 72 * 60 * 60 * 1000) newLevel = 2;
      else if (overdueDuration > 24 * 60 * 60 * 1000) newLevel = 1;

      const existingLevel = taskEscMap.get(task.id) ?? -1;
      if (existingLevel >= newLevel) continue;

      const notifId = `ntf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      taskNotifsToInsert.push({
        notificationId: notifId,
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.assignedToId,
        recipientName: task.assignedToName,
        actorUserId: null,
        actorName: 'System',
        notificationType: newLevel > 0 ? 'escalation' : 'overdue',
        title:
          newLevel > 0
            ? `Escalation L${newLevel}: "${task.title}" is overdue`
            : `Overdue: "${task.title}" review task`,
        body: `Review task "${
          task.title
        }" was due ${task.dueAt!.toISOString()} and remains unresolved.`,
        severity: newLevel >= 2 ? 'critical' : newLevel >= 1 ? 'warning' : 'info',
        status: 'unread',
        dueAt: task.dueAt,
        escalationLevel: newLevel,
        lastNotifiedAt: now,
        nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        escalatesAt: newLevel < 2 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
      });

      if (newLevel > 0) escalated++;
      else overdueCreated++;
    }

    // Batch-insert all task notifications
    if (taskNotifsToInsert.length > 0) {
      await db.insert(concept2cureNotifications).values(taskNotifsToInsert);
    }

    // ── Due-soon reminders for threads ──
    const dueSoonThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open'),
          sql`${concept2cureReviewThreads.dueAt} IS NOT NULL AND ${concept2cureReviewThreads.dueAt} > ${now} AND ${concept2cureReviewThreads.dueAt} <= ${dueSoonThreshold}`
        )
      );

    for (const thread of dueSoonThreads) {
      if (!thread.assigneeId) continue;
      await createNotification({
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.assigneeId,
        recipientName: thread.assigneeName,
        notificationType: 'due_soon',
        title: `Due soon: "${thread.title}"`,
        body: `Review thread "${thread.title}" is due ${thread.dueAt!.toISOString()}.`,
        severity: 'warning',
        dueAt: thread.dueAt,
      });
      dueSoonCreated++;
    }

    // ── Due-soon reminders for tasks ──
    const dueSoonTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, organizationId),
          or(
            eq(concept2cureReviewTasks.status, 'open'),
            eq(concept2cureReviewTasks.status, 'in_progress')
          ),
          sql`${concept2cureReviewTasks.dueAt} IS NOT NULL AND ${concept2cureReviewTasks.dueAt} > ${now} AND ${concept2cureReviewTasks.dueAt} <= ${dueSoonThreshold}`
        )
      );

    for (const task of dueSoonTasks) {
      if (!task.assignedToId) continue;
      await createNotification({
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.assignedToId,
        recipientName: task.assignedToName,
        notificationType: 'due_soon',
        title: `Due soon: "${task.title}"`,
        body: `Review task "${task.title}" is due ${task.dueAt!.toISOString()}.`,
        severity: 'warning',
        dueAt: task.dueAt,
      });
      dueSoonCreated++;
    }

    return sendSuccess(res, {
      processed: {
        overdueThreads: overdueThreads.length,
        overdueTasks: overdueTasks.length,
        dueSoonThreads: dueSoonThreads.length,
        dueSoonTasks: dueSoonTasks.length,
      },
      created: {
        dueSoon: dueSoonCreated,
        overdue: overdueCreated,
        escalated,
      },
    });
  } catch (error: any) {
    logConcept2cureError('escalation process', error);
    return sendError(res, 500, 'Failed to process escalations');
  }
});

export default router;
