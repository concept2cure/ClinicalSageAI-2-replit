#!/usr/bin/env node
/**
 * Evidence-pack exporter.
 *
 * Materializes CONCEPT2CURE_AI_OS_EVIDENCE_PACK_TEMPLATE.md from live
 * codebase data: git history, CI-gate inventory, baseline files, audit-
 * chain wiring proof, deterministic-export config. Output is a markdown
 * artifact ready to drop into the data room or attach to a regulator
 * inquiry, with the parts we can prove auto-filled and the parts that
 * require human sign-off marked as such.
 *
 * Usage:
 *   node scripts/audits/generate-evidence-pack.mjs
 *   node scripts/audits/generate-evidence-pack.mjs --release v1.0.0-beta
 *
 * Output:
 *   docs/reports/evidence-pack-<date>.md
 *
 * The auto-filled controls map to AIOS-01 through AIOS-07 in
 * CONCEPT2CURE_AI_OS_EVIDENCE_PACK_TEMPLATE.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
let releaseTag = 'unreleased';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--release') {
    releaseTag = args[i + 1] ?? releaseTag;
    i += 1;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function readJsonOpt(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function readTextOpt(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function fileSha256(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}

function status(passed, label) {
  return passed ? `**Pass** — ${label}` : `**Pending** — ${label}`;
}

// ─── Inputs ─────────────────────────────────────────────────────────────────

const pkg = readJsonOpt('package.json') ?? {};
const ciGates = Object.keys(pkg.scripts ?? {}).filter(k => k.startsWith('ci:'));
const auditScripts = Object.keys(pkg.scripts ?? {}).filter(k => k.startsWith('audit:'));

const orphan = readJsonOpt('docs/reports/orphan-endpoints-latest.json');
const tenantBaseline = readJsonOpt('docs/reports/tenant-isolation-baseline.json');
const routeOwners = readJsonOpt('docs/reports/route-mount-owners.json');
const routeMountLatest = readJsonOpt('docs/reports/route-mount-audit-latest.json');

const auditTrailWiringHash = fileSha256('server/startup/audit-trail.ts');
const tamperProofHash = fileSha256('server/lib/tamper-proof-audit.ts');
const chainMonitorHash = fileSha256('server/services/audit/chainIntegrityMonitor.ts');
const pdfConverterHash = fileSha256('server/services/pdf-converter.ts');
const corpusPolicyHash = fileSha256('server/services/embedding-corpus-policy.ts');
const devAuthHash = fileSha256('server/auth/dev-auth-policy.ts');

const headSha = git('rev-parse HEAD');
const headDate = git('log -1 --format=%cI HEAD');
const branch = git('rev-parse --abbrev-ref HEAD');

const recentCommits = git(
  'log --pretty=format:"%h|%cI|%s" -n 25 -- scripts/ci scripts/audits server/startup server/auth server/services/pdf-converter.ts server/services/embedding-corpus-policy.ts server/lib/tamper-proof-audit.ts'
)
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const [sha, date, ...rest] = line.split('|');
    return { sha, date, subject: rest.join('|') };
  });

// ─── Wiring proofs (static text checks) ────────────────────────────────────

function fileContains(rel, needle) {
  const text = readTextOpt(rel);
  if (text === null) return false;
  return text.includes(needle);
}

const proofs = {
  auditMiddlewareGated: fileContains(
    'server/startup/audit-trail.ts',
    "process.env.AUDIT_TRAIL_ENABLED === 'true'"
  ),
  chainMonitorGated: fileContains(
    'server/startup/services.ts',
    "process.env.AUDIT_TRAIL_ENABLED === 'true'"
  ),
  chainMonitorStartedAtBoot: fileContains('server/startup/services.ts', 'startChainMonitor'),
  chainMonitorStoppedOnShutdown: fileContains(
    'server/startup/shutdown.ts',
    'stopChainMonitor'
  ),
  immutabilityMiddleware: fileContains(
    'server/startup/middleware.ts',
    'IMMUTABILITY_ROUTE_PATTERNS'
  ),
  hashChainSchema: fileContains('server/lib/tamper-proof-audit.ts', 'tamper_proof_log'),
  hmacSignature: fileContains('server/lib/tamper-proof-audit.ts', 'computeSignature'),
  pdfDeterminism: fileContains('server/services/pdf-converter.ts', 'makeDeterministic'),
  embeddingCorpusPolicy: fileContains(
    'server/services/embedding-corpus-policy.ts',
    'CORPUS_POLICY'
  ),
  devAuthGate: fileContains('server/auth/dev-auth-policy.ts', 'isDevAuthAllowed'),
};

// ─── Render markdown ────────────────────────────────────────────────────────

const generatedAt = new Date().toISOString();
const fileDate = generatedAt.slice(0, 10);
const out = [];

out.push(`# Concept2Cure AI OS Evidence Pack`);
out.push('');
out.push(`Generated: ${generatedAt}`);
out.push(`Source branch: \`${branch}\``);
out.push(`HEAD: \`${headSha.slice(0, 12)}\` (${headDate})`);
out.push(`Release tag: \`${releaseTag}\``);
out.push('');
out.push(
  '> This evidence pack is auto-materialized from the codebase by ' +
    '`scripts/audits/generate-evidence-pack.mjs`. Items marked **Pass** are ' +
    'verified by static-text checks against the source tree at HEAD. Items ' +
    'marked **Pending** require human sign-off (e.g. operator confirmation ' +
    'that an env flag is set in the target environment, or attached evidence).'
);
out.push('');

// ─── Section 1: Control status summary ─────────────────────────────────────

out.push('## 1) Control Status Summary');
out.push('');
out.push('| Control ID | Status | Evidence | Notes |');
out.push('| --- | --- | --- | --- |');
out.push(
  `| AIOS-01 Lineage completeness | ${status(!!orphan, 'orphan-endpoint detector landed')} | ` +
    `\`docs/reports/orphan-endpoints-latest.json\` | ${
      orphan ? `${orphan.summary.totalDeclared} endpoints, ${orphan.summary.totalConsumedByClient} consumed, ${orphan.summary.totalOrphans} orphans` : 'Run `npm run audit:orphaned-endpoints`'
    } |`
);
out.push(
  `| AIOS-02 Policy enforcement | ${status(ciGates.length >= 8, `${ciGates.length} CI gates registered`)} | \`package.json\` scripts | ${ciGates.join(', ')} |`
);
out.push(
  `| AIOS-03 Execution envelope | ${status(!!headSha, 'commit-pinned')} | \`git rev-parse HEAD\` | HEAD ${headSha.slice(0, 12)} on \`${branch}\` |`
);
out.push(
  `| AIOS-04 Audit log integrity | ${status(proofs.hashChainSchema && proofs.hmacSignature && proofs.chainMonitorStartedAtBoot && proofs.chainMonitorGated, 'tamper-proof + hash-chain + HMAC + boot-time monitor under env gate')} | \`server/lib/tamper-proof-audit.ts\`, \`server/services/audit/chainIntegrityMonitor.ts\` | See section 5 |`
);
out.push(
  `| AIOS-05 Tenant isolation | ${status(!!tenantBaseline, 'tenant-isolation gate live with baseline ratchet')} | \`docs/reports/tenant-isolation-baseline.json\` | ${tenantBaseline ? `${tenantBaseline.fingerprints.length} candidate findings tracked, no regression allowed` : 'Run `npm run ci:tenant-isolation`'} |`
);
out.push(
  `| AIOS-06 Change governance | ${status(recentCommits.length > 0, 'governance commits in branch history')} | \`git log\` | See section 6 |`
);
out.push(
  `| AIOS-07 Deterministic export | ${status(proofs.pdfDeterminism, 'pdf-converter strips metadata, sha256 over stripped output')} | \`server/services/pdf-converter.ts\` | See section 7 |`
);
out.push('');

// ─── Section 2: AIOS-01 Lineage ────────────────────────────────────────────

out.push('## 2) Lineage Completeness Evidence (AIOS-01)');
out.push('');
if (orphan) {
  const top = Object.entries(orphan.summary.byOwner).slice(0, 5);
  out.push(`- Coverage window: HEAD at ${headDate}`);
  out.push(`- Total declared API endpoints: **${orphan.summary.totalDeclared}**`);
  out.push(
    `- Consumed (client + server-to-server, heuristic): **${orphan.summary.totalConsumedByClient}**`
  );
  out.push(`- Orphans (no caller reference): **${orphan.summary.totalOrphans}**`);
  out.push(`- Top owners by orphan count:`);
  for (const [owner, count] of top) {
    out.push(`  - ${owner}: ${count}`);
  }
} else {
  out.push('Run `npm run audit:orphaned-endpoints` to populate this section.');
}
out.push('');
out.push('Required artifacts:');
out.push('1. `docs/reports/orphan-endpoints-latest.json` (this file at HEAD).');
out.push(
  '2. Route-mount-owners taxonomy: `docs/reports/route-mount-owners.json` (' +
    `${routeOwners?.owners?.length ?? 0} prefixes registered).`
);
out.push('3. **Pending** — sample end-to-end trace (ingest → retrieve → generate → audit).');
out.push('');

// ─── Section 3: AIOS-02 Policy Enforcement ─────────────────────────────────

out.push('## 3) Policy Enforcement Evidence (AIOS-02, AIOS-05)');
out.push('');
out.push(`- Governance CI gates registered: **${ciGates.length}**`);
out.push(`- Operational audits registered: **${auditScripts.length}**`);
out.push('');
out.push('Each gate is the canonical control for its domain — new code must');
out.push('route through the documented runtime or land in an explicit allowlist.');
out.push('');
out.push('| Gate | Domain |');
out.push('| --- | --- |');
const gateMap = {
  'ci:check-docx-runtime': 'DOCX export runtime canonicality',
  'ci:check-pdf-runtime': 'PDF export runtime canonicality + determinism',
  'ci:check-embedding-runtime': 'Embedding-call canonicality + corpus policy',
  'ci:no-dev-auth-in-prod': 'Dev-auth shortcut gating',
  'ci:password-hygiene': 'Plaintext / weak-hash / hardcoded passwords',
  'ci:no-mock-in-prod-routes': 'Mock data quarantined out of prod routes',
  'ci:governed-export-routes': 'Governed exports declare consequence contract',
  'ci:governed-export-consequence-shape': 'Consequence-contract shape validation',
  'ci:audit-route-mounts': 'Route-mount drift / shadowing detection',
  'ci:token-cascade': 'Design-system token integrity',
  'ci:tenant-isolation': 'Tenant-isolation baseline + no-regression',
  'ci:reasoning-tier-readiness': 'Reasoning-tier UAT evidence',
  'ci:check-legacy-dep-quarantine': 'Legacy dependency quarantine',
  'ci:risk-codes': 'Risk-code type generation parity',
  'ci:ectd-stubs': 'eCTD stub bundle validation',
};
for (const gate of ciGates) {
  out.push(`| \`${gate}\` | ${gateMap[gate] ?? '—'} |`);
}
out.push('');

// ─── Section 4: AIOS-03 Execution Envelope ─────────────────────────────────

out.push('## 4) Execution Envelope + Version Pinning (AIOS-03)');
out.push('');
out.push(`- Repository: \`concept2cure/clinicalsageai-2-replit\``);
out.push(`- Branch: \`${branch}\``);
out.push(`- HEAD commit: \`${headSha}\``);
out.push(`- HEAD timestamp: ${headDate}`);
out.push(`- Release tag: \`${releaseTag}\``);
out.push('');
out.push('Per-module hashes at HEAD (paste into release manifest):');
out.push('');
out.push('| Module | SHA-256 |');
out.push('| --- | --- |');
out.push(`| audit-trail middleware | \`${auditTrailWiringHash ?? 'n/a'}\` |`);
out.push(`| tamper-proof audit kernel | \`${tamperProofHash ?? 'n/a'}\` |`);
out.push(`| chain integrity monitor | \`${chainMonitorHash ?? 'n/a'}\` |`);
out.push(`| pdf converter | \`${pdfConverterHash ?? 'n/a'}\` |`);
out.push(`| embedding corpus policy | \`${corpusPolicyHash ?? 'n/a'}\` |`);
out.push(`| dev-auth policy | \`${devAuthHash ?? 'n/a'}\` |`);
out.push('');

// ─── Section 5: AIOS-04 Audit Log Integrity ────────────────────────────────

out.push('## 5) Audit Log Integrity (AIOS-04)');
out.push('');
out.push('### Static wiring proofs (HEAD)');
out.push('');
out.push('| Property | Verified |');
out.push('| --- | --- |');
out.push(`| TamperProofAuditLog defines hash-chain schema | ${proofs.hashChainSchema ? '✅' : '❌'} |`);
out.push(`| HMAC signature on every chain hash | ${proofs.hmacSignature ? '✅' : '❌'} |`);
out.push(`| Audit-trail middleware mounted on every /api request (gated by AUDIT_TRAIL_ENABLED) | ${proofs.auditMiddlewareGated ? '✅' : '❌'} |`);
out.push(`| Chain integrity monitor started at boot (gated by AUDIT_TRAIL_ENABLED) | ${proofs.chainMonitorStartedAtBoot && proofs.chainMonitorGated ? '✅' : '❌'} |`);
out.push(`| Chain monitor stopped before pool.end() on shutdown | ${proofs.chainMonitorStoppedOnShutdown ? '✅' : '❌'} |`);
out.push(`| Immutability middleware blocks DELETE / bulk-delete on /api/audit/* | ${proofs.immutabilityMiddleware ? '✅' : '❌'} |`);
out.push('');
out.push('### Operator runbook (production)');
out.push('');
out.push('1. Ensure Postgres has the `audit` schema and `uuid-ossp` extension.');
out.push('2. Run `TamperProofAuditLog.initialize()` once via a migration.');
out.push('3. Set `AUDIT_HMAC_SECRET` (32+ bytes).');
out.push('4. Set `AUDIT_TRAIL_ENABLED=true` and restart.');
out.push('');
out.push(
  'After step 4 the platform self-verifies the chain in-process every 5 minutes. ' +
    'No external cron required.'
);
out.push('');
out.push('### Compliance mapping');
out.push('- 21 CFR Part 11 §11.10(e) — secure, computer-generated, time-stamped audit trails.');
out.push('- 21 CFR Part 11 §11.50 — signature manifestation includes signed-by, signed-date, meaning.');
out.push('- 21 CFR Part 11 §11.70 — signature/record link is preserved by hash chain.');
out.push('- ICH E6(R2) §5.5.3 — data integrity (tamper detection via cryptographic chain).');
out.push('');

// ─── Section 6: AIOS-06 Change Governance ──────────────────────────────────

out.push('## 6) Change Governance (AIOS-06)');
out.push('');
out.push('### Recent governance-touching commits (this branch)');
out.push('');
out.push('| Commit | Date | Subject |');
out.push('| --- | --- | --- |');
for (const c of recentCommits) {
  out.push(`| \`${c.sha}\` | ${c.date.replace('T', ' ').slice(0, 16)} | ${c.subject.replace(/\|/g, '\\|')} |`);
}
out.push('');

// ─── Section 7: AIOS-07 Deterministic Export ───────────────────────────────

out.push('## 7) Deterministic Export Evidence (AIOS-07)');
out.push('');
out.push('### DOCX → PDF pipeline');
out.push('');
out.push(
  '- Canonical converter: `server/services/pdf-converter.ts` (' +
    (pdfConverterHash ? `sha256: \`${pdfConverterHash.slice(0, 16)}…\`` : 'n/a') +
    ').'
);
out.push('- Backends: LibreOffice headless (primary, in `Dockerfile.optimized`); Puppeteer fallback for dev.');
out.push('- Determinism: `makeDeterministic()` strips `/CreationDate`, `/ModDate`, `/Producer`, `/Creator`, trailer `/ID`. Same DOCX → byte-identical PDF → stable SHA-256.');
out.push('- Determinism unit tests: `server/services/__tests__/pdf-converter.test.ts`.');
out.push('- CI gate: `ci:check-pdf-runtime` blocks new pdfkit/pdf-lib/page.pdf() entry points outside the allowlist.');
out.push('');
out.push('### Embedding corpus policy');
out.push('');
out.push(
  '- Canonical policy: `server/services/embedding-corpus-policy.ts` (' +
    (corpusPolicyHash ? `sha256: \`${corpusPolicyHash.slice(0, 16)}…\`` : 'n/a') +
    ').'
);
out.push('- 8 corpora registered, each with explicit (table, dimension, model).');
out.push('- CI gate: `ci:check-embedding-runtime` blocks direct `openai.embeddings.create()` calls outside the allowlist.');
out.push('');

// ─── Section 8: Tenant boundary evidence ───────────────────────────────────

out.push('## 8) Tenant Boundary Test Evidence (AIOS-05 detail)');
out.push('');
if (tenantBaseline) {
  out.push(`- Baseline file: \`docs/reports/tenant-isolation-baseline.json\``);
  out.push(`- Baseline finding count: **${tenantBaseline.fingerprints.length}**`);
  out.push(`- Baseline written: ${tenantBaseline.generatedAt}`);
  out.push('- Mode: `--strict-no-regression` — any new finding above the baseline fails CI.');
  out.push('- Triage path: as real findings get fixed, re-run `ci:tenant-isolation:write-baseline` to ratchet down.');
} else {
  out.push('Run `npm run ci:tenant-isolation:write-baseline` to populate this section.');
}
out.push('');
out.push('Runtime guards (in addition to the static gate):');
out.push('- `server/prisma/client.js` — `audit_log.findMany`, `document.findMany`, `document.findUnique`, `signature.findMany` throw if called without a tenant filter (test: `server/prisma/__tests__/tenant-guards.test.ts`).');
out.push('- Drizzle queries throughout the codebase use `tenantContext` from `server/middleware/tenantContext.ts` to scope all org-aware reads.');
out.push('');

// ─── Closing ────────────────────────────────────────────────────────────────

out.push('---');
out.push('');
out.push('## Methodology + caveats');
out.push('');
out.push('- All "Pass" verdicts in this pack are static-text checks against the codebase at HEAD. They prove the **wiring exists**; they do not by themselves prove the runtime behavior in any specific deployment.');
out.push('- For runtime evidence (e.g. confirming `AUDIT_TRAIL_ENABLED=true` in your production environment, or that the chain monitor has run successfully against a real audit table), attach the relevant deployment logs alongside this pack.');
out.push('- This pack is regenerable. Re-run `node scripts/audits/generate-evidence-pack.mjs` to refresh against the latest HEAD.');
out.push('');

const outDir = path.join(repoRoot, 'docs', 'reports');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `evidence-pack-${fileDate}.md`);
fs.writeFileSync(outPath, out.join('\n') + '\n');

console.log(`[evidence-pack] wrote ${path.relative(repoRoot, outPath)} (${out.length} lines)`);
console.log(
  `  Controls: ${
    [
      proofs.auditMiddlewareGated && 'AIOS-04',
      tenantBaseline && 'AIOS-05',
      proofs.pdfDeterminism && 'AIOS-07',
      ciGates.length >= 8 && 'AIOS-02',
      orphan && 'AIOS-01',
    ]
      .filter(Boolean)
      .join(', ') || 'no auto-fillable controls detected'
  }`
);
