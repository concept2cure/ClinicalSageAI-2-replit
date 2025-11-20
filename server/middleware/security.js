/**
 * Security Middleware
 *
 * This module provides security-related middleware for the Express application,
 * including Helmet for security headers, CORS configuration, and rate limiting.
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../config/environment').config;

// Base CORS configuration
const corsOptions = {
  // In production, restrict to specific domains
  origin: config.isProduction
    ? ['https://trialsage.com', 'https://app.trialsage.com', /\.trialsage\.com$/]
    : true, // Allow all in development
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID', 'X-Client-Workspace-ID'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

// Standard API rate limiter
const apiRateLimiter = rateLimit({
  windowMs: config.safety.rateLimit.windowMs,
  max: config.safety.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  // Store in Redis in production, memory in development
  // This would need redis client configuration in production
  // store: new RedisStore({ client: redisClient })
});

// More restrictive rate limiter for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  // Same Redis store comment as above
});

/**
 * Apply security middleware to Express app
 * @param {Express} app - Express application
 */
function applySecurityMiddleware(app) {
  // Apply Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Adjust as needed
          connectSrc: ["'self'", 'https://api.openai.com', 'https://*.trialsage.com'],
          imgSrc: ["'self'", 'data:', 'https://*.trialsage.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
        },
      },
      // Enable strict HTTPS enforcement in production
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      // Other security headers
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
    })
  );

  // Apply CORS configuration
  app.use(cors(corsOptions));

  // Apply rate limiters
  app.use('/api/', apiRateLimiter);
  app.use('/auth/', authRateLimiter);

  // Log security configuration
  console.info('Security middleware configured:', {
    corsEnabled: true,
    rateLimitingEnabled: true,
    helmetEnabled: true,
    environment: config.env,
  });
}

module.exports = {
  applySecurityMiddleware,
};
