/**
 * Audit Chain Integrity Monitor
 *
 * Background service that periodically verifies the hash chain in the
 * audit_events table. If any break is detected, it:
 *   1. Logs a CRITICAL error to console
 *   2. Inserts an audit event recording the integrity failure
 *   3. Exposes status via a health-check getter
 *
 * Scope — the one walk of this chain (audit-event-chain.ts): each row's
 * `previous_hash` is compared with the prior row's `record_hash` within the
 * same org, AND each row's `record_hash` is re-computed from the fields the
 * chain covers. This monitor used to compare pointers only, on the stated
 * ground that audit_events had "no single canonical record_hash
 * serialization". It has one: the BEFORE INSERT trigger
 * (db/migrations/20260222_audit_events_hash_chain.sql) writes every
 * record_hash, whatever service inserts the row, and no writer supplies its
 * own. The audit trail's banner already re-computed over the same rows, so the
 * monitor could call a chain healthy that the banner called broken.
 * (chain.ts `verifyAuditChain` is the separate audit_logs chain.)
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
import { readLatestWindowResult, runScheduledOncePerWindow, windowKeyOf } from '../../db/scheduledOnce';
import { createScopedLogger } from '../../utils/logger';
import {
  AUDIT_EVENT_CHAIN_COLUMNS,
  AUDIT_EVENT_CHAIN_ORDER,
  auditEventChainGapReason,
  walkAuditEventChain,
  type AuditEventChainRow,
  type AuditEventChainWalk,
} from './audit-event-chain';
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
  /**
   * Rows this scan read. OPTIONAL because an errored scan read none: it used
   * to spread the previous status and answer with a count from a scan that was
   * not this one (WO-16C #72 follow-up). Undefined means "this run did not
   * count"; it never means zero.
   */
  totalEntries?: number;
  /** Rows carrying a record_hash — the only rows a link can be checked on. */
  hashedEntries?: number;
  /** Rows carrying no record_hash, so no link through them was checkable. */
  unhashedEntries?: number;
  /** Rows whose record_hash re-computed from the fields the chain covers. */
  verifiedEntries?: number;
  /** Rows naming no predecessor although one was hashed: a link not checkable. */
  unlinkedEntries?: number;
  /** Optional for the same reason as totalEntries: absent, not zero, on error. */
  brokenLinks?: number;
  /** Absent on error. An empty array here would read as "no breaks found". */
  details?: BrokenChainLink[];
  /** The last scan that actually completed, kept so an error does not erase it. */
  lastSuccessfulScan?: {
    at: string;
    status: 'healthy' | 'broken' | 'unverified';
    totalEntries: number;
    brokenLinks: number;
  };
  intervalMs: number;
  /** Why the status is not a verdict, when it is not one. */
  reason?: string;
  /**
   * Organisations whose broken chain this scan could not record in their own
   * audit trail. Absent when every failure event was recorded.
   */
  failureEventsNotRecorded?: number[];
}

/**
 * The status for a scan that did not run.
 *
 * WO-16C #72 follow-up. Both error branches used to spread the previous
 * `_status`, so the endpoint answered `totalEntries` from an older scan
 * alongside `brokenLinks: 0` and `details: []` — a pair a reader takes as "no
 * breaks found" — under a `lastCheckAt` stamped with now. An error is never
 * rendered as an empty result, so this run's counters are ABSENT, and the last
 * scan that did complete is preserved under its own key where it cannot be
 * mistaken for this one.
 */
function erroredStatus(prev: ChainMonitorStatus, reason: string): ChainMonitorStatus {
  const completed =
    prev.status === 'healthy' || prev.status === 'broken' || prev.status === 'unverified'
      ? {
          at: prev.lastCheckAt ?? 'unknown',
          status: prev.status,
          totalEntries: prev.totalEntries ?? 0,
          brokenLinks: prev.brokenLinks ?? 0,
        }
      : prev.lastSuccessfulScan;
  return {
    lastCheckAt: new Date().toISOString(),
    status: 'error',
    intervalMs: prev.intervalMs,
    reason,
    lastSuccessfulScan: completed,
  };
}

/** One audit_events row as the walk consumes it (audit-event-chain.ts). */
export type { AuditEventChainRow };

export interface BrokenChainLink {
  id: number | string;
  sequenceNumber: number | null;
  orgId: number;
  /** `pointer`: does not follow its predecessor. `content`: does not match its recorded hash. */
  kind: 'pointer' | 'content';
}

/** What a walk found, including what it could NOT look at. */
export interface ChainLinkageSummary {
  broken: BrokenChainLink[];
  /** Rows carrying a record_hash — the only rows anything can be checked on. */
  hashedEntries: number;
  /** Rows carrying no record_hash; every link through them is uncheckable. */
  unhashedEntries: number;
  /** Rows whose record_hash re-computed from the fields the chain covers. */
  verifiedEntries: number;
  /** Rows naming no predecessor although one was hashed. */
  unlinkedEntries: number;
  /** The walk itself, for the one sentence that describes it. */
  walk: AuditEventChainWalk;
}

/**
 * The walk over audit_events rows, in this module's shape.
 *
 * This was a second, pointer-only implementation of the walk — one of five
 * (see audit-event-chain.ts). It is now a view over the one walk, kept under
 * its name for the monitor and the per-organisation verdict job
 * (jobs/auditChainOrganizationVerdicts.ts).
 *
 * `rows` MUST be selected with AUDIT_EVENT_CHAIN_COLUMNS and ordered by
 * (organization_id, sequence_number ASC). A row with no `record_hash` was never
 * hashed: it is counted, and its successor's pointer is not compared (WO-16C
 * finding 72). A row naming no predecessor although one was hashed is counted
 * too, and no longer passes as a verified link.
 */
export function summarizeChainLinkage(
  rows: readonly AuditEventChainRow[],
): ChainLinkageSummary {
  const walk = walkAuditEventChain(rows);
  return {
    broken: walk.breaks.map((b) => ({
      id: b.id,
      sequenceNumber: b.sequenceNumber,
      orgId: b.organizationId,
      kind: b.kind,
    })),
    hashedEntries: walk.hashedRows,
    unhashedEntries: walk.unhashedRows,
    verifiedEntries: walk.verifiedRows,
    unlinkedEntries: walk.unlinkedRows,
    walk,
  };
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
let _bootTimer: ReturnType<typeof setTimeout> | null = null;
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
 * Record a break in the audit trail of each organisation whose chain broke,
 * naming only that organisation's links. Until 2026-10-01 one event went to
 * organisation 1 (hard-coded) with every tenant's link details, and never to
 * the organisation whose records were affected.
 *
 * Until 2026-10-15 the event's actor was user_id 0 — which
 * audit_events_user_id_users_id_fk refuses, so on a migrated database no
 * event was ever recorded, and the refusal was only logged — named 'system'
 * from 127.0.0.1. The actor is this monitor: no user id and no client
 * address, so both are NULL (as SCIM provisioning records itself).
 *
 * Returns the organisations whose event could not be recorded.
 */
async function recordChainFailureEvents(pool: Pool, brokenDetails: BrokenChainLink[]): Promise<number[]> {
  const byOrg = new Map<number, BrokenChainLink[]>();
  for (const link of brokenDetails) {
    const list = byOrg.get(link.orgId) ?? [];
    list.push(link);
    byOrg.set(link.orgId, list);
  }
  const notRecorded: number[] = [];
  for (const [orgId, links] of byOrg) {
    try {
      // entity_id is INTEGER per the schema. Use 0 as a sentinel for
      // system-originated events (the entity is the chain itself, not a
      // domain row). entity_type carries the human-readable scope.
      await pool.query(
        `INSERT INTO audit_events
          (organization_id, event_type, entity_type, entity_id, user_id, user_name,
           user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
         VALUES ($1, 'audit.chain_integrity_failure', 'audit_chain.monitor', 0, NULL,
                 'audit chain integrity monitor', 'system', NULL, NOW(), $2, $3, true, true)`,
        [
          orgId,
          `Chain integrity check failed: ${links.length} broken link(s) in this organisation's audit trail`,
          JSON.stringify({ brokenLinks: links.slice(0, 20), brokenLinkCount: links.length }),
        ]
      );
    } catch (logErr: any) {
      notRecorded.push(orgId);
      logger.error('failed to log integrity failure event', { orgId, err: logErr?.message });
    }
  }
  return notRecorded;
}

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
      _status = erroredStatus(_status, 'database pool unavailable');
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
        `SELECT ${AUDIT_EVENT_CHAIN_COLUMNS}
         FROM audit_events
         ORDER BY ${AUDIT_EVENT_CHAIN_ORDER}`
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

      const { broken: brokenDetails, hashedEntries, unhashedEntries, verifiedEntries, unlinkedEntries, walk } =
        summarizeChainLinkage(rows as AuditEventChainRow[]);

      // Precedence, in the order the fixed sibling surfaces use it:
      //   a positive finding of tampering outranks "cannot tell", and
      //   "cannot tell" outranks "healthy". Only a chain in which EVERY row
      //   carried a record_hash, was placed and re-computed may be called verified.
      const isBroken = brokenDetails.length > 0;
      // One wording for why a chain with no break is still not healthy, shared
      // with the signed export and the per-organisation verdict job.
      const reason = isBroken ? undefined : auditEventChainGapReason(walk) ?? undefined;
      const isHealthy = !isBroken && reason === undefined;

      _status = {
        lastCheckAt: new Date().toISOString(),
        status: isBroken ? 'broken' : isHealthy ? 'healthy' : 'unverified',
        totalEntries: rows.length,
        hashedEntries,
        unhashedEntries,
        verifiedEntries,
        unlinkedEntries,
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

        const notRecorded = await recordChainFailureEvents(_pool!, brokenDetails);
        if (notRecorded.length > 0) _status = { ..._status, failureEventsNotRecorded: notRecorded };
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
    _status = erroredStatus(
      _status,
      err?.message ? `chain integrity scan failed: ${err.message}` : 'chain integrity scan failed',
    );
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
  _bootTimer = setTimeout(() => {
    _bootTimer = null;
    void runScheduledCheck();
  }, 10_000);

  // Then run on interval
  _monitorTimer = setInterval(() => {
    void runScheduledCheck();
  }, intervalMs);
}

/** The job's name in scheduled_job_claims, and the key its shared status is read by. */
const MONITOR_JOB = 'audit-chain-monitor';

/**
 * One scheduled tick. Every server process (two API tasks and the worker)
 * starts this monitor; one of them scans each interval window and records the
 * status it found in the window's claim (U19). The others skip — the window is
 * covered, so their heartbeat records a live tick — and serve the recorded
 * status through getSharedChainMonitorStatus. Until 2026-10-01 each process
 * scanned all of audit_events every five minutes and wrote its own failure
 * event per break.
 */
export async function runScheduledCheck(): Promise<void> {
  try {
    const outcome = await runScheduledOncePerWindow(MONITOR_JOB, windowKeyOf(_status.intervalMs), () => runCheck(), {
      storeResult: true,
    });
    if (!outcome.ran) recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, { ok: true, processed: 0 });
  } catch (err: any) {
    // The claim itself could not be taken (the database is unreachable): the
    // check did not run anywhere this process can vouch for.
    logger.error('scheduled check could not claim its window', { err: err?.message });
    _status = erroredStatus(_status, `chain integrity scan could not be scheduled: ${err?.message ?? String(err)}`);
    recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, { ok: false, error: err?.message });
  }
}

/**
 * Stop the background monitor.
 */
export function stopChainMonitor(): void {
  if (_bootTimer) {
    clearTimeout(_bootTimer);
    _bootTimer = null;
  }
  if (_monitorTimer) {
    clearInterval(_monitorTimer);
    _monitorTimer = null;
    logger.info('stopped');
  }
}

/**
 * This process's own view: the last check IT ran (scheduled or on demand).
 */
export function getChainMonitorStatus(): ChainMonitorStatus {
  return { ..._status };
}

/**
 * The status to serve: the latest check any process ran, as that run recorded
 * it, or this process's own when it is newer (an on-demand check here). A
 * shared status that cannot be read is reported as an error — "could not
 * tell" — never as this process's possibly idle or stale view.
 */
export async function getSharedChainMonitorStatus(): Promise<ChainMonitorStatus> {
  let shared: { result: ChainMonitorStatus | null; finishedAt: string } | null;
  try {
    shared = await readLatestWindowResult<ChainMonitorStatus>(MONITOR_JOB);
  } catch (err: any) {
    return erroredStatus(_status, `could not read the shared monitor status: ${err?.message ?? String(err)}`);
  }
  const local = { ..._status };
  const recorded = shared?.result;
  if (!recorded?.lastCheckAt) return local;
  if (local.lastCheckAt && local.lastCheckAt > recorded.lastCheckAt) return local;
  return { ...recorded, intervalMs: local.intervalMs };
}

/**
 * Run an on-demand integrity check (for API endpoints).
 */
export async function runOnDemandCheck(): Promise<ChainMonitorStatus> {
  return runCheck();
}
