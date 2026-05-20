#!/usr/bin/env node
/**
 * CI Guard: tenant-isolation safety on raw SQL.
 *
 * The platform is multi-tenant. Most data tables carry an organization_id /
 * tenant_id / client_workspace_id / org_id column, and every query that
 * touches them must filter on the current tenant — otherwise a request
 * from tenant A can read or mutate tenant B's rows. That's the worst
 * class of bug a regulated SaaS can ship.
 *
 * This gate scans server/ for raw SQL strings (template literals or
 * string concatenations passed to pool.query / client.query / db.execute)
 * that reference a known tenant-scoped table without a tenant-scope clause.
 * Drizzle query-builder calls (.from(table).where(eq(table.organizationId, …)))
 * are out of scope here — they're statically analyzable but require a
 * different parser. The gate covers the dangerous case Drizzle doesn't:
 * hand-rolled SQL where the dev forgot the WHERE.
 *
 * Heuristics:
 *   - A query is "tenant-safe" if it includes any of:
 *       organization_id, organizationId, org_id, orgId,
 *       tenant_id, tenantId, client_workspace_id, clientWorkspaceId,
 *       workspace_id
 *   - Queries scoped by primary key (`WHERE id = $1`) are tolerated only
 *     when the table is also keyed by org_id (i.e., the row is implicitly
 *     org-scoped through its PK). For the v1 of this gate, we keep that
 *     out of the safe-list — better to add an org filter explicitly.
 *
 * Allowlist:
 *   - Files that legitimately do cross-tenant reads (admin tools, schema
 *     migrations, system jobs that rebuild indexes, ingestion workers
 *     that operate on system-owned data).
 *   - Test files.
 *
 * Mode:
 *   - Default: report findings to stderr, exit 0. (We're learning the
 *     baseline first.) Pass --strict to fail on any finding.
 *   - Pass --baseline <path> + --write-baseline to snapshot the current
 *     count, then --baseline <path> --strict-no-regression to fail only
 *     on increases.
 *
 * Usage:
 *   node scripts/ci/check-tenant-isolation.mjs
 *   node scripts/ci/check-tenant-isolation.mjs --strict
 *   node scripts/ci/check-tenant-isolation.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const stdoutJson = args.includes('--json');
const writeBaseline = args.includes('--write-baseline');
const strictNoRegression = args.includes('--strict-no-regression');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'tenant-isolation-baseline.json');

// ─── Tenant-scoped table inventory ──────────────────────────────────────────

/**
 * Tables that carry tenant data. A query against any of these without a
 * tenant filter is a finding. Sourced by scanning shared/schema.ts for
 * pgTable definitions whose body contains an organizationId / tenant_id /
 * client_workspace_id column (see /scripts/audits/list-tenant-tables.mjs
 * — TODO: build that for live regeneration).
 *
 * The list below is intentionally narrow — it covers the most obviously
 * sensitive tables. Expanding it tightens the gate; do that in tranches
 * with the allowlist updated in lock-step.
 */
const TENANT_SCOPED_TABLES = new Set([
  'users',
  'organization_users',
  'projects',
  'project_tasks',
  'documents',
  'document_folders',
  'document_versions',
  'audit_events',
  'audit_logs',
  'tamper_proof_log',
  'billing_budgets',
  'stripe_events',
  'cer_exports',
  'data_lineage_records',
  'evidence_chain_records',
  'gap_analysis_results',
  'deep_research_jobs',
  'rag_chunks',
  'rag_documents',
  'knowledge_entries',
  'client_memory_entries',
  'project_memory_entries',
  'account_canon_items',
  'document_chunks',
  'document_vectors',
]);

// ─── Tenant-filter signals ──────────────────────────────────────────────────

const TENANT_FILTER_KEYWORDS = [
  'organization_id',
  'organizationId',
  'org_id',
  'orgId',
  'tenant_id',
  'tenantId',
  'client_workspace_id',
  'clientWorkspaceId',
  'workspace_id',
  'workspaceId',
];

const TENANT_FILTER_RE = new RegExp(
  '\\b(' + TENANT_FILTER_KEYWORDS.join('|') + ')\\b',
  'i'
);

// ─── Allowlist ──────────────────────────────────────────────────────────────

const ALLOWLIST_FILES = new Set([
  // Schema setup / migrations / DDL — operates on the schema itself.
  'server/db/runtime.ts',
  'server/db/bootstrap/index.ts',
  'server/db/ensureCoreTables.ts',
  'server/db/setupLumenCortex.ts',
  'server/db/setupLiterature.ts',
  // Auth lookup by email — pre-tenant-resolution. The user record IS the
  // tenant key, so it can't be filtered by org before login.
  'server/routes/auth.ts',
  'server/routes/authEnterprise.ts',
  'server/auth.ts',
  'server/middleware/auth.ts',
  // System / admin tools that legitimately operate cross-tenant.
  'server/routes/admin.ts',
  'server/services/audit/audit-archive.service.ts',
  'server/services/audit/chainIntegrityMonitor.ts',
  // Diagnostics / health.
  'server/diagnostics.js',
  'server/services/diagnostics.ts',
  // Runtime-guarded: tenant isolation is enforced at function entry by
  // explicit throws when where.organizationId / tenantId / documentId is
  // missing (see server/prisma/__tests__/tenant-guards.test.ts). The
  // static gate sees the raw SQL but can't see the guards. Hardened
  // 2026-05-07.
  'server/prisma/client.js',
]);

const ALLOWLIST_PATH_PREFIXES = [
  'server/db/_deprecated_migrations/',
  'server/__tests__/',
  'server/services/__tests__/',
];

function isAllowlistedFile(rel) {
  if (ALLOWLIST_FILES.has(rel)) return true;
  return ALLOWLIST_PATH_PREFIXES.some(prefix => rel.startsWith(prefix));
}

// ─── Walk + scan ────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'dist') continue;
      if (entry.name === '_archive' || entry.name === '_deprecated') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.js'))) {
      if (full.endsWith('.test.ts') || full.endsWith('.test.js')) continue;
      if (full.endsWith('.spec.ts') || full.endsWith('.spec.js')) continue;
      out.push(full);
    }
  }
  return out;
}

// Match SQL statements that reference one of our tenant-scoped tables.
// Captures the tail of the SQL up to the next backtick / quote, so we
// can sniff for a tenant filter in the same statement.
function buildTablePattern(tables) {
  const escaped = Array.from(tables).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Match: "FROM <table>" or "JOIN <table>" or "INTO <table>" or "UPDATE <table>"
  return new RegExp(
    `\\b(?:from|join|into|update|delete\\s+from)\\s+(?:public\\.)?(?:vault\\.)?(${escaped.join('|')})\\b`,
    'gi'
  );
}

const TABLE_PATTERN = buildTablePattern(TENANT_SCOPED_TABLES);

/**
 * Normalize a SQL string for hashing: lowercase, collapse whitespace, strip
 * quotes and trailing punctuation. Two queries that differ only in
 * formatting (linebreaks, whitespace, the surrounding quote style) hash to
 * the same value, so cosmetic edits don't reshuffle the baseline.
 */
function normalizeSqlForHash(sql) {
  return sql
    .replace(/^[`'"]|[`'"]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Match a SQL string literal (template, single, or double quoted) likely
// to be a query — must contain SELECT/INSERT/UPDATE/DELETE somewhere.
const SQL_STRING = /[`'"](?:\\.|[^\\`'"])*?(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)[\s\S]*?[`'"]/gi;

const findings = [];

for (const file of walk(path.join(repoRoot, 'server'))) {
  const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  if (isAllowlistedFile(rel)) continue;

  const text = fs.readFileSync(file, 'utf8');

  // Iterate every SQL-shaped string literal in the file.
  SQL_STRING.lastIndex = 0;
  let sqlMatch;
  while ((sqlMatch = SQL_STRING.exec(text)) !== null) {
    const sql = sqlMatch[0];
    TABLE_PATTERN.lastIndex = 0;
    const tableHits = new Set();
    let tm;
    while ((tm = TABLE_PATTERN.exec(sql)) !== null) {
      tableHits.add(tm[1].toLowerCase());
    }
    if (tableHits.size === 0) continue;

    // If the SQL itself includes a tenant filter, accept.
    if (TENANT_FILTER_RE.test(sql)) continue;

    // Otherwise: report. We attach a content hash of the normalized SQL so
    // the baseline fingerprint survives line-number drift caused by edits in
    // the same file. (Previously the fingerprint was `file:line:tables`,
    // which made every unrelated edit in a flagged file look like a new
    // finding + a resolved finding on the old line — pure noise.)
    const lineNumber = text.slice(0, sqlMatch.index).split('\n').length;
    const lineText = text.split('\n')[lineNumber - 1]?.trim().slice(0, 160) ?? '';
    const sqlHash = crypto
      .createHash('sha1')
      .update(normalizeSqlForHash(sql))
      .digest('hex')
      .slice(0, 12);
    findings.push({
      file: rel,
      line: lineNumber,
      sqlHash,
      tables: Array.from(tableHits),
      preview: lineText,
    });
  }
}

findings.sort((a, b) =>
  a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
);

// ─── Output ────────────────────────────────────────────────────────────────

const summary = {
  generatedAt: new Date().toISOString(),
  totalFindings: findings.length,
  byFile: findings.reduce((acc, f) => {
    acc[f.file] = (acc[f.file] || 0) + 1;
    return acc;
  }, {}),
};

if (stdoutJson) {
  process.stdout.write(JSON.stringify({ summary, findings }, null, 2) + '\n');
} else {
  if (findings.length === 0) {
    console.log('[ci:tenant-isolation] OK — no raw SQL against tenant-scoped tables without a tenant filter');
    process.exit(0);
  }
  console.error(`[ci:tenant-isolation] ${strict ? 'FAIL' : 'WARN'} — ${findings.length} candidate violation(s):\n`);
  const grouped = new Map();
  for (const f of findings) {
    if (!grouped.has(f.file)) grouped.set(f.file, []);
    grouped.get(f.file).push(f);
  }
  for (const [file, items] of grouped) {
    console.error(`  ${file}  (${items.length})`);
    for (const item of items.slice(0, 3)) {
      console.error(`    L${item.line}  tables=[${item.tables.join(',')}]`);
      console.error(`      ${item.preview}`);
    }
    if (items.length > 3) {
      console.error(`    … ${items.length - 3} more`);
    }
    console.error('');
  }
  console.error(
    `Total: ${findings.length} candidate(s). These are RAW SQL queries against ` +
      'known tenant-scoped tables that don\'t reference an org_id / tenant_id / ' +
      'workspace_id in the same statement. Each one is either a real tenant-' +
      'isolation bug or needs to be added to the allowlist with a one-line ' +
      'justification (admin tool / schema migration / pre-tenant-resolution auth).'
  );
}

// ─── Baseline + no-regression mode ─────────────────────────────────────────

/**
 * Build the stable fingerprint for a finding. Content-hashed so the
 * fingerprint is invariant under line-number drift — the historical
 * `file:line:tables` form produced phantom regressions whenever an edit
 * earlier in the file pushed an existing query down. Now we key on the
 * normalized SQL itself, scoped by file (so two files coincidentally
 * holding the same query don't collapse to one fingerprint).
 */
function fingerprintFinding(f) {
  return `${f.file}#${f.sqlHash}:${f.tables.sort().join(',')}`;
}

/**
 * Legacy detector — true when a baseline string came from the pre-content-
 * hash format (file:line:tables, where line is purely digits). Lets
 * --strict-no-regression migrate an older baseline transparently in CI by
 * treating its contents as "any current fingerprint touching the same file
 * + tables matches", instead of failing the whole gate over format drift.
 */
function isLegacyFingerprint(fp) {
  return /^[^#]+:\d+:[a-z_,]+$/.test(fp);
}

/** Decompose a legacy fingerprint into its file + tables (loses line). */
function legacyParts(fp) {
  // Greedy split: last two colons separate line and tables.
  const lastColon = fp.lastIndexOf(':');
  const secondLastColon = fp.lastIndexOf(':', lastColon - 1);
  return {
    file: fp.slice(0, secondLastColon),
    tables: fp.slice(lastColon + 1).split(',').sort().join(','),
  };
}

if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const baseline = {
    generatedAt: summary.generatedAt,
    fingerprints: findings.map(fingerprintFinding).sort(),
  };
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `[ci:tenant-isolation] baseline written to ${path.relative(repoRoot, baselinePath)} ` +
      `(${baseline.fingerprints.length} findings)`
  );
  process.exit(0);
}

if (strictNoRegression) {
  if (!fs.existsSync(baselinePath)) {
    console.error(
      `[ci:tenant-isolation] FAIL — baseline file not found at ${path.relative(repoRoot, baselinePath)}. ` +
        'Run with --write-baseline first.'
    );
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineSet = new Set(baseline.fingerprints);
  const currentSet = new Set(findings.map(fingerprintFinding));

  // Legacy migration: if the baseline still uses the old line-keyed format,
  // accept any current finding whose (file, tables) tuple appears anywhere
  // in the legacy baseline. Prevents the format change from making every
  // existing finding look like a regression on the first run after upgrade.
  const legacyFileTablesIndex = new Set();
  for (const fp of baselineSet) {
    if (!isLegacyFingerprint(fp)) continue;
    const { file, tables } = legacyParts(fp);
    legacyFileTablesIndex.add(`${file}::${tables}`);
  }
  const isCoveredByLegacy = (fp) => {
    // fp here is the new format: `file#hash:tables`
    const hashIdx = fp.indexOf('#');
    const tablesIdx = fp.indexOf(':', hashIdx);
    if (hashIdx < 0 || tablesIdx < 0) return false;
    const file = fp.slice(0, hashIdx);
    const tables = fp.slice(tablesIdx + 1).split(',').sort().join(',');
    return legacyFileTablesIndex.has(`${file}::${tables}`);
  };

  const newFindings = [...currentSet].filter(fp => !baselineSet.has(fp) && !isCoveredByLegacy(fp));
  const fixedFindings = [...baselineSet].filter(fp => {
    if (currentSet.has(fp)) return false;
    if (!isLegacyFingerprint(fp)) return true;
    // For legacy rows, "resolved" requires the (file, tables) tuple to be
    // entirely absent from the current findings — otherwise we'd misreport
    // every legacy row as resolved.
    const { file, tables } = legacyParts(fp);
    const stillPresent = [...currentSet].some(c => {
      const hashIdx = c.indexOf('#');
      const tablesIdx = c.indexOf(':', hashIdx);
      if (hashIdx < 0 || tablesIdx < 0) return false;
      const cFile = c.slice(0, hashIdx);
      const cTables = c.slice(tablesIdx + 1).split(',').sort().join(',');
      return cFile === file && cTables === tables;
    });
    return !stillPresent;
  });

  if (fixedFindings.length > 0) {
    console.log(
      `[ci:tenant-isolation] ${fixedFindings.length} previously-flagged finding(s) resolved — ` +
        'consider re-running with --write-baseline to ratchet down.'
    );
  }
  if (newFindings.length > 0) {
    console.error(
      `[ci:tenant-isolation] FAIL — ${newFindings.length} NEW finding(s) above baseline of ${baselineSet.size}:`
    );
    for (const fp of newFindings) console.error(`  ${fp}`);
    process.exit(1);
  }
  console.log(
    `[ci:tenant-isolation] OK — no new findings above baseline (${currentSet.size} current, ${baselineSet.size} baseline)`
  );
  process.exit(0);
}

if (strict && findings.length > 0) process.exit(1);
process.exit(0);
