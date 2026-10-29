/**
 * The request context the QMS routers share (mdx-qms.ts, mdx-qms-records.ts):
 * the caller's organization and user, the request's pinned SQL executor, and
 * the admission of a project a write names.
 * Split out of mdx-qms.ts on 2026-10-29, when the quality-record routes moved
 * to their own router under the repository's file-size ceiling.
 *
 * @module server/routes/mdx-qms-context
 */
import type { NextFunction, Request, Response } from 'express';
import { requestPgClient } from '../db/requestDb';
import { queryRowsClient } from '../db/queryRowsClient';
import { resolveOrgId } from '../types/auth-request';
import { admitProject } from '../lib/admit-project';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

/* The caller's organization and user come from the one resolver
   (server/types/auth-request.ts), under the names the QMS routers use;
   ci:tenant-resolvers refuses a second local answer to "which
   organization is this". */
export { resolveOrgId as getOrgId, resolveUserId as getUserId } from '../types/auth-request';

/** Use the authenticated request's actual pinned executor, never a global fallback. */
export const qmsClient = (req: Request) => queryRowsClient(requestPgClient(req));

const log = createScopedLogger('mdx-qms');

/**
 * A QMS write that may name the project its record belongs to: a change
 * control (P-60, 2026-10-29; migrations/20261029l). A product's design changes
 * are that product's (21 CFR 820.30(j), ISO 13485 §7.3.10), and its Engineering
 * screen reads them by the project key.
 *
 * Runs before the handler. A `programId` in the body must be this
 * organization's live project (server/lib/admit-project.ts): otherwise 404
 * "Project not found", or 503 when the check could not run, and the handler
 * never runs, so nothing is written. Absent, null or empty, the record is the
 * organization's, as before, and nothing is asked. With no organization the
 * handler answers for itself. The admitted id is the handler's through
 * `admittedProject`.
 */
export async function admitBodyProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  const named = (req.body as { programId?: unknown } | undefined)?.programId;
  const orgId = resolveOrgId(req);
  res.locals.admittedProgramId = null;
  if (named === undefined || named === null || named === '' || orgId === null) return next();
  const programId = String(named);
  try {
    if (!(await admitProject(res, log, programId, orgId))) return;
  } catch (err) {
    serverError(res, log, 'project-admission', err);
    return;
  }
  res.locals.admittedProgramId = programId;
  next();
}

/** The project `admitBodyProject` admitted for this request, or null. */
export function admittedProject(res: Response): string | null {
  const id: unknown = res.locals.admittedProgramId;
  return typeof id === 'string' ? id : null;
}
