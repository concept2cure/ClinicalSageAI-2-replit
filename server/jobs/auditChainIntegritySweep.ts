/**
 * Audit-chain integrity sweep.
 *
 * Re-derives the audit_logs SHA-256 hash chain and reports whether it is intact.
 * This is the scheduled counterpart to the on-demand /api/c2c/actions/verify-chain
 * endpoint and satisfies the ISO 14971 control of a periodic (daily) tamper-
 * evidence check on the immutable audit trail (RA-CORTEX-001 §9.1).
 *
 * Read-only and defensive: any failure is logged, never thrown, so it cannot
 * affect request handling. Self-guards to a no-op unless ENABLE_AUDIT_CHAIN_CHECK
 * is set, mirroring the Drift Sentinel schedule, so default boot is unchanged.
 *
 * @module server/jobs/auditChainIntegritySweep
 */

import cron from 'node-cron';
import { pool } from '../db.js';
import { verifyAuditChain } from '../services/audit/chain.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('audit-chain-integrity');

export interface AuditChainCheckResult {
  ok: boolean;
  rowsChecked: number;
  brokenAt?: { id: string; expected: string; stored: string };
  error?: string;
}

/** Run a single audit-chain verification. Never throws. */
export async function runAuditChainIntegrityCheck(): Promise<AuditChainCheckResult> {
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
}

/**
 * Schedule the daily integrity sweep. No-op unless ENABLE_AUDIT_CHAIN_CHECK is
 * set, so default boot is unchanged. Default schedule: 02:00 daily (override
 * with AUDIT_CHAIN_CHECK_CRON).
 */
export function startAuditChainIntegritySchedule(): void {
  if (process.env.ENABLE_AUDIT_CHAIN_CHECK !== 'true') return;
  const expr = process.env.AUDIT_CHAIN_CHECK_CRON || '0 2 * * *';
  try {
    cron.schedule(expr, () => {
      void runAuditChainIntegrityCheck();
    });
    logger.info(`Audit chain integrity sweep scheduled (${expr})`);
  } catch (err: any) {
    logger.error(`Failed to schedule audit chain integrity sweep: ${err?.message}`);
  }
}
