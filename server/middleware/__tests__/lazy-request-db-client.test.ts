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
    expect(pool.__client.release).toHaveBeenCalledWith(undefined);
  });

  it('evicts the client when applying tenant session vars fails', async () => {
    const pool = makeFakePool();
    const setupError = new Error('session setup failed');
    const lazy = new LazyRequestDbClient(pool as any, async () => {
      throw setupError;
    });

    await expect(lazy.query('SELECT 1')).rejects.toBe(setupError);

    expect(pool.__client.release).toHaveBeenCalledTimes(1);
    expect(pool.__client.release).toHaveBeenCalledWith(setupError);
    expect(pool.__client.query).not.toHaveBeenCalledWith('SELECT 1');
  });

  it('evicts the client when clearing any tenant session var fails', async () => {
    const pool = makeFakePool();
    const cleanupError = new Error('reset failed');
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.query('SELECT 1');
    pool.__client.query.mockRejectedValueOnce(cleanupError);
    await lazy.release();

    expect(pool.__client.release).toHaveBeenCalledTimes(1);
    expect(pool.__client.release).toHaveBeenCalledWith(cleanupError);
  });

  it('does not offer a cleanup-failed client to the next tenant borrower', async () => {
    const first = makeFakeClient();
    const second = makeFakeClient();
    let reusable: FakePoolClient | undefined = first;
    const pool = {
      connect: vi.fn(async () => {
        const selected = reusable ?? second;
        selected.release.mockImplementation((error?: Error) => {
          reusable = error ? undefined : selected;
        });
        return selected;
      }),
    };

    const tenantA = new LazyRequestDbClient(pool as any, async () => {});
    await tenantA.query('SELECT tenant_a');
    first.query.mockRejectedValueOnce(new Error('reset failed'));
    await tenantA.release();

    const tenantB = new LazyRequestDbClient(pool as any, async () => {});
    await tenantB.query('SELECT tenant_b');

    expect(first.release).toHaveBeenCalledWith(expect.any(Error));
    expect(second.query).toHaveBeenCalledWith('SELECT tenant_b');
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

/* A client that models node-postgres's transaction status: every statement
   leaves 'I' (idle), 'T' (inside a transaction) or 'E' (failed transaction),
   read back through getTransactionStatus(), as pg 8 reports it from
   ReadyForQuery. */
function makeTxClient() {
  let status: 'I' | 'T' | 'E' = 'I';
  return {
    query: vi.fn(async (sql: string) => {
      const s = String(sql).trim().toUpperCase();
      if (s === 'BEGIN') status = 'T';
      else if (s === 'COMMIT' || s === 'ROLLBACK') status = 'I';
      else if (s === 'FAIL') { status = 'E'; throw new Error('boom'); }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
    getTransactionStatus: () => status,
  };
}

describe('LazyRequestDbClient: an open transaction never goes back to the pool', () => {
  it('a connection released inside an open transaction is discarded, not returned to the pool', async () => {
    /* The request closed between BEGIN and COMMIT (a client abort fires
       res 'close'). Pooled, the connection would carry the open transaction to
       the next request: its statements would join it, its COMMIT could commit
       this request's unaudited half-write, and a rollback would revert the
       session variables to THIS tenant's. Discarding it makes Postgres roll the
       transaction back on disconnect. */
    const client = makeTxClient();
    const pool = makeFakePool(client as any);
    const lazy = new LazyRequestDbClient(pool as any, async () => {});

    await lazy.query('BEGIN');
    await lazy.query("UPDATE quality_management_plans SET status = 'active'");
    await lazy.release();

    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
    expect((client.release.mock.calls[0][0] as Error).message).toMatch(/open transaction/);
  });

  it('a failed transaction is discarded too', async () => {
    const client = makeTxClient();
    const lazy = new LazyRequestDbClient(makeFakePool(client as any) as any, async () => {});
    await lazy.query('BEGIN');
    await expect(lazy.query('FAIL')).rejects.toThrow('boom');
    await lazy.release();
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it('a committed transaction returns the connection to the pool', async () => {
    const client = makeTxClient();
    const lazy = new LazyRequestDbClient(makeFakePool(client as any) as any, async () => {});
    await lazy.query('BEGIN');
    await lazy.query('INSERT INTO t VALUES (1)');
    await lazy.query('COMMIT');
    await lazy.release();
    expect(client.release).toHaveBeenCalledWith(undefined);
  });
});
