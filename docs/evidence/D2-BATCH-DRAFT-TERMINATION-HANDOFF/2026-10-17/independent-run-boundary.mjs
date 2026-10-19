import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const label = process.argv[2];
if (!label || !/^[a-z][a-z0-9-]*$/.test(label) || process.argv.length !== 3) throw new Error('Use one simple evidence label');
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use repository Node 22');
const files = [
  'server/routes/batch-draft-routes.ts', 'server/services/ai-gateway/finish-reason.ts', 'shared/ai/finish-reason.ts',
  'client/src/concept2cure/v2/surfaces/BatchDraft.tsx', 'server/services/authoring/machine-claim-verify.ts',
  'server/services/authoring/authoring-html-sanitizer.ts', 'server/services/coauthor/coauthor-audit.ts',
  'server/services/coauthor/coauthor-status-write.ts', 'server/routes/__tests__/batch-draft-termination-boundary.test.ts',
  'vitest.config.ts', 'tests/setup.ts',
  ...['CONTRACT.md', 'independent-boundary.config.mts', 'independent-run-boundary.mjs'].map(name => path.relative(root, path.join(folder, name))),
];
const hashes = () => Object.fromEntries(files.map(file => {
  const absolute = path.join(root, file);
  return [file, existsSync(absolute) ? createHash('sha256').update(readFileSync(absolute)).digest('hex') : null];
}));
const before = hashes(); const startedAt = new Date().toISOString();
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', path.relative(root, path.join(folder, 'independent-boundary.config.mts'))];
const run = spawnSync(process.execPath, command, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' } });
const after = hashes(); const sourcesUnchangedDuringRun = JSON.stringify(before) === JSON.stringify(after);
writeFileSync(path.join(folder, `independent-${label}.txt`), run.stdout + run.stderr);
writeFileSync(path.join(folder, `independent-${label}-bindings.json`), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
  node: process.version, command, exitCode: run.status, before, after, sourcesUnchangedDuringRun,
  scope: 'Actual Express registered accept handler over loopback HTTP; authenticated fixture request and requestDb sentinel. Gate-passing cases stop before DB construction/queries and are not acceptances. Canonical Vitest pg mocked. No live DB/provider or external network.' }, null, 2) + '\n');
process.stdout.write(run.stdout + run.stderr + `\nSources unchanged during run: ${sourcesUnchangedDuringRun}\n`);
process.exit(run.status === 0 && sourcesUnchangedDuringRun ? 0 : 1);
