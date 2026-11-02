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
import { seed } from './packs/faux.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '../../..');
const sourcePath = path.join(root, 'docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const PROJECT_NAME = '[Demo · Faux] FBT-201 Phase 2 Clinical Study Report — SYNTHETIC';
const identity = Object.freeze({ email: 'demo@fictional.example', organizationId: '42',
  organizationName: 'Faux Biotech Therapeutics (fictional demo)' });

const ok = (json, status = 200) => ({ status, json, text: JSON.stringify(json) });

function fakeApplication({ organization = identity, otherType = false } = {}) {
  const state = { calls: [], clients: [], projects: [], vault: [], documents: [], tasks: [] };
  let nextDocumentId = 1;
  const api = async (method, url, body) => {
    state.calls.push({ method, url, body });
    if (method === 'GET' && url === '/api/clients') return ok({ clients: state.clients });
    if (method === 'POST' && url === '/api/clients') {
      const entry = { ...body, id: 7 };
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
      return ok({ data: { ...state.projects.find(p => p.id === 'p1'),
        program_type: otherType ? 'ind' : 'csr' } });
    }
    if (method === 'GET' && url.startsWith('/api/c2c/project-vault/p1/search?')) {
      const q = new URL(url, 'https://example.test').searchParams.get('q') ?? '';
      return ok({ data: { results: state.vault.filter(d => d.title.includes(q))
        .map(d => ({ ...d, current: true })) } });
    }
    if (method === 'POST' && url === '/api/vault/ingest') {
      assert.ok(body instanceof FormData, 'use the existing multipart Vault endpoint');
      assert.equal(body.get('programId'), 'p1');
      assert.equal(body.get('documentType'), 'OTHER');
      const upload = body.get('file');
      assert.ok(upload && typeof upload.arrayBuffer === 'function');
      const bytes = Buffer.from(await upload.arrayBuffer());
      const contentHash = sha256(bytes);
      const doc = { id: `v${nextDocumentId++}`,
        title: body.get('documentTitle'), contentHash,
        fileName: upload.name, bytes };
      state.vault.push(doc);
      return ok({ document: doc }, 201);
    }
    if (method === 'GET' && url === '/api/authoring/templates?search=Clinical%20Study%20Report') {
      return ok({ templates: [{
        id: '4331e7e3-7777-5c21-8c9b-0e2f56194e7e',
        entryId: 'component:clinical_study_report', section_count: 16,
      }] });
    }
    if (method === 'GET' && url === '/api/authoring/docs?status=all&programId=p1') {
      return ok({ success: true, documents: state.documents });
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
      };
      state.documents.push(doc);
      return ok({ success: true, document: doc, sections_seeded: 16 }, 201);
    }
    if (method === 'GET' && url === '/api/projects') {
      return ok({ data: [{ id: 11, regulatoryProgramId: 'p1' }] });
    }
    if (method === 'GET' && url === '/api/task-management/board') {
      return ok({ data: state.tasks });
    }
    if (method === 'POST' && url === '/api/tasks/tasks') {
      assert.equal(body.projectId, 11);
      assert.equal(body.status, 'pending');
      const row = { taskId: `task-${state.tasks.length + 1}`,
        title: body.title, project: String(body.projectId),
        ...(body.sourceEntityType === 'authoring_document'
          ? { sourceDocumentId: body.sourceEntityId } : {}) };
      state.tasks.push(row);
      return ok({ data: row }, 201);
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
  const original = gunzipSync(readFileSync(sourcePath));
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

test('seeds one CSR project, three Vault sources, a canonical CSR editor document and pending tasks', async () => {
  const app = fakeApplication(), run = app.run();
  await seed({ api: app.api, identity: app.identity, run });
  assert.equal(app.state.projects.length, 1);
  assert.equal(app.state.projects[0].program_type, 'csr');
  assert.equal(app.state.vault.length, 3);
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
    .reduce((sum, n) => sum + n, 0), 9);
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
  assert.equal(app.state.vault.length, 3);
  assert.equal(app.state.documents.length, 1);
  assert.equal(app.state.tasks.length, 3);
  assert.ok(run.records.tally.found['source-document'] >= 3);
  assert.equal(run.records.tally.found['authoring-document'], 1);
});

test('refuses wrong organization before any project or source read/write', async () => {
  const app = fakeApplication({ organization: { ...identity, organizationName: 'A different customer' } });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }), /organization/i);
  assert.equal(app.state.calls.length, 0);
});

test('never adopts an existing project with a different document type', async () => {
  const app = fakeApplication({ otherType: true });
  app.state.clients.push({ ...{ name: 'Faux Biotech Therapeutics', slug: 'faux-biotech-therapeutics-demo' }, id: 7 });
  app.state.projects.push({ id: 'p1', title: PROJECT_NAME, program_type: 'ind', client_workspace_id: 7 });
  await assert.rejects(seed({ api: app.api, identity: app.identity, run: app.run() }), /not the CSR document type/);
  assert.equal(app.state.vault.length, 0);
  assert.equal(app.state.tasks.length, 0);
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
