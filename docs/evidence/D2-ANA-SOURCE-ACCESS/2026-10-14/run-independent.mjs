#!/usr/bin/env node
/** Independent held-out source access run with source-hash stability. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const folder = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(folder, '../../../..');
const label = process.argv[2] ?? 'review';
if (!process.version.startsWith('v22.') || !/^[a-z0-9-]{1,40}$/.test(label) || process.argv.length > 3) throw new Error('Use Node 22: node run-independent.mjs [safe-label]');
const config = 'docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/independent.config.mts';
const sourceFiles = [...new Set(['server/services/ana/source-read-scope.ts', 'server/services/ana/project-scope-admission.ts',
  'server/services/report-os/project-access.ts', 'server/services/project-sharing-access.ts', 'server/services/c2c/program-project-anchor.ts',
  'server/services/ana/catalog-scope.ts', 'server/services/ana/document-catalog-tools.ts', 'server/services/ana/document-tools-shared.ts',
  'server/services/ana/document-passage-tools.ts', 'server/services/ana/draft-project-sources.ts',
  'server/services/ana/read-receipts.ts', 'server/services/vault/document-catalog.service.ts',
  'server/services/ana/source-read-receipt.ts',
  'server/services/vault/document-catalog-actor-access.ts', 'server/services/vault/document-catalog-actor-reads.ts',
  'server/services/vault/document-catalog-actor-captures.ts', 'server/services/ana-session-bootstrap.ts',
  'server/services/vault/vault-search.ts', 'server/services/vault/vault-assistant-search.ts',
  'server/services/vault/document-catalog-search.ts', 'server/services/vault/document-catalog-search-query.ts',
  'server/services/vault/document-passage-search.ts', 'server/services/vault/retrieval-source-access.ts',
  'server/services/vault/vector-index-availability.ts', 'server/services/advancedRAGPipeline.ts', 'server/services/ragRouter.ts',
  'server/services/vault/document-catalog-admission.ts', 'server/services/vault/document-catalog-source-scope.ts',
  'server/services/vault/document-catalog-eligibility.ts', 'server/services/vault/document-catalog-core.ts',
  'server/services/vault/vault-version-family.ts', 'server/services/ana/source-context-admission.ts',
  'server/services/ana/uploaded-file-access.ts', 'server/services/ana/agentic-loop.ts',
  'server/services/document-data-disposition/eligibility.ts', 'server/services/document-data-disposition/program-lock.ts',
  'server/services/c2c/program-access.ts', 'server/lib/project-id.ts',
  'server/services/tenant/governed-tenant-context.ts', 'server/db/tenantStore.ts', 'server/db/sessionScope.ts',
  'server/services/ana-session-bootstrap-format.ts', 'server/services/ana/AnaToolExecutor.ts',
  'server/routes/chat/send-message.ts', 'server/routes/ana-ri/stream.ts',
  ...readdirSync(folder).filter(f => /^independent-.*\.test\.mts$/.test(f)).map(f => path.relative(repo, path.join(folder, f))),
  'docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/run-independent.mjs', config])].sort();
const hash = v => createHash('sha256').update(v).digest('hex');
const snapshot = () => Object.fromEntries(sourceFiles.map(f => [f, hash(readFileSync(path.join(repo, f)))]));
const before = snapshot();
const startedAt = new Date().toISOString();
const log = path.join(folder, `independent-${label}.log`);
const fd = openSync(log, 'w', 0o600);
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', config];
const child = spawn(process.execPath, command, { cwd: repo, stdio: ['ignore', fd, fd] });
const result = await new Promise(resolve => { child.once('error', e => resolve({ exitCode: 1, error: e.code ?? 'RUNNER_ERROR' })); child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })); });
closeSync(fd);
const after = snapshot();
const changedSources = sourceFiles.filter(f => before[f] !== after[f]);
const counts = readFileSync(log, 'utf8').replace(new RegExp(String.fromCharCode(27)+'\\[[0-9;]*m','g'), '').split('\n').find(l => /^\s*Tests\s/.test(l))?.trim() ?? 'No completed test count';
const qualified = result.exitCode === 0 && changedSources.length === 0 && /^Tests\s+\d+ passed \(\d+\)$/.test(counts);
writeFileSync(path.join(folder, `independent-${label}-manifest.json`), JSON.stringify({ runtime: process.version,
  baselineHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), command: ['node', ...command],
  startedAt, finishedAt: new Date().toISOString(), ...result, counts, qualified, before, after,
  proofScope: 'Held-out actual canonical authority SQL in sequential PGlite, actual registered handlers with controlled service seams, exact receipt and actual serving-source checks. Does not qualify PostgreSQL concurrency, deployed RLS or provider acknowledgements; those database observations are separate.',
  sourcesUnchangedDuringRun: changedSources.length === 0, changedSources, logSha256: hash(readFileSync(log)) }, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(JSON.stringify({ counts, qualified, changedSources, log: path.basename(log) }) + '\n');
process.exitCode = qualified ? 0 : result.exitCode === 0 ? 3 : result.exitCode ?? 1;
