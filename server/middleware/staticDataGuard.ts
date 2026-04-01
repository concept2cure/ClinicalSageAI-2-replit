import type { NextFunction, Request, Response } from 'express';

export const STATIC_DATA_FLAGS = [
  'ENABLE_HAQ_MANAGER_STATIC_DATA',
  'ENABLE_MISSION_CONTROL_STATIC_DATA',
] as const;

export function isStaticDataEnabled(flagName: string): boolean {
  return process.env[flagName] === 'true';
}

export function assertNoStaticDataFlagsInProduction(
  nodeEnv: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (nodeEnv !== 'production') return;

  const enabledFlags = STATIC_DATA_FLAGS.filter(flagName => env[flagName] === 'true');
  if (enabledFlags.length > 0) {
    throw new Error(
      `Static-data routes cannot be enabled in production. Disable: ${enabledFlags.join(', ')}`
    );
  }
}

export function sendStaticDataDisabled(
  res: Response,
  routeName: string,
  requiredFlag: string
): Response {
  res.setHeader('X-Route-Hardening', 'static-business-data-blocked');
  res.setHeader('X-Route-Enable-Flag', requiredFlag);
  return res.status(503).json({
    success: false,
    error: `${routeName} is temporarily unavailable`,
    code: 'STATIC_BUSINESS_DATA_DISABLED',
    requiredFlag,
    timestamp: new Date().toISOString(),
    message:
      'This endpoint was fail-closed because it serves hardcoded or static business data. Re-enable only after migrating to governed persisted data.',
  });
}

export function requireStaticDataEnabled(flagName: string, routeName: string) {
  return (_req: Request, res: Response, next: NextFunction): void | Response => {
    if (!isStaticDataEnabled(flagName)) {
      return sendStaticDataDisabled(res, routeName, flagName);
    }
    return next();
  };
}
