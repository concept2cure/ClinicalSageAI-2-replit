/**
 * Feature Toggle Middleware
 *
 * This middleware protects routes behind feature toggles to allow
 * controlled rollout of new features to specific tenants.
 */
import { Request, Response, NextFunction } from 'express';
import { FeatureToggleService } from '../services/featureToggleService';

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

    // Check if the feature is enabled for this tenant
    const isEnabled = await FeatureToggleService.isFeatureEnabled(
      featureKey,
      (typeof organizationId === 'string' ? parseInt(organizationId, 10) : (organizationId as number | undefined)) as number | undefined,
      clientWorkspaceId as any
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
