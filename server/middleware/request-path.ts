/**
 * The path a request was sent to, as the client wrote it.
 *
 * Under `app.use('/api', handler)` Express 5 hands the handler a mount-relative
 * `req.path` ('/vault/documents') and the mount point in `req.baseUrl` ('/api').
 * A guard that matches an allowlist written as full paths, or an audit row that
 * must name the path the client sent, needs the two joined. `req.originalUrl`
 * is not used: it carries the query string.
 *
 * One implementation (2026-09-26, security audit IAM-18 item 4 re-check): the
 * tenant-impersonation detector, the tenant lifecycle guard, the storage
 * quota guard, the request tenant scope and the platform-route gate read it
 * from here. The auth boundary (authBoundary.ts) still
 * computes the same expression inline and joins this module when its lane's
 * window closes.
 *
 * PURE. Type-only import.
 */
import type { Request } from 'express';

export function requestFullPath(req: Pick<Request, 'baseUrl' | 'path'>): string {
  return `${req.baseUrl || ''}${req.path || ''}`;
}
