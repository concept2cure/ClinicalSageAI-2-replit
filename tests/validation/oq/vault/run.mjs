/**
 * OQ-002 — Operational Qualification: Vault.
 * Protocol: docs/validation/OQ-002-VAULT.md. Requirements: docs/validation/URS-002-VAULT.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { createProgram, ingestPdf, makePdfBuffer, sha256 } from '../../lib/fixtures.mjs';
import { requireApprover, requireSigner, signerCode } from '../../lib/credentials.mjs';
import { runFilingAndCompareSteps } from './steps-filing-compare.mjs';

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

await step(
  {
    id: 'OQ-VAULT-11',
    urs: ['URS-VAULT-011'],
    title: 'A new version of a document is checked in, numbered and linked by the server',
    action:
      'POST /api/vault/ingest with supersedesDocumentId = the OQ-VAULT-03 document and new bytes; then the same ' +
      'bytes again against the new version; then new bytes against the OQ-VAULT-03 document again',
    expected:
      'HTTP 201 with version 2.0 and the OQ-VAULT-03 document code; then 409 CONTENT_ALREADY_A_VERSION; ' +
      'then 409 VERSION_NOT_CURRENT naming 2.0',
    dependsOn: ['OQ-VAULT-03'],
  },
  async ({ api, expect }) => {
    const send = async (headId, text) => {
      const form = new FormData();
      form.append('file', new Blob([makePdfBuffer(text)], { type: 'application/pdf' }), 'next-version.pdf');
      form.append('programId', state.programId);
      form.append('documentCode', 'ignored-for-a-new-version');
      form.append('documentTitle', state.docTitle);
      form.append('documentType', 'PROTOCOL');
      form.append('supersedesDocumentId', headId);
      return api('POST', '/api/vault/ingest', form);
    };
    const next = await send(state.doc.id, `${state.docTitle} revision 2`);
    expect(next.status === 201, `expected 201, got ${next.status}`, next.json);
    expect(next.json.document.version === '2.0', `version ${next.json.document.version}, expected 2.0`, next.json.document);
    expect(next.json.document.documentCode === state.doc.documentCode, 'document code changed', next.json.document);
    state.v2 = next.json.document;
    const again = await send(next.json.document.id, `${state.docTitle} revision 2`);
    expect(again.status === 409 && again.json?.error?.code === 'CONTENT_ALREADY_A_VERSION', `expected 409 CONTENT_ALREADY_A_VERSION, got ${again.status}`, again.json);
    const stale = await send(state.doc.id, `${state.docTitle} revision 3`);
    expect(stale.status === 409 && stale.json?.error?.code === 'VERSION_NOT_CURRENT', `expected 409 VERSION_NOT_CURRENT, got ${stale.status}`, stale.json);
    expect(/2\.0/.test(stale.json.error.message ?? ''), 'the refusal does not name the current version', stale.json);
    return `version ${next.json.document.version} (${next.json.document.id}) of ${next.json.document.documentCode}; known bytes refused; stale head refused`;
  },
);

await step(
  {
    id: 'OQ-VAULT-12',
    urs: ['URS-VAULT-012'],
    title: 'A document is listed once, and every version of it is listed, downloadable and in its history',
    action:
      'GET /api/c2c/project-vault/:programId; GET …/documents/<OQ-VAULT-03 id>/versions; GET …/documents/<OQ-VAULT-03 id>/download; ' +
      'GET …/documents/<version 2.0 id>/history; GET …/search?q=<title> without and with includeSuperseded=true',
    expected:
      'The tree has one leaf for the document, version 2.0, with versionCount 2, and no leaf for 1.0; the versions list is ' +
      '[2.0 current, 1.0 earlier] with the OQ-VAULT-03 SHA-256 on 1.0; version 1.0 downloads with that SHA-256; the history ' +
      'carries entries for both versions; search returns 2.0 and not 1.0 unless includeSuperseded=true',
    dependsOn: ['OQ-VAULT-11'],
  },
  async ({ api, baseUrl, auth, expect, attach }) => {
    const v1 = state.doc.id;
    const v2 = state.v2.id;
    const tree = await api('GET', `/api/c2c/project-vault/${state.programId}`);
    expect(tree.status === 200, `tree: expected 200, got ${tree.status}`, tree.json);
    const leaves = [];
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') { if (n.src === 'upload') leaves.push(n); if (n.children) walk(n.children); }
    };
    walk(tree.json.data.tree);
    const family = leaves.filter((l) => l.docId === v1 || l.docId === v2);
    expect(family.length === 1 && family[0].docId === v2 && family[0].versionCount === 2,
      'the tree does not list the document once, at 2.0 with 2 versions', family);

    const vs = await api('GET', `/api/c2c/project-vault/${state.programId}/documents/${v1}/versions`);
    expect(vs.status === 200, `versions: expected 200, got ${vs.status}`, vs.json);
    const list = vs.json.data.versions;
    attach('versions.json', list);
    expect(list.length === 2 && list[0].id === v2 && list[0].current === true && list[1].id === v1 && list[1].current === false,
      'the versions list is not [2.0 current, 1.0 earlier]', list);
    expect(list[1].contentHash === state.bytesSha, 'version 1.0 does not carry the OQ-VAULT-03 SHA-256', list[1]);

    const res = await fetch(`${baseUrl}/api/c2c/project-vault/${state.programId}/documents/${v1}/download`, {
      headers: { Authorization: `Bearer ${auth.accessToken}`, Origin: baseUrl },
    });
    const got = sha256(Buffer.from(await res.arrayBuffer()));
    expect(res.status === 200 && got === state.bytesSha, `version 1.0 download: HTTP ${res.status}, sha256 ${got}`);

    const h = await api('GET', `/api/c2c/project-vault/${state.programId}/documents/${v2}/history`);
    expect(h.status === 200, `history: expected 200, got ${h.status}`, h.json);
    const seen = new Set((h.json.data.entries ?? []).map((e) => e.version));
    expect(seen.has('1.0') && seen.has('2.0'), 'the history does not span both versions', [...seen]);

    const q = encodeURIComponent(state.docTitle);
    const plain = await api('GET', `/api/c2c/project-vault/${state.programId}/search?q=${q}`);
    const all = await api('GET', `/api/c2c/project-vault/${state.programId}/search?q=${q}&includeSuperseded=true`);
    const ids = (r) => (r.json?.data?.results ?? []).map((x) => x.id);
    expect(ids(plain).includes(v2) && !ids(plain).includes(v1), 'search does not list the current version alone', ids(plain));
    expect(ids(all).includes(v1) && ids(all).includes(v2), 'search with includeSuperseded does not list both versions', ids(all));
    return `one leaf (2.0, 2 versions); versions [2.0, 1.0]; 1.0 downloads with sha256 ${got.slice(0, 12)}…; history spans ${[...seen].join(', ')}; search 1 / ${ids(all).length}`;
  },
);

/** Start a version's lifecycle record (or find it), and send it for review, as the run identity. */
async function sendForReview(api, expect, vaultId) {
  const start = await api('POST', '/api/regulatory/documents', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  expect([200, 201].includes(start.status), `start: expected 201, got ${start.status}`, start.json);
  const cid = start.json.canonicalId;
  const sent = await api('POST', `/api/regulatory/documents/${cid}/advance`, { to: 'in_review' });
  expect(sent.status === 200 && sent.json.stage === 'in_review', `send for review: expected 200 in_review, got ${sent.status}`, sent.json);
  return cid;
}

/** Sign as `who` (a credentialed identity): its password, and its code when a factor is enrolled. */
async function signAs(apiAs, who, path, body) {
  const code = await signerCode(who);
  return apiAs(who.session)('POST', path, { ...body, password: who.password, ...(code ? { mfaToken: code } : {}) });
}

await step(
  {
    id: 'OQ-VAULT-13',
    urs: ['URS-VAULT-013'],
    title: 'CREDENTIALED: a version is sent for review; the uploader may not review it; a second identity signs the review over its bytes; the reviewer may not approve it',
    action:
      'POST /api/regulatory/documents naming the OQ-VAULT-11 version, twice; POST …/:id/advance {to:"in_review"}; as the run identity (the uploader) POST …/:id/sign {meaning:"reviewed", reason}; ' +
      'as OQ_SIGNER POST …/:id/sign {meaning:"reviewed", reason, password, mfaToken?}; as OQ_SIGNER POST …/:id/advance {to:"approved", reason, password, mfaToken?}; GET …/documents/:id/versions',
    expected:
      'One lifecycle record (the second start returns it, created:false), in_review; the uploader\'s review 403 SELF_APPROVAL; the signer\'s review 200 with boundContentHash equal to the version\'s SHA-256; ' +
      'the signer\'s approval 403 SELF_APPROVAL; the versions list shows the version In review with the review\'s printed name. Without OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD the step is recorded "not executed — credential not supplied".',
    dependsOn: ['OQ-VAULT-11'],
  },
  async (ctx) => {
    const { api, apiAs, expect, auth, baseUrl } = ctx;
    const v2 = state.v2;
    const cid = await sendForReview(api, expect, v2.id);
    const again = await api('POST', '/api/regulatory/documents', { sources: { vault_documents: { nativeId: v2.id, role: 'artifact' } } });
    expect(again.status === 200 && again.json.canonicalId === cid && again.json.created === false, 'a second start made a second record', again.json);
    const self = await api('POST', `/api/regulatory/documents/${cid}/sign`, { meaning: 'reviewed', reason: 'OQ-002 step 13: the uploader must not review' });
    expect(self.status === 403 && self.json?.error === 'SELF_APPROVAL', `the uploader's review: expected 403 SELF_APPROVAL, got ${self.status}`, self.json);
    const signer = await requireSigner(ctx, baseUrl, auth.user.email);
    state.signer = signer;
    const review = await signAs(apiAs, signer, `/api/regulatory/documents/${cid}/sign`, { meaning: 'reviewed', reason: 'OQ-002 step 13: reviewed for validation' });
    expect(review.status === 200, `the signer's review: expected 200, got ${review.status}`, review.json);
    expect(review.json.signature.boundContentHash === v2.contentHash, 'the review is not bound to the version\'s SHA-256', review.json.signature);
    const own = await signAs(apiAs, signer, `/api/regulatory/documents/${cid}/advance`, { to: 'approved', reason: 'OQ-002 step 13: the reviewer must not approve' });
    expect(own.status === 403 && own.json?.error === 'SELF_APPROVAL', `the reviewer's approval: expected 403 SELF_APPROVAL, got ${own.status}`, own.json);
    const vs = await api('GET', `/api/c2c/project-vault/${state.programId}/documents/${v2.id}/versions`);
    const lc = (vs.json?.data?.versions ?? []).find((v) => v.id === v2.id)?.lifecycle;
    expect(lc?.stage === 'in_review' && Boolean(lc?.review?.printedName), 'the versions list does not show the review', lc);
    return `record ${cid}: uploader refused; reviewed by ${lc.review.printedName}, bound to ${v2.contentHash.slice(0, 12)}…; reviewer's approval refused`;
  },
);

await step(
  {
    id: 'OQ-VAULT-14',
    urs: ['URS-VAULT-013'],
    title: 'CREDENTIALED: a third identity approves v1, then v2; approving v2 supersedes v1; the approved version\'s details cannot be edited',
    action:
      'Ingest a new document (v1.0); send it for review; OQ_SIGNER signs the review; OQ_APPROVER advances it to approved. Check in v2.0 and repeat. GET …/documents/:v2/versions. ' +
      'POST …/documents/:v2/details {documentTitle, reason}',
    expected:
      'Each approval 200, bound to that version\'s SHA-256; v2\'s approval answers superseded:[v1\'s record]; the versions list shows v2.0 Approved (the approver\'s printed name) and v1.0 Superseded; ' +
      'the edit 409 APPROVED_VERSION_IMMUTABLE. Without OQ_APPROVER_EMAIL / OQ_APPROVER_PASSWORD (a third identity) the step is recorded "not executed — credential not supplied".',
    dependsOn: ['OQ-VAULT-13'],
  },
  async (ctx) => {
    const { api, apiAs, expect, auth, baseUrl, attach } = ctx;
    const approver = await requireApprover(ctx, baseUrl, [auth.user.email, state.signer.email]);
    const title = `OQ-002 Approval family ${stamp}`;
    const first = await ingestPdf(api, expect, { programId: state.programId, title });
    const approveVersion = async (vaultId) => {
      const cid = await sendForReview(api, expect, vaultId);
      const r = await signAs(apiAs, state.signer, `/api/regulatory/documents/${cid}/sign`, { meaning: 'reviewed', reason: 'OQ-002 step 14: reviewed for validation' });
      expect(r.status === 200, `review: expected 200, got ${r.status}`, r.json);
      const a = await signAs(apiAs, approver, `/api/regulatory/documents/${cid}/advance`, { to: 'approved', reason: 'OQ-002 step 14: approved for validation' });
      expect(a.status === 200 && a.json.stage === 'approved', `approval: expected 200 approved, got ${a.status}`, a.json);
      return { cid, approval: a.json };
    };
    const one = await approveVersion(first.document.id);
    const form = new FormData();
    form.append('file', new Blob([makePdfBuffer(`${title} revision 2`)], { type: 'application/pdf' }), 'approval-v2.pdf');
    form.append('programId', state.programId);
    form.append('documentTitle', title);
    form.append('documentType', 'PROTOCOL');
    form.append('supersedesDocumentId', first.document.id);
    const next = await api('POST', '/api/vault/ingest', form);
    expect(next.status === 201, `check-in: expected 201, got ${next.status}`, next.json);
    const two = await approveVersion(next.json.document.id);
    expect(JSON.stringify(two.approval.superseded) === JSON.stringify([one.cid]), 'approving v2.0 did not supersede v1.0', two.approval);
    const vs = await api('GET', `/api/c2c/project-vault/${state.programId}/documents/${next.json.document.id}/versions`);
    const list = vs.json?.data?.versions ?? [];
    attach('versions.json', list);
    expect(list[0]?.lifecycle?.stage === 'approved' && Boolean(list[0]?.lifecycle?.approval?.printedName), 'v2.0 is not shown approved', list[0]);
    expect(list[1]?.lifecycle?.stage === 'superseded', 'v1.0 is not shown superseded', list[1]);
    const edit = await api('POST', `/api/c2c/project-vault/${state.programId}/documents/${next.json.document.id}/details`, {
      documentTitle: `${title} renamed`, reason: 'OQ-002 step 14: an approved version must not change',
    });
    expect(edit.status === 409 && JSON.stringify(edit.json).includes('APPROVED_VERSION_IMMUTABLE'), `edit: expected 409 APPROVED_VERSION_IMMUTABLE, got ${edit.status}`, edit.json);
    return `v1.0 approved, then superseded by v2.0 (approved by ${list[0].lifecycle.approval.printedName}); the approved version's edit refused`;
  },
);

await runFilingAndCompareSteps({ step, state, stamp });

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
