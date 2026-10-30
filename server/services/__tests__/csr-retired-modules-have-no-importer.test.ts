/**
 * CSR slice 9 (2026-10-29) deleted three CSR modules nothing reached and one
 * model-frequency function. This gate fails while anything in server/, shared/,
 * client/src or scripts/ still imports a deleted module or names the function,
 * so a deletion cannot leave a dangling importer or be quietly reintroduced.
 *
 *   server/csr-training-service.ts           unreferenced (unreferenced-modules baseline)
 *   server/services/csr-knowledge-extractor.ts  re-exported only by the importer-less
 *                                               server/services/index.ts barrel
 *   server/services/csr/index.ts             the same barrel's `csr` namespace;
 *                                            extract() threw, getKnowledge() returned {}
 *   analyzeCSRSafetySignals (csr-builder.ts) asked a model for AE frequencies (RULE 2)
 *
 * server/services/csr-search-service.ts is NOT deleted: public-api.ts and
 * register-inline-routes.ts import it.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIRS = ['server', 'shared', 'client/src', 'scripts'];
const SKIP = new Set(['node_modules', 'dist', '.git']);
const SELF = path.join('server', 'services', '__tests__', 'csr-retired-modules-have-no-importer.test.ts');

const RETIRED: Array<{ name: string; pattern: RegExp }> = [
  { name: 'csr-training-service', pattern: /from\s+['"][^'"]*\/csr-training-service(\.js)?['"]|import\(\s*['"][^'"]*\/csr-training-service/ },
  { name: 'csr-knowledge-extractor', pattern: /from\s+['"][^'"]*\/csr-knowledge-extractor(\.js)?['"]|import\(\s*['"][^'"]*\/csr-knowledge-extractor/ },
  { name: 'services/csr barrel', pattern: /from\s+['"](\.\/csr|[^'"]*services\/csr(\/index)?(\.js)?)['"]|import\(\s*['"][^'"]*services\/csr(\/index)?(\.js)?['"]/ },
  { name: 'analyzeCSRSafetySignals', pattern: /\banalyzeCSRSafetySignals\s*[(,}]/ },
];

function* sourceFiles(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) yield full;
  }
}

describe('retired CSR modules', () => {
  it('are deleted', () => {
    for (const file of ['server/csr-training-service.ts', 'server/services/csr-knowledge-extractor.ts', 'server/services/csr/index.ts']) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(false);
    }
  });

  it('have no importer anywhere in server, shared, client/src or scripts', () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        if (rel === SELF) continue;
        const text = fs.readFileSync(file, 'utf8');
        for (const { name, pattern } of RETIRED) if (pattern.test(text)) hits.push(`${rel}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
