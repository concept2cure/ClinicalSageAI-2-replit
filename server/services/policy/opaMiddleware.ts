import type { Request, Response, NextFunction } from 'express';
import { opaClient } from './opaClient';

export function createPolicyGuard(params: { action: string; module: string; resourceType: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const input = opaClient.buildInput(req, params.action, params.module, params.resourceType);
    const decision = await opaClient.evaluate(input);

    console.info('[OPA]', {
      mode: opaClient.isEnforceMode() ? 'enforce' : 'observe',
      allow: decision.allow,
      reason: decision.reason,
      action: params.action,
      route: req.originalUrl,
      organizationId: input.organizationId,
      userId: input.userId,
      projectId: input.projectId,
    });

    if (!decision.allow && opaClient.isEnforceMode()) {
      return res.status(403).json({
        success: false,
        error: 'Policy denied',
        details: {
          action: params.action,
          reason: decision.reason || 'Denied by policy',
        },
      });
    }

    return next();
  };
}
