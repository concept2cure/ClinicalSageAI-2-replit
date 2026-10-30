/** Real HTTP, canonical profile writer/admission and chained audit on actual SQL.
 * PGlite does not qualify multi-connection locking or deployed authentication;
 * the retained native PostgreSQL packet owns those boundaries. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createJourneyDb, extractTableDdl, makeRequestDbClient, assertNoSchemaGaps, type JourneyDb,
} from '../../../../tests/golden-journeys/harness';
import { runWithTenantScope } from '../../../db/tenantStore';

const h = vi.hoisted(() => ({ pool: null as unknown, db: null as unknown }));
vi.mock('../../../db.js', () => ({ get pool() { return h.pool; }, get db() { return h.db; }, getPool: () => h.pool }));

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
let jdb: JourneyDb;
let app: express.Express;
let mode: 'commit' | 'rollback' | 'projection' | 'revoke' | null = null;
const releases: (Error | undefined)[] = [];
const statements: string[] = [];
const rows = async <R>(sql: string, params: unknown[] = []) => (await jdb.pool.query(sql, params)).rows as R[];
const settings = (actor = 11) => request(app).get(`/api/c2c/projects/${PROGRAM}/settings`).set('x-actor', String(actor));
const update = (body: Record<string, unknown>, actor = 11, claim = '1') => request(app).patch(`/api/c2c/projects/${PROGRAM}/settings`)
  .set('x-actor', String(actor)).set('x-client-id', claim).send(body);
const write = (revision: string, patch: unknown = { priority: 'high' }) => ({ revision, reason: 'Client requested this change.', patch });
async function saved() {
  return (await rows<{ description: string | null; priority: string; day: string | null }>(
    "SELECT description,priority,to_char(target_submission_date,'YYYY-MM-DD') AS day FROM regulatory_programs WHERE id=$1", [PROGRAM]))[0];
}
async function auditCount() { return (await rows<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs'))[0].n; }

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: [
      extractTableDdl('migrations/0000_sweet_joseph.sql', [
        'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs', 'concept2cure_artifacts',
      ]),
      extractTableDdl('db/migrations/20260401_project_sharing_visibility.sql', ['project_visibility_settings', 'project_members']),
      extractTableDdl('db/migrations/20260314_phase12_multi_user_review.sql', ['concept2cure_review_assignments']),
    ].join('\n'),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      'migrations/20261001b_projects_one_anchor_per_program.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = {
    query: jdb.pool.query,
    connect: async () => {
      const client = await jdb.pool.connect();
      return {
        query: async (query: unknown, params?: unknown[]) => {
          const sql = typeof query === 'string' ? query : (query as { text: string }).text;
          statements.push(sql);
          if (mode === 'projection' && sql.includes('xmin::text') && statements.some(statement => statement.includes('INSERT INTO audit_logs'))) {
            throw new Error('saved projection unavailable after actual profile and audit writes');
          }
          const result = await client.query(query as string, params);
          if (mode === 'revoke' && sql === 'BEGIN') await jdb.pool.query('DELETE FROM organization_users WHERE user_id=11');
          if (mode === 'commit' && sql === 'COMMIT') throw new Error('actual commit acknowledged by server, reply lost');
          if (mode === 'rollback' && sql === 'ROLLBACK') throw new Error('actual rollback reply lost');
          return result;
        },
        release: (error?: Error) => { releases.push(error); client.release(); },
      };
    },
  };
  await jdb.pglite.exec(`
    INSERT INTO organizations(id,name,slug) VALUES (1,'Sponsor','sponsor'),(2,'Foreign','foreign');
    INSERT INTO users(id,email,name,password_hash) VALUES
      (11,'lead@test.example','Lead','x'),(12,'manager@test.example','Manager','x'),
      (13,'member@test.example','Member','x'),(14,'viewer@test.example','Viewer','x');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES
      (1,11,'member'),(1,12,'manager'),(1,13,'member'),(1,14,'viewer');
    INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES
      (1,1,'Client','client'),(2,1,'Second','second'),(3,2,'Foreign','foreign');
    INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,description,priority,target_submission_date)
      VALUES ('${PROGRAM}',1,'Programme','PM06','510k','device','FDA','Meter',11,'Original','medium','2030-03-04'),
      ('${FOREIGN}',2,'Foreign programme','FOREIGN','510k','device','FDA','Other',11,'Foreign description','low',NULL);
    INSERT INTO projects(id,organization_id,client_workspace_id,regulatory_program_id,name,type,owner_id,created_by_id)
      VALUES (21,1,1,'${PROGRAM}','Programme','regulatory',11,11),(22,2,3,'${FOREIGN}','Foreign programme','regulatory',11,11);
    INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES (21,1,'private');
    INSERT INTO project_members(project_id,organization_id,user_id,role) VALUES (21,1,13,'edit'),(21,1,14,'use');
    CREATE FUNCTION pm06_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN IF NEW.reason='Force audit failure.' THEN RAISE EXCEPTION 'audit refusal'; END IF; RETURN NEW; END $f$;
    CREATE TRIGGER pm06_refuse_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pm06_refuse_audit();
  `);
  const { default: router } = await import('../projects');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = Number(req.headers['x-actor'] ?? 11);
    Object.assign(req, { user: { id: actor, userId: actor, organizationId: 1, role: 'manager' },
      userId: actor, organizationId: 1, tenantId: 1, dbClient: makeRequestDbClient(jdb.pglite) });
    runWithTenantScope({ tenantId: '1', source: 'request', role: 'manager' }, next);
  });
  app.use('/api/c2c/projects', router);
}, 120_000);

beforeEach(async () => {
  mode = null;
  releases.length = 0;
  statements.length = 0;
  await jdb.pglite.exec(`
    UPDATE regulatory_programs SET description='Original',priority='medium',target_submission_date='2030-03-04',
      lead_user_id=11,status='draft',deleted_at=NULL,updated_at=now() WHERE id='${PROGRAM}';
    UPDATE projects SET client_workspace_id=1,status='active' WHERE id=21;
    UPDATE client_workspaces SET status='active' WHERE id=1;
    DELETE FROM organization_users WHERE user_id=11;
    INSERT INTO organization_users(organization_id,user_id,role) VALUES (1,11,'member');
    UPDATE users SET status='active' WHERE id=11;
    UPDATE project_members SET status='active' WHERE project_id=21;
    DELETE FROM audit_logs;
  `);
});
afterAll(async () => { if (jdb) { assertNoSchemaGaps(jdb); await jdb.close(); } });

describe('governed programme settings over HTTP and actual SQL', () => {
  it('reads saved scope and a bound revision, deriving current mutation authority', async () => {
    const res = await settings();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ programId: PROGRAM, projectId: 21, organizationId: 1, actorUserId: 11,
      clientWorkspaceId: 1, canChange: true, revision: expect.stringMatching(/^v1:[a-f0-9]{64}$/),
      description: 'Original', priority: 'medium', targetSubmissionDate: '2030-03-04' });
    const editShare = await settings(13);
    expect(editShare.status).toBe(200); expect(editShare.body.data.canChange).toBe(false);
    const viewer = await settings(14);
    expect(viewer.status).toBe(200); expect(viewer.body.data.canChange).toBe(false);
    const manager = await settings(12);
    expect(manager.status).toBe(200); expect(manager.body.data.canChange).toBe(true);
  });

  it('saves the three normalized fields and actual chained reason/before/after receipt atomically', async () => {
    const initial = (await settings()).body.data;
    const res = await update(write(initial.revision, { description: '  Revised purpose  ', priority: 'critical', targetSubmissionDate: '2032-02-29' }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ ...initial, description: 'Revised purpose', priority: 'critical', targetSubmissionDate: '2032-02-29', revision: expect.any(String) });
    expect(res.body.data.revision).not.toBe(initial.revision);
    expect(res.body.meta).toEqual({ auditTrail: { persisted: true, chained: true }, changedFields: ['description', 'priority', 'targetSubmissionDate'] });
    expect(await saved()).toEqual({ description: 'Revised purpose', priority: 'critical', day: '2032-02-29' });
    const [audit] = await rows<{ actor_id: number; reason: string; sha256_chain: string; payload_hash: string; details: Record<string, unknown> }>(
      'SELECT actor_id,reason,sha256_chain,payload_hash,new_values AS details FROM audit_logs');
    expect(audit.actor_id).toBe(11); expect(audit.reason).toBe('Client requested this change.');
    expect(audit.sha256_chain).toMatch(/^[a-f0-9]{64}$/); expect(audit.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.details).toMatchObject({ reason: audit.reason, projectId: 21, clientWorkspaceId: 1,
      revisionBefore: initial.revision, revisionAfter: res.body.data.revision,
      before: { description: 'Original', priority: 'medium' }, after: { description: 'Revised purpose', priority: 'critical' } });
    const firstUpdateLock = statements.findIndex(sql => sql.includes('FOR UPDATE'));
    const firstShareLock = statements.findIndex(sql => sql.includes('FOR SHARE'));
    expect(firstUpdateLock).toBeGreaterThan(-1); expect(firstUpdateLock).toBeLessThan(firstShareLock);
    expect(statements.at(-1)).toBe('COMMIT'); expect(releases).toEqual([undefined]);
  });

  it('clears optional values and writes only actual differences', async () => {
    const initial = (await settings()).body.data;
    const res = await update(write(initial.revision, { description: '  ', priority: 'medium', targetSubmissionDate: null }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.description).toBeNull(); expect(res.body.data.targetSubmissionDate).toBeNull();
    expect(res.body.meta.changedFields).toEqual(['description', 'targetSubmissionDate']);
    expect(await auditCount()).toBe(1);
  });

  it('preserves a recorded calendar day in year 0001 through the canonical writer', async () => {
    const revision = (await settings()).body.data.revision;
    const res = await update(write(revision, { targetSubmissionDate: '0001-01-01' }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.targetSubmissionDate).toBe('0001-01-01');
    expect((await saved()).day).toBe('0001-01-01');
  });

});

describe('strict settings and stale-edit refusals', () => {
  it.each([
    {}, { description: 3 }, { priority: 'urgent' }, { targetSubmissionDate: '2030-02-29' },
    { targetSubmissionDate: '0000-01-01' }, { targetSubmissionDate: '2030-3-04' },
    { name: 'Changed' }, { leadUserId: 13 }, { status: 'archived' }, { metadata: {} }, { clientWorkspaceId: 2 },
  ])('refuses strict, forbidden or invalid patches: %j', async patch => {
    const revision = (await settings()).body.data?.revision ?? 'v1:' + 'a'.repeat(64);
    const res = await update(write(revision, patch));
    expect(res.status).toBe(400); expect(await saved()).toEqual({ description: 'Original', priority: 'medium', day: '2030-03-04' });
    expect(await auditCount()).toBe(0);
  });

  it('refuses unknown envelope fields, short reason and malformed revision', async () => {
    const revision = (await settings()).body.data?.revision ?? 'v1:' + 'a'.repeat(64);
    for (const body of [{ ...write(revision), ownerId: 13 }, { ...write(revision), reason: 'short' }, write('not-a-revision')]) {
      expect((await update(body)).status).toBe(400);
    }
    expect(await auditCount()).toBe(0);
  });

  it('refuses an unchanged-only patch and a retired revision without audit', async () => {
    const revision = (await settings()).body.data.revision;
    expect((await update(write(revision, { description: ' Original ', priority: 'medium' }))).status).toBe(409);
    await jdb.pool.query('UPDATE regulatory_programs SET description=$1 WHERE id=$2', ['External change', PROGRAM]);
    const stale = await update(write(revision));
    expect(stale.status).toBe(409); expect(stale.body.error).toBe('PROJECT_SETTINGS_STALE');
    expect(await auditCount()).toBe(0);
  });

  it('retires revisions when the canonical workspace changes', async () => {
    const revision = (await settings()).body.data.revision;
    await jdb.pool.query('UPDATE projects SET client_workspace_id=2 WHERE id=21');
    const res = await update(write(revision), 11, '2');
    expect(res.status).toBe(409); expect(res.body.error).toBe('PROJECT_SETTINGS_STALE');
    expect(await auditCount()).toBe(0);
  });

  it.each(['2', '3', '0', '2147483648', '1.0', '01', 'null'])('refuses malformed or mismatched client claim %s', async claim => {
    const revision = (await settings()).body.data.revision;
    expect([400, 409]).toContain((await update(write(revision), 11, claim)).status);
    expect(await auditCount()).toBe(0);
  });

});

describe('current admission and honest transaction outcomes', () => {
  it('uses current lead/role/active membership and rejects a share edit as program management', async () => {
    const revision = (await settings()).body.data.revision;
    expect((await update(write(revision), 13)).status).toBe(403);
    await jdb.pool.query("UPDATE organization_users SET role='viewer' WHERE user_id=11");
    expect((await settings()).body.data.canChange).toBe(false);
    expect((await update(write(revision))).status).toBe(403);
    await jdb.pool.query("UPDATE organization_users SET role='member' WHERE user_id=11");
    await jdb.pool.query('UPDATE regulatory_programs SET lead_user_id=13 WHERE id=$1', [PROGRAM]);
    expect((await update(write(revision))).status).toBe(403);
    await jdb.pool.query('UPDATE users SET status=$1 WHERE id=11', ['inactive']);
    expect((await settings()).status).toBe(404);
    expect(await auditCount()).toBe(0);
  });

  it('rechecks actor admission inside the owned transaction', async () => {
    const revision = (await settings()).body.data.revision;
    mode = 'revoke';
    const res = await update(write(revision));
    expect(res.status).toBe(403); expect(await auditCount()).toBe(0);
    expect((await saved()).priority).toBe('medium'); expect(statements.at(-1)).toBe('ROLLBACK');
  });

  it('keeps archived programs read-only without adding an inactive-workspace policy', async () => {
    await jdb.pool.query("UPDATE client_workspaces SET status='inactive' WHERE id=1");
    expect((await settings()).status).toBe(200);
    await jdb.pool.query("UPDATE regulatory_programs SET status='archived' WHERE id=$1", [PROGRAM]);
    const res = await settings(); expect(res.status).toBe(200); expect(res.body.data.canChange).toBe(false);
    expect((await update(write(res.body.data.revision))).status).toBe(409);
    expect(await auditCount()).toBe(0);
  });

  it('conceals a foreign program and refuses an unresolved foreign workspace relationship', async () => {
    expect((await request(app).get(`/api/c2c/projects/${FOREIGN}/settings`)).status).toBe(404);
    await jdb.pool.query('UPDATE projects SET client_workspace_id=3 WHERE id=21');
    expect((await settings()).status).toBe(409);
    expect(await auditCount()).toBe(0);
  });

  it('fails unavailable for unverifiable saved values instead of inventing a priority', async () => {
    await jdb.pool.query('UPDATE regulatory_programs SET priority=NULL WHERE id=$1', [PROGRAM]);
    const res = await settings(); expect(res.status).toBe(503); expect(res.body.data).toBeUndefined();
  });

  it('retires private read access when a saved share is revoked', async () => {
    expect((await settings(13)).status).toBe(200);
    await jdb.pool.query("UPDATE project_members SET status='revoked' WHERE project_id=21 AND user_id=13");
    expect((await settings(13)).status).toBe(404);
  });

  it('preserves the canonical open role vocabulary for a current programme lead', async () => {
    await jdb.pool.query("UPDATE organization_users SET role='regulatory_scientist' WHERE user_id=11");
    const initial = (await settings()).body.data;
    expect(initial.canChange).toBe(true);
    expect((await update(write(initial.revision))).status).toBe(200);
  });

  it('rolls the actual profile update back when the canonical audit insert fails', async () => {
    const revision = (await settings()).body.data.revision;
    const res = await update({ ...write(revision), reason: 'Force audit failure.' });
    expect(res.status).toBe(503); expect((await saved()).priority).toBe('medium'); expect(await auditCount()).toBe(0);
    expect(statements.at(-1)).toBe('ROLLBACK'); expect(releases).toEqual([undefined]);
  });

  it('rolls profile and audit back if the final saved receipt cannot be read before COMMIT', async () => {
    const revision = (await settings()).body.data.revision; mode = 'projection';
    const res = await update(write(revision));
    expect(res.status).toBe(503); expect((await saved()).priority).toBe('medium'); expect(await auditCount()).toBe(0);
    expect(statements.some(sql => sql.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(statements.at(-1)).toBe('ROLLBACK'); expect(releases).toEqual([undefined]);
  });

  it('reports uncertainty after actual COMMIT with a lost reply and discards once without subsequent SQL', async () => {
    const revision = (await settings()).body.data.revision; mode = 'commit';
    const res = await update(write(revision));
    expect(res.status).toBe(503); expect(res.body.error).toBe('PROJECT_SETTINGS_OUTCOME_UNKNOWN');
    expect((await saved()).priority).toBe('high'); expect(await auditCount()).toBe(1);
    expect(statements.at(-1)).toBe('COMMIT'); expect(releases).toHaveLength(1); expect(releases[0]).toBeInstanceOf(Error);
  });

  it('reports uncertainty when rollback acknowledgement is lost, and never reuses that connection', async () => {
    const revision = (await settings()).body.data.revision; mode = 'rollback';
    const res = await update({ ...write(revision), reason: 'Force audit failure.' });
    expect(res.status).toBe(503); expect(res.body.error).toBe('PROJECT_SETTINGS_OUTCOME_UNKNOWN');
    expect(statements.at(-1)).toBe('ROLLBACK'); expect(releases).toHaveLength(1); expect(releases[0]).toBeInstanceOf(Error);
    expect((await saved()).priority).toBe('medium'); expect(await auditCount()).toBe(0);
  });
});

describe('nullable legacy canonical workspace', () => {
  it('retains a null parent without a resolver fallback and refuses any supplied client claim', async () => {
    // Test only: historical nullable deployments are permitted by the wire;
    // current baseline's NOT NULL is restored after this compatibility case.
    await jdb.pool.query('ALTER TABLE projects ALTER COLUMN client_workspace_id DROP NOT NULL');
    try {
      await jdb.pool.query('UPDATE projects SET client_workspace_id=NULL WHERE id=21');
      const initial = await settings(); expect(initial.status).toBe(200); expect(initial.body.data.clientWorkspaceId).toBeNull();
      expect((await update(write(initial.body.data.revision))).status).toBe(409);
      const res = await request(app).patch(`/api/c2c/projects/${PROGRAM}/settings`).send(write(initial.body.data.revision));
      expect(res.status, JSON.stringify(res.body)).toBe(200); expect(res.body.data.clientWorkspaceId).toBeNull();
      expect(await auditCount()).toBe(1);
    } finally {
      await jdb.pool.query('UPDATE projects SET client_workspace_id=1 WHERE id=21');
      await jdb.pool.query('ALTER TABLE projects ALTER COLUMN client_workspace_id SET NOT NULL');
    }
  });
});
