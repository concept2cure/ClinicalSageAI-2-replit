/**
 * The existing API-only demo seed with fictional FBT-201 input and a simulated
 * server boundary. Imports the REAL Faux pack and its current compressed data,
 * not a copy of its functions. No real account, database, browser or signature.
 *
 * node --test scripts/demo/launch-demo/faux-demo.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { seed, validateSyntheticDemoRows, validateOriginalDemoCsvBundle } from './packs/faux.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '../../..');
const sourcePath = path.join(root, 'docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const PROJECT_NAME = '[Demo · Faux] FBT-201 Phase 2 Clinical Study Report — SYNTHETIC';
const identity = Object.freeze({ email: 'demo@fictional.example', organizationId: '42',
  organizationName: 'Faux Biotech Therapeutics (fictional demo)' });
const CLIENT_EXAMPLE = Object.freeze({
  name: 'Faux Biotech Therapeutics — fictional demonstration',
  slug: 'faux-biotech-therapeutics-demo',
  organizationId: '42', status: 'active',
});

const ok = (json, status = 200) => ({ status, json, text: JSON.stringify(json) });

function fakeApplication({ organization = identity, otherType = false, missingTemplate = false,
  duplicateTemplate = false, missingProjectAnchor = false, switchedProjectIdentity = false,
  cannotEditDocument = false, changedAuthoringDetail = false,
  taskBoardPartial = false, taskBoardUnread = false } = {}) {
  const state = { calls: [], clients: [], projects: [], vault: [], documents: [], tasks: [] };
  let nextDocumentId = 1;
  const api = async (method, url, body) => {
    state.calls.push({ method, url, body });
    if (method === 'GET' && url === '/api/clients') return ok({ clients: state.clients });
    if (method === 'POST' && url === '/api/clients') {
      const entry = { ...body, id: 7, organizationId: identity.organizationId, status: 'active' };
      state.clients.push(entry);
      return ok({ client: entry }, 201);
    }
    if (method === 'GET' && url.startsWith('/api/c2c/projects?')) {
      const query = new URL(url, 'https://example.test').searchParams;
      const offset = Number(query.get('offset') ?? 0);
      const limit = Number(query.get('limit') ?? 200);
      return ok({ data: state.projects.slice(offset, offset + limit),
        meta: { hasMore: state.projects.length > offset + limit } });
    }
    if (method === 'POST' && url === '/api/c2c/projects') {
      if (body.programType !== 'csr' || body.submissionTypeId !== 'ich_csr' ||
          body.productType !== 'biologic' || body.primaryAgency !== 'ICH / Global' ||
          !String(body.objective ?? '').trim()) return ok({ error: 'Incorrect CSR project intake' }, 400);
      const entry = { id: 'p1', title: body.name, program_type: body.programType,
        client_workspace_id: body.clientWorkspaceId };
      state.projects.push(entry);
      return ok({ data: entry }, 201);
    }
    if (method === 'GET' && url === '/api/c2c/projects/p1') {
      // Unlike create's {data}, the real detail route returns the program
      // directly: res.json({ ...program, canChange }).
      const project = state.projects.find(p => p.id === 'p1');
      return ok({ ...project,
        id: switchedProjectIdentity ? 'another-project' : project.id,
        client_workspace_id: missingProjectAnchor ? null : project.client_workspace_id,
        program_type: otherType ? 'ind' : 'csr' });
    }
    if (method === 'GET' && url.startsWith('/api/c2c/project-vault/p1/search?')) {
      const params = new URL(url, 'https://example.test').searchParams;
      const q = params.get('q') ?? '';
      const limit = Number(params.get('limit') ?? 50);
      const offset = Number(params.get('offset') ?? 0);
      const found = state.vault.filter(d => d.title.includes(q));
      return ok({ data: { results: found.slice(offset, offset + limit)
        .map(d => ({ ...d, current: d.current !== false })),
        total: found.length, limit, offset } });
    }
    if (method === 'POST' && /^\/api\/c2c\/project-vault\/p1\/documents\/[^/]+\/details$/.test(url)) {
      const documentId = url.split('/')[6];
      const doc = state.vault.find(d => d.id === documentId);
      if (!doc || !/source-catalog correction/i.test(body.reason) ||
          !['PROTOCOL', 'SAP'].includes(body.documentType)) return ok({ success: false }, 403);
      doc.documentType = body.documentType;
      return ok({ success: true, unchanged: false, changes: [{ field: 'document_type',
        from: 'OTHER', to: body.documentType }] });
    }
    if (method === 'POST' && url === '/api/vault/ingest') {
      assert.ok(body instanceof FormData, 'use the existing multipart Vault endpoint');
      assert.equal(body.get('programId'), 'p1');
      const kind = body.get('documentType');
      const code = String(body.get('documentCode'));
      // The pack's own taxonomy (packs/faux.mjs): protocol, SAP, the two TLFs as
      // REPORT since 8fb6535a5, and every other source OTHER.
      const expected = code.includes('PROTOCOL') ? 'PROTOCOL' : code.includes('-SAP-') ? 'SAP'
        : code.includes('-TL-F-') ? 'REPORT' : 'OTHER';
      assert.equal(kind, expected, 'use the existing Data Room taxonomy for the source type');
      const upload = body.get('file');
      assert.ok(upload && typeof upload.arrayBuffer === 'function');
      const bytes = Buffer.from(await upload.arrayBuffer());
      const contentHash = sha256(bytes);
      const doc = { id: `v${nextDocumentId++}`,
        title: body.get('documentTitle'), contentHash, documentType: kind,
        originalFileAvailable: true, fileName: upload.name, bytes };
      state.vault.push(doc);
      return ok({ document: doc }, 201);
    }
    if (method === 'GET' && url === '/api/authoring/templates?search=Clinical%20Study%20Report') {
      const template = {
        id: '4331e7e3-7777-5c21-8c9b-0e2f56194e7e',
        entryId: 'component:clinical_study_report', section_count: 16,
      };
      return ok({ templates: missingTemplate ? [] : duplicateTemplate ? [template, { ...template }] : [template] });
    }
    if (method === 'GET' && url === '/api/authoring/docs?status=all&programId=p1') {
      return ok({ success: true, documents: state.documents });
    }
    if (method === 'GET' && url ===
        '/api/authoring/docs/df541fa2-594e-48d7-b451-3a5a3d994d39?programId=p1') {
      const d = state.documents.find(d => d.id === 'df541fa2-594e-48d7-b451-3a5a3d994d39');
      if (!d) return ok({ error: 'Document not found' }, 404);
      return ok({ success: true, document: {
        ...d,
        id: changedAuthoringDetail ? 'd0d64e58-e1ae-48f4-beba-bf6a4e996399' : d.id,
        client_program_id: d.program_id,
      }, access: { edit: { allowed: !cannotEditDocument, reason: cannotEditDocument ? 'permission-denied' : null } } });
    }
    if (method === 'POST' && url === '/api/authoring/docs') {
      if (body.client_program_id !== 'p1' ||
          body.template_id !== '4331e7e3-7777-5c21-8c9b-0e2f56194e7e') {
        return ok({ error: 'Wrong CSR working template or project' }, 400);
      }
      const doc = {
        id: 'df541fa2-594e-48d7-b451-3a5a3d994d39',
        title: body.title, template_id: body.template_id,
        program_id: body.client_program_id, section_count: 16, status: 'draft',
        readScope: 'document',
      };
      state.documents.push(doc);
      return ok({ success: true, document: doc, sections_seeded: 16 }, 201);
    }
    if (method === 'GET' && url === '/api/projects') {
      return ok({ data: [{ id: 11, regulatoryProgramId: 'p1' }] });
    }
    if (method === 'GET' && url === '/api/task-management/board') {
      return ok({ success: true, data: state.tasks,
        meta: { partial: taskBoardPartial || taskBoardUnread,
          unreadSources: taskBoardUnread ? ['unified_tasks'] : [] } });
    }
    if (method === 'POST' && url === '/api/tasks/tasks') {
      assert.equal(body.projectId, 11);
      assert.equal(body.status, 'pending');
      const row = { taskId: `task-${state.tasks.length + 1}`,
        title: body.title, project: String(body.projectId),
        ...(body.sourceEntityType === 'authoring_document'
          ? { sourceDocumentId: body.sourceEntityId } : {}) };
      state.tasks.push(row);
      return ok({ success: true, data: row }, 201);
    }
    throw new Error(`Unexpected application request: ${method} ${url}`);
  };
  const run = () => {
    const records = {}, steps = [], notes = [];
    return {
      records, steps, notes,
      record(key, value) { records[key] = value; },
      note(message) { notes.push(message); },
      async step(label, execute) { steps.push(label); return execute(); },
    };
  };
  return { api, state, run, identity: organization };
}

test('checked-in synthetic source is complete and remains explicitly artificial', () => {
  const compressed = readFileSync(sourcePath);
  const original = gunzipSync(compressed);
  const provenance = JSON.parse(readFileSync(
    path.join(root, 'docs/demo/faux-biotech-csr/REVISION_PROVENANCE_v2.json'), 'utf8'));
  assert.equal(provenance.revision, 2);
  assert.equal(provenance.synthetic, true);
  assert.equal(provenance.clinical_verification, 'not-established');
  assert.equal(sha256(compressed), provenance.source_gzip_sha256);
  assert.equal(sha256(original), provenance.revised_source_sha256);
  const data = JSON.parse(original.toString('utf8'));
  assert.equal(data.format, 'concept2cure.csr-source.v1');
  assert.equal(data.studyData.dispositionBasis, 'end-of-treatment');
  assert.equal(data.participants.length, 160);
  assert.equal(new Set(data.participants.map(p => p.subjectId)).size, 160);
  assert.equal(data.studyData.adverseEvents.length, 79);
  assert.deepEqual(data.studyData.treatmentArms.map(a => a.populations.completed), [74, 76]);
  assert.deepEqual(data.studyData.efficacy.map(e => e.display), ['52/80 (65.0%)', '30/80 (37.5%)']);
  assert.match(String(data.studyInfo.sponsor), /fictional|synthetic/i);
  assert.equal(Object.hasOwn(data, 'sourceApproval'), false);
  assert.equal(Object.hasOwn(data, 'organizationId'), false);
});

test('reconciles the synthetic QC index and both TLFs with the source before admitting data', () => {
  const data = JSON.parse(gunzipSync(readFileSync(sourcePath)).toString('utf8'));
  const base = path.join(root, 'docs/demo/faux-biotech-csr');
  const files = Object.fromEntries([
    'ADSL_160_SUBJECT_QC_INDEX.csv', 'TLF_PRIMARY_EFFICACY.csv', 'TLF_SAFETY.csv',
  ].map(name => [name, readFileSync(path.join(base, name))]));
  assert.equal(validateSyntheticDemoRows(data, files), files);

  const edit = (name, oldText, newText) => {
    const original = files[name].toString('utf8');
    assert.ok(original.includes(oldText), 'Test source must contain the expected original record');
    return { ...files, [name]: Buffer.from(original.replace(oldText, newText), 'utf8') };
  };
  assert.throws(() => validateSyntheticDemoRows(data, edit(
    'ADSL_160_SUBJECT_QC_INDEX.csv',
    'FBT201-A003,FBT-201 200 mg,Y,Y,N,N,Y,N,Y,',
    'FBT201-A003,FBT-201 200 mg,Y,Y,N,Y,Y,N,Y,',
  )), /QC index conflicts/);
  assert.throws(() => validateSyntheticDemoRows(data, edit(
    'TLF_PRIMARY_EFFICACY.csv', 'Placebo,80,30,37.5,76', 'Placebo,80,31,37.5,76',
  )), /source disagree/);
  assert.throws(() => validateSyntheticDemoRows(data, edit(
    'TLF_SAFETY.csv', 'Placebo,80,37,2,1,0', 'Placebo,80,36,2,1,0',
  )), /source disagree/);
  assert.throws(() => validateSyntheticDemoRows(data, edit(
    'TLF_PRIMARY_EFFICACY.csv',
    'arm,ITT,responders,response_rate_pct,treatment_complete',
    'arm,ITT,responders,response_rate_pct',
  )), /CSV headers changed/);
});

test('seeds one CSR project, ten Data Room source records, one editor document and pending tasks', async () => {
  const app = fakeApplication(), run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  assert.equal(app.state.projects.length, 1);
  assert.equal(app.state.projects[0].program_type, 'csr');
  const projectCreate = app.state.calls.find(c => c.method === 'POST' && c.url === '/api/c2c/projects');
  assert.ok(projectCreate, 'Existing Project Management creates the CSR document-type project');
  assert.match(projectCreate.body.objective, /Fictional study hypothesis \(not a finding\)/);
  assert.match(projectCreate.body.objective, /FBT-201-2026/);
  assert.match(projectCreate.body.objective, /PASI 75 response at Week 12/);
  assert.match(projectCreate.body.objective, /placebo/i);
  assert.match(projectCreate.body.objective, /source data cut 2026-09-30/);
  assert.equal(app.state.vault.length, 10);
  assert.deepEqual(app.state.vault.map(d => d.documentType), ['OTHER', 'PROTOCOL', 'SAP', 'OTHER', 'REPORT', 'REPORT', 'OTHER', 'OTHER', 'OTHER', 'OTHER']);
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.documents[0].template_id, '4331e7e3-7777-5c21-8c9b-0e2f56194e7e');
  assert.equal(app.state.documents[0].program_id, 'p1');
  assert.equal(run.records['authoring.document'].templateEntry, 'component:clinical_study_report');
  assert.equal(run.records['authoring.document'].sectionCount, 16);
  assert.equal(app.state.tasks.length, 3);
  const reviewerTask = app.state.tasks.find(t => t.title.includes('Human-review'));
  assert.equal(reviewerTask?.sourceDocumentId, app.state.documents[0].id);
  assert.ok(app.state.tasks.every(t => /FBT-201/.test(t.title)));
  const content = gunzipSync(readFileSync(sourcePath));
  const csr = app.state.vault.find(d => /clinical source JSON/.test(d.title));
  assert.ok(csr);
  assert.equal(csr.contentHash, sha256(content));
  assert.equal(csr.bytes.toString('utf8'), content.toString('utf8'));
  assert.equal(run.records.sourceRevision.sha256, sha256(content));
  assert.ok(app.state.calls.every(call => !/approve|sign|dispatch|file-into/i.test(call.url)));
  assert.deepEqual(Object.values(run.records.tally.created)
    .reduce((sum, n) => sum + n, 0), 16);
});

test('Data Room records the original synthetic QC index and both reconciled TLF files by exact bytes', async () => {
  const app = fakeApplication();
  const run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  const sources = [
    ['ADSL_160_SUBJECT_QC_INDEX.csv', 'QC index', 'OTHER', 'source.adsl-qc-v2'],
    ['TLF_PRIMARY_EFFICACY.csv', 'efficacy TLF', 'REPORT', 'source.tl-f-efficacy-v2'],
    ['TLF_SAFETY.csv', 'safety TLF', 'REPORT', 'source.tl-f-safety-v2'],
  ];
  for (const [filename, label, expectedType, manifestKey] of sources) {
    const stored = app.state.vault.find(d => d.title.includes(label));
    assert.ok(stored, `Missing synthetic Data Room record ${filename}`);
    const original = readFileSync(path.join(root, 'docs/demo/faux-biotech-csr', filename));
    assert.equal(stored.contentHash, sha256(original));
    assert.equal(stored.documentType, expectedType);
    assert.equal(stored.bytes.equals(original), true, `Changed original bytes: ${filename}`);
    assert.equal(run.records[manifestKey]?.sha256, sha256(original));
  }
  assert.ok(app.state.vault.find(d => /QC index/.test(d.title)).title.includes('not ADaM'));
});

test('the exact fictional ADSL/ADEFF/ADAE/ADLB sources remain available with pinned bytes', async () => {
  const app = fakeApplication();
  const run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  const originals = [
    ['01_ADSL_synthetic_v2.csv', 'ADSL-inspired', 'source.adsl-original-v2'],
    ['02_ADEFF_synthetic.csv', 'ADEFF-inspired', 'source.adeff-original-v2'],
    ['03_ADAE_synthetic.csv', 'ADAE-inspired', 'source.adae-original-v2'],
    ['04_ADLB_synthetic.csv', 'ADLB-inspired', 'source.adlb-original-v2'],
  ];
  const source = JSON.parse(gunzipSync(readFileSync(sourcePath)).toString('utf8'));
  const dir = path.join(root, 'docs/demo/faux-biotech-csr');
  const qc = Object.fromEntries([
    'ADSL_160_SUBJECT_QC_INDEX.csv', 'TLF_PRIMARY_EFFICACY.csv', 'TLF_SAFETY.csv',
  ].map(name => [name, readFileSync(path.join(dir, name))]));
  const bundle = readFileSync(path.join(dir, 'FBT201_ADAM_INSPIRED_SOURCE_CSV_BUNDLE_v2.json.gz'));
  const entries = validateOriginalDemoCsvBundle(source, qc, bundle);
  assert.equal(Object.keys(entries).length, 4);
  for (const [fileName, namePart, receiptKey] of originals) {
    const stored = app.state.vault.find(d => d.title.includes(namePart));
    assert.ok(stored, `Missing synthetic observation source: ${fileName}`);
    assert.equal(stored.documentType, 'OTHER', 'No CDISC conformity or official dataset type is implied');
    assert.ok(stored.title.includes('not CDISC'));
    assert.equal(stored.bytes.equals(entries[fileName]), true);
    assert.equal(stored.contentHash, sha256(entries[fileName]));
    assert.equal(run.records[receiptKey]?.sha256, sha256(entries[fileName]));
  }
  assert.equal(app.state.vault.length, 10);
});

test('original fictional analysis archive refuses tampering or a mismatched derived source', () => {
  const source = JSON.parse(gunzipSync(readFileSync(sourcePath)).toString('utf8'));
  const dir = path.join(root, 'docs/demo/faux-biotech-csr');
  const qc = Object.fromEntries([
    'ADSL_160_SUBJECT_QC_INDEX.csv', 'TLF_PRIMARY_EFFICACY.csv', 'TLF_SAFETY.csv',
  ].map(name => [name, readFileSync(path.join(dir, name))]));
  const bundle = readFileSync(path.join(dir, 'FBT201_ADAM_INSPIRED_SOURCE_CSV_BUNDLE_v2.json.gz'));
  assert.throws(() => validateOriginalDemoCsvBundle(source, qc, Buffer.from('a modified archive')),
    /pinned version-2 SHA-256/);
  const person = { ...source.studyData.demographics[0], age: 117 };
  const alteredDemographics = { ...source,
    studyData: { ...source.studyData,
      demographics: [person, ...source.studyData.demographics.slice(1)] } };
  assert.throws(() => validateOriginalDemoCsvBundle(alteredDemographics, qc, bundle),
    /ADSL observations contradict/);
  const event = { ...source.studyData.adverseEvents[0], pt: 'Not a recorded source AE' };
  const alteredSafety = { ...source,
    studyData: { ...source.studyData,
      adverseEvents: [event, ...source.studyData.adverseEvents.slice(1)] } };
  assert.throws(() => validateOriginalDemoCsvBundle(alteredSafety, qc, bundle),
    /AE listing contradicts/);
});

test('replays an exact source on a later Data Room search page without uploading a duplicate', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const known = app.state.vault.find(d => /clinical source JSON/.test(d.title));
  assert.ok(known);
  const unrelated = Array.from({ length: 50 }, (_, n) => ({
    id: `filler-${n}`,
    title: `${known.title} — unrelated indexed note ${n}`,
    documentType: 'OTHER',
    contentHash: 'f'.repeat(64),
    current: true,
  }));
  // All 50 records match the source query but not its exact title.
  app.state.vault.unshift(...unrelated);
  const before = app.state.calls.length;
  const run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  const calls = app.state.calls.slice(before);
  assert.ok(calls.some(c => c.method === 'GET' &&
    c.url.includes('/api/c2c/project-vault/p1/search?') && c.url.includes('offset=50')));
  assert.ok(calls.every(c => c.method === 'GET'), 'A later-page exact source must be reused, never reuploaded');
  assert.equal(app.state.vault.filter(d => d.title === known.title).length, 1);
  assert.equal(run.records['source.csr-source-v2'].id, known.id);
});

test('an inactive or foreign client record is never adopted by the Faux seed', async () => {
  for (const mismatch of [
    { status: 'inactive' },
    { organizationId: '84' },
    { name: 'A different sponsor' },
  ]) {
    const app = fakeApplication();
    app.state.clients.push({ id: 7, ...CLIENT_EXAMPLE, ...mismatch });
    await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
      /mismatched tenant, name or inactive status/);
    assert.ok(app.state.calls.every(c => c.method === 'GET'));
    assert.equal(app.state.projects.length, 0);
  }
});

test('duplicate slugged client records fail before any project or source write', async () => {
  const app = fakeApplication();
  app.state.clients.push({ id: 7, ...CLIENT_EXAMPLE }, { id: 8, ...CLIENT_EXAMPLE });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /Multiple client records/);
  assert.ok(app.state.calls.every(c => c.method === 'GET'));
});

test('a second same-title project is a refusal, not an arbitrary project selection', async () => {
  const app = fakeApplication();
  app.state.clients.push({ id: 7, ...CLIENT_EXAMPLE });
  app.state.projects.push(
    { id: 'p1', title: PROJECT_NAME, client_workspace_id: 7, program_type: 'csr' },
    { id: 'p2', title: PROJECT_NAME, client_workspace_id: 7, program_type: 'csr' },
  );
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /More than one FBT-201 project/);
  assert.ok(app.state.calls.every(c => c.method === 'GET'));
  assert.equal(app.state.vault.length, 0);
});

test('a stalled paginated source search never silently assumes the source was absent', async () => {
  const app = fakeApplication();
  const originalApi = app.api;
  app.api = async (method, url, body) => {
    if (method === 'GET' && url.startsWith('/api/c2c/project-vault/p1/search?')) {
      app.state.calls.push({ method, url, body });
      return ok({ data: { results: [], total: 2, limit: 50, offset: 0 } });
    }
    return originalApi(method, url, body);
  };
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /paging made no progress/);
  assert.ok(!app.state.calls.some(c => c.method === 'POST' && c.url === '/api/vault/ingest'));
  assert.equal(app.state.vault.length, 0);
});

test('replaying the pack reuses governed records without rewriting existing data', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const before = app.state.calls.length;
  const run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  assert.ok(app.state.calls.slice(before).every(x => x.method === 'GET'),
    'second seed must be pure verification, not duplicate writes');
  assert.equal(app.state.clients.length, 1);
  assert.equal(app.state.projects.length, 1);
  assert.equal(app.state.vault.length, 10);
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.tasks.length, 3);
  assert.ok(run.records.tally.found['source-document'] >= 10);
  assert.equal(run.records.tally.found['authoring-document'], 1);
});

test('corrects only previously miscatalogued synthetic protocol/SAP through audited Vault details', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const files = app.state.vault.filter(d => d.documentType === 'PROTOCOL' || d.documentType === 'SAP');
  const originalHashes = files.map(d => d.contentHash);
  files.forEach(d => { d.documentType = 'OTHER'; });
  const beforeCalls = app.state.calls.length;
  const run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  const newCalls = app.state.calls.slice(beforeCalls);
  const edits = newCalls.filter(c => c.method === 'POST' && c.url.endsWith('/details'));
  assert.equal(edits.length, 2);
  assert.ok(edits.every(c => /source-catalog correction/i.test(c.body.reason)));
  assert.ok(!newCalls.some(c => c.url === '/api/vault/ingest' && c.method === 'POST'));
  assert.equal(app.state.vault.length, 10);
  assert.deepEqual(app.state.vault.map(d => d.documentType), ['OTHER', 'PROTOCOL', 'SAP', 'OTHER', 'REPORT', 'REPORT', 'OTHER', 'OTHER', 'OTHER', 'OTHER']);
  assert.deepEqual(files.map(d => d.contentHash), originalHashes);
  assert.equal(run.records.tally.created['source-metadata-correction'], 2);
});

test('refuses an inconsistent document type on an otherwise exact-hash existing source', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  app.state.vault.find(d => d.documentType === 'PROTOCOL').documentType = 'CSR';
  const beforeCalls = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /incompatible or governed document type/);
  assert.ok(app.state.calls.slice(beforeCalls).every(c => c.method === 'GET'));
});

test('does not edit a source that has entered an approved or other lifecycle stage', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const protocol = app.state.vault.find(d => d.documentType === 'PROTOCOL');
  protocol.documentType = 'OTHER'; protocol.lifecycleStage = 'approved';
  const beforeCalls = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /incompatible or governed document type/);
  assert.ok(app.state.calls.slice(beforeCalls).every(c => c.method === 'GET'));
});

test('refuses wrong organization before any project or source read/write', async () => {
  const app = fakeApplication({ organization: { ...identity, organizationName: 'A different customer' } });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }), /organization/i);
  assert.equal(app.state.calls.length, 0);
});

test('Project Management detail is unwrapped and must match the same client anchor', async () => {
  const valid = fakeApplication();
  await seed({ api: valid.api, identity: valid.identity, run: valid.run() });
  const reads = valid.state.calls.filter(c => c.method === 'GET' && c.url === '/api/c2c/projects/p1');
  assert.equal(reads.length, 1);
  assert.equal(valid.state.vault.length, 10);
});

for (const [label, overrides, message] of [
  ['missing project client anchor', { missingProjectAnchor: true }, /not recorded under this fictional client/],
  ['substituted project ID', { switchedProjectIdentity: true }, /another project identity/],
]) {
  test(`refuses ${label} before any Data Room or authoring write`, async () => {
    const app = fakeApplication(overrides);
    app.state.clients.push({ id: 7, ...CLIENT_EXAMPLE });
    app.state.projects.push({ id: 'p1', title: PROJECT_NAME,
      program_type: 'csr', client_workspace_id: 7 });
    await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }), message);
    assert.ok(app.state.calls.every(c => c.method === 'GET'));
    assert.equal(app.state.vault.length, 0);
    assert.equal(app.state.documents.length, 0);
    assert.equal(app.state.tasks.length, 0);
  });
}

test('never adopts an existing project with a different document type', async () => {
  const app = fakeApplication({ otherType: true });
  app.state.clients.push({ id: 7, ...CLIENT_EXAMPLE });
  app.state.projects.push({ id: 'p1', title: PROJECT_NAME, program_type: 'ind', client_workspace_id: 7 });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }), /not the CSR document type/);
  assert.equal(app.state.vault.length, 0);
  assert.equal(app.state.tasks.length, 0);
});

test('matching catalog hash never substitutes for an unavailable original', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const uploaded = app.state.vault.find(d => /clinical source JSON/.test(d.title));
  assert.ok(uploaded);
  uploaded.originalFileAvailable = false;
  const before = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /original file is unavailable/);
  assert.ok(app.state.calls.slice(before).every(c => c.method === 'GET'));
  assert.equal(app.state.vault.length, 10);
});

test('a misclassified protocol cannot be corrected if its original was removed', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const protocol = app.state.vault.find(d => d.documentType === 'PROTOCOL');
  protocol.documentType = 'OTHER';
  protocol.originalFileAvailable = false;
  const before = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /original file is unavailable/);
  assert.ok(app.state.calls.slice(before).every(c => c.method === 'GET'));
});

test('an altered current source hash refuses overwrite and stops other uploads', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const saved = app.state.vault.find(d => /clinical source JSON/.test(d.title));
  saved.contentHash = 'f'.repeat(64);
  const before = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /SHA-256 does not match revision 2/);
  assert.ok(app.state.calls.slice(before).every(c => c.method === 'GET'));
});

test('CLI rejects accidental mixed-tenant seed selection without starting any connection', () => {
  const result = spawnSync(process.execPath, [path.join(HERE, 'seed.mjs'), '--pack', 'faux,biotech'],
    { encoding: 'utf8', env: { ...process.env, DEMO_SEED_TOKEN: '', DEMO_SEED_EMAIL: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must run alone/);
});

test('CLI requires exact organization ID before connecting to any Faux Biotech tenant', () => {
  const result = spawnSync(process.execPath, [path.join(HERE, 'seed.mjs'), '--pack', 'faux'],
    { encoding: 'utf8', env: { ...process.env, DEMO_SEED_TOKEN: '',
      DEMO_SEED_EMAIL: '', DEMO_EXPECTED_ORGANIZATION_ID: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --organization-id/);
});

test('CLI rejects a fake tenant plus an explicit client-workspace bypass', () => {
  const result = spawnSync(process.execPath, [path.join(HERE, 'seed.mjs'), '--pack', 'faux', '--client-workspace-id', '9'],
    { encoding: 'utf8', env: { ...process.env, DEMO_SEED_TOKEN: '', DEMO_SEED_EMAIL: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /biotech pack only/);
});

test('purge is an honest refusal to delete governed source records', async () => {
  const app = fakeApplication(), run = app.run();
  const { purge } = await import('./packs/faux.mjs');
  await purge({ api: app.api, identity: app.identity, run });
  assert.equal(app.state.calls.length, 0);
  assert.match(run.notes.join(' '), /no destructive|archive/i);
});

for (const [name, options] of [
  ['missing', { missingTemplate: true }],
  ['duplicated', { duplicateTemplate: true }],
]) {
  test(`rejects ${name} canonical CSR templates before any tenant write`, async () => {
    const app = fakeApplication(options);
    await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
      /canonical CSR component template is unavailable or duplicated/);
    assert.equal(app.state.clients.length, 0);
    assert.equal(app.state.projects.length, 0);
    assert.equal(app.state.vault.length, 0);
    assert.equal(app.state.documents.length, 0);
    assert.equal(app.state.tasks.length, 0);
    assert.ok(app.state.calls.every(c => c.method === 'GET'));
  });
}

test('ambiguous same-title Data Room sources are not silently adopted', async () => {
  const app = fakeApplication();
  const name = '[Demo · Faux] FBT-201 clinical source JSON · synthetic v2';
  app.state.vault.push(
    { id: 'v-old-1', title: name, contentHash: 'f'.repeat(64) },
    { id: 'v-old-2', title: name, contentHash: 'f'.repeat(64) },
  );
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /duplicate current candidates/);
  assert.equal(app.state.vault.length, 2);
  assert.equal(app.state.calls.filter(x => x.method === 'POST' && x.url === '/api/vault/ingest').length, 0);
  assert.equal(app.state.documents.length, 0);
  assert.equal(app.state.tasks.length, 0);
});

test('ambiguous same-title editor documents are not silently adopted', async () => {
  const app = fakeApplication();
  const title = '[Demo · Faux] FBT-201 ICH E3 Clinical Study Report — working draft';
  app.state.documents.push(
    { id: 'e1929646-ed1e-43f8-bdce-34f49ceddbad', title,
      template_id: '4331e7e3-7777-5c21-8c9b-0e2f56194e7e', program_id: 'p1', section_count: 16 },
    { id: '6e6fd81a-c878-4b99-8e3b-ff53f215a860', title,
      template_id: '4331e7e3-7777-5c21-8c9b-0e2f56194e7e', program_id: 'p1', section_count: 16 },
  );
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /Multiple same-title CSR working documents/);
  assert.equal(app.state.documents.length, 2);
  assert.equal(app.state.tasks.length, 0);
});

test('a prior CSR working document with a non-canonical template is never adopted', async () => {
  const app = fakeApplication();
  app.state.documents.push({ id: 'bf544753-673f-4656-bbf0-156e48c85109',
    title: '[Demo · Faux] FBT-201 ICH E3 Clinical Study Report — working draft',
    program_id: 'p1', template_id: '5d888ae5-4216-594e-bc5e-9c8bc22f9527',
    section_count: 16, status: 'draft' });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /wrong project or template/i);
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.tasks.length, 0);
});

for (const status of ['IN_REVIEW', 'APPROVED', 'FROZEN']) {
  test(`refuses a ${status} CSR as the reusable working draft`, async () => {
    const app = fakeApplication();
    await seed({ api: app.api, identity: app.identity, run: app.run() });
    const doc = app.state.documents[0];
    doc.status = status;
    const before = app.state.calls.length;
    await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
      /not an editable working draft with full document access/);
    assert.ok(app.state.calls.slice(before).every(call => call.method === 'GET'));
    assert.equal(app.state.documents.length, 1);
    assert.equal(app.state.tasks.length, 3);
  });
}

test('refuses a section-only CSR rather than pretending it is an accessible working document', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const doc = app.state.documents[0];
  doc.readScope = 'sections';
  const before = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /not an editable working draft with full document access/);
  assert.ok(app.state.calls.slice(before).every(call => call.method === 'GET'));
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.tasks.length, 3);
});

test('an actor without existing Authoring edit permission cannot seed a pending CSR review task', async () => {
  const app = fakeApplication({ cannotEditDocument: true });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /current account cannot edit this CSR document/);
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.tasks.length, 0);
  assert.ok(app.state.calls.some(c => c.method === 'GET' &&
    c.url.includes('/api/authoring/docs/df541fa2-')));
});

test('a changed document identity on the existing Authoring detail read is refused', async () => {
  const app = fakeApplication({ changedAuthoringDetail: true });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /current account cannot edit this CSR document/);
  assert.equal(app.state.tasks.length, 0);
});

test('an existing reviewer task whose origin no longer matches the document is not reused', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const reviewer = app.state.tasks.find(t => t.title.includes('Human-review'));
  reviewer.sourceDocumentId = '24a965fc-1c79-46f6-8b77-9e9bf77dca90';
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /does not link to its expected authoring document/);
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.tasks.length, 3);
});

test('no demo task is created when the existing Task Board reports missing stores', async () => {
  for (const options of [{ taskBoardPartial: true }, { taskBoardUnread: true }]) {
    const app = fakeApplication(options);
    await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
      /Task Board is incomplete or has unread sources/);
    assert.equal(app.state.tasks.length, 0);
    assert.equal(app.state.calls.filter(c => c.method === 'POST' && c.url === '/api/tasks/tasks').length, 0);
  }
});

test('ambiguous task titles cannot silently reuse another task in the same project', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  app.state.tasks.push({ ...app.state.tasks[0], taskId: 'another-task-row' });
  const before = app.state.calls.length;
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /malformed or duplicate task titles/);
  assert.ok(app.state.calls.slice(before).every(c => c.method === 'GET'));
  assert.equal(app.state.tasks.length, 4);
});

// 2026-11-10: an SOP that becomes effective gives each member a "Read and acknowledge" task of the same title. The guard
// read every title on the board as the seed's key, so a re-run stopped on two people's acknowledgements, which are not
// the seed's tasks at all. Only the seed's own titles must be unique.
test('two people\'s same-titled tasks that are not the seed\'s do not stop a re-run', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const ack = { ...app.state.tasks[0], title: 'Read and acknowledge SOP-001 v1.0' };
  app.state.tasks.push({ ...ack, taskId: 'ack-ana' }, { ...ack, taskId: 'ack-ava' });
  const before = app.state.tasks.length;
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  assert.equal(app.state.tasks.length, before, 'the re-run finds its own tasks and creates none');
});

test('the existing Task Board reread confirms each created task and its exact authoring document', async () => {
  const app = fakeApplication();
  const run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  const boardCalls = app.state.calls.filter(c => c.method === 'GET' && c.url === '/api/task-management/board');
  assert.equal(boardCalls.length, 2, 'read before and after creating three pending tasks');
  const reviewerTask = app.state.tasks.find(t => t.title.includes('Human-review'));
  assert.equal(reviewerTask.sourceDocumentId, app.state.documents[0].id);
  assert.equal(run.records.tally.created.task, 3);
});

test('a task creation acknowledgement without a saved task identity is not counted as complete', async () => {
  const app = fakeApplication();
  const originalApi = app.api;
  app.api = async (method, url, body) => {
    if (method === 'POST' && url === '/api/tasks/tasks') {
      app.state.calls.push({ method, url, body });
      return ok({ success: true, data: {} }, 200);
    }
    return originalApi(method, url, body);
  };
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /did not confirm the saved identity/);
  assert.equal(app.state.tasks.length, 0);
});

test('a task acknowledged but not visible in the refreshed board is not reported as verified', async () => {
  const app = fakeApplication();
  const originalApi = app.api;
  let boardReads = 0;
  app.api = async (method, url, body) => {
    if (method === 'GET' && url === '/api/task-management/board') {
      boardReads++;
      if (boardReads === 2) {
        app.state.calls.push({ method, url, body });
        return ok({ success: true, data: [], meta: { partial: false, unreadSources: [] } });
      }
    }
    return originalApi(method, url, body);
  };
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }),
    /did not reopen the exact persisted task/);
  assert.equal(app.state.tasks.length, 3, 'stored tasks are not deleted on a failed verification');
});

test('all review tasks remain pending; the seed never uses a review or approval ceremony', async () => {
  const app = fakeApplication();
  await seed({ api: app.api, identity: app.identity, run: app.run() });
  const reviewCreate = app.state.calls.find(c => c.method === 'POST' && c.url === '/api/tasks/tasks' &&
    c.body.taskType === 'review');
  assert.ok(reviewCreate);
  assert.equal(reviewCreate.body.sourceEntityType, 'authoring_document');
  assert.equal(reviewCreate.body.sourceEntityId, app.state.documents[0].id);
  assert.equal(reviewCreate.body.status, 'pending');
  assert.equal(reviewCreate.body.moduleData.authoringDocId, app.state.documents[0].id);
  assert.equal(app.state.calls.some(c => /\/request-review|\/e-sign|\/freeze|\/submit|\/dispatch/.test(c.url)), false);
});
