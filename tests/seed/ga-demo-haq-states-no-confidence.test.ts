/**
 * The GA demo's HAQ seed states no confidence on the records it writes.
 *
 * scripts/seed/ga-demo.d/94-haq.mjs inserted its letters and questions into
 * project_memory_entries without naming confidence_score, so a database
 * provisioned before 2026-10-15 (DEFAULT 0.8 still on the column; a deploy
 * never re-pushes the schema) stored each one as a memory entry claiming an
 * 80% confidence nobody assessed. The seed now writes NULL. It runs here as
 * written, against PGlite, with the table as such a database holds it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_94 = '../../scripts/seed/ga-demo.d/94-haq.mjs';

let pg: PGlite;
const client = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { rows: r.rows as Array<Record<string, unknown>>, rowCount: r.affectedRows ?? r.rows.length };
  },
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL);
    CREATE TABLE project_intelligence_profiles (
      id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL,
      profile_status text);
    INSERT INTO projects (organization_id) VALUES (42);
    INSERT INTO project_intelligence_profiles (project_id, organization_id, profile_status) VALUES (1, 42, 'active');
    CREATE TABLE project_memory_entries (
      id serial PRIMARY KEY, project_profile_id integer NOT NULL, project_id integer NOT NULL,
      organization_id integer NOT NULL, category text NOT NULL, subcategory text, title text NOT NULL,
      content text NOT NULL, confidence_score real DEFAULT 0.8, extracted_by text DEFAULT 'ai',
      status text DEFAULT 'active');
  `);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('ga-demo 94-haq', () => {
  it('writes every HAQ record with confidence_score NULL, not the column default', async () => {
    const seed = ((await import(SEED_94)) as { default: SeedFn }).default;
    await seed(client, { org: { id: 42 }, admin: { id: 1 } });

    const rows = await pg.query<{ subcategory: string; confidence_score: number | null }>(
      `SELECT subcategory, confidence_score FROM project_memory_entries ORDER BY id`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.filter((r) => r.confidence_score !== null)).toEqual([]);
  }, 60_000);
});
