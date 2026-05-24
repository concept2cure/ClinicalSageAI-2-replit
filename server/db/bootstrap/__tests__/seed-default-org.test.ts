import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import { seedGaDemoUser } from '../seed-default-org';

function mockClient(rows: unknown[] = []): PoolClient {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as PoolClient;
}

const ORIGINAL = process.env.SEED_DEMO_USER;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SEED_DEMO_USER;
  else process.env.SEED_DEMO_USER = ORIGINAL;
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

  it('proceeds when SEED_DEMO_USER is unset (default behavior preserved)', async () => {
    delete process.env.SEED_DEMO_USER;
    // Org lookup returns no rows, so the seed is a safe no-op after the first
    // query — enough to prove the gate did not short-circuit.
    const client = mockClient([]);
    await seedGaDemoUser(client);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('proceeds when SEED_DEMO_USER=true', async () => {
    process.env.SEED_DEMO_USER = 'true';
    const client = mockClient([]);
    await seedGaDemoUser(client);
    expect(client.query).toHaveBeenCalled();
  });
});
