/**
 * Startup Invariants
 *
 * Verified at server boot. Failures produce structured warnings (not hard crashes)
 * so the platform can start in degraded mode with visible operational alerts.
 *
 * Invariants checked:
 *   1. Database connectivity
 *   2. revoked_tokens table exists (token revocation durability)
 *   3. documents.artifact_id column exists (bridge convergence)
 *   4. concept2cure_artifacts table exists (canonical identity)
 *   5. Redis connectivity (token revocation primary)
 *   6. AnA has an AI provider (the platform's core capability can actually answer)
 *
 * @module server/lib/startup-invariants
 */

import { createScopedLogger } from '../utils/logger';
import { runWithSystemTenantScope } from '../db/tenantStore';

const log = createScopedLogger('startup-invariants');

export interface InvariantResult {
  name: string;
  passed: boolean;
  severity: 'critical' | 'warning';
  message: string;
}

export interface StartupInvariantReport {
  allPassed: boolean;
  criticalFailures: number;
  warnings: number;
  invariants: InvariantResult[];
  checkedAt: string;
  durationMs: number;
}

async function checkDb(invariants: InvariantResult[]): Promise<void> {
  try {
    const { pool } = await import('../db.js');
    await pool.query('SELECT 1');
    invariants.push({ name: 'database_connectivity', passed: true, severity: 'critical', message: 'Database reachable' });
  } catch {
    invariants.push({ name: 'database_connectivity', passed: false, severity: 'critical', message: 'Database unreachable — platform will operate in degraded mode' });
  }
}

async function checkRevokedTokensTable(invariants: InvariantResult[]): Promise<void> {
  try {
    const { pool } = await import('../db.js');
    const r = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'revoked_tokens') AS ok`);
    if (r.rows[0]?.ok) {
      invariants.push({ name: 'revoked_tokens_table', passed: true, severity: 'warning', message: 'revoked_tokens table present' });
    } else {
      invariants.push({ name: 'revoked_tokens_table', passed: false, severity: 'warning', message: 'revoked_tokens table missing — token revocation falls back to Redis+memory' });
    }
  } catch {
    invariants.push({ name: 'revoked_tokens_table', passed: false, severity: 'warning', message: 'Cannot check revoked_tokens table' });
  }
}

async function checkArtifactIdColumn(invariants: InvariantResult[]): Promise<void> {
  try {
    const { pool } = await import('../db.js');
    const r = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'artifact_id') AS ok`);
    if (r.rows[0]?.ok) {
      invariants.push({ name: 'documents_artifact_id_column', passed: true, severity: 'warning', message: 'documents.artifact_id bridge column present' });
    } else {
      invariants.push({ name: 'documents_artifact_id_column', passed: false, severity: 'warning', message: 'documents.artifact_id column missing — bridge convergence unavailable' });
    }
  } catch {
    invariants.push({ name: 'documents_artifact_id_column', passed: false, severity: 'warning', message: 'Cannot check documents.artifact_id column' });
  }
}

async function checkArtifactsTable(invariants: InvariantResult[]): Promise<void> {
  try {
    const { pool } = await import('../db.js');
    const r = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'concept2cure_artifacts') AS ok`);
    if (r.rows[0]?.ok) {
      invariants.push({ name: 'concept2cure_artifacts_table', passed: true, severity: 'critical', message: 'concept2cure_artifacts table present' });
    } else {
      invariants.push({ name: 'concept2cure_artifacts_table', passed: false, severity: 'critical', message: 'concept2cure_artifacts table missing — canonical document identity unavailable' });
    }
  } catch {
    invariants.push({ name: 'concept2cure_artifacts_table', passed: false, severity: 'critical', message: 'Cannot check concept2cure_artifacts table' });
  }
}

async function checkRedis(invariants: InvariantResult[]): Promise<void> {
  try {
    const { isRedisAvailable } = await import('../services/ai-actions/redis-manager.js');
    if (isRedisAvailable()) {
      invariants.push({ name: 'redis_connectivity', passed: true, severity: 'warning', message: 'Redis reachable — token revocation primary backend active' });
    } else {
      invariants.push({ name: 'redis_connectivity', passed: false, severity: 'warning', message: 'Redis unavailable — token revocation falls back to DB+memory' });
    }
  } catch {
    invariants.push({ name: 'redis_connectivity', passed: false, severity: 'warning', message: 'Redis check failed — token revocation falls back to DB+memory' });
  }
}

/**
 * AnA can actually answer.
 *
 * This is `critical` and not `warning` on purpose. Every other invariant here
 * degrades a supporting subsystem; this one decides whether the product does
 * anything at all. A platform whose regulatory copilot returns 503 on every
 * turn is not running in degraded mode — it is down, and it should say so
 * with the same weight as an unreachable database.
 *
 * The verdict is recorded in ana-readiness-state so /readyz reads the same
 * answer this panel reports; see that module for the incident it came from.
 */
async function checkAnaProvider(invariants: InvariantResult[]): Promise<void> {
  const { evaluateAnaReadiness, getAnaReadinessDetail, isAnaReadinessServing } = await import(
    '../startup/ana-readiness-state.js'
  );
  const state = await evaluateAnaReadiness();
  invariants.push({
    name: 'ana_ai_provider',
    passed: isAnaReadinessServing(state),
    severity: 'critical',
    message: `AnA readiness: ${state} — ${getAnaReadinessDetail()}`,
  });
}

/**
 * Run all startup invariant checks. Call during server bootstrap.
 * Never throws — returns a structured report.
 */
export async function runStartupInvariants(): Promise<StartupInvariantReport> {
  const start = Date.now();
  const invariants: InvariantResult[] = [];

  // These probes are estate-wide by nature — connectivity, and information_schema
  // lookups for tables/columns that belong to no tenant. Under RLS_ENFORCE=on
  // (the only value production accepts) pool instrumentation blocks any query
  // with no declared scope, so every one of them failed and the boot report
  // claimed the database was unreachable on a perfectly healthy connection.
  // Declaring the scope makes them deliberate rather than accidental, which is
  // the distinction the instrumentation exists to draw.
  await runWithSystemTenantScope('startup:invariants', async () =>
    Promise.all([
      checkDb(invariants),
      checkRevokedTokensTable(invariants),
      checkArtifactIdColumn(invariants),
      checkArtifactsTable(invariants),
      checkRedis(invariants),
      checkAnaProvider(invariants),
    ])
  );

  const criticalFailures = invariants.filter(i => !i.passed && i.severity === 'critical').length;
  const warnings = invariants.filter(i => !i.passed && i.severity === 'warning').length;
  const allPassed = criticalFailures === 0 && warnings === 0;

  const report: StartupInvariantReport = {
    allPassed,
    criticalFailures,
    warnings,
    invariants,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };

  if (criticalFailures > 0) {
    log.warn('STARTUP INVARIANT FAILURES', {
      criticalFailures,
      warnings,
      failed: invariants.filter(i => !i.passed).map(i => i.name),
    });
  } else if (warnings > 0) {
    log.info('Startup invariants passed with warnings', { warnings });
  } else {
    log.info('All startup invariants passed');
  }

  return report;
}
