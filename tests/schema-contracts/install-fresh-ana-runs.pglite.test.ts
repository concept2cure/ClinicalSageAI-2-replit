/** Fresh-install ordering: reuse the canonical run creator before its event FK.
 * PGlite executes the two real migrations, not substituted DDL for either.
 * Only their external prerequisites are fixtures; this is not full provisioning.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installer = fs.readFileSync(path.join(root, 'scripts/db/install-fresh.mjs'), 'utf8');
const parentPath = 'db/migrations/20260917_ana_runs.sql';
const parentSql = fs.readFileSync(path.join(root, parentPath), 'utf8');
const childSql = fs.readFileSync(path.join(root, 'migrations/20261008f_ana_run_events.sql'), 'utf8');

function preOverlayBlock(source: string): string {
  const start = source.indexOf('    const PRE_OVERLAY_CREATORS = [');
  const end = source.indexOf('    const CLASSIFIED_OVERLAY_SKIPS = new Map([', start);
  if (start < 0 || end <= start) throw new Error('Installer pre-overlay block not found');
  return source.slice(start, end);
}

/** Execute the existing loop without importing the auto-running installer. */
async function executePreOverlay(source: string, failParent = false): Promise<string[]> {
  const statements: string[] = [];
  const pool = {
    query: async (sql: string) => {
      statements.push(sql);
      if (failParent && sql === parentSql) throw new Error('parent migration failed');
      return { rows: [] };
    },
  };
  await vm.runInNewContext(`(async () => { ${preOverlayBlock(source)} })()`, {
    fs, path, __dirname: path.join(root, 'scripts/db'), pool,
    console: { log: () => undefined }, ALLOW_INCOMPLETE: false,
    isVectorTypeMissing: () => false,
    recordVectorSkip: () => { throw new Error('Unexpected vector skip'); },
    recordIncomplete: () => { throw new Error('Unexpected incomplete allowance'); },
  }, { timeout: 1_000 });
  return statements;
}

async function prerequisites(pg: PGlite): Promise<void> {
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE ana_turn_records (id text PRIMARY KEY, organization_id integer, run_id text);
    INSERT INTO organizations VALUES (1, 'active');
    INSERT INTO users VALUES (1);
  `);
}

async function applyAtomically(pg: PGlite, sql: string): Promise<void> {
  await pg.exec('BEGIN');
  try {
    await pg.exec(sql);
    await pg.exec('COMMIT');
  } catch (error) {
    await pg.exec('ROLLBACK');
    throw error;
  }
}

describe('install-fresh: AnA run parent before the raw event overlay', () => {
  it('executes the canonical parent exactly once before the root overlay', async () => {
    const statements = await executePreOverlay(installer);
    const at = statements.indexOf(parentSql);
    expect(at).toBeGreaterThan(0);
    expect(statements.filter(sql => sql === parentSql)).toHaveLength(1);
    expect(statements[at - 1]).toBe('BEGIN');
    expect(statements[at + 1]).toBe('COMMIT');
    expect(installer.indexOf('const PRE_OVERLAY_CREATORS')).toBeLessThan(
      installer.indexOf('const files = fs', installer.indexOf('const PRE_OVERLAY_CREATORS')),
    );
    // Mutation control: removing this entry must remove its actual execution.
    const removed = installer.replace(/^\s*'db\/migrations\/20260917_ana_runs\.sql',\s*$/m, '');
    expect(removed).not.toBe(installer);
    expect((await executePreOverlay(removed)).includes(parentSql)).toBe(false);
  });

  it('does not accept a failed parent migration as successful provisioning', async () => {
    await expect(executePreOverlay(installer, true)).rejects.toThrow(
      `pre-overlay creator ${parentPath} failed: parent migration failed`,
    );
  });

  it('reproduces the missing-parent failure and rolls back the child migration', async () => {
    const pg = new PGlite();
    try {
      await prerequisites(pg);
      await expect(applyAtomically(pg, childSql)).rejects.toMatchObject({ code: '42P01' });
      expect((await pg.query("SELECT to_regclass('public.ana_run_events') AS relation")).rows)
        .toEqual([{ relation: null }]);
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('creates both from the selected parent, replays without data loss, and preserves the FK and immutability', async () => {
    const pg = new PGlite();
    try {
      await prerequisites(pg);
      const selected = (await executePreOverlay(installer)).filter(sql => sql === parentSql);
      expect(selected).toHaveLength(1);
      await applyAtomically(pg, selected[0]);
      await applyAtomically(pg, childSql);
      await pg.exec(`
        INSERT INTO ana_runs (id, organization_id, user_id, surface, owner_instance)
          VALUES ('run-fixture', 1, 1, 'test', 'test-instance');
        INSERT INTO ana_run_events (organization_id, run_id, seq, at, event)
          VALUES (1, 'run-fixture', 1, now(), '{"type":"test"}');
      `);
      await applyAtomically(pg, parentSql);
      await applyAtomically(pg, childSql);
      expect((await pg.query('SELECT id, timeline_seq FROM ana_runs')).rows)
        .toEqual([{ id: 'run-fixture', timeline_seq: 0 }]);
      expect((await pg.query('SELECT run_id, seq, event FROM ana_run_events')).rows)
        .toEqual([{ run_id: 'run-fixture', seq: 1, event: { type: 'test' } }]);
      await expect(pg.exec(`INSERT INTO ana_run_events (organization_id, run_id, seq, at, event)
        VALUES (1, 'missing-run', 1, now(), '{}')`)).rejects.toMatchObject({ code: '23503' });
      await expect(pg.exec("UPDATE ana_run_events SET event = '{}'"))
        .rejects.toThrow(/IMMUTABILITY_VIOLATION/);
      await expect(pg.exec('TRUNCATE ana_run_events')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
      await expect(pg.exec('DELETE FROM ana_run_events')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    } finally {
      await pg.close();
    }
  }, 60_000);
});
