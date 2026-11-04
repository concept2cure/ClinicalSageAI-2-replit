/** Execute the same committed test cases against actual resolver source.
 * Registry, alias, module-shape and gateway collaborators are the suite's
 * declared test substitutes. No live filing, HTTP, database or regulatory
 * qualification is implied. Requires the existing TypeScript dependency. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const util = require('node:util');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const root = process.env.C2C_RESOLVER_WORKSPACE || path.resolve(__dirname, '../../../..');
const ts = require(process.env.C2C_TS_PATH || require.resolve('typescript', { paths: [root] }));
const production = 'server/services/regulatory/submission-resolver.ts';
const suite = 'tests/services/regulatory/submission-resolver-intent.test.ts';
const base = '0fc881c16fa344573ae55f5e882b1ca1c9d3631a';
const expectedBlob = 'd1391ea4c8fd42a82b9f6e5f6d03024efc013b94';
const gitBlob = text => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
let override;
if (process.env.C2C_RESOLVER_BASELINE === '1') {
  override = process.env.C2C_RESOLVER_BASELINE_FILE
    ? fs.readFileSync(process.env.C2C_RESOLVER_BASELINE_FILE, 'utf8')
    : execFileSync('git', ['show', `${base}:${production}`], { cwd: root, encoding: 'utf8' });
  if (gitBlob(override) !== expectedBlob) throw new Error('The baseline Git blob does not match');
}
const mocks = new Map(); const modules = new Map();
const canonical = (request, from) => request.startsWith('.')
  ? path.resolve(path.dirname(from), request).replace(/\.(?:tsx?|js)$/, '') : request;
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const source = file === path.resolve(root, production) && override !== undefined
    ? override : fs.readFileSync(file, 'utf8');
  const transformed = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const errors = (transformed.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  modules.set(file, m); const native = Module.createRequire(file);
  const it = (name, fn) => test.test(name, fn);
  it.each = rows => (name, fn) => rows.forEach(row => {
    const args = Array.isArray(row) ? row : [row];
    test.test(util.format(name, ...args), () => fn(...args));
  });
  m.require = request => {
    if (request === 'vitest') return { it, beforeEach: test.beforeEach,
      vi: { hoisted: fn => fn(), mock: (name, factory) => mocks.set(canonical(name, file), { factory }) } };
    const key = canonical(request, file);
    if (mocks.has(key)) {
      const mock = mocks.get(key); if (!mock.value) mock.value = { __esModule: true, ...mock.factory() };
      return mock.value;
    }
    if (request.startsWith('.')) {
      for (const extension of ['.ts', '.tsx']) if (fs.existsSync(key + extension)) return load(key + extension);
    }
    return native(request);
  };
  m._compile(transformed.outputText, file); return m.exports;
}
console.log(`# Mode: ${override === undefined ? 'repaired' : 'baseline'}; Node ${process.versions.node}; TypeScript ${ts.version}`);
console.log(`# Production Git blob: ${gitBlob(override ?? fs.readFileSync(path.resolve(root, production), 'utf8'))}`);
load(path.resolve(root, suite));
