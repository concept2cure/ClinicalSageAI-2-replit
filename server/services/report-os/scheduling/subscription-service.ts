/**
 * Persistence + lifecycle for report subscriptions (Report-OS, Step 6).
 *
 * Org-scoped CRUD over the `report_subscriptions` table plus the due-scan that
 * the scheduler uses to find subscriptions ready to run. All next-run math is
 * delegated to the pure `cadence` module; this module only wires it to the DB.
 *
 * Stored `schedule` json is cast back to the `ReportSchedule` type before any
 * cadence call (the column is typed as the structurally-equivalent
 * `ReportScheduleJson` in the schema to keep `shared/` free of a server import).
 */

import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { db, transaction } from '../../../db';
import { setTenantContextTx } from '../../tenant/governed-tenant-context';
import { writeChainedAuditRow } from '../../auditService';
import {
  reportSubscriptions,
  type ReportSubscriptionRow,
} from '@shared/schema/report-os';
import { computeNextRun } from './cadence';
import { ScheduleConfigurationError, validateSubscriptionConfiguration } from './configuration';
import type {
  DeliveryChannel,
  DeliveryFormat,
  ReportSchedule,
} from './types';

/** Input accepted by {@link createSubscription}. */
export interface CreateSubscriptionInput {
  organizationId: number;
  clientWorkspaceId?: number | null;
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  schedule: ReportSchedule;
  recipients?: string[];
  format?: DeliveryFormat;
  channel?: DeliveryChannel;
  persona?: string | null;
  enabled?: boolean;
  createdBy?: number | null;
}

/** Cast a stored schedule json back to the cadence `ReportSchedule` type. */
function toSchedule(row: Pick<ReportSubscriptionRow, 'schedule'>): ReportSchedule {
  return row.schedule as unknown as ReportSchedule;
}

/**
 * Pure wrapper over {@link computeNextRun}: the next occurrence strictly after
 * `now` for a subscription's schedule. The `lastRunAt` is accepted to mirror the
 * row shape but the next run is always anchored at `now` so a freshly toggled or
 * just-run subscription advances forward.
 */
export function nextRunFor(
  sub: { schedule: ReportSchedule; lastRunAt: Date | null },
  now: Date,
): Date {
  return computeNextRun(sub.schedule, now);
}

/**
 * Persist a new subscription. `nextRunAt` is seeded from the schedule so the
 * scheduler has a target before the first run.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<ReportSubscriptionRow> {
  try {
    await validateSubscriptionConfiguration(input);
    const now = new Date();
    return await transaction(async client => {
      await setTenantContextTx(client, input.organizationId);
      const [row] = await drizzle(client)
        .insert(reportSubscriptions)
        .values({
          organizationId: input.organizationId,
          clientWorkspaceId: input.clientWorkspaceId ?? null,
          reportTypeId: input.reportTypeId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          schedule: input.schedule as unknown as ReportSubscriptionRow['schedule'],
          recipients: input.recipients ?? [],
          format: input.format ?? 'in_app',
          channel: input.channel ?? 'platform',
          persona: input.persona ?? null,
          enabled: input.enabled ?? true,
          nextRunAt: computeNextRun(input.schedule, now),
          createdBy: input.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await writeChainedAuditRow(client, { tenantId: input.organizationId, userId: input.createdBy ?? undefined,
        action: 'report_os.subscription_created', resourceType: 'report_subscription', resourceId: String(row.id),
        details: { reportTypeId: row.reportTypeId, scopeType: row.scopeType, scopeId: row.scopeId, schedule: row.schedule, channel: row.channel, recipientCount: row.recipients?.length ?? 0, nextRunAt: row.nextRunAt?.toISOString(), enabled: row.enabled } });
      return row;
    });
  } catch (err) {
    if (err instanceof ScheduleConfigurationError) throw err;
    throw new Error(
      `Failed to create report subscription: ${(err as Error).message}`, { cause: err },
    );
  }
}

/** List all subscriptions for an organization, newest first. */
export async function listSubscriptions(
  orgId: number,
): Promise<ReportSubscriptionRow[]> {
  try {
    return await db
      .select()
      .from(reportSubscriptions)
      .where(eq(reportSubscriptions.organizationId, orgId))
      .orderBy(desc(reportSubscriptions.createdAt));
  } catch (err) {
    throw new Error(
      `Failed to list report subscriptions: ${(err as Error).message}`, { cause: err },
    );
  }
}

/**
 * Enable or disable a subscription within its organization. Returns the updated
 * row, or `null` when no matching subscription exists in that org.
 */
export async function setEnabled(
  id: number,
  orgId: number,
  enabled: boolean,
  actorId?: number,
): Promise<ReportSubscriptionRow | null> {
  try {
    const [existing] = await db.select().from(reportSubscriptions).where(and(
      eq(reportSubscriptions.id, id), eq(reportSubscriptions.organizationId, orgId),
    )).limit(1);
    if (!existing) return null;
    if (enabled) await validateSubscriptionConfiguration({ ...existing, schedule: toSchedule(existing), format: existing.format as DeliveryFormat, channel: existing.channel as DeliveryChannel, recipients: existing.recipients ?? [] });
    const now = new Date();
    return await transaction(async client => {
      await setTenantContextTx(client, orgId);
      const [row] = await drizzle(client)
        .update(reportSubscriptions)
        .set({ enabled, ...(enabled ? { nextRunAt: computeNextRun(toSchedule(existing), now) } : {}), updatedAt: now })
        .where(
          and(
            eq(reportSubscriptions.id, id),
            eq(reportSubscriptions.organizationId, orgId),
            sql`date_trunc('milliseconds', ${reportSubscriptions.updatedAt}) = ${existing.updatedAt}::timestamp`,
            eq(reportSubscriptions.enabled, existing.enabled),
            eq(reportSubscriptions.reportTypeId, existing.reportTypeId),
            eq(reportSubscriptions.scopeType, existing.scopeType),
            eq(reportSubscriptions.scopeId, existing.scopeId),
            eq(reportSubscriptions.channel, existing.channel),
            eq(reportSubscriptions.format, existing.format),
            sql`${reportSubscriptions.schedule}::jsonb = ${JSON.stringify(existing.schedule)}::jsonb`,
            sql`COALESCE(${reportSubscriptions.recipients}::jsonb, '[]'::jsonb) = ${JSON.stringify(existing.recipients ?? [])}::jsonb`,
            sql`${reportSubscriptions.nextRunAt} IS NOT DISTINCT FROM ${existing.nextRunAt}`,
            sql`${reportSubscriptions.createdBy} IS NOT DISTINCT FROM ${existing.createdBy}`,
            sql`${reportSubscriptions.clientWorkspaceId} IS NOT DISTINCT FROM ${existing.clientWorkspaceId}`,
          ),
        )
        .returning();
      if (!row) throw new ScheduleConfigurationError('The subscription changed. Reload it before toggling its schedule.', 'REPORT_SUBSCRIPTION_CHANGED', 409);
      await writeChainedAuditRow(client, { tenantId: orgId, userId: actorId, action: 'report_os.subscription_enablement_changed', resourceType: 'report_subscription', resourceId: String(row.id),
        details: { enabled: row.enabled, nextRunAt: row.nextRunAt?.toISOString() } });
      return row;
    });
  } catch (err) {
    if (err instanceof ScheduleConfigurationError) throw err;
    throw new Error(
      `Failed to update report subscription enablement: ${(err as Error).message}`, { cause: err },
    );
  }
}

/**
 * Record that a subscription ran at `ranAt`: stamps `lastRunAt` and recomputes
 * `nextRunAt` from the schedule. Org-scoped. Returns the updated row, or `null`
 * when the subscription does not exist in that org.
 */
export async function markRun(
  id: number,
  orgId: number,
  ranAt: Date,
): Promise<ReportSubscriptionRow | null> {
  try {
    const [existing] = await db
      .select()
      .from(reportSubscriptions)
      .where(
        and(
          eq(reportSubscriptions.id, id),
          eq(reportSubscriptions.organizationId, orgId),
        ),
      );
    if (!existing) return null;

    const nextRunAt = computeNextRun(toSchedule(existing), ranAt);
    const [row] = await db
      .update(reportSubscriptions)
      .set({ lastRunAt: ranAt, nextRunAt, updatedAt: new Date() })
      .where(
        and(
          eq(reportSubscriptions.id, id),
          eq(reportSubscriptions.organizationId, orgId),
        ),
      )
      .returning();
    return row ?? null;
  } catch (err) {
    throw new Error(
      `Failed to mark report subscription run: ${(err as Error).message}`, { cause: err },
    );
  }
}

/**
 * Enabled subscriptions whose persisted nextRunAt is due. Cross-org by design: the
 * scheduler scans the whole platform.
 */
export async function listDueSubscriptions(
  now: Date,
): Promise<ReportSubscriptionRow[]> {
  try {
    const enabled = await db
      .select()
      .from(reportSubscriptions)
      .where(and(eq(reportSubscriptions.enabled, true), or(isNull(reportSubscriptions.nextRunAt), lte(reportSubscriptions.nextRunAt, now))))
      .orderBy(reportSubscriptions.nextRunAt, reportSubscriptions.id);
    return enabled.filter(sub => {
      try { return subscriptionIsDue(sub, now); }
      catch { return true; } // an invalid legacy row fails individually at generation
    });
  } catch (err) {
    throw new Error(
      `Failed to scan due report subscriptions: ${(err as Error).message}`, { cause: err },
    );
  }
}

/** Persisted nextRunAt is authoritative; legacy rows use their creation date. */
export function subscriptionIsDue(
  sub: Pick<ReportSubscriptionRow, 'schedule' | 'nextRunAt' | 'lastRunAt' | 'createdAt' | 'enabled'>,
  now: Date,
): boolean {
  if (!sub.enabled) return false;
  const next = sub.nextRunAt ?? computeNextRun(toSchedule(sub), sub.lastRunAt ?? sub.createdAt);
  return Number.isFinite(next.getTime()) && next.getTime() <= now.getTime();
}
