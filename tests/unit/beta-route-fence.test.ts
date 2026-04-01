import { describe, expect, it, vi } from 'vitest';
import { createBetaRouteFence, isBetaRouteFenceEnabled } from '../../server/middleware/betaRouteFence';

describe('betaRouteFence middleware', () => {
  it('is disabled by default', () => {
    expect(isBetaRouteFenceEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('blocks configured mock/scaffold route prefixes when enabled', () => {
    const middleware = createBetaRouteFence({
      ENABLE_BETA_ROUTE_FENCE: 'true',
    } as NodeJS.ProcessEnv);

    const status = vi.fn(() => ({ json: vi.fn() }));
    const setHeader = vi.fn();
    const res: any = { status, setHeader };
    const next = vi.fn();

    middleware({ path: '/evidence/search' } as any, res, next);

    expect(setHeader).toHaveBeenCalledWith('X-Route-Hardening', 'beta-route-fenced');
    expect(status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows non-blocked routes when enabled', () => {
    const middleware = createBetaRouteFence({
      ENABLE_BETA_ROUTE_FENCE: 'true',
    } as NodeJS.ProcessEnv);

    const status = vi.fn(() => ({ json: vi.fn() }));
    const setHeader = vi.fn();
    const res: any = { status, setHeader };
    const next = vi.fn();

    middleware({ path: '/ana-ri/chat' } as any, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

