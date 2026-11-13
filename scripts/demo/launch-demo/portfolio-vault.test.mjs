/** Project-scoped folder filing and byte verification for the existing portfolio seed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import JSZip from 'jszip';
import { ensurePortfolioFolders, ensurePortfolioVaultFile } from './packs/portfolio-vault.mjs';
import { buildInternalHandoverFiles, ensureInternalHandover } from './packs/portfolio-handover.mjs';
import { ALL_HEADINGS, narrative, STUDIES } from './packs/portfolio-content.mjs';
import { createApiClient } from '../../../tests/validation/lib/harness.mjs';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const ROOT = '[Demo · Portfolio] Synthetic study records';
const DOCUMENTS = 'Protocol and analysis · SYNTHETIC';
const DATA = 'Study data · SYNTHETIC';
const TITLE = '[Demo · Portfolio] Synthetic protocol';
const BYTES = Buffer.from('%PDF-1.4\nSYNTHETIC internal demonstration material\n%%EOF\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();
const decodeXml = text => text.replace(/&#x([a-f\d]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const project = overrides => ({ id: PROGRAM, title: 'Fictional project — SYNTHETIC', ...overrides });
const spec = overrides => ({ label: 'Synthetic protocol', bytes: () => BYTES,
  fileName: 'synthetic-protocol.pdf', mime: 'application/pdf', code: 'SYN-PROTOCOL',
  documentType: 'OTHER', folderId: 'uf:2', ...overrides });
const response = (json, status = 200) => ({ status, ok: status < 400, json, text: JSON.stringify(json) });
const completeFolders = () => [
  { folderId: 'uf:1', name: ROOT, parentFolderId: null },
  { folderId: 'uf:2', name: DOCUMENTS, parentFolderId: 'uf:1' },
  { folderId: 'uf:3', name: DATA, parentFolderId: 'uf:1' },
];
const document = overrides => ({ id: '33333333-3333-4333-8333-333333333333', title: TITLE,
  contentHash: hash(BYTES), folderId: 'uf:2', placementStatus: 'confirmed', bytes: BYTES, ...overrides });

/** Stateful route double: unrelated project records are never visible in this project's API. */
function fixture({ folders = [], documents = [], otherDocuments = [], pendingStore = false,
  truncated = false, pageSize = 50, downloadedBytes, downloadStatus = 200 } = {}) {
  const state = { folders: folders.map(row => ({ ...row })), documents: documents.map(row => ({ ...row })),
    otherDocuments, calls: [], mutations: [], tallies: [], folderCounter: 100, documentCounter: 100 };
  const ctx = {
    run: { step: async (_label, action) => action(), record() {}, note() {} },
    tally: { created: type => state.tallies.push(['created', type]), found: type => state.tallies.push(['found', type]) },
    api: async (method, route, body, options = {}) => {
      state.calls.push({ method, route, body, options });
      if (method !== 'GET') state.mutations.push({ method, route, body });
      const url = new URL(route, 'http://demo.invalid');
      const scoped = `/api/c2c/project-vault/${PROGRAM}`;
      const requestKey = `${method} ${url.pathname}`;
      const folderTree = parent => state.folders.filter(row => row.parentFolderId === parent).map(row => ({
        id: `cab-${row.folderId}`, label: row.name, title: row.name, kind: 'person', children: folderTree(row.folderId),
      }));
      if (requestKey === `GET ${scoped}`) return response({ success: true,
        data: { programId: PROGRAM, pendingStore, uploadsWindow: { truncated },
          tree: [{ id: 'cabinet', label: 'Files', children: folderTree(null) }] } });
      if (requestKey === `POST ${scoped}/folders`) {
        assert.equal(typeof body.reason, 'string');
        assert.ok(body.reason.trim().length >= 8, 'folder creation carries its governed reason');
        const row = { folderId: `uf:${++state.folderCounter}`, name: body.name, parentFolderId: body.parentFolderId ?? null };
        state.folders.push(row);
        return response({ success: true, folder: row });
      }
      if (requestKey === `GET ${scoped}/search`) {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        assert.ok(url.searchParams.get('q'), 'lookup is a scoped search, never a whole-library read');
        const rows = state.documents.slice(offset, offset + pageSize).map(({ bytes: _bytes, ...row }) => row);
        return response({ success: true, data: { results: rows, total: state.documents.length,
          limit: pageSize, offset } });
      }
      if (requestKey === 'POST /api/vault/ingest') {
        assert.ok(body instanceof FormData);
        assert.equal(body.get('programId'), PROGRAM, 'ingest binds this project');
        assert.ok(body.get('folderId'), 'ingest names an actual project folder');
        const file = body.get('file');
        const bytes = Buffer.from(await file.arrayBuffer());
        const row = { id: `44444444-4444-4444-8444-${String(++state.documentCounter).padStart(12, '0')}`,
          title: body.get('documentTitle'), contentHash: hash(bytes), folderId: body.get('folderId'),
          placementStatus: 'confirmed', bytes };
        state.documents.push(row);
        return response({ success: true, document: { id: row.id, contentHash: row.contentHash },
          filing: { folderId: row.folderId, placementStatus: row.placementStatus } }, 201);
      }
      if (requestKey === `POST ${scoped}/file`) {
        const row = state.documents.find(candidate => candidate.id === body.documentId);
        assert.ok(row, 'only documents in this project can be filed');
        assert.equal(body.confirm, true);
        assert.equal(typeof body.note, 'string');
        row.folderId = body.folderId;
        row.placementStatus = 'confirmed';
        return response({ success: true, filing: { folderId: row.folderId, placementStatus: row.placementStatus } });
      }
      const download = new RegExp(`^${scoped}/documents/([^/]+)/download$`).exec(url.pathname);
      if (method === 'GET' && download) {
        assert.equal(options.binary, true, 'download must preserve actual bytes, not decode PDF/DOCX as text');
        const row = state.documents.find(candidate => candidate.id === decodeURIComponent(download[1]));
        assert.ok(row, 'download is scoped to this project');
        return { status: downloadStatus, ok: downloadStatus < 400, json: null, text: '',
          bytes: downloadedBytes ?? row.bytes };
      }
      assert.fail(`Unexpected API call: ${method} ${route}`);
    },
  };
  return { ctx, state };
}

test('fresh folder tree is project linked, nested, and reused without writes on rerun', async () => {
  const { ctx, state } = fixture();
  const first = await ensurePortfolioFolders(ctx, project(), { hasSource: true });
  assert.deepEqual(Object.keys(first).sort(), ['data', 'documents', 'parent']);
  assert.equal(state.folders.length, 3);
  assert.deepEqual(state.folders.map(row => [row.name, row.parentFolderId]), [
    [ROOT, null], [DOCUMENTS, first.parent], [DATA, first.parent],
  ]);
  assert.equal(state.folders.find(row => row.name === DOCUMENTS).folderId, first.documents);
  assert.equal(state.folders.find(row => row.name === DATA).folderId, first.data);
  const before = state.mutations.length;
  assert.deepEqual(await ensurePortfolioFolders(ctx, project(), { hasSource: true }), first);
  assert.equal(state.mutations.length, before);
});

test('planning folders omit empty study-data folder', async () => {
  const { ctx, state } = fixture();
  const folders = await ensurePortfolioFolders(ctx, project(), { hasSource: false });
  assert.ok(folders.parent && folders.documents);
  assert.equal(folders.data, undefined);
  assert.deepEqual(state.folders.map(row => row.name), [ROOT, DOCUMENTS]);
});

test('duplicate exact folder under one parent is refused without writes', async () => {
  const folders = completeFolders();
  folders.push({ folderId: 'uf:4', name: DOCUMENTS, parentFolderId: 'uf:1' });
  const { ctx, state } = fixture({ folders });
  await assert.rejects(ensurePortfolioFolders(ctx, project(), { hasSource: true }), /ambig|duplicate|more than one|two/i);
  assert.equal(state.mutations.length, 0);
});

test('a same-name child elsewhere in the project is refused instead of adopted or moved', async () => {
  const folders = completeFolders();
  folders[1].parentFolderId = null;
  const { ctx, state } = fixture({ folders });
  await assert.rejects(ensurePortfolioFolders(ctx, project(), { hasSource: true }), /elsewhere|another|parent|outside/i);
  assert.equal(state.mutations.length, 0);
});

test('a named parent moved under a binder is not mistaken for a top-level folder', async () => {
  const { ctx, state } = fixture();
  const baseApi = ctx.api;
  ctx.api = async (method, route, body, options) => {
    if (method === 'GET' && route === `/api/c2c/project-vault/${PROGRAM}`) return response({ success: true,
      data: { uploadsWindow: { truncated: false }, tree: [{ id: 'cabinet', children: [
        { id: 'cab-bn:5', kind: 'binder', label: 'Clinical study reports', children: [
          { id: 'cab-uf:1', kind: 'person', label: ROOT, children: [] },
        ] },
      ] }] } });
    return baseApi(method, route, body, options);
  };
  await assert.rejects(ensurePortfolioFolders(ctx, project(), { hasSource: true }), /parent|elsewhere|another/i);
  assert.equal(state.mutations.length, 0);
});

for (const incomplete of [{ pendingStore: true }, { truncated: true }]) {
  test(`unreadable folder tree (${Object.keys(incomplete)[0]}) is not treated as empty`, async () => {
    const { ctx, state } = fixture(incomplete);
    await assert.rejects(ensurePortfolioFolders(ctx, project(), { hasSource: true }), /pending|provision|truncat|complete|unavailable/i);
    assert.equal(state.mutations.length, 0);
  });
}

test('new file binds project and folder, preserves bytes, then downloads and verifies them', async () => {
  const { ctx, state } = fixture();
  const result = await ensurePortfolioVaultFile(ctx, project(), spec({ bytes: async () => BYTES }));
  assert.ok(result.id);
  assert.equal(result.sha256, hash(BYTES));
  assert.equal(state.documents.length, 1);
  assert.equal(state.documents[0].title, TITLE);
  assert.equal(state.documents[0].folderId, 'uf:2');
  assert.ok(state.documents[0].bytes.equals(BYTES));
  const upload = state.calls.find(call => call.route === '/api/vault/ingest').body;
  assert.equal(upload.get('documentCode'), 'SYN-PROTOCOL');
  assert.equal(upload.get('documentType'), 'OTHER');
  assert.equal(upload.get('file').name, 'synthetic-protocol.pdf');
  assert.ok(state.calls.some(call => call.route.endsWith(`/documents/${result.id}/download`)));
  const before = state.mutations.length;
  const rerun = await ensurePortfolioVaultFile(ctx, project(), spec());
  assert.equal(rerun.id, result.id);
  assert.equal(state.mutations.length, before, 'unchanged rerun never reuploads or refiles');
});

test('existing matching file is found through all scoped search pages and its bytes are checked', async () => {
  const target = document();
  const { ctx, state } = fixture({ pageSize: 1, documents: [document({ id: 'unrelated', title: 'Other document' }), target] });
  const result = await ensurePortfolioVaultFile(ctx, project(), spec());
  assert.equal(result.id, target.id);
  assert.equal(state.calls.filter(call => call.route.includes('/search?')).length, 2);
  assert.equal(state.mutations.length, 0);
  assert.ok(state.calls.some(call => call.route.endsWith(`/documents/${target.id}/download`)));
});

test('a matching title in another project is not adopted', async () => {
  const foreign = document({ projectId: OTHER_PROGRAM });
  const { ctx, state } = fixture({ otherDocuments: [foreign] });
  const result = await ensurePortfolioVaultFile(ctx, project(), spec());
  assert.notEqual(result.id, foreign.id);
  assert.equal(state.documents.length, 1);
  assert.equal(state.otherDocuments.length, 1);
  assert.ok(state.calls.every(call => !call.route.includes(OTHER_PROGRAM)));
});

test('duplicate exact-title documents across search pages refuse before mutation', async () => {
  const { ctx, state } = fixture({ pageSize: 1, documents: [document(), document({ id: 'second-copy' })] });
  await assert.rejects(ensurePortfolioVaultFile(ctx, project(), spec()), /ambig|duplicate|more than one|two|2/i);
  assert.equal(state.mutations.length, 0);
});

test('existing edited bytes are refused without overwrite, upload, or filing', async () => {
  const { ctx, state } = fixture({ documents: [document({ contentHash: hash(Buffer.from('human edited bytes')) })] });
  await assert.rejects(ensurePortfolioVaultFile(ctx, project(), spec()), /hash|bytes|changed|differ/i);
  assert.equal(state.mutations.length, 0);
});

for (const placement of [{ folderId: null, placementStatus: null }, { folderId: 'uf:2', placementStatus: 'proposed' }]) {
  test(`matching ${placement.placementStatus ?? 'unfiled'} file is confirmed through the actual filing route`, async () => {
    const { ctx, state } = fixture({ documents: [document(placement)] });
    const result = await ensurePortfolioVaultFile(ctx, project(), spec());
    assert.equal(result.id, state.documents[0].id);
    assert.equal(state.documents[0].placementStatus, 'confirmed');
    assert.equal(state.documents[0].folderId, 'uf:2');
    assert.deepEqual(state.mutations.map(call => call.route), [`/api/c2c/project-vault/${PROGRAM}/file`]);
  });
}

test('an existing confirmed placement elsewhere is refused instead of silently moved', async () => {
  const { ctx, state } = fixture({ documents: [document({ folderId: 'uf:99' })] });
  await assert.rejects(ensurePortfolioVaultFile(ctx, project(), spec()), /folder|placement|elsewhere|another/i);
  assert.equal(state.mutations.length, 0);
});

for (const existing of [false, true]) {
  test(`corrupt downloaded bytes cannot qualify a ${existing ? 'found' : 'new'} file`, async () => {
    const { ctx } = fixture({ documents: existing ? [document()] : [], downloadedBytes: Buffer.from('corrupt download') });
    await assert.rejects(ensurePortfolioVaultFile(ctx, project(), spec()), /download|hash|bytes|differ/i);
  });
}

test('an unsuccessful download cannot qualify a matching metadata hash', async () => {
  const { ctx, state } = fixture({ documents: [document()], downloadStatus: 403 });
  await assert.rejects(ensurePortfolioVaultFile(ctx, project(), spec()), /download|403|HTTP/i);
  assert.equal(state.mutations.length, 0);
});

test('archived project rerun revalidates existing folders and bytes without mutation', async () => {
  const { ctx, state } = fixture({ folders: completeFolders(), documents: [document()] });
  assert.deepEqual(await ensurePortfolioFolders(ctx, project({ readOnly: true }), { hasSource: true }),
    { parent: 'uf:1', documents: 'uf:2', data: 'uf:3' });
  assert.equal((await ensurePortfolioVaultFile(ctx, project({ readOnly: true }), spec())).id, state.documents[0].id);
  assert.equal(state.mutations.length, 0);
});

test('archived project with missing folder refuses without creating it', async () => {
  const { ctx, state } = fixture();
  await assert.rejects(ensurePortfolioFolders(ctx, project({ readOnly: true }), { hasSource: true }), /read.only|archiv|missing/i);
  assert.equal(state.mutations.length, 0);
});

for (const documents of [[], [document({ placementStatus: 'proposed' })]]) {
  test(`archived project refuses ${documents.length ? 'filing repair' : 'missing document'} without mutation`, async () => {
    const { ctx, state } = fixture({ documents });
    await assert.rejects(ensurePortfolioVaultFile(ctx, project({ readOnly: true }), spec()), /read.only|archiv|missing|fil/i);
    assert.equal(state.mutations.length, 0);
  });
}

test('real HTTP client preserves binary bytes while JSON and refused downloads keep their existing contracts', async () => {
  const binary = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x80, 0xff, 0xfe, 0xc3, 0x28]);
  const requests = [];
  const records = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url, authorization: req.headers.authorization });
    if (req.url === '/binary') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(binary);
    } else {
      const refused = req.url === '/refused';
      res.writeHead(refused ? 403 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(refused ? { success: false, error: 'FORBIDDEN' } : { success: true, value: 'unchanged JSON' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const api = createApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}`,
      accessToken: 'synthetic-test-token', onRecord: row => records.push(row) });
    const download = await api('GET', '/binary', undefined, { binary: true });
    assert.ok(Buffer.isBuffer(download.bytes));
    assert.ok(download.bytes.equals(binary), 'invalid UTF-8 and ZIP header bytes survive an actual HTTP response');
    assert.equal(download.text, '');
    assert.equal(download.json, null);
    assert.equal(records[0].response.body, `[binary: ${binary.length} bytes]`);
    const json = await api('GET', '/json');
    assert.deepEqual(json.json, { success: true, value: 'unchanged JSON' });
    assert.equal(json.bytes, undefined);
    assert.equal(json.text, JSON.stringify(json.json));
    const refused = await api('GET', '/refused', undefined, { binary: true });
    assert.equal(refused.status, 403);
    assert.deepEqual(refused.json, { success: false, error: 'FORBIDDEN' });
    assert.equal(refused.bytes, undefined);
    assert.deepEqual(requests.map(row => row.path), ['/binary', '/json', '/refused']);
    assert.ok(requests.every(row => row.authorization === 'Bearer synthetic-test-token'));
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('internal handover artifacts are deterministic readable files with an exact payload inventory', async () => {
  const first = await buildInternalHandoverFiles();
  const second = await buildInternalHandoverFiles();
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map(file => file.fileName)).size, 4);
  const payloads = await Promise.all(first.map(async file => ({ ...file, buffer: Buffer.from(await file.bytes()) })));
  for (let i = 0; i < first.length; i += 1) {
    assert.equal(first[i].fileName, second[i].fileName);
    assert.ok(payloads[i].buffer.equals(Buffer.from(await second[i].bytes())), `${first[i].fileName} bytes are stable across reruns`);
    assert.match(first[i].label, /synthetic/i);
  }
  const pdf = payloads.find(file => file.mime === 'application/pdf');
  assert.ok(pdf);
  assert.equal(pdf.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.match(pdf.buffer.toString('latin1'), /SYNTHETIC/);
  const word = payloads.find(file => file.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(word);
  const reopened = await JSZip.loadAsync(word.buffer, { checkCRC32: true });
  assert.ok(reopened.file('[Content_Types].xml'));
  const xml = await reopened.file('word/document.xml').async('string');
  const text = decodeXml([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join(' '));
  assert.match(text, /SYNTHETIC/);
  assert.match(text, /unapproved/i);
  assert.match(text, /not[^.]*rendition/i);
  assert.ok(normalize(text).includes('The project stays active so these reference files can be opened during presentation.'));
  assert.ok(normalize(text).includes('Export Completed internal handover · SYNTHETIC'));
  const reference = narrative(STUDIES.find(study => study.key === 'qlm118-101'));
  for (const heading of ALL_HEADINGS) {
    assert.ok(normalize(text).includes(normalize(reference[heading])), `Word report preserves the existing ${heading} study narrative`);
  }
  // Read actual paragraph strings, omitting 8pt page headers/footers so a page break cannot interrupt a result.
  const pdfText = [...pdf.buffer.toString('latin1').matchAll(/BT \/F1 11 Tf \d+ \d+ Td \(((?:\\.|[^\\)])*)\) Tj ET/g)]
    .map(match => match[1].replace(/\\([\\()])/g, '$1')).join(' ');
  assert.ok(normalize(pdfText).includes('The project stays active so these reference files can be opened during presentation.'));
  assert.ok(normalize(pdfText).includes('Export Completed internal handover · SYNTHETIC'));
  for (const heading of ['efficacy', 'safety']) {
    assert.ok(normalize(pdfText).includes(normalize(reference[heading])), `PDF preserves the full ${heading} results, including pooled denominators and event counts`);
  }
  const jsonFiles = payloads.filter(file => file.mime === 'application/json').map(file => ({ ...file, value: JSON.parse(file.buffer.toString('utf8')) }));
  assert.equal(jsonFiles.length, 2);
  const source = jsonFiles.find(file => file.value.format === 'concept2cure.csr-source.v1');
  assert.ok(source, 'handover data uses the existing synthetic clinical-source schema');
  assert.ok(source.value.participants.length > 0);
  assert.ok(source.value.studyData.treatmentArms.length > 0);
  const inventory = jsonFiles.find(file => file.value.completion === 'internal demonstration handover only');
  assert.ok(inventory);
  assert.match(inventory.value.notice, /SYNTHETIC/);
  assert.equal(inventory.value.files.length, 3);
  for (const item of inventory.value.files) {
    const actual = payloads.find(file => file.fileName === item.fileName);
    assert.ok(actual, 'inventory identifies a real package payload');
    assert.notEqual(actual.fileName, inventory.fileName, 'inventory does not claim its own recursive hash');
    assert.equal(item.sha256, hash(actual.buffer));
    assert.equal(item.byteLength, actual.buffer.length);
    assert.equal(item.mime, actual.mime);
  }
});

function handoverFixture(options = {}) {
  const { ctx, state } = fixture(options);
  const baseApi = ctx.api;
  state.projectStatus = 'active';
  state.tasks = [];
  ctx.api = async (method, route, body, opts) => {
    const key = `${method} ${route}`;
    if (key === 'GET /api/projects') {
      state.calls.push({ method, route, body });
      return response([{ id: 7, regulatoryProgramId: PROGRAM }]);
    }
    if (key === 'GET /api/task-management/board') {
      state.calls.push({ method, route, body });
      return response({ success: true, data: state.tasks, meta: { partial: false, unreadSources: [] } });
    }
    if (key === 'POST /api/tasks/tasks') {
      state.calls.push({ method, route, body });
      state.mutations.push({ method, route, body });
      assert.equal(body.projectId, 7);
      const row = { taskId: 'task-1', title: body.title, project: 7, status: body.status };
      state.tasks.push(row);
      return response({ success: true, data: row }, 201);
    }
    if (key === 'PATCH /api/tasks/tasks/task-1') {
      state.calls.push({ method, route, body });
      state.mutations.push({ method, route, body });
      const downloads = state.calls.filter(call => call.method === 'GET' && call.route.endsWith('/download'));
      assert.equal(downloads.length, 4, 'all four handover files are downloaded before completing the delivery task');
      Object.assign(state.tasks[0], body);
      return response({ success: true, data: state.tasks[0] });
    }
    if (key === `POST /api/c2c/projects/${PROGRAM}/archive` || key === `POST /api/c2c/projects/${PROGRAM}/unarchive`) {
      state.calls.push({ method, route, body });
      state.mutations.push({ method, route, body });
      assert.fail('The demo seed must not archive or restore the handover project');
    }
    if (key === `GET /api/c2c/projects/${PROGRAM}`) {
      state.calls.push({ method, route, body });
      return response({ id: PROGRAM, status: state.projectStatus });
    }
    return baseApi(method, route, body, opts);
  };
  return { ctx, state };
}

test('internal handover verifies every file, completes real Tasking, stays openable, and respects an archived rerun', async () => {
  const { ctx, state } = handoverFixture();
  const delivered = await ensureInternalHandover(ctx, project());
  assert.equal(state.documents.length, 4);
  assert.equal(state.folders.length, 2, 'handover creates a parent and its one populated delivery folder');
  assert.equal(state.folders[1].parentFolderId, state.folders[0].folderId);
  assert.equal(state.tasks[0].status, 'completed');
  assert.equal(state.projectStatus, 'active');
  assert.equal(delivered.deliveryComplete, true);
  assert.equal(delivered.projectStatus, 'active');
  assert.equal(delivered.archived, false);
  assert.equal(state.mutations.at(-1).route, '/api/tasks/tasks/task-1');
  const completionIndex = state.calls.findIndex(call => call.method === 'PATCH' && call.route === '/api/tasks/tasks/task-1');
  assert.ok(!state.calls.slice(completionIndex + 1).some(call => call.method === 'POST'), 'delivery completion is followed by verification reads only');
  assert.ok(state.calls.at(-1).route === `/api/c2c/projects/${PROGRAM}`, 'the openable project status is read back');
  const before = state.mutations.length;
  state.projectStatus = 'archived'; // A person may already have archived an older delivered example.
  const retained = await ensureInternalHandover(ctx, project({ readOnly: true, status: 'archived' }));
  assert.equal(state.mutations.length, before, 'an archived handover rerun only revalidates retained records');
  assert.equal(retained.deliveryComplete, true);
  assert.equal(retained.projectStatus, 'archived');
  assert.equal(retained.archived, true);
  assert.equal(state.documents.length, 4);
  assert.equal(state.calls.filter(call => call.method === 'GET' && call.route.endsWith('/download')).length, 8);
  assert.ok(!state.calls.some(call => /\/(?:archive|unarchive)$/.test(call.route)), 'retained archives are never restored automatically');
});

test('corrupt handover download prevents delivery completion', async () => {
  const { ctx, state } = handoverFixture({ downloadedBytes: Buffer.from('corrupt handover download') });
  await assert.rejects(ensureInternalHandover(ctx, project()), /hash|bytes|download/i);
  assert.equal(state.projectStatus, 'active');
  assert.equal(state.tasks.length, 0, 'failed file verification cannot produce a completed delivery task');
  assert.ok(!state.mutations.some(call => call.route.endsWith('/archive')));
});
