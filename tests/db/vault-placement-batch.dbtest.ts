/**
 * Confirm suggested filings in bulk, with one reason (VR-11b, row D2).
 *
 * The classifier and AnA only suggest a folder; a person confirms it, and the
 * Vault counts only confirmed filings as filed. Confirming was one document at
 * a time. Here, on PostgreSQL as the runtime role with RLS on, through the
 * real route:
 *
 *   - without a reason the request is 422 and nothing changes;
 *   - with one, each document is confirmed with its own chained
 *     vault.document.file row carrying the reason, and placed by the person;
 *   - a document moved or confirmed since the list was loaded is refused
 *     CONFLICT and not touched, while the others commit, and the batch says
 *     complete:false;
 *   - a viewer is refused;
 *   - GET /:id counts the suggestions awaiting confirmation over the program.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr11b ';
const CODE = 'DBTEST-VR11B';
const REASON = 'Checked each against its study report';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let n = 0;

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = t.orgId;
    r.userRole = role;
    r.user = { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const confirm = async (body: Record<string, unknown>, role = 'admin') =>
  request(await appFor(mine, role)).post(`/api/c2c/project-vault/${mine.programId}/file-batch`).send(body);

/** A Vault document the classifier placed (the fixture is written as the owner; it is not under test). */
async function suggested(folderId: string | null, status = 'suggested'): Promise<string> {
  n += 1;
  const { rows } = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
       content_hash, s3_bucket, s3_key, file_name, folder_id, placement_status, placement_rationale)
     VALUES ($1, $2, $3, $4, 'REPORT', '1.0', $5, 'local', 'k', 'r.pdf', $6, $7, 'Looks like a nonclinical report.') RETURNING id`,
    [mine.programId, mine.orgId, `${CODE}-${n}`, `${PROBE}report ${n}`, createHash('sha256').update(`${CODE}-${n}`).digest('hex'), folderId, status],
  );
  return String(rows[0].id);
}

const placement = async (id: string) =>
  (await owner.query('SELECT folder_id, placement_status, placed_by, placement_rationale FROM vault.documents WHERE id = $1', [id])).rows[0];

const fileRows = async (id: string) =>
  (await owner.query(`SELECT user_id, new_values AS details FROM audit_logs WHERE action = 'vault.document.file' AND record_id = $1`, [id])).rows;

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action LIKE 'vault.document.%'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${CODE}%`],
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-vr11b@example.test', 'Connie Confirmer', 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, 'dbtest-vr11b')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}org`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Confirmo 5mg') RETURNING id`,
    [`${PROBE}program`, `${CODE}-P`, org.rows[0].id],
  );
  mine = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('Confirm N suggested (VR-11b)', () => {
  it('refuses without a reason, and changes nothing', async () => {
    const a = await suggested('module-4');
    for (const note of [undefined, '', 'short']) {
      const res = await confirm({ folderId: 'module-4', documentIds: [a], note });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('REASON_REQUIRED');
    }
    expect(await placement(a)).toMatchObject({ placement_status: 'suggested', placed_by: null });
    expect(await fileRows(a)).toHaveLength(0);
  });

  it('confirms each with one chained row carrying the reason, and names the person', async () => {
    const a = await suggested('module-4');
    const b = await suggested('module-4');
    const res = await confirm({ folderId: 'module-4', documentIds: [a, b], note: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      success: true,
      complete: true,
      items: [
        { documentId: a, outcome: 'confirmed', folderLabel: 'Module 4 · Nonclinical' },
        { documentId: b, outcome: 'confirmed', folderLabel: 'Module 4 · Nonclinical' },
      ],
    });
    for (const id of [a, b]) {
      expect(await placement(id)).toEqual({ folder_id: 'module-4', placement_status: 'confirmed', placed_by: userId, placement_rationale: REASON });
      const rows = await fileRows(id);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(userId);
      expect(rows[0].details).toMatchObject({
        rationale: REASON,
        from: { folderId: 'module-4', placementStatus: 'suggested' },
        to: { folderId: 'module-4', placementStatus: 'confirmed' },
      });
    }
  });

  it('a document moved or confirmed since the list was loaded is refused CONFLICT; the others commit', async () => {
    const a = await suggested('module-4');
    const moved = await suggested('module-4');
    const done = await suggested('module-4');
    // After the person loaded the list: one moved by someone else, one confirmed.
    await owner.query(`UPDATE vault.documents SET folder_id = 'module-5' WHERE id = $1`, [moved]);
    await owner.query(`UPDATE vault.documents SET placement_status = 'confirmed' WHERE id = $1`, [done]);
    const res = await confirm({ folderId: 'module-4', documentIds: [a, moved, done, 'not-a-document'], note: REASON });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { outcome: string; code?: string }) => i.code ?? i.outcome))
      .toEqual(['confirmed', 'CONFLICT', 'CONFLICT', 'INVALID_DOCUMENT_ID']);
    expect(res.body.complete).toBe(false);
    expect(await placement(moved)).toMatchObject({ folder_id: 'module-5', placement_status: 'suggested', placed_by: null });
    expect(await fileRows(moved)).toHaveLength(0);
    expect(await fileRows(done)).toHaveLength(0);
    expect(await placement(a)).toMatchObject({ placement_status: 'confirmed' });
  });

  it('a viewer is refused, and nothing changes', async () => {
    const a = await suggested('module-4');
    const res = await confirm({ folderId: 'module-4', documentIds: [a], note: REASON }, 'viewer');
    expect(res.status).toBe(403);
    expect(await placement(a)).toMatchObject({ placement_status: 'suggested' });
  });

  it('the Vault counts the suggestions awaiting confirmation over the program', async () => {
    const before = (await request(await appFor(mine)).get(`/api/c2c/project-vault/${mine.programId}`)).body.data;
    const waiting = (await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE program_id = $1 AND deleted_at IS NULL
          AND folder_id IS NOT NULL AND placement_status = 'suggested'`,
      [mine.programId],
    )).rows[0].n;
    expect(waiting).toBeGreaterThan(0);
    expect(before.awaitingConfirmationCount).toBe(waiting);
    // A suggestion with no folder is unfiled, not awaiting confirmation.
    await suggested(null, 'suggested');
    await suggested('module-3');
    const after = (await request(await appFor(mine)).get(`/api/c2c/project-vault/${mine.programId}`)).body.data;
    expect(after.awaitingConfirmationCount).toBe(waiting + 1);
  });
});
