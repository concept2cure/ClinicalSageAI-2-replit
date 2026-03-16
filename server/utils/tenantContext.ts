type TenantContext =
  | { organizationId: number; clientWorkspaceId: number | null }
  | { error: string };

type RequestActor = { userName: string; userRole: string | null };

export const getTenantContext = (req: any): TenantContext => {
  const organizationIdParam =
    req.headers['x-organization-id'] ||
    req.query.organizationId ||
    req.query.organization_id ||
    // Fall back to value set by JWT auth middleware
    (req.organizationId != null ? String(req.organizationId) : undefined) ||
    (req.tenantId != null ? String(req.tenantId) : undefined);
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

export const getRequestActor = (req: any): RequestActor => ({
  userName:
    (req.headers['x-user-name'] as string) || (req.headers['x-user-email'] as string) || 'system',
  userRole: (req.headers['x-user-role'] as string) || null,
});
