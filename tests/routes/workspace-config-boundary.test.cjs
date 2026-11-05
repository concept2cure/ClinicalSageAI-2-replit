/** Execute the complete route and canonical profile/tenant helpers.
 * Explicit substitutes: Express registration, auth middleware, workspace/map
 * computation and license enrichment. No HTTP, JWT, DB or live app claim.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require(process.env.C2C_TS_PATH || 'typescript');
const root = path.resolve(process.env.C2C_WORKSPACE_ROUTE_SOURCE_ROOT || path.join(__dirname, '../..'));

function compile(file, dependencies = {}) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, JSON.stringify(errors.map(d => d.messageText)));
  const module = { exports: {} };
  const localRequire = id => {
    if (!Object.hasOwn(dependencies, id)) throw new Error(`Unexpected import ${id} in ${file}`);
    return dependencies[id];
  };
  new Function('require', 'module', 'exports', result.outputText)(localRequire, module, module.exports);
  return module.exports;
}
const tenant = compile('server/utils/authedOrgId.ts');
const regions = compile('shared/regulatory/region-profiles.ts');
const clients = compile('shared/regulatory/client-type-profiles.ts');

function load(options = {}) {
  const calls = { enrich: [], map: [], catalog: 0, fallback: 0 };
  const handlers = new Map();
  const middleware = [];
  const auth = (_req, _res, next) => next();
  const router = { use: fn => middleware.push(fn), get: (p, fn) => handlers.set(p, fn) };
  compile('server/routes/workspace-config.routes.ts', {
    express: { Router: () => router }, '../auth': { authMiddleware: auth },
    '../utils/authedOrgId': tenant,
    '../../shared/regulatory/region-profiles': regions,
    '../../shared/regulatory/client-type-profiles': clients,
    '../../shared/regulatory/workspace-config': {
      buildSelectionCatalog: () => { calls.catalog++; if (options.catalogError) throw options.catalogError; return [{ id: 'test-catalog' }]; },
      resolveWorkspaceConfig: need => { calls.fallback++; return { known: true, need, substituted: true }; },
    },
    '../../shared/regulatory/project-map': {
      resolveProjectMap: input => { calls.map.push(input); if (options.mapError) throw options.mapError; return { kind: 'map', input }; },
    },
    '../services/regulatory/workspace-config-enrichment': {
      enrichWorkspaceConfig: input => {
        calls.enrich.push(input);
        if (options.enrich) return options.enrich(input);
        if (options.enrichError) throw options.enrichError;
        return Promise.resolve({ kind: 'config', input });
      },
    },
  });
  return {
    calls, handlers, middleware, auth,
    async invoke(p, query = {}, request = {}) {
      const req = { user: { organizationId: 7, industryMode: 'pharma' }, query, ...request };
      const res = { statusCode: 200, body: undefined, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
      await handlers.get(p)(req, res);
      return res;
    },
  };
}
const invocations = h => h.calls.enrich.length + h.calls.map.length + h.calls.catalog + h.calls.fallback;
const badSelectors = [
  ['missing need', {}],
  ['repeated need', { need: ['SOP', 'CSR'] }],
  ['empty need', { need: '' }],
  ['repeated region', { need: 'NDA', region: ['JP', 'CA'] }],
  ['empty region', { need: 'NDA', region: '  ' }],
  ['nested region', { need: 'NDA', region: { country: 'JP' } }],
  ['unknown region', { need: 'NDA', region: 'ZZ' }],
  ['repeated client', { need: 'NDA', clientType: ['cro', 'pharma'] }],
  ['empty client', { need: 'NDA', clientType: ' ' }],
  ['null client', { need: 'NDA', clientType: null }],
  ['unknown client', { need: 'NDA', clientType: 'fintech' }],
  ['inherited profile property', { need: 'NDA', clientType: '__proto__' }],
  ['unsupported project selector', { need: 'NDA', projectId: '21' }],
  ['tenant query override', { need: 'NDA', organizationId: '999' }],
  ['license query override', { need: 'NDA', tier: 'enterprise' }],
];

test('retains the same three GET routes and auth middleware', () => {
  const h = load();
  assert.deepEqual([...h.handlers.keys()], ['/selection-catalog', '/config', '/project-map']);
  assert.deepEqual(h.middleware, [h.auth]);
});

for (const endpoint of ['/config', '/project-map']) {
  for (const [label, query] of badSelectors) {
    test(`${endpoint}: refuses ${label} before reading context`, async () => {
      const h = load(); const res = await h.invoke(endpoint, query);
      assert.equal(res.statusCode, 400); assert.equal(res.body.data, undefined);
      assert.equal(invocations(h), 0);
    });
  }
  for (const [need, region, clientType] of [
    ['NDA', 'US', 'pharma'], ['US_510K', 'EU', 'medtech'], ['EU_IVDR', 'JP', 'cro'],
    ['CSR', 'CA', 'medical_writing'], ['SOP', 'AU', 'biotech'],
  ]) {
    test(`${endpoint}: preserves ${need}/${region}/${clientType} without choosing another context`, async () => {
      const h = load(); const result = await h.invoke(endpoint, { need, region, clientType });
      assert.equal(result.statusCode, 200);
      const input = result.body.data.input;
      assert.equal(input.need, need); assert.equal(input.region, region); assert.equal(input.clientType, clientType);
      if (endpoint === '/config') assert.equal(input.organizationId, 7);
      assert.equal(h.calls.fallback, 0);
    });
  }
  test(`${endpoint}: omitted overlays retain authenticated industry and leave region defaulting to the existing service`, async () => {
    const h = load(); const r = await h.invoke(endpoint, { need: 'NDA' });
    assert.equal(r.statusCode, 200); assert.equal(r.body.data.input.clientType, 'pharma');
    assert.equal(r.body.data.input.region, undefined);
  });
  test(`${endpoint}: preserves authenticated tenant-context industry fallback`, async () => {
    const h = load(); const r = await h.invoke(endpoint, { need: 'CSR' }, {
      user: { organizationId: 7 }, tenantContext: { industryMode: 'cro' },
    });
    assert.equal(r.statusCode, 200); assert.equal(r.body.data.input.clientType, 'cro');
  });
  test(`${endpoint}: retains explicit normalized strings and the existing case-insensitive client lookup`, async () => {
    const h = load(); const r = await h.invoke(endpoint, { need: ' SOP ', region: ' AU ', clientType: ' CRO ' });
    assert.equal(r.statusCode, 200); assert.equal(r.body.data.input.need, 'SOP');
    assert.equal(r.body.data.input.region, 'AU'); assert.equal(r.body.data.input.clientType, 'CRO');
  });
  test(`${endpoint}: leaves an unknown document need to the existing honest fallback`, async () => {
    const h = load(); const r = await h.invoke(endpoint, { need: 'CUSTOM_DOCUMENT' });
    assert.equal(r.statusCode, 200); assert.equal(r.body.data.input.need, 'CUSTOM_DOCUMENT');
  });
  test(`${endpoint}: does not reinterpret an unknown stored industry as an explicit user selection`, async () => {
    const h = load(); const r = await h.invoke(endpoint, { need: 'SOP' }, { user: { organizationId: 7, industryMode: 'legacy_value' } });
    assert.equal(r.statusCode, 200); assert.equal(r.body.data.input.clientType, 'legacy_value');
  });
}

for (const endpoint of ['/config', '/project-map', '/selection-catalog']) {
  for (const id of [undefined, 0, -1, 0.5]) {
    test(`${endpoint}: tenant ${String(id)} cannot read a workspace projection`, async () => {
      const h = load(); const r = await h.invoke(endpoint, { need: 'SOP' }, { user: { organizationId: id } });
      assert.equal(r.statusCode, 403); assert.equal(invocations(h), 0); assert.equal(r.body.data, undefined);
    });
  }
}
for (const [endpoint, fault, code] of [
  ['/config', 'enrichError', 'WORKSPACE_CONFIG_UNAVAILABLE'],
  ['/project-map', 'mapError', 'WORKSPACE_PROJECT_MAP_UNAVAILABLE'],
  ['/selection-catalog', 'catalogError', 'WORKSPACE_CATALOG_UNAVAILABLE'],
]) {
  test(`${endpoint}: source failure is unavailable, not a successful substitute or raw exception`, async () => {
    const h = load({ [fault]: new Error('postgresql://private:secret@host/db patient SYN-001') });
    const r = await h.invoke(endpoint, { need: 'CSR', region: 'CA', clientType: 'cro' });
    assert.equal(r.statusCode, 503); assert.equal(r.body.code, code);
    assert.equal(r.body.data, undefined); assert.equal(h.calls.fallback, 0);
    assert.doesNotMatch(JSON.stringify(r.body), /private|secret|SYN-001|host\/db/);
  });
}
test('/config: asynchronous rejection also refuses a fabricated success', async () => {
  const h = load({ enrich: async () => { throw new Error('private model response'); } });
  const r = await h.invoke('/config', { need: 'SOP', region: 'JP', clientType: 'cro' });
  assert.equal(r.statusCode, 503); assert.equal(h.calls.fallback, 0); assert.equal(r.body.data, undefined);
});
test('/config: a missing license assessment stays missing, not a new grant or hard failure', async () => {
  const value = { kind: 'config', clientType: { industry: 'cro' } };
  const h = load({ enrich: async () => value });
  const r = await h.invoke('/config', { need: 'SOP', clientType: 'cro' });
  assert.equal(r.statusCode, 200); assert.equal(r.body.data, value);
  assert.equal(r.body.data.clientType.entitlement, undefined);
});
test('/config: body and headers cannot choose the license tenant', async () => {
  const h = load(); const r = await h.invoke('/config', { need: 'SOP' }, {
    body: { organizationId: 999 }, headers: { 'x-organization-id': '999' },
  });
  assert.equal(r.statusCode, 200); assert.equal(r.body.data.input.organizationId, 7);
});
test('/config: overlapping organizations retain their settings when one enrichment fails', async () => {
  let rejectA;
  const pending = new Promise((_resolve, reject) => { rejectA = reject; });
  const h = load({ enrich: input => input.organizationId === 7 ? pending : Promise.resolve({ input }) });
  const a = h.invoke('/config', { need: 'SOP', region: 'AU', clientType: 'cro' });
  const b = await h.invoke('/config', { need: 'NDA', region: 'US', clientType: 'pharma' }, { user: { organizationId: 8 } });
  rejectA(new Error('lost connection'));
  const first = await a;
  assert.equal(first.statusCode, 503); assert.equal(first.body.data, undefined);
  assert.equal(b.statusCode, 200); assert.equal(b.body.data.input.organizationId, 8);
  assert.equal(b.body.data.input.region, 'US'); assert.equal(b.body.data.input.clientType, 'pharma');
  assert.equal(h.calls.fallback, 0);
});
