#!/usr/bin/env node
/**
 * Codespaces readiness diagnosis. READ ONLY by default.
 *
 * Checks the exact runtime and owner database targets, the existing deploy
 * readiness contract as the app role, provider-key presence and (if requested)
 * real OpenAI account reachability. It NEVER uses an owner's DSN as a fallback,
 * provisions or changes a database, prints a credential, or accepts an
 * unqualified AI model as a regulatory author.
 *
 * --probe-openai         : no-charge GET /v1/models, authentication only.
 * --probe-openai-usage   : EXPLICIT, BILLABLE one-response API smoke; may
 *                          identify quota/billing without claiming CSR PQ.
 * --check-app            : requests existing http://127.0.0.1:5000/readyz.
 * --json                 : machine-readable results (no secrets).
 */
import { resolve } from 'node:path';

const isLoopback = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const isNeon = host => host === 'neon.tech' || host.endsWith('.neon.tech');
const secretSet = value => typeof value === 'string' && !!value.trim() &&
  !/^(sk-\.\.\.|your_|replace_me|placeholder)/i.test(value.trim());
const reason = (code, message) => ({ code, message });

export function parseDbTarget(raw) {
  if (!secretSet(raw)) return null;
  try {
    const value = new URL(String(raw));
    if (!['postgres:', 'postgresql:'].includes(value.protocol) || !value.hostname ||
        !value.pathname || value.pathname === '/' || !value.username) return null;
    const host = value.hostname.toLowerCase();
    return {
      host, database: decodeURIComponent(value.pathname.slice(1)),
      user: decodeURIComponent(value.username), local: isLoopback(host),
      neon: isNeon(host), ssl: value.searchParams.get('sslmode') ?? 'unspecified',
    };
  } catch { return null; }
}

function sameDatabase(a, b) {
  if (!a || !b) return false;
  // Neon owner and app URLs may legitimately differ by "-pooler".
  const host = x => x.host.replace(/-pooler(?=\.)/, '');
  return host(a) === host(b) && a.database === b.database;
}

/** No DB URL, no implicit localhost. A non-owner runtime role is mandatory. */
export function checkDatabaseConfiguration(env) {
  const ownerRaw = env.DATABASE_OWNER_URL || env.DATABASE_URL;
  const runtimeRaw = env.APP_DATABASE_URL;
  const owner = parseDbTarget(ownerRaw);
  const runtime = parseDbTarget(runtimeRaw);
  const configuredBaseOwner = env.DATABASE_URL ? parseDbTarget(env.DATABASE_URL) : null;
  const configuredExplicitOwner = env.DATABASE_OWNER_URL ? parseDbTarget(env.DATABASE_OWNER_URL) : null;
  const issues = [];
  // Readiness needs only APP_DATABASE_URL. Owner credentials belong in a
  // separate provision/migration session, not the request-serving Codespace.
  if (ownerRaw && !owner) issues.push(reason('DB_OWNER_URL_INVALID',
    'Optional owner DSN is invalid. Remove it from the app environment or correct the separate maintenance connection.'));
  if (!runtime) issues.push(reason('DB_RUNTIME_URL_MISSING',
    'Set APP_DATABASE_URL to the non-owner app_service connection. This Codespace never falls back to an owner or local database.'));
  if (owner && runtime && !sameDatabase(owner, runtime)) {
    issues.push(reason('DB_TARGET_MISMATCH', 'The owner and application DSNs target different databases or hosts. Do not run migrations or the platform.'));
  }
  if (env.DATABASE_URL && env.DATABASE_OWNER_URL &&
      (!configuredBaseOwner || !configuredExplicitOwner ||
        !sameDatabase(configuredBaseOwner, configuredExplicitOwner))) {
    issues.push(reason('DB_OWNER_TARGET_CONFLICT',
      'DATABASE_URL and DATABASE_OWNER_URL target different Neon branches or databases. Align both before startup.'));
  }
  if (owner && runtime && owner.user === runtime.user) {
    issues.push(reason('DB_RUNTIME_ROLE_NOT_SEPARATE', 'The runtime and owner use the same database role. Configure a non-superuser app_service role before the regulated demo.'));
  }
  const mode = env.C2C_DB_MODE?.trim().toLowerCase() || 'configured';
  if (!['configured', 'neon', 'local'].includes(mode)) {
    issues.push(reason('DB_MODE_INVALID', 'C2C_DB_MODE must be neon, local or configured.'));
  }
  if (runtime) {
    // Neon normally grants the provisioner's ownership to neondb_owner.
    // A non-superuser table owner can still bypass RLS, so looking only at
    // rolcanlogin/rolbypassrls is insufficient. The live contract additionally
    // checks ownership of append-only stores and all runtime grants.
    if (runtime.neon && (runtime.user === 'neondb_owner' || runtime.user === 'postgres')) {
      issues.push(reason('DB_RUNTIME_OWNER_ROLE',
        'APP_DATABASE_URL names a Neon owner-like role; use the separate app_service runtime credential.'));
    }
    if (mode === 'neon' && !runtime.neon) issues.push(reason('DB_NEON_EXPECTED', 'C2C_DB_MODE=neon but the app DSN does not target Neon.'));
    if (mode === 'local' && !runtime.local) issues.push(reason('DB_LOCAL_EXPECTED', 'C2C_DB_MODE=local but the app DSN is not a local address.'));
    if (runtime.neon && runtime.ssl !== 'require' && runtime.ssl !== 'verify-full') {
      issues.push(reason('DB_NEON_TLS', 'The Neon runtime URL must explicitly require TLS (sslmode=require or verify-full).'));
    }
  }
  if (owner?.neon && owner.ssl !== 'require' && owner.ssl !== 'verify-full') {
    issues.push(reason('DB_NEON_OWNER_TLS', 'The Neon owner URL must explicitly require TLS (sslmode=require or verify-full).'));
  }
  return {
    ok: issues.length === 0, issues,
    owner: owner && { provider: owner.neon ? 'neon' : owner.local ? 'local' : 'remote',
      host: owner.host, database: owner.database },
    runtime: runtime && { provider: runtime.neon ? 'neon' : runtime.local ? 'local' : 'remote',
      host: runtime.host, database: runtime.database, role: runtime.user },
    runtimeUrl: runtimeRaw || null, // private intermediate only; NEVER serialize
  };
}

/** Mirror existing server/config/environment.ts JWT boot minima. */
export function checkAuthConfiguration(env) {
  const stage = (env.NODE_ENV || 'development').trim().toLowerCase();
  const suffix = ({ development: 'DEV', test: 'DEV', staging: 'STAGING', production: 'PROD' })[stage];
  if (!suffix) return { status: 'blocked', code: 'NODE_ENV_INVALID',
    explanation: 'Use an explicitly supported NODE_ENV.' };
  const jwt = env['JWT_SECRET_' + suffix] ?? env.JWT_SECRET;
  if (!jwt) return { status: 'blocked', code: 'JWT_SECRET_MISSING',
    explanation: 'Configure a random JWT_SECRET or JWT_SECRET_' + suffix + ' in the Codespaces secret scope.' };
  if (jwt.length < 32) return { status: 'blocked', code: 'JWT_SECRET_WEAK',
    explanation: 'JWT signing secret must contain at least 32 characters (use secure random material).' };
  const prior = env['JWT_SECRET_PREVIOUS_' + suffix] ?? env.JWT_SECRET_PREVIOUS;
  if (prior && (prior.length < 32 || prior === jwt)) {
    return { status: 'blocked', code: 'JWT_ROTATION_INVALID',
      explanation: 'Previous JWT secret must be different from current and at least 32 characters.' };
  }
  const refresh = env['REFRESH_TOKEN_SECRET_' + suffix] ?? env.REFRESH_TOKEN_SECRET;
  if (stage === 'production' || stage === 'staging') {
    if (!refresh || refresh.length < 32 || refresh === jwt) {
      return { status: 'blocked', code: 'REFRESH_SECRET_INVALID',
        explanation: 'Production/staging requires a separate refresh signing secret of at least 32 characters.' };
    }
  }
  return { status: 'passed', code: 'JWT_CONFIGURATION_PRESENT',
    explanation: 'Required secret presence/length verified; entropy and login delivery are not proven.' };
}

export function classifyDbError(error) {
  const code = String(error?.code ?? '');
  if (['28P01', '28000'].includes(code)) return 'DB_AUTH_REJECTED';
  if (code === '3D000') return 'DB_DATABASE_MISSING';
  if (code === '42501') return 'DB_GRANTS_DENIED';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DB_DNS_FAILED';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH'].includes(code)) return 'DB_UNREACHABLE';
  const message = String(error?.message ?? '').toLowerCase();
  if (/certificate|ssl|tls/.test(message)) return 'DB_TLS_FAILED';
  if (/password authentication|authentication failed/.test(message)) return 'DB_AUTH_REJECTED';
  if (/permission denied/.test(message)) return 'DB_GRANTS_DENIED';
  return 'DB_CONNECTION_FAILED';
}

export function classifyOpenAIResponse(status, data) {
  const code = typeof data?.error?.code === 'string' ? data.error.code.toLowerCase() : '';
  const kind = typeof data?.error?.type === 'string' ? data.error.type.toLowerCase() : '';
  if (status >= 200 && status < 300) return 'OPENAI_REACHABLE';
  if (status === 401 || code === 'invalid_api_key') return 'OPENAI_KEY_INVALID';
  if (code === 'insufficient_quota' || /insufficient_quota|billing_hard_limit|quota_exceeded/.test(kind + ' ' + code)) {
    return 'OPENAI_QUOTA_OR_BILLING';
  }
  if (status === 429) return 'OPENAI_RATE_LIMIT';
  if (status === 403) return 'OPENAI_ORGANIZATION_OR_PROJECT_POLICY';
  if (status === 404) return 'OPENAI_MODEL_OR_ENDPOINT_UNAVAILABLE';
  if (status === 400) return 'OPENAI_REQUEST_REJECTED';
  if (status >= 500) return 'OPENAI_PROVIDER_UNAVAILABLE';
  return 'OPENAI_UNKNOWN_FAILURE';
}

export async function checkOpenAI({ env, fetcher, probeUsage = false, timeoutMs = 10000 }) {
  if (!secretSet(env.OPENAI_API_KEY)) {
    return { status: 'missing', code: 'OPENAI_KEY_MISSING', explanation:
      'Configure an OPENAI_API_KEY Codespaces secret. A ChatGPT subscription does not automatically provision API credentials.' };
  }
  const url = probeUsage ? 'https://api.openai.com/v1/responses' : 'https://api.openai.com/v1/models';
  const body = probeUsage ? JSON.stringify({ model: 'gpt-4o-mini', input: 'Reply with OK.', max_output_tokens: 8 }) : undefined;
  try {
    const response = await fetcher(url, {
      method: probeUsage ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY,
        ...(probeUsage ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}), signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => null);
    const code = classifyOpenAIResponse(response.status, data);
    return { status: response.ok ? 'passed' : 'blocked', code,
      httpStatus: response.status, billingVerified: response.ok && probeUsage,
      authenticationVerified: response.ok,
      explanation: response.ok
        ? probeUsage
          ? 'A small billable API request succeeded. This does NOT qualify OpenAI for regulated drafting.'
          : 'OpenAI accepted the key, but quota, billing and model authorization have not been tested.'
        : code === 'OPENAI_QUOTA_OR_BILLING' ? 'Review the OpenAI Platform project budget and payment credits.'
        : code === 'OPENAI_RATE_LIMIT' ? 'Usage was rate-limited, not necessarily out of credits.'
        : code === 'OPENAI_KEY_INVALID' ? 'Replace the invalid/revoked key in Codespaces secrets.'
        : 'Review OpenAI API project/organization/model permissions; this is not a Concept2Cure regulatory verdict.' };
  } catch (error) {
    // Do not log the raw error: proxy errors can contain URLs, tokens or headers.
    return { status: 'blocked', code: String(error?.name) === 'TimeoutError'
      ? 'OPENAI_NETWORK_TIMEOUT' : 'OPENAI_NETWORK_FAILURE',
      authenticationVerified: false, billingVerified: false,
      explanation: 'Codespaces could not reach OpenAI. Check outbound networking and DNS.' };
  }
}

/** Run the existing, exhaustive schema/grant audit AS the request-serving role. */
export async function probeDatabase({ config, connectDb }) {
  if (!config.ok) return { status: 'blocked', code: 'DB_CONFIGURATION_INVALID' };
  try {
    const result = await connectDb(config.runtimeUrl);
    return result.ok
      ? { status: 'passed', code: 'DB_SCHEMA_AND_RUNTIME_GRANTS_VERIFIED', role: result.role,
        contract: 'scripts/db/readiness-contract.mjs' }
      : { status: 'blocked', code: 'DB_SCHEMA_OR_GRANTS_NOT_READY',
        problems: (result.failures ?? []).map(x => String(x).slice(0, 250)) };
  } catch (error) {
    return { status: 'blocked', code: classifyDbError(error), explanation:
      'Could not verify the intended database and runtime role. No local fallback, migration or recovery action was attempted.' };
  }
}

async function nativeDatabaseProbe(connectionString) {
  const [{ Client }, { sslFor, verifiedPgConnectionString }, { verifyReadinessContract },
    { AUTHORING_SUBSYSTEM_TABLES }] = await Promise.all([
    import('pg'), import('../db/connection.mjs'),
    import('../db/readiness-contract.mjs'), import('../db/authoring-subsystem.mjs'),
  ]);
  const client = new Client({
    connectionString: verifiedPgConnectionString(connectionString),
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 15000, query_timeout: 15000,
  });
  try {
    await client.connect();
    const result = await verifyReadinessContract(client,
      { authoringTables: AUTHORING_SUBSYSTEM_TABLES, asRuntimeRole: true });
    return { ok: result.ok, role: result.role, failures: result.failures };
  } finally { await client.end().catch(() => {}); }
}

export async function checkApplication({ fetcher, port = 5000 }) {
  try {
    const result = await fetcher('http://127.0.0.1:' + port + '/readyz',
      { signal: AbortSignal.timeout(7000) });
    const data = await result.json().catch(() => null);
    const dependencies = data && typeof data.dependencies === 'object' ? data.dependencies : {};
    return { status: result.ok && data?.ready === true && data.anaState === 'ready'
      ? 'passed' : 'blocked',
      code: result.ok && data?.ready === true && data.anaState === 'ready'
        ? 'APP_MODEL_AND_DEPENDENCIES_READY' : 'APP_NOT_READY',
      httpStatus: result.status, dependencies, schemaState: data?.schemaState ?? 'unknown',
      anaState: data?.anaState ?? 'unknown',
      explanation: data?.anaState === 'deterministic'
        ? 'Deterministic demo text is NOT qualified AnA model authoring.'
        : data?.anaState === 'no_high_risk_model'
          ? 'Configured provider lacks an approved model for regulated drafting.'
          : data?.anaState === 'ready' ? 'Inspect any other failed dependency.' :
            'AnA readiness is unavailable. Review the server readiness detail without weakening the PQ gate.' };
  } catch {
    return { status: 'blocked', code: 'APP_NOT_RUNNING',
      explanation: 'Start Concept2Cure normally, then rerun with --check-app.' };
  }
}

/** Injectable boundaries permit offline self-tests with no secrets/network. */
export async function runCodespacesDoctor({ env = process.env, args = [], fetcher = fetch,
  connectDb = nativeDatabaseProbe } = {}) {
  const config = checkDatabaseConfiguration(env);
  const report = { version: 1, branch: env.GITHUB_REF_NAME ?? 'check git branch locally',
    database: { config: { ok: config.ok, issues: config.issues,
      owner: config.owner, runtime: config.runtime } },
    openai: { status: secretSet(env.OPENAI_API_KEY) ? 'configured-not-probed' : 'missing',
      code: secretSet(env.OPENAI_API_KEY) ? 'OPENAI_KEY_PRESENT_NOT_TESTED' : 'OPENAI_KEY_MISSING' },
    ana: { status: 'unverified', note: 'OPENAI_API_KEY alone does not authorize high-risk CSR or IND drafting; the saved-model PQ gate remains in force.' },
    application: { status: 'not_checked' },
    auth: checkAuthConfiguration(env),
  };
  report.database.live = await probeDatabase({ config, connectDb });
  if (args.includes('--probe-openai-usage')) report.openai = await checkOpenAI({ env, fetcher, probeUsage: true });
  else if (args.includes('--probe-openai')) report.openai = await checkOpenAI({ env, fetcher });
  if (args.includes('--check-app')) report.application = await checkApplication({
    fetcher, port: Number(env.PORT) || 5000 });
  const required = [report.database.live.status === 'passed', report.auth.status === 'passed'];
  if (args.includes('--probe-openai') || args.includes('--probe-openai-usage')) required.push(report.openai.status === 'passed');
  if (args.includes('--check-app')) required.push(report.application.status === 'passed');
  report.prerequisitesVerified = required.every(Boolean);
  report.applicationVerified = args.includes('--check-app') && report.application.status === 'passed';
  report.ready = report.prerequisitesVerified && report.applicationVerified;
  report.regulatedCsrQualified = false; // Browser and independent scientific review still required.
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const report = await runCodespacesDoctor({ args });
  console.log(JSON.stringify(report, null, 2));
  if (!report.prerequisitesVerified) {
    console.error('\nCodespace prerequisites are NOT verified. No migration, provider-policy change, or local database fallback was attempted.');
    process.exitCode = 1;
  } else if (!args.includes('--check-app')) {
    console.log('\nDatabase prerequisites verified. The APPLICATION is not yet verified; start it and rerun with --check-app.');
  } else if (!report.ready) {
    console.error('\nApp readiness is BLOCKED; check the dependency and AnA status above.');
    process.exitCode = 1;
  } else {
    console.log('\nCodespace database and running application readiness passed; browser/CSR qualification is still separate.');
  }
}
if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Codespaces diagnostic failed without a usable result.'); process.exitCode = 1; });
}
