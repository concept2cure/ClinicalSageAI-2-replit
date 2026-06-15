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

import { and, eq } from 'drizzle-orm';
import { db } from '../../../db';
import {
  reportSubscriptions,
  type ReportSubscriptionRow,
} from '@shared/schema/report-os';
import { computeNextRun, isDue } from './cadence';
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
    const now = new Date();
    const [row] = await db
      .insert(reportSubscriptions)
      .values({
        organizationId: input.organizationId,
        clientWorkspaceId: input.clientWorkspaceId ?? null,
        reportTypeId: input.reportTypeId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        schedule: input.schedule as unknown as ReportSubscriptionRow['schedule'],
        recipients: input.recipients ?? [],
        format: input.format ?? 'pdf',
        channel: input.channel ?? 'platform',
        persona: input.persona ?? null,
        enabled: input.enabled ?? true,
        nextRunAt: computeNextRun(input.schedule, now),
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return row;
  } catch (err) {
    throw new Error(
      `Failed to create report subscription: ${(err as Error).message}`,
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
      .where(eq(reportSubscriptions.organizationId, orgId));
  } catch (err) {
    throw new Error(
      `Failed to list report subscriptions: ${(err as Error).message}`,
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
): Promise<ReportSubscriptionRow | null> {
  try {
    const [row] = await db
      .update(reportSubscriptions)
      .set({ enabled, updatedAt: new Date() })
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
      `Failed to update report subscription enablement: ${(err as Error).message}`,
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
      `Failed to mark report subscription run: ${(err as Error).message}`,
    );
  }
}

/**
 * Enabled subscriptions whose schedule is due at `now` (per {@link isDue},
 * anchored on each subscription's `lastRunAt`). Cross-org by design: the
 * scheduler scans the whole platform.
 */
export async function listDueSubscriptions(
  now: Date,
): Promise<ReportSubscriptionRow[]> {
  try {
    const enabled = await db
      .select()
      .from(reportSubscriptions)
      .where(eq(reportSubscriptions.enabled, true));
    return enabled.filter(sub =>
      isDue(toSchedule(sub), sub.lastRunAt, now),
    );
  } catch (err) {
    throw new Error(
      `Failed to scan due report subscriptions: ${(err as Error).message}`,
    );
  }
}
