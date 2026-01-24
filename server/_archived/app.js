/**
 * TrialSage Express Server
 *
 * This is the main entry point for the TrialSage server application.
 * It sets up Express with middleware and registers all API routes.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const { registerRoutes } = require('./routes');
const securityMiddleware = require('./middleware/security');

/**
 * Create and configure the Express application
 *
 * @returns {Express} - Configured Express application
 */
function createApp() {
  const app = express();

  // Apply middleware
  app.use(helmet()); // Security headers
  app.use(cors()); // Cross-origin resource sharing
  app.use(bodyParser.json()); // Parse JSON request body
  app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded request body
  app.use(compression()); // Compress responses
  app.use(morgan('combined')); // Request logging

  // Apply security middleware
  app.use(securityMiddleware.authenticateRequest);
  app.use(securityMiddleware.authorizeRequest);
  app.use(securityMiddleware.validateContentIntegrity);

  // Register all routes
  registerRoutes(app);

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);

    // Log security error
    securityMiddleware.auditLog('SERVER_ERROR', {
      path: req.path,
      method: req.method,
      error: err.message,
      status: err.status || 500,
    });

    res.status(err.status || 500).json({
      error: err.name || 'InternalServerError',
      message: err.message || 'An unexpected error occurred',
      path: req.path,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

module.exports = createApp;
