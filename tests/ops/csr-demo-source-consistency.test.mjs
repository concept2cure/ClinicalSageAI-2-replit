/** Actual CSR cross-record refinements, without a database/model/provider.
 * The TypeScript AST selects the existing validation functions and superRefine
 * callback; no validation rule is copied here. This does NOT run Zod's field
 * parsers. Full schema acceptance is covered by the separate Vitest fixture test.
 * Run: node --test tests/ops/csr-demo-source-consistency.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = process.env.CSR_SOURCE_FILE || path.join(root, 'shared/csr-source-input.ts');
const source = readFileSync(sourcePath, 'utf8');
const syntax = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
assert.equal(syntax.parseDiagnostics.length, 0, 'The actual schema source must parse.');
const functions = syntax.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text.startsWith('validate'));
const declaration = syntax.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : [])
  .find(n => n.name.getText(syntax) === 'CsrSourceEnvelopeSchema');
assert.ok(declaration && ts.isCallExpression(declaration.initializer));
const callback = declaration.initializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback));
const runnable = functions.map(n => n.getText(syntax)).join('\n') + '\nmodule.exports = ' + callback.getText(syntax) + ';';
const code = ts.transpileModule(runnable, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const context = { module: { exports: {} }, z: { ZodIssueCode: { custom: 'custom' } } };
vm.runInNewContext(code, context, { filename: sourcePath });
const refine = value => {
  const issues = [];
  context.module.exports(value, { addIssue: issue => issues.push({ message: issue.message, path: [...issue.path] }) });
  return issues;
};
const fixtureBytes = gunzipSync(readFileSync(path.join(root, 'docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz')));
const fixture = () => JSON.parse(fixtureBytes.toString('utf8'));
const asSubjectLevel = s => {
  const withdrawn = new Set(s.studyData.adverseEvents.filter(e => e.ledToDiscontinuation).map(e => e.subjectId));
  s.studyData.aeDiscontinuationBasis = 'subject';
  s.studyData.disposition.forEach(d => { d.discontinuedForAdverseEvent = withdrawn.has(d.subjectId); });
  s.studyData.adverseEvents.forEach(e => { delete e.ledToDiscontinuation; });
  return s;
};
const markCompleted = (s, id) => {
  const p = s.participants.find(p => p.subjectId === id);
  if (!p.completed) s.studyData.treatmentArms.find(a => a.armId === p.armId).populations.completed++;
  p.completed = true;
  s.studyData.disposition.find(d => d.subjectId === id).status = 'completed';
};

test('revision bytes are pinned and carry no fabricated live IDs or source approval', () => {
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), 'be9993dfa6a8eee53b10d0b18ea642b3c987b2e3df09dd9973040f601669c15a');
  const s = fixture();
  assert.match(s.studyInfo.sponsor, /fictional synthetic demonstration/);
  for (const key of ['sourceApproval','documentId','organizationId','signature','approvedBy']) assert.equal(Object.hasOwn(s, key), false);
  assert.equal(s.studyInfo.nctNumber, undefined);
});
test('corrected full synthetic source satisfies every actual cross-record refinement', () => {
  assert.deepEqual(refine(fixture()), []);
});
test('source contains the original 160 IDs and keeps treatment completion distinct', () => {
  const s = fixture();
  assert.equal(s.participants.length, 160);
  assert.equal(new Set(s.participants.map(p => p.subjectId)).size, 160);
  assert.equal(s.participants.filter(p => p.subjectId.startsWith('FBT201-A')).length, 80);
  assert.equal(s.participants.filter(p => p.subjectId.startsWith('FBT201-P')).length, 80);
  assert.equal(s.participants.some(p => p.subjectId.startsWith('FBT201-B')), false);
  assert.deepEqual(s.studyData.treatmentArms.map(a => a.populations.completed), [74, 76]);
});
test('known synthetic safety and efficacy aggregates remain unchanged', () => {
  const s = fixture();
  assert.equal(s.studyData.adverseEvents.length, 79);
  assert.deepEqual(['FBT201', 'PBO'].map(arm => s.studyData.adverseEvents.filter(e => e.armId === arm && e.serious).length), [3,2]);
  assert.deepEqual(['FBT201', 'PBO'].map(arm => s.studyData.adverseEvents.filter(e => e.armId === arm && e.ledToDiscontinuation).length), [2,1]);
  assert.deepEqual(s.studyData.efficacy.map(e => e.display), ['52/80 (65.0%)', '30/80 (37.5%)']);
});
for (const id of ['FBT201-A003', 'FBT201-A067', 'FBT201-P006']) {
  test(`rejects simultaneous treatment completion and event-level AE withdrawal: ${id}`, () => {
    const s = fixture(); markCompleted(s, id);
    const issues = refine(s);
    assert.ok(issues.some(i => /cannot also be recorded as completing treatment/.test(i.message)));
  });
}
test('rejects the same contradiction in an explicit subject-level withdrawal listing', () => {
  const s = asSubjectLevel(fixture()); markCompleted(s, 'FBT201-A003');
  assert.ok(refine(s).some(i => /cannot also be recorded as completing treatment/.test(i.message)));
});
test('accepts a consistent subject-level withdrawal listing', () => {
  assert.deepEqual(refine(asSubjectLevel(fixture())), []);
});
for (const basis of ['end-of-study', undefined]) {
  test(`does not mistake treatment withdrawal for incomplete study follow-up (${basis ?? 'unspecified'})`, () => {
    const s = fixture(); markCompleted(s, 'FBT201-A003');
    if (basis) s.studyData.dispositionBasis = basis; else delete s.studyData.dispositionBasis;
    assert.deepEqual(refine(s), []);
  });
}
test('ordinary treatment completion without an AE withdrawal remains valid', () => {
  const s = fixture(); markCompleted(s, 'FBT201-A014');
  assert.deepEqual(refine(s), []);
});
test('an unknown AE subject remains refused', () => {
  const s = fixture(); s.studyData.adverseEvents[0].subjectId = 'UNKNOWN';
  assert.ok(refine(s).some(i => /Every adverse event/.test(i.message)));
});
test('cross-arm AE data remains refused', () => {
  const s = fixture(); s.studyData.adverseEvents[0].armId = 'PBO';
  assert.ok(refine(s).some(i => /Every adverse event/.test(i.message)));
});
test('population counts still have to match participant flags', () => {
  const s = fixture(); s.studyData.treatmentArms[0].populations.completed++;
  assert.ok(refine(s).some(i => /completed population count/.test(i.message)));
});
test('missing disposition rows still fail closed', () => {
  const s = fixture(); s.studyData.disposition.pop();
  assert.ok(refine(s).some(i => /Complete disposition records/.test(i.message)));
});
test('duplicate participant identities still fail closed', () => {
  const s = fixture(); s.participants[1].subjectId = s.participants[0].subjectId;
  assert.ok(refine(s).some(i => /Participant identifiers must be unique/.test(i.message)));
});
test('inconsistent protocol and primary endpoint cannot pass as another study', () => {
  const s = fixture(); s.studyInfo.protocolNumber = 'DIFFERENT'; s.studyInfo.primaryEndpoint = 'Different endpoint';
  const issues = refine(s);
  assert.ok(issues.some(i => /same protocol/.test(i.message)));
  assert.ok(issues.some(i => /primary endpoint result must match/.test(i.message)));
});
test('a mixed subject/event withdrawal basis is still rejected', () => {
  const s = asSubjectLevel(fixture()); s.studyData.adverseEvents[0].ledToDiscontinuation = true;
  assert.ok(refine(s).some(i => /cannot also carry event-level/.test(i.message)));
});
test('missing domains are not filled with fabricated zero observations', () => {
  const s = fixture();
  for (const key of ['exposure','labShifts','vitalSigns','concomitantMedications']) assert.equal(Object.hasOwn(s.studyData, key), false);
});

test('the committed QC index matches each original subject ID, arm, completion and AE flag', () => {
  const s = fixture();
  const csv = readFileSync(path.join(root, 'docs/demo/faux-biotech-csr/ADSL_160_SUBJECT_QC_INDEX.csv'), 'utf8').trim().split(/\r?\n/);
  const header = csv.shift().split(',');
  const rows = csv.map(line => Object.fromEntries(line.split(',').map((value, i) => [header[i], value])));
  assert.equal(rows.length, 160);
  const byId = new Map(rows.map(row => [row.USUBJID, row]));
  assert.equal(byId.size, 160);
  for (const p of s.participants) {
    const row = byId.get(p.subjectId); assert.ok(row, `Missing ${p.subjectId}`);
    const events = s.studyData.adverseEvents.filter(e => e.subjectId === p.subjectId);
    assert.equal(row.TRT01A, s.studyData.treatmentArms.find(a => a.armId === p.armId).armName);
    assert.equal(row.COMPLTRT, p.completed ? 'Y' : 'N');
    assert.equal(row.TEAEFL, events.length ? 'Y' : 'N');
    assert.equal(row.SAEFL, events.some(e => e.serious) ? 'Y' : 'N');
    assert.equal(row.AEWITHFL, events.some(e => e.ledToDiscontinuation) ? 'Y' : 'N');
  }
  assert.deepEqual(['FBT-201 200 mg', 'Placebo'].map(arm => rows.filter(r => r.TRT01A === arm && r.PASI75W12 === 'Y').length), [52,30]);
});
