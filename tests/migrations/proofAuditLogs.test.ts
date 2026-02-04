/**
 * Quick migration verification test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const dbSecret = process.env.DATABASE_NEON_NEW_SECRET || '';
const url = dbSecret ? dbSecret.replace(/^psql '/, '').replace(/'$/, '') : '';
const describeWithDb = dbSecret ? describe : describe.skip;

describeWithDb('Proof Audit Logs Migration', () => {
  let sql: ReturnType<typeof postgres> | undefined;

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
