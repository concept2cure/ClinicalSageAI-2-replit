import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

// Captured so the demo-password warning can be asserted (and kept out of the
// test output). Declared with `var` so the hoisted vi.mock factory can see it.
// eslint-disable-next-line no-var
var mockLog: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
vi.mock('../../../utils/logger', () => {
  mockLog = { info: vi.fn(), warn: vi.fn() };
  return {
    createScopedLogger: () => ({
      ...mockLog,
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

import { seedGaDemoUser } from '../seed-default-org';

function mockClient(rows: unknown[] = []): PoolClient {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as PoolClient;
}

const ORIGINAL = process.env.SEED_DEMO_USER;
const ORIGINAL_PASSWORD = process.env.DEMO_USER_PASSWORD;
const ORIGINAL_ENV = process.env.NODE_ENV;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SEED_DEMO_USER;
  else process.env.SEED_DEMO_USER = ORIGINAL;
  if (ORIGINAL_PASSWORD === undefined) delete process.env.DEMO_USER_PASSWORD;
  else process.env.DEMO_USER_PASSWORD = ORIGINAL_PASSWORD;
  process.env.NODE_ENV = ORIGINAL_ENV;
  mockLog.info.mockClear();
  mockLog.warn.mockClear();
  vi.restoreAllMocks();
});

describe('seedGaDemoUser — SEED_DEMO_USER gate', () => {
  for (const value of ['false', '0', 'no', 'off', 'FALSE', ' Off ']) {
    it(`skips the demo admin seed when SEED_DEMO_USER=${JSON.stringify(value)}`, async () => {
      process.env.SEED_DEMO_USER = value;
      const client = mockClient();
      await seedGaDemoUser(client);
      // Disabled: returns before touching the database at all.
      expect(client.query).not.toHaveBeenCalled();
    });
  }

  it('non-prod: proceeds when SEED_DEMO_USER is unset (dev convenience default)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SEED_DEMO_USER;
    // Org lookup returns no rows, so the seed is a safe no-op after the first
    // query — enough to prove the gate did not short-circuit.
    const client = mockClient([]);
    await seedGaDemoUser(client);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('PRODUCTION: skips the seed when SEED_DEMO_USER is unset (fail-closed)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SEED_DEMO_USER;
    const client = mockClient();
    await seedGaDemoUser(client);
    // No known-password admin unless explicitly opted in.
    expect(client.query).not.toHaveBeenCalled();
  });

  it('PRODUCTION: proceeds only when SEED_DEMO_USER=true (explicit opt-in)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_DEMO_USER = 'true';
    const client = mockClient([]);
    await seedGaDemoUser(client);
    expect(client.query).toHaveBeenCalled();
  });
});

describe('seedGaDemoUser — demo password source', () => {
  // Pre-computed bcrypt("pass-word", 12) baked into the seed as the fallback.
  const KNOWN_HASH = '$2b$12$ZE1acJqmLIAbDLl2h2eUiOeXLXCunsidscRZDA7Wt4.kiYBiNgFnu';

  /** Params of the `INSERT INTO users` call. */
  function insertedUserParams(client: PoolClient): unknown[] {
    const calls = (client.query as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const insert = calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO users')
    );
    return (insert?.[1] ?? []) as unknown[];
  }

  it('hashes DEMO_USER_PASSWORD at cost 12 instead of using the known hash', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DEMO_USER_PASSWORD = 'a-non-guessable-pilot-secret';
    const client = mockClient([{ id: 7 }]);

    await seedGaDemoUser(client);

    const hash = insertedUserParams(client)[2] as string;
    expect(hash).not.toBe(KNOWN_HASH);
    expect(hash.startsWith('$2')).toBe(true);
    expect(hash.split('$')[2]).toBe('12'); // same bcrypt cost as the constant
    expect(await bcrypt.compare('a-non-guessable-pilot-secret', hash)).toBe(true);
    // Override in play: nothing publicly known was seeded, so no warning.
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('ignores a blank DEMO_USER_PASSWORD and keeps the known-hash path working', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_USER_PASSWORD = '   ';
    const client = mockClient([{ id: 7 }]);

    await seedGaDemoUser(client);

    expect(insertedUserParams(client)[2]).toBe(KNOWN_HASH);
  });

  it('warns loudly when the publicly-known password is seeded outside local dev', async () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.DEMO_USER_PASSWORD;
    const client = mockClient([{ id: 7 }]);

    await seedGaDemoUser(client);

    expect(insertedUserParams(client)[2]).toBe(KNOWN_HASH);
    expect(mockLog.warn).toHaveBeenCalledTimes(1);
    const warning = mockLog.warn.mock.calls[0][0] as string;
    expect(warning).toContain('jm.smith@concept2cure.pro');
    expect(warning).toContain('PUBLICLY KNOWN');
    expect(warning).toContain('DEMO_USER_PASSWORD');
  });

  it('stays quiet on the local development default (dev convenience unchanged)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_USER_PASSWORD;
    const client = mockClient([{ id: 7 }]);

    await seedGaDemoUser(client);

    expect(insertedUserParams(client)[2]).toBe(KNOWN_HASH);
    expect(mockLog.warn).not.toHaveBeenCalled();
  });
});
