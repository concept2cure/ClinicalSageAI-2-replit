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

/**
 * The outcome of a hash-chain verification, as a discriminated status rather than
 * a bare boolean.
 *
 * WHY A STATUS AND A NULLABLE `valid`. The previous shape returned `valid: true`
 * for THREE different situations — chain verified, persistence disabled, and an
 * empty table — collapsing "the audit trail is intact" with "there was nothing to
 * check". For a 21 CFR Part 11 tamper-evidence endpoint that is a false
 * assurance: an operator or auditor reading `valid: true` cannot tell a verified
 * chain from an absent one. Here `valid` is `true`/`false` ONLY when a real chain
 * was actually checked, and `null` whenever verification was not possible
 * (disabled / empty / the table has no chain columns). `status` names which.
 */
export type HashChainStatus =
  | 'verified' // rows present, chain columns present, linkage + genesis intact
  | 'broken' // rows present, a linkage or genesis break was found
  | 'empty' // persistence on, table present, zero rows — nothing has been logged
  | 'disabled' // ANA_KERNEL_PERSIST !== 'true' — the log is not being written
  | 'unavailable'; // the table or its entry_hash/prev_hash columns are absent, or a DB error

export interface HashChainVerification {
  status: HashChainStatus;
  /**
   * `true` only when `status === 'verified'`, `false` only when `status ===
   * 'broken'`. `null` for every other status — a caller MUST NOT read the absence
   * of a chain as its integrity.
   */
  valid: boolean | null;
  totalRows: number;
  checkedRows: number;
  firstBrokenId: number | null;
  error: string | null;
}

const HASH_CHAIN_TABLE = 'ana_kernel_decision_log';
// Recognized "no predecessor" markers for the first row's prev_hash. A writer may
// use NULL, an empty string, or an all-zero hex digest for genesis; anything else
// on the first row means rows were removed from the front of the chain.
const GENESIS_PREV = "(prev_hash IS NULL OR prev_hash = '' OR prev_hash ~ '^0+$')";

/**
 * Verify the persistent kernel decision log's tamper-evident hash chain — and,
 * crucially, report HONESTLY when there is no chain to verify.
 *
 * The check, when a populated chain with the columns exists, asserts two things:
 *   1. GENESIS — the earliest row's prev_hash is a recognized "no predecessor"
 *      marker. Without this, deleting rows from the front of the chain would go
 *      undetected (the new first row would still link to its own successor).
 *   2. LINKAGE — every subsequent row's prev_hash equals the immediately prior
 *      row's entry_hash.
 *
 * LIMITATION, stated plainly: this verifies the chain's LINKS, not that each
 * entry_hash is a correct hash of its row's content. Full content re-hashing needs
 * the writer's exact digest construction; there is no writer today, so that is
 * intentionally out of scope until one exists. DB-level immutability triggers, not
 * this read, are the primary defense against in-place edits.
 */
export async function verifyPersistentKernelHashChain(): Promise<HashChainVerification> {
  const base = { totalRows: 0, checkedRows: 0, firstBrokenId: null, error: null };

  if (process.env.ANA_KERNEL_PERSIST !== 'true') {
    // Not being written — say so, don't claim validity.
    return { status: 'disabled', valid: null, ...base };
  }

  try {
    const { getPool } = await import('../../db');
    const pool = getPool();

    // Does the table exist, and does it actually carry the chain columns? The log
    // records decisions but was never given entry_hash/prev_hash, so querying them
    // blind would 500 the moment a row existed. Probe first and report the true
    // state rather than a fake pass.
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND column_name IN ('entry_hash', 'prev_hash')`,
      [HASH_CHAIN_TABLE]
    );
    const present = new Set(cols.rows.map((r: { column_name: string }) => r.column_name));

    if (present.size === 0) {
      // Either the table is absent, or it has no chain columns at all.
      const exists = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
        `public.${HASH_CHAIN_TABLE}`,
      ]);
      const tableThere = Boolean(exists.rows[0]?.present);
      return {
        status: 'unavailable',
        valid: null,
        ...base,
        error: tableThere
          ? `${HASH_CHAIN_TABLE} has no entry_hash/prev_hash columns — it is not a tamper-evident hash chain`
          : `${HASH_CHAIN_TABLE} is not provisioned`,
      };
    }
    if (!(present.has('entry_hash') && present.has('prev_hash'))) {
      return {
        status: 'unavailable',
        valid: null,
        ...base,
        error: `${HASH_CHAIN_TABLE} is missing ${present.has('entry_hash') ? 'prev_hash' : 'entry_hash'} — chain cannot be verified`,
      };
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM ${HASH_CHAIN_TABLE}`);
    const totalRows = countRes.rows[0]?.total ?? 0;

    if (totalRows === 0) {
      // Nothing has been logged. This is NOT the same as a verified chain.
      return { status: 'empty', valid: null, ...base };
    }

    // 1) Genesis: the earliest row must start the chain.
    const genesis = await pool.query(
      `SELECT id FROM ${HASH_CHAIN_TABLE} ORDER BY id ASC LIMIT 1`
    );
    const genesisId = Number(genesis.rows[0].id);
    const genesisOk = await pool.query(
      `SELECT ${GENESIS_PREV} AS ok FROM ${HASH_CHAIN_TABLE} WHERE id = $1`,
      [genesisId]
    );

    // 2) Linkage: each later row's prev_hash equals the prior row's entry_hash.
    const brokenLink = await pool.query(`
      WITH ordered AS (
        SELECT id, entry_hash, prev_hash,
               LAG(entry_hash) OVER (ORDER BY id) AS expected_prev
        FROM ${HASH_CHAIN_TABLE}
        ORDER BY id
      )
      SELECT id FROM ordered
      WHERE expected_prev IS NOT NULL AND prev_hash IS DISTINCT FROM expected_prev
      ORDER BY id
      LIMIT 1
    `);

    let firstBrokenId: number | null = null;
    if (!genesisOk.rows[0]?.ok) {
      firstBrokenId = genesisId;
    } else if (brokenLink.rows.length > 0) {
      firstBrokenId = Number(brokenLink.rows[0].id);
    }

    return {
      status: firstBrokenId === null ? 'verified' : 'broken',
      valid: firstBrokenId === null,
      totalRows,
      checkedRows: totalRows,
      firstBrokenId,
      error: null,
    };
  } catch (err: any) {
    return {
      status: 'unavailable',
      valid: null,
      ...base,
      error: err?.message || 'Unknown error verifying hash chain',
    };
  }
}
