/**
 * Scheduled Automation Jobs
 *
 * Bull-queue-backed scheduled automation for recurring tasks:
 * - Periodic data-freshness checks (are source documents stale?)
 * - Scheduled compliance sweeps (re-scan artifacts on cadence)
 * - Dependency staleness audit (find stale dependencies not yet propagated)
 * - External data refresh (pull latest from ClinicalTrials.gov, Drugs@FDA)
 *
 * Uses Bull's repeatable jobs with cron expressions. Falls back gracefully
 * when Redis is unavailable (logs and skips).
 *
 * @module server/services/automation/scheduled-jobs
 */

import Queue from 'bull';
import { createScopedLogger } from '../../utils/logger.js';
import { runProactiveDigest } from '../digest/proactive-digest.js';
import { parseDigestPreferences } from '../digest/digest-preferences.js';
import { runWithSystemTenantScope, runWithTenantScope } from '../../db/tenantStore';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  BACKGROUND_JOB,
} from '../background-jobs-metrics';

const log = createScopedLogger('scheduled-jobs');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScheduledJobType =
  | 'data_freshness_check'
  | 'compliance_sweep'
  | 'dependency_staleness_audit'
  | 'external_data_refresh'
  | 'automation_digest'
  | 'proactive_digest'
  | 'platform_maintenance';

export interface ScheduledJobConfig {
  readonly type: ScheduledJobType;
  readonly name: string;
  readonly description: string;
  readonly cron: string;
  readonly enabled: boolean;
  readonly organizationId: number;
  readonly projectId?: number;
  readonly parameters: Record<string, string | number | boolean>;
}

export interface ScheduledJobRun {
  readonly jobType: ScheduledJobType;
  readonly organizationId: number;
  readonly projectId?: number;
  readonly status: 'started' | 'completed' | 'failed';
  readonly itemsProcessed: number;
  readonly itemsFlagged: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly error?: string;
}

// ─── Job Handlers ───────────────────────────────────────────────────────────

type JobHandler = (config: ScheduledJobConfig) => Promise<ScheduledJobRun>;

const handlers = new Map<ScheduledJobType, JobHandler>();

/**
 * Register a handler for a scheduled job type.
 * Handlers are injected at startup to avoid circular imports.
 */
export function registerJobHandler(type: ScheduledJobType, handler: JobHandler): void {
  handlers.set(type, handler);
  log.info(`Registered handler for scheduled job type: ${type}`);
}

// ─── Built-in Handler: Data Freshness Check ─────────────────────────────────

async function handleDataFreshnessCheck(config: ScheduledJobConfig): Promise<ScheduledJobRun> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  // Check how old each source document is relative to its dependent artifacts
  const maxAgeDays = Number(config.parameters.maxAgeDays) || 30;
  let processed = 0;
  const flagged = 0;

  // In production, this would query:
  //   SELECT * FROM concept2cure_artifacts WHERE type = 'source_document'
  //   AND updated_at < NOW() - INTERVAL '${maxAgeDays} days'
  // For now, log the intent
  log.info(
    `Data freshness check: scanning documents older than ${maxAgeDays} days for org ${config.organizationId}`,
  );
  processed = 1; // Placeholder — real query count

  return {
    jobType: config.type,
    organizationId: config.organizationId,
    projectId: config.projectId,
    status: 'completed',
    itemsProcessed: processed,
    itemsFlagged: flagged,
    durationMs: Date.now() - start,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function handleDependencyStalenessAudit(config: ScheduledJobConfig): Promise<ScheduledJobRun> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  log.info(
    `Dependency staleness audit: checking governed_dependencies for org ${config.organizationId}`,
  );

  // In production, query governed_dependencies WHERE is_stale = true AND resolved_at IS NULL
  const processed = 0;
  const flagged = 0;

  return {
    jobType: config.type,
    organizationId: config.organizationId,
    projectId: config.projectId,
    status: 'completed',
    itemsProcessed: processed,
    itemsFlagged: flagged,
    durationMs: Date.now() - start,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function handleAutomationDigest(config: ScheduledJobConfig): Promise<ScheduledJobRun> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  log.info(
    `Automation digest: compiling daily summary for org ${config.organizationId}`,
  );

  // In production: aggregate rewrite jobs, webhook deliveries, flagged items from last 24h
  return {
    jobType: config.type,
    organizationId: config.organizationId,
    status: 'completed',
    itemsProcessed: 0,
    itemsFlagged: 0,
    durationMs: Date.now() - start,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// ─── Built-in Handler: Platform Maintenance ───────────────────────────────

async function handlePlatformMaintenance(config: ScheduledJobConfig): Promise<ScheduledJobRun> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  try {
    const { runPlatformMaintenance } = await import('../maintenance/platform-maintenance.js');
    const result = await runPlatformMaintenance(config.organizationId);

    const processed =
      result.tokenCleanup.expiredRemoved +
      result.bridgeIntegrity.linkedDocuments +
      result.bridgeBackfill.linked;
    const flagged = result.bridgeIntegrity.orphanedLinks;

    return {
      jobType: config.type,
      organizationId: config.organizationId,
      status: 'completed',
      itemsProcessed: processed,
      itemsFlagged: flagged,
      durationMs: Date.now() - start,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      jobType: config.type,
      organizationId: config.organizationId,
      status: 'failed',
      itemsProcessed: 0,
      itemsFlagged: 0,
      durationMs: Date.now() - start,
      startedAt,
      completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Proactive digest: materialize the org's overdue/due-soon regulatory deadlines
 * and open risks into a single in-app notification (see services/digest). Lets
 * the platform reach users with time-critical regulatory state without them
 * having to open AnA. Fails soft — a digest miss never breaks the job runner.
 */
async function handleProactiveDigest(config: ScheduledJobConfig): Promise<ScheduledJobRun> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    const preferences = parseDigestPreferences(config.parameters);
    const result = await runProactiveDigest(config.organizationId, preferences);
    const created = result.created ? 1 : 0;
    return {
      jobType: config.type,
      organizationId: config.organizationId,
      status: 'completed',
      itemsProcessed: created,
      itemsFlagged: created,
      durationMs: Date.now() - start,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      jobType: config.type,
      organizationId: config.organizationId,
      status: 'failed',
      itemsProcessed: 0,
      itemsFlagged: 0,
      durationMs: Date.now() - start,
      startedAt,
      completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Register built-in handlers
handlers.set('data_freshness_check', handleDataFreshnessCheck);
handlers.set('dependency_staleness_audit', handleDependencyStalenessAudit);
handlers.set('automation_digest', handleAutomationDigest);
handlers.set('proactive_digest', handleProactiveDigest);
handlers.set('platform_maintenance', handlePlatformMaintenance);

// ─── Queue Setup ────────────────────────────────────────────────────────────

let schedulerQueue: Queue.Queue<ScheduledJobConfig> | null = null;
let initialized = false;

/**
 * Whether the Bull scheduler queue actually came up. False on a Redis-less
 * deploy — the state in which every schedule this module owns (including the
 * 7 AM proactive digest, the platform's only unprompted surface) silently
 * never fires. The digest heartbeat (services/digest/digest-heartbeat.ts)
 * consults this at boot to decide whether it must stand in.
 */
export function isSchedulerQueueActive(): boolean {
  return schedulerQueue !== null;
}

/**
 * Initialize the scheduled jobs queue.
 * Call once at server startup.
 */
export async function initScheduledJobs(redisUrl?: string): Promise<void> {
  if (initialized) return;

  const redis = redisUrl || process.env.REDIS_URL;
  if (!redis) {
    log.warn('REDIS_URL not configured — scheduled jobs disabled (graceful degradation)');
    initialized = true;
    return;
  }

  try {
    schedulerQueue = new Queue<ScheduledJobConfig>('c2c-scheduled-automation', redis, {
      defaultJobOptions: {
        removeOnComplete: 100,    // Keep last 100 completed jobs
        removeOnFail: 50,         // Keep last 50 failed jobs
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    });
    registerBackgroundJob(BACKGROUND_JOB.SCHEDULED_JOBS);

    // Process jobs
    schedulerQueue.process(async (job) => {
      const config = job.data;
      const handler = handlers.get(config.type);

      if (!handler) {
        log.error(`No handler registered for job type: ${config.type}`);
        recordBackgroundJobRun(BACKGROUND_JOB.SCHEDULED_JOBS, {
          ok: false,
          error: `unknown job type: ${config.type}`,
        });
        throw new Error(`Unknown job type: ${config.type}`);
      }

      log.info(`Executing scheduled job: ${config.name} (${config.type})`);
      // Every scheduled job is registered per-org (config.organizationId), and
      // its handler reads/writes that org's data (e.g. proactive digest,
      // platform maintenance). Run it in that org's tenant scope so the
      // handler's pooled queries are permitted and correctly filtered under
      // RLS_ENFORCE=on — otherwise the Bull worker context carries no scope and
      // every handler's DB access fails closed.
      const result = await runWithTenantScope(
        {
          tenantId: String(config.organizationId),
          orgUuid: null,
          role: null,
          source: 'job',
          caller: `scheduled-job:${config.type}`,
        },
        () => handler(config),
      );
      log.info(
        `Scheduled job ${config.name} completed: ${result.itemsProcessed} processed, ${result.itemsFlagged} flagged in ${result.durationMs}ms`,
      );
      // Handlers report failure via result.status rather than throwing, so the
      // heartbeat reads the result. 'failed' marks the tick down without
      // aborting the queue.
      recordBackgroundJobRun(BACKGROUND_JOB.SCHEDULED_JOBS, {
        ok: result.status !== 'failed',
        processed: result.itemsProcessed,
        error: result.error,
      });
      return result;
    });

    schedulerQueue.on('error', (err) => {
      log.error(`Scheduler queue error: ${err.message}`);
    });

    schedulerQueue.on('failed', (job, err) => {
      log.error(`Scheduled job ${job.data.name} failed: ${err.message}`);
    });

    initialized = true;
    log.info('Scheduled jobs queue initialized');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to initialize scheduler queue: ${msg} — scheduled jobs disabled`);
    initialized = true;
  }
}

// ─── Schedule Management ────────────────────────────────────────────────────

/**
 * Add or update a repeatable scheduled job.
 */
export async function scheduleJob(config: ScheduledJobConfig): Promise<{ jobId: string; nextRun: string } | null> {
  if (!schedulerQueue) {
    log.warn(`Cannot schedule job ${config.name} — queue not initialized`);
    return null;
  }

  if (!config.enabled) {
    log.info(`Job ${config.name} is disabled — removing from schedule`);
    await removeScheduledJob(config.type, config.organizationId);
    return null;
  }

  const jobKey = `${config.organizationId}:${config.type}${config.projectId ? ':' + config.projectId : ''}`;

  const job = await schedulerQueue.add(config, {
    repeat: { cron: config.cron },
    jobId: jobKey,
  });

  const nextRun = new Date(Date.now() + 60_000).toISOString(); // Approximate

  log.info(`Scheduled job: ${config.name} (${config.cron}) — key=${jobKey}`);
  return { jobId: String(job.id), nextRun };
}

/**
 * Remove a scheduled repeatable job.
 */
export async function removeScheduledJob(type: ScheduledJobType, organizationId: number): Promise<void> {
  if (!schedulerQueue) return;

  const repeatableJobs = await schedulerQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.key?.includes(`${organizationId}:${type}`)) {
      await schedulerQueue.removeRepeatableByKey(job.key);
      log.info(`Removed scheduled job: ${job.key}`);
    }
  }
}

/**
 * List all active scheduled jobs for an organization.
 */
export async function listScheduledJobs(organizationId: number): Promise<Array<{ type: string; cron: string; nextRun: string | null }>> {
  if (!schedulerQueue) return [];

  const repeatableJobs = await schedulerQueue.getRepeatableJobs();
  return repeatableJobs
    .filter(j => j.key?.includes(String(organizationId)))
    .map(j => ({
      type: j.name || j.key || 'unknown',
      cron: j.cron || '',
      nextRun: j.next ? new Date(j.next).toISOString() : null,
    }));
}

// ─── Default Schedules ──────────────────────────────────────────────────────

/**
 * Register default scheduled jobs for an organization.
 * Call during organization setup or on first login.
 */
export async function registerDefaultSchedules(organizationId: number): Promise<void> {
  const defaults: ScheduledJobConfig[] = [
    {
      type: 'data_freshness_check',
      name: 'Daily Data Freshness Check',
      description: 'Scan source documents for staleness and flag outdated dependencies',
      cron: '0 6 * * *',  // 6 AM daily
      enabled: true,
      organizationId,
      parameters: { maxAgeDays: 30 },
    },
    {
      type: 'dependency_staleness_audit',
      name: 'Weekly Dependency Audit',
      description: 'Audit all governed dependencies for unresolved staleness',
      cron: '0 8 * * 1',  // 8 AM every Monday
      enabled: true,
      organizationId,
      parameters: {},
    },
    {
      type: 'automation_digest',
      name: 'Daily Automation Digest',
      description: 'Send a daily summary of all automation activity to configured channels',
      cron: '0 17 * * 1-5',  // 5 PM weekdays
      enabled: true,
      organizationId,
      parameters: {},
    },
    {
      type: 'proactive_digest',
      name: 'Daily Regulatory Digest',
      description: 'In-app digest of overdue/due-soon regulatory deadlines and open risks',
      cron: '0 7 * * 1-5',  // 7 AM weekdays — start the day with what needs attention
      enabled: true,
      organizationId,
      // Tunable via digest preferences (parseDigestPreferences):
      //   minSeverity: 'info' | 'warning' | 'critical'  (only fire at/above floor)
      //   mutedSignals: csv of 'deadlines','risks','contradictions'
      //   quietHoursStart / quietHoursEnd: 0–23 (suppress delivery in-window)
      parameters: {},
    },
    {
      type: 'platform_maintenance',
      name: 'Platform Maintenance',
      description: 'Token revocation cleanup, bridge integrity check, and artifact-document backfill',
      cron: '0 3 * * *',  // 3 AM daily
      enabled: true,
      organizationId,
      parameters: {},
    },
  ];

  for (const config of defaults) {
    await scheduleJob(config);
  }
}

/**
 * Register the default schedules (incl. the 7 AM proactive regulatory digest)
 * for EVERY active organization. Called once at startup so the digest cron
 * actually fires — `registerDefaultSchedules` is per-org and otherwise has no
 * caller. Idempotent: Bull keys repeatable jobs by `${orgId}:${type}`, so
 * re-registering on each boot updates in place rather than duplicating.
 *
 * No-op (with a log) when the scheduler queue is not initialized (no Redis),
 * so we don't spam per-org/per-job warnings in dev.
 */
export async function registerDefaultSchedulesForActiveOrgs(): Promise<number> {
  if (!schedulerQueue) {
    log.info('Scheduler queue not initialized (no Redis) — skipping default schedule registration');
    return 0;
  }
  // Lazy import to avoid pulling the DB runtime into this module's load graph.
  const { pool } = await import('../../db/runtime.js');
  let orgIds: number[] = [];
  try {
    // Enumerating every active org belongs to no single tenant, so it runs in a
    // system scope — otherwise this estate-wide read fails closed under
    // RLS_ENFORCE=on and no org's default schedules (incl. the regulatory
    // digest cron) ever register.
    const { rows } = await runWithSystemTenantScope('scheduled-jobs:enumerate-orgs', () =>
      pool.query<{ id: number }>(
        `SELECT id FROM organizations WHERE status = 'active'`,
      ),
    );
    orgIds = rows.map((r) => r.id);
  } catch (err) {
    log.warn(
      `Could not enumerate active organizations for default schedules: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }

  let registered = 0;
  for (const orgId of orgIds) {
    try {
      await registerDefaultSchedules(orgId);
      registered += 1;
    } catch (err) {
      log.warn(
        `Failed to register default schedules for org ${orgId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  log.info(`Registered default schedules for ${registered}/${orgIds.length} active organizations`);
  return registered;
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

export async function shutdownScheduledJobs(): Promise<void> {
  if (schedulerQueue) {
    await schedulerQueue.close();
    log.info('Scheduled jobs queue shut down');
  }
}
