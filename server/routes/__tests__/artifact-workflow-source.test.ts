/** Real HTTP/JWT, project admission and SQL source/copy/governance qualification.
 * PGlite does not prove production RLS, PostgreSQL concurrency or live model qualification. */
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, VAULT_DDL, AUTHOR, PROGRAM, PROGRAM_B, ORG, OTHER_ORG, JWT_SECRET, makeApp, asToken } from './_authoring-canvas-fixture';
import { verifySavedWorkflowImport } from '../../services/authoring/import-source-references';
import { assertWorkflowImportRelease, type WorkflowGovernanceDocument, type WorkflowGovernanceSection } from '../../services/authoring/workflow-import-governance';
import { recordMachineSpan } from '../../services/clinical-regulatory-evidence/span-lineage.service';
import { createSourceHash } from '../../services/cmc-module3-compiler';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const reason = 'Review the exact retained artifact as an independent working copy';
const actor = { id: AUTHOR.id, email: AUTHOR.email };
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let nextArtifactId = 700;
const lineageExecutor = { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => db.pglite.query<R>(sql, params) };

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL, migrations: [
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
    'migrations/20260728_authoring_reviews.sql',
    'migrations/20261006_document_data_dispositions.sql',
  ], testOnlySql: `
    CREATE TABLE client_workspaces(id integer PRIMARY KEY,organization_id integer);
    ALTER TABLE concept2cure_artifacts ADD COLUMN artifact_id text UNIQUE, ADD COLUMN title text,
      ADD COLUMN type text, ADD COLUMN category text, ADD COLUMN status text, ADD COLUMN version integer,
      ADD COLUMN content text, ADD COLUMN content_hash text, ADD COLUMN metadata json,
      ADD COLUMN citations jsonb DEFAULT '[]', ADD COLUMN ctd_section text,
      ADD COLUMN created_by_id integer, ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE concept2cure_artifact_versions(id serial PRIMARY KEY,artifact_id integer,organization_id integer,
      version integer,content text,content_hash text,created_by_id integer,UNIQUE(artifact_id,version));
    CREATE TABLE concept2cure_provenance_events(id serial PRIMARY KEY,artifact_id integer,organization_id integer,
      artifact_version_id integer,event_type text,event_action text,details json);
    CREATE TABLE file_uploads(id text PRIMARY KEY,organization_id integer,checksum_sha256 text,storage_path text,status text);
    CREATE TABLE cre_evidence_sources(id serial PRIMARY KEY,organization_id integer,client_program_id uuid,
      source_type text,checksum text,provenance jsonb,deleted_at timestamptz);
  ` });
  h.db = db.db; h.pool = db.pool;
  author = asToken(await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role: 'member' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET)));
  const { default: router } = await import('../authoring.router');
  const requestRouter = express.Router();
  requestRouter.use((req, _res, next) => { Object.assign(req, { dbClient: db.pool }); next(); });
  requestRouter.use(router);
  app = makeApp(requestRouter);
}, 180_000);
afterAll(async () => { await db?.close(); });

interface SeedOptions {
  retained?: boolean; text?: string; contentHash?: string | null; metadata?: Record<string, unknown>;
  status?: string; category?: string; type?: string; version?: number; projectId?: number; organizationId?: number;
}
interface ArtifactSource { id: number; artifactId: string; text: string; version: number; versionId: number | null }
async function seed(options: SeedOptions = {}): Promise<ArtifactSource> {
  const id = ++nextArtifactId, artifactId = `legacy artifact / ${id}:CER`;
  const text = options.text ?? 'The retained source describes the clinical evidence and its limitations.';
  const version = options.version ?? 3, organizationId = options.organizationId ?? ORG;
  const contentHash = options.contentHash === undefined ? hash(text) : options.contentHash;
  await db.pool.query(`INSERT INTO concept2cure_artifacts
    (id,artifact_id,organization_id,project_id,title,type,category,status,version,content,content_hash,metadata,created_by_id)
    VALUES($1,$2,$3,$4,'Recorded CER',$5,$6,$7,$8,$9,$10,$11,$12)`,
  [id, artifactId, organizationId, options.projectId ?? 42, options.type ?? 'regulatory_document',
    options.category ?? 'document', options.status ?? 'approved', version, text, contentHash, options.metadata ?? {}, Number(AUTHOR.id)]);
  let versionId: number | null = null;
  if (options.retained !== false) versionId = (await db.pglite.query<{ id: number }>(`INSERT INTO concept2cure_artifact_versions
    (artifact_id,organization_id,version,content,content_hash,created_by_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
  [id, organizationId, version, text, hash(text), Number(AUTHOR.id)])).rows[0].id;
  return { id, artifactId, text, version, versionId };
}
const body = (source: ArtifactSource) => ({ programId: PROGRAM, source: { kind: 'artifact', artifactId: source.artifactId, version: source.version } });
const post = (input: Record<string, unknown>) => author(request(app).post('/api/authoring/import/source')).send(input);
async function preview(source: ArtifactSource) {
  const response = await post({ ...body(source), previewOnly: true });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data;
}
async function copy(source: ArtifactSource) {
  const p = await preview(source);
  const response = await post({ ...body(source), expectedFingerprint: p.fingerprint, reason });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.data;
}
async function counts() {
  return (await db.pool.query(`SELECT (SELECT count(*) FROM authoring_documents)::int AS docs,
    (SELECT count(*) FROM authoring_sections)::int AS sections,(SELECT count(*) FROM doc_revisions)::int AS revisions,
    (SELECT count(*) FROM authoring_audit_trail)::int AS audits,(SELECT count(*) FROM document_span_lineage)::int AS spans`)).rows[0];
}
async function governance(documentId: string) {
  const doc = (await db.pglite.query<WorkflowGovernanceDocument>('SELECT * FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [documentId, ORG])).rows[0];
  const sections = (await db.pglite.query<WorkflowGovernanceSection>('SELECT * FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2 ORDER BY order_index', [documentId, ORG])).rows;
  return { organizationId: ORG, actor, doc, sections };
}

describe('exact artifact head through the existing authoring source-import owner', () => {
  it('previews the exact legacy identity and retained current version without authoring writes', async () => {
    const source = await seed(); const before = await counts();
    const p = await preview(source);
    expect(p).toMatchObject({ preview: true, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      origin: { kind: 'artifact', id: source.artifactId, version: '3', conversion: 'artifact-snapshot',
        selection: body(source).source, sourceScope: { level: 'program', programId: PROGRAM, projectId: 42 },
        sectionOrigins: [{ code: 'artifact.content', sourceRowId: `concept2cure_artifact_versions:${source.versionId}`,
          contentSha256: hash(source.text), originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' }],
        artifactSource: { verificationBasis: 'retained-version', hashScheme: 'raw-sha256', version: 3 } },
      association: { mode: 'recorded', reasonRequired: false } });
    expect(await counts()).toEqual(before);
  });

  it('creates an unbound draft with immutable genesis, preserving source approval facts without transferring approval/signatures', async () => {
    const source = await seed({ metadata: { signed: true, signatureId: 'source-signature', approved: true } });
    const sourceRows = () => db.pool.query('SELECT * FROM concept2cure_artifacts WHERE id=$1', [source.id]);
    const original = (await sourceRows()).rows;
    const result = await copy(source);
    expect(result.doc).toMatchObject({ status: 'draft', module: null, c2c_document_id: null,
      provenance: { source: 'import', governedWrite: 'unverified' } });
    expect(result.sections[0].content).toContain(source.text);
    expect((await db.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM authoring_signatures WHERE doc_id=$1', [result.doc.id])).rows[0].n).toBe(0);
    const receipts = (await db.pglite.query<{ origin: unknown }>(`SELECT metadata->'provenance'->'importSource' AS origin
      FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='CREATE'`, [result.doc.id])).rows;
    expect(receipts.length).toBeGreaterThan(0);
    for (const row of receipts) expect(row.origin).toMatchObject(result.origin);
    expect((await sourceRows()).rows).toEqual(original);
  });

  it('reuses the actor copy with its saved edits without creating a duplicate', async () => {
    const source = await seed(); const first = await copy(source); const section = first.sections[0];
    const saved = await author(request(app).patch(`/api/authoring/sections/${section.id}`)).send({
      content: '<p>Independent review changes the working copy.</p>', expectedUpdatedAt: section.updated_at,
      changeReason: 'Record independent reviewer edits to the artifact copy',
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const before = await counts(), p = await preview(source);
    const reused = await post({ ...body(source), expectedFingerprint: p.fingerprint, reason });
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data).toMatchObject({ reused: true, doc: { id: first.doc.id },
      sections: [expect.objectContaining({ content: '<p>Independent review changes the working copy.</p>' })] });
    expect(await counts()).toEqual(before);
  });

  it('keeps separate copies of successive recorded versions and refuses historical source selection', async () => {
    const source = await seed(); const first = await copy(source), text = 'A new retained current version.';
    await db.pool.query('UPDATE concept2cure_artifacts SET version=4,content=$1,content_hash=$2 WHERE id=$3', [text, hash(text), source.id]);
    await db.pool.query('INSERT INTO concept2cure_artifact_versions(artifact_id,organization_id,version,content,content_hash) VALUES($1,$2,4,$3,$4)', [source.id, ORG, text, hash(text)]);
    const older = await post({ ...body(source), previewOnly: true }); expect(older.status).toBe(409);
    const newer = await copy({ ...source, version: 4, text });
    expect(newer.doc.id).not.toBe(first.doc.id);
    expect(newer.origin.version).toBe('4');
  });

  it.each(['metadata', 'citations', 'content', 'version', 'lineage', 'event'])('refuses %s drift after preview without authoring writes', async change => {
    const source = await seed(), p = await preview(source);
    if (change === 'metadata') await db.pool.query('UPDATE concept2cure_artifacts SET metadata=$1 WHERE id=$2', [{ reviewed: true }, source.id]);
    if (change === 'citations') await db.pool.query('UPDATE concept2cure_artifacts SET citations=$1 WHERE id=$2', [JSON.stringify([{ id: 'new-citation' }]), source.id]);
    if (change === 'content') await db.pool.query('UPDATE concept2cure_artifacts SET content=$1 WHERE id=$2', ['Different current prose', source.id]);
    if (change === 'version') await db.pool.query('UPDATE concept2cure_artifacts SET version=4 WHERE id=$1', [source.id]);
    if (change === 'lineage') await recordMachineSpan(ORG, { documentTable: 'concept2cure_artifacts', documentId: String(source.id),
      charStart: 0, charEnd: source.text.length, spanText: source.text, machineAuthorId: 'ana' }, lineageExecutor);
    if (change === 'event') await db.pool.query(`INSERT INTO concept2cure_provenance_events(artifact_id,organization_id,event_type,event_action,details)
      VALUES($1,$2,'generation','ai_generate',$3)`, [source.id, ORG, { generation: { mode: 'ai_generated' } }]);
    const before = await counts();
    const response = await post({ ...body(source), expectedFingerprint: p.fingerprint, reason });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(await counts()).toEqual(before);
  });
});

describe('artifact source refusal preserves project and tenant boundaries', () => {
  it('refuses association to another selected project instead of copying the source into it', async () => {
    const source = await seed(), before = await counts();
    const response = await post({ ...body(source), programId: PROGRAM_B, previewOnly: true });
    expect(response.status, JSON.stringify(response.body)).toBe(404);
    expect(await counts()).toEqual(before);
  });

  it.each(['foreign-organization', 'other-project', 'unbound', 'archived', 'empty', 'hash-mismatch', 'version-mismatch'])('refuses %s before copy creation', async mode => {
    const source = await seed({ ...(mode === 'foreign-organization' ? { organizationId: OTHER_ORG } : {}),
      ...(mode === 'other-project' ? { projectId: 43 } : {}), ...(mode === 'unbound' ? { projectId: 0 } : {}),
      ...(mode === 'archived' ? { status: 'archived' } : {}), ...(mode === 'empty' ? { text: '' } : {}),
      ...(mode === 'hash-mismatch' ? { contentHash: 'f'.repeat(64) } : {}) });
    if (mode === 'version-mismatch') await db.pool.query('UPDATE concept2cure_artifact_versions SET content_hash=$1 WHERE artifact_id=$2', ['e'.repeat(64), source.id]);
    const before = await counts(); const response = await post({ ...body(source), previewOnly: true });
    expect(response.status, JSON.stringify(response.body)).toBe(['foreign-organization', 'other-project', 'unbound'].includes(mode) ? 404 : 409);
    expect(response.body.data).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it('reports unavailable project policy as unavailable rather than an empty or admitted source', async () => {
    const source = await seed(), before = await counts();
    await db.pool.query('ALTER TABLE project_visibility_settings RENAME TO held_artifact_project_visibility');
    try {
      const response = await post({ ...body(source), previewOnly: true });
      expect(response.status, JSON.stringify(response.body)).toBe(503);
      expect(response.body.data).toBeUndefined(); expect(await counts()).toEqual(before);
    } finally { await db.pool.query('ALTER TABLE held_artifact_project_visibility RENAME TO project_visibility_settings'); }
  });

  it('refuses a newly private project and revoked current membership even for an existing copy', async () => {
    const source = await seed(), existing = await copy(source);
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    await db.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
    try {
      const denied = await post({ ...body(source), previewOnly: true }); expect(denied.status).toBe(403);
    } finally {
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
      await db.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
    }
    await db.pool.query('UPDATE organization_users SET role=$1 WHERE organization_id=$2 AND user_id=$3', ['viewer', ORG, Number(AUTHOR.id)]);
    try { expect((await post({ ...body(source), reason, expectedFingerprint: existing.origin.fingerprint })).status).toBe(403); }
    finally { await db.pool.query('UPDATE organization_users SET role=$1 WHERE organization_id=$2 AND user_id=$3', ['member', ORG, Number(AUTHOR.id)]); }
  });

  it.each([{ artifactId: ' leading-space', version: 3 }, { artifactId: 'id\nwith-control', version: 3 },
    { artifactId: 'id', version: 0 }, { artifactId: 'id', version: 1.5 }, { artifactId: 'id', version: '3' }])('refuses malformed exact identity %j', async selection => {
    const before = await counts();
    expect((await post({ programId: PROGRAM, source: { kind: 'artifact', ...selection }, previewOnly: true })).status).toBe(400);
    expect(await counts()).toEqual(before);
  });
});

describe('current-head snapshot and authorship disclosures survive the saved editor copy', () => {
  it('labels an unrecorded-hash legacy head and still requires independent human adoption', async () => {
    const source = await seed({ retained: false, contentHash: null }); const result = await copy(source);
    expect(result.origin.artifactSource).toMatchObject({ verificationBasis: 'current-head-snapshot', hashScheme: 'unrecorded', contentSha256: hash(source.text) });
    const input = await governance(result.doc.id);
    await expect(verifySavedWorkflowImport(input.doc, db.pool, { organizationId: ORG, actor })).resolves.not.toBeNull();
    await expect(assertWorkflowImportRelease(db.pool, input)).rejects.toMatchObject({ code: 'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
    await expect(verifySavedWorkflowImport({ ...input.doc, provenance: { importSource: {
      ...result.origin, id: null, selection: { kind: 'artifact', artifactId: null, version: 3 },
    } } }, db.pool, { organizationId: ORG, actor })).rejects.toThrow();
  });

  it('accepts normalized raw hashes and recognized current CMC source hashes without fabricating retained versions', async () => {
    const raw = await seed({ retained: false, contentHash: `  ${hash('Exact raw source').toUpperCase()}  `, text: 'Exact raw source' });
    expect((await preview(raw)).origin.artifactSource).toMatchObject({ verificationBasis: 'current-head-snapshot', hashScheme: 'raw-sha256' });
    const text = 'Recorded Module 3 narrative.', sectionKey = '3.2.S.1';
    const cmc = await seed({ retained: false, text, contentHash: createSourceHash({ narrative: text, sectionKey }), metadata: { compiledFrom: 'module3-os', sectionKey } });
    await db.pool.query('UPDATE concept2cure_artifacts SET ctd_section=$1 WHERE id=$2', [sectionKey, cmc.id]);
    expect((await preview(cmc)).origin.artifactSource).toMatchObject({ verificationBasis: 'current-head-snapshot', hashScheme: 'cmc-source-hash' });
    expect((await db.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM concept2cure_artifact_versions WHERE artifact_id=$1', [cmc.id])).rows[0].n).toBe(0);
  });

  it.each(['mismatching-hash', 'missing-updated-at'])('refuses an unverifiable legacy head (%s)', async mode => {
    const source = await seed({ retained: false, contentHash: mode === 'mismatching-hash' ? 'a'.repeat(64) : null });
    if (mode === 'missing-updated-at') await db.pool.query('UPDATE concept2cure_artifacts SET updated_at=NULL WHERE id=$1', [source.id]);
    const response = await post({ ...body(source), previewOnly: true });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
  });

  it('retains machine authorship and an unqualified model name from recorded generation metadata', async () => {
    const result = await copy(await seed({ metadata: { generationMethod: 'ai', model: 'recorded-name-only' } }));
    expect(result.origin.sectionOrigins[0]).toMatchObject({ originalAuthorship: 'machine', model: 'recorded-name-only', modelEvidence: 'recorded-name-only' });
    await expect(assertWorkflowImportRelease(db.pool, await governance(result.doc.id))).rejects.toMatchObject({ code: 'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });

  it('attributes a model only to the exact current version rather than an unrelated historical generation event', async () => {
    const source = await seed();
    const oldVersion = (await db.pglite.query<{ id: number }>(`INSERT INTO concept2cure_artifact_versions
      (artifact_id,organization_id,version,content,content_hash) VALUES($1,$2,2,'Older text',$3) RETURNING id`,
    [source.id, ORG, hash('Older text')])).rows[0].id;
    await db.pool.query(`INSERT INTO concept2cure_provenance_events(artifact_id,organization_id,artifact_version_id,event_type,event_action,details)
      VALUES($1,$2,$3,'generation','ai_generate',$4)`, [source.id, ORG, oldVersion, { model: 'historical-model' }]);
    expect((await preview(source)).origin.sectionOrigins[0]).toMatchObject({ originalAuthorship: 'machine', model: null });
    await db.pool.query(`INSERT INTO concept2cure_provenance_events(artifact_id,organization_id,artifact_version_id,event_type,event_action,details)
      VALUES($1,$2,$3,'generation','ai_generate',$4)`, [source.id, ORG, source.versionId, { model: 'current-unqualified-model' }]);
    expect((await preview(source)).origin.sectionOrigins[0]).toMatchObject({ model: 'current-unqualified-model', modelEvidence: 'recorded-name-only' });
  });

  it('refuses machine lineage whose retained span hash disagrees with the exact source text', async () => {
    const source = await seed();
    await recordMachineSpan(ORG, { documentTable: 'concept2cure_artifacts', documentId: String(source.id),
      charStart: 0, charEnd: source.text.length, spanText: 'Mismatching recorded span', machineAuthorId: 'ana' }, lineageExecutor);
    const response = await post({ ...body(source), previewOnly: true });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error).toBe('ARTIFACT_SOURCE_LINEAGE_UNVERIFIED');
  });

  it('retains conversation generation evidence and dated accepted-machine spans through persisted verification', async () => {
    const source = await seed({ retained: false, contentHash: null });
    await db.pool.query(`INSERT INTO concept2cure_provenance_events(artifact_id,organization_id,event_type,event_action,details)
      VALUES($1,$2,'generation','conversation_promote',$3)`, [source.id, ORG, { generation: { mode: 'ai_generated' } }]);
    await recordMachineSpan(ORG, { documentTable: 'concept2cure_artifacts', documentId: String(source.id),
      charStart: 0, charEnd: source.text.length, spanText: source.text, machineAuthorId: 'ana', assertedBy: AUTHOR.id,
      assertedAt: new Date('2026-10-30T12:00:00Z') }, lineageExecutor);
    const result = await copy(source);
    expect(result.origin.sectionOrigins[0].originalAuthorship).toBe('machine');
    expect(result.origin.artifactSource.machineLineage[0].assertedAt).toBe('2026-10-30T12:00:00.000Z');
    expect(result.origin.artifactSource.provenanceEvents).toHaveLength(1);
    const input = await governance(result.doc.id);
    await expect(verifySavedWorkflowImport(input.doc, db.pool, { organizationId: ORG, actor })).resolves.not.toBeNull();
    await expect(assertWorkflowImportRelease(db.pool, input)).rejects.toMatchObject({ code: 'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });

  it('preserves structured JSON as escaped source text rather than executing or inventing a rendered document', async () => {
    const source = await seed({ type: 'chart', category: 'visualization', text: '{"label":"<script>unsafe()</script>","n":12}' });
    const result = await copy(source);
    expect(result.sections[0].content).toContain('&lt;script&gt;');
    expect(result.sections[0].content).not.toContain('<script>');
    expect(result.origin.artifactSource).toMatchObject({ type: 'chart', category: 'visualization', contentSha256: hash(source.text) });
    expect(result.warnings.join(' ')).toMatch(/stored|representation|render/i);
  });

  it('honors canonical retained-data and withdrawn-data disposition policy for the exact artifact', async () => {
    for (const choice of ['keep_data', 'remove_data']) {
      const source = await seed({ text: `The ${choice} disposition applies to these exact unique source bytes.` }), vaultId = randomUUID();
      await db.pool.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,content_hash)
        VALUES($1,$2,$3,$4,'Disposition source','source',$5)`, [vaultId, PROGRAM, ORG, `source-${source.id}`, hash(source.text)]);
      await db.pool.query(`INSERT INTO document_data_dispositions(organization_id,program_id,vault_document_id,choice,reason,
        actor_id,source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt)
        VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,'{}',$9)`,
      [ORG, PROGRAM, vaultId, choice, reason, Number(AUTHOR.id), hash(source.text),
        { capturedSourceIds: [], vaultDocumentIds: [vaultId], artifactIds: [String(source.id), source.artifactId], uploadIds: [] },
        { id: randomUUID(), sha256Chain: 'a'.repeat(64) }]);
      const response = await post({ ...body(source), previewOnly: true });
      expect(response.status, JSON.stringify(response.body)).toBe(choice === 'keep_data' ? 200 : 409);
    }
  });
});
