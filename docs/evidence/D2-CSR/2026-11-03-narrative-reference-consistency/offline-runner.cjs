/** Narrow executable evidence adapter: actual reader/walker/formatter and
 * exact TS tests, with only the test's declared SQL/store boundary doubles.
 * Does not establish PostgreSQL/RLS, native Vitest or hosted CSR acceptance.
 * Existing TypeScript dev dependency; no application dependencies added. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../..');
const suite = path.join(root, 'server/services/csr/__tests__/csr-narrative-reference-consistency.test.ts');
const readerPath = 'server/services/csr/csr-narrative-landed.ts';
const baseline = 'e3b05b8c0c2d0bc4ea17fb7e4ca75f4f8830400c';
const mocks = new Map(), modules = new Map();
const key = (s, p) => s.startsWith('.') ? path.resolve(path.dirname(p), s).replace(/\.(ts|js)$/, '') : s;
const vi = { mock: (s, f) => mocks.set(key(s, suite), f) };
function source(file) {
  if (process.env.CSR_REFERENCE_BASELINE !== '1' || file !== path.join(root, readerPath)) return fs.readFileSync(file, 'utf8');
  const bytes = process.env.CSR_REFERENCE_BASELINE_FILE ? fs.readFileSync(process.env.CSR_REFERENCE_BASELINE_FILE)
    : execFileSync('git', ['show', `${baseline}:${readerPath}`], { cwd: root });
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== '3077f093197507eec9ac85d7829daee1c66ee9bb') throw Error('Wrong baseline source bytes');
  return bytes.toString('utf8');
}
function load(spec, parent) {
  if (spec === 'vitest') return { vi, it: (name, fn) => test(name, { timeout: 3000 }, fn) };
  if (spec.startsWith('node:')) return require(spec);
  const id = key(spec, parent);
  if (modules.has(id)) return modules.get(id).exports;
  if (mocks.has(id)) { const exports = mocks.get(id)(); modules.set(id, { exports }); return exports; }
  const file = id.endsWith('.ts') ? id : id + '.ts';
  if (!fs.existsSync(file)) throw Error('Undeclared test dependency: ' + spec);
  const result = ts.transpileModule(source(file), { fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  if (result.diagnostics.length) throw Error(result.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
  const module = { exports: {} }; modules.set(id, module);
  new Function('require', 'module', 'exports', '__filename', '__dirname', result.outputText)(
    s => load(s, file), module, module.exports, file, path.dirname(file));
  return module.exports;
}
load(suite, suite);
