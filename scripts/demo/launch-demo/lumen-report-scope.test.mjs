/** Deterministic API doubles for the existing Lumen report seed; no network or model calls. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLumenReports, ensureLumenReportPack } from './packs/lumen.mjs';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PROJECT = '411';
const TYPES = ['readiness.executive_digest', 'ha.commitment_register', 'usa_fda.ind_safety_readiness', 'etmf.completeness_pack', 'compliance.audit_assurance_pack'];
const NAME = '[Demo · Lumen] LMN-201 monthly governance pack';
const ok = (json, status = 200) => ({ status, json, text: '' });
const runOf = (type, i, scopeId = PROJECT) => ({ id: i + 100, reportTypeId: type, scopeType: 'project', scopeId,
  status: type === TYPES[4] ? 'partial' : 'completed' });
const ownRuns = () => TYPES.map((type, i) => runOf(type, i));
const packOf = (runs, id = 'bundle-exact') => ({ bundleId: id, name: NAME, projectIds: [Number(PROJECT)],
  runIds: runs.map(run => run.id), items: runs.map(run => ({ ...run, runId: run.id })) });

function reportList(state, options, query) {
  if (options.readFailure) return ok({}, 503);
  if (options.unreadReport) return ok({ data: {} });
  const rows = state.runs.filter(run => (!query.has('scopeId') || run.scopeId === query.get('scopeId'))
    && (!query.has('scopeType') || run.scopeType === query.get('scopeType'))
    && (!query.has('reportTypeId') || run.reportTypeId === query.get('reportTypeId')));
  const data = options.foreignReceipt ? [runOf(TYPES[0], 999, '922')] : rows.slice(0, Number(query.get('limit') ?? 100));
  return ok({ data, meta: { total: data.length ? rows.length : 0, limit: Number(query.get('limit') ?? 100), offset: 0, hasMore: rows.length > data.length } });
}

function fixture(options = {}) {
  const state = { calls: [], notes: [], records: {}, runs: [...Array.from({ length: 150 }, (_, i) => runOf(TYPES[i % TYPES.length], i + 1000, '922')),
    ...(options.missing ? [] : ownRuns())], bundles: options.bundles ?? [], schedules: options.schedules ?? [] };
  const api = async (method, url, body) => {
    state.calls.push({ method, url, body });
    const u = new URL(url, 'http://synthetic.test');
    const route = `${method} ${u.pathname}`;
    if (route === `GET /api/c2c/projects/${PROGRAM}/team`) return ok(options.team === undefined ? { project_id: Number(PROJECT) } : options.team);
    if (route === 'GET /api/report-os/runs') {
      return reportList(state, options, u.searchParams);
    }
    if (route === 'POST /api/report-os/runs') {
      const row = { ...runOf(body.reportTypeId, state.runs.length), ...options.createdOverride };
      state.runs.push(row);
      return ok({ data: { run: row } }, 201);
    }
    if (route === 'GET /api/report-os/bundles') return ok({ data: options.unreadBundle ? {} : state.bundles,
      ...(options.truncatedBundle ? { meta: { truncated: true } } : {}) });
    if (route === 'POST /api/report-os/bundles') {
      const selected = body.runIds.map(id => state.runs.find(run => run.id === id));
      const pack = { ...packOf(selected, `bundle-${state.bundles.length}`), ...options.bundleOverride };
      state.bundles.push(pack);
      return ok({ data: pack }, 201);
    }
    if (route === 'GET /api/insights/subscriptions') return ok({ data: options.unreadSchedules ? null : state.schedules });
    if (route === 'POST /api/insights/subscriptions') {
      if (options.scheduleRefused) return { status: 403, json: {}, text: 'Scheduled reports are unavailable on this plan.' };
      const row = { id: state.schedules.length + 1, ...body };
      state.schedules.push(row);
      return ok({ data: row }, 201);
    }
    throw new Error(`Unexpected synthetic API ${method} ${url}`);
  };
  const ctx = { api, identity: { organizationId: 42 }, tally: { found() {}, created() {} },
    run: { step: async (_title, fn) => fn(), note: text => state.notes.push(text), record: (key, value) => { state.records[key] = value; } } };
  return { ctx, state };
}
const writes = state => state.calls.filter(call => call.method !== 'GET');
const posts = (state, url) => writes(state).filter(call => call.url === url);
async function seedReporting(f) {
  const selected = await ensureLumenReports(f.ctx, { id: PROGRAM });
  await ensureLumenReportPack(f.ctx, selected);
  return selected;
}

test('reuses exact LMN-201 reports beyond the organization first 100 and includes truthful partial Quality', async () => {
  const f = fixture();
  await seedReporting(f);
  const reads = f.state.calls.filter(call => call.url.startsWith('/api/report-os/runs?'));
  assert.equal(reads.length, 5);
  for (const call of reads) {
    const query = new URL(call.url, 'http://synthetic.test').searchParams;
    assert.equal(query.get('scopeType'), 'project'); assert.equal(query.get('scopeId'), PROJECT); assert.equal(query.get('limit'), '1');
  }
  assert.equal(posts(f.state, '/api/report-os/runs').length, 0);
  assert.deepEqual(posts(f.state, '/api/report-os/bundles')[0].body.runIds, ownRuns().map(run => run.id));
  assert.match(JSON.stringify(f.state.records), /compliance.audit_assurance_pack/);
  assert.match(JSON.stringify(f.state.records), /partial/);
});

test('creates missing reports with both canonical program and numeric scope, then passes those runs directly', async () => {
  const f = fixture({ missing: true }); await seedReporting(f);
  const created = posts(f.state, '/api/report-os/runs'); assert.equal(created.length, 5);
  for (const call of created) { assert.equal(call.body.programId, PROGRAM); assert.equal(call.body.scopeId, PROJECT); }
  assert.equal(posts(f.state, '/api/report-os/bundles')[0].body.runIds.length, 5);
});

for (const project_id of [null, 0, '411', -1, 1.5]) {
  test(`refuses invalid canonical numeric anchor ${String(project_id)} before writes`, async () => {
    const f = fixture({ team: { project_id } });
    await assert.rejects(seedReporting(f), /project|anchor|scope/i); assert.equal(writes(f.state).length, 0);
  });
}
for (const options of [{ unreadReport: true }, { readFailure: true }, { foreignReceipt: true }]) {
  test(`an unread or foreign exact report response is not treated as an empty result: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(seedReporting(f)); assert.equal(writes(f.state).length, 0);
  });
}
for (const createdOverride of [{ scopeId: '922' }, { scopeType: 'account' }, { reportTypeId: 'other' }, { id: 0 }, { status: 'failed' }]) {
  test(`refuses a created report outside the expected settled receipt: ${JSON.stringify(createdOverride)}`, async () => {
    const f = fixture({ missing: true, createdOverride }); await assert.rejects(seedReporting(f));
    assert.equal(posts(f.state, '/api/report-os/bundles').length, 0);
    assert.equal(posts(f.state, '/api/insights/subscriptions').length, 0);
  });
}

test('retains a wrong historical bundle, creates one exact snapshot, then reruns without new writes', async () => {
  const wrong = packOf(TYPES.map((type, i) => runOf(type, i + 1000, '922')), 'old-wrong');
  const f = fixture({ bundles: [wrong] }); await seedReporting(f);
  assert.equal(f.state.bundles[0], wrong);
  assert.equal(posts(f.state, '/api/report-os/bundles').length, 1);
  const before = writes(f.state).length; await seedReporting(f);
  assert.equal(writes(f.state).length, before);
  assert.ok(f.state.notes.some(note => /retained|historical/i.test(note)));
});

test('an older four-report bundle does not suppress the current five-report pack', async () => {
  const f = fixture({ bundles: [packOf(ownRuns().slice(0, 4), 'old-four')] }); await seedReporting(f);
  assert.equal(posts(f.state, '/api/report-os/bundles').length, 1);
  assert.equal(f.state.bundles[0].runIds.length, 4);
});

for (const options of [{ unreadBundle: true }, { truncatedBundle: true }, { unreadSchedules: true }]) {
  test(`refuses unread or incomplete bundle/schedule registers: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(seedReporting(f));
    assert.equal(posts(f.state, '/api/insights/subscriptions').length, 0);
  });
}

test('refuses a returned bundle with unexpected members before scheduling', async () => {
  const f = fixture({ bundleOverride: { runIds: [999] } }); await assert.rejects(seedReporting(f));
  assert.equal(posts(f.state, '/api/insights/subscriptions').length, 0);
});

test('leaves foreign schedules intact and creates only platform schedules for the selected project', async () => {
  const foreign = { id: 901, reportTypeId: TYPES[0], scopeType: 'project', scopeId: '922', channel: 'platform', format: 'in_app' };
  const f = fixture({ schedules: [foreign] }); await seedReporting(f);
  assert.equal(f.state.schedules[0], foreign);
  const scheduled = posts(f.state, '/api/insights/subscriptions'); assert.equal(scheduled.length, 2);
  for (const call of scheduled) { assert.equal(call.body.scopeId, PROJECT); assert.equal(call.body.channel, 'platform'); assert.equal(call.body.format, 'in_app'); }
  assert.ok(writes(f.state).every(call => call.method === 'POST'));
});

test('an entitlement refusal stays explicitly not executed without inventing a schedule', async () => {
  const f = fixture({ scheduleRefused: true }); await seedReporting(f);
  assert.equal(f.state.schedules.length, 0); assert.ok(f.state.notes.some(note => /refused.*403/.test(note)));
});

test('retains an explicitly disabled LMN-201 schedule instead of recreating active work', async () => {
  const disabled = { id: 81, reportTypeId: TYPES[0], scopeType: 'project', scopeId: PROJECT, channel: 'platform', format: 'in_app', enabled: false };
  const f = fixture({ schedules: [disabled] }); await seedReporting(f);
  assert.equal(f.state.schedules[0], disabled);
  assert.equal(posts(f.state, '/api/insights/subscriptions').length, 1);
  assert.ok(f.state.notes.some(note => /disabled.*retained/i.test(note)));
});

test('reuses exact selected membership while preserving additional legitimate source-project provenance', async () => {
  const exact = { ...packOf(ownRuns()), projectIds: [Number(PROJECT), 922] };
  const f = fixture({ bundles: [exact] }); await seedReporting(f);
  assert.equal(posts(f.state, '/api/report-os/bundles').length, 0);
  assert.deepEqual(f.state.bundles[0].projectIds, [411, 922]);
});
