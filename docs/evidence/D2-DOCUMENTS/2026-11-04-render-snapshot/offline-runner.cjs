/** Executes the exact TypeScript regression and production renderer with only
 * its declared test collaborators replaced. XML rendering and digest code are
 * real; DOCX/PDF libraries are doubles, not native artifact qualification.
 * Requires Node 22 and the repository's existing TypeScript dev dependency.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test, beforeEach } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../..');
const testFile = path.join(root, 'server/services/authoring/__tests__/authoring-export-snapshot.test.ts');
const modulePath = 'server/services/authoring/authoring-export.ts';
const baseline = 'b72c0f274e7a988e6976be7d091652084e8a42e1';
const mocks = new Map(), modules = new Map();
const key = (spec, parent) => spec.startsWith('.') ? path.resolve(path.dirname(parent), spec).replace(/\.(?:ts|js)$/, '') : spec;
const vi = { hoisted: fn => fn(), mock: (spec, factory) => mocks.set(key(spec, testFile), factory) };
function read(file) {
  if (process.env.DOC_EXPORT_BASELINE !== '1' || file !== path.join(root, modulePath)) return fs.readFileSync(file, 'utf8');
  const bytes = process.env.DOC_EXPORT_BASELINE_FILE ? fs.readFileSync(process.env.DOC_EXPORT_BASELINE_FILE)
    : execFileSync('git', ['show', `${baseline}:${modulePath}`], { cwd: root });
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (sha !== '31aeeff4a141c0608dbb372b0a21d56059159f5c') throw Error('Baseline Git blob mismatch');
  return bytes.toString('utf8');
}
function load(spec, parent) {
  const id = key(spec, parent);
  if (spec === 'vitest') return { vi, it: (name, fn) => test(name, { timeout: 3000 }, fn), beforeEach };
  if (spec.startsWith('node:') || spec === 'crypto') return require(spec);
  if (modules.has(id)) return modules.get(id).exports;
  if (mocks.has(id)) { const exports = mocks.get(id)(); modules.set(id, { exports }); return exports; }
  const file = id.endsWith('.ts') ? id : id + '.ts';
  if (!fs.existsSync(file)) throw Error('Undeclared dependency: ' + spec);
  const output = ts.transpileModule(read(file), { fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  if (output.diagnostics.length) throw Error(output.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
  const module = { exports: {} }; modules.set(id, module);
  new Function('require', 'module', 'exports', '__filename', '__dirname', output.outputText)(
    s => load(s, file), module, module.exports, file, path.dirname(file));
  return module.exports;
}
load(testFile, testFile);
