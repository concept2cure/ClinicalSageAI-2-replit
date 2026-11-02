/**
 * Executes the actual existing /dev-login handler and pure membership selector
 * with bounded, explicit database/session doubles. Does not change auth policy,
 * mock a production tenant, or claim a real browser/database test.
 *
 * node --test tests/ops/dev-login-membership.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authPath = path.join(root, 'server/routes/auth.ts');
const membershipPath = path.join(root, 'server/services/sign-in-organisation.ts');

function parse(file) {
  const s = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, s, ts.ScriptTarget.Latest, true);
  assert.equal(parsed.parseDiagnostics.length, 0);
  return parsed;
}

const membershipModule = parse(membershipPath);
const membershipFn = membershipModule.statements.find(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'signInMembership');
assert.ok(membershipFn, 'Use the existing canonical signInMembership selector');
const membershipCode = ts.transpileModule(
  membershipFn.getText(membershipModule).replace(/^export\s+/, '') + '\nmodule.exports = signInMembership;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
).outputText;
const membershipScope = { module: { exports: null } };
vm.runInNewContext(membershipCode, membershipScope, { filename: membershipPath });
const selectMembership = membershipScope.module.exports;

const authModule = parse(authPath);
const registered = authModule.statements.find(node => {
  if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
  const expression = node.expression;
  return expression.expression.getText(authModule) === 'router.post' &&
    expression.arguments[0]?.getText(authModule) === "'/dev-login'";
});
assert.ok(registered, 'The existing /dev-login route must remain mounted');
const callback = registered.expression.arguments[1];
assert.ok(callback && ts.isArrowFunction(callback));
const callbackCode = ts.transpileModule(
  'module.exports = ' + callback.getText(authModule) + ';',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
).outputText;

async function exercise(overrides = {}) {
  const state = { tokens: [], lastLogin: 0, selections: 0, lookups: [] };
  const accountTable = { kind: 'account' };
  const orgTable = { kind: 'organization' };
  const user = {
    id: 17, email: 'demo@example.test', name: 'Faux Demo',
    status: overrides.status ?? 'active',
    defaultOrganizationId: overrides.defaultOrg ?? 8,
  };
  const organization = overrides.organizationMissing ? null : {
    id: overrides.organizationId ?? 8,
    name: overrides.organizationName ?? 'Faux Biotech Therapeutics',
    uuid: 'synthetic-org-uuid',
    settings: {},
  };
  const database = {
    select() {
      let from;
      return {
        from(table) { from = table; return this; },
        where() { return this; },
        limit() {
          state.lookups.push(from.kind);
          return Promise.resolve(from === accountTable ? [user] : organization ? [organization] : []);
        },
      };
    },
    update() { return { set() { state.lastLogin += 1; return { where() { return Promise.resolve(); } }; } }; },
  };
  const delegates = {
    isDevAuthAllowed: () => overrides.allowed !== false,
    logger: { warn() {}, error() {}, info() {} },
    devAuthDenialReason: () => 'not enabled',
    requireDb: () => true,
    bindAccountByEmail: async () => 17,
    db: database,
    users: accountTable,
    organizations: orgTable,
    eq: () => ({}),
    membershipsOf: async () => { state.selections += 1; return overrides.memberships ?? [{ organizationId: 8, role: 'reviewer' }]; },
    signInMembership: selectMembership,
    isPendingVerificationStatus: status => status === 'pending_verification',
    isActiveAccountStatus: status => status === 'active',
    EMAIL_UNVERIFIED_MESSAGE: 'Verify email',
    ACCOUNT_INACTIVE_MESSAGE: 'Account inactive',
    sessionRolesOf: role => [role],
    sessionPermissions: role => ['permission:' + role],
    openSession: async () => ({ sid: 'synthetic-session' }),
    jwt: { sign(claims) { state.tokens.push(claims); return 'test-token'; } },
    config: { jwt: { secret: 'test-only' } },
    JWT_EXPIRES_IN: '24h',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    getRefreshTokenSecret: () => 'test-refresh-secret',
    sessionMfaFields: () => ({}),
    signingPostureOf: () => ({}),
  };
  const scope = vm.createContext({ ...delegates, module: { exports: null }, Date, console });
  vm.runInContext(callbackCode, scope, { filename: authPath });
  const handler = scope.module.exports;
  const res = {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await handler({ body: { email: 'demo@example.test' } }, res);
  return { status: res.statusCode, response: res.payload, ...state };
}

test('the development demo stays behind the existing opt-in policy', async () => {
  const result = await exercise({ allowed: false });
  assert.equal(result.status, 404);
  assert.equal(result.tokens.length, 0);
  assert.equal(result.selections, 0);
});

test('a valid member gets organization and role from the same record', async () => {
  const result = await exercise();
  assert.equal(result.status, 200);
  assert.equal(result.tokens[0].organizationId, '8');
  assert.equal(result.tokens[0].role, 'reviewer');
  assert.equal(result.response.user.organizationId, '8');
  assert.deepEqual([...result.response.user.roles], ['reviewer']);
});

test('an unjoined default organization does not override actual membership', async () => {
  const result = await exercise({ defaultOrg: 99 });
  assert.equal(result.status, 200);
  assert.equal(result.tokens[0].organizationId, '8');
  assert.equal(result.tokens[0].role, 'reviewer');
});

test('selecting a second membership keeps its own role', async () => {
  const result = await exercise({ defaultOrg: 9, organizationId: 9,
    memberships: [{ organizationId: 8, role: 'viewer' }, { organizationId: 9, role: 'admin' }] });
  assert.equal(result.status, 200);
  assert.equal(result.tokens[0].organizationId, '9');
  assert.equal(result.tokens[0].role, 'admin');
});

for (const [name, changes] of [
  ['no tenant membership', { memberships: [] }],
  ['inactive account', { status: 'suspended' }],
  ['unverified account', { status: 'pending_verification' }],
  ['missing tenant record', { organizationMissing: true }],
  ['blank organization name', { organizationName: '' }],
]) {
  test(`refuses ${name} before tokens or last-login writes`, async () => {
    const result = await exercise(changes);
    assert.equal(result.status, 403);
    assert.equal(result.tokens.length, 0);
    assert.equal(result.lastLogin, 0);
  });
}
