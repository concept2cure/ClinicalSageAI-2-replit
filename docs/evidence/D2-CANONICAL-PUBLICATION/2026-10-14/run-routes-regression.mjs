/** Synthetic route integration: no deployment or live model/provider calls. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const tests = [
  'server/routes/ana-ri/__tests__/stream-project-private-access.pglite.test.ts',
  'server/routes/chat/__tests__/send-message-private-project.test.ts',
  'server/routes/ana-ri/__tests__/stream-read-delivery.test.ts',
  'server/routes/c2c/__tests__/vault-catalog-source-review.test.ts',
  'server/routes/c2c/__tests__/project-vault-parent-access.pglite.integration.test.ts',
  'server/routes/c2c/__tests__/project-vault-search-tenant-scope.test.ts',
  'server/services/ana/__tests__/read-delivery-executor.test.ts',
  'server/routes/c2c/__tests__/projects-sources-processing.test.ts',
];
const sources = [
  'server/routes/c2c/project-vault.ts',
  'server/routes/c2c/projects.ts',
  'server/routes/ana-ri/stream.ts',
  'server/routes/chat/send-message.ts',
  'server/services/ana/AnaToolExecutor.ts',
  'server/routes/c2c/project-route-access.ts',
  'server/services/ana/catalog-scope.ts',
  'server/services/ana/document-catalog-tools.ts',
  'server/services/ana/read-receipts.ts',
  'server/services/ana/source-read-receipt.ts',
  'server/services/ana/source-context-admission.ts',
  'server/services/ana/step-presentation.ts',
  'server/services/ana-session-bootstrap.ts',
  'server/services/vault/vault-search.ts',
  'server/services/c2c/current-program-access.ts',
  'server/services/vault/document-catalog.service.ts',
  'server/services/vault/document-catalog-governance.service.ts',
  'server/services/clinical-regulatory-evidence/evidence-spine.service.ts',
  'server/services/ana/__tests__/support/read-delivery-vault.ts',
  'server/services/ana/__tests__/support/source-read-tool-fixture.ts',
];
const selected = [...new Set([...sources, ...tests])].sort();
const bindings = () => Object.fromEntries(selected.map(file => [file,
  createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
]));
const before = bindings();
const startedAt = new Date().toISOString();
const log = path.join(folder, 'routes-focused-final.log');
const fd = fs.openSync(log, 'w');
let result;
try {
  result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--reporter=verbose'],
    { cwd: root, env: { ...process.env, SKIP_DB_STARTUP_TEST: 'true' }, stdio: ['ignore', fd, fd] });
} finally { fs.closeSync(fd); }
const after = bindings();
const changed = selected.filter(file => before[file] !== after[file]);
const record = {
  scope: 'selected route, host handoff, and synthetic fixture integration',
  limitation: 'Selected source bindings, not an exhaustive imported graph; whole integration proof is lead-owned. PGlite is not a PostgreSQL runtime-role qualification.',
  startedAt, finishedAt: new Date().toISOString(), node: process.version,
  tests, before, after, changed, exitCode: result.status, signal: result.signal,
  passed: result.status === 0 && changed.length === 0,
};
fs.writeFileSync(path.join(folder, 'routes-focused-final.json'), JSON.stringify(record, null, 2) + '\n');
console.info(JSON.stringify({ tests: tests.length, bindings: selected.length, changed, exitCode: result.status, passed: record.passed }));
process.exitCode = record.passed ? 0 : 1;
