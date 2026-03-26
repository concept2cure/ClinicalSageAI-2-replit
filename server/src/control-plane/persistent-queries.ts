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

export interface PersistentHashChainVerification {
  persistenceEnabled: boolean;
  checkedRows: number;
  linkageMismatches: number;
  nullHashRows: number;
  ok: boolean;
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

export async function verifyPersistentKernelHashChain(): Promise<PersistentHashChainVerification> {
  const fallback: PersistentHashChainVerification = {
    persistenceEnabled: process.env.ANA_KERNEL_PERSIST === 'true',
    checkedRows: 0,
    linkageMismatches: 0,
    nullHashRows: 0,
    ok: true,
  };

  if (process.env.ANA_KERNEL_PERSIST !== 'true') {
    return fallback;
  }

  try {
    const { getPool } = await import('../../db');
    const pool = getPool();
    const rs = await pool.query(`
      WITH ordered AS (
        SELECT
          id,
          prev_hash,
          entry_hash,
          LAG(entry_hash) OVER (ORDER BY id) AS expected_prev_hash
        FROM ana_kernel_decision_log
      )
      SELECT
        COUNT(*)::int AS checked_rows,
        COUNT(*) FILTER (
          WHERE id > (SELECT MIN(id) FROM ordered)
            AND coalesce(prev_hash, '') <> coalesce(expected_prev_hash, '')
        )::int AS linkage_mismatches,
        COUNT(*) FILTER (WHERE entry_hash IS NULL OR entry_hash = '')::int AS null_hash_rows
      FROM ordered;
    `);

    const row = rs.rows[0] || {};
    const checkedRows = Number(row.checked_rows || 0);
    const linkageMismatches = Number(row.linkage_mismatches || 0);
    const nullHashRows = Number(row.null_hash_rows || 0);

    return {
      persistenceEnabled: true,
      checkedRows,
      linkageMismatches,
      nullHashRows,
      ok: linkageMismatches === 0 && nullHashRows === 0,
    };
  } catch {
    return {
      ...fallback,
      ok: false,
    };
  }
}
