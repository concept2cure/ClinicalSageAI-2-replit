#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const failures = [];
const middleware = read('server/startup/middleware.ts');

const expectedOrder = [
  /applySecurityMiddleware\(app\)/,
  /app\.use\(\s*['"]\/api['"]\s*,\s*redisRateLimiter\s*\)/,
  /applyPerformanceMiddleware\(app\)/,
  /app\.use\(\s*['"]\/api['"]\s*,\s*httpLogger\s*\)/,
  /app\.use\(\s*['"]\/api\/firecrawl-webhooks['"]\s*,\s*firecrawlWebhooksRoutes\s*\)/,
  /app\.use\(\s*['"]\/api\/concept2cure['"]\s*,\s*express\.json\(\s*\{\s*limit:\s*['"]50mb['"]\s*\}\s*\)\s*\)/,
  /app\.use\(\s*['"]\/api['"]\s*,\s*express\.json\(\s*\{\s*limit:\s*['"]2mb['"]\s*\}\s*\)\s*\)/,
  /app\.use\(\s*['"]\/api['"]\s*,\s*express\.urlencoded\(\s*\{\s*extended:\s*true\s*,\s*limit:\s*['"]2mb['"]\s*\}\s*\)\s*\)/,
  /app\.use\(\s*['"]\/api['"]\s*,\s*createBetaRouteFence\(\)\s*\)/,
  /app\.use\(\s*cookieParser\(\)\s*\)/,
  /applyImmutabilityPolicy\(app\)/,
];

let cursor = -1;
for (const [index, pattern] of expectedOrder.entries()) {
  const match = middleware.match(pattern);
  const idx = match?.index ?? -1;
  assert(idx !== -1, `Missing middleware marker #${index + 1}: ${pattern}`, failures);
  if (idx !== -1) {
    assert(idx > cursor, `Middleware order regression at marker #${index + 1}`, failures);
    cursor = idx;
  }
}

assert(
  /const isConcept2cureRoute = isConcept2cureApiRoute\(req\);/.test(middleware),
  'Debug logging no longer uses centralized Concept2Cure route guard',
  failures
);

assert(
  /shouldLogRequestBody\(req, isConcept2cureRoute\)/.test(middleware),
  'Debug body logging no longer uses centralized policy guard',
  failures
);

assert(
  /\[\'GET\',\s*'HEAD',\s*'OPTIONS'\]/.test(middleware),
  'Safe HTTP method denylist for debug body logging missing',
  failures
);

if (failures.length > 0) {
  console.error('\n❌ Middleware harness readiness check failed:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log('✅ Middleware harness readiness checks passed.');
