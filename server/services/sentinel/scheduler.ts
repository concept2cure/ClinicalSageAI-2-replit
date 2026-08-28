/**
 * AI Sentinel — Background Scheduler
 *
 * Periodically runs all enabled Sentinel analyzers per organization.
 * Configurable interval per-org. Auto-starts on import.
 *
 * @module server/services/sentinel/scheduler.ts
 */

import { Pool } from 'pg';
import { AISentinel } from './sentinel';
import { emitRuleEvent } from '../rules-engine';
import { createScopedLogger } from '../../utils/logger.js';
import { runWithSystemTenantScope, runWithTenantScope } from '../../db/tenantStore';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  BACKGROUND_JOB,
} from '../background-jobs-metrics';
const log = createScopedLogger('sentinel-scheduler');

export class SentinelScheduler {
  private intervals = new Map<number, NodeJS.Timeout>();
  private sentinel: AISentinel;
  private running = false;
  private readonly scanning = new Set<number>();

  constructor(private pool: Pool) {
    this.sentinel = new AISentinel(pool);
  }

  getSentinel(): AISentinel {
    return this.sentinel;
  }

  /**
   * Start the background scheduler for all active organizations.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    registerBackgroundJob(BACKGROUND_JOB.SENTINEL_SCAN);

    log.debug('[SentinelScheduler] Starting background scanner...');

    try {
      // Get all active organizations. Enumerating the estate belongs to no
      // single tenant, so it runs in a system scope — otherwise this pooled read
      // fails closed under RLS_ENFORCE=on and the scheduler never starts.
      const orgs = await runWithSystemTenantScope('sentinel:enumerate-orgs', () =>
        this.pool.query(`SELECT id FROM organizations WHERE status = 'active' LIMIT 100`)
      );

      for (const org of orgs.rows) {
        await this.scheduleOrg(org.id);
      }

      log.debug(`[SentinelScheduler] Scheduled scans for ${orgs.rows.length} organizations`);
    } catch (error) {
      log.error('[SentinelScheduler] Failed to start:', error);
    }
  }

  /**
   * Schedule recurring scans for a specific organization.
   */
  async scheduleOrg(organizationId: number): Promise<void> {
    // Clear existing interval
    if (this.intervals.has(organizationId)) {
      clearInterval(this.intervals.get(organizationId)!);
    }

    // getConfig reads pm_settings for THIS org on the pooled connection. It runs
    // in that org's tenant scope for the same reason the scan at runScan() does:
    // under RLS_ENFORCE=on an unscoped pooled read is refused outright
    // ("[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope"),
    // and that refusal aborted SentinelScheduler.start() before a single org was
    // scheduled — the scheduler simply never ran with enforcement on.
    //
    // Scoped HERE, at the job boundary, rather than inside getConfig: a data
    // accessor that establishes its own tenant authority from an argument is a
    // privilege-escalation shape (a caller scoped to org A could read org B by
    // passing B's id). The boundary that already knows which org this job is for
    // is the right place to say so. Least privilege — this is the org's own
    // scope, not a system/super-admin one.
    const config = await runWithTenantScope(
      {
        tenantId: String(organizationId),
        orgUuid: null,
        role: null,
        source: 'job',
        caller: 'sentinel-schedule-org',
      },
      () => this.sentinel.getConfig(organizationId)
    );
    if (!config.enabled) {
      log.debug(`[SentinelScheduler] Sentinel disabled for org ${organizationId}`);
      return;
    }

    const intervalMs = config.intervalMinutes * 60 * 1000;

    // Run immediately, then on interval
    this.runScan(organizationId).catch(err =>
      log.error(`[SentinelScheduler] Initial scan failed for org ${organizationId}:`, err)
    );

    const timer = setInterval(() => {
      this.runScan(organizationId).catch(err =>
        log.error(`[SentinelScheduler] Scan failed for org ${organizationId}:`, err)
      );
    }, intervalMs);

    this.intervals.set(organizationId, timer);
    log.debug(
      `[SentinelScheduler] Scheduled org ${organizationId} every ${config.intervalMinutes}m`
    );
  }

  /**
   * Run a full scan and feed findings into the rules engine.
   */
  private async runScan(organizationId: number): Promise<void> {
    // Skip if a scan for this org is already in progress. setInterval fires on a
    // fixed cadence regardless of how long the previous scan took; overlapping
    // scans would double-emit rule events and pile load onto the analyzers.
    if (this.scanning.has(organizationId)) {
      log.debug(
        `[SentinelScheduler] Scan already in progress for org ${organizationId}; skipping overlap`
      );
      return;
    }
    this.scanning.add(organizationId);
    try {
      // A per-org scan reads and writes that org's data, so it runs in that
      // org's tenant scope (least privilege — not a super-admin/system scope).
      // Under RLS_ENFORCE=on this is what lets the scan's pooled queries and the
      // rule-event writes see exactly org `organizationId`'s rows instead of
      // failing closed.
      await runWithTenantScope(
        {
          tenantId: String(organizationId),
          orgUuid: null,
          role: null,
          source: 'job',
          caller: 'sentinel-scan',
        },
        () => this.runScanInner(organizationId)
      );
      // Single aggregate heartbeat across orgs: "the scanner is alive and a scan
      // completed". Per-org detail stays in logs; a per-org metric label would
      // add unbounded cardinality for no ops benefit here.
      recordBackgroundJobRun(BACKGROUND_JOB.SENTINEL_SCAN, { ok: true });
    } catch (err) {
      recordBackgroundJobRun(BACKGROUND_JOB.SENTINEL_SCAN, { ok: false, error: err });
      throw err;
    } finally {
      this.scanning.delete(organizationId);
    }
  }

  private async runScanInner(organizationId: number): Promise<void> {
    log.debug(`[SentinelScheduler] Running scan for org ${organizationId}`);
    const results = await this.sentinel.scan(organizationId);

    // Feed findings into rules engine as events
    for (const result of results) {
      for (const finding of result.findings) {
        if (finding.severity === 'high' || finding.severity === 'critical') {
          try {
            await emitRuleEvent('sentinel_finding', organizationId, finding.projectId, {
              finding: {
                findingId: finding.findingId,
                analyzerType: finding.analyzerType,
                severity: finding.severity,
                title: finding.title,
                summary: finding.summary,
              },
              severity: finding.severity,
              analyzerType: finding.analyzerType,
            });
          } catch (err) {
            log.error('[SentinelScheduler] Failed to emit rule event for finding:', err);
          }
        }
      }
    }
  }

  /**
   * Stop all scheduled scans.
   */
  stop(): void {
    for (const [orgId, timer] of this.intervals) {
      clearInterval(timer);
    }
    this.intervals.clear();
    this.running = false;
    log.debug('[SentinelScheduler] All scans stopped');
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let schedulerInstance: SentinelScheduler | null = null;

export function getSentinelScheduler(pool?: Pool): SentinelScheduler {
  if (!schedulerInstance) {
    if (!pool) throw new Error('Pool required for first initialization');
    schedulerInstance = new SentinelScheduler(pool);
  }
  return schedulerInstance;
}
