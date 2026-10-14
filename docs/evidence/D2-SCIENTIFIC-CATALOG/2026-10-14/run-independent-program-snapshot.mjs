#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const folder = fileURLToPath(new URL('.', import.meta.url)); const repo = path.resolve(folder, '../../../..');
const args = process.argv.slice(2);
if (!process.version.startsWith('v22.') || (args.length && (args.length !== 2 || args[0] !== '--label' || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(args[1])))) throw new Error('Use Node 22: node run-independent-program-snapshot.mjs [--label final]');
const label = args[1] ?? 'final';
const config = 'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/independent-program-snapshot.config.mts';
const files = ['server/services/ana/document-catalog-tools.ts', 'server/services/ana/document-catalog-input.ts',
  'server/services/ana/document-tools-shared.ts', 'server/services/ana/catalog-scope.ts',
  'server/services/vault/document-catalog.service.ts', 'server/services/vault/document-catalog-core.ts',
  'server/services/vault/document-catalog-eligibility.ts', 'server/services/vault/vault-write-authority.ts',
  'shared/ana/catalog-facts.ts', config, 'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/independent-program-snapshot.test.mts'];
const hash = v => createHash('sha256').update(v).digest('hex');
const snapshot = () => Object.fromEntries(files.map(f => [f, hash(readFileSync(path.join(repo, f)))]));
const before = snapshot(); const startedAt = new Date().toISOString(); const log = path.join(folder, `independent-program-snapshot-${label}.log`); const fd = openSync(log, 'w', 0o600);
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', config];
const child = spawn(process.execPath, command, { cwd: repo, stdio: ['ignore', fd, fd] });
const result = await new Promise(resolve => { child.once('error', e => resolve({ exitCode: 1, error: e.code ?? 'RUNNER_ERROR' })); child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })); });
closeSync(fd); const after = snapshot(); const changedSources = files.filter(f => before[f] !== after[f]);
const counts = readFileSync(log, 'utf8').replace(new RegExp(String.fromCharCode(27)+'\\[[0-9;]*m','g'), '').split('\n').find(l => /^\s*Tests\s/.test(l))?.trim() ?? 'No completed test count';
const qualified = result.exitCode === 0 && changedSources.length === 0 && /^Tests\s+3 passed \(3\)$/.test(counts);
writeFileSync(path.join(folder, `independent-program-snapshot-${label}-manifest.json`), JSON.stringify({ runtime: process.version,
  baselineHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), command: ['node', ...command], startedAt,
  finishedAt: new Date().toISOString(), ...result, counts, qualified, before, after,
  proofScope: 'Actual registered catalog handler plus actual completeCatalog lexical source loader and handoff; controlled SQL-visible source rows, membership/open-program, embedding and final writer seams. Separate PostgreSQL cases exercise the actual final writer source move refusal. No deployed authority/provider qualification.',
  sourcesUnchangedDuringRun: changedSources.length === 0, changedSources, logSha256: hash(readFileSync(log)) }, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(JSON.stringify({ counts, qualified, changedSources, log: path.basename(log) }) + '\n');
process.exitCode = qualified ? 0 : result.exitCode === 0 ? 3 : result.exitCode ?? 1;
