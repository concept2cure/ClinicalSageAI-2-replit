/**
 * Feature Toggle Middleware
 *
 * This middleware protects routes behind feature toggles to allow
 * controlled rollout of new features to specific tenants.
 */
import { Request, Response, NextFunction } from 'express';
import { FeatureToggleService } from '../services/featureToggleService';
import { logger } from '../utils/logger';

/**
 * The request's workspace id when it is one of the organisation's own
 * workspaces, else undefined. A workspace id with no organisation to check it
 * against is never trusted.
 */
async function ownWorkspaceId(
  req: Request,
  orgId: number | undefined,
  clientWorkspaceId: string | number | null | undefined
): Promise<number | undefined> {
  if (clientWorkspaceId == null || clientWorkspaceId === '') return undefined;
  const workspaceId = Number(clientWorkspaceId);
  if (orgId === undefined || !Number.isInteger(orgId) || orgId <= 0) return undefined;
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) return undefined;
  if (await FeatureToggleService.workspaceInOrganization(workspaceId, orgId)) return workspaceId;
  logger.warn('[feature-toggle] X-Client-ID names a workspace outside the session\'s organisation; ignored', {
    organizationId: orgId,
    clientWorkspaceId: workspaceId,
    path: req.path,
  });
  return undefined;
}

/**
 * Feature toggle middleware for API routes
 *
 * @param featureKey The key for the feature to check
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export async function featureToggleMiddleware(
  featureKey: string,
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get tenant information from the request context
    const { organizationId, clientWorkspaceId } = req.tenantContext || {};

    // The organisation is the session's (tenantContext derives it from the
    // JWT). The workspace id is the client's X-Client-ID header, so it counts
    // only when it is one of the organisation's own workspaces; otherwise the
    // feature resolves at organisation level and the header is logged and
    // ignored (security audit 2026-09-24, IAM-15 / plan P1-7).
    const orgId = organizationId != null ? Number(organizationId) : undefined;
    const workspaceId = await ownWorkspaceId(req, orgId, clientWorkspaceId);
    const isEnabled = await FeatureToggleService.isFeatureEnabled(
      featureKey,
      orgId,
      workspaceId
    );

    if (!isEnabled) {
      return res.status(404).json({
        error: 'Feature not available',
        message: 'This feature is not currently available for your organization.',
      });
    }

    next();
  } catch (error) {
    console.error('Error in feature toggle middleware:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request.',
    });
  }
}

/**
 * Factory function to create middleware for a specific feature
 *
 * @param featureKey The key for the feature to check
 * @returns Express middleware function
 */
export function requireFeature(featureKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    return featureToggleMiddleware(featureKey, req, res, next);
  };
}

export default requireFeature;
