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
 *   `requestDb(req)` returns a Drizzle wrapped around the dedicated
 *   per-request client. Queries through it run on the same connection
 *   the middleware already loaded with `app.current_tenant_id` etc.,
 *   so the policy filter matches.
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
 * Safe outside the request scope: if `req.dbClient` is missing (e.g. a
 * route that ran before requireTenantContext, or a test that fakes the
 * request), this falls back to the pool-bound default `db`. PR A's
 * pool instrumentation will count that case as missing-tenant.
 */

import type { Request } from 'express';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/schema';
import { db as poolBoundDb } from './runtime';

type Schema = typeof schema;
export type RequestDb = NodePgDatabase<Schema>;

interface RequestWithCachedDb extends Request {
  __requestDb?: RequestDb;
}

export function requestDb(req: Request): RequestDb {
  const cached = (req as RequestWithCachedDb).__requestDb;
  if (cached) return cached;

  const client = (req as Request & { dbClient?: unknown }).dbClient;
  const built: RequestDb = client
    ? (drizzle(client as never, { schema }) as RequestDb)
    : (poolBoundDb as unknown as RequestDb);

  (req as RequestWithCachedDb).__requestDb = built;
  return built;
}
