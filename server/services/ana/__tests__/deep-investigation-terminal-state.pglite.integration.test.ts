/**
 * A background investigation that reached a terminal state is never rewritten
 * by a writer that finishes later.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `runInvestigation` writes three statuses, and two of them guarded the write:
 *
 *   pickup      WHERE id = $1 AND status = 'queued'
 *   failure     WHERE id = $1 AND status IN ('queued','running')
 *   completion  WHERE id = $1                          ← no guard
 *
 * A deep investigation outlives the request that started it and runs a multi-
 * round tool loop, so there is a long window in which something else can mark
 * the row terminal — the error handler on a thrown round, or a cancel once that
 * lands. Unguarded, the completion write then overwrites it, and the row claims
 * a result for a run that failed or that the person stopped.
 *
 * That is the worst direction for this particular row to be wrong in: a
 * cancelled investigation reporting nothing is honest, and one reporting a
 * result is a fabricated answer attributed to work nobody authorised to finish.
 *
 * ── Why this executes the real SQL ────────────────────────────────────────────
 * The behaviour under test IS the WHERE clause. A paraphrase in a fixture would
 * drift from the service without either failing, so the statement is extracted
 * from deep-investigation.ts and run against a real PostgreSQL (PGlite). The
 * last case runs it with the predicate STRIPPED, to hold the defect itself:
 * without that, a future edit removing the guard could leave every other
 * assertion passing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SERVICE = fs.readFileSync(
  path.join(repoRoot, 'server', 'services', 'ana', 'deep-investigation.ts'),
  'utf8',
);

/** The shipped completion statement, including its status guard. */
const COMPLETION_SQL = (() => {
  const m = /UPDATE ana_deep_investigations\s*\n\s*SET status = 'completed'[\s\S]*?WHERE id = \$1[^`]*/.exec(
    SERVICE,
  );
  if (!m) throw new Error('completion UPDATE not found — has deep-investigation.ts moved it?');
  return m[0].trim();
})();

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // The columns this statement touches, matching the shipped migration.
  await db.exec(`
    CREATE TABLE ana_deep_investigations (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      result_text TEXT,
      error TEXT,
      model TEXT,
      provider TEXT,
      heartbeat_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );
  `);
});

afterAll(async () => {
  await db?.close();
});

async function seed(id: string, status: string) {
  await db.query(`DELETE FROM ana_deep_investigations WHERE id = $1`, [id]);
  await db.query(`INSERT INTO ana_deep_investigations (id, status) VALUES ($1, $2)`, [id, status]);
}

async function complete(id: string, sql = COMPLETION_SQL) {
  return db.query(sql, [id, 'the finished research memo', 'claude-opus-5', 'anthropic']);
}

async function statusOf(id: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    `SELECT status FROM ana_deep_investigations WHERE id = $1`,
    [id],
  );
  return rows[0].status;
}

describe('the extracted statement', () => {
  it('is the real one, and carries a status guard', () => {
    expect(COMPLETION_SQL).toContain("SET status = 'completed'");
    expect(COMPLETION_SQL, 'the completion write lost its status guard').toMatch(
      /WHERE id = \$1 AND status = 'running'/,
    );
  });
});

describe('a running investigation completes normally', () => {
  it('records the result', async () => {
    await seed('run-ok', 'running');
    await complete('run-ok');
    expect(await statusOf('run-ok')).toBe('completed');
    const { rows } = await db.query<{ result_text: string }>(
      `SELECT result_text FROM ana_deep_investigations WHERE id = $1`,
      ['run-ok'],
    );
    expect(rows[0].result_text).toBe('the finished research memo');
  });
});

describe('a terminal investigation is left alone', () => {
  it('does not overwrite a failed run', async () => {
    // The error handler marked it failed while the loop was still unwinding.
    await seed('run-failed', 'failed');
    await complete('run-failed');
    expect(await statusOf('run-failed')).toBe('failed');
  });

  it('does not overwrite a cancelled run', async () => {
    // The status column is free-text TEXT with no CHECK, so a cancel transition
    // needs no DDL — only this guard, which is what makes it safe to add.
    await seed('run-cancelled', 'cancelled');
    await complete('run-cancelled');
    expect(await statusOf('run-cancelled')).toBe('cancelled');
  });

  it('writes no result text onto a run it did not complete', async () => {
    // A cancelled row carrying a result is the fabrication this guard prevents:
    // an answer attributed to work nobody authorised to finish.
    await seed('run-cancelled-2', 'cancelled');
    await complete('run-cancelled-2');
    const { rows } = await db.query<{ result_text: string | null }>(
      `SELECT result_text FROM ana_deep_investigations WHERE id = $1`,
      ['run-cancelled-2'],
    );
    expect(rows[0].result_text).toBeNull();
  });
});

describe('the defect is real', () => {
  it('without the guard, a completion overwrites a cancel', async () => {
    // Holds the bug itself. If a future edit drops the predicate, the cases
    // above start failing — but only if this one proves the predicate is what
    // they depend on.
    const unguarded = COMPLETION_SQL.replace(" AND status = 'running'", '');
    expect(unguarded).not.toBe(COMPLETION_SQL);

    await seed('run-unguarded', 'cancelled');
    await complete('run-unguarded', unguarded);
    expect(await statusOf('run-unguarded')).toBe('completed');
  });
});
