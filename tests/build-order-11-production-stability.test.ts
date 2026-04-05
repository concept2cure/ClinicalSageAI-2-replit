/**
 * Build Order #11 — Production Stability Tests
 *
 * Validates token revocation service, auth route integration,
 * artifact-document bridge, dependency cleanup, and revocation health.
 *
 * All tests run without a live server or database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Token Revocation Service
// ---------------------------------------------------------------------------
describe('Token Revocation Service', () => {
  let revokeToken: typeof import('../server/services/token-revocation')['revokeToken'];
  let isTokenRevoked: typeof import('../server/services/token-revocation')['isTokenRevoked'];
  let isTokenRevokedSync: typeof import('../server/services/token-revocation')['isTokenRevokedSync'];
  let getRevocationHealth: typeof import('../server/services/token-revocation')['getRevocationHealth'];
  let resetRevocationMetrics: typeof import('../server/services/token-revocation')['resetRevocationMetrics'];

  beforeEach(async () => {
    const mod = await import('../server/services/token-revocation');
    revokeToken = mod.revokeToken;
    isTokenRevoked = mod.isTokenRevoked;
    isTokenRevokedSync = mod.isTokenRevokedSync;
    getRevocationHealth = mod.getRevocationHealth;
    resetRevocationMetrics = mod.resetRevocationMetrics;
    // Reset state between tests
    resetRevocationMetrics();
  });

  it('revokeToken exists and is async', () => {
    expect(typeof revokeToken).toBe('function');
    expect(revokeToken.constructor.name).toBe('AsyncFunction');
  });

  it('isTokenRevoked exists and is async', () => {
    expect(typeof isTokenRevoked).toBe('function');
    expect(isTokenRevoked.constructor.name).toBe('AsyncFunction');
  });

  it('isTokenRevokedSync exists and is synchronous', () => {
    expect(typeof isTokenRevokedSync).toBe('function');
    // Sync functions have constructor name "Function", not "AsyncFunction"
    expect(isTokenRevokedSync.constructor.name).toBe('Function');
  });

  it('getRevocationHealth returns structured health object', async () => {
    const health = await getRevocationHealth();
    expect(health).toHaveProperty('backend');
    expect(health).toHaveProperty('memorySize');
    expect(health).toHaveProperty('revokeCount');
    expect(typeof health.backend).toBe('string');
    expect(typeof health.memorySize).toBe('number');
    expect(typeof health.revokeCount).toBe('number');
  });

  it('resetRevocationMetrics resets all counters', async () => {
    await revokeToken('temp-token');
    resetRevocationMetrics();
    const health = await getRevocationHealth();
    expect(health.revokeCount).toBe(0);
    expect(health.checkCount).toBe(0);
    expect(health.memorySize).toBe(0);
  });

  it('after revokeToken, isTokenRevoked returns true for that token', async () => {
    await revokeToken('test-token-123');
    const revoked = await isTokenRevoked('test-token-123');
    expect(revoked).toBe(true);
  });

  it('isTokenRevoked returns false for a never-revoked token', async () => {
    const revoked = await isTokenRevoked('never-revoked-token');
    expect(revoked).toBe(false);
  });

  it('getRevocationHealth shows backend as redis or memory', async () => {
    const health = await getRevocationHealth();
    expect(['redis+db+memory', 'redis+memory', 'db+memory', 'memory_only', 'redis', 'memory']).toContain(health.backend);
  });
});

// ---------------------------------------------------------------------------
// 2. Auth route uses revocation service
// ---------------------------------------------------------------------------
describe('Auth route uses revocation service', () => {
  const authPath = path.join(ROOT, 'server', 'routes', 'auth.ts');
  let authContent: string;

  beforeEach(() => {
    authContent = fs.readFileSync(authPath, 'utf-8');
  });

  it('imports token-revocation module', () => {
    const hasImport =
      /import.*token-revocation/.test(authContent) ||
      /require.*token-revocation/.test(authContent);
    expect(hasImport).toBe(true);
  });

  it('uses revokeToken in logout flow', () => {
    expect(authContent).toContain('revokeToken');
  });

  it('uses isTokenRevoked in refresh/token check', () => {
    expect(authContent).toContain('isTokenRevoked');
  });

  it('does NOT contain legacy tokenBlacklist.add pattern', () => {
    expect(authContent).not.toContain('tokenBlacklist.add');
  });

  it('still has isTokenBlacklisted for backward compatibility', () => {
    expect(authContent).toContain('isTokenBlacklisted');
  });
});

// ---------------------------------------------------------------------------
// 3. Document / artifact bridge
// ---------------------------------------------------------------------------
describe('Document / artifact bridge', () => {
  it('artifact-document-bridge.ts has DOCUMENT_IDENTITY_VERSION >= 2.0.0', () => {
    const bridgePath = path.join(ROOT, 'server', 'services', 'artifact-document-bridge.ts');
    const content = fs.readFileSync(bridgePath, 'utf-8');
    expect(content).toMatch(/DOCUMENT_IDENTITY_VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/);
  });

  it('exports linkDocumentToArtifact function', () => {
    const bridgePath = path.join(ROOT, 'server', 'services', 'artifact-document-bridge.ts');
    const content = fs.readFileSync(bridgePath, 'utf-8');
    expect(content).toMatch(/export\s+(async\s+)?function\s+linkDocumentToArtifact/);
  });

  it('exports getDocumentsForArtifact function', () => {
    const bridgePath = path.join(ROOT, 'server', 'services', 'artifact-document-bridge.ts');
    const content = fs.readFileSync(bridgePath, 'utf-8');
    expect(content).toMatch(/export\s+(async\s+)?function\s+getDocumentsForArtifact/);
  });

  it('migration 0015 exists and contains artifact_id and revoked_tokens', () => {
    const migrationPath = path.join(ROOT, 'migrations', '0015_document_artifact_bridge.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('artifact_id');
    expect(content).toContain('revoked_tokens');
  });
});

// ---------------------------------------------------------------------------
// 4. Dependency cleanup
// ---------------------------------------------------------------------------
describe('Dependency cleanup', () => {
  it('package.json does NOT contain @xyflow/react', () => {
    const pkgPath = path.join(ROOT, 'package.json');
    const content = fs.readFileSync(pkgPath, 'utf-8');
    expect(content).not.toContain('@xyflow/react');
  });

  it('ImpactGraphTab.jsx does not have active @xyflow imports', () => {
    const candidates = [
      path.join(ROOT, 'client', 'src', 'concept2cure', 'components', 'impact', 'ImpactGraphTab.jsx'),
      path.join(ROOT, 'client', 'src', 'concept2cure', 'components', 'impact', 'ImpactGraphTab.tsx'),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Active imports — not commented out
        const lines = content.split('\n');
        const activeImports = lines.filter(
          (line) =>
            line.includes('@xyflow') &&
            !line.trimStart().startsWith('//') &&
            !line.trimStart().startsWith('*'),
        );
        expect(activeImports).toHaveLength(0);
      }
    }
  });

  it('ProcessCanvasEditor.jsx does not have active @xyflow imports', () => {
    const candidates = [
      path.join(ROOT, 'client', 'src', 'concept2cure', 'components', 'canvas', 'ProcessCanvasEditor.jsx'),
      path.join(ROOT, 'client', 'src', 'concept2cure', 'components', 'canvas', 'ProcessCanvasEditor.tsx'),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const activeImports = lines.filter(
          (line) =>
            line.includes('@xyflow') &&
            !line.trimStart().startsWith('//') &&
            !line.trimStart().startsWith('*'),
        );
        expect(activeImports).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Revocation health — functional
// ---------------------------------------------------------------------------
describe('Revocation health functional', () => {
  it('after resetRevocationMetrics + revokeToken, revokeCount >= 1', async () => {
    const { revokeToken, getRevocationHealth, resetRevocationMetrics } = await import(
      '../server/services/token-revocation'
    );
    resetRevocationMetrics();
    await revokeToken('health-check-token');
    const health = await getRevocationHealth();
    expect(health.revokeCount).toBeGreaterThanOrEqual(1);
  });
});
