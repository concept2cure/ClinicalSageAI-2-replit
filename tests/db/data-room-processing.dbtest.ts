/**
 * The Data Room keeps what it read, can be searched by it, pages past 200,
 * and counts exactly (D2, Data Room catalog S2, 2026-10-08;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before:
 *   - a file adopted from a conversation stayed extraction_status 'pending'
 *     forever. Nothing read it, classified it or versioned it;
 *   - no source kept its text, so the Data Room had no search beyond a
 *     client-side title match;
 *   - GET /:id/sources stopped at 200 rows with no paging or total, and the
 *     Vault lane's counts were floors over those 200.
 *
 * Real PostgreSQL, the real projects router behind the real request tenant
 * scope, and bytes on disk read through the one verified loader.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';

const PROBE = 'dbtest-dataroom';
/* Captures are append-only (VR-16: DELETE is the table owner's alone), so a
   run cannot remove what it wrote. Each run's projects are its own. */
const RUN = Date.now().toString(36);
/** Stored bytes live under uploads/org-<id>/: the loader refuses any other path. */
const uploadDir = () => path.resolve(process.cwd(), 'uploads', `org-${orgId}`);

let owner: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let userId: number;
let programId: string;
let siblingProgramId: string;
let otherProgramId: string;

const PROTOCOL_TEXT =
  'Clinical Study Protocol BX-301-02, Version 3.0. A randomized double-blind placebo-controlled study of ' +
  'bexotinib in adults with idiopathic pulmonary fibrosis. The primary endpoint is the annual rate of decline ' +
  'in forced vital capacity measured by spirometry at week 52.';

async function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'tests/db/data-room-processing.dbtest.ts' },
    fn,
  );
}

async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/c2c/projects')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin', email: 'dr@dbtest.local' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/projects', router);
  return a;
}

/** A conversation file: bytes on disk and its file_uploads row, with no project. */
async function conversationFile(name: string, body: string): Promise<string> {
  const id = `${PROBE}-${RUN}-${createHash('sha1').update(name + body).digest('hex').slice(0, 12)}`;
  const bytes = Buffer.from(body, 'utf8');
  await fs.mkdir(uploadDir(), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), id), bytes);
  await owner.query(
    `INSERT INTO file_uploads (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
     VALUES ($1, $2, $3, $4, 'text/plain', $5, $6, $7, 'uploaded', NOW())`,
    [id, userId, orgId, name, bytes.length, `uploads/org-${orgId}/${id}`, createHash('sha256').update(bytes).digest('hex')],
  );
  return id;
}

/** A captured source written directly, for paging and scope cases. */
async function source(program: string, title: string, text: string | null, extra: Record<string, unknown> = {}) {
  const { rows } = await owner.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum, client_program_id,
        ingestion_status, extraction_status, extracted_text, char_count, metadata, provenance)
     VALUES ($1, 'project_private', 'client_document', $2, $3, $4, 'ingested', $5, $6, $7, $8::jsonb, '{}'::jsonb)
     RETURNING id`,
    [
      extra.org ?? orgId, `${PROBE} ${title}`, createHash('sha256').update(`${RUN}${program}${title}${text}`).digest('hex'), program,
      text ? 'extracted' : 'pending', text, text ? text.length : null, JSON.stringify(extra.metadata ?? {}),
    ],
  );
  return Number(rows[0].id);
}

type DataRoomFixture = { orgId: number; orgUuid: string; otherOrgId: number; userId: number;
  programId: string; siblingProgramId: string; otherProgramId: string };
const fixtureActors = new Map<number, number>();
const fixtureWorkspaces = new Map<number, number>();
const fixturePrefixes = new Map<number, string>();
let baseFixture: DataRoomFixture;
function activateFixture(fixture: DataRoomFixture): void {
  ({ orgId, orgUuid, otherOrgId, userId, programId, siblingProgramId, otherProgramId } = fixture);
}

/** Every fixture owns new identities and real current private-programme parents.
 * Retain its captures, audit records and bytes; none is cleanup garbage. */
async function freshFixture(label: string): Promise<DataRoomFixture> {
  const prefix = `${PROBE}-${label}-${randomUUID()}`;
  const organizations = (await owner.query<{ id: number; uuid: string }>(
    `INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active'),($2,$2,'active') RETURNING id,uuid`,
    [`${prefix}-own`, `${prefix}-foreign`],
  )).rows;
  const accounts = (await owner.query<{ id: number }>(
    `INSERT INTO users(email,name,password_hash,status) VALUES($1,'Synthetic Data Room actor','unused-fixture-hash','active'),
      ($2,'Synthetic foreign Data Room actor','unused-fixture-hash','active') RETURNING id`,
    [`${prefix}-own@example.invalid`, `${prefix}-foreign@example.invalid`],
  )).rows;
  for (let i = 0; i < organizations.length; i += 1) {
    const organization = organizations[i]; const actor = accounts[i].id;
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')", [organization.id, actor]);
    const workspace = (await owner.query<{ id: number }>(
      'INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [organization.id, `${prefix}-${i}`],
    )).rows[0].id;
    fixtureActors.set(organization.id, actor); fixtureWorkspaces.set(organization.id, workspace); fixturePrefixes.set(organization.id, `${prefix}-${i}`);
  }
  const own = organizations[0], foreign = organizations[1];
  return { orgId: own.id, orgUuid: own.uuid, otherOrgId: foreign.id, userId: accounts[0].id,
    programId: await program('main', own.id), siblingProgramId: await program('sibling', own.id), otherProgramId: await program('foreign', foreign.id) };
}

async function program(name: string, org: number): Promise<string> {
  const actor = fixtureActors.get(org), workspace = fixtureWorkspaces.get(org), prefix = fixturePrefixes.get(org);
  if (!actor || !workspace || !prefix) throw new Error('A current Data Room fixture parent is required');
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO regulatory_programs(name,code,organization_id,program_type,product_type,primary_agency,product_name,lead_user_id)
     VALUES($1,$2,$3,'IND','drug','FDA','Synthetic qualification product',$4) RETURNING id`,
    [`${PROBE} ${name} ${prefix}`, `DR-${name}-${createHash('sha256').update(prefix).digest('hex').slice(0, 24)}`.toUpperCase(), org, actor],
  );
  const project = (await owner.query<{ id: number }>(
    `INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{"projectSharing":{"visibility":"private","members":[]}}') RETURNING id`,
    [org, workspace, `${prefix}-${name}`, actor, rows[0].id],
  )).rows[0].id;
  await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')", [org, project]);
  return rows[0].id;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must name the non-bypass runtime role');
  const runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
  try {
    const role = (await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(role).toEqual({role:'app_service',rolsuper:false,rolbypassrls:false});
    // Local CI plaintext is distinct from the external verified-TLS proof.
    expect((await runtime.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(shouldUseSsl(process.env.APP_DATABASE_URL));
  } finally { await runtime.end(); }
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  baseFixture = await freshFixture('main'); activateFixture(baseFixture);
  app = await buildApp();
}, 60_000);

afterAll(async () => {
  // Retain each newly namespaced capture, immutable record and original bytes.
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('an adopted conversation file is read, classified and stored', () => {
  let sourceId: number;

  it('adopt answers 201, and the source is extracted with its text, measure and declared version', async () => {
    const fileId = await conversationFile('BX-301-02 protocol v3.txt', PROTOCOL_TEXT);
    const res = await request(app).post(`/api/c2c/projects/${programId}/adopt`).send({ fileUploadId: fileId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.processed).toBe(true);
    sourceId = res.body.sourceId;
    const { rows } = await owner.query(
      `SELECT extraction_status, char_count, extracted_text, version, metadata->'dossier' AS dossier,
              provenance->>'processedBy' AS processed_by
         FROM cre_evidence_sources WHERE id = $1`,
      [sourceId],
    );
    expect(rows[0].extraction_status).toBe('extracted');
    expect(rows[0].char_count).toBe(PROTOCOL_TEXT.length);
    expect(rows[0].extracted_text).toContain('forced vital capacity');
    expect(rows[0].version).toBe('3.0');
    expect(rows[0].dossier).not.toBeNull();
    expect(rows[0].processed_by).toBe('adopt');
  }, 60_000);

  it('a word only in its body finds it, with a snippet of where', async () => {
    const res = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ q: 'spirometry' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.sources[0].id).toBe(sourceId);
    expect(res.body.sources[0].snippet).toMatch(/spirometry/i);
    expect(JSON.stringify(res.body)).not.toContain('idiopathic pulmonary fibrosis. The primary endpoint is the annual rate');
  });
});

describe('the pending sweep reads what was captured before', () => {
  beforeEach(async () => { activateFixture(await freshFixture('pending')); });
  afterEach(() => { activateFixture(baseFixture); });
  it('processes a pending capture from its stored bytes, and names one it cannot read', async () => {
    const body='Stability summary for batch 23-104: assay 98.4 percent at six months.';
    const fileId = await conversationFile('Stability summary.txt',body);
    const digest=createHash('sha256').update(body).digest('hex');
    const { rows } = await owner.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, client_program_id,
          ingestion_status, extraction_status, provenance, metadata,stored_artifact_ref)
       VALUES ($1, 'project_private', 'client_document', $2, $3, $4, 'ingested', 'pending', $5::jsonb, '{"mimeType":"text/plain"}'::jsonb,$6)
       RETURNING id`,
      [orgId, `${PROBE} Stability summary.txt`,digest,programId,JSON.stringify({ origin:'adopt',fileUploadId:fileId }),`uploads/org-${orgId}/${fileId}`],
    );
    const unreadable = await source(programId, 'no file', null);
    const { processPendingSources } = await import('../../server/services/clinical-regulatory-evidence/data-room-processing');
    const dry = await asTenant(() => processPendingSources(orgId, { limit: 50 }));
    expect(dry.dryRun).toBe(true);
    expect(dry.examined).toBeGreaterThanOrEqual(1);
    expect(dry.processed).toBe(0);
    expect(dry.diagnosticCounts.blocked).toBeGreaterThanOrEqual(1);
    const applied = await asTenant(() => processPendingSources(orgId, { apply: true, limit: 50 }));
    expect(applied.processed).toBeGreaterThanOrEqual(1);
    expect(applied.unreadable.map(u => u.sourceId)).toContain(unreadable);
    const after = await owner.query('SELECT extraction_status,char_count,extracted_text,metadata FROM cre_evidence_sources WHERE id=$1',[rows[0].id]);
    expect(after.rows[0].extraction_status).toBe('extracted');
    expect(after.rows[0].char_count).toBeGreaterThan(0);
    expect(after.rows[0].extracted_text).toContain('assay 98.4');
    expect(after.rows[0].metadata.dataRoomProcessing).toMatchObject({version:1,state:'completed',attempts:1,
      identity:{organizationId:orgId,sourceId:Number(rows[0].id),sha256:digest,fileUploadId:fileId,programId,workspaceId:null}});
  }, 60_000);

  it('repairs legacy extracted-without-text and a same-identity rerun does not create an attempt',async()=>{
    const body='Cardiotoxicity monitoring follows the clinical protocol; legacy derived persistence was interrupted.';
    const fileId=await conversationFile('Legacy recovery.txt',body);
    const digest=createHash('sha256').update(body).digest('hex');
    const inserted=await owner.query(`INSERT INTO cre_evidence_sources
      (organization_id,visibility_class,source_type,title,checksum,client_program_id,stored_artifact_ref,
       ingestion_status,extraction_status,provenance,metadata)
      VALUES($1,'project_private','client_document',$2,$3,$4,$5,'ingested','extracted',$6::jsonb,'{"mimeType":"text/plain"}') RETURNING id`,
    [orgId,`${PROBE} Legacy recovery.txt`,digest,programId,`uploads/org-${orgId}/${fileId}`,JSON.stringify({origin:'chat_upload',fileUploadId:fileId})]);
    const id=Number(inserted.rows[0].id);
    const {processPendingSources,processCapturedSource}=await import('../../server/services/clinical-regulatory-evidence/data-room-processing');
    const dry=await asTenant(()=>processPendingSources(orgId,{sourceId:id,limit:1}));
    expect(dry.items).toEqual([{sourceId:id,status:'candidate'}]); expect(dry.processed).toBe(0);
    const applied=await asTenant(()=>processPendingSources(orgId,{sourceId:id,limit:1,apply:true}));
    expect(applied).toMatchObject({examined:1,processed:1,completed:1,failed:0});
    const before=await owner.query('SELECT metadata FROM cre_evidence_sources WHERE id=$1',[id]);
    const again=await asTenant(()=>processCapturedSource(orgId,id,{bytes:Buffer.from(body),fileName:'Legacy recovery.txt',
      mimeType:'text/plain',programId,expectedWorkspaceId:null,processedBy:'dbtest same-identity retry'}));
    expect(again).toMatchObject({ok:true,processed:true,status:'already_complete'});
    const after=await owner.query('SELECT metadata FROM cre_evidence_sources WHERE id=$1',[id]);
    expect(after.rows[0].metadata.dataRoomProcessing).toEqual(before.rows[0].metadata.dataRoomProcessing);
  },60_000);
});

describe('the room pages past 200, and stays in its project', () => {
  beforeAll(async () => {
    // Paging has its own baseline; it never relies on a pending sweep's captures.
    await source(programId, 'paging baseline', 'Independent paging baseline capture.');
    for (let i = 0; i < 250; i += 1) await source(programId, `bulk ${String(i).padStart(3, '0')}`, `Routine batch record ${i}.`);
    await source(siblingProgramId, 'sibling spirometry report', 'Spirometry results for the sibling project.');
    await source(otherProgramId, 'foreign spirometry report', 'Spirometry results for another organization.', { org: otherOrgId });
  }, 120_000);

  it('reports the real total and pages through it', async () => {
    const first = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ limit: 100 });
    expect(first.status).toBe(200);
    expect(first.body.total).toBeGreaterThanOrEqual(252);
    expect(first.body.sources).toHaveLength(100);
    expect(first.body.window.truncated).toBe(true);
    const last = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ limit: 100, offset: 200 });
    expect(last.body.sources.length).toBe(first.body.total - 200);
    expect(last.body.window.truncated).toBe(false);
    const ids = new Set([...first.body.sources, ...last.body.sources].map((s: { id: number }) => s.id));
    expect(ids.size).toBe(100 + last.body.sources.length);
  });

  it("a search never returns another project's source, nor another organization's", async () => {
    const res = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ q: 'spirometry' });
    const titles = res.body.sources.map((s: { title: string }) => s.title);
    expect(titles.some((t: string) => /sibling|foreign/.test(t))).toBe(false);
  });

  it('filters by how far a source was read, and refuses a filter it cannot read rather than widening', async () => {
    const pending = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ status: 'pending' });
    expect(pending.body.sources.every((s: { extractionStatus: string }) => s.extractionStatus === 'pending')).toBe(true);
    const bad = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ status: 'everything' });
    expect(bad.status).toBe(400);
    const badDate = await request(app).get(`/api/c2c/projects/${programId}/sources`).query({ from: 'last week' });
    expect(badDate.status).toBe(400);
  });
});

describe('the Vault lane counts every current source of the project', () => {
  it('counts captured, classified, filed and needs-review over the whole room', async () => {
    const roomProgram = await program('counted', orgId);
    for (let i = 0; i < 205; i += 1) await source(roomProgram, `plain ${i}`, 'text');
    await source(roomProgram, 'proposed', 'text', { metadata: { dossier: { suggestedFolder: 'module-3' } } });
    await source(roomProgram, 'refused', 'text', { metadata: { dossier: { suggestedFolder: null, needsReview: true } } });
    const filedId = await source(roomProgram, 'filed', 'filed text');
    const { rows: [filed] } = await owner.query('SELECT checksum FROM cre_evidence_sources WHERE id = $1', [filedId]);
    await owner.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, file_name, content_hash)
       VALUES ($1, $2, $3, 'Filed', 'REPORT', 'filed.txt', $4)`,
      [roomProgram, orgId, `${PROBE.toUpperCase()}-FILED-${RUN}`, filed.checksum],
    );
    const { countDataRoomStages } = await import('../../server/services/vault/vault-data-room-filing');
    const counts = await countDataRoomStages(owner, roomProgram, orgId);
    expect(counts).toEqual({ captured: 208, classified: 2, filed: 1, needsReview: 1 });
  }, 120_000);
});
