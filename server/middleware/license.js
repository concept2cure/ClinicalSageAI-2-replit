import { hasModuleAccess } from '../services/licenseService.js';

export const requireModuleEntitlement = moduleId => {
  return async (req, res, next) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const projectId = req.body?.projectId || req.query?.projectId;
      const clientWorkspaceId = req.body?.clientWorkspaceId || req.query?.clientWorkspaceId;

      const allowed = await hasModuleAccess({
        organizationId,
        moduleId,
        projectId: projectId ? Number(projectId) : undefined,
        clientWorkspaceId: clientWorkspaceId ? Number(clientWorkspaceId) : undefined,
      });

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: subscription does not include this module',
        });
      }

      return next();
    } catch (error) {
      console.error('License enforcement error:', error);
      return res.status(500).json({ success: false, message: 'License enforcement failed' });
    }
  };
};
