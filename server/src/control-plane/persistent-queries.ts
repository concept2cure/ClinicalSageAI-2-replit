export interface PersistentDecisionSummary {
  total: number;
  byFinalDecision: {
    allow: number;
    review: number;
    deny: number;
  };
  byEnforcedDecision: {
    allow: number;
    review: number;
    deny: number;
  };
}

function zeroSummary(): PersistentDecisionSummary {
  return {
    total: 0,
    byFinalDecision: { allow: 0, review: 0, deny: 0 },
    byEnforcedDecision: { allow: 0, review: 0, deny: 0 },
  };
}

export async function getPersistentKernelDecisionSummary(hours = 24): Promise<PersistentDecisionSummary> {
  const result = zeroSummary();

  if (process.env.ANA_KERNEL_PERSIST !== 'true') {
    return result;
  }

  try {
    const { getPool } = await import('../../db');
    const pool = getPool();

    const windowed = await pool.query(
      `
        SELECT
          final_decision,
          enforced_decision,
          COUNT(*)::int AS count
        FROM ana_kernel_decision_log
        WHERE recorded_at >= NOW() - ($1::int || ' hours')::interval
        GROUP BY final_decision, enforced_decision
      `,
      [Math.max(1, Math.min(hours, 24 * 90))]
    );

    for (const row of windowed.rows) {
      const count = Number(row.count || 0);
      result.total += count;

      const finalKey = row.final_decision as keyof PersistentDecisionSummary['byFinalDecision'];
      const enforcedKey =
        row.enforced_decision as keyof PersistentDecisionSummary['byEnforcedDecision'];

      if (finalKey in result.byFinalDecision) {
        result.byFinalDecision[finalKey] += count;
      }

      if (enforcedKey in result.byEnforcedDecision) {
        result.byEnforcedDecision[enforcedKey] += count;
      }
    }
  } catch {
    return result;
  }

  return result;
}
