import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sslFor, verifiedPgConnectionString } from '../db/connection.mjs';
import {
  checkDatabaseConfiguration, classifyDbError, classifyOpenAIResponse,
  checkOpenAI, probeDatabase, checkApplication, checkAuthConfiguration,
  checkTenantIsolationConfiguration, runCodespacesDoctor,
} from './codespaces-doctor.mjs';

const owner = 'postgresql://neondb_owner:secret@ep-example.neon.tech/neondb?sslmode=require';
const runtime = 'postgresql://app_service:othersecret@ep-example-pooler.neon.tech/neondb?sslmode=require';
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
