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
 * --probe-anthropic      : no-generation-charge GET /v1/models for Claude auth/model discovery.
 * --expect-anthropic-models=a,b : with --probe-anthropic, name which of these
 *                          drafting versions the key can see (none: blocked).
 * --probe-openai-usage   : EXPLICIT, BILLABLE one-response API smoke; may
 *                          identify quota/billing without claiming CSR PQ.
 * --probe-anthropic-usage: EXPLICIT, BILLABLE one-response Messages request to
 *                          the first of --expect-anthropic-models that answers.
 *                          The model list is free and is answered for an account
 *                          with no credit; only a real request shows whether the
 *                          key can draft.
 * --check-app            : requests existing http://127.0.0.1:5000/readyz.
 * --json                 : machine-readable results (no secrets).
 */
import { resolve } from 'node:path';
import { providerTimeout, providerJson, unverifiedProviderResponse, readableOpenAIReply,
  readableAnthropicReply } from './codespaces-provider-receipt.mjs';

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
  const isCodespace = env.C2C_CODESPACE === '1' || env.CODESPACES === 'true';
  if (isCodespace) {
    const ownerNames = [
      'DATABASE_URL', 'DATABASE_URL_PROD', 'DATABASE_OWNER_URL',
      'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL',
      'DATABASE_URL_ADMIN', 'NEON_DATABASE_URL_ADMIN', 'DATABASE_URL_DIRECT',
      'APP_SERVICE_DB_PASSWORD',
    ];
    const inheritedOwner = ownerNames.filter(name => typeof env[name] === 'string' && !!env[name].trim());
    if (inheritedOwner.length) {
      issues.push(reason('DB_OWNER_CREDENTIAL_IN_APP',
        'The request-serving Codespace contains owner or maintenance database secrets (' +
        inheritedOwner.join(', ') + '). Remove them from this Codespace and keep them only in an authorized maintenance environment.'));
    }
  }
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

/** The same canonical RLS gate as server/db/rlsEnforcement.ts at app boot. */
export function checkTenantIsolationConfiguration(env) {
  if ((env.RLS_ENFORCE ?? '').trim().toLowerCase() !== 'on') {
    return { status: 'blocked', code: 'RLS_NOT_ENFORCED',
      explanation: 'Codespaces runs tenant-scoped regulatory records. Set RLS_ENFORCE=on; off/shadow/unset are not accepted.' };
  }
  return { status: 'passed', code: 'RLS_ENFORCED_CONFIGURED',
    explanation: 'RLS_ENFORCE=on is configured. Database policy execution must still be verified at runtime.' };
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
  const model = 'gpt-4o-mini';
  const body = probeUsage ? JSON.stringify({ model, input: 'Reply with OK.', max_output_tokens: 8 }) : undefined;
  try {
    const response = await fetcher(url, {
      method: probeUsage ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY,
        ...(probeUsage ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}), signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await providerJson(response);
    const receiptValid = probeUsage ? readableOpenAIReply(data, model)
      : Array.isArray(data?.data) && data?.error == null;
    if (response.ok && !receiptValid) return unverifiedProviderResponse('OPENAI', response.status);
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
    return { status: 'blocked', code: providerTimeout(error)
      ? 'OPENAI_NETWORK_TIMEOUT' : 'OPENAI_NETWORK_FAILURE',
      authenticationVerified: false, billingVerified: false,
      explanation: 'Codespaces could not reach OpenAI. Check outbound networking and DNS.' };
  }
}

/** A no-generation-charge check of the Anthropic credential and model list.
 * Does not invoke AnA, confirm billing headroom, make a drafting call, or
 * convert a model's PQ status into passed. Raw SDK error messages are never
 * printed (they can contain account/workspace-specific details).
 */
export function classifyAnthropicResponse(status, data) {
  const type = typeof data?.error?.type === 'string' ? data.error.type.toLowerCase() : '';
  const message = typeof data?.error?.message === 'string' ? data.error.message.toLowerCase() : '';
  if (status >= 200 && status < 300) return 'ANTHROPIC_REACHABLE';
  if (status === 401 || type === 'authentication_error') return 'ANTHROPIC_KEY_INVALID';
  if (status === 403 || type === 'permission_error') return 'ANTHROPIC_WORKSPACE_OR_POLICY';
  if (/credit balance|insufficient credits?|billing|payment required/.test(message)) return 'ANTHROPIC_QUOTA_OR_BILLING';
  if (status === 429 || type === 'rate_limit_error') return 'ANTHROPIC_RATE_LIMIT';
  if (status === 400) return 'ANTHROPIC_REQUEST_REJECTED';
  if (status >= 500) return 'ANTHROPIC_PROVIDER_UNAVAILABLE';
  return 'ANTHROPIC_UNKNOWN_FAILURE';
}

/**
 * expectedModels: the pinned first-party versions approved for regulatory
 * drafting (server/services/ai-governance/approved-models.ts). When given, the
 * report names which of them this key can see; a key that sees none of them
 * cannot draft, whatever else it can do. Model ids are not secrets.
 */
export async function checkAnthropic({ env, fetcher, timeoutMs = 10000, expectedModels = [] }) {
  if (!secretSet(env.ANTHROPIC_API_KEY)) {
    return { status: 'missing', code: 'ANTHROPIC_KEY_MISSING',
      explanation: 'Set ANTHROPIC_API_KEY in GitHub Codespaces secrets for an authorized Claude provider. A key alone does not qualify regulated drafting.' };
  }
  const headers = {
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2026-10-21',
    'Accept': 'application/json',
    ...(secretSet(env.ANTHROPIC_WORKSPACE_ID)
      ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
  };
  try {
    // The list is paged (has_more / last_id); a few pages cover every model.
    const ids = [];
    let response; let body; let after = null;
    for (let page = 0; page < 5; page += 1) {
      const url = 'https://api.anthropic.com/v1/models?limit=100' +
        (after ? '&after_id=' + encodeURIComponent(after) : '');
      response = await fetcher(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
      body = await providerJson(response);
      if (!response.ok) break;
      if (!Array.isArray(body?.data) || body?.error != null) return unverifiedProviderResponse('ANTHROPIC', response.status);
      for (const m of Array.isArray(body?.data) ? body.data : []) if (typeof m?.id === 'string') ids.push(m.id);
      if (!body?.has_more || typeof body?.last_id !== 'string') break;
      after = body.last_id;
    }
    const code = classifyAnthropicResponse(response.status, body);
    const count = response.ok ? ids.length : 0;
    if (response.ok && count === 0) {
      return { status: 'blocked', code: 'ANTHROPIC_NO_MODELS_VISIBLE',
        httpStatus: response.status, authenticationVerified: true,
        modelsVisible: 0, billingVerified: false,
        explanation: 'The key was accepted but no accessible models were returned; verify project/workspace model permissions.' };
    }
    const drafting = response.ok && expectedModels.length
      ? { draftingModelsVisible: expectedModels.filter(id => ids.includes(id)),
        draftingModelsMissing: expectedModels.filter(id => !ids.includes(id)) }
      : {};
    if (drafting.draftingModelsVisible && drafting.draftingModelsVisible.length === 0) {
      return { status: 'blocked', code: 'ANTHROPIC_DRAFTING_MODELS_NOT_VISIBLE',
        httpStatus: response.status, authenticationVerified: true,
        modelsVisible: count, billingVerified: false, ...drafting,
        explanation: 'The key works, but none of the Claude versions approved for regulatory drafting (' +
          expectedModels.join(', ') + ') is available to it. Check the key\'s workspace model access in the Anthropic Console.' };
    }
    return { status: response.ok ? 'passed' : 'blocked', code,
      httpStatus: response.status, authenticationVerified: response.ok,
      modelsVisible: count, billingVerified: false, ...drafting,
      explanation: response.ok
        ? 'Anthropic accepted this key and listed accessible models. Billing headroom, model calls, approved provider placement and PQ are NOT verified.'
        : code === 'ANTHROPIC_KEY_INVALID'
          ? 'Replace the invalid or revoked Anthropic key in the Codespaces secret scope.'
          : code === 'ANTHROPIC_QUOTA_OR_BILLING'
            ? 'Review Anthropic Console API credits and billing for the selected workspace.'
            : code === 'ANTHROPIC_RATE_LIMIT'
              ? 'Request was rate-limited; this is not proof of exhausted credits.'
              : 'Review Anthropic account/workspace permissions and provider network access.' };
  } catch (error) {
    // Never echo a network/client error containing a credential or URL.
    return { status: 'blocked', code: providerTimeout(error)
      ? 'ANTHROPIC_NETWORK_TIMEOUT' : 'ANTHROPIC_NETWORK_FAILURE',
      authenticationVerified: false, billingVerified: false,
      explanation: 'Codespaces could not query the Anthropic models endpoint; check DNS/networking.' };
  }
}

/**
 * One small, billable Messages request to an approved drafting model: the only check that shows the key can draft.
 *
 * The model list (checkAnthropic) is answered for an account with no credit and for a key whose workspace cannot
 * call a model it can see, so "key accepted; drafting models available" was printed at a Codespace's start while
 * every drafting call was refused (2026-11-10). `models` is the approved drafting versions, in ladder order; a model
 * the account cannot use (404) is passed over for the next, and any other refusal ends the probe, since it would be
 * the same on every model. The request is the surface the app's gateway sends these models: no sampling parameter,
 * no thinking budget, effort in output_config. Neither the key nor the provider's own error text is returned.
 */
export async function checkAnthropicDrafting({ env, fetcher, models = [], timeoutMs = 60000 }) {
  if (!secretSet(env.ANTHROPIC_API_KEY)) {
    return { status: 'missing', code: 'ANTHROPIC_KEY_MISSING',
      explanation: 'Set ANTHROPIC_API_KEY in GitHub Codespaces secrets for this repository, then stop and start the Codespace.' };
  }
  if (!models.length) {
    return { status: 'blocked', code: 'ANTHROPIC_DRAFTING_MODELS_NOT_NAMED',
      explanation: 'Name the approved drafting versions with --expect-anthropic-models=a,b; no request was sent.' };
  }
  const headers = {
    'x-api-key': env.ANTHROPIC_API_KEY,
    // The version the app's SDK sends, so the probe is refused or served as the app's own calls are.
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
    ...(secretSet(env.ANTHROPIC_WORKSPACE_ID) ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
  };
  const modelsRefused = [];
  try {
    for (const model of models) {
      const response = await fetcher('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers, signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ model, max_tokens: 64, output_config: { effort: 'low' },
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }] }),
      });
      const body = await providerJson(response);
      if (response.ok) {
        if (!readableAnthropicReply(body, model)) return unverifiedProviderResponse('ANTHROPIC', response.status);
        return { status: 'passed', code: 'ANTHROPIC_DRAFTING_CALL_ACCEPTED', httpStatus: response.status,
          model: body.model, modelsRefused, authenticationVerified: true, billingVerified: true,
          explanation: 'One small billable request to ' + body.model + ' was answered: this key can reach an approved drafting model. ' +
            'This does not qualify the model (PQ) or any draft.' };
      }
      const type = typeof body?.error?.type === 'string' ? body.error.type.toLowerCase() : '';
      if (response.status === 404 || type === 'not_found_error') { modelsRefused.push(model); continue; }
      const code = classifyAnthropicResponse(response.status, body);
      return { status: 'blocked', code, httpStatus: response.status, model, modelsRefused,
        authenticationVerified: !['ANTHROPIC_KEY_INVALID', 'ANTHROPIC_WORKSPACE_OR_POLICY'].includes(code),
        billingVerified: false,
        explanation: code === 'ANTHROPIC_QUOTA_OR_BILLING'
          ? 'The key is valid, but its Anthropic account has no credit for API requests, so every drafting call is refused. Add credit in the Anthropic Console (Billing) for the workspace this key belongs to.'
          : code === 'ANTHROPIC_KEY_INVALID' ? 'Anthropic refused the key. Replace it in the Codespaces secret, then stop and start the Codespace.'
          : code === 'ANTHROPIC_WORKSPACE_OR_POLICY' ? 'Anthropic refused the request for this key\'s workspace. Check the workspace\'s permissions and limits in the Anthropic Console.'
          : code === 'ANTHROPIC_RATE_LIMIT' ? 'The request was rate limited; this is not proof of exhausted credit. Run the check again in a minute.'
          : code === 'ANTHROPIC_REQUEST_REJECTED' ? 'Anthropic rejected the request itself (400). The app sends these models the same request shape, so report this.'
          : 'Anthropic did not answer the request. Check its status and this Codespace\'s outbound network.' };
    }
    return { status: 'blocked', code: 'ANTHROPIC_DRAFTING_MODELS_NOT_AVAILABLE', httpStatus: 404, modelsRefused,
      authenticationVerified: true, billingVerified: false,
      explanation: 'The key was accepted, but Anthropic serves none of the approved drafting versions (' + models.join(', ') +
        ') to it. Give the key\'s workspace access to one of them in the Anthropic Console.' };
  } catch (error) {
    // Never echo a network/client error containing a credential or URL.
    return { status: 'blocked', code: providerTimeout(error)
      ? 'ANTHROPIC_NETWORK_TIMEOUT' : 'ANTHROPIC_NETWORK_FAILURE', modelsRefused,
      authenticationVerified: false, billingVerified: false,
      explanation: 'Codespaces could not reach the Anthropic Messages endpoint; check DNS/networking.' };
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

/**
 * A configured RLS flag is not proof of filtering. An application role that
 * owns an RLS-enabled, non-FORCE table bypasses its policies even when the
 * session reports app.rls_enforce=on. Refuse that combination on the actual
 * request-serving connection; catalog inspection is read-only.
 */
export function runtimeIsolationFailures(rlsSetting, ownerExemptTables = []) {
  const issues = [];
  if (rlsSetting !== 'on') {
    issues.push('PostgreSQL runtime session did not activate app.rls_enforce=on; the RLS startup option may not have reached the Neon connection.');
  }
  if (ownerExemptTables.length) {
    const preview = ownerExemptTables.slice(0, 5)
      .map(row => String(row.schema_name) + '.' + String(row.table_name)).join(', ');
    issues.push('The app role owns RLS-enabled tables without FORCE ROW LEVEL SECURITY: ' +
      preview + '. Connect as a non-owner runtime role or correct the RLS policies in an authorized maintenance session.');
  }
  return issues;
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
    // Match the application's RLS session startup packet; catalog queries in
    // the read-only readiness contract do not require a tenant identity.
    options: '-c app.rls_enforce=on',
  });
  try {
    await client.connect();
    const result = await verifyReadinessContract(client,
      { authoringTables: AUTHORING_SUBSYSTEM_TABLES, asRuntimeRole: true });
    const rlsSession = await client.query(
      "SELECT current_setting('app.rls_enforce', true) AS active_rls",
    );
    const exempt = await client.query(
      `SELECT n.nspname AS schema_name, c.relname AS table_name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND c.relrowsecurity AND NOT c.relforcerowsecurity
          AND pg_get_userbyid(c.relowner) = current_user
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname !~ '^pg_'
        ORDER BY n.nspname, c.relname LIMIT 12`,
    );
    const failures = [
      ...result.failures,
      ...runtimeIsolationFailures(rlsSession.rows[0]?.active_rls, exempt.rows),
    ];
    return { ok: result.ok && failures.length === 0, role: result.role, failures };
  } finally { await client.end().catch(() => {}); }
}

export async function checkApplication({ fetcher, port = 5000 }) {
  try {
    const result = await fetcher('http://127.0.0.1:' + port + '/readyz',
      { signal: AbortSignal.timeout(7000) });
    const data = await result.json().catch(() => null);
    const dependencies = data && typeof data.dependencies === 'object' && data.dependencies !== null
      ? data.dependencies : {};
    // /readyz can legitimately serve 200 with schema=degraded. That is
    // sufficient for some manual routes, but NOT a fully qualified Codespaces
    // demo. Require exact dependency evidence; an empty or incomplete body
    // must never become a green startup receipt.
    const missing = ['database', 'schema', 'ana', 'storage']
      .filter(name => dependencies[name] !== 'ok');
    const ready = result.ok && data?.ready === true &&
      data?.schemaState === 'ready' && data?.anaState === 'ready' &&
      missing.length === 0 && data?.capabilityRegistry === 'seeded';
    const code = ready ? 'APP_READINESS_REPORTED' :
      data?.schemaState === 'degraded' ? 'APP_SCHEMA_DEGRADED' :
      data?.capabilityRegistry !== 'seeded' ? 'APP_CAPABILITY_REGISTRY_NOT_SEEDED' :
      missing.length > 0 ? 'APP_REQUIRED_DEPENDENCIES_MISSING' : 'APP_NOT_READY';
    return { status: ready ? 'passed' : 'blocked', code,
      httpStatus: result.status, dependencies, missing,
      schemaState: data?.schemaState ?? 'unknown',
      anaState: data?.anaState ?? 'unknown',
      capabilityRegistry: data?.capabilityRegistry ?? 'unknown',
      explanation: data?.anaState === 'deterministic'
        ? 'Deterministic demo text is NOT qualified AnA model authoring.'
        : data?.anaState === 'no_high_risk_model'
          ? 'Configured provider lacks an approved model for regulated drafting.'
          : data?.schemaState === 'degraded'
            ? 'A degraded schema cannot qualify a complete governed demo.'
            : missing.length > 0
              ? 'One or more required runtime dependencies are not confirmed healthy.'
              : data?.capabilityRegistry !== 'seeded'
                ? 'AnA capability inventory is not seeded; do not treat 200 /readyz as a complete authoring demo.'
                : ready
                  ? 'Server readiness is reported healthy. This is NOT a live AnA draft, scientific review or export qualification.'
                  : 'App readiness is unavailable. Review its dependency status without weakening PQ or security gates.' };
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
    anthropic: { status: secretSet(env.ANTHROPIC_API_KEY) ? 'configured-not-probed' : 'missing',
      code: secretSet(env.ANTHROPIC_API_KEY) ? 'ANTHROPIC_KEY_PRESENT_NOT_TESTED' : 'ANTHROPIC_KEY_MISSING' },
    ana: { status: 'unverified', note: 'OPENAI_API_KEY alone does not authorize high-risk CSR or IND drafting; the saved-model PQ gate remains in force.' },
    application: { status: 'not_checked' },
    auth: checkAuthConfiguration(env),
    tenantIsolation: checkTenantIsolationConfiguration(env),
  };
  report.database.live = await probeDatabase({ config, connectDb });
  if (args.includes('--probe-openai-usage')) report.openai = await checkOpenAI({ env, fetcher, probeUsage: true });
  else if (args.includes('--probe-openai')) report.openai = await checkOpenAI({ env, fetcher });
  const expectArg = args.find(a => a.startsWith('--expect-anthropic-models='));
  const expectedModels = expectArg ? expectArg.slice(expectArg.indexOf('=') + 1).split(',').map(x => x.trim()).filter(Boolean) : [];
  if (args.includes('--probe-anthropic')) report.anthropic = await checkAnthropic({ env, fetcher, expectedModels });
  if (args.includes('--probe-anthropic-usage')) report.anthropicDrafting = await checkAnthropicDrafting({ env, fetcher, models: expectedModels });
  if (args.includes('--check-app')) report.application = await checkApplication({
    fetcher, port: Number(env.PORT) || 5000 });
  const required = [
    report.database.live.status === 'passed',
    report.auth.status === 'passed',
    report.tenantIsolation.status === 'passed',
  ];
  if (args.includes('--probe-openai') || args.includes('--probe-openai-usage')) required.push(report.openai.status === 'passed');
  if (args.includes('--probe-anthropic')) required.push(report.anthropic.status === 'passed');
  if (args.includes('--probe-anthropic-usage')) required.push(report.anthropicDrafting.status === 'passed');
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
