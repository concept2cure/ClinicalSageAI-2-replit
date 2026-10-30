/** Focused dependency-free behavioral suite. Transpiles the actual TypeScript
 * modules with the repository's TypeScript package and runs Node's test runner.
 * Run: node --test tests/cortex/csr-cortex.behavior.test.mjs
 * This is not a full-repository typecheck or live database/model qualification. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(resolve(tmpdir(), 'c2c-cortex-'));
writeFileSync(resolve(temp, 'package.json'), '{"type":"module"}');
const modules = [
  'server/services/clinical-regulatory-evidence/csr-content-projection',
  'server/services/clinical-regulatory-evidence/csr-index-batch',
  'server/services/csr/cortex-authoring-context',
  'server/services/csr/cortex-authoring-reader',
  // Imported by cortex-authoring-context since the scientific-review receipts.
  'shared/authoring/csr-scientific-review',
];
for (const path of modules) {
  const source = readFileSync(resolve(root, `${path}.ts`), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true, fileName: `${path}.ts` });
  assert.deepEqual(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  mkdirSync(dirname(resolve(temp, `${path}.js`)), { recursive: true });
  writeFileSync(resolve(temp, `${path}.js`), result.outputText);
}
const load = p => import(pathToFileURL(resolve(temp, `${p}.js`)).href);
const { projectCsrContentEvidence: project, projectCsrContentEvidenceWithCoverage: projectReceipt } = await load(modules[0]);
const { runCsrIndexBatch: batch, parseCsrIndexOptions } = await load(modules[1]);
const { buildCsrAuthoringEvidence: context, parseCsrEvidenceSelection, reconcileCsrTableClaims: reconcile } = await load(modules[2]);
const { loadCsrAuthoringEvidence: readContext } = await load(modules[3]);
after(() => rmSync(temp, { recursive: true, force: true }));
const base = { reportId: 'CSR-001', sourceId: 12, studyId: 4 };
const aggregate = { endpointName: 'Change from baseline', analysisPopulation: 'ITT',
  armId: 'ACTIVE', comparatorArmId: 'CONTROL', effectMeasure: 'mean_difference',
  value: -2.5, ci: { lower: -4, upper: -1, level: '90%' }, pValue: '<0.001', n: 128,
  method: 'ANCOVA', timepoint: 'Week 12', multiplicityStatus: 'unadjusted', unit: 'points' };
const runId = '11111111-1111-4111-8111-111111111111';
const programId = '22222222-2222-4222-8222-222222222222';
const selection = { runId, programId, studyId: 'STUDY-A', sectionNumber: '11.4' };
const table = (title = 'Efficacy') => ({ title, headers: ['Endpoint', 'Active', 'Control'], rows: [['Change from baseline', '-2.5 (90% CI -4 to -1)', '0.0']] });
function retained() { return { runId, programId, historical: true, releaseEligibilityVerified: false,
  studies: [{ source: { documentId: '33333333-3333-4333-8333-333333333333', version: '2', sha256: 'a'.repeat(64),
    dataCutDate: '2026-10-01', studyId: 'STUDY-A', protocolNumber: 'P-01', clinicalVerification: 'not-established' },
  tables: { analysisPopulations: table('Populations'), primaryEfficacy: table(), secondaryEfficacy: table('Secondary'),
    aeOverallSummary: table('AE summary'), aeBySOC: table('AE SOC'), aeTopPT: table('AE PT'),
    deathsSAEsDiscontinuations: table('SAEs'), exposure: table('Exposure'), labShifts: table('Labs') } }] }; }

test('legacy scalar domain ordering and provenance remain compatible', () => {
  const atoms = project({ ...base, content: { efficacy_results: 'Recorded effect', statistical_analyses: 'ANCOVA', adverse_events: 'Two events', participant_disposition: '128 randomized' } });
  assert.deepEqual(atoms.map(a => a.tags[1]), ['efficacy', 'biostatistics', 'safety', 'study_conduct']);
  assert.equal(atoms.length, 4); assert.ok(atoms.every(a => a.structuredData.sourceId === 12 && a.structuredData.verificationStatus === 'unverified'));
});
test('structured efficacy preserves values, CI level, p-value bound, units and context', () => {
  const result = projectReceipt({ ...base, content: { efficacyResults: [aggregate] } });
  assert.equal(result.coverage.structured, 1); assert.equal(result.coverage.status, 'projected');
  const v = result.atoms[0].structuredData.recordedAggregate;
  assert.equal(v.value, -2.5); assert.equal(v.ci.level, '90%'); assert.equal(v.p_value, '<0.001');
  assert.equal(v.analysis_population, 'ITT'); assert.equal(v.unit, 'points'); assert.equal(v.multiplicity_status, 'unadjusted');
});
test('direct csr_details result arrays use the existing aggregate contract', () => {
  const a = project({ ...base, content: {}, detailResults: [aggregate] })[0];
  assert.equal(a.structuredData.sourceLocation, 'csr_details.results[0]');
});
test('PK, PD, immunogenicity and patient-reported aggregate domains are recognized', () => {
  const a = project({ ...base, content: { pharmacokinetics: { parameter: 'AUC', value: 25, unit: 'mg*h/L' },
    pharmacodynamics: 'Recorded pharmacodynamic response', immunogenicity: { parameter: 'ADA positive', numerator: 0, denominator: 128 },
    patientReportedOutcomes: { endpoint: 'QoL', value: 3 } } }); assert.equal(a.length, 4);
});
test('zero and false are retained without defaulting missing data to zero', () => {
  const a = project({ ...base, content: { deaths: 0, blinding: false, missingness: null } });
  assert.equal(a.length, 2); assert.match(a[0].content, /value: 0/); assert.match(a[1].content, /value: false/);
});
test('source identity remains stable while the value hash changes on revision', () => {
  const a = project({ ...base, content: { efficacy_results: 'A' } })[0];
  const b = project({ ...base, content: { efficacy_results: 'B' } })[0];
  assert.equal(a.sourceRef, b.sourceRef); assert.notEqual(a.structuredData.valueHash, b.structuredData.valueHash);
});
test('distinct aggregate observations retain distinct source locations', () => {
  const atoms = project({ ...base, content: { efficacy_results: [aggregate, { ...aggregate, timepoint: 'Week 24' }] } });
  assert.equal(new Set(atoms.map(a => a.sourceRef)).size, 2);
});
for (const field of ['subjectId', 'subject_id', 'patient_identifier', 'USUBJID', 'dateOfBirth', 'medicalRecordNumber']) {
  test(`private identifier key ${field} is excluded without being echoed`, () => {
    const r = projectReceipt({ ...base, content: { efficacy_results: { ...aggregate, [field]: 'PRIVATE-101' } } });
    assert.equal(r.atoms.length, 0); assert.equal(r.coverage.excluded.identifier_marker, 1); assert.doesNotMatch(JSON.stringify(r), /PRIVATE-101/);
  });
}
for (const text of ['Subject ID: ABC123', 'Participant ID = TEST-101', 'Medical record number: 12345', 'Date of birth: 2000-01-01', 'Patient 123 reported nausea', 'Summary;\n Subject 123 reported nausea']) {
  test(`free-text marker screen excludes ${text.split(':')[0]}`, () => {
    const r = projectReceipt({ ...base, content: { safety_results: text } });
    assert.equal(r.atoms.length, 0); assert.equal(r.coverage.excluded.identifier_marker, 1);
  });
}
test('nested unknown private records are not stripped and relabeled aggregate', () => {
  const r = projectReceipt({ ...base, content: { efficacy_results: { ...aggregate, rawRecords: [{ subjectId: 'PRIVATE-1' }] } } });
  assert.equal(r.atoms.length, 0); assert.doesNotMatch(JSON.stringify(r), /PRIVATE-1/);
});
for (const patch of [{ pValue: 1.1 }, { pValue: 'not-a-p-value' }, { n: -1 }, { n: 1.5 }, { value: Infinity }, { ci: { lower: 2, upper: 1 } }, { standardError: -1 }, { numerator: 10, denominator: 5 }, { percentage: 101 }]) {
  test(`invalid aggregate statistic is rejected: ${JSON.stringify(patch)}`, () => {
    const r = projectReceipt({ ...base, content: { efficacy_results: { ...aggregate, ...patch } } });
    assert.equal(r.atoms.length, 0); assert.equal(r.coverage.excluded.invalid_statistic, 1);
  });
}
test('unknown structured content remains unavailable, not a fabricated aggregate', () => {
  const r = projectReceipt({ ...base, content: { efficacy_results: { primary: { value: 2 } } } });
  assert.equal(r.atoms.length, 0); assert.equal(r.coverage.status, 'partial');
});
test('unknown source keys are counted but neither names nor payload are echoed', () => {
  const r = projectReceipt({ ...base, content: { PRIVATE_PERSON: { hidden: 'PRIVATE_VALUE' }, efficacy_results: 'Known' } });
  assert.equal(r.coverage.excluded.unmapped_field, 1); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_PERSON|PRIVATE_VALUE/);
});
test('no fabricated statistical confidence or training permission', () => {
  const a = project({ ...base, content: { efficacy_results: aggregate } })[0];
  assert.equal(a.confidence, 0); assert.equal(a.structuredData.confidenceBasis, 'unscored');
  assert.equal(a.structuredData.trainingApproved, false); assert.equal(a.structuredData.statisticalValidation, 'not_performed');
});
test('oversized and capacity-limited sources have an explicit receipt', () => {
  const r = projectReceipt({ ...base, content: { discussion: 'x'.repeat(12001), efficacy_results: Array.from({ length: 202 }, () => 'Recorded') } });
  assert.equal(r.coverage.excluded.oversized, 1); assert.equal(r.coverage.excluded.capacity_exceeded, 2); assert.equal(r.atoms.length, 200);
});
test('cyclic aggregate fails closed', () => {
  const cyclic = { ...aggregate }; cyclic.self = cyclic;
  assert.equal(projectReceipt({ ...base, content: { efficacy_results: cyclic } }).coverage.excluded.unsupported_shape, 1);
});
test('invalid source identity cannot create atoms', () => assert.throws(() => project({ ...base, sourceId: NaN, content: {} })));

test('authoring selects efficacy evidence without unrelated safety facts', () => {
  const r = context(retained(), selection);
  assert.deepEqual(r.tables.map(t => t.key), ['analysisPopulations', 'primaryEfficacy', 'secondaryEfficacy']);
  assert.equal(r.status, 'available'); assert.equal(r.approvalRequired, true); assert.equal(r.clinicalVerification, 'not-established');
  assert.equal(r.releaseEligibilityVerified, false); assert.equal(r.source.dataCutDate, '2026-10-01');
});
// 2026-10-30: this file had matched no runner, so it never ran. On 2026-10-29 the CSR lane deleted
// csr-builder's invented synopsis children ('2.8' among them); E3's synopsis is one heading, section 2,
// which reads every retained table (cortex-authoring-context.ts SECTIONS).
test('the synopsis, E3 section 2, reads the efficacy evidence; the invented 2.8 is no section', () => {
  const keys = context(retained(), { ...selection, sectionNumber: '2' }).tables.map(t => t.key);
  for (const key of ['analysisPopulations', 'primaryEfficacy', 'secondaryEfficacy']) assert.ok(keys.includes(key), key);
  assert.equal(context(retained(), { ...selection, sectionNumber: '2.8' }).tables.length, 0);
});
test('unsupported vital-sign section does not borrow general safety tables', () => {
  const r = context(retained(), { ...selection, sectionNumber: '12.5' }); assert.equal(r.status, 'unavailable'); assert.equal(r.tables.length, 0);
});
test('missing optional results remain missing rather than invented zeros', () => {
  const fixture = retained(); delete fixture.studies[0].tables.secondaryEfficacy;
  const r = context(fixture, selection); assert.equal(r.status, 'partial'); assert.deepEqual(r.missingTables, ['secondaryEfficacy']);
});
test('empty tables cannot certify no events', () => {
  const fixture = retained(); fixture.studies[0].tables.primaryEfficacy.rows = [];
  const r = context(fixture, selection); assert.ok(r.omittedTables.some(t => t.reason === 'empty')); assert.equal(r.status, 'partial');
});
test('ragged tables are omitted rather than misaligning treatment columns', () => {
  const fixture = retained(); fixture.studies[0].tables.primaryEfficacy.rows[0].pop();
  assert.ok(context(fixture, selection).omittedTables.some(t => t.reason === 'invalid_shape'));
});
test('source row extensions and participant payloads cannot hitchhike into prompts', () => {
  const fixture = retained(); fixture.studies[0].tables.primaryEfficacy.input_snapshot = [{ subjectId: 'PRIVATE-123' }];
  assert.doesNotMatch(JSON.stringify(context(fixture, selection)), /PRIVATE-123|input_snapshot/);
});
test('identifier text inside cells is screened before prompt assembly', () => {
  const fixture = retained(); fixture.studies[0].tables.primaryEfficacy.rows[0][1] = 'Subject ID: PRIVATE-123';
  const r = context(fixture, selection); assert.ok(r.omittedTables.some(t => t.reason === 'identifier_marker')); assert.doesNotMatch(JSON.stringify(r), /PRIVATE-123/);
});
test('oversized tables are omitted whole, never truncated mid-row', () => {
  const fixture = retained(); fixture.studies[0].tables.primaryEfficacy.rows = Array.from({ length: 1000 }, () => ['Endpoint', '1'.repeat(30), '2'.repeat(30)]);
  assert.ok(context(fixture, selection).omittedTables.some(t => t.reason === 'context_budget'));
});
test('source and evidence digests are stable and change with table contents', () => {
  const fixture = retained(); const r = context(fixture, selection);
  assert.equal(context(fixture, selection).evidenceDigest, r.evidenceDigest);
  fixture.studies[0].tables.primaryEfficacy.rows[0][1] = '-3.0';
  assert.notEqual(context(fixture, selection).evidenceDigest, r.evidenceDigest);
});
for (const change of [{ programId: '44444444-4444-4444-8444-444444444444' }, { runId: '55555555-5555-4555-8555-555555555555' }]) {
  test(`authoring rejects source scope mismatch ${Object.keys(change)[0]}`, () => assert.throws(() => context({ ...retained(), ...change }, selection), /CSR_EVIDENCE_SCOPE_MISMATCH/));
}
test('missing or ambiguous study selection is not silently resolved', () => {
  assert.throws(() => context(retained(), { ...selection, studyId: 'OTHER' }), /AMBIGUOUS_OR_MISSING/);
  const fixture = retained(); fixture.studies.push(structuredClone(fixture.studies[0]));
  assert.throws(() => context(fixture, selection), /AMBIGUOUS_OR_MISSING/);
});
test('selection cannot override authenticated organization or inject result data', () => {
  assert.throws(() => parseCsrEvidenceSelection({ ...selection, organizationId: 999 }), /SELECTION_INVALID/);
  assert.throws(() => parseCsrEvidenceSelection({ ...selection, tables: {} }), /SELECTION_INVALID/);
});
test('the canonical source loader receives exact authenticated actor and program', async () => {
  let seen;
  const q = {};
  const r = await readContext(q, { organizationId: 7, userId: 9 }, selection, async (...args) => { seen = args; return retained(); });
  assert.deepEqual(seen, [q, { organizationId: 7, userId: 9, programId }, runId]); assert.equal(r.studyId, 'STUDY-A');
});
test('source denial/read failures propagate without successful empty evidence', async () => {
  await assert.rejects(readContext({}, { organizationId: 7, userId: 9 }, selection, async () => { throw new Error('denied'); }), /denied/);
});
test('invalid actor is rejected before private source read', async () => {
  let called = false;
  await assert.rejects(readContext({}, { organizationId: 0, userId: 9 }, selection, async () => { called = true; return retained(); }), /ACTOR_REQUIRED/);
  assert.equal(called, false);
});
test('exact-cell reconciliation reports matches, mismatches and unsupported cells separately', () => {
  const r = reconcile(context(retained(), selection), [
    { table: 'primaryEfficacy', row: 0, column: 1, value: '-2.5 (90% CI -4 to -1)' },
    { table: 'primaryEfficacy', row: 0, column: 2, value: 'PRIVATE_CLAIM' },
    { table: 'aeOverallSummary', row: 0, column: 1, value: '0' },
  ]);
  assert.deepEqual(r.findings.map(f => f.status), ['matches', 'mismatch', 'unsupported']);
  assert.equal(r.status, 'needs_review'); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_CLAIM/);
});
test('zero claims means not assessed, not passed', () => assert.equal(reconcile(context(retained(), selection), []).status, 'not_assessed'));
test('matching claims are transcription matches, not clinical validation', () => {
  const r = reconcile(context(retained(), selection), [{ table: 'primaryEfficacy', row: 0, column: 2, value: '0.0' }]);
  assert.equal(r.status, 'matches'); assert.equal(r.clinicalVerification, 'not-established');
});
test('invalid claim coordinates are rejected rather than coerced', () => {
  assert.throws(() => reconcile(context(retained(), selection), [{ table: 'primaryEfficacy', row: '0', column: 2, value: '0' }]), /CLAIMS_INVALID/);
});
const indexResult = (patch = {}) => ({ total: 1, embedded: 1, skippedUnsupported: 0, ...patch });
test('keyset batch advances beyond the first page and keeps tenant in every call', async () => {
  const calls = []; const ids = [1, 2, 3];
  const deps = { list: async (org, after, limit) => { calls.push([org, after, limit]); return ids.filter(id => id > after).slice(0, limit).map(id => ({ id })); },
    atomize: async (org, id) => { assert.equal(org, 7); return indexResult(); } };
  const first = await batch(7, { limit: 2 }, deps); assert.equal(first.hasMore, true); assert.equal(first.nextAfterId, 2); assert.equal(first.complete, false);
  const second = await batch(7, { limit: 2, afterId: first.nextAfterId }, deps);
  assert.equal(second.scanned, 1); assert.equal(second.hasMore, false); assert.equal(second.complete, true);
  assert.deepEqual(calls, [[7, 0, 3], [7, 2, 3]]);
});
test('batch distinguishes empty, partial embedding and failed records', async () => {
  const r = await batch(7, { limit: 3 }, { list: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
    atomize: async (_org, id) => { if (id === 3) throw Error('private failure detail'); return id === 1 ? indexResult({ total: 0, embedded: 0 }) : indexResult({ embedded: 0 }); } });
  assert.equal(r.empty, 1); assert.equal(r.partial, 1); assert.equal(r.failed, 1); assert.equal(r.indexed, 1); assert.equal(r.complete, false);
  assert.deepEqual(r.failures, [3]); assert.doesNotMatch(JSON.stringify(r), /private failure/);
});
test('extraction omissions keep a fully embedded batch partial', async () => {
  const coverage = projectReceipt({ ...base, content: { unknown: 'x' } }).coverage;
  const r = await batch(7, {}, { list: async () => [{ id: 1 }], atomize: async () => indexResult({ coverage }) });
  assert.equal(r.partial, 1); assert.equal(r.complete, false);
});
for (const options of [{ limit: NaN }, { limit: 0 }, { limit: 501 }, { limit: 1.5 }, { afterId: -1 }, { afterId: '2' }]) {
  test(`reject invalid batch cursor ${JSON.stringify(options)}`, () => assert.throws(() => parseCsrIndexOptions(options)));
}
test('invalid organization cannot scan the corpus', async () => {
  let called = false; await assert.rejects(batch(0, {}, { list: async () => { called = true; return []; }, atomize: async () => null })); assert.equal(called, false);
});
test('unordered source page cannot silently skip reports', async () => {
  await assert.rejects(batch(7, {}, { list: async () => [{ id: 2 }, { id: 1 }], atomize: async () => indexResult() }), /invalid ordered page/);
});
