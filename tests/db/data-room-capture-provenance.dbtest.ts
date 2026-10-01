/**
 * The data room's capture record says who captured a file, and the capture is
 * in the audit chain (VR-16b, rows D2 and D5; plan critique 14).
 *
 * Until now a file captured into a project's data room was recorded with no
 * person, and neither its capture nor a re-capture's retirement of it reached
 * the per-tenant audit chain. Here, on PostgreSQL as the runtime role with RLS
 * on:
 *
 *   - a file attached in chat with a project open is recorded with
 *     created_by = the session's user, and one chained data_room.capture row
 *     names the person, the bytes, the upload and the project;
 *   - a re-capture writes its own capture row naming what it supersedes, and a
 *     data_room.supersede row on the retired capture naming its successor;
 *   - a failed audit write rolls the capture back: no capture without its row;
 *   - created_by and stored_artifact_ref are write-once;
 *   - a system source (an ingested CRL) writes no data-room row (control).
 *
 * Filing a capture into the Vault names the capture in the ingest's row; that
 * case is in tests/db/vault-data-room-file.dbtest.ts.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';

/* The chained writer, real unless a case asks it to fail once. */
const failNext = vi.hoisted(() => ({ on: false }));
vi.mock('../../server/services/auditService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/services/auditService')>();
  return {
    ...real,
    writeChainedAuditRow: async (...args: Parameters<typeof real.writeChainedAuditRow>) => {
      if (failNext.on) {
        failNext.on = false;
        throw new Error('injected audit write failure');
      }
      return real.writeChainedAuditRow(...args);
    },
  };
});

const PROBE = 'dbtest-vr16b ';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

let owner: Pool;
let org: { id: number; uuid: string };
let userId: number;
let programId: string;
let app: express.Express;

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

async function asTenant<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  return runWithTenantScope(
    { tenantId: String(org.id), orgUuid: org.uuid, role: 'member', source: 'request', caller: 'tests/db/data-room-capture-provenance.dbtest.ts' },
    () => fn(pool as unknown as Q),
  );
}

const rowsFor = async (recordId: number | string, action: string) =>
  (await owner.query(
    `SELECT user_id, new_values, sha256_chain FROM audit_logs WHERE action = $1 AND record_id = $2 AND tenant_id = $3`,
    [action, String(recordId), org.id],
  )).rows;

const capture = (title: string, checksum: string, extra: Record<string, unknown> = {}) => ({
  sourceType: 'client_document' as const,
  visibilityClass: 'project_private' as const,
  clientProgramId: programId,
  title: `${PROBE}${title}`,
  storedArtifactRef: `uploads/org-${org.id}/${title}`,
  checksum,
  ingestionStatus: 'ingested' as const,
  provenance: { origin: 'chat_upload', fileUploadId: `file_1_${title}`, uploadedByUserId: userId },
  ...extra,
});

/**
 * This organization's audit rows, removed as the owner with the delete guard
 * lifted inside one transaction: before the suite, so a chain left by an
 * earlier run (a mutant run writes rows outside a transaction) does not break
 * the store-wide verifier other suites read, and after it.
 */
async function clearOwnChain(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('DELETE FROM audit_logs WHERE tenant_id = $1', [org.id]);
    await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('COMMIT');
  } catch {
    await c.query('ROLLBACK').catch(() => {});
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const o = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, 'dbtest-vr16b')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}org`],
  );
  org = { id: Number(o.rows[0].id), uuid: String(o.rows[0].uuid) };
  await clearOwnChain();
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-vr16b@example.test', 'Cara Capturer', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(u.rows[0].id);
  await owner.query(`DELETE FROM regulatory_programs WHERE name LIKE $1`, [`${PROBE}%`]);
  const p = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'DBTEST-VR16B', $2, 'ind', 'drug', 'FDA', 'Capto 5mg') RETURNING id`,
    [`${PROBE}program`, org.id],
  );
  programId = String(p.rows[0].id);

  const { default: chatRouter } = await import('../../server/routes/chat');
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: org.id, userRole: 'member',
      user: { id: userId, organizationId: org.id, organizationUuid: org.uuid, role: 'member' },
    });
    next();
  });
  app.use(establishRequestTenantScope);
  app.use('/api/chat', chatRouter);
}, 60_000);

afterAll(async () => {
  // As the table's owner, the one role the capture guard lets delete.
  await owner.query('DELETE FROM cre_evidence_sources WHERE organization_id = $1 AND previous_version_id IS NOT NULL', [org.id]).catch(() => {});
  await owner.query('DELETE FROM cre_evidence_sources WHERE organization_id = $1', [org.id]).catch(() => {});
  await owner.query('DELETE FROM file_uploads WHERE organization_id = $1', [org.id]).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]).catch(() => {});
  await clearOwnChain();
  await owner.end().catch(() => {});
});

describe('a capture names who made it, in the chain (VR-16b)', () => {
  it('a file attached in chat with the project open is recorded with its capturer and a chained capture row', async () => {
    const bytes = Buffer.from(`${PROBE}stability summary: impurity B 0.31% at T12.\n`, 'utf8');
    const res = await request(app)
      .post('/api/chat/upload')
      .field('projectId', programId)
      .attach('file', bytes, 'vr16b-stability-note.txt');
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const sourceId = Number(res.body.sourceId);
    expect(sourceId).toBeGreaterThan(0);

    const row = (await owner.query('SELECT created_by, checksum FROM cre_evidence_sources WHERE id = $1', [sourceId])).rows[0];
    expect(row).toEqual({ created_by: userId, checksum: sha(bytes) });
    const audit = await rowsFor(sourceId, 'data_room.capture');
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(userId);
    expect(audit[0].sha256_chain).toBeTruthy();
    expect(audit[0].new_values).toMatchObject({
      checksum: sha(bytes), clientProgramId: programId, origin: 'chat_upload', fileUploadId: res.body.fileId,
      capturedBy: userId, supersedes: null,
    });
  });

  it('a re-capture names what it supersedes, and the retired capture names its successor', async () => {
    const { createSource, createSupersedingSource } = await import('../../server/services/clinical-regulatory-evidence/evidence-spine.service');
    const first = await asTenant(() => createSource(org.id, capture('v1', sha('v1'))));
    const { source: second } = await asTenant(() => createSupersedingSource(org.id, capture('v2', sha('v2')), first.id));
    expect((await rowsFor(second.id, 'data_room.capture'))[0].new_values).toMatchObject({ supersedes: first.id, capturedBy: userId });
    const retired = await rowsFor(first.id, 'data_room.supersede');
    expect(retired).toHaveLength(1);
    expect(retired[0]).toMatchObject({ user_id: userId, new_values: { supersededBy: second.id, successorChecksum: sha('v2') } });
  });

  it('a failed audit write rolls the capture back', async () => {
    const { createSource } = await import('../../server/services/clinical-regulatory-evidence/evidence-spine.service');
    failNext.on = true;
    await expect(asTenant(() => createSource(org.id, capture('lost', sha('lost'))))).rejects.toThrow(/injected audit write failure/);
    expect((await owner.query('SELECT 1 FROM cre_evidence_sources WHERE checksum = $1', [sha('lost')])).rows).toHaveLength(0);
  });

  it('who captured a file, and where its bytes are stored, cannot be changed', async () => {
    const { createSource } = await import('../../server/services/clinical-regulatory-evidence/evidence-spine.service');
    const s = await asTenant(() => createSource(org.id, capture('frozen', sha('frozen'))));
    await expect(asTenant((q) => q.query('UPDATE cre_evidence_sources SET created_by = $1 WHERE id = $2', [userId + 1, s.id]))).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(asTenant((q) => q.query(`UPDATE cre_evidence_sources SET stored_artifact_ref = 'uploads/elsewhere' WHERE id = $1`, [s.id]))).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('control: a system source writes no data-room row and names no capturer', async () => {
    const { createSource } = await import('../../server/services/clinical-regulatory-evidence/evidence-spine.service');
    const s = await asTenant(() => createSource(org.id, {
      sourceType: 'fda_crl', visibilityClass: 'tenant_private', title: `${PROBE}crl`, checksum: sha('crl'),
    }));
    expect((await owner.query('SELECT created_by FROM cre_evidence_sources WHERE id = $1', [s.id])).rows[0].created_by).toBeNull();
    expect(await rowsFor(s.id, 'data_room.capture')).toHaveLength(0);
  });
});
