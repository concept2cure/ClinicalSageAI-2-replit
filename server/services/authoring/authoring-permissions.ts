import type { Request } from 'express';
import type { Pool } from 'pg';

export const AUTHORING_PERMISSION_ROLES = [
  'OWNER',
  'AUTHOR',
  'REVIEWER',
  'APPROVER',
  'VIEWER',
] as const;

export type AuthoringPermissionRole = (typeof AUTHORING_PERMISSION_ROLES)[number];
export type AuthoringPermissionAction =
  | 'view'
  | 'edit'
  | 'comment'
  | 'review'
  | 'approve'
  | 'manage_permissions';

export interface AuthoringPrincipal {
  id: string;
  email: string | null;
  roles: string[];
}

export interface AuthoringObjectScope {
  tenantId: number;
  docId: string;
  sectionId: string | null;
  documentStatus: string;
  createdBy: string;
}

export interface AuthoringPermissionDecision {
  allowed: boolean;
  reason:
    | 'allowed-global-admin'
    | 'allowed-object-role'
    | 'object-not-found'
    | 'principal-missing'
    | 'document-immutable'
    | 'permission-denied';
  scope?: AuthoringObjectScope;
  matchedRoles?: AuthoringPermissionRole[];
}

export interface AuthoringPermissionRow {
  id: string;
  doc_id: string;
  section_id: string | null;
  tenant_id: number;
  principal_id: string;
  email: string | null;
  role: AuthoringPermissionRole;
  granted_by: string;
  grant_reason: string | null;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

const GLOBAL_ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
const IMMUTABLE_DOCUMENT_STATUSES = new Set([
  'APPROVED',
  'FROZEN',
  'LOCKED',
  'SUBMITTED',
  'EFFECTIVE',
  'SUPERSEDED',
  'OBSOLETE',
  'ARCHIVED',
]);

const ROLE_ACTIONS: Record<AuthoringPermissionRole, ReadonlySet<AuthoringPermissionAction>> = {
  OWNER: new Set(['view', 'edit', 'comment', 'review', 'approve', 'manage_permissions']),
  AUTHOR: new Set(['view', 'edit', 'comment']),
  REVIEWER: new Set(['view', 'comment', 'review']),
  APPROVER: new Set(['view', 'comment', 'review', 'approve']),
  VIEWER: new Set(['view']),
};

export function normalizeAuthoringRole(value: unknown): AuthoringPermissionRole | null {
  const role = String(value ?? '').trim().toUpperCase();
  return (AUTHORING_PERMISSION_ROLES as readonly string[]).includes(role)
    ? (role as AuthoringPermissionRole)
    : null;
}

export function authoringPrincipalFromRequest(req: Request): AuthoringPrincipal | null {
  const rawId = req.user?.id ?? req.user?.userId;
  if (rawId === undefined || rawId === null || rawId === '') return null;

  const rawRoles = req.user?.roles ?? req.user?.role ?? [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .map(role => String(role).trim().toUpperCase())
    .filter(Boolean);

  return {
    id: String(rawId),
    email: req.user?.email ? String(req.user.email).trim().toLowerCase() : null,
    roles,
  };
}

export function isGlobalAuthoringAdmin(principal: AuthoringPrincipal): boolean {
  return principal.roles.some(role => GLOBAL_ADMIN_ROLES.has(role));
}

export function roleAllowsAction(
  role: AuthoringPermissionRole,
  action: AuthoringPermissionAction,
): boolean {
  return ROLE_ACTIONS[role].has(action);
}

export function documentStatusAllowsAction(
  status: string,
  action: AuthoringPermissionAction,
): boolean {
  if (action === 'view' || action === 'comment' || action === 'review' || action === 'approve') {
    return true;
  }
  return !IMMUTABLE_DOCUMENT_STATUSES.has(String(status ?? '').trim().toUpperCase());
}

export async function resolveAuthoringDocumentScope(
  pool: Pool,
  tenantId: number,
  docId: string,
): Promise<AuthoringObjectScope | null> {
  const result = await pool.query(
    `SELECT id::text AS doc_id, tenant_id, status, created_by
       FROM authoring_documents
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1`,
    [docId, tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    tenantId,
    docId: String(row.doc_id),
    sectionId: null,
    documentStatus: String(row.status ?? 'draft'),
    createdBy: String(row.created_by ?? ''),
  };
}

export async function resolveAuthoringSectionScope(
  pool: Pool,
  tenantId: number,
  sectionId: string,
): Promise<AuthoringObjectScope | null> {
  const result = await pool.query(
    `SELECT s.id::text AS section_id,
            d.id::text AS doc_id,
            d.tenant_id,
            d.status,
            d.created_by
       FROM authoring_sections s
       JOIN authoring_documents d
         ON d.id = s.doc_id
        AND d.tenant_id = s.tenant_id
      WHERE s.id = $1
        AND s.tenant_id = $2
      LIMIT 1`,
    [sectionId, tenantId],
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

export async function decideAuthoringPermission(input: {
  pool: Pool;
  principal: AuthoringPrincipal | null;
  scope: AuthoringObjectScope | null;
  action: AuthoringPermissionAction;
}): Promise<AuthoringPermissionDecision> {
  const { pool, principal, scope, action } = input;
  if (!principal) return { allowed: false, reason: 'principal-missing' };
  if (!scope) return { allowed: false, reason: 'object-not-found' };

  if (!documentStatusAllowsAction(scope.documentStatus, action)) {
    return { allowed: false, reason: 'document-immutable', scope };
  }

  if (isGlobalAuthoringAdmin(principal)) {
    return { allowed: true, reason: 'allowed-global-admin', scope };
  }

  const params: unknown[] = [scope.tenantId, scope.docId, principal.id, principal.email];
  let sectionPredicate = 'p.section_id IS NULL';
  if (scope.sectionId) {
    params.push(scope.sectionId);
    sectionPredicate = `(p.section_id IS NULL OR p.section_id = $${params.length})`;
  }

  const result = await pool.query(
    `SELECT DISTINCT p.role
       FROM doc_permissions p
      WHERE p.tenant_id = $1
        AND p.doc_id = $2
        AND p.revoked_at IS NULL
        AND p.valid_from <= NOW()
        AND (p.valid_until IS NULL OR p.valid_until > NOW())
        AND (
          p.principal_id = $3
          OR ($4::text IS NOT NULL AND lower(p.email) = lower($4::text))
        )
        AND ${sectionPredicate}`,
    params,
  );

  const matchedRoles = result.rows
    .map(row => normalizeAuthoringRole(row.role))
    .filter((role): role is AuthoringPermissionRole => role !== null);
  const allowed = matchedRoles.some(role => roleAllowsAction(role, action));
  return {
    allowed,
    reason: allowed ? 'allowed-object-role' : 'permission-denied',
    scope,
    matchedRoles,
  };
}

export async function listAuthoringPermissions(
  pool: Pool,
  tenantId: number,
  docId: string,
): Promise<AuthoringPermissionRow[]> {
  const result = await pool.query(
    `SELECT id::text, doc_id::text, section_id::text, tenant_id,
            principal_id, email, role, granted_by, grant_reason,
            valid_from, valid_until, revoked_at, revoked_by, revoke_reason,
            created_at, updated_at
       FROM doc_permissions
      WHERE tenant_id = $1 AND doc_id = $2
      ORDER BY revoked_at NULLS FIRST, created_at ASC`,
    [tenantId, docId],
  );
  return result.rows as AuthoringPermissionRow[];
}

export async function grantAuthoringPermission(input: {
  pool: Pool;
  tenantId: number;
  docId: string;
  sectionId?: string | null;
  principalId: string;
  email?: string | null;
  role: AuthoringPermissionRole;
  grantedBy: string;
  reason?: string | null;
  validUntil?: string | null;
}): Promise<AuthoringPermissionRow> {
  const {
    pool,
    tenantId,
    docId,
    sectionId = null,
    principalId,
    email = null,
    role,
    grantedBy,
    reason = null,
    validUntil = null,
  } = input;

  if (sectionId) {
    const section = await resolveAuthoringSectionScope(pool, tenantId, sectionId);
    if (!section || section.docId !== docId) {
      throw new Error('SECTION_SCOPE_MISMATCH');
    }
  } else {
    const document = await resolveAuthoringDocumentScope(pool, tenantId, docId);
    if (!document) throw new Error('DOCUMENT_NOT_FOUND');
  }

  const existing = await pool.query(
    `SELECT id::text, doc_id::text, section_id::text, tenant_id,
            principal_id, email, role, granted_by, grant_reason,
            valid_from, valid_until, revoked_at, revoked_by, revoke_reason,
            created_at, updated_at
       FROM doc_permissions
      WHERE tenant_id = $1
        AND doc_id = $2
        AND principal_id = $3
        AND role = $4
        AND (($5::uuid IS NULL AND section_id IS NULL) OR section_id = $5::uuid)
        AND revoked_at IS NULL
      LIMIT 1`,
    [tenantId, docId, principalId, role, sectionId],
  );
  if (existing.rows[0]) return existing.rows[0] as AuthoringPermissionRow;

  const inserted = await pool.query(
    `INSERT INTO doc_permissions
       (doc_id, section_id, tenant_id, principal_id, email, role,
        granted_by, grant_reason, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id::text, doc_id::text, section_id::text, tenant_id,
               principal_id, email, role, granted_by, grant_reason,
               valid_from, valid_until, revoked_at, revoked_by, revoke_reason,
               created_at, updated_at`,
    [
      docId,
      sectionId,
      tenantId,
      principalId,
      email ? email.trim().toLowerCase() : null,
      role,
      grantedBy,
      reason,
      validUntil,
    ],
  );
  return inserted.rows[0] as AuthoringPermissionRow;
}

export async function revokeAuthoringPermission(input: {
  pool: Pool;
  tenantId: number;
  docId: string;
  permissionId: string;
  revokedBy: string;
  reason?: string | null;
}): Promise<AuthoringPermissionRow | null> {
  const { pool, tenantId, docId, permissionId, revokedBy, reason = null } = input;

  const candidate = await pool.query(
    `SELECT id::text, role, principal_id
       FROM doc_permissions
      WHERE id = $1 AND tenant_id = $2 AND doc_id = $3 AND revoked_at IS NULL
      LIMIT 1`,
    [permissionId, tenantId, docId],
  );
  const row = candidate.rows[0];
  if (!row) return null;

  if (String(row.role).toUpperCase() === 'OWNER') {
    const owners = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM doc_permissions
        WHERE tenant_id = $1
          AND doc_id = $2
          AND role = 'OWNER'
          AND revoked_at IS NULL
          AND valid_from <= NOW()
          AND (valid_until IS NULL OR valid_until > NOW())`,
      [tenantId, docId],
    );
    if (Number(owners.rows[0]?.count ?? 0) <= 1) {
      throw new Error('LAST_OWNER');
    }
  }

  const updated = await pool.query(
    `UPDATE doc_permissions
        SET revoked_at = NOW(),
            revoked_by = $4,
            revoke_reason = $5,
            updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND doc_id = $3 AND revoked_at IS NULL
      RETURNING id::text, doc_id::text, section_id::text, tenant_id,
                principal_id, email, role, granted_by, grant_reason,
                valid_from, valid_until, revoked_at, revoked_by, revoke_reason,
                created_at, updated_at`,
    [permissionId, tenantId, docId, revokedBy, reason],
  );
  return (updated.rows[0] as AuthoringPermissionRow | undefined) ?? null;
}
