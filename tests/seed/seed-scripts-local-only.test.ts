/**
 * Seed scripts that write invented records run against a database on this
 * machine only. 2026-10-15.
 *
 * seed-ga-demo refused only NODE_ENV=production; seed-local-testing refused
 * nothing ("laptops only" was a comment); and seed-admin reset an
 * administrator to the built-in password on any database reached with
 * NODE_ENV unset. Each script is run here, for real, against a database URL
 * on another host: it must refuse before connecting.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs module, no declarations.
import { databaseHost, isLocalDatabase } from '../../scripts/seed/local-only.mjs';

const ROOT = path.resolve(__dirname, '../..');
const REMOTE = 'postgresql://u:p@uat-db.example.invalid:5432/c2c';

function runScript(args: string[], env: Record<string, string | undefined>) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe('which databases are on this machine', () => {
  it.each([
    ['postgresql://postgres:postgres@127.0.0.1:5432/x', true],
    ['postgresql://postgres@localhost/x', true],
    ['postgresql://postgres@[::1]:5432/x', true],
    ['postgresql:///x?host=/var/run/postgresql', true],
    ['host=/tmp dbname=x', true],
    ['postgresql://u:p@db:5432/x', false],
    ['postgresql://u:p@ep-cool-name.us-east-2.aws.neon.tech/x?sslmode=require', false],
    ['host=10.0.0.5 dbname=x', false],
  ])('%s → %s', (url, local) => {
    expect(isLocalDatabase(url)).toBe(local);
  });

  it('names the host it refuses', () => {
    expect(databaseHost(REMOTE)).toBe('uat-db.example.invalid');
  });
});

describe('a seed that writes invented records, pointed at another host', () => {
  it.each([
    ['seed-ga-demo', ['scripts/seed-ga-demo.mjs']],
    ['seed-local-testing', ['--import', 'tsx', 'scripts/seed-local-testing.ts']],
  ])('%s refuses before connecting', (name, args) => {
    const r = runScript(args, { DATABASE_URL: REMOTE });
    expect(r.out).toContain(`${name} writes invented demonstration data into a database on this machine only`);
    expect(r.out).toContain('"uat-db.example.invalid" is not on this machine');
    expect(r.status).toBe(1);
  }, 90_000);

  it('refuses in a production process, even against localhost', () => {
    const r = runScript(['scripts/seed-ga-demo.mjs'], {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/x', NODE_ENV: 'production',
    });
    expect(r.out).toContain('NODE_ENV is production');
    expect(r.status).toBe(1);
  }, 90_000);
});

describe('seed-admin', () => {
  it('refuses the built-in password for a database on another host', () => {
    const r = runScript(['scripts/seed-admin.mjs'], { DATABASE_URL: REMOTE });
    expect(r.out).toContain('refusing the built-in default password');
    expect(r.status).toBe(1);
  }, 90_000);

  it('provisions with an explicit password: the refusal does not apply', () => {
    const r = runScript(['scripts/seed-admin.mjs'], { DATABASE_URL: REMOTE, ADMIN_PASSWORD: 'a-real-secret-123' });
    expect(r.out).not.toContain('refusing the built-in default password');
  }, 90_000);
});
