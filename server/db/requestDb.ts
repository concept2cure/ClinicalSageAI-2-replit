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
 *   pool connection and runs `SET LOCAL app.current_tenant_id` on it,
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
 * This helper fails closed outside the request scope. A missing or invalid
 * `req.dbClient` means the route did not establish tenant context; falling back
 * to the shared database would turn middleware omission into an isolation
 * bypass.
 */

import type { Request } from 'express';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/schema';

type Schema = typeof schema;
export type RequestDb = NodePgDatabase<Schema>;

interface RequestWithCachedDb extends Request {
  __requestDb?: RequestDb;
}

export function requestDb(req: Request): RequestDb {
  const client = (req as Request & { dbClient?: unknown }).dbClient;
  if (!client || typeof (client as { query?: unknown }).query !== 'function') {
    throw new Error(
      'requestDb requires a tenant-scoped dbClient; ensure requireTenantContext runs before this handler'
    );
  }

  const cached = (req as RequestWithCachedDb).__requestDb;
  if (cached) return cached;

  // Drizzle's node-postgres driver only needs `.query()` on the client.
  // The lazy wrapper installed by requireTenantContext satisfies that;
  // we cast to `any` here so we don't have to pull pg types into the
  // Drizzle type parameter just to widen the constructor signature.
  const built = drizzle(client as any, { schema }) as RequestDb;

  (req as RequestWithCachedDb).__requestDb = built;
  return built;
}
