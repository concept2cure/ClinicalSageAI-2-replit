/**
 * Security Headers Middleware
 *
 * Applies recommended security headers to all HTTP responses.
 * Follows OWASP and industry best practices for web security.
 */
import { Request, Response, NextFunction } from 'express';
import { createContextLogger } from '../utils/logger';

const logger = createContextLogger({ module: 'security-headers' });

export interface SecurityHeadersOptions {
  // Content Security Policy configuration
  enableCSP?: boolean;
  cspDomainWhitelist?: string[];

  // Feature Policy/Permissions Policy configuration
  enableFeaturePolicy?: boolean;

  // Options for specific security headers
  hstsMaxAge?: number; // Strict-Transport-Security max age in seconds
  hstsIncludeSubdomains?: boolean;
  hstsPreload?: boolean;

  // Frame options
  frameOptions?: 'DENY' | 'SAMEORIGIN';

  // Debug mode
  debug?: boolean;
}

const DEFAULT_OPTIONS: SecurityHeadersOptions = {
  enableCSP: true,
  cspDomainWhitelist: [],
  enableFeaturePolicy: true,
  hstsMaxAge: 15552000, // 180 days
  hstsIncludeSubdomains: true,
  hstsPreload: true,
  frameOptions: 'DENY',
  debug: false,
};

/**
 * Create middleware to set security headers
 */
export default function createSecurityHeadersMiddleware(options: SecurityHeadersOptions = {}) {
  // Merge options with defaults
  const config = { ...DEFAULT_OPTIONS, ...options };

  if (config.debug) {
    logger.info('Security headers middleware initialized', { config });
  }

  return function securityHeaders(req: Request, res: Response, next: NextFunction) {
    // X-Content-Type-Options to prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // X-XSS-Protection for older browsers without CSP support
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Set X-Frame-Options to prevent clickjacking
    res.setHeader('X-Frame-Options', config.frameOptions || 'DENY');

    // Set Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HTTP Strict Transport Security (HSTS)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      let hstsValue = `max-age=${config.hstsMaxAge}`;
      if (config.hstsIncludeSubdomains) {
        hstsValue += '; includeSubDomains';
      }
      if (config.hstsPreload) {
        hstsValue += '; preload';
      }
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Set Content-Security-Policy if enabled
    if (config.enableCSP) {
      // Create Content-Security-Policy directives
      const domains = (config.cspDomainWhitelist || []).join(' ');
      const cspDirectives = [
        // By default, only allow content from same origin
        "default-src 'self'",

        // Allow scripts from same origin and inline for development only
        process.env.NODE_ENV === 'production'
          ? "script-src 'self'" + (domains ? ` ${domains}` : '')
          : "script-src 'self' 'unsafe-inline' 'unsafe-eval'" + (domains ? ` ${domains}` : ''),

        // Allow styles from same origin and inline (for styled-components)
        "style-src 'self' 'unsafe-inline'" + (domains ? ` ${domains}` : ''),

        // Allow images from same origin
        "img-src 'self' data: blob:" + (domains ? ` ${domains}` : ''),

        // Allow connect to same origin and API endpoints
        "connect-src 'self'" + (domains ? ` ${domains}` : ''),

        // Disable object/plugin content
        "object-src 'none'",

        // Disable browser features that can create unwanted dialog boxes
        "browser-src 'none'",

        // Disable base URIs
        "base-uri 'self'",

        // Restrict form targets
        "form-action 'self'",

        // Restrict frame ancestors (similar to X-Frame-Options)
        "frame-ancestors 'none'",

        // Block mixed content
        'block-all-mixed-content',

        // Disable font sources
        "font-src 'self'" + (domains ? ` ${domains}` : ''),
      ].join('; ');

      res.setHeader('Content-Security-Policy', cspDirectives);
    }

    // Set Feature-Policy/Permissions-Policy
    if (config.enableFeaturePolicy) {
      // Modern Permissions-Policy header (replaces Feature-Policy)
      const permissionsPolicy = [
        'camera=self',
        'microphone=self',
        'geolocation=self',
        'interest-cohort=()', // Disable FLoC (Federated Learning of Cohorts)
        'autoplay=self',
        'payment=self',
      ].join(', ');

      res.setHeader('Permissions-Policy', permissionsPolicy);

      // Legacy Feature-Policy header for older browsers
      const featurePolicy = [
        "camera 'self'",
        "microphone 'self'",
        "geolocation 'self'",
        "autoplay 'self'",
      ].join('; ');

      res.setHeader('Feature-Policy', featurePolicy);
    }

    // Cache control directives for non-static content
    if (!req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  };
}

export { createSecurityHeadersMiddleware };
