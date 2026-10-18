/** Focused current-source qualification; no live database or provider endpoints. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const baseline = '990a687c6eb31adb1becfa58d91fc9d2932f23ed';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const paths = JSON.parse(fs.readFileSync(path.join(folder, 'regression-paths.json'), 'utf8'));
for (const name of paths) if (!fs.existsSync(path.join(root, name))) throw new Error(`Missing test: ${name}`);
const codeRoots = ['server/', 'client/', 'shared/', 'scripts/', 'migrations/', 'tests/'];
const changed = git('diff', '--name-only', '--diff-filter=ACMRT', baseline, '--', ...codeRoots).trim().split('\n').filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...codeRoots).trim().split('\n').filter(Boolean);
const dependencies = [
  'server/services/authoring/authoring-export.ts',
  'server/services/authoring/authoring-documents.ts',
  'server/services/authoring/authoring-program-access.ts',
  'server/services/authoring/draft-figure-check.ts',
  'server/services/authoring/section-claims-check.ts',
  'server/services/vault/document-catalog-actor-reads.ts',
  'server/services/vault/document-catalog.service.ts',
  'server/services/ana/source-read-scope.ts',
  'server/services/ana/project-scope-admission.ts',
  'server/services/ana/catalog-scope.ts',
  'server/services/ana/batch-draft-result.ts',
  'server/services/ana/AnaDocumentDraftingService.ts',
  'server/services/document-data-disposition/program-lock.ts',
  path.relative(root, fileURLToPath(import.meta.url)),
  path.relative(root, path.join(folder, 'regression-paths.json')),
];
const sources = [...new Set([...paths, ...changed, ...untracked, ...dependencies])].sort();
const digest = name => createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
const snapshot = () => Object.fromEntries(sources.map(name => [name, digest(name)]));
const manifest = {
  runtime: process.version, baseline, startingHead: git('rev-parse', 'HEAD').trim(),
  branch: git('branch', '--show-current').trim(), paths, startedAt: new Date().toISOString(), before: snapshot(),
  scope: 'Selected-source drafting, tool/HTTP save, source-linked rendering, lineage, current-access and canonical integration regressions. Synthetic fixtures, mocks and embedded PGlite; native PostgreSQL is qualified separately. Not a full deployment or provider/agency qualification.',
};
const log = path.join(folder, 'regression-final.txt');
const fd = fs.openSync(log, 'w');
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...paths], {
  cwd: root, stdio: ['ignore', fd, fd], env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
});
fs.closeSync(fd);
manifest.finishedAt = new Date().toISOString();
manifest.exitCode = result.status ?? 1;
manifest.after = snapshot();
manifest.changedSources = sources.filter(name => manifest.before[name] !== manifest.after[name]);
manifest.sourcesUnchangedDuringRun = manifest.changedSources.length === 0;
const output = fs.readFileSync(log, 'utf8').replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');
manifest.resultSummary = output.split('\n').filter(line => /^\s*(Test Files|Tests|Duration)\s/.test(line));
manifest.logSha256 = createHash('sha256').update(fs.readFileSync(log)).digest('hex');
fs.writeFileSync(path.join(folder, 'regression-final-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ exitCode: manifest.exitCode, sourcesUnchangedDuringRun: manifest.sourcesUnchangedDuringRun,
  resultSummary: manifest.resultSummary, changedSources: manifest.changedSources }) + '\n');
process.exitCode = manifest.exitCode || (manifest.sourcesUnchangedDuringRun ? 0 : 1);
