/**
 * The phase-5 global compliance rules are seeded once, and no score is
 * returned for a document no rule was run against.
 *
 * db/migrations/20260129_phase5_intelligent_document_system.sql re-executes on
 * every deploy (C2C_MIGRATION_FILES). Its seed guarded on
 * ON CONFLICT (organization_id, rule_id), and a global rule's organization_id
 * is NULL — NULLs never conflict — so each deploy added 11 more copies.
 * calculate_compliance_score returned (rules - 2) / rules, "-- Placeholder",
 * and 100 when no rule applied.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/20260129_phase5_intelligent_document_system.sql'), 'utf8');
const globalRules = async (pg: PGlite) => (await pg.query<{ n: number; distinct_ids: number }>(
  `SELECT count(*)::int AS n, count(DISTINCT rule_id)::int AS distinct_ids
     FROM intelligent_docs.compliance_rules WHERE organization_id IS NULL`)).rows[0];

describe('the phase-5 compliance rule seed, replayed on every deploy', () => {
  it('holds one copy of each global rule however often it runs', async () => {
    const pg = new PGlite();
    try {
      for (let deploy = 0; deploy < 3; deploy++) await pg.exec(SQL);
      expect(await globalRules(pg)).toEqual({ n: 11, distinct_ids: 11 });
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('removes the exact copies earlier deploys left, and keeps a copy someone changed', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      // What a database deployed before holds: the same 11 rules, twice more.
      for (let copy = 0; copy < 2; copy++) {
        await pg.exec(`INSERT INTO intelligent_docs.compliance_rules
          (rule_id, name, description, category, severity, regulatory_reference, applicable_submissions, created_at)
          SELECT rule_id, name, description, category, severity, regulatory_reference, applicable_submissions,
                 created_at + interval '${copy + 1} day'
            FROM intelligent_docs.compliance_rules WHERE organization_id IS NULL AND created_at = (
              SELECT min(created_at) FROM intelligent_docs.compliance_rules)`);
      }
      await pg.exec(`UPDATE intelligent_docs.compliance_rules SET severity = 'warning'
        WHERE id = (SELECT id FROM intelligent_docs.compliance_rules
                     WHERE rule_id = 'SIG-001' ORDER BY created_at DESC LIMIT 1)`);
      expect((await globalRules(pg)).n).toBe(33);

      await pg.exec(SQL);
      expect(await globalRules(pg)).toEqual({ n: 12, distinct_ids: 11 });
      const sig = (await pg.query<{ severity: string }>(
        `SELECT severity FROM intelligent_docs.compliance_rules WHERE rule_id = 'SIG-001' ORDER BY created_at`)).rows;
      expect(sig.map((r) => r.severity)).toEqual(['error', 'warning']);
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('returns no compliance score for a document no rule was run against', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      const score = async (type: string) => (await pg.query<{ s: number | null }>(
        `SELECT intelligent_docs.calculate_compliance_score(gen_random_uuid(), gen_random_uuid(), $1) AS s`, [type])).rows[0].s;
      expect(await score('IND')).toBeNull();
      expect(await score('NO_SUCH_TYPE')).toBeNull();
    } finally {
      await pg.close();
    }
  }, 60_000);
});
