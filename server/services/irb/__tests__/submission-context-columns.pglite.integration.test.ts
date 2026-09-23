/**
 * The SHAPE of the four IRB submission-context columns, read from a real
 * PostgreSQL catalog after applying the real migration file.
 *
 * This test exists for one sentence in
 * `migrations/20260922d_irb_submission_context.sql`: the columns are NULLABLE
 * with NO DEFAULT. That is not a style preference, it is the whole feature.
 *
 *   true   -> the requirement applies       (conditional-required)
 *   false  -> a RECORDED statement          (not_required)
 *   NULL   -> NOT RECORDED                  (undetermined)
 *
 * `boolean NOT NULL DEFAULT false` collapses the third state into the second,
 * so every submission nobody has answered starts asserting that the sponsor
 * said "no" — and a board receives a package with no Form FDA 1572 because a
 * column defaulted. The sibling columns on this very table
 * (involves_vulnerable_populations, consent_waiver_requested) ARE
 * `NOT NULL DEFAULT false`, which makes the wrong pattern the locally
 * idiomatic one; that is exactly why this is pinned in the catalog rather than
 * left to review.
 *
 * It also pins the to_regclass guard, by applying the file to a database that
 * has no irb_submissions at all. Removing the guard makes that case fail with
 * `relation "irb_submissions" does not exist`, which is a broken deploy on any
 * database the applier reaches before the creator has run.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const MIGRATION = path.join(repoRoot, 'migrations/20260922d_irb_submission_context.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');

/** The creating migration's columns, minus the FKs to tables this test has no use for. */
const CREATOR_DDL = `
CREATE TABLE irb_submissions (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL,
  protocol_number text NOT NULL,
  title text NOT NULL,
  risk_level text NOT NULL DEFAULT 'minimal',
  involves_vulnerable_populations boolean NOT NULL DEFAULT false,
  consent_waiver_requested boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_by integer NOT NULL,
  deleted_at timestamptz
);
`;

const CONTEXT_COLUMNS = ['involves_children', 'is_ind_study', 'uses_phi', 'uses_recruitment_material'] as const;

interface ColumnShape {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

async function shapes(db: PGlite): Promise<ColumnShape[]> {
  const r = await db.query<ColumnShape>(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'irb_submissions' AND column_name = ANY($1)
      ORDER BY column_name`,
    [CONTEXT_COLUMNS as unknown as string[]],
  );
  return r.rows;
}

let applied: PGlite;

beforeAll(async () => {
  applied = new PGlite();
  await applied.exec(CREATOR_DDL);
  await applied.exec(sql);
});

describe('the migration is additive and replayable (Rule 1)', () => {
  it('adds exactly the four context columns, as booleans', async () => {
    const rows = await shapes(applied);
    expect(rows.map((r) => r.column_name)).toEqual([...CONTEXT_COLUMNS].sort());
    for (const r of rows) expect(r.data_type).toBe('boolean');
  });

  it('re-applies over an existing row without touching a recorded answer', async () => {
    const db = new PGlite();
    await db.exec(CREATOR_DDL);
    await db.exec(sql);
    await db.query(
      `INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by, involves_children, is_ind_study)
       VALUES (1,'P-1','A study',1,true,false)`,
    );

    await db.exec(sql); // the deploy that happens tomorrow, and every deploy after

    const r = await db.query<{ involves_children: boolean | null; is_ind_study: boolean | null; uses_phi: boolean | null }>(
      `SELECT involves_children, is_ind_study, uses_phi FROM irb_submissions`,
    );
    expect(r.rows[0]).toEqual({ involves_children: true, is_ind_study: false, uses_phi: null });
  });
});

describe('NULL must remain reachable — no NOT NULL, no DEFAULT', () => {
  /*
   * If this test ever fails, do not "fix" it by relaxing the assertion. The
   * column is the storage for a three-valued answer and a default deletes one
   * of the three values from the type.
   */
  it.each([...CONTEXT_COLUMNS])('%s is nullable with no default', async (column) => {
    const row = (await shapes(applied)).find((r) => r.column_name === column);

    expect(row, `${column} was not added by the migration`).toBeDefined();
    expect(row?.is_nullable, `${column} must accept NULL — NULL is "not recorded"`).toBe('YES');
    expect(
      row?.column_default,
      `${column} must have NO default. A default turns "nobody answered" into "the sponsor said no".`,
    ).toBeNull();
  });

  it('an INSERT that mentions none of them stores NULL, not false', async () => {
    const db = new PGlite();
    await db.exec(CREATOR_DDL);
    await db.exec(sql);
    await db.query(`INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by) VALUES (1,'P-2','Unanswered',1)`);

    const r = await db.query<Record<string, boolean | null>>(
      `SELECT involves_children, is_ind_study, uses_phi, uses_recruitment_material FROM irb_submissions`,
    );
    expect(r.rows[0]).toEqual({
      involves_children: null,
      is_ind_study: null,
      uses_phi: null,
      uses_recruitment_material: null,
    });
  });

  it('accepts all three states on the same column', async () => {
    const db = new PGlite();
    await db.exec(CREATOR_DDL);
    await db.exec(sql);
    for (const v of [true, false, null]) {
      await db.query(`INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by, is_ind_study) VALUES (1,'P','t',1,$1)`, [v]);
    }
    const r = await db.query<{ is_ind_study: boolean | null }>(`SELECT is_ind_study FROM irb_submissions ORDER BY id`);
    expect(r.rows.map((x) => x.is_ind_study)).toEqual([true, false, null]);
  });
});

describe('the to_regclass guard', () => {
  it('NOTICE-skips on a database that has no irb_submissions', async () => {
    const blank = new PGlite();

    await expect(blank.exec(sql)).resolves.toBeDefined();

    const r = await blank.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name = 'irb_submissions'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('keeps every statement INSIDE the guard, COMMENTs included', () => {
    /*
     * A COMMENT ON COLUMN placed AFTER `END $$;` sails past the guard and
     * fails a blank-database apply with `relation does not exist` — the guard
     * protecting nothing because the statement it protects runs after it.
     * That happened in this repository on 2026-09-22, so it is checked
     * textually as well as behaviourally: the behavioural test above would
     * also catch it, but this one names the mistake.
     */
    const afterBlock = sql.slice(sql.lastIndexOf('END $$;') + 'END $$;'.length);
    expect(afterBlock.replace(/--.*$/gm, '').trim()).toBe('');
    expect(sql).toMatch(/IF to_regclass\('public\.irb_submissions'\) IS NULL THEN/);
  });

  it('contains no DROP and no backfill UPDATE (Rule 1)', () => {
    /* Comments are stripped; the prose in this file discusses DROP and
       DEFAULT at length and must not be mistaken for a statement. */
    const statements = sql.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\bDROP\b/i);
    expect(statements).not.toMatch(/\bUPDATE\s+irb_submissions\b/i);
  });

  it('declares every ADD COLUMN as a bare nullable boolean', () => {
    /* The source-level twin of the catalog assertions above. The catalog is
       the authority; this names the defect in the diff, where it is cheapest
       to reject. */
    const adds = [...sql.replace(/--.*$/gm, '').matchAll(/ADD COLUMN IF NOT EXISTS\s+([^;]+);/gi)].map((m) => m[1].replace(/\s+/g, ' ').trim());

    expect(adds.length).toBe(CONTEXT_COLUMNS.length);
    for (const clause of adds) {
      expect(clause, `"${clause}" must be "<name> boolean" and nothing more`).toMatch(/^[a-z_]+ boolean$/);
    }
  });
});
