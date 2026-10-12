/**
 * @fileoverview Register the report-subscription sweep on a Bull schedule.
 * @module server/services/report-os/scheduling/worker-register
 *
 * Mirrors the proven pattern in server/services/automation/scheduled-jobs.ts:
 * a repeatable Bull job on a cron, with graceful degradation when Redis is
 * absent (log + no-op, never crash boot). The job body is the tested
 * `sweepDueSubscriptions` core; the concrete `generateAndDeliver` computes the
 * run (real work via the orchestrator), applies the delivery gate, and records
 * the outcome. Full immutable-run persistence and external email transport are
 * deliberately left to the existing /runs + /deliveries paths — this worker
 * closes the "nothing fires subscriptions" gap without duplicating that logic.
 */

import Queue from 'bull';
import { createScopedLogger } from '../../../utils/logger';
import { resolveCapabilities } from '../../entitlements/resolver';
import type { Tier } from '../../entitlements/types';
import { computeInitialRun } from '../orchestrator';
import { computeDomainRun, computeRegionalRun, reportEngineFor, reportTypeNotComputedMessage } from '../report-engine';
import { decideDelivery } from './delivery';
import { sweepDueSubscriptions } from './worker';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  BACKGROUND_JOB,
} from '../../background-jobs-metrics';
import type { DeliveryChannel } from './types';
import type { ReportSubscriptionRow } from '@shared/schema/report-os';
import type { ReportScope } from '@shared/schema/report-os';

const log = createScopedLogger('report-subscription-sweep');

/** How often the sweep scans for due subscriptions. Env-overridable. */
const SWEEP_CRON = process.env.REPORT_SWEEP_CRON || '*/10 * * * *'; // every 10 min

let queue: Queue.Queue | null = null;
let initialized = false;

/** Resolve an org's current tier; fail-closed to 'standard' on error. */
async function resolveTier(organizationId: number): Promise<Tier> {
  try {
    return (await resolveCapabilities(organizationId)).tier;
  } catch {
    return 'standard';
  }
}

/**
 * Compute the subscription's report and apply the delivery gate. Real compute;
 * the delivery decision (e-signature / watermark) is honored and recorded.
 * Throws on compute failure so the sweep marks the item failed and does NOT
 * advance the cursor.
 *
 * ── THE ENGINE IS CHOSEN BY TYPE, as POST /runs chooses it ───────────────────
 * This called `computeInitialRun` for every subscription, passing the type as
 * an `explicitRegistryId` that `orchestrator.ts` declares and never reads. That
 * is precisely the QA 2026-10-08 j8 defect `report-engine.ts` was written to
 * close: "POST /runs called the readiness orchestrator for every reportTypeId
 * […] So 'EMA RMP / PSUR Signal Alignment', 'NMPA CTD Module Gap Analysis' and
 * 'Compliance & Audit Assurance' were the Executive Readiness Digest with
 * another heading — a report claiming an analysis nothing performed."
 *
 * The route was fixed; this path was not, so a schedule over any of the sixteen
 * domain registers computed the readiness digest and stamped it with the
 * register's name and the time it ran. It had no caller until the Schedules
 * screen gave it one (2026-10-11 coverage review), which is how it surfaced.
 *
 * The dispatch below mirrors `report-os.ts` exactly: a register is its own
 * provider's run and nothing of the digest. A type no engine computes now
 * THROWS, so the sweep marks the item failed and does not advance its cursor —
 * rather than silently substituting the digest. That also makes the client's
 * `schedulableTypes` filter true rather than merely prudent.
 *
 * Exported for its test, as `sweepDueSubscriptions` is: the engine choice is
 * the part worth pinning, and the sweep's own registration needs Redis.
 */
export async function generateAndDeliver(sub: ReportSubscriptionRow): Promise<void> {
  const scopeType = sub.scopeType as ReportScope;
  const engine = reportEngineFor(sub.reportTypeId, scopeType);
  if (engine == null) {
    throw new Error(reportTypeNotComputedMessage(sub.reportTypeId));
  }
  /* A market assessment reads the type's own declared region and dependencies
     from the deployed registry when, as here, the caller holds no row — so a
     scheduled market report is exactly as honest as an interactive one, and a
     market it cannot assess throws like any other compute failure. */
  const computed =
    engine === 'domain'
      ? await computeDomainRun(sub.reportTypeId, sub.organizationId, scopeType, sub.scopeId)
      : engine === 'regional'
        ? await computeRegionalRun(sub.reportTypeId, sub.organizationId, scopeType, sub.scopeId)
        : await computeInitialRun(sub.organizationId, scopeType, sub.scopeId, {
            explicitRegistryId: sub.reportTypeId,
          });
  // A freshly computed scheduled run is inherently non-final — sealing/final
  // is a separate governed action (POST /runs/:id/finalize), never automatic.
  // It is 'partial' when the compute succeeded with no critical blockers,
  // else 'draft'. The delivery gate only distinguishes final vs non-final, so
  // this is sufficient and honest (external sends are watermarked as draft).
  const status = computed.criticalBlockers.length === 0 ? 'partial' : 'draft';
  const decision = decideDelivery({ status }, sub.channel as DeliveryChannel);
  if (!decision.allowed) {
    throw new Error(`Delivery not permitted for subscription ${sub.id} on ${sub.channel}`);
  }
  log.info('scheduled report fired', {
    subscriptionId: sub.id,
    organizationId: sub.organizationId,
    reportTypeId: sub.reportTypeId,
    status,
    channel: sub.channel,
    requiresESignature: decision.requiresESignature,
    watermark: decision.watermark,
  });
}

/**
 * Initialize the subscription sweep. Call once at server startup. No-op (with
 * a log) when Redis is not configured.
 */
export async function initSubscriptionSweep(redisUrl?: string): Promise<void> {
  if (initialized) return;
  const redis = redisUrl || process.env.REDIS_URL;
  if (!redis) {
    log.warn('REDIS_URL not configured — report subscription sweep disabled (graceful degradation)');
    initialized = true;
    return;
  }
  try {
    queue = new Queue('c2c-report-subscription-sweep', redis, {
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50, attempts: 2 },
    });
    registerBackgroundJob(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP);
    queue.process(async () => {
      try {
        const summary = await sweepDueSubscriptions(new Date(), generateAndDeliver, resolveTier);
        log.info('subscription sweep complete', {
          scanned: summary.scanned,
          ran: summary.ran,
          skippedEntitlement: summary.skippedEntitlement,
          failed: summary.failed,
        });
        // Heartbeat: the sweep ran. `processed` is the number of subscriptions
        // actually fired this tick. A per-subscription failure is isolated
        // inside planSweep and does not fail the tick — only a scan-level
        // throw (e.g. the estate-wide read failing closed) does, and that is
        // recorded as a failure below.
        recordBackgroundJobRun(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, {
          ok: true,
          processed: summary.ran,
        });
        return summary;
      } catch (err) {
        recordBackgroundJobRun(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, { ok: false, error: err });
        throw err;
      }
    });
    queue.on('error', (err) => log.error(`sweep queue error: ${err.message}`));
    await queue.add({}, { repeat: { cron: SWEEP_CRON } });
    initialized = true;
    log.info(`report subscription sweep scheduled (${SWEEP_CRON})`);
  } catch (err) {
    log.warn(`Failed to init subscription sweep: ${err instanceof Error ? err.message : String(err)} — disabled`);
    initialized = true;
  }
}
