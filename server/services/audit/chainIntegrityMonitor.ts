/**
 * Audit Chain Integrity Monitor
 *
 * Background service that periodically verifies the hash-chain *linkage* in the
 * audit_events table. If any broken links are detected, it:
 *   1. Logs a CRITICAL error to console
 *   2. Inserts an audit event recording the integrity failure
 *   3. Exposes status via a health-check getter
 *
 * Scope — linkage only. This monitor checks that each row's `previous_hash`
 * matches the prior row's `record_hash` within the same org (chain continuity).
 * It does NOT re-derive `record_hash` from row content: audit_events is written
 * by many services with no single canonical record_hash serialization (the
 * signed compliance export, signedAuditExport.snapshotChainIntegrity, is
 * linkage-only for the same reason). The stronger content-re-deriving verifier
 * lives in chain.ts (`verifyAuditChain`) for the separate audit_logs chain.
 *
 * Compliance: 21 CFR Part 11 §11.10(e) — continuous monitoring of
 * audit trail integrity with alerting on anomalies.
 *
 * @module server/services/audit/chainIntegrityMonitor
 */

import { Pool } from 'pg';
import { runWithSystemTenantScope } from '../../db/tenantStore';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  BACKGROUND_JOB,
} from '../background-jobs-metrics';

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

/** One audit_events row as the linkage check consumes it. */
export interface AuditEventChainRow {
  id: number;
  organization_id: number;
  sequence_number: number;
  record_hash: string;
  previous_hash: string | null;
}

export interface BrokenChainLink {
  id: number;
  sequenceNumber: number;
  orgId: number;
}

/**
 * Pure linkage check over audit_events rows.
 *
 * `rows` MUST be ordered by (organization_id, sequence_number ASC). Walks each
 * org's chain independently and returns the links whose `previous_hash` does
 * not match the prior row's `record_hash`. A null `previous_hash` (genesis row,
 * or a writer that left it null) is treated as "no claim about the predecessor"
 * and never counts as a break — matching signedAuditExport's snapshot logic.
 *
 * This is linkage continuity only; it does not re-derive `record_hash` from
 * content (see the module header for why).
 */
export function findBrokenChainLinks(
  rows: readonly AuditEventChainRow[],
): BrokenChainLink[] {
  const broken: BrokenChainLink[] = [];
  const prevHashByOrg: Record<number, string> = {};

  for (const row of rows) {
    const oid = row.organization_id;
    const expectedPrev = prevHashByOrg[oid] ?? null;

    if (
      expectedPrev !== null &&
      row.previous_hash !== null &&
      row.previous_hash !== expectedPrev
    ) {
      broken.push({ id: row.id, sequenceNumber: row.sequence_number, orgId: oid });
    }

    prevHashByOrg[oid] = row.record_hash;
  }

  return broken;
}

// ---------------------------------------------------------------------------
// MONITOR SINGLETON
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _monitorTimer: ReturnType<typeof setInterval> | null = null;
let _pool: Pool | null = null;
let _checkInProgress = false;
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
  // Prevent overlapping checks
  if (_checkInProgress) {
    console.log('[ChainMonitor] Previous check still running, skipping this cycle');
    return _status;
  }
  _checkInProgress = true;

  try {
    // Guard inside the try so the `finally` always clears _checkInProgress.
    // (Previously this returned early and leaked the flag, permanently
    // wedging the monitor — every later cycle saw "check in progress".)
    if (!_pool) {
      _status = { ..._status, lastCheckAt: new Date().toISOString(), status: 'error' };
      recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, {
        ok: false,
        error: 'database pool unavailable',
      });
      return _status;
    }

    // The integrity scan reads EVERY org's audit_events chain (estate-wide
    // SELECT) and, on failure, writes a system-originated audit event —
    // platform-wide work owned by no single tenant. It runs in a system scope
    // so the pooled queries are neither rejected as unscoped nor RLS-filtered
    // under RLS_ENFORCE=on; without it this 21 CFR Part 11 §11.10(e) monitor
    // silently never runs in production (the query fails closed every cycle).
    const outcome = await runWithSystemTenantScope('audit:chain-integrity-monitor', async () => {
      const { rows } = await _pool!.query(
        `SELECT id, organization_id, sequence_number, record_hash, previous_hash
         FROM audit_events
         ORDER BY organization_id, sequence_number ASC`
      );

      if (rows.length === 0) {
        _status = { ..._status, lastCheckAt: new Date().toISOString(), status: 'healthy', totalEntries: 0, brokenLinks: 0, details: [] };
        return _status;
      }

      const brokenDetails = findBrokenChainLinks(rows as AuditEventChainRow[]);
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
          // entity_id is INTEGER per the schema. Use 0 as a sentinel for
          // system-originated events (the entity is the chain itself, not a
          // domain row). entity_type carries the human-readable scope.
          await _pool!.query(
            `INSERT INTO audit_events
              (organization_id, event_type, entity_type, entity_id, user_id, user_name,
               user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
             VALUES (1, 'audit.chain_integrity_failure', 'audit_chain.monitor', 0, 0, 'system',
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
        console.log(`[ChainMonitor] Chain integrity verified: ${rows.length} entries, all links intact`);
      }

      return _status;
    });
    // The JOB ran successfully iff the scan completed (status healthy|broken);
    // 'broken' is a data-integrity alarm, not a liveness failure — the monitor
    // did its work. A thrown error (status 'error') is the liveness failure and
    // is recorded in the catch below.
    recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, {
      ok: outcome.status !== 'error',
      processed: outcome.totalEntries,
    });
    return outcome;
  } catch (err: any) {
    console.error('[ChainMonitor] Check failed:', err.message);
    _status = { ..._status, lastCheckAt: new Date().toISOString(), status: 'error' };
    recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, { ok: false, error: err?.message });
    return _status;
  } finally {
    _checkInProgress = false;
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
  registerBackgroundJob(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR);

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
