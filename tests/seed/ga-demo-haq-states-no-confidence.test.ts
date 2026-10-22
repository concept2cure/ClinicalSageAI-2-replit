/**
 * The GA demo's agency-letter seed states no confidence and approves nothing.
 *
 * scripts/seed/ga-demo.d/94-haq.mjs once inserted its letters and questions
 * into project_memory_entries without naming confidence_score, so a database
 * provisioned before 2026-10-15 (DEFAULT 0.8 still on the column; a deploy
 * never re-pushes the schema) stored each one as a memory entry claiming an
 * 80% confidence nobody assessed. 0308ee257 (2026-10-18) retired that store:
 * the seed now writes the letters to the project inbox
 * (concept2cure_agency_communications) and their questions to
 * agency_communication_questions, which have no confidence column and no
 * approval column (approval is a Part 11 signature a seed cannot make).
 *
 * The seed runs here as written, against PGlite holding the two tables as the
 * real migration files create them, and beside it the retired store with its
 * 0.8 default, so a regression into that store is seen.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_94 = '../../scripts/seed/ga-demo.d/94-haq.mjs';
const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS = [
  'db/migrations/20260331_communication_center_scaffold.sql',
  'migrations/20261018b_agency_response_questions.sql',
];

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
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id));
    CREATE TABLE regulatory_commitments (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (42);
    INSERT INTO users (id) VALUES (1);
    INSERT INTO projects (organization_id) VALUES (42);
    CREATE TABLE project_memory_entries (
      id serial PRIMARY KEY, project_profile_id integer NOT NULL, project_id integer NOT NULL,
      organization_id integer NOT NULL, category text NOT NULL, subcategory text, title text NOT NULL,
      content text NOT NULL, confidence_score real DEFAULT 0.8, extracted_by text DEFAULT 'ai',
      status text DEFAULT 'active');
  `);
  for (const file of MIGRATIONS) await pg.exec(readFileSync(path.join(ROOT, file), 'utf8'));
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

const columns = async (table: string) =>
  (
    await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table],
    )
  ).rows.map((r) => r.column_name);

describe('ga-demo 94-haq', () => {
  it('writes the letters and questions to the inbox, with no confidence and nothing approved', async () => {
    const seed = ((await import(SEED_94)) as { default: SeedFn }).default;
    await seed(client, { org: { id: 42 }, admin: { id: 1 } });

    const letters = await pg.query<{ event_id: string; organization_id: number; project_id: number }>(
      `SELECT event_id, organization_id, project_id FROM concept2cure_agency_communications ORDER BY event_id`,
    );
    expect(letters.rows).toEqual([
      { event_id: 'ace_demo_ema_d120', organization_id: 42, project_id: 1 },
      { event_id: 'ace_demo_fda_ir1', organization_id: 42, project_id: 1 },
    ]);

    const questions = await pg.query<{ question_ref: string; response_revision: number; response_updated_by: number | null }>(
      `SELECT question_ref, response_revision, response_updated_by FROM agency_communication_questions ORDER BY id`,
    );
    expect(questions.rows.map((r) => r.question_ref)).toEqual([
      'IR-1', 'IR-2', 'IR-3', 'IR-4', 'IR-5', 'D120-1', 'D120-2', 'D120-3',
    ]);
    // Every seeded response is a draft revision attributed to the admin; none is signed.
    expect(questions.rows.filter((r) => r.response_revision !== 1 || r.response_updated_by !== 1)).toEqual([]);

    // The retired store, with its 0.8 default, receives nothing.
    expect((await pg.query(`SELECT 1 FROM project_memory_entries`)).rows).toEqual([]);
    // The record the seed writes to has no place for a confidence or an approval.
    for (const table of ['concept2cure_agency_communications', 'agency_communication_questions']) {
      expect((await columns(table)).filter((c) => /confidence|approv/.test(c))).toEqual([]);
    }
  }, 60_000);

  it('is idempotent: a second run adds no letter and no question', async () => {
    const seed = ((await import(SEED_94)) as { default: SeedFn }).default;
    await seed(client, { org: { id: 42 }, admin: { id: 1 } });
    expect((await pg.query(`SELECT 1 FROM concept2cure_agency_communications`)).rows).toHaveLength(2);
    expect((await pg.query(`SELECT 1 FROM agency_communication_questions`)).rows).toHaveLength(8);
  }, 60_000);
});
