/** Real adoption eligibility SQL/rollback via PGlite. Filesystem bytes,
 * source persistence and audit sealing are explicit seams, not live RLS,
 * immutable storage, independent-connection concurrency or audit-HMAC PQ. */
import { randomUUID, createHash } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../../services/document-data-disposition/__tests__/disposition-fixture';

const h = vi.hoisted(() => ({ db: null as any, bytes: Buffer.from('original scientific source'),
  captureFails: false, auditFails: false, missing: false,
  beforeRead: null as (() => Promise<void>) | null }));
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, promises: { ...original.promises, readFile: vi.fn(async () => {
    if (h.missing) throw new Error('missing test bytes');
    await h.beforeRead?.();
    return h.bytes;
  }) } };
});
vi.mock('../../../db.js', () => ({ getPool: () => h.db,
  pool: { query: (...args: any[]) => h.db.query(...args), connect: () => h.db.connect() } }));
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  computeAuditChainSealed: async () => {
    if (h.auditFails) throw new Error('audit seal test seam failed');
    return { sha256Chain: 'f'.repeat(64), hmacSeal: 'test-seal' };
  },
}));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  findSourceByChecksum: async (org: number, hash: string, opts: any, executor?: any) => {
    const result = await (executor ?? h.db).query(`SELECT id FROM cre_evidence_sources
      WHERE organization_id=$1 AND client_program_id=$2 AND checksum=$3
      AND source_type=$4 AND deleted_at IS NULL ORDER BY id LIMIT 1`,
    [org, opts.clientProgramId, hash, opts.sourceType]);
    return result.rows[0] ?? null;
  },
  createSource: async (org: number, p: any, q: any) => {
    const result = await q.query(`INSERT INTO cre_evidence_sources
      (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
    [org, p.clientProgramId, p.sourceType, p.title, p.checksum, p.extractionStatus ?? 'pending',
      p.ingestionStatus, JSON.stringify(p.provenance), JSON.stringify(p.metadata)]);
    if (h.captureFails) throw new Error('capture test seam failed');
    return result.rows[0];
  },
}));

import projectsRouter from '../projects';
import { sha256Hex } from '../../../services/ana/uploaded-file-access';

let harness: DispositionHarness;
let f: DispositionFixture;
let uploadId: string;
const original = Buffer.from('original scientific source');
beforeAll(async () => {
  harness = await createDispositionHarness(); h.db = harness.db;
  await harness.pg.exec(`ALTER TABLE file_uploads ADD COLUMN original_name text,
    ADD COLUMN mime_type text, ADD COLUMN file_size bigint;
    CREATE TABLE audit_logs (id uuid PRIMARY KEY, tenant_id integer, user_id integer,
      action text, table_name text, record_id text, actor_id integer, target text,
      target_type text, target_id text, payload_hash text, sha256_chain text,
      occurred_at timestamptz, hmac_seal text, new_values json, old_values json,
      ip_address text, user_agent text, reason text);`);
});
afterAll(async () => { await harness.close(); });
beforeEach(async () => {
  vi.clearAllMocks(); h.bytes = original; h.captureFails = false; h.auditFails = false; h.missing = false; h.beforeRead = null;
  f = await harness.seed(); uploadId = randomUUID();
  await f.pg.query(`INSERT INTO file_uploads
    (id,organization_id,checksum_sha256,storage_path,status,original_name,mime_type,file_size)
    VALUES ($1,$2,$3,$4,'uploaded','clinical.csv','text/csv',$5)`,
  [uploadId, f.org, sha256Hex(original), `uploads/org-${f.org}/${uploadId}`, original.length]);
});
function app() {
  const instance = express(); instance.use(express.json());
  instance.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { organizationId: f.org, userId: 42, userRole: 'manager' }); next();
  });
  instance.use('/api/c2c/projects', projectsRouter);
  return instance;
}
function adopt(program = f.program) {
  return request(app()).post(`/api/c2c/projects/${program}/adopt`).send({ fileUploadId: uploadId });
}
async function captures() {
  return (await f.pg.query<any>(`SELECT * FROM cre_evidence_sources
    WHERE organization_id=$1 AND provenance->>'fileUploadId'=$2`, [f.org, uploadId])).rows;
}
async function audits() {
  return (await f.pg.query<any>('SELECT * FROM audit_logs WHERE tenant_id=$1', [f.org])).rows;
}

describe('conversation adoption: actual SQL and transaction boundary', () => {
  it('captures verified bytes with pending extraction and its same-transaction audit, preserving the upload', async () => {
    const response = await adopt(); expect(response.status).toBe(201);
    const rows = await captures(); expect(rows).toHaveLength(1);
    expect(rows[0].checksum).toBe(sha256Hex(original));
    expect(rows[0].extraction_status).toBe('pending');
    expect(rows[0].provenance.fileUploadId).toBe(uploadId);
    const trail = await audits(); expect(trail).toHaveLength(1);
    expect(trail[0].action).toBe('c2c.project.adopt');
    expect(trail[0].new_values.source_id).toBe(rows[0].id);
    expect((await f.pg.query<any>('SELECT status FROM file_uploads WHERE id=$1 AND organization_id=$2', [uploadId, f.org])).rows[0].status).toBe('uploaded');
  });

  it('repeated adoption returns the same source without another capture or audit', async () => {
    const first = await adopt(); const second = await adopt();
    expect(second.status).toBe(200); expect(second.body.adopted).toBe(false);
    expect(second.body.sourceId).toBe(first.body.sourceId);
    expect(await captures()).toHaveLength(1); expect(await audits()).toHaveLength(1);
  });

  it.each(['capture', 'audit'])('rolls back capture and audit when the %s seam fails', async failure => {
    h.captureFails = failure === 'capture'; h.auditFails = failure === 'audit';
    expect((await adopt()).status).toBe(500);
    expect(await captures()).toEqual([]); expect(await audits()).toEqual([]);
  });

  it('does not capture bytes altered after the recorded upload digest', async () => {
    h.bytes = Buffer.from('altered endpoint data');
    expect((await adopt()).status).toBe(409);
    expect(await captures()).toEqual([]); expect(await audits()).toEqual([]);
  });

  it('does not capture missing bytes', async () => {
    h.missing = true; expect((await adopt()).status).toBe(410);
    expect(await captures()).toEqual([]); expect(await audits()).toEqual([]);
  });

  it('preserves the missing-checksum refusal', async () => {
    await f.pg.query('UPDATE file_uploads SET checksum_sha256=NULL WHERE id=$1 AND organization_id=$2', [uploadId, f.org]);
    const response = await adopt(); expect(response.status).toBe(409);
    expect(response.body.code).toBe('FILE_IDENTITY_UNKNOWN'); expect(await captures()).toEqual([]);
  });

  it.each(['path', 'checksum'])('rechecks the actual SQL %s after byte verification and before capture', async field => {
    // Ordered mutation in one PGlite instance exercises freshness/rollback;
    // it is not a second connection or a claim of concurrent lock behavior.
    h.beforeRead = async () => {
      const sql = field === 'path' ? 'UPDATE file_uploads SET storage_path=$1 WHERE id=$2 AND organization_id=$3'
        : 'UPDATE file_uploads SET checksum_sha256=$1 WHERE id=$2 AND organization_id=$3';
      await f.pg.query(sql, [field === 'path' ? `uploads/org-${f.org}/changed` : 'f'.repeat(64), uploadId, f.org]);
    };
    const response = await adopt(); expect(response.status).toBe(409);
    expect(response.body.code).toBe('FILE_CHANGED');
    expect(await captures()).toEqual([]); expect(await audits()).toEqual([]);
    const restored = (await f.pg.query<any>('SELECT storage_path,checksum_sha256 FROM file_uploads WHERE id=$1 AND organization_id=$2', [uploadId, f.org])).rows[0];
    expect(restored.storage_path).toBe(`uploads/org-${f.org}/${uploadId}`);
    expect(restored.checksum_sha256).toBe(sha256Hex(original));
  });

  it.each(['uploads/org-99999/foreign', 'uploads/unscoped/ownerless',
    'uploads/org-ORG/../org-99999/foreign', 'uploads/org-ORG/'])('does not capture a tenant-inconsistent storage path: %s', async candidate => {
    const storagePath = candidate.replace('org-ORG', `org-${f.org}`);
    await f.pg.query('UPDATE file_uploads SET storage_path=$1 WHERE id=$2 AND organization_id=$3', [storagePath, uploadId, f.org]);
    expect((await adopt()).status).toBe(404);
    expect(await captures()).toEqual([]); expect(await audits()).toEqual([]);
  });

  it('uses the real organization-wide eligibility predicate to refuse a withdrawn upload into another project', async () => {
    await f.apply('remove_data'); uploadId = f.upload;
    const otherProgram = randomUUID();
    await f.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [otherProgram, f.org]);
    expect((await adopt(otherProgram)).status).toBe(404);
    expect(await audits()).toEqual([]);
    const rows = await captures(); expect(rows).toHaveLength(1); expect(rows[0].id).toBe(f.capture);
  });
});
