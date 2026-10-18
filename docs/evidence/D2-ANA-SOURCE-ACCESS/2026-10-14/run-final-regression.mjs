/** Focused cross-increment regression. It uses no arbitrary database endpoint. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const paths = [
  "client/src/concept2cure/v2/__tests__/dispatchReadinessNamedRules.test.tsx",
  "client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx",
  "client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx",
  "client/src/concept2cure/v2/__tests__/dispatchReadinessServerGate.test.tsx",
  "client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx",
  "client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx",
  "client/src/concept2cure/v2/__tests__/vaultCatalogRecord.test.tsx",
  "client/src/concept2cure/v2/__tests__/vaultDataRoomCounts.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/citationAdmission.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/dataRoomSourceReads.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/editorSourceLibraries.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/projectSourceCatalog.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/sourceUiRules.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/vaultCitationConfirmation.test.tsx",
  "client/src/concept2cure/v2/editor/__tests__/workbenchCitationCatalog.test.tsx",
  "server/mcp/__tests__/mcp-validation-adapter-metadata.test.ts",
  "server/routes/__tests__/chat-upload-durability.test.ts",
  "server/routes/__tests__/chat-upload-safety.test.ts",
  "server/routes/__tests__/ivdr-pack-download-integrity.test.ts",
  "server/routes/__tests__/vault-data-room-counts.test.ts",
  "server/routes/ana-ri/__tests__/stream-disconnect.test.ts",
  "server/routes/ana-ri/__tests__/stream-project-anchor.test.ts",
  "server/routes/ana-ri/__tests__/stream-project-private-access.pglite.test.ts",
  "server/routes/ana-ri/__tests__/stream-read-delivery.test.ts",
  "server/routes/ana-ri/__tests__/stream-step-presentation.test.ts",
  "server/routes/c2c/__tests__/projects-adoption-sql.test.ts",
  "server/routes/c2c/__tests__/projects-adoption.test.ts",
  "server/routes/c2c/__tests__/projects-sources-processing.test.ts",
  "server/routes/c2c/__tests__/projects-sources-window.test.ts",
  "server/routes/c2c/__tests__/vault-catalog-source-review.test.ts",
  "server/routes/chat/__tests__/send-message-private-project.test.ts",
  "server/services/__tests__/advancedRAGPipeline-cache.test.ts",
  "server/services/__tests__/advancedRAGPipeline-mmr.test.ts",
  "server/services/__tests__/ana-session-bootstrap-latency.test.ts",
  "server/services/__tests__/ana-session-bootstrap.test.ts",
  "server/services/__tests__/rag-actor-programme-scope.test.ts",
  "server/services/__tests__/rag-filters.test.ts",
  "server/services/__tests__/rag-vault-tenant-scope.test.ts",
  "server/services/__tests__/ragRouter.test.ts",
  "server/services/ana/__tests__/batch-draft-sections.test.ts",
  "server/services/ana/__tests__/catalog-gated-tools.test.ts",
  "server/services/ana/__tests__/derived-spreadsheet-capture.test.ts",
  "server/services/ana/__tests__/derived-spreadsheet-sql.test.ts",
  "server/services/ana/__tests__/document-catalog-preview-tools.test.ts",
  "server/services/ana/__tests__/document-catalog-program-binding.test.ts",
  "server/services/ana/__tests__/document-catalog-safe-errors.test.ts",
  "server/services/ana/__tests__/document-catalog-tools-id-space.test.ts",
  "server/services/ana/__tests__/document-catalog-tools-project-scope.test.ts",
  "server/services/ana/__tests__/document-passage-tools.test.ts",
  "server/services/ana/__tests__/document-placement-tools.test.ts",
  "server/services/ana/__tests__/document-source-access-tools.test.ts",
  "server/services/ana/__tests__/document-source-facade-integration.test.ts",
  "server/services/ana/__tests__/draft-project-sources.test.ts",
  "server/services/ana/__tests__/edit-spreadsheet-provenance.test.ts",
  "server/services/ana/__tests__/project-scope-admission.pglite.test.ts",
  "server/services/ana/__tests__/read-delivery-executor.test.ts",
  "server/services/ana/__tests__/read-receipt-snapshots.test.ts",
  "server/services/ana/__tests__/read-receipts.test.ts",
  "server/services/ana/__tests__/source-context-admission.pglite.test.ts",
  "server/services/ana/__tests__/source-read-scope.pglite.test.ts",
  "server/services/ana/__tests__/step-document-titles.pglite.test.ts",
  "server/services/ana/__tests__/tool-registry-consistency.test.ts",
  "server/services/ana/__tests__/unbound-chat-source-access.pglite.test.ts",
  "server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts",
  "server/services/ana/__tests__/vault-access-without-key.test.ts",
  "server/services/clinical-regulatory-evidence/__tests__/data-room-processing-recovery.pglite.integration.test.ts",
  "server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts",
  "server/services/clinical-regulatory-evidence/__tests__/source-processing-read-model.test.ts",
  "server/services/document-data-disposition/__tests__/artifact-freeze.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/citation-writes.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/confirmation-freshness.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/consumers.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/derived-impact.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/eligibility.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/eligibility.test.ts",
  "server/services/document-data-disposition/__tests__/lineage-downstream.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/program-lock.test.ts",
  "server/services/document-data-disposition/__tests__/recorded-lineage.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/route-auth.test.ts",
  "server/services/document-data-disposition/__tests__/runtime-role.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/saved-draft-impact.pglite.integration.test.ts",
  "server/services/document-data-disposition/__tests__/service.pglite.integration.test.ts",
  "server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts",
  "server/services/ectd/__tests__/assess-dispatch-readiness.gates.test.ts",
  "server/services/ectd/__tests__/dispatch-gate.test.ts",
  "server/services/ectd/external-validator/__tests__/external-validator-classification.test.ts",
  "server/services/ectd/external-validator/__tests__/external-validator.test.ts",
  "server/services/ectd/external-validator/__tests__/fda-criteria-adapter.test.ts",
  "server/services/ectd/external-validator/__tests__/lorenz-adapter.test.ts",
  "server/services/storage/__tests__/s3-provider-lookup.test.ts",
  "server/services/storage/__tests__/storage-posture.test.ts",
  "server/services/storage/__tests__/storage-provider-production-bundle.test.ts",
  "server/services/storage/__tests__/storage-read-integrity.test.ts",
  "server/services/storage/__tests__/storage-tenant-isolation.test.ts",
  "server/services/submission-ai/__tests__/dispatch-qc-deterministic.test.ts",
  "server/services/submission-gateways/__tests__/pre-transmit-check.test.ts",
  "server/services/truth-engine/__tests__/clinical-claims.test.ts",
  "server/services/vault/__tests__/catalog-actor-capture-discovery.test.ts",
  "server/services/vault/__tests__/catalog-actor-read-facades.test.ts",
  "server/services/vault/__tests__/catalog-actor-scope-wrapper.test.ts",
  "server/services/vault/__tests__/catalog-fact-verification.test.ts",
  "server/services/vault/__tests__/catalog-governance-integrity.test.ts",
  "server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts",
  "server/services/vault/__tests__/catalog-search-version.test.ts",
  "server/services/vault/__tests__/catalog-write-result.test.ts",
  "server/services/vault/__tests__/document-catalog-actor-access.test.ts",
  "server/services/vault/__tests__/document-catalog-discovery-scope.test.ts",
  "server/services/vault/__tests__/document-catalog-key-data.test.ts",
  "server/services/vault/__tests__/document-catalog-preview.service.test.ts",
  "server/services/vault/__tests__/document-catalog-source-snapshot.test.ts",
  "server/services/vault/__tests__/document-catalog.service.test.ts",
  "server/services/vault/__tests__/retrieval-actor-filter.test.ts",
  "server/services/vault/__tests__/retrieval-actor-revalidation.test.ts",
  "server/services/vault/__tests__/scientific-source-facts-heldout.test.ts",
  "server/services/vault/__tests__/scientific-source-facts.test.ts",
  "server/services/vault/__tests__/vault-search-paging.pglite.integration.test.ts",
  "server/services/vault/__tests__/vault-search.test.ts",
  "server/startup/__tests__/document-catalog-bootstrap.test.ts",
  "tests/schema-contract/document-catalog-migration.contract.test.ts"
];
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
