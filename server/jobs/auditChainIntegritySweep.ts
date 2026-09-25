/**
 * Audit integrity sweep.
 *
 * The scheduled tamper-evidence check on every immutable audit store, and the
 * counterpart of the on-demand verifier (scripts/ops/verify-audit-chain.mjs)
 * and the /api/c2c/actions/verify-chain endpoint. It satisfies the ISO 14971
 * control of a periodic (daily) tamper-evidence check on the audit trail
 * (RA-CORTEX-001 §9.1) and 21 CFR Part 11 §11.10(e).
 *
 * What one run verifies — the SAME exported verifiers the writers and the
 * on-demand tool share, not a second transcription of any recipe:
 *
 *   audit_logs.chain          sha256_chain re-derived (chain.ts verifyAuditChain)
 *   audit_logs.seals          hmac_seal under AUDIT_HMAC_KEY
 *                             (audit-integrity-service.ts verifyAuditIntegrity,
 *                             which fails closed to "unverifiable" without the key)
 *   audit_events.linkage      previous_hash → record_hash per org
 *                             (chainIntegrityMonitor.ts summarizeChainLinkage)
 *   audit_events.seals        hmac_seal under AUDIT_HMAC_KEY (chain.ts)
 *   audit.tamper_proof_log    previous_hash / content_hash / chain_hash and the
 *                             HMAC signature under AUDIT_HMAC_SECRET
 *                             (tamper-proof-audit.ts verifyTamperProofLogRows)
 *   immutability_triggers     every append-only trigger present and enabled
 *                             (audit-immutability-triggers.ts)
 *
 * Until 2026-09-25 this job called verifyAuditChain alone, so a broken seal,
 * a tampered tamper_proof_log row, a broken audit_events link or a dropped
 * trigger were never reported by the daily check (security audit 2026-09-24
 * findings DP-06 and DP-04; plan item P0-8a).
 *
 * Three outcomes per store, not two: `ok`, an incident (`broken`, `missing`,
 * `error`), or `unverifiable` — the store could not be positively verified
 * (no seal key, no hashed rows). An incident raises the alert path: an error
 * log line, `process.emitWarning`, and the `[SECURITY]` webhook
 * (security-alerts.ts) with counts and the first failing identifier, never row
 * content. Unverifiable is logged as a warning and is never reported as ok.
 *
 * Read-only and defensive: every store is checked even when another fails,
 * and nothing is thrown, so the sweep cannot affect request handling. Part 11
 * tamper-evidence monitoring defaults ON in production (opt out explicitly
 * with ENABLE_AUDIT_CHAIN_CHECK=false); outside production it stays opt-in so
 * default dev/test boot is unchanged. The gating matrix lives in
 * resolveAuditChainSweepPosture (server/startup/audit-enforcement.ts), shared
 * with the boot gate that refuses AUDIT_REQUIRE_ENFORCE=true without it.
 *
 * @module server/jobs/auditChainIntegritySweep
 */

import cron from 'node-cron';
import { pool } from '../db.js';
import { verifyAuditEventsChainSeals, type PoolClient } from '../services/audit/chain.js';
import { verifyAuditIntegrity } from '../services/audit/audit-integrity-service.js';
import {
  summarizeChainLinkage,
  type AuditEventChainRow,
} from '../services/audit/chainIntegrityMonitor.js';
import { assertAuditImmutabilityTriggers } from '../services/audit/audit-immutability-triggers.js';
import { verifyTamperProofLogRows, type TamperProofLogRow } from '../lib/tamper-proof-audit.js';
import { reportSecurityAlert } from '../services/security-alerts.js';
import { resolveAuditChainSweepPosture } from '../startup/audit-enforcement.js';
import { createScopedLogger } from '../utils/logger.js';
import { runWithSystemTenantScope } from '../db/tenantStore';

const logger = createScopedLogger('audit-chain-integrity');

export type AuditStoreName =
  | 'audit_logs.chain'
  | 'audit_logs.seals'
  | 'audit_events.linkage'
  | 'audit_events.seals'
  | 'audit.tamper_proof_log'
  | 'immutability_triggers';

/**
 * ok            positively verified
 * broken        a re-derivation, link, seal or signature did not match
 * missing       the store, or a trigger protecting it, does not exist
 * error         the verifier threw — the store was NOT checked
 * unverifiable  the store could not be positively verified (no key, no hashed
 *               rows); not an incident, never a pass
 */
export type AuditStoreStatus = 'ok' | 'broken' | 'missing' | 'error' | 'unverifiable';

export interface AuditStoreVerdict {
  store: AuditStoreName;
  status: AuditStoreStatus;
  rowsChecked?: number;
  /** The first failing identifier — a row id, a sequence number, an index, a trigger name. Never content. */
  firstFailure?: string;
  reason?: string;
}

export interface AuditChainCheckResult {
  /** True only when EVERY store is `ok`. */
  ok: boolean;
  /** audit_logs chain rows verified (kept for the existing consumers). */
  rowsChecked: number;
  /** The audit_logs chain break, when there is one (kept for the existing consumers). */
  brokenAt?: { id: string; expected: string; stored: string };
  /** Set when the sweep itself could not run (no connection). */
  error?: string;
  stores: AuditStoreVerdict[];
  /** Stores whose status is an incident: broken, missing or error. */
  failures: AuditStoreName[];
  /** Stores that could not be positively verified. */
  unverifiable: AuditStoreName[];
}

const INCIDENT_STATUSES: ReadonlySet<AuditStoreStatus> = new Set(['broken', 'missing', 'error']);

async function tableExists(client: PoolClient, qualified: string): Promise<boolean> {
  const r = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified]);
  return r.rows[0]?.present === true;
}

/** Run one store's verifier; a throw is that store's `error`, not the sweep's. */
async function guarded(
  store: AuditStoreName,
  fn: () => Promise<AuditStoreVerdict>,
): Promise<AuditStoreVerdict> {
  try {
    return await fn();
  } catch (err) {
    return { store, status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** audit_logs: the sha256 chain and the HMAC seals, through the canonical integrity service. */
async function verifyAuditLogsStore(client: PoolClient): Promise<{
  verdicts: [AuditStoreVerdict, AuditStoreVerdict];
  rowsChecked: number;
  brokenAt?: AuditChainCheckResult['brokenAt'];
}> {
  try {
    const integrity = await verifyAuditIntegrity(client);
    const rowsChecked = integrity.chain.rowsChecked;
    const chain: AuditStoreVerdict = integrity.chain.ok
      ? { store: 'audit_logs.chain', status: 'ok', rowsChecked }
      : {
          store: 'audit_logs.chain',
          status: 'broken',
          rowsChecked,
          firstFailure: integrity.chain.brokenAt?.id,
          reason: 'sha256_chain mismatch',
        };
    const seals: AuditStoreVerdict = !integrity.seals.checked
      ? { store: 'audit_logs.seals', status: 'unverifiable', reason: integrity.seals.reason }
      : integrity.seals.valid
        ? { store: 'audit_logs.seals', status: 'ok' }
        : {
            store: 'audit_logs.seals',
            status: 'broken',
            firstFailure: String(integrity.seals.brokenAt),
            reason: 'hmac_seal does not verify',
          };
    const brokenAt = integrity.chain.brokenAt
      ? {
          id: integrity.chain.brokenAt.id,
          expected: integrity.chain.brokenAt.expected,
          stored: integrity.chain.brokenAt.stored,
        }
      : undefined;
    return { verdicts: [chain, seals], rowsChecked, brokenAt };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      verdicts: [
        { store: 'audit_logs.chain', status: 'error', reason },
        { store: 'audit_logs.seals', status: 'error', reason },
      ],
      rowsChecked: 0,
    };
  }
}

/** audit_events: per-org linkage (the monitor's walk) and the HMAC seals. */
async function verifyAuditEventsStore(client: PoolClient): Promise<AuditStoreVerdict[]> {
  if (!(await tableExists(client, 'public.audit_events'))) {
    const reason = 'table absent';
    return [
      { store: 'audit_events.linkage', status: 'missing', reason },
      { store: 'audit_events.seals', status: 'missing', reason },
    ];
  }

  const linkage = await guarded('audit_events.linkage', async () => {
    const { rows } = await client.query(
      `SELECT id, organization_id, sequence_number, record_hash, previous_hash
         FROM audit_events
        ORDER BY organization_id, sequence_number ASC`,
    );
    const { broken, hashedEntries, unhashedEntries } = summarizeChainLinkage(
      rows as unknown as AuditEventChainRow[],
    );
    const rowsChecked = rows.length;
    if (broken.length > 0) {
      return {
        store: 'audit_events.linkage',
        status: 'broken',
        rowsChecked,
        firstFailure: String(broken[0].id),
        reason: `${broken.length} broken link(s)`,
      };
    }
    // Precedence as the monitor applies it: a break outranks "cannot tell",
    // and "cannot tell" outranks ok. Only a chain in which EVERY row carried a
    // record_hash may be called verified (WO-16C finding 72).
    if (rowsChecked === 0) {
      return { store: 'audit_events.linkage', status: 'unverifiable', rowsChecked, reason: 'no entries: there is no chain to verify' };
    }
    if (hashedEntries === 0) {
      return {
        store: 'audit_events.linkage',
        status: 'unverifiable',
        rowsChecked,
        reason: 'no row carries a record_hash: the chain has never been hashed, so no link could be checked',
      };
    }
    if (unhashedEntries > 0) {
      return {
        store: 'audit_events.linkage',
        status: 'unverifiable',
        rowsChecked,
        reason: `${unhashedEntries} of ${rowsChecked} rows carry no record_hash; the links through them could not be checked`,
      };
    }
    return { store: 'audit_events.linkage', status: 'ok', rowsChecked };
  });

  const seals = await guarded('audit_events.seals', async () => {
    if (!process.env.AUDIT_HMAC_KEY) {
      return {
        store: 'audit_events.seals',
        status: 'unverifiable',
        reason: 'AUDIT_HMAC_KEY not configured; HMAC seals cannot be verified',
      };
    }
    const result = await verifyAuditEventsChainSeals(client);
    return result.valid
      ? { store: 'audit_events.seals', status: 'ok' }
      : {
          store: 'audit_events.seals',
          status: 'broken',
          firstFailure: String(result.brokenAt),
          reason: 'hmac_seal does not verify',
        };
  });

  return [linkage, seals];
}

/** audit.tamper_proof_log: the Part 11 store, walked with the writer's own pure verifier. */
async function verifyTamperProofStore(client: PoolClient): Promise<AuditStoreVerdict> {
  const store = 'audit.tamper_proof_log';
  return guarded(store, async () => {
    if (!(await tableExists(client, store))) {
      return {
        store,
        status: 'missing',
        reason: 'table absent — db/migrations/20260813_audit_tamper_proof_log.sql has not been applied',
      };
    }
    // The signing secret exactly as the writer resolves it. No development
    // fallback here: a chain verified under a guessed secret is not verified.
    const hmacSecret = (process.env.AUDIT_HMAC_SECRET ?? '').trim();
    if (!hmacSecret) {
      return {
        store,
        status: 'unverifiable',
        reason: 'AUDIT_HMAC_SECRET not configured; chain signatures cannot be verified',
      };
    }
    // Read-only on purpose: TamperProofAuditLog.verifyChain appends an
    // AUDIT_VERIFICATION_PASSED row on success; a daily sweep must not write.
    const { rows } = await client.query(
      'SELECT * FROM audit.tamper_proof_log ORDER BY sequence_number ASC',
    );
    const walked = verifyTamperProofLogRows(rows as unknown as TamperProofLogRow[], { hmacSecret });
    const rowsChecked = rows.length;
    if (!walked.valid) {
      return {
        store,
        status: 'broken',
        rowsChecked,
        firstFailure: walked.firstInvalidEntry === undefined ? undefined : String(walked.firstInvalidEntry),
        reason: walked.invalidReason,
      };
    }
    return { store, status: 'ok', rowsChecked };
  });
}

/** The append-only triggers on every store above. */
async function verifyImmutabilityTriggers(client: PoolClient): Promise<AuditStoreVerdict> {
  const store = 'immutability_triggers';
  return guarded(store, async () => {
    const report = await assertAuditImmutabilityTriggers(client);
    if (report.ok) {
      return { store, status: 'ok', rowsChecked: report.present };
    }
    const parts: string[] = [];
    if (report.missing.length) parts.push(`missing: ${report.missing.join(', ')}`);
    if (report.disabled.length) parts.push(`disabled: ${report.disabled.join(', ')}`);
    if (report.tablesAbsent.length) parts.push(`tables absent: ${report.tablesAbsent.join(', ')}`);
    return {
      store,
      status: 'missing',
      rowsChecked: report.present,
      firstFailure: report.missing[0] ?? report.disabled[0],
      reason: parts.join('; '),
    };
  });
}

/** Run a single sweep over every audit store. Never throws. */
export async function runAuditChainIntegrityCheck(): Promise<AuditChainCheckResult> {
  return runWithSystemTenantScope('audit-chain-integrity-sweep', async () => {
    try {
      const client = await pool.connect();
      try {
        const auditLogs = await verifyAuditLogsStore(client);
        const auditEvents = await verifyAuditEventsStore(client);
        const tamperProof = await verifyTamperProofStore(client);
        const triggers = await verifyImmutabilityTriggers(client);

        const stores: AuditStoreVerdict[] = [
          ...auditLogs.verdicts,
          ...auditEvents,
          tamperProof,
          triggers,
        ];
        const failures = stores.filter((s) => INCIDENT_STATUSES.has(s.status)).map((s) => s.store);
        const unverifiable = stores.filter((s) => s.status === 'unverifiable').map((s) => s.store);
        const ok = failures.length === 0 && unverifiable.length === 0;

        // Counts and identifiers only — this travels to the log and the webhook.
        const summary = stores.map(({ store, status, rowsChecked, firstFailure, reason }) => ({
          store,
          status,
          ...(rowsChecked === undefined ? {} : { rowsChecked }),
          ...(firstFailure === undefined ? {} : { firstFailure }),
          ...(reason === undefined ? {} : { reason }),
        }));

        if (failures.length > 0) {
          // A break is a data-integrity incident: surface loudly for alerting.
          logger.error(
            `AUDIT INTEGRITY FAILURE in ${failures.join(', ')} — investigate immediately`,
            { failures, stores: summary },
          );
          process.emitWarning(
            `Audit integrity sweep failed: ${failures.join(', ')}`,
            'AuditChainIntegrity',
          );
          reportSecurityAlert({
            kind: 'audit_integrity_sweep_failed',
            message: `Daily audit integrity sweep failed for ${failures.join(', ')}`,
            detail: { failures, unverifiable, stores: summary },
          });
        } else if (unverifiable.length > 0) {
          logger.warn(
            `Audit integrity sweep NOT fully verified: ${unverifiable.join(', ')} could not be checked`,
            { unverifiable, stores: summary },
          );
        } else {
          logger.info(
            `Every audit store verified (audit_logs ${auditLogs.rowsChecked} rows, ` +
              `audit_events ${auditEvents[0].rowsChecked ?? 0} rows, ` +
              `tamper_proof_log ${tamperProof.rowsChecked ?? 0} rows, ` +
              `${triggers.rowsChecked ?? 0} immutability triggers)`,
          );
        }

        return {
          ok,
          rowsChecked: auditLogs.rowsChecked,
          ...(auditLogs.brokenAt ? { brokenAt: auditLogs.brokenAt } : {}),
          stores,
          failures,
          unverifiable,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      logger.error(`Audit integrity sweep could not run: ${err?.message}`);
      return {
        ok: false,
        rowsChecked: 0,
        error: err?.message,
        stores: [],
        failures: [],
        unverifiable: [],
      };
    }
  });
}

/**
 * Schedule the daily integrity sweep.
 *
 * Part 11 tamper-evidence monitoring must not be silently absent in
 * production: the sweep is read-only (SELECTs only, no locks) and alert-only,
 * so it is safe to default ON. The gating matrix is resolveAuditChainSweepPosture
 * (server/startup/audit-enforcement.ts); with AUDIT_REQUIRE_ENFORCE=true a
 * production boot that disables the sweep is refused there.
 * Default schedule: 02:00 daily (override with AUDIT_CHAIN_CHECK_CRON).
 */
export function startAuditChainIntegritySchedule(): void {
  const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const posture = resolveAuditChainSweepPosture(process.env);

  if (!posture.enabled) {
    // Boot-posture line: state the decision and the env var that controls it.
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
      controlledBy: posture.controlledBy,
      schedule: expr,
    });
  } catch (err: any) {
    logger.error(`Failed to schedule audit chain integrity sweep: ${err?.message}`);
  }
}
