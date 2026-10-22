/**
 * The demo administrator seeded at boot is the account the operator names,
 * never a real person. 2026-10-15.
 *
 * seed-default-org defaulted DEMO_USER_EMAIL to a real person's personal
 * address, so every non-production boot (and a production one with
 * SEED_DEMO_USER=true) created an administrator account as them — named
 * "JM Smith", titled "Chief Science Officer", department "Executive
 * Leadership", whichever address was used. Without DEMO_USER_EMAIL it now
 * seeds no account and says why; the account it seeds is shown by the address
 * the operator gave and records no title or department nobody stated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

// Declared with `var` so the hoisted vi.mock factory can see it.
// eslint-disable-next-line no-var
var mockLog: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
vi.mock('../../../utils/logger', () => {
  mockLog = { info: vi.fn(), warn: vi.fn() };
  return { createScopedLogger: () => ({ ...mockLog, error: vi.fn(), debug: vi.fn() }) };
});

import { seedGaDemoUser } from '../seed-default-org';

const KEYS = ['SEED_DEMO_USER', 'DEMO_USER_EMAIL', 'DEMO_USER_PASSWORD', 'NODE_ENV'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  delete process.env.SEED_DEMO_USER;
  delete process.env.DEMO_USER_EMAIL;
  delete process.env.DEMO_USER_PASSWORD;
  process.env.NODE_ENV = 'development';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  mockLog.info.mockClear();
  mockLog.warn.mockClear();
});

function mockClient(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

const calls = (client: ReturnType<typeof mockClient>) =>
  client.query.mock.calls as unknown as Array<[string, unknown[] | undefined]>;

describe('seedGaDemoUser identity', () => {
  it('with no DEMO_USER_EMAIL, seeds no account, names no one, and says why', async () => {
    const client = mockClient([{ id: 7 }]);
    await seedGaDemoUser(client as unknown as PoolClient);

    expect(calls(client).filter(([sql]) => /INSERT INTO (users|organization_users)/.test(sql))).toEqual([]);
    expect(JSON.stringify(calls(client))).not.toMatch(/@gmail\.com/);
    const said = [...mockLog.warn.mock.calls, ...mockLog.info.mock.calls].map((c) => String(c[0])).join('\n');
    expect(said).toContain('DEMO_USER_EMAIL');
    expect(said).not.toMatch(/@gmail\.com/);
  });

  it('seeds the account DEMO_USER_EMAIL names, shown by that address, with no title nobody stated', async () => {
    process.env.DEMO_USER_EMAIL = 'Demo-Admin@Local.Test';
    const client = mockClient([{ id: 7 }]);
    await seedGaDemoUser(client as unknown as PoolClient);

    const insert = calls(client).find(([sql]) => sql.includes('INSERT INTO users'));
    expect(insert?.[1]?.slice(0, 2)).toEqual(['demo-admin@local.test', 'demo-admin@local.test']);
    expect(insert?.[0]).not.toMatch(/Chief Science Officer|Executive Leadership/);
  });
});
