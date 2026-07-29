/**
 * Locks the centralized platform-limits config so future edits can't silently
 * drift the operational envelope (file caps, rate-limit quotas, store sizes,
 * Redis tuning). These were previously duplicated inline across middleware and
 * route files; this test asserts the exact preserved values and immutability.
 */
import { describe, it, expect } from 'vitest';
import {
  FILE_LIMITS,
  RATE_LIMITS,
  LEGACY_RATE_LIMITS,
  RATE_LIMIT_FAIL_CLOSED_CATEGORIES,
  RATE_LIMIT_STORE,
  REDIS,
} from '../../server/config/platform-limits';

const ONE_MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

describe('platform-limits config values', () => {
  it('FILE_LIMITS.maxUploadBytes is 100 MB', () => {
    expect(FILE_LIMITS.maxUploadBytes).toBe(100 * 1024 * 1024);
    expect(FILE_LIMITS.maxUploadBytes).toBe(104_857_600);
  });

  describe('RATE_LIMITS (Redis limiter)', () => {
    it('auth is env-dependent (prod strict, dev relaxed)', () => {
      expect(RATE_LIMITS.auth.windowMs).toBe(IS_PRODUCTION ? FIFTEEN_MINUTES_MS : ONE_MINUTE_MS);
      expect(RATE_LIMITS.auth.maxRequests).toBe(IS_PRODUCTION ? 20 : 300);
    });

    it('api is 100 requests / minute', () => {
      expect(RATE_LIMITS.api).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 100 });
    });

    it('ai is 30 requests / minute and exempts admin roles', () => {
      expect(RATE_LIMITS.ai.windowMs).toBe(ONE_MINUTE_MS);
      expect(RATE_LIMITS.ai.maxRequests).toBe(30);
      expect(RATE_LIMITS.ai.skipRoles).toEqual(['admin', 'super_admin']);
    });

    it('documents is 20 requests / minute', () => {
      expect(RATE_LIMITS.documents).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 20 });
    });

    it('concept2cure is 100 requests / minute', () => {
      expect(RATE_LIMITS.concept2cure).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 100 });
    });

    it('validation is 10 requests / minute', () => {
      expect(RATE_LIMITS.validation).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 10 });
    });

    it('upload is 10 requests / minute', () => {
      expect(RATE_LIMITS.upload).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 10 });
    });
  });

  it('RATE_LIMIT_FAIL_CLOSED_CATEGORIES is [auth, documents]', () => {
    expect([...RATE_LIMIT_FAIL_CLOSED_CATEGORIES]).toEqual(['auth', 'documents']);
  });

  describe('LEGACY_RATE_LIMITS (in-memory limiter)', () => {
    it('auth is 30 requests / 15 minutes', () => {
      expect(LEGACY_RATE_LIMITS.auth).toMatchObject({
        windowMs: FIFTEEN_MINUTES_MS,
        maxRequests: 30,
      });
    });

    it('api is 60 requests / minute', () => {
      expect(LEGACY_RATE_LIMITS.api).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 60 });
    });

    it('validation is 10 requests / minute', () => {
      expect(LEGACY_RATE_LIMITS.validation).toMatchObject({
        windowMs: ONE_MINUTE_MS,
        maxRequests: 10,
      });
    });

    it('ai is 20 requests / minute', () => {
      expect(LEGACY_RATE_LIMITS.ai).toMatchObject({ windowMs: ONE_MINUTE_MS, maxRequests: 20 });
    });
  });

  it('RATE_LIMIT_STORE sizes and interval are preserved', () => {
    expect(RATE_LIMIT_STORE.maxTrackedKeys).toBe(10_000);
    expect(RATE_LIMIT_STORE.memoryStoreMaxSize).toBe(10_000);
    expect(RATE_LIMIT_STORE.memoryStoreCleanupIntervalMs).toBe(60_000);
  });

  it('REDIS tuning defaults are preserved', () => {
    expect(REDIS.maxRetriesPerRequest).toBe(3);
    expect(REDIS.connectTimeoutMs).toBe(5000);
    expect(REDIS.retryBackoffStepMs).toBe(100);
    expect(REDIS.retryBackoffCapMs).toBe(2000);
  });
});

describe('platform-limits immutability', () => {
  it('all exported config objects are frozen', () => {
    expect(Object.isFrozen(FILE_LIMITS)).toBe(true);
    expect(Object.isFrozen(RATE_LIMITS)).toBe(true);
    expect(Object.isFrozen(RATE_LIMITS.auth)).toBe(true);
    expect(Object.isFrozen(RATE_LIMITS.ai)).toBe(true);
    expect(Object.isFrozen(LEGACY_RATE_LIMITS)).toBe(true);
    expect(Object.isFrozen(LEGACY_RATE_LIMITS.auth)).toBe(true);
    expect(Object.isFrozen(RATE_LIMIT_STORE)).toBe(true);
    expect(Object.isFrozen(REDIS)).toBe(true);
    expect(Object.isFrozen(RATE_LIMIT_FAIL_CLOSED_CATEGORIES)).toBe(true);
  });

  it('mutating a frozen config throws in strict mode', () => {
    'use strict';
    expect(() => {
      // @ts-expect-error - intentionally attempting a forbidden mutation
      FILE_LIMITS.maxUploadBytes = 1;
    }).toThrow();
    expect(() => {
      // @ts-expect-error - intentionally attempting a forbidden mutation
      REDIS.connectTimeoutMs = 1;
    }).toThrow();
  });
});
