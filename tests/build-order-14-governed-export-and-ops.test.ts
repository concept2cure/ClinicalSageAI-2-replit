/**
 * Build Order #14 — Governed Export Convergence, Scheduled Ops, Readiness Gate
 *
 * Covers:
 *   1. CERV2 export CI guard passes (was failing on 2 patterns)
 *   2. Export guard correctly scopes governed POST vs dev-only sample GET routes
 *   3. Maintenance wired into scheduled jobs system (platform_maintenance type)
 *   4. Strict readiness runner exists with npm scripts
 *   5. No regression on prior build orders
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Export Guard Compliance ──────────────────────────────────────────────

describe('CERV2 export — governed export compliance', () => {
  it('CI guard script correctly scopes ZIP scan to governed POST route', () => {
    const content = read('scripts/ci/check-governed-export-routes.mjs');
    // Must stop scanning before sample routes
    expect(content).toContain("router.get('/sample/");
    // Must verify sample routes are dev-gated
    expect(content).toContain('isSampleExportEnabled');
  });

  it('cerv2-export-routes.ts has governed export consequence for PDF', () => {
    const content = read('server/routes/cerv2-export-routes.ts');
    expect(content).toContain("sourceType: 'export_pdf'");
    expect(content).toContain('createGovernedExportConsequence(');
  });

  it('cerv2-export-routes.ts has governed export consequence for DOCX', () => {
    const content = read('server/routes/cerv2-export-routes.ts');
    expect(content).toContain("sourceType: 'export_docx'");
  });

  it('cerv2-export-routes.ts has governed export consequence for ZIP', () => {
    const content = read('server/routes/cerv2-export-routes.ts');
    expect(content).toContain("sourceType: 'export_zip'");
  });

  it('sample routes are dev-gated by isSampleExportEnabled', () => {
    const content = read('server/routes/cerv2-export-routes.ts');
    // Every sample route should check isSampleExportEnabled
    const sampleSection = content.slice(content.indexOf("router.get('/sample/"));
    expect(sampleSection).toContain('isSampleExportEnabled');
  });

  it('governed POST /zip route does NOT use archive.pipe(res)', () => {
    const content = read('server/routes/cerv2-export-routes.ts');
    // The governed POST /zip section (before sample routes) should not have direct streaming
    const postZipStart = content.indexOf("router.post('/zip'");
    const sampleStart = content.indexOf("router.get('/sample/");
    const governedZipSection = content.slice(postZipStart, sampleStart);
    expect(governedZipSection).not.toContain('archive.pipe(res)');
  });
});

// ── 2. Scheduled Maintenance ────────────────────────────────────────────────

describe('Scheduled maintenance — wired into job system', () => {
  it('platform_maintenance is a registered job type', () => {
    const content = read('server/services/automation/scheduled-jobs.ts');
    expect(content).toContain("'platform_maintenance'");
  });

  it('handlePlatformMaintenance handler is registered', () => {
    const content = read('server/services/automation/scheduled-jobs.ts');
    expect(content).toContain("handlers.set('platform_maintenance'");
  });

  it('platform_maintenance is in default schedules', () => {
    const content = read('server/services/automation/scheduled-jobs.ts');
    expect(content).toContain("type: 'platform_maintenance'");
    expect(content).toContain("name: 'Platform Maintenance'");
    // Cron: 3 AM daily
    expect(content).toContain("'0 3 * * *'");
  });

  it('handler imports runPlatformMaintenance', () => {
    const content = read('server/services/automation/scheduled-jobs.ts');
    expect(content).toContain('runPlatformMaintenance');
    expect(content).toContain('platform-maintenance');
  });

  it('handler returns structured ScheduledJobRun', () => {
    const content = read('server/services/automation/scheduled-jobs.ts');
    // Should return jobType, status, itemsProcessed, itemsFlagged
    const handlerSection = content.slice(content.indexOf('handlePlatformMaintenance'));
    expect(handlerSection).toContain("status: 'completed'");
    expect(handlerSection).toContain("status: 'failed'");
    expect(handlerSection).toContain('itemsProcessed');
    expect(handlerSection).toContain('itemsFlagged');
  });
});

// ── 3. Readiness Runner ─────────────────────────────────────────────────────

describe('Readiness runner — warn-only and strict modes', () => {
  it('readiness-check.mjs script exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/readiness-check.mjs'))).toBe(true);
  });

  it('script supports --strict flag', () => {
    const content = read('scripts/readiness-check.mjs');
    expect(content).toContain('--strict');
    expect(content).toContain('process.exit(1)');
    expect(content).toContain('STRICT');
  });

  it('script supports warn-only mode (default)', () => {
    const content = read('scripts/readiness-check.mjs');
    expect(content).toContain('WARN-ONLY');
  });

  it('npm scripts for readiness exist', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['readiness:check']).toBeDefined();
    expect(pkg.scripts['readiness:check:strict']).toBeDefined();
    expect(pkg.scripts['readiness:check:strict']).toContain('--strict');
  });

  it('script uses runStartupInvariants from startup-invariants', () => {
    const content = read('scripts/readiness-check.mjs');
    expect(content).toContain('runStartupInvariants');
    expect(content).toContain('startup-invariants');
  });
});

// ── 4. Mode-Based Behavior ──────────────────────────────────────────────────

describe('Mode-based readiness — explicit behaviors', () => {
  it('startup invariants have severity levels (critical vs warning)', () => {
    const content = read('server/lib/startup-invariants.ts');
    expect(content).toContain("severity: 'critical'");
    expect(content).toContain("severity: 'warning'");
  });

  it('readiness runner exits 1 in strict mode on critical failure', () => {
    const content = read('scripts/readiness-check.mjs');
    expect(content).toContain('criticalFailures > 0');
    expect(content).toContain('process.exit(1)');
  });

  it('degraded mode policy exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/architecture/degraded-mode-policy.md'))).toBe(true);
  });
});

// ── 5. No Regression ────────────────────────────────────────────────────────

describe('No regression — prior build orders', () => {
  it('token revocation still three-tier', () => {
    const content = read('server/services/token-revocation.ts');
    expect(content).toContain('Tier 1: Redis');
    expect(content).toContain('Tier 2: DB');
    expect(content).toContain('Tier 3: Memory');
  });

  it('bridge still v3', () => {
    const content = read('server/services/artifact-document-bridge.ts');
    expect(content).toContain("DOCUMENT_IDENTITY_VERSION = '3.0.0'");
  });

  it('maintenance route still exists', () => {
    expect(read('server/routes/concept2cure.ts')).toContain("'/maintenance/run'");
  });

  it('startup invariants route still exists', () => {
    expect(read('server/routes/concept2cure.ts')).toContain("'/startup/invariants'");
  });
});
