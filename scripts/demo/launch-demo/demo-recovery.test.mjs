/** Unit regressions for the existing demo connector, seed CLI and biotech pack.
 * Real module bytes, imported normally; only HTTP and downstream pack services
 * are test doubles. No database, browser or deployment qualification is implied. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceRoot = process.env.C2C_DEMO_TEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const session = (changes = {}) => ({ authenticated: true, user: {
  id: '17', email: 'demo@example.test', organizationId: '42', organizationName: 'Fictional demo organization', ...changes,
} });
const ok = json => ({ status: 200, json, text: JSON.stringify(json) });

async function fixture(t) {
  const environment = Object.fromEntries(['OQ_SIGNER_EMAIL', 'OQ_SIGNER_PASSWORD', 'DEMO_SEED_EMAIL'].map(key => [key, process.env[key]]));
  for (const key of Object.keys(environment)) delete process.env[key];
  t.after(() => { for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'c2c-demo-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function write(rel, text) {
    const name = path.join(root, rel);
    await fs.mkdir(path.dirname(name), { recursive: true });
    await fs.writeFile(name, text);
  }
  for (const file of ['lib.mjs', 'seed.mjs', 'packs/biotech.mjs']) {
    await write(`scripts/demo/launch-demo/${file}`, await fs.readFile(path.join(sourceRoot, 'scripts/demo/launch-demo', file)));
  }
  await write('state.mjs', 'export const state = { clients: [], requests: [], loginCalls: [], downstream: [] };\n');
  const { state } = await import(pathToFileURL(path.join(root, 'state.mjs')));
  state.body = session();
  state.portfolio = { data: [], meta: { hasMore: false, pendingStore: false } };
  state.board = { data: [], meta: { partial: false, unreadSources: [] } };
  state.api = async (method, url, body) => {
    state.requests.push({ method, url, body });
    if (url === '/api/auth/session') return ok(state.body);
    if (url === '/api/auth/me') return ok(state.body?.user ?? {});
    if (url.startsWith('/api/c2c/projects?')) return ok(state.portfolio);
    if (url === '/api/task-management/board') return ok(state.board);
    if (url === '/api/audit-trail/ledger?limit=500') return ok({ data: [], meta: { chain: { ok: true } } });
    if (url === '/api/c2c/projects' && method === 'POST') {
      if (body.productType !== 'biologic') return { status: 400, text: 'State whether this IND is for a drug or a biologic.' };
      return { status: 201, json: { data: { id: 'demo-program', title: body.name }, meta: { submissionId: 12 } } };
    }
    if (url === '/api/c2c/projects/demo-program') return ok({ data: { id: 'demo-program', name: '[Demo · Biotech] C2C-101', client_workspace_id: 7 } });
    if (url === '/api/c2c/project-vault/demo-program') return ok({ data: { documentCount: 0 } });
    throw new Error(`Unexpected test request: ${method} ${url}`);
  };
  state.login = async (base, email) => {
    state.loginCalls.push({ base, email });
    return { accessToken: 'test-only-bearer', user: state.body.user };
  };
  await write('tests/validation/lib/harness.mjs', `import { state } from '../../../state.mjs';
export function createApiClient(options) { state.clients.push(options); return (...args) => state.api(...args); }
export const devLogin = (...args) => state.login(...args);
`);
  await write('tests/validation/lib/fixtures.mjs', `import { createHash } from 'node:crypto';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const makePdfBuffer = () => { throw new Error('PDF generation is not part of this unit test'); };
`);
  for (const [file, fn] of [['authoring', 'ensureAuthoring'], ['protocol', 'ensureProtocol'], ['qms', 'ensureQms'], ['submission', 'ensureSubmission']]) {
    await write(`scripts/demo/launch-demo/packs/biotech-${file}.mjs`, `import { state } from '../../../../state.mjs'; export async function ${fn}() { state.downstream.push('${fn}'); }\n`);
  }
  await write('scripts/demo/launch-demo/packs/biotech-content.mjs', `
export const INDICATION = 'Fictional test indication', MOLECULE = 'C2C-101', PRODUCT_NAME = 'C2C-101', PROGRAM_NAME = 'C2C-101';
export const PROVENANCE = { fictional: true }, SOPS = [], CHANGE = {}, VAULT_DOCS = [];
export const T = name => '[Demo · Biotech] ' + name;
export const findDemoByTitle = (rows, name) => rows.find(row => row.title === T(name));
export const inDays = () => '2027-04-30';
`);
  await write('scripts/demo/launch-demo/packs/biotech-shared.mjs', `
export const NOT_EXECUTED_NO_SIGNER = 'not executed — signer credential not supplied';
export const asArray = (body, key) => body[key] ?? [];
export function makeTally() { const tally = { created: {}, found: {} }; return { tally,
created(key) { tally.created[key] = (tally.created[key] ?? 0) + 1; },
found(key) { tally.found[key] = (tally.found[key] ?? 0) + 1; } }; }
`);
  const lib = await import(pathToFileURL(path.join(root, 'scripts/demo/launch-demo/lib.mjs')));
  const pack = await import(pathToFileURL(path.join(root, 'scripts/demo/launch-demo/packs/biotech.mjs')));
  return { root, state, lib, pack };
}

const connectOptions = { baseUrl: 'https://demo.example.test', token: 'test-only-bearer', email: 'demo@example.test' };

test('seed identity comes from the verified session and exercises protected project and task reads', async t => {
  const { lib, state } = await fixture(t);
  const ctx = await lib.connect({ ...connectOptions, expectedOrganizationId: '42', clientWorkspaceId: '7' });
  assert.equal(String(ctx.identity.organizationId), '42');
  assert.equal(ctx.clientWorkspaceId, 7);
  assert.deepEqual(state.requests.map(r => r.url), ['/api/auth/session', '/api/c2c/projects?limit=1', '/api/task-management/board']);
  assert.ok(state.requests.every(r => r.method === 'GET'));
});

for (const [label, body] of [
  ['unauthenticated envelope', { ...session(), authenticated: false }],
  ['missing user', { authenticated: true }],
  ['missing organization', session({ organizationId: undefined })],
  ['default organization is not a session', session({ organizationId: undefined, defaultOrganizationId: '42' })],
  ['zero organization', session({ organizationId: 0 })],
  ['fractional organization', session({ organizationId: 42.5 })],
  ['truncated organization', session({ organizationId: '42abc' })],
  ['missing actor', session({ id: undefined })],
  ['missing email', session({ email: undefined })],
  ['missing organization record', session({ organizationName: null })],
]) {
  test(`refuses ${label} before any protected read or seed write`, async t => {
    const { lib, state } = await fixture(t);
    state.body = body;
    await assert.rejects(lib.connect(connectOptions));
    assert.equal(state.requests.length, 1);
  });
}

test('refuses a different session organization than the operator requested', async t => {
  const { lib, state } = await fixture(t);
  await assert.rejects(lib.connect({ ...connectOptions, expectedOrganizationId: 99 }), /organization/i);
  assert.equal(state.requests.length, 1);
});

test('a token must not silently override the explicitly named demo account', async t => {
  const { lib, state } = await fixture(t);
  state.body = session({ email: 'someone-else@example.test' });
  await assert.rejects(lib.connect(connectOptions), /account|email/i);
  assert.equal(state.requests.length, 1);
});

test('email comparison ignores surrounding whitespace and case', async t => {
  const { lib } = await fixture(t);
  const ctx = await lib.connect({ ...connectOptions, email: ' Demo@Example.Test ' });
  assert.equal(ctx.identity.email, 'demo@example.test');
});

for (const [label, portfolio] of [
  ['unprovisioned projects', { data: [], meta: { pendingStore: true } }],
  ['malformed projects', { data: {} }],
  ['unreconciled project access', { data: [], meta: { reconciliationRequired: true } }],
]) {
  test(`refuses ${label}, rather than treating it as an empty demo tenant`, async t => {
    const { lib, state } = await fixture(t);
    state.portfolio = portfolio;
    await assert.rejects(lib.connect(connectOptions), /project/i);
    assert.ok(state.requests.every(r => r.method === 'GET'));
  });
}

for (const [label, board] of [
  ['partial board', { data: [], meta: { partial: true, unreadSources: [] } }],
  ['unread task source', { data: [], meta: { partial: false, unreadSources: ['unified_tasks'] } }],
  ['malformed board', { data: {} }],
]) {
  test(`refuses ${label}, rather than accepting a broken Tasking backend`, async t => {
    const { lib, state } = await fixture(t);
    state.board = board;
    await assert.rejects(lib.connect(connectOptions), /task/i);
  });
}

test('session read failures do not expose response bodies or bearer material', async t => {
  const { lib, state } = await fixture(t);
  state.api = async () => ({ status: 503, text: 'secret-response-token' });
  await assert.rejects(lib.connect(connectOptions), error => /503/.test(error.message) && !/secret-response-token/.test(error.message));
});

test('invalid workspace selection is refused before authentication or HTTP', async t => {
  const { lib, state } = await fixture(t);
  await assert.rejects(lib.connect({ ...connectOptions, clientWorkspaceId: '7garbage' }), /workspace/i);
  assert.equal(state.requests.length, 0);
  assert.equal(state.loginCalls.length, 0);
});

test('the fresh biotech pack supplies its recorded biologic class and explicit workspace', async t => {
  const { lib, pack, state } = await fixture(t);
  const run = lib.makeRun('biotech');
  await pack.seed({ api: (...args) => state.api(...args), run, baseUrl: connectOptions.baseUrl,
    identity: { email: 'demo@example.test', userId: '17', organizationId: '42' }, clientWorkspaceId: 7 });
  const create = state.requests.find(r => r.method === 'POST' && r.url === '/api/c2c/projects');
  assert.equal(create.body.productType, 'biologic');
  assert.equal(create.body.programType, 'ind');
  assert.equal(create.body.clientWorkspaceId, 7);
  assert.match(create.body.name, /^\[Demo · Biotech\]/);
  assert.ok(!Object.hasOwn(create.body, 'organizationId'));
});

test('the biotech pack refuses an unread project list without attempting creation', async t => {
  const { lib, pack, state } = await fixture(t);
  state.portfolio = { data: [], meta: { pendingStore: true } };
  await assert.rejects(pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } }), /project/i);
  assert.ok(!state.requests.some(r => r.method === 'POST'));
});

test('an existing demo project is reused without a second create', async t => {
  const { lib, pack, state } = await fixture(t);
  state.portfolio = { data: [{ id: 'demo-program', title: '[Demo · Biotech] C2C-101' }], meta: { hasMore: false } };
  await pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } });
  assert.ok(!state.requests.some(r => r.method === 'POST' && r.url === '/api/c2c/projects'));
});

test('CLI refuses a mixed valid/invalid pack list before connecting', async t => {
  const { root } = await fixture(t);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/demo/launch-demo/seed.mjs'), '--pack', 'biotech,typo'], {
    encoding: 'utf8', env: { ...process.env, DEMO_SEED_EMAIL: '', DEMO_SEED_TOKEN: '', OQ_SIGNER_EMAIL: '', OQ_SIGNER_PASSWORD: '' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pack/);
});


test('an existing demo on a later portfolio page is reused, not duplicated', async t => {
  const { lib, pack, state } = await fixture(t);
  const originalApi = state.api;
  state.api = async (method, url, body) => {
    if (url === '/api/c2c/projects?limit=200') {
      state.requests.push({ method, url, body });
      return ok({ data: [{ id: 'other-program', title: 'Other' }], meta: { hasMore: true } });
    }
    if (url === '/api/c2c/projects?limit=200&offset=1') {
      state.requests.push({ method, url, body });
      return ok({ data: [{ id: 'demo-program', title: '[Demo · Biotech] C2C-101' }], meta: { hasMore: false } });
    }
    return originalApi(method, url, body);
  };
  await pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } });
  assert.ok(state.requests.some(r => r.url.includes('offset=1')));
  assert.ok(!state.requests.some(r => r.method === 'POST'));
});

test('a stalled paginated project read cannot create a duplicate', async t => {
  const { lib, pack, state } = await fixture(t);
  state.portfolio = { data: [], meta: { hasMore: true } };
  await assert.rejects(pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } }), /lookup/);
  assert.ok(!state.requests.some(r => r.method === 'POST'));
});

test('an explicit workspace does not silently reuse a project in another workspace', async t => {
  const { lib, pack, state } = await fixture(t);
  state.portfolio = { data: [{ id: 'demo-program', title: '[Demo · Biotech] C2C-101' }], meta: { hasMore: false } };
  await assert.rejects(pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'), clientWorkspaceId: 99,
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } }), /workspace/);
  assert.ok(!state.requests.some(r => r.method === 'POST'));
});

test('a failed run manifest cannot masquerade as a seeded or browser-qualified demo', async t => {
  const { lib } = await fixture(t);
  const run = lib.makeRun('biotech');
  run.record('target', { organizationId: '42', baseUrl: connectOptions.baseUrl });
  const name = run.write('failed');
  const manifest = JSON.parse(await fs.readFile(name, 'utf8'));
  assert.equal(manifest.outcome, 'failed');
  assert.equal(manifest.browserQualification, 'not_executed');
  assert.equal(manifest.records.target.organizationId, '42');
});

test('successful seeding still does not assert browser qualification', async t => {
  const { lib } = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(lib.makeRun('biotech').write('seeded_unqualified'), 'utf8'));
  assert.equal(manifest.outcome, 'seeded_unqualified');
  assert.equal(manifest.browserQualification, 'not_executed');
});

test('an environment-named demo email must match even when a token is supplied', async t => {
  const { lib } = await fixture(t);
  process.env.DEMO_SEED_EMAIL = 'another@example.test';
  await assert.rejects(lib.connect({ baseUrl: connectOptions.baseUrl, token: 'test-only-bearer' }), /account|email/i);
});

for (const args of [
  ['--pack', 'biotech,biotech'],
  ['--pack', 'biotech', '--base-url'],
  ['--pack', 'all', '--client-workspace-id', '7'],
]) {
  test(`CLI refuses unsupported or incomplete arguments: ${args.join(' ')}`, async t => {
    const { root } = await fixture(t);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/demo/launch-demo/seed.mjs'), ...args], {
      encoding: 'utf8', env: { ...process.env, DEMO_SEED_EMAIL: '', DEMO_SEED_TOKEN: '' },
    });
    assert.equal(result.status, 2);
  });
}
