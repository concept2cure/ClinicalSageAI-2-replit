/** Whole canonical TypeScript program; scoped source/config bindings retained. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const paths = [...JSON.parse(fs.readFileSync(path.join(folder, 'regression-paths.json'), 'utf8')),
  'client/src/concept2cure/v2/surfaces/BatchDraft.tsx', 'shared/ai/finish-reason.ts',
  'server/services/ana/batch-draft-result.ts', 'server/services/ana/AnaToolExecutor.ts',
  'server/services/ana/AnaDocumentDraftingService.ts', 'server/services/ai-gateway/finish-reason.ts',
  'tsconfig.json', 'package.json', 'package-lock.json', '.typecheck-baseline.json',
  'scripts/ci/typecheck-no-regression.mjs', 'scripts/ci/typecheck-memory-bounded.mjs',
  path.relative(root, fileURLToPath(import.meta.url))];
const sha = data => createHash('sha256').update(data).digest('hex');
const snapshot = () => Object.fromEntries(paths.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
const command = ['scripts/ci/typecheck-no-regression.mjs', '--incremental'];
const manifest = { node: process.version, command, startingHead: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'), startedAt: new Date().toISOString(), before: snapshot(),
  scope: 'Whole canonical tsconfig program via existing incremental no-regression gate. Bindings cover changed/scoped sources and configuration; this is not a runtime or agency qualification.' };
const log = path.join(folder, 'typecheck-final.txt');
const fd = fs.openSync(log, 'w');
const result = spawnSync(process.execPath, command, { cwd: root, stdio: ['ignore', fd, fd],
  env: { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH } });
fs.closeSync(fd);
manifest.finishedAt = new Date().toISOString();
manifest.exitCode = result.status ?? 1;
manifest.after = snapshot();
manifest.changedSources = paths.filter(name => manifest.before[name] !== manifest.after[name]);
manifest.sourcesUnchangedDuringRun = manifest.changedSources.length === 0;
manifest.logSha256 = sha(fs.readFileSync(log));
fs.writeFileSync(path.join(folder, 'typecheck-final-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ exitCode: manifest.exitCode, sourcesUnchangedDuringRun: manifest.sourcesUnchangedDuringRun }) + '\n');
process.exitCode = manifest.exitCode || (manifest.sourcesUnchangedDuringRun ? 0 : 1);
