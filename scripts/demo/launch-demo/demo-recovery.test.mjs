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
  await write('state.mjs', 'export const state = { clients: [], requests: [], loginCalls: [], downstream: [], created: [] };\n');
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
      /* The canonical intake needs the product class stated — an IND alone
         cannot determine it. The pack now seeds TWO programmes, a biologic and
         a small molecule, so the fixture accepts both words and still refuses
         a create that states neither. */
      if (!['biologic', 'drug'].includes(body.productType)) {
        return { status: 400, text: 'State whether this IND is for a drug or a biologic.' };
      }
      const id = body.productType === 'drug' ? 'demo-program-sm' : 'demo-program';
      state.created.push({ id, productType: body.productType, name: body.name });
      return { status: 201, json: { data: { id, title: body.name }, meta: { submissionId: 12 } } };
    }
    if (url === '/api/c2c/projects/demo-program') return ok({ data: { id: 'demo-program', name: '[Demo · Biotech] C2C-101', client_workspace_id: 7 } });
    if (url === '/api/c2c/projects/demo-program-sm') return ok({ data: { id: 'demo-program-sm', name: '[Demo · Biotech] C2C-201', client_workspace_id: 7 } });
    /* The Module 3 build the pack runs on the small-molecule programme. */
    if (url.startsWith('/api/cmc/module3-os/compile/') && method === 'POST') {
      state.downstream.push('ensureModule3Build');
      return { status: 200, json: { success: true, data: { sections: [] } } };
    }
    if (url.startsWith('/api/cmc/module3-os/sections/')) return ok({ data: [] });
    if (url === '/api/c2c/project-vault/demo-program') return ok({ data: { documentCount: 0 } });
    // P-122: with no second signer the pack looks for its synthetic reviewer (lib.mjs ensureSyntheticReviewer).
    if (method === 'GET' && /^\/api\/tenant-users\/\d+$/.test(url)) return ok([{ id: 9, email: 'demo-reviewer@example.test' }]);
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
    await write(`scripts/demo/launch-demo/packs/biotech-${file}.mjs`, `import { state } from '../../../../state.mjs'; export async function ${fn}() {
      state.downstream.push('${fn}');
      ${fn === 'ensureProtocol' ? "return { id: 'synthetic-protocol-id' };" : ''}
    }\n`);
  }
  // The production biotech pack now uses the EXISTING work-areas helpers
  // (tasks, study design, CMC, plan). Supply those module exports in this
  // isolated fixture; otherwise every test fails while importing the pack
  // rather than testing its actual identity, scoping and seed behavior.
  await write('scripts/demo/launch-demo/packs/biotech-work-content.mjs', `
export const BIOTECH_CMC = { specs: [], stability: [], batches: [] };
export const BIOTECH_SM = { molecule: 'C2C-201', programName: 'C2C-201', productName: 'C2C-201', indication: 'Fictional test indication' };
export const BIOTECH_SM_CMC = { specs: [], stability: [], batches: [] };
export const BIOTECH_STUDY_DESIGN = {};
export const BIOTECH_ADAPTIVE_PLAN = { title: 'stub', designType: 'group_sequential', adaptations: [], interimLooks: [], stoppingRules: [], snapshots: [] };
export const BIOTECH_TASKS = [];
export const BIOTECH_IR_LETTER = {};
`);
  await write('scripts/demo/launch-demo/packs/work-areas.mjs', `
import { state } from '../../../../state.mjs';
export async function ensureStudyDesign() { state.downstream.push('ensureStudyDesign'); }
export async function ensureAdaptivePlan() { state.downstream.push('ensureAdaptivePlan'); }
export async function ensureDesignTasks() { state.downstream.push('ensureDesignTasks'); }
export async function ensureCmc() { state.downstream.push('ensureCmc'); }
export async function ensureTasks() { state.downstream.push('ensureTasks'); }
export async function ensurePlanDocuments() { state.downstream.push('ensurePlanDocuments'); }
export async function ensureAgencyLetter() { state.downstream.push('ensureAgencyLetter'); }
`);
  await write('scripts/demo/launch-demo/packs/biotech-content.mjs', `
export const INDICATION = 'Fictional test indication', MOLECULE = 'C2C-101', PRODUCT_NAME = 'C2C-101', PROGRAM_NAME = 'C2C-101';
export const PROVENANCE = { fictional: true }, SOPS = [], CHANGE = {}, VAULT_DOCS = [];
export const C2C101_IDENTITY = { applicationNumber: '999101', sponsor: { name: 'Fictional test sponsor' } };
export const T = name => '[Demo · Biotech] ' + name;
export const findDemoByTitle = (rows, name) => rows.find(row => row.title === T(name));
export const inDays = () => '2027-04-30';
`);
  await write('scripts/demo/launch-demo/packs/biotech-shared.mjs', `
import { state } from '../../../../state.mjs';
export const NOT_EXECUTED_NO_SIGNER = 'not executed — signer credential not supplied';
export async function ensureApplicantIdentity() { state.downstream.push('ensureApplicantIdentity'); }
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

/* The pack seeds TWO programmes: C2C-101 (the biologic) and C2C-201 (the small
   molecule, whose Module 3 composes — J5-13). Both must be found rather than
   re-created. */
const EXISTING_DEMO_PROJECTS = [
  { id: 'demo-program', title: '[Demo · Biotech] C2C-101' },
  { id: 'demo-program-sm', title: '[Demo · Biotech] C2C-201' },
];

test('existing demo projects are reused without a second create', async t => {
  const { lib, pack, state } = await fixture(t);
  state.portfolio = { data: EXISTING_DEMO_PROJECTS, meta: { hasMore: false } };
  await pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } });
  assert.ok(!state.requests.some(r => r.method === 'POST' && r.url === '/api/c2c/projects'));
});

test('the Module 3 build runs after the registers it compiles from', async t => {
  /* `POST /module3-os/compile/:projectId` refuses a project with no canonical
     sources with a 409 ("No canonical source objects for this project —
     nothing to compile"), so a build before the registers would fail the step
     on every real run. The fixture records each helper as it runs, so the order
     is asserted rather than assumed. */
  const { lib, pack, state } = await fixture(t);
  await pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } });
  const build = state.downstream.indexOf('ensureModule3Build');
  assert.ok(build >= 0, 'the pack did not compile Module 3 for the small-molecule programme');
  assert.ok(state.downstream.lastIndexOf('ensureCmc') < build,
    `the build ran before the registers: ${state.downstream.join(' → ')}`);
});

test('a pack whose second programme is missing creates only that one', async t => {
  /* The case above says "nothing is created twice"; this one says the find is
     per programme, not a single flag — with C2C-101 present and C2C-201 absent,
     exactly one create happens and it is the small molecule's. */
  const { lib, pack, state } = await fixture(t);
  state.portfolio = { data: [EXISTING_DEMO_PROJECTS[0]], meta: { hasMore: false } };
  await pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } });
  assert.deepEqual(state.created.map(c => c.productType), ['drug']);
  assert.match(state.created[0].name, /C2C-201/);
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
      return ok({ data: EXISTING_DEMO_PROJECTS, meta: { hasMore: false } });
    }
    return originalApi(method, url, body);
  };
  await pack.seed({ api: (...args) => state.api(...args), run: lib.makeRun('biotech'),
    baseUrl: connectOptions.baseUrl, identity: { email: 'demo@example.test', userId: '17', organizationId: '42' } });
  assert.ok(state.requests.some(r => r.url.includes('offset=1')));
  /* No project is CREATED. The pack does post elsewhere — it compiles the
     small-molecule programme's Module 3 — so the assertion names the create
     rather than every POST, which is what this case is about. */
  assert.ok(!state.requests.some(r => r.method === 'POST' && r.url === '/api/c2c/projects'));
  assert.deepEqual(state.created, []);
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

// 2026-11-10: with a second sponsor in the organisation (the Lumen pack's), C2C-201 was created with no client
// named, the intake refused it (409 AMBIGUOUS_CLIENT_WORKSPACE) and the biotech pack stopped: no demo programme's
// Module 3 composed. C2C-201 is created under C2C-101's own client workspace.
{
  const { sameSponsor } = await import('./packs/biotech.mjs');
  test('biotech: C2C-201 is created under C2C-101\'s client workspace when the run named none', () => {
    const ctx = { api: () => undefined, clientWorkspaceId: undefined };
    assert.equal(sameSponsor(ctx, { clientWorkspaceId: 2 }).clientWorkspaceId, 2);
    assert.equal(sameSponsor(ctx, { clientWorkspaceId: 2 }).api, ctx.api);
  });
  test('biotech: a run that named a workspace keeps it, and a C2C-101 with none sends none', () => {
    assert.equal(sameSponsor({ clientWorkspaceId: 9 }, { clientWorkspaceId: 2 }).clientWorkspaceId, 9);
    assert.equal(sameSponsor({ clientWorkspaceId: undefined }, { clientWorkspaceId: null }).clientWorkspaceId, undefined);
  });
}
