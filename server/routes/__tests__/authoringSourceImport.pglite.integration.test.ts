/** Real HTTP/JWT, canonical authoring migrations, real verified Vault bytes
 * and native Word conversion. PGlite proves atomic writes and rollback; it
 * does not prove PostgreSQL concurrency, production RLS or a live model. */
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SignJWT } from 'jose';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ImageRun } from 'docx';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHOR, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG, JWT_SECRET, makeApp, asToken } from './_authoring-canvas-fixture';
import type { DocumentProvenance } from '../../services/authoring/authoring-from-draft';
import type { CreateContext } from '../../services/authoring/authoring-documents';
import { registerSourceImportRecoveryCases, sourceFaultPool } from './_source-import-recovery-qualification';

type CountRow = { n: number };
type ProvenanceRow = { provenance: DocumentProvenance };
type SourceAuditRow = { change_reason: string; metadata: { provenance: DocumentProvenance } };

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query: (s: string, a?: unknown[]) => Promise<unknown> }).query(sql, args) }));

const SOURCE = randomUUID();
const root = path.join('uploads', `org-${ORG}`, `editor-import-${randomUUID()}`);
const sourcePath = path.join(root, 'Custom IND input.docx');
const reason = 'Revise the project source in the document editor';
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let viewer: (r: request.Test) => request.Test;
let bytes: Buffer;
let sha256: string;
const importFault = { mode: 'none', committed: false, statements: [] as string[], release: vi.fn() };

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + VAULT_DDL, migrations: [
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
    'migrations/20261006_document_data_dispositions.sql',
  ], testOnlySql: `
    ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE organizations ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE projects ADD COLUMN status text NOT NULL DEFAULT 'planning';
    ALTER TABLE projects ADD COLUMN client_workspace_id integer;
    ALTER TABLE projects ADD COLUMN owner_id integer;
    ALTER TABLE projects ADD COLUMN created_by_id integer;
    ALTER TABLE projects ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer PRIMARY KEY, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, organization_id integer, reviewer_id integer, status text);
    INSERT INTO projects (id,organization_id,name,regulatory_program_id) VALUES (43,${ORG},'second anchor','${PROGRAM_B}');
    UPDATE projects SET owner_id=7,created_by_id=7;
    INSERT INTO project_visibility_settings VALUES (42,${ORG},'org_public'),(43,${ORG},'org_public');
    CREATE TABLE file_uploads (id text PRIMARY KEY, organization_id integer, user_id integer, original_name text,
      mime_type text, file_size bigint, storage_path text, checksum_sha256 text, status text);
    CREATE TABLE cre_evidence_sources (id serial PRIMARY KEY, organization_id integer, client_program_id uuid,
      source_type text, title text, checksum text, provenance jsonb, metadata jsonb, is_current boolean,
      deleted_at timestamptz, previous_version_id integer);
  ` });
  h.db = db.db; h.pool = sourceFaultPool(() => db, importFault);
  const token = (role: string) => new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET));
  author = asToken(await token('member')); viewer = asToken(await token('viewer'));
  const { default: router } = await import('../authoring.router');
  const requestRouter = express.Router();
  // Supply the existing request-client contract against this test's PGlite
  // connection. Production's tenant middleware owns this binding and RLS.
  requestRouter.use((req, _res, next) => {
    Object.assign(req, { dbClient: { query: (sql: string, values?: unknown[]) =>
      (h.pool as { query: (text: string, params?: unknown[]) => Promise<unknown> }).query(sql, values) } });
    next();
  });
  requestRouter.use(router);
  app = makeApp(requestRouter);
  bytes = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3.2.S.4.1 Specification')] }),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Assay')] }), new TableCell({ children: [new Paragraph('99.2 %')] })] })] }),
    new Paragraph({ children: [new ImageRun({ type: 'png', data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'), transformation: { width: 12, height: 12 } })] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3.2.S.4.2 Analytical methods')] }),
    new Paragraph('Record the method description from this exact source.'),
  ] }] }));
  sha256 = createHash('sha256').update(bytes).digest('hex');
  await fs.mkdir(root, { recursive: true }); await fs.writeFile(sourcePath, bytes);
  await db.pool.query(`INSERT INTO vault.documents (id,program_id,organization_id,document_code,document_title,document_type,file_name,mime_type,content_hash,s3_key)
    VALUES ($1,$2,$3,'SRC-CUSTOM','Custom IND input','custom-ind-source-type','Custom IND input.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$4,$5)`, [SOURCE, PROGRAM, ORG, sha256, sourcePath]);
}, 180_000);
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); await db?.close(); });

const body = (over: Record<string, unknown> = {}) => ({ programId: PROGRAM, source: { kind: 'vault', documentId: SOURCE }, reason, ...over });

describe('atomic source intake through the shipped authoring router', () => {
  it('refuses a private project before original bytes, conversion or authoring evidence are read or written', async () => {
    const counts = async () => (await db.pool.query(`SELECT
      (SELECT count(*) FROM authoring_documents)::int AS docs,
      (SELECT count(*) FROM authoring_sections)::int AS sections,
      (SELECT count(*) FROM doc_revisions)::int AS revisions,
      (SELECT count(*) FROM authoring_audit_trail)::int AS audits,
      (SELECT count(*) FROM doc_permissions)::int AS permissions`)).rows[0];
    const before = await counts();
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    try {
      const response = await author(request(app).post('/api/authoring/import/source')).send(body());
      expect(response.status, JSON.stringify(response.body)).toBe(403);
      expect(response.body.error).toBe('PROJECT_PERMISSION_DENIED');
      expect(response.body.data).toBeUndefined();
      expect(await counts()).toEqual(before);
      // Even an unavailable physical original must not be inspected before the
      // caller's current private-project permission is established.
      await fs.rename(sourcePath, `${sourcePath}.held`);
      try {
        const missing = await author(request(app).post('/api/authoring/import/source')).send(body());
        expect(missing.status, JSON.stringify(missing.body)).toBe(403);
        expect(missing.body.error).toBe('PROJECT_PERMISSION_DENIED');
        expect(await counts()).toEqual(before);
      } finally { await fs.rename(`${sourcePath}.held`, sourcePath); }
    } finally { await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42"); }
  });

  it('creates the exact working copy using real verified bytes/native conversion, with source identity in every CREATE audit', async () => {
    const response = await author(request(app).post('/api/authoring/import/source')).send(body({ title: 'Forged title', provenance: { importSource: { id: randomUUID() } } }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const result = response.body.data;
    expect(result).toMatchObject({ reused: false, doc: { title: 'Custom IND input', product_code: 'custom-ind-source-type', module: 'M3' },
      origin: { kind: 'vault', id: SOURCE, programId: PROGRAM, sha256, conversion: 'docx-structure' } });
    expect(result.sections.map((s: { code: string }) => s.code)).toEqual(['3.2.S.4.1', '3.2.S.4.2']);
    expect(result.sections[0].content).toContain('<table>');
    expect(result.sections[0].content).toContain('99.2 %');
    expect(result.sections[0].content).toContain('data:image/png;base64,');
    const persisted = (await db.pglite.query<ProvenanceRow>('SELECT provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [result.doc.id, ORG])).rows[0].provenance;
    expect(persisted.importSource).toMatchObject({ id: SOURCE, sha256, reason });
    expect(persisted.source).toBe('import');
    const audits = (await db.pglite.query<SourceAuditRow>('SELECT change_reason,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2', [result.doc.id, ORG])).rows;
    expect(audits).toHaveLength(2);
    for (const audit of audits) {
      expect(audit.change_reason).toBe(reason);
      expect(audit.metadata.provenance.importSource).toMatchObject({ id: SOURCE, sha256 });
    }
    const originals = (await db.pool.query('SELECT content_hash FROM vault.documents WHERE id=$1', [SOURCE])).rows;
    expect(originals).toEqual([{ content_hash: sha256 }]);
    expect(await fs.readFile(sourcePath)).toEqual(bytes);
  });

  it('reuses the exact actor’s draft without replacing edited section content', async () => {
    const first = await author(request(app).post('/api/authoring/import/source')).send(body());
    expect(first.status).toBe(200);
    const docId = first.body.data.doc.id;
    await db.pool.query('UPDATE authoring_sections SET content=$1 WHERE doc_id=$2 AND code=$3', ['<p>Existing edits stay intact.</p>', docId, '3.2.S.4.2']);
    const reused = await author(request(app).post('/api/authoring/import/source')).send(body());
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data).toMatchObject({ reused: true, doc: { id: docId } });
    expect(reused.body.data.sections.find((s: { code: string }) => s.code === '3.2.S.4.2').content).toBe('<p>Existing edits stay intact.</p>');
    expect((await db.pglite.query<CountRow>('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1', [ORG])).rows[0].n).toBe(1);
  });

});

describe('current source project and membership access', () => {
  it('admits an explicitly assigned private-project member and refuses revoked access to their saved import', async () => {
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    await db.pool.query("INSERT INTO project_members VALUES (42,$1,$2,'use','active')", [ORG, Number(AUTHOR.id)]);
    try {
      const allowed = await author(request(app).post('/api/authoring/import/source')).send(body());
      expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
      expect(allowed.body.data.reused).toBe(true);
      await db.pool.query("UPDATE project_members SET status='revoked' WHERE project_id=42 AND user_id=$1", [Number(AUTHOR.id)]);
      const denied = await author(request(app).post('/api/authoring/import/source')).send(body());
      expect(denied.status, JSON.stringify(denied.body)).toBe(403);
      expect(denied.body.error).toBe('PROJECT_PERMISSION_DENIED');
      expect(denied.body.data).toBeUndefined();
    } finally {
      await db.pool.query('DELETE FROM project_members WHERE project_id=42 AND user_id=$1', [Number(AUTHOR.id)]);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
    }
  });

  it('uses the current membership role rather than a previously issued member token', async () => {
    await db.pool.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
    try {
      const response = await author(request(app).post('/api/authoring/import/source')).send(body());
      expect(response.status, JSON.stringify(response.body)).toBe(403);
      expect(response.body.data).toBeUndefined();
    } finally { await db.pool.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]); }
  });

  it('keeps document ownership separate from current saved-binary source access after project revocation', async () => {
    const [{ withSavedDraftSourceReservation }, { decideAuthoringPermission }] = await Promise.all([
      import('../../services/authoring/draft-source-references'), import('../../services/authoring/authoring-permissions'),
    ]);
    const current = await author(request(app).post('/api/authoring/import/source')).send(body());
    expect([200, 201]).toContain(current.status);
    const saved = current.body.data.doc;
    const principal = { id: AUTHOR.id, email: AUTHOR.email, roles: ['MEMBER'] };
    const actor = { id: AUTHOR.id, email: AUTHOR.email };
    const ownsCopy = () => decideAuthoringPermission({ pool: db.pool as unknown as Pool, principal,
      scope: { tenantId: ORG, docId: saved.id, sectionId: null, documentStatus: saved.status, createdBy: saved.created_by }, action: 'export' });
    let byteReads = 0;
    const produce = vi.fn(async () => { byteReads++; return fs.readFile(sourcePath); });
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    await db.pool.query("INSERT INTO project_members VALUES (42,$1,$2,'use','active')", [ORG, Number(AUTHOR.id)]);
    try {
      expect((await ownsCopy()).allowed).toBe(true);
      await expect(withSavedDraftSourceReservation(saved, db.pool, ORG, produce, actor)).resolves.toEqual(bytes);
      expect(byteReads).toBe(1);
      await db.pool.query("UPDATE project_members SET status='revoked' WHERE project_id=42 AND user_id=$1", [Number(AUTHOR.id)]);
      expect((await ownsCopy()).allowed).toBe(true); // retained canonical object grant
      const reads = vi.spyOn(db.pglite, 'query');
      produce.mockClear();
      try {
        await expect(withSavedDraftSourceReservation(saved, db.pool, ORG, produce, actor)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
        expect(produce).not.toHaveBeenCalled();
        expect(byteReads).toBe(1);
        expect(reads.mock.calls.some(([sql]) => typeof sql === 'string' && /FROM vault.documents d/.test(sql))).toBe(false);
      } finally { reads.mockRestore(); }
    } finally {
      await db.pool.query('DELETE FROM project_members WHERE project_id=42 AND user_id=$1', [Number(AUTHOR.id)]);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
    }
  });

});

describe('source transaction, integrity and format guards', () => {
  it('rechecks a sharing revocation during conversion inside the real canonical creation transaction', async () => {
    const [{ importSourceDocument }, { createDocumentFromDraft }, { importDocx }] = await Promise.all([
      import('../../services/authoring/authoring-source-import'), import('../../services/authoring/authoring-from-draft'),
      import('../../import/docx-to-authoring'),
    ]);
    const counts = async () => (await db.pool.query(`SELECT
      (SELECT count(*) FROM authoring_documents)::int AS docs,
      (SELECT count(*) FROM authoring_sections)::int AS sections,
      (SELECT count(*) FROM doc_revisions)::int AS revisions,
      (SELECT count(*) FROM authoring_audit_trail)::int AS audits,
      (SELECT count(*) FROM doc_permissions)::int AS permissions`)).rows[0];
    const before = await counts();
    const pool = db.pool as unknown as Pool;
    const ctx: CreateContext = { pool, tenantId: ORG, actor: { id: AUTHOR.id, email: AUTHOR.email },
      audit: { pool, tenantId: ORG, actorId: AUTHOR.id, actorEmail: AUTHOR.email, actorRole: 'MEMBER', ipAddress: '', userAgent: 'real-source-intake-regression' } };
    try {
      const outcome = await importSourceDocument(ctx, { id: AUTHOR.id, email: AUTHOR.email, roles: ['MEMBER'] }, body(), {
        readVaultBytes: () => fs.readFile(sourcePath),
        readUpload: async () => { throw new Error('Unexpected captured upload'); },
        classify: () => 'docx',
        importDocx: async sourceBytes => {
          await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
          return importDocx(sourceBytes);
        },
        extractText: async () => { throw new Error('Unexpected plain-text extraction'); },
        create: createDocumentFromDraft,
      });
      expect(outcome).toMatchObject({ ok: false, status: 403, code: 'PROJECT_PERMISSION_DENIED' });
      expect(await counts()).toEqual(before);
      expect(await fs.readFile(sourcePath)).toEqual(bytes);
    } finally { await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42"); }
  });

  it('refuses source/project mismatches and foreign tenants without creating anything', async () => {
    const before = (await db.pglite.query<CountRow>('SELECT count(*)::int AS n FROM authoring_documents')).rows[0].n;
    for (const programId of [PROGRAM_B, OTHER_PROGRAM]) {
      const response = await author(request(app).post('/api/authoring/import/source')).send(body({ programId }));
      expect(response.status, JSON.stringify(response.body)).toBe(404);
    }
    expect((await db.pglite.query<CountRow>('SELECT count(*)::int AS n FROM authoring_documents')).rows[0].n).toBe(before);
  });

  it('refuses changed stored bytes through the default Vault adapter, with no new authoring evidence', async () => {
    const before = (await db.pglite.query<CountRow>('SELECT count(*)::int AS n FROM authoring_audit_trail')).rows[0].n;
    await fs.writeFile(sourcePath, Buffer.from('Altered original file'));
    try {
      const response = await author(request(app).post('/api/authoring/import/source')).send(body());
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.error).toBe('CONTENT_HASH_MISMATCH');
      expect((await db.pglite.query<CountRow>('SELECT count(*)::int AS n FROM authoring_audit_trail')).rows[0].n).toBe(before);
    } finally { await fs.writeFile(sourcePath, bytes); }
  });

  it('requires a stated reason and an editor role', async () => {
    expect((await author(request(app).post('/api/authoring/import/source')).send(body({ reason: 'short' }))).status).toBe(400);
    expect((await viewer(request(app).post('/api/authoring/import/source')).send(body())).status).toBe(403);
  });

  it('imports a captured data-room source through the real tenant-checked upload byte reader', async () => {
    const uploadId = `file_${Date.now()}_ed123`;
    await db.pool.query(`INSERT INTO file_uploads (id,organization_id,user_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
      VALUES ($1,$2,$3,'Captured Word.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',$4,$5,$6,'processed')`,
    [uploadId, ORG, Number(AUTHOR.id), bytes.length, sourcePath, sha256]);
    const capture = (await db.pglite.query<{ id: number }>(`INSERT INTO cre_evidence_sources (organization_id,client_program_id,source_type,title,checksum,provenance,metadata,is_current)
      VALUES ($1,$2,'client_document','Captured source exact',$3,$4,'{}',true) RETURNING id`,
    [ORG, PROGRAM, sha256, JSON.stringify({ fileUploadId: uploadId })])).rows[0].id;
    const response = await author(request(app).post('/api/authoring/import/source')).send(body({ source: { kind: 'data-room', sourceId: capture } }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data).toMatchObject({ doc: { title: 'Captured source exact' },
      origin: { kind: 'data-room', id: String(capture), sha256, programId: PROGRAM, conversion: 'docx-structure' } });
    expect(response.body.data.sections[0].content).toContain('<table>');
    expect(response.body.data.doc.provenance.importSource.id).toBe(String(capture));
  });
});

describe('source transaction evidence and the complete IND library', () => {
  it('rolls back document, section, revision and origin evidence together when a CREATE audit cannot be recorded', async () => {
    const otherSource = randomUUID();
    await db.pool.query(`INSERT INTO vault.documents (id,program_id,organization_id,document_code,document_title,document_type,file_name,mime_type,content_hash,s3_key)
      VALUES ($1,$2,$3,'SRC-ROLLBACK','Rollback source','custom-ind-source-type','Custom IND input.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$4,$5)`, [otherSource, PROGRAM_B, ORG, sha256, sourcePath]);
    const counts = async () => (await db.pool.query(`SELECT
      (SELECT count(*) FROM authoring_documents)::int AS docs,
      (SELECT count(*) FROM authoring_sections)::int AS sections,
      (SELECT count(*) FROM doc_revisions)::int AS revisions,
      (SELECT count(*) FROM authoring_audit_trail)::int AS audits`)).rows[0];
    const before = await counts();
    await db.pool.query(`CREATE FUNCTION editor_import_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.change_reason='Exercise the import rollback guard' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$`);
    await db.pool.query('CREATE TRIGGER editor_import_fail_audit BEFORE INSERT ON authoring_audit_trail FOR EACH ROW EXECUTE FUNCTION editor_import_fail_audit()');
    try {
      const response = await author(request(app).post('/api/authoring/import/source')).send(body({ programId: PROGRAM_B,
        source: { kind: 'vault', documentId: otherSource }, reason: 'Exercise the import rollback guard' }));
      expect(response.status, JSON.stringify(response.body)).toBe(500);
      expect(await counts()).toEqual(before);
      expect(await fs.readFile(sourcePath)).toEqual(bytes);
    } finally { await db.pool.query('DROP TRIGGER editor_import_fail_audit ON authoring_audit_trail'); }
  });

  it('serves the complete canonical IND library through the same authenticated authoring router', async () => {
    const response = await author(request(app).get('/api/authoring/ind-document-catalog'));
    expect(response.status).toBe(200);
    expect(response.body.data.sections).toHaveLength(102);
    expect(response.body.data.deliverables).toHaveLength(93);
    expect(response.body.data.phases).toHaveLength(8);
  });
});

describe('continued source headings in the same authoring working copy', () => {
  it('preserves repeated Word headings, content and source evidence through save, reopen and exact draft reuse', async () => {
    const sourceId = randomUUID();
    const filePath = path.join(root, 'Continued specification.docx');
    const repeatedBytes = await Packer.toBuffer(new Document({ sections: [{ children: [
      new Paragraph({ text: '3.2.S.4.1 Specification', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('Initial assay limit is 99.2 percent.'),
      new Paragraph({ text: '3.2.S.4.1 Specification continued', heading: HeadingLevel.HEADING_1 }),
      new Table({ rows: [new TableRow({ children: [
        new TableCell({ children: [new Paragraph('Second assay')] }), new TableCell({ children: [new Paragraph('98.4 percent')] }),
      ] })] }),
      new Paragraph({ text: '3.2.S.4.1 Specification appendix', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('The appendix source passage must remain distinct.'),
    ] }] }));
    const hash = createHash('sha256').update(repeatedBytes).digest('hex');
    await fs.writeFile(filePath, repeatedBytes);
    await db.pool.query(`INSERT INTO vault.documents (id,program_id,organization_id,document_code,document_title,document_type,file_name,mime_type,content_hash,s3_key)
      VALUES ($1,$2,$3,'SRC-CONTINUED','Continued specification','specification','Continued specification.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$4,$5)`, [sourceId, PROGRAM, ORG, hash, filePath]);
    const input = body({ source: { kind: 'vault', documentId: sourceId } });
    const response = await author(request(app).post('/api/authoring/import/source')).send(input);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const result = response.body.data;
    expect(result.sections.map((s: { code: string; title: string; order_index: number }) => [s.code, s.title, s.order_index])).toEqual([
      ['3.2.S.4.1', 'Specification', 0], ['import.2', 'Specification continued', 1], ['import.3', 'Specification appendix', 2],
    ]);
    expect(result.sections[0].content).toContain('99.2 percent');
    expect(result.sections[1].content).toContain('<table>');
    expect(result.sections[1].content).toContain('98.4 percent');
    expect(result.sections[2].content).toContain('appendix source passage must remain distinct');
    expect(result.warnings.join(' ')).toContain('3.2.S.4.1 Specification continued');
    expect(result.warnings.join(' ')).toContain('3.2.S.4.1 Specification appendix');
    expect(result.warnings.join(' ')).toContain('not a CTD filing location');
    expect(result.doc.provenance.importSource).toMatchObject({ id: sourceId, sha256: hash, warnings: result.warnings });
    const audits = (await db.pglite.query<SourceAuditRow>('SELECT change_reason,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2', [result.doc.id, ORG])).rows;
    expect(audits).toHaveLength(3);
    for (const audit of audits) expect(audit.metadata.provenance.importSource).toMatchObject({ id: sourceId, sha256: hash, warnings: result.warnings });
    const editedSection = result.sections[1];
    const saved = await author(request(app).patch(`/api/authoring/sections/${editedSection.id}`)).send({
      content: '<p>Reviewed continued source: second assay 98.4 percent.</p>', expectedUpdatedAt: editedSection.updated_at,
      changeReason: 'Record the reviewed continuation of the verified specification',
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const reopened = await author(request(app).get(`/api/authoring/docs/${result.doc.id}/sections`));
    expect(reopened.status).toBe(200);
    expect(reopened.body.sections.map((s: { code: string }) => s.code)).toEqual(['3.2.S.4.1', 'import.2', 'import.3']);
    expect(reopened.body.sections[1].content).toContain('Reviewed continued source');
    const reused = await author(request(app).post('/api/authoring/import/source')).send(input);
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data).toMatchObject({ reused: true, doc: { id: result.doc.id }, warnings: result.warnings });
    expect(reused.body.data.sections[1].content).toContain('Reviewed continued source');
    expect(await fs.readFile(filePath)).toEqual(repeatedBytes);
    expect((await db.pool.query('SELECT content_hash FROM vault.documents WHERE id=$1', [sourceId])).rows).toEqual([{ content_hash: hash }]);
  });
});

async function versionedSource(label: string) {
  const sourceId = randomUUID();
  const filePath = path.join(root, `${sourceId}.docx`);
  const sourceBytes = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: '3.2.S.4.1 Specification', heading: HeadingLevel.HEADING_1 }), new Paragraph(label),
  ] }] }));
  const hash = createHash('sha256').update(sourceBytes).digest('hex');
  const code = `SRC-VERSION-${sourceId}`;
  await fs.writeFile(filePath, sourceBytes);
  await db.pool.query(`INSERT INTO vault.documents (id,program_id,organization_id,document_code,document_title,document_type,file_name,mime_type,content_hash,s3_key)
    VALUES ($1,$2,$3,$4,$5,'specification','Specification.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$6,$7)`, [sourceId, PROGRAM, ORG, code, label, hash, filePath]);
  const supersede = () => db.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,version,file_name,mime_type,content_hash,supersedes_id)
    VALUES ($1,$2,$3,$4,$5,'specification','2.0','Specification.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$6,$7)`,
  [randomUUID(), PROGRAM, ORG, code, `${label} successor`, createHash('sha256').update(`${sourceId}:v2`).digest('hex'), sourceId]);
  return { sourceId, filePath, sourceBytes, supersede, input: body({ source: { kind: 'vault', documentId: sourceId } }) };
}

const importEvidenceCounts = async () => (await db.pool.query(`SELECT
  (SELECT count(*) FROM authoring_documents)::int AS docs,
  (SELECT count(*) FROM authoring_sections)::int AS sections,
  (SELECT count(*) FROM doc_revisions)::int AS revisions,
  (SELECT count(*) FROM authoring_audit_trail)::int AS audits,
  (SELECT count(*) FROM doc_permissions)::int AS permissions`)).rows[0];

describe('intake keeps the exact currently eligible Vault version', () => {
  it.each([false, true])('refuses an earlier version before byte access, including an existing working copy (%s)', async savedCopy => {
    const source = await versionedSource(`Intake version before POST ${savedCopy}`);
    const first = savedCopy ? await author(request(app).post('/api/authoring/import/source')).send(source.input) : null;
    if (first) expect(first.status, JSON.stringify(first.body)).toBe(201);
    await source.supersede();
    const before = await importEvidenceCounts();
    await fs.rename(source.filePath, `${source.filePath}.held`);
    try {
      const response = await author(request(app).post('/api/authoring/import/source')).send(source.input);
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.error).toBe('SOURCE_CHANGED');
      expect(response.body.message).toContain('current version');
      expect(response.body.data).toBeUndefined();
      expect(await importEvidenceCounts()).toEqual(before);
      if (first) {
        const saved = await author(request(app).get(`/api/authoring/docs/${first.body.data.doc.id}/sections`));
        expect(saved.status).toBe(200);
        expect(saved.body.sections[0].content).toContain('Intake version before POST true');
      }
    } finally { await fs.rename(`${source.filePath}.held`, source.filePath); }
    expect(await fs.readFile(source.filePath)).toEqual(source.sourceBytes);
  });

  it.each([false, true])('rechecks a successor inserted during conversion before creation or reuse (%s)', async savedCopy => {
    const source = await versionedSource(`Intake version during conversion ${savedCopy}`);
    const first = savedCopy ? await author(request(app).post('/api/authoring/import/source')).send(source.input) : null;
    if (first) expect(first.status, JSON.stringify(first.body)).toBe(201);
    const before = await importEvidenceCounts();
    const [{ importSourceDocument }, { createDocumentFromDraft }, { importDocx }] = await Promise.all([
      import('../../services/authoring/authoring-source-import'), import('../../services/authoring/authoring-from-draft'),
      import('../../import/docx-to-authoring'),
    ]);
    const pool = db.pool as unknown as Pool;
    const ctx: CreateContext = { pool, tenantId: ORG, actor: { id: AUTHOR.id, email: AUTHOR.email },
      audit: { pool, tenantId: ORG, actorId: AUTHOR.id, actorEmail: AUTHOR.email, actorRole: 'MEMBER', ipAddress: '', userAgent: 'source-version-race' } };
    const outcome = await importSourceDocument(ctx, { id: AUTHOR.id, email: AUTHOR.email, roles: ['MEMBER'] }, source.input, {
      readVaultBytes: () => fs.readFile(source.filePath), readUpload: async () => { throw new Error('Unexpected upload'); },
      classify: () => 'docx', importDocx: async original => { await source.supersede(); return importDocx(original); },
      extractText: async () => { throw new Error('Unexpected plain-text extraction'); }, create: createDocumentFromDraft,
    });
    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'SOURCE_CHANGED', message: expect.stringContaining('current version') });
    expect(await importEvidenceCounts()).toEqual(before);
    expect(await fs.readFile(source.filePath)).toEqual(source.sourceBytes);
  });

  registerSourceImportRecoveryCases({ current: () => ({ db, app, author }), versionedSource, fault: importFault });

});
