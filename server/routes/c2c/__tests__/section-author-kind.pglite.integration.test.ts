/**
 * An unstated author must not be recorded as a human — against real Postgres.
 *
 * WHAT WAS WRONG. Two layers independently manufactured human authorship out of
 * an absent field, in the system of record for a regulatory filing:
 *
 *   1. The section save resolved an omitted `draftSource` to the literal
 *      'human'  (documents.ts: `draftSource ?? 'human'`).
 *   2. This trigger's CASE fell through to 'human' for anything outside
 *      ('ana','template','imported') — which includes NULL, i.e. "nobody said".
 *
 * Layer 2 is what this file pins, because it is the one that reaches permanent
 * storage: `c2c_document_section_versions.author_kind` is the column an
 * inspector reads to answer "who wrote this section", and a version row is
 * immutable once written. A row that says 'human' because nothing was stated is
 * indistinguishable from one that says 'human' because a person genuinely typed
 * the words, so no later audit can separate them. That is the failure mode —
 * not a wrong value, an *unfalsifiable* one.
 *
 * WHY PGLITE. The behaviour under test is a plpgsql CASE inside a BEFORE UPDATE
 * trigger. A mocked client cannot execute it: you would be asserting against a
 * hand-written copy of the logic, which passes whether or not the migration is
 * real. PGlite is pure-WASM Postgres, so the migration file is applied and the
 * trigger genuinely fires.
 *
 * WHAT ELSE IT GUARDS. This is the fifth definition of
 * c2c_snapshot_section_version(); each one restates the whole body, so a new
 * definition silently drops anything the previous four established unless it
 * carries it forward. The mandatory-reason test below pins 20260814g's RAISE
 * specifically, because that is the one this migration was at risk of reverting.
 *
 * WHY IT APPLIES THE SUPERSEDED MIGRATION TOO. `describe('the defect')` loads
 * the PREVIOUS migration (20260814f) and asserts the old behaviour — NULL
 * recorded as 'human'. Without it this suite would only ever have been seen to
 * pass, and a test that has only passed has not been shown to catch anything.
 * With it, the exact regression is demonstrated on every run: same input, same
 * assertions, only the migration differs.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const migration = (file: string) =>
  fs.readFileSync(path.join(__dirname, '../../../../migrations', file), 'utf8');

/** The migration under test. */
const FIXED = migration('20260822_section_version_author_kind_unspecified.sql');
/**
 * Its true predecessor — the LAST of the four earlier definitions of this
 * function, and the one production actually ran. (20260814f defines it too, but
 * 20260814g is registered after it and wins; building the fix on f would have
 * silently reverted g's mandatory-reason RAISE.)
 */
const SUPERSEDED = migration('20260814g_section_version_reason_required.sql');

// Mirrors migrations/20260528_phase9_document_schema.sql for the two tables the
// trigger touches, plus the minimal c2c_ana_actions the function SELECTs and the
// versions table references.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS c2c_ana_actions (id TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS c2c_document_sections (
  id            bigserial PRIMARY KEY,
  document_id   text NOT NULL,
  section_key   text NOT NULL,
  label         text NOT NULL,
  path_order    integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'todo',
  content       jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_source  text,
  version       integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, section_key)
);

CREATE TABLE IF NOT EXISTS c2c_document_section_versions (
  id            bigserial PRIMARY KEY,
  section_id    bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  content       jsonb NOT NULL,
  author_id     integer NOT NULL,
  author_kind   text NOT NULL DEFAULT 'human',
  reason        text NOT NULL,
  ana_action_id text REFERENCES c2c_ana_actions(id),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, version)
);

DROP TRIGGER IF EXISTS c2c_doc_section_version_before_update ON c2c_document_sections;
CREATE TRIGGER c2c_doc_section_version_before_update
BEFORE UPDATE ON c2c_document_sections
FOR EACH ROW EXECUTE FUNCTION c2c_snapshot_section_version();
`;

/**
 * Boot a database whose trigger function comes from `migrationSql`.
 *
 * The function is created by the migration, and the schema above attaches the
 * trigger to it, so the migration file is the only thing that differs between
 * the fixed and superseded suites.
 */
async function boot(migrationSql: string): Promise<PGlite> {
  const db = new PGlite();
  // The function must exist before CREATE TRIGGER references it.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS c2c_document_section_versions (id bigserial PRIMARY KEY);
    DROP TABLE c2c_document_section_versions;
  `);
  await db.exec(SCHEMA.replace(/DROP TRIGGER[\s\S]*$/, ''));
  await db.exec(migrationSql);
  await db.exec(SCHEMA.match(/DROP TRIGGER[\s\S]*$/)![0]);
  return db;
}

/**
 * Seed one section with `draftSource`, then change its content — which is what
 * fires the trigger — and return the author_kind recorded for the superseded
 * content.
 *
 * The GUCs are set the way the route sets them, transaction-locally, because
 * the function RAISEs without app.actor_id.
 */
async function authorKindAfterEdit(db: PGlite, draftSource: string | null): Promise<string> {
  const key = `s${Math.random().toString(36).slice(2, 10)}`;
  await db.query(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, content, draft_source)
     VALUES ('doc-1', $1, 'Section', '{"t":"original"}'::jsonb, $2)`,
    [key, draftSource],
  );
  await db.exec('BEGIN');
  await db.exec(`SET LOCAL app.actor_id = '42'`);
  await db.exec(`SET LOCAL app.reason = 'test edit'`);
  await db.query(
    `UPDATE c2c_document_sections SET content = '{"t":"revised"}'::jsonb
      WHERE document_id = 'doc-1' AND section_key = $1`,
    [key],
  );
  await db.exec('COMMIT');

  const { rows } = await db.query<{ author_kind: string }>(
    `SELECT v.author_kind
       FROM c2c_document_section_versions v
       JOIN c2c_document_sections s ON s.id = v.section_id
      WHERE s.section_key = $1`,
    [key],
  );
  expect(rows).toHaveLength(1);
  return rows[0].author_kind;
}

describe('c2c_snapshot_section_version — author_kind (fixed)', () => {
  it('records an unstated author as unspecified, not as a human', async () => {
    const db = await boot(FIXED);
    // The case the fix exists for: nobody said where the superseded text came
    // from, so the filing record must not claim a person wrote it.
    expect(await authorKindAfterEdit(db, null)).toBe('unspecified');
    await db.close();
  });

  it('still records the origins that were actually stated', async () => {
    const db = await boot(FIXED);
    // The fix must not cost real attribution: a stated origin survives verbatim,
    // including 'human' — which is now a claim the save made, not a default.
    expect(await authorKindAfterEdit(db, 'human')).toBe('human');
    expect(await authorKindAfterEdit(db, 'ana')).toBe('ana');
    expect(await authorKindAfterEdit(db, 'template')).toBe('template');
    expect(await authorKindAfterEdit(db, 'imported')).toBe('imported');
    await db.close();
  });

  it("carries forward 20260814g's mandatory reason-for-change", async () => {
    const db = await boot(FIXED);
    await db.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, label, content, draft_source)
       VALUES ('doc-1', 'no-reason', 'Section', '{"t":"original"}'::jsonb, 'human')`,
    );
    await db.exec('BEGIN');
    await db.exec(`SET LOCAL app.actor_id = '42'`);
    // No app.reason. Redefining this function is how that check gets lost, so
    // the suite that redefines it is where the check is pinned.
    await expect(
      db.query(
        `UPDATE c2c_document_sections SET content = '{"t":"revised"}'::jsonb
          WHERE section_key = 'no-reason'`,
      ),
    ).rejects.toThrow(/reason-for-change is mandatory/);
    await db.exec('ROLLBACK');
    await db.close();
  });

  it('records an unrecognised origin as unspecified rather than guessing', async () => {
    const db = await boot(FIXED);
    // A value outside the vocabulary is as unknown as an absent one. The old
    // CASE swept it into 'human' by the same fallthrough.
    expect(await authorKindAfterEdit(db, 'wat')).toBe('unspecified');
    await db.close();
  });
});

describe('c2c_snapshot_section_version — the defect this replaces', () => {
  it('the superseded migration recorded an unstated author as human', async () => {
    const db = await boot(SUPERSEDED);
    // Demonstrates the regression the fixed suite above catches. If this ever
    // reports 'unspecified', the two migrations no longer differ and the first
    // suite is passing vacuously.
    expect(await authorKindAfterEdit(db, null)).toBe('human');
    await db.close();
  });
});
