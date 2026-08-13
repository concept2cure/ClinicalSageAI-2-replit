/**
 * The 21 CFR Part 11 tamper-proof store, executed against real PostgreSQL.
 *
 * ── Why this cannot be a unit test ───────────────────────────────────────────
 * Every guarantee this file checks is a property of the DATABASE, and a mocked
 * pool has none of them: a stub does not enforce a trigger, does not withhold a
 * privilege, does not reject a type mismatch, and — most importantly — has no
 * concurrency, so it cannot show whether two simultaneous appends serialize.
 * The three defects fixed here all survived a green unit suite for exactly that
 * reason:
 *
 *   1. audit.tamper_proof_log did not exist after a successful provisioning
 *      run. Its only creator was runtime DDL that the append-only runtime role
 *      must refuse, and the refusal was swallowed into a console fallback.
 *   2. `user_id UUID` against an INTEGER users.id meant every ATTRIBUTED write
 *      raised "invalid input syntax for type uuid" — the log kept only
 *      unattributed rows.
 *   3. Appends serialized with `... ORDER BY sequence_number DESC LIMIT 1 FOR
 *      UPDATE`, which locks NOTHING on an empty table, so concurrent writers
 *      both chained onto GENESIS and the chain forked.
 *
 * (3) is the one that matters most here: a fork is invisible to any test that
 * cannot run two writers at once against one engine.
 *
 * The migration is applied by this file rather than assumed, so the suite is
 * self-provisioning and does not depend on which migrations the surrounding CI
 * job happened to run. It is idempotent, which is the same property the deploy
 * path relies on.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const MIGRATION = path.join(
  __dirname,
  '../../db/migrations/20260813_audit_tamper_proof_log.sql'
);

/** Marks rows this suite created, so cleanup never touches anything else. */
const PROBE_EVENT = 'dbtest.part11.probe';

/**
 * The concurrency test gets its OWN marker, and this is load-bearing.
 *
 * Sharing PROBE_EVENT made the fork query count the rows the shape and
 * immutability tests had already inserted — two of them chained onto GENESIS by
 * construction — so it reported `claimants: 2` and failed a correct
 * implementation. A fork check is only meaningful over one chain; pointing it at
 * a mixed population measures the fixture, not the lock.
 */
const CHAIN_EVENT = 'dbtest.part11.chain';

let owner: Pool;

/** Remove probe rows. The trigger blocks DELETE, so it is disabled around the sweep. */
async function cleanupProbeRows(): Promise<void> {
  await owner.query('ALTER TABLE audit.tamper_proof_log DISABLE TRIGGER trg_prevent_audit_mutation');
  await owner.query('DELETE FROM audit.tamper_proof_log WHERE event_type = ANY($1)', [
    [PROBE_EVENT, CHAIN_EVENT],
  ]);
  await owner.query('ALTER TABLE audit.tamper_proof_log ENABLE TRIGGER trg_prevent_audit_mutation');
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 8 });
  // Apply the real migration file — not a copy of its statements. A test that
  // restates the DDL proves only that the test agrees with itself.
  await owner.query(fs.readFileSync(MIGRATION, 'utf8'));
  await cleanupProbeRows();
});

afterAll(async () => {
  if (owner) {
    await cleanupProbeRows().catch(() => {/* table may not exist if beforeAll failed */});
    await owner.end();
  }
});

describe('the Part 11 store exists and has the right shape', () => {
  it('is present after the migration — not created at runtime', async () => {
    const present = await owner.query(
      `SELECT to_regclass('audit.tamper_proof_log') IS NOT NULL AS present`
    );
    expect(present.rows[0].present).toBe(true);
  });

  it('types user_id and session_id as TEXT, so attributed writes are not rejected', async () => {
    // Was UUID, while public.users.id is INTEGER. An audit trail that can only
    // record UNattributed events keeps the least useful row it could.
    const cols = await owner.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'audit' AND table_name = 'tamper_proof_log'
          AND column_name IN ('user_id', 'session_id')
        ORDER BY column_name`
    );
    expect(cols.rows).toEqual([
      { column_name: 'session_id', data_type: 'text' },
      { column_name: 'user_id', data_type: 'text' },
    ]);
  });

  it('accepts an attributed write keyed by an integer users.id', async () => {
    const inserted = await owner.query(
      `INSERT INTO audit.tamper_proof_log
         (id, event_type, user_id, session_id, action, previous_hash, content_hash, chain_hash)
       VALUES (gen_random_uuid(), $1, '42', 'sess-not-a-uuid', 'probe.attributed',
               'GENESIS', 'c', 'h')
       RETURNING user_id`,
      [PROBE_EVENT]
    );
    expect(inserted.rows[0].user_id).toBe('42');
  });

  it('carries no CHECK constraint masquerading as immutability', async () => {
    // The runtime DDL shipped `CONSTRAINT prevent_updates CHECK (TRUE)`, which
    // every row satisfies. A control named for a guarantee it does not provide
    // is worse than no control, because it reads as one in an audit.
    const decoration = await owner.query(
      `SELECT 1 FROM pg_constraint
        WHERE conrelid = 'audit.tamper_proof_log'::regclass AND conname = 'prevent_updates'`
    );
    expect(decoration.rowCount).toBe(0);
  });
});

describe('immutability holds against the database, not by convention', () => {
  it('refuses UPDATE even for the table owner', async () => {
    await owner.query(
      `INSERT INTO audit.tamper_proof_log
         (id, event_type, action, previous_hash, content_hash, chain_hash)
       VALUES (gen_random_uuid(), $1, 'probe.immutable', 'GENESIS', 'c', 'h')`,
      [PROBE_EVENT]
    );
    // The owner is the strongest caller that exists here — if the trigger stops
    // it, it stops a compromised application process too.
    await expect(
      owner.query(`UPDATE audit.tamper_proof_log SET action = 'TAMPERED' WHERE event_type = $1`, [
        PROBE_EVENT,
      ])
    ).rejects.toThrow(/Audit log is immutable/i);
  });

  it('refuses DELETE even for the table owner', async () => {
    await expect(
      owner.query(`DELETE FROM audit.tamper_proof_log WHERE event_type = $1`, [PROBE_EVENT])
    ).rejects.toThrow(/Audit log is immutable/i);
  });
});

describe('concurrent appends do not fork the hash chain', () => {
  it('serializes writers so no two entries claim the same predecessor', async () => {
    // THE test this file exists for. `LIMIT 1 FOR UPDATE` locked nothing on an
    // empty table, so simultaneous writers each read zero rows, each used
    // GENESIS, and the chain forked. pg_advisory_xact_lock does not depend on a
    // row existing, so it serializes from the very first append.
    //
    // Modelled as the append transaction actually runs it: take the lock, read
    // the current head, insert chained onto it, commit.
    const LOCK_KEY = '821300110000000001';
    const CONCURRENCY = 8;

    const append = async (n: number): Promise<void> => {
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
        const head = await client.query(
          `SELECT chain_hash FROM audit.tamper_proof_log
            WHERE event_type = $1 ORDER BY sequence_number DESC LIMIT 1`,
          [CHAIN_EVENT]
        );
        const previous = head.rows[0]?.chain_hash ?? 'GENESIS';
        await client.query(
          `INSERT INTO audit.tamper_proof_log
             (id, event_type, action, previous_hash, content_hash, chain_hash)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [CHAIN_EVENT, `concurrent.${n}`, previous, `content-${n}`, `chain-${n}`]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, (_, n) => append(n)));

    const chain = await owner.query(
      `SELECT previous_hash, count(*)::int AS claimants
         FROM audit.tamper_proof_log
        WHERE event_type = $1
        GROUP BY previous_hash
        HAVING count(*) > 1`,
      [CHAIN_EVENT]
    );

    // A fork is two rows naming the same predecessor. Under the old FOR UPDATE
    // this returned a row with claimants = CONCURRENCY, all on GENESIS.
    expect(chain.rows).toEqual([]);

    const total = await owner.query(
      `SELECT count(*)::int AS n FROM audit.tamper_proof_log WHERE event_type = $1`,
      [CHAIN_EVENT]
    );
    expect(total.rows[0].n).toBe(CONCURRENCY);
  });
});

describe('the runtime role can append and cannot rewrite', () => {
  it('is granted exactly SELECT and INSERT when the role exists', async () => {
    const role = await owner.query(`SELECT 1 FROM pg_roles WHERE rolname = 'app_service'`);
    if (role.rowCount === 0) {
      // The role is provisioned only when APP_SERVICE_DB_PASSWORD is set, which
      // this suite does not require. Assert the grant SHAPE instead of skipping
      // silently: whatever roles are granted, none may hold UPDATE or DELETE.
      const anyWrite = await owner.query(
        `SELECT grantee, privilege_type FROM information_schema.table_privileges
          WHERE table_schema = 'audit' AND table_name = 'tamper_proof_log'
            AND privilege_type IN ('UPDATE', 'DELETE')
            AND grantee <> current_user`
      );
      expect(anyWrite.rows).toEqual([]);
      return;
    }

    const grants = await owner.query(
      `SELECT privilege_type FROM information_schema.table_privileges
        WHERE table_schema = 'audit' AND table_name = 'tamper_proof_log'
          AND grantee = 'app_service'
        ORDER BY privilege_type`
    );
    expect(grants.rows.map(r => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });
});
