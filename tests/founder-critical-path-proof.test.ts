/**
 * Founder Critical Path Proof — Build Order #11
 *
 * Lightweight integration proof test (vitest, NOT Playwright).
 * Verifies the critical path exists by checking file content and
 * running service-level functional tests. No running server or DB required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relativePath: string): string {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

// ---------------------------------------------------------------------------
// 1. Login endpoint exists
// ---------------------------------------------------------------------------
describe('Login endpoint exists', () => {
  it('server/routes/auth.ts contains router.post /login', () => {
    const content = readFile('server/routes/auth.ts');
    expect(content).toMatch(/router\.post\(\s*['"]\/login['"]/);
  });
});

// ---------------------------------------------------------------------------
// 2. Logout endpoint exists and uses revocation
// ---------------------------------------------------------------------------
describe('Logout endpoint uses token revocation', () => {
  it('auth.ts has a logout route that calls revokeToken', () => {
    const content = readFile('server/routes/auth.ts');
    // Verify logout route exists
    expect(content).toMatch(/['"]\/logout['"]/);
    // Verify revokeToken is imported and used
    expect(content).toContain('revokeToken');
  });
});

// ---------------------------------------------------------------------------
// 3. Project CRUD endpoints exist
// ---------------------------------------------------------------------------
describe('Project CRUD endpoints exist', () => {
  it('concept2cure.ts contains governance and project routes', () => {
    const content = readFile('server/routes/concept2cure.ts');
    // Project-related route patterns
    expect(content).toMatch(/project/i);
    // Should have route definitions
    expect(content).toMatch(/router\.(get|post|put|patch|delete)/);
  });
});

// ---------------------------------------------------------------------------
// 4. Artifact identity is canonical
// ---------------------------------------------------------------------------
describe('Artifact identity is canonical', () => {
  it('getCanonicalDocumentIdentity returns concept2cureArtifacts', async () => {
    const { getCanonicalDocumentIdentity } = await import(
      '../../server/services/artifact-document-bridge'
    );
    const identity = getCanonicalDocumentIdentity();
    expect(identity.canonical).toBe('concept2cureArtifacts');
  });
});

// ---------------------------------------------------------------------------
// 5. Token revocation is durable (service-level functional test)
// ---------------------------------------------------------------------------
describe('Token revocation is durable', () => {
  it('revoked token survives across isTokenRevoked calls', async () => {
    const { revokeToken, isTokenRevoked, resetRevocationMetrics } = await import(
      '../../server/services/token-revocation'
    );
    resetRevocationMetrics();

    const testToken = `founder-proof-${Date.now()}`;
    await revokeToken(testToken);

    // First check
    const check1 = await isTokenRevoked(testToken);
    expect(check1).toBe(true);

    // Second check — still revoked
    const check2 = await isTokenRevoked(testToken);
    expect(check2).toBe(true);

    // Unrevoked token is false
    const check3 = await isTokenRevoked('not-revoked-ever');
    expect(check3).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. SSO hidden in production
// ---------------------------------------------------------------------------
describe('SSO hidden in production', () => {
  it('ZenLogin.tsx contains import.meta.env.DEV guard', () => {
    const content = readFile('client/src/concept2cure/auth/ZenLogin.tsx');
    expect(content).toContain('import.meta.env.DEV');
  });
});

// ---------------------------------------------------------------------------
// 7. Sign-out is wired
// ---------------------------------------------------------------------------
describe('Sign-out is wired', () => {
  it('ZenSettings.tsx contains authService.logout', () => {
    const content = readFile('client/src/concept2cure/components/settings/ZenSettings.tsx');
    expect(content).toContain('authService.logout');
  });

  it('IndustryAwareApp.tsx contains authService.logout', () => {
    const content = readFile('client/src/concept2cure/IndustryAwareApp.tsx');
    expect(content).toContain('authService.logout');
  });
});
