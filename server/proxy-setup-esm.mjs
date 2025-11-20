/**
 * proxy-setup-esm.mjs - ESM-compatible proxy for both REST and WebSocket connections
 *
 * This is a minimal HTTP/WebSocket proxy that connects the Express server to the
 * FastAPI backend without relying on http-proxy-middleware, which has module compatibility issues.
 *
 * Usage: node server/proxy-setup-esm.mjs
 */

import http from 'http';
import { createServer } from 'http';
import { parse as parseUrl } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Target API server details
const API_HOST = 'localhost';
const API_PORT = 8000;

// Local proxy server details
const PROXY_PORT = 5000;

// For directory access
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the proxy server
const server = createServer((req, res) => {
  console.log(`Proxying request: ${req.method} ${req.url}`);

  // Parse the URL
  const parsedUrl = parseUrl(req.url);
  let targetPath = parsedUrl.path;

  // Path rewriting for API endpoints
  if (targetPath.startsWith('/api/cer')) {
    targetPath = targetPath.replace('/api/cer', '/cer');
  } else if (targetPath.startsWith('/api/validation')) {
    targetPath = targetPath.replace('/api/validation', '');
  } else if (targetPath.startsWith('/api/ind')) {
    targetPath = targetPath.replace('/api/ind', '');
  }

  // Handle static file requests (simple cases)
  if (!targetPath.startsWith('/api') && !targetPath.startsWith('/ws')) {
    // Check if it's a root request
    if (targetPath === '/' || targetPath === '') {
      // Serve the index.html
      serveStaticFile(res, path.join(__dirname, '../client/dist/index.html'), 'text/html');
      return;
    }

    // Try to serve static files
    const staticFilePath = path.join(__dirname, '../client/dist', targetPath);
    if (fs.existsSync(staticFilePath) && fs.statSync(staticFilePath).isFile()) {
      const contentType = getContentType(staticFilePath);
      serveStaticFile(res, staticFilePath, contentType);
      return;
    }

    // No static file found, might be a client-side route
    // Serve index.html for client-side routing
    serveStaticFile(res, path.join(__dirname, '../client/dist/index.html'), 'text/html');
    return;
  }

  // Create options for proxying to the FastAPI service
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: targetPath,
    method: req.method,
    headers: req.headers,
  };

  // Remove host header to avoid conflicts
  delete options.headers.host;

  // Create the proxy request
  const proxyReq = http.request(options, proxyRes => {
    // Copy status code
    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    // Pipe the response back
    proxyRes.pipe(res, { end: true });
  });

  // Handle errors
  proxyReq.on('error', err => {
    console.error('Proxy error:', err.message);

    // Send error response
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: 'FastAPI service unreachable',
        detail: err.message,
      })
    );
  });

  // Pipe the request body to the proxy request
  req.pipe(proxyReq, { end: true });
});

// Improved WebSocket proxying with detailed logging
server.on('upgrade', (req, socket, head) => {
  console.log(`WebSocket upgrade request: ${req.url}`);

  try {
    // Parse the URL
    const parsedUrl = parseUrl(req.url);
    let targetPath = parsedUrl.path;

    console.log(`WebSocket path: ${targetPath}`);

    // Create headers for the upgrade request to the API server
    const headers = {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
    };

    // Copy all relevant headers from the client request
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'host' && lowerKey !== 'connection' && lowerKey !== 'upgrade') {
        headers[key] = req.headers[key];
      }
    });

    // Add the Sec-WebSocket headers which are critical for the handshake
    if (req.headers['sec-websocket-key']) {
      headers['Sec-WebSocket-Key'] = req.headers['sec-websocket-key'];
    }
    if (req.headers['sec-websocket-version']) {
      headers['Sec-WebSocket-Version'] = req.headers['sec-websocket-version'];
    }
    if (req.headers['sec-websocket-protocol']) {
      headers['Sec-WebSocket-Protocol'] = req.headers['sec-websocket-protocol'];
    }
    if (req.headers['sec-websocket-extensions']) {
      headers['Sec-WebSocket-Extensions'] = req.headers['sec-websocket-extensions'];
    }

    console.log(`Proxying WebSocket to: ${API_HOST}:${API_PORT}${targetPath}`);

    // Create the upgrade request to the API server
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: targetPath,
      method: 'GET',
      headers: headers,
    };

    // Create the proxy request
    const proxyReq = http.request(options);

    // Handle the successful upgrade
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      console.log('WebSocket connection upgraded successfully');

      // Copy the headers from the FastAPI server's 101 response
      let responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Connection: Upgrade',
        'Upgrade: websocket',
      ];

      // Make sure to include the WebSocket accept header which is required
      if (proxyRes.headers['sec-websocket-accept']) {
        responseHeaders.push(`Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}`);
      }

      // Optional protocol/extensions headers
      if (proxyRes.headers['sec-websocket-protocol']) {
        responseHeaders.push(
          `Sec-WebSocket-Protocol: ${proxyRes.headers['sec-websocket-protocol']}`
        );
      }
      if (proxyRes.headers['sec-websocket-extensions']) {
        responseHeaders.push(
          `Sec-WebSocket-Extensions: ${proxyRes.headers['sec-websocket-extensions']}`
        );
      }

      // Write the upgrade response to the client
      socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

      // Connect the sockets together
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);

      // Handle socket close
      const onSocketClose = () => {
        proxySocket.end();
        socket.end();
      };

      // Handle socket errors
      proxySocket.on('error', err => {
        console.error('Proxy WebSocket error:', err.message);
        socket.end();
      });

      socket.on('error', err => {
        console.error('Client WebSocket error:', err.message);
        proxySocket.end();
      });

      // Handle socket closing
      proxySocket.on('close', onSocketClose);
      socket.on('close', onSocketClose);

      // Handle proxy socket timeout
      proxySocket.on('timeout', () => {
        console.warn('Proxy WebSocket timeout');
        proxySocket.end();
      });
    });

    // Handle errors with the proxy request
    proxyReq.on('error', err => {
      console.error('WebSocket proxy request error:', err.message);
      socket.end();
    });

    // Send the request
    proxyReq.end();
  } catch (err) {
    console.error('Error handling WebSocket upgrade:', err);
    socket.end();
  }
});

// Helper to serve a static file
function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end(`Error loading file: ${err.message}`);
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
}

// Helper to determine content type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
  };

  return types[ext] || 'application/octet-stream';
}

// Start the server
server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`🛰 ESM Proxy Server running at http://localhost:${PROXY_PORT}`);
  console.log(`Forwarding to FastAPI at http://${API_HOST}:${API_PORT}`);
});

// Handle SIGINT to gracefully close the server
process.on('SIGINT', () => {
  console.log('Shutting down proxy server...');
  server.close(() => {
    console.log('Proxy server closed');
    process.exit(0);
  });
});
