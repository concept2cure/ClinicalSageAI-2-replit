// server/diagnostics.js
// API Route Diagnostic Tool

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerDiagnostics(app) {
  console.log('🔍 Registering diagnostic API routes');

  // Health check route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Diagnostics API endpoints
  app.get('/api/diagnostics/routes', (req, res) => {
    // Get all registered routes
    const routes = [];

    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        // Routes registered directly on the app
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods).join(', ').toUpperCase(),
        });
      } else if (middleware.name === 'router') {
        // Routes added via router
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            routes.push({
              path: handler.route.path,
              methods: Object.keys(handler.route.methods).join(', ').toUpperCase(),
            });
          }
        });
      }
    });

    res.json({
      routes,
      diagnosticInfo: {
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
  });

  // Echo route to test request/response
  app.all('/api/diagnostics/echo', (req, res) => {
    res.json({
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });
  });

  // Advisor test route
  app.get('/api/diagnostics/advisor-test', (req, res) => {
    res.json({
      success: true,
      message: 'Advisor diagnostic test endpoint working',
      playbook: req.query.playbook || 'Fast IND Playbook',
      readinessScore: 65,
      timestamp: new Date().toISOString(),
    });
  });

  console.log('✅ Diagnostic routes registered:');
  console.log('   - GET /api/health');
  console.log('   - GET /api/diagnostics/routes');
  console.log('   - ALL /api/diagnostics/echo');
  console.log('   - GET /api/diagnostics/advisor-test');

  return app;
}
