// Runs the named tests with some of F1's source files swapped for other copies
// of them (their HEAD text from `git show`, or the fix with one edit undone),
// leaving the working tree as it is. Each file present in F1_SWAP_DIR replaces
// its namesake below; its own relative imports still resolve from the real
// folder.
//
//   mkdir -p <dir> && git show HEAD:server/services/ana/AnaToolExecutor.ts > <dir>/AnaToolExecutor.ts  (etc.)
//   F1_SWAP_DIR=<dir> F1_INCLUDE=<test>[,<test>…] npx vitest run --maxWorkers=1 --config <this file>
//
// Known limit: a test that imports AnaToolExecutor through a `.js` specifier
// (tool-record-scope.test.ts) loads the copy outside Vite and fails to find it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../../../../vitest.config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const dir = path.resolve(process.env.F1_SWAP_DIR ?? '');
const swap: Record<string, string> = {};
for (const rel of [
  'server/services/ana/AnaToolExecutor.ts',
  'server/services/rbm/rbm-actuator.ts',
  'server/services/rbm/rbm-assessment-seed.ts',
]) {
  const copy = path.join(dir, path.basename(rel));
  if (process.env.F1_SWAP_DIR && fs.existsSync(copy)) swap[path.join(root, rel)] = copy;
}
const back = Object.fromEntries(Object.entries(swap).map(([real, copy]) => [copy, real]));

const cfg = mergeConfig(base, defineConfig({
  root,
  plugins: [{
    name: 'f1-swap',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      const real = importer && back[importer] ? back[importer] : importer;
      const resolved = await this.resolve(source, real, { ...opts, skipSelf: true });
      if (resolved && swap[resolved.id]) return swap[resolved.id];
      return real !== importer ? resolved : null;
    },
  }],
  server: { fs: { allow: [root, dir] } },
}));
cfg.test!.include = (process.env.F1_INCLUDE ?? '').split(',').filter(Boolean);
export default cfg;
