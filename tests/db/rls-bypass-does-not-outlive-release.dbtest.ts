/**
 * A pooled connection cannot carry an RLS bypass to the next borrower.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 * The services in server/services/innovation/ reach cross-tenant data by
 * setting `app.bypass_rls` and `app.is_admin` on a checked-out connection with
 * a plain `SET`, which is SESSION-scoped. Nothing cleared them: pg-pool's
 * _release() runs no SQL, poolInstrumentation's scopedRelease runs no SQL,
 * withTenantConnection resets the three tenant GUCs and not these two, and
 * nothing in the repo issues DISCARD ALL. The connection went back to the pool
 * with the bypass still on.
 *
 * That is worth a test rather than a code comment because of what the flag
 * reaches: it short-circuits identity.can_access_org / can_write_org /
 * can_access_program / can_write_program, which decide 142 of ~1016 policies
 * across 80 tables — vault.documents, signing.signatures,
 * ectd_v4.regulatory_submissions and identity.users among them.
 *
 * The first test below is the CONTROL: it reproduces the old behaviour with a
 * bare release and asserts the flag really does survive. Without it, the second
 * test would pass just as happily against a Postgres that reset session state
 * on its own, and would be proving nothing about releaseWithoutBypass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { releaseWithoutBypass } from '../../server/services/innovation/rlsBypassSession';

/** max:1 so every checkout in a test is the SAME physical connection. */
let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: databaseUrl, max: 1 });
});

afterAll(async () => {
  if (pool) await pool.end();
});

async function readFlags(): Promise<{ bypass: string; admin: string }> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT coalesce(current_setting('app.bypass_rls', true), '') AS bypass,
              coalesce(current_setting('app.is_admin',   true), '') AS admin`,
    );
    return rows[0];
  } finally {
    client.release();
  }
}

describe('app.bypass_rls / app.is_admin do not outlive the borrower', () => {
  it('CONTROL: a plain release DOES leak them to the next checkout', async () => {
    const client = await pool.connect();
    await client.query("SET app.bypass_rls = 'true'");
    await client.query("SET app.is_admin = 'true'");
    client.release(); // the old behaviour

    const after = await readFlags();
    expect(after.bypass, 'the leak this suite exists to close must be real').toBe('true');
    expect(after.admin).toBe('true');

    // Leave the pool clean for the next test.
    const c = await pool.connect();
    await releaseWithoutBypass(c);
  });

  it('releaseWithoutBypass clears them', async () => {
    const client = await pool.connect();
    await client.query("SET app.bypass_rls = 'true'");
    await client.query("SET app.is_admin = 'true'");
    await releaseWithoutBypass(client);

    const after = await readFlags();
    expect(after.bypass).toBe('');
    expect(after.admin).toBe('');
  });

  it('clears them even when the work left an ABORTED transaction', async () => {
    // An aborted transaction rejects every statement until it is unwound, so a
    // naive RESET in a finally block would itself fail and the flag would
    // survive. This is the case the ROLLBACK-first ordering exists for.
    const client = await pool.connect();
    await client.query("SET app.bypass_rls = 'true'");
    await client.query("SET app.is_admin = 'true'");
    await client.query('BEGIN');
    await client.query('SELECT 1/0').catch(() => undefined); // poison the tx
    await releaseWithoutBypass(client);

    const after = await readFlags();
    expect(after.bypass).toBe('');
    expect(after.admin).toBe('');
  });

  it('leaves a usable connection behind, not a broken one', async () => {
    const client = await pool.connect();
    await client.query("SET app.bypass_rls = 'true'");
    await releaseWithoutBypass(client);

    const next = await pool.connect();
    try {
      const { rows } = await next.query('SELECT 42 AS n');
      expect(rows[0].n).toBe(42);
    } finally {
      next.release();
    }
  });
});
