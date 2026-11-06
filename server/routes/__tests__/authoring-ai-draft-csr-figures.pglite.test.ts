/**
 * CSR slice 2 (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, decision 5): the engine figure gate on AnA's
 * candidates. The REAL authoring router over HTTP, on PGlite with the authoring unit, the audit chain, the AnA
 * turn-record store and the draft-candidate store; only the model and the Data Room search are stand-ins.
 *
 * The section's claim receipts come from the real drafting path (acceptEvidenceBoundDraft → buildCsrClaimReceipts →
 * importedCsrSectionEvidence), as the CSR import writes them. For a section of a document that carries them, the
 * draft answers, for each candidate, with the figures the saved-CSR verdict's figure step finds
 * (csr-saved-evidence planSections). In §2 and §10–13 they block: the accept re-runs the gate on the content the
 * person sends and refuses with 422 CSR_FIGURE_NOT_FROM_ENGINE, naming each figure, writing nothing. Elsewhere they
 * are reported. A CSR results section with no receipts is said to be not checked, never passed. The accept's audit
 * row names the option set the person chose from (decision 3 of slice 1).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type express from 'express';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, AUTHOR, ORG, PROGRAM, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { buildCsrAuthoringEvidence, type RetainedCsrTables } from '../../services/csr/cortex-authoring-context';
import { acceptEvidenceBoundDraft } from '../../services/csr/unsupplied-statistics';
import { buildCsrClaimReceipts, importedCsrSectionEvidence } from '../../services/csr/csr-claim-receipts';
import { workflowCopySectionContent } from '../../services/authoring/workflow-copy-content';

type Hit = { id: string; content: string; title: string; sourceId: string | null; score: number };
const h = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  replies: [] as string[],
  sent: [] as Array<{ messages: Array<{ content: string }> }>,
  hits: [] as Hit[],
}));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../services/ai-gateway/gateway.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ai-gateway/gateway.js')>()),
  getGateway: () => ({
    getEnabledProviders: () => ['anthropic'],
    route: async (req: { messages: Array<{ content: string }> }) => {
      h.sent.push(req);
      const content = h.replies.shift() ?? 'Unscripted reply.';
      return { content: JSON.stringify({ content, attributions: [] }), model: 'claude-opus-5-5', provider: 'anthropic',
        requestId: `req-csr-figures-${h.sent.length}` };
    },
  }),
}));
vi.mock('../../services/vault/document-passage-search.js', () => ({
  searchDocumentPassages: async () => ({ hits: h.hits.map(hit => ({ documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    documentTitle: hit.title, text: hit.content, locator: null })), coverage: null, ranking: 'text' }),
}));
vi.mock('../../services/vault/document-catalog.service.js', () => ({ loadDocumentForOrg: async () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: '11111111-1111-4111-8111-111111111111', contentHash: 'a'.repeat(64), version: '1', catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } }) }));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: async () => new Map(),
  resolveEvidenceSourceIdsByVaultDocuments: async () => new Map(),
}));

const T = 180_000;
const RUN = '33333333-2222-4333-8444-000000000062';
const STUDY_INFO = { protocolNumber: 'LMN-201', title: 'LMN-201 Part B' };
/** The engine's cell, as the receipts claim it. */
const CELL = '16/305 (5.2%)';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
/** What the CSR build drafted and the import stored for §11.4.1: the claimed figure. */
const IMPORTED = 'Global cure occurred in 16/305 (5.2%) subjects in the LMN-201 arm (Table 14.2.1).';
/** A candidate that states a figure no claimed cell holds: 17 of 305, 5.6%. */
const OFF_BY_ONE = 'Global cure occurred in 17/305 (5.6%) subjects in the LMN-201 arm (Table 14.2.1).';
/** The same text with the engine's figure. */
const CORRECT = 'Global cure was achieved by 16/305 (5.2%) subjects on LMN-201 (Table 14.2.1).';
/** A methods sentence (§9.7.1): its numbers are reported, never blocking. */
const METHODS = 'The primary analysis used a two-sided alpha of 0.05 in 305 randomized subjects.';
const SOURCE: Hit = { id: 'a1', title: 'CSR LMN-201 tables', sourceId: null, score: 1,
  content: 'Global cure: LMN-201 16/305 (5.2%).' };

function retained(): RetainedCsrTables {
  return { runId: RUN, programId: PROGRAM, historical: true, releaseEligibilityVerified: false, studies: [{
    source: { documentId: '44444444-2222-4333-8444-000000000062', version: '1', sha256: 'b'.repeat(64), dataCutDate: '2026-09-30',
      studyId: 'LMN-201', protocolNumber: 'LMN-201', clinicalVerification: 'not-established' },
    tables: {
      analysisPopulations: { title: 'Analysis populations', headers: ['Population', 'LMN-201', 'Placebo'], rows: [['Randomized', '305', '300']] },
      primaryEfficacy: { title: '§11.4 — Primary Efficacy Endpoint Results', headers: ['Endpoint', 'Arm', 'Result', 'CI', 'p-value', 'vs Comparator'],
        rows: [['Global cure', 'LMN-201', CELL, '—', '—', 'Placebo']] },
    },
  }] };
}

/** One section through the real drafting acceptance and the real import binding: its stored copy and its origin. */
function importedSection(sectionNumber: string, prose: string) {
  const pack = buildCsrAuthoringEvidence(retained(), { programId: PROGRAM, runId: RUN, studyId: 'LMN-201', sectionNumber });
  const lineage: Record<string, unknown> = {};
  const claims = [{ table: 'primaryEfficacy', row: 0, column: 2, value: CELL }];
  expect(acceptEvidenceBoundDraft({ sectionNumber, prose, claims }, pack, STUDY_INFO, lineage)).toBe(true);
  lineage.claimReceipts = buildCsrClaimReceipts(pack, lineage.reconciliation, prose);
  const copy = workflowCopySectionContent(prose);
  const csrEvidence = importedCsrSectionEvidence({ sectionNumber, content: prose, contentHash: sha(prose), lineage }, copy, STUDY_INFO);
  expect(csrEvidence).not.toBeNull();
  return { copy, origin: { code: sectionNumber, sourceRowId: `csr_section_outputs:${sectionNumber}`, contentSha256: sha(prose),
    originalAuthorship: 'machine', model: 'claude-opus-5-5', modelEvidence: 'recorded-name-only', csrEvidence } };
}

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let seq = 0;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260905_document_catalog.sql',
      'migrations/20260921_authoring_document_provenance.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260926_ana_turn_records.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'db/migrations/20260809_source_attribution_draft_candidates.sql',
      'migrations/20260814i_draft_candidate_generator.sql',
      'migrations/20260906c_draft_candidate_assertions.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  if (jdb) assertNoSchemaGaps(jdb);
  await jdb?.close();
});

beforeEach(() => {
  h.replies = [];
  h.sent = [];
  h.hits = [SOURCE];
});

type Kind = 'receipted' | 'unreceipted' | 'not-csr';
/** A document of its own per test, so the receipts (keyed by section code) never collide. */
async function seedDocument(kind: Kind, sections: Array<{ code: string; content: string }>): Promise<string[]> {
  seq += 1;
  const doc = randomUUID();
  const origins = kind === 'receipted' ? [importedSection('11.4.1', IMPORTED).origin] : [];
  const provenance = kind === 'receipted'
    ? { source: 'import', importSource: { kind: 'csr', id: String(seq), programId: PROGRAM, sectionOrigins: origins } } : null;
  const title = kind === 'not-csr' ? `Investigator’s brochure ${seq}` : `Clinical Study Report LMN-201 (${seq})`;
  await jdb.pglite.query(
    `INSERT INTO authoring_documents (id, title, module, product_code, status, created_by, tenant_id, client_program_id, provenance)
     VALUES ($1, $2, $3, 'LMN', 'draft', $4, $5, $6, $7)`,
    [doc, title, kind === 'not-csr' ? 'M2' : '5', AUTHOR.id, ORG, PROGRAM, provenance === null ? null : JSON.stringify(provenance)],
  );
  const ids: string[] = [];
  for (const [i, s] of sections.entries()) {
    const id = randomUUID();
    await jdb.pglite.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
       VALUES ($1, $2, $3, 'Section', $4, $5, $6)`,
      [id, doc, s.code, s.content, i, ORG],
    );
    ids.push(id);
  }
  return ids;
}
const receiptedResults = async () => (await seedDocument('receipted', [{ code: '11.4.1', content: importedSection('11.4.1', IMPORTED).copy }]))[0];

const post = (sectionId: string, body: Record<string, unknown>) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft`)).send({ region: 'FDA', ...body });
const accept = (sectionId: string, draftId: string, content: string, extra: Record<string, unknown> = {}) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({ draftId, content, ...extra });
async function drafted(sectionId: string, reply: string, body: Record<string, unknown> = {}) {
  h.replies.push(reply);
  const res = await post(sectionId, body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.draft as { content: string; draftId?: string; csrFigures?: unknown; derivedFrom?: unknown };
}

/** Everything an accept would write, for "it wrote nothing". */
async function written(sectionId: string) {
  const one = async (sql: string) => Number((await jdb.pglite.query<{ n: number }>(sql, [sectionId])).rows[0].n);
  return {
    content: (await jdb.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [sectionId])).rows[0].content,
    revisions: await one('SELECT count(*)::int AS n FROM doc_revisions WHERE section_id=$1'),
    audit: await one('SELECT count(*)::int AS n FROM authoring_audit_trail WHERE section_id=$1'),
    candidates: await one('SELECT count(*)::int AS n FROM authoring_ai_draft_candidates WHERE section_id=$1'),
  };
}
const lastAudit = async (sectionId: string) => (await jdb.pglite.query<{ metadata: Record<string, any> }>(
  'SELECT metadata FROM authoring_audit_trail WHERE section_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1',
  [sectionId, ORG])).rows[0]?.metadata;

async function refusedWithFigures(sectionId: string, draftId: string, content: string, figures: string[]) {
  const before = await written(sectionId);
  const res = await accept(sectionId, draftId, content);
  expect(res.status, JSON.stringify(res.body)).toBe(422);
  expect(res.body).toMatchObject({ success: false, error: { code: 'CSR_FIGURE_NOT_FROM_ENGINE' } });
  expect(res.body.error.figures).toEqual(figures.map(figure => ({ figure, blocking: true })));
  for (const figure of figures) expect(res.body.error.message).toContain(figure);
  expect(res.body.error.message).toMatch(/nothing was saved/i);
  // Nothing written; the candidate is still there for a corrected accept.
  expect(await written(sectionId)).toEqual(before);
}

describe('a candidate in a CSR results section is checked against the section’s engine receipts', () => {
  it('names 17 and 5.6 as blocking in §11.4.1, where the receipts claim 16/305 (5.2%), and refuses its accept, writing nothing', async () => {
    const sectionId = await receiptedResults();
    const draft = await drafted(sectionId, OFF_BY_ONE);
    await refusedWithFigures(sectionId, draft.draftId!, OFF_BY_ONE, ['17', '5.6']);
    expect(draft.csrFigures).toEqual({ status: 'checked', basis: 'csr_claim_receipts', results: true,
      figures: [{ figure: '17', blocking: true }, { figure: '5.6', blocking: true }] });
  }, T);

  it('a revision stating 17/305 is checked as the new candidate it is, and its accept is refused', async () => {
    const sectionId = await receiptedResults();
    const base = await drafted(sectionId, CORRECT);
    const revision = await drafted(sectionId, OFF_BY_ONE, { revise: { fromDraftId: base.draftId, instruction: 'Shorter' } });
    expect(revision.derivedFrom).toMatchObject({ draftId: base.draftId });
    await refusedWithFigures(sectionId, revision.draftId!, OFF_BY_ONE, ['17', '5.6']);
    expect(revision.csrFigures).toMatchObject({ status: 'checked', results: true,
      figures: [{ figure: '17', blocking: true }, { figure: '5.6', blocking: true }] });
    expect(base.csrFigures).toEqual({ status: 'checked', basis: 'csr_claim_receipts', results: true, figures: [] });
  }, T);

  it('a passage alternative stating 17/305 carries the blocking figures it states', async () => {
    const sectionId = await receiptedResults();
    const passage = { quote: 'Global cure occurred in 16/305 (5.2%) subjects', prefix: '', suffix: ' in the LMN-201 arm (Table 14.2.1).' };
    const draft = await drafted(sectionId, 'Global cure was reported in 17/305 (5.6%) subjects', { passage });
    expect(draft).not.toHaveProperty('draftId');
    expect(draft.csrFigures).toEqual({ status: 'checked', basis: 'csr_claim_receipts', results: true,
      figures: [{ figure: '17', blocking: true }, { figure: '5.6', blocking: true }] });
  }, T);

  it('the accept checks the text the person sends: corrected to the engine’s figure it is accepted; edited to a wrong one it is refused', async () => {
    const sectionId = await receiptedResults();
    const wrong = await drafted(sectionId, OFF_BY_ONE);
    const saved = await accept(sectionId, wrong.draftId!, CORRECT);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.section.content).toBe(CORRECT);
    expect((await lastAudit(sectionId)).draft_modified_on_accept).toBe(true);

    const other = await receiptedResults();
    const right = await drafted(other, CORRECT);
    await refusedWithFigures(other, right.draftId!, OFF_BY_ONE, ['17', '5.6']);
  }, T);

  it('in §9.7.1 (methods) of the same document the figures are reported, not blocking, and the accept goes through', async () => {
    const [, methods] = await seedDocument('receipted', [{ code: '11.4.1', content: importedSection('11.4.1', IMPORTED).copy },
      { code: '9.7.1', content: '' }]);
    const draft = await drafted(methods, METHODS);
    expect(draft.csrFigures).toEqual({ status: 'checked', basis: 'csr_claim_receipts', results: false,
      figures: [{ figure: '0.05', blocking: false }, { figure: '305', blocking: false }] });
    const res = await accept(methods, draft.draftId!, METHODS);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }, T);

  it('in a results section of a CSR with no receipts nothing is checked, and that is said, never passed; the accept goes through', async () => {
    const [sectionId] = await seedDocument('unreceipted', [{ code: '11.4.1', content: '' }]);
    const draft = await drafted(sectionId, OFF_BY_ONE);
    expect(draft.csrFigures).toEqual({ status: 'not_checked', reason: 'no_csr_receipts', results: true });
    const res = await accept(sectionId, draft.draftId!, OFF_BY_ONE);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }, T);

  it('a section of a document that is not a CSR carries no CSR figure finding, though its number is §2-like', async () => {
    const [sectionId] = await seedDocument('not-csr', [{ code: '2.7.3', content: '' }]);
    const draft = await drafted(sectionId, OFF_BY_ONE);
    expect(draft.csrFigures).toBeNull();
    expect((await accept(sectionId, draft.draftId!, OFF_BY_ONE)).status).toBe(200);
  }, T);
});

describe('the accept’s audit row names the option set the text came from', () => {
  it('“alternative 2 of 3, concise”', async () => {
    const sectionId = await receiptedResults();
    const draft = await drafted(sectionId, CORRECT, { tone: 'concise' });
    const optionSet = { kind: 'alternative', position: 2, count: 3, approach: 'concise' };
    const res = await accept(sectionId, draft.draftId!, CORRECT, { optionSet });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await lastAudit(sectionId)).option_set).toEqual({ ...optionSet, label: 'alternative 2 of 3, concise' });
  }, T);

  it('“revision 2 of alternative 1”, and “revision 1 of the draft”', async () => {
    const sectionId = await receiptedResults();
    const base = await drafted(sectionId, CORRECT);
    const revision = await drafted(sectionId, CORRECT, { revise: { fromDraftId: base.draftId, instruction: 'Shorter' } });
    const optionSet = { kind: 'revision', revision: 2, of: { kind: 'alternative', position: 1, count: 3, approach: 'professional' } };
    expect((await accept(sectionId, revision.draftId!, CORRECT, { optionSet })).status).toBe(200);
    expect((await lastAudit(sectionId)).option_set).toEqual({ ...optionSet, label: 'revision 2 of alternative 1' });

    const other = await receiptedResults();
    const lone = await drafted(other, CORRECT);
    const again = await drafted(other, CORRECT, { revise: { fromDraftId: lone.draftId, instruction: 'Shorter' } });
    const ofDraft = { kind: 'revision', revision: 1, of: { kind: 'draft' } };
    expect((await accept(other, again.draftId!, CORRECT, { optionSet: ofDraft })).status).toBe(200);
    expect((await lastAudit(other)).option_set).toEqual({ ...ofDraft, label: 'revision 1 of the draft' });
  }, T);

  it('a single draft accepted with no option set records none', async () => {
    const sectionId = await receiptedResults();
    const draft = await drafted(sectionId, CORRECT);
    expect((await accept(sectionId, draft.draftId!, CORRECT)).status).toBe(200);
    expect(await lastAudit(sectionId)).not.toHaveProperty('option_set');
  }, T);

  it('refuses an option set of the wrong shape, or one that does not match the candidate, writing nothing', async () => {
    const sectionId = await receiptedResults();
    const draft = await drafted(sectionId, CORRECT);
    for (const optionSet of [
      'alternative 2 of 3', { kind: 'alternative', position: 4, count: 3, approach: 'concise' },
      { kind: 'alternative', position: 2, count: 3, approach: 'chatty' }, { kind: 'alternative', position: 0, count: 3, approach: 'concise' },
      { kind: 'revision', revision: 0, of: { kind: 'draft' } }, { kind: 'revision', revision: 1, of: { kind: 'other' } },
      { kind: 'alternative', position: 1, count: 3, approach: 'concise', label: 'chosen by the model' },
      // Not a revision: the candidate was not derived from another.
      { kind: 'revision', revision: 1, of: { kind: 'draft' } },
    ]) {
      const before = await written(sectionId);
      const res = await accept(sectionId, draft.draftId!, CORRECT, { optionSet });
      expect(res.status, JSON.stringify({ optionSet, body: res.body })).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'OPTION_SET_INVALID' } });
      expect(res.body.error.message).toMatch(/nothing was saved/i);
      expect(await written(sectionId)).toEqual(before);
    }
    expect((await accept(sectionId, draft.draftId!, CORRECT)).status).toBe(200);
  }, T);
});
