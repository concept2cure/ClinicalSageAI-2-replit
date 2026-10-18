import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const label = process.argv[2];
if (!label || !/^[a-z][a-z0-9-]*$/.test(label) || process.argv.length !== 3) throw new Error('Use one simple evidence label');
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use repository Node 22');
const files = [
  'server/services/ana/AnaToolExecutor.ts', 'server/services/ana/batch-draft-result.ts',
  'server/services/ana/AnaDocumentDraftingService.ts', 'server/services/ai-gateway/finish-reason.ts',
  'server/services/ana/draft-project-sources.ts', 'server/services/ana/draft-source-identity.ts',
  'server/services/ana/draft-source-window.ts', 'shared/authoring/draft-source-reference.ts',
  'server/services/ana/__tests__/batch-draft-termination-tool.test.ts',
  'server/services/ana/__tests__/support/source-read-tool-fixture.ts', 'vitest.config.ts', 'tests/setup.ts',
  ...['CONTRACT.md', 'independent-tool.config.mts', 'independent-run-tool.mjs'].map(name => path.relative(root, path.join(folder, name))),
];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
const before = hashes(); const startedAt = new Date().toISOString();
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', path.relative(root, path.join(folder, 'independent-tool.config.mts'))];
const run = spawnSync(process.execPath, command, { cwd: root, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' } });
const after = hashes(); const sourcesUnchangedDuringRun = JSON.stringify(before) === JSON.stringify(after);
writeFileSync(path.join(folder, `independent-${label}.txt`), run.stdout + run.stderr);
writeFileSync(path.join(folder, `independent-${label}-bindings.json`), JSON.stringify({ node: process.version, startedAt,
  finishedAt: new Date().toISOString(), command, exitCode: run.status, before, after, sourcesUnchangedDuringRun,
  scope: 'Actual registered batch handler, canonical receipt and source loader. Drafting service/catalog/actor/program and canonical Vitest pg seams are mocked. No real provider/DB/network use.' }, null, 2) + '\n');
process.stdout.write(run.stdout + run.stderr + `\nSources unchanged during run: ${sourcesUnchangedDuringRun}\n`);
process.exit(run.status === 0 && sourcesUnchangedDuringRun ? 0 : 1);
