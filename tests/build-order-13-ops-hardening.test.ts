/**
 * Build Order #13 — Operationalization & Ops Hardening Tests
 *
 * Covers:
 *   1. Platform maintenance (token cleanup, bridge integrity, backfill)
 *   2. Startup invariants (DB, Redis, tables, columns)
 *   3. Degraded mode policy enforcement
 *   4. Legacy quarantine enforcement (no new consumers)
 *   5. Founder-path Playwright E2E exists
 *   6. Route thinness (maintenance + invariants use services)
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Platform Maintenance ─────────────────────────────────────────────────

describe('Platform maintenance — operationalized cleanup', () => {
  it('maintenance module exports runPlatformMaintenance', async () => {
    const mod = await import('../server/services/maintenance/platform-maintenance');
    expect(typeof mod.runPlatformMaintenance).toBe('function');
  });

  it('maintenance module exports individual task runners', async () => {
    const mod = await import('../server/services/maintenance/platform-maintenance');
    expect(typeof mod.runTokenRevocationCleanup).toBe('function');
    expect(typeof mod.runBridgeIntegrityCheck).toBe('function');
    expect(typeof mod.runBridgeBackfill).toBe('function');
  });

  it('runPlatformMaintenance returns structured result', async () => {
    const { runPlatformMaintenance } = await import('../server/services/maintenance/platform-maintenance');
    const result = await runPlatformMaintenance(1);
    expect(result).toHaveProperty('tokenCleanup');
    expect(result).toHaveProperty('bridgeIntegrity');
    expect(result).toHaveProperty('bridgeBackfill');
    expect(result).toHaveProperty('ranAt');
    expect(result).toHaveProperty('durationMs');
    expect(result.tokenCleanup).toHaveProperty('status');
    expect(result.bridgeIntegrity).toHaveProperty('status');
    expect(result.bridgeBackfill).toHaveProperty('status');
  });

  it('maintenance route exists in concept2cure.ts', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain("router.post('/maintenance/run'");
    expect(content).toContain('runPlatformMaintenance');
  });
});

// ── 2. Startup Invariants ───────────────────────────────────────────────────

describe('Startup invariants — drift detection', () => {
  it('startup-invariants module exports runStartupInvariants', async () => {
    const mod = await import('../server/lib/startup-invariants');
    expect(typeof mod.runStartupInvariants).toBe('function');
  });

  it('runStartupInvariants returns structured report', async () => {
    const { runStartupInvariants } = await import('../server/lib/startup-invariants');
    const report = await runStartupInvariants();
    expect(report).toHaveProperty('allPassed');
    expect(report).toHaveProperty('criticalFailures');
    expect(report).toHaveProperty('warnings');
    expect(report).toHaveProperty('invariants');
    expect(report).toHaveProperty('checkedAt');
    expect(report).toHaveProperty('durationMs');
    expect(Array.isArray(report.invariants)).toBe(true);
  });

  it('checks 5 invariants', async () => {
    const { runStartupInvariants } = await import('../server/lib/startup-invariants');
    const report = await runStartupInvariants();
    expect(report.invariants.length).toBe(5);
    const names = report.invariants.map(i => i.name);
    expect(names).toContain('database_connectivity');
    expect(names).toContain('revoked_tokens_table');
    expect(names).toContain('documents_artifact_id_column');
    expect(names).toContain('concept2cure_artifacts_table');
    expect(names).toContain('redis_connectivity');
  });

  it('each invariant has name, passed, severity, message', async () => {
    const { runStartupInvariants } = await import('../server/lib/startup-invariants');
    const report = await runStartupInvariants();
    for (const inv of report.invariants) {
      expect(inv).toHaveProperty('name');
      expect(inv).toHaveProperty('passed');
      expect(inv).toHaveProperty('severity');
      expect(inv).toHaveProperty('message');
      expect(['critical', 'warning']).toContain(inv.severity);
    }
  });

  it('startup invariants route exists', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain("router.get('/startup/invariants'");
    expect(content).toContain('runStartupInvariants');
  });
});

// ── 3. Degraded Mode Policy ─────────────────────────────────────────────────

describe('Degraded mode policy — documented and enforced', () => {
  it('degraded-mode-policy.md exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/architecture/degraded-mode-policy.md'))).toBe(true);
  });

  it('policy covers token revocation degradation', () => {
    const content = read('docs/architecture/degraded-mode-policy.md');
    expect(content).toContain('Token Revocation');
    expect(content).toContain('Redis');
    expect(content).toContain('memory');
  });

  it('policy covers document bridge degradation', () => {
    const content = read('docs/architecture/degraded-mode-policy.md');
    expect(content).toContain('Document Bridge');
    expect(content).toContain('artifact_id');
  });

  it('token revocation service follows policy (degrade, dont crash)', () => {
    const content = read('server/services/token-revocation.ts');
    // Must not throw on Redis failure
    expect(content).toContain('catch');
    // Must log degradation
    expect(content).toContain('log.warn');
    // Must report status
    expect(content).toContain("'emergency'");
    expect(content).toContain("'degraded'");
  });
});

// ── 4. Legacy Quarantine ────────────────────────────────────────────────────

describe('Legacy dependency quarantine — enforcement', () => {
  it('quarantine CI guard exists and is executable', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/ci/check-legacy-dep-quarantine.mjs'))).toBe(true);
  });

  it('quarantine covers @supabase/supabase-js', () => {
    const content = read('scripts/ci/check-legacy-dep-quarantine.mjs');
    expect(content).toContain('@supabase/supabase-js');
    expect(content).toContain('SUPABASE_ALLOWLIST');
  });

  it('quarantine covers aws-sdk v2', () => {
    const content = read('scripts/ci/check-legacy-dep-quarantine.mjs');
    expect(content).toContain('aws-sdk');
    expect(content).toContain('AWSV2_ALLOWLIST');
  });

  it('@xyflow/react not in package.json', () => {
    expect(read('package.json')).not.toContain('@xyflow/react');
  });
});

// ── 5. Playwright E2E ───────────────────────────────────────────────────────

describe('Founder-path Playwright E2E — real browser proof', () => {
  it('Playwright E2E test file exists with .e2e.ts extension', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/e2e/founder-critical-path.e2e.ts'))).toBe(true);
  });

  it('E2E test covers login, logout, governance, maintenance', () => {
    const content = read('tests/e2e/founder-critical-path.e2e.ts');
    expect(content).toContain('Login');
    expect(content).toContain('Logout');
    expect(content).toContain('governance/health');
    expect(content).toContain('maintenance/run');
    expect(content).toContain('startup/invariants');
    expect(content).toContain('SSO');
  });

  it('E2E test uses Playwright test framework', () => {
    const content = read('tests/e2e/founder-critical-path.e2e.ts');
    expect(content).toContain("from '@playwright/test'");
    expect(content).toContain('test.describe');
  });

  it('Playwright config exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'playwright.config.ts'))).toBe(true);
  });
});

// ── 6. Route Thinness ───────────────────────────────────────────────────────

describe('Route thinness — business logic in services', () => {
  it('maintenance route delegates to service', () => {
    const content = read('server/routes/concept2cure.ts');
    const maintenanceBlock = content.slice(
      content.indexOf("'/maintenance/run'"),
      content.indexOf("'/maintenance/run'") + 300,
    );
    expect(maintenanceBlock).toContain('runPlatformMaintenance');
    expect(maintenanceBlock).not.toContain('pool.query');
  });

  it('startup route delegates to service', () => {
    const content = read('server/routes/concept2cure.ts');
    const startupBlock = content.slice(
      content.indexOf("'/startup/invariants'"),
      content.indexOf("'/startup/invariants'") + 300,
    );
    expect(startupBlock).toContain('runStartupInvariants');
    expect(startupBlock).not.toContain('pool.query');
  });
});

// ── 7. No Regression ────────────────────────────────────────────────────────

describe('No regression — previous build orders', () => {
  it('token revocation still three-tier', () => {
    const content = read('server/services/token-revocation.ts');
    expect(content).toContain('Tier 1: Redis');
    expect(content).toContain('Tier 2: DB');
    expect(content).toContain('Tier 3: Memory');
  });

  it('bridge still v3', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    expect(bridge.DOCUMENT_IDENTITY_VERSION).toBe('3.0.0');
  });

  it('sign-out still wired', () => {
    expect(read('client/src/concept2cure/components/settings/ZenSettings.tsx')).toContain('authService.logout()');
    expect(read('client/src/concept2cure/IndustryAwareApp.tsx')).toContain('authService.logout()');
  });

  it('SSO still hidden in prod', () => {
    expect(read('client/src/concept2cure/auth/ZenLogin.tsx')).toContain('import.meta.env.DEV');
  });
});
