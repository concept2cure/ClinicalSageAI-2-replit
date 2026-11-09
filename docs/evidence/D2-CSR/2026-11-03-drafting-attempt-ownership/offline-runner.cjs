/** Reproduce the narrowly scoped concurrency regression without Vitest.
 * Executes the actual TypeScript test and worker using node:test and the
 * doubles declared in that test. NOT a PostgreSQL, native Vitest or PQ pass.
 * Requires Node 22 and TypeScript (the repository's dev dependency).
 * CSR_TEST_BASELINE=1 loads the hash-verified old worker for a red control.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test, beforeEach } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../..');
const testFile = path.join(root, 'server/services/csr/__tests__/csr-job-runner.attempt-fence.test.ts');
const baseline = '7b2d13bef71f3fed1b12dd1aa3534c64ebc5b00b';
const workerPath = 'server/services/csr/csr-job-runner.ts';
const mocks = new Map(), modules = new Map();
function key(spec, parent) {
  return spec.startsWith('.') ? path.resolve(path.dirname(parent), spec).replace(/\.(?:ts|js)$/, '') : spec;
}
const vi = { hoisted: fn => fn(), mock: (spec, factory) => mocks.set(key(spec, testFile), factory) };
function sourceOf(file) {
  if (process.env.CSR_TEST_BASELINE !== '1' || file !== path.join(root, workerPath)) return fs.readFileSync(file, 'utf8');
  const bytes = process.env.CSR_TEST_BASELINE_FILE
    ? fs.readFileSync(process.env.CSR_TEST_BASELINE_FILE)
    : execFileSync('git', ['show', `${baseline}:${workerPath}`], { cwd: root });
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== '756f4b7eb4b41d04c6ca4cab59ae39361fa9b73e') throw Error('Baseline worker bytes do not match the inspected Git blob');
  return bytes.toString('utf8');
}
function load(spec, parent) {
  const id = key(spec, parent);
  if (spec === 'vitest') return { vi, it: (name, fn) => test(name, { timeout: 3000 }, fn), beforeEach };
  if (spec.startsWith('node:')) return require(spec);
  if (modules.has(id)) return modules.get(id).exports;
  if (mocks.has(id)) {
    const value = mocks.get(id)(); modules.set(id, { exports: value }); return value;
  }
  const file = id.endsWith('.ts') ? id : id + '.ts';
  if (!fs.existsSync(file)) throw Error('Undeclared test dependency: ' + spec);
  const output = ts.transpileModule(sourceOf(file), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  if (output.diagnostics.length) throw Error(output.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
  const module = { exports: {} }; modules.set(id, module);
  new Function('require', 'module', 'exports', '__filename', '__dirname', output.outputText)(
    next => load(next, file), module, module.exports, file, path.dirname(file));
  return module.exports;
}
load(testFile, testFile);
