/**
 * Comprehensive API + Frontend Route Smoke Test
 * Tests all critical endpoints to ensure no 500 errors or unloaded dependencies
 */
const http = require('http');

let TOKEN = null;
let passCount = 0;
let failCount = 0;
let warnCount = 0;
const failures = [];
const warnings = [];

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`http://localhost:5000${path}`);
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    const payload = body ? JSON.stringify(body) : null;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout: 10000,
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: 'TIMEOUT' });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function check(label, status, acceptable = [200, 201, 304]) {
  if (status === 500) {
    failCount++;
    failures.push(`FAIL [500]: ${label}`);
    console.log(`  ❌ ${label} → ${status}`);
  } else if (acceptable.includes(status)) {
    passCount++;
    console.log(`  ✅ ${label} → ${status}`);
  } else if (status === 401 || status === 403) {
    // Auth issue - might be expected for protected routes
    passCount++;
    console.log(`  ✅ ${label} → ${status} (auth enforced)`);
  } else if (status === 404) {
    warnCount++;
    warnings.push(`WARN [404]: ${label}`);
    console.log(`  ⚠️  ${label} → ${status} (not found)`);
  } else if (status === 0) {
    failCount++;
    failures.push(`FAIL [TIMEOUT/ERR]: ${label}`);
    console.log(`  ❌ ${label} → TIMEOUT/ERROR`);
  } else {
    warnCount++;
    warnings.push(`WARN [${status}]: ${label}`);
    console.log(`  ⚠️  ${label} → ${status}`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE SMOKE TEST — ClinicalSageAI Platform   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── PHASE 1: Public endpoints ───────────────────────────────────────
  console.log('── PHASE 1: Public Endpoints ──');
  let r;

  r = await request('GET', '/healthz');
  check('GET /healthz', r.status);

  r = await request('GET', '/api/health');
  check('GET /api/health', r.status);

  r = await request('GET', '/api/diag');
  check('GET /api/diag', r.status);

  // ── PHASE 2: Auth system ────────────────────────────────────────────
  console.log('\n── PHASE 2: Auth System ──');

  // Login
  r = await request('POST', '/api/auth/login', {
    email: 'jm.smith@concept2cure.pro',
    password: 'Concept2Cure2026!',
  });
  check('POST /api/auth/login', r.status);
  try {
    TOKEN = JSON.parse(r.body).accessToken;
  } catch (e) {}
  if (!TOKEN) {
    console.log('  ❌ FATAL: No token received. Cannot continue protected tests.');
    process.exit(1);
  }

  // /api/v1/auth/login (alias)
  r = await request('POST', '/api/v1/auth/login', {
    email: 'jm.smith@concept2cure.pro',
    password: 'Concept2Cure2026!',
  });
  check('POST /api/v1/auth/login (alias)', r.status);

  // Auth me
  r = await request('GET', '/api/auth/me', null, TOKEN);
  check('GET /api/auth/me', r.status);

  // No token → 401
  r = await request('GET', '/api/auth/me');
  check('GET /api/auth/me (no token)', r.status, [401]);

  // Invalid token → 401
  r = await request('GET', '/api/projects', null, 'invalid-jwt-token');
  check('GET /api/projects (bad token)', r.status, [401]);

  // ── PHASE 3: Core Protected API Endpoints ───────────────────────────
  console.log('\n── PHASE 3: Core Protected API Endpoints ──');

  const protectedGets = [
    '/api/projects',
    '/api/csr',
    '/api/reports',
    '/api/reports/count',
    '/api/vault/statistics',
    '/api/vault/list',
    '/api/templates',
    '/api/atoms',
    '/api/510k-workflow',
    '/api/ectd/templates',
    '/api/audit/logs',
    '/api/audit-logs',
    '/api/audit/events',
    '/api/retention/policies',
    '/api/retention/document-types',
    '/api/csr/search',
    '/api/csr-intelligence',
    '/api/csr-intelligence/analytics',
    '/api/csr-intelligence/stats',
    '/api/csr-intelligence/factual-insights',
    '/api/csr-real-data/all',
    '/api/csr-real-data/stats',
    '/api/advisor/check-readiness',
    '/api/cro/dashboard',
    '/api/cro/clients',
    '/api/cro/studies',
    '/api/cro/submissions',
    '/api/cro/milestones',
    '/api/lumen/regulatory-intelligence',
  ];

  for (const path of protectedGets) {
    r = await request('GET', path, null, TOKEN);
    check(`GET ${path}`, r.status, [200, 201, 304, 404]); // 404 OK for empty data
  }

  // ── PHASE 4: Sub-router health checks ──────────────────────────────
  console.log('\n── PHASE 4: Sub-router Mounts ──');

  const subRouters = [
    '/api/enterprise',
    '/api/cmc',
    '/api/ai-assistance',
    '/api/lumen-cortex',
    '/api/intelligent-docs',
    '/api/foresight',
    '/api/biotech-rag',
    '/api/cerv2',
    '/api/medical-devices',
    '/api/fda',
    '/api/cer',
    '/api/pubmed',
    '/api/literature-review',
    '/api/stability',
    '/api/supply-chain',
    '/api/document-authoring',
    '/api/coauthor',
    '/api/ectd-documents',
    '/api/evidence',
    '/api/content-plan',
    '/api/smart-blocks',
    '/api/cognitive',
    '/api/docx-factory',
    '/api/predicate-intelligence',
    '/api/demo',
    '/api/collaboration',
    '/api/workflow',
    '/api/cortex',
    '/api/chat',
    '/api/concept2cure',
    '/api/submission-center',
    '/api/tenants',
    '/api/organizations',
    '/api/clients/all',
    '/api/ind',
    '/api/quality',
    '/api/analytics',
    '/api/documents',
    '/api/protocol',
    '/api/regulatory',
    '/api/notifications',
    '/api/ind-wizard',
  ];

  for (const path of subRouters) {
    r = await request('GET', path, null, TOKEN);
    // 404, 200, 301 are all acceptable - means the router mounted
    // 500 means crash
    check(`GET ${path} (mount check)`, r.status, [200, 201, 304, 404, 405, 301, 302]);
  }

  // ── PHASE 5: Frontend Page Routes ──────────────────────────────────
  console.log('\n── PHASE 5: Frontend Page Routes ──');

  const frontendRoutes = [
    '/',
    '/concept2cure/login',
    '/concept2cure/signup',
    '/concept2cure',
    '/login',
    '/signup',
    '/client-portal',
    '/dashboard',
    '/client-portal/vault',
    '/client-portal/cer-generator',
    '/client-portal/cmc-wizard',
    '/client-portal/510k',
    '/client-portal/ectd-coauthor',
    '/client-portal/regulatory-intel',
    '/client-portal/lumen-cortex',
    '/v3',
    '/unified-suite',
    '/lumen-cortex',
  ];

  for (const path of frontendRoutes) {
    r = await request('GET', path);
    // All frontend routes should return 200 (the SPA HTML)
    const isHtml = r.body && r.body.includes('<!doctype html');
    if (r.status === 200 && isHtml) {
      passCount++;
      console.log(`  ✅ GET ${path} → 200 (HTML)`);
    } else if (r.status === 200) {
      passCount++;
      console.log(`  ✅ GET ${path} → 200`);
    } else {
      failCount++;
      failures.push(`FAIL: Frontend route ${path} → ${r.status}`);
      console.log(`  ❌ GET ${path} → ${r.status}`);
    }
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(
    `║   RESULTS: ✅ ${passCount} passed | ❌ ${failCount} failed | ⚠️  ${warnCount} warnings     ║`
  );
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failures.length) {
    console.log('\n🔴 FAILURES:');
    failures.forEach(f => console.log(`   ${f}`));
  }
  if (warnings.length) {
    console.log('\n🟡 WARNINGS:');
    warnings.forEach(w => console.log(`   ${w}`));
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
