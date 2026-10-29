/**
 * The request context the QMS routers share (mdx-qms.ts, mdx-qms-records.ts):
 * the caller's organization and user, and the request's pinned SQL executor.
 * Split out of mdx-qms.ts on 2026-10-29, when the quality-record routes moved
 * to their own router under the repository's file-size ceiling.
 *
 * @module server/routes/mdx-qms-context
 */
import type { Request } from 'express';
import { requestPgClient } from '../db/requestDb';
import { queryRowsClient } from '../db/queryRowsClient';

/* The caller's organization and user come from the one resolver
   (server/types/auth-request.ts), under the names the QMS routers use;
   ci:tenant-resolvers refuses a second local answer to "which
   organization is this". */
export { resolveOrgId as getOrgId, resolveUserId as getUserId } from '../types/auth-request';

/** Use the authenticated request's actual pinned executor, never a global fallback. */
export const qmsClient = (req: Request) => queryRowsClient(requestPgClient(req));
