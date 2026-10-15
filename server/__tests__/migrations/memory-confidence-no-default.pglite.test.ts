/**
 * A memory entry nobody scored is stored unscored on a database provisioned
 * before the 0.8 default was dropped.
 *
 * client_memory_entries and project_memory_entries come from shared/schema.ts
 * (drizzle push, install-fresh only), where confidence_score defaulted to 0.8.
 * The default was dropped there on 2026-10-15, but a deploy never re-pushes
 * the schema, so every database provisioned earlier kept DEFAULT 0.8 and any
 * writer that named no confidence still stored an 80% confidence nobody
 * assessed. migrations/20261015l_memory_confidence_no_default.sql (deploy set)
 * drops the default where it is still there. Applied twice, against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — a plain .mjs module, no declarations.
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20261015l_memory_confidence_no_default.sql';
const read = () => fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');

/** The two tables as a database provisioned before 2026-10-15 holds them. */
const AS_PROVISIONED = `
  CREATE TABLE client_memory_entries (id serial PRIMARY KEY, organization_id integer NOT NULL,
    title text NOT NULL, confidence_score real DEFAULT 0.8);
  CREATE TABLE project_memory_entries (id serial PRIMARY KEY, organization_id integer NOT NULL,
    title text NOT NULL, confidence_score real DEFAULT 0.8);
  INSERT INTO client_memory_entries (organization_id, title, confidence_score) VALUES (1, 'scored', 0.95);
  INSERT INTO project_memory_entries (organization_id, title) VALUES (1, 'written before');
`;

const TABLES = ['client_memory_entries', 'project_memory_entries'];

const unscoredInsert = async (pg: PGlite, table: string) =>
  (await pg.query<{ confidence_score: number | null }>(
    `INSERT INTO ${table} (organization_id, title) VALUES (1, 'states no confidence') RETURNING confidence_score`,
  )).rows[0].confidence_score;

describe('migrations/20261015l_memory_confidence_no_default.sql, applied on every deploy', () => {
  it('drops the 0.8 default from both tables, keeps stored scores, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(AS_PROVISIONED);
      // The defect, as such a database answers before this file runs.
      for (const t of TABLES) expect(await unscoredInsert(pg, t)).toBeCloseTo(0.8);
      await pg.exec(`DELETE FROM client_memory_entries WHERE title = 'states no confidence';
                     DELETE FROM project_memory_entries WHERE title = 'states no confidence';`);

      await pg.exec(read());
      await pg.exec(read());

      for (const t of TABLES) expect(await unscoredInsert(pg, t)).toBeNull();
      const defaults = await pg.query<{ table_name: string; column_default: string | null }>(
        `SELECT table_name, column_default FROM information_schema.columns
          WHERE column_name = 'confidence_score' AND table_name = ANY($1::text[]) ORDER BY table_name`,
        [TABLES],
      );
      expect(defaults.rows).toEqual(TABLES.map((table_name) => ({ table_name, column_default: null })));
      // A stored score is kept: one defaulted earlier cannot be told from one someone gave.
      const kept = await pg.query<{ title: string; confidence_score: number }>(
        `SELECT title, confidence_score FROM client_memory_entries WHERE title = 'scored'
         UNION ALL SELECT title, confidence_score FROM project_memory_entries WHERE title = 'written before'`,
      );
      expect(kept.rows.map((r) => [r.title, Number(r.confidence_score.toFixed(2))])).toEqual([
        ['scored', 0.95],
        ['written before', 0.8],
      ]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('creates nothing, and fails nothing, where neither table exists', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(read());
      await pg.exec(read());
      const t = await pg.query(`SELECT 1 FROM pg_class WHERE relname = ANY($1::text[])`, [TABLES]);
      expect(t.rows).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('is in the deploy set above the isolation tail, with the audit header', () => {
    const at = (C2C_MIGRATION_FILES as string[]).indexOf(FILE);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan((C2C_MIGRATION_FILES as string[]).indexOf(UUID_TENANT_ISOLATION_NONPUBLIC));
    expect(read().split('\n').slice(0, 40).join('\n')).toContain('eCTD REGULATORY AUDIT CONTEXT');
  });
});
