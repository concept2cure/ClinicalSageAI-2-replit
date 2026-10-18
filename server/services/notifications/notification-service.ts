/**
 * Notification service — fire-and-forget creation + tenant-scoped read.
 *
 * Every mutation surface in the platform that wants to alert a user (or
 * a role, or the whole org) calls into `createNotification()`. The kit's
 * notification inbox + the AnA dock both read via `listNotifications()`.
 *
 * Storage categories are open-text. shared/constants/notifications owns the
 * supported vocabulary used by existing producers, HTTP input constraints,
 * AnA tool definitions and the recipient preference controls.
 *
 * In-app category preferences and live role audiences are honored here.
 * Reading/archiving uses per-recipient receipts. Email/push delivery is
 * unavailable and the subscriptions API explicitly refuses enabling it.
 */

import { pool } from '../../db';

/** The request client intentionally exposes only rows; governed/background writers may also expose rowCount. */
export interface NotificationExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

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
 * Governed delivery passes its transaction client and awaits the insert so
 * output, notification, audit and delivery cursor commit together.
 */
export async function createNotification(
  input: CreateNotificationInput,
  executor: NotificationExecutor = pool,
): Promise<number> {
  if (!['info', 'warning', 'critical'].includes(input.severity)) {
    throw new Error(`createNotification: severity must be info | warning | critical`);
  }
  if (!input.title || !input.category) {
    throw new Error('createNotification: title + category are required');
  }
  const { rows } = await executor.query(
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
  return requiredNumber(rows[0], 'id');
}

export interface ListNotificationsFilter {
  recipientUserId?: number;
  unreadOnly?:      boolean;
  category?:        string;
  severity?:        NotificationSeverity;
  limit?:           number;
}

// Audience membership is checked live for every read and mutation. A job
// persona may target a team; it never grants access to the linked resource.
const FROM_AUDIENCE = `FROM mdx_notifications n
  JOIN organization_users member
    ON member.organization_id = n.organization_id AND member.user_id = $2
  LEFT JOIN mdx_notification_receipts receipt
    ON receipt.organization_id = n.organization_id AND receipt.notification_id = n.id AND receipt.user_id = $2
  LEFT JOIN mdx_notification_subscriptions preference
    ON preference.organization_id = n.organization_id AND preference.user_id = $2 AND preference.category = n.category`;
const AUDIENCE = `n.organization_id = $1
  AND (n.recipient_user_id = $2 OR (n.recipient_user_id IS NULL
    AND (n.recipient_role IS NULL OR LOWER(n.recipient_role) = LOWER(member.role)
      OR LOWER(n.recipient_role) = LOWER(member.persona))))
  AND n.archived_at IS NULL AND receipt.archived_at IS NULL
  AND (n.expires_at IS NULL OR n.expires_at > NOW())
  AND COALESCE(preference.in_app_enabled, true)`;
const READ_AT = `COALESCE(receipt.read_at, CASE WHEN n.recipient_user_id IS NOT NULL THEN n.read_at END)`;

function requiredNumber(row: Record<string, unknown> | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid notification database identity');
  return value;
}
function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid notification recipient identity');
  return value;
}
function textField(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid notification database text');
  return value;
}
function nullableText(value: unknown): string | null {
  return value == null ? null : textField(value);
}
function dateField(value: unknown): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error('Invalid notification database date');
  return date;
}
function noticeRow(row: Record<string, unknown>): NotificationRow {
  const createdAt = dateField(row.created_at);
  if (!createdAt) throw new Error('Notification creation time is missing');
  const metadata = row.metadata;
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) throw new Error('Invalid notification metadata');
  return { id: requiredNumber(row, 'id'), organization_id: requiredNumber(row, 'organization_id'),
    recipient_user_id: nullableNumber(row.recipient_user_id), recipient_role: nullableText(row.recipient_role),
    category: textField(row.category), severity: textField(row.severity), title: textField(row.title),
    body: nullableText(row.body), resource_type: nullableText(row.resource_type), resource_id: nullableText(row.resource_id),
    action_url: nullableText(row.action_url), read_at: dateField(row.read_at), archived_at: dateField(row.archived_at),
    metadata: metadata == null ? null : Object.fromEntries(Object.entries(metadata)),
    expires_at: dateField(row.expires_at), created_at: createdAt };
}

/** Resource-only read for navigation, with the exact existing audience policy and fresh membership role. */
export async function notificationResourceForRecipient(
  context: { organizationId: number; userId: number; notificationId: number },
  executor: NotificationExecutor = pool,
): Promise<{ resource_type: string | null; resource_id: string | null; action_url: string | null; current_org_role: string } | null> {
  const { organizationId,userId,notificationId } = context;
  if (![organizationId,userId,notificationId].every(id => Number.isSafeInteger(id) && id > 0)) return null;
  const result = await executor.query(`SELECT n.resource_type,n.resource_id,n.action_url,member.role AS current_org_role
    ${FROM_AUDIENCE} WHERE ${AUDIENCE} AND n.id = $3 LIMIT 1`, [organizationId,userId,notificationId]);
  const row = result.rows[0];
  if (!row || typeof row.current_org_role !== 'string') return null;
  return {
    resource_type: typeof row.resource_type === 'string' ? row.resource_type : null,
    resource_id: typeof row.resource_id === 'string' ? row.resource_id : null,
    action_url: typeof row.action_url === 'string' ? row.action_url : null,
    current_org_role: row.current_org_role,
  };
}

export async function listNotifications(organizationId: number, filter: ListNotificationsFilter = {}, executor: NotificationExecutor = pool): Promise<NotificationRow[]> {
  if (!Number.isSafeInteger(filter.recipientUserId) || Number(filter.recipientUserId) <= 0) throw new Error('Notification recipient context required');
  const args: unknown[] = [organizationId, filter.recipientUserId, filter.unreadOnly === true,
    filter.category || null, filter.severity || null, filter.limit ?? 200];
  const { rows } = await executor.query(
    `SELECT n.*, ${READ_AT} AS read_at, receipt.archived_at AS archived_at
     ${FROM_AUDIENCE} WHERE ${AUDIENCE}
       AND (NOT $3::boolean OR ${READ_AT} IS NULL)
       AND ($4::text IS NULL OR n.category = $4)
       AND ($5::text IS NULL OR n.severity = $5)
     ORDER BY (${READ_AT} IS NULL) DESC,
       CASE n.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       n.created_at DESC, n.id DESC LIMIT $6`, args,
  );
  return rows.map(noticeRow);
}

export async function markRead(organizationId: number, notificationId: number, userId: number, executor: NotificationExecutor = pool): Promise<boolean> {
  const { rows } = await executor.query(
    `INSERT INTO mdx_notification_receipts (organization_id, notification_id, user_id, read_at)
     SELECT n.organization_id, n.id, $2, NOW() ${FROM_AUDIENCE}
       WHERE ${AUDIENCE} AND n.id = $3 AND ${READ_AT} IS NULL
     ON CONFLICT (organization_id, notification_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
       WHERE mdx_notification_receipts.read_at IS NULL RETURNING notification_id`, [organizationId, userId, notificationId],
  );
  return rows.length > 0;
}

export async function markAllRead(organizationId: number, userId: number, executor: NotificationExecutor = pool): Promise<number> {
  const { rows } = await executor.query(
    `INSERT INTO mdx_notification_receipts (organization_id, notification_id, user_id, read_at)
     SELECT n.organization_id, n.id, $2, NOW() ${FROM_AUDIENCE}
       WHERE ${AUDIENCE} AND ${READ_AT} IS NULL
     ON CONFLICT (organization_id, notification_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
       WHERE mdx_notification_receipts.read_at IS NULL RETURNING notification_id`, [organizationId, userId],
  );
  return rows.length;
}

export async function archive(organizationId: number, notificationId: number, userId: number, executor: NotificationExecutor = pool): Promise<boolean> {
  const { rows } = await executor.query(
    `INSERT INTO mdx_notification_receipts (organization_id, notification_id, user_id, archived_at)
     SELECT n.organization_id, n.id, $2, NOW() ${FROM_AUDIENCE} WHERE ${AUDIENCE} AND n.id = $3
     ON CONFLICT (organization_id, notification_id, user_id) DO UPDATE SET archived_at = EXCLUDED.archived_at
       WHERE mdx_notification_receipts.archived_at IS NULL RETURNING notification_id`, [organizationId, userId, notificationId],
  );
  return rows.length > 0;
}

export async function unreadCount(organizationId: number, userId: number, executor: NotificationExecutor = pool): Promise<number> {
  const { rows } = await executor.query(
    `SELECT COUNT(*)::int AS n ${FROM_AUDIENCE} WHERE ${AUDIENCE} AND ${READ_AT} IS NULL`, [organizationId, userId],
  );
  return requiredNumber(rows[0], 'n');
}
