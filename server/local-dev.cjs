#!/usr/bin/env node
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 5000;

function jsonResponse(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/healthz') {
    return jsonResponse(res, 200, { ok: true, ts: Date.now() });
  }

  if (pathname === '/readyz') {
    return jsonResponse(res, 200, { ready: true });
  }

  if (pathname === '/api/health') {
    return jsonResponse(res, 200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV || 'development',
      port: PORT,
    });
  }

  if (pathname === '/api/projects') {
    const projects = [
      { id: 1, name: 'Demo Project A', organization_id: 6 },
      { id: 2, name: 'Demo Project B', organization_id: 6 },
    ];
    return jsonResponse(res, 200, projects);
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local dev server running on port ${PORT}`);
});
