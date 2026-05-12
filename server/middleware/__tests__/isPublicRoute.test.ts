import { describe, it, expect } from 'vitest';
import { isPublicRoute } from '../auth.js';

describe('isPublicRoute', () => {
  it('matches exact public routes', () => {
    expect(isPublicRoute('/auth/login')).toBe(true);
    expect(isPublicRoute('/auth/register')).toBe(true);
    expect(isPublicRoute('/api/health')).toBe(true);
    expect(isPublicRoute('/api/public')).toBe(true);
  });

  it('matches strict subpaths under public routes', () => {
    expect(isPublicRoute('/api/health/live')).toBe(true);
    expect(isPublicRoute('/api/public/status')).toBe(true);
  });

  it('does NOT match crafted paths that only share a prefix', () => {
    // Regression: previous startsWith() let '/auth/loginEvil' bypass auth.
    expect(isPublicRoute('/auth/loginEvil')).toBe(false);
    expect(isPublicRoute('/api/publicSecretLeak')).toBe(false);
    expect(isPublicRoute('/api/healthcheck-internal')).toBe(false);
  });

  it('does not match unrelated paths', () => {
    expect(isPublicRoute('/api/users/42')).toBe(false);
    expect(isPublicRoute('/api/secret-data')).toBe(false);
  });
});
