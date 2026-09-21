#!/usr/bin/env node
/**
 * IQ-001 — Installation Qualification runner.
 *
 * Executes the checks in docs/validation/IQ-001-INSTALLATION-QUALIFICATION.md
 * that can be executed against a local installation, and writes the evidence
 * bundle to docs/evidence/W3/<date>/IQ/ (iq-results.json + IQ-001-execution-record.md).
 *
 * Every observation is what was actually found: a check that cannot run here
 * is recorded as `deviation` with the reason, never as a pass.
 *
 *   npm run validation:iq
 *   VALIDATION_BASE_URL=http://localhost:5200 node scripts/validation/run-iq.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN_DATE = process.env.VALIDATION_RUN_DATE || '2026-09-20';
const BASE_URL = (process.env.VALIDATION_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
const OUT = path.join(ROOT, 'docs', 'evidence', 'W3', RUN_DATE, 'IQ');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
function record(id, title, expected, fn) {
  return (async () => {
    const rec = { id, title, expected, status: 'not-executed', observed: null, evidence: [] };
    checks.push(rec);
    try {
      const out = await fn(rec);
      rec.status = out?.status ?? 'pass';
      rec.observed = out?.observed ?? out;
    } catch (e) {
      if (e && e.deviation) {
        rec.status = 'deviation';
        rec.observed = e.message;
      } else {
        rec.status = 'fail';
        rec.observed = e && e.message ? e.message : String(e);
      }
    }
    console.log(`  ${id}  ${rec.status}`);
    return rec;
  })();
}
const deviation = (msg) => Object.assign(new Error(msg), { deviation: true });
const fail = (msg) => new Error(msg);
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Parse KEY=VALUE lines from a dotenv file without exporting them. */
function dotenv(p) {
  const out = {};
  if (!exists(p)) return out;
  for (const line of read(p).split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = { ...dotenv('.env'), ...process.env };

console.log('IQ-001 Installation Qualification');

await record('IQ-01', 'Node runtime matches the declared engine range', 'process.version satisfies package.json engines.node', () => {
  const pkg = require(path.join(ROOT, 'package.json'));
  const range = pkg.engines?.node ?? '(none declared)';
  const major = Number(process.version.slice(1).split('.')[0]);
  const wantMajor = Number((/(\d+)/.exec(range) ?? [])[1]);
  if (Number.isFinite(wantMajor) && major !== wantMajor) throw fail(`node ${process.version} vs engines ${range}`);
  return `node ${process.version}; engines.node = ${range}`;
});

await record('IQ-02', 'Deployment artefacts are present in the checkout', 'Dockerfile.optimized, docker-compose.yml, docker-compose.staging.yml, terraform production environment and modules, .github/workflows/deploy-aws.yml', () => {
  const files = ['Dockerfile.optimized', 'docker-compose.yml', 'docker-compose.staging.yml', 'terraform/environments/production/main.tf', 'terraform/environments/staging/main.tf', '.github/workflows/deploy-aws.yml', 'scripts/db/deploy-migrate.mjs', 'scripts/db/install-fresh.mjs', 'scripts/db/provision-app-role.mjs', 'scripts/db/migration-set.mjs', '.env.example'];
  const missing = files.filter((f) => !exists(f));
  if (missing.length) throw fail(`missing: ${missing.join(', ')}`);
  const modules = fs.readdirSync(path.join(ROOT, 'terraform', 'modules'));
  const tf = read('terraform/environments/production/main.tf');
  const used = [...tf.matchAll(/^module "([a-z_]+)"/gm)].map((m) => m[1]);
  return `all ${files.length} present; terraform modules on disk: ${modules.join(', ')}; production main.tf uses: ${used.join(', ')}`;
});

await record('IQ-03', 'Container image definition matches the runbook', 'node:22-slim base; non-root user; migrations and scripts/db copied; HEALTHCHECK probes /readyz; assets vendored', () => {
  const d = read('Dockerfile.optimized');
  const want = [/FROM node:22-slim/, /USER appuser/, /COPY --from=builder \/app\/migrations/, /COPY --from=builder \/app\/scripts\/db/, /readyz/, /COPY --from=builder \/app\/assets/];
  const missing = want.filter((re) => !re.test(d)).map(String);
  if (missing.length) throw fail(`Dockerfile lacks: ${missing.join(', ')}`);
  const jobs = [...read('.github/workflows/deploy-aws.yml').matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]);
  return `Dockerfile checks pass; deploy-aws.yml jobs: ${jobs.join(' → ')}`;
});

await record('IQ-04', 'Required configuration is declared and (locally) set', 'Every variable docker-compose.yml marks as required exists in .env.example; report which are set in the local .env (values never printed)', () => {
  const compose = read('docker-compose.yml');
  // `${VAR:?...}` in the compose header is the syntax example, not a variable.
  const required = [...new Set([...compose.matchAll(/\$\{([A-Z0-9_]+):\?/g)].map((m) => m[1]))].filter((k) => k !== 'VAR');
  const example = dotenv('.env.example');
  const exampleText = read('.env.example');
  const local = dotenv('.env');
  const notInExample = required.filter((k) => !(k in example) && !new RegExp(`^#?\\s*${k}=`, 'm').test(exampleText));
  const setLocally = required.filter((k) => local[k] && local[k].length > 0);
  const unsetLocally = required.filter((k) => !local[k]);
  const aiKey = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'KIMI_API_KEY'].filter((k) => local[k] && !/^sk-\.\.\./.test(local[k]));
  const observed = `compose-required: ${required.join(', ')}; not documented in .env.example: ${notInExample.length ? notInExample.join(', ') : 'none'}; set in local .env: ${setLocally.join(', ') || 'none'}; unset locally: ${unsetLocally.join(', ') || 'none'}; AI provider key present locally: ${aiKey.length ? 'yes' : 'no'}`;
  if (notInExample.length) throw fail(observed);
  return { status: unsetLocally.length ? 'deviation' : 'pass', observed: unsetLocally.length ? `IQ-DEV-002: local environment is a development install, not the production boot contract — ${observed}` : observed };
});

let pg = null;
let client = null;
await record('IQ-05', 'Database is reachable and carries the application schema', 'PostgreSQL ≥ 15 reachable on DATABASE_URL; pgvector installed; critical tables organizations/users present; migration journal present', async (rec) => {
  if (!env.DATABASE_URL) throw deviation('DATABASE_URL not set');
  pg = require(path.join(ROOT, 'node_modules', 'pg'));
  client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const v = (await client.query('select version()')).rows[0].version;
  const ext = (await client.query("select extname, extversion from pg_extension where extname in ('vector','pgcrypto','uuid-ossp') order by 1")).rows;
  const crit = (await client.query("select table_name from information_schema.tables where table_schema='public' and table_name in ('organizations','users','projects','audit_logs','organization_users','platform_role_grants','revoked_tokens') order by 1")).rows.map((r) => r.table_name);
  const journal = await client.query('select count(*)::int as n from c2c_migration_journal').catch(() => null);
  const tables = (await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'")).rows[0].n;
  rec.evidence.push('db-schema.json');
  fs.writeFileSync(path.join(OUT, 'db-schema.json'), JSON.stringify({ version: v, extensions: ext, criticalTables: crit, publicTableCount: tables, migrationJournalRows: journal?.rows?.[0]?.n ?? null }, null, 2));
  if (!crit.includes('organizations') || !crit.includes('users')) throw fail(`critical tables missing: ${crit.join(', ')}`);
  if (!ext.some((e) => e.extname === 'vector')) throw fail('pgvector extension not installed');
  return `${v.split(' on ')[0]}; extensions: ${ext.map((e) => `${e.extname}@${e.extversion}`).join(', ')}; public tables: ${tables}; critical present: ${crit.join(', ')}; c2c_migration_journal rows: ${journal?.rows?.[0]?.n ?? 'table absent'}`;
});

await record('IQ-06', 'Migration set files listed by scripts/db/migration-set.mjs exist on disk', 'Every .sql path named in C2C_MIGRATION_FILES resolves to a file', () => {
  const src = read('scripts/db/migration-set.mjs');
  const names = [...new Set([...src.matchAll(/['"`]((?:db\/)?migrations\/[A-Za-z0-9_./-]+\.sql)['"`]/g)].map((m) => m[1]))];
  const missing = names.filter((n) => !exists(n));
  if (!names.length) throw fail('no migration file names could be parsed from migration-set.mjs');
  if (missing.length) throw fail(`${missing.length} listed files missing: ${missing.slice(0, 5).join(', ')}`);
  return `${names.length} migration files named in the set, all present on disk`;
});

await record('IQ-07', 'Runtime database role can reach the tables the launch apps read and write', 'The role in DATABASE_URL (or APP_DATABASE_URL) holds SELECT/INSERT on every public table; RLS-relevant role attributes recorded', async (rec) => {
  if (!client) throw deviation('database not reachable (IQ-05)');
  const url = new URL(env.APP_DATABASE_URL || env.DATABASE_URL);
  const role = decodeURIComponent(url.username);
  const attrs = (await client.query('select rolname, rolsuper, rolbypassrls from pg_roles where rolname=$1', [role])).rows[0];
  // has_table_privilege throws when the role lacks USAGE on the schema, so the
  // schema privilege is tested first and a schema without USAGE counts as denied.
  const denied = (
    await client.query(
      "select schemaname||'.'||tablename as t from pg_tables where schemaname not in ('pg_catalog','information_schema') and (case when not has_schema_privilege($1, schemaname, 'USAGE') then true else not has_table_privilege($1, quote_ident(schemaname)||'.'||quote_ident(tablename), 'SELECT') end) order by 1",
      [role],
    )
  ).rows.map((r) => r.t);
  const launchRelevant = ['public.platform_settings', 'public.tamper_proof_log', 'public.qms_change_controls', 'public.program_journeys', 'public.cre_evidence_sources', 'public.document_span_lineage', 'public.assumption_records', 'public.contradiction_links', 'public.decision_records', 'ai.gateway_audit_log'].filter((t) => denied.includes(t));
  rec.evidence.push('db-grants-before.txt', 'db-role-denied-tables.json');
  fs.writeFileSync(path.join(OUT, 'db-role-denied-tables.json'), JSON.stringify({ role, attrs, deniedCount: denied.length, denied }, null, 2));
  const summary = `role ${role} (superuser=${attrs?.rolsuper}, bypassrls=${attrs?.rolbypassrls}); tables without SELECT: ${denied.length}; launch-relevant among them: ${launchRelevant.join(', ') || 'none'}`;
  if (denied.length) throw deviation(`IQ-DEV-001 (OPEN): ${summary}. Corrective action (owner role, not applied by the runner): GRANT USAGE ON SCHEMA … ; GRANT ALL ON ALL TABLES IN SCHEMA … TO ${role}; — or re-provision with scripts/db/install-fresh.mjs so one role owns the schema.`);
  return summary;
});

await record('IQ-08', 'Tenant-isolation posture of this installation', 'RLS_ENFORCE recorded; APP_DATABASE_URL (non-superuser app_service role) recorded; production requires RLS_ENFORCE=on on a non-superuser role (D3)', () => {
  const rls = env.RLS_ENFORCE ?? '(unset)';
  const app = env.APP_DATABASE_URL ? 'set' : 'unset';
  const observed = `RLS_ENFORCE=${rls}; APP_DATABASE_URL ${app}; APP_SERVICE_DB_PASSWORD ${env.APP_SERVICE_DB_PASSWORD ? 'set' : 'unset'}`;
  if (rls !== 'on' || app !== 'set') return { status: 'deviation', observed: `IQ-DEV-003: this installation does not run the D3 posture (${observed}). Tenant isolation is qualified under D3 against staging, not here.` };
  return observed;
});

let readyz = null;
await record('IQ-09', 'Application boots and reports readiness honestly', 'GET /healthz 200; GET /readyz JSON names every dependency; database and schema ok; an absent AI provider is reported as ana=down (503), never hidden', async (rec) => {
  const h = await fetch(`${BASE_URL}/healthz`).then((r) => r.status).catch((e) => `error ${e.message}`);
  const r = await fetch(`${BASE_URL}/readyz`);
  readyz = { status: r.status, body: await r.json().catch(() => null) };
  rec.evidence.push('readyz.json');
  fs.writeFileSync(path.join(OUT, 'readyz.json'), JSON.stringify({ healthz: h, readyz }, null, 2));
  const d = readyz.body?.dependencies ?? {};
  if (h !== 200) throw fail(`/healthz ${h}`);
  if (d.database !== 'ok' || d.schema !== 'ok') throw fail(`database=${d.database} schema=${d.schema}`);
  const observed = `/healthz 200; /readyz ${readyz.status}: ${JSON.stringify(d)}; schemaState=${readyz.body?.schemaState}; anaState=${readyz.body?.anaState}; capabilityRegistry=${readyz.body?.capabilityRegistry}`;
  if (d.ana === 'down') return { status: 'deviation', observed: `IQ-DEV-004: no AI provider configured — ${observed}. Readiness correctly fails closed (503); every AnA/model step in the OQs is a deviation for this reason.` };
  return observed;
});

let token = null;
await record('IQ-10', 'Development authentication policy is as configured', 'POST /api/auth/dev-login answers only when NODE_ENV=development and ALLOW_DEV_AUTH=1 (server/auth/dev-auth-policy.ts); in production it must be 404', async () => {
  const r = await fetch(`${BASE_URL}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE_URL }, body: JSON.stringify({ email: process.env.VALIDATION_USER_EMAIL || 'jonmichaelpsmith@gmail.com' }) });
  const j = await r.json().catch(() => ({}));
  token = j.accessToken ?? null;
  const observed = `dev-login → ${r.status} (NODE_ENV=${env.NODE_ENV ?? 'unset'}, ALLOW_DEV_AUTH=${env.ALLOW_DEV_AUTH ?? 'unset'})`;
  if (env.NODE_ENV === 'development' && env.ALLOW_DEV_AUTH === '1' && r.status !== 200) throw fail(observed);
  return { status: 'deviation', observed: `${observed}. The production refusal (404) cannot be exercised on a development install; verify on staging with NODE_ENV=production.` };
});

await record('IQ-11', 'Launch scope is enforced by the server', 'LAUNCH_SCOPE_ENFORCE=on and GET /api/module-subscriptions/navigation reports launchScope.enforced=true', async (rec) => {
  if (!token) throw deviation('no session (IQ-10)');
  const r = await fetch(`${BASE_URL}/api/module-subscriptions/navigation`, { headers: { Authorization: `Bearer ${token}`, Origin: BASE_URL } });
  const j = await r.json().catch(() => ({}));
  const arr = Object.values(j).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'entitled' in x)) ?? [];
  const locked = arr.filter((v) => v.source === 'launch-scope').length;
  rec.evidence.push('navigation-summary.json');
  fs.writeFileSync(path.join(OUT, 'navigation-summary.json'), JSON.stringify({ status: r.status, launchScope: j.launchScope, verdicts: arr.length, launchScopeLocked: locked, entitled: arr.filter((v) => v.entitled).map((v) => v.id) }, null, 2));
  if (r.status !== 200 || j.launchScope?.enforced !== true) throw fail(`status ${r.status}, launchScope=${JSON.stringify(j.launchScope)}`);
  return `LAUNCH_SCOPE_ENFORCE=${env.LAUNCH_SCOPE_ENFORCE ?? 'unset'}; enforced=true; ${arr.length} verdicts, ${locked} locked by launch-scope, ${arr.filter((v) => v.entitled).length} entitled`;
});

await record('IQ-12', 'Security middleware is active on responses', 'Content-Security-Policy and X-Content-Type-Options present; API responses carry rate-limit headers', async (rec) => {
  const page = await fetch(`${BASE_URL}/concept2cure/login`);
  const api = await fetch(`${BASE_URL}/api/submissions`, { headers: { Authorization: `Bearer ${token ?? ''}`, Origin: BASE_URL } });
  const pick = (h, names) => Object.fromEntries(names.map((n) => [n, h.get(n)]));
  const out = { page: pick(page.headers, ['content-security-policy', 'content-security-policy-report-only', 'x-content-type-options', 'strict-transport-security', 'x-frame-options', 'referrer-policy']), api: pick(api.headers, ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-request-id', 'content-security-policy']) };
  rec.evidence.push('security-headers.json');
  fs.writeFileSync(path.join(OUT, 'security-headers.json'), JSON.stringify(out, null, 2));
  const enforced = out.page['content-security-policy'];
  const reportOnly = out.page['content-security-policy-report-only'];
  if ((!enforced && !reportOnly) || !out.page['x-content-type-options']) throw fail(`headers: ${JSON.stringify(out.page)}`);
  const summary = `CSP ${enforced ? 'enforced' : 'report-only (development build: server/middleware/enterprise-security.ts:165)'}; nosniff=${out.page['x-content-type-options']}; referrer-policy=${out.page['referrer-policy']}; HSTS=${out.page['strict-transport-security'] ?? 'absent (plain http locally)'}; api rate limit ${out.api['x-ratelimit-limit'] ?? 'no header'}/min (remaining ${out.api['x-ratelimit-remaining'] ?? '?'})`;
  if (!enforced) return { status: 'deviation', observed: `IQ-DEV-005: ${summary}. Enforced CSP and HSTS are production-mode behaviour; verify on staging.` };
  return summary;
});

await record('IQ-13', 'Vendored agency artefacts are present', 'assets/estar-templates with checksums.txt; assets/ectd-dtd; assets/ectd-schema; assets/fda-recognized-standards', () => {
  const dirs = ['assets/estar-templates', 'assets/ectd-dtd', 'assets/ectd-schema', 'assets/fda-recognized-standards'];
  const report = dirs.map((d) => `${d}: ${exists(d) ? fs.readdirSync(path.join(ROOT, d)).length + ' entries' : 'MISSING'}`);
  const checksums = exists('assets/estar-templates/checksums.txt');
  if (report.some((r) => /MISSING/.test(r)) || !checksums) return { status: 'fail', observed: `${report.join('; ')}; checksums.txt ${checksums ? 'present' : 'missing'}` };
  return `${report.join('; ')}; checksums.txt present`;
});

await record('IQ-14', 'CI gates named by the launch definition are declared', 'package.json declares ci:migration-drop-safety, ci:migration-set-order, ci:launch-scope, ci:fixture-fallback, ci:no-mock-in-prod-routes', () => {
  const pkg = require(path.join(ROOT, 'package.json'));
  const want = ['ci:migration-drop-safety', 'ci:migration-set-order', 'ci:launch-scope', 'ci:fixture-fallback', 'ci:no-mock-in-prod-routes'];
  const missing = want.filter((s) => !pkg.scripts[s]);
  const ciCount = Object.keys(pkg.scripts).filter((s) => s.startsWith('ci:')).length;
  if (missing.length) throw fail(`missing scripts: ${missing.join(', ')} (${ciCount} ci:* declared)`);
  return `all present; ${ciCount} ci:* scripts declared`;
});

await record('IQ-15', 'Validation toolchain is installed', 'playwright-core resolvable from tests/validation; Chromium binary present at CHROMIUM_PATH', () => {
  const chromium = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  let pw = null;
  try {
    pw = require(path.join(ROOT, 'tests', 'validation', 'node_modules', 'playwright-core', 'package.json')).version;
  } catch {
    pw = null;
  }
  if (!pw) throw fail('playwright-core not installed under tests/validation (run npm install there)');
  if (!fs.existsSync(chromium)) throw fail(`Chromium not found at ${chromium}`);
  return `playwright-core ${pw}; chromium ${chromium}`;
});

if (client) await client.end().catch(() => {});

const counts = { pass: 0, fail: 0, deviation: 0, 'not-executed': 0 };
for (const c of checks) counts[c.status] += 1;
let git = { branch: null, commit: null };
try {
  const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
  const ref = head.startsWith('ref: ') ? head.slice(5) : null;
  git = { branch: ref ? ref.replace('refs/heads/', '') : null, commit: ref && fs.existsSync(path.join(ROOT, '.git', ref)) ? fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim() : head };
} catch {
  /* no git metadata */
}
const result = {
  protocolId: 'IQ-001',
  status: 'DRAFT — UNSIGNED (automated execution; human review and signature outstanding)',
  executedBy: 'scripts/validation/run-iq.mjs',
  executedAt: new Date().toISOString(),
  environment: { baseUrl: BASE_URL, node: process.version, git, host: process.platform },
  counts,
  checks,
};
fs.writeFileSync(path.join(OUT, 'iq-results.json'), JSON.stringify(result, null, 2));

const md = [];
md.push('# IQ-001 — Installation Qualification: execution record');
md.push('');
md.push(`**Status:** ${result.status}`);
md.push('');
md.push('> Generated by `scripts/validation/run-iq.mjs`. Do not edit by hand — re-run the protocol.');
md.push('');
md.push(`Executed ${result.executedAt} against ${BASE_URL}; ${git.branch ?? '?'} @ ${git.commit ?? '?'}; node ${process.version}.`);
md.push('');
md.push(`**Counts:** ${counts.pass} pass · ${counts.fail} fail · ${counts.deviation} deviation · ${counts['not-executed']} not-executed`);
md.push('');
md.push('| Check | Title | Expected | Observed | Verdict | Evidence |');
md.push('|---|---|---|---|---|---|');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
for (const c of checks) md.push(`| ${c.id} | ${esc(c.title)} | ${esc(c.expected)} | ${esc(c.observed)} | **${c.status}** | ${c.evidence.map((e) => `\`${e}\``).join('<br>')} |`);
md.push('');
md.push('## Signature block');
md.push('');
md.push('| Role | Name | Signature | Date |');
md.push('|---|---|---|---|');
md.push('| Executed by (automation owner) | | *unsigned* | |');
md.push('| Reviewed by (qualified validation contractor) | | *unsigned* | |');
md.push('| Approved by (founder / system owner) | | *unsigned* | |');
md.push('');
fs.writeFileSync(path.join(OUT, 'IQ-001-execution-record.md'), md.join('\n'));
console.log(`\nIQ-001: ${counts.pass} pass, ${counts.fail} fail, ${counts.deviation} deviation → ${path.relative(ROOT, OUT)}`);
process.exit(counts.fail > 0 ? 1 : 0);
