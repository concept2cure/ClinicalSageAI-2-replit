/** Real JWT/HTTP and canonical SQL. The small outer gate models the deployed
 * global auth's uncached membership read; the authoring router and object gate
 * are production code. Native PostgreSQL/RLS is verified separately. */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, JWT_SECRET, ORG, OTHER_ORG, PREREQ, PROGRAM, asToken } from './_authoring-canvas-fixture';
import { runWithTenantScope } from '../../db/tenantStore';
import { verifyJwtWithRotation } from '../../utils/jwtVerify';
import { authoringObjectAuthorization } from '../../middleware/authoringObjectAuthorization';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
const DOC = '91e015d1-cd64-4840-a122-181b2588df0a';
const SECTION = '92082bcf-4520-4314-b3c6-d08f4df5fc1a';
const FOREIGN_SECTION = '93fd86ab-d695-4b5a-ac67-06bd8739ddec';
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL, migrations: [
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
  ] });
  h.db = db.db; h.pool = db.pool;
  await db.pool.query(`UPDATE organization_users SET role='admin' WHERE organization_id=$1 AND user_id=$2`, [ORG, Number(AUTHOR.id)]);
  await db.pool.query(`INSERT INTO authoring_documents (id,title,module,status,created_by,tenant_id) VALUES
    ($1,'Current role document','M1','draft',$2,$3),('94579d8d-7742-495a-a631-80e34a03ea98','Foreign','M1','draft',$2,$4)`, [DOC, AUTHOR.id, ORG, OTHER_ORG]);
  await db.pool.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,tenant_id) VALUES
    ($1,$2,'1.1','Owned section','<p>Original saved record</p>',$3),
    ($4,'94579d8d-7742-495a-a631-80e34a03ea98','1.1','Foreign section','Foreign record',$5)`, [SECTION, DOC, ORG, FOREIGN_SECTION, OTHER_ORG]);
  const token = await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role: 'admin', roles: ['ADMIN'], type: 'access' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET));
  author = asToken(token);
  const { default: router } = await import('../authoring.router');
  app = express(); app.use(express.json());
  app.use((req, res, next) => {
    const claims = verifyJwtWithRotation(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')) as Record<string, unknown>;
    void db.pool.query('SELECT role FROM organization_users WHERE user_id=$1 AND organization_id=$2', [claims.userId, claims.organizationId]).then(result => {
      if (result.rows.length !== 1) { res.status(403).json({ error: 'CURRENT_MEMBERSHIP_REQUIRED' }); return; }
      const role = String((result.rows[0] as { role: string }).role);
      Object.assign(req, { dbClient: db.pool, userRole: role,
        identity: { legacyUserId: Number(claims.userId), organizationId: Number(claims.organizationId), role },
        user: { id: claims.userId, userId: claims.userId, email: claims.email, organizationId: claims.organizationId, role, roles: [role] } });
      runWithTenantScope({ tenantId: String(ORG), role, source: 'request', caller: 'current-role-route-test' }, next);
    }).catch(next);
  });
  app.use('/api', authoringObjectAuthorization);
  app.use('/api/authoring', router);
}, 180_000);
afterAll(async () => { await db?.close(); });

async function snapshot() {
  return (await db.pool.query(`SELECT (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM authoring_sections s) AS sections,
    (SELECT count(*) FROM authoring_documents)::int AS docs,(SELECT count(*) FROM doc_revisions)::int AS revisions,
    (SELECT count(*) FROM authoring_audit_trail)::int AS audits,(SELECT count(*) FROM doc_permissions)::int AS permissions`)).rows[0];
}
const patch = (sectionId = SECTION) => author(request(app).patch(`/api/authoring/sections/${sectionId}`))
  .send({ content: '<p>Edited record</p>', changeReason: 'Verify current authoring authority.' });

describe('current membership is the write ceiling for an existing document owner', () => {
  it.each(['viewer', 'readonly', 'read_only', 'guest'])('%s refuses save despite an old admin JWT and OWNER grants', async role => {
    await db.pool.query('UPDATE organization_users SET role=$1 WHERE user_id=$2 AND organization_id=$3', [role, AUTHOR.id, ORG]);
    const before = await snapshot();
    try {
      const saved = await patch();
      expect(saved.status, JSON.stringify(saved.body)).toBe(403);
      expect(saved.body.error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
      const read = await author(request(app).get(`/api/authoring/docs/${DOC}/sections`));
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      expect(read.body.sections[0].content).toBe('<p>Original saved record</p>');
      expect(await snapshot()).toEqual(before);
    } finally { await db.pool.query("UPDATE organization_users SET role='admin' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]); }
  });

  it.each(['/api/authoring/docs', '/api/authoring/docs/from-draft'])('a current viewer cannot create via %s with an old admin JWT', async url => {
    await db.pool.query("UPDATE organization_users SET role='viewer' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]);
    const before = await snapshot();
    try {
      const created = await author(request(app).post(url)).send({ title: 'Read-only create must refuse', module: 'M1', client_program_id: PROGRAM,
        programId: PROGRAM, documentType: 'clinical_overview', sections: [{ code: '1.1', title: 'Draft', content: '<p>Read-only text must not be created.</p>' }],
        provenance: { source: 'ana', conversationId: 'local-denial-proof' } });
      expect(created.status, JSON.stringify(created.body)).toBe(403);
      expect(created.body.error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
      expect(await snapshot()).toEqual(before);
    } finally { await db.pool.query("UPDATE organization_users SET role='admin' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]); }
  });

  it('does not promote a current member using stale admin claims after object grants are revoked', async () => {
    await db.pool.query("UPDATE organization_users SET role='member' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]);
    await db.pool.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1', [DOC]);
    const before = await snapshot();
    try { expect((await patch()).status).toBe(403); expect(await snapshot()).toEqual(before); }
    finally {
      await db.pool.query('UPDATE doc_permissions SET revoked_at=NULL WHERE doc_id=$1', [DOC]);
      await db.pool.query("UPDATE organization_users SET role='admin' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]);
    }
  });

  it('keeps foreign-tenant records unavailable even to an administrator', async () => {
    const before = await snapshot();
    expect((await patch(FOREIGN_SECTION)).status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it('keeps sealed records immutable for a current administrator', async () => {
    await db.pool.query("UPDATE authoring_documents SET status='FROZEN' WHERE id=$1", [DOC]);
    const before = await snapshot();
    try { expect((await patch()).status).toBe(409); expect(await snapshot()).toEqual(before); }
    finally { await db.pool.query("UPDATE authoring_documents SET status='draft' WHERE id=$1", [DOC]); }
  });

  it('allows the current member with an existing AUTHOR grant to save', async () => {
    await db.pool.query("UPDATE organization_users SET role='member' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]);
    try {
      const before = await snapshot() as { revisions: number; audits: number };
      const response = await patch();
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const after = await snapshot() as { revisions: number; audits: number };
      expect(after.revisions).toBe(before.revisions + 1); expect(after.audits).toBe(before.audits + 1);
    } finally { await db.pool.query("UPDATE organization_users SET role='admin' WHERE user_id=$1 AND organization_id=$2", [AUTHOR.id, ORG]); }
  });
});
