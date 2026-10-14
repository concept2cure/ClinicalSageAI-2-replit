import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool, transaction } from '../db';
import type { RequestSqlClient } from '../db/requestDb';
import { writeChainedAuditRow } from '../services/auditService';
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
const reasonSchema = z.string().trim().min(1).max(500);
const grantSchema = z.object({
  principalId: z.string().trim().min(1).max(200),
  role: z.string().transform(normalizeAuthoringRole).refine(role => role !== null),
  sectionId: z.string().uuid().nullable().optional(),
  reason: reasonSchema,
  validUntil: z.string().datetime({ offset: true }).refine(value => Date.parse(value) > Date.now()).nullable().optional(),
});
const revokeSchema = z.object({ reason: reasonSchema });

class PermissionRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function requestContext(req: Request) {
  const tenantId = authedOrgId(req);
  const principal = authoringPrincipalFromRequest(req);
  if (tenantId == null || !principal) {
    throw new PermissionRefusal(401, 'AUTHORING_AUTHENTICATION_REQUIRED', 'Authenticated authoring principal and tenant context are required.');
  }
  return { tenantId, principal, docId: String(req.params.docId ?? '').trim() };
}

type PermissionContext = ReturnType<typeof requestContext>;

async function requirePermissionManager(client: RequestSqlClient, ctx: PermissionContext): Promise<void> {
  const scope = await resolveAuthoringDocumentScope(client, ctx.tenantId, ctx.docId);
  const decision = await decideAuthoringPermission({ pool: client, principal: ctx.principal, scope, action: 'manage_permissions' });
  if (decision.reason === 'object-not-found') {
    throw new PermissionRefusal(404, 'AUTHORING_OBJECT_NOT_FOUND', 'Authoring document not found.');
  }
  if (!decision.allowed) {
    throw new PermissionRefusal(403, 'AUTHORING_PERMISSION_ADMIN_FORBIDDEN', decision.reason === 'document-immutable'
      ? 'Access cannot be changed while this document is sealed or archived.'
      : 'Only a document owner or platform administrator may manage permissions.');
  }
}

/**
 * 2026-10-14 · D2: access changes and their chained audit record now commit
 * together. The old post-commit recordAuditRow could lose the record while
 * retaining access. A refused chained audit write rolls the change back.
 * Locking the document also serializes competing last-owner revocations and
 * rechecks management authority after a preceding revocation has committed.
 */
async function inPermissionTransaction<T>(ctx: PermissionContext, work: (client: RequestSqlClient) => Promise<T>): Promise<T> {
  return transaction(async (client: RequestSqlClient) => {
    await client.query('SELECT id FROM authoring_documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [ctx.docId, ctx.tenantId]);
    await requirePermissionManager(client, ctx);
    return work(client);
  });
}

async function recordPermissionAudit(client: RequestSqlClient, req: Request, ctx: PermissionContext, input: {
  action: string;
  permissionId: string;
  reason: string;
  details: Record<string, unknown>;
}): Promise<void> {
  await writeChainedAuditRow(client, {
    tenantId: ctx.tenantId,
    userId: ctx.principal.id,
    action: input.action,
    resourceType: 'authoring_document_permission',
    resourceId: input.permissionId,
    reason: input.reason,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    details: { docId: ctx.docId, ...input.details, reason: input.reason },
  });
}

function refusal(res: Response, error: unknown, verb: string): void {
  if (error instanceof PermissionRefusal) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'DOCUMENT_NOT_FOUND' || message === 'SECTION_SCOPE_MISMATCH') {
    res.status(404).json({ error: { code: message, message: message === 'SECTION_SCOPE_MISMATCH'
      ? 'The requested section does not belong to this document and tenant.' : 'Authoring document not found.' } });
    return;
  }
  if (message === 'LAST_OWNER') {
    res.status(409).json({ error: { code: 'AUTHORING_LAST_OWNER_REQUIRED', message: 'A document must retain at least one active owner.' } });
    return;
  }
  logger.error(`Failed to ${verb} authoring permissions`, { error: message });
  res.status(503).json({ error: { code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE', message: verb === 'list'
    ? 'Authoring permissions could not be verified.'
    : 'The access change could not be completed with its audit record. No change was confirmed. Reload access before retrying.' } });
}

// This router owns these paths once, mounted at /api before /api/authoring.
router.get('/authoring/docs/:docId/permissions', async (req: Request, res: Response) => {
  try {
    const ctx = requestContext(req);
    await requirePermissionManager(getPool(), ctx);
    const permissions = await listAuthoringPermissions(getPool(), ctx.tenantId, ctx.docId);
    res.json({ success: true, docId: ctx.docId, permissions });
  } catch (error) { refusal(res, error, 'list'); }
});

// Reviewer and approver authority is an explicit owner/admin-controlled grant.
router.post('/authoring/docs/:docId/permissions', async (req: Request, res: Response) => {
  try {
    const ctx = requestContext(req);
    const parsed = grantSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new PermissionRefusal(400, 'AUTHORING_PERMISSION_INVALID', 'Choose a member and a valid role, give a reason (1–500 characters), and use a future expiry if supplied.');
    }
    const { principalId, role, sectionId = null, reason, validUntil = null } = parsed.data;
    if (!role) throw new PermissionRefusal(400, 'AUTHORING_PERMISSION_INVALID', 'A valid document role is required.');
    const permission = await inPermissionTransaction(ctx, async client => {
      // Never trust a caller-provided email: authorization matches id OR email.
      // Resolve the selected member and their canonical email in THIS tenant,
      // holding membership through commit so removal cannot race the grant.
      const member = await client.query(
        `SELECT u.id::text AS principal_id, u.email
           FROM users u JOIN organization_users ou ON ou.user_id = u.id
          WHERE ou.organization_id = $1 AND u.id::text = $2
          FOR SHARE OF ou`, [ctx.tenantId, principalId],
      );
      if (!member.rows[0]) {
        throw new PermissionRefusal(400, 'AUTHORING_PERMISSION_MEMBER_REQUIRED', 'Choose a current member of this organization.');
      }
      const email = typeof member.rows[0].email === 'string' ? member.rows[0].email.trim().toLowerCase() : null;
      const granted = await grantAuthoringPermission({
        pool: client, tenantId: ctx.tenantId, docId: ctx.docId, sectionId,
        principalId, email, role, grantedBy: ctx.principal.id, reason, validUntil,
      });
      await recordPermissionAudit(client, req, ctx, {
        action: 'authoring.permission.grant', permissionId: granted.id, reason,
        details: { principalId: granted.principal_id, email: granted.email, role: granted.role, sectionId: granted.section_id, validUntil: granted.valid_until },
      });
      return granted;
    });
    res.status(201).json({ success: true, permission, auditTrail: { persisted: true, chained: true } });
  } catch (error) { refusal(res, error, 'grant'); }
});

router.delete('/authoring/docs/:docId/permissions/:permissionId', async (req: Request, res: Response) => {
  try {
    const ctx = requestContext(req);
    const parsed = revokeSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new PermissionRefusal(400, 'AUTHORING_PERMISSION_REASON_REQUIRED', 'Give a reason for revoking access (1–500 characters).');
    const reason = parsed.data.reason;
    const permission = await inPermissionTransaction(ctx, async client => {
      const revoked = await revokeAuthoringPermission({
        pool: client, tenantId: ctx.tenantId, docId: ctx.docId,
        permissionId: String(req.params.permissionId ?? '').trim(), revokedBy: ctx.principal.id, reason,
      });
      if (!revoked) throw new PermissionRefusal(404, 'AUTHORING_PERMISSION_NOT_FOUND', 'Active authoring permission not found.');
      await recordPermissionAudit(client, req, ctx, {
        action: 'authoring.permission.revoke', permissionId: revoked.id, reason,
        details: { principalId: revoked.principal_id, role: revoked.role, sectionId: revoked.section_id },
      });
      return revoked;
    });
    res.json({ success: true, permission, auditTrail: { persisted: true, chained: true } });
  } catch (error) { refusal(res, error, 'revoke'); }
});

export default router;
