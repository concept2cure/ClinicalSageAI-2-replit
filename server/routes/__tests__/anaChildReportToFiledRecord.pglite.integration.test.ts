/**
 * Expanded spike check 1 (§14.4), joined: one run, from a child's report to a filed record.
 *
 * Each link was proven on its own fixture (docs/evidence/SPINE/S4/2026-11-09-spike-joined-run). This is the one
 * database that holds them all: the run-coordination ledger (support/coordination-fixture.ts), the tool gate
 * (AnaToolExecutor.ts preHandlerRefusal), the authoring router and its release gate, and the Vault filing.
 *
 * What is real: the coordination host and its audit chain, the deterministic source-claim comparison a verify agent
 * runs (sub-agent-result.ts compareStoredSourceClaims), the tool gate, the router, the independent checks, the
 * ingest and the placement. What is replaced is what leaves the process: storage, OCR, the Word-to-PDF engine and
 * the catalog and chunking toggles, as in authoringFileToVault.pglite.integration.test.ts. No model is called: the
 * two drafts are fixed text, one of which states a figure its source contradicts.
 *
 * What it does NOT join: a signature. The filing here is of a released draft, not a frozen or approved one; the seal
 * is proven in authoringFileToVaultApprovalCarry.pglite.integration.test.ts and the signing routes' own suites.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type express from 'express';
import { AUTHOR, ORG, PROGRAM, REVIEW_ACCESS_DDL, VAULT_DDL, asToken, makeApp, mint, releaseAnaDraft } from './_authoring-canvas-fixture';
import { assignment, fixture, pool, seedCoordinationMember, setupCoordinationFixture, subject } from '../../services/ana/__tests__/support/coordination-fixture';
import { coordinationSha256, readRunCoordination } from '../../services/ana/run-events';
import { compareStoredSourceClaims } from '../../services/ana/sub-agent-result';
import { draftSourceIdentityForText } from '../../services/ana/draft-source-identity';
import type { DraftSource } from '../../services/ana/draft-project-sources';
import { openTurnRecorder, writeTurnRecordSafely } from '../../services/ana/turn-record';

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
vi.mock('../../services/pdf-converter', () => ({
  convertDocxToPdf: async (word: Buffer) => (await import('./_authoring-pdf-converter-fixture')).convertedPdfFixture(word),
}));

const T = 240_000;
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5' };
const SOURCE_ID = '10000000-0000-4000-8000-000000000001';
const RECORDED = 'In Study DPL-301, a total of 300 patients were randomized.';
/** The deliberate unsupported claim: the recorded study randomized 300. */
const UNSUPPORTED = 'In Study DPL-301, a total of 999 patients were randomized.';
const REJECT_REASON = 'The enrolment figure contradicts the recorded study.';
const ACCEPT_REASON = 'Keep as a proposal for the author to review.';

const sectionsOf = (enrolment: string) => [
  { code: '2.5.1', title: 'Product Development Rationale', content: `<p>${enrolment}</p>` },
  { code: '2.5.3', title: 'Overview of Clinical Pharmacology', content: '<p>The clinical pharmacology studies are described in the study reports.</p>' },
];
const sha = (value: unknown) => coordinationSha256(JSON.stringify(value));
function recordedSource(): DraftSource {
  const span = { start: 0, end: RECORDED.length, totalChars: RECORDED.length };
  return { ...draftSourceIdentityForText(RECORDED, span), documentId: SOURCE_ID, programId: PROGRAM,
    contentHash: createHash('sha256').update(`stored:${RECORDED}`).digest('hex'), text: RECORDED, span, title: 'Recorded study',
    extractionMethod: 'pdf-text', extractionConfidence: null, originalFileAvailable: true, disposition: null,
    sourceAvailability: 'available', completeText: true, sensitivityTier: 2 } as DraftSource;
}

let app: express.Express;
let author: (r: request.Test) => request.Test;

beforeAll(async () => {
  await setupCoordinationFixture(undefined, {
    prereqSql: REVIEW_ACCESS_DDL + VAULT_DDL,
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
      'migrations/20260921_authoring_document_provenance.sql',
      'migrations/20260930_vault_documents_version_lineage.sql',
      'migrations/20260731c_canonical_documents.sql',
      'migrations/20261023_review_routes.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
    ],
  });
  h.db = fixture.db;
  h.pool = fixture.pool;
  h.put.mockImplementation(async (opts: { bytes: Buffer }) => ({
    vaultFileId: `vault://${ORG}/${PROGRAM}/file`,
    vaultVersionId: `ver-${createHash('sha256').update(opts.bytes).digest('hex').slice(0, 8)}`,
    sizeBytes: opts.bytes.length,
    sha256: createHash('sha256').update(opts.bytes).digest('hex'),
    provider: 'local',
  }));
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router, { dbClient: fixture.pool as never });
}, T);
afterAll(async () => { await fixture?.close(); });
beforeEach(seedCoordinationMember);

describe('one run, from a child report to a filed record (spike check 1, joined)', () => {
  it('rejects the unsupported draft, accepts the corrected one only as a proposal, and files only what a person released', async () => {
    const { scope, source, host } = await subject(undefined, undefined, 'run_spike_joined_merge_lock');

    // 1. Draft and check are distinct workers. The check is the real deterministic comparison against the source.
    const firstDraft = sectionsOf(UNSUPPORTED);
    const drafter = await host.assign({ ...assignment('draft-1'), source });
    const verifier = await host.assign({ ...assignment('verify-1'), role: 'verify', parentStep: 's2', source });
    const draftReport = await host.report(drafter.handle, { intentId: 'draft-1-report', reportSha256: sha(firstDraft), source,
      outcome: 'completed', completed: 2, total: 2, basisKind: 'deterministic_checks' });
    const firstCheck = compareStoredSourceClaims(UNSUPPORTED, [recordedSource()]);
    expect(firstCheck.reading.outcome).toBe('fail');
    expect(firstCheck.output.findings).toContainEqual(expect.objectContaining({ disposition: 'rejected', reason: 'NUMERIC_SOURCE_CONTRADICTION' }));
    await host.report(verifier.handle, { intentId: 'verify-1-report', reportSha256: sha(firstCheck.output), source,
      outcome: 'completed', completed: 1, total: 1, basisKind: 'deterministic_checks' });
    await host.assess({ intentId: 'reject-draft-1', worker: 'w1', reportEventId: draftReport.receipt.eventId, reportSha256: sha(firstDraft),
      decision: 'rejected', reason: REJECT_REASON });

    // 2. A corrected draft from a new worker. The same check finds nothing to reject, and still does not call it verified.
    const accepted = sectionsOf(RECORDED);
    const redrafter = await host.assign({ ...assignment('draft-2'), parentStep: 's3', source });
    const redraftReport = await host.report(redrafter.handle, { intentId: 'draft-2-report', reportSha256: sha(accepted), source,
      outcome: 'completed', completed: 2, total: 2, basisKind: 'deterministic_checks' });
    const secondCheck = compareStoredSourceClaims(RECORDED, [recordedSource()]);
    expect(secondCheck.reading.outcome).toBe('see_result');
    await host.assess({ intentId: 'accept-draft-2', worker: redrafter.handle.worker, reportEventId: redraftReport.receipt.eventId,
      reportSha256: sha(accepted), decision: 'accepted_as_proposal', reason: ACCEPT_REASON });

    // 3. Acceptance is only a proposal: it wrote no document.
    const docsBefore = await pool.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1', [ORG]);
    expect(docsBefore.rows[0].n).toBe(0);

    // 4. A child cannot make the merge itself, even holding a confirmation.
    const { getToolHandler } = await import('../../services/ana/AnaToolExecutor.js');
    const childCtx = { organizationId: ORG, userId: Number(AUTHOR.id), projectId: 42, agentDepth: 1, humanConfirmed: true,
      servingModel: OPUS, turnId: scope.runId };
    for (const tool of ['draft_authoring_document', 'save_document_to_vault', 'commit_document_revision']) {
      const refused = JSON.parse(await getToolHandler(tool)!({ title: 'Clinical overview', sections: accepted, content: 'x' }, childCtx as never));
      expect(refused, tool).toMatchObject({ error: 'SUB_AGENT_READ_ONLY', tool });
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1', [ORG])).rows[0].n).toBe(0);

    // 5. The parent's merge is the person's own write of exactly the accepted text, naming the run.
    const merged = await author(request(app).post('/api/authoring/docs/from-draft')).send({
      programId: PROGRAM, title: 'Module 2.5 Clinical Overview, from an accepted proposal', module: 'M2',
      sections: accepted, provenance: { source: 'ana', turnId: scope.runId },
    });
    expect(merged.status, JSON.stringify(merged.body)).toBe(201);
    const docId: string = merged.body.data.doc.id;
    const stored = await pool.query('SELECT code, title, content FROM authoring_sections WHERE doc_id=$1 ORDER BY order_index', [docId]);
    expect(sha(stored.rows)).toBe(sha(accepted));

    // 6. The turn ends and its record is filed: the document then names the model, and still cannot be filed.
    const recorder = openTurnRecorder({ orgId: ORG, userId: Number(AUTHOR.id), typed: 'Draft 2.5 from the study', runId: scope.runId })!;
    recorder.setAnswer({ streamed: 'Drafted.', stored: 'Drafted.' });
    recorder.setModel(OPUS);
    recorder.addServed(1, OPUS);
    expect((await writeTurnRecordSafely(fixture.pool as never, recorder, 'answered')).status).toBe('recorded');
    const read = await author(request(app).get(`/api/authoring/docs/${docId}`));
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(JSON.stringify(read.body)).toContain('claude-opus-5-5');
    const held = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
    expect(held.status, JSON.stringify(held.body)).toBe(409);
    expect(held.body.error?.code).toBe('INDEPENDENT_CHECK_REQUIRED');
    expect(h.put).not.toHaveBeenCalled();

    // 7. A person replaces the machine text and the saved-document checks pass: only then is it filed, by its hash.
    await releaseAnaDraft(app, author, merged.body.data);
    const filed = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    const bytes = (h.put.mock.calls.at(-1)?.[0] as { bytes: Buffer }).bytes;
    expect(filed.body.data.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const vault = await pool.query('SELECT content_hash FROM vault.documents WHERE id=$1', [filed.body.data.vaultDocumentId]);
    expect(vault.rows).toEqual([{ content_hash: filed.body.data.sha256 }]);

    // 8. The decisions are rebuilt from the audit alone, in order, each bound to its report, without the reasons.
    const replay = await readRunCoordination(pool, scope);
    expect(Object.fromEntries(replay.workers.map(worker => [worker.worker, worker.parentDisposition])))
      .toMatchObject({ w1: 'rejected', [redrafter.handle.worker]: 'accepted_as_proposal' });
    const ledger = (await pool.query('SELECT new_values FROM audit_logs WHERE record_id=$1 ORDER BY chain_seq', [scope.runId])).rows
      .map(row => row.new_values as { operation: string; worker?: string; snapshot?: { parentDisposition?: string };
        basis?: Array<{ kind: string; ref: string; sha256?: string }> });
    expect(ledger.map(row => row.operation)).toEqual(['assigned', 'assigned', 'report', 'report', 'disposition', 'assigned', 'report', 'disposition']);
    expect(ledger.filter(row => row.operation === 'disposition').map(row => [row.worker, row.snapshot?.parentDisposition, row.basis?.find(b => b.kind === 'report')])).toEqual([
      ['w1', 'rejected', { kind: 'report', ref: draftReport.receipt.eventId, sha256: sha(firstDraft) }],
      [redrafter.handle.worker, 'accepted_as_proposal', { kind: 'report', ref: redraftReport.receipt.eventId, sha256: sha(accepted) }]]);
    const coordinationAudit = JSON.stringify(ledger);
    for (const words of [REJECT_REASON, ACCEPT_REASON, '999 patients', '300 patients']) expect(coordinationAudit).not.toContain(words);

    // The document's own trail, by the same person: created naming the run, replaced, checked, then filed. In that order.
    const trail = (await pool.query(
      `SELECT operation_type AS op, min(created_at) AS first, max(created_at) AS last, count(*)::int AS n,
              bool_and(actor_email = $2) AS by_author
         FROM authoring_audit_trail WHERE doc_id=$1 GROUP BY operation_type`, [docId, AUTHOR.email])).rows as
      Array<{ op: string; first: Date; last: Date; n: number; by_author: boolean }>;
    const step = (op: string) => trail.find(row => row.op === op)!;
    expect(trail.map(row => row.op).sort()).toEqual(['CREATE', 'EXPORT', 'INDEPENDENT_CHECK_INIT', 'INDEPENDENT_CHECK_RECORDED', 'UPDATE']);
    expect(trail.every(row => row.by_author)).toBe(true);
    expect(step('CREATE').n).toBe(accepted.length);
    expect(step('UPDATE').n).toBe(accepted.length);
    expect(+step('CREATE').last).toBeLessThanOrEqual(+step('UPDATE').first);
    expect(+step('UPDATE').last).toBeLessThanOrEqual(+step('INDEPENDENT_CHECK_RECORDED').first);
    expect(+step('INDEPENDENT_CHECK_RECORDED').last).toBeLessThanOrEqual(+step('EXPORT').first);
    // The creation receipt keeps what was known at the save: the run, and no model yet.
    const receipts = (await pool.query(
      `SELECT metadata->'provenance' AS provenance FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='CREATE'`, [docId])).rows;
    for (const receipt of receipts) expect(receipt.provenance).toMatchObject({ source: 'ana', turnId: scope.runId, governedWrite: 'unverified' });

    // One tenant chain holds both: the parent's acceptance comes before the filing it led to.
    const chain = (await pool.query(
      `SELECT action, chain_seq::int AS seq, new_values->>'operation' AS operation, new_values->'snapshot'->>'parentDisposition' AS disposition
         FROM audit_logs WHERE tenant_id=$1 AND (record_id=$2 OR action='authoring.document.file_to_vault') ORDER BY chain_seq`, [ORG, scope.runId])).rows as
      Array<{ action: string; seq: number; operation: string | null; disposition: string | null }>;
    const acceptedAt = chain.find(row => row.operation === 'disposition' && row.disposition === 'accepted_as_proposal')!.seq;
    const filings = chain.filter(row => row.action === 'authoring.document.file_to_vault');
    expect(filings).toHaveLength(1);
    expect(filings[0].seq).toBeGreaterThan(acceptedAt);
  }, T);
});
