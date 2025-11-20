/**
 * fastapi_proxy.js - Robust proxy for FastAPI connections
 *
 * This module handles proxying requests from the Express server to the FastAPI backend
 * using http-proxy-middleware, providing better WebSocket support and more reliable
 * connection handling for both REST and WebSocket endpoints.
 */

import pkg from 'http-proxy-middleware';
const { createProxyMiddleware } = pkg;

/**
 * Create proxy middleware for Express
 * @returns {Function} Express middleware function
 */
export function createFastApiProxyMiddleware() {
  const apiPort = process.env.PORT || 8000;
  const target = `http://localhost:${apiPort}`;

  console.log(`Setting up FastAPI proxy to ${target}`);

  // Create API routes proxy middleware
  const apiProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      '^/api/cer': '/cer', // Rewrite /api/cer to /cer
      '^/api/validation': '', // Rewrite /api/validation to /
      '^/api/ind': '', // Rewrite /api/ind to /
    },
    logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    onError(err, req, res) {
      console.error('FastAPI proxy error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'FastAPI service unreachable',
            detail: err.message,
          })
        );
      }
    },
  });

  // Create WebSocket proxy middleware
  const wsProxy = createProxyMiddleware({
    target,
    ws: true,
    changeOrigin: true,
    pathRewrite: {
      '^/ws': '/ws', // Keep /ws path
    },
    logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    onError(err, req, socket) {
      console.error('WebSocket proxy error:', err.message);
      if (socket.writable) {
        socket.end();
      }
    },
  });

  // Combined middleware function
  return function (req, res, next) {
    if (
      req.path.startsWith('/api/cer/') ||
      req.path.startsWith('/api/validation/') ||
      req.path.startsWith('/api/ind/') ||
      req.path === '/api/projects'
    ) {
      apiProxy(req, res, next);
    } else if (req.path.startsWith('/ws')) {
      wsProxy(req, res, next);
    } else {
      next();
    }
  };
}

// Only use the export, no module.exports
// Export is already defined above via "export function"
