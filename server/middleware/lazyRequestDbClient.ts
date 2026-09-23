/**
 * Lazy wrapper around a pooled Postgres client. The first `.query()` call
 * acquires a connection from the pool, runs the caller's setup hook (used
 * to set the RLS session vars `app.current_tenant_id` / `app.current_user_role`
 * / `app.current_org_id` on that connection), then runs the query. Subsequent
 * `.query()` calls reuse the cached client. `release()` clears the session
 * vars and returns the client to the pool, or discards it when a transaction
 * is still open on it; it is a no-op if no connection was ever acquired.
 *
 * The point is to stop spending a pool slot on every authenticated request
 * regardless of whether the handler actually touches the database — before
 * this wrapper, `requireTenantContext` acquired eagerly and held the client
 * for the full request lifecycle.
 *
 * Lives in its own file so unit tests can import it without dragging in
 * the full tenantContext middleware (and its transitive `server/db` import).
 */

import type { Pool, PoolClient } from 'pg';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('lazy-request-db-client');

function asError(value: unknown, message: string): Error {
  if (value instanceof Error) return value;
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = value;
  return error;
}

/**
 * Minimal contract the request-scoped DB client exposes to route handlers.
 * Pinned to `Pool['query']` so its overload set is identical to `pg.Pool` —
 * existing call sites (`await req.dbClient.query(...)`) keep working with
 * every overload variant (string, QueryConfig, with/without params), and
 * the union `RequestDbClient | Pool` resolves to a callable `.query`.
 * Drizzle's node-postgres driver only calls `.query()` on the client, so
 * the lazy wrapper satisfies it.
 */
export type RequestDbClient = {
  query: Pool['query'];
};

export class LazyRequestDbClient implements RequestDbClient {
  private acquired: Promise<PoolClient> | null = null;
  private released = false;

  // Declared as a field so its overload signature is structurally identical
  // to `pg.Pool['query']` — a method with a single overload wouldn't satisfy
  // pg's multi-overload interface.
  readonly query: Pool['query'];

  constructor(
    private readonly pool: Pool,
    private readonly applySessionVars: (client: PoolClient) => Promise<void>,
  ) {
    this.query = ((...args: unknown[]) => {
      return this.ensure().then((client) =>
        (client.query as (...a: unknown[]) => unknown)(...args),
      );
    }) as Pool['query'];
  }

  private async ensure(): Promise<PoolClient> {
    if (this.released) {
      throw new Error('Cannot query a released request DB client');
    }
    if (!this.acquired) {
      this.acquired = (async () => {
        const client = await this.pool.connect();
        try {
          await this.applySessionVars(client);
        } catch (err) {
          // Session setup may have failed after setting only some variables.
          // Evict the connection instead of returning indeterminate tenant
          // state to the reusable pool.
          client.release(asError(err, 'Failed to apply tenant session variables'));
          throw err;
        }
        return client;
      })();
    }
    return this.acquired;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (!this.acquired) return;

    let client: PoolClient;
    try {
      client = await this.acquired;
    } catch {
      // Acquisition itself failed — nothing to release.
      return;
    }

    let cleanupError: Error | null = null;
    try {
      await client.query("SELECT set_config('app.current_tenant_id', '', false)");
      await client.query("SELECT set_config('app.current_user_role', '', false)");
      await client.query("SELECT set_config('app.current_org_id', '', false)");
    } catch (err) {
      cleanupError = asError(err, 'Failed to clear tenant session variables');
      logger.warn('Failed to clear tenant session vars on release', {
        error: cleanupError.message,
      });
    } finally {
      // The resets queue behind any statement still in flight, so by now the
      // status is current. A request that closed between BEGIN and COMMIT (a
      // client abort fires res 'close') leaves the connection inside its
      // transaction. Pooled, the next request would run inside it: its COMMIT
      // could commit this request's half-written, unaudited change, and a
      // rollback would revert the session variables (set with is_local=false,
      // so transactional) to THIS tenant's. Discarding the connection makes
      // Postgres roll the transaction back on disconnect.
      const status = transactionStatus(client);
      if (!cleanupError && status !== null && status !== 'I') {
        cleanupError = new Error(
          `Request DB client released inside an open transaction (status ${status}); connection discarded so the transaction rolls back`,
        );
        logger.warn('Discarded a request DB client released mid-transaction', { status });
      }
      // node-postgres destroys a pooled client when release receives an
      // error. A clean release is only safe after every reset succeeds and
      // no transaction is open.
      client.release(cleanupError ?? undefined);
    }
  }
}

/**
 * The connection's transaction status as node-postgres last read it from
 * ReadyForQuery: 'I' idle, 'T' in a transaction, 'E' in a failed one. Null when
 * the client does not report it (pg before 8.x's getTransactionStatus).
 */
function transactionStatus(client: PoolClient): string | null {
  const read = (client as PoolClient & { getTransactionStatus?: () => string | null }).getTransactionStatus;
  return typeof read === 'function' ? read.call(client) ?? null : null;
}
