/**
 * Safety net for DOCUMENT_STORE_CONSOLIDATION step 4 ("placement files a Vault
 * version"): ONE authoring document, placed the current way (coauthor filing
 * copy → coauthor_documents leaf) and filed to the Vault (file-to-vault →
 * vault_documents leaf), then compiled and gated, side by side.
 *
 * Real over PGlite: the authoring router (from-draft, file-to-vault), vault
 * ingest + placement, the Authoring→Vault approval carry, takeAuthoringSnapshot
 * (the service POST /api/coauthor/documents calls), upsertLeaf, the compile's
 * leaf materializer (materializeLeafSources), the readiness resolver +
 * computeDispatchReadiness, the release-approval gate and the transmit/freeze
 * blocker rule (assembledTransmitBlockers — freeze and dispatch dry-run the same
 * assembly, submission-service.ts:1496).
 *
 * Seams, each explicit: object storage is an in-memory map; OCR, page count,
 * catalog and chunking are stubbed as in the FD5 carry test; and the HTML→PDF
 * ENGINE is a stand-in (pdf-lib over the export HTML) because no Chromium is
 * installed here — the "shipped engine" case below shows what happens without it.
 * Byte/text parity measured against the stand-in says nothing about Chromium's
 * output; what does not depend on the engine (pins, gates, lineage) is asserted
 * exactly.
 */
import { vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: null as unknown, pool: null as unknown,
  objects: new Map<string, Buffer>(), discard: vi.fn(),
  engine: 'stand-in' as 'stand-in' | 'shipped',
}));
vi.mock('../../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../storage/index', async (orig) => {
  const { createHash: hash } = await import('node:crypto');
  const fake = {
    name: 'local',
    async put(o: { bytes: Buffer }) {
      const sha256 = hash('sha256').update(o.bytes).digest('hex');
      h.objects.set(`ver-${sha256}`, o.bytes);
      return { vaultFileId: `vault://${sha256}`, vaultVersionId: `ver-${sha256}`, sizeBytes: o.bytes.length, sha256, provider: 'local' };
    },
    async get(id: string) {
      const bytes = h.objects.get(id);
      return bytes ? { bytes, sizeBytes: bytes.length, sha256: '', mime: 'application/pdf', filename: 'v.pdf' } : null;
    },
    delete: h.discard,
  };
  return { ...(await orig<object>()), getStorageProvider: () => fake, getStorageProviderFor: () => fake };
});
vi.mock('../../ocr/index', () => ({
  extractDocumentText: async () => ({ text: 'Overview of Clinical Pharmacology', method: 'test', confidence: 1 }),
}));
vi.mock('../../ocr/pdfInspector', () => ({ pdfPageCount: async () => 1 }));
vi.mock('../../vault/document-catalog.service', () => ({
  isDocumentCatalogEnabled: async () => false, recordExtractionOutcome: vi.fn(), buildExtractionOutcome: () => ({ status: 'none' }),
}));
vi.mock('../../vault/document-chunking.service', () => ({ isVaultChunkingEnabled: async () => false, chunkDocumentForIngest: vi.fn() }));
vi.mock('../../../export/renderers', async (orig) => {
  const actual = await orig<typeof import('../../../export/renderers')>();
  const standIn = async (html: string) => (await import('../leaf-pdf-renderer')).renderLeafPdf(html, { title: 'stand-in HTML engine' });
  return {
    ...actual,
    renderHtmlToPdf: async (html: string, o?: never) => (h.engine === 'shipped' ? actual.renderHtmlToPdf(html, o) : standIn(html)),
    renderHtmlToPdfTracked: async (html: string, o?: never) =>
      h.engine === 'shipped' ? actual.renderHtmlToPdfTracked(html, o) : { buffer: await standIn(html), usedFallback: false },
  };
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { LEAF_SOURCE_PGLITE_DDL, SUBMISSION_CORE_PGLITE_DDL } from '../../../db/pglite-harness';
import {
  PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, ORG, mint, makeApp, asToken, M25_SECTIONS,
} from '../../../routes/__tests__/_authoring-canvas-fixture';
import { ingestVaultDocument, type VaultIngestArgs } from '../../vault/vault-ingest.service';
import { computeDocHash } from '../../authoring/authoring-export';
import { takeAuthoringSnapshot } from '../../coauthor/coauthor-snapshot';
import { upsertLeaf, type UpsertedLeaf } from '../../submission-service/submission-service';
import { materializeLeafSources, type MaterializeLeafSourcesResult } from '../leaf-source-resolver';
import { resolveLeafDocuments } from '../leaf-document-resolver';
import { computeDispatchReadiness } from '../dispatch-readiness';
import { evaluateReleaseApprovalGate } from '../dispatch-gate';
import { assembledTransmitBlockers } from '../assemble-from-core';

const REVIEWER = { id: 6, name: 'Rae Reviewer', email: 'rae@canvas.example' };
const APPROVER = { id: 7, name: 'Abe Approver', email: 'abe@canvas.example' };
const CTX = { organizationId: ORG, userId: Number(AUTHOR.id) };
const T = 180_000;
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let stageRoot = '';
const q = async <R = any>(sql: string, params: unknown[] = []) =>
  ((await (jdb.pool as unknown as { query: (s: string, p: unknown[]) => Promise<{ rows: R[] }> }).query(sql, params)).rows);

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: `${PREREQ}${AUTHORING_ACCESS_DDL}${VAULT_DDL}${LEAF_SOURCE_PGLITE_DDL}${SUBMISSION_CORE_PGLITE_DDL}
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
      INSERT INTO users (id, name, email) VALUES
        (${REVIEWER.id}, '${REVIEWER.name}', '${REVIEWER.email}'), (${APPROVER.id}, '${APPROVER.name}', '${APPROVER.email}');
      INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${REVIEWER.id}, 'member'), (${ORG}, ${APPROVER.id}, 'member');
      ALTER TABLE coauthor_documents
        ADD COLUMN IF NOT EXISTS sections JSONB, ADD COLUMN IF NOT EXISTS template_id INTEGER,
        ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS client_workspace TEXT,
        ADD COLUMN IF NOT EXISTS completion_percentage INTEGER, ADD COLUMN IF NOT EXISTS regulatory_compliance_score INTEGER,
        ADD COLUMN IF NOT EXISTS ectd_module_id INTEGER, ADD COLUMN IF NOT EXISTS module_name TEXT,
        ADD COLUMN IF NOT EXISTS embedding TEXT;
      CREATE TABLE IF NOT EXISTS coauthor_document_versions (
        id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL, version_number INTEGER NOT NULL, content TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP DEFAULT now(), created_by TEXT,
        change_summary TEXT, UNIQUE (document_id, version_number));
      CREATE TABLE IF NOT EXISTS audit_events (
        id SERIAL PRIMARY KEY, organization_id INTEGER, event_type TEXT, entity_type TEXT, entity_id TEXT,
        user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT, timestamp TIMESTAMPTZ, reason TEXT,
        metadata JSONB, regulatory_significant BOOLEAN, gxp_relevant BOOLEAN, created_at TIMESTAMPTZ);`,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
      'migrations/20260814d_document_alias_map.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260921_authoring_document_provenance.sql',
      'migrations/20260925_canonical_documents_append_only.sql',
      'migrations/20261006_document_data_dispositions.sql',
      'migrations/20261018_company_legal_registry.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  h.discard.mockImplementation(async (id: string) => h.objects.delete(id));
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../../../routes/authoring.router');
  app = makeApp(router);
  stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'placement-parity-'));
}, T);

afterAll(async () => {
  await jdb?.close();
  if (stageRoot) await fs.rm(stageRoot, { recursive: true, force: true });
});

describe('canonical ingest admission identity over actual PostgreSQL INSERT / ON CONFLICT', () => {
  function admissionArgs(): VaultIngestArgs {
    const code = randomUUID();
    return { ...CTX, programId: PROGRAM, documentCode: code, documentTitle: 'Admission identity',
      documentType: 'OTHER', version: '1.0', fileBuffer: Buffer.from(`%PDF-1.7\n${code}`),
      fileName: 'identity.pdf', mimeType: 'application/pdf', origin: 'platform-generated', executor: jdb.pool };
  }

  it('proves a new row once and retains the original row on an ordinary same-byte re-upload', async () => {
    const args = admissionArgs();
    const first = await ingestVaultDocument(args);
    expect(first).toMatchObject({ ok: true, admission: { created: true } });
    if (!first.ok) throw new Error(JSON.stringify(first));
    const second = await ingestVaultDocument(args);
    expect(second).toMatchObject({ ok: true, document: { id: first.document.id }, admission: { created: false } });
    expect(second).toHaveProperty('reupload');
    expect(await q('SELECT id, deleted_at FROM vault.documents WHERE program_id=$1 AND document_code=$2', [PROGRAM, args.documentCode]))
      .toEqual([{ id: first.document.id, deleted_at: null }]);
  });

  it('offers a conflict check-in hint only while the scoped code has one live head', async () => {
    const args = admissionArgs();
    const first = await ingestVaultDocument(args);
    if (!first.ok) throw new Error(JSON.stringify(first));
    const conflictingBytes = Buffer.from(`%PDF-1.7\nconflicting-${args.documentCode}`);
    const conflictArgs = { ...args, fileBuffer: conflictingBytes };
    h.discard.mockClear();
    expect(await ingestVaultDocument(conflictArgs)).toMatchObject({
      ok: false, code: 'VERSION_CONTENT_CONFLICT', headDocumentId: first.document.id, headVersion: '1.0',
    });
    const otherBytes = Buffer.from(`%PDF-1.7\nindependent-${args.documentCode}`);
    const other = await ingestVaultDocument({ ...args, version: '9.0', fileBuffer: otherBytes });
    if (!other.ok) throw new Error(JSON.stringify(other));
    const ambiguous = await ingestVaultDocument(conflictArgs);
    expect(ambiguous).toMatchObject({ ok: false, code: 'VERSION_CONTENT_CONFLICT' });
    expect(ambiguous).not.toHaveProperty('headDocumentId');
    expect(ambiguous).not.toHaveProperty('headVersion');
    expect(await q('SELECT id FROM vault.documents WHERE program_id=$1 AND document_code=$2 AND deleted_at IS NULL ORDER BY version',
      [PROGRAM, args.documentCode])).toEqual([{ id: first.document.id }, { id: other.document.id }]);
    expect(h.objects.get(`ver-${sha(args.fileBuffer)}`)).toEqual(args.fileBuffer);
    expect(h.objects.get(`ver-${sha(otherBytes)}`)).toEqual(otherBytes);
    expect(h.objects.has(`ver-${sha(conflictingBytes)}`)).toBe(false);
    expect(h.discard.mock.calls.map(call => call[0])).toEqual([
      `ver-${sha(conflictingBytes)}`, `ver-${sha(conflictingBytes)}`,
    ]);
  });

  it.each(['COMMIT', 'ROLLBACK'])('retains bytes and reports an unknown ingest outcome after lost %s acknowledgement', async lostReply => {
    const args = admissionArgs();
    h.discard.mockClear();
    const executor = { ...jdb.pool, connect: async () => {
      const client = await jdb.pool.connect();
      return { ...client, query: async (sql: string, params?: unknown[]) => {
        if (lostReply === 'ROLLBACK' && /INSERT INTO audit_logs/.test(sql)) throw new Error('audit failed before commit');
        const result = await client.query(sql, params);
        if (sql === lostReply) throw new Error(`${lostReply} acknowledgement lost after PostgreSQL executed it`);
        return result;
      } };
    } };
    const result = await ingestVaultDocument({ ...args, executor });
    expect(result).toMatchObject({ ok: false, status: 503, code: 'OUTCOME_UNKNOWN' });
    expect('message' in result && result.message).not.toMatch(/nothing (?:was )?(?:recorded|saved|changed)/i);
    const rows = await q<{ storage_version_id: string }>('SELECT storage_version_id FROM vault.documents WHERE program_id=$1 AND document_code=$2',
      [PROGRAM, args.documentCode]);
    expect(rows).toHaveLength(lostReply === 'COMMIT' ? 1 : 0);
    expect(h.objects.get(`ver-${sha(args.fileBuffer)}`)).toEqual(args.fileBuffer);
    expect(h.discard).not.toHaveBeenCalled();
  });

  it('proves a raced existing row was reused even when the pre-read missed it', async () => {
    const args = admissionArgs();
    const first = await ingestVaultDocument(args);
    if (!first.ok) throw new Error(JSON.stringify(first));
    // Statement-timing seam for an empty pre-read followed by a concurrent
    // winner. The UPSERT and returned row identity are actual PGlite SQL;
    // this is not a claim about native multi-connection locking.
    let missed = 0;
    const executor = { ...jdb.pool, connect: async () => {
      const client = await jdb.pool.connect();
      return { ...client, query: async (sql: string, params?: unknown[]) => {
        if (/SELECT id, content_hash, document_title/.test(sql)) { missed++; return { rows: [], rowCount: 0 }; }
        return client.query(sql, params);
      } };
    } };
    const raced = await ingestVaultDocument({ ...args, executor });
    expect(missed).toBe(1);
    expect(raced).toMatchObject({ ok: true, document: { id: first.document.id }, admission: { created: false } });
    expect(raced).not.toHaveProperty('reupload');
    expect(await q('SELECT id, deleted_at FROM vault.documents WHERE id=$1', [first.document.id]))
      .toEqual([{ id: first.document.id, deleted_at: null }]);
  });
});

/** One authoring document; APPROVED = reviewed and approved by two other members, sealed. */
async function authoringDocument(title: string, approved: boolean): Promise<string> {
  const res = await author(request(app).post('/api/authoring/docs/from-draft')).send({
    programId: PROGRAM, title, module: 'M2', sections: M25_SECTIONS, provenance: { source: 'ana' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const docId: string = res.body.data.doc.id;
  if (!approved) return docId;
  const digest = await computeDocHash(jdb.pool as never, docId, ORG);
  for (const [who, meaning, at] of [[REVIEWER, 'REVIEWER', '2026-10-01T09:00:00Z'], [APPROVER, 'APPROVER', '2026-10-01T10:00:00Z']] as const) {
    await q(`INSERT INTO authoring_signatures (id, doc_id, signer_email, signer_name, meaning, reason, method, content_hash, tenant_id, signed_at)
      VALUES ($1, $2, $3, $4, $5, 'Signed in Authoring', 'password+mfa', $6, $7, $8)`, [randomUUID(), docId, who.email, who.name, meaning, digest, ORG, at]);
  }
  await q(`UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1 AND tenant_id = $2`, [docId, ORG]);
  // The seal the freeze/approval writes; takeAuthoringSnapshot holds a verdict copy to it.
  const [doc] = await q('SELECT * FROM authoring_documents WHERE id = $1', [docId]);
  const sections = await q('SELECT * FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index, created_at, id', [docId]);
  const frozen = JSON.stringify({ document: doc, sections, frozenAt: new Date().toISOString() });
  await q(`INSERT INTO frozen_documents (document_id, version, frozen_content, content_hash, frozen_by, tenant_id)
    VALUES ($1, 'v1.0.frozen', $2, $3, 'abe@canvas.example', $4)`, [docId, frozen, sha(frozen), ORG]);
  return docId;
}

async function sequence(): Promise<number> {
  const [sub] = await q<{ id: number }>(`INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES ('IND', 'C2C-001', 'ind', 'pharma', 'fda', $1, $2, $3) RETURNING id`, [ORG, CTX.userId, PROGRAM]);
  const [seq] = await q<{ id: number }>(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
    VALUES ($1, 'fda', '0000', 'draft', $2, $3) RETURNING id`, [sub.id, ORG, CTX.userId]);
  return Number(seq.id);
}

const LEAF = { sectionCode: '2.5', title: 'Clinical Overview', lifecycleOp: 'new', reason: 'Placing the clinical overview' };

/** (a) today's path: the coauthor filing copy, then a coauthor_documents leaf. */
async function placeAsCoauthorCopy(docId: string): Promise<{ leaf: UpsertedLeaf; copyId: number }> {
  const taken = await takeAuthoringSnapshot({
    organizationId: ORG, sourceAuthoringDocId: docId, moduleNumber: '2.5', templateId: null, createdBy: AUTHOR.email,
    actor: { userId: CTX.userId, name: AUTHOR.name } as never, reason: 'Placing this document into the filing',
  });
  expect(taken.ok, JSON.stringify(taken)).toBe(true);
  const copyId = Number((taken as { document: { id: number } }).document.id);
  const leaf = await upsertLeaf({ ...LEAF, sequenceId: await sequence(), documentTable: 'coauthor_documents', documentId: copyId }, CTX);
  return { leaf, copyId };
}

/** (b) step 4's path: file-to-vault, then a vault_documents leaf on that version. */
async function placeAsVaultVersion(docId: string, format: 'pdf' | 'docx' = 'pdf') {
  const filed = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format });
  expect(filed.status, JSON.stringify(filed.body)).toBe(201);
  const vaultId: string = filed.body.data.vaultDocumentId;
  const leaf = await upsertLeaf({ ...LEAF, sequenceId: await sequence(), documentTable: 'vault_documents', documentUuid: vaultId }, CTX);
  return { leaf, vaultId, filed: filed.body.data as { sha256: string; approval: { carried: boolean } } };
}

/** The compile's leaf → bytes step, for one leaf. */
async function compile(leaf: UpsertedLeaf): Promise<MaterializeLeafSourcesResult & { bytes: Buffer | null; staged: any }> {
  const stageDir = await fs.mkdtemp(path.join(stageRoot, 'leaf-'));
  const out = await materializeLeafSources({
    leaves: [{ documentTable: leaf.documentTable ?? null, documentId: leaf.documentId ?? null, documentUuid: leaf.documentUuid ?? null, lifecycleOp: 'new' }],
    organizationId: ORG, stageDir,
  });
  const staged = [...out.byKey.values()][0] ?? null;
  return { ...out, staged, bytes: staged ? await fs.readFile(staged.sourcePath) : null };
}

/** Every gate a leaf passes on its way out, as freeze/dispatch/transmit compose them. */
async function gates(leaf: UpsertedLeaf, compiled: MaterializeLeafSourcesResult) {
  const [document] = await resolveLeafDocuments([leaf], ORG);
  const readiness = computeDispatchReadiness(
    [{ sectionCode: leaf.sectionCode, title: leaf.title, lifecycleOp: leaf.lifecycleOp ?? 'new', documentTable: leaf.documentTable ?? null,
      documentId: leaf.documentId ?? null, documentUuid: leaf.documentUuid ?? null, document }],
    { isOriginalSequence: true, sequenceNumber: '0000', region: 'fda' },
  );
  const transmit = assembledTransmitBlockers({ skipped: [], unfinalized: compiled.unfinalized,
    unfinalizedSections: compiled.unfinalizedSections, unresolvedLeaves: compiled.unresolved });
  return {
    resolution: { status: document.status, pin: document.pin, notTransmittable: document.notTransmittable ?? null },
    errors: readiness.errors,
    findingCodes: readiness.findings.map((f) => f.code).sort(),
    release: evaluateReleaseApprovalGate(readiness.releaseBlockers).cleared,
    transmitClear: transmit.length === 0,
  };
}

async function pdfFacts(bytes: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    text += (await page.getTextContent()).items.map((it: any) => it.str ?? '').join(' ') + '\n';
  }
  const outline = ((await doc.getOutline()) ?? []).map((o: { title: string }) => o.title);
  return { pages: doc.numPages, text: text.replace(/\s+/g, ' '), outline };
}

describe('step 4 safety net: one approved authoring document, placed as a coauthor copy vs filed as a Vault version', () => {
  let sourceDocId: string;
  let A: Awaited<ReturnType<typeof placeAsCoauthorCopy>>;
  let B: Awaited<ReturnType<typeof placeAsVaultVersion>>;
  let cA: Awaited<ReturnType<typeof compile>>;
  let cB: Awaited<ReturnType<typeof compile>>;

  beforeAll(async () => {
    h.engine = 'stand-in';
    const docId = await authoringDocument('Clinical Overview parity', true);
    sourceDocId = docId;
    A = await placeAsCoauthorCopy(docId);
    B = await placeAsVaultVersion(docId);
    cA = await compile(A.leaf);
    cB = await compile(B.leaf);
  }, T);

  it('both compile to a materialized PDF leaf with nothing unresolved or unfinalized', () => {
    for (const c of [cA, cB]) {
      expect(c.unresolved, JSON.stringify(c.unresolved)).toEqual([]);
      expect(c.materialized).toBe(1);
      expect(c.unfinalized, JSON.stringify(c.unfinalizedSections)).toBe(0);
      expect(c.bytes!.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
    expect(B.filed.approval.carried).toBe(true);
  });

  it('the bytes differ — by construction, not by timestamps — and every authored section body is in both', async () => {
    // (a) is re-rendered at EVERY compile from the copy's text by renderLeafPdf
    // (leaf-source-resolver.ts:507); (b) is the export rendered ONCE at filing and
    // staged raw (:717). Different inputs (the export adds its own title/notice
    // matter), different engines in production (pdf-lib vs Chromium).
    expect(cA.bytes!.equals(cB.bytes!)).toBe(false);
    const [fa, fb] = [await pdfFacts(cA.bytes!), await pdfFacts(cB.bytes!)];
    for (const s of M25_SECTIONS) {
      const body = s.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
      expect(fa.text).toContain(body);
      expect(fb.text).toContain(body);
    }
    // Recorded, not judged: page count and bookmarks are engine properties.
    expect(fa.pages).toBeGreaterThan(0);
    expect(fb.pages).toBeGreaterThan(0);
    expect(fa.outline.length).toBeGreaterThan(0); // renderLeafPdf always writes /Outlines
  });

  it('(a) is deterministic across compiles; (b) is the stored bytes themselves', async () => {
    expect((await compile(A.leaf)).bytes!.equals(cA.bytes!)).toBe(true);
    expect((await compile(B.leaf)).bytes!.equals(cB.bytes!)).toBe(true);
    expect(sha(cB.bytes!)).toBe(B.filed.sha256);
  });

  it('PIN SEMANTICS DIFFER: the coauthor pin is the copy TEXT, the vault pin is the emitted PDF bytes', async () => {
    const [copy] = await q<{ content: string }>('SELECT content FROM coauthor_documents WHERE id = $1', [A.copyId]);
    expect(A.leaf.documentContentSha256).toBe(sha(copy.content));
    expect(A.leaf.documentContentSha256).not.toBe(cA.staged.sha256);
    expect(B.leaf.documentContentSha256).toBe(cB.staged.sha256);
    expect(B.leaf.documentContentSha256).toBe(sha(cB.bytes!));
  });

  it('dispatch readiness, release (freeze/dispatch/transmit) and the transmit blocker rule give the same verdict', async () => {
    const [gA, gB] = [await gates(A.leaf, cA), await gates(B.leaf, cB)];
    expect(gA.resolution).toEqual({ status: 'resolved', pin: 'match', notTransmittable: null });
    expect(gB).toEqual(gA);
    expect(gA.release && gA.transmitClear).toBe(true);
  });

  it('carries the verified filing derivation separately from alias identity', () => {
    expect(cA.staged.lineage).toMatchObject({ available: true, store: 'coauthor_documents', source: { store: 'authoring_documents' } });
    expect(cB.staged.lineage).toBeUndefined();
    expect(cB.staged.derivation).toMatchObject({
      status: 'recorded', programId: PROGRAM, artifactSha256: B.filed.sha256,
      source: { store: 'authoring_documents', nativeId: sourceDocId, sectionsSha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      receipt: { id: expect.any(String), chain: 'linked', seal: expect.stringMatching(/^(valid|no-key)$/) },
    });
  });
});

it('keeps a retained draft filing receipt after the editable source changes', async () => {
  h.engine = 'stand-in';
  const docId = await authoringDocument('Historical working draft receipt', false);
  const filed = await placeAsVaultVersion(docId);
  const before = await compile(filed.leaf);
  expect(before.staged.derivation).toMatchObject({ status: 'recorded', source: { nativeId: docId } });
  const editableHashBefore = await computeDocHash(jdb.pool as never, docId, ORG);
  await q(`UPDATE authoring_sections SET content = content || '<p>Subsequent editable source change.</p>' WHERE doc_id = $1`, [docId]);
  const after = await compile(filed.leaf);
  expect(after.staged.derivation).toEqual(before.staged.derivation);
  expect(await computeDocHash(jdb.pool as never, docId, ORG)).not.toBe(editableHashBefore);
  expect(after.staged.sha256).toBe(filed.filed.sha256);
  expect(after.unfinalized).toBeGreaterThan(0);
});

describe('step 4 safety net: refusals agree, and where they do not', () => {
  it('a working draft blocks release on both paths, each naming why', async () => {
    h.engine = 'stand-in';
    const docId = await authoringDocument('Clinical Overview draft', false);
    const A = await placeAsCoauthorCopy(docId);
    const B = await placeAsVaultVersion(docId);
    const [cA, cB] = [await compile(A.leaf), await compile(B.leaf)];
    const [gA, gB] = [await gates(A.leaf, cA), await gates(B.leaf, cB)];
    expect([gA.release, gA.transmitClear, gB.release, gB.transmitClear]).toEqual([false, false, false, false]);
    expect(gA.findingCodes).toEqual(gB.findingCodes);
    expect(gA.resolution.notTransmittable).toBe('draft');
    expect(gB.resolution.notTransmittable).toBe('not reviewed');
  }, T);

  it('OPEN GAP: with the engine this repo ships (no Chromium), file-to-vault PDF is refused, so step 4 has no PDF to place', async () => {
    h.engine = 'shipped';
    try {
      const docId = await authoringDocument('Clinical Overview shipped engine', true);
      const res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(JSON.stringify(res.body)).toContain('PDF_RENDERER_UNAVAILABLE');
      // The coauthor path needs no HTML engine: pdf-lib renders it at compile.
      const A = await placeAsCoauthorCopy(docId);
      expect((await compile(A.leaf)).materialized).toBe(1);
    } finally {
      h.engine = 'stand-in';
    }
  }, T);

  it('a DOCX filing is refused by readiness as well as by the compile, so the Validation tab and freeze agree (gap closed 2026-10-17)', async () => {
    h.engine = 'stand-in';
    const docId = await authoringDocument('Clinical Overview docx', true);
    const B = await placeAsVaultVersion(docId, 'docx');
    const cB = await compile(B.leaf);
    expect(cB.unresolved.map((u) => u.reason).join(' ')).toMatch(/not a valid PDF/);
    const g = await gates(B.leaf, cB);
    expect(g.transmitClear).toBe(false);
    // Readiness's vault lookup now refuses what the assembler refuses before it
    // reads a byte (not a PDF, bytes withdrawn, not on the storage provider).
    expect(g.resolution.status).toBe('missing');
    // A missing leaf is a readiness error (it blocks dispatch); the release gate
    // judges approval of the leaves that resolve, so it is not the check here.
    expect(g.errors).toBeGreaterThan(0);
  }, T);

  // The mounted existing File to vault → Open in Vault → Place into filing
  // path and exact vault_documents UUID are covered by the composed
  // client/src/concept2cure/v2/__tests__/authoringVaultPlacementFlow.test.tsx.
  // This file
  // qualifies the actual authoring/ingest/leaf services and approval gates.
  it.todo('step 4: re-filing an edited document must supersede (supersedes_id) the version a live leaf pins; file-to-vault passes no supersedesDocumentId today');
});
