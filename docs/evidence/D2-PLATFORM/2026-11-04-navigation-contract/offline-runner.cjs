/** Reproduce the exact provider-contract suite with declared React/network
 * boundaries. No browser, live license, authentication or server policy is
 * simulated as qualified. Requires the repository's existing TypeScript.
 * C2C_NAV_BASELINE=1 exercises the hash-verified original production module. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const nodeTest = require('node:test');
const util = require('node:util');
const root = process.env.C2C_NAV_WORKSPACE || path.resolve(__dirname, '../../../..');
const ts = require(process.env.C2C_TS_PATH || require.resolve('typescript', { paths: [root] }));
const modulePath = 'client/src/concept2cure/v2/navEntitlements.tsx';
const testPath = 'client/src/concept2cure/v2/__tests__/navEntitlementsIntegrity.test.tsx';
const base = 'd6bf36c16a1e6a44c4eb212d0f042b0cdb6871bf';
const baselineBlob = '9501e871bce0023ea4e8815828e6958ce24217d7';
const gitBlob = source => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex');
let override;
if (process.env.C2C_NAV_BASELINE === '1') {
  override = process.env.C2C_NAV_BASELINE_FILE
    ? fs.readFileSync(process.env.C2C_NAV_BASELINE_FILE, 'utf8')
    : execFileSync('git', ['show', `${base}:${modulePath}`], { cwd: root, encoding: 'utf8' });
  if (gitBlob(override) !== baselineBlob) throw new Error('Baseline Git blob does not match the inspected module');
}
const cache = new Map();
const mocks = new Map();
const canonical = (request, from) => request.startsWith('.') ? path.resolve(path.dirname(from), request).replace(/\.tsx?$/, '') : request;
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const source = file === path.resolve(root, modulePath) && override !== undefined ? override : fs.readFileSync(file, 'utf8');
  const transformed = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  const errors = (transformed.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const mod = new Module(file, module);
  cache.set(file, mod); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  const nativeRequire = Module.createRequire(file);
  const it = (name, fn) => nodeTest.test(name, fn);
  it.each = rows => (name, fn) => rows.forEach(row => {
    const args = Array.isArray(row) ? row : [row];
    nodeTest.test(util.format(name, ...args), () => fn(...args));
  });
  mod.require = request => {
    if (request === 'vitest') return {
      it, beforeEach: nodeTest.beforeEach,
      vi: { hoisted: fn => fn(), mock: (name, factory) => mocks.set(canonical(name, file), { factory }) },
    };
    const key = canonical(request, file);
    if (mocks.has(key)) {
      const mock = mocks.get(key);
      if (!mock.value) mock.value = { __esModule: true, ...mock.factory() };
      return mock.value;
    }
    if (request.startsWith('.')) {
      for (const suffix of ['', '.ts', '.tsx']) {
        const target = key + suffix;
        if (fs.existsSync(target) && /\.tsx?$/.test(target)) return load(target);
      }
    }
    return nativeRequire(request);
  };
  mod._compile(transformed.outputText, file);
  return mod.exports;
}
console.log(`# Mode: ${override === undefined ? 'patched' : 'baseline'}; Node ${process.versions.node}; TypeScript ${ts.version}`);
console.log(`# Production Git blob: ${gitBlob(override ?? fs.readFileSync(path.resolve(root, modulePath), 'utf8'))}`);
load(path.resolve(root, testPath));
