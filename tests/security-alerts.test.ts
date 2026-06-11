/**
 * Security-alert routing (decision register #727 item 9): console always,
 * webhook only when configured, and delivery failure never throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('reportSecurityAlert', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.SECURITY_ALERT_WEBHOOK_URL;
    vi.restoreAllMocks();
  });

  it('logs to console and skips the webhook when none is configured', async () => {
    delete process.env.SECURITY_ALERT_WEBHOOK_URL;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const { reportSecurityAlert } = await import('../server/services/security-alerts');
    reportSecurityAlert({ kind: 'test_event', message: 'test message' });

    expect(console.warn).toHaveBeenCalledWith('[SECURITY] test message', '');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs the structured payload when a webhook is configured', async () => {
    process.env.SECURITY_ALERT_WEBHOOK_URL = 'https://alerts.example/hook';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchSpy as any;

    const { reportSecurityAlert } = await import('../server/services/security-alerts');
    reportSecurityAlert({
      kind: 'tenant_impersonation_blocked',
      message: 'blocked',
      detail: { userId: 7 },
    });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://alerts.example/hook');
    const body = JSON.parse(init.body);
    expect(body.kind).toBe('tenant_impersonation_blocked');
    expect(body.detail).toEqual({ userId: 7 });
    expect(body.severity).toBe('warning');
  });

  it('swallows webhook delivery failures without throwing', async () => {
    process.env.SECURITY_ALERT_WEBHOOK_URL = 'https://alerts.example/hook';
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = fetchSpy as any;

    const { reportSecurityAlert } = await import('../server/services/security-alerts');
    expect(() => reportSecurityAlert({ kind: 'x', message: 'y' })).not.toThrow();
    await vi.waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        '[SECURITY] alert webhook delivery failed:',
        'ECONNREFUSED'
      )
    );
  });
});
