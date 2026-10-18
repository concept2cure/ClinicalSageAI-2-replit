import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activateHistoryRuleset, planHistoryRuleset, verifyHistoryReadback, main, REPOSITORY, BRANCH, RULESET_ID } from '../activate-history-ruleset.mjs';

const captured = JSON.parse(readFileSync(new URL('../../../docs/evidence/AUDIT-REMEDIATION/2026-10-14/governance-ruleset-before.json', import.meta.url), 'utf8'));
const fixture = () => JSON.parse(JSON.stringify(captured));
const repository = { default_branch: BRANCH };
const effective = () => ['deletion', 'non_fast_forward'].map(type => ({ type, ruleset_id: RULESET_ID }));
const plan = ruleset => planHistoryRuleset({ repository, ruleset, branchRules: [] });

test('the captured existing ruleset is activated and explicitly targets the product branch, preserving guards and actors', () => {
  const before = fixture();
  const result = plan(before);
  assert.equal(result.changed, true);
  assert.deepEqual(result.payload, {
    name: 'JMSMITH', target: 'branch', enforcement: 'active',
    conditions: { ref_name: { exclude: [], include: [`refs/heads/${BRANCH}`] } },
    rules: before.rules, bypass_actors: before.bypass_actors,
  });
  assert.deepEqual(before, captured, 'planning mutated the captured policy');
  assert.equal(result.payload.rules.some(rule => ['pull_request', 'required_status_checks'].includes(rule.type)), false);
});

test('preserves an existing additional target and adds missing history guards only once', () => {
  const before = fixture(); before.conditions.ref_name.include = ['refs/heads/release']; before.rules = [{ type: 'deletion' }];
  const result = plan(before);
  assert.deepEqual(result.payload.conditions.ref_name.include, ['refs/heads/release', `refs/heads/${BRANCH}`]);
  assert.deepEqual(result.payload.rules, [{ type: 'deletion' }, { type: 'non_fast_forward' }]);
  assert.equal(plan({ ...before, ...result.payload }).changed, false);
});

test('refuses an unexpected repository, ID, target, default branch, exclusions or additional rule types without replacement', () => {
  for (const altered of [
    { ...fixture(), id: 1 }, { ...fixture(), source: 'other/repository' }, { ...fixture(), target: 'tag' },
    { ...fixture(), conditions: { ref_name: { include: [], exclude: [`refs/heads/${BRANCH}`] } } },
    { ...fixture(), rules: [...captured.rules, { type: 'required_status_checks', parameters: { required_status_checks: [] } }] },
  ]) assert.throws(() => plan(altered));
  assert.throws(() => planHistoryRuleset({ repository: { default_branch: 'main' }, ruleset: fixture() }));
  assert.throws(() => planHistoryRuleset({ repository, ruleset: fixture(), branchRules: [{ type: 'deletion', ruleset_id: 2 }] }), /overlapping/);
});

test('a dry-run never mutates or claims live enforcement', async () => {
  const calls = [];
  const api = async (method, path) => { calls.push({ method, path }); return path.endsWith('/11855901') ? fixture() : path.includes('/rules/branches/') ? [] : repository; };
  const result = await activateHistoryRuleset({ api });
  assert.equal(result.status, 'planned'); assert.equal(result.verified, false);
  assert.equal(calls.length, 3); assert.equal(calls.every(call => call.method === 'GET'), true);
});

test('apply updates only the existing ID and verifies the returned policy and effective branch rules', async () => {
  const calls = []; const saved = {}; let current = fixture(); let active = false;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'PUT') { current = { ...current, ...body }; active = true; return current; }
    if (path.endsWith('/11855901')) return current;
    if (path.includes('/rules/branches/')) return active ? effective() : [];
    return repository;
  };
  const first = await activateHistoryRuleset({ api, apply: true, save: (name, data) => { saved[name] = data; } });
  assert.equal(first.verified, true); assert.equal(first.status, 'applied-and-verified');
  const second = await activateHistoryRuleset({ api, apply: true });
  assert.equal(second.verified, true); assert.equal(second.status, 'already-active-and-verified');
  const writes = calls.filter(call => call.method !== 'GET');
  assert.equal(writes.length, 1); assert.equal(writes[0].method, 'PUT');
  assert.equal(writes[0].path, `repos/${REPOSITORY}/rulesets/${RULESET_ID}`);
  assert.ok(saved['before.json']); assert.ok(saved['payload.json']); assert.ok(saved['readback.json']); assert.ok(saved['branch-rules-readback.json']);
});

test('observed policy drift between planning and apply refuses without a PUT', async () => {
  const calls = []; let reads = 0;
  const api = async (method, path) => {
    calls.push(method);
    if (path.endsWith('/11855901')) return ++reads === 1 ? fixture() : { ...fixture(), name: 'Changed by another administrator' };
    return path.includes('/rules/branches/') ? [] : repository;
  };
  await assert.rejects(activateHistoryRuleset({ api, apply: true }), /changed since planning/);
  assert.equal(calls.every(method => method === 'GET'), true);
});

test('readback without effective guards, with the wrong ID, or with changed writable controls is never success', () => {
  const expected = plan(fixture()); const readback = { ...fixture(), ...expected.payload };
  assert.throws(() => verifyHistoryReadback(expected, readback, []), /not prove/);
  assert.throws(() => verifyHistoryReadback(expected, readback, effective().map(rule => ({ ...rule, ruleset_id: 2 }))), /not prove/);
  assert.throws(() => verifyHistoryReadback(expected, { ...readback, bypass_actors: [{ actor_id: 1, actor_type: 'Team', bypass_mode: 'always' }] }, effective()), /differs/);
});

test('offline apply is forbidden and live apply must retain evidence', async () => {
  await assert.rejects(main(['--snapshot', 'before.json', '--apply']), /cannot apply/);
  await assert.rejects(main(['--apply']), /requires --evidence-dir/);
  await assert.rejects(main(['--unknown']), /Unknown option/);
});

test('an unavailable applied-rule read refuses before mutation', async () => {
  const calls = [];
  const api = async (method, path) => {
    calls.push(method);
    if (path.includes('/rules/branches/')) throw new Error('API unavailable');
    return path.endsWith('/11855901') ? fixture() : repository;
  };
  await assert.rejects(activateHistoryRuleset({ api, apply: true }), /API unavailable/);
  assert.equal(calls.every(method => method === 'GET'), true);
});

test('an accepted PUT without effective readback never reports verified enforcement', async () => {
  const calls = []; const saved = {}; let current = fixture();
  const api = async (method, path, body) => {
    calls.push(method);
    if (method === 'PUT') { current = { ...current, ...body }; return current; }
    if (path.endsWith('/11855901')) return current;
    return path.includes('/rules/branches/') ? [] : repository;
  };
  await assert.rejects(activateHistoryRuleset({ api, apply: true, save: (name, data) => { saved[name] = data; } }), /not prove/);
  assert.equal(calls.filter(method => method === 'PUT').length, 1);
  assert.ok(saved['readback.json']);
  assert.deepEqual(saved['branch-rules-readback.json'], []);
});
