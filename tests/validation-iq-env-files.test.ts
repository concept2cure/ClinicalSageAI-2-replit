/**
 * IQ-001 must qualify the database the server will actually use.
 *
 * scripts/validation/run-iq.mjs built its environment from `.env` alone, while
 * the server reads `.env.local` first (server/config/load-env-files.ts), and
 * `npm run up` writes the provisioned database into `.env.local`. On any
 * machine with both files, IQ-05 / IQ-07 / IQ-08 qualified `.env`'s database
 * and the OQ protocols then exercised a different one.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ENV_FILES as SERVER_ENV_FILES } from '../server/config/load-env-files';
import { ENV_FILES, readEnvFiles, resolveEnv } from '../scripts/validation/env-files.mjs';

const repoRoot = path.resolve(__dirname, '..');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function root(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'iq-env-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  return dir;
}

describe('the IQ runner reads env files the way the server does', () => {
  it('uses the same files in the same order as the server', () => {
    expect([...ENV_FILES]).toEqual([...SERVER_ENV_FILES]);
  });

  it('takes .env.local over .env for a key both define', () => {
    const dir = root({
      '.env': 'DATABASE_URL=postgresql://h/from_dotenv\nRLS_ENFORCE=off\n',
      '.env.local': 'DATABASE_URL=postgresql://h/from_local\nAPP_DATABASE_URL=postgresql://h/from_local_app\n',
    });
    expect(resolveEnv(dir, {})).toMatchObject({
      DATABASE_URL: 'postgresql://h/from_local',
      APP_DATABASE_URL: 'postgresql://h/from_local_app',
      RLS_ENFORCE: 'off',
    });
  });

  it('lets the process environment beat both files, as the server does', () => {
    const dir = root({ '.env': 'DATABASE_URL=postgresql://h/from_dotenv\n', '.env.local': 'DATABASE_URL=postgresql://h/from_local\n' });
    expect(resolveEnv(dir, { DATABASE_URL: 'postgresql://h/from_shell' }).DATABASE_URL).toBe('postgresql://h/from_shell');
  });

  it('reports what the files set without the process environment', () => {
    const dir = root({ '.env.local': 'A=1\n', '.env': 'A=2\nB=3\n' });
    expect(readEnvFiles(dir)).toEqual({ A: '1', B: '3' });
  });

  it('is what run-iq.mjs uses, not a .env-only read of its own', () => {
    const source = readFileSync(path.join(repoRoot, 'scripts/validation/run-iq.mjs'), 'utf8');
    expect(source).toMatch(/resolveEnv\(ROOT\)/);
    expect(source).not.toMatch(/dotenv\(['"]\.env['"]\)/);
  });
});

describe('validation execution metadata and configuration evidence', () => {
  it('uses the execution date instead of a fixed historical evidence folder', async () => {
    const { resolveRunDate } = await import('../scripts/validation/env-files.mjs');
    expect(resolveRunDate(undefined, new Date('2026-10-06T16:00:00Z'))).toBe('2026-10-06');
    expect(resolveRunDate('2026-09-27', new Date('2026-10-06T16:00:00Z'))).toBe('2026-09-27');
  });
  it.each(['2026-02-30', '../old-run', '2026-10-06/extra', 'not-a-date'])('rejects invalid or path-like run dates: %s', async value => {
    const { resolveRunDate } = await import('../scripts/validation/env-files.mjs');
    expect(() => resolveRunDate(value)).toThrow(/calendar-valid/);
  });
  it('records effective process configuration without retaining credential values', async () => {
    const { configurationPresence } = await import('../scripts/validation/env-files.mjs');
    const dir = root({ '.env': 'DATABASE_URL=file-database\n' });
    const env = resolveEnv(dir, { DATABASE_URL: 'process-database-private', OPENAI_API_KEY: 'test-provider-private' });
    const report = configurationPresence(['DATABASE_URL', 'SESSION_SECRET'], env);
    expect(report).toEqual({ set: ['DATABASE_URL'], unset: ['SESSION_SECRET'], providerConfigured: true });
    expect(JSON.stringify(report)).not.toMatch(/private|file-database/);
  });
  it('does not treat a placeholder provider key as configured', async () => {
    const { configurationPresence } = await import('../scripts/validation/env-files.mjs');
    expect(configurationPresence([], { OPENAI_API_KEY: 'sk-...' }).providerConfigured).toBe(false);
  });
});
