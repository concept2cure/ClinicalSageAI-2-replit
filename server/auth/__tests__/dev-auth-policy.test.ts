import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDevAuthAllowed, devAuthDenialReason } from '../dev-auth-policy';

describe('isDevAuthAllowed', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.ALLOW_DEV_AUTH;

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_DEV_AUTH;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllow === undefined) {
      delete process.env.ALLOW_DEV_AUTH;
    } else {
      process.env.ALLOW_DEV_AUTH = originalAllow;
    }
  });

  it('returns false when NODE_ENV is unset', () => {
    process.env.ALLOW_DEV_AUTH = '1';
    expect(isDevAuthAllowed()).toBe(false);
  });

  it('returns false in production even with ALLOW_DEV_AUTH=1', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_AUTH = '1';
    expect(isDevAuthAllowed()).toBe(false);
  });

  it('returns false in staging-like envs', () => {
    process.env.NODE_ENV = 'staging';
    process.env.ALLOW_DEV_AUTH = '1';
    expect(isDevAuthAllowed()).toBe(false);
  });

  it('returns false in test env even with the flag', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_DEV_AUTH = '1';
    expect(isDevAuthAllowed()).toBe(false);
  });

  it('returns false in development without the explicit flag', () => {
    process.env.NODE_ENV = 'development';
    expect(isDevAuthAllowed()).toBe(false);
  });

  it('returns false in development when flag is not exactly "1"', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_AUTH = 'true';
    expect(isDevAuthAllowed()).toBe(false);
  });

  it('returns true only when NODE_ENV=development AND ALLOW_DEV_AUTH=1', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_AUTH = '1';
    expect(isDevAuthAllowed()).toBe(true);
  });

  it('devAuthDenialReason explains why it is denied', () => {
    process.env.NODE_ENV = 'production';
    expect(devAuthDenialReason()).toContain('NODE_ENV=production');

    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEV_AUTH;
    expect(devAuthDenialReason()).toContain('ALLOW_DEV_AUTH');
  });
});
