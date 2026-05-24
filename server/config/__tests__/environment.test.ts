/**
 * Pins the JWT secret validation contract: any deployment that boots
 * with a missing or too-short secret must fail at config load, before
 * the HTTP server ever accepts a request. A short HMAC secret is
 * brute-forceable; a missing one means jsonwebtoken would sign with
 * `undefined` and produce trivially-forgeable tokens.
 *
 * The check runs in `server/config/environment.ts::getJwtSecret` so it
 * fires once on import and applies regardless of which variant
 * (JWT_SECRET, JWT_SECRET_PROD, JWT_SECRET_STAGING, JWT_SECRET_DEV) is
 * the source.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_SECRET = 'a'.repeat(32);
const SHORT_SECRET = 'a'.repeat(16);

describe('getJwtSecret', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    delete process.env.JWT_SECRET;
    delete process.env.JWT_SECRET_DEV;
    delete process.env.JWT_SECRET_STAGING;
    delete process.env.JWT_SECRET_PROD;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('throws when no secret is set', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://test'; // unrelated required env
    process.env.DATABASE_URL_DEV = 'postgres://test';
    await expect(import('../environment')).rejects.toThrow(/Missing required JWT secret/);
  });

  it('throws when the env-specific secret is too short', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.JWT_SECRET_DEV = SHORT_SECRET;
    await expect(import('../environment')).rejects.toThrow(/JWT secret too short/);
  });

  it('throws when the generic fallback secret is too short', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.JWT_SECRET = SHORT_SECRET;
    await expect(import('../environment')).rejects.toThrow(/JWT secret too short/);
  });

  it('loads when the env-specific secret has sufficient length', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.JWT_SECRET_DEV = VALID_SECRET;
    const { config } = await import('../environment');
    expect(config.jwt.secret).toBe(VALID_SECRET);
  });

  it('prefers the env-specific secret over the generic fallback', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.JWT_SECRET_DEV = VALID_SECRET;
    process.env.JWT_SECRET = 'b'.repeat(40); // different value
    const { config } = await import('../environment');
    expect(config.jwt.secret).toBe(VALID_SECRET);
  });

  it('error message does not echo the secret value', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.JWT_SECRET_DEV = SHORT_SECRET;
    try {
      await import('../environment');
      throw new Error('expected throw');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(SHORT_SECRET);
    }
  });
});

describe('getCurrentEnvironment', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    process.env.JWT_SECRET = VALID_SECRET;
    process.env.DATABASE_URL = 'postgres://test';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.DATABASE_URL_PROD = 'postgres://test';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('refuses to load on a set-but-unrecognized NODE_ENV', async () => {
    // The dangerous silent path: "prod" is not "production", so the old code
    // defaulted to development (DEV secrets, isDevelopment=true) in what the
    // operator believed was production. It must fail loud instead.
    process.env.NODE_ENV = 'prod';
    await expect(import('../environment')).rejects.toThrow(/Unrecognized NODE_ENV/);
  });

  it('defaults to development when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV;
    const { config } = await import('../environment');
    expect(config.env).toBe('development');
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
  });

  it('recognizes production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET_PROD = VALID_SECRET;
    const { config } = await import('../environment');
    expect(config.env).toBe('production');
    expect(config.isProduction).toBe(true);
    expect(config.isDevelopment).toBe(false);
  });

  it('recognizes test', async () => {
    process.env.NODE_ENV = 'test';
    const { config } = await import('../environment');
    expect(config.env).toBe('test');
    expect(config.isTest).toBe(true);
    expect(config.isProduction).toBe(false);
  });
});
