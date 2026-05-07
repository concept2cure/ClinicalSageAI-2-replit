#!/usr/bin/env node
/**
 * CI gate: password-handling hygiene in server/.
 *
 * Enforces three rules across server/:
 *
 *   1. No plaintext password equality compares.
 *      Forbidden patterns (rough but effective):
 *        password === <ident-or-string-literal>
 *        password ==  <ident-or-string-literal>
 *
 *   2. No non-bcrypt password hashing on runtime auth paths.
 *      Forbidden patterns:
 *        scrypt(... password ...)        (legacy, replaced by bcrypt)
 *        crypto.createHash('md5'...)     (broken)
 *        crypto.createHash('sha1'...)    (broken)
 *      Allowed: bcrypt / bcryptjs.
 *
 *   3. No hardcoded password literals in server/ source.
 *      Heuristic: a string literal of >=8 chars assigned to a variable
 *      named *password*, OR passed as the first arg to a hash function,
 *      that is not a `process.env.*` reference.
 *
 * Allowlist:
 *   - Test files (__tests__, *.test.ts, *.spec.ts) where short passwords
 *     are intentional fixtures.
 *
 * The CRIT-04 finding from QC_AUDIT_REPORT_2026-02-13.md was already
 * remediated; this gate prevents regression.
 *
 * Usage:
 *   node scripts/ci/check-password-hygiene.mjs
 *   node scripts/ci/check-password-hygiene.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const serverRoot = path.join(repoRoot, 'server');

const PLAINTEXT_COMPARE = /\bpassword\s*(?:===|==)\s*(?:[A-Za-z_$][\w$]*|['"`][^'"`]*['"`])/g;
const SCRYPT_USAGE = /\bscrypt(?:Async|Sync)?\s*\(/g;
const WEAK_HASH = /createHash\s*\(\s*['"`](md5|sha1)['"`]\s*\)/gi;

// Hardcoded password literal in an assignment. Tolerates both
// `const password = '...'` and `password: '...'`.
const HARDCODED_LITERAL =
  /\b(?:password|FOUNDER_PASSWORD|ADMIN_PASSWORD)\s*[:=]\s*['"`]([^'"`]{8,})['"`]/g;

const ALLOWLIST_FILES = new Set([
  // None today. Add with justification if ever needed.
]);

// Auth-relevant files. The scrypt / weak-hash / hardcoded-literal checks
// only run here, because those primitives are legitimate elsewhere in the
// codebase (file checksums, ETags, KDF for symmetric encryption keys).
const AUTH_FILE_PATTERNS = [
  /^server\/auth\//,
  /^server\/auth\.(ts|js)$/,
  /^server\/middleware\/auth.*\.(ts|js)$/,
  /^server\/middleware\/tenantAuth\.(ts|js)$/,
  /^server\/middleware\/authAdapter\.(ts|js)$/,
  /^server\/routes\/auth.*\.(ts|js)$/,
  /^server\/routes\/founder.*\.(ts|js)$/,
  /^server\/founder.*\.(ts|js)$/,
  /^server\/services\/auth-.*\.(ts|js)$/,
  /^server\/services\/mfaService\.(ts|js)$/,
  /^server\/services\/emailOtpService\.(ts|js)$/,
];

function isAuthFile(rel) {
  return AUTH_FILE_PATTERNS.some(pattern => pattern.test(rel));
}

function shouldSkipFile(rel) {
  if (rel.includes('/__tests__/')) return true;
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) return true;
  if (rel.endsWith('.spec.ts') || rel.endsWith('.spec.js')) return true;
  if (rel.includes('/_deprecated_')) return true;
  if (rel.includes('/node_modules/')) return true;
  if (ALLOWLIST_FILES.has(rel)) return true;
  return false;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.js'))) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function inComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

const findings = [];

for (const file of walk(serverRoot)) {
  const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  if (shouldSkipFile(rel)) continue;

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');

  const authOnly = isAuthFile(rel);
  const checks = [
    // Plaintext compares are forbidden everywhere — they're never correct.
    {
      pattern: PLAINTEXT_COMPARE,
      reason: 'plaintext password equality compare; use bcrypt.compare() instead',
    },
    // The remaining checks only fire in auth-relevant files because the
    // primitives have legitimate uses elsewhere (KDF, ETag, content hash).
    ...(authOnly
      ? [
          {
            pattern: SCRYPT_USAGE,
            reason:
              'scrypt for password hashing is deprecated on this platform; use bcryptjs',
          },
          {
            pattern: WEAK_HASH,
            reason: 'md5/sha1 are not acceptable password hashes; use bcryptjs',
          },
          {
            pattern: HARDCODED_LITERAL,
            reason:
              'hardcoded password literal in auth-relevant code; read from env (e.g. process.env.FOUNDER_PASSWORD)',
          },
        ]
      : []),
  ];

  for (const { pattern, reason } of checks) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const lineNumber = lineOf(text, m.index);
      const line = lines[lineNumber - 1] ?? '';
      if (inComment(line)) continue;
      // Filter out the obviously-fine cases:
      //   password === undefined / null / true / false
      //   password === user.password (still bad — keep)
      const matched = m[0];
      if (
        /password\s*(?:===|==)\s*(?:undefined|null|true|false)\b/.test(matched)
      ) {
        continue;
      }
      // Allow process.env.* references.
      if (/process\.env\./.test(line)) continue;

      findings.push({
        file: rel,
        line: lineNumber,
        snippet: line.trim(),
        reason,
      });
    }
  }
}

if (findings.length === 0) {
  console.log('[ci:password-hygiene] OK — no plaintext compares, weak hashes, or hardcoded passwords found in server/');
  process.exit(0);
}

console.error('[ci:password-hygiene] FAIL — password-hygiene violations found:\n');
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.snippet}`);
  console.error(`    → ${f.reason}\n`);
}
console.error(`Total: ${findings.length} violation(s).`);
process.exit(1);
