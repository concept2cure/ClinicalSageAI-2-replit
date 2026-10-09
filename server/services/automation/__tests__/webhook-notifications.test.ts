/**
 * Webhook delivery goes through the DNS-pinned, redirect-refusing fetcher and
 * never echoes a destination's response body (security audit 2026-09-24 IAM-13,
 * plan P1-6).
 *
 * The module's own hostname check (isSafeWebhookUrl) runs once, before
 * delivery. A bare fetch after it follows redirects, so a public host that
 * answers 302 to http://169.254.169.254/… reaches the metadata endpoint, and
 * the error path copied 200 characters of whatever the destination returned
 * into the delivery record and the log. safeFetch pins the resolved address,
 * re-validates every hop and, with redirect 'error', refuses to follow at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock('../../../utils/safeFetch', () => ({ safeFetch: safeFetchMock }));

import {
  notifyWebhooks,
  registerChannel,
  removeChannel,
  type WebhookEvent,
} from '../webhook-notifications';

const ORG = 4242;
const CHANNEL_ID = 'p1-6-channel';
const event: WebhookEvent = {
  type: 'rewrite.completed',
  severity: 'info',
  title: 'Rewrite completed',
  summary: 'Section 2.5 rewritten',
  timestamp: new Date().toISOString(),
};

const bareFetch = vi.fn();

beforeEach(() => {
  safeFetchMock.mockReset();
  bareFetch.mockReset();
  vi.stubGlobal('fetch', bareFetch);
  registerChannel({
    id: CHANNEL_ID,
    platform: 'generic',
    name: 'p1-6',
    url: 'https://hooks.example.com/p1-6',
    enabled: true,
    organizationId: ORG,
    events: ['*'],
  });
});

afterEach(() => {
  removeChannel(CHANNEL_ID);
  vi.unstubAllGlobals();
});

describe('webhook delivery (IAM-13 / P1-6)', () => {
  it('delivers through safeFetch with redirects refused, never through bare fetch', async () => {
    safeFetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    bareFetch.mockResolvedValue(new Response('ok', { status: 200 }));

    const [delivery] = await notifyWebhooks(ORG, event);

    expect(bareFetch).not.toHaveBeenCalled();
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = safeFetchMock.mock.calls[0] as [string, { redirect?: string; method?: string }];
    expect(url).toBe('https://hooks.example.com/p1-6');
    expect(init.redirect).toBe('error');
    expect(init.method).toBe('POST');
    expect(delivery.status).toBe('success');
  });

  it('a refusal by the fetcher (private address, redirect) is a failed delivery, not a thrown error', async () => {
    safeFetchMock.mockRejectedValue(
      new Error('Refused webhook delivery: unexpected redirect (HTTP 302 -> http://169.254.169.254/latest/); caller requested no redirect following.'),
    );
    bareFetch.mockResolvedValue(new Response('ok', { status: 200 }));

    const [delivery] = await notifyWebhooks(ORG, event);

    expect(delivery.status).toBe('failed');
    expect(delivery.error).toMatch(/Refused/);
    expect(bareFetch).not.toHaveBeenCalled();
  });

  it('a non-2xx response is recorded by status alone; the destination body is never echoed', async () => {
    const leaked = 'internal hostname db-primary.internal secret=abc123';
    safeFetchMock.mockResolvedValue(new Response(leaked, { status: 500 }));
    bareFetch.mockResolvedValue(new Response(leaked, { status: 500 }));

    const [delivery] = await notifyWebhooks(ORG, event);

    expect(delivery.status).toBe('failed');
    expect(delivery.statusCode).toBe(500);
    expect(delivery.error).toBe('HTTP 500');
    expect(JSON.stringify(delivery)).not.toContain('db-primary');
  });

  it('a 2xx response is a success with the status code', async () => {
    safeFetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    bareFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const [delivery] = await notifyWebhooks(ORG, event);

    expect(delivery.status).toBe('success');
    expect(delivery.statusCode).toBe(204);
  });
});
