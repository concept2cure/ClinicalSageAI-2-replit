/* global structuredClone: readonly */
/* Export-level parity proof for the two literal fixture constructor refactors.
 * This script only evaluates fixture modules with crypto and structuredClone. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../..');
const basePath = 'server/services/vault/__tests__/fixtures/scientific-source-facts.ts';
const heldoutPath = 'server/services/vault/__tests__/fixtures/scientific-source-facts-heldout.ts';
const modules = new Map();
function load(relativePath) {
  if (modules.has(relativePath)) return modules.get(relativePath);
  const exported = {};
  modules.set(relativePath, exported);
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    exports: exported,
    structuredClone,
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name === './scientific-source-facts') return load(basePath);
      throw new Error(`Unexpected fixture dependency: ${name}`);
    },
  }, { filename: relativePath });
  return exported;
}
const corpora = [
  { path: basePath, values: load(basePath).scientificSourceFactFixtures },
  { path: heldoutPath, values: load(heldoutPath).heldOutScientificSourceFactFixtures },
];
const result = corpora.map(corpus => ({ path: corpus.path, count: corpus.values.length,
  exportedCorpusSha256: crypto.createHash('sha256').update(JSON.stringify(corpus.values)).digest('hex'),
  sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, corpus.path))).digest('hex'),
}));
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
