/**
 * Schema-contract tests for the operating-system stores (ADR-0010).
 *
 * These tests document and detect conflicts C-1, C-2, C-6 and C-7 from
 * docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md.
 *
 * `assumption_records` and `decision_records` are each defined twice, with
 * incompatible DDL, in two competing migration lineages. Both definitions are
 * guarded by CREATE TABLE IF NOT EXISTS, so the surviving shape is decided by
 * migration order rather than by code — and the two live consumers
 * (Drizzle via shared/schema/operating-system.ts, raw SQL via
 * assumption-registry-service.ts) assume different shapes.
 *
 * These assert the CURRENT, BROKEN behavior so it is visible and regression-
 * tested. When ADR-0006/0007 land and the lineages are reconciled, the
 * `describe('post-reconciliation')` block flips on and this documentation block
 * is deleted.
 *
 * NOTE: no `vi.mock('../../db')` here, by design. Mocking the database is what
 * allowed these conflicts to survive — mocks accept any column and any enum
 * value. See docs/architecture/C2C_CANONICAL_SERVICE_AND_STORE_MAP.md §5.1.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { SchemaContractDb, OPERATING_SYSTEM_MIGRATIONS as M } from './harness';

/**
 * Each case boots a fresh in-process Postgres and applies real migration files;
 * two cases boot two. That is inherently slower than vitest's 10s default — the
 * cost of testing the actual schema instead of a mock. This is a timeout for
 * genuinely slow work, not a relaxed assertion.
 */
const DB_TIMEOUT_MS = 120_000;

let db: SchemaContractDb | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

/** Status values server/services/assumption-registry-service.ts can write (:56, :316). */
const SERVICE_ASSUMPTION_STATUSES = [
  'active',
  'under_review',
  'superseded',
  'withdrawn',
  'challenged',
] as const;

/** Values the Drizzle assumption_status pgEnum declares (shared/schema/operating-system.ts:72). */
const DRIZZLE_ASSUMPTION_STATUSES = [
  'draft',
  'review',
  'approved',
  'superseded',
  'rejected',
] as const;

describe('C-6: the two migration lineages define the same tables incompatibly', () => {
  it('applying the Drizzle-shaped migration first makes the raw-SQL one a silent no-op', async () => {
    db = await SchemaContractDb.create([M.drizzleShaped, M.rawSqlShaped]);

    // Both report success — the second is silently skipped by IF NOT EXISTS.
    expect(db.applied.every((a) => a.applied)).toBe(true);

    const cols = await db.columns('assumption_records');
    // The Drizzle shape survives...
    expect(cols).toContain('value_type');
    expect(cols).toContain('name');
    // ...and the raw-SQL columns were never created, despite that migration
    // reporting success.
    expect(cols).not.toContain('assumption_code');
    expect(cols).not.toContain('assumed_value');
    expect(cols).not.toContain('confidence_level');
  }, DB_TIMEOUT_MS);

  it('applying the raw-SQL migration first makes the Drizzle one FAIL outright', async () => {
    db = await SchemaContractDb.create([M.rawSqlShaped, M.drizzleShaped]);

    const [rawSql, drizzle] = db.applied;
    expect(rawSql.applied).toBe(true);
    expect(drizzle.applied).toBe(false);
    // It fails building an index over a column its own CREATE TABLE never made,
    // because the table already existed in the other shape.
    expect(drizzle.error).toMatch(/column "confidence" does not exist/i);

    const cols = await db.columns('assumption_records');
    expect(cols).toContain('assumption_code');
    expect(cols).not.toContain('value_type');
  }, DB_TIMEOUT_MS);

  it('the surviving schema depends on migration order — which is the defect', async () => {
    const forward = await SchemaContractDb.create([M.drizzleShaped, M.rawSqlShaped]);
    const reverse = await SchemaContractDb.create([M.rawSqlShaped, M.drizzleShaped]);
    try {
      const a = await forward.columns('assumption_records');
      const b = await reverse.columns('assumption_records');
      expect(a).not.toEqual(b);
    } finally {
      await forward.close();
      await reverse.close();
    }
  }, DB_TIMEOUT_MS);
});

describe('C-1 / C-7: the raw-SQL service cannot write to the Drizzle-shaped table', () => {
  it('every assumption-registry-service INSERT fails when the Drizzle shape wins', async () => {
    db = await SchemaContractDb.create([M.drizzleShaped]);

    const res = await db.tryWrite(
      `INSERT INTO assumption_records
         (organization_id, project_id, assumption_code, title, domain_track,
          category, assumed_value, rationale, source_type, status)
       VALUES (1, 1, 'ASM-CLIN-001', 'Effect size', 'clinical',
               'efficacy', '0.35', 'from pilot', 'protocol', 'active')`,
    );

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/assumption_code.*does not exist/i);
  }, DB_TIMEOUT_MS);

  it('the service status vocabulary is disjoint from the Drizzle enum', async () => {
    db = await SchemaContractDb.create([M.drizzleShaped]);

    const declared = await db.enumValues('assumption_status');
    expect(declared).not.toBeNull();
    expect(declared).toEqual([...DRIZZLE_ASSUMPTION_STATUSES]);

    // Four of the five values the service writes do not exist in the enum.
    const unwritable = SERVICE_ASSUMPTION_STATUSES.filter((s) => !declared!.includes(s));
    expect(unwritable).toEqual(['active', 'under_review', 'withdrawn', 'challenged']);
  }, DB_TIMEOUT_MS);

  it('domain_track carries two unrelated concepts across the definitions', async () => {
    const drizzle = await SchemaContractDb.create([M.drizzleShaped]);
    const rawSql = await SchemaContractDb.create([M.rawSqlShaped]);
    try {
      // Drizzle: product modality. Raw SQL: functional discipline. Zero overlap.
      const modality = await drizzle.enumValues('domain_track');
      expect(modality).toEqual(
        expect.arrayContaining(['biotech', 'device', 'diagnostics']),
      );

      const disciplineAccepted = await rawSql.tryWrite(
        `INSERT INTO assumption_records
           (organization_id, project_id, assumption_code, title, domain_track,
            category, assumed_value, rationale, source_type, created_by)
         VALUES (1, 1, 'ASM-1', 't', 'biostatistics', 'efficacy', 'v', 'r', 'protocol', 1)`,
      );
      expect(disciplineAccepted.ok).toBe(true);

      // 'biostatistics' is meaningless as a modality; 'biotech' as a discipline.
      expect(modality).not.toContain('biostatistics');
    } finally {
      await drizzle.close();
      await rawSql.close();
    }
  }, DB_TIMEOUT_MS);
});

describe('C-2: decision_records collides the same way', () => {
  it('the Drizzle shape wins when applied first, hiding the raw-SQL columns', async () => {
    db = await SchemaContractDb.create([M.drizzleShaped, M.rawSqlShaped]);
    const cols = await db.columns('decision_records');
    expect(cols).toContain('context_type');
    expect(cols).not.toContain('decision_code');
  }, DB_TIMEOUT_MS);

  it('action, approval and escalation are three orthogonal enums in the schema', async () => {
    db = await SchemaContractDb.create([M.drizzleShaped]);

    const action = await db.enumValues('decision_action_state');
    const approval = await db.enumValues('decision_approval_state');
    const escalation = await db.enumValues('decision_escalation_state');

    expect(action).toEqual(['recommended_only', 'prepared', 'executed', 'rejected', 'superseded']);
    expect(approval).toEqual(['not_required', 'pending_review', 'approved', 'rejected']);
    expect(escalation).toEqual(['none', 'recommended', 'opened', 'resolved']);

    // decision-record-service.ts writes 'approved' and 'escalated' into
    // actionState — collapsing three state machines into one column (C-7).
    expect(action).not.toContain('approved');
    expect(action).not.toContain('escalated');
  }, DB_TIMEOUT_MS);
});

/**
 * Flip these on when ADR-0006 + ADR-0007 land. They are the acceptance tests for
 * the reconciliation: one shape, one vocabulary, and every value a service can
 * produce is storable.
 */
describe.skip('post-reconciliation (enable with ADR-0006 + ADR-0007)', () => {
  it('applies the canonical lineage with no order dependence', async () => {
    const forward = await SchemaContractDb.create([M.drizzleShaped, M.rawSqlShaped]);
    const reverse = await SchemaContractDb.create([M.rawSqlShaped, M.drizzleShaped]);
    try {
      expect(await forward.columns('assumption_records')).toEqual(
        await reverse.columns('assumption_records'),
      );
    } finally {
      await forward.close();
      await reverse.close();
    }
  }, DB_TIMEOUT_MS);

  it('accepts every status the service can write', async () => {
    db = await SchemaContractDb.create([M.drizzleShaped]);
    const declared = await db.enumValues('assumption_status');
    for (const status of SERVICE_ASSUMPTION_STATUSES) {
      expect(declared).toContain(status);
    }
  }, DB_TIMEOUT_MS);
});
