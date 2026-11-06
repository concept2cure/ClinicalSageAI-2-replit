'use strict';
/**
 * Execute the complete production job, not a copy of its implementation.
 * Database/transaction responses, acceptance verdicts, embedding, scheduler
 * lease and logging are explicit controlled collaborators. Review-disposition
 * cases marked realGate execute the unchanged production acceptance gate too.
 * This does not run PostgreSQL, prove RLS/locks or call a model.
 * Run: node --test tests/services/ana/memory-consolidation-outcomes.test.cjs
 * C2C_CONSOLIDATION_SOURCE_ROOT selects a baseline checkout for the same tests.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function typescript() {
  if (process.env.C2C_TS_PATH) return require(process.env.C2C_TS_PATH);
  try { return require('typescript'); } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'typescript'));
  }
}
const ts = typescript();
const root = process.env.C2C_CONSOLIDATION_SOURCE_ROOT || path.resolve(__dirname, '../../..');
const sourcePath = path.join(root, 'server/services/memory-consolidation-job.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: sourcePath, reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
});
assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
// Exercise the actual gate and its caller together, not only injected verdicts.
const gatePath = path.join(root, 'server/services/ana-ri/memory-acceptance.ts');
const gateCompiled = ts.transpileModule(fs.readFileSync(gatePath, 'utf8'), {
  fileName: gatePath, reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.deepEqual((gateCompiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const gateModule = { exports: {} };
new Function('require', 'module', 'exports', gateCompiled.outputText)(id => {
  assert.equal(id, 'node:crypto', 'unexpected production gate dependency');
  return require(id);
}, gateModule, gateModule.exports);
const PRIVATE = 'SYNTHETIC_PRIVATE_RECORD_ALPHA';
const err = () => Object.assign(new Error(`SQL/provider payload ${PRIVATE}`), { detail: PRIVATE });
const memory = (id = 1, overrides = {}) => ({
  id, conversation_id: null, thread_id: `thread_${id}`, organization_id: 7,
  structured_data: null, summary: `Synthetic memory ${id}: retain the source reference before writing.`,
  generated_at: new Date('2026-10-01T00:00:00Z'), project_id: 42, project_profile_id: 9, ...overrides,
});
const counters = r => Object.fromEntries(['threadsProcessed', 'memoriesConsolidated', 'skipped', 'rejectedByGate', 'quarantined', 'errors'].map(k => [k, r[k]]));
const expected = (overrides = {}) => ({ threadsProcessed: 0, memoriesConsolidated: 0, skipped: 0, rejectedByGate: 0, quarantined: 0, errors: 0, ...overrides });
function harness(rows = [memory()], options = {}) {
  const state = { scopes: [], queries: [], logs: [], stored: [], embedCalls: [], gateCalls: [], gateVerdicts: [], leased: [], callbacks: [], visit: 0 };
  const failures = options.failures || {};
  const fail = (id, phase) => {
    if ((failures[id] || []).includes(phase)) throw (options.throwValue === undefined ? err() : options.throwValue);
  };
  const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (...args) => state.logs.push({ level, args })]));
  const collaborators = {
    'node-cron': { validate: () => true, schedule: (expression, callback) => state.callbacks.push({ expression, callback }) },
    '../db.js': { pool: { tag: 'embedding-pool' } },
    '../utils/logger.js': { createScopedLogger: () => logger },
    '../db/scheduledOnce': { runScheduledOnce: async (name, run) => {
      state.leased.push(name);
      if (options.leaseError) throw err();
      if (options.heldElsewhere) return { ran: false, reason: 'held_elsewhere' };
      return { ran: true, value: await run() };
    } },
    '../db/withTenantConnection': { withTenantConnection: async (scope, run) => {
      state.scopes.push({ ...scope });
      if (scope.caller.endsWith(':findStaleMemories')) {
        state.visit = 0;
        if (options.scanScopeError) throw err();
        return run({ query: async (sql, params) => {
          state.queries.push({ id: null, sql, params });
          if (options.scanError) throw err();
          return { rows, rowCount: rows.length };
        } });
      }
      const row = rows[state.visit++];
      assert.ok(row, 'unexpected tenant visit');
      assert.equal(scope.tenantId, row.organization_id);
      assert.equal(scope.role, undefined, 'scan role must not be reused for row writes');
      fail(row.id, 'scope-open');
      let staged = null;
      const result = await run({ query: async (sql, params = []) => {
        state.queries.push({ id: row.id, sql, params });
        if (sql.startsWith('SELECT id, content, category')) {
          fail(row.id, 'comparison');
          assert.deepEqual(params, [row.project_id, row.organization_id, 50]);
          const existing = options.existing || [];
          return { rows: existing, rowCount: existing.length };
        }
        if (sql === 'BEGIN') { fail(row.id, 'begin'); return { rows: [] }; }
        if (sql.startsWith('SELECT pg_advisory_xact_lock')) { fail(row.id, 'lock'); return { rows: [] }; }
        if (sql.startsWith('SELECT 1 FROM project_memory_entries')) {
          fail(row.id, 'dedupe');
          assert.deepEqual(params, [row.organization_id, row.project_id, `[cwm_${row.id}]`]);
          const exists = (options.already || []).includes(row.id) || state.stored.some(x => x.id === row.id);
          return { rows: exists ? [{ exists: 1 }] : [] };
        }
        if (sql.startsWith('INSERT INTO project_memory_entries')) {
          fail(row.id, 'insert');
          const cols = sql.match(/project_memory_entries \((.+), created_at\)/)[1].split(', ');
          staged = { id: row.id, values: Object.fromEntries(cols.map((k, i) => [k, params[i]])) };
          assert.equal(staged.values.organization_id, row.organization_id);
          assert.equal(staged.values.project_id, row.project_id);
          return { rows: [], rowCount: 1 };
        }
        if (sql === 'COMMIT') {
          fail(row.id, 'commit-before');
          if (staged) { state.stored.push(staged); staged = null; }
          fail(row.id, 'commit-after');
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') { fail(row.id, 'rollback'); staged = null; return { rows: [] }; }
        throw new Error(`Unexpected SQL in controlled collaborator: ${sql}`);
      } });
      fail(row.id, 'scope-close');
      return result;
    } },
    './ana-ri/memory-acceptance.js': { evaluateMemoryCandidate: input => {
      const row = rows[state.visit - 1];
      fail(row.id, 'gate');
      state.gateCalls.push(input);
      if (options.realGate) {
        const verdict = gateModule.exports.evaluateMemoryCandidate(input);
        state.gateVerdicts.push(verdict);
        return verdict;
      }
      if (options.gateResult) return options.gateResult;
      const decision = (options.verdicts || {})[row.id] || 'accepted';
      return {
        acceptance_status: decision === 'contradiction' ? 'pending_review' : decision,
        confidence_score: decision === 'pending_review' ? 0.55 : 0.8,
        contradiction_check_result: { has_contradiction: decision === 'contradiction' },
        human_review_required: decision === 'contradiction' || decision === 'pending_review',
        decision_reason: 'Synthetic acceptance fixture; not an evidence assessment',
      };
    } },
    './enhancedEmbeddingService.js': { getEmbeddingService: () => ({ embed: async (content, model) => {
      const row = rows[state.visit - 1];
      state.embedCalls.push({ content, model });
      fail(row.id, 'embed');
      return { embedding: [0.25, 0.5, 0.75] };
    } }) },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(id => {
    assert.ok(Object.hasOwn(collaborators, id), `Uncontrolled import ${id}`);
    return collaborators[id];
  }, loaded, loaded.exports);
  return { ...loaded.exports, state, failures };
}
function noPayload(h) {
  for (const log of h.state.logs) for (const arg of log.args) {
    assert.equal(typeof arg, 'string', 'do not log raw exception objects');
    assert.ok(!arg.includes(PRIVATE), 'do not log exception payload text');
  }
}
function balanced(result) {
  assert.equal(result.threadsProcessed, result.memoriesConsolidated + result.quarantined + result.rejectedByGate + result.skipped + result.errors);
}

test('successful promotion retains tenant, stored content, embedding and commit-before-count', async () => {
  const h = harness(); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, memoriesConsolidated: 1 }));
  assert.equal(h.state.stored[0].values.content, memory().summary);
  assert.equal(h.state.stored[0].values.embedding, '[0.25,0.5,0.75]');
  assert.equal(h.state.scopes[0].role, 'app_super_admin');
  assert.deepEqual(h.state.queries[0].params, [50]);
  assert.ok(r.startedAt instanceof Date && r.completedAt >= r.startedAt); balanced(r);
});
test('empty scan is not a failure and opens no row scope', async () => {
  const h = harness([]); assert.deepEqual(counters(await h.runConsolidation()), expected());
  assert.equal(h.state.scopes.length, 1);
});
for (const [label, overrides] of [['empty content', { summary: '   ' }], ['missing profile', { project_profile_id: null }]]) {
  test(`${label} remains a legitimate skip`, async () => {
    const h = harness([memory(1, overrides)]); const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 1, skipped: 1 }));
    assert.equal(h.state.stored.length, 0); assert.equal(h.state.embedCalls.length, 0); balanced(r);
  });
}
test('concurrently existing summary remains skipped, without another insert', async () => {
  const h = harness([memory()], { already: [1] }); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, skipped: 1 }));
  assert.equal(h.state.stored.length, 0); assert.ok(h.state.queries.some(q => q.sql === 'COMMIT')); balanced(r);
});
test('gate rejection remains distinct and prevents embedding and transaction writes', async () => {
  const h = harness([memory()], { verdicts: { 1: 'rejected' } }); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, rejectedByGate: 1 }));
  assert.equal(h.state.embedCalls.length, 0); assert.ok(!h.state.queries.some(q => q.sql === 'BEGIN')); balanced(r);
});
test('contradiction remains a stored quarantine rather than a successful promotion', async () => {
  const h = harness([memory()], { verdicts: { 1: 'contradiction' } }); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, quarantined: 1 }));
  assert.equal(h.state.stored[0].values.status, 'pending_review'); balanced(r);
});
test('noncontradiction pending-review disposition survives storage without confidence inflation', async () => {
  const h = harness([memory()], { verdicts: { 1: 'pending_review' } }); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, quarantined: 1 }));
  assert.equal(h.state.stored[0].values.status, 'pending_review');
  assert.equal(h.state.stored[0].values.confidence_score, 0.55); balanced(r);
});
test('best-effort embedding failure retains durable unembedded content without provider payload logging', async () => {
  const h = harness([memory()], { failures: { 1: ['embed'] } }); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, memoriesConsolidated: 1 }));
  assert.equal(h.state.stored[0].values.embedding, undefined);
  assert.ok(h.state.logs.some(x => x.level === 'warn' && x.args[0].includes('without embedding'))); noPayload(h);
});
for (const phase of ['comparison', 'gate', 'begin', 'lock', 'dedupe', 'insert', 'commit-before', 'scope-open', 'scope-close']) {
  test(`${phase} failure counts once as error and does not suppress the following tenant`, async () => {
    const h = harness([memory(1), memory(2, { organization_id: 8, project_id: 52 })], { failures: { 1: [phase] } });
    const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 2, memoriesConsolidated: 1, errors: 1 }));
    assert.ok(h.state.stored.some(x => x.id === 2 && x.values.organization_id === 8));
    assert.equal(h.state.scopes.filter(x => x.caller.endsWith(':consolidateMemory')).length, 2);
    assert.equal(h.state.logs.filter(x => x.level === 'error').length, 1);
    if (phase === 'scope-close') assert.ok(h.state.stored.some(x => x.id === 1), 'post-commit scope failure is unconfirmed, not proof of rollback');
    else assert.ok(!h.state.stored.some(x => x.id === 1));
    balanced(r); noPayload(h);
  });
}
for (const [label, overrides] of [['malformed JSON', { structured_data: `{${PRIVATE}` }], ['invalid generation date', { generated_at: 'invalid-date' }]]) {
  test(`${label} is an error, not a skip, and later work continues`, async () => {
    const h = harness([memory(1, overrides), memory(2)]); const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 2, memoriesConsolidated: 1, errors: 1 }));
    assert.deepEqual(h.state.stored.map(x => x.id), [2]); balanced(r); noPayload(h);
  });
}
test('rollback failure does not erase the original failed attempt or abort later rows', async () => {
  const h = harness([memory(1), memory(2)], { failures: { 1: ['insert', 'rollback'] } }); const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 2, memoriesConsolidated: 1, errors: 1 }));
  assert.ok(h.state.queries.some(q => q.id === 1 && q.sql === 'ROLLBACK')); balanced(r); noPayload(h);
});
test('mixed batch has separate success, quarantine, rejection, skip and failure counts', async () => {
  const rows = [memory(1), memory(2), memory(3), memory(4, { project_profile_id: null }), memory(5), memory(6, { organization_id: 8 }), memory(7)];
  const h = harness(rows, { failures: { 5: ['insert'], 6: ['scope-open'] }, verdicts: { 2: 'rejected', 3: 'contradiction' } });
  const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 7, memoriesConsolidated: 2, quarantined: 1, rejectedByGate: 1, skipped: 1, errors: 2 }));
  assert.deepEqual(h.state.stored.map(x => x.id), [1, 3, 7]); balanced(r);
});
test('multiple scope failures are counted per attempted row, not one abort for the batch', async () => {
  const h = harness([memory(1), memory(2), memory(3)], { failures: { 1: ['scope-open'], 2: ['scope-open'] } });
  const r = await h.runConsolidation();
  assert.deepEqual(counters(r), expected({ threadsProcessed: 3, memoriesConsolidated: 1, errors: 2 })); balanced(r);
});
for (const option of ['scanError', 'scanScopeError']) {
  test(`${option} is one batch failure with no invented row outcomes or raw details`, async () => {
    const h = harness([memory()], { [option]: true });
    assert.deepEqual(counters(await h.runConsolidation()), expected({ errors: 1 }));
    assert.equal(h.state.stored.length, 0); noPayload(h);
  });
}
test('a scheduled lease held elsewhere remains a no-work result', async () => {
  const h = harness([memory()], { heldElsewhere: true });
  assert.deepEqual(await h.runScheduledConsolidation(), { ran: false, reason: 'held_elsewhere' });
  assert.equal(h.state.scopes.length, 0); assert.deepEqual(h.state.leased, ['memory-consolidation']);
});
test('scheduled execution returns its actual partial-failure counts to the caller', async () => {
  const h = harness([memory(1), memory(2)], { failures: { 1: ['insert'] } }); const r = await h.runScheduledConsolidation();
  assert.equal(r.ran, true); assert.deepEqual(counters(r.value), expected({ threadsProcessed: 2, memoriesConsolidated: 1, errors: 1 }));
});
test('scheduler lease error remains explicitly unavailable and omits raw exception payloads', async () => {
  const h = harness([memory()], { leaseError: true });
  assert.deepEqual(await h.runScheduledConsolidation(), { ran: false, reason: 'error' });
  assert.equal(h.state.scopes.length, 0); noPayload(h);
});
test('a non-Error thrown payload is counted without logging its contents', async () => {
  const h = harness([memory(1), memory(2)], { failures: { 1: ['comparison'] }, throwValue: { detail: PRIVATE } });
  const r = await h.runConsolidation(); assert.equal(r.errors, 1); assert.equal(r.skipped, 0); assert.equal(r.memoriesConsolidated, 1); noPayload(h);
});
test('failed save is retryable and does not fabricate a completed marker', async () => {
  const failures = { 1: ['insert'] }; const h = harness([memory()], { failures });
  const first = await h.runConsolidation(); assert.equal(first.errors, 1); assert.equal(h.state.stored.length, 0);
  failures[1] = [];
  const second = await h.runConsolidation(); assert.equal(second.errors, 0); assert.equal(second.memoriesConsolidated, 1);
  const third = await h.runConsolidation(); assert.equal(third.skipped, 1); assert.equal(h.state.stored.length, 1);
});
test('lost COMMIT acknowledgement is unconfirmed; retry still respects the existing duplicate guard', async () => {
  const failures = { 1: ['commit-after'] }; const h = harness([memory()], { failures });
  const first = await h.runConsolidation(); assert.equal(first.errors, 1); assert.equal(first.memoriesConsolidated, 0);
  assert.equal(h.state.stored.length, 1, 'controlled server committed before acknowledgement failed');
  failures[1] = [];
  const second = await h.runConsolidation(); assert.equal(second.skipped, 1); assert.equal(second.errors, 0);
  assert.equal(h.state.stored.length, 1); noPayload(h);
});
test('cron initialization remains single-registration with the existing cadence', () => {
  const h = harness([]); h.initMemoryConsolidationScheduler(); h.initMemoryConsolidationScheduler();
  assert.equal(h.state.callbacks.length, 1); assert.equal(h.state.callbacks[0].expression, '0 2 * * *');
});

// The first group uses BOTH real production modules, with only I/O controlled.
for (const [label, overrides] of [
  ['plain conversation', {}],
  ['structured conversation', { structured_data: { objective: 'Retain the source record for review', lockedFacts: ['Source table remains preliminary'] } }],
  ['all six fields with KNOWN labels', { structured_data: {
    objective: 'Retain [KNOWN] source identity for review', lockedFacts: ['Source version three'],
    decisions: ['Request independent review'], openQuestions: ['Check the source'],
    nextActions: ['Reconcile the reference'], createdArtifacts: ['Draft only'],
  } }],
  ['matching negative assessments', { summary: 'The package is incomplete; retain the outstanding source list.' }],
]) {
  test(`real gate: ${label} remains pending without a contradiction`, async () => {
    const row = memory(1, overrides);
    const existing = label === 'matching negative assessments'
      ? [{ id: 8, category: 'insight', content: 'The package is incomplete and requires more work.' }] : [];
    const h = harness([row], { realGate: true, existing }); const r = await h.runConsolidation();
    const v = h.state.gateVerdicts[0];
    assert.equal(v.acceptance_status, 'pending_review');
    assert.equal(v.human_review_required, true);
    assert.equal(v.contradiction_check_result.has_contradiction, false);
    assert.deepEqual(counters(r), expected({ threadsProcessed: 1, quarantined: 1 }));
    const stored = h.state.stored[0].values;
    assert.equal(stored.status, 'pending_review');
    assert.equal(stored.confidence_score, v.confidence_score);
    assert.equal(stored.content, v.content);
    assert.equal(stored.embedding, '[0.25,0.5,0.75]');
    assert.equal(stored.is_verified_by_user, undefined, 'no invented human verification');
    assert.equal(h.state.gateCalls[0].provenance.evidence_validated, false); balanced(r);
  });
}
test('real gate: a genuine contradiction remains quarantined', async () => {
  const h = harness([memory(1, { summary: 'The source is insufficient to support the planned claim.' })], {
    realGate: true, existing: [{ id: 8, category: 'insight', content: 'The source is sufficient to support the planned claim.' }],
  });
  const r = await h.runConsolidation();
  assert.equal(h.state.gateVerdicts[0].contradiction_check_result.has_contradiction, true);
  assert.deepEqual(counters(r), expected({ threadsProcessed: 1, quarantined: 1 }));
  assert.equal(h.state.stored[0].values.status, 'pending_review');
});
for (const [label, summary, existing] of [
  ['short', 'OK', []],
  ['inferred only', '[INFERRED] A preliminary conclusion with no checked source.', []],
  ['duplicate', memory().summary, [{ id: 8, category: 'conversation_summary', content: memory().summary }]],
]) {
  test(`real gate: ${label} is rejected without embedding or storage`, async () => {
    const h = harness([memory(1, { summary })], { realGate: true, existing });
    const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 1, rejectedByGate: 1 }));
    assert.equal(h.state.embedCalls.length, 0); assert.equal(h.state.stored.length, 0);
  });
}
for (const phase of ['embed', 'insert', 'commit-after']) {
  test(`real gate: pending review is not lost during ${phase} failure`, async () => {
    const failures = { 1: [phase] };
    const h = harness([memory()], { realGate: true, failures }); const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 1, ...(phase === 'embed' ? { quarantined: 1 } : { errors: 1 }) }));
    if (phase !== 'insert') assert.equal(h.state.stored[0].values.status, 'pending_review');
    if (phase === 'embed') assert.equal(h.state.stored[0].values.embedding, undefined);
    if (phase === 'commit-after') {
      failures[1] = [];
      assert.equal((await h.runConsolidation()).skipped, 1);
      assert.equal(h.state.stored.length, 1);
    }
    noPayload(h);
  });
}
test('real gate: scheduled mixed-tenant batch retains both scopes and pending outcomes', async () => {
  const h = harness([memory(1), memory(2, { organization_id: 8, project_id: 52 })], { realGate: true });
  const r = await h.runScheduledConsolidation();
  assert.equal(r.ran, true);
  assert.deepEqual(counters(r.value), expected({ threadsProcessed: 2, quarantined: 2 }));
  assert.deepEqual(h.state.stored.map(x => [x.values.organization_id, x.values.project_id, x.values.status]),
    [[7, 42, 'pending_review'], [8, 52, 'pending_review']]);
});

// Controlled verdict combinations test the caller's admission boundary.
const acceptedVerdict = () => ({ acceptance_status: 'accepted', human_review_required: false,
  contradiction_check_result: { has_contradiction: false }, confidence_score: 0.8, decision_reason: 'Test verdict' });
for (const [label, overrides] of [
  ['accepted with human review', { human_review_required: true }],
  ['accepted with a contradiction', { contradiction_check_result: { has_contradiction: true } }],
  ['pending with contradictory false flags', { acceptance_status: 'pending_review' }],
  ['accepted without a review flag', { human_review_required: undefined }],
  ['accepted without a contradiction flag', { contradiction_check_result: {} }],
]) {
  test(`controlled verdict: ${label} cannot become active`, async () => {
    const h = harness([memory()], { gateResult: { ...acceptedVerdict(), ...overrides } });
    const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 1, quarantined: 1 }));
    assert.equal(h.state.stored[0].values.status, 'pending_review');
  });
}
for (const disposition of ['unknown', '', undefined]) {
  test(`controlled verdict: unavailable disposition ${String(disposition)} is a failure, not active memory`, async () => {
    const h = harness([memory()], { gateResult: { ...acceptedVerdict(), acceptance_status: disposition } });
    const r = await h.runConsolidation();
    assert.deepEqual(counters(r), expected({ threadsProcessed: 1, errors: 1 }));
    assert.equal(h.state.embedCalls.length, 0); assert.equal(h.state.stored.length, 0);
  });
}

const completeMemory = {
  objective: 'Prepare the CSR from the frozen study evidence',
  lockedFacts: ['[KNOWN] Study source version three'],
  decisions: ['Retain the approved analysis population'],
  openQuestions: ['Which safety output needs reconciliation?'],
  nextActions: ['Reconcile table 14.3.1', 'Ask the reviewer to check the narrative'],
  createdArtifacts: ['CSR draft document 91', 'Frozen study snapshot 7'],
  exclusions: ['Do not include the exploratory subgroup claim', 'Defer the extension study'],
};
const completeContent = [
  'Objective: Prepare the CSR from the frozen study evidence',
  'Key facts: [KNOWN] Study source version three',
  'Decisions: Retain the approved analysis population',
  'Open questions: Which safety output needs reconciliation?',
  'Next actions: Reconcile table 14.3.1; Ask the reviewer to check the narrative',
  'Artifacts: CSR draft document 91; Frozen study snapshot 7',
  'Deferred/excluded: Do not include the exploratory subgroup claim; Defer the extension study',
].join('\n');

for (const [label, structured] of [
  ['JSON object', completeMemory],
  ['serialized JSON', JSON.stringify(completeMemory)],
]) {
  test(`continuity: ${label} carries all seven fields through the real gate, embedding and storage`, async () => {
    const row = memory(1, { structured_data: structured });
    const original = JSON.stringify(row.structured_data);
    const h = harness([row], { realGate: true });
    assert.deepEqual(counters(await h.runConsolidation()), expected({ threadsProcessed: 1, quarantined: 1 }));
    assert.equal(h.state.gateCalls[0].content, completeContent);
    assert.equal(h.state.embedCalls[0].content, completeContent);
    assert.equal(h.state.stored[0].values.content, completeContent);
    assert.equal(h.state.stored[0].values.status, 'pending_review');
    assert.equal(JSON.stringify(row.structured_data), original);
    const withoutExclusions = harness([memory(1, { structured_data: { ...completeMemory, exclusions: [] } })], { realGate: true });
    await withoutExclusions.runConsolidation();
    assert.equal(h.state.gateVerdicts[0].confidence_score, withoutExclusions.state.gateVerdicts[0].confidence_score,
      'recording an exclusion does not raise confidence or validate evidence');
  });
}

test('continuity: exclusions-only structured data preserves the raw summary fallback', async () => {
  const summary = 'Reconcile the frozen study tables before finalizing the report.';
  const h = harness([memory(1, { summary, structured_data: {
    exclusions: ['Do not draft the unsupported subgroup conclusion'],
  } })], { realGate: true });
  await h.runConsolidation();
  const content = `${summary}\nDeferred/excluded: Do not draft the unsupported subgroup conclusion`;
  assert.equal(h.state.stored[0].values.content, content);
  assert.equal(h.state.embedCalls[0].content, content);
  assert.equal(h.state.stored[0].values.status, 'pending_review');
});

test('continuity: a substantive exclusion is not skipped when the raw summary is empty', async () => {
  const h = harness([memory(1, { summary: '', structured_data: {
    exclusions: ['Defer the extension study until source evidence is available'],
  } })], { realGate: true });
  assert.deepEqual(counters(await h.runConsolidation()), expected({ threadsProcessed: 1, quarantined: 1 }));
  assert.equal(h.state.stored[0].values.content,
    'Deferred/excluded: Defer the extension study until source evidence is available');
});

test('continuity: different exclusions do not become duplicate summaries at admission', async () => {
  const previous = harness([memory(1, { structured_data: completeMemory })], { realGate: true });
  await previous.runConsolidation();
  const next = harness([memory(2, { structured_data: {
    ...completeMemory, exclusions: ['Defer the pharmacokinetic appendix until the data arrive'],
  } })], { realGate: true, existing: [{
    id: 8, category: 'conversation_summary', content: previous.state.stored[0].values.content,
  }] });
  assert.deepEqual(counters(await next.runConsolidation()), expected({ threadsProcessed: 1, quarantined: 1 }));
  assert.ok(next.state.stored[0].values.content.includes('Defer the pharmacokinetic appendix'));
});

test('continuity: an exact duplicate including exclusions is still rejected', async () => {
  const h = harness([memory(1, { structured_data: completeMemory })], { realGate: true,
    existing: [{ id: 8, category: 'conversation_summary', content: completeContent }] });
  assert.deepEqual(counters(await h.runConsolidation()), expected({ threadsProcessed: 1, rejectedByGate: 1 }));
  assert.equal(h.state.embedCalls.length, 0);
  assert.equal(h.state.stored.length, 0);
});

test('continuity: a KNOWN label inside an exclusion cannot validate an inferred-only summary', async () => {
  const h = harness([memory(1, {
    summary: '[INFERRED] A preliminary conclusion with no checked source.',
    structured_data: { exclusions: ['Do not describe the exploratory claim as [KNOWN]'] },
  })], { realGate: true });
  assert.deepEqual(counters(await h.runConsolidation()), expected({ threadsProcessed: 1, rejectedByGate: 1 }));
  assert.equal(h.state.stored.length, 0);
  assert.equal(h.state.embedCalls.length, 0);
});

for (const [style, marker] of [
  ['compact', '[KNOWN]'], ['compact', '[INFERRED]'], ['compact', '[MISSING]'], ['public', '[KNOWN]'],
]) {
  test(`continuity: a ${style} exclusions-only summary gives ${marker} no quality credit or penalty`, async () => {
    const exclusion = `Do not describe the exploratory subgroup claim as ${marker}`;
    const structured = {
      objective: '', lockedFacts: [], decisions: [], openQuestions: [], nextActions: [], createdArtifacts: [],
      exclusions: [exclusion], factCheck: 'answer-check/2',
    };
    const summary = style === 'compact'
      ? `**Deferred/Excluded**: ${exclusion}`
      : `**Objective**: \n\n**Deferred/Excluded**:\n- ${exclusion}`;
    const row = memory(1, { summary, structured_data: structured });
    const original = JSON.stringify(row);
    const h = harness([row], { realGate: true });
    await h.runConsolidation();
    // Delivering the same exclusions through the stored summary must not
    // alter the quality signals compared with the structured-only record.
    const structuredOnly = harness([memory(1, { summary: '', structured_data: structured })], { realGate: true });
    await structuredOnly.runConsolidation();
    assert.deepEqual(h.state.gateCalls[0].qualitySignals, structuredOnly.state.gateCalls[0].qualitySignals);
    assert.equal(h.state.gateVerdicts[0].confidence_score, structuredOnly.state.gateVerdicts[0].confidence_score);
    const content = `${summary}\nDeferred/excluded: ${exclusion}`;
    assert.equal(h.state.stored[0].values.content, content);
    assert.equal(h.state.embedCalls[0].content, content);
    assert.equal(h.state.stored[0].values.status, 'pending_review');
    assert.equal(JSON.stringify(row), original);
  });
}

test('continuity: fallback quality retains genuine raw facts outside the rendered exclusions', async () => {
  const fact = '[KNOWN] Study source version three remains the recorded reference.';
  const exclusion = '[INFERRED] Do not rely on the exploratory subgroup claim.';
  const summary = `${fact}\n**Deferred/Excluded**: ${exclusion}`;
  const h = harness([memory(1, { summary, structured_data: { exclusions: [exclusion] } })], { realGate: true });
  await h.runConsolidation();
  const rawOnly = harness([memory(1, { summary: fact })], { realGate: true });
  await rawOnly.runConsolidation();
  assert.deepEqual(h.state.gateCalls[0].qualitySignals, rawOnly.state.gateCalls[0].qualitySignals);
  assert.equal(h.state.gateVerdicts[0].confidence_score, rawOnly.state.gateVerdicts[0].confidence_score);
  assert.equal(h.state.stored[0].values.content, `${summary}\nDeferred/excluded: ${exclusion}`);
});

test('continuity: overlapping exclusions cannot leave a quality label behind or mutate the source', async () => {
  const exclusions = ['Exploratory subgroup claim', '[KNOWN] Exploratory subgroup claim'];
  const h = harness([memory(1, {
    summary: `**Deferred/Excluded**: ${exclusions.join('; ')}`,
    structured_data: { exclusions },
  })], { realGate: true });
  await h.runConsolidation();
  assert.equal(h.state.gateCalls[0].qualitySignals.hasKnownLabels, false);
  assert.equal(h.state.stored[0].values.status, 'pending_review');
  assert.deepEqual(exclusions, ['Exploratory subgroup claim', '[KNOWN] Exploratory subgroup claim']);
});

test('continuity: masking exclusion text cannot join fragments into quality labels', async () => {
  const exclusion = 'Excluded intervening text';
  const summary = `[KNO${exclusion}WN] [INFER${exclusion}RED] [MISS${exclusion}ING] are not evidence labels.`;
  const h = harness([memory(1, { summary, structured_data: { exclusions: [exclusion] } })], { realGate: true });
  await h.runConsolidation();
  const quality = h.state.gateCalls[0].qualitySignals;
  assert.equal(quality.hasKnownLabels, false);
  assert.equal(quality.hasInferredLabels, false);
  assert.equal(quality.hasMissingLabels, false);
  assert.equal(h.state.stored[0].values.content, `${summary}\nDeferred/excluded: ${exclusion}`);
});

for (const structured of [null, {}]) {
  test(`continuity: a legacy ${JSON.stringify(structured)} structure keeps raw fallback quality and content`, async () => {
    const summary = '[KNOWN] The original checked source remains recorded.';
    const h = harness([memory(1, { summary, structured_data: structured })], { realGate: true });
    await h.runConsolidation();
    assert.equal(h.state.gateCalls[0].qualitySignals.hasKnownLabels, true);
    assert.equal(h.state.stored[0].values.content, summary);
    assert.equal(h.state.embedCalls[0].content, summary);
    assert.equal(h.state.stored[0].values.status, 'pending_review');
  });
}

for (const exclusions of [undefined, [], null]) {
  test(`continuity: absent or empty exclusions (${JSON.stringify(exclusions)}) preserve the legacy content`, async () => {
    const h = harness([memory(1, { structured_data: { exclusions } })], { realGate: true });
    await h.runConsolidation();
    assert.equal(h.state.stored[0].values.content, memory().summary);
    assert.equal(h.state.stored[0].values.status, 'pending_review');
  });
}
