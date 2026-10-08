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

/**
 * The request's path below /authoring, or null for any other route.
 *
 * It must name every spelling the authoring router accepts. Express routes
 * match without case and ignore a trailing slash (Router defaults: caseSensitive
 * false, strict false; authoring.router.ts sets neither), so
 * POST /api/Authoring/Documents/:id/Request-Review/ runs the same handler as
 * the lowercase path. Until 2026-10-08 this gate compared the literal path, so
 * such a spelling skipped it and the handler ran with no object check (wave 2D
 * review, docs/evidence/D2-ONE-ANA/2026-10-08/ana-2d-review-loop-closes/). The
 * prefix is now compared without case, trailing slashes are dropped, and every
 * route pattern in targetForRequest matches without case. Ids keep the
 * spelling the caller sent.
 */
function relativeAuthoringPath(req: Request): string | null {
  const path = req.path.replace(/\/+$/, '') || '/';
  const lower = path.toLowerCase();
  if (lower === AUTHORING_PREFIX) return '/';
  if (!lower.startsWith(`${AUTHORING_PREFIX}/`)) return null;
  return path.slice(AUTHORING_PREFIX.length) || '/';
}

function actionFromPath(path: string): AuthoringPermissionAction {
  const lower = path.toLowerCase();
  // `e-sign` (POST /docs/:id/e-sign, the §11.50 signature bound to the frozen
  // snapshot) is an approval-class action like `sign` and `freeze`. It was not
  // in this list, fell through to `edit`, and an edit of a FROZEN document is
  // refused — so no signature could ever be applied (VSR-001 F-12).
  if (/(?:^|\/)(?:freeze|sign|e-sign|esign|submit|approve|approval)(?:\/|$)/.test(lower)) return 'approve';
  if (/(?:^|\/)(?:review|tracked-change|tracked_changes|decision)(?:\/|$)/.test(lower)) {
    return 'review';
  }
  if (/(?:^|\/)(?:comment|comments)(?:\/|$)/.test(lower)) return 'comment';
  // Produce the record without changing the document — see the 'export'
  // action in authoring-permissions.ts (2026-09-28).
  // A working copy is produced the same way and needs the same permission.
  if (/(?:^|\/)(?:export|file-to-vault|send-to-packager|working-copy)(?:\/|$)/.test(lower)) return 'export';
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

/**
 * The routes under /documents/:id that this gate classifies. Each is matched
 * exactly; anything else under /documents/ keeps its own route rules.
 *
 * The tracked-change-decision routes sit under /documents/:id, not /docs/:id
 * — a naming split from the rest of this file, and the reason this gate never
 * ran on them at all: `docMatch` only matches /docs/. actionFromPath's
 * `review` alternatives look like they should classify this path (they list
 * 'tracked-change' and 'decision'), but do not: each alternative requires a
 * whole path segment, and the real segment here is `tracked-change-decisions`
 * — `tracked-change` is followed by `-`, not `/` or end-of-string, so the
 * regex does not match and actionFromPath falls through to its final `return
 * 'edit'`. That fallthrough is the right action independently of the regex
 * miss: the content an accepted/rejected suggestion changes is persisted by
 * PATCH /sections/:sectionId, which this middleware already gates as 'edit'
 * via sectionMatch, so anyone who can persist the change can record the
 * decision, and nobody who cannot persist it (REVIEWER/APPROVER, who pass
 * 'review' but not 'edit') is newly denied anything they could complete
 * today.
 *
 * Sending a document for review (POST /documents/:id/request-review) is the
 * sender's act, not the reviewer's: it names who reviews the document, with a
 * reason on its audit row, and a re-request reopens a recorded verdict. Until
 * 2026-10-08 it was unclassified, so any authenticated member of the
 * organization could send any of its documents for review, to anyone (wave
 * 2C, docs/evidence/D2-ONE-ANA/2026-10-08/ana-2c-send-for-review/; fixed in
 * wave 2D). 'edit' is the action exactly OWNER and AUTHOR hold
 * (authoring-permissions.ts ROLE_ACTIONS); a global admin passes as on every
 * other object route. A REVIEWER or APPROVER grant does not send the document
 * out. 'edit' also refuses a sealed document (FROZEN, APPROVED, …) with 409: a
 * review request would reopen verdicts on a record that is already signed.
 *
 * A broader match on all of /documents/ was considered and rejected: it also
 * covers /documents/:id/review, the verdict, whose reviewers are named by
 * POST /documents/:id/request-review — a flow that writes only
 * authoring_reviews and grants no doc_permissions row — so classifying the
 * verdict as 'review'/'edit' here would 403 every non-admin reviewer using the
 * review workflow as designed. The verdict stays unclassified.
 */
const DOCUMENTS_ROUTES: ReadonlyArray<{ pattern: RegExp; action: AuthoringPermissionAction }> = [
  { pattern: /^\/documents\/([^/]+)\/tracked-change-decisions(?:\/bulk)?$/i, action: 'edit' },
  { pattern: /^\/documents\/([^/]+)\/request-review$/i, action: 'edit' },
];

/** The classified /documents/:id route `path` names, with its document id, or null. */
function documentsRouteTarget(path: string): { action: AuthoringPermissionAction; docId: string } | null {
  for (const route of DOCUMENTS_ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { action: route.action, docId: match[1] };
  }
  return null;
}

function targetForRequest(req: Request, tenantId: number, path: string): ObjectTarget | null {
  const pool = getPool();
  // Compared without case, as the router matches (relativeAuthoringPath).
  const lower = path.toLowerCase();

  // Creating a document has no object to authorize yet. The database trigger in
  // 20260727_authoring_object_permissions.sql atomically grants its creator
  // OWNER + AUTHOR permissions.
  if (req.method === 'POST' && lower === '/docs') return null;
  // POST /docs/from-draft creates a document too (WM, 2026-09-21: a drafted
  // document becomes an authoring document in one transaction). Without this
  // line the docMatch below read `from-draft` as a document id and answered
  // 404 AUTHORING_OBJECT_NOT_FOUND for every call. Same grant on creation.
  if (req.method === 'POST' && lower === '/docs/from-draft') return null;

  // Creating a section is a document mutation; the parent id comes from the
  // existing authoring contract.
  if (req.method === 'POST' && lower === '/sections') {
    const docId = String(req.body?.doc_id ?? '').trim();
    if (!docId) {
      return { action: 'edit', resolve: async () => null };
    }
    return {
      action: 'edit',
      resolve: () => resolveAuthoringDocumentScope(pool, tenantId, docId),
    };
  }

  const sectionMatch = /^\/sections\/([^/]+)(?:\/.*)?$/i.exec(path);
  if (sectionMatch) {
    const sectionId = sectionMatch[1];
    return {
      action: actionFromPath(path),
      resolve: () => resolveAuthoringSectionScope(pool, tenantId, sectionId),
    };
  }

  // The /documents/:id routes this gate classifies (DOCUMENTS_ROUTES, above),
  // matched narrowly and BEFORE docMatch, which only matches /docs/.
  const documentsRoute = documentsRouteTarget(path);
  if (documentsRoute) {
    return {
      action: documentsRoute.action,
      resolve: () => resolveAuthoringDocumentScope(pool, tenantId, documentsRoute.docId),
    };
  }

  const docMatch = /^\/docs\/([^/]+)(?:\/.*)?$/i.exec(path);
  if (docMatch) {
    const docId = docMatch[1];
    return {
      action: actionFromPath(path),
      resolve: () => resolveAuthoringDocumentScope(pool, tenantId, docId),
    };
  }

  const commentMatch = /^\/comments\/([^/]+)(?:\/.*)?$/i.exec(path);
  if (commentMatch) {
    return {
      action: 'comment',
      resolve: () => resolveCommentScope(tenantId, commentMatch[1]),
    };
  }

  const citationMatch = /^\/citations\/([^/]+)(?:\/.*)?$/i.exec(path);
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
