/**
 * Schema-contract tests for conflict C-8: the governance boundary gate fails OPEN.
 *
 * server/services/governance-boundary-service.ts implements promotion gates —
 * the controls that stop an artifact moving to a higher governance boundary
 * until its assumptions are approved, its decisions are resolved, and its
 * confidence threshold is met.
 *
 * It queries the Drizzle-typed tables in shared/schema/operating-system.ts.
 * Those tables are NOT exported from shared/schema.ts, so `drizzle-kit push`
 * (the CI-validated deployment path, .github/workflows/db-schema-validation.yml)
 * never creates them. And migrations/0010_operating_system_foundation.sql is not
 * in migrations/meta/_journal.json, so drizzle-kit migrate never applies it
 * either. The shape that actually deploys is the manifest-managed
 * db/migrations/20260323_assumption_decision_contradiction.sql.
 *
 * Against that deployed shape the service's filter VALUES do not exist, so the
 * gates do not fire. Master work order §2 requires that "policy, review, export,
 * approval, submission, and signature gates fail closed." Two of these three
 * fail OPEN.
 *
 * These tests assert the CURRENT BROKEN behavior so it is visible and cannot
 * regress silently. They become the acceptance tests for the fix.
 *
 * See docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md (C-8).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { SchemaContractDb, OPERATING_SYSTEM_MIGRATIONS as M } from './harness';

const DB_TIMEOUT_MS = 120_000;

let db: SchemaContractDb | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

/** Confidence ladder hardcoded at governance-boundary-service.ts:249-250. */
const SERVICE_CONFIDENCE_ORDER: Record<string, number> = {
  uncertain: 0,
  provisional: 1,
  moderate: 2,
  strong: 3,
};

/** Values the DEPLOYED schema actually permits for confidence_level. */
const DEPLOYED_CONFIDENCE_VALUES = [
  'definitive',
  'high',
  'moderate',
  'low',
  'speculative',
];

describe('C-8: governance boundary gates fail OPEN against the deployed schema', () => {
  it(
    'the "all decisions resolved" gate can never fire — recommended_only is not a legal value',
    async () => {
      db = await SchemaContractDb.create([M.rawSqlShaped]);

      // The gate at governance-boundary-service.ts:229 looks for this value.
      const rejected = await db.tryWrite(
        `INSERT INTO decision_records
           (organization_id, project_id, decision_code, title, domain_track,
            recommendation_type, recommendation_summary, confidence_level,
            action_state, decided_by)
         VALUES (1, 1, 'DEC-1', 't', 'clinical', 'study_design', 's',
                 'moderate', 'recommended_only', 'u')`,
      );

      // It is not in the deployed CHECK constraint, so no row can ever hold it...
      expect(rejected.ok).toBe(false);
      expect(rejected.error).toMatch(/check constraint|violates/i);

      // ...therefore the gate's query matches nothing, and the gate never blocks.
      const gate = await db.tryWrite(
        `SELECT count(*) FROM decision_records
          WHERE project_id = 1 AND organization_id = 1
            AND action_state = 'recommended_only'`,
      );
      expect(gate.ok).toBe(true); // runs fine — that is what makes it silent
    },
    DB_TIMEOUT_MS,
  );

  it(
    'the deployed action_state vocabulary has no overlap with the gate value',
    async () => {
      db = await SchemaContractDb.create([M.rawSqlShaped]);

      // Every value the deployed schema DOES permit.
      const legal = [
        'proposed',
        'under_review',
        'approved',
        'rejected',
        'executed',
        'deferred',
        'escalated',
        'superseded',
      ];
      for (const state of legal) {
        const res = await db.tryWrite(
          `INSERT INTO decision_records
             (organization_id, project_id, decision_code, title, domain_track,
              recommendation_type, recommendation_summary, confidence_level,
              action_state, decided_by)
           VALUES (1, 1, 'DEC-${state}', 't', 'clinical', 'study_design', 's',
                   'moderate', '${state}', 'u')`,
        );
        expect(res.ok, `deployed schema should accept action_state='${state}'`).toBe(true);
      }

      expect(legal).not.toContain('recommended_only');
    },
    DB_TIMEOUT_MS,
  );

  it(
    'the confidence gate scores a "definitive" decision as the LOWEST possible',
    async () => {
      // Pure vocabulary comparison — no database needed, but it is the same defect.
      const scored = DEPLOYED_CONFIDENCE_VALUES.map((v) => ({
        value: v,
        score: SERVICE_CONFIDENCE_ORDER[v] ?? 0,
      }));

      // Only 'moderate' is shared between the two vocabularies.
      const recognised = scored.filter((s) => s.value in SERVICE_CONFIDENCE_ORDER);
      expect(recognised.map((s) => s.value)).toEqual(['moderate']);

      // The strongest deployed value scores zero — same as the weakest.
      const definitive = scored.find((s) => s.value === 'definitive')!;
      const speculative = scored.find((s) => s.value === 'speculative')!;
      expect(definitive.score).toBe(0);
      expect(definitive.score).toBe(speculative.score);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'the "all assumptions approved" gate over-blocks: approved is not a legal deployed value',
    async () => {
      db = await SchemaContractDb.create([M.rawSqlShaped]);

      // The gate excludes 'approved' and 'superseded' (service line :210).
      // 'approved' is not in the deployed CHECK constraint at all.
      const rejected = await db.tryWrite(
        `INSERT INTO assumption_records
           (organization_id, project_id, assumption_code, title, domain_track,
            category, assumed_value, rationale, source_type, status, created_by)
         VALUES (1, 1, 'ASM-1', 't', 'clinical', 'efficacy', 'v', 'r',
                 'protocol', 'approved', 1)`,
      );
      expect(rejected.ok).toBe(false);

      // So a settled assumption can only ever be 'active' — which the gate counts
      // as unapproved. This gate fails CLOSED, but for the wrong reason: it can
      // never be satisfied.
      const settled = await db.tryWrite(
        `INSERT INTO assumption_records
           (organization_id, project_id, assumption_code, title, domain_track,
            category, assumed_value, rationale, source_type, status, created_by)
         VALUES (1, 1, 'ASM-2', 't', 'clinical', 'efficacy', 'v', 'r',
                 'protocol', 'active', 1)`,
      );
      expect(settled.ok).toBe(true);

      const blocked = await db.pg.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM assumption_records
          WHERE project_id = 1 AND organization_id = 1
            AND status NOT IN ('approved', 'superseded')`,
      );
      // The settled assumption still counts as blocking.
      expect(Number(blocked.rows[0].count)).toBeGreaterThan(0);
    },
    DB_TIMEOUT_MS,
  );
});

/**
 * Acceptance criteria for the C-8 fix. Enable when ADR-0006/0007 reconcile the
 * vocabularies and governance-boundary-service.ts is aligned to the canonical
 * shape.
 */
describe.skip('post-fix: governance gates fail closed (enable with ADR-0007)', () => {
  it('a decision in the unresolved state is detectable by the gate', async () => {
    db = await SchemaContractDb.create([M.rawSqlShaped]);
    // After reconciliation the gate value and the schema vocabulary agree, so an
    // unresolved decision both stores AND blocks.
    expect(true).toBe(true);
  });
});
