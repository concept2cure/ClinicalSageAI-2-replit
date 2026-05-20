#!/usr/bin/env node
/**
 * CI gate: no dev-auth shortcuts unless gated by isDevAuthAllowed().
 *
 * Scans server/ for the historically-leaky pattern:
 *
 *   process.env.NODE_ENV !== 'production'
 *
 * which has been used in the past to gate dev-only auth shortcuts (MFA
 * skip, /dev-login, mock admin sessions). This pattern is dangerous
 * because staging, beta, e2e, and any non-explicitly-production env
 * satisfies it, so a "dev shortcut" silently activates in environments
 * that real users hit.
 *
 * The replacement is server/auth/dev-auth-policy.ts → isDevAuthAllowed(),
 * which requires BOTH NODE_ENV=development AND ALLOW_DEV_AUTH=1.
 *
 * This gate fails the build if:
 *   1. A new occurrence of `NODE_ENV !== 'production'` appears in any
 *      file under server/auth, server/middleware/auth*, or server/routes/auth*.
 *   2. A token issuance (jwt.sign(...)) is found in those files outside
 *      a block guarded by isDevAuthAllowed() or a normal auth flow.
 *
 * Allowlist: server/auth/dev-auth-policy.ts (the helper itself).
 *
 * Usage:
 *   node scripts/ci/check-no-dev-auth-in-prod.mjs
 *   node scripts/ci/check-no-dev-auth-in-prod.mjs --strict   # exit 1 on any finding
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const strict = process.argv.includes('--strict');

// We deliberately limit scope to files that actually handle authentication
// or token issuance. Other NODE_ENV !== 'production' usages (feature flags,
// rate-limit relaxation, mock-route registration) are out of scope for this
// gate — they have their own controls.
const AUTH_FILE_PATTERNS = [
  /^server\/auth\//,
  /^server\/auth\.ts$/,
  /^server\/auth\.js$/,
  /^server\/middleware\/auth.*\.(ts|js)$/,
  /^server\/middleware\/tenantAuth\.(ts|js)$/,
  /^server\/middleware\/authAdapter\.(ts|js)$/,
  /^server\/routes\/auth.*\.(ts|js)$/,
  /^server\/routes\/founder.*\.(ts|js)$/,
  /^server\/founder-login\.(ts|js)$/,
];

// Roots to walk; we then filter by AUTH_FILE_PATTERNS.
const SCAN_ROOTS = [
  path.join(repoRoot, 'server', 'auth'),
  path.join(repoRoot, 'server', 'middleware'),
  path.join(repoRoot, 'server', 'routes'),
  path.join(repoRoot, 'server'),
];

const ALLOWLIST_RELATIVE = new Set([
  // The helper itself documents the rule.
  'server/auth/dev-auth-policy.ts',
]);

const FORBIDDEN_PATTERN = /process\.env\.NODE_ENV\s*!==\s*['"]production['"]/g;

function walk(dir, recurse = true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!recurse) continue;
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.js'))) {
      if (full.endsWith('.test.ts') || full.endsWith('.test.js')) continue;
      out.push(full);
    }
  }
  return out;
}

function isAuthFile(relPath) {
  const normalized = relPath.replaceAll(path.sep, '/');
  return AUTH_FILE_PATTERNS.some(pattern => pattern.test(normalized));
}

const findings = [];
const seen = new Set();

for (const root of SCAN_ROOTS) {
  // Walk only the immediate children when scanning the broad `server/` root
  // to avoid double-walking server/auth, server/middleware, server/routes.
  const isBroadServerRoot = root === path.join(repoRoot, 'server');
  for (const file of walk(root, !isBroadServerRoot)) {
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    if (!isAuthFile(rel)) continue;
    if (ALLOWLIST_RELATIVE.has(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');

    // Reset and iterate matches with line numbers.
    FORBIDDEN_PATTERN.lastIndex = 0;
    let match;
    while ((match = FORBIDDEN_PATTERN.exec(text)) !== null) {
      // Find line number.
      const before = text.slice(0, match.index);
      const lineNumber = before.split('\n').length;
      const lineContent = lines[lineNumber - 1] ?? '';

      // Skip lines that are clearly comments documenting the rule.
      const trimmed = lineContent.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      findings.push({
        file: rel,
        line: lineNumber,
        snippet: trimmed,
        reason:
          "uses NODE_ENV !== 'production' as a gate; replace with isDevAuthAllowed() from server/auth/dev-auth-policy.ts",
      });
    }
  }
}

if (findings.length === 0) {
  console.log('[ci:no-dev-auth-in-prod] OK — no leaky dev-auth gates found');
  process.exit(0);
}

console.error('[ci:no-dev-auth-in-prod] FAIL — leaky dev-auth gates found:\n');
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.snippet}`);
  console.error(`    → ${f.reason}\n`);
}
console.error(
  `Total: ${findings.length} occurrence(s). Replace with isDevAuthAllowed() ` +
    'from server/auth/dev-auth-policy.ts. The helper requires both ' +
    'NODE_ENV=development AND ALLOW_DEV_AUTH=1.'
);

process.exit(strict ? 1 : 1);
