/**
 * @fileoverview Report-subscription sweep worker — fires due subscriptions.
 * @module server/services/report-os/scheduling/worker
 *
 * Subscriptions persisted fine but nothing ever ran them. This worker closes
 * the loop: on a cadence it scans `listDueSubscriptions`, re-checks each
 * subscription's entitlement AT FIRE TIME (a downgraded org must stop
 * receiving scheduled reports), runs+delivers the entitled ones, and advances
 * their next-run cursor via `markRun`.
 *
 * The decision core (`planSweep`) is PURE and dependency-injected so it is
 * unit-testable with a fake clock and fake generators — no Redis, no DB. The
 * `sweepDueSubscriptions` orchestrator wires the real subscription service +
 * an injected `generateAndDeliver`, and `registerSubscriptionSweep` mounts it
 * on the existing Bull scheduler (graceful Redis-absent no-op, exactly like
 * automation/scheduled-jobs.ts).
 */

import { createScopedLogger } from '../../../utils/logger';
import { isEntitled } from '../../entitlements/mdx-entitlements';
import type { Tier } from '../../entitlements/types';
import { listDueSubscriptions, markRun } from './subscription-service';
import { runWithSystemTenantScope, runWithTenantScope } from '../../../db/tenantStore';
import type { ReportSubscriptionRow } from '@shared/schema/report-os';

const logger = createScopedLogger('report-subscription-sweep');

/** Outcome for one subscription in a sweep. */
export type SweepDisposition = 'ran' | 'skipped_entitlement' | 'failed';

export interface SweepItemResult {
  subscriptionId: number;
  organizationId: number;
  reportTypeId: string;
  disposition: SweepDisposition;
  reason?: string;
}

export interface SweepSummary {
  scanned: number;
  ran: number;
  skippedEntitlement: number;
  failed: number;
  items: SweepItemResult[];
}

export interface SweepDeps {
  /** Due subscriptions to process (already time-filtered). */
  due: ReportSubscriptionRow[];
  /** Resolve an org's current tier (may be a downgrade since subscribe time). */
  resolveTier: (organizationId: number) => Promise<Tier>;
  /** Generate + deliver the report for one subscription. Throws on failure. */
  generateAndDeliver: (sub: ReportSubscriptionRow) => Promise<void>;
  /** Advance the subscription's next-run cursor after a successful run. */
  onRan: (sub: ReportSubscriptionRow) => Promise<void>;
  /** Record a governed skip (downgraded org) — best-effort, never throws. */
  onSkip?: (sub: ReportSubscriptionRow, reason: string) => Promise<void>;
}

/**
 * PURE-ish orchestration over injected deps (no direct DB/Redis). For each due
 * subscription: re-check `scheduled_reports` entitlement; skip+audit if the
 * org has been downgraded; otherwise generate+deliver and advance the cursor.
 * A single subscription's failure never aborts the sweep.
 */
export async function planSweep(deps: SweepDeps): Promise<SweepSummary> {
  const items: SweepItemResult[] = [];
  for (const sub of deps.due) {
    const base = {
      subscriptionId: sub.id,
      organizationId: sub.organizationId,
      reportTypeId: sub.reportTypeId,
    };
    try {
      const tier = await deps.resolveTier(sub.organizationId);
      if (!isEntitled('scheduled_reports', tier)) {
        const reason = `Org tier '${tier}' is not entitled to scheduled reports.`;
        if (deps.onSkip) await deps.onSkip(sub, reason).catch(() => undefined);
        items.push({ ...base, disposition: 'skipped_entitlement', reason });
        continue;
      }
      await deps.generateAndDeliver(sub);
      await deps.onRan(sub);
      items.push({ ...base, disposition: 'ran' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('subscription run failed', { subscriptionId: sub.id, reason });
      items.push({ ...base, disposition: 'failed', reason });
    }
  }
  return {
    scanned: deps.due.length,
    ran: items.filter((i) => i.disposition === 'ran').length,
    skippedEntitlement: items.filter((i) => i.disposition === 'skipped_entitlement').length,
    failed: items.filter((i) => i.disposition === 'failed').length,
    items,
  };
}

/**
 * Concrete sweep: pull due subscriptions from the DB and run the plan with the
 * real tier resolver + generator + cursor advance. `generateAndDeliver` is
 * injected so the heavy report pipeline stays decoupled and mockable.
 *
 * Tenant scoping (required under RLS_ENFORCE=on):
 *   - The due-subscription scan spans every org, so it runs in a SYSTEM scope —
 *     otherwise this estate-wide pooled read fails closed and no subscription
 *     ever fires (silent in dev where enforcement is off, broken in prod).
 *   - Each subscription's tier resolution, compute+deliver, and cursor advance
 *     read and write that org's data, so they run in THAT ORG'S tenant scope
 *     (least privilege — not a system/super-admin scope). `planSweep` stays
 *     pure; the scoping is layered onto the injected deps here.
 */
export async function sweepDueSubscriptions(
  now: Date,
  generateAndDeliver: (sub: ReportSubscriptionRow) => Promise<void>,
  resolveTier: (organizationId: number) => Promise<Tier>,
): Promise<SweepSummary> {
  const due = await runWithSystemTenantScope('report-sweep:scan', () =>
    listDueSubscriptions(now),
  );
  const inOrgScope = <T>(organizationId: number, caller: string, fn: () => Promise<T>) =>
    runWithTenantScope(
      {
        tenantId: String(organizationId),
        orgUuid: null,
        role: null,
        source: 'job',
        caller,
      },
      fn,
    );
  return planSweep({
    due,
    resolveTier: (organizationId) =>
      inOrgScope(organizationId, 'report-sweep:resolve-tier', () => resolveTier(organizationId)),
    generateAndDeliver: (sub) =>
      inOrgScope(sub.organizationId, 'report-sweep:generate-deliver', () => generateAndDeliver(sub)),
    onRan: async (sub) => {
      await inOrgScope(sub.organizationId, 'report-sweep:mark-run', () =>
        markRun(sub.id, sub.organizationId, now),
      );
    },
    onSkip: async (sub, reason) => {
      logger.info('scheduled report skipped (entitlement)', {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        reason,
      });
    },
  });
}
