/**
 * LX-00 — the founder's path, walked hop by hop through the REAL services, and
 * then walked back and forward by recorded keys only.
 *
 * docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md §0: "all starts with a
 * project as the beginning of a client's work process, and from there into
 * Vault — data room and beyond." So the chain starts at a project and every
 * later hop is reached from a key an earlier hop RECORDED:
 *
 *   1 project        POST /api/c2c/projects                         server/routes/c2c/projects.ts:613 (audit :913)
 *   2 capture        POST /api/chat/upload (multer + uploadHandler)  server/routes/chat.ts:53-87; server/routes/chat/upload.ts:439, :558-563, :615
 *   3 ana-draft      draft_authoring_document, the stream's own ctx server/routes/ana-ri/stream.ts:1731-1744; server/services/ana/AnaToolExecutor.ts:19731;
 *                                                                    server/services/authoring/authoring-draft-tool.ts:133-136
 *   4 edit-save      PATCH /api/authoring/sections/:id               server/routes/authoring.router.ts:1647 (:1798, :1870, :1889, :1904)
 *   5 seal           POST /docs/:id/freeze, POST /docs/:id/e-sign    server/routes/authoring.router.ts:3700 (:3843), :3916 (:3994, :4065)
 *   6 file-to-vault  POST /docs/:id/file-to-vault                    server/routes/authoring.router.ts:5145; server/services/authoring/authoring-file-to-vault.ts:261, :344
 *   7 place          takeAuthoringSnapshot (the service behind       server/routes/coauthor.ts:200-208; server/services/coauthor/coauthor-snapshot.ts:423;
 *                    POST /api/coauthor/documents), then             server/routes/submissions.ts:876, :928; server/services/submission-service/submission-service.ts:1842 (:2062)
 *                    PUT /api/submissions/sequences/:id/leaves ×2
 *                    (the filing copy, and the Vault copy)
 *   8 transmit       transition → freeze → dispatch → transmit,      server/routes/submissions.ts:890, :1674, :1690, :1718;
 *                    each on a governed Part 11 sign                  server/routes/c2c/actions.ts:777; submission-service.ts:1217 (:1418, :1443);
 *                                                                    server/services/submission-gateways/fda-esg.ts:264-281
 *
 * Then: walk BACK from the transmittal to cre_evidence_sources.checksum =
 * sha256(X) and to the project, and FORWARD from the project and from the
 * source — each walk starting from one id and following recorded keys only.
 *
 * ONE `it` PER HOP. Each hop runs its product action, then a set of named
 * checks; each check asserts that the hop left a RECORDED key the next hop (or
 * the walk) can be followed by. tests/lineage/founder-path-lineage.baseline.json
 * is the shrink-only list of checks broken at HEAD, each with the verified
 * finding(s), the LX fix(es) that close it, and the value it observes today.
 * The Hop helper (founder-path-lineage.world.ts) enforces the rules:
 *   • a check not in the baseline must pass;
 *   • a baselined check must FAIL ITS ASSERTION, on the value the baseline
 *     records — a baselined check that passes fails the run (shrink the
 *     baseline), one that fails on a different value fails the run (re-examine
 *     it), and one that throws anything but an assertion fails the run (a
 *     baseline entry excuses a recorded gap, never a broken walk);
 *   • a baseline entry naming a check that did not run fails the run, and the
 *     baseline may not grow past the ceiling it was written at.
 *
 * WHAT IS REAL: every router and service named above, the real migration files
 * (below), the real FDA ESG gateway with its pre-transmit guard and its
 * transmittal ledger, the real Part 11 sign ceremony (bcrypt re-verification).
 * WHAT IS STUBBED, each because it leaves the process: object storage (an
 * in-memory provider with the real interface), PDF rendering (a %PDF- stand-in),
 * PDF text extraction (text extraction stays real), embeddings, and the agency
 * wire itself (the AS2 POST, the MDN verdict and the body signature). The
 * Shadow Review run the dispatch gate requires is SEEDED as a completed row,
 * because POST /sequences/:id/shadow-review calls a model — the same choice
 * tests/golden-journeys/drug-nda-ectd.journey.test.ts makes and documents.
 * `coauthor_documents.embedding` is added as TEXT: the real column is
 * pgvector's vector(1536) (migrations/20260604_evidence_graph_and_embeddings.sql:27-28)
 * and createJourneyDb opens PGlite without the vector extension; no hop reads it.
 *
 * The hop bodies live in founder-path-lineage.hops-authoring.ts (1–6) and
 * founder-path-lineage.hops-filing.ts (7–8 and the walks).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { assertNoSchemaGaps, assertNoDegradedTenantEnrichment } from '../golden-journeys/harness';
import { T, buildWorld, baselineProblems, type World } from './founder-path-lineage.world';
import { hopProject, hopCapture, hopAnaDraft, hopEditSave, hopSeal, hopFileToVault } from './founder-path-lineage.hops-authoring';
import { hopPlace, hopTransmit, walkBack, walkForward } from './founder-path-lineage.hops-filing';

const h = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  /** The in-memory object store standing in for S3 / local disk: vaultVersionId → bytes. */
  objects: new Map<string, { bytes: Buffer; mime: string; filename: string; orgId: number }>(),
  /** Every byte string that left for the agency. */
  wire: [] as Buffer[],
}));

vi.mock('../../server/db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../server/db.js', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

/* Object storage is outside the process: an in-memory provider with the real
   interface (server/services/storage/storage-provider.ts), org-scoped on read
   exactly as that interface requires. */
vi.mock('../../server/services/storage/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/storage/index')>();
  const { createHash, randomUUID } = await import('node:crypto');
  const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const provider = {
    name: 'local',
    async put(opts: { orgId: number; projectId: string; filename: string; bytes: Buffer; mime: string }) {
      const vaultVersionId = randomUUID();
      h.objects.set(vaultVersionId, { bytes: Buffer.from(opts.bytes), mime: opts.mime, filename: opts.filename, orgId: opts.orgId });
      return {
        vaultFileId: `vault://${opts.orgId}/${opts.projectId}/${opts.filename}`,
        vaultVersionId,
        sizeBytes: opts.bytes.length,
        sha256: digest(opts.bytes),
        provider: 'local',
      };
    },
    async get(vaultVersionId: string, orgId: number) {
      const o = h.objects.get(vaultVersionId);
      if (!o || o.orgId !== orgId) return null;
      return { bytes: o.bytes, sizeBytes: o.bytes.length, sha256: digest(o.bytes), mime: o.mime, filename: o.filename };
    },
    async delete(vaultVersionId: string) { return h.objects.delete(vaultVersionId); },
    async list() { return []; },
    async getSignedUrl() { throw new Error('no signed urls in the lineage test'); },
    async isAvailable() { return true; },
  };
  return { ...actual, getStorageProvider: () => provider, getStorageProviderFor: () => provider };
});
/* Text extraction stays real for text; a PDF this test renders is read as its HTML. */
vi.mock('../../server/services/ocr/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ocr/index')>();
  return {
    ...actual,
    extractDocumentText: async (buffer: Buffer, mime: string | undefined, filename?: string) =>
      String(mime ?? '').includes('pdf')
        ? { text: buffer.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), method: 'test-pdf', confidence: 1 }
        : actual.extractDocumentText(buffer, mime, filename),
  };
});
vi.mock('../../server/services/ocr/pdfInspector', () => ({ pdfPageCount: async () => 1 }));
vi.mock('../../server/services/vault/document-catalog.service', () => ({
  isDocumentCatalogEnabled: async () => false,
  recordExtractionOutcome: vi.fn(),
  buildExtractionOutcome: () => ({ status: 'none' }),
}));
vi.mock('../../server/services/vault/document-chunking.service', () => ({
  isVaultChunkingEnabled: async () => false,
  chunkDocumentForIngest: vi.fn(),
}));
vi.mock('../../server/export/renderers', () => ({
  renderHtmlToPdf: async (html: string) => Buffer.from(`%PDF-1.7\n% rendered by the lineage test engine\n${html}`),
}));
/* No embedding provider exists here; the atom writer treats that as non-fatal. */
vi.mock('../../server/services/enhancedEmbeddingService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/enhancedEmbeddingService')>();
  return {
    ...actual,
    getEmbeddingService: () => ({
      embedAtom: async () => { throw new Error('no embedding provider in the lineage test'); },
    }),
  };
});
/* The agency wire, and only the wire: the real FDA ESG gateway, its guard and
   its transmittal ledger run; the AS2 POST, the MDN verdict and the body
   signature (which needs the sponsor's real key) are stubbed. */
vi.mock('../../server/services/submission-gateways/as2-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/submission-gateways/as2-transport')>();
  return {
    ...actual,
    signAs2Body: () => 'stub-signature',
    postAs2: async (opts: { body: Buffer }) => {
      h.wire.push(Buffer.from(opts.body));
      return { httpStatus: 200, headers: { 'message-id': '<stub-mdn@fda.example>' }, body: Buffer.from('stub MDN: processed') };
    },
    classifyAs2Delivery: () => ({ kind: 'RECEIVED', httpStatus: 200, responseRaw: 'stub MDN: processed', receiptId: '<stub-mdn@fda.example>' }),
  };
});

/**
 * The real migration files, applied in this order over the verbatim baseline
 * tables and harness DDL founder-path-lineage.world.ts names. Kept in THIS file
 * so tests/schema-contract/authoring-migration-list-closure.contract.test.ts
 * holds it to ALTER-closure.
 */
const MIGRATIONS = [
  // Identity, the chained audit ledger, and the Part 11 signing columns.
  'db/migrations/20260813_audit_tamper_proof_log.sql',
  'db/migrations/20260725_users_signing_lockout_columns.sql',
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260609_audit_hmac_seal.sql',
  'migrations/20260921_audit_logs_chain_seq.sql',
  // The project: the program, its filing scaffold, its PM-spine anchor.
  'migrations/20260524_program_workbench_schema.sql',
  'migrations/20260907_regulatory_programs_application_number.sql',
  'migrations/20260528_phase9_document_schema.sql',
  'migrations/20260529_phase9_backfill.sql',
  'migrations/20260804_phase9_rule_pack_outlines.sql',
  'migrations/20260814_projects_regulatory_program_anchor.sql',
  // The Data Room: the evidence spine and the upload ledger.
  'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
  'migrations/20260726_cre_source_program_scope.sql',
  'migrations/20260829_cre_source_versioning.sql',
  'migrations/20260726_file_uploads_tenancy.sql',
  'db/migrations/20260828_file_uploads_checksum.sql',
  // Authoring: the document loop, its ledger, seal, signatures, span lineage, aliases, provenance.
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260727_authoring_object_permissions.sql',
  'migrations/20260726_authoring_citation_source_usage.sql',
  'db/migrations/20260803_document_span_lineage.sql',
  'migrations/20260907_span_lineage_accepted_machine_draft.sql',
  'migrations/20260908_span_lineage_machine_draft.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  'migrations/20260727_authoring_document_program_scope.sql',
  'migrations/20260728_authoring_document_governed_binding.sql',
  'migrations/20260814d_document_alias_map.sql',
  'migrations/20260921_authoring_document_provenance.sql',
  // Submission Center: the governed sign, the dispatch gate's review store, the transmittal ledger.
  'migrations/20260604_shadow_review.sql',
  'db/migrations/20260725_submission_orchestrator_store_port.sql',
  'db/migrations/20260725_esig_gate_columns_port.sql',
  'migrations/20260813d_esignature_governed_unification.sql',
  'migrations/20260509_submission_gateways.sql',
  'migrations/20260629_submission_transmittals_mdn_raw.sql',
  'migrations/20260629_submission_transmittals_active_lock.sql',
] as const;
/** pgvector's column, as TEXT: see the header. */
const TEST_ONLY_SQL = 'ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS embedding TEXT;';

let world: World;
beforeAll(async () => {
  world = await buildWorld(h, MIGRATIONS, TEST_ONLY_SQL);
}, T);
afterAll(async () => {
  await world?.close();
});

describe('LX-00 — the founder path: project → Data Room → AnA → editor → seal → Vault → Submission Center → agency', () => {
  it('hop 1 · project — a project of org A, created the way the Projects surface creates it', () => hopProject(world), T);
  it('hop 2 · capture — bytes X into the project’s Data Room through the upload route', () => hopCapture(world), T);
  it('hop 3 · ana-draft — AnA drafts the canvas document, grounded on the source, under the stream’s own tool ctx', () => hopAnaDraft(world), T);
  it('hop 4 · edit-save — a person edits the quoted section and saves it through the section save path', () => hopEditSave(world), T);
  it('hop 5 · seal — the document is frozen and approved under a Part 11 signature', () => hopSeal(world), T);
  it('hop 6 · file-to-vault — the sealed document is filed to the project’s Vault', () => hopFileToVault(world), T);
  it('hop 7 · place — the filing copy and the Vault copy are placed as submission leaves', () => hopPlace(world), T);
  it('hop 8 · transmit — the sequence is frozen, dispatched and transmitted to FDA ESG (the wire stubbed)', () => hopTransmit(world), T);
  it('walk back · from the transmittal to cre_evidence_sources.checksum = sha256(X) and to the project', () => walkBack(world), T);
  it('walk forward · from the project and from the source to the transmittal', () => walkForward(world), T);

  it('the database the walk ran on held every table and column the code asked for', async () => {
    await assertNoDegradedTenantEnrichment();
    assertNoSchemaGaps(world.jdb);
  });
  it('the baseline names only real checks, each with its verified finding and LX fix, and never grows', () => {
    const problems = baselineProblems();
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
