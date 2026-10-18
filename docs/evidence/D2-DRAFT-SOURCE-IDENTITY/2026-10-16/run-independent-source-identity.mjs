/** Opt-in held-out runner. Writes only this evidence folder, binds actual files,
 * and refuses a changing source set. Run with repository Node 22. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const label = process.argv[2] ?? 'final';
if (!/^[a-z][a-z0-9-]*$/.test(label) || process.argv.length > 3) throw new Error('Use one simple evidence label');
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use repository Node 22');
const paths = [
  'shared/authoring/draft-source-reference.ts',
  'server/services/ana/draft-source-identity.ts',
  'server/services/ana/draft-project-sources.ts',
  'server/services/ana/draft-source-window.ts',
  'server/services/ana/document-surface-tool-defs.ts',
  'server/services/authoring/draft-source-references.ts',
  'server/services/authoring/authoring-from-draft.ts',
  'server/services/authoring/import-source-references.ts',
  'server/services/document-data-disposition/program-lock.ts',
  'server/services/vault/document-catalog-eligibility.ts',
  ...['CONTRACT.md', 'independent-source-identity.test.mts', 'independent-source-identity.config.mts', 'run-independent-source-identity.mjs']
    .map(name => path.relative(root, path.join(folder, name))),
];
const counterfactual = label === 'counterfactual';
if (counterfactual) paths.push(...['independent-source-identity-counterfactual.config.mts', 'baseline-draft-source-references.ts.txt', 'baseline-independent-source-identity.test.mts.txt']
  .map(name => path.relative(root, path.join(folder, name))));
const hashes = () => Object.fromEntries(paths.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
const before = hashes();
const startedAt = new Date().toISOString();
const config = counterfactual ? 'independent-source-identity-counterfactual.config.mts' : 'independent-source-identity.config.mts';
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', path.relative(root, path.join(folder, config))];
const run = spawnSync(process.execPath, command, {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
});
const after = hashes();
const sourcesUnchangedDuringRun = JSON.stringify(before) === JSON.stringify(after);
writeFileSync(path.join(folder, `independent-${label}.txt`), run.stdout + run.stderr);
writeFileSync(path.join(folder, `independent-${label}-source-bindings.json`), JSON.stringify({
  node: process.version, command, startedAt, finishedAt: new Date().toISOString(), exitCode: run.status,
  scope: 'Actual source decoder/verifier/producer; mocked catalog and actor/program authority seams; no database/provider or agency qualification',
  counterfactual: counterfactual ? 'One application module (draft-source-references.ts) and the exact original nine-control test fixture are substituted from baseline byte snapshots; all other application modules stay current' : null,
  before, after, sourcesUnchangedDuringRun,
}, null, 2) + '\n');
process.stdout.write(run.stdout + run.stderr);
process.stdout.write(`\nSources unchanged during run: ${sourcesUnchangedDuringRun}\n`);
process.exit(run.status === 0 && sourcesUnchangedDuringRun ? 0 : 1);
