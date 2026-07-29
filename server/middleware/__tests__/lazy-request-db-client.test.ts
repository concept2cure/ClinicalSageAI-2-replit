/**
 * Lazy DB client semantics — pins the property that makes the refactor
 * worthwhile: a request that never queries the database must never
 * acquire a pool slot.
 *
 * Before this branch, `requireTenantContext` eagerly called pool.connect()
 * on every authenticated request and held the client until the response
 * finished. That capped concurrent authenticated traffic at pool size,
 * regardless of whether handlers actually touched the DB.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LazyRequestDbClient } from '../lazyRequestDbClient';

type FakePoolClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

function makeFakeClient(): FakePoolClient {
  return {
    query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  };
}

function makeFakePool(client: FakePoolClient = makeFakeClient()) {
  return {
    connect: vi.fn(() => Promise.resolve(client)),
    __client: client,
  };
}

describe('LazyRequestDbClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call pool.connect() until the first query', async () => {
    const pool = makeFakePool();
    const apply = vi.fn(async () => {});

    const lazy = new LazyRequestDbClient(pool as any, apply);

    expect(pool.connect).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();

    await lazy.query('SELECT 1');

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(pool.__client);
  });

  it('reuses the same connection across multiple queries', async () => {
    const pool = makeFakePool();
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.query('SELECT 1');
    await lazy.query('SELECT 2');
    await lazy.query('SELECT 3');

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(pool.__client.query).toHaveBeenCalledTimes(3);
  });

  it('forwards query args verbatim to the underlying client', async () => {
    const pool = makeFakePool();
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.query('SELECT $1::int', [42]);

    expect(pool.__client.query).toHaveBeenCalledWith('SELECT $1::int', [42]);
  });

  it('release() is a no-op when no connection was ever acquired', async () => {
    const pool = makeFakePool();
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.release();

    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.__client.release).not.toHaveBeenCalled();
  });

  it('release() clears session vars and returns the client to the pool', async () => {
    const pool = makeFakePool();
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.query('SELECT 1');
    await lazy.release();

    // Three SET-config queries to clear the RLS session vars, then release.
    const clearCalls = pool.__client.query.mock.calls.filter((args: unknown[]) =>
      typeof args[0] === 'string' && (args[0] as string).includes("set_config('app."),
    );
    expect(clearCalls).toHaveLength(3);
    expect(pool.__client.release).toHaveBeenCalledTimes(1);
  });

  it('throws when query() is called after release()', async () => {
    const pool = makeFakePool();
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.release();

    await expect(lazy.query('SELECT 1')).rejects.toThrow(/released/i);
  });

  it('coalesces concurrent first-query calls into a single connect()', async () => {
    const pool = makeFakePool();
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await Promise.all([lazy.query('SELECT 1'), lazy.query('SELECT 2'), lazy.query('SELECT 3')]);

    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});
