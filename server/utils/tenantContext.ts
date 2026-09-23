import { reportSecurityAlert } from '../services/security-alerts';
import { isUuid } from '../middleware/uuidParam';

type TenantContext =
  | { organizationId: number; clientWorkspaceId: number | null }
  | { error: string };

type RequestActor = { userName: string; userRole: string | null };

export const getTenantContext = (req: any): TenantContext => {
  // SECURITY: Organization ID must come from the verified JWT token, NOT from
  // user-supplied headers or query params. This prevents tenant impersonation
  // attacks where a user sends a forged x-organization-id header.
  const jwtOrgId =
    (req.user?.organizationId != null ? String(req.user.organizationId) : undefined) ||
    (req.organizationId != null ? String(req.organizationId) : undefined) ||
    (req.tenantId != null ? String(req.tenantId) : undefined) ||
    (req.tenantContext?.organizationId != null ? String(req.tenantContext.organizationId) : undefined);

  // Log impersonation attempts. The header/query values are observed
  // for telemetry only — they are never used as the org-id authority.
  // security-allow: impersonation-detection
  const headerOrgId = req.headers['x-organization-id'] || req.query.organizationId || req.query.organization_id;
  if (headerOrgId && jwtOrgId && String(headerOrgId) !== jwtOrgId) {
    reportSecurityAlert({
      kind: 'tenant_header_mismatch',
      message:
        `getTenantContext: header/query org ID (${headerOrgId}) differs from ` +
        `JWT org ID (${jwtOrgId}). Using JWT value.`,
      detail: { headerOrgId: String(headerOrgId), jwtOrgId, userId: req.user?.id || 'unknown' },
    });
  }

  const organizationIdParam = jwtOrgId;
  const clientWorkspaceIdParam =
    req.headers['x-client-workspace-id'] ||
    req.query.clientWorkspaceId ||
    req.query.client_workspace_id;
  const organizationId = parseInt(organizationIdParam as string, 10);
  const clientWorkspaceId = clientWorkspaceIdParam
    ? parseInt(clientWorkspaceIdParam as string, 10)
    : null;

  if (!organizationIdParam || Number.isNaN(organizationId)) {
    return { error: 'Organization ID is required' };
  }

  if (clientWorkspaceIdParam && Number.isNaN(clientWorkspaceId)) {
    return { error: 'Client workspace ID must be numeric' };
  }

  return { organizationId, clientWorkspaceId };
};

/**
 * Get the organization ID for the current request, securely derived from the
 * verified JWT token. Falls back to tenant context or request-level org ID
 * (both set by auth middleware from the JWT), NEVER from user-supplied headers.
 *
 * Route handlers should use this function instead of reading
 * req.headers['x-organization-id'] directly.
 *
 * @returns The organization ID as a string, or null if not available.
 */
export const getSecureOrgId = (req: any): string | null => {
  // Priority: JWT user context > auth-middleware-set fields > tenant context
  const orgId =
    (req.user?.organizationId != null ? String(req.user.organizationId) : null) ||
    (req.organizationId != null ? String(req.organizationId) : null) ||
    (req.tenantId != null ? String(req.tenantId) : null) ||
    (req.tenantContext?.organizationId != null ? String(req.tenantContext.organizationId) : null) ||
    (req.tenant?.organizationId != null && req.tenant.organizationId !== 'default'
      ? String(req.tenant.organizationId)
      : null);

  // SECURITY: Log if client-supplied header differs from the derived value
  const headerOrgId = req.headers?.['x-organization-id'] || req.headers?.['x-org-id'];
  if (headerOrgId && orgId && String(headerOrgId) !== orgId) {
    console.warn(
      `[SECURITY] getSecureOrgId: header org ID (${headerOrgId}) differs from ` +
      `JWT org ID (${orgId}). Header ignored. userId=${req.user?.id || 'unknown'}, path=${req.path}`
    );
  }

  return orgId;
};

/**
 * Get the organization UUID for the current request, from verified identity only.
 *
 * This platform carries TWO keys for the same tenant, and they are not
 * interchangeable:
 *
 *   organizations.id    serial (integer) — every public-schema table keys on this
 *   organizations.uuid  uuid             — every NON-public schema keys on this
 *
 * `getSecureOrgId` above returns the integer. Handing that integer to a `uuid`
 * column does not filter and does not return nothing — Postgres raises
 * `invalid input syntax for type uuid`, which surfaces as a 500 and reads as an
 * outage rather than as a refusal. So `cortex.*`, `innovation.*`, `ai.*`,
 * `compliance.*` and `identity.*` need this accessor, not that one.
 *
 * Only `req.user.organizationUuid` is trusted, because it is the only source the
 * auth layer derives from a membership row (see middleware/orgMembership.ts).
 * `req.tenantContext.organizationUuid` is deliberately NOT consulted: it is
 * published by other middleware and this module must not depend on the order they
 * ran in to know whether the value was verified.
 *
 * Fails closed. A request with no verified UUID gets null, never a client-supplied
 * value and never a non-UUID that would reach a query and raise.
 *
 * @returns The organization UUID, or null when none was verified.
 */
export const getSecureOrgUuid = (req: any): string | null => {
  const claimed = req?.user?.organizationUuid;
  const orgUuid = isUuid(claimed) ? (claimed as string) : null;

  // SECURITY: the client may send x-org-uuid. It is observed for telemetry and
  // never used. Reported when it disagrees with the verified value — including
  // the case where there is no verified value for it to disagree with, which is
  // the one where a naive fallback would hand it straight to a WHERE clause.
  // security-allow: impersonation-detection
  const headerUuid = req?.headers?.['x-org-uuid'];
  if (headerUuid && String(headerUuid) !== (orgUuid ?? '')) {
    reportSecurityAlert({
      kind: 'tenant_header_mismatch',
      message:
        `getSecureOrgUuid: header org UUID (${String(headerUuid)}) differs from ` +
        `verified org UUID (${orgUuid ?? 'none'}). Header ignored.`,
      detail: {
        headerOrgUuid: String(headerUuid),
        verifiedOrgUuid: orgUuid,
        userId: req?.user?.id || 'unknown',
        path: req?.path,
      },
    });
  }

  return orgUuid;
};

export const getRequestActor = (req: any): RequestActor => ({
  userName: req.user?.email || req.userEmail || 'system',
  userRole: req.user?.role || req.userRole || null,
});
