/** Transpiles the actual candidate core/adapter (server/services/authoring) into a temporary
 * ES module directory so scientific-review.test.mjs exercises the real code under any runner,
 * including `npm run test:ci-scripts` (node --test "scripts/**\/*.test.mjs").
 * A TypeScript error fails the build; nothing is substituted.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root = dirname(fileURLToPath(import.meta.url));
const repository = join(root, '../../..');
const require = createRequire(import.meta.url);
function loadTypescript() {
  try { return require('typescript'); }
  catch { return require(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'typescript')); }
}
export const CSR_REVIEW_MODULES = ['csr-scientific-review-core', 'csr-scientific-review'];
/** @returns {{ dir: string, cleanup: () => void }} */
export function buildCsrReviewModules() {
  const ts = loadTypescript();
  const dir = mkdtempSync(join(tmpdir(), 'c2c-csr-evidence-'));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
    for (const name of CSR_REVIEW_MODULES) {
      const input = readFileSync(join(repository, 'server/services/authoring', name + '.ts'), 'utf8');
      const result = ts.transpileModule(input, { fileName: name + '.ts', reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true } });
      const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
      if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,
        { getCurrentDirectory: () => root, getCanonicalFileName: x => x, getNewLine: () => '\n' }));
      writeFileSync(join(dir, name + '.js'), result.outputText);
    }
  } catch (error) { cleanup(); throw error; }
  return { dir, cleanup };
}
