import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync('server/routes/report-os.ts', 'utf8');
const schemaSource = readFileSync('shared/schema/report-os.ts', 'utf8');
const migrationSource = readFileSync('migrations/0014_report_os_foundation.sql', 'utf8');
const progressSource = readFileSync('docs/reports/REPORT_OS_SESSION_PROGRESS_2026-03-30.md', 'utf8');
const orchestratorSource = readFileSync('server/services/report-os/orchestrator.ts', 'utf8');
const startupScriptSource = readFileSync('scripts/startup.sh', 'utf8');

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

test('report-os taxonomy seed includes regional agency report packs', () => {
  const requiredRegionalTypeIds = [
    'usa_fda.pma_submission_readiness',
    'usa_fda.estar_510k_equivalence_matrix',
    'ema.maa_readiness_assessment',
    'china_nmpa.registration_dossier_readiness',
  ];
  for (const typeId of requiredRegionalTypeIds) {
    assert.ok(routeSource.includes("router.post('/taxonomy/seed'"));
    const taxonomySource = readFileSync('server/services/report-os/taxonomy.ts', 'utf8');
    assert.ok(taxonomySource.includes(typeId), `expected taxonomy seed to include ${typeId}`);
  }
});

test('report-os persists bundle and delivery state records', () => {
  assert.ok(routeSource.includes('persistBundleRecord'));
  assert.ok(routeSource.includes('persistDeliveryRecord'));
  assert.ok(routeSource.includes('loadBundlesForOrg'));
  assert.ok(routeSource.includes('loadDeliveriesForOrg'));
  assert.ok(routeSource.includes("sourceDocumentType: REPORT_OS_RECORD_SOURCE"));
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

test('report-os orchestrator includes regional obligation provider', () => {
  assert.ok(orchestratorSource.includes("provider: 'regional_registry_readiness'"));
  assert.ok(orchestratorSource.includes("provider: 'regional_package_manifest'"));
  assert.ok(orchestratorSource.includes('evaluateReadiness('));
  assert.ok(orchestratorSource.includes('buildPackageManifest('));
  assert.ok(orchestratorSource.includes('registryIdOrLegacy'));
});

test('report-os route captures regional context in run metadata', () => {
  assert.ok(routeSource.includes('registryId'));
  assert.ok(routeSource.includes('submissionType'));
  assert.ok(routeSource.includes('summary: computed.summary'));
});

test('server index imports bootstrap registrars used at startup callsites', () => {
  const serverIndexSource = readFileSync('server/index.ts', 'utf8');
  const requiredBootstrapImports = [
    "import { registerCoreRoutes } from './bootstrap/register-core-routes';",
    "import { registerIntegrationRoutes } from './bootstrap/register-integrations-routes';",
    "import { registerAiRoutes } from './bootstrap/register-ai-routes';",
    "import { registerConcept2CureRoutes } from './bootstrap/register-concept2cure-routes';",
    "import { registerAdminRoutes } from './bootstrap/register-admin-routes';",
  ];

  for (const requiredImport of requiredBootstrapImports) {
    assert.ok(
      serverIndexSource.includes(requiredImport),
      `missing bootstrap import in server/index.ts: ${requiredImport}`,
    );
  }
});

test('startup script derives DB target from DATABASE_URL before connection checks', () => {
  assert.ok(startupScriptSource.includes('sync_db_config_from_database_url()'));
  assert.ok(startupScriptSource.includes('export DB_NAME="$parsed_db"'));
  assert.ok(startupScriptSource.includes('sync_db_config_from_database_url'));
});

test('startup script defines shared SQL executor and schema readiness guardrails', () => {
  assert.ok(startupScriptSource.includes('run_sql()'));
  assert.ok(startupScriptSource.includes('ensure_required_schemas()'));
  assert.ok(startupScriptSource.includes('CREATE SCHEMA IF NOT EXISTS vault;'));
});
