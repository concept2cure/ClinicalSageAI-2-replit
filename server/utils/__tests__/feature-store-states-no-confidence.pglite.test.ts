/**
 * A feature-store record states no confidence.
 *
 * createFeatureStore().insert left confidenceScore out, so Drizzle wrote
 * DEFAULT for it, and project_memory_entries on a database provisioned before
 * 2026-10-15 still carries DEFAULT 0.8: shared/schema.ts dropped the default,
 * but a deploy never re-pushes the schema. Every feature-store record (HAQ
 * questions, mission-control artifacts) was stored as a memory entry claiming
 * an 80% confidence that nobody assessed. The writer now states null. Run
 * through the real Drizzle insert against PGlite, with the table as such a
 * database holds it; only the database is replaced.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

let pg: PGlite;
let drz: ReturnType<typeof drizzle>;

vi.mock('../../db', () => ({
  get db() {
    return drz;
  },
}));

import { createFeatureStore } from '../feature-persistence';

beforeAll(async () => {
  pg = new PGlite();
  drz = drizzle(pg);
  await pg.exec(`
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL);
    CREATE TABLE project_intelligence_profiles (
      id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL);
    INSERT INTO projects (organization_id) VALUES (5);
    INSERT INTO project_intelligence_profiles (project_id, organization_id) VALUES (1, 5);
    -- Every column of the Drizzle model, as a database provisioned before
    -- 2026-10-15 holds it: confidence_score real DEFAULT 0.8.
    CREATE TABLE project_memory_entries (
      id serial PRIMARY KEY, project_profile_id integer NOT NULL, project_id integer NOT NULL,
      organization_id integer NOT NULL, category text NOT NULL, subcategory text, title text NOT NULL,
      content text NOT NULL, source_document_name text, source_document_type text,
      confidence_score real DEFAULT 0.8, importance_level text DEFAULT 'medium',
      is_verified_by_user boolean DEFAULT false, embedding real[], status text DEFAULT 'active',
      extracted_by text DEFAULT 'ai', created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL);
  `);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('feature store insert', () => {
  it('stores confidence_score NULL, not the column default', async () => {
    const store = createFeatureStore('haq_question');
    const entity = await store.insert(5, 'question', 'IR-1', { q: 'Provide the ORR by age subgroup.' });
    expect(entity.q).toBe('Provide the ORR by age subgroup.');

    const row = await pg.query<{ confidence_score: number | null; extracted_by: string }>(
      `SELECT confidence_score, extracted_by FROM project_memory_entries WHERE id = $1`,
      [entity.id],
    );
    expect(row.rows).toEqual([{ confidence_score: null, extracted_by: 'system' }]);
  }, 60_000);
});
