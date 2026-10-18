/** Focused cross-increment regression. It uses no arbitrary database endpoint. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const scientific = JSON.parse(fs.readFileSync(path.join(folder, 'scientific-test-manifest.json'), 'utf8')).paths;
const recovery = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/final-test-manifest.json'), 'utf8')).paths;
const validation = [
  'server/services/ectd/external-validator/__tests__/external-validator.test.ts',
  'server/services/ectd/external-validator/__tests__/external-validator-classification.test.ts',
  'server/services/ectd/external-validator/__tests__/lorenz-adapter.test.ts',
  'server/services/ectd/external-validator/__tests__/fda-criteria-adapter.test.ts',
  'server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts',
  'server/services/ectd/__tests__/assess-dispatch-readiness.gates.test.ts',
  'server/services/ectd/__tests__/dispatch-gate.test.ts',
  'server/services/submission-ai/__tests__/dispatch-qc-deterministic.test.ts',
  'client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx',
  'client/src/concept2cure/v2/__tests__/dispatchReadinessNamedRules.test.tsx',
  'client/src/concept2cure/v2/__tests__/dispatchReadinessServerGate.test.tsx',
  'client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx',
  'client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx',
  'server/services/submission-gateways/__tests__/pre-transmit-check.test.ts',
  'server/mcp/__tests__/mcp-validation-adapter-metadata.test.ts',
];
const storage = fs.readdirSync(path.join(root, 'server/services/storage/__tests__')).filter(name => /\.test\.ts$/.test(name)).map(name => `server/services/storage/__tests__/${name}`);
const paths = [...new Set([...scientific, ...recovery, ...validation, ...storage, 'server/routes/__tests__/ivdr-pack-download-integrity.test.ts'])].sort();
for (const name of paths) if (!fs.existsSync(path.join(root, name))) throw new Error(`Missing focused test: ${name}`);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const roots = ['server/', 'client/', 'shared/', 'scripts/', 'tests/db/'];
const changed = git('diff', '--name-only', '--', ...roots);
const untracked = git('ls-files', '--others', '--exclude-standard').filter(name => roots.some(prefix => name.startsWith(prefix)));
const sources = [...new Set([...changed, ...untracked, ...paths])].sort();
const digest = filename => createHash('sha256').update(fs.readFileSync(path.join(root, filename))).digest('hex');
const hashes = () => Object.fromEntries(sources.map(name => [name, digest(name)]));
const manifest = { runtime: process.version, branch: git('branch', '--show-current')[0], baseline: git('rev-parse', 'HEAD')[0],
  paths, startHashes: hashes(), startedAt: new Date().toISOString(),
  limits: 'Focused synthetic fixtures, mocks and embedded PGlite; genuine PostgreSQL has a separate owned fixture. Not a full application/deployment qualification.' };
const log = path.join(folder, 'FINAL_REGRESSION.txt');
const fd = fs.openSync(log, 'w');
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...paths], {
  cwd: root, stdio: ['ignore', fd, fd], env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
});
fs.closeSync(fd);
manifest.finishedAt = new Date().toISOString(); manifest.exitCode = result.status ?? 1;
manifest.finalHashes = hashes();
manifest.sourcesUnchangedDuringRun = sources.every(name => manifest.startHashes[name] === manifest.finalHashes[name]);
const output = fs.readFileSync(log, 'utf8').replace(new RegExp(String.fromCharCode(27)+'\\[[0-9;]*m','g'), '');
manifest.resultSummary = output.split('\n').filter(line => /^\s*(Test Files|Tests|Duration)\s/.test(line));
manifest.logSha256 = createHash('sha256').update(fs.readFileSync(log)).digest('hex');
fs.writeFileSync(path.join(folder, 'final-regression-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.info(JSON.stringify({ exitCode: manifest.exitCode, sourcesUnchangedDuringRun: manifest.sourcesUnchangedDuringRun, resultSummary: manifest.resultSummary }));
process.exitCode = manifest.exitCode || (manifest.sourcesUnchangedDuringRun ? 0 : 1);
