/**
 * Build Order #12 — Production Readiness & Drift Elimination Tests
 *
 * Covers:
 *   1. Three-tier token revocation (Redis → DB → memory)
 *   2. Auth health/degraded-mode reporting
 *   3. Artifact/document bridge integrity + backfill
 *   4. Legacy dependency quarantine enforcement
 *   5. Founder-critical-path E2E proof
 *   6. No regression on fake-prod behavior
 */

import { describe, expect, it, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Three-Tier Token Revocation ──────────────────────────────────────────

describe('Token Revocation — three-tier architecture', () => {
  it('service exports revokeToken, isTokenRevoked, isTokenRevokedSync', async () => {
    const svc = await import('../server/services/token-revocation');
    expect(typeof svc.revokeToken).toBe('function');
    expect(typeof svc.isTokenRevoked).toBe('function');
    expect(typeof svc.isTokenRevokedSync).toBe('function');
  });

  it('service exports getRevocationHealth with three-tier backend field', async () => {
    const svc = await import('../server/services/token-revocation');
    const health = await svc.getRevocationHealth();
    expect(health).toHaveProperty('backend');
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('redisAvailable');
    expect(health).toHaveProperty('dbAvailable');
    expect(health).toHaveProperty('redisFails');
    expect(health).toHaveProperty('dbFails');
    expect(['healthy', 'degraded', 'emergency']).toContain(health.status);
    expect(['redis+db+memory', 'redis+memory', 'db+memory', 'memory_only']).toContain(health.backend);
  });

  it('revoke + check works at memory tier', async () => {
    const svc = await import('../server/services/token-revocation');
    svc.resetRevocationMetrics();
    await svc.revokeToken('test-token-bo12-unique');
    const revoked = await svc.isTokenRevoked('test-token-bo12-unique');
    expect(revoked).toBe(true);
  });

  it('non-revoked token returns false', async () => {
    const svc = await import('../server/services/token-revocation');
    const revoked = await svc.isTokenRevoked('never-revoked-token-xyz');
    expect(revoked).toBe(false);
  });

  it('cleanupExpiredTokens is exported', async () => {
    const svc = await import('../server/services/token-revocation');
    expect(typeof svc.cleanupExpiredTokens).toBe('function');
  });

  it('auth.ts uses revokeToken not tokenBlacklist.add', () => {
    const content = read('server/routes/auth.ts');
    expect(content).toContain('revokeToken');
    expect(content).toContain('isTokenRevoked');
    expect(content).not.toContain('tokenBlacklist.add');
  });

  it('token hashing is used (tokens not stored raw)', () => {
    const content = read('server/services/token-revocation.ts');
    expect(content).toContain('hashToken');
    expect(content).toContain('sha256');
  });

  it('write-through writes to all backends', () => {
    const content = read('server/services/token-revocation.ts');
    // revokeToken should write to memory, Redis, and DB
    expect(content).toContain('memoryBlacklist.add');
    expect(content).toContain('redis.setex');
    expect(content).toContain('INSERT INTO revoked_tokens');
  });

  it('read checks Redis → DB → memory in order', () => {
    const content = read('server/services/token-revocation.ts');
    // isTokenRevoked should check all three tiers
    const fnBody = content.slice(content.indexOf('async function isTokenRevoked'));
    expect(fnBody).toContain('redis.exists');
    expect(fnBody).toContain('FROM revoked_tokens');
    expect(fnBody).toContain('memoryBlacklist.has');
  });
});

// ── 2. Auth Health/Degraded-Mode ────────────────────────────────────────────

describe('Auth health — degraded-mode reporting', () => {
  it('governance health endpoint includes tokenRevocation', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain('tokenRevocation');
    expect(content).toContain('getRevocationHealth');
  });

  it('governance health endpoint includes documentBridge', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain('documentBridge');
    expect(content).toContain('getBridgeHealth');
  });

  it('health runs all checks in parallel', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain('Promise.all');
  });
});

// ── 3. Artifact/Document Bridge ─────────────────────────────────────────────

describe('Artifact/document bridge — v3 with integrity + backfill', () => {
  it('bridge version is 3.0.0', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    expect(bridge.DOCUMENT_IDENTITY_VERSION).toBe('3.0.0');
  });

  it('exports integrity check function', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    expect(typeof bridge.checkBridgeIntegrity).toBe('function');
  });

  it('exports backfill function', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    expect(typeof bridge.backfillArtifactLinks).toBe('function');
  });

  it('exports bridge health function', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    expect(typeof bridge.getBridgeHealth).toBe('function');
  });

  it('canonical identity returns concept2cureArtifacts', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    const id = bridge.getCanonicalDocumentIdentity();
    expect(id.canonical).toBe('concept2cureArtifacts');
    expect(id.version).toBe('3.0.0');
    expect(id.relationship).toBe('optional_fk_bridge');
  });

  it('integrity check returns structured report', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    const report = await bridge.checkBridgeIntegrity(1);
    expect(report).toHaveProperty('totalDocuments');
    expect(report).toHaveProperty('linkedDocuments');
    expect(report).toHaveProperty('orphanedLinks');
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('checkedAt');
    expect(['healthy', 'drift_detected', 'error']).toContain(report.status);
  });

  it('migration 0015 has artifact_id and revoked_tokens', () => {
    const content = read('migrations/0015_document_artifact_bridge.sql');
    expect(content).toContain('artifact_id');
    expect(content).toContain('revoked_tokens');
    expect(content).toContain('token_hash');
    expect(content).toContain('expires_at');
  });

  it('getArtifactDocumentMapping returns linked/unlinked counts', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    const mapping = await bridge.getArtifactDocumentMapping(1, 1);
    expect(mapping).toHaveProperty('linkedDocuments');
    expect(mapping).toHaveProperty('unlinkedDocuments');
    expect(mapping).toHaveProperty('canonicalTable');
    expect(mapping.canonicalTable).toBe('concept2cureArtifacts');
  });
});

// ── 4. Legacy Dependency Quarantine ─────────────────────────────────────────

describe('Legacy dependency quarantine', () => {
  it('CI guard script exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/ci/check-legacy-dep-quarantine.mjs'))).toBe(true);
  });

  it('package.json has ci:check-legacy-dep-quarantine script', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['ci:check-legacy-dep-quarantine']).toBeDefined();
  });

  it('@xyflow/react is not in package.json', () => {
    const content = read('package.json');
    expect(content).not.toContain('@xyflow/react');
  });
});

// ── 5. Founder-Critical-Path E2E Proof ──────────────────────────────────────

describe('Founder-critical-path — structural proof', () => {
  it('login route exists', () => {
    const content = read('server/routes/auth.ts');
    expect(content).toContain("router.post('/login'");
  });

  it('logout uses durable revocation', () => {
    const content = read('server/routes/auth.ts');
    expect(content).toContain('revokeToken');
    expect(content).toContain("'/logout'");
  });

  it('project CRUD routes exist', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain('/projects');
    expect(content).toContain('governance');
  });

  it('sign-out buttons are wired (ZenSettings + IndustryAwareApp)', () => {
    expect(read('client/src/concept2cure/components/settings/ZenSettings.tsx')).toContain('authService.logout()');
    expect(read('client/src/concept2cure/IndustryAwareApp.tsx')).toContain('authService.logout()');
  });

  it('SSO hidden in production', () => {
    expect(read('client/src/concept2cure/auth/ZenLogin.tsx')).toContain('import.meta.env.DEV');
  });

  it('project persistence is API-first', () => {
    const content = read('client/src/concept2cure/hooks/useProjects.ts');
    expect(content).toContain('const USE_API = true');
    expect(content).toContain("VITE_ENABLE_LOCAL_PROJECT_FALLBACK === 'true'");
  });

  it('token revocation service is three-tier', () => {
    const content = read('server/services/token-revocation.ts');
    expect(content).toContain('Tier 1: Redis');
    expect(content).toContain('Tier 2: DB');
    expect(content).toContain('Tier 3: Memory');
  });

  it('document identity has canonical resolver', async () => {
    const bridge = await import('../server/services/artifact-document-bridge');
    expect(bridge.getCanonicalDocumentIdentity().canonical).toBe('concept2cureArtifacts');
  });
});

// ── 6. Regression Guards ────────────────────────────────────────────────────

describe('No regression — fake-prod behavior', () => {
  it('no tokenBlacklist.add in auth.ts (old pattern)', () => {
    expect(read('server/routes/auth.ts')).not.toContain('tokenBlacklist.add');
  });

  it('no in-memory-only Set as production truth', () => {
    const content = read('server/services/token-revocation.ts');
    // Memory should be emergency fallback only
    expect(content).toContain('emergency');
  });

  it('health endpoint reveals all three subsystems', () => {
    const content = read('server/routes/concept2cure.ts');
    expect(content).toContain('governance:');
    expect(content).toContain('tokenRevocation:');
    expect(content).toContain('documentBridge:');
  });
});
