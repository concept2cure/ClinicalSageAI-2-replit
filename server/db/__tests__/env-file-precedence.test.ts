/**
 * Which database does the server's pool actually connect to when both `.env`
 * and `.env.local` exist?
 *
 * server/index.ts documented `.env.local` as winning, and `npm run dev` made it
 * true only because scripts/startup.sh exports `.env.local`'s URLs into the
 * shell first. Every other entrypoint — `tsx server/index.ts`, the OQ harness's
 * server, workers, bin scripts — got `.env`'s database: ESM evaluates static
 * imports before the importing module's body, so server/db/runtime.ts built the
 * pool (after loading `.env` itself) before index.ts's `.env.local` call ran.
 * The OQ run of 2026-09-22 hit exactly that: its first governed write returned
 * 500 AUDIT_CHAIN_SCHEMA_MISSING from a stale database named in `.env`, while
 * the database it had provisioned and named in `.env.local` was correct.
 *
 * These cases import the real runtime module in a child process whose working
 * directory holds the env files, and read the connection string off the pool it
 * built. In-process would not do: the unit setup mocks `pg`, and dotenv's
 * `override: false` means whatever this process already loaded would decide.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const runtimeModule = pathToFileURL(path.join(repoRoot, 'server/db/runtime.ts')).href;
const tsx = path.join(repoRoot, 'node_modules/.bin/tsx');

const url = (db: string) => `postgresql://u:p@127.0.0.1:1/${db}`;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function poolTarget(files: Record<string, string>, shellEnv: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'env-precedence-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  writeFileSync(
    path.join(dir, 'probe.mjs'),
    `const m = await import(${JSON.stringify(runtimeModule)});\n` +
      `process.stdout.write('POOL=' + m.getPool().options.connectionString + '\\n');\n` +
      `process.exit(0);\n`
  );

  const env: NodeJS.ProcessEnv = { ...process.env };
  // This suite's baseline cases are explicitly non-Codespaces .env precedence.
  // Codespaces ignores env files, and has its own regression below.
  delete env.C2C_CODESPACE;
  delete env.CODESPACES;
  for (const key of ['DATABASE_URL', 'APP_DATABASE_URL', 'NEON_DATABASE_URL', 'DATABASE_NEON_NEW_SECRET']) {
    delete env[key];
  }
  Object.assign(env, {
    NODE_ENV: 'development',
    SKIP_DB_STARTUP_TEST: 'true',
    TSX_TSCONFIG_PATH: path.join(repoRoot, 'tsconfig.json'),
    ...shellEnv,
  });

  const out = execFileSync(tsx, ['probe.mjs'], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });
  const line = out.split('\n').find(l => l.startsWith('POOL='));
  if (!line) throw new Error(`probe printed no pool target:\n${out}`);
  return line.slice('POOL='.length);
}

describe('the server pool honours .env.local over .env', () => {
  it('connects to .env.local\'s runtime database, not .env\'s', () => {
    expect(
      poolTarget({
        '.env': `DATABASE_URL=${url('from_dotenv')}\n`,
        '.env.local': `APP_DATABASE_URL=${url('from_local_app')}\nDATABASE_URL=${url('from_local')}\n`,
      })
    ).toBe(url('from_local_app'));
  }, 60_000);

  it('lets .env.local\'s DATABASE_URL beat .env\'s when neither sets APP_DATABASE_URL', () => {
    expect(
      poolTarget({
        '.env': `DATABASE_URL=${url('from_dotenv')}\n`,
        '.env.local': `DATABASE_URL=${url('from_local')}\n`,
      })
    ).toBe(url('from_local'));
  }, 60_000);

  it('still reads .env when there is no .env.local', () => {
    expect(poolTarget({ '.env': `DATABASE_URL=${url('from_dotenv')}\n` })).toBe(url('from_dotenv'));
  }, 60_000);

  it('lets a value already in the environment beat both files', () => {
    expect(
      poolTarget(
        {
          '.env': `DATABASE_URL=${url('from_dotenv')}\n`,
          '.env.local': `DATABASE_URL=${url('from_local')}\n`,
        },
        { DATABASE_URL: url('from_shell') }
      )
    ).toBe(url('from_shell'));
  }, 60_000);
});

describe('Codespaces host-injected secrets', () => {
  it('does not read stale .env files to supply missing database or provider secrets', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'codespace-host-secrets-'));
    dirs.push(dir);
    writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=' + url('stale_env') + '\nOPENAI_API_KEY=stale-openai-value\n');
    writeFileSync(path.join(dir, '.env.local'), 'DATABASE_URL=' + url('stale_local') + '\nANTHROPIC_API_KEY=stale-anthropic-value\n');
    const moduleUrl = pathToFileURL(path.join(repoRoot, 'server/config/load-env-files.ts')).href;
    writeFileSync(path.join(dir, 'probe.mjs'),
      'await import(' + JSON.stringify(moduleUrl) + ');\n' +
      'console.log(\'HOST=\' + JSON.stringify({ owner: process.env.DATABASE_URL ?? null, ' +
      'app: process.env.APP_DATABASE_URL ?? null, ' +
      'openai: process.env.OPENAI_API_KEY ?? null, anthropic: process.env.ANTHROPIC_API_KEY ?? null }));\n');
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of ['DATABASE_URL', 'APP_DATABASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) delete env[key];
    Object.assign(env, {
      C2C_CODESPACE: '1', CODESPACES: 'true', NODE_ENV: 'development',
      APP_DATABASE_URL: url('injected_runtime'),
      TSX_TSCONFIG_PATH: path.join(repoRoot, 'tsconfig.json'),
    });
    const output = execFileSync(tsx, ['probe.mjs'], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });
    const row = output.split('\n').find(line => line.startsWith('HOST='));
    expect(row && JSON.parse(row.slice(5))).toEqual({
      owner: null, app: url('injected_runtime'), openai: null, anthropic: null,
    });
  }, 60_000);
});

describe('env files are read in one place', () => {
  const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');
  const firstImport = (source: string) => source.match(/^import\s[^;]*;/m)?.[0] ?? '';

  it('is the first import of every server entrypoint that reads them', () => {
    expect(firstImport(read('server/index.ts'))).toBe("import './config/load-env-files';");
    expect(firstImport(read('server/bin/run-retention.ts'))).toBe("import '../config/load-env-files';");
    expect(firstImport(read('server/db/runtime.ts'))).toBe("import '../config/load-env-files';");
  });

  it('is the only server module that calls dotenv', () => {
    const hits = execFileSync(
      'git',
      ['grep', '--untracked', '-lE', "from ['\\\"]dotenv['\\\"]|['\\\"]dotenv/config['\\\"]|require\\(['\\\"]dotenv", '--', 'server'],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(f => f && !f.includes('__tests__'));
    expect(hits).toEqual(['server/config/load-env-files.ts']);
  });
});
