/** Execute the committed route suite, with Express and resolver collaborators
 * explicitly substituted by its vi.mock declarations. No native HTTP/server,
 * regulatory rules or gateway acceptance is claimed. Uses existing TypeScript. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const nodeTest = require('node:test');
const util = require('node:util');
const { execFileSync } = require('node:child_process');
const root = process.env.C2C_QUERY_WORKSPACE || path.resolve(__dirname, '../../../..');
const ts = require(process.env.C2C_TS_PATH || require.resolve('typescript', { paths: [root] }));
const production = 'server/routes/biopharma/submissions.ts';
const suite = 'tests/services/regulatory/submission-query.test.ts';
const base = '75a1e5ba40dfa860100d6d2dca8dc6e1aa823aec';
const baselineBlob = '0857f5753919f21434e550d3454677d2d895455f';
const blob = text => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
let override;
if (process.env.C2C_QUERY_BASELINE === '1') {
  override = process.env.C2C_QUERY_BASELINE_FILE
    ? fs.readFileSync(process.env.C2C_QUERY_BASELINE_FILE, 'utf8')
    : execFileSync('git', ['show', `${base}:${production}`], { cwd: root, encoding: 'utf8' });
  if (blob(override) !== baselineBlob) throw new Error('Original source is not the inspected Git blob');
}
const cache = new Map(), mocks = new Map();
const canonical = (name, from) => name.startsWith('.')
  ? path.resolve(path.dirname(from), name).replace(/\.(?:tsx?|js)$/, '') : name;
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const source = file === path.resolve(root, production) && override !== undefined ? override : fs.readFileSync(file, 'utf8');
  const transformed = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  if ((transformed.diagnostics || []).some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('TypeScript syntax diagnostics');
  const mod = new Module(file, module); cache.set(file, mod); mod.filename = file;
  const native = Module.createRequire(file);
  const it = (title, fn) => nodeTest.test(title, fn);
  it.each = rows => (title, fn) => rows.forEach(row => {
    const args = Array.isArray(row) ? row : [row];
    nodeTest.test(util.format(title, ...args), () => fn(...args));
  });
  mod.require = request => {
    if (request === 'vitest') return { it, beforeEach: nodeTest.beforeEach,
      vi: { hoisted: fn => fn(), mock: (name, factory) => mocks.set(canonical(name, file), { factory }) } };
    const key = canonical(request, file);
    if (mocks.has(key)) { const mock = mocks.get(key); return mock.value ||= { __esModule: true, ...mock.factory() }; }
    if (request.startsWith('.')) for (const suffix of ['.ts', '.tsx']) if (fs.existsSync(key + suffix)) return load(key + suffix);
    return native(request);
  };
  mod._compile(transformed.outputText, file); return mod.exports;
}
console.log(`# ${override === undefined ? 'repaired' : 'baseline'}; Node ${process.versions.node}; TypeScript ${ts.version}`);
console.log(`# route blob: ${blob(override ?? fs.readFileSync(path.resolve(root, production), 'utf8'))}`);
load(path.resolve(root, suite));
