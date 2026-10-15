/**
 * The launch-demo seed signs in as the account the operator names — no
 * built-in identity. 2026-10-15.
 *
 * scripts/demo/launch-demo/lib.mjs connect(): with no DEMO_SEED_TOKEN, no
 * --email and no DEMO_SEED_EMAIL it dev-logged-in as a hard-coded personal
 * address (the founder's), so every demo record was created as, and audited
 * to, a real person nobody named.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error — a plain .mjs module, no declarations.
import { connect } from '../../scripts/demo/launch-demo/lib.mjs';

const KEYS = ['DEMO_SEED_TOKEN', 'DEMO_SEED_EMAIL', 'DEMO_BASE_URL'] as const;
const saved: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => new Response('{}', { status: 404 }));

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('launch-demo connect()', () => {
  it('with no token and no email, refuses before any request — no built-in identity', async () => {
    const err = await connect({ baseUrl: 'http://127.0.0.1:1' }).then(
      () => null,
      (e: Error) => e,
    );
    expect(fetchMock.mock.calls.map(([url, init]) => `${url} ${init?.body ?? ''}`)).toEqual([]);
    expect(err?.message).toMatch(/DEMO_SEED_EMAIL/);
  });

  it('signs in as the email the operator passes', async () => {
    await expect(connect({ baseUrl: 'http://127.0.0.1:1', email: 'operator@local.test' })).rejects.toThrow(/dev-login failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'operator@local.test' });
  });
});
