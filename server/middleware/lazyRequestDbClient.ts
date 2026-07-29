/**
 * Lazy wrapper around a pooled Postgres client. The first `.query()` call
 * acquires a connection from the pool, runs the caller's setup hook (used
 * to set the RLS session vars `app.current_tenant_id` / `app.current_user_role`
 * / `app.current_org_id` on that connection), then runs the query. Subsequent
 * `.query()` calls reuse the cached client. `release()` clears the session
 * vars and returns the client to the pool; it is a no-op if no connection
 * was ever acquired.
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
      // node-postgres destroys a pooled client when release receives an
      // error. A clean release is only safe after every reset succeeds.
      client.release(cleanupError ?? undefined);
    }
  }
}
