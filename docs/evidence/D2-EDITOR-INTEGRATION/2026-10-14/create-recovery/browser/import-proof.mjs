import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const bundle = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const checks = [];
for (const file of readdirSync(bundle).filter(name => /\.(?:tsx?|mjs)$/.test(name))) {
  const contents = readFileSync(resolve(bundle, file), 'utf8');
  for (const match of contents.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    const imported = match[1];
    if (!imported.startsWith('.')) continue;
    const unextended = resolve(bundle, imported);
    const target = ['', '.ts', '.tsx', '.mjs', '.json', '.css'].map(extension => unextended + extension).find(existsSync);
    if (!target) throw new Error(`Unresolved import in ${file}: ${imported}`);
    const repositoryPath = relative(root, target);
    const production = !target.startsWith(bundle);
    if (production) execFileSync('git', ['ls-files', '--error-unmatch', repositoryPath], { cwd: root, stdio: 'pipe' });
    checks.push({ file, imported, target: repositoryPath, exists: true, productionTargetTracked: production || null });
  }
}
const result = { status: 'pass', repositoryRoot: root, checks };
writeFileSync(resolve(bundle, 'browser-fixture-import-proof.json'), JSON.stringify(result, null, 2) + '\n');
console.info(JSON.stringify({ status: result.status, relativeImports: checks.length, trackedProductionImports: checks.filter(c => c.productionTargetTracked).length }));
