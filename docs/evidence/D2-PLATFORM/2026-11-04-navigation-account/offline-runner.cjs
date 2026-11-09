/* Runs the committed provider suite using explicit React/read/auth adapters.
 * Does not claim DOM, server authentication or network concurrency validation. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { test, beforeEach } = require('node:test');
const util = require('node:util');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const prod = 'client/src/concept2cure/v2/navEntitlements.tsx';
const baselineSha = 'f79ab55bc4bf37af5f0928b69a69acdc72089822';
const baselineBlob = '3c7da6617b4579fec65837951049b22b342c417c';
const source = process.env.C2C_NAV_ACCOUNT_BASELINE === '1'
  ? (process.env.C2C_NAV_ACCOUNT_BASELINE_FILE
    ? fs.readFileSync(process.env.C2C_NAV_ACCOUNT_BASELINE_FILE, 'utf8')
    : execFileSync('git', ['show', `${baselineSha}:${prod}`], { cwd: root, encoding: 'utf8' }))
  : fs.readFileSync(path.join(root, prod), 'utf8');
if (process.env.C2C_NAV_ACCOUNT_BASELINE === '1') {
  const bytes = Buffer.from(source);
  const hash = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (hash !== baselineBlob) throw new Error('Baseline Git blob identity mismatch');
}
const mocks = new Map();
const vi = { hoisted: fn => fn(), mock: (id, factory) => mocks.set(id, { __esModule: true, ...factory() }) };
const it = (name, fn) => test(name, { concurrency: false }, fn);
it.each = rows => (name, fn) => rows.forEach(row => {
  const args = Array.isArray(row) ? row : [row];
  it(util.format(name, ...args), () => fn(...args));
});
function compile(text, file, req) {
  const output = ts.transpileModule(text, { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React, esModuleInterop: true } });
  if (output.diagnostics?.length) throw new Error(ts.formatDiagnostics(output.diagnostics, {
    getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const m = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output.outputText}\n})`, { filename: file })(req, m, m.exports);
  return m.exports;
}
let provider;
function req(id) {
  if (id === 'vitest') return { beforeEach, it, vi };
  if (mocks.has(id)) return mocks.get(id);
  if (id === './dataConnect' && mocks.has('../dataConnect')) return mocks.get('../dataConnect');
  if (id === '../navEntitlements') return provider ??= compile(source, path.join(root, prod), req);
  if (id.startsWith('node:')) return require(id);
  throw new Error(`Undeclared offline collaborator: ${id}`);
}
const suite = process.env.C2C_NAV_ACCOUNT_SUITE || 'client/src/concept2cure/v2/__tests__/navEntitlementsAccount.test.tsx';
compile(fs.readFileSync(path.join(root, suite), 'utf8'), path.join(root, suite), req);
