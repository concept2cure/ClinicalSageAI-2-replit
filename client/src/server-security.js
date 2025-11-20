/**
 * Server-Side Security Implementation
 *
 * Provides robust security mechanisms for the server-side of the application:
 * - Rate limiting
 * - Request validation
 * - Advanced authentication
 * - Audit logging
 * - XSS and CSRF protection
 */

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');

/**
 * Configure middleware for Express.js server security
 * @param {express.Application} app - Express app instance
 */
function configureServerSecurity(app) {
  // Apply Helmet security middleware with strict configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://raw.githubusercontent.com'],
          connectSrc: ["'self'", 'wss:', 'https://*.concept2cures.ai'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      xssFilter: true,
      hsts: {
        maxAge: 15552000, // 180 days
        includeSubDomains: true,
        preload: true,
      },
      frameguard: {
        action: 'deny',
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      noSniff: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    })
  );

  // Add security headers not covered by Helmet
  app.use((req, res, next) => {
    // Generate nonce for CSP
    res.locals.nonce = crypto.randomBytes(16).toString('base64');

    // Additional security headers
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  // Configure express-rate-limit
  const rateLimiter = require('express-rate-limit');

  // API rate limiting
  const apiLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    skip: req =>
      req.url.startsWith('/static/') || req.url.endsWith('.css') || req.url.endsWith('.js'),
  });

  // Authentication endpoint stricter rate limiting
  const authLimiter = rateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 login attempts per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many login attempts, please try again later.',
  });

  // Apply rate limiters
  app.use('/api/', apiLimiter);
  app.use('/api/login', authLimiter);
  app.use('/api/auth', authLimiter);

  // Configure CSRF protection with double-submit cookie pattern
  const csrf = require('csurf');
  app.use(
    csrf({
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      },
    })
  );

  // Error handler for CSRF
  app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
      // Log potential CSRF attack
      console.error(`CSRF Attack detected: ${req.ip} - ${req.method} ${req.originalUrl}`);
      return res.status(403).json({
        error: 'Invalid security token. Please refresh the page and try again.',
      });
    }
    next(err);
  });

  // Setup security audit logging
  app.use((req, res, next) => {
    // Skip logging for static assets
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
      return next();
    }

    // Log API requests for security audit
    if (req.url.startsWith('/api/')) {
      const requestId = crypto.randomBytes(8).toString('hex');
      const timestamp = new Date().toISOString();

      // Add request ID to response for correlation
      res.setHeader('X-Request-ID', requestId);

      // Create security log entry
      const logEntry = {
        requestId,
        timestamp,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        authenticated: req.isAuthenticated ? req.isAuthenticated() : false,
      };

      // Avoid logging sensitive data
      if (req.url.includes('/auth') || req.url.includes('/login')) {
        logEntry.sensitiveEndpoint = true;
        // Don't log body for sensitive endpoints
      } else {
        logEntry.bodySize = req.body ? JSON.stringify(req.body).length : 0;
      }

      console.info(`SECURITY_AUDIT: ${JSON.stringify(logEntry)}`);
    }

    next();
  });

  return app;
}

module.exports = { configureServerSecurity };
