/** Actual HTTP/admission and canonical profile SQL. Auth is synthetic; this
 * single-connection fixture does not qualify native RLS or live deployment. */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { projectIntelligenceProfiles, projectMemoryEntries } from '../../../../shared/schema';
import { createJourneyDb, extractTableDdl, makeRequestDbClient, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { runWithTenantScope } from '../../../db/tenantStore';

const h = vi.hoisted(() => ({ pool: null as unknown, globalReads: 0 }));
vi.mock('../../../db.js', () => ({ get pool() { return h.pool; }, db: { select: () => { h.globalReads++; throw new Error('Global fallback forbidden'); } } }));
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
let jdb: JourneyDb;
let app: express.Express;
let mode: 'profile-failure' | 'memory-failure' | 'role-change' | 'revocation' | 'workspace-change' | null = null;
const profileSql: string[] = [];
const get = (actor = 11, claim?: string) => {
  const req = request(app).get(`/api/c2c/projects/${PROGRAM}/intelligence`).set('x-actor', String(actor));
  return claim === undefined ? req : req.set('x-client-id', claim);
};

beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: [
    extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'concept2cure_artifacts']),
    extractTableDdl('db/migrations/20260401_project_sharing_visibility.sql', ['project_visibility_settings', 'project_members']),
    extractTableDdl('db/migrations/20260314_phase12_multi_user_review.sql', ['concept2cure_review_assignments']),
  ].join('\n'), migrations: [
    'migrations/20260524_program_workbench_schema.sql', 'migrations/20260814_projects_regulatory_program_anchor.sql',
    'migrations/20261001b_projects_one_anchor_per_program.sql',
  ] });
  // These push-surface tables have no creator migration. Derive column names
  // and SQL types from their actual canonical Drizzle schema. Embedding is
  // unrelated to the summary/count and omitted; no vector/constraint proof.
  for (const table of [projectIntelligenceProfiles, projectMemoryEntries]) {
    const config = getTableConfig(table);
    const columns = config.columns.filter(column => column.name !== 'embedding')
      .map(column => `"${column.name}" ${column.getSQLType()}`);
    await jdb.pglite.exec(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
  }
  h.pool = jdb.pool;
  await jdb.pglite.exec(`
    INSERT INTO organizations(id,name,slug) VALUES(1,'Sponsor','sponsor'),(2,'Foreign','foreign');
    INSERT INTO users(id,email,name,password_hash) VALUES(11,'lead@test.example','Lead','x'),(12,'reader@test.example','Reader','x');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(1,11,'member'),(1,12,'viewer');
    INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES(1,1,'Client','client'),(2,1,'Second','second'),(3,2,'Foreign','foreign');
    INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
      VALUES('${PROGRAM}',1,'Programme','PM','510k','device','FDA','Meter',11),('${FOREIGN}',2,'Foreign','FOR','IND','drug','FDA','Drug',11);
    INSERT INTO projects(id,organization_id,client_workspace_id,regulatory_program_id,name,type,owner_id,created_by_id,settings)
      VALUES(21,1,1,'${PROGRAM}','Programme','regulatory',11,11,'{"customInstructions":"Separate authored instructions"}'),
      (22,2,3,'${FOREIGN}','Foreign','regulatory',11,11,NULL);
    INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(21,1,'private');
    INSERT INTO project_members(project_id,organization_id,user_id,role) VALUES(21,1,12,'use');
  `);
  const { default: router } = await import('../projects');
  app = express();
  app.use((req, _res, next) => {
    const actor = Number(req.headers['x-actor'] ?? 11);
    const pinned = makeRequestDbClient(jdb.pglite);
    const client = { query: async (...args: Parameters<typeof pinned.query>) => {
      const sql = typeof args[0] === 'string' ? args[0] : (args[0] as { text: string }).text;
      const isProfile = sql.includes('from "project_intelligence_profiles"');
      const isMemory = sql.includes('from "project_memory_entries"');
      if (isProfile || isMemory) profileSql.push(sql);
      if (mode === 'profile-failure' && isProfile || mode === 'memory-failure' && isMemory) throw new Error('synthetic storage failure');
      const result = await pinned.query(...args);
      if (isProfile && mode === 'role-change') await jdb.pool.query("UPDATE organization_users SET role='viewer' WHERE user_id=11");
      if (isProfile && mode === 'revocation') await jdb.pool.query('DELETE FROM organization_users WHERE user_id=11');
      if (isProfile && mode === 'workspace-change') await jdb.pool.query('UPDATE projects SET client_workspace_id=2 WHERE id=21');
      return result;
    } };
    Object.assign(req, { user: { id: actor, userId: actor, organizationId: 1, role: 'manager' }, userId: actor,
      organizationId: 1, tenantId: 1, ...(req.headers['x-no-request-db'] ? {} : { dbClient: client }) });
    if (req.headers['x-no-scope']) next();
    else runWithTenantScope({ tenantId: '1', source: 'request', role: 'manager' }, next);
  });
  app.use('/api/c2c/projects', router);
}, 120_000);

beforeEach(async () => {
  mode = null; profileSql.length = 0; h.globalReads = 0;
  await jdb.pglite.exec(`
    DELETE FROM organization_users WHERE user_id=11;
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(1,11,'member');
    UPDATE users SET status='active' WHERE id=11;
    UPDATE projects SET client_workspace_id=1,status='active',regulatory_program_id='${PROGRAM}' WHERE id=21;
    UPDATE regulatory_programs SET deleted_at=NULL,status='draft' WHERE id='${PROGRAM}';
    UPDATE project_members SET status='active' WHERE project_id=21;
    DELETE FROM project_memory_entries; DELETE FROM project_intelligence_profiles;
    INSERT INTO project_intelligence_profiles(id,project_id,organization_id,regulatory_strategy,target_indication,target_population,
      custom_instructions,risk_factors,open_questions,key_decisions,learned_insights,last_enriched_at)
    VALUES(41,21,1,'Recorded strategy','Indication','Population','Profile instructions',
      '[{"risk":"Evidence gap","likelihood":"Not assessed","impact":"Unrecorded"}]',
      '[{"question":"Which comparator?","context":"Recorded question","priority":"high"}]',
      '[{"decision":"Use assay B","rationale":"Documented reasoning","date":"2026-10-01","source":"Study memo"}]',
      '[{"insight":"Recorded insight","source":"Source document","confidence":null,"extractedAt":"2026-10-02"}]','2026-10-03');
    INSERT INTO project_memory_entries(id,project_profile_id,project_id,organization_id,source_document_type)
      VALUES(1,41,21,1,NULL),(2,41,21,1,'application/pdf'),(3,41,21,1,'report_os_state'),(4,41,22,1,NULL),(5,41,21,2,NULL);
  `);
});
afterAll(async () => { if (jdb) { assertNoSchemaGaps(jdb); await jdb.close(); } });

describe('recorded profile read on the actual Projects route', () => {
  it('returns only saved profile facts bound to current actor/program/anchor/workspace, without global DB fallback', async () => {
    const res = await get(11, '1'); expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ programId: PROGRAM, projectId: 21, organizationId: 1, actorUserId: 11, clientWorkspaceId: 1,
      profile: { profileId: 41, regulatoryStrategy: 'Recorded strategy', customInstructions: 'Profile instructions',
        lastEnrichedAt: '2026-10-03T00:00:00.000Z' } });
    expect(Object.keys(res.body.data.profile).sort()).toEqual(['profileId','regulatoryStrategy','targetIndication','targetPopulation',
      'customInstructions','riskFactors','openQuestions','keyDecisions','learnedInsights','lastEnrichedAt'].sort());
    expect(res.body.data.profile.learnedInsights[0].confidence).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Separate authored instructions');
    expect(profileSql.length).toBe(2); expect(h.globalReads).toBe(0);
  });

  it('allows an admitted current reader without conferring a write or creating records', async () => {
    const res = await get(12); expect(res.status).toBe(200); expect(res.body.data.actorUserId).toBe(12);
    expect(res.body.meta).toBeUndefined();
    expect((await jdb.pool.query('SELECT count(*)::int AS n FROM project_intelligence_profiles')).rows).toEqual([{ n: 1 }]);
  });

  it('returns authoritative null without creating a missing profile', async () => {
    await jdb.pool.query('DELETE FROM project_intelligence_profiles');
    const res = await get(); expect(res.status).toBe(200); expect(res.body.data.profile).toBeNull(); expect(profileSql).toHaveLength(1);
    expect((await jdb.pool.query('SELECT count(*)::int AS n FROM project_intelligence_profiles')).rows).toEqual([{ n: 0 }]);
  });

  it('normalizes nullable saved lists while preserving nullable instruction absence', async () => {
    await jdb.pool.query('UPDATE project_intelligence_profiles SET custom_instructions=NULL,risk_factors=NULL,open_questions=NULL,key_decisions=NULL,learned_insights=NULL WHERE id=41');
    const res = await get(); expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ customInstructions: null, riskFactors: [], openQuestions: [], keyDecisions: [], learnedInsights: [] });
  });

  it('does not alter either profile records or the separate authored instructions', async () => {
    const sql = 'SELECT to_jsonb(p) AS saved,xmin::text AS tx FROM project_intelligence_profiles p ORDER BY id';
    const before = await jdb.pool.query(sql);
    expect((await get()).status).toBe(200);
    expect(await jdb.pool.query(sql)).toEqual(before);
    expect((await jdb.pool.query("SELECT settings->>'customInstructions' AS instructions FROM projects WHERE id=21")).rows)
      .toEqual([{ instructions: 'Separate authored instructions' }]);
  });

  it.each(['profile-failure', 'memory-failure'] as const)('refuses %s instead of reporting an empty profile', async failure => {
    mode = failure; const res = await get(); expect(res.status).toBe(503); expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('synthetic storage');
  });

  it('refuses duplicate profiles rather than selecting an arbitrary first row', async () => {
    await jdb.pool.query('INSERT INTO project_intelligence_profiles(id,project_id,organization_id) VALUES(42,21,1)');
    const res = await get(); expect(res.status).toBe(503); expect(res.body.data).toBeUndefined();
  });

  it.each([
    ['risk_factors', '{"risk":"not an array"}'], ['open_questions', '[{}]'],
    ['key_decisions', '[{"decision":"Missing rationale"}]'], ['learned_insights', '[{"insight":4}]'],
  ])('refuses malformed recorded %s rather than filtering it into absence', async (column, value) => {
    await jdb.pool.query(`UPDATE project_intelligence_profiles SET ${column}=$1 WHERE id=41`, [value]);
    const res = await get(); expect(res.status).toBe(503); expect(res.body.data).toBeUndefined();
  });
});

describe('canonical access and current read provenance', () => {
  it.each(['role-change', 'revocation', 'workspace-change'] as const)('discards the read after %s during profile SQL', async failure => {
    mode = failure; const res = await get(); expect([404, 503]).toContain(res.status); expect(res.body.data).toBeUndefined();
  });

  it('refuses a revoked private share, inactive actor, foreign UUID and missing anchor', async () => {
    await jdb.pool.query("UPDATE project_members SET status='revoked' WHERE user_id=12");
    expect((await get(12)).status).toBe(404);
    await jdb.pool.query("UPDATE users SET status='inactive' WHERE id=11"); expect((await get()).status).toBe(404);
    await jdb.pool.query("UPDATE users SET status='active' WHERE id=11");
    expect((await request(app).get(`/api/c2c/projects/${FOREIGN}/intelligence`)).status).toBe(404);
    await jdb.pool.query('UPDATE projects SET regulatory_program_id=NULL WHERE id=21');
    expect((await get()).status).toBe(409); expect(profileSql).toHaveLength(0);
  });

  it.each(['0','01','2147483648','2','3'])('refuses invalid or contradictory client consistency claim %s', async claim => {
    const res = await get(11, claim); expect([400,409]).toContain(res.status); expect(res.body.data).toBeUndefined();
    expect(profileSql).toHaveLength(0);
  });

  it('requires actual request ALS and request database with no fallback', async () => {
    expect((await get().set('x-no-scope','1')).status).toBe(503);
    expect((await get().set('x-no-request-db','1')).status).toBe(503);
    expect(h.globalReads).toBe(0); expect(profileSql).toHaveLength(0);
  });

  it('verifies owned saved workspace without imposing an active-workspace policy', async () => {
    await jdb.pool.query("UPDATE client_workspaces SET status='inactive' WHERE id=1");
    expect((await get()).status).toBe(200);
    await jdb.pool.query('UPDATE projects SET client_workspace_id=3 WHERE id=21');
    const res = await get(); expect(res.status).toBe(409); expect(res.body.data).toBeUndefined();
  });
});

describe('nullable historical project parent', () => {
  it('retains an authoritative null parent without selecting an arbitrary workspace', async () => {
    await jdb.pool.query('ALTER TABLE projects ALTER COLUMN client_workspace_id DROP NOT NULL');
    try {
      await jdb.pool.query('UPDATE projects SET client_workspace_id=NULL WHERE id=21');
      const res = await get(); expect(res.status).toBe(200); expect(res.body.data.clientWorkspaceId).toBeNull();
      expect((await get(11,'1')).status).toBe(409);
    } finally {
      await jdb.pool.query('UPDATE projects SET client_workspace_id=1 WHERE id=21');
      await jdb.pool.query('ALTER TABLE projects ALTER COLUMN client_workspace_id SET NOT NULL');
    }
  });
});

describe('canonical intelligence summary caller compatibility', () => {
  it('omits saved instructions from legacy summaries unless explicitly requested by the scoped adapter', async () => {
    const { getProjectIntelligence } = await import('../../../services/intelligence/project-intelligence-service');
    const database = jdb.db as Parameters<typeof getProjectIntelligence>[2];
    const legacy = await getProjectIntelligence(21, 1, database);
    expect(legacy?.regulatoryStrategy).toBe('Recorded strategy');
    if (!legacy) throw new Error('Expected recorded legacy summary');
    expect(Object.hasOwn(legacy, 'customInstructions')).toBe(false);
    const explicit = await getProjectIntelligence(21, 1, database, { includeProfileInstructions: true });
    expect(Object.hasOwn(explicit ?? {}, 'customInstructions')).toBe(true);
    expect(explicit?.customInstructions).toBe('Profile instructions');
  });

  it('scopes the existing count by profile/project/org and preserves the two-argument default caller', async () => {
    const { getProjectIntelligence } = await import('../../../services/intelligence/project-intelligence-service');
    const profile = await getProjectIntelligence(21, 1, jdb.db as Parameters<typeof getProjectIntelligence>[2], { includeProfileInstructions: true });
    expect(profile?.memoryEntryCount).toBe(2); expect(profile?.customInstructions).toBe('Profile instructions');
    await expect(getProjectIntelligence(21, 1)).rejects.toThrow('Global fallback forbidden'); expect(h.globalReads).toBe(1);
  });
});
