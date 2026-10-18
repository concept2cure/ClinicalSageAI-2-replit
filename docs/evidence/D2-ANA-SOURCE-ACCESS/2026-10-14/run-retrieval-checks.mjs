import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidence = path.relative(root, path.dirname(fileURLToPath(import.meta.url)));
const targets = [
  "server/services/vault/vault-search.ts",
  "server/services/vault/document-catalog-search.ts",
  "server/services/vault/document-catalog-search-query.ts",
  "server/services/vault/vault-assistant-search.ts",
  "server/services/vault/document-passage-search.ts",
  "server/services/vault/retrieval-source-access.ts",
  "server/services/vault/vector-index-availability.ts",
  "server/services/advancedRAGPipeline.ts",
  "server/services/ragRouter.ts",
  "server/services/rag-filters.ts",
  "server/services/vault/__tests__/retrieval-actor-filter.test.ts",
  "server/services/vault/__tests__/retrieval-actor-revalidation.test.ts",
  "server/services/vault/__tests__/vault-search-paging.pglite.integration.test.ts",
  "server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts",
  "server/services/__tests__/rag-actor-programme-scope.test.ts"
];
const tests = [
  "server/services/vault/__tests__/retrieval-actor-filter.test.ts",
  "server/services/vault/__tests__/retrieval-actor-revalidation.test.ts",
  "server/services/vault/__tests__/vault-search.test.ts",
  "server/services/vault/__tests__/vault-search-paging.pglite.integration.test.ts",
  "server/services/vault/__tests__/catalog-search-version.test.ts",
  "server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts",
  "server/services/__tests__/rag-actor-programme-scope.test.ts",
  "server/services/__tests__/rag-vault-tenant-scope.test.ts",
  "server/services/__tests__/rag-filters.test.ts",
  "server/services/__tests__/ragRouter.test.ts",
  "server/services/__tests__/advancedRAGPipeline-cache.test.ts",
  "server/services/__tests__/advancedRAGPipeline-mmr.test.ts"
];
const jobs = [
  { args: ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--reporter=json', `--outputFile=${evidence}/retrieval-regression-final.json`], log: 'retrieval-regression-command.txt' },
  { args: ['node_modules/eslint/bin/eslint.js', ...targets, '--format=json'], log: 'retrieval-eslint.json' },
  { args: ['docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/owned-target-typecheck.cjs', ...targets], log: 'retrieval-target-typecheck.txt' },
];
const results = jobs.map(job => {
  const result = spawnSync(process.execPath, job.args, { cwd: root, encoding: 'utf8', maxBuffer: 8_000_000 });
  writeFileSync(path.join(root, evidence, job.log), result.stdout + (result.stderr || ''));
  return { command: [process.execPath, ...job.args], exitCode: result.status };
});
writeFileSync(path.join(root, evidence, 'retrieval-check-commands.json'), JSON.stringify({ node: process.version, results }, null, 2) + '\n');
writeFileSync(path.join(root, evidence, 'retrieval-source-manifest.json'), JSON.stringify({ baseline: '87b27c897c5d1be20b0527009bcaf425ebbf3af6', files: targets.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') })) }, null, 2) + '\n');
process.stdout.write(JSON.stringify(results.map(result => ({ command: result.command[1], exitCode: result.exitCode }))) + '\n');
process.exitCode = results.every(result => result.exitCode === 0) ? 0 : 1;
