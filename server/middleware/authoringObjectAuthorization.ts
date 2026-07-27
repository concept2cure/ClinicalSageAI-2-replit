import type { NextFunction, Request, Response } from 'express';
import { getPool } from '../db';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';
import {
  authoringPrincipalFromRequest,
  decideAuthoringPermission,
  resolveAuthoringDocumentScope,
  resolveAuthoringSectionScope,
  type AuthoringObjectScope,
  type AuthoringPermissionAction,
} from '../services/authoring/authoring-permissions';

const logger = createScopedLogger('authoring-object-authorization');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const AUTHORING_PREFIX = '/authoring';

interface ObjectTarget {
  action: AuthoringPermissionAction;
  resolve: () => Promise<AuthoringObjectScope | null>;
}

function relativeAuthoringPath(req: Request): string | null {
  if (req.path === AUTHORING_PREFIX) return '/';
  if (!req.path.startsWith(`${AUTHORING_PREFIX}/`)) return null;
  return req.path.slice(AUTHORING_PREFIX.length) || '/';
}

function actionFromPath(path: string): AuthoringPermissionAction {
  const lower = path.toLowerCase();
  if (/(?:^|\/)(?:freeze|sign|submit|approve|approval)(?:\/|$)/.test(lower)) return 'approve';
  if (/(?:^|\/)(?:review|tracked-change|tracked_changes|decision)(?:\/|$)/.test(lower)) {
    return 'review';
  }
  if (/(?:^|\/)(?:comment|comments)(?:\/|$)/.test(lower)) return 'comment';
  return 'edit';
}

async function resolveCommentScope(
  tenantId: number,
  commentId: string,
): Promise<AuthoringObjectScope | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT c.section_id::text AS section_id,
            d.id::text AS doc_id,
            d.status,
            d.created_by
       FROM authoring_comments c
       JOIN authoring_sections s
         ON s.id = c.section_id
        AND s.tenant_id = c.tenant_id
       JOIN authoring_documents d
         ON d.id = s.doc_id
        AND d.tenant_id = s.tenant_id
      WHERE c.id = $1 AND c.tenant_id = $2
      LIMIT 1`,
    [commentId, tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    tenantId,
    docId: String(row.doc_id),
    sectionId: String(row.section_id),
    documentStatus: String(row.status ?? 'draft'),
    createdBy: String(row.created_by ?? ''),
  };
}

async function resolveCitationScope(
  tenantId: number,
  citationId: string,
): Promise<AuthoringObjectScope | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT c.section_id::text AS section_id,
            d.id::text AS doc_id,
            d.status,
            d.created_by
       FROM authoring_citations c
       JOIN authoring_sections s
         ON s.id = c.section_id
        AND s.tenant_id = c.tenant_id
       JOIN authoring_documents d
         ON d.id = s.doc_id
        AND d.tenant_id = s.tenant_id
      WHERE c.id = $1 AND c.tenant_id = $2
      LIMIT 1`,
    [citationId, tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    tenantId,
    docId: String(row.doc_id),
    sectionId: String(row.section_id),
    documentStatus: String(row.status ?? 'draft'),
    createdBy: String(row.created_by ?? ''),
  };
}

function targetForRequest(req: Request, tenantId: number, path: string): ObjectTarget | null {
  const pool = getPool();

  // Creating a document has no object to authorize yet. The database trigger in
  // 20260727_authoring_object_permissions.sql atomically grants its creator
  // OWNER + AUTHOR permissions.
  if (req.method === 'POST' && path === '/docs') return null;

  // Creating a section is a document mutation; the parent id comes from the
  // existing authoring contract.
  if (req.method === 'POST' && path === '/sections') {
    const docId = String(req.body?.doc_id ?? '').trim();
    if (!docId) {
      return { action: 'edit', resolve: async () => null };
    }
    return {
      action: 'edit',
      resolve: () => resolveAuthoringDocumentScope(pool, tenantId, docId),
    };
  }

  const sectionMatch = /^\/sections\/([^/]+)(?:\/.*)?$/.exec(path);
  if (sectionMatch) {
    const sectionId = sectionMatch[1];
    return {
      action: actionFromPath(path),
      resolve: () => resolveAuthoringSectionScope(pool, tenantId, sectionId),
    };
  }

  const docMatch = /^\/docs\/([^/]+)(?:\/.*)?$/.exec(path);
  if (docMatch) {
    const docId = docMatch[1];
    return {
      action: actionFromPath(path),
      resolve: () => resolveAuthoringDocumentScope(pool, tenantId, docId),
    };
  }

  const commentMatch = /^\/comments\/([^/]+)(?:\/.*)?$/.exec(path);
  if (commentMatch) {
    return {
      action: 'comment',
      resolve: () => resolveCommentScope(tenantId, commentMatch[1]),
    };
  }

  const citationMatch = /^\/citations\/([^/]+)(?:\/.*)?$/.exec(path);
  if (citationMatch) {
    return {
      action: 'edit',
      resolve: () => resolveCitationScope(tenantId, citationMatch[1]),
    };
  }

  // Templates, guidance catalogs, PIN setup, and other non-object routes retain
  // their existing route-specific RBAC. This middleware is intentionally scoped
  // to durable document/section objects rather than becoming a second global
  // authorization system.
  return null;
}

/**
 * Mandatory authoring object authorization.
 *
 * Mounted once at `/api` immediately before the legacy `/api/authoring` router.
 * It ignores every non-authoring route, which avoids adding another duplicate
 * `/api/authoring` mount to the route registry while preserving exact ordering.
 * It is deliberately not feature-flagged: authenticated tenant membership is
 * necessary but not sufficient to mutate a governed document. Any policy-store
 * or query failure returns 503 and denies the write.
 */
export async function authoringObjectAuthorization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> {
  const authoringPath = relativeAuthoringPath(req);
  if (authoringPath == null || SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const tenantId = authedOrgId(req);
  const principal = authoringPrincipalFromRequest(req);
  if (tenantId == null || !principal) {
    return res.status(401).json({
      error: {
        code: 'AUTHORING_AUTHENTICATION_REQUIRED',
        message: 'Authenticated authoring principal and tenant context are required.',
      },
    });
  }

  const target = targetForRequest(req, tenantId, authoringPath);
  if (!target) {
    next();
    return;
  }

  try {
    const scope = await target.resolve();
    const decision = await decideAuthoringPermission({
      pool: getPool(),
      principal,
      scope,
      action: target.action,
    });

    if (decision.reason === 'object-not-found') {
      return res.status(404).json({
        error: { code: 'AUTHORING_OBJECT_NOT_FOUND', message: 'Authoring object not found.' },
      });
    }
    if (decision.reason === 'document-immutable') {
      return res.status(409).json({
        error: {
          code: 'AUTHORING_DOCUMENT_IMMUTABLE',
          message: `Document status ${decision.scope?.documentStatus ?? 'unknown'} does not permit this action.`,
        },
      });
    }
    if (!decision.allowed) {
      logger.warn('Authoring object mutation denied', {
        tenantId,
        principalId: principal.id,
        method: req.method,
        path: req.path,
        action: target.action,
        docId: decision.scope?.docId,
        sectionId: decision.scope?.sectionId,
        reason: decision.reason,
      });
      return res.status(403).json({
        error: {
          code: 'AUTHORING_OBJECT_FORBIDDEN',
          message: 'You do not have permission to perform this action on the authoring object.',
        },
      });
    }

    res.locals.authoringAuthorization = {
      action: target.action,
      docId: decision.scope?.docId,
      sectionId: decision.scope?.sectionId,
      matchedRoles: decision.matchedRoles ?? [],
      reason: decision.reason,
    };
    next();
  } catch (error) {
    logger.error('Authoring authorization unavailable; denying mutation', {
      tenantId,
      principalId: principal.id,
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({
      error: {
        code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE',
        message: 'Authoring authorization could not be verified. No mutation was performed.',
      },
    });
  }
}

export default authoringObjectAuthorization;
