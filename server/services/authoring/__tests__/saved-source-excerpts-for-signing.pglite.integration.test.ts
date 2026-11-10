/**
 * P-89: the signing figure check reads the cited sources again, inside the
 * signing transaction, and checks the text as it now stands (2026-11-01;
 * draft-source-references.ts savedSourceExcerptsForSigning, draft-figure-check.ts
 * unverifiedFiguresAtSigning).
 *
 * The document is created through the real POST /docs/from-draft, so the save's
 * own figure check writes the provenance this reads; the Vault rows, the
 * catalog, the source verifier and the reservation lock are real, on embedded
 * PostgreSQL. The route gate that uses this is held by
 * routes/__tests__/authoring-signature-figure-gate.test.ts.
 */
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import {
  PREREQ, AUTHORING_ACCESS_DDL, VAULT_DDL, AUTHOR, PROGRAM, ORG,
  mint, makeApp, asToken,
} from '../../../routes/__tests__/_authoring-canvas-fixture';

const seam = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, sql: [] as string[] }));
vi.mock('../../../db', () => ({
  get db() { return seam.db; }, get pool() { return seam.pool; }, getPool: () => seam.pool,
  query: (sql: string, values?: unknown[]) =>
    (seam.pool as { query(sql: string, values?: unknown[]): Promise<unknown> }).query(sql, values),
}));

import { savedSourceExcerptsForSigning } from '../draft-source-references';
import { unverifiedFiguresAtSigning } from '../draft-figure-check';
import { sectionReadableText } from '../authoring-read-render';

let fixture: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const CSR = 'A total of 212 patients were randomized. The objective response rate was 47%.';
/** 47% and 212 patients are in the CSR; HR 0.71 is not. */
const DRAFTED = '<p>Of 212 patients, 47% responded; progression-free survival HR 0.71.</p>';

beforeAll(async () => {
  fixture = await createJourneyDb({
    prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL,
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
      'migrations/20260905_document_catalog.sql',
      'migrations/20261008e_document_catalog_attribution.sql',
      'migrations/20261006_document_data_dispositions.sql',
    ],
  });
  seam.db = fixture.db;
  const query: typeof fixture.pool.query = async (input, values) => {
    seam.sql.push(typeof input === 'string' ? input : (input as { text: string }).text);
    return fixture.pool.query(input, values);
  };
  seam.pool = { query, connect: async () => ({ query, release: () => undefined }) };
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../../../routes/authoring.router');
  app = makeApp(router);
}, 180_000);
afterAll(async () => { await fixture?.close(); });
beforeEach(() => { seam.sql.length = 0; });

/** A catalogued CSR in the project, cited whole. */
async function csr() {
  const documentId = randomUUID();
  const contentHash = sha(documentId);
  await fixture.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,content_hash,extracted_text)
    VALUES($1,$2,$3,$4,'BX-301 clinical study report','csr',$5,$6)`,
  [documentId, PROGRAM, ORG, `CSR-${documentId}`, contentHash, CSR]);
  await fixture.pool.query(`INSERT INTO vault.document_catalog
    (document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES($1,$2,'extracted','plain-text',$3)`, [documentId, contentHash, CSR.length]);
  const span = { start: 0, end: CSR.length, totalChars: CSR.length };
  return { documentId, contentHash, version: 2, extractedTextSha256: sha(CSR), spanSha256: sha(CSR), span };
}

/** A drafted Clinical Overview section citing the CSR, saved through the real route. */
async function drafted(reference: Awaited<ReturnType<typeof csr>>): Promise<string> {
  const response = await author(request(app).post('/api/authoring/docs/from-draft')).send({
    programId: PROGRAM, title: 'BX-301 Clinical Overview', module: 'M2',
    provenance: { source: 'ana', note: 'Synthetic P-89 fixture; no provider called.' },
    sections: [{ code: '2.5.4', title: 'Overview of efficacy', content: DRAFTED, sourceReferences: [reference] }],
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.data.doc.id as string;
}

/** What a signing transaction reads (authoring.router.ts lockedSigningContent), then the check. */
async function atSigning(docId: string) {
  const doc = (await fixture.pool.query(
    "SELECT d.*, to_jsonb(d)->'provenance' AS provenance, to_jsonb(d)->>'client_program_id' AS client_program_id FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2",
    [docId, ORG])).rows[0] as { provenance: unknown; client_program_id: string };
  const sections = (await fixture.pool.query(
    'SELECT id, code, title, content FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2', [docId, ORG])).rows as
    Array<{ id: string; code: string; title: string; content: string }>;
  const client = seam.pool as { query(sql: string): Promise<unknown> } & Parameters<typeof savedSourceExcerptsForSigning>[1];
  await client.query('BEGIN');
  try {
    const groups = await savedSourceExcerptsForSigning(doc, client, ORG, { id: String(AUTHOR.id), email: AUTHOR.email });
    const items = unverifiedFiguresAtSigning(
      sections.map((s) => ({ id: s.id, code: s.code, title: s.title, text: sectionReadableText(s.content) })), groups);
    return { doc, groups, items };
  } finally {
    await client.query('COMMIT');
  }
}

describe('the signing figure check reads the cited sources again and checks the current text', () => {
  it('re-reads the cited excerpt under the source reservation and names the figure the CSR does not state', async () => {
    const ref = await csr();
    const docId = await drafted(ref);
    seam.sql.length = 0;
    const { doc, groups, items } = await atSigning(docId);

    // The save's own check recorded the same figure as unverified.
    const saved = (doc.provenance as { projectSourceReferences: Array<{ figures: { unverified: number } }> }).projectSourceReferences[0];
    expect(saved.figures.unverified).toBe(1);

    expect(groups).toEqual([{ sectionCode: '2.5.4', excerpts: [expect.objectContaining({ documentId: ref.documentId, contentHash: ref.contentHash, text: CSR })] }]);
    expect(items.map((i) => [i.text, i.kind, i.reason])).toEqual([['HR 0.71', 'hr', 'not_in_cited_source']]);
    const begin = seam.sql.findIndex((s) => /^BEGIN/.test(s));
    const reservation = seam.sql.findIndex((s) => /LOCK TABLE vault\.documents, vault\.document_catalog IN SHARE MODE/.test(s));
    const read = seam.sql.findIndex((s) => /FROM vault.documents d/.test(s));
    expect(reservation).toBeGreaterThan(begin);
    expect(read).toBeGreaterThan(reservation);
  });

  it('a figure corrected after the save is not listed, though the saved record still says unverified', async () => {
    const docId = await drafted(await csr());
    await fixture.pool.query('UPDATE authoring_sections SET content=$2 WHERE doc_id=$1',
      [docId, '<p>Of 212 patients, 47% responded.</p>']);
    const { doc, items } = await atSigning(docId);
    expect((doc.provenance as { projectSourceReferences: Array<{ figures: { unverified: number } }> }).projectSourceReferences[0].figures.unverified).toBe(1);
    expect(items).toEqual([]);
  });

  it('a number typed in after the save, which the save never checked, is listed', async () => {
    const docId = await drafted(await csr());
    await fixture.pool.query('UPDATE authoring_sections SET content=$2 WHERE doc_id=$1',
      [docId, '<p>Of 212 patients, 52% responded.</p>']);
    expect((await atSigning(docId)).items.map((i) => i.text)).toEqual(['52%']);
  });

  it('when the cited CSR\'s text has changed since the save, its section\'s figures are all listed as unchecked', async () => {
    const ref = await csr();
    const docId = await drafted(ref);
    const changed = CSR.replace('47%', '44%');
    await fixture.pool.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [ref.documentId, changed]);
    const { groups, items } = await atSigning(docId);
    expect(groups).toEqual([{ sectionCode: '2.5.4', excerpts: null }]);
    expect(items.map((i) => i.reason)).toEqual(['source_unavailable', 'source_unavailable', 'source_unavailable']);
  });

  it('a document that cites no saved sources takes no lock and reads nothing', async () => {
    seam.sql.length = 0;
    const groups = await savedSourceExcerptsForSigning({ provenance: null, client_program_id: PROGRAM }, seam.pool as never, ORG);
    expect(groups).toEqual([]);
    expect(seam.sql).toEqual([]);
  });
});
