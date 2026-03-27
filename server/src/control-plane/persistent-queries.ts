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

export async function getPersistentKernelDecisionSummary(
  hours = 24
): Promise<PersistentDecisionSummary> {
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

export interface HashChainVerification {
  valid: boolean;
  totalRows: number;
  checkedRows: number;
  firstBrokenId: number | null;
  error: string | null;
}

export async function verifyPersistentKernelHashChain(): Promise<HashChainVerification> {
  if (process.env.ANA_KERNEL_PERSIST !== 'true') {
    return { valid: true, totalRows: 0, checkedRows: 0, firstBrokenId: null, error: null };
  }

  try {
    const { getPool } = await import('../../db');
    const pool = getPool();

    const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM ana_kernel_decision_log');
    const totalRows = countRes.rows[0]?.total ?? 0;

    if (totalRows === 0) {
      return { valid: true, totalRows: 0, checkedRows: 0, firstBrokenId: null, error: null };
    }

    // Verify chain: each row's prev_hash must match the previous row's entry_hash
    const broken = await pool.query(`
      WITH ordered AS (
        SELECT id, entry_hash, prev_hash,
               LAG(entry_hash) OVER (ORDER BY id) AS expected_prev
        FROM ana_kernel_decision_log
        ORDER BY id
      )
      SELECT id FROM ordered
      WHERE expected_prev IS NOT NULL AND prev_hash IS DISTINCT FROM expected_prev
      ORDER BY id
      LIMIT 1
    `);

    const firstBrokenId = broken.rows.length > 0 ? Number(broken.rows[0].id) : null;

    return {
      valid: firstBrokenId === null,
      totalRows,
      checkedRows: totalRows,
      firstBrokenId,
      error: null,
    };
  } catch (err: any) {
    return {
      valid: false,
      totalRows: 0,
      checkedRows: 0,
      firstBrokenId: null,
      error: err?.message || 'Unknown error verifying hash chain',
    };
  }
}
