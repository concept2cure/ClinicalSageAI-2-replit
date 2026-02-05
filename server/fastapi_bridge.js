/**
 * FastAPI Bridge Module
 *
 * This module creates a proxy to the FastAPI backend running on port 8000.
 * It forwards specific API paths to the FastAPI server.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Register the FastAPI proxy middleware with the Express app
 *
 * @param {import('express').Application} app - Express application instance
 */
function registerFastapiProxy(app) {
  const FASTAPI_PORT = process.env.FASTAPI_PORT || 8000;
  const FASTAPI_URL = `http://localhost:${FASTAPI_PORT}`;

  console.log(`Setting up FastAPI proxy to ${FASTAPI_URL}`);

  try {
    // Proxy middleware options
    const proxyOptions = {
      target: FASTAPI_URL,
      changeOrigin: true,
      pathRewrite: {
        // Rewrite paths to remove the /api prefix when forwarding to FastAPI
        // This allows the frontend to use /api/validate while FastAPI uses /validate
        '^/api/validate': '/validate',
        '^/api/regintel': '/regintel',
      },
      // Handle proxy errors
      onError: (err, req, res) => {
        console.error(`Proxy error: ${err.message}`);
        res.status(500).json({
          error: 'FastAPI service unavailable',
          message: 'Could not connect to the validation service',
        });
      },
      // Log proxy activity
      logLevel: 'warn',
      onProxyReq: (proxyReq, req, res) => {
        // Log the proxied request
        console.log(`Proxying ${req.method} ${req.url} -> ${FASTAPI_URL}${proxyReq.path}`);
      },
      onProxyRes: (proxyRes, req, res) => {
        // Log the proxy response
        console.log(`Received ${proxyRes.statusCode} for ${req.method} ${req.url}`);
      },
    };

    // Apply the proxy middleware to relevant API paths
    app.use('/api/validate', createProxyMiddleware(proxyOptions));
    app.use('/api/regintel', createProxyMiddleware(proxyOptions));

    // Proxy lumen_cortex batch ops endpoints (no path rewrite needed)
    app.use('/review', createProxyMiddleware({
      ...proxyOptions,
      pathRewrite: undefined, // Keep /review path as-is
    }));

    // Create health check route
    app.get('/api/fastapi-health', async (req, res) => {
      try {
        const response = await fetch(`${FASTAPI_URL}/health`);
        if (response.ok) {
          res.json({ status: 'Connected', backend: 'FastAPI' });
        } else {
          res.status(503).json({ status: 'Error', message: 'FastAPI server returned an error' });
        }
      } catch (error) {
        res.status(503).json({ status: 'Error', message: 'Could not connect to FastAPI server' });
      }
    });

    console.log(`Connected to FastAPI server running on PORT=${FASTAPI_PORT}`);
  } catch (error) {
    console.error(`Failed to setup FastAPI proxy: ${error.message}`);
  }
}

module.exports = registerFastapiProxy;
