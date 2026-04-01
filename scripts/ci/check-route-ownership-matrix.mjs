#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const auditPath = path.resolve('docs/reports/route-mount-audit-latest.json');
const matrixPath = path.resolve('docs/reports/route-ownership-matrix-latest.md');

if (!fs.existsSync(auditPath)) {
  console.error(`Route mount audit file missing: ${auditPath}`);
  process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const ownership = Array.isArray(audit.ownership) ? audit.ownership : [];
const warnings = Array.isArray(audit?.issues?.warnings) ? audit.issues.warnings : [];

const warningByPath = new Map();
for (const warning of warnings) {
  const pathKey = warning?.path;
  if (!pathKey) continue;
  if (!warningByPath.has(pathKey)) warningByPath.set(pathKey, new Set());
  warningByPath.get(pathKey).add(warning.type || 'unknown');
}

const lines = [
  '# Route Ownership Matrix (Required Review Artifact)',
  '',
  `- Generated from: \`docs/reports/route-mount-audit-latest.json\``,
  `- Source timestamp: ${audit.generatedAt || 'unknown'}`,
  `- Total mounts: ${audit.mounts ?? 'unknown'}`,
  `- Errors: ${audit.errors ?? 0}`,
  `- Warnings: ${audit.warnings ?? 0}`,
  '',
  '## Prefix Ownership',
  '',
  '| Prefix | Owner | Contact | Warning types |',
  '|---|---|---|---|',
];

for (const item of ownership.sort((a, b) => String(a.prefix).localeCompare(String(b.prefix)))) {
  const prefix = item.prefix || '(unknown)';
  const warningTypes = warningByPath.has(prefix)
    ? Array.from(warningByPath.get(prefix)).sort().join(', ')
    : 'none';
  lines.push(
    `| \`${prefix}\` | ${item.owner || 'Unassigned'} | \`${item.contact || 'n/a'}\` | ${warningTypes} |`
  );
}

lines.push('', '## Review Gate', '', '- [ ] Reviewer confirmed any non-`none` warning types are accepted or remediated.');

const content = `${lines.join('\n')}\n`;

if (checkOnly) {
  if (!fs.existsSync(matrixPath)) {
    console.error(`Required review artifact missing: ${matrixPath}`);
    process.exit(1);
  }
  const existing = fs.readFileSync(matrixPath, 'utf8');
  if (existing !== content) {
    console.error('Route ownership matrix is stale. Regenerate with npm run ci:route-ownership-matrix');
    process.exit(1);
  }
  console.log('✅ Route ownership matrix check passed.');
  process.exit(0);
}

fs.writeFileSync(matrixPath, content, 'utf8');
console.log(`✅ Route ownership matrix written: ${path.relative(process.cwd(), matrixPath)}`);
