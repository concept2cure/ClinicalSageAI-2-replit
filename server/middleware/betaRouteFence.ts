import type { NextFunction, Request, Response } from 'express';

const DEFAULT_BLOCKED_PREFIXES = [
  '/evidence',
  '/programs',
  '/tenants',
  '/tenant-stats',
  '/cerv2-export/mock',
];

const parseBlockedPrefixes = (raw: string | undefined): string[] => {
  if (!raw) return DEFAULT_BLOCKED_PREFIXES;
  const parsed = raw
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => (token.startsWith('/') ? token : `/${token}`));
  return parsed.length > 0 ? parsed : DEFAULT_BLOCKED_PREFIXES;
};

export function isBetaRouteFenceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_BETA_ROUTE_FENCE === 'true';
}

export function createBetaRouteFence(
  env: NodeJS.ProcessEnv = process.env
): (req: Request, res: Response, next: NextFunction) => void | Response {
  const enabled = isBetaRouteFenceEnabled(env);
  const blockedPrefixes = parseBlockedPrefixes(env.BETA_ROUTE_FENCE_PREFIXES);

  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!enabled) return next();

    const reqPath = req.path || '';
    const isBlocked = blockedPrefixes.some(
      prefix => reqPath === prefix || reqPath.startsWith(`${prefix}/`)
    );
    if (!isBlocked) return next();

    res.setHeader('X-Route-Hardening', 'beta-route-fenced');
    return res.status(503).json({
      success: false,
      error: 'Route temporarily unavailable',
      code: 'BETA_ROUTE_FENCED',
      timestamp: new Date().toISOString(),
    });
  };
}
