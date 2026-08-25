/**
 * Per-request Drizzle instance bound to the request-scoped Postgres
 * client (`req.dbClient`) that `requireTenantContext` middleware sets up.
 *
 * Why this helper exists:
 *
 *   The default Drizzle instance (`db` from server/db/runtime.ts) is bound
 *   to the shared Pool. Every query goes out on whatever idle connection
 *   the pool hands back, which means the connection-scoped session vars
 *   (app.current_tenant_id, app.current_user_role) set by middleware are
 *   NOT applied — they live on a different connection.
 *
 *   Once RLS is enforced (RLS_ENFORCE=on, post-PR-B), queries issued
 *   through that shared `db` would silently return zero rows for any
 *   tenant-keyed table, because the policy can't read a tenant id from
 *   a connection that never had one set.
 *
 *   `requestDb(req)` returns a Drizzle wrapped around the request-scoped
 *   lazy wrapper. Drizzle's node-postgres driver only calls `.query()` on
 *   the client, which our lazy wrapper exposes — first call acquires a
 *   pool connection and applies session-level tenant variables on it,
 *   then delegates. So all queries through this Drizzle instance run on
 *   the same connection with the RLS session vars set, and connection
 *   acquisition is deferred until the first DB hit.
 *
 * Use it any time you would have written `db.select().from(...)` inside
 * a route handler:
 *
 *   import { requestDb } from '../db/requestDb';
 *   ...
 *   const rdb = requestDb(req);
 *   const rows = await rdb.select().from(projects).where(...);
 *
 * The wrapper is built once per request and cached on the request
 * object (`req.__requestDb`) so multiple calls in the same handler do
 * not pay the construction cost twice.
 *
 * This helper is intentionally unsafe outside a tenant request scope. If
 * `req.dbClient` is absent or malformed, it throws a typed error rather than
 * falling back to the shared pool. System operations must use an explicitly
 * audited system database path; they must never manufacture a request.
 */

import type { Request } from 'express';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/schema';

type Schema = typeof schema;
export type RequestDb = NodePgDatabase<Schema>;

interface RequestWithCachedDb extends Request {
  __requestDb?: RequestDb;
}

export class MissingRequestDbContextError extends Error {
  readonly code = 'REQUEST_DB_CONTEXT_REQUIRED';
  readonly statusCode = 500;

  constructor() {
    super('Request-scoped database context is required');
    this.name = 'MissingRequestDbContextError';
  }
}

/**
 * Minimal pg-style query surface of the request-scoped client. For tables that
 * have NO Drizzle definition in shared/schema (e.g. literature_entries, which
 * exists only as a SQL migration), `requestDb`'s query builder is unusable —
 * raw SQL on the SAME request-scoped connection is the faithful equivalent.
 * Same fail-closed contract as `requestDb`: absent context throws the typed
 * error, never falls back to the shared pool.
 */
export interface RequestSqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export function requestPgClient(req: Request): RequestSqlClient {
  const client = (req as Request & { dbClient?: { query?: unknown } }).dbClient;
  if (!client || typeof client.query !== 'function') {
    throw new MissingRequestDbContextError();
  }
  return client as unknown as RequestSqlClient;
}

export function requestDb(req: Request): RequestDb {
  // A bad merge left two copies of this function body here, so `client` was
  // declared twice (TS2451) and the file did not compile. The canonical shape is
  // cache-first, then a single guarded lookup that throws the typed
  // MissingRequestDbContextError (not a bare Error). Ledger C-22.
  const cached = (req as RequestWithCachedDb).__requestDb;
  if (cached) return cached;

  const client = (req as Request & { dbClient?: { query?: unknown } }).dbClient;
  if (!client || typeof client.query !== 'function') {
    throw new MissingRequestDbContextError();
  }
  // Drizzle's node-postgres driver only needs `.query()` on the client.
  // The lazy wrapper installed by requireTenantContext satisfies that;
  // we cast to `any` here so we don't have to pull pg types into the
  // Drizzle type parameter just to widen the constructor signature.
  const built = drizzle(client as any, { schema }) as RequestDb;

  (req as RequestWithCachedDb).__requestDb = built;
  return built;
}
