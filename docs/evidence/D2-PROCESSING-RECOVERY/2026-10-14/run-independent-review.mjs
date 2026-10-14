#!/usr/bin/env node
/** Portable evidence runner. No database endpoint, external API or application
 * mutation. Writes only its named evidence artifacts and invokes the opt-in
 * PGlite tests; records source hashes before/after to detect concurrent edits. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const evidence = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(evidence, '../../../..');
const args = process.argv.slice(2);
if (!process.version.startsWith('v22.') || (args.length !== 0 && (args.length !== 2 || args[0] !== '--label' || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(args[1])))) {
  process.stderr.write('Use Node 22: node run-independent-review.mjs [--label final]\n');
  process.exit(2);
}
const label = args[1] ?? 'final';
const relativeConfig = 'docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/independent-adversaries.config.mts';
const files = [
  'server/services/clinical-regulatory-evidence/data-room-processing.ts',
  'server/services/clinical-regulatory-evidence/data-room-processing-state.ts',
  'server/services/clinical-regulatory-evidence/data-room-processing-store.ts',
  'server/services/clinical-regulatory-evidence/data-room-processing-sweep.ts',
  'server/services/clinical-regulatory-evidence/data-room-processing-read.ts',
  'server/services/clinical-regulatory-evidence/source-version.ts',
  'server/services/clinical-regulatory-evidence/catalog-facts.ts',
  'shared/data-room-processing-status.ts',
  'shared/canonical-json.ts',
  'server/services/document-data-disposition/service.ts',
  'server/services/document-data-disposition/impact.ts',
  'server/services/document-data-disposition/derived-impact.ts',
  'server/services/document-data-disposition/eligibility.ts',
  'server/services/document-data-disposition/recorded-lineage.ts',
  'server/services/document-data-disposition/program-lock.ts',
  'server/services/document-data-disposition/__tests__/disposition-fixture.ts',
  'migrations/20261006_document_data_dispositions.sql',
  'migrations/20261008e_document_catalog_attribution.sql',
  'migrations/20260906_vault_documents_fulltext.sql',
  'migrations/20261008c_data_room_source_text.sql',
  'migrations/20261001_cre_evidence_sources_capture_immutability.sql',
  'docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/independent-adversaries.test.mts',
  relativeConfig,
];
const hash = value => createHash('sha256').update(value).digest('hex');
const snapshot = () => Object.fromEntries(files.map(file => [file, hash(readFileSync(path.join(repo, file)))]));
const startedAt = new Date().toISOString();
const before = snapshot();
const logPath = path.join(evidence, `independent-adversaries-${label}.log`);
const descriptor = openSync(logPath, 'w', 0o600);
const commandArgs = ['node_modules/vitest/vitest.mjs', 'run', '--config', relativeConfig];
const child = spawn(process.execPath, commandArgs, { cwd: repo, stdio: ['ignore', descriptor, descriptor] });
const result = await new Promise(resolve => {
  child.once('error', error => resolve({ exitCode: 1, signal: null, error: error.code ?? 'RUNNER_ERROR' }));
  child.once('exit', (code, signal) => resolve({ exitCode: code, signal }));
});
closeSync(descriptor);
const after = snapshot();
const changedSources = files.filter(file => before[file] !== after[file]);
const rawLog = readFileSync(logPath, 'utf8').replace(new RegExp(String.fromCharCode(27)+'\\[[0-9;]*m','g'), '');
const counts = rawLog.split('\n').find(line => /^\s*Tests\s/.test(line))?.trim() ?? 'No completed test count';
const qualified = result.exitCode === 0 && changedSources.length === 0 && /^Tests\s+16 passed \(16\)$/.test(counts);
const manifest = {
  runtime: process.version,
  baselineHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  command: ['node', ...commandArgs],
  startedAt, finishedAt: new Date().toISOString(), ...result, counts,
  sourcesUnchangedDuringRun: changedSources.length === 0, changedSources, qualified,
  proofScope: 'Actual core SQL and selected canonical migrations on PGlite; controlled sequential state changes/interleavings. Extractor, original loader, profile, classifier controlled; no real-session/runtimerole/RLS/OCR/filesystem/deployed proof.',
  fixtureLimits: 'Ancestor terminal receipt is inserted through actual migration guard for consumer eligibility; it does not prove interactive approval despite eligible descendants. Withdrawal service keep_data is actual canonical service with synthetic audit seal.',
  before, after, logSha256: hash(readFileSync(logPath)),
};
writeFileSync(path.join(evidence, `independent-adversaries-${label}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ counts, qualified, changedSources, log: path.basename(logPath) })}\n`);
process.exitCode = qualified ? 0 : result.exitCode === 0 ? 3 : result.exitCode ?? 1;
