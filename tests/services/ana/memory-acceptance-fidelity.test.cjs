/**
 * Execute the complete production memory-acceptance module, not a copied algorithm.
 * No model, database, clock or acceptance-logic substitutes are used.
 *
 * node --test tests/services/ana/memory-acceptance-fidelity.test.cjs
 * C2C_MEMORY_SOURCE_ROOT=/path/to/baseline node --test tests/services/ana/memory-acceptance-fidelity.test.cjs
 * C2C_TS_PATH may select an existing TypeScript installation; nothing is installed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

function loadProduction() {
  let ts;
  if (process.env.C2C_TS_PATH) ts = require(process.env.C2C_TS_PATH);
  else {
    try { ts = require('typescript'); }
    catch { ts = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'typescript')); }
  }
  const root = process.env.C2C_MEMORY_SOURCE_ROOT || path.resolve(__dirname, '../../..');
  const filename = path.join(root, 'server/services/ana-ri/memory-acceptance.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, 'production syntax diagnostics');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

const { evaluateMemoryCandidate: evaluate, checkForContradictions: check } = loadProduction();
const provenance = Object.freeze({
  source_route: 'synthetic-memory-test', model: 'none', provider: 'none',
  evidence_validated: true, structure_score: 5, generated_at: '2026-11-04T00:00:00Z', triggered_by: 7,
});
const signals = Object.freeze({
  evidenceValidated: true, structureScore: 5, structureMaxScore: 6,
  hasKnownLabels: true, hasInferredLabels: false, hasMissingLabels: false,
});
const existing = (content, category = 'decision', id = 17) => ({ content, category, id });
const candidate = (content, previous = [], extra = {}) => evaluate({
  content, category: 'decision', provenance, qualitySignals: signals, existingMemories: previous, ...extra,
});
const sharedPrefix = 'The project team recorded the same study objective and source references. '.repeat(4);
const assertDistinct = (a, b) => {
  const result = candidate(a, [existing(b)]);
  assert.notEqual(result.acceptance_status, 'rejected');
  assert.doesNotMatch(result.decision_reason, /Duplicate/);
  assert.notEqual(result.dedupe_key, candidate(b).dedupe_key);
};

for (const [name, a, b] of [
  ['different decisions after character 200', sharedPrefix + 'Next action: collect the missing dataset.', sharedPrefix + 'Next action: inspect the analysis table.'],
  ['different numeric results after character 200', sharedPrefix + 'The result was 12.5.', sharedPrefix + 'The result was 12.6.'],
  ['different sources after character 200', sharedPrefix + 'Source: record/41.', sharedPrefix + 'Source: record/42.'],
  ['different final character at the 5000-character limit', 'x'.repeat(4999) + '1', 'x'.repeat(4999) + '2'],
  ['a known djb2 hash collision', 'The recorded token is a~.', 'The recorded token is b].'],
  ['different Unicode text after character 200', sharedPrefix + 'Record: α.', sharedPrefix + 'Record: β.'],
]) test(`dedupe preserves ${name}`, () => assertDistinct(a, b));

test('an opposite conclusion after a shared opening reaches human review, not duplicate rejection', () => {
  const result = candidate(sharedPrefix + 'The package is incomplete.', [existing(sharedPrefix + 'The package is complete.')]);
  assert.equal(result.acceptance_status, 'pending_review');
  assert.equal(result.human_review_required, true);
  assert.deepEqual(result.contradiction_check_result.conflicting_entry_ids, [17]);
});

test('an exact long duplicate is still rejected', () => {
  const text = sharedPrefix + 'The result was 12.5.';
  const result = candidate(text, [existing(text)]);
  assert.equal(result.acceptance_status, 'rejected');
  assert.equal(result.decision_reason, 'Duplicate of existing memory #17');
});

test('existing case-and-whitespace normalization still identifies duplicates', () => {
  const text = '  THE\nproject\tteam recorded   a decision.  ';
  const canonical = 'the project team recorded a decision.';
  const result = candidate(text, [existing(canonical)]);
  assert.equal(result.acceptance_status, 'rejected');
  assert.match(result.decision_reason, /Duplicate/);
  assert.equal(result.dedupe_key, candidate(canonical).dedupe_key);
});

test('equal content in different categories is not a duplicate', () => {
  const text = 'The project team recorded the decision.';
  const result = candidate(text, [existing(text, 'insight')]);
  assert.equal(result.acceptance_status, 'accepted');
  assert.notEqual(result.dedupe_key, candidate(text, [], { category: 'insight' }).dedupe_key);
});

test('category/content field boundaries do not collide', () => {
  const a = candidate('alpha:the project team recorded this decision.', [], { category: 'decision' });
  const b = candidate('the project team recorded this decision.', [], { category: 'decision:alpha' });
  assert.notEqual(a.dedupe_key, b.dedupe_key);
});

const pairs = [
  ['is sufficient', 'is insufficient'], ['is adequate', 'is inadequate'],
  ['meets requirements', 'does not meet requirements'], ['no risk', 'significant risk'],
  ['compliant', 'non-compliant'], ['complete', 'incomplete'],
  ['no gaps', 'data gaps'], ['approved', 'rejected'],
];
for (const [positive, negative] of pairs) {
  test(`opposite phrases still flag ${positive} / ${negative} in both directions`, () => {
    for (const [a, b] of [[positive, negative], [negative, positive]]) {
      const result = check(`Assessment: ${a}.`, [existing(`Assessment: ${b}.`)]);
      assert.equal(result.has_contradiction, true);
      assert.deepEqual(result.conflicting_entry_ids, [17]);
      assert.equal(result.contradictions[0], `New memory says "${a}" but existing memory #${17} says "${b}"`);
    }
  });
  test(`two matching ${negative} assessments do not contradict each other`, () => {
    const result = check(`Latest assessment: ${negative}.`, [existing(`Earlier assessment: ${negative}.`)]);
    assert.equal(result.has_contradiction, false);
    assert.deepEqual(result.conflicting_entry_ids, []);
  });
  test(`two matching ${positive} assessments do not contradict each other`, () => {
    assert.equal(check(`Latest assessment: ${positive}.`, [existing(`Earlier assessment: ${positive}.`)]).has_contradiction, false);
  });
}

for (const [fragment, opposite] of [
  ['unapproved', 'rejected'], ['unrejected', 'approved'], ['completeness', 'incomplete'],
  ['non-compliantness', 'compliant'], ['no risks', 'significant risk'], ['incomplete_record', 'complete'],
  ['αapproved', 'rejected'], ['approvedβ', 'rejected'], ['approved2', 'rejected'],
  ['approved\u0301ness', 'rejected'],
]) test(`a word fragment is not the phrase: ${fragment}`, () => {
  assert.equal(check(`The record says ${fragment}.`, [existing(`The record says ${opposite}.`)]).has_contradiction, false);
});

test('whitespace and case do not hide a configured multi-word conflict', () => {
  const result = check('The evidence IS\nSUFFICIENT.', [existing('The evidence is\tinsufficient.')]);
  assert.equal(result.has_contradiction, true);
  assert.deepEqual(result.conflicting_entry_ids, [17]);
});

test('punctuation boundaries retain the configured phrases', () => {
  assert.equal(check('Assessment: (complete).', [existing('Assessment: [incomplete].')]).has_contradiction, true);
});

test('masking a negative phrase does not erase a separate positive assertion', () => {
  const result = check('One item is non-compliant; a separate item is compliant.', [existing('The record is non-compliant.')]);
  assert.equal(result.has_contradiction, true);
  assert.equal(result.contradictions[0], 'New memory says "compliant" but existing memory #17 says "non-compliant"');
});

test('a conflict notice states the opposing assertion even when existing text contains both', () => {
  const result = check('The new assessment is compliant.', [existing('One assessment is compliant; another is non-compliant.')]);
  assert.equal(result.contradictions[0], 'New memory says "compliant" but existing memory #17 says "non-compliant"');
});

test('multiple conflicts in one entry do not duplicate its identifier', () => {
  const result = check('The record is complete and compliant.', [existing('The record is incomplete and non-compliant.')]);
  assert.deepEqual(result.conflicting_entry_ids, [17]);
  assert.equal(result.contradictions.length, 2);
});

test('different conflicting entries retain their separate identifiers', () => {
  assert.deepEqual(check('The record is complete.', [existing('It is incomplete.', 'decision', 17), existing('Still incomplete.', 'decision', 23)]).conflicting_entry_ids, [17, 23]);
});

test('the full acceptance path does not quarantine two non-compliant assessments', () => {
  const result = candidate('The latest package remains non-compliant.', [existing('The previous package was non-compliant.')]);
  assert.equal(result.acceptance_status, 'accepted');
  assert.equal(result.human_review_required, false);
});

test('low-quality content is not auto-accepted merely because a false conflict was removed', () => {
  const result = candidate('The latest package remains incomplete.', [existing('The previous package was incomplete.')], {
    qualitySignals: { ...signals, evidenceValidated: false, hasKnownLabels: false },
  });
  assert.equal(result.acceptance_status, 'pending_review');
  assert.equal(result.human_review_required, true);
  assert.equal(result.contradiction_check_result.has_contradiction, false);
  assert.ok(result.confidence_score < 0.7);
});

test('sub-floor confidence is still rejected', () => {
  const result = candidate('The project team recorded a working assumption.', [], {
    qualitySignals: { ...signals, evidenceValidated: false, structureScore: 0, hasKnownLabels: false, hasInferredLabels: true, hasMissingLabels: true },
  });
  assert.equal(result.acceptance_status, 'rejected');
  assert.ok(result.confidence_score < 0.3);
});

test('length rejection boundaries are unchanged', () => {
  assert.equal(candidate('x'.repeat(19)).acceptance_status, 'rejected');
  assert.equal(candidate('x'.repeat(20)).acceptance_status, 'accepted');
  assert.equal(candidate('x'.repeat(5000)).acceptance_status, 'accepted');
  assert.equal(candidate('x'.repeat(5001)).acceptance_status, 'rejected');
});

test('content, provenance and thread attribution survive unchanged', () => {
  const text = 'The project team recorded a sourced decision.';
  const result = candidate(text, [], { threadId: 'thread-17', messageWindow: [4, 7] });
  assert.equal(result.content, text);
  assert.equal(result.provenance, provenance);
  assert.equal(result.source_thread_id, 'thread-17');
  assert.deepEqual(result.source_message_window, [4, 7]);
});

test('no comparison records means no inferred contradiction', () => {
  assert.deepEqual(check('The record is incomplete.', []), { has_contradiction: false, contradictions: [], conflicting_entry_ids: [] });
});
