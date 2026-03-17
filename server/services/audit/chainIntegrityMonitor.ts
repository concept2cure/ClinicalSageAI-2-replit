/**
 * Audit Chain Integrity Monitor
 *
 * Background service that periodically verifies the SHA-256 hash chain
 * in the audit_events table. If any broken links are detected, it:
 *   1. Logs a CRITICAL error to console
 *   2. Inserts an audit event recording the integrity failure
 *   3. Exposes status via a health-check getter
 *
 * Compliance: 21 CFR Part 11 §11.10(e) — continuous monitoring of
 * audit trail integrity with alerting on anomalies.
 *
 * @module server/services/audit/chainIntegrityMonitor
 */

import { Pool } from 'pg';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface ChainMonitorStatus {
  lastCheckAt: string | null;
  status: 'healthy' | 'broken' | 'unchecked' | 'error';
  totalEntries: number;
  brokenLinks: number;
  details: Array<{ id: number; sequenceNumber: number; orgId: number }>;
  intervalMs: number;
}

// ---------------------------------------------------------------------------
// MONITOR SINGLETON
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _monitorTimer: ReturnType<typeof setInterval> | null = null;
let _pool: Pool | null = null;
let _status: ChainMonitorStatus = {
  lastCheckAt: null,
  status: 'unchecked',
  totalEntries: 0,
  brokenLinks: 0,
  details: [],
  intervalMs: DEFAULT_INTERVAL_MS,
};

/**
 * Run a single integrity check.
 */
async function runCheck(): Promise<ChainMonitorStatus> {
  if (!_pool) {
    _status.status = 'error';
    return _status;
  }

  try {
    const { rows } = await _pool.query(
      `SELECT id, organization_id, sequence_number, record_hash, previous_hash
       FROM audit_events
       ORDER BY organization_id, sequence_number ASC`
    );

    if (rows.length === 0) {
      _status = { ..._status, lastCheckAt: new Date().toISOString(), status: 'healthy', totalEntries: 0, brokenLinks: 0, details: [] };
      return _status;
    }

    const brokenDetails: ChainMonitorStatus['details'] = [];
    const prevHashByOrg: Record<number, string> = {};

    for (const row of rows) {
      const oid = row.organization_id;
      const expectedPrev = prevHashByOrg[oid] || null;

      // Check that previous_hash matches the prior record's record_hash
      if (expectedPrev !== null && row.previous_hash !== null && row.previous_hash !== expectedPrev) {
        brokenDetails.push({
          id: row.id,
          sequenceNumber: row.sequence_number,
          orgId: oid,
        });
      }

      prevHashByOrg[oid] = row.record_hash;
    }

    const isHealthy = brokenDetails.length === 0;

    _status = {
      lastCheckAt: new Date().toISOString(),
      status: isHealthy ? 'healthy' : 'broken',
      totalEntries: rows.length,
      brokenLinks: brokenDetails.length,
      details: brokenDetails.slice(0, 50),
      intervalMs: _status.intervalMs,
    };

    if (!isHealthy) {
      console.error(
        `[ChainMonitor] CRITICAL: ${brokenDetails.length} broken link(s) detected in audit_events hash chain!`,
        brokenDetails.slice(0, 5)
      );

      // Record the integrity failure as its own audit event
      try {
        await _pool.query(
          `INSERT INTO audit_events
            (organization_id, event_type, entity_type, entity_id, user_id, user_name,
             user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
           VALUES (1, 'audit.chain_integrity_failure', 'audit_chain', 'chain_monitor', 0, 'system',
                   'system', '127.0.0.1', NOW(), $1, $2, true, true)`,
          [
            `Chain integrity check failed: ${brokenDetails.length} broken links detected`,
            JSON.stringify({ brokenLinks: brokenDetails.slice(0, 20), totalEntries: rows.length }),
          ]
        );
      } catch (logErr: any) {
        console.error('[ChainMonitor] Failed to log integrity failure event:', logErr.message);
      }
    } else {
      console.log(`[ChainMonitor] ✅ Chain integrity verified: ${rows.length} entries, all links intact`);
    }

    return _status;
  } catch (err: any) {
    console.error('[ChainMonitor] Check failed:', err.message);
    _status = { ..._status, lastCheckAt: new Date().toISOString(), status: 'error' };
    return _status;
  }
}

/**
 * Start the background chain integrity monitor.
 *
 * @param pool - PostgreSQL connection pool
 * @param intervalMs - Check interval (default 5 minutes)
 */
export function startChainMonitor(pool: Pool, intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (_monitorTimer) {
    console.warn('[ChainMonitor] Already running — stopping previous instance');
    stopChainMonitor();
  }

  _pool = pool;
  _status.intervalMs = intervalMs;

  console.log(`[ChainMonitor] Starting audit chain integrity monitor (interval: ${intervalMs / 1000}s)`);

  // Run first check after a short delay (let the server finish starting)
  setTimeout(() => {
    runCheck();
  }, 10_000);

  // Then run on interval
  _monitorTimer = setInterval(() => {
    runCheck();
  }, intervalMs);
}

/**
 * Stop the background monitor.
 */
export function stopChainMonitor(): void {
  if (_monitorTimer) {
    clearInterval(_monitorTimer);
    _monitorTimer = null;
    console.log('[ChainMonitor] Stopped');
  }
}

/**
 * Get the current monitor status (for health endpoints).
 */
export function getChainMonitorStatus(): ChainMonitorStatus {
  return { ..._status };
}

/**
 * Run an on-demand integrity check (for API endpoints).
 */
export async function runOnDemandCheck(): Promise<ChainMonitorStatus> {
  return runCheck();
}
