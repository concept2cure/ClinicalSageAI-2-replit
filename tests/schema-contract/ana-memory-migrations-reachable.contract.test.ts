/**
 * Contract: the tables AnA's selfhood writes to are on the durable apply path.
 *
 * Three migrations sat in the root migrations/ tree on NO durable applier —
 * not journaled, not `_gcc_`, not in C2C_MIGRATION_FILES — so only a FRESH
 * install (root-tree overlay) ever created what they create. On every database
 * maintained by deploy-migrate:
 *
 *   - ana_relational_profiles (20260612) did not exist, and both halves of
 *     relational-profile-service swallow the resulting 42P01 — AnA's
 *     per-user/per-project relational memory, the RELATIONAL CONTEXT block her
 *     personality core promises, was silently dead. The external-intelligence
 *     tables written by the nightly sweep were equally absent.
 *   - conversation_working_memory.embedding (20260602) did not exist, so
 *     ENABLE_SEMANTIC_WORKING_MEMORY could never actually embed.
 *   - conversation_working_memory.project_id (20260820, new) is what makes the
 *     live AnA chat path's thread-keyed rows eligible for nightly consolidation
 *     into project_memory_entries at all.
 *
 * This test pins all three into C2C_MIGRATION_FILES (the one durable applier),
 * pins the intra-set ordering they need, and applies the two pgvector-free
 * files against PGlite — twice, because a deploy re-runs the whole set.
 * 20260602 needs the vector type PGlite cannot load; its apply coverage lives
 * where the C-37 trio's does (verify-migration-set.mjs against real Postgres),
 * and here it is pinned as present, ordered, and extension-guarded.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PROJECT_ATTRIBUTION = 'migrations/20260820_working_memory_project_id.sql';
const EMBEDDINGS = 'migrations/20260602_working_memory_embeddings.sql';
const RELATIONAL = 'migrations/20260612_ana_relational_external_intel.sql';
const RIM_PATTERNS = 'migrations/20260820b_rim_learned_patterns.sql';
const OUTCOME_LOG = 'migrations/0013_ana_intelligence_system.sql';
// Imported rather than re-typed — see the note in tenant-isolation-sweep.contract.test.ts.
const SWEEP = TENANT_ISOLATION_SWEEP;

const readMig = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('AnA memory migrations are on the durable apply path', () => {
  it('all five are in C2C_MIGRATION_FILES', () => {
    for (const rel of [PROJECT_ATTRIBUTION, EMBEDDINGS, RELATIONAL, RIM_PATTERNS, OUTCOME_LOG]) {
      expect(C2C_MIGRATION_FILES, `${rel} must be durably applied`).toContain(rel);
    }
  });

  it('20260820 (owns the CREATE TABLE) runs before 20260602 (ALTERs it)', () => {
    // On a set-only database conversation_working_memory exists ONLY because
    // 20260820 creates it; the embedding ALTER against nothing would fail the
    // deploy.
    const createAt = C2C_MIGRATION_FILES.indexOf(PROJECT_ATTRIBUTION);
    const alterAt = C2C_MIGRATION_FILES.indexOf(EMBEDDINGS);
    expect(createAt).toBeGreaterThan(-1);
    expect(alterAt).toBeGreaterThan(createAt);
  });

  it('all five run before the tenant-isolation sweep, which must stay last', () => {
    // The sweep only policies tables that exist when it runs. Created after it,
    // ana_relational_profiles, conversation_working_memory, the RIM pattern
    // tables and the outcome log would be readable across tenants under
    // RLS_ENFORCE=on.
    const sweepAt = C2C_MIGRATION_FILES.indexOf(SWEEP);
    expect(C2C_MIGRATION_FILES[C2C_MIGRATION_FILES.length - 1]).toBe(SWEEP);
    for (const rel of [PROJECT_ATTRIBUTION, EMBEDDINGS, RELATIONAL, RIM_PATTERNS, OUTCOME_LOG]) {
      expect(C2C_MIGRATION_FILES.indexOf(rel)).toBeLessThan(sweepAt);
    }
  });

  it('20260602 guards its pgvector dependency with CREATE EXTENSION IF NOT EXISTS', () => {
    // PGlite cannot apply this file (vector type); this pin plus the real-
    // cluster verify-migration-set run is its stated coverage boundary.
    expect(readMig(EMBEDDINGS)).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/i);
  });
});

describe('the pgvector-free pair applies cleanly, twice, and yields the promised shape', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    // The FK targets these migrations rely on, in journal shape (minimal).
    await pg.exec(`
      CREATE TABLE organizations (id serial PRIMARY KEY, name text);
      CREATE TABLE users (id serial PRIMARY KEY, email text);
      CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer, name text);
      CREATE TABLE concept2cure_conversations (id serial PRIMARY KEY, project_id integer, thread_id text);
    `);
    // Applied TWICE: a deploy re-runs the whole set every time, so a
    // non-idempotent file breaks the SECOND deploy, not the first.
    for (const pass of [1, 2]) {
      for (const rel of [PROJECT_ATTRIBUTION, RELATIONAL, RIM_PATTERNS, OUTCOME_LOG]) {
        try {
          await pg.exec(readMig(rel));
        } catch (err) {
          throw new Error(`pass ${pass}: ${rel} failed — ${(err as Error).message}`);
        }
      }
    }
  }, 120_000);

  afterAll(async () => {
    await pg.close();
  });

  it('conversation_working_memory exists with project attribution', async () => {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'conversation_working_memory'`
    );
    const cols = rows.map(r => r.column_name);
    for (const col of [
      'id',
      'conversation_id',
      'thread_id',
      'project_id',
      'organization_id',
      'summary',
      'structured_data',
      'message_count_at_generation',
      'generated_at',
    ]) {
      expect(cols, `conversation_working_memory.${col}`).toContain(col);
    }
  });

  it("ana_relational_profiles exists — AnA's relational memory has a home", () => verifyRelationalProfileColumns(pg));

  it('the external-intelligence tables the nightly sweep writes exist', async () => {
    for (const table of ['external_intelligence_findings', 'external_intelligence_runs']) {
      const { rows } = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );
      expect(rows[0].n, table).toBe(1);
    }
  });

  it('the RIM judgment tables exist — aggregate patterns plus their append-only trail', async () => {
    for (const table of ['rim_learned_patterns', 'rim_pattern_observations']) {
      const { rows } = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );
      expect(rows[0].n, table).toBe(1);
    }
    // The upsert target the persistence module's ON CONFLICT clause depends on.
    const idx = await pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'rim_learned_patterns'`
    );
    expect(idx.rows.map(r => r.indexname)).toContain('idx_rim_learned_patterns_key');
  });

  it("ana_outcome_log exists — the table session bootstrap reads for AnA's past lessons", async () => {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ana_outcome_log'`
    );
    const cols = rows.map(r => r.column_name);
    for (const col of [
      'organization_id',
      'capability_key',
      'outcome',
      'lessons_learned',
      'section_code',
    ]) {
      expect(cols, `ana_outcome_log.${col}`).toContain(col);
    }
    // The 0013 file's trailing DO block ALTERs project_intelligence_profiles,
    // a push-surface table this fixture (like a set-only database) does not
    // have. The file applying twice above proves the table-existence guard
    // holds; this pins that no phantom table appeared either.
    const phantom = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name = 'project_intelligence_profiles'`
    );
    expect(phantom.rows[0].n).toBe(0);
  });

  it('converges the legacy working-memory shape before indexing its attribution columns', verifyLegacyWorkingMemory);
});

async function verifyLegacyWorkingMemory(): Promise<void> {
    const legacy = new PGlite();
    try {
      await legacy.exec(`
        CREATE TABLE organizations (id serial PRIMARY KEY, name text);
        CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer, name text);
        CREATE TABLE concept2cure_conversations (id serial PRIMARY KEY, project_id integer);
        CREATE TABLE conversation_working_memory (
          id serial PRIMARY KEY,
          thread_id varchar(255),
          summary text,
          message_count integer,
          generated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await legacy.exec(readMig(PROJECT_ATTRIBUTION));
      await legacy.exec(readMig(PROJECT_ATTRIBUTION));

      const { rows } = await legacy.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'conversation_working_memory'`
      );
      const columns = rows.map(row => row.column_name);
      for (const column of [
        'conversation_id',
        'project_id',
        'organization_id',
        'structured_data',
        'message_count_at_generation',
      ]) {
        expect(columns, `legacy table must gain ${column}`).toContain(column);
      }
    } finally {
      await legacy.close();
    }
  }

async function verifyRelationalProfileColumns(pg: PGlite): Promise<void> {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ana_relational_profiles'`
    );
    const cols = rows.map(r => r.column_name);
    for (const col of [
      'organization_id',
      'user_id',
      'project_id',
      'profile_summary',
      'tone_calibration',
      'emotional_signals',
      'acknowledged_mistakes',
      'interaction_count',
    ]) {
      expect(cols, `ana_relational_profiles.${col}`).toContain(col);
    }
  }

/*
 * AnA's project memory had no creator on the deploy path (the Reporting lane's note of 2026-11-09). Drizzle push
 * created project_memory_entries, and deploy-migrate never pushes, so a database whose push skipped it never got it.
 * install-fresh skips every table with a vector column when pgvector is missing, and three walk databases were built
 * so (2026-11-04, 11-09, 11-11). 0013 now creates it where its key's target, project_intelligence_profiles, exists,
 * without the vector column, which 20260602 adds, as with conversation_working_memory.
 */
describe('project_memory_entries has a creator on the deploy path', () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite();
    // A pgvector-degraded install: push made the plain tables and skipped project_memory_entries.
    await pg.exec(`
      CREATE TABLE organizations (id serial PRIMARY KEY, name text);
      CREATE TABLE users (id serial PRIMARY KEY, email text);
      CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer, name text);
      CREATE TABLE project_intelligence_profiles (id serial PRIMARY KEY, project_id integer, organization_id integer);
      INSERT INTO organizations (name) VALUES ('acme');
      INSERT INTO projects (organization_id, name) VALUES (1, 'P-1');
      INSERT INTO project_intelligence_profiles (project_id, organization_id) VALUES (1, 1);
    `);
    for (const pass of [1, 2]) {
      try { await pg.exec(readMig(OUTCOME_LOG)); } catch (err) { throw new Error(`pass ${pass}: ${(err as Error).message}`); }
    }
  }, 120_000);
  afterAll(async () => { await pg.close(); });

  it('creates the table in the Drizzle model\'s shape, less the vector column', async () => {
    const { rows } = await pg.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'project_memory_entries' ORDER BY ordinal_position`);
    expect(rows.map(r => r.column_name)).toEqual(['id', 'project_profile_id', 'project_id', 'organization_id', 'category',
      'subcategory', 'title', 'content', 'source_document_name', 'source_document_type', 'confidence_score',
      'importance_level', 'is_verified_by_user', 'status', 'extracted_by', 'created_at', 'updated_at']);
    const col = (name: string) => rows.find(r => r.column_name === name)!;
    // The tenant sweep at the end of the set policies a public table keyed by organization_id integer NOT NULL.
    expect(col('organization_id')).toMatchObject({ data_type: 'integer', is_nullable: 'NO' });
    // No default confidence (2026-10-15, 20261015l): nothing measures one.
    expect(col('confidence_score').column_default).toBeNull();
    const idx = await pg.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'project_memory_entries' ORDER BY 1`);
    expect(idx.rows.map(r => r.indexname)).toEqual(expect.arrayContaining(
      ['project_memory_entries_category_idx', 'project_memory_entries_profile_idx', 'project_memory_entries_project_idx']));
  });

  it('takes the feature store\'s write and AnA\'s project read', async () => {
    await pg.query(`INSERT INTO project_memory_entries (project_profile_id, project_id, organization_id, category, title, content, importance_level, extracted_by)
      VALUES (1, 1, 1, 'regulatory', 'Pre-IND meeting', 'FDA agreed the nonclinical package.', 'high', 'ai')`);
    const read = await pg.query<{ title: string; confidence_score: number | null }>(
      `SELECT title, confidence_score FROM project_memory_entries WHERE organization_id = 1 AND project_id = 1 AND status = 'active'`);
    expect(read.rows).toEqual([{ title: 'Pre-IND meeting', confidence_score: null }]);
  });

  it('refuses a key to no project profile', async () => {
    await expect(pg.query(`INSERT INTO project_memory_entries (project_profile_id, project_id, organization_id, category, title, content)
      VALUES (999, 1, 1, 'risk', 't', 'c')`)).rejects.toMatchObject({ code: '23503' }); // a foreign-key refusal, not a missing table
  });

  it('20260602 adds the embedding, after 0013 and before the tenant sweep', () => {
    expect(readMig(EMBEDDINGS)).toMatch(/ALTER TABLE IF EXISTS project_memory_entries\s+ADD COLUMN IF NOT EXISTS embedding vector\(1536\)/i);
    const at = (rel: string) => C2C_MIGRATION_FILES.indexOf(rel);
    expect(at(OUTCOME_LOG)).toBeLessThan(at(EMBEDDINGS));
    expect(at(EMBEDDINGS)).toBeLessThan(at(SWEEP));
  });
});
