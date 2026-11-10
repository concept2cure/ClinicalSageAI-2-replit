import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sslFor, verifiedPgConnectionString } from '../db/connection.mjs';
import {
  checkDatabaseConfiguration, classifyDbError, classifyOpenAIResponse,
  checkOpenAI, checkAnthropic, checkAnthropicDrafting, classifyAnthropicResponse,
  probeDatabase, checkApplication, checkAuthConfiguration,
  checkTenantIsolationConfiguration, runtimeIsolationFailures, runCodespacesDoctor,
} from './codespaces-doctor.mjs';

const owner = 'postgresql://neondb_owner:secret@ep-example.neon.tech/neondb?sslmode=require';
const runtime = 'postgresql://app_service:othersecret@ep-example-pooler.neon.tech/neondb?sslmode=require'; // ci-secret-scan-ignore: synthetic DSN for the same-database/pooler fixture; never used for a live connection.
const env = { DATABASE_URL: owner, APP_DATABASE_URL: runtime,
  OPENAI_API_KEY: 'sk-not-a-real-secret', C2C_DB_MODE: 'neon',
  RLS_ENFORCE: 'on',
  JWT_SECRET: 'test_only_dev_key_not_for_use_in_real_account_123456' };

test('Neon owner + pooler runtime on the same database are eligible for a read-only check', () => {
  const c = checkDatabaseConfiguration(env);
  assert.equal(c.ok, true);
  assert.equal(c.runtime.provider, 'neon');
  assert.equal(c.runtime.role, 'app_service');
  assert.equal(JSON.stringify({ owner: c.owner, runtime: c.runtime }).includes('secret'), false);
});
test('Codespaces never silently chooses a different DB, invalid TLS or the owner for runtime', () => {
  assert.deepEqual(checkDatabaseConfiguration({}).issues.map(x => x.code),
    ['DB_RUNTIME_URL_MISSING']);
  assert.ok(checkDatabaseConfiguration({ DATABASE_URL: owner }).issues.some(x => x.code === 'DB_RUNTIME_URL_MISSING'));
  assert.ok(checkDatabaseConfiguration({ ...env, APP_DATABASE_URL:
    'postgresql://app_service:secret@ep-wrong.neon.tech/neondb?sslmode=require' })
    .issues.some(x => x.code === 'DB_TARGET_MISMATCH'));
  assert.ok(checkDatabaseConfiguration({ ...env, APP_DATABASE_URL:
    'postgresql://neondb_owner:secret@ep-example-pooler.neon.tech/neondb?sslmode=require' })
    .issues.some(x => x.code === 'DB_RUNTIME_ROLE_NOT_SEPARATE'));
  assert.ok(checkDatabaseConfiguration({
    APP_DATABASE_URL: 'postgresql://neondb_owner:secret@ep-example-pooler.neon.tech/neondb?sslmode=require',
    C2C_DB_MODE: 'neon',
  }).issues.some(x => x.code === 'DB_RUNTIME_OWNER_ROLE'));
  assert.ok(checkDatabaseConfiguration({ ...env, APP_DATABASE_URL:
    'postgresql://app_service:secret@ep-example-pooler.neon.tech/neondb?sslmode=disable' })
    .issues.some(x => x.code === 'DB_NEON_TLS'));
  assert.ok(checkDatabaseConfiguration({ ...env, C2C_DB_MODE: 'local' })
    .issues.some(x => x.code === 'DB_LOCAL_EXPECTED'));
  assert.ok(checkDatabaseConfiguration({ ...env, DATABASE_OWNER_URL:
    'postgresql://neondb_owner:secret@ep-other.neon.tech/neondb?sslmode=require' })
    .issues.some(x => x.code === 'DB_OWNER_TARGET_CONFLICT'));
  assert.ok(checkDatabaseConfiguration({ ...env, DATABASE_OWNER_URL:
    'postgresql://neondb_owner:secret@ep-example.neon.tech/neondb?sslmode=disable' })
    .issues.some(x => x.code === 'DB_NEON_OWNER_TLS'));
});
test('request-serving Codespaces fails closed on any inherited DB owner/maintenance secret', () => {
  for (const name of ['DATABASE_URL', 'DATABASE_OWNER_URL', 'DATABASE_NEON_NEW_SECRET',
    'NEON_DATABASE_URL', 'DATABASE_URL_ADMIN', 'NEON_DATABASE_URL_ADMIN',
    'DATABASE_URL_DIRECT', 'APP_SERVICE_DB_PASSWORD']) {
    const codespace = { C2C_CODESPACE: '1', C2C_DB_MODE: 'neon',
      APP_DATABASE_URL: runtime, RLS_ENFORCE: 'on', JWT_SECRET: env.JWT_SECRET,
      [name]: name === 'APP_SERVICE_DB_PASSWORD' ? 'a_secret' : owner };
    const config = checkDatabaseConfiguration(codespace);
    assert.ok(config.issues.some(issue => issue.code === 'DB_OWNER_CREDENTIAL_IN_APP'), name);
    assert.equal(config.ok, false);
    assert.doesNotMatch(JSON.stringify(config.issues), /neondb_owner:secret/);
  }
});

test('a runtime-only Codespace can qualify without an owner credential in the API process', async () => {
  const runtimeOnly = { APP_DATABASE_URL: runtime, C2C_DB_MODE: 'neon' };
  const config = checkDatabaseConfiguration(runtimeOnly);
  assert.equal(config.ok, true);
  assert.equal(config.owner, null);
  assert.equal(config.runtime.role, 'app_service');
  const result = await probeDatabase({ config, connectDb: async () =>
    ({ ok: true, role: 'app_service', failures: [] }) });
  assert.equal(result.status, 'passed');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('Neon connection errors are classified without returning credential-bearing messages', () => {
  assert.equal(classifyDbError({ code: '28P01', message: owner }), 'DB_AUTH_REJECTED');
  assert.equal(classifyDbError({ code: 'ENOTFOUND', message: owner }), 'DB_DNS_FAILED');
  assert.equal(classifyDbError({ message: 'certificate revoked' }), 'DB_TLS_FAILED');
  assert.equal(classifyDbError({ code: '42501' }), 'DB_GRANTS_DENIED');
});
test('read-only Neon PostgreSQL probe verifies hostname and refuses remote plaintext', () => {
  const uri = verifiedPgConnectionString(runtime);
  assert.equal(new URL(uri).searchParams.get('sslmode'), 'verify-full');
  assert.deepEqual(sslFor(uri), { rejectUnauthorized: true });
  assert.throws(() => sslFor(runtime.replace('sslmode=require', 'sslmode=disable')), /Verified TLS/);
  assert.throws(() => verifiedPgConnectionString(
    runtime.replace('sslmode=require', 'sslmode=no-verify')), /verified TLS/i);
  assert.equal(sslFor('postgresql://app_service:example@127.0.0.1/local?sslmode=disable'), false);
});

test('Codespaces startup reports missing or weak signing credentials before claiming readiness', () => {
  assert.equal(checkAuthConfiguration({}).code, 'JWT_SECRET_MISSING');
  assert.equal(checkAuthConfiguration({ JWT_SECRET: 'weak' }).code, 'JWT_SECRET_WEAK');
  assert.equal(checkAuthConfiguration(env).status, 'passed');
  assert.equal(checkAuthConfiguration({
    JWT_SECRET: 'a'.repeat(40), JWT_SECRET_PREVIOUS: 'a'.repeat(40),
  }).code, 'JWT_ROTATION_INVALID');
  assert.equal(checkAuthConfiguration({
    NODE_ENV: 'production', JWT_SECRET_PROD: 'a'.repeat(40),
  }).code, 'REFRESH_SECRET_INVALID');
});

test('Codespaces refuses a green database when tenant RLS is off or unset', async () => {
  for (const value of [undefined, 'off', 'shadow', 'enforce', 'true']) {
    const isolatedEnv = { ...env };
    if (value === undefined) delete isolatedEnv.RLS_ENFORCE;
    else isolatedEnv.RLS_ENFORCE = value;
    assert.equal(checkTenantIsolationConfiguration(isolatedEnv).code, 'RLS_NOT_ENFORCED');
    const report = await runCodespacesDoctor({ env: isolatedEnv,
      connectDb: async () => ({ ok: true, role: 'app_service', failures: [] }) });
    assert.equal(report.prerequisitesVerified, false);
    assert.equal(report.tenantIsolation.status, 'blocked');
    assert.equal(report.ready, false);
  }
  assert.equal(checkTenantIsolationConfiguration(env).status, 'passed');
});

test('an app role must actually run RLS and must not own unforced RLS tables', () => {
  assert.deepEqual(runtimeIsolationFailures('on', []), []);
  assert.match(runtimeIsolationFailures(null, [])[0], /did not activate/);
  assert.match(runtimeIsolationFailures('off', [])[0], /did not activate/);
  const findings = runtimeIsolationFailures('on', [
    { schema_name: 'vault', table_name: 'documents' },
    { schema_name: 'identity', table_name: 'users' },
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /vault.documents/);
  assert.match(findings[0], /identity.users/);
  assert.doesNotMatch(findings[0], /postgresql:\/\//);
});

test('OpenAI quota is distinct from a rate limit, auth failure or governance gate', () => {
  assert.equal(classifyOpenAIResponse(401, { error: { code: 'invalid_api_key' } }), 'OPENAI_KEY_INVALID');
  assert.equal(classifyOpenAIResponse(429, { error: { code: 'insufficient_quota' } }), 'OPENAI_QUOTA_OR_BILLING');
  assert.equal(classifyOpenAIResponse(429, { error: { type: 'rate_limit_exceeded' } }), 'OPENAI_RATE_LIMIT');
  assert.equal(classifyOpenAIResponse(403, { error: {} }), 'OPENAI_ORGANIZATION_OR_PROJECT_POLICY');
  assert.equal(classifyOpenAIResponse(200, {}), 'OPENAI_REACHABLE');
});
test('OpenAI auth probe is no-charge GET; billable POST requires explicit request', async () => {
  let paths = [];
  const fetcher = async (path, opts) => {
    paths.push({ path, method: opts.method });
    return { status: 200, ok: true, json: async () => ({ data: [] }) };
  };
  const auth = await checkOpenAI({ env, fetcher });
  assert.equal(auth.authenticationVerified, true);
  assert.equal(auth.billingVerified, false);
  assert.equal(paths[0].method, 'GET');
  const use = await checkOpenAI({ env, fetcher, probeUsage: true });
  assert.equal(use.billingVerified, true);
  assert.equal(paths[1].method, 'POST');
});
test('Anthropic authentication checks models without a drafting or billable request', async () => {
  let calls = 0;
  const fake = 'sk-ant-test-not-a-real-credential'; // ci-secret-scan-ignore: synthetic provider key used only by the injected mock fetcher.
  const observed = await checkAnthropic({
    env: { ANTHROPIC_API_KEY: fake, ANTHROPIC_WORKSPACE_ID: 'wrkspc_test' },
    fetcher: async (url, opts) => {
      calls += 1;
      assert.equal(url, 'https://api.anthropic.com/v1/models?limit=100');
      assert.equal(opts.method, 'GET');
      assert.equal(opts.headers['x-api-key'], fake);
      assert.equal(opts.headers['anthropic-version'], '2026-10-21');
      assert.equal(opts.headers['anthropic-workspace-id'], 'wrkspc_test');
      assert.equal(opts.body, undefined);
      return { ok: true, status: 200, json: async () => ({
        data: [{ id: 'claude-opus-example' }],
      }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(observed.status, 'passed');
  assert.equal(observed.modelsVisible, 1);
  assert.equal(observed.billingVerified, false);
  assert.doesNotMatch(JSON.stringify(observed), /sk-ant-test/);
  assert.match(observed.explanation, /PQ are NOT verified/);
});
test('Anthropic missing or empty models never reports provider readiness', async () => {
  const missing = await checkAnthropic({ env: {}, fetcher: () => { throw Error('Unexpected network call'); } });
  assert.equal(missing.code, 'ANTHROPIC_KEY_MISSING');
  const empty = await checkAnthropic({ env: { ANTHROPIC_API_KEY: 'test-only-key' },
    fetcher: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }) });
  assert.equal(empty.code, 'ANTHROPIC_NO_MODELS_VISIBLE');
  assert.equal(empty.status, 'blocked');
});
test('Anthropic provider responses distinguish auth, policy, billing and rate limits', () => {
  assert.equal(classifyAnthropicResponse(401, { error: { type: 'authentication_error' } }),
    'ANTHROPIC_KEY_INVALID');
  assert.equal(classifyAnthropicResponse(403, { error: { type: 'permission_error' } }),
    'ANTHROPIC_WORKSPACE_OR_POLICY');
  assert.equal(classifyAnthropicResponse(400, { error: { message: 'credit balance is too low' } }),
    'ANTHROPIC_QUOTA_OR_BILLING');
  assert.equal(classifyAnthropicResponse(429, { error: { type: 'rate_limit_error' } }),
    'ANTHROPIC_RATE_LIMIT');
});
test('Anthropic model discovery is opt-in and is required only when requested', async () => {
  let count = 0;
  const fetcher = async (url, opts) => {
    count += 1;
    assert.equal(opts.method, 'GET');
    assert.match(url, /api\.anthropic\.com/);
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'example' }] }) };
  };
  const environment = { APP_DATABASE_URL: runtime, RLS_ENFORCE: 'on',
    JWT_SECRET: env.JWT_SECRET, ANTHROPIC_API_KEY: 'sk-ant-test-only' };
  const database = async () => ({ ok: true, role: 'app_service', failures: [] });
  const ordinary = await runCodespacesDoctor({ env: environment, fetcher, connectDb: database });
  assert.equal(count, 0);
  assert.equal(ordinary.anthropic.status, 'configured-not-probed');
  const probed = await runCodespacesDoctor({
    env: environment, args: ['--probe-anthropic'], fetcher, connectDb: database,
  });
  assert.equal(count, 1);
  assert.equal(probed.anthropic.status, 'passed');
  assert.equal(probed.prerequisitesVerified, true);
});

test('missing key never triggers OpenAI request', async () => {
  const result = await checkOpenAI({ env: {}, fetcher: () => { throw Error('called'); } });
  assert.equal(result.code, 'OPENAI_KEY_MISSING');
});
test('DB contract failures never imply readiness', async () => {
  const config = checkDatabaseConfiguration(env);
  const failed = await probeDatabase({ env, config, connectDb: async () => ({
    ok: false, failures: ['audit.tamper_proof_log missing'],
  }) });
  assert.equal(failed.status, 'blocked');
  assert.match(failed.problems[0], /tamper_proof_log/);
});
test('overall startup cannot be marked ready on a missing DB even when OpenAI key exists', async () => {
  let called = false;
  const report = await runCodespacesDoctor({ env: { OPENAI_API_KEY: 'sk-present' },
    connectDb: async () => { called = true; return { ok: true }; } });
  assert.equal(called, false);
  assert.equal(report.ready, false);
  assert.equal(report.openai.status, 'configured-not-probed');
  assert.equal(JSON.stringify(report).includes('sk-present'), false);
});
test('doctor does not probe external provider or application without explicit flags', async () => {
  const report = await runCodespacesDoctor({ env, connectDb: async () => ({
    ok: true, role: 'app_service' }), fetcher: async () => { throw Error('unexpected fetch'); } });
  assert.equal(report.prerequisitesVerified, true);
  assert.equal(report.ready, false, 'a checked database does not qualify an app that was never started');
  assert.equal(report.application.status, 'not_checked');
  assert.equal(report.openai.status, 'configured-not-probed');
  assert.equal(JSON.stringify(report).includes('othersecret'), false);
});
test('a misleading 200 /readyz cannot qualify degraded, unseeded or incomplete app state', async () => {
  const base = {
    ready: true, schemaState: 'ready', anaState: 'ready',
    capabilityRegistry: 'seeded',
    dependencies: { database: 'ok', schema: 'ok', ana: 'ok', storage: 'ok',
      virusScan: 'skipped', redis: 'skipped', worker: 'skipped' },
  };
  const probe = data => checkApplication({ fetcher: async () => ({
    ok: true, status: 200, json: async () => data,
  }) });
  const passed = await probe(base);
  assert.equal(passed.status, 'passed');
  assert.equal(passed.code, 'APP_READINESS_REPORTED');
  assert.match(passed.explanation, /NOT a live AnA draft/);

  const degraded = await probe({ ...base, schemaState: 'degraded' });
  assert.equal(degraded.code, 'APP_SCHEMA_DEGRADED');
  assert.equal(degraded.status, 'blocked');

  const unseeded = await probe({ ...base, capabilityRegistry: 'failed' });
  assert.equal(unseeded.code, 'APP_CAPABILITY_REGISTRY_NOT_SEEDED');
  assert.equal(unseeded.status, 'blocked');

  const missing = await probe({ ...base, dependencies: {
    ...base.dependencies, storage: 'skipped',
  } });
  assert.equal(missing.code, 'APP_REQUIRED_DEPENDENCIES_MISSING');
  assert.deepEqual(missing.missing, ['storage']);
  assert.equal(missing.status, 'blocked');

  const noEvidence = await probe({ ready: true, anaState: 'ready' });
  assert.equal(noEvidence.status, 'blocked');
});

test('running app with simulated AnA is not accepted as real model readiness', async () => {
  const app = await checkApplication({ fetcher: async () => ({ status: 200, ok: true,
    json: async () => ({ ready: true, anaState: 'deterministic',
      dependencies: { schema: 'ok', ana: 'ok' } }) }) });
  assert.equal(app.status, 'blocked');
  assert.match(app.explanation, /NOT qualified/);
});

test('Anthropic probe names which approved drafting versions the key can see, across pages', async () => {
  const pages = {
    'https://api.anthropic.com/v1/models?limit=100':
      { data: [{ id: 'claude-haiku-4-5' }, { id: 'claude-opus-4-8' }], has_more: true, last_id: 'claude-opus-4-8' },
    'https://api.anthropic.com/v1/models?limit=100&after_id=claude-opus-4-8':
      { data: [{ id: 'claude-opus-5-5' }], has_more: false, last_id: 'claude-opus-5-5' },
  };
  const fetcher = async (url) => {
    assert.ok(url in pages, 'unexpected URL ' + url);
    return { ok: true, status: 200, json: async () => pages[url] };
  };
  const seen = await checkAnthropic({ env: { ANTHROPIC_API_KEY: 'test-only-key' }, fetcher,
    expectedModels: ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8'] });
  assert.equal(seen.status, 'passed');
  assert.equal(seen.modelsVisible, 3);
  assert.deepEqual(seen.draftingModelsVisible, ['claude-opus-5-5', 'claude-opus-4-8']);
  assert.deepEqual(seen.draftingModelsMissing, ['claude-opus-5']);
  assert.doesNotMatch(JSON.stringify(seen), /test-only-key/);
});

test('A working key that sees no approved drafting version is blocked, not passed', async () => {
  const fetcher = async () => ({ ok: true, status: 200,
    json: async () => ({ data: [{ id: 'claude-haiku-4-5' }], has_more: false }) });
  const seen = await checkAnthropic({ env: { ANTHROPIC_API_KEY: 'test-only-key' }, fetcher,
    expectedModels: ['claude-opus-5-5'] });
  assert.equal(seen.status, 'blocked');
  assert.equal(seen.code, 'ANTHROPIC_DRAFTING_MODELS_NOT_VISIBLE');
  assert.equal(seen.authenticationVerified, true);
  // Without an expected list the same key still passes authentication, as before.
  const plain = await checkAnthropic({ env: { ANTHROPIC_API_KEY: 'test-only-key' }, fetcher });
  assert.equal(plain.status, 'passed');
});

test('--expect-anthropic-models reaches the Anthropic probe from the command line', async () => {
  const fetcher = async () => ({ ok: true, status: 200,
    json: async () => ({ data: [{ id: 'claude-opus-5-5' }], has_more: false }) });
  const report = await runCodespacesDoctor({
    env: { ...env, ANTHROPIC_API_KEY: 'test-only-key' }, fetcher,
    args: ['--probe-anthropic', '--expect-anthropic-models=claude-opus-5-5,claude-opus-5'],
    connectDb: async () => ({ ok: true, role: 'app_service', failures: [] }),
  });
  assert.deepEqual(report.anthropic.draftingModelsVisible, ['claude-opus-5-5']);
  assert.deepEqual(report.anthropic.draftingModelsMissing, ['claude-opus-5']);
});

// 2026-11-10: a key the model list accepts can still be refused on every drafting call. Anthropic lists models for
// an account with no credit, so the Codespace start said "key accepted; drafting models available" and the app then
// drafted nothing. The explicit, billable probe sends one small Messages request to an approved drafting model.
const draftingCall = { env: { ANTHROPIC_API_KEY: 'test-only-key' }, models: ['claude-opus-5-5', 'claude-opus-5'] };
const apiError = (status, type, message) => ({ ok: false, status, json: async () => ({ type: 'error', error: { type, message } }) });

test('the drafting-call probe sends one small request the current API accepts, to the first approved model', async () => {
  const sent = [];
  const fetcher = async (url, opts) => {
    sent.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ type: 'message', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [] }) };
  };
  const result = await checkAnthropicDrafting({ ...draftingCall, fetcher });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent[0].opts.method, 'POST');
  assert.equal(sent[0].opts.headers['x-api-key'], 'test-only-key');
  const body = JSON.parse(sent[0].opts.body);
  assert.equal(body.model, 'claude-opus-5-5');
  // Nothing the drafting models refuse: no sampling parameter, no thinking budget, no forced tool choice.
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config']);
  assert.ok(body.max_tokens <= 256);
  assert.equal(result.status, 'passed');
  assert.equal(result.code, 'ANTHROPIC_DRAFTING_CALL_ACCEPTED');
  assert.equal(result.model, 'claude-opus-5-5');
  assert.equal(result.billingVerified, true);
  assert.equal(JSON.stringify(result).includes('test-only-key'), false);
});

test('an account with no credit is named as that, whatever the model list said', async () => {
  const result = await checkAnthropicDrafting({ ...draftingCall,
    fetcher: async () => apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.') });
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'ANTHROPIC_QUOTA_OR_BILLING');
  assert.match(result.explanation, /credit/i);
  assert.doesNotMatch(result.explanation, /Plans & Billing to upgrade/); // the provider's own text is not repeated
});

test('a model the account cannot use is tried no further than the approved list, and the result names which answered', async () => {
  const asked = [];
  const fetcher = async (_url, opts) => {
    const { model } = JSON.parse(opts.body);
    asked.push(model);
    return model === 'claude-opus-5-5' ? apiError(404, 'not_found_error', 'model: claude-opus-5-5')
      : { ok: true, status: 200, json: async () => ({ type: 'message', model, stop_reason: 'max_tokens', content: [] }) };
  };
  const result = await checkAnthropicDrafting({ ...draftingCall, fetcher });
  assert.deepEqual(asked, ['claude-opus-5-5', 'claude-opus-5']);
  assert.equal(result.status, 'passed');
  assert.equal(result.model, 'claude-opus-5');
  assert.deepEqual(result.modelsRefused, ['claude-opus-5-5']);
});

test('no approved model answering is blocked as model access; a refused key and a rate limit keep their own codes', async () => {
  const none = await checkAnthropicDrafting({ ...draftingCall, fetcher: async () => apiError(404, 'not_found_error', 'model: x') });
  assert.equal(none.status, 'blocked');
  assert.equal(none.code, 'ANTHROPIC_DRAFTING_MODELS_NOT_AVAILABLE');
  const key = await checkAnthropicDrafting({ ...draftingCall, fetcher: async () => apiError(401, 'authentication_error', 'invalid x-api-key') });
  assert.equal(key.code, 'ANTHROPIC_KEY_INVALID');
  let calls = 0;
  const limited = await checkAnthropicDrafting({ ...draftingCall, fetcher: async () => { calls += 1; return apiError(429, 'rate_limit_error', 'rate limited'); } });
  assert.equal(limited.code, 'ANTHROPIC_RATE_LIMIT');
  assert.equal(calls, 1); // a refusal that is not about the model is not retried on the next model
});

test('the drafting-call probe is opt-in, needs a key and a model list, and is required once asked for', async () => {
  const missing = await checkAnthropicDrafting({ env: {}, models: ['claude-opus-5-5'], fetcher: () => { throw Error('called'); } });
  assert.equal(missing.code, 'ANTHROPIC_KEY_MISSING');
  const noModels = await checkAnthropicDrafting({ env: { ANTHROPIC_API_KEY: 'test-only-key' }, models: [], fetcher: () => { throw Error('called'); } });
  assert.equal(noModels.code, 'ANTHROPIC_DRAFTING_MODELS_NOT_NAMED');
  const database = async () => ({ ok: true, role: 'app_service', failures: [] });
  let posts = 0;
  const fetcher = async (_url, opts) => {
    if (opts.method === 'POST') posts += 1;
    return apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.');
  };
  const environment = { ...env, ANTHROPIC_API_KEY: 'test-only-key' };
  const plain = await runCodespacesDoctor({ env: environment, fetcher, connectDb: database, args: [] });
  assert.equal(posts, 0);
  assert.equal(plain.anthropicDrafting, undefined);
  const asked = await runCodespacesDoctor({ env: environment, fetcher, connectDb: database,
    args: ['--probe-anthropic-usage', '--expect-anthropic-models=claude-opus-5-5'] });
  assert.equal(posts, 1);
  assert.equal(asked.anthropicDrafting.code, 'ANTHROPIC_QUOTA_OR_BILLING');
  assert.equal(asked.prerequisitesVerified, false);
});
