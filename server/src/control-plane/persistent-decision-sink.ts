import type { KernelDecisionLogEntry } from './decision-log';

let warnedUnavailable = false;

export async function persistKernelDecision(entry: KernelDecisionLogEntry): Promise<void> {
  if (process.env.ANA_KERNEL_PERSIST !== 'true') {
    return;
  }

  try {
    const { getPool } = await import('../../db');
    const pool = getPool();

    await pool.query(
      `
        INSERT INTO ana_kernel_decision_log (
          request_id,
          tenant_id,
          actor_id,
          method,
          path,
          status_code,
          final_decision,
          enforced_decision,
          score,
          policy_bundle_id,
          policy_bundle_version,
          mode,
          flags,
          trace,
          recorded_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::timestamptz
        )
      `,
      [
        entry.requestId,
        entry.tenantId || null,
        entry.actorId || null,
        entry.method,
        entry.path,
        entry.statusCode,
        entry.kernel.finalDecision,
        entry.kernel.enforcedDecision,
        entry.kernel.score,
        entry.kernel.policyBundleId,
        entry.kernel.policyBundleVersion,
        entry.kernel.mode,
        JSON.stringify(entry.kernel.flags),
        JSON.stringify(entry.kernel.trace),
        entry.timestamp,
      ]
    );
  } catch (error: any) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[ANA_KERNEL] Persistent decision sink unavailable:', error?.message || error);
    }
  }
}
