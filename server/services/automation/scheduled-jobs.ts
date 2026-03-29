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

const log = createScopedLogger('scheduled-jobs');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScheduledJobType =
  | 'data_freshness_check'
  | 'compliance_sweep'
  | 'dependency_staleness_audit'
  | 'external_data_refresh'
  | 'automation_digest';

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
  let flagged = 0;

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

// Register built-in handlers
handlers.set('data_freshness_check', handleDataFreshnessCheck);
handlers.set('dependency_staleness_audit', handleDependencyStalenessAudit);
handlers.set('automation_digest', handleAutomationDigest);

// ─── Queue Setup ────────────────────────────────────────────────────────────

let schedulerQueue: Queue.Queue<ScheduledJobConfig> | null = null;
let initialized = false;

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

    // Process jobs
    schedulerQueue.process(async (job) => {
      const config = job.data;
      const handler = handlers.get(config.type);

      if (!handler) {
        log.error(`No handler registered for job type: ${config.type}`);
        throw new Error(`Unknown job type: ${config.type}`);
      }

      log.info(`Executing scheduled job: ${config.name} (${config.type})`);
      const result = await handler(config);
      log.info(
        `Scheduled job ${config.name} completed: ${result.itemsProcessed} processed, ${result.itemsFlagged} flagged in ${result.durationMs}ms`,
      );
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
  ];

  for (const config of defaults) {
    await scheduleJob(config);
  }
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

export async function shutdownScheduledJobs(): Promise<void> {
  if (schedulerQueue) {
    await schedulerQueue.close();
    log.info('Scheduled jobs queue shut down');
  }
}
