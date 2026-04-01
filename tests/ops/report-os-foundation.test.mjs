import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync('server/routes/report-os.ts', 'utf8');
const schemaSource = readFileSync('shared/schema/report-os.ts', 'utf8');
const migrationSource = readFileSync('migrations/0014_report_os_foundation.sql', 'utf8');
const progressSource = readFileSync('docs/reports/REPORT_OS_SESSION_PROGRESS_2026-03-30.md', 'utf8');
const orchestratorSource = readFileSync('server/services/report-os/orchestrator.ts', 'utf8');

test('report-os route guards taxonomy seed and supports dependency endpoint', () => {
  assert.ok(routeSource.includes('canSeedTaxonomy'));
  assert.ok(routeSource.includes("router.post('/taxonomy/seed'"));
  assert.ok(routeSource.includes("router.get('/runs/:id/dependencies'"));
  assert.ok(routeSource.includes("router.get('/health'"));
});

test('report-os route includes reporting bundle and delivery endpoints', () => {
  assert.ok(routeSource.includes("router.get('/runs/:id/export.pdf'"));
  assert.ok(routeSource.includes("router.post('/bundles'"));
  assert.ok(routeSource.includes("router.get('/bundles/:bundleId/export.pdf'"));
  assert.ok(routeSource.includes("router.post('/deliveries'"));
  assert.ok(routeSource.includes("router.post('/correspondence/capture'"));
});

test('report-os schema includes normalized dependency table', () => {
  assert.ok(schemaSource.includes('export const reportRunDependencies = pgTable('));
  assert.ok(schemaSource.includes("'report_run_dependencies'"));
});

test('report-os migration includes dependency table and indexes', () => {
  assert.ok(migrationSource.includes('CREATE TABLE IF NOT EXISTS report_run_dependencies'));
  assert.ok(migrationSource.includes('report_run_dependencies_run_idx'));
  assert.ok(migrationSource.includes('report_run_dependencies_provider_idx'));
});

test('session progress doc tracks goal status and remaining P0 items', () => {
  assert.ok(progressSource.includes('## Session goals vs status'));
  assert.ok(progressSource.includes('## Remaining P0 completion work'));
});

test('orchestrator includes lifecycle-aware readiness computation', () => {
  assert.ok(orchestratorSource.includes('approvedOrLockedCount'));
  assert.ok(orchestratorSource.includes("provider: 'submission_readiness'"));
});
