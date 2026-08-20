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
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PROJECT_ATTRIBUTION = 'migrations/20260820_working_memory_project_id.sql';
const EMBEDDINGS = 'migrations/20260602_working_memory_embeddings.sql';
const RELATIONAL = 'migrations/20260612_ana_relational_external_intel.sql';
const RIM_PATTERNS = 'migrations/20260820b_rim_learned_patterns.sql';
const SWEEP = 'db/migrations/20260801_tenant_isolation_sweep.sql';

const readMig = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('AnA memory migrations are on the durable apply path', () => {
  it('all four are in C2C_MIGRATION_FILES', () => {
    for (const rel of [PROJECT_ATTRIBUTION, EMBEDDINGS, RELATIONAL, RIM_PATTERNS]) {
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

  it('all four run before the tenant-isolation sweep, which must stay last', () => {
    // The sweep only policies tables that exist when it runs. Created after it,
    // ana_relational_profiles, conversation_working_memory and the RIM pattern
    // tables would be readable across tenants under RLS_ENFORCE=on.
    const sweepAt = C2C_MIGRATION_FILES.indexOf(SWEEP);
    expect(C2C_MIGRATION_FILES[C2C_MIGRATION_FILES.length - 1]).toBe(SWEEP);
    for (const rel of [PROJECT_ATTRIBUTION, EMBEDDINGS, RELATIONAL, RIM_PATTERNS]) {
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
      for (const rel of [PROJECT_ATTRIBUTION, RELATIONAL, RIM_PATTERNS]) {
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
      'id', 'conversation_id', 'thread_id', 'project_id', 'organization_id',
      'summary', 'structured_data', 'message_count_at_generation', 'generated_at',
    ]) {
      expect(cols, `conversation_working_memory.${col}`).toContain(col);
    }
  });

  it("ana_relational_profiles exists — AnA's relational memory has a home", async () => {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ana_relational_profiles'`
    );
    const cols = rows.map(r => r.column_name);
    for (const col of [
      'organization_id', 'user_id', 'project_id', 'profile_summary',
      'tone_calibration', 'emotional_signals', 'acknowledged_mistakes',
      'interaction_count',
    ]) {
      expect(cols, `ana_relational_profiles.${col}`).toContain(col);
    }
  });

  it('the external-intelligence tables the nightly sweep writes exist', async () => {
    for (const table of ['external_intelligence_findings', 'external_intelligence_runs']) {
      const { rows } = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );
      expect(rows[0].n, table).toBe(1);
    }
  });

  it("the RIM judgment tables exist — aggregate patterns plus their append-only trail", async () => {
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
});
