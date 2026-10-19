/** Local synthetic corpus only: no database, provider, application write or scheduler. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const evidence = fileURLToPath(new URL('./', import.meta.url));
const testFiles = [
  'server/services/vault/__tests__/scientific-source-facts.test.ts',
  'server/services/vault/__tests__/scientific-source-facts-heldout.test.ts',
];
const sourceFiles = [
  'shared/ana/catalog-facts.ts',
  'shared/ana/clinical-claims-vocabulary.ts',
  'server/services/vault/document-catalog-core.ts',
  'server/services/vault/catalog-fact-verification.ts',
  'server/services/truth-engine/clinical-claims.ts',
  ...readdirSync(join(root, 'server/services/truth-engine/clinical-claims')).filter((name) => name.endsWith('.ts')).map((name) => `server/services/truth-engine/clinical-claims/${name}`),
  'server/services/vault/__tests__/fixtures/scientific-source-facts.ts',
  'server/services/vault/__tests__/fixtures/scientific-source-facts-heldout.ts',
  ...testFiles,
].sort();
function manifest() {
  return sourceFiles.map((path) => {
    const data = readFileSync(join(root, path));
    return { path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  });
}

if (!/^v22\./.test(process.version)) throw new Error('Run this evidence harness with supported Node 22.');
const before = manifest();
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...testFiles, '--config', 'vitest.config.ts'], { cwd: root, encoding: 'utf8', env: process.env });
writeFileSync(join(evidence, 'scientific-fixtures-final.log'), (result.stdout ?? '') + (result.stderr ?? ''));
const after = manifest();
const stable = JSON.stringify(before) === JSON.stringify(after);
const status = result.error ? 'runner_error' : result.status === 0 && stable ? 'passed' : stable ? 'failed' : 'source_changed_during_run';
writeFileSync(join(evidence, 'scientific-fixtures-source-manifest.json'), JSON.stringify({
  schemaVersion: 1, runtime: process.version, scope: 'synthetic_source_statement_preview_only',
  startedAt, finishedAt: new Date().toISOString(), expectedRequests: { primary: 47, heldOut: 23, total: 70 },
  status, exitCode: result.status, sourceStableDuringRun: stable, files: before,
  ...(stable ? {} : { filesAfterRun: after }),
}, null, 2) + '\n');
process.stdout.write(JSON.stringify({ status, exitCode: result.status, sourceStableDuringRun: stable, requests: 70, manifest: relative(root, join(evidence, 'scientific-fixtures-source-manifest.json')) }) + '\n');
process.exitCode = status === 'passed' ? 0 : 1;
