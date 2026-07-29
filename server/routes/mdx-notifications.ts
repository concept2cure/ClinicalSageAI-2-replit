/**
 * Notifications routes — cross-cutting "things needing attention" inbox.
 *
 *   GET    /api/mdx/notifications                     list (filters)
 *   GET    /api/mdx/notifications/unread-count        badge counter
 *   POST   /api/mdx/notifications                     create (admin / system)
 *   POST   /api/mdx/notifications/:id/read            mark a row read
 *   POST   /api/mdx/notifications/read-all            mark every row read for the caller
 *   POST   /api/mdx/notifications/:id/archive         soft-archive
 *   GET    /api/mdx/notification-subscriptions        per-user opt-in matrix
 *   PUT    /api/mdx/notification-subscriptions/:cat   upsert per-category
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError, noContent,
} from '../lib/api-response';
import { pool } from '../db';
import {
  createNotification, listNotifications, markRead, markAllRead, archive, unreadCount,
} from '../services/notifications/notification-service';

const router = Router();
const log = createScopedLogger('mdx-notifications');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const SEVERITY = ['info', 'warning', 'critical'] as const;
const CATEGORIES = [
  'submission_status', 'validation_finding', 'q_sub_response', 'cdx_pairing',
  'ldt_milestone_due', 'gateway_credential_expiring', 'ana_draft_pending',
  'risk_residual_high', 'capa_due', 'study_deviation', 'enrollment_milestone',
  'admin', 'system',
] as const;

const listQuery = z.object({
  unread:   z.enum(['true', 'false']).optional(),
  category: z.string().max(60).optional(),
  severity: z.enum(SEVERITY).optional(),
  limit:    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createBody = z.object({
  recipientUserId:  z.number().int().positive().optional().nullable(),
  recipientRole:    z.string().max(60).optional().nullable(),
  category:         z.enum(CATEGORIES),
  severity:         z.enum(SEVERITY),
  title:            z.string().min(1).max(300),
  body:             z.string().max(4000).optional().nullable(),
  resourceType:     z.string().max(60).optional().nullable(),
  resourceId:       z.string().max(200).optional().nullable(),
  actionUrl:        z.string().max(500).optional().nullable(),
  metadata:         z.record(z.unknown()).optional(),
  expiresAt:        z.string().datetime({ offset: true }).optional().nullable(),
});

router.get('/notifications', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  try {
    const rows = await listNotifications(orgId, {
      recipientUserId: userId ?? undefined,
      unreadOnly:      parsed.data.unread === 'true',
      category:        parsed.data.category,
      severity:        parsed.data.severity,
      limit:           parsed.data.limit,
    });
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

router.get('/notifications/unread-count', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  try {
    const n = await unreadCount(orgId, userId);
    return ok(res, { unread: n });
  } catch (err) {
    return serverError(res, log, 'unread-count', err);
  }
});

router.post('/notifications', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const id = await createNotification({
      organizationId:  orgId,
      recipientUserId: p.recipientUserId ?? null,
      recipientRole:   p.recipientRole ?? null,
      category:        p.category,
      severity:        p.severity,
      title:           p.title,
      body:            p.body ?? null,
      resourceType:    p.resourceType ?? null,
      resourceId:      p.resourceId ?? null,
      actionUrl:       p.actionUrl ?? null,
      metadata:        p.metadata ?? {},
      expiresAt:       p.expiresAt ? new Date(p.expiresAt) : null,
    });
    return created(res, { id });
  } catch (err) {
    return serverError(res, log, 'create', err);
  }
});

router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const ok2 = await markRead(orgId, id, userId);
    if (!ok2) return notFoundInTenant(res, 'Notification');
    return noContent(res);
  } catch (err) {
    return serverError(res, log, 'mark-read', err);
  }
});

router.post('/notifications/read-all', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  try {
    const n = await markAllRead(orgId, userId);
    return ok(res, { updated: n });
  } catch (err) {
    return serverError(res, log, 'mark-all-read', err);
  }
});

router.post('/notifications/:id/archive', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const ok2 = await archive(orgId, id);
    if (!ok2) return notFoundInTenant(res, 'Notification');
    return noContent(res);
  } catch (err) {
    return serverError(res, log, 'archive', err);
  }
});

/* ─── Subscriptions (per-user opt-in matrix) ──────────────────── */

router.get('/notification-subscriptions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  try {
    const { rows } = await pool.query(
      `SELECT category, email_enabled, push_enabled, in_app_enabled, updated_at
         FROM mdx_notification_subscriptions
        WHERE organization_id = $1 AND user_id = $2
        ORDER BY category`,
      [orgId, userId],
    );
    return ok(res, rows);
  } catch (err) {
    return serverError(res, log, 'sub-list', err);
  }
});

const subBody = z.object({
  emailEnabled:  z.boolean().optional(),
  pushEnabled:   z.boolean().optional(),
  inAppEnabled:  z.boolean().optional(),
});

router.put('/notification-subscriptions/:category', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const category = String(req.params.category);
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return clientError(res, 422, `category must be one of: ${CATEGORIES.join(', ')}`);
  }
  const parsed = subBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO mdx_notification_subscriptions (
         organization_id, user_id, category, email_enabled, push_enabled, in_app_enabled
       ) VALUES ($1, $2, $3, COALESCE($4,false), COALESCE($5,false), COALESCE($6,true))
       ON CONFLICT (user_id, category) DO UPDATE SET
         email_enabled  = COALESCE(EXCLUDED.email_enabled, mdx_notification_subscriptions.email_enabled),
         push_enabled   = COALESCE(EXCLUDED.push_enabled, mdx_notification_subscriptions.push_enabled),
         in_app_enabled = COALESCE(EXCLUDED.in_app_enabled, mdx_notification_subscriptions.in_app_enabled),
         updated_at     = NOW()
       RETURNING *`,
      [
        orgId, userId, category,
        p.emailEnabled ?? null, p.pushEnabled ?? null, p.inAppEnabled ?? null,
      ],
    );
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'sub-upsert', err);
  }
});

export default router;
