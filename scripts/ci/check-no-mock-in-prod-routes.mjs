#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const routesDir = path.join(repoRoot, 'server', 'routes');
const baselinePath = path.join(
  repoRoot,
  'docs',
  'reports',
  'no-mock-in-prod-routes-baseline.json',
);
const writeBaseline = process.argv.includes('--write-baseline');

const allowedFiles = new Set([
  // Route intentionally supports dev-only mock pathways with explicit prod gates.
  'notification_routes.ts',
]);

const suspiciousPatterns = [
  /\bMOCK\b/i,
  /\bsimulated\b/i,
  /placeholder/i,
];

const prodGatePattern = /(NODE_ENV\s*===\s*['"]production['"])|(process\.env\.ENABLE_MOCK_)/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...walk(full));
    }
    else if (entry.isFile() && full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(routesDir)) {
  const rel = path.relative(repoRoot, file);
  const base = path.basename(file);
  const text = fs.readFileSync(file, 'utf8');

  const hasSuspicious = suspiciousPatterns.some((pattern) => pattern.test(text));
  if (!hasSuspicious) continue;

  if (allowedFiles.has(base)) {
    if (!prodGatePattern.test(text)) {
      findings.push(`${rel}: contains mock/simulated markers but no explicit production gate`);
    }
    continue;
  }

  findings.push(`${rel}: contains mock/simulated/placeholder markers in route handler scope`);
}

findings.sort();

if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2),
    'utf8',
  );
  console.log(`✅ wrote baseline: ${path.relative(repoRoot, baselinePath)} (${findings.length} findings)`);
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { findings: [] };
const baselineSet = new Set(Array.isArray(baseline.findings) ? baseline.findings : []);
const newFindings = findings.filter((f) => !baselineSet.has(f));

if (newFindings.length > 0) {
  console.error('❌ no-mock-in-prod-routes check failed (new findings):');
  for (const f of newFindings) console.error(`  - ${f}`);
  console.error(`\nBaseline: ${path.relative(repoRoot, baselinePath)}`);
  process.exit(1);
}

console.log(
  `✅ no-mock-in-prod-routes check passed (current=${findings.length}, baseline=${baselineSet.size}, new=0)`,
);
