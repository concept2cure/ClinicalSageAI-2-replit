/**
 * Phase 5 — Intelligent Document System, against real PostgreSQL.
 *
 * Verifies that the intelligent_docs schema a deployment actually produces
 * carries its tables, RLS policies, immutability triggers, functions and seeded
 * compliance rules.
 *
 * ── Why this file moved ─────────────────────────────────────────────────────
 * It lived at tests/phase5/migration.test.ts, in the MOCKED vitest project, and
 * reported 17 passing tests while executing no assertion at all — in every CI
 * run since it was written.
 *
 * Three things stacked up. Its own guard,
 * `!process.env.DATABASE_URL && !process.env.DATABASE_NEON_NEW_SECRET`, could
 * never be true, because tests/setup.ts sets a placeholder DATABASE_URL before
 * it is read — so describe.skipIf never skipped. Every test then opened with
 * `if (!pool || !migrationsReady) return`, a silent early return that vitest
 * scores as a pass. And `migrationsReady` could never be true either, because
 * tests/setup.ts:351 unconditionally overwrites DATABASE_URL with
 * `postgresql://test:test@localhost:5432/test` in a global beforeAll, so the
 * pool connected as a role that does not exist. The suite's own error handler
 * swallowed that ("Failed to check schema existence: role \"test\" does not
 * exist") and carried on to report success.
 *
 * That is not a fixable condition in the mocked project: pg is mocked there by
 * design, and the placeholder URL is deliberate. A real-database suite belongs
 * in the real-database project, which runs unmocked under tests/setup.db.ts —
 * and that setup FAILS rather than skips when the database is unreachable, so
 * the class of silent pass this file demonstrated cannot recur here.
 *
 * Against a database built by install-fresh + deploy-migrate, 16 of the 17
 * assertions passed on their first real execution. The seventeenth failed on a
 * bug in its own SQL: it selected `polname` from pg_policies, which exposes
 * `policyname` (`polname` is the column on the underlying pg_policy catalog).
 * Every green tick this file ever printed was over a query Postgres would have
 * rejected. Fixed here; all 17 now run and pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

describe('Phase 5: Intelligent Document System Migration', () => {
  let pool: Pool;

  beforeAll(async () => {
    // pg is NOT mocked in this project, and tests/setup.db.ts has already
    // refused to run if the database is unreachable or still the unit-test
    // placeholder. So: connect, and let a failure fail.
    //
    // What stood here was a schema probe wrapped in try/catch that logged
    // "Failed to check schema existence" and continued, plus an
    // APPLY_PHASE5_MIGRATIONS branch that shelled out to a migration script
    // mid-suite. That catch is the one that swallowed `role "test" does not
    // exist` for the life of this file while every test below reported a pass.
    // A suite whose entire story is "an error was swallowed" does not get to
    // keep the swallow.
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Schema Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have intelligent_docs schema', async () => {
    const result = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'intelligent_docs'`,
    );
    expect(result.rowCount).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Table Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have source_documents table with required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'source_documents'
      ORDER BY ordinal_position
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('id');
    expect(columns).toContain('organization_id');
    expect(columns).toContain('title');
    expect(columns).toContain('document_type');
    expect(columns).toContain('content_hash');
    expect(columns).toContain('version');
    expect(columns).toContain('search_vector');
  });

  it('should have traceability_links table with required columns', async () => {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'traceability_links'
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('source_document_id');
    expect(columns).toContain('source_hash');
    expect(columns).toContain('target_document_id');
    expect(columns).toContain('linked_text');
    expect(columns).toContain('citation_type');
    expect(columns).toContain('verification_status');
    expect(columns).toContain('link_hash');
  });

  it('should have change_propagation_events table', async () => {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'change_propagation_events'
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('source_document_id');
    expect(columns).toContain('old_version');
    expect(columns).toContain('new_version');
    expect(columns).toContain('old_hash');
    expect(columns).toContain('new_hash');
    expect(columns).toContain('event_hash');
    expect(columns).toContain('status');
  });

  it('should have impacted_sections table', async () => {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'impacted_sections'
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('propagation_event_id');
    expect(columns).toContain('document_id');
    expect(columns).toContain('severity');
    expect(columns).toContain('suggested_action');
    expect(columns).toContain('resolution_status');
  });

  it('should have compliance_scores table', async () => {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'compliance_scores'
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('document_id');
    expect(columns).toContain('submission_type');
    expect(columns).toContain('overall_score');
    expect(columns).toContain('structure_score');
    expect(columns).toContain('content_score');
    expect(columns).toContain('citations_score');
    expect(columns).toContain('violations');
  });

  it('should have compliance_rules table', async () => {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'compliance_rules'
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('rule_id');
    expect(columns).toContain('name');
    expect(columns).toContain('category');
    expect(columns).toContain('severity');
    expect(columns).toContain('applicable_submissions');
    expect(columns).toContain('is_active');
  });

  it('should have auto_generated_tables table', async () => {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'intelligent_docs' 
        AND table_name = 'auto_generated_tables'
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('table_type');
    expect(columns).toContain('title');
    expect(columns).toContain('table_data');
    expect(columns).toContain('column_definitions');
    expect(columns).toContain('content_hash');
    expect(columns).toContain('status');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RLS Policy Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have RLS enabled on all tables', async () => {
    const result = await pool.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'intelligent_docs'
    `);

    for (const row of result.rows) {
      expect(row.rowsecurity).toBe(true);
    }
  });

  it('should have RLS policies for tenant isolation', async () => {
    const result = await pool.query(`
      SELECT policyname, tablename
      FROM pg_policies
      WHERE schemaname = 'intelligent_docs'
    `);

    // pg_policies exposes the policy name as \`policyname\`; \`polname\` is the
    // column on the underlying pg_policy catalog. The mistake never surfaced
    // because this suite ran in the mocked project, where it could not reach a
    // database to be wrong against.
    const policies = result.rows.map(r => r.policyname);
    expect(policies).toContain('source_docs_org_policy');
    expect(policies).toContain('trace_links_org_policy');
    expect(policies).toContain('propagation_org_policy');
    expect(policies).toContain('compliance_scores_org_policy');
    expect(policies).toContain('compliance_rules_org_policy');
    expect(policies).toContain('auto_tables_org_policy');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Trigger Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have immutability trigger on traceability_links', async () => {
    const result = await pool.query(`
      SELECT tgname 
      FROM pg_trigger 
      WHERE tgname = 'traceability_links_immutable'
    `);

    expect(result.rowCount).toBe(1);
  });

  it('should have immutability trigger on change_propagation_events', async () => {
    const result = await pool.query(`
      SELECT tgname 
      FROM pg_trigger 
      WHERE tgname = 'propagation_events_immutable'
    `);

    expect(result.rowCount).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Function Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have detect_impacted_links function', async () => {
    const result = await pool.query(`
      SELECT proname 
      FROM pg_proc 
      WHERE proname = 'detect_impacted_links' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'intelligent_docs')
    `);

    expect(result.rowCount).toBe(1);
  });

  it('should have calculate_compliance_score function', async () => {
    const result = await pool.query(`
      SELECT proname 
      FROM pg_proc 
      WHERE proname = 'calculate_compliance_score' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'intelligent_docs')
    `);

    expect(result.rowCount).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Seed Data Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have seeded compliance rules', async () => {
    const result = await pool.query(`
      SELECT rule_id, name, category, severity 
      FROM intelligent_docs.compliance_rules 
      WHERE organization_id IS NULL
      ORDER BY rule_id
    `);

    expect(result.rowCount).toBeGreaterThanOrEqual(10);
    
    const ruleIds = result.rows.map(r => r.rule_id);
    expect(ruleIds).toContain('STRUCT-001');
    expect(ruleIds).toContain('STRUCT-002');
    expect(ruleIds).toContain('CONTENT-001');
    expect(ruleIds).toContain('CITE-001');
    expect(ruleIds).toContain('DATA-001');
    expect(ruleIds).toContain('SIG-001');
  });

  it('should have rules for all submission types', async () => {
    const result = await pool.query(`
      SELECT DISTINCT unnest(applicable_submissions) as submission_type
      FROM intelligent_docs.compliance_rules
      WHERE organization_id IS NULL
    `);

    const types = result.rows.map(r => r.submission_type);
    expect(types).toContain('IND');
    expect(types).toContain('510K');
    expect(types).toContain('NDA');
    expect(types).toContain('BLA');
    expect(types).toContain('PMA');
    expect(types).toContain('MAA');
    expect(types).toContain('DE_NOVO');
    expect(types).toContain('EUA');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Index Verification
  // ─────────────────────────────────────────────────────────────────────────────

  it('should have search index on source_documents', async () => {
    const result = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'intelligent_docs' 
        AND tablename = 'source_documents'
        AND indexname LIKE '%search%'
    `);

    expect(result.rowCount).toBe(1);
  });
});
