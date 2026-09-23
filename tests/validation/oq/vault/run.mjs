/**
 * OQ-002 — Operational Qualification: Vault.
 * Protocol: docs/validation/OQ-002-VAULT.md. Requirements: docs/validation/URS-002-VAULT.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { createProgram, ingestPdf, sha256 } from '../../lib/fixtures.mjs';

const run = await createRun({
  app: 'VAULT',
  appLabel: 'Vault',
  protocolId: 'OQ-002',
  protocolTitle: 'Operational Qualification — Vault',
});
const { step, state } = run;
const stamp = helpers.stamp();

await step(
  {
    id: 'OQ-VAULT-00',
    kind: 'prerequisite',
    urs: [],
    title: 'Prerequisite: a program to file into; baseline ledger length',
    action: 'POST /api/c2c/projects (IND); GET /api/audit-trail/ledger?limit=200',
    expected: 'Program created (201); ledger readable',
  },
  async ({ api, expect }) => {
    const p = await createProgram(api, expect, `OQ-002 Vault program ${stamp}`);
    state.programId = p.id;
    state.programName = p.name;
    const l = await api('GET', '/api/audit-trail/ledger?limit=200');
    state.ledgerBefore = (l.json?.data ?? []).length;
    return `program ${p.id}; ledger entries before: ${state.ledgerBefore}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-01',
    urs: ['URS-VAULT-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/c2c/project-vault/:programId with no Authorization header',
    expected: 'HTTP 401/403',
    dependsOn: ['OQ-VAULT-00'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/c2c/project-vault/${state.programId}`, undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-02',
    urs: ['URS-VAULT-003'],
    title: 'Disallowed file type refused at ingest',
    action: 'POST /api/vault/ingest with a .exe payload',
    expected: 'Refused with a 4xx and a message; nothing stored',
    dependsOn: ['OQ-VAULT-00'],
  },
  async ({ api, expect }) => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('MZ\u0000\u0000not-a-document')], { type: 'application/octet-stream' }), 'payload.exe');
    form.append('programId', state.programId);
    form.append('documentCode', 'payload.exe');
    form.append('documentTitle', 'OQ-002 disallowed');
    form.append('documentType', 'OTHER');
    const r = await api('POST', '/api/vault/ingest', form);
    expect(r.status >= 400 && r.status < 500, `expected 4xx, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}: ${JSON.stringify(r.json ?? r.text).slice(0, 200)}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-03',
    urs: ['URS-VAULT-002'],
    title: 'Ingest a PDF into the program vault',
    action: 'POST /api/vault/ingest (multipart: file, programId, documentCode, documentTitle, documentType=PROTOCOL)',
    expected: 'HTTP 201; document.id returned; document.contentHash equals the SHA-256 of the uploaded bytes',
    dependsOn: ['OQ-VAULT-00'],
  },
  async ({ api, expect }) => {
    const title = `OQ-002 Protocol ${stamp}`;
    const ing = await ingestPdf(api, expect, { programId: state.programId, title });
    state.doc = ing.document;
    state.docTitle = title;
    state.bytesSha = ing.sha256;
    expect(ing.document?.id, 'no document id', ing.document);
    expect(ing.document.contentHash === ing.sha256, `contentHash ${ing.document.contentHash} != local sha256 ${ing.sha256}`, ing.document);
    return `document ${ing.document.id}; contentHash matches sha256 ${ing.sha256.slice(0, 12)}…; filing: ${JSON.stringify(ing.filing).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-04',
    urs: ['URS-VAULT-004'],
    title: 'Vault read model lists the document',
    action: 'GET /api/c2c/project-vault/:programId',
    expected: 'success:true; documentCount ≥ 1; the tree names the document',
    dependsOn: ['OQ-VAULT-03'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/c2c/project-vault/${state.programId}`);
    expect(r.status === 200 && r.json?.success === true, `expected 200 success, got ${r.status}`, r.json);
    const d = r.json.data;
    expect((d.documentCount ?? 0) >= 1, 'documentCount < 1', d);
    expect(JSON.stringify(d.tree ?? []).includes(state.docTitle) || JSON.stringify(d).includes(state.doc.id), 'document not in tree', d);
    return `documentCount=${d.documentCount}; standard=${d.standard}; tree nodes=${(d.tree ?? []).length}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-05',
    urs: ['URS-VAULT-005'],
    title: 'Search finds the document by title',
    action: 'GET /api/c2c/project-vault/:programId/search?q=<title fragment>',
    expected: 'results contain the ingested document id',
    dependsOn: ['OQ-VAULT-03'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/c2c/project-vault/${state.programId}/search?q=${encodeURIComponent('OQ-002 Protocol')}`);
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const results = r.json?.data?.results ?? [];
    expect(results.some((x) => x.id === state.doc.id), 'document not in search results', r.json?.data);
    return `total=${r.json.data.total}; hit ${state.doc.id}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-06',
    urs: ['URS-VAULT-006'],
    title: 'Download returns the stored bytes unchanged',
    action: 'GET /api/c2c/project-vault/:programId/documents/:documentId/download',
    expected: 'HTTP 200; SHA-256 of the body equals the hash recorded at ingest',
    dependsOn: ['OQ-VAULT-03'],
  },
  async ({ baseUrl, auth, expect, attach }) => {
    const res = await fetch(`${baseUrl}/api/c2c/project-vault/${state.programId}/documents/${state.doc.id}/download`, {
      headers: { Authorization: `Bearer ${auth.accessToken}`, Origin: baseUrl },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    attach('download.json', { status: res.status, contentType: res.headers.get('content-type'), bytes: buf.length, sha256: got, expected: state.bytesSha });
    expect(res.status === 200, `expected 200, got ${res.status}`, buf.toString('utf8').slice(0, 200));
    expect(got === state.bytesSha, `downloaded sha256 ${got} != ingested ${state.bytesSha}`);
    return `${buf.length} bytes, sha256 ${got.slice(0, 12)}… matches`;
  },
);

await step(
  {
    id: 'OQ-VAULT-07',
    urs: ['URS-VAULT-007'],
    title: 'A person confirms the filing decision',
    action: 'POST /api/c2c/project-vault/:programId/file {documentId, folderId:"module-5", note}; then the same with a folder from another modality ("k510")',
    expected: 'Filing into Module 5 answers success:true with the folder recorded; a folder outside the program\'s vault view is refused (4xx), not stored',
    dependsOn: ['OQ-VAULT-03'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/c2c/project-vault/${state.programId}/file`, {
      documentId: state.doc.id,
      folderId: 'module-5',
      note: 'OQ-002 step 07 — filed into Module 5 by validation runner',
    });
    expect(r.status === 200 && r.json?.success === true, `expected 200 success, got ${r.status}`, r.json);
    expect(r.json.filing?.folderId === 'module-5', 'folderId not recorded', r.json.filing);
    const bad = await api('POST', `/api/c2c/project-vault/${state.programId}/file`, { documentId: state.doc.id, folderId: 'k510' });
    expect(bad.status >= 400 && bad.status < 500, `cross-modality folder expected 4xx, got ${bad.status}`, bad.json);
    return `filed: ${JSON.stringify(r.json.filing).slice(0, 200)}; k510 → ${bad.status} ${bad.json?.error}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-08',
    urs: ['URS-VAULT-008'],
    title: 'The hash-chained audit log verifies after the governed writes',
    action: 'GET /api/c2c/actions/verify-chain',
    expected: 'ok:true — the audit_logs chain is intact after ingest and filing',
    dependsOn: ['OQ-VAULT-07'],
  },
  async ({ api, expect }) => {
    const v = await api('GET', '/api/c2c/actions/verify-chain');
    expect(v.status === 200 && v.json?.ok === true, `verify-chain expected ok, got ${v.status}`, v.json);
    return `verify-chain ${JSON.stringify(v.json).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-VAULT-08b',
    urs: ['URS-VAULT-008'],
    title: 'Ingest and filing appear on the organisation audit ledger surface',
    action: 'GET /api/audit-trail/ledger?limit=200 (the read model behind /concept2cure/audit-trail)',
    expected: 'The ledger window lists the ingest and the filing of this document, each carrying record/previous hashes, and the server\'s chain verdict says the chain verifies (meta.chain.ok = true)',
    dependsOn: ['OQ-VAULT-07'],
    note: 'The ledger surface reads audit_logs merged with audit_events (server/routes/audit-trail-ledger.routes.ts) — the chained store vault ingest and filing write through server/services/auditService.ts writeChainedAuditRow. The read is a newest-first WINDOW (limit), so a ledger already longer than the window cannot "grow"; the observable claim is that this document\'s events are in it, hash-chained, and that the server\'s own verdict (meta.chain) says the chain verifies. A verdict that is present but ok=false is a failure: v0.2 asserted only presence, and the 2026-09-21 record passed this step over "server chain verdict ok=false over 33 row(s)". If this step fails, the surface a user is told to inspect does not show the writes the launch apps make.',
  },
  async ({ api, expect }) => {
    const l = await api('GET', '/api/audit-trail/ledger?limit=200');
    const rows = l.json?.data ?? [];
    const mine = rows.filter((r) => String(r.target ?? '').includes(state.doc.id));
    expect(mine.length >= 2, `ledger window does not list this document\'s ingest and filing (${mine.length} entr(ies) for ${state.doc.id} in ${rows.length})`, rows.slice(0, 3));
    const unchained = mine.filter((r) => !(r.hash && r.prevHash));
    expect(unchained.length === 0, 'an entry for this document lacks chain hashes', unchained);
    const chain = l.json?.meta?.chain;
    expect(chain && typeof chain.ok === 'boolean', 'the ledger carried no server chain verdict (meta.chain)', l.json?.meta);
    expect(chain.ok === true, `the server's chain verdict says the audit chain does not verify (ok=false over ${chain.rowsChecked} row(s))`, chain);
    return `ledger window ${rows.length} (baseline ${state.ledgerBefore}); ${mine.length} chained entr(ies) for the document: ${mine.map((r) => r.event).join(', ')}; server chain verdict ok=${chain.ok} over ${chain.rowsChecked} row(s)`;
  },
);

await step(
  {
    id: 'OQ-VAULT-09',
    kind: 'unscripted',
    urs: ['URS-VAULT-009'],
    title: 'Vault surface renders the data room with the document',
    action: 'Open /concept2cure/vault with the program selected',
    expected: 'The data room renders and the document title is visible',
    dependsOn: ['OQ-VAULT-03'],
    // The surface reads GET /api/c2c/project-vault/:id, which OQ-VAULT-04 shows
    // answers 500 on this installation (IQ-DEV-001); attribute from the log.
    attributeEnvFromLog: true,
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/vault');
    await ctx.expectText(state.docTitle);
    await ctx.screenshot();
    return 'data room shows the document';
  },
);

await step(
  {
    id: 'OQ-VAULT-10',
    urs: ['URS-VAULT-010'],
    title: 'A program the organisation does not own is not readable',
    action: 'GET /api/c2c/project-vault/<random uuid>',
    expected: 'HTTP 404',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/c2c/project-vault/00000000-0000-4000-8000-000000000000');
    expect(r.status === 404, `expected 404, got ${r.status}`, r.json);
    return 'HTTP 404';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
