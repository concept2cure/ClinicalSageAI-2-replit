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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-dataroom';
/* Captures are append-only (VR-16: DELETE is the table owner's alone), so a
   run cannot remove what it wrote. Each run's projects are its own. */
const RUN = Date.now().toString(36);
/** Stored bytes live under uploads/org-<id>/: the loader refuses any other path. */
const uploadDir = () => path.resolve(process.cwd(), 'uploads', `org-${orgId}`);
const written: string[] = [];

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
  written.push(path.join(uploadDir(), id));
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

async function cleanup(): Promise<void> {
  await owner.query(`DELETE FROM audit_logs WHERE details::text LIKE $1`, [`%${PROBE}%`]).catch(() => {});
  await owner.query(`DELETE FROM cre_evidence_sources WHERE title LIKE $1`, [`${PROBE}%`]).catch(() => {});
  await owner.query(`DELETE FROM vault.documents WHERE document_code LIKE $1`, [`${PROBE.toUpperCase()}%`]).catch(() => {});
  await owner.query(`DELETE FROM file_uploads WHERE id LIKE $1`, [`${PROBE}%`]).catch(() => {});
  await owner.query(`DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)`, [`${PROBE}%`]).catch(() => {});
  await owner.query(`DELETE FROM regulatory_programs WHERE name LIKE $1`, [`${PROBE}%`]).catch(() => {});
  for (const f of written.splice(0)) await fs.rm(f, { force: true });
}

async function program(name: string, org: number): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Bexotinib') RETURNING id`,
    [`${PROBE} ${name} ${RUN}`, `DR-${name}-${RUN}`.toUpperCase(), org],
  );
  return String(rows[0].id);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE} org`, `${PROBE}-org`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE} other`, `${PROBE}-other`],
  );
  otherOrgId = Number(other.rows[0].id);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'DR', 'x')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}@dbtest.local`],
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  programId = await program('main', orgId);
  siblingProgramId = await program('sibling', orgId);
  otherProgramId = await program('foreign', otherOrgId);
  app = await buildApp();
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner?.end();
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
  it('processes a pending capture from its stored bytes, and names one it cannot read', async () => {
    const fileId = await conversationFile('Stability summary.txt', 'Stability summary for batch 23-104: assay 98.4 percent at six months.');
    const { rows } = await owner.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, client_program_id,
          ingestion_status, extraction_status, provenance, metadata)
       VALUES ($1, 'project_private', 'client_document', $2, $3, $4, 'ingested', 'pending', $5::jsonb, '{"mimeType":"text/plain"}'::jsonb)
       RETURNING id`,
      [orgId, `${PROBE} Stability summary.txt`, `pending-${fileId}`, programId, JSON.stringify({ origin: 'adopt', fileUploadId: fileId })],
    );
    const unreadable = await source(programId, 'no file', null);
    const { processPendingSources } = await import('../../server/services/clinical-regulatory-evidence/data-room-processing');
    const dry = await asTenant(() => processPendingSources(orgId, { limit: 50 }));
    expect(dry.dryRun).toBe(true);
    expect(dry.examined).toBeGreaterThanOrEqual(2);
    const applied = await asTenant(() => processPendingSources(orgId, { apply: true, limit: 50 }));
    expect(applied.processed).toBeGreaterThanOrEqual(1);
    expect(applied.unreadable.map(u => u.sourceId)).toContain(unreadable);
    const after = await owner.query('SELECT extraction_status, char_count FROM cre_evidence_sources WHERE id = $1', [rows[0].id]);
    expect(after.rows[0].extraction_status).toBe('extracted');
    expect(after.rows[0].char_count).toBeGreaterThan(0);
  }, 60_000);
});

describe('the room pages past 200, and stays in its project', () => {
  beforeAll(async () => {
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
