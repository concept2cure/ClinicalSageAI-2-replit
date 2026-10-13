/** Redis-free report sweep. A session advisory lock elects one active sweep
 * across processes; atomic generation commits output, notifications and cursor. */
import { getPool } from '../../../db';
import type { PoolClient } from 'pg';
import { runWithSystemTenantScope } from '../../../db/tenantStore';
import { createScopedLogger } from '../../../utils/logger';
import { resolveCapabilities } from '../../entitlements/resolver';
import type { Tier } from '../../entitlements/types';
import { generateAndDeliver } from './generate-deliver';
import { sweepDueSubscriptions } from './worker';
import { recordBackgroundJobRun, registerBackgroundJob, BACKGROUND_JOB } from '../../background-jobs-metrics';

// Preserve the public engine entry point for existing callers and regressions.
export { generateAndDeliver } from './generate-deliver';

const log = createScopedLogger('report-subscription-sweep');
const LOCK_NAMESPACE = 0x523053; // Report-OS, shared by every process.
const configuredInterval = Number(process.env.REPORT_SWEEP_INTERVAL_MS ?? 600_000);
const SWEEP_INTERVAL_MS = Number.isFinite(configuredInterval) && configuredInterval >= 10_000 ? configuredInterval : 600_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function resolveTier(organizationId: number): Promise<Tier> {
  try { return (await resolveCapabilities(organizationId)).tier; } catch { return 'standard'; }
}

export async function runSubscriptionSweepTick(): Promise<void> {
  if (running) return;
  running = true;
  try { await runWithSystemTenantScope('report-sweep:coordination', runLockedSweep); }
  finally { running = false; }
}

async function runLockedSweep(): Promise<void> {
  let client: PoolClient | undefined;
  let locked = false;
  try {
    client = await getPool().connect();
    const lock = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS acquired', [LOCK_NAMESPACE, 1]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) {
      recordBackgroundJobRun(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, { ok: true, processed: 0 });
      return; // a healthy follower; no subscription delivery is claimed
    }
    const now = new Date();
    const summary = await sweepDueSubscriptions(now, sub => generateAndDeliver(sub, now), resolveTier, { cursorCommittedByGenerator: true });
    log.info('subscription sweep complete', { scanned: summary.scanned, ran: summary.ran, skippedEntitlement: summary.skippedEntitlement, failed: summary.failed });
    recordBackgroundJobRun(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, { ok: summary.failed === 0, processed: summary.ran, ...(summary.failed ? { error: `${summary.failed} subscription deliveries failed` } : {}) });
  } catch (error) {
    recordBackgroundJobRun(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, { ok: false, error });
    log.error('subscription sweep failed', { reason: error instanceof Error ? error.message : String(error) });
  } finally {
    let releaseError: Error | undefined;
    if (locked && client) {
      try { await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, 1]); }
      catch (error) {
        releaseError = error instanceof Error ? error : new Error(String(error));
        log.error('subscription lock release failed', { reason: releaseError.message });
      }
    }
    client?.release(releaseError); // destroy a connection carrying an unproven lock
  }
}

/** Kept signature-compatible with startup; Redis is intentionally unnecessary. */
export async function initSubscriptionSweep(_redisUrl?: string): Promise<void> {
  if (timer) return;
  registerBackgroundJob(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP);
  timer = setInterval(() => { void runSubscriptionSweepTick(); }, SWEEP_INTERVAL_MS);
  timer.unref();
  void runSubscriptionSweepTick();
  log.info('report subscription sweep registered with PostgreSQL coordination', { intervalMs: SWEEP_INTERVAL_MS });
}

export function stopSubscriptionSweep(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
