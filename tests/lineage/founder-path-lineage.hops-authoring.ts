/**
 * Hops 1–6 of the founder-path lineage walk: project → Data Room → AnA draft →
 * editor save → seal → Vault. Support for
 * tests/lineage/founder-path-lineage.pglite.test.ts — not a test file; the
 * header there names every route and service line these hops drive.
 */
import { expect, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Hop, ORG_A, PASSWORD, SERVED_MODEL, QUOTE, X, SHA256_X, HEX64,
  sha256, json, asPrincipal, type World,
} from './founder-path-lineage.world';

/** 1 · POST /api/c2c/projects (server/routes/c2c/projects.ts:613, audit :913). */
export async function hopProject(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('project');
  const res = await asPrincipal(ORG_A, 3)(request(w.app).post('/api/c2c/projects')).send({
    name: 'C2C-101 IND',
    productName: 'C2C-101',
    programType: 'ind',
    productType: 'drug',
    primaryAgency: 'FDA',
    indication: 'Moderate-to-severe disease',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  k.programId = String(res.body.data.id);
  k.submissionId = Number(res.body.meta.submissionId);
  k.filingDocumentId = String(res.body.meta.documentId);

  await hop.check('program-recorded', 'regulatory_programs holds the project, owned by org A', async (observe) => {
    const [p] = await q('SELECT organization_id, deleted_at FROM regulatory_programs WHERE id = $1', [k.programId]);
    observe(p);
    expect(p).toMatchObject({ organization_id: ORG_A, deleted_at: null });
  });
  await hop.check('creation-audited-with-its-keys', 'the chained c2c.project.create row names the project and the submission spine it created', async (observe) => {
    const rows = await q<{ sha256_chain: string; new_values: unknown }>(
      `SELECT sha256_chain, new_values FROM audit_logs WHERE action = 'c2c.project.create' AND target = $1`,
      [`regulatory_program:${k.programId}`]);
    observe(rows.length);
    expect(rows).toHaveLength(1);
    expect(rows[0].sha256_chain).toMatch(HEX64);
    expect(json(rows[0].new_values)).toMatchObject({ project_id: k.programId, submission_id: k.submissionId });
  });
  await hop.check('submission-anchored-to-project', 'the submission spine intake created carries the project as a column (submissions.program_id), not only in the audit JSON', async (observe) => {
    const [s] = await q<{ program_id: string | null }>('SELECT program_id FROM submissions WHERE id = $1 AND organization_id = $2', [k.submissionId, ORG_A]);
    observe(s.program_id === k.programId);
    expect(s.program_id).toBe(k.programId);
  });
  await hop.check('filing-scaffolded-in-project', 'the project’s governed filing (c2c_documents) is keyed to the project', async (observe) => {
    const rows = await q<{ id: string; doc_type: string }>(
      'SELECT id, doc_type FROM c2c_documents WHERE project_id = $1 AND org_id = $2', [k.programId, ORG_A]);
    observe(rows.map((r) => r.doc_type));
    expect(rows.map((r) => r.id)).toContain(k.filingDocumentId);
  });
  hop.verdict();
}

/** 2 · POST /api/chat/upload (server/routes/chat.ts:53-87; server/routes/chat/upload.ts:439, :558-563, :615). */
export async function hopCapture(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('capture');
  /* The handler writes the bytes under process.cwd() (upload.ts:166-184);
     pointed at a temp directory so the test writes nothing into the repository. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-lineage-upload-'));
  w.tmpDirs.push(tmp);
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  let res: request.Response;
  try {
    res = await asPrincipal(ORG_A, 3)(request(w.app).post('/api/chat/upload'))
      .field('projectId', String(k.programId))
      .attach('file', X, { filename: 'c2c-101-003-csr-synopsis.txt', contentType: 'text/plain' });
  } finally {
    cwd.mockRestore();
  }
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  k.sourceId = Number(res.body.sourceId);

  await hop.check('source-recorded', 'cre_evidence_sources holds X under checksum = sha256(X), in org A', async (observe) => {
    const [s] = await q('SELECT organization_id, source_type, checksum, is_current FROM cre_evidence_sources WHERE id = $1', [k.sourceId]);
    observe(s?.checksum === SHA256_X);
    expect(s).toMatchObject({ organization_id: ORG_A, source_type: 'client_document', checksum: SHA256_X, is_current: true });
  });
  await hop.check('source-in-project', 'the source carries the project’s key', async (observe) => {
    const [s] = await q<{ client_program_id: string | null }>('SELECT client_program_id FROM cre_evidence_sources WHERE id = $1', [k.sourceId]);
    observe(s?.client_program_id === k.programId);
    expect(s?.client_program_id).toBe(k.programId);
  });
  await hop.check('data-room-lists-source', 'the project’s Data Room (GET /api/c2c/projects/:id/sources) lists it by id and checksum', async (observe) => {
    const dr = await asPrincipal(ORG_A, 3)(request(w.app).get(`/api/c2c/projects/${k.programId}/sources`));
    const hit = (dr.body.sources ?? []).find((s: { id: number }) => s.id === k.sourceId);
    observe(Boolean(hit));
    expect(dr.status).toBe(200);
    expect(hit?.checksum).toBe(SHA256_X);
  });
  await hop.check('bytes-durable', 'the bytes behind stored_artifact_ref read back through the storage provider and hash to the checksum', async (observe) => {
    const [s] = await q<{ stored_artifact_ref: string }>('SELECT stored_artifact_ref FROM cre_evidence_sources WHERE id = $1', [k.sourceId]);
    const { getStorageProviderFor } = await import('../../server/services/storage/index');
    const got = await getStorageProviderFor(null).get(s.stored_artifact_ref, ORG_A);
    observe(got ? sha256(got.bytes) : null);
    expect(got && sha256(got.bytes)).toBe(SHA256_X);
  });
  hop.verdict();
}

/**
 * The call stream.ts:1731-1744 makes, field for field: the registered (gated)
 * handler, with the stream's ctx. projectId is Number(uuid) || null — null for a
 * UUID program — and the stream passes no threadId, turnId or model
 * (AnaToolExecutor.ts:228-236).
 */
async function draftUnderStreamCtx(w: World): Promise<Record<string, unknown>> {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler('draft_authoring_document');
  expect(handler, 'draft_authoring_document is not registered').toBeDefined();
  const streamProjectId = w.k.programId;
  const input = {
    title: 'Module 2.5 Clinical Overview - C2C-101',
    module: 'M2',
    documentType: 'clinical_overview',
    sections: [
      { code: '2.5.1', title: 'Product Development Rationale', content: '<p>C2C-101 is a selective inhibitor developed for moderate-to-severe disease.</p>' },
      { code: '2.5.2', title: 'Overview of Biopharmaceutics', content: `<p>${QUOTE}</p>` },
    ],
    /* The grounding, in the shape every other AnA drafting tool takes
       (drafting-source-lineage.ts resolveDraftSources). The tool's schema
       declares no such field today (document-surface-tool-defs.ts:141-166);
       LX-06 adds it — if it lands under another name, this input follows it. */
    sources: [{ evidence_source_id: w.k.sourceId, excerpt: QUOTE }],
  };
  const ctx = {
    servingModel: SERVED_MODEL,
    organizationId: ORG_A,
    userId: 3,
    projectId: streamProjectId ? Number(streamProjectId) || null : null,
    projectRef: streamProjectId ? String(streamProjectId) : null,
    liveDrive: false,
    lockedScreens: [],
    turnState: {},
    signal: new AbortController().signal,
  };
  return JSON.parse(await handler!(input, ctx as never));
}

/** 3 · draft_authoring_document (AnaToolExecutor.ts:19731; authoring-draft-tool.ts:133-136). */
export async function hopAnaDraft(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('ana-draft');
  const out = await draftUnderStreamCtx(w);
  expect(out.error, JSON.stringify(out)).toBeUndefined();
  k.docId = String(out.authoringDocId);
  const sections = await q<{ id: string; content: string }>(
    'SELECT id, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index', [k.docId, ORG_A]);
  k.sectionIds = sections.map((s) => s.id);
  const provenance = async () => json((await q<{ provenance: unknown }>('SELECT provenance FROM authoring_documents WHERE id = $1', [k.docId]))[0].provenance);

  await hop.check('tool-accepts-sources', 'the tool the model sees declares a sources input', async (observe) => {
    const { ALL_ANA_TOOLS } = await import('../../server/services/ana/AnaToolDefinitions');
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'draft_authoring_document');
    const props = (def?.input_schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
    observe('sources' in props);
    expect(Object.keys(props)).toContain('sources');
  });
  await hop.check('document-in-project', 'the authoring document carries the project’s key', async (observe) => {
    const [d] = await q<{ client_program_id: string }>('SELECT client_program_id FROM authoring_documents WHERE id = $1 AND tenant_id = $2', [k.docId, ORG_A]);
    observe(d?.client_program_id === k.programId);
    expect(d?.client_program_id).toBe(k.programId);
    expect((await provenance()).source).toBe('ana');
  });
  await hop.check('genesis-revision-per-section', 'every section has a genesis doc_revisions row hashing its content', async (observe) => {
    const revs = await q<{ section_id: string; origin: string; content_sha256: string; chain_sha256: string }>(
      'SELECT section_id, origin, content_sha256, chain_sha256 FROM doc_revisions WHERE section_id = ANY($1)', [k.sectionIds]);
    observe(revs.map((r) => r.origin));
    expect(revs).toHaveLength(sections.length);
    for (const s of sections) {
      const r = revs.find((x) => x.section_id === s.id);
      expect(r).toMatchObject({ origin: 'genesis', content_sha256: sha256(s.content) });
      expect(r?.chain_sha256).toMatch(HEX64);
    }
  });
  await hop.check('model-recorded', 'provenance names the model the gateway served', async (observe) => {
    const model = (await provenance()).model;
    observe(model);
    expect(model).toBe(SERVED_MODEL.model);
  });
  await hop.check('turn-recorded', 'provenance names the conversation and turn that drafted it', async (observe) => {
    const p = await provenance();
    observe([p.conversationId ?? null, p.turnId ?? null]);
    expect(p.conversationId).toEqual(expect.any(String));
    expect(p.turnId).toEqual(expect.any(String));
  });
  await hop.check('source-span', 'at least one cre_evidence_source span cites the source, at its checksum', async (observe) => {
    const spans = await q<{ reference_id: string; payload_sha256: string }>(
      `SELECT reference_id, payload_sha256 FROM document_span_lineage
        WHERE organization_id = $1 AND document_table = 'authoring_sections' AND document_id = ANY($2)
          AND provenance_kind = 'cre_evidence_source' AND deleted_at IS NULL`,
      [ORG_A, k.sectionIds]);
    const citing = spans.filter((s) => s.reference_id === String(k.sourceId) && s.payload_sha256 === SHA256_X);
    observe(citing.length);
    expect(citing.length).toBeGreaterThanOrEqual(1);
  });
  hop.verdict();
}

/** 4 · PATCH /api/authoring/sections/:id (authoring.router.ts:1647; :1798, :1870, :1889, :1904). */
export async function hopEditSave(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('edit-save');
  const [section] = await q<{ id: string; updated_at: Date }>(
    `SELECT id, updated_at FROM authoring_sections WHERE doc_id = $1 AND code = '2.5.2' AND tenant_id = $2`, [k.docId, ORG_A]);
  const [genesis] = await q<{ id: string; chain_sha256: string }>('SELECT id, chain_sha256 FROM doc_revisions WHERE section_id = $1', [section.id]);
  // An ordinary human edit: a sentence inserted ABOVE the quote.
  const edited = `<p>Two oral formulations were studied in the biopharmaceutics programme.</p><p>${QUOTE}</p>`;
  const res = await w.asAuthor(request(w.app).patch(`/api/authoring/sections/${section.id}`)).send({
    content: edited,
    changeReason: 'Added the formulation context the reviewer asked for above the bioavailability finding.',
    expectedUpdatedAt: new Date(section.updated_at).toISOString(),
  });

  await hop.check('save-accepted', 'the save is accepted', async (observe) => {
    observe({ status: res.status, code: res.body?.error?.code ?? null });
    expect(res.status).toBe(200);
  });
  await hop.check('revision-chained', 'doc_revisions grows by the edit, chained to the genesis row and hashing the saved text', async (observe) => {
    const revs = await q<{ id: string }>('SELECT id, origin, content_sha256, prev_chain_sha256 FROM doc_revisions WHERE section_id = $1', [section.id]);
    observe(revs.length);
    expect(revs).toHaveLength(2);
    expect(revs.find((r) => r.id !== genesis.id)).toMatchObject({ origin: 'human-edit', prev_chain_sha256: genesis.chain_sha256, content_sha256: sha256(edited) });
  });
  await hop.check('source-span-survives', 'after the edit, a cre_evidence_source span still cites the source', async (observe) => {
    const [n] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE organization_id = $1 AND document_table = 'authoring_sections' AND document_id = $2
          AND provenance_kind = 'cre_evidence_source' AND reference_id = $3 AND deleted_at IS NULL`,
      [ORG_A, section.id, String(k.sourceId)]);
    observe(n.n);
    expect(n.n).toBeGreaterThanOrEqual(1);
  });
  await hop.check('spans-bound-to-revision', 'the section’s live spans name the doc_revisions row they describe', async (observe) => {
    const spans = await q<{ document_version: string | null }>(
      `SELECT document_version FROM document_span_lineage WHERE document_table = 'authoring_sections' AND document_id = $1 AND deleted_at IS NULL`, [section.id]);
    const revIds = (await q<{ id: string }>('SELECT id FROM doc_revisions WHERE section_id = $1', [section.id])).map((r) => r.id);
    observe([...new Set(spans.map((s) => s.document_version))].sort());
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) expect(revIds).toContain(s.document_version);
  });
  hop.verdict();
}

/** 5 · POST /docs/:id/freeze (authoring.router.ts:3700, :3843) and POST /docs/:id/e-sign (:3916, :3994, :4065). */
export async function hopSeal(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('seal');
  const fr = await w.asAuthor(request(w.app).post(`/api/authoring/docs/${k.docId}/freeze`)).send({ reason: 'Sealed for the C2C-101 IND original sequence.' });
  expect(fr.status, JSON.stringify(fr.body)).toBe(200);
  k.freezeHash = String(fr.body.contentHash);
  const es = await w.asApprover(request(w.app).post(`/api/authoring/docs/${k.docId}/e-sign`)).send({
    password: PASSWORD, meaning: 'APPROVER', intent: 'Approved for the C2C-101 IND original sequence',
  });
  expect(es.status, JSON.stringify(es.body)).toBe(200);

  await hop.check('seal-hash-verifies', 'frozen_documents holds the freeze and the approval seal, each hashing its own content', async (observe) => {
    const seals = await q<{ version: string; content_hash: string; frozen_content: string }>(
      'SELECT version, content_hash, frozen_content FROM frozen_documents WHERE document_id = $1 AND tenant_id = $2', [k.docId, ORG_A]);
    observe(seals.map((s) => s.version).sort());
    const freeze = seals.find((s) => s.version === 'v1.0.frozen');
    const approved = seals.find((s) => s.version === 'approved');
    expect(freeze?.content_hash).toBe(k.freezeHash);
    for (const s of [freeze, approved]) expect(s && sha256(s.frozen_content)).toBe(s?.content_hash);
    k.approvedSealHash = approved?.content_hash;
    expect((await q<{ status: string }>('SELECT status FROM authoring_documents WHERE id = $1', [k.docId]))[0].status).toBe('APPROVED');
  });
  await hop.check('signature-binds-seal', 'the APPROVER signature names the freeze it covered, by version and content hash', async (observe) => {
    const [sig] = await q('SELECT meaning, covered_freeze_version, covered_content_hash, signature_digest FROM authoring_signatures WHERE id = $1', [es.body.signatureId]);
    observe(sig?.covered_freeze_version);
    expect(sig).toMatchObject({ meaning: 'APPROVER', covered_freeze_version: 'v1.0.frozen', covered_content_hash: k.freezeHash });
    expect(String(sig.signature_digest)).toMatch(HEX64);
  });
  await hop.check('seal-binds-revision-and-lineage', 'the seal names each section’s doc_revisions head, and each head carries a lineage digest', async (observe) => {
    const [approved] = await q<{ frozen_content: string }>(`SELECT frozen_content FROM frozen_documents WHERE document_id = $1 AND version = 'approved'`, [k.docId]);
    const heads = await q<{ id: string; chain_sha256: string; inputs: unknown }>(
      `SELECT r.id, r.chain_sha256, r.inputs FROM doc_revisions r
        WHERE r.section_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM doc_revisions n WHERE n.prev_chain_sha256 = r.chain_sha256)`, [k.sectionIds]);
    const bound = heads.filter((r) => approved.frozen_content.includes(r.chain_sha256) || approved.frozen_content.includes(r.id));
    const digests = heads.filter((r) => typeof (json(r.inputs).lineage as { digest?: unknown } | undefined)?.digest === 'string');
    observe({ heads: heads.length, bound: bound.length, lineageDigests: digests.length });
    expect(heads).toHaveLength(k.sectionIds!.length);
    expect(bound).toHaveLength(heads.length);
    expect(digests).toHaveLength(heads.length);
  });
  hop.verdict();
}

/** 6 · POST /docs/:id/file-to-vault (authoring.router.ts:5145; authoring-file-to-vault.ts:261, :344). */
export async function hopFileToVault(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('file-to-vault');
  const res = await w.asAuthor(request(w.app).post(`/api/authoring/docs/${k.docId}/file-to-vault`)).send({ format: 'pdf' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  k.vaultDocumentId = String(res.body.data.vaultDocumentId);

  await hop.check('vault-row-in-project', 'vault.documents holds the filed bytes in the same project, under their content hash', async (observe) => {
    const [v] = await q<{ program_id: string; content_hash: string; storage_version_id: string; deleted_at: unknown }>(
      'SELECT program_id, content_hash, storage_version_id, deleted_at FROM vault.documents WHERE id = $1', [k.vaultDocumentId]);
    const { getStorageProviderFor } = await import('../../server/services/storage/index');
    const got = await getStorageProviderFor('local').get(v.storage_version_id, ORG_A);
    observe(v.program_id === k.programId);
    expect(v).toMatchObject({ program_id: k.programId, deleted_at: null });
    expect(got && sha256(got.bytes)).toBe(v.content_hash);
    expect(res.body.data).toMatchObject({ sealed: true, sha256: v.content_hash });
  });
  await hop.check('filing-names-document', 'the chained file_to_vault audit row links the vault row to the authoring document', async (observe) => {
    const rows = await q<{ record_id: string; new_values: unknown }>(
      `SELECT record_id, new_values FROM audit_logs WHERE tenant_id = $1 AND action = 'authoring.document.file_to_vault'`, [ORG_A]);
    observe(rows.length);
    expect(rows).toHaveLength(1);
    expect(rows[0].record_id).toBe(k.docId);
    expect(json(rows[0].new_values)).toMatchObject({ vaultDocumentId: k.vaultDocumentId, artifactSha256: res.body.data.sha256 });
  });
  await hop.check('filing-names-sealed-version', 'the filing record names the seal it rendered (its content hash)', async (observe) => {
    const recorded = JSON.stringify([
      await q('SELECT * FROM vault.documents WHERE id = $1', [k.vaultDocumentId]),
      await q(`SELECT new_values FROM audit_logs WHERE action = 'authoring.document.file_to_vault' AND record_id = $1`, [k.docId]),
      await q('SELECT metadata FROM authoring_export_history WHERE document_id = $1', [k.docId]),
    ]);
    observe(recorded.includes(k.approvedSealHash!));
    expect(recorded).toContain(k.approvedSealHash);
  });
  hop.verdict();
}

/**
 * A conversation file is adopted into a project (PF-07; founder decision
 * 2026-09-26): an upload with no project open records no Data Room source; one
 * audited adopt (POST /api/c2c/projects/:id/adopt) makes it the project's source,
 * once; a second adopt of the same file is not a second source.
 */
export async function hopAdopt(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('adopt');
  const bytes = Buffer.from('C2C-101 investigator brochure — conversation attachment.\n', 'utf8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-lineage-adopt-'));
  w.tmpDirs.push(tmp);
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  let upload: request.Response;
  try {
    upload = await asPrincipal(ORG_A, 3)(request(w.app).post('/api/chat/upload'))
      .attach('file', bytes, { filename: 'ib-attachment.txt', contentType: 'text/plain' });
  } finally {
    cwd.mockRestore();
  }
  const fileId = String(upload.body?.fileId);

  await hop.check('unscoped-upload-is-a-conversation-file', 'an upload with no project open records no Data Room source', async (observe) => {
    const sources = await q(`SELECT id FROM cre_evidence_sources WHERE provenance->>'fileUploadId' = $1`, [fileId]);
    observe({ status: upload.status, recorded: upload.body?.dataRoom?.recorded, sources: sources.length });
    expect(upload.status).toBe(200);
    expect(upload.body.dataRoom.recorded).toBe(false);
    expect(sources).toHaveLength(0);
  });
  await hop.check('adopt-makes-it-the-projects-source', 'one audited adopt makes the file a source of the project, keyed to it', async (observe) => {
    const res = await asPrincipal(ORG_A, 3)(request(w.app).post(`/api/c2c/projects/${k.programId}/adopt`)).send({ fileUploadId: fileId });
    const [src] = await q<{ client_program_id: string; organization_id: number; checksum: string }>(
      'SELECT client_program_id, organization_id, checksum FROM cre_evidence_sources WHERE id = $1', [res.body?.sourceId]);
    const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.project.adopt' AND record_id = $1`, [k.programId]);
    observe({ status: res.status, program: src?.client_program_id === k.programId, audited: audit.length });
    expect(res.status).toBe(201);
    expect(src).toMatchObject({ client_program_id: k.programId, organization_id: ORG_A, checksum: sha256(bytes) });
    expect(audit).toHaveLength(1);
  });
  await hop.check('adopt-is-once', 'adopting the same file again is not a second source and writes no second audit row', async (observe) => {
    const again = await asPrincipal(ORG_A, 3)(request(w.app).post(`/api/c2c/projects/${k.programId}/adopt`)).send({ fileUploadId: fileId });
    const sources = await q(`SELECT id FROM cre_evidence_sources WHERE client_program_id = $1 AND checksum = $2`, [k.programId, sha256(bytes)]);
    const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.project.adopt' AND record_id = $1`, [k.programId]);
    observe({ status: again.status, sources: sources.length, audited: audit.length });
    expect(again.status).toBe(200);
    expect(sources).toHaveLength(1);
    expect(audit).toHaveLength(1);
  });
  hop.verdict();
}
