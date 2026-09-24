/**
 * The backfill's ENTRY POINT starts.
 *
 * scripts/backfill-vault-storage.mjs shipped (c029711a) importing
 * '../server/db/index.ts', a module that has never existed, and its npm script
 * ran it with plain `node`, which cannot load the server's TypeScript. It could
 * not start at all. The service behind it (storage-migration.service) had green
 * tests the whole time, because none of them ran the script — the one thing an
 * operator would actually run, and the one the eCTD resolver's refusal message
 * tells them to run.
 *
 * These spawn the script the way the npm script does (tsx), from an empty
 * working directory so no .env / .env.local is loaded and no database is
 * reached: the no-database path is the one that proves every import resolved.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(repo, 'scripts/backfill-vault-storage.mjs');
const TSX = path.join(repo, 'node_modules/.bin/tsx');

function run(args: string[]) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-cli-'));
  try {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.APP_DATABASE_URL;
    return spawnSync(TSX, ['--tsconfig', path.join(repo, 'tsconfig.json'), SCRIPT, ...args], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 60_000,
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe('scripts/backfill-vault-storage.mjs — the entry point', () => {
  it('npm runs it with tsx, not plain node', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    expect(pkg.scripts['db:backfill-vault-storage']).toBe('tsx scripts/backfill-vault-storage.mjs');
  });

  it('refuses a missing --org with a usage message and exit 2, before touching any module', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--org is required/);
  });

  it('resolves every import, then fails CLOSED when no database is configured', () => {
    const r = run(['--org', '1']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);
    expect(r.status).toBe(1);
    expect(out).toMatch(/No database is configured/);
    expect(out).toMatch(/Nothing was examined/);
  }, 90_000);
});
