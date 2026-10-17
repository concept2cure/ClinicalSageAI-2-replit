/** Actual from-draft/export HTTP and canonical authoring migrations on embedded
 * PostgreSQL. Auth/JWT, source reads, transactions, revisions and audit SQL are
 * real. PGlite has one connection: lock ordering here is not concurrency proof. */
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import {
  PREREQ, AUTHORING_ACCESS_DDL, VAULT_DDL, AUTHOR, PROGRAM, OTHER_PROGRAM, ORG,
  mint, makeApp, asToken,
} from '../../../routes/__tests__/_authoring-canvas-fixture';

const seam = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, sql: [] as string[] }));
vi.mock('../../../db', () => ({
  get db() { return seam.db; }, get pool() { return seam.pool; }, getPool: () => seam.pool,
  query: (sql: string, values?: unknown[]) =>
    (seam.pool as { query(sql: string, values?: unknown[]): Promise<unknown> }).query(sql, values),
}));

let fixture: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const EXCERPT = '🧬 Synthetic evidence α — exact UTF-16 selection.';
const TEXT = 'Unselected synthetic preamble. '.repeat(3000) + EXCERPT + ' Unselected ending.';
const SPAN = { start: TEXT.indexOf(EXCERPT), end: TEXT.indexOf(EXCERPT) + EXCERPT.length, totalChars: TEXT.length };
const CONTENT = '<p>The investigator will review this selected evidence.</p>';

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

async function source(text = TEXT) {
  const documentId = randomUUID();
  const contentHash = sha(documentId); // original-byte identity is deliberately unchanged by OCR corrections
  await fixture.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,content_hash,extracted_text)
    VALUES($1,$2,$3,$4,'Synthetic extraction source','csr',$5,$6)`,
  [documentId, PROGRAM, ORG, `IDENTITY-${documentId}`, contentHash, text]);
  await fixture.pool.query(`INSERT INTO vault.document_catalog
    (document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES($1,$2,'extracted','plain-text',$3)`, [documentId, contentHash, text.length]);
  return { documentId, contentHash, version: 2, extractedTextSha256: sha(text),
    spanSha256: sha(text.slice(SPAN.start, SPAN.end)), span: { ...SPAN } };
}

function body(reference: unknown, extra: Record<string, unknown> = {}) {
  return { programId: PROGRAM, title: 'Extraction-bound synthetic draft', module: 'M2',
    provenance: { source: 'ana', note: 'Synthetic lifecycle fixture; no provider called.' },
    sections: [{ code: '2.5.1', title: 'Selected evidence', content: CONTENT, sourceReferences: [reference] }], ...extra };
}

async function receipts() {
  return (await fixture.pool.query(`SELECT
    (SELECT count(*) FROM authoring_documents)::int AS documents,
    (SELECT count(*) FROM authoring_sections)::int AS sections,
    (SELECT count(*) FROM doc_revisions)::int AS revisions,
    (SELECT count(*) FROM authoring_audit_trail)::int AS authoring_audits,
    (SELECT count(*) FROM audit_logs)::int AS chained_audits,
    (SELECT count(*) FROM authoring_export_history)::int AS exports`)).rows[0];
}

async function changeExtraction(documentId: string, text: string) {
  await fixture.pool.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [documentId, text, ORG]);
}

async function sealed(reference: Awaited<ReturnType<typeof source>>, versioned = true) {
  const documentId = randomUUID();
  const provenance = { source: 'ana', projectSourceReferences: [{ sectionCode: '2.5.1',
    qualification: 'unassessed', verification: 'current_at_save', ...(versioned ? { sourceReferenceVersion: 2 } : {}),
    sources: [{ ...reference, programId: PROGRAM }] }] };
  await fixture.pool.query(`INSERT INTO authoring_documents
    (id,tenant_id,status,title,module,created_by,client_program_id,provenance)
    VALUES($1,$2,'APPROVED','Synthetic sealed source-linked draft','M2',$3,$4,$5)`,
  [documentId, ORG, AUTHOR.id, PROGRAM, JSON.stringify(provenance)]);
  await fixture.pool.query(`INSERT INTO authoring_sections
    (id,doc_id,tenant_id,code,title,content,order_index)
    VALUES($1,$2,$3,'2.5.1','Selected evidence',$4,0)`, [randomUUID(), documentId, ORG, CONTENT]);
  await fixture.pool.query(`INSERT INTO authoring_signatures
    (id,doc_id,tenant_id,signer_email,signer_name,meaning,reason,method,content_hash,pin_verified)
    VALUES($1,$2,$3,$4,'Synthetic reviewer','APPROVER','Synthetic fixture seal','PIN',$5,true)`,
  [randomUUID(), documentId, ORG, AUTHOR.email, sha(`2.5.1:${CONTENT}`)]);
  return documentId;
}

function registerSaveIntegrityCases() {
  it.each(['inside', 'outside'] as const)('same-length extraction edit %s the selected span refuses the actual save and leaves all regulated rows untouched', async location => {
    const ref = await source();
    const offset = location === 'inside' ? SPAN.start + 3 : 0;
    const changed = TEXT.slice(0, offset) + 'Z' + TEXT.slice(offset + 1);
    expect(changed.length).toBe(TEXT.length);
    await changeExtraction(ref.documentId, changed);
    const before = await receipts();
    const response = await author(request(app).post('/api/authoring/docs/from-draft')).send(body(ref));
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.data).toBeUndefined();
    expect(await receipts()).toEqual(before);
    expect(seam.sql.some(sql => /^BEGIN/.test(sql))).toBe(true);
    expect(seam.sql.some(sql => /^ROLLBACK/.test(sql))).toBe(true);
    expect(seam.sql.some(sql => /INSERT INTO authoring_documents/.test(sql))).toBe(false);
  });

  it('a V2 span beyond 80,000 retains exact UTF-16 digests in document/audit and preserves machine genesis attribution without source text', async () => {
    const ref = await source();
    expect(SPAN.start).toBeGreaterThan(80_000);
    const response = await author(request(app).post('/api/authoring/docs/from-draft')).send(body({ ...ref,
      text: TEXT, qualification: 'approved', authority: 'caller-claimed' }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const docId = response.body.data.doc.id;
    const stored = (await fixture.pool.query('SELECT provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [docId, ORG])).rows[0] as { provenance: { projectSourceReferences: Array<{ sourceReferenceVersion: number; qualification: string; sources: unknown[] }> } };
    expect(stored.provenance.projectSourceReferences[0]).toMatchObject({ sourceReferenceVersion: 2,
      qualification: 'unassessed', verification: 'current_at_save', sources: [ref] });
    const revisions = await fixture.pool.query(`SELECT inputs FROM doc_revisions WHERE tenant_id=$2
      AND section_id IN (SELECT id FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2)`, [docId, ORG]);
    const audits = await fixture.pool.query('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2', [docId, ORG]);
    expect(revisions.rows).toHaveLength(1);
    expect(audits.rows).toHaveLength(1);
    const inputs = (revisions.rows[0] as { inputs: unknown }).inputs;
    expect(typeof inputs === 'string' ? JSON.parse(inputs) : inputs).toMatchObject({ contributors: [{ id: 'ana', name: 'AnA (AI draft)' }] });
    expect(JSON.stringify(inputs)).not.toContain(EXCERPT);
    for (const record of [stored.provenance, ...audits.rows]) {
      const encoded = JSON.stringify(record);
      expect(encoded).toContain(ref.extractedTextSha256);
      expect(encoded).toContain(ref.spanSha256);
      expect(encoded).not.toContain(EXCERPT);
      expect(encoded).not.toContain('caller-claimed');
    }
    const begin = seam.sql.findIndex(sql => /^BEGIN/.test(sql));
    const advisory = seam.sql.findIndex((sql, index) => index > begin && /pg_advisory_xact_lock/.test(sql));
    const reservation = seam.sql.findIndex(sql => /LOCK TABLE vault\.documents, vault\.document_catalog IN SHARE MODE/.test(sql));
    const firstRead = seam.sql.findIndex(sql => /FROM vault.documents d/.test(sql));
    const insert = seam.sql.findIndex(sql => /INSERT INTO authoring_documents/.test(sql));
    const commit = seam.sql.findIndex(sql => /^COMMIT/.test(sql));
    expect(advisory).toBeGreaterThan(begin);
    expect(reservation).toBeGreaterThan(advisory);
    expect(firstRead).toBeGreaterThan(reservation);
    expect(insert).toBeGreaterThan(firstRead);
    expect(commit).toBeGreaterThan(insert);
    expect(seam.sql.some(sql => /FOR SHARE OF ou, u, o/.test(sql))).toBe(true);
  });

  it('a genuine PostgreSQL audit INSERT failure rolls back an already-inserted document, section, genesis and lineage', async () => {
    const ref = await source();
    await fixture.pglite.exec(`CREATE FUNCTION lifecycle_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.metadata->'provenance'->>'note'='lifecycle-rollback' THEN
        RAISE EXCEPTION 'Synthetic lifecycle audit store refusal'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER lifecycle_refuse_audit BEFORE INSERT ON authoring_audit_trail
      FOR EACH ROW EXECUTE FUNCTION lifecycle_refuse_audit();`);
    const before = await receipts();
    const lineageBefore = (await fixture.pool.query('SELECT count(*)::int AS n FROM document_span_lineage WHERE organization_id=$1', [ORG])).rows[0];
    try {
      const response = await author(request(app).post('/api/authoring/docs/from-draft')).send(body(ref,
        { provenance: { source: 'ana', note: 'lifecycle-rollback' } }));
      expect(response.status).toBe(500);
      expect(seam.sql.some(sql => /INSERT INTO authoring_documents/.test(sql))).toBe(true);
      expect(seam.sql.some(sql => /INSERT INTO doc_revisions/.test(sql))).toBe(true);
      expect(seam.sql.some(sql => /^ROLLBACK/.test(sql))).toBe(true);
      expect(await receipts()).toEqual(before);
      expect((await fixture.pool.query('SELECT count(*)::int AS n FROM document_span_lineage WHERE organization_id=$1', [ORG])).rows[0]).toEqual(lineageBefore);
    } finally {
      await fixture.pglite.exec('DROP TRIGGER lifecycle_refuse_audit ON authoring_audit_trail; DROP FUNCTION lifecycle_refuse_audit();');
    }
  });

}

function registerAccessAndExportCases() {
  it('a private parent refuses a valid V2 source before source text or a regulated write', async () => {
    const ref = await source();
    await fixture.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42 AND organization_id=$1', [ORG]);
    await fixture.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42 AND organization_id=$1", [ORG]);
    const before = await receipts();
    try {
      const response = await author(request(app).post('/api/authoring/docs/from-draft')).send(body(ref));
      expect(response.status).toBe(403);
      expect(seam.sql.some(sql => /FROM vault.documents d/.test(sql))).toBe(false);
      expect(await receipts()).toEqual(before);
    } finally {
      await fixture.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42 AND organization_id=$2', [Number(AUTHOR.id), ORG]);
      await fixture.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42 AND organization_id=$1", [ORG]);
    }
  });

  it('a revoked current organization role refuses a still-valid signed JWT without writing', async () => {
    const ref = await source();
    await fixture.pool.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
    const before = await receipts();
    try {
      const response = await author(request(app).post('/api/authoring/docs/from-draft')).send(body(ref));
      expect(response.status).toBe(403);
      expect(await receipts()).toEqual(before);
      expect(seam.sql.some(sql => /FROM vault.documents d/.test(sql))).toBe(false);
    } finally {
      await fixture.pool.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
    }
  });

  it('the same V2 source cannot be saved in another organization’s program', async () => {
    const ref = await source();
    const before = await receipts();
    const response = await author(request(app).post('/api/authoring/docs/from-draft')).send(body(ref, { programId: OTHER_PROGRAM }));
    expect(response.status).toBe(404);
    expect(await receipts()).toEqual(before);
  });

  it('an untouched saved V2 source reaches actual XML rendering, audit and export-history commit', async () => {
    const ref = await source();
    const docId = await sealed(ref);
    const before = await receipts() as { exports: number; authoring_audits: number };
    const response = await author(request(app).post(`/api/authoring/docs/${docId}/export`)).send({ format: 'xml' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.text).toContain(CONTENT);
    const after = await receipts() as { exports: number; authoring_audits: number };
    expect(after.exports).toBe(before.exports + 1);
    expect(after.authoring_audits).toBe(before.authoring_audits + 1);
    const history = (await fixture.pool.query('SELECT metadata FROM authoring_export_history WHERE document_id=$1 AND tenant_id=$2', [docId, ORG])).rows;
    expect(history).toHaveLength(1);
    expect(history[0]).toHaveProperty('metadata.artifactSha256');
    expect(seam.sql.some(sql => /^COMMIT/.test(sql))).toBe(true);
  });

  it.each(['inside', 'outside'] as const)('a saved V2 extraction edit %s its span refuses actual controlled XML export without an audit or export receipt', async location => {
    const ref = await source();
    const docId = await sealed(ref);
    const offset = location === 'inside' ? SPAN.start + 3 : 0;
    await changeExtraction(ref.documentId, TEXT.slice(0, offset) + 'Z' + TEXT.slice(offset + 1));
    const before = await receipts();
    const response = await author(request(app).post(`/api/authoring/docs/${docId}/export`)).send({ format: 'xml' });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
    expect(await receipts()).toEqual(before);
    expect(seam.sql.some(sql => /^ROLLBACK/.test(sql))).toBe(true);
  });
}

describe('extraction-bound draft lifecycle on genuine embedded PostgreSQL', () => {
  registerSaveIntegrityCases();
  registerAccessAndExportCases();
});
