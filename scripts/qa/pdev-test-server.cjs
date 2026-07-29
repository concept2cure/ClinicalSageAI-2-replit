/* Minimal Express server mounting just the PDEV routes for end-to-end testing.
 * Bypasses the pre-existing pdf-parse import error in the full server.
 * Proxies static assets to the Vite preview on port 5173.
 */
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable';
process.env.NODE_ENV = 'development';
process.env.PORT = '5000';
// Stub OPENAI key so the gateway init doesn't error
process.env.OPENAI_API_KEY = 'test-key-not-used';

// Register tsx loader so we can import TS server files
require('tsx/cjs');

const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Mock auth middleware — every request is the admin of org 1, user 1
app.use((req, res, next) => {
  req.userId = 1;
  req.organizationId = 1;
  req.user = {
    id: 1,
    organizationId: 1,
    roles: ['admin'],
    permissions: ['*'],
  };
  // Match the shape the real auth middleware sets
  if (!req.headers['x-organization-id']) {
    req.headers['x-organization-id'] = '1';
  }
  next();
});

// Mount PDEV
const pdevPath = path.resolve(__dirname, '/home/user/ClinicalSageAI-2-replit/server/routes/pdev/pdev-routes.ts');
try {
  const pdevRouter = require(pdevPath);
  const router = pdevRouter.default || pdevRouter;
  app.use('/api/pdev', router);
  console.log('mounted /api/pdev');
} catch (e) {
  console.error('FAIL mount pdev:', e.message);
  process.exit(1);
}

// Stub /api/regulatory-programs (used by PdevApp's program list)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.get('/api/regulatory-programs', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, organization_id AS "organizationId", code, name, product_name AS "productName",
              program_type AS "programType", product_type AS "productType",
              regulatory_path AS "regulatoryPath", primary_agency AS "primaryAgency",
              status, phase, priority, target_submission_date AS "targetSubmissionDate",
              progress_percent AS "progressPercent", completed_milestones AS "completedMilestones",
              total_milestones AS "totalMilestones", lead_user_id AS "leadUserId",
              team_members AS "teamMembers", metadata,
              created_at AS "createdAt", updated_at AS "updatedAt",
              description, device_class AS "deviceClass", product_code AS "productCode"
       FROM regulatory_programs WHERE organization_id = $1`,
      [1],
    );
    res.json({ data: r.rows });
  } catch (e) {
    console.error('regulatory-programs error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Proxy everything else to Vite preview
const VITE = 'http://127.0.0.1:5173';
app.use((req, res) => {
  const proxyReq = http.request(
    {
      host: '127.0.0.1', port: 5173,
      method: req.method, path: req.url, headers: { ...req.headers, host: '127.0.0.1:5173' },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (e) => {
    res.status(502).json({ error: 'vite proxy error: ' + e.message });
  });
  req.pipe(proxyReq);
});

app.listen(5000, '127.0.0.1', () => {
  console.log('test server listening on http://127.0.0.1:5000');
});
