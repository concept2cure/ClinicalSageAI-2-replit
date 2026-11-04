/** Executes the exact regression test with node:test, not native Vitest.
 * Only declared test doubles are substituted. Actual worker/store source is
 * compiled by the repository's TypeScript dependency. No database/PQ claim. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../..');
const testFile = path.join(root, 'server/services/csr/__tests__/csr-narrative-write-ownership.test.ts');
const baseline = '0441fa1bec707cfb4d61d448dd2b49195199c280';
const oldBlobs = {
  'server/services/csr/csr-narrative-run.ts': '77715cdcfb6993e9333a2ea370f6d50f04852d6b',
  'server/services/csr/csr-narrative-store.ts': 'e2a07b3af845accaf0e2b4e593ab4582aa29dc55',
};
const mocks = new Map(), loaded = new Map();
const key = (spec, parent) => spec.startsWith('.')
  ? path.resolve(path.dirname(parent), spec).replace(/\.(?:ts|js)$/, '') : spec;
const vi = { hoisted: f => f(), mock: (spec, f) => mocks.set(key(spec, testFile), f) };
function sourceOf(file) {
  const relative = path.relative(root, file);
  if (process.env.CSR_TEST_BASELINE !== '1' || !oldBlobs[relative]) return fs.readFileSync(file, 'utf8');
  const bytes = process.env.CSR_TEST_BASELINE_DIR
    ? fs.readFileSync(path.join(process.env.CSR_TEST_BASELINE_DIR, path.basename(file)))
    : execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: root });
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (hash !== oldBlobs[relative]) throw Error('Baseline bytes differ from verified Git blob: ' + relative);
  return bytes.toString('utf8');
}
function load(spec, parent) {
  if (spec === 'vitest') return { vi, it: (name, fn) => test(name, { timeout: 3000 }, fn) };
  if (spec.startsWith('node:')) return require(spec);
  const id = key(spec, parent);
  if (loaded.has(id)) return loaded.get(id).exports;
  if (mocks.has(id)) { const value = mocks.get(id)(); loaded.set(id, { exports: value }); return value; }
  const file = id.endsWith('.ts') ? id : id + '.ts';
  if (!fs.existsSync(file)) throw Error('Undeclared dependency: ' + spec);
  const compiled = ts.transpileModule(sourceOf(file), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  if (compiled.diagnostics.length) throw Error(compiled.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
  const module = { exports: {} }; loaded.set(id, module);
  new Function('require', 'module', 'exports', '__filename', '__dirname', compiled.outputText)(
    next => load(next, file), module, module.exports, file, path.dirname(file));
  return module.exports;
}
load(testFile, testFile);
