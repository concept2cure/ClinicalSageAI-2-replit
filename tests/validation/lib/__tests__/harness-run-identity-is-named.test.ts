/**
 * The validation harness signs in as the identity the operator names, never
 * a built-in one. 2026-10-15.
 *
 * tests/validation/lib/harness.mjs defaulted the run identity
 * (VALIDATION_USER_EMAIL) to a real person's personal address, so an OQ run
 * nobody configured dev-logged-in as them, and every step it recorded, every
 * record it created and every audit row it caused was attributed to them.
 * Without VALIDATION_USER_EMAIL it now refuses before any request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['VALIDATION_USER_EMAIL', 'VALIDATION_USER_PASSWORD', 'VALIDATION_USER_TOTP_SECRET'] as const;
const saved: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => new Response('{}', { status: 404 }));

type Harness = {
  devLogin: (baseUrl?: string, email?: string) => Promise<unknown>;
  runCredential: () => { email: string; password: string } | null;
};

/** The harness as a fresh process loads it, under the environment set beforehand. */
async function loadHarness(env: Partial<Record<(typeof KEYS)[number], string>>): Promise<Harness> {
  Object.assign(process.env, env);
  vi.resetModules();
  // @ts-expect-error — a plain .mjs module, no declarations.
  return (await import('../harness.mjs')) as Harness;
}

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

const requests = () => fetchMock.mock.calls.map(([url, init]) => `${url} ${init?.body ?? ''}`);

describe('the OQ harness run identity', () => {
  it('with no VALIDATION_USER_EMAIL, dev-login refuses before any request', async () => {
    const { devLogin } = await loadHarness({});
    const err = await devLogin('http://127.0.0.1:1').then(
      () => null,
      (e: Error) => e,
    );
    expect(requests()).toEqual([]);
    expect(err?.message).toMatch(/VALIDATION_USER_EMAIL/);
  });

  it('with a password but no VALIDATION_USER_EMAIL, refuses to say whose password it is', async () => {
    const { runCredential } = await loadHarness({ VALIDATION_USER_PASSWORD: 'a-real-secret-123' });
    expect(() => runCredential()).toThrow(/VALIDATION_USER_EMAIL/);
  });

  it('signs in as the identity the operator names', async () => {
    const { devLogin, runCredential } = await loadHarness({ VALIDATION_USER_EMAIL: 'oq-runner@local.test' });
    await expect(devLogin('http://127.0.0.1:1')).rejects.toThrow(/dev-login failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'oq-runner@local.test' });
    expect(runCredential()).toBeNull();
  });
});
