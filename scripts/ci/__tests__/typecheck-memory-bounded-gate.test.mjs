/** Exercise the canonical gate, including an unchanged caller of an edited API. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-bounded-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts/ci'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(root, 'node_modules/typescript'), 'dir');
  for (const script of ['typecheck-no-regression.mjs', 'typecheck-memory-bounded.mjs']) {
    fs.copyFileSync(path.resolve(here, '..', script), path.join(root, 'scripts/ci', script));
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}\n');
  fs.writeFileSync(path.join(root, '.typecheck-baseline.json'), '{"errorCount":0}\n');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, types: [], skipLibCheck: true, target: 'ES2020', moduleResolution: 'node', module: 'commonjs' },
    files: ['api.ts', 'caller.ts'],
  }));
  fs.writeFileSync(path.join(root, 'api.ts'), 'export const transform = (value: number): number => value;\n');
  fs.writeFileSync(path.join(root, 'caller.ts'), "import { transform } from './api'; transform(123);\n");
  return root;
}

function gate(root, args = [], extraEnv = {}) {
  const env = { ...process.env, TYPECHECK_FILES_PER_PROCESS: '1000', TYPECHECK_HEAP_MB: '512', ...extraEnv };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/ci/typecheck-no-regression.mjs', ...args], {
    cwd: root, encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024,
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}`, error: result.error };
}

function stockCli(root) {
  return spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
  });
}

test('canonical gate rejects a new signature error in an untouched caller, then passes the repair', t => {
  const root = fixture(t);
  const caller = path.join(root, 'caller.ts');
  const baseline = path.join(root, '.typecheck-baseline.json');
  const originalCaller = digest(caller);
  const originalBaseline = digest(baseline);
  const clean = gate(root, ['--incremental']);
  assert.equal(clean.code, 0, clean.out);
  assert.equal(stockCli(root).status, 0, 'ordinary tsc must accept the same clean full context');
  assert.match(clean.out, /all \d+ source files checked exactly once/);
  assert.match(clean.out, /errors found: 0/);
  fs.writeFileSync(path.join(root, 'api.ts'), 'export const transform = (value: string): string => value;\n');
  const regression = gate(root, ['--incremental']);
  assert.equal(regression.code, 1, regression.out);
  assert.match(regression.out, /caller\.ts\(.*error TS2345:/);
  assert.match(regression.out, /error count 1 exceeds baseline 0/);
  const cliRegression = stockCli(root);
  assert.ok(cliRegression.status > 0, 'ordinary tsc must reject the same untouched caller');
  assert.match(cliRegression.stdout, /caller\.ts\(.*error TS2345:/);
  assert.equal(digest(caller), originalCaller, 'the caller must remain untouched throughout the proof');
  assert.equal(digest(baseline), originalBaseline, 'the original zero baseline must remain unchanged');
  assert.equal(fs.existsSync(path.join(root, 'node_modules/.cache/typecheck-no-regression/tsconfig.tsbuildinfo')), false,
    'bounded incremental option context must not read or write a cache');
  fs.writeFileSync(path.join(root, 'api.ts'), 'export const transform = (value: number): number => value;\n');
  const repaired = gate(root, ['--incremental']);
  assert.equal(repaired.code, 0, repaired.out);
});

test('bounded canonical gate refuses invalid partition settings, baseline writes and nonzero baselines', t => {
  const root = fixture(t);
  for (const value of ['', '0', '10001', 'NaN']) {
    const result = gate(root, [], { TYPECHECK_FILES_PER_PROCESS: value });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /must be an integer/);
  }
  const originalBaseline = digest(path.join(root, '.typecheck-baseline.json'));
  const write = gate(root, ['--write-baseline']);
  assert.equal(write.code, 1, write.out);
  assert.match(write.out, /cannot write a baseline/);
  assert.equal(digest(path.join(root, '.typecheck-baseline.json')), originalBaseline);
  fs.writeFileSync(path.join(root, '.typecheck-baseline.json'), '{"errorCount":1}\n');
  const nonzero = gate(root);
  assert.equal(nonzero.code, 1, nonzero.out);
  assert.match(nonzero.out, /requires the unchanged zero baseline/);
});

test('without the opt-in variable the gate retains the stock npx tsc path and incremental arguments', t => {
  const root = fixture(t);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npx'), `#!/usr/bin/env node\nimport('node:fs').then(fs => { fs.writeFileSync(process.env.CAPTURE, JSON.stringify(process.argv.slice(2))); });\n`, { mode: 0o755 });
  const capture = path.join(root, 'args.json');
  const result = gate(root, ['--incremental'], {
    TYPECHECK_FILES_PER_PROCESS: undefined,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    CAPTURE: capture,
  });
  assert.equal(result.code, 0, result.out);
  assert.deepEqual(JSON.parse(fs.readFileSync(capture, 'utf8')), [
    'tsc', '--noEmit', '-p', 'tsconfig.json', '--incremental', '--tsBuildInfoFile',
    path.join(root, 'node_modules/.cache/typecheck-no-regression/tsconfig.tsbuildinfo'),
  ]);
  assert.match(result.out, /running tsc --noEmit --incremental/);
  assert.doesNotMatch(result.out, /TypeScript API workers/);
});
