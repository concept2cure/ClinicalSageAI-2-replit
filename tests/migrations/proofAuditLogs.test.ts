/**
 * Proof Audit Logs — migration verification (Neon-only smoke test).
 *
 * INTENTIONALLY SKIPPED IN CI. This suite is gated on
 * DATABASE_NEON_NEW_SECRET specifically (not DATABASE_URL /
 * TEST_DATABASE_URL like the other integration suites), and it connects
 * with `ssl: 'require'`. Three things make it a real-Neon-DB check, not
 * an ephemeral-CI check:
 *
 *   1. It reads DATABASE_NEON_NEW_SECRET — the production/staging Neon
 *      connection secret. CI sets DATABASE_URL + TEST_DATABASE_URL but
 *      never that secret, so `describe.skip` fires in CI by design.
 *   2. `ssl: 'require'` — Neon mandates TLS; CI's local pgvector
 *      container has no SSL, so this would fail there anyway.
 *   3. It asserts on `proof_audit_logs`, created by
 *      db/migrations/20260129_proof_audit_logs.sql — a non-`_gcc_`
 *      migration that CI's integration job does not apply.
 *
 * Net: this verifies the Part 11 proof-audit table shape against the
 * actual Neon database it ships to. To run it locally, export
 * DATABASE_NEON_NEW_SECRET pointing at a Neon (or SSL-capable) Postgres.
 * If you want it gating PRs in CI instead, it needs: (a) fall back to
 * DATABASE_URL, (b) conditional SSL, (c) the migration added to the CI
 * apply step — a deliberate change, not a one-liner.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const dbSecret = process.env.DATABASE_NEON_NEW_SECRET || '';
const url = dbSecret ? dbSecret.replace(/^psql '/, '').replace(/'$/, '') : '';

// Skip entire suite when DATABASE_NEON_NEW_SECRET is not available — see
// the header: this is a Neon-only smoke test, skipped in CI on purpose.
const describeWithDb = dbSecret ? describe : describe.skip;

describeWithDb('Proof Audit Logs Migration', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    if (!url) return;
    sql = postgres(url, { ssl: 'require' });
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('should have proof_audit_logs table', async () => {
    const result = await sql`
      SELECT tablename FROM pg_tables
      WHERE tablename = 'proof_audit_logs'
    `;
    expect(result.length).toBe(1);
    expect(result[0].tablename).toBe('proof_audit_logs');
  });

  it('should have required columns', async () => {
    const columns = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'proof_audit_logs'
    `;
    const columnNames = columns.map(c => c.column_name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('entry_id');
    expect(columnNames).toContain('organization_id');
    expect(columnNames).toContain('workflow_run_id');
    expect(columnNames).toContain('event_type');
    expect(columnNames).toContain('hash_chain');
    expect(columnNames).toContain('previous_hash');
    expect(columnNames).toContain('immutable');
  });

  it('should have immutability triggers', async () => {
    const triggers = await sql`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_table = 'proof_audit_logs'
    `;
    const triggerNames = triggers.map(t => t.trigger_name);

    expect(triggerNames).toContain('enforce_proof_audit_immutability_update');
    expect(triggerNames).toContain('enforce_proof_audit_immutability_delete');
  });

  it('should have RLS policies', async () => {
    const policies = await sql`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'proof_audit_logs'
    `;
    const policyNames = policies.map(p => p.policyname);

    expect(policyNames).toContain('proof_audit_tenant_isolation');
    expect(policyNames).toContain('proof_audit_insert_policy');
  });
});
