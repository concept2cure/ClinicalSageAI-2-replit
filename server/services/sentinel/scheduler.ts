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

export class SentinelScheduler {
  private intervals = new Map<number, NodeJS.Timeout>();
  private sentinel: AISentinel;
  private running = false;

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

    console.log('[SentinelScheduler] Starting background scanner...');

    try {
      // Get all active organizations
      const orgs = await this.pool.query(
        `SELECT id FROM organizations WHERE status = 'active' LIMIT 100`
      );

      for (const org of orgs.rows) {
        await this.scheduleOrg(org.id);
      }

      console.log(`[SentinelScheduler] Scheduled scans for ${orgs.rows.length} organizations`);
    } catch (error) {
      console.error('[SentinelScheduler] Failed to start:', error);
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

    const config = await this.sentinel.getConfig(organizationId);
    if (!config.enabled) {
      console.log(`[SentinelScheduler] Sentinel disabled for org ${organizationId}`);
      return;
    }

    const intervalMs = config.intervalMinutes * 60 * 1000;

    // Run immediately, then on interval
    this.runScan(organizationId).catch(err =>
      console.error(`[SentinelScheduler] Initial scan failed for org ${organizationId}:`, err)
    );

    const timer = setInterval(() => {
      this.runScan(organizationId).catch(err =>
        console.error(`[SentinelScheduler] Scan failed for org ${organizationId}:`, err)
      );
    }, intervalMs);

    this.intervals.set(organizationId, timer);
    console.log(
      `[SentinelScheduler] Scheduled org ${organizationId} every ${config.intervalMinutes}m`
    );
  }

  /**
   * Run a full scan and feed findings into the rules engine.
   */
  private async runScan(organizationId: number): Promise<void> {
    console.log(`[SentinelScheduler] Running scan for org ${organizationId}`);
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
            console.error('[SentinelScheduler] Failed to emit rule event for finding:', err);
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
    console.log('[SentinelScheduler] All scans stopped');
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
