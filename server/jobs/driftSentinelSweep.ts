/**
 * Drift Sentinel sweep
 *
 * Periodically re-checks every program that has fact bindings, flagging values
 * that diverged from their canonical fact and handing each divergence to the
 * existing cascade (change-router). This is the scheduled counterpart to the
 * on-demand POST /api/regulatory-graph/programs/:programId/drift/scan route.
 *
 * Standalone job module (mirrors server/jobs/retentionCron.js): it is not
 * auto-registered at boot. To schedule it, call startDriftSentinelSchedule()
 * from server startup behind ENABLE_DRIFT_SENTINEL=true, or invoke
 * runDriftSentinelSweep() from an external scheduler / cron. Each program runs
 * independently and best-effort, so one program's failure does not stop the rest.
 */

import { db } from '../db';
import { and, eq, isNull } from 'drizzle-orm';
import { factBindings } from '../../shared/schema/living-record-spine';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { runDriftSentinel } from '../services/living-record/reconciliation-engine';
import { createScopedLogger } from '../utils/logger';
import { runWithOrgJobScope, runWithSystemTenantScope } from '../db/tenantStore';
import { backgroundWorkPermitted, getTenantAccessPosture } from '../services/tenant/tenant-lifecycle';
import { combineAuditRowOutcomes, type AuditRowOutcome } from '../services/audit/audit-write-outcome';
import type { PacketAuditReceipt } from '../services/regulatory-graph/defense-packet-staleness.service';

const logger = createScopedLogger('drift-sentinel');

export interface DriftSweepSummary {
  programs: number;
  driftDetected: number;
  healed: number;
  errors: number;
  processedPrograms: number;
  skippedUnverifiedProgram: number;
  skippedNotEntitled: number;
  skippedUnverifiedTenant: number;
  skippedPrograms: Array<{ programId: string; reason: DriftSweepSkipReason }>;
  skipDetailsLimitReached: boolean;
  packetAuditReceipts: Array<PacketAuditReceipt & { programId: string }>;
  auditTrail?: AuditRowOutcome;
}
type DriftSweepSkipReason = 'program_unverified' | 'tenant_not_entitled' | 'tenant_unverified';
function skipProgram(summary: DriftSweepSummary, programId: string, reason: DriftSweepSkipReason): void {
  if (reason === 'program_unverified') summary.skippedUnverifiedProgram += 1;
  else if (reason === 'tenant_not_entitled') summary.skippedNotEntitled += 1;
  else summary.skippedUnverifiedTenant += 1;
  if (summary.skippedPrograms.length < 100) summary.skippedPrograms.push({ programId, reason });
  else summary.skipDetailsLimitReached = true;
}

/** One sweep across every program that has at least one fact binding. */
export async function runDriftSentinelSweep(): Promise<DriftSweepSummary> {
  return runWithSystemTenantScope('drift-sentinel-sweep', async () => {
    const rows = await db.selectDistinct({ programId: factBindings.programId }).from(factBindings);

    const summary: DriftSweepSummary = {
      programs: rows.length,
      driftDetected: 0,
      healed: 0,
      errors: 0,
      processedPrograms: 0,
      skippedUnverifiedProgram: 0,
      skippedNotEntitled: 0,
      skippedUnverifiedTenant: 0,
      skippedPrograms: [],
      skipDetailsLimitReached: false,
      packetAuditReceipts: [],
    };
    for (const r of rows) {
      let organizationId: number;
      try {
        const [program] = await db.select({ organizationId: regulatoryPrograms.organizationId })
          .from(regulatoryPrograms).where(and(eq(regulatoryPrograms.id, r.programId), isNull(regulatoryPrograms.deletedAt))).limit(1);
        if (!program || !Number.isSafeInteger(program.organizationId) || program.organizationId <= 0) {
          skipProgram(summary, r.programId, 'program_unverified'); continue;
        }
        organizationId = program.organizationId;
      } catch {
        skipProgram(summary, r.programId, 'program_unverified'); continue;
      }
      // Estate-wide discovery grants no permission to mutate a tenant. Resolve
      // its existing lifecycle policy, then run with that tenant's role-null RLS.
      await runWithOrgJobScope(organizationId, 'drift-sentinel-program', async () => {
        let posture: Awaited<ReturnType<typeof getTenantAccessPosture>>;
        try { posture = await getTenantAccessPosture(organizationId); }
        catch { skipProgram(summary, r.programId, 'tenant_unverified'); return; }
        if (!posture) { skipProgram(summary, r.programId, 'tenant_unverified'); return; }
        if (!backgroundWorkPermitted(posture)) { skipProgram(summary, r.programId, 'tenant_not_entitled'); return; }
        try {
          const report = await runDriftSentinel(r.programId);
          summary.processedPrograms += 1;
          summary.driftDetected += report.driftDetected;
          summary.healed += report.healed;
          summary.packetAuditReceipts.push(...report.items.flatMap(item =>
            (item.packetAuditReceipts ?? []).map(receipt => ({ ...receipt, programId: r.programId }))));
        } catch { summary.errors += 1; }
      });
    }
    if (summary.packetAuditReceipts.length) summary.auditTrail = combineAuditRowOutcomes(
      summary.packetAuditReceipts[0].auditTrail, ...summary.packetAuditReceipts.slice(1).map(receipt => receipt.auditTrail));
    return summary;
  });
}

const DEFAULT_INTERVAL_MS = 1000 * 60 * 60; // hourly
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic sweep. No-op unless ENABLE_DRIFT_SENTINEL=true, so it never
 * changes default boot behavior. Idempotent. The timer is unref'd so it does not
 * hold the process open.
 */
export function startDriftSentinelSchedule(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (process.env.ENABLE_DRIFT_SENTINEL !== 'true') {
    // Boot-posture line: deliberately opt-in (per-program reconciliation +
    // cascade writes), so make the OFF state visible rather than silently
    // returning.
    logger.info('Drift Sentinel sweep disabled (set ENABLE_DRIFT_SENTINEL=true to enable)', {
      enabled: false,
      controlledBy: 'ENABLE_DRIFT_SENTINEL',
    });
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    void runDriftSentinelSweep().then(summary => {
      const missing = summary.packetAuditReceipts.filter(receipt => !receipt.auditTrail.persisted);
      if (missing.length) logger.warn('Drift safety flags saved with unconfirmed audit entries', {
        packetIds: missing.map(receipt => receipt.packetId), count: missing.length,
      });
    }).catch(err => {
      // Best-effort sweep, but a silent failure means drift detection has
      // gone dark — log it so ops can see the schedule is failing.
      logger.error(`scheduled sweep failed: ${err?.message ?? err}`);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('Drift Sentinel sweep scheduled', {
    enabled: true,
    controlledBy: 'ENABLE_DRIFT_SENTINEL',
    intervalMs,
  });
}

export function stopDriftSentinelSchedule(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
