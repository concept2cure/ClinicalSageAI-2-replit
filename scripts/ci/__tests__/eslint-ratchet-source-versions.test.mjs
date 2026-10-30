import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintSourceVersions } from '../lib/lint-source-versions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const gatePath = 'scripts/ci/check-eslint-warning-ratchet.mjs';
const helperPath = 'scripts/ci/lib/lint-source-versions.mjs';

// This is a synthetic command fixture, not another git checkout. It supplies
// exactly one changed file to the real gate and runs the real ESLint engine.
function fixture({ exactName = false, invalidConfig = false, history = 'debugger;', current = 'export const current = true;\n' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'eslint-source-versions-'));
  const put = (name, text) => {
    const full = path.join(root, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
  };
  put(gatePath, readFileSync(path.join(repo, gatePath), 'utf8'));
  if (existsSync(path.join(repo, helperPath))) put(helperPath, readFileSync(path.join(repo, helperPath), 'utf8'));
  put('package.json', '{"type":"module"}');
  symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'));
  put('eslint.config.mjs', invalidConfig ? 'export default [ { invalidOption: true } ];' : `export default [
    { ignores: ['src/ignored.js'] },
    { files: ['src/**/*.{js,jsx,tsx}'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: { 'no-debugger': '${exactName ? 'off' : 'warn'}' } },
    { files: ['src/record.js'], rules: { 'no-debugger': 'warn' } },
    { files: ['**/*.test.js'], rules: { 'no-debugger': 'off' } }
  ];`);
  put('src/record.js', current);
  const bin = put('bin/git', `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'rev-parse') console.log('a'.repeat(40));
else if (args[0] === 'diff' && args.includes('--name-status')) console.log('M\\tsrc/record.js');
else if (args[0] === 'show') console.log(${JSON.stringify(history)});
else if (args[0] === 'diff') console.log('@@ -1 +1 @@');
else process.exit(1);
`);
  return { root, put, bin };
}

async function runGate(f) {
  const { chmodSync } = await import('node:fs');
  chmodSync(f.bin, 0o755);
  const child = spawn(process.execPath, [path.join(f.root, gatePath), '--since', 'HEAD', '--gate'], {
    cwd: f.root,
    env: { ...process.env, PATH: `${path.dirname(f.bin)}:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, stdout, stderr };
}

test('historical source does not enter the source tree while the gate runs', async () => {
  const f = fixture();
  const touched = [];
  const watcher = watch(path.join(f.root, 'src'), (_kind, name) => { touched.push(String(name)); });
  try {
    const result = await runGate(f);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /src\/record\.js {2}\(1 -> 0\)/);
    assert.deepEqual(touched, [], `The historical source became visible to other scanners: ${touched.join(', ')}`);
    assert.equal(readFileSync(path.join(f.root, 'src/record.js'), 'utf8'), 'export const current = true;\n');
  } finally {
    watcher.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('the original basename controls both historical and current warning counts', async () => {
  const f = fixture({ exactName: true });
  try {
    const result = await runGate(f);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /src\/record\.js {2}\(1 -> 0\)/);
    assert.match(result.stdout, /net -1 warning/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('an invalid real ESLint configuration remains a gate failure', async () => {
  const f = fixture({ invalidConfig: true });
  try {
    const result = await runGate(f);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /ESLint.*(not a lint result|config error|could not lint)/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('historical JSX, test suffixes, ignored names and deleted directories keep the original configuration', async () => {
  const f = fixture();
  try {
    const result = await lintSourceVersions([
      { filePath: 'src/component.tsx', source: 'const view = <div />; debugger;' },
      { filePath: 'src/record.test.js', source: 'debugger;' },
      { filePath: 'src/ignored.js', source: 'debugger;' },
      { filePath: 'src/deleted/record.js', source: 'debugger;' },
    ], f.root);
    const warnings = result.filter(row => row.warningCount > 0);
    assert.deepEqual(warnings.map(row => path.relative(f.root, row.filePath)), [
      'src/component.tsx', 'src/deleted/record.js',
    ]);
    assert.ok(result.every(row => row.errorCount === 0));
    assert.ok(warnings.every(row => row.messages[0].ruleId === 'no-debugger'));
    assert.equal(existsSync(path.join(f.root, 'src/deleted')), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('historical-source configuration errors propagate instead of returning an empty report', async () => {
  const f = fixture({ invalidConfig: true });
  try {
    await assert.rejects(lintSourceVersions([
      { filePath: 'src/record.js', source: 'debugger;' },
    ], f.root), /invalidOption/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('the real --gate still refuses current warning growth', async () => {
  const f = fixture({ history: 'export const original = true;', current: 'debugger;' });
  try {
    const result = await runGate(f);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stdout, /src\/record\.js {2}\(0 -> 1\)/);
    assert.match(result.stderr, /changed files gained 1 warning/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
