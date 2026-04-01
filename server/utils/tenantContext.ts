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

  // Log impersonation attempts
  const headerOrgId = req.headers['x-organization-id'] || req.query.organizationId || req.query.organization_id;
  if (headerOrgId && jwtOrgId && String(headerOrgId) !== jwtOrgId) {
    console.warn(
      `[SECURITY] getTenantContext: header/query org ID (${headerOrgId}) differs from ` +
      `JWT org ID (${jwtOrgId}). Using JWT value. userId=${req.user?.id || 'unknown'}`
    );
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

export const getRequestActor = (req: any): RequestActor => ({
  userName: req.user?.email || req.userEmail || 'system',
  userRole: req.user?.role || req.userRole || null,
});
