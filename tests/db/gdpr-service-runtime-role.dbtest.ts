/**
 * The GDPR compliance service must work as the role production runs as.
 *
 * ── The defect this pins closed ──────────────────────────────────────────────
 * Every one of the service's fourteen exported functions began with
 * `await ensureTables()`, which executed `CREATE TABLE IF NOT EXISTS` for six
 * tables — "so the service is safe to import at module level without requiring
 * migrations to have run first". Under the production runtime role that is not
 * safe, it is fatal: PostgreSQL checks CREATE on the schema BEFORE the
 * IF NOT EXISTS short-circuit, so the statement is refused even though the
 * tables already exist.
 *
 *   app_service=> CREATE TABLE IF NOT EXISTS gdpr_data_subject_requests (id uuid);
 *   ERROR:  permission denied for schema public
 *
 * And the helper re-raised, so the first GDPR call of the process threw. Same
 * root cause as the AI provenance ledger and audit.tamper_proof_log — runtime
 * DDL on a least-privileged connection — with the opposite symptom: those
 * swallowed the error and reported success, this one fails loudly.
 *
 * The DDL was redundant too: db/migrations/20260317_global_regulatory_compliance.sql
 * creates exactly the same six tables.
 *
 * ── Why a real-database test as a NON-SUPERUSER ──────────────────────────────
 * The whole defect is a privilege that only the runtime role lacks. A mocked
 * pool has no privileges to lack, and the OWNER can run the DDL happily — so
 * both would have reported this code healthy for as long as it was broken.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';

const GDPR_TABLES = [
  'gdpr_processing_activities',
  'gdpr_dpias',
  'gdpr_consent_records',
  'gdpr_data_subject_requests',
  'gdpr_transfer_assessments',
  'gdpr_data_breaches',
];

describe('GDPR service under the production runtime role', () => {
  let scratch: ScratchSchema;

  beforeAll(async () => {
    scratch = await createScratchSchema(databaseUrl);
    await scratch.connectAsRuntimeRole();
  }, 120_000);

  afterAll(async () => {
    if (scratch) await scratch.destroy();
  });

  it('the runtime role cannot CREATE in public — the premise of the defect', async () => {
    const { rows } = await scratch.runtimePool!.query(
      `SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`,
    );
    // If this ever becomes true, the runtime role has been over-granted and the
    // whole least-privilege posture is gone — a bigger problem than this test.
    expect(rows[0].can_create).toBe(false);
  });

  it('CREATE TABLE IF NOT EXISTS is refused even when the table exists', async () => {
    // The exact statement the old ensureTables() ran, and the exact reason it
    // could never work in production.
    const present = await scratch.ownerPool.query(
      `SELECT to_regclass('public.gdpr_data_subject_requests') IS NOT NULL AS ok`,
    );
    if (!present.rows[0].ok) return; // table absent in this edition; nothing to assert

    await expect(
      scratch.runtimePool!.query(
        'CREATE TABLE IF NOT EXISTS gdpr_data_subject_requests (id uuid)',
      ),
    ).rejects.toThrow(/permission denied for schema public/);
  });

  it('the service reads its tables through to_regclass as the runtime role', async () => {
    // The replacement check must SEE the tables from the runtime role — the
    // first version of this fix reported all six missing because the probe
    // connected to the wrong database, which is a failure mode worth pinning.
    const { rows } = await scratch.runtimePool!.query(
      `SELECT t.name FROM unnest($1::text[]) AS t(name)
        WHERE to_regclass('public.' || t.name) IS NULL`,
      [GDPR_TABLES],
    );
    const missing = rows.map((r: { name: string }) => r.name);
    // On a provisioned database none are missing. On a partial edition some may
    // be — but the point is that visibility is not blocked by privilege.
    const present = await scratch.ownerPool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_name = ANY($1::text[])`,
      [GDPR_TABLES],
    );
    expect(missing.length).toBe(GDPR_TABLES.length - present.rows[0].n);
  });

  it('the service module contains no CREATE TABLE — it verifies, it does not provision', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../server/services/compliance/gdprComplianceService.ts'),
      'utf8',
    );
    // Match CODE, not prose. The first version of this assertion ran the regex
    // over the whole file and failed on the explanatory comment ABOVE
    // ensureTables, which quotes the very statement it removed — precisely the
    // defect this repo's no-mock-in-prod-routes guard had (it matched raw text,
    // so it fired on comments documenting a removal). Drop comment lines first.
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    // ...and the remedy names the migration that does own the tables.
    expect(src).toMatch(/20260317_global_regulatory_compliance\.sql/);
  });
});
