/**
 * Schema contract: the out-of-band c2c apply path produces a usable lumen schema.
 *
 * WHY THIS EXISTS (ledger C-12)
 * -----------------------------
 * `lumen.data_atoms` was defined TWICE with incompatible shapes:
 *
 *   db/migrations/044b_gcc_lumen_schema_prerequisite.sql   12 columns, id UUID DEFAULT
 *   migrations/20260724_lumen_council_provisioning.sql      5 columns, id TEXT, no default
 *
 * Both were CREATE TABLE IF NOT EXISTS, so whichever ran first won and the other
 * silently no-opped — permanently, since the loser can never "catch up". The two
 * files are applied by DIFFERENT mechanisms (the manifest lineage vs
 * `npm run db:apply-c2c`), so which one won depended on the environment's
 * history, not on the code.
 *
 * The losing case is not cosmetic: server/workers/enhanced-ingestion-pipeline.ts
 * inserts atom_type, source_path and content_hash, none of which exist in the
 * minimal shape. Ingestion would fail on exactly those databases where the
 * out-of-band script ran first — i.e. fresh preview and deploy databases, which
 * is precisely what that script is for.
 *
 * These tests pin the resolution: one definition, and the apply script orders the
 * canonical prerequisite ahead of the file that depends on it.
 *
 * @compliance ICH E6(R2) data integrity — ingestion provenance columns must exist
 *             on every deployment path, not just the ones that happened to run
 *             the migrations in a lucky order.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL = 'db/migrations/044b_gcc_lumen_schema_prerequisite.sql';
const COUNCIL = 'migrations/20260724_lumen_council_provisioning.sql';
const INGESTION_SOURCE = 'server/workers/enhanced-ingestion-pipeline.ts';

const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

/**
 * The real ordered list, imported rather than duplicated, so a change to the
 * apply order is a change to what these tests assert. It now lives in
 * scripts/db/migration-set.mjs — shared by the manual applier
 * (apply-c2c-migrations.mjs) and the deploy-time one (deploy-migrate.mjs), so
 * this ordering contract covers the production deploy path too.
 */
const applyOrder = (): string[] => C2C_MIGRATION_FILES;

/**
 * PGlite has no uuid-ossp extension. Two narrowly-scoped adaptations let the
 * REAL file run: drop the CREATE EXTENSION statement, and define
 * uuid_generate_v4() in terms of the built-in gen_random_uuid(). Every other
 * statement — including every column definition under test — is applied
 * verbatim from disk. Production Postgres (Neon) has the extension.
 */
const UUID_OSSP_SHIM = `
  CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
  LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
`;
const stripUuidOssp = (sql: string) => sql.replace(/CREATE\s+EXTENSION[^;]*uuid-ossp[^;]*;/gi, '');

describe('c2c apply path — lumen.data_atoms has exactly one definition (C-12)', () => {
  it('the council provisioning migration no longer defines lumen.data_atoms', () => {
    const council = read(COUNCIL);
    expect(council).not.toMatch(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?lumen\.data_atoms/i);
  });

  it('the canonical definition is the one in db/migrations', () => {
    expect(read(CANONICAL)).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lumen\.data_atoms/i);
  });

  it('the apply script installs the canonical prerequisite BEFORE the file that reads it', () => {
    const order = applyOrder();
    const canonical = order.indexOf(CANONICAL);
    const council = order.indexOf(COUNCIL);
    expect(canonical, `${CANONICAL} missing from the apply script`).toBeGreaterThanOrEqual(0);
    expect(council, `${COUNCIL} missing from the apply script`).toBeGreaterThanOrEqual(0);
    expect(canonical).toBeLessThan(council);
  });
});

describe('c2c apply path — the resulting schema accepts the writes the code makes', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(UUID_OSSP_SHIM);
    // Applied in the script's own declared order.
    for (const f of [CANONICAL, COUNCIL]) {
      await pg.exec(stripUuidOssp(read(f)));
    }
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('produces the canonical 12-column shape, not the minimal one', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'lumen' AND table_name = 'data_atoms'
       ORDER BY ordinal_position`,
    );
    const cols = r.rows.map((x) => x.column_name);
    // The columns the minimal rival shape omitted — the whole point of C-12.
    for (const c of ['atom_type', 'source_path', 'source_document_id', 'version', 'content_hash', 'updated_at', 'created_by']) {
      expect(cols, `lumen.data_atoms is missing ${c}`).toContain(c);
    }
  });

  it('accepts the ingestion pipeline\'s exact INSERT column list', async () => {
    // Mirrors enhanced-ingestion-pipeline.ts (storeAtom). The next test pins
    // this list against the source so the two cannot drift apart silently.
    await expect(
      pg.query(
        `INSERT INTO lumen.data_atoms (
           id, title, content, atom_type, source_path,
           metadata, content_hash, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, md5($3), NOW())`,
        [
          '11111111-1111-4111-8111-111111111111',
          'contract-test atom',
          'body',
          'DOCUMENT',
          'doc-1',
          '{}',
        ],
      ),
    ).resolves.toBeDefined();
  });

  it('the pinned INSERT column list still matches the ingestion source', () => {
    const src = read(INGESTION_SOURCE);
    const insert = src.match(/INSERT INTO lumen\.data_atoms \(([\s\S]*?)\)/);
    expect(insert, `no lumen.data_atoms INSERT found in ${INGESTION_SOURCE}`).toBeTruthy();
    const columns = insert![1]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    expect(columns).toEqual([
      'id',
      'title',
      'content',
      'atom_type',
      'source_path',
      'metadata',
      'content_hash',
      'created_at',
    ]);
  });

  it('the council seed still lands (the file is self-sufficient without its own atoms table)', async () => {
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM lumen.agent_registry`,
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(4);
  });
});
