/**
 * Socket-level object authorization (C2C-COLLAB-002).
 *
 * The collaboration handlers used to accept any caller-supplied `documentId`
 * and join / address the corresponding room without ever asking whether that
 * object belongs to the socket's organization. These helpers are the missing
 * check: they resolve the object against the tenant taken from the VERIFIED
 * handshake principal (`socket.orgId`), never from the event payload.
 *
 * Fail-closed posture: a non-numeric id, an absent database, or a query error
 * all return false. Collaboration is not an availability-critical path, so an
 * unprovable authorization is refused rather than assumed — deliberately
 * stricter than the HTTP membership recheck in server/middleware/auth.ts.
 *
 * `../db` is imported extensionless on purpose: it is the specifier every other
 * server module uses, so a test that redirects the db module (PGlite) with
 * `vi.mock('../server/db', …)` intercepts this module too.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { coauthorDocuments, fda510kProjects } from '@shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('socket-authz');

/** Parse a caller-supplied id to a positive integer, or null. */
function toPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * True iff `documentId` names a co-author document owned by `orgId`.
 *
 * Mirrors the canonical org-scoped predicate used by server/routes/coauthor.ts:
 * `and(eq(id, docId), eq(organizationId, orgId))`.
 */
export async function isDocumentInOrg(
  orgId: string | undefined,
  documentId: unknown,
): Promise<boolean> {
  const org = toPositiveInt(orgId);
  const docId = toPositiveInt(documentId);
  if (org === null || docId === null) return false;
  if (!db) {
    log.warn('[socket-authz] database unavailable — refusing document access (fail closed)');
    return false;
  }
  try {
    const rows = await db
      .select({ id: coauthorDocuments.id })
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, org)))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    log.warn(
      `[socket-authz] document access check failed, refusing: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

/** True iff `projectId` names a 510(k) project owned by `orgId`. */
export async function isProjectInOrg(
  orgId: string | undefined,
  projectId: unknown,
): Promise<boolean> {
  const org = toPositiveInt(orgId);
  const pid = toPositiveInt(projectId);
  if (org === null || pid === null) return false;
  if (!db) {
    log.warn('[socket-authz] database unavailable — refusing project access (fail closed)');
    return false;
  }
  try {
    const rows = await db
      .select({ id: fda510kProjects.id })
      .from(fda510kProjects)
      .where(and(eq(fda510kProjects.id, pid), eq(fda510kProjects.organizationId, org)))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    log.warn(
      `[socket-authz] project access check failed, refusing: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}
