/**
 * Notification service — fire-and-forget creation + tenant-scoped read.
 *
 * Every mutation surface in the platform that wants to alert a user (or
 * a role, or the whole org) calls into `createNotification()`. The kit's
 * notification inbox + the AnA dock both read via `listNotifications()`.
 *
 * Categories are open-text but the AnaTool surface enumerates the
 * canonical set (submission_status, validation_finding, q_sub_response,
 * cdx_pairing, ldt_milestone_due, gateway_credential_expiring,
 * ana_draft_pending, risk_residual_high, capa_due, study_deviation,
 * enrollment_milestone, admin, system).
 *
 * Subscription resolution (in-app / email / push) is honored at delivery
 * time, not creation time — in-app rows always land in the table, then
 * email/push fan-out reads the subscriptions row when present.
 */

import { pool } from '../../db';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface CreateNotificationInput {
  organizationId:    number;
  recipientUserId?:  number | null;
  recipientRole?:    string | null;
  category:          string;
  severity:          NotificationSeverity;
  title:             string;
  body?:             string | null;
  resourceType?:     string | null;
  resourceId?:       string | null;
  actionUrl?:        string | null;
  metadata?:         Record<string, unknown>;
  expiresAt?:        Date | null;
}

export interface NotificationRow {
  id:                number;
  organization_id:   number;
  recipient_user_id: number | null;
  recipient_role:    string | null;
  category:          string;
  severity:          string;
  title:             string;
  body:              string | null;
  resource_type:     string | null;
  resource_id:       string | null;
  action_url:        string | null;
  read_at:           Date | null;
  archived_at:       Date | null;
  metadata:          Record<string, unknown> | null;
  expires_at:        Date | null;
  created_at:        Date;
}

/**
 * Fire a notification. Always returns the inserted id; callers should
 * not await this in hot paths — use `void createNotification(...)`.
 */
export async function createNotification(input: CreateNotificationInput): Promise<number> {
  if (!['info', 'warning', 'critical'].includes(input.severity)) {
    throw new Error(`createNotification: severity must be info | warning | critical`);
  }
  if (!input.title || !input.category) {
    throw new Error('createNotification: title + category are required');
  }
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO mdx_notifications (
       organization_id, recipient_user_id, recipient_role, category, severity,
       title, body, resource_type, resource_id, action_url, metadata, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
     )
     RETURNING id`,
    [
      input.organizationId,
      input.recipientUserId ?? null,
      input.recipientRole ?? null,
      input.category,
      input.severity,
      input.title,
      input.body ?? null,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.actionUrl ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.expiresAt ?? null,
    ],
  );
  return rows[0].id;
}

export interface ListNotificationsFilter {
  recipientUserId?: number;
  unreadOnly?:      boolean;
  category?:        string;
  severity?:        NotificationSeverity;
  limit?:           number;
}

export async function listNotifications(
  organizationId: number,
  filter: ListNotificationsFilter = {},
): Promise<NotificationRow[]> {
  const filters: string[] = [`organization_id = $1`, `archived_at IS NULL`];
  const args: unknown[] = [organizationId];
  if (filter.recipientUserId !== undefined) {
    args.push(filter.recipientUserId);
    filters.push(`(recipient_user_id = $${args.length} OR recipient_user_id IS NULL)`);
  }
  if (filter.unreadOnly)       filters.push(`read_at IS NULL`);
  if (filter.category)         { args.push(filter.category); filters.push(`category = $${args.length}`); }
  if (filter.severity)         { args.push(filter.severity); filters.push(`severity = $${args.length}`); }
  /* Auto-archive expired rows for the caller. Cheap because expires_at
     has no index, but the table never grows large enough to matter. */
  args.push(filter.limit ?? 200);
  const { rows } = await pool.query<NotificationRow>(
    `SELECT * FROM mdx_notifications
      WHERE ${filters.join(' AND ')}
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY (read_at IS NULL) DESC,
               CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
               created_at DESC
      LIMIT $${args.length}`,
    args,
  );
  return rows;
}

export async function markRead(
  organizationId: number,
  notificationId: number,
  userId: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE mdx_notifications
        SET read_at = NOW()
      WHERE id = $1 AND organization_id = $2
        AND (recipient_user_id = $3 OR recipient_user_id IS NULL)
        AND read_at IS NULL`,
    [notificationId, organizationId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function markAllRead(organizationId: number, userId: number): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE mdx_notifications
        SET read_at = NOW()
      WHERE organization_id = $1
        AND (recipient_user_id = $2 OR recipient_user_id IS NULL)
        AND read_at IS NULL`,
    [organizationId, userId],
  );
  return rowCount ?? 0;
}

export async function archive(
  organizationId: number,
  notificationId: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE mdx_notifications SET archived_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
    [notificationId, organizationId],
  );
  return (rowCount ?? 0) > 0;
}

export async function unreadCount(
  organizationId: number,
  userId: number,
): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM mdx_notifications
      WHERE organization_id = $1
        AND (recipient_user_id = $2 OR recipient_user_id IS NULL)
        AND read_at IS NULL AND archived_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [organizationId, userId],
  );
  return rows[0]?.n ?? 0;
}
