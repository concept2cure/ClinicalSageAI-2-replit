/**
 * Security guard rails — standalone pre-commit / CI checker.
 *
 * Scans the codebase for the bug classes the security PRs #496-#500
 * just spent five rounds fixing. Returns exit 1 on any violation so
 * a regression can't sneak past CI.
 *
 * Lives as a standalone script (rather than an ESLint rule) because
 * the repo's ESLint flat-config setup is currently broken (missing
 * @eslint/js dep) — the standalone path runs today with zero
 * dependencies beyond Node stdlib.
 *
 * Patterns checked:
 *
 *   1. req.body.organizationId / orgId / org_id / tenantId / tenant_id
 *      → use requireAuthedOrgId from server/utils/authedOrgId
 *
 *   2. req.query.organizationId / orgId / org_id / tenantId / tenant_id
 *      → same fix
 *
 *   3. req.headers['x-organization-id'] / req.headers['x-tenant-id']
 *      → validateTenantContext sources the org from JWT; route code
 *        should read req.user.organizationId
 *
 *   4. jwt.verify(...)
 *      → use verifyJwtWithRotation from server/utils/jwtVerify
 *        (needed for zero-downtime JWT secret rotation)
 *
 *   5. `?? 1` or `|| 1` following organizationId reads
 *      → never default a tenant id; always 403 instead
 *
 * Exemptions:
 *   - Test files (*.test.ts, *.spec.ts, __tests__/**) — they
 *     deliberately construct bad-input fixtures.
 *   - server/utils/jwtVerify.ts — the canonical wrapper IS jwt.verify.
 *   - scripts/check-security-patterns.ts (this file) — quotes the
 *     patterns in its own source.
 *   - _archive/, _deprecated/, node_modules/, dist/
 *   - Inline annotations: a line bearing the comment
 *     `// security-allow: <short reason>` (or the same comment on the
 *     immediately preceding line) is exempt from all checks. Use
 *     sparingly and only when the pattern is a deliberate, audited
 *     exception (e.g. refresh-token jwt.verify against a separate
 *     refresh secret). Reviewers grep for `security-allow:` to audit.
 *
 * Usage:
 *
 *   npx tsx scripts/check-security-patterns.ts
 *
 * Exit codes:
 *   0  no violations
 *   1  violations found (printed to stderr with file:line context)
 *   2  internal error
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

interface Pattern {
  name: string;
  /** Regex applied per-line. */
  regex: RegExp;
  /** Plain-English fix path. */
  message: string;
  /** Files matching any of these patterns are exempt. */
  exemptFiles?: RegExp[];
}

const COMMON_EXEMPT: RegExp[] = [
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /\/__tests__\//,
  /\/_archive\//,
  /\/_deprecated\//,
  /\/node_modules\//,
  /\/dist\//,
  /\/scripts\/check-security-patterns\.ts$/,
];

const PATTERNS: Pattern[] = [
  {
    name: 'tenant-trust-body',
    regex:
      /\breq\s*(?:\.(?:body))\s*(?:\.(?:organizationId|orgId|org_id|tenantId|tenant_id)\b|\[\s*['"](?:organizationId|orgId|org_id|tenantId|tenant_id)['"]\s*\])/,
    message:
      'Do not read organizationId / tenantId from req.body — attacker-controlled. ' +
      'Use requireAuthedOrgId(req, res) from server/utils/authedOrgId.',
  },
  {
    name: 'tenant-trust-query',
    regex:
      /\breq\s*(?:\.(?:query))\s*(?:\.(?:organizationId|orgId|org_id|tenantId|tenant_id)\b|\[\s*['"](?:organizationId|orgId|org_id|tenantId|tenant_id)['"]\s*\])/,
    message:
      'Do not read organizationId / tenantId from req.query — attacker-controlled. ' +
      'Use requireAuthedOrgId(req, res) from server/utils/authedOrgId.',
  },
  {
    name: 'tenant-trust-header',
    regex: /\breq\.headers\s*\[\s*['"]x-(organization|tenant)-id['"]\s*\]/i,
    message:
      'Do not read org / tenant id from request headers — validateTenantContext ' +
      'sources it from the JWT and emits a tenant_impersonation_attempt audit ' +
      'event when a header tries to override it.',
    // Exempt the middleware files that LEGITIMATELY inspect the
    // header for impersonation-detection purposes (they compare it
    // against the JWT and block on mismatch). Logging/telemetry
    // sites that observe which source the caller used are also
    // exempt — they don't USE the value as the tenant identity.
    exemptFiles: [
      /(?:^|\/)server\/middleware\/auth\.js$/,
      /(?:^|\/)server\/middleware\/enterprise-security\.ts$/,
      /(?:^|\/)server\/middleware\/tenantContext\.js$/,
      /(?:^|\/)server\/middleware\/tenantIsolation\.ts$/,
      /(?:^|\/)server\/utils\/tenantContext\.ts$/,
      /(?:^|\/)server\/src\/mw\/observability\.ts$/,
      /(?:^|\/)server\/middleware\/deprecation\.ts$/,
    ],
  },
  {
    name: 'direct-jwt-verify',
    regex: /\bjwt\.verify\s*\(/,
    message:
      'Use verifyJwtWithRotation from server/utils/jwtVerify instead of jwt.verify ' +
      'directly — needed for zero-downtime JWT secret rotation (PR #500).',
    exemptFiles: [/(?:^|\/)server\/utils\/jwtVerify\.ts$/],
  },
  {
    name: 'org-id-fallback',
    // Require the fallback to follow the identifier directly (possibly
    // wrapped by ONE level of closing parens, eg `Number(orgId) || 1`).
    // The earlier `[^;\n]*?` was too loose — it bled past unrelated `||`
    // expressions on the same line and produced false positives like
    // `[orgId, projectId, version || '1.0']`.
    regex:
      /(?:organizationId|orgId|tenantId)\b\s*\)?\s*(?:\?\?|\|\|)\s*['"]?(?:1|7|'default'|"default")\b/,
    message:
      'Do not fall back to a hardcoded org id — 403 instead. The legacy ?? 1 / ' +
      '|| 7 / || "default" patterns are how cross-tenant IDORs got their start ' +
      '(see PRs #496-#499).',
  },
];

interface Violation {
  file: string;
  line: number;
  column: number;
  text: string;
  pattern: Pattern;
}

function shouldScan(filePath: string): boolean {
  const ext = extname(filePath);
  if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return false;
  for (const exempt of COMMON_EXEMPT) {
    if (exempt.test(filePath)) return false;
  }
  return true;
}

function walk(root: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    if (entry.startsWith('_archive') || entry.startsWith('_deprecated')) continue;
    const full = join(root, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && shouldScan(full)) out.push(full);
  }
}

function scanFile(filePath: string): Violation[] {
  const rel = relative(process.cwd(), filePath);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const lines = content.split('\n');
  const violations: Violation[] = [];

  const ALLOW_MARKER = /security-allow:/;

  for (const pat of PATTERNS) {
    if (pat.exemptFiles && pat.exemptFiles.some(e => e.test(rel))) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments — single-line and inside the block-comment header
      // of a file are noise. We approximate by skipping any line whose
      // first non-whitespace char is // or *.
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const m = pat.regex.exec(line);
      if (m) {
        // Inline annotation: same line or preceding line carries
        // `security-allow:` — deliberate, audited exception.
        const prev = i > 0 ? lines[i - 1] : '';
        if (ALLOW_MARKER.test(line) || ALLOW_MARKER.test(prev)) continue;
        violations.push({
          file: rel,
          line: i + 1,
          column: (m.index ?? 0) + 1,
          text: line.trim().slice(0, 160),
          pattern: pat,
        });
      }
    }
  }
  return violations;
}

function main(): never {
  const root = process.argv[2]
    ? join(process.cwd(), process.argv[2])
    : join(process.cwd(), 'server');
  const files: string[] = [];
  walk(root, files);

  const allViolations: Violation[] = [];
  for (const f of files) {
    allViolations.push(...scanFile(f));
  }

  if (allViolations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `check-security-patterns: 0 violations across ${files.length} file(s).`,
    );
    process.exit(0);
  }

  // Group by pattern for readability.
  const byPattern = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const arr = byPattern.get(v.pattern.name) ?? [];
    arr.push(v);
    byPattern.set(v.pattern.name, arr);
  }

  for (const [name, vs] of byPattern) {
    const message = vs[0].pattern.message;
    // eslint-disable-next-line no-console
    console.error(`\n[${name}] ${vs.length} violation(s)`);
    // eslint-disable-next-line no-console
    console.error(`  ${message}`);
    for (const v of vs) {
      // eslint-disable-next-line no-console
      console.error(`    ${v.file}:${v.line}:${v.column}  ${v.text}`);
    }
  }
  // eslint-disable-next-line no-console
  console.error(
    `\ncheck-security-patterns: ${allViolations.length} violation(s) across ${files.length} file(s).`,
  );
  process.exit(1);
}

main();
