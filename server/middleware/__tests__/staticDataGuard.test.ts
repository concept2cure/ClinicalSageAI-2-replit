import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assertNoStaticDataFlagsInProduction,
  isStaticDataEnabled,
  requireStaticDataEnabled,
  sendStaticDataDisabled,
} from '../staticDataGuard';

describe('staticDataGuard', () => {
  const prior = process.env.ENABLE_TEST_STATIC_DATA;

  beforeEach(() => {
    delete process.env.ENABLE_TEST_STATIC_DATA;
  });

  afterEach(() => {
    if (prior === undefined) {
      delete process.env.ENABLE_TEST_STATIC_DATA;
    } else {
      process.env.ENABLE_TEST_STATIC_DATA = prior;
    }
  });

  it('returns true only when env flag is exactly true', () => {
    expect(isStaticDataEnabled('ENABLE_TEST_STATIC_DATA')).toBe(false);
    process.env.ENABLE_TEST_STATIC_DATA = 'false';
    expect(isStaticDataEnabled('ENABLE_TEST_STATIC_DATA')).toBe(false);
    process.env.ENABLE_TEST_STATIC_DATA = 'true';
    expect(isStaticDataEnabled('ENABLE_TEST_STATIC_DATA')).toBe(true);
  });

  it('returns standardized fail-closed payload and headers', () => {
    const setHeader = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { setHeader, status };

    sendStaticDataDisabled(res, 'Test endpoint', 'ENABLE_TEST_STATIC_DATA');

    expect(setHeader).toHaveBeenCalledWith('X-Route-Hardening', 'static-business-data-blocked');
    expect(setHeader).toHaveBeenCalledWith('X-Route-Enable-Flag', 'ENABLE_TEST_STATIC_DATA');
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'STATIC_BUSINESS_DATA_DISABLED',
        error: 'Test endpoint is temporarily unavailable',
        requiredFlag: 'ENABLE_TEST_STATIC_DATA',
      })
    );
  });

  it('throws if static-data flags are enabled in production', () => {
    expect(() =>
      assertNoStaticDataFlagsInProduction('production', {
        ENABLE_HAQ_MANAGER_STATIC_DATA: 'true',
      } as NodeJS.ProcessEnv)
    ).toThrow(/Static-data routes cannot be enabled in production/);
  });

  it('does not throw outside production', () => {
    expect(() =>
      assertNoStaticDataFlagsInProduction('development', {
        ENABLE_HAQ_MANAGER_STATIC_DATA: 'true',
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it('middleware blocks and returns 503 when static data is disabled', () => {
    const setHeader = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { setHeader, status };
    const next = vi.fn();
    const middleware = requireStaticDataEnabled('ENABLE_TEST_STATIC_DATA', 'Guarded endpoint');

    middleware({} as any, res, next);

    expect(status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('middleware allows request flow when static data is enabled', () => {
    process.env.ENABLE_TEST_STATIC_DATA = 'true';
    const next = vi.fn();
    const middleware = requireStaticDataEnabled('ENABLE_TEST_STATIC_DATA', 'Guarded endpoint');

    middleware({} as any, {} as any, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
