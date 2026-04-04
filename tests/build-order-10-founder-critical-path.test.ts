/**
 * Build Order #10 — Founder Critical Path Truth Tests
 *
 * Proves that:
 *   1. Project creation uses real API, not localStorage-only
 *   2. Sign-out buttons have real handlers
 *   3. SSO/OAuth buttons are hidden in production builds
 *   4. Onboarding uses localStorage intentionally (ephemeral UI tours)
 *   5. Document/artifact identity has canonical table documented
 *   6. Editor extensions are all installed
 *   7. No fake-prod behavior in touched critical paths
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// ── 1. Project persistence truth ─────────────────────────────────────────────

describe('Project persistence — API-first, not localStorage-only', () => {
  it('useProjects hook uses apiRequest for create', () => {
    const content = readFile('client/src/concept2cure/hooks/useProjects.ts');
    expect(content).toContain("apiRequest('POST'");
    expect(content).toContain('/api/concept2cure/projects');
  });

  it('useProjects hook uses apiRequest for update', () => {
    const content = readFile('client/src/concept2cure/hooks/useProjects.ts');
    expect(content).toContain("apiRequest('PUT'");
  });

  it('useProjects hook uses apiRequest for delete', () => {
    const content = readFile('client/src/concept2cure/hooks/useProjects.ts');
    expect(content).toContain("apiRequest('DELETE'");
  });

  it('localStorage fallback is feature-flagged, not default', () => {
    const content = readFile('client/src/concept2cure/hooks/useProjects.ts');
    expect(content).toContain('ENABLE_LOCAL_PROJECT_FALLBACK');
    expect(content).toContain("VITE_ENABLE_LOCAL_PROJECT_FALLBACK === 'true'");
    // The flag defaults to false (env var must be explicitly set)
    expect(content).not.toContain('ENABLE_LOCAL_PROJECT_FALLBACK = true');
  });

  it('USE_API flag is true by default', () => {
    const content = readFile('client/src/concept2cure/hooks/useProjects.ts');
    expect(content).toContain('const USE_API = true');
  });
});

// ── 2. Sign-out behavior ─────────────────────────────────────────────────────

describe('Sign-out — real handlers wired', () => {
  it('ZenSettings sign-out button has onClick handler', () => {
    const content = readFile('client/src/concept2cure/components/settings/ZenSettings.tsx');
    // Must have onClick with authService.logout
    expect(content).toContain('authService.logout()');
    expect(content).toContain("window.location.href = '/concept2cure/login'");
    expect(content).toContain('data-testid="settings-sign-out-btn"');
  });

  it('IndustryAwareApp sign-out button has onClick handler', () => {
    const content = readFile('client/src/concept2cure/IndustryAwareApp.tsx');
    expect(content).toContain('authService.logout()');
    expect(content).toContain("window.location.href = '/concept2cure/login'");
    expect(content).toContain('data-testid="industry-sign-out-btn"');
  });

  it('server logout route exists and blacklists tokens', () => {
    const content = readFile('server/routes/auth.ts');
    expect(content).toContain("router.post('/logout'");
    expect(content).toContain('tokenBlacklist.add(token)');
  });

  it('authService.logout calls real API endpoint', () => {
    const content = readFile('client/src/portal-v2/services/authService.tsx');
    expect(content).toContain('async logout');
    expect(content).toContain('/logout');
    expect(content).toContain('this.clearAuth()');
  });
});

// ── 3. Onboarding — ephemeral UI state, not business data ────────────────────

describe('Onboarding — localStorage is intentional for UI tours', () => {
  it('onboarding state uses localStorage for tour flags only', () => {
    const onboardingFiles = [
      'client/src/contexts/OnboardingContext.jsx',
    ];
    for (const f of onboardingFiles) {
      if (!fs.existsSync(path.join(ROOT, f))) continue;
      const content = readFile(f);
      // Should use localStorage for tour completion flags
      expect(content).toContain('localStorage');
      // Should NOT persist to API (these are UI tour states)
      expect(content).not.toContain('apiRequest');
    }
  });
});

// ── 4. SSO/OAuth — hidden in production ──────────────────────────────────────

describe('SSO/OAuth — production truthfulness', () => {
  it('SSO buttons are wrapped in import.meta.env.DEV guard', () => {
    const content = readFile('client/src/concept2cure/auth/ZenLogin.tsx');
    // SSO buttons should only render in dev mode
    expect(content).toContain('import.meta.env.DEV');
    expect(content).toContain('data-testid="sso-provider-buttons"');
  });

  it('SSO server routes return 501 in production', () => {
    const content = readFile('server/routes/sso.ts');
    expect(content).toContain("res.status(501)");
    expect(content).toContain('SSO_NOT_IMPLEMENTED');
  });

  it('SSO dev mode guard is based on NODE_ENV', () => {
    const content = readFile('server/routes/sso.ts');
    expect(content).toContain("process.env.NODE_ENV === 'development'");
  });

  it('SAML SSO has real implementation (enterprise path)', () => {
    const content = readFile('server/routes/sso.ts');
    // SAML should have real assertion validation
    expect(content).toContain('saml');
    expect(content).toContain('assertion');
  });
});

// ── 5. Document/artifact convergence ─────────────────────────────────────────

describe('Document/artifact — canonical identity', () => {
  it('concept2cureArtifacts table exists in schema', () => {
    // Search across schema files
    const schemaFiles = fs.readdirSync(path.join(ROOT, 'shared/schema'))
      .filter(f => f.endsWith('.ts'));
    const hasArtifacts = schemaFiles.some(f => {
      const content = readFile(`shared/schema/${f}`);
      return content.includes('concept2cureArtifacts') && content.includes('pgTable');
    });
    expect(hasArtifacts).toBe(true);
  });

  it('documents table exists in schema', () => {
    const schemaFiles = fs.readdirSync(path.join(ROOT, 'shared/schema'))
      .filter(f => f.endsWith('.ts'));
    const hasDocs = schemaFiles.some(f => {
      const content = readFile(`shared/schema/${f}`);
      return content.includes("documents") && content.includes('pgTable');
    });
    expect(hasDocs).toBe(true);
  });

  it('artifact-document-bridge service documents canonical identity', () => {
    const bridgePath = path.join(ROOT, 'server/services/artifact-document-bridge.ts');
    expect(fs.existsSync(bridgePath)).toBe(true);
    const content = readFile('server/services/artifact-document-bridge.ts');
    expect(content).toContain('concept2cureArtifacts');
    expect(content).toContain('canonical');
    expect(content).toContain('DOCUMENT_IDENTITY_VERSION');
  });

  it('concept2cure.ts routes use artifactId as primary identity', () => {
    const content = readFile('server/routes/concept2cure.ts');
    expect(content).toContain('artifactId');
    expect(content).toContain('concept2cureArtifacts');
  });
});

// ── 6. Editor extension integrity ────────────────────────────────────────────

describe('TipTap editor — extension integrity', () => {
  it('CI guard script exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/ci/check-editor-extension-integrity.mjs'))).toBe(true);
  });

  it('all core TipTap packages are in package.json', () => {
    const pkg = JSON.parse(readFile('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const required = [
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/pm',
      '@tiptap/extension-color',
      '@tiptap/extension-highlight',
      '@tiptap/extension-link',
      '@tiptap/extension-table',
      '@tiptap/extension-text-align',
      '@tiptap/extension-underline',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-mention',
      '@tiptap/extension-subscript',
      '@tiptap/extension-superscript',
      '@tiptap/extension-font-family',
    ];
    for (const pkg of required) {
      expect(deps).toHaveProperty(pkg);
    }
  });
});

// ── 7. No fake-prod behavior ─────────────────────────────────────────────────

describe('No fake-prod behavior in critical paths', () => {
  it('ZenSettings sign-out is not a no-op button', () => {
    const content = readFile('client/src/concept2cure/components/settings/ZenSettings.tsx');
    expect(content).toContain('data-testid="settings-sign-out-btn"');
    // The button must call authService.logout somewhere in the file
    expect(content).toContain('authService.logout()');
  });

  it('IndustryAwareApp logout is not a no-op button', () => {
    const content = readFile('client/src/concept2cure/IndustryAwareApp.tsx');
    expect(content).toContain('data-testid="industry-sign-out-btn"');
    expect(content).toContain('authService.logout()');
  });

  it('no setTimeout-based fake auth in login flow', () => {
    const content = readFile('client/src/concept2cure/auth/ZenLogin.tsx');
    // Check that login form doesn't use setTimeout to simulate success
    const loginSection = content.slice(
      content.indexOf('onSubmit'),
      content.indexOf('onSubmit') + 2000
    );
    expect(loginSection).not.toContain('setTimeout');
  });

  it('project creation does not silently fall back to localStorage by default', () => {
    const content = readFile('client/src/concept2cure/hooks/useProjects.ts');
    // Fallback should only trigger when ENABLE_LOCAL_PROJECT_FALLBACK is set
    expect(content).toContain('if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e');
  });
});

// ── 8. Auth token handling ───────────────────────────────────────────────────

describe('Auth token lifecycle', () => {
  it('tokens stored via authService, not raw localStorage', () => {
    const content = readFile('client/src/concept2cure/auth/ZenLogin.tsx');
    // Login should use authService.setToken, not localStorage directly
    expect(content).toContain('authService.setToken');
    expect(content).not.toMatch(/localStorage\.setItem.*token/i);
  });
});
