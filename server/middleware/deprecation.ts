/**
 * Route Deprecation Middleware
 *
 * Provides standardized deprecation notices for legacy routes.
 * Part of Q1 2026 consolidation sprint per roadmap.
 *
 * @module server/middleware/deprecation
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('deprecation');

// Deprecation sunset dates (per roadmap Q2 2026)
const DEPRECATION_DATES = {
  '510k-legacy': '2026-06-30',
  'fda510k-legacy': '2026-06-30',
  'v1-api': '2026-09-30',
} as const;

type DeprecationCategory = keyof typeof DEPRECATION_DATES;

export interface DeprecationOptions {
  /** Category for sunset date lookup */
  category: DeprecationCategory;
  /** New endpoint path to migrate to */
  newEndpoint: string;
  /** Optional custom message */
  message?: string;
  /** Log deprecation access (default: true) */
  logAccess?: boolean;
  /** Include migration guide link */
  migrationGuide?: string;
}

/**
 * Deprecation middleware factory
 * Adds deprecation headers and optional logging for legacy routes
 *
 * @example
 * ```typescript
 * router.use(deprecationNotice({
 *   category: '510k-legacy',
 *   newEndpoint: '/api/fda510k-unified/device',
 * }));
 * ```
 */
export function deprecationNotice(options: DeprecationOptions) {
  const {
    category,
    newEndpoint,
    message,
    logAccess = true,
    migrationGuide = '/api/fda510k-unified/docs',
  } = options;

  const sunsetDate = DEPRECATION_DATES[category];

  return (req: Request, res: Response, next: NextFunction) => {
    // Set standard deprecation headers (RFC 8594)
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', new Date(sunsetDate).toUTCString());
    res.setHeader('Link', `<${newEndpoint}>; rel="successor-version"`);

    // Add custom deprecation warning header
    const warningMessage =
      message ||
      `This endpoint is deprecated and will be removed on ${sunsetDate}. ` +
        `Please migrate to ${newEndpoint}. ` +
        `See ${migrationGuide} for migration guide.`;

    res.setHeader('Warning', `299 - "${warningMessage}"`);
    res.setHeader('X-Deprecation-Notice', warningMessage);
    res.setHeader('X-Migration-Endpoint', newEndpoint);
    res.setHeader('X-Migration-Guide', migrationGuide);

    // Log access to deprecated endpoint
    if (logAccess) {
      const orgId = req.headers['x-organization-id'] || 'unknown';
      logger.warn('Deprecated endpoint accessed', {
        path: req.path,
        method: req.method,
        organizationId: orgId,
        newEndpoint,
        sunsetDate,
        userAgent: req.headers['user-agent'],
      });
    }

    next();
  };
}

/**
 * Create deprecation notice for 510k routes
 */
export function create510kDeprecationNotice(subPath: string) {
  return deprecationNotice({
    category: '510k-legacy',
    newEndpoint: `/api/fda510k-unified${subPath}`,
    migrationGuide: '/api/fda510k-unified/docs',
  });
}

/**
 * Deprecation response for completely removed endpoints
 */
export function removedEndpoint(newEndpoint: string) {
  return (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'Gone',
      message: 'This endpoint has been removed.',
      migrateTo: newEndpoint,
      documentation: '/api/fda510k-unified/docs',
    });
  };
}

/**
 * Check if an endpoint is past its sunset date
 */
export function isPastSunset(category: DeprecationCategory): boolean {
  const sunsetDate = new Date(DEPRECATION_DATES[category]);
  return new Date() > sunsetDate;
}

export default {
  deprecationNotice,
  create510kDeprecationNotice,
  removedEndpoint,
  isPastSunset,
  DEPRECATION_DATES,
};
