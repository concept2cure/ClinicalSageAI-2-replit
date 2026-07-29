/**
 * C-8 fix acceptance tests: the REAL GovernanceBoundaryService against the
 * REAL deployed schema.
 *
 * The database module is mocked — but only to redirect the handle at a real
 * in-process Postgres (PGlite) carrying the canonical lineage:
 *   - db/migrations/20260323_assumption_decision_contradiction.sql (deployed shape)
 *   - db/migrations/20260725_governance_boundary_tables.sql (C-8 fix)
 * This is NOT the vi.mock-with-stubs anti-pattern that hid C-1/C-8: every query
 * here executes against genuine DDL, and a vocabulary divergence fails.
 *
 * What these prove:
 *   1. The gates FIRE against deployed data (they never had before — the old
 *      queries threw on nonexistent columns and callers swallowed the throw).
 *   2. The gates FAIL CLOSED when their storage is unreachable.
 *   3. Every evaluation writes a durable transition audit record, and a
 *      persistence failure denies the transition rather than passing silently.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DB_TIMEOUT_MS = 120_000;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Live-bound holder so the vi.mock factory (hoisted) can see the db created in
// beforeAll. The getter keeps the binding live.
const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return null;
  },
}));

import { GovernanceBoundaryService } from '../../server/services/governance-boundary-service';

let pglite: import('@electric-sql/pglite').PGlite;
let service: GovernanceBoundaryService;

async function sqlRows<T>(q: string, params: unknown[] = []): Promise<T[]> {
  const r = await pglite.query<T>(q, params);
  return r.rows;
}

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');

  pglite = new PGlite();
  // FK targets the canonical migrations reference.
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
    CREATE TABLE projects (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT);
    CREATE TABLE concept2cure_artifacts (id SERIAL PRIMARY KEY, artifact_id UUID DEFAULT gen_random_uuid(), organization_id INTEGER, status TEXT, updated_at TIMESTAMPTZ);
    CREATE TABLE concept2cure_artifact_versions (id SERIAL PRIMARY KEY, artifact_id INTEGER);
    INSERT INTO organizations (id, name) VALUES (1, 'test-org');
    INSERT INTO users (id, email) VALUES (1, 'gate-tester@example.com');
    INSERT INTO projects (id, organization_id, name) VALUES (1, 1, 'test-project');
  `);
  // The canonical lineage, applied from the real files.
  for (const f of [
    'db/migrations/20260323_assumption_decision_contradiction.sql',
    'db/migrations/20260725_governance_boundary_tables.sql',
  ]) {
    await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
  }
  h.db = drizzle(pglite);
  service = GovernanceBoundaryService.getInstance();
}, DB_TIMEOUT_MS);

afterAll(async () => {
  await pglite?.close();
});

describe('C-8 fix: gates fire against the deployed schema', () => {
  it(
    'an unreviewed active assumption blocks governed_draft → approved',
    async () => {
      // Freshly created assumption: status defaults toward 'active', reviewed_by NULL.
      await sqlRows(
        `INSERT INTO assumption_records
           (organization_id, project_id, assumption_code, title, domain_track,
            category, assumed_value, rationale, source_type, status, created_by)
         VALUES (1, 1, 'ASM-GATE-1', 'Effect size', 'clinical', 'efficacy',
                 '0.35', 'pilot data', 'protocol', 'active', 1)`,
      );

      const result = await service.evaluateTransition({
        organizationId: 1,
        projectId: 1,
        fromBoundary: 'governed_draft',
        toBoundary: 'approved',
        actorId: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedReasons.join('\n')).toMatch(/assumption/i);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'the same assumption, once reviewed, no longer blocks',
    async () => {
      await sqlRows(
        `UPDATE assumption_records
            SET reviewed_by = '1', reviewed_at = NOW()
          WHERE assumption_code = 'ASM-GATE-1'`,
      );

      const result = await service.evaluateTransition({
        organizationId: 1,
        projectId: 1,
        fromBoundary: 'governed_draft',
        toBoundary: 'approved',
        actorId: 1,
      });

      expect(
        result.blockedReasons.filter((r) => /assumption\(s\) not yet approved/i.test(r)),
      ).toHaveLength(0);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'a proposed decision blocks approved → locked; an executed one does not',
    async () => {
      await sqlRows(
        `INSERT INTO decision_records
           (organization_id, project_id, decision_code, title, domain_track,
            recommendation_type, recommendation_summary, confidence_level,
            action_state, decided_by)
         VALUES (1, 1, 'DEC-GATE-1', 'Dose selection', 'clinical',
                 'dose_selection', 'use 10mg', 'high', 'proposed', 'user-1')`,
      );

      const blocked = await service.evaluateTransition({
        organizationId: 1,
        projectId: 1,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: 1,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedReasons.join('\n')).toMatch(/decision/i);

      await sqlRows(
        `UPDATE decision_records SET action_state = 'executed'
          WHERE decision_code = 'DEC-GATE-1'`,
      );

      const after = await service.evaluateTransition({
        organizationId: 1,
        projectId: 1,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: 1,
      });
      expect(
        after.blockedReasons.filter((r) => /decision\(s\) unresolved/i.test(r)),
      ).toHaveLength(0);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'confidence ranks across BOTH vocabularies: deployed "low" fails a legacy "moderate" minimum; "high" passes',
    async () => {
      const [{ id: lowId }] = await sqlRows<{ id: string }>(
        `INSERT INTO decision_records
           (organization_id, project_id, decision_code, title, domain_track,
            recommendation_type, recommendation_summary, confidence_level,
            action_state, decided_by)
         VALUES (1, 1, 'DEC-CONF-LOW', 'weak', 'clinical', 'study_design', 's',
                 'low', 'executed', 'user-1')
         RETURNING id`,
      );

      // The seeded "Approved to Locked" rule carries minimumConfidence 'moderate'
      // (legacy vocabulary). The decision carries 'low' (deployed vocabulary).
      const blocked = await service.evaluateTransition({
        organizationId: 1,
        projectId: 1,
        decisionId: lowId,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: 1,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedReasons.join('\n')).toMatch(/confidence "low" does not meet minimum "moderate"/i);

      const [{ id: highId }] = await sqlRows<{ id: string }>(
        `INSERT INTO decision_records
           (organization_id, project_id, decision_code, title, domain_track,
            recommendation_type, recommendation_summary, confidence_level,
            action_state, decided_by)
         VALUES (1, 1, 'DEC-CONF-HIGH', 'strong', 'clinical', 'study_design', 's',
                 'high', 'executed', 'user-1')
         RETURNING id`,
      );
      const passed = await service.evaluateTransition({
        organizationId: 1,
        projectId: 1,
        decisionId: highId,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: 1,
      });
      expect(
        passed.blockedReasons.filter((r) => /confidence/i.test(r)),
      ).toHaveLength(0);
    },
    DB_TIMEOUT_MS,
  );
});

describe('C-8 fix: audit trail and fail-closed behavior', () => {
  it(
    'every evaluation writes a durable transition record — including denials',
    async () => {
      const [{ count }] = await sqlRows<{ count: string }>(
        `SELECT count(*)::text AS count FROM governance_boundary_transitions`,
      );
      // The tests above ran several evaluations; each must have left a row.
      expect(Number(count)).toBeGreaterThanOrEqual(5);

      const [{ denied }] = await sqlRows<{ denied: string }>(
        `SELECT count(*)::text AS denied FROM governance_boundary_transitions
          WHERE transition_allowed = false`,
      );
      expect(Number(denied)).toBeGreaterThanOrEqual(2);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'gate storage unreachable → transition is DENIED, not thrown and not allowed',
    async () => {
      // Simulate the pre-fix production condition for one table.
      await pglite.exec(`ALTER TABLE decision_records RENAME TO decision_records_gone`);
      try {
        const result = await service.evaluateTransition({
          organizationId: 1,
          projectId: 1,
          fromBoundary: 'approved',
          toBoundary: 'locked',
          actorId: 1,
        });
        // The old behavior: throw → caller's bare catch → gates skipped → allowed.
        // The fixed behavior: no throw, explicit denial with a stated reason.
        expect(result.allowed).toBe(false);
        expect(result.blockedReasons.join('\n')).toMatch(/failing closed/i);
      } finally {
        await pglite.exec(`ALTER TABLE decision_records_gone RENAME TO decision_records`);
      }
    },
    DB_TIMEOUT_MS,
  );

  it(
    'audit-record persistence failure denies the transition',
    async () => {
      await pglite.exec(`ALTER TABLE governance_boundary_transitions RENAME TO gbt_gone`);
      try {
        const result = await service.evaluateTransition({
          organizationId: 1,
          projectId: 1,
          fromBoundary: 'governed_draft',
          toBoundary: 'approved',
          actorId: 1,
        });
        expect(result.allowed).toBe(false);
        expect(result.blockedReasons.join('\n')).toMatch(/audit record/i);
      } finally {
        await pglite.exec(`ALTER TABLE gbt_gone RENAME TO governance_boundary_transitions`);
      }
    },
    DB_TIMEOUT_MS,
  );
});
