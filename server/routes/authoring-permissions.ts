import { Router, type Request, type Response } from 'express';
import { getPool } from '../db';
import auditService from '../services/auditService';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';
import {
  authoringPrincipalFromRequest,
  decideAuthoringPermission,
  grantAuthoringPermission,
  listAuthoringPermissions,
  normalizeAuthoringRole,
  resolveAuthoringDocumentScope,
  revokeAuthoringPermission,
} from '../services/authoring/authoring-permissions';

const router = Router();
const logger = createScopedLogger('authoring-permissions-router');

function requestContext(req: Request): {
  tenantId: number;
  principal: NonNullable<ReturnType<typeof authoringPrincipalFromRequest>>;
} | null {
  const tenantId = authedOrgId(req);
  const principal = authoringPrincipalFromRequest(req);
  if (tenantId == null || !principal) return null;
  return { tenantId, principal };
}

async function requirePermissionManager(req: Request, res: Response): Promise<{
  tenantId: number;
  principal: NonNullable<ReturnType<typeof authoringPrincipalFromRequest>>;
  docId: string;
} | null> {
  const ctx = requestContext(req);
  if (!ctx) {
    res.status(401).json({
      error: {
        code: 'AUTHORING_AUTHENTICATION_REQUIRED',
        message: 'Authenticated authoring principal and tenant context are required.',
      },
    });
    return null;
  }

  const docId = String(req.params.docId ?? '').trim();
  const scope = await resolveAuthoringDocumentScope(getPool(), ctx.tenantId, docId);
  const decision = await decideAuthoringPermission({
    pool: getPool(),
    principal: ctx.principal,
    scope,
    action: 'manage_permissions',
  });

  if (decision.reason === 'object-not-found') {
    res.status(404).json({
      error: { code: 'AUTHORING_OBJECT_NOT_FOUND', message: 'Authoring document not found.' },
    });
    return null;
  }
  if (!decision.allowed) {
    res.status(403).json({
      error: {
        code: 'AUTHORING_PERMISSION_ADMIN_FORBIDDEN',
        message: 'Only a document owner or platform administrator may manage permissions.',
      },
    });
    return null;
  }

  return { ...ctx, docId };
}

function recordPermissionAudit(input: {
  tenantId: number;
  actorId: string;
  action: string;
  docId: string;
  permissionId?: string;
  details: Record<string, unknown>;
}): void {
  void auditService
    .logAction({
      tenantId: input.tenantId,
      userId: input.actorId,
      action: input.action,
      resourceType: 'authoring_document_permission',
      resourceId: input.permissionId ?? input.docId,
      details: { docId: input.docId, ...input.details },
    })
    .catch(error => {
      logger.error('Failed to reflect authoring permission event into central audit log', {
        docId: input.docId,
        permissionId: input.permissionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

// This router is mounted once at `/api` before the legacy `/api/authoring`
// router. Including `/authoring` in each path avoids a second static mount at the
// same prefix, preserving the route-mount no-regression contract.

// GET /api/authoring/docs/:docId/permissions
router.get('/authoring/docs/:docId/permissions', async (req: Request, res: Response) => {
  try {
    const ctx = await requirePermissionManager(req, res);
    if (!ctx) return;
    const permissions = await listAuthoringPermissions(getPool(), ctx.tenantId, ctx.docId);
    res.json({ success: true, docId: ctx.docId, permissions });
  } catch (error) {
    logger.error('Failed to list authoring permissions', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(503).json({
      error: {
        code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE',
        message: 'Authoring permissions could not be verified.',
      },
    });
  }
});

// POST /api/authoring/docs/:docId/permissions
// Reviewer and approver authority is explicit: it exists only after this
// owner/admin-controlled grant, never because a user carries a broad QA/RA role.
router.post('/authoring/docs/:docId/permissions', async (req: Request, res: Response) => {
  try {
    const ctx = await requirePermissionManager(req, res);
    if (!ctx) return;

    const principalId = String(req.body?.principalId ?? '').trim();
    const email = req.body?.email == null ? null : String(req.body.email).trim().toLowerCase();
    const role = normalizeAuthoringRole(req.body?.role);
    const sectionId = req.body?.sectionId == null ? null : String(req.body.sectionId).trim();
    const reason = req.body?.reason == null ? null : String(req.body.reason).trim();
    const validUntil = req.body?.validUntil == null ? null : String(req.body.validUntil).trim();

    if (!principalId || !role) {
      return res.status(400).json({
        error: {
          code: 'AUTHORING_PERMISSION_INVALID',
          message: 'principalId and a valid role are required.',
        },
      });
    }
    if (validUntil && Number.isNaN(Date.parse(validUntil))) {
      return res.status(400).json({
        error: {
          code: 'AUTHORING_PERMISSION_INVALID_EXPIRY',
          message: 'validUntil must be an ISO-8601 date-time.',
        },
      });
    }

    const permission = await grantAuthoringPermission({
      pool: getPool(),
      tenantId: ctx.tenantId,
      docId: ctx.docId,
      sectionId,
      principalId,
      email,
      role,
      grantedBy: ctx.principal.id,
      reason,
      validUntil,
    });

    recordPermissionAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.principal.id,
      action: 'authoring.permission.grant',
      docId: ctx.docId,
      permissionId: permission.id,
      details: {
        principalId,
        email,
        role,
        sectionId,
        validUntil,
        reason,
      },
    });

    return res.status(201).json({ success: true, permission });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'DOCUMENT_NOT_FOUND' || message === 'SECTION_SCOPE_MISMATCH') {
      return res.status(404).json({
        error: {
          code: message,
          message:
            message === 'SECTION_SCOPE_MISMATCH'
              ? 'The requested section does not belong to this document and tenant.'
              : 'Authoring document not found.',
        },
      });
    }
    logger.error('Failed to grant authoring permission', { error: message });
    return res.status(503).json({
      error: {
        code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE',
        message: 'Authoring permission could not be granted.',
      },
    });
  }
});

// DELETE /api/authoring/docs/:docId/permissions/:permissionId
router.delete(
  '/authoring/docs/:docId/permissions/:permissionId',
  async (req: Request, res: Response) => {
    try {
      const ctx = await requirePermissionManager(req, res);
      if (!ctx) return;

      const permissionId = String(req.params.permissionId ?? '').trim();
      const reason = req.body?.reason == null ? null : String(req.body.reason).trim();
      const permission = await revokeAuthoringPermission({
        pool: getPool(),
        tenantId: ctx.tenantId,
        docId: ctx.docId,
        permissionId,
        revokedBy: ctx.principal.id,
        reason,
      });

      if (!permission) {
        return res.status(404).json({
          error: {
            code: 'AUTHORING_PERMISSION_NOT_FOUND',
            message: 'Active authoring permission not found.',
          },
        });
      }

      recordPermissionAudit({
        tenantId: ctx.tenantId,
        actorId: ctx.principal.id,
        action: 'authoring.permission.revoke',
        docId: ctx.docId,
        permissionId: permission.id,
        details: {
          principalId: permission.principal_id,
          role: permission.role,
          sectionId: permission.section_id,
          reason,
        },
      });

      return res.json({ success: true, permission });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'LAST_OWNER') {
        return res.status(409).json({
          error: {
            code: 'AUTHORING_LAST_OWNER_REQUIRED',
            message: 'A document must retain at least one active owner.',
          },
        });
      }
      logger.error('Failed to revoke authoring permission', { error: message });
      return res.status(503).json({
        error: {
          code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE',
          message: 'Authoring permission could not be revoked.',
        },
      });
    }
  },
);

export default router;
