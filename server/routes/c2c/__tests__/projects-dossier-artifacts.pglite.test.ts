/** Real project admission + aggregate SQL, including a same-UUID anchor remap. */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as unknown as PGlite, remap: false, clientChange: false,
  revoke: false, beforeReadRemap: false, anchorReads: 0, artifactReads: 0,
  trackingReads: 0, trackingRemap: false, trackingError: null as string | null }));
async function query(sql: string, params?: unknown[]) {
  if (/FROM project_sections ps/.test(sql) && h.trackingError) throw Object.assign(new Error('tracking read failed'), { code: h.trackingError });
  const result = await h.pg.query(sql, params);
  if (/SELECT id, client_workspace_id AS "clientWorkspaceId" FROM projects/.test(sql)) {
    h.anchorReads++;
  }
  if (h.beforeReadRemap && h.anchorReads === 1 && /FROM projects p LEFT JOIN project_visibility_settings/.test(sql)) {
    await h.pg.query('UPDATE projects SET id=99 WHERE id=41');
  }
  if (/FROM concept2cure_artifacts\s+WHERE/.test(sql)) {
    h.artifactReads++;
    if (h.remap) await h.pg.query('UPDATE projects SET id=99 WHERE id=41');
    if (h.clientChange) await h.pg.query('UPDATE projects SET client_workspace_id=66 WHERE id=41');
    if (h.revoke) await h.pg.query('DELETE FROM organization_users WHERE user_id=5');
  }
  if (/FROM project_sections ps/.test(sql)) {
    h.trackingReads++;
    if (h.trackingRemap) await h.pg.query('UPDATE projects SET id=99 WHERE id=41');
  }
  return result;
}
vi.mock('../../../db.js', () => ({ pool: { query: (...args: [string, unknown[]?]) => query(...args) } }));
import router from '../projects';
import { readDossierArtifactReadiness } from '../../../services/c2c/dossier-artifact-read';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SIBLING = '22222222-2222-4222-8222-222222222222';
function app(orgId = 7) {
  const a = express();
  a.use((req, _res, next) => {
    Object.assign(req, { organizationId: orgId, userId: 5, dbClient: { query } });
    next();
  });
  a.use('/api/c2c/projects', router);
  return a;
}

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations(id INTEGER PRIMARY KEY,status TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,status TEXT);
    CREATE TABLE organization_users(organization_id INTEGER,user_id INTEGER,role TEXT);
    CREATE TABLE regulatory_programs(id UUID PRIMARY KEY,organization_id INTEGER,deleted_at TIMESTAMPTZ);
    CREATE TABLE projects(id INTEGER PRIMARY KEY,organization_id INTEGER,regulatory_program_id UUID,
      client_workspace_id INTEGER,status TEXT,owner_id INTEGER,created_by_id INTEGER,settings JSONB);
    CREATE TABLE project_visibility_settings(project_id INTEGER,organization_id INTEGER,visibility TEXT);
    CREATE TABLE project_members(project_id INTEGER,organization_id INTEGER,user_id INTEGER,role TEXT,status TEXT);
    CREATE TABLE concept2cure_review_assignments(artifact_id INTEGER,reviewer_id INTEGER,organization_id INTEGER,status TEXT);
    CREATE TABLE concept2cure_artifacts(id SERIAL PRIMARY KEY,organization_id INTEGER,project_id INTEGER,
      ctd_section TEXT,status TEXT,updated_at TIMESTAMPTZ);
    CREATE TABLE c2c_documents(id TEXT PRIMARY KEY,org_id INTEGER,project_id UUID,doc_type TEXT,agency TEXT,title TEXT,filing_scope TEXT);
    CREATE TABLE c2c_document_sections(document_id TEXT,section_key TEXT,parent_key TEXT,label TEXT,status TEXT,updated_at TIMESTAMPTZ);
    CREATE TABLE project_sections(organization_id INTEGER,project_id INTEGER,section_code TEXT,module TEXT,title TEXT,status TEXT);
  `);
});
afterAll(async () => { await h.pg?.close(); });
beforeEach(async () => {
  Object.assign(h, { remap: false, clientChange: false, revoke: false, beforeReadRemap: false, anchorReads: 0, artifactReads: 0,
    trackingReads: 0, trackingRemap: false, trackingError: null });
  await h.pg.exec(`TRUNCATE organizations,users,organization_users,regulatory_programs,projects,
    concept2cure_artifacts,c2c_documents,c2c_document_sections,project_sections;
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users VALUES (5,'active');
    INSERT INTO organization_users VALUES (7,5,'member'),(8,5,'member');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL),('${SIBLING}',7,NULL);
    INSERT INTO projects VALUES (41,7,'${PROGRAM}',9,'active',5,5,'{}'),(73,7,'${SIBLING}',10,'active',5,5,'{}');
    INSERT INTO c2c_documents VALUES ('governed',7,'${PROGRAM}','nda','fda','NDA','home');
    INSERT INTO c2c_document_sections VALUES ('governed','2.5',NULL,'Clinical overview','approved','2026-10-20T10:00:00Z');
    INSERT INTO concept2cure_artifacts(organization_id,project_id,ctd_section,status,updated_at) VALUES
      (7,41,'2.5','approved','2026-10-20T10:00:00Z'),(7,41,'2.5','draft','2026-10-21T10:00:00Z'),
      (7,73,'2.5','locked','2026-10-22T10:00:00Z'),(8,41,'2.5','locked','2026-10-23T10:00:00Z');
    INSERT INTO project_sections VALUES
      (7,41,'m2.5','M2','Tracked clinical overview','signed'),
      (7,41,'m2.7','M2','Tracked clinical summary','drafting'),
      (7,73,'m3.2.S.1','M3','Sibling substance','locked'),
      (8,41,'m4.2.1','M4','Foreign pharmacology','locked');
  `);
});

describe('tracked sections travel through the same admitted core dossier', () => {
  it('keeps recorded tracking details separate from governed sections and artifact stages', async () => {
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(200);
    expect(res.body.home.pct).toBe(100);
    expect(res.body.artifactReadiness.sections[0].status).toBe('draft');
    expect(res.body.sectionTracking).toMatchObject({
      basis: 'section_tracking', state: 'measured', unmapped: [],
      modules: [{ m: '2', counted: 2, complete: 1, unknownCount: 0, pct: 50, tone: 'warn', sections: [
        { code: 'm2.5', title: 'Tracked clinical overview', status: 'signed', label: '2.5 Tracked clinical overview', observedStatuses: ['signed'] },
        { code: 'm2.7', title: 'Tracked clinical summary', status: 'drafting', observedStatuses: ['drafting'] },
      ] }],
    });
    expect(res.body.sectionTracking.modules).toHaveLength(1);
    expect(h.trackingReads).toBe(1);
    const foreign = await request(app(8)).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(foreign.status).toBe(404);
    expect(h.trackingReads).toBe(1);
  });

  it('withholds all three sources if the exact anchor changes during tracking read', async () => {
    h.trackingRemap = true;
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_CHANGED');
    expect(res.body.home).toBeUndefined();
    expect(res.body.artifactReadiness).toBeUndefined();
    expect(res.body.sectionTracking).toBeUndefined();
    expect(h.trackingReads).toBe(1);
  });

  it('reports a missing tracking store separately without turning it into an empty tracked map', async () => {
    h.trackingError = '42P01';
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(200);
    expect(res.body.home.pct).toBe(100);
    expect(res.body.sectionTracking).toMatchObject({ basis: 'section_tracking', state: 'unavailable', modules: null, unmapped: null });
  });

  it('refuses an unexpected tracking read failure instead of returning other sources as a successful combined read', async () => {
    h.trackingError = '08006';
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(500);
    expect(res.body.home).toBeUndefined();
    expect(res.body.sectionTracking).toBeUndefined();
  });
});

describe('core dossier artifact source follows the currently admitted exact anchor', () => {
  it('keeps approved governed sections separate from mixed artifact states, sibling and foreign rows', async () => {
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(200);
    expect(res.body.home).toEqual({ state: 'measured', pct: 100, counted: 1, complete: 1 });
    expect(res.body.artifactReadiness).toMatchObject({
      basis: 'governed_artifacts', state: 'measured',
      sections: [{ ctdSection: '2.5', artifactCount: 2, draftCount: 1, approvedCount: 1, lockedCount: 0,
        status: 'draft', lastUpdated: '2026-10-21T10:00:00.000Z' }],
      summary: { totalSections: 1, readySections: 0, draftSections: 1 },
    });
    expect(h.artifactReads).toBe(1);
    const foreign = await request(app(8)).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(foreign.status).toBe(404);
    expect(h.artifactReads).toBe(1);
  });

  it.each(['remap', 'clientChange'] as const)('withholds both sources if the same UUID changes its %s during the artifact read', async (change) => {
    h[change] = true;
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_CHANGED');
    expect(res.body.home).toBeUndefined();
    expect(res.body.artifactReadiness).toBeUndefined();
    expect(h.artifactReads).toBe(1);
  });

  it('refuses an anchor change between middleware admission and verified scope before either source read', async () => {
    h.beforeReadRemap = true;
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_CHANGED');
    expect(h.artifactReads).toBe(0);
    expect(res.body.home).toBeUndefined();
  });

  it('withholds the combined result if current organization membership is revoked during the read', async () => {
    h.revoke = true;
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(403);
    expect(res.body.home).toBeUndefined();
    expect(res.body.artifactReadiness).toBeUndefined();
    expect(h.artifactReads).toBe(1);
  });

  it('keeps unresolved-anchor admission at 409 rather than bypassing it with an empty artifact source', async () => {
    await h.pg.query('DELETE FROM projects WHERE id=41');
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/dossier`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PROJECT_ANCHOR_UNRESOLVED');
    expect(h.artifactReads).toBe(0);
  });

  it('the shared reader reports unanchored without querying or making up an empty store', async () => {
    const q = { query: vi.fn() };
    expect(await readDossierArtifactReadiness(q, 7, null)).toMatchObject({
      basis: 'governed_artifacts', state: 'unanchored', sections: null, summary: null,
    });
    expect(q.query).not.toHaveBeenCalled();
  });
});
