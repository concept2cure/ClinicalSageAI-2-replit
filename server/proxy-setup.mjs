/**
 * proxy-setup.mjs  –  lightweight HTTP proxy starter in pure ESM
 * invoked with:  node server/proxy-setup.mjs
 */
import httpProxy from 'http-proxy';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: dirname(fileURLToPath(import.meta.url)) + '/../.env' });

const TARGET = process.env.PROXY_TARGET || 'http://localhost:8000';

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  changeOrigin: true,
  ws: true, // Enable WebSocket support
  secure: false,
  pathRewrite: {
    '^/api/cer': '/cer',
    '^/api/validation': '',
    '^/api/ind': '',
  },
});

// Handle WebSocket errors
proxy.on('open', proxySocket => {
  console.log('WebSocket connection opened');

  proxySocket.on('error', err => {
    console.error('[ws error]', err);
  });
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('[proxy error]', err);

  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: 'FastAPI service unreachable',
        detail: err.message,
      })
    );
  }
});

// Add path rewrite handling
proxy.on('proxyReq', (proxyReq, req, res, options) => {
  const originalPath = req.url;
  console.log(`Proxying ${req.method} ${originalPath} -> ${TARGET}${originalPath}`);
});

const PORT = Number(process.env.PROXY_PORT || 5000);
proxy.listen(PORT, () => console.log(`🛰 Proxy listening on http://localhost:${PORT} → ${TARGET}`));
