/**
 * FD5 (c), decided 2026-10-01: a sealed Authoring approval carries to its
 * Vault copy when it is bound to the exported bytes (rows D5, D7).
 *
 * The REAL authoring router, ingest, lifecycle store, gate, append-only guard
 * and chained audit writer over PGlite. The Authoring signatures are seeded as
 * the signing routes store them (their own tests cover the ceremony): a
 * content_hash that is the sections digest at signing.
 *
 * Proves: an APPROVED document reviewed and approved by two other members
 * files as an approved Vault version whose sign-offs name the Authoring
 * signatures and are bound to the file's SHA-256, so the transmit gate passes
 * it; and each way the Authoring record falls short of the Vault's policy
 * carries nothing, says why, and leaves the version unreviewed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { LEAF_SOURCE_PGLITE_DDL } from '../../db/pglite-harness';
import { PREREQ, VAULT_DDL, AUTHOR, PROGRAM, ORG, mint, makeApp, asToken, M25_SECTIONS } from './_authoring-canvas-fixture';
import { computeDocHash } from '../../services/authoring/authoring-export';
import { vaultVersionNotTransmittable, readVaultLifecycles } from '../../services/vault/vault-lifecycle';
import { hashLifecyclePayload } from '../../services/regulatory/canonicalDocumentStore';
import { verifyAuditChain } from '../../../shared/regulatory/document-lifecycle';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, put: vi.fn() }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../services/storage/index', () => ({
  getStorageProvider: () => ({ name: 'local', put: h.put, get: vi.fn(), delete: vi.fn() }),
}));
vi.mock('../../services/ocr/index', () => ({
  extractDocumentText: async () => ({ text: 'Overview of Clinical Pharmacology', method: 'test', confidence: 1 }),
}));
vi.mock('../../services/ocr/pdfInspector', () => ({ pdfPageCount: async () => 1 }));
vi.mock('../../services/vault/document-catalog.service', () => ({
  isDocumentCatalogEnabled: async () => false,
  recordExtractionOutcome: vi.fn(),
  buildExtractionOutcome: () => ({ status: 'none' }),
}));
vi.mock('../../services/vault/document-chunking.service', () => ({
  isVaultChunkingEnabled: async () => false,
  chunkDocumentForIngest: vi.fn(),
}));
vi.mock('../../export/renderers', () => ({
  renderHtmlToPdf: async (html: string) => Buffer.from(`%PDF-1.7\n% rendered by the test engine\n${html}`),
  // The export renders through the tracked form (QA 2026-10-08, j4); same stub.
  renderHtmlToPdfTracked: async (html: string) => ({
    buffer: Buffer.from(`%PDF-1.7\n% rendered by the test engine\n${html}`),
    usedFallback: false,
  }),
}));

const REVIEWER = { id: 6, name: 'Rae Reviewer', email: 'rae@canvas.example' };
const APPROVER = { id: 7, name: 'Abe Approver', email: 'abe@canvas.example' };
const OUTSIDER = { id: 8, name: 'Oz Outsider', email: 'oz@elsewhere.example' };

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
const q = async <R = any>(sql: string, params: unknown[] = []) =>
  ((await (jdb.pool as unknown as { query: (s: string, p: unknown[]) => Promise<{ rows: R[] }> }).query(sql, params)).rows);

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: `${PREREQ}${VAULT_DDL}${LEAF_SOURCE_PGLITE_DDL}
      INSERT INTO users (id, name, email) VALUES
        (${REVIEWER.id}, '${REVIEWER.name}', '${REVIEWER.email}'),
        (${APPROVER.id}, '${APPROVER.name}', '${APPROVER.email}'),
        (${OUTSIDER.id}, '${OUTSIDER.name}', '${OUTSIDER.email}');
      INSERT INTO organization_users (organization_id, user_id, role) VALUES
        (${ORG}, ${REVIEWER.id}, 'member'), (${ORG}, ${APPROVER.id}, 'member');`,
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
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  h.put.mockImplementation(async (opts: { bytes: Buffer }) => ({
    vaultFileId: `vault://${ORG}/${PROGRAM}/file`,
    vaultVersionId: `ver-${createHash('sha256').update(opts.bytes).digest('hex').slice(0, 8)}`,
    sizeBytes: opts.bytes.length,
    sha256: createHash('sha256').update(opts.bytes).digest('hex'),
    provider: 'local',
  }));
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

interface Sig { meaning: 'REVIEWER' | 'APPROVER'; who: { email: string; name: string }; at: string; content?: 'other' }

/** A drafted document, put into the state the signing routes leave it in. */
async function signedDocument(title: string, status: string, sigs: Sig[]): Promise<{ docId: string; ids: string[]; digest: string }> {
  const res = await author(request(app).post('/api/authoring/docs/from-draft')).send({
    programId: PROGRAM, title, module: 'M2', sections: M25_SECTIONS, provenance: { source: 'ana' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const docId: string = res.body.data.doc.id;
  const digest = await computeDocHash(jdb.pool as never, docId, ORG);
  const ids: string[] = [];
  for (const s of sigs) {
    const id = randomUUID();
    ids.push(id);
    await q(
      `INSERT INTO authoring_signatures (id, doc_id, signer_email, signer_name, meaning, reason, method, content_hash, tenant_id, signed_at)
       VALUES ($1, $2, $3, $4, $5, 'Signed in Authoring', 'password+mfa', $6, $7, $8)`,
      [id, docId, s.who.email, s.who.name, s.meaning, s.content === 'other' ? 'f'.repeat(64) : digest, ORG, s.at],
    );
  }
  await q(`UPDATE authoring_documents SET status = $1 WHERE id = $2 AND tenant_id = $3`, [status, docId, ORG]);
  return { docId, ids, digest };
}

const fileIt = (docId: string) => author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
const recordsFor = (vaultId: string) =>
  q(`SELECT * FROM canonical_documents WHERE source_refs -> 'vault_documents' ->> 'nativeId' = $1`, [vaultId]);

const REVIEW: Sig = { meaning: 'REVIEWER', who: REVIEWER, at: '2026-10-01T09:00:00Z' };
const APPROVE: Sig = { meaning: 'APPROVER', who: APPROVER, at: '2026-10-01T10:00:00Z' };
const AUTHOR_SIGNER = { email: AUTHOR.email, name: AUTHOR.name };

describe('FD5 (c): a sealed Authoring approval carries to its Vault copy', () => {
  it('reviewed and approved by two other members: the Vault version is approved, naming those signatures, bound to the file', async () => {
    const { docId, ids: [reviewId, approvalId], digest } = await signedDocument('CSR carried', 'APPROVED', [REVIEW, APPROVE]);
    const res = await fileIt(docId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { vaultDocumentId, sha256, approval } = res.body.data;
    expect(approval).toMatchObject({ carried: true, reviewedBy: REVIEWER.name, approvedBy: APPROVER.name });

    const [rec] = await recordsFor(vaultDocumentId);
    expect(rec.stage).toBe('approved');
    expect(rec.content_hash).toBe(sha256);
    // The author of the record for separation of duties is the document's author, not the filer's role.
    expect(Number(rec.created_by)).toBe(Number(AUTHOR.id));
    for (const [col, sigId, signer, meaning] of [
      ['review_signature', reviewId, REVIEWER.id, 'reviewed'],
      ['approval_signature', approvalId, APPROVER.id, 'approved'],
    ] as const) {
      expect(rec[col]).toMatchObject({
        actor: String(signer),
        meaning,
        signatureRef: `authoring-sig:${sigId}`,
        boundContentHash: sha256,
        bindingBasis: 'authoring-rendition-sha256',
        carriedFrom: { system: 'authoring', documentId: docId, signatureId: sigId, signedContentHash: digest },
      });
    }
    // The per-document trail went through the gate and verifies, hashes recomputed.
    const trail = rec.audit as Array<{ from: string; to: string; signatureRef?: string }>;
    expect(trail.map((e) => `${e.from}→${e.to}`)).toEqual(['authoring→in_review', 'in_review→in_review', 'in_review→approved']);
    expect(verifyAuditChain(trail as never, hashLifecyclePayload).valid).toBe(true);

    // Nothing was signed again: the sign-offs name the Authoring rows.
    const esig = await q(`SELECT to_regclass('public.electronic_signatures') IS NOT NULL AS present`);
    if (esig[0].present) expect(await q(`SELECT 1 FROM electronic_signatures`)).toEqual([]);

    // One chained row records the binding.
    const [carried] = await q(`SELECT new_values FROM audit_logs WHERE action = 'vault.version.approval_carried' AND record_id = $1`, [vaultDocumentId]);
    const details = typeof carried.new_values === 'string' ? JSON.parse(carried.new_values) : carried.new_values;
    expect(details).toMatchObject({
      authoringDocumentId: docId, artifactSha256: sha256, renderedSectionsDigest: digest,
      review: { signatureId: reviewId, signer: REVIEWER.id }, approval: { signatureId: approvalId, signer: APPROVER.id },
    });

    // Transmit takes it, for these bytes only.
    expect(await vaultVersionNotTransmittable(jdb.pool as never, ORG, vaultDocumentId, sha256)).toBeNull();
    expect(await vaultVersionNotTransmittable(jdb.pool as never, ORG, vaultDocumentId, 'a'.repeat(64)))
      .toBe('approved for different content than these bytes');

    // The Vault shows the sign-offs as signed in Authoring, by their printed names.
    const shown = (await readVaultLifecycles(jdb.pool as never, ORG, [vaultDocumentId])).get(vaultDocumentId)!;
    expect(shown.stage).toBe('approved');
    expect(shown.approval).toMatchObject({ printedName: APPROVER.name, meaning: 'APPROVED', carriedFrom: 'authoring', signerId: APPROVER.id });
    expect(shown.review).toMatchObject({ printedName: REVIEWER.name, meaning: 'REVIEWED', carriedFrom: 'authoring', signerId: REVIEWER.id });
  }, T);

  it.each([
    ['a working draft', 'draft', [REVIEW, APPROVE], /not approved in Authoring \(status: draft\)/],
    ['frozen, never approved', 'FROZEN', [REVIEW], /not approved in Authoring \(status: FROZEN\)/],
    ['approved with no review', 'APPROVED', [APPROVE], /No review signature covers this content/],
    ['reviewed after the approval', 'APPROVED', [APPROVE, { ...REVIEW, at: '2026-10-01T11:00:00Z' }], /No review signature covers this content/],
    ['reviewed and approved by one person', 'APPROVED', [{ ...REVIEW, who: APPROVER }, APPROVE], /approver also signed the review/],
    ['approved by its author', 'APPROVED', [REVIEW, { ...APPROVE, who: AUTHOR_SIGNER }], /author signed its review or approval/],
    ['reviewed by its author', 'APPROVED', [{ ...REVIEW, who: AUTHOR_SIGNER }, APPROVE], /author signed its review or approval/],
    ['a signer outside the organization', 'APPROVED', [{ ...REVIEW, who: OUTSIDER }, APPROVE], /not a member of this organization/],
    ['an approval of other content', 'APPROVED', [REVIEW, { ...APPROVE, content: 'other' as const }], /No Authoring approval signature covers the content that was filed/],
  ] as const)('%s: nothing carries, the editor is told why, and the version is not reviewed', async (label, status, sigs, reason) => {
    const { docId } = await signedDocument(`Not carried: ${label}`, status, sigs as unknown as Sig[]);
    const res = await fileIt(docId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { vaultDocumentId, sha256, approval } = res.body.data;
    expect(approval.carried).toBe(false);
    expect(approval.reason).toMatch(reason);
    expect(await recordsFor(vaultDocumentId)).toEqual([]);
    expect(await vaultVersionNotTransmittable(jdb.pool as never, ORG, vaultDocumentId, sha256)).toBe('not reviewed');
    expect(await q(`SELECT 1 FROM audit_logs WHERE action = 'vault.version.approval_carried' AND record_id = $1`, [vaultDocumentId])).toEqual([]);
  }, T);
});
