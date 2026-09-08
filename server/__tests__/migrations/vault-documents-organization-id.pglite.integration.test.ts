/**
 * migrations/20260905_vault_documents_organization_id.sql — END-TO-END against
 * in-process PGlite.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The whole value of this migration is in what it REFUSES to do. Backfilling a
 * tenant column from a join is trivial; declining to attribute a document whose
 * program is gone or soft-deleted is the only version worth shipping, because
 * the alternative — guessing — is a migration that fixes a cross-tenant leak by
 * creating one. That refusal is the branch nobody exercises: on a healthy
 * database every program resolves and every row backfills.
 *
 * It also replays. The migration is registered in C2C_MIGRATION_FILES and the
 * applier re-executes every file on every deploy (CLAUDE.md RULE 1), so a
 * second run must neither re-guess nor overwrite an attribution a human made
 * deliberately in between.
 *
 * ── What is asserted, and what deliberately is not ───────────────────────────
 * The fixture is the two tables the migration reaches, shaped as this repo has
 * them: vault.documents UUID-keyed and program-scoped, public.regulatory_programs
 * with an INTEGER organization_id and a soft-delete column.
 *
 * The RAISE WARNING that reports the quarantine is asserted STATICALLY, not at
 * runtime: PGlite 0.5.2 surfaces no notices at all (`onNotice` is undefined and
 * exec() returns only rows/fields/affectedRows), so a runtime assertion here
 * would silently pass whatever the migration did. The static check pins the
 * thing that matters — that the warning is guarded by the count rather than
 * unconditional — and the runtime behaviour belongs to a dbtest against real
 * Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRATION = fs.readFileSync(
  path.join(repoRoot, 'migrations', '20260905_vault_documents_organization_id.sql'),
  'utf8'
);

const P_LIVE = '11111111-1111-1111-1111-111111111111';
const P_DELETED = '22222222-2222-2222-2222-222222222222';
const P_ABSENT = '33333333-3333-3333-3333-333333333333';

/** The fixture, before the migration runs. */
async function seeded(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE public.regulatory_programs (
      id              UUID PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      deleted_at      TIMESTAMPTZ
    );
    CREATE TABLE vault.documents (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id     UUID NOT NULL,
      document_title TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at     TIMESTAMPTZ
    );
    INSERT INTO public.regulatory_programs (id, organization_id, deleted_at) VALUES
      ('${P_LIVE}',    42, NULL),
      ('${P_DELETED}', 99, NOW());
    INSERT INTO vault.documents (program_id, document_title) VALUES
      ('${P_LIVE}',    'resolvable-a'),
      ('${P_LIVE}',    'resolvable-b'),
      ('${P_DELETED}', 'program-soft-deleted'),
      ('${P_ABSENT}',  'program-absent');
    INSERT INTO vault.documents (program_id, document_title, deleted_at) VALUES
      ('${P_ABSENT}',  'already-deleted-doc', NOW());
  `);
  return db;
}

async function orgOf(db: PGlite, title: string): Promise<number | null> {
  const r = await db.query<{ organization_id: number | null }>(
    `SELECT organization_id FROM vault.documents WHERE document_title = $1`,
    [title]
  );
  return r.rows[0]?.organization_id ?? null;
}

describe('vault.documents.organization_id backfill', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await seeded();
  });
  afterAll(async () => {
    await db?.close?.();
  });

  it('does not have the column before the migration runs', async () => {
    const r = await db.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='vault' AND table_name='documents' AND column_name='organization_id'`
    );
    expect(r.rows).toHaveLength(0);
  });

  it('adds a nullable integer column', async () => {
    await db.exec(MIGRATION);
    const r = await db.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema='vault' AND table_name='documents' AND column_name='organization_id'`
    );
    // Nullable is deliberate: NOT NULL while unattributable rows exist either
    // fails the deploy or forces someone to invent an owner.
    expect(r.rows[0]).toEqual({ data_type: 'integer', is_nullable: 'YES' });
  });

  it('backfills documents whose program resolves', async () => {
    expect(await orgOf(db, 'resolvable-a')).toBe(42);
    expect(await orgOf(db, 'resolvable-b')).toBe(42);
  });

  it('refuses to attribute a document whose program is soft-deleted', async () => {
    // The program says org 99. It is deleted, so it is not evidence of ownership.
    expect(await orgOf(db, 'program-soft-deleted')).toBeNull();
  });

  it('refuses to attribute a document whose program is absent', async () => {
    expect(await orgOf(db, 'program-absent')).toBeNull();
  });

  it('creates the lookup index and the quarantine index', async () => {
    const r = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname='vault' AND tablename='documents'`
    );
    const names = r.rows.map(x => x.indexname);
    expect(names).toContain('idx_vault_documents_organization');
    expect(names).toContain('idx_vault_documents_unattributed');
  });

  it('quarantines exactly the live unattributable rows', async () => {
    // Two live rows are unattributable; the already-soft-deleted one is not
    // counted, because a deleted document is not an outstanding attribution task.
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM vault.documents
        WHERE organization_id IS NULL AND deleted_at IS NULL`
    );
    expect(r.rows[0].n).toBe(2);
  });

  it('guards the quarantine warning behind the count rather than raising unconditionally', () => {
    // Static, not runtime — see the file header on PGlite and notices.
    expect(MIGRATION).toMatch(/IF v_quarantined > 0 THEN[\s\S]*?RAISE WARNING/);
  });
});

describe('vault.documents.organization_id on replay (CLAUDE.md RULE 1)', () => {
  it('does not overwrite an attribution a human made between deploys', async () => {
    const db = await seeded();
    await db.exec(MIGRATION);
    expect(await orgOf(db, 'program-absent')).toBeNull();

    // Someone resolves the orphan by hand.
    await db.exec(
      `UPDATE vault.documents SET organization_id = 7 WHERE document_title = 'program-absent'`
    );

    // Next deploy re-runs the file. The correction must survive it.
    await db.exec(MIGRATION);
    expect(await orgOf(db, 'program-absent')).toBe(7);
    await db.close?.();
  });

  it('is idempotent for rows it already resolved', async () => {
    const db = await seeded();
    await db.exec(MIGRATION);
    await db.exec(MIGRATION);
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM vault.documents WHERE organization_id = 42`
    );
    expect(r.rows[0].n).toBe(2);
    await db.close?.();
  });
});

describe('vault.documents.organization_id when its dependencies are absent', () => {
  it('skips cleanly when vault.documents does not exist', async () => {
    const db = await PGlite.create();
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
    await db.close?.();
  });

  it('adds the column but attributes nothing when regulatory_programs is absent', async () => {
    const db = await PGlite.create();
    await db.exec(`
      CREATE SCHEMA vault;
      CREATE TABLE vault.documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        program_id UUID NOT NULL,
        document_title TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      INSERT INTO vault.documents (program_id, document_title) VALUES ('${P_LIVE}', 'orphan');
    `);
    await db.exec(MIGRATION);
    expect(await orgOf(db, 'orphan')).toBeNull();
    await db.close?.();
  });
});
