#!/usr/bin/env node
/** Pure independent evidence runner. No database, network or model calls. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const folder = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(folder, '../../../..');
const args = process.argv.slice(2);
if (!process.version.startsWith('v22.') || (args.length && (args.length !== 2 || args[0] !== '--label' || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(args[1])))) throw new Error('Use Node 22: node run-independent-core.mjs [--label final]');
const label = args[1] ?? 'final';
const config = 'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/independent-core-adversaries.config.mts';
const test = 'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/independent-core-adversaries.test.mts';
function tree(dir) { return readdirSync(path.join(repo, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? tree(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []); }
const files = [...new Set([
  'shared/ana/catalog-facts.ts', 'shared/ana/clinical-claims-vocabulary.ts', 'server/services/vault/document-catalog-core.ts',
  ...readdirSync(path.join(repo, 'server/services/vault')).filter(f => /^catalog-fact.*\.ts$/.test(f)).map(f => `server/services/vault/${f}`),
  'server/services/truth-engine/clinical-claims.ts', ...tree('server/services/truth-engine/clinical-claims'),
  config, test, 'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/INDEPENDENT_EXPECTATIONS.md',
])].sort();
const hash = v => createHash('sha256').update(v).digest('hex');
const snapshot = () => Object.fromEntries(files.map(f => [f, hash(readFileSync(path.join(repo, f)))]));
const before = snapshot(); const startedAt = new Date().toISOString();
const log = path.join(folder, `independent-core-${label}.log`); const fd = openSync(log, 'w', 0o600);
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', config];
const child = spawn(process.execPath, command, { cwd: repo, stdio: ['ignore', fd, fd] });
const result = await new Promise(resolve => { child.once('error', e => resolve({ exitCode: 1, error: e.code ?? 'RUNNER_ERROR' })); child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })); });
closeSync(fd);
const after = snapshot(); const changedSources = files.filter(f => before[f] !== after[f]);
const raw = readFileSync(log, 'utf8').replace(/\u001b\[[0-9;]*m/g, '');
const counts = raw.split('\n').find(l => /^\s*Tests\s/.test(l))?.trim() ?? 'No completed test count';
const qualified = result.exitCode === 0 && changedSources.length === 0 && /^Tests\s+37 passed \(37\)$/.test(counts);
const manifest = { runtime: process.version, baselineHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), command: ['node', ...command], startedAt, finishedAt: new Date().toISOString(), ...result, counts, qualified, proofScope: 'Pure held-out source/shape/written-value/context adversaries; canonical clinical extractor supplies transport frames in dedicated clinical adapter probes. No expert, scientific truth, provider, database or regulatory qualification.', before, after, sourcesUnchangedDuringRun: changedSources.length === 0, changedSources, logSha256: hash(readFileSync(log)) };
writeFileSync(path.join(folder, `independent-core-${label}-manifest.json`), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(JSON.stringify({ counts, qualified, changedSources, log: path.basename(log) }) + '\n');
process.exitCode = qualified ? 0 : result.exitCode === 0 ? 3 : result.exitCode ?? 1;
