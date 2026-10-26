import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const currentAccess = vi.hoisted(() => vi.fn());
vi.mock('../current-program-access', async original => ({
  ...await original<typeof import('../current-program-access')>(),
  requireCurrentProgramAccess: (...args: unknown[]) => currentAccess(...args),
}));
import { readDossierSupporting } from '../dossier-read';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ACCESS = { programId: PROGRAM, projectId: 11, clientWorkspaceId: 2, actor: { userId: 41, role: 'member' } };
let pg: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as any[] }) };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid, client_workspace_id integer, status text);
    CREATE TABLE project_sections (project_id integer, organization_id integer, module text, section_code text, title text, status text);
    CREATE TABLE concept2cure_artifacts (project_id integer, organization_id integer, ctd_section text, status text, updated_at timestamptz);
  `);
}, 60_000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  currentAccess.mockReset().mockResolvedValue(ACCESS);
  await pg.exec(`DELETE FROM concept2cure_artifacts; DELETE FROM project_sections; DELETE FROM projects;
    INSERT INTO projects VALUES (11,7,'${PROGRAM}',2,'active'),(12,7,'22222222-2222-4222-8222-222222222222',2,'active'),(13,8,'33333333-3333-4333-8333-333333333333',3,'active');`);
});

const supporting = () => readDossierSupporting(q, 7, ACCESS);

describe('supporting dossier reads retain their own recorded basis', () => {
  it('refuses a stale accepted mapping before either source query', async () => {
    currentAccess.mockResolvedValue({ ...ACCESS, projectId: 12 });
    const query = vi.fn(q.query);
    await expect(readDossierSupporting({ query }, 7, ACCESS)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('carries artifact counts, weakest state, dates and real tracked modules without mixing stores or projects', async () => {
    await pg.exec(`INSERT INTO concept2cure_artifacts VALUES
      (11,7,'2.5','approved','2026-10-20'),(11,7,'2.5','locked','2026-10-25'),
      (11,7,'2.7','review','2026-10-24'),(11,7,'3.2.S.1','draft','2026-10-23'),
      (11,7,'3.2.P.1','future-status','2026-10-22'),(11,7,'','locked','2026-10-26'),
      (12,7,'5.3','locked','2026-10-26'),(13,8,'5.3','locked','2026-10-26');
      INSERT INTO project_sections VALUES
      (11,7,'M2','m2.5','Clinical overview','approved'),(11,7,'M2','m2.7','Clinical summary','drafting'),
      (12,7,'M5','m5.3','Sibling section','locked'),(13,8,'M5','m5.3','Other organization','locked');`);
    const result = await supporting();
    expect(result.artifactReadiness).toMatchObject({ state: 'measured', summary: {
      totalSections: 4, readySections: 1, inProgressSections: 1, draftSections: 1, notAssessedSections: 1,
    } });
    if (result.artifactReadiness.state !== 'measured') throw new Error('Expected artifact read');
    expect(result.artifactReadiness.sections[0]).toEqual({ ctdSection: '2.5', status: 'approved', artifactCount: 2,
      draftCount: 0, reviewCount: 0, approvedCount: 1, lockedCount: 1, unknownCount: 0, lastUpdated: '2026-10-25T00:00:00.000Z' });
    expect(result.artifactReadiness.sections.find(s => s.ctdSection === '3.2.P.1')).toMatchObject({ status: 'not_assessed', unknownCount: 1 });
    expect(result.sectionTracking).toMatchObject({basis:'section_tracking',state:'measured',unmapped:[],modules:[
      {m:'2',label:'CTD summaries',counted:2,complete:1,unknownCount:0,pct:50,tone:'warn',sections:[
        {code:'m2.5',title:'Clinical overview',status:'approved',label:'2.5 Clinical overview'},
        {code:'m2.7',title:'Clinical summary',status:'drafting',label:'2.7 Clinical summary'},
      ]},
    ]});
    expect(currentAccess).toHaveBeenCalledWith(q, { organizationId: 7, userId: 41, programId: PROGRAM });
  });

  it('keeps a missing store distinct from a failed read, without losing the other basis', async () => {
    const guarded = { query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM concept2cure_artifacts')) throw Object.assign(new Error('missing'), { code: '42P01' });
      return q.query(sql, params);
    }) };
    expect(await readDossierSupporting(guarded, 7, ACCESS)).toMatchObject({
      artifactReadiness: { state: 'unavailable', code: 'STORE_UNAVAILABLE' }, sectionTracking: { basis:'section_tracking',state:'no_sections',modules:[],unmapped:[] },
    });
    guarded.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM concept2cure_artifacts')) throw Object.assign(new Error('secret connection detail'), { code: '08006' });
      return q.query(sql, params);
    });
    const failed = await readDossierSupporting(guarded, 7, ACCESS);
    expect(failed.artifactReadiness).toMatchObject({ state: 'unavailable', code: 'READ_FAILED' });
    expect(JSON.stringify(failed)).not.toContain('secret connection detail');
  });

  it.each([
    { projectId: 12 }, { clientWorkspaceId: 3 }, { actor: { userId: 41, role: 'viewer' } },
  ])('refuses an admitted anchor, client or role that changed during the read: %j', async changed => {
    currentAccess.mockResolvedValueOnce(ACCESS).mockResolvedValueOnce({ ...ACCESS, ...changed });
    await expect(supporting()).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
  });

  it('does not expose artifact or tracking rows through an archived or wrong-organization anchor', async () => {
    await pg.exec(`INSERT INTO concept2cure_artifacts VALUES(11,7,'2.5','locked','2026-10-25');
      INSERT INTO project_sections VALUES(11,7,'M2','m2.5','Clinical overview','locked');
      UPDATE projects SET status='archived' WHERE id=11;`);
    const result = await supporting();
    expect(result.artifactReadiness).toMatchObject({ state: 'no_artifacts', sections: [], summary: { totalSections: 0 } });
    expect(result.sectionTracking).toEqual({ basis:'section_tracking',state:'no_sections',modules:[],unmapped:[] });
    await pg.exec(`UPDATE projects SET status='active',organization_id=8 WHERE id=11;`);
    expect(await supporting()).toEqual(result);
  });
});
