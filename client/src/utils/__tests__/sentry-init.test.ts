/**
 * Pins the options the browser Sentry client is initialised with. Until
 * 2026-09-26 `utils/sentry.ts` took the library defaults: no `beforeSend`, no
 * `sendDefaultPii` decision, replay masking left implicit (audit DP-26, plan
 * P1-27). A default is not a control; these cases make the choices explicit so
 * a refactor cannot drop them silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initSpy, replaySpy } = vi.hoisted(() => ({
  initSpy: vi.fn(),
  replaySpy: vi.fn((options: unknown) => ({ name: 'Replay', options })),
}));

vi.mock('@sentry/react', () => ({
  init: initSpy,
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  replayIntegration: replaySpy,
}));

const DSN = 'https://public@o0.ingest.sentry.io/1';

describe('utils/sentry — how the browser client is initialised', () => {
  beforeEach(() => {
    vi.resetModules();
    initSpy.mockClear();
    replaySpy.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not initialise without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    await import('../sentry');
    expect(initSpy).not.toHaveBeenCalled();
  });

  it('never sends default PII, and every event and breadcrumb passes the scrubber', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    await import('../sentry');
    expect(initSpy).toHaveBeenCalledTimes(1);
    const options = initSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(options.dsn).toBe(DSN);
    expect(options.sendDefaultPii).toBe(false);
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeBreadcrumb).toBe('function');

    const beforeSend = options.beforeSend as (event: unknown) => Record<string, unknown> | null;
    const sent = beforeSend({
      user: { id: 'u-1', email: 'ops@example.org', ip_address: '10.0.0.7' },
      request: { headers: { Authorization: 'Bearer a.b.c' }, cookies: { sid: '1' } },
      extra: { password: 'hunter2' },
    });
    expect(sent?.user).toEqual({ id: 'u-1', email: '[REDACTED]' });
    expect(sent?.request).toEqual({ headers: { Authorization: '[REDACTED]' } });
    expect(sent?.extra).toEqual({ password: '[REDACTED]' });

    const beforeBreadcrumb = options.beforeBreadcrumb as (crumb: unknown) => Record<string, unknown> | null;
    expect(beforeBreadcrumb({ message: 'sent to ops@example.org' })).toEqual({ message: 'sent to [REDACTED]' });
  });

  it('replays mask every text node and input and block every image, video and canvas', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    await import('../sentry');
    expect(replaySpy).toHaveBeenCalledTimes(1);
    expect(replaySpy.mock.calls[0][0]).toEqual(expect.objectContaining({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }));
  });
});
