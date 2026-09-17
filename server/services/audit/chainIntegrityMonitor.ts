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
 * Three outcomes, not two. A row carrying no `record_hash` is not a link and
 * cannot be checked, and neither can the link through it; the scan counts those
 * rows and reports `status: 'unverified'` with a reason rather than calling the
 * chain healthy over rows it never looked at (WO-16C finding 72).
 *
 * Compliance: 21 CFR Part 11 §11.10(e) — continuous monitoring of
 * audit trail integrity with alerting on anomalies.
 *
 * @module server/services/audit/chainIntegrityMonitor
 */

import { Pool } from 'pg';
import { runWithSystemTenantScope } from '../../db/tenantStore';
import { createScopedLogger } from '../../utils/logger';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  BACKGROUND_JOB,
} from '../background-jobs-metrics';

const logger = createScopedLogger('ChainMonitor');

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

/**
 * What the monitor last found. Five states, not four (WO-16C finding 72):
 *
 *   healthy      the scan ran and EVERY row was hashed and linked correctly
 *   broken       the scan ran and at least one link did not match
 *   unverified   the scan RAN but there was nothing, or not enough, to verify:
 *                no rows at all, or rows carrying no `record_hash` — the links
 *                through those rows could not be checked, so no verdict exists
 *   unchecked    the monitor has not run yet
 *   error        the scan did not run (no pool, or the query threw)
 *
 * `healthy` used to be returned for both `unverified` cases, naming
 * `totalEntries` — every row, checked or not — as though all of them had been.
 * The same collapse in the two sibling surfaces was fixed in a668d73e2.
 */
export interface ChainMonitorStatus {
  lastCheckAt: string | null;
  status: 'healthy' | 'broken' | 'unverified' | 'unchecked' | 'error';
  totalEntries: number;
  /** Rows carrying a record_hash — the only rows a link can be checked on. */
  hashedEntries?: number;
  /** Rows carrying no record_hash, so no link through them was checkable. */
  unhashedEntries?: number;
  brokenLinks: number;
  details: Array<{ id: number; sequenceNumber: number; orgId: number }>;
  intervalMs: number;
  /** Why the status is not a verdict, when it is not one. */
  reason?: string;
}

/** One audit_events row as the linkage check consumes it. */
export interface AuditEventChainRow {
  id: number;
  organization_id: number;
  sequence_number: number;
  /**
   * Nullable in the table and in practice: the BEFORE INSERT hash trigger
   * (db/migrations/20260222_audit_events_hash_chain.sql) only reached the
   * applier on 2026-09-10 and carried no backfill, and UPDATE is blocked by the
   * immutability trigger — so every row written before that deploy carries NULL
   * here, permanently. Typing it `string` hid that from every caller.
   */
  record_hash: string | null;
  previous_hash: string | null;
}

export interface BrokenChainLink {
  id: number;
  sequenceNumber: number;
  orgId: number;
}

/** What a linkage walk found, including what it could NOT look at. */
export interface ChainLinkageSummary {
  broken: BrokenChainLink[];
  /** Rows carrying a record_hash — the only rows a link can be checked on. */
  hashedEntries: number;
  /** Rows carrying no record_hash; every link through them is uncheckable. */
  unhashedEntries: number;
}

/**
 * Pure linkage walk over audit_events rows — the canonical one for this module.
 *
 * `rows` MUST be ordered by (organization_id, sequence_number ASC). Walks each
 * org's chain independently and returns the links whose `previous_hash` does
 * not match the prior row's `record_hash`. A null `previous_hash` (genesis row,
 * or a writer that left it null) is treated as "no claim about the predecessor"
 * and never counts as a break.
 *
 * It also counts what it could not check. A row with no `record_hash` was never
 * hashed: it cannot be a link, so it is skipped AND its successor's comparison
 * is skipped with it (the predecessor hash is cleared, not carried forward).
 * Counting those skips is the whole point — without the count, a table in which
 * no row was ever hashed produces an empty `broken` list, which the caller then
 * read as "verified" over rows nothing had looked at (WO-16C finding 72). This
 * mirrors signedAuditExport.snapshotChainIntegrity, which grew the same counters
 * in a668d73e2.
 *
 * This is linkage continuity only; it does not re-derive `record_hash` from
 * content (see the module header for why).
 */
export function summarizeChainLinkage(
  rows: readonly AuditEventChainRow[],
): ChainLinkageSummary {
  const broken: BrokenChainLink[] = [];
  const prevHashByOrg: Record<number, string | null> = {};
  let hashedEntries = 0;
  let unhashedEntries = 0;

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

    if (!row.record_hash) {
      unhashedEntries++;
      prevHashByOrg[oid] = null;
      continue;
    }

    hashedEntries++;
    prevHashByOrg[oid] = row.record_hash;
  }

  return { broken, hashedEntries, unhashedEntries };
}

/**
 * The broken links only. Kept as the narrow view over
 * {@link summarizeChainLinkage} — one walk, two shapes, no second
 * implementation to drift.
 */
export function findBrokenChainLinks(
  rows: readonly AuditEventChainRow[],
): BrokenChainLink[] {
  return summarizeChainLinkage(rows).broken;
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
    logger.info('previous check still running, skipping this cycle');
    return _status;
  }
  _checkInProgress = true;

  try {
    // Guard inside the try so the `finally` always clears _checkInProgress.
    // (Previously this returned early and leaked the flag, permanently
    // wedging the monitor — every later cycle saw "check in progress".)
    if (!_pool) {
      // Counters from an earlier run describe a scan that is not this one.
      _status = {
        ..._status,
        lastCheckAt: new Date().toISOString(),
        status: 'error',
        hashedEntries: undefined,
        unhashedEntries: undefined,
        reason: 'database pool unavailable',
      };
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
        // Nothing to verify is not "verified" — same rule as
        // signedAuditExport.snapshotChainIntegrity's empty branch.
        _status = {
          lastCheckAt: new Date().toISOString(),
          status: 'unverified',
          totalEntries: 0,
          hashedEntries: 0,
          unhashedEntries: 0,
          brokenLinks: 0,
          details: [],
          intervalMs: _status.intervalMs,
          reason: 'no entries: there is no chain to verify',
        };
        logger.info('chain integrity NOT verified', { reason: _status.reason });
        return _status;
      }

      const { broken: brokenDetails, hashedEntries, unhashedEntries } =
        summarizeChainLinkage(rows as AuditEventChainRow[]);

      // Precedence, in the order the fixed sibling surfaces use it:
      //   a positive finding of tampering outranks "cannot tell", and
      //   "cannot tell" outranks "healthy". Only a chain in which EVERY row
      //   carried a record_hash may be called verified.
      const isBroken = brokenDetails.length > 0;
      let reason: string | undefined;
      if (!isBroken && hashedEntries === 0) {
        reason = 'no row carries a record_hash: the chain has never been hashed, so no link could be checked';
      } else if (!isBroken && unhashedEntries > 0) {
        reason = `${unhashedEntries} of ${rows.length} rows carry no record_hash; the links through them could not be checked`;
      }
      const isHealthy = !isBroken && reason === undefined;

      _status = {
        lastCheckAt: new Date().toISOString(),
        status: isBroken ? 'broken' : isHealthy ? 'healthy' : 'unverified',
        totalEntries: rows.length,
        hashedEntries,
        unhashedEntries,
        brokenLinks: brokenDetails.length,
        details: brokenDetails.slice(0, 50),
        intervalMs: _status.intervalMs,
        reason,
      };

      if (isBroken) {
        logger.error('CRITICAL: broken link(s) detected in audit_events hash chain', {
          brokenLinks: brokenDetails.length,
          sample: brokenDetails.slice(0, 5),
        });

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
          logger.error('failed to log integrity failure event', { err: logErr?.message });
        }
      } else if (isHealthy) {
        // The §11.10(e) continuous-monitoring evidence line. It may only be
        // written when every one of `entries` rows actually carried a hash and
        // linked — hence the gate on `isHealthy` rather than on "no breaks".
        logger.info('chain integrity verified — all links intact', { entries: rows.length });
      } else {
        logger.warn('chain integrity NOT verified', {
          reason,
          totalEntries: rows.length,
          hashedEntries,
          unhashedEntries,
        });
      }

      return _status;
    });
    // The JOB ran successfully iff the scan completed (status
    // healthy|broken|unverified); 'broken' is a data-integrity alarm and
    // 'unverified' is "the scan ran, the data could not answer" — neither is a
    // liveness failure, the monitor did its work. A thrown error (status
    // 'error') is the liveness failure and is recorded in the catch below.
    recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, {
      ok: outcome.status !== 'error',
      processed: outcome.totalEntries,
    });
    return outcome;
  } catch (err: any) {
    logger.error('check failed', { err: err?.message });
    _status = {
      ..._status,
      lastCheckAt: new Date().toISOString(),
      status: 'error',
      hashedEntries: undefined,
      unhashedEntries: undefined,
      reason: err?.message ? `chain integrity scan failed: ${err.message}` : 'chain integrity scan failed',
    };
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
    logger.warn('already running — stopping previous instance');
    stopChainMonitor();
  }

  _pool = pool;
  _status.intervalMs = intervalMs;
  registerBackgroundJob(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR);

  logger.info('starting audit chain integrity monitor', { intervalSeconds: intervalMs / 1000 });

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
    logger.info('stopped');
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
