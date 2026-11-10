/**
 * Hops 1–3 and 6 of the founder-path lineage walk (project → Data Room → AnA
 * draft, then the sealed document into the Vault) and the adopt hop. Hops 4–5,
 * the person's rewrite and the seal, are in founder-path-lineage.hops-review.ts.
 * Support for tests/lineage/founder-path-lineage.pglite.test.ts — not a test
 * file; the header there names every route and service line these hops drive.
 */
import { expect, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Hop, ORG_A, PASSWORD, APPROVER, REVIEWER, SERVED_MODEL, QUOTE, X, SHA256_X, HEX64,
  sha256, json, asPrincipal, type World,
} from './founder-path-lineage.world';
import { runIndependentCheck } from './founder-path-lineage.hops-review';

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
    // The IND number FDA pre-assigned. A package names only the number its
    // project records, never the program code (package-identity.ts, QA j6).
    applicationNumber: '123456',
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
  /* LX-02. stored_artifact_ref is the upload's tenancy key (its storage_path,
     which the Data Room processing store pins), so the walk follows it by
     recorded keys: to the upload, to the provider and object the upload
     recorded, read from a fresh provider instance. Then the way another API
     task, or the task after a deploy, reads it: with the serving task's own
     copy at storage_path gone, through the one tenant-scoped loader. */
  await hop.check('bytes-durable', 'the bytes behind stored_artifact_ref read back through the storage provider and hash to the checksum', async (observe) => {
    const [s] = await q<{ file_id: string; storage_path: string; storage_provider: string | null; storage_object_id: string | null }>(
      `SELECT f.id AS file_id, f.storage_path, f.storage_provider, f.storage_object_id
         FROM cre_evidence_sources s
         JOIN file_uploads f ON f.storage_path = s.stored_artifact_ref AND f.organization_id = s.organization_id
        WHERE s.id = $1`,
      [k.sourceId],
    );
    const { getStorageProviderFor, resetStorageProvider } = await import('../../server/services/storage/index');
    resetStorageProvider();
    const got = s?.storage_object_id ? await getStorageProviderFor(s.storage_provider).get(s.storage_object_id, ORG_A) : null;
    // The handler ran with cwd at `tmp`, so its working copy is there. The read
    // runs with cwd there too, so a fallback to that copy would find it if the
    // loader took one; the copy is parked first, so it cannot.
    const workingCopy = s ? path.resolve(tmp, s.storage_path) : null;
    const parked = workingCopy ? `${workingCopy}.walk-parked` : null;
    let loaded: string | null = null;
    if (workingCopy && parked && fs.existsSync(workingCopy)) {
      fs.renameSync(workingCopy, parked);
      const readCwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
      try {
        const { loadUploadedFile } = await import('../../server/services/ana/uploaded-file-access');
        const file = await loadUploadedFile(s.file_id, ORG_A);
        loaded = file.integrity === 'verified' ? sha256(file.buffer) : null;
      } catch {
        loaded = null;
      } finally {
        readCwd.mockRestore();
        fs.renameSync(parked, workingCopy);
      }
    }
    observe(got && loaded === sha256(got.bytes) ? sha256(got.bytes) : null);
    expect(got && sha256(got.bytes)).toBe(SHA256_X);
    expect(loaded, 'loadUploadedFile reads the durable copy once the task’s own copy is gone').toBe(SHA256_X);
  });
  hop.verdict();
}

/**
 * The path draft_authoring_document takes in production, field for field: it is
 * confirm-class, so the stream holds it with heldToolContext and the
 * governed-action route runs it, once the person says yes, with
 * confirmedToolContext (routes/ana-ri/utility.ts runConfirmedTool). Both come
 * from services/ana/turn-tool-context.ts, the builders the stream uses (PF-10
 * S5), so the builders cannot drift; what the stream hands the hold is pinned
 * by stream-run-hold.test.ts. projectId is null for a UUID program; the
 * conversation, the turn (the run id) and the model are named.
 */
/** The conversation and the run (its turn) the walk's draft is proposed in. */
const WALK_THREAD_ID = 'ana-ri_walk_thread';
const WALK_RUN_ID = 'run_walk_draft';

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
  /* File the turn record this draft will name, as a real turn does. The model
     recorded on a drafted document comes from that record and from nowhere
     else (27211528b, SEC-A-7 door 2) -- `ctx.servingModel` below is what the
     loop hands a tool, not a channel that can write the field. So a walk that
     files no record would prove only that an unfiled turn records no model,
     which is true but is not the founder path. Written through the production
     writer, so this cannot drift from how a turn is really sealed. */
  const { openTurnRecorder, writeTurnRecordSafely } = await import('../../server/services/ana/turn-record');
  const recorder = openTurnRecorder({
    orgId: ORG_A,
    userId: 3,
    runId: WALK_RUN_ID,
    typed: 'Draft the Module 2.5 clinical overview from the source in the Data Room.',
  });
  if (!recorder) throw new Error('the walk could not open a turn recorder');
  recorder.setAnswer({ streamed: 'Drafting the clinical overview.', stored: 'Drafting the clinical overview.' });
  recorder.setModel(SERVED_MODEL);
  recorder.addServed(1, SERVED_MODEL);
  /* writeTurnRecord opens its own transaction, so it needs a pool it can
     check a client out of; the walk's PGlite pool answers queries only. One
     client, because PGlite is a single connection -- which is also why this
     walk cannot prove the concurrent case, and does not claim to. */
  const connectable = {
    connect: async () => ({
      query: async (t: string, v?: unknown[]) => ({ rows: await w.q(t, v) }),
      release: () => undefined,
    }),
  };
  const filed = await writeTurnRecordSafely(connectable as never, recorder, 'answered');
  if (filed.status !== 'recorded') {
    throw new Error(`the walk's turn record was not filed: ${JSON.stringify(filed)}`);
  }

  const { heldToolContext, confirmedToolContext } = await import('../../server/services/ana/turn-tool-context');
  const held = heldToolContext('draft_authoring_document', streamProjectId, {
    threadId: WALK_THREAD_ID,
    turnId: WALK_RUN_ID,
    servingModel: SERVED_MODEL,
  });
  // As the run row stores it, then as the person's yes runs it (the route
  // stamps humanConfirmed; utility.ts runConfirmedTool).
  const ctx = { ...confirmedToolContext(JSON.parse(JSON.stringify(held)), ORG_A, 3), humanConfirmed: true };
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
  /* The designed refusal, not a defect, so it is not baselined. AnA states the
     source's figure with no citation: the independent check, run on the draft
     as saved (POST /documents/:id/review, run_independent_checks), holds it as
     a hard grounding finding, and no signature is taken while one is open
     (workflow-import-governance.ts assertIndependentCheckRelease). Behind it
     stands the second refusal the person's rewrite answers: text a model wrote
     is released only with a receipt naming a PQ-passed model, and none has
     passed (assertOrdinaryMachineRelease, WORKFLOW_MODEL_QUALIFICATION_REQUIRED). */
  await hop.check('draft-not-signed-as-drafted', 'the independent check holds AnA’s uncited figure as a hard finding, and a review signature on the draft is refused 409 INDEPENDENT_CHECK_REQUIRED: nothing is signed', async (observe) => {
    const checked = await runIndependentCheck(w, 'author');
    const hard = checked.findings.filter((f) => f.hard && f.open);
    const refused = await w.asReviewer(request(w.app).post(`/api/authoring/docs/${k.docId}/e-sign`)).send({
      password: PASSWORD, meaning: 'REVIEWER', intent: 'Reviewed for the C2C-101 IND original sequence',
    });
    const signatures = await q('SELECT id FROM authoring_signatures WHERE doc_id = $1 AND tenant_id = $2', [k.docId, ORG_A]);
    observe({ standing: checked.standing, hard: hard.map((f) => f.category), status: refused.status, code: refused.body?.code ?? null, signatures: signatures.length });
    expect(checked.standing).toBe('current');
    expect(hard.map((f) => ({ category: f.category, sectionId: f.sectionId }))).toEqual([{ category: 'grounding', sectionId: k.sectionIds![1] }]);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('INDEPENDENT_CHECK_REQUIRED');
    expect(signatures).toHaveLength(0);
  });
  hop.verdict();
}

/** 6 · POST /docs/:id/file-to-vault (authoring.router.ts:7160; authoring-file-to-vault.ts), where the approval carries (authoring-approval-carryover.ts). */
export async function hopFileToVault(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('file-to-vault');
  const res = await w.asAuthor(request(w.app).post(`/api/authoring/docs/${k.docId}/file-to-vault`)).send({ format: 'pdf' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  k.vaultDocumentId = String(res.body.data.vaultDocumentId);

  /* Until 2026-11-10 this check held the other branch: approved with no review, so nothing carried. Since P-95
     (33c3e4de9e) the seal hop has a review; the QA reviewer and the approver each signed the content that was
     filed, neither wrote it, and the approval carries (authoring-approval-carryover.ts chooseCarriedSignOffs). */
  await hop.check('approval-carry-decided', 'reviewed and approved in Authoring by two people who did not write it, so the approval carries to the Vault copy, and the filing says whose (FD5 (c))', async (observe) => {
    const approval = res.body.data.approval as { carried?: boolean; reason?: string } | undefined;
    observe(approval?.carried);
    expect(approval, approval?.reason).toMatchObject({ carried: true, reviewedBy: REVIEWER.name, approvedBy: APPROVER.name });
  });

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
 * 6b · The Vault copy stands approved by the Authoring approval (VR-14; FD5 (c)).
 *
 * Since 2026-10-01 only an approved, current Vault version is transmitted
 * (leaf-source-resolver.ts, vaultVersionNotTransmittable). Under FD5 (c) an
 * Authoring approval carries to the Vault copy after an independent Authoring
 * review (authoring-approval-carryover.ts). The document was reviewed by the
 * QA reviewer and approved by the approver, neither its author (hop 5), so
 * the filing carried the approval: the Vault version's lifecycle record went
 * authoring → in_review → approved through the one gate, its sign-offs naming
 * the Authoring signatures, and nobody approves it a second time in the Vault.
 * Opening the version's record (POST /api/regulatory/documents,
 * document-lifecycle.ts) finds that record and creates none.
 *
 * Until 2026-11-10 this hop approved the copy in the Vault on a named route
 * (RR1b), because the walk's document had no review. That route is no longer
 * walked here; tests/db/vault-lifecycle.dbtest.ts and tests/db/review-route-vault-rr1b.dbtest.ts hold it.
 */
export async function hopVaultApproval(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('vault-approval');
  const opened = await asPrincipal(ORG_A, 3)(request(w.app).post('/api/regulatory/documents'))
    .send({ sources: { vault_documents: { nativeId: k.vaultDocumentId, role: 'artifact' } } });
  expect(opened.status, JSON.stringify(opened.body)).toBe(200);
  expect(opened.body).toMatchObject({ ok: true, created: false });
  const canonicalId = String(opened.body.canonicalId);

  await hop.check('vault-copy-approved-for-its-bytes', 'the Vault copy\'s lifecycle record is approved, for the bytes the Vault holds', async (observe) => {
    const [row] = await q<{ stage: string; content_hash: string; vault_hash: string }>(
      `SELECT c.stage, c.content_hash, d.content_hash AS vault_hash
         FROM canonical_documents c JOIN vault.documents d ON d.id::text = c.source_refs -> 'vault_documents' ->> 'nativeId'
        WHERE c.canonical_id = $1`, [canonicalId]);
    observe(row?.stage);
    expect(row).toMatchObject({ stage: 'approved' });
    expect(row.content_hash).toBe(row.vault_hash);
  });
  await hop.check('carried-approval-names-authoring-signatures', 'one chained vault.version.approval_carried row names the Authoring review and approval signatures, their signers and the bytes they are bound to', async (observe) => {
    const rows = await q<{ record_id: string; sha256_chain: string; new_values: unknown }>(
      `SELECT record_id, sha256_chain, new_values FROM audit_logs WHERE tenant_id = $1 AND action = 'vault.version.approval_carried'`, [ORG_A]);
    const signed = await q<{ id: string; meaning: string }>('SELECT id::text AS id, meaning FROM authoring_signatures WHERE doc_id = $1 AND tenant_id = $2', [k.docId, ORG_A]);
    const [vault] = await q<{ content_hash: string }>('SELECT content_hash FROM vault.documents WHERE id = $1', [k.vaultDocumentId]);
    const id = (meaning: string) => signed.find((s) => s.meaning === meaning)?.id;
    observe(rows.length);
    expect(rows).toHaveLength(1);
    expect(rows[0].record_id).toBe(k.vaultDocumentId);
    expect(rows[0].sha256_chain).toMatch(HEX64);
    expect(json(rows[0].new_values)).toMatchObject({
      canonicalId, authoringDocumentId: k.docId, artifactSha256: vault.content_hash,
      review: { signatureId: id('REVIEWER'), signer: Number(REVIEWER.id) },
      approval: { signatureId: id('APPROVER'), signer: Number(APPROVER.id) },
    });
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
  // Adoption now proves actual upload bytes. Resolve its relative storage
  // path against the same isolated root used by this fixture's upload.
  async function adoptConversationFile() {
    const adoptCwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      return await asPrincipal(ORG_A, 3)(request(w.app).post(`/api/c2c/projects/${k.programId}/adopt`)).send({ fileUploadId: fileId });
    } finally {
      adoptCwd.mockRestore();
    }
  }

  await hop.check('unscoped-upload-is-a-conversation-file', 'an upload with no project open records no Data Room source', async (observe) => {
    const sources = await q(`SELECT id FROM cre_evidence_sources WHERE provenance->>'fileUploadId' = $1`, [fileId]);
    observe({ status: upload.status, recorded: upload.body?.dataRoom?.recorded, sources: sources.length });
    expect(upload.status).toBe(200);
    expect(upload.body.dataRoom.recorded).toBe(false);
    expect(sources).toHaveLength(0);
  });
  await hop.check('project-offers-the-conversation-file', 'the project lists the caller\'s conversation file for adoption, and only the caller\'s', async (observe) => {
    // A colleague's chat attachment in the same organization: theirs to bring in.
    await q(
      `INSERT INTO file_uploads (id, user_id, original_name, mime_type, file_size, storage_path, organization_id, checksum_sha256)
       VALUES ('colleague-file', 99, 'colleague.txt', 'text/plain', 3, 'uploads/colleague.txt', $1, $2)`,
      [ORG_A, sha256(Buffer.from('colleague'))],
    );
    const mine = await asPrincipal(ORG_A, 3)(request(w.app).get(`/api/c2c/projects/${k.programId}/conversation-files`));
    const ids = (mine.body?.files ?? []).map((f: { id: string }) => f.id);
    observe({ status: mine.status, listed: ids.includes(fileId), colleagueListed: ids.includes('colleague-file') });
    expect(mine.status).toBe(200);
    expect(ids).toContain(fileId);
    expect(ids).not.toContain('colleague-file');
  });
  await hop.check('adopt-makes-it-the-projects-source', 'one audited adopt makes the file a source of the project, keyed to it', async (observe) => {
    const res = await adoptConversationFile();
    const [src] = await q<{ client_program_id: string; organization_id: number; checksum: string }>(
      'SELECT client_program_id, organization_id, checksum FROM cre_evidence_sources WHERE id = $1', [res.body?.sourceId]);
    const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.project.adopt' AND record_id = $1`, [k.programId]);
    observe({ status: res.status, program: src?.client_program_id === k.programId, audited: audit.length });
    expect(res.status).toBe(201);
    expect(src).toMatchObject({ client_program_id: k.programId, organization_id: ORG_A, checksum: sha256(bytes) });
    expect(audit).toHaveLength(1);
  });
  await hop.check('adopt-is-once', 'adopting the same file again is not a second source and writes no second audit row', async (observe) => {
    const again = await adoptConversationFile();
    const sources = await q(`SELECT id FROM cre_evidence_sources WHERE client_program_id = $1 AND checksum = $2`, [k.programId, sha256(bytes)]);
    const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.project.adopt' AND record_id = $1`, [k.programId]);
    observe({ status: again.status, sources: sources.length, audited: audit.length });
    expect(again.status).toBe(200);
    expect(sources).toHaveLength(1);
    expect(audit).toHaveLength(1);
  });
  await hop.check('adopted-file-is-no-longer-offered', 'once in a project\'s Data Room, the file is not offered as a conversation file', async (observe) => {
    const after = await asPrincipal(ORG_A, 3)(request(w.app).get(`/api/c2c/projects/${k.programId}/conversation-files`));
    const ids = (after.body?.files ?? []).map((f: { id: string }) => f.id);
    observe({ status: after.status, listed: ids.includes(fileId) });
    expect(after.status).toBe(200);
    expect(ids).not.toContain(fileId);
  });
  hop.verdict();
}
