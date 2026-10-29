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

export function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
export function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Use the authenticated request's actual pinned executor, never a global fallback. */
export const qmsClient = (req: Request) => queryRowsClient(requestPgClient(req));
