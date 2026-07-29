/**
 * Audit-chain integrity sweep.
 *
 * Re-derives the audit_logs SHA-256 hash chain and reports whether it is intact.
 * This is the scheduled counterpart to the on-demand /api/c2c/actions/verify-chain
 * endpoint and satisfies the ISO 14971 control of a periodic (daily) tamper-
 * evidence check on the immutable audit trail (RA-CORTEX-001 §9.1).
 *
 * Read-only and defensive: any failure is logged, never thrown, so it cannot
 * affect request handling. Part 11 tamper-evidence monitoring defaults ON in
 * production (opt out explicitly with ENABLE_AUDIT_CHAIN_CHECK=false); outside
 * production it stays opt-in so default dev/test boot is unchanged. See
 * startAuditChainIntegritySchedule for the full gating matrix.
 *
 * @module server/jobs/auditChainIntegritySweep
 */

import cron from 'node-cron';
import { pool } from '../db.js';
import { verifyAuditChain } from '../services/audit/chain.js';
import { createScopedLogger } from '../utils/logger.js';
import { runWithSystemTenantScope } from '../db/tenantStore';

const logger = createScopedLogger('audit-chain-integrity');

export interface AuditChainCheckResult {
  ok: boolean;
  rowsChecked: number;
  brokenAt?: { id: string; expected: string; stored: string };
  error?: string;
}

/** Run a single audit-chain verification. Never throws. */
export async function runAuditChainIntegrityCheck(): Promise<AuditChainCheckResult> {
  return runWithSystemTenantScope('audit-chain-integrity-sweep', async () => {
    try {
      const client = await pool.connect();
      try {
        const result = await verifyAuditChain(client);
        if (result.ok) {
          logger.info(`Audit chain intact (${result.rowsChecked} rows verified)`);
        } else {
          // A break is a data-integrity incident: surface loudly for alerting.
          logger.error(
            `AUDIT CHAIN BROKEN at row ${result.brokenAt?.id} after ${result.rowsChecked} rows — investigate immediately`
          );
          process.emitWarning(
            `Audit chain integrity check failed at row ${result.brokenAt?.id}`,
            'AuditChainIntegrity'
          );
        }
        return result;
      } finally {
        client.release();
      }
    } catch (err: any) {
      logger.error(`Audit chain integrity check could not run: ${err?.message}`);
      return { ok: false, rowsChecked: 0, error: err?.message };
    }
  });
}

/**
 * Schedule the daily integrity sweep.
 *
 * Part 11 tamper-evidence monitoring must not be silently absent in
 * production: the sweep is read-only (verifyAuditChain issues one SELECT and
 * takes no locks) and alert-only, so it is safe to default ON.
 *
 * Gating matrix:
 *   - ENABLE_AUDIT_CHAIN_CHECK=false → never schedule (explicit opt-out; in
 *     production this is logged as a WARNING because it names a monitoring gap)
 *   - ENABLE_AUDIT_CHAIN_CHECK=true  → always schedule, even if the trail flag
 *     is unset (e.g. to verify a pre-existing chain)
 *   - unset, NODE_ENV=production     → schedule (default ON at GA)
 *   - unset, elsewhere               → schedule only when the audit trail is
 *     active (AUDIT_TRAIL_ENABLED=true) — if a chain is being written it
 *     should also be verified, mirroring the continuous chainIntegrityMonitor
 * Default schedule: 02:00 daily (override with AUDIT_CHAIN_CHECK_CRON).
 */
export function startAuditChainIntegritySchedule(): void {
  const explicit = process.env.ENABLE_AUDIT_CHAIN_CHECK;
  const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const auditTrailOn = process.env.AUDIT_TRAIL_ENABLED === 'true';
  const enabled =
    explicit === 'false' ? false : explicit === 'true' || isProduction || auditTrailOn;

  if (!enabled) {
    // Boot-posture line: state the decision and the env var that controls it.
    const posture = {
      enabled: false,
      controlledBy: 'ENABLE_AUDIT_CHAIN_CHECK',
      reason:
        explicit === 'false'
          ? 'explicitly disabled (ENABLE_AUDIT_CHAIN_CHECK=false)'
          : 'opt-in outside production (set ENABLE_AUDIT_CHAIN_CHECK=true or AUDIT_TRAIL_ENABLED=true)',
    };
    if (isProduction) {
      logger.warn(
        'Audit chain integrity sweep DISABLED in production — Part 11 tamper-evidence monitoring is off',
        posture
      );
    } else {
      logger.info('Audit chain integrity sweep disabled', posture);
    }
    return;
  }

  const expr = process.env.AUDIT_CHAIN_CHECK_CRON || '0 2 * * *';
  try {
    cron.schedule(expr, () => {
      void runAuditChainIntegrityCheck().catch(err =>
        logger.error(`Audit chain integrity check failed: ${err?.message ?? String(err)}`)
      );
    });
    logger.info(`Audit chain integrity sweep scheduled (${expr})`, {
      enabled: true,
      controlledBy: 'ENABLE_AUDIT_CHAIN_CHECK',
      schedule: expr,
    });
  } catch (err: any) {
    logger.error(`Failed to schedule audit chain integrity sweep: ${err?.message}`);
  }
}
