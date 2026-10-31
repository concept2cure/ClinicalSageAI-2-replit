/**
 * Who releases a request's pinned, tenant-scoped DB client (`req.dbClient`).
 *
 * The auth boundary binds one lazy client per request
 * (middleware/establishRequestTenantScope.ts) and, until AnA detach DT3,
 * released it on the response's `finish` or `close`, whatever was still using
 * it. That was right for every request whose work ends with its response.
 *
 * One kind of work does not: an AnA turn whose page closed and that goes on
 * (docs/design/ANA_DETACH_2026-10-08.md §2.1). Since 14362ef00 the stream hands
 * the request's client to every tool, to the round's document-title lookup and
 * to context assembly (`requestPgClient(req)`), so a turn that lost its client
 * on `close` failed its next tool — "Cannot query a released request DB
 * client" — and a sub-agent child, which inherits the client, failed mid-read.
 *
 * So the release is a lease with holders. The response is the first holder,
 * and its end drops that hold. Work that outlives the response takes a hold of
 * its own with `retainRequestDbClient`, and drops it when that work ends. The
 * client is released — cleared from the request and returned to the pool, or
 * discarded if a transaction is still open on it (lazyRequestDbClient.ts) —
 * when the last hold is dropped. It is the same connection with the same
 * tenant session variables: nothing falls back to the shared pool, and no
 * second connection is opened.
 *
 * @module server/db/requestDbLease
 */

import type { Request, Response } from 'express';
import type { RequestDbClient } from '../middleware/lazyRequestDbClient';

/** A request client the lease can release. */
export type ReleasableRequestDbClient = RequestDbClient & { release(): Promise<void> };

interface Lease {
  client: ReleasableRequestDbClient;
  /** The response's own hold, plus one per retainer. */
  holds: number;
  released: boolean;
}

const LEASE = Symbol.for('c2c.requestDbClient.lease');

type LeasedRequest = Request & { [LEASE]?: Lease };

function drop(req: Request, lease: Lease): Promise<void> {
  lease.holds -= 1;
  if (lease.holds > 0 || lease.released) return Promise.resolve();
  lease.released = true;
  // A nested bind (the system scope over a per-user one) may have replaced
  // req.dbClient since; only this lease's own client is cleared.
  if (req.dbClient === lease.client) req.dbClient = null;
  return lease.client.release();
}

/**
 * Bind `client` as the request's `req.dbClient`, held by the response until it
 * ends (`finish` or `close`, whichever comes first). A response that has
 * already ended holds nothing: the client is released at once, and a query on
 * it fails closed without taking a connection.
 */
export function bindRequestDbClient(req: Request, res: Response, client: ReleasableRequestDbClient): void {
  const lease: Lease = { client, holds: 1, released: false };
  req.dbClient = client;
  (req as LeasedRequest)[LEASE] = lease;
  let responseEnded = false;
  const end = () => {
    if (responseEnded) return;
    responseEnded = true;
    void drop(req, lease);
  };
  res.on('finish', end);
  res.on('close', end);
  // Authentication is asynchronous, so a client that went away first has
  // already had its 'close', and a response written to a closed socket never
  // emits 'finish': nothing would return the connection its handler then
  // takes. Each such request kept one until the pool was exhausted. The
  // connection is asked as well as the response: outside production the auth
  // boundary hands the authenticator a stand-in that forwards only `on`.
  if (res.destroyed || res.writableFinished || req.socket?.destroyed) end();
}

/**
 * Keep the request's bound client past the response: its end no longer
 * releases it, and the caller must call the returned function once, when its
 * own work ends (a second call does nothing). Null when there is nothing to
 * keep — no bound client, or the response already ended and released it — in
 * which case `requestPgClient(req)` fails closed exactly as it did.
 */
export function retainRequestDbClient(req: Request): (() => Promise<void>) | null {
  const lease = (req as LeasedRequest)[LEASE];
  if (!lease || lease.released || req.dbClient !== lease.client) return null;
  lease.holds += 1;
  let dropped = false;
  return () => {
    if (dropped) return Promise.resolve();
    dropped = true;
    return drop(req, lease);
  };
}
