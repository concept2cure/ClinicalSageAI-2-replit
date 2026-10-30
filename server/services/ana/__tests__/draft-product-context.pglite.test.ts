import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRecordedDraftProductContext } from '../draft-product-context';
import { renderDraftProductAdvisory } from '../draft-product-advisory';

let pg: PGlite;
const query = vi.fn();
const q = { query };
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const FOREIGN = '11111111-2222-4333-8444-000000000021';
const input = { organizationId: 7, userId: 7, projectRef: PROGRAM };
const load = () => loadRecordedDraftProductContext(q, input);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp, product_type text, indication text,
      program_type text, primary_agency text, metadata jsonb);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    CREATE TABLE project_charters (id serial PRIMARY KEY, organization_id integer, project_id integer, version integer,
      updated_at timestamptz, approval_status text, therapeutic_area text, development_stage text, target_population text);
  `);
});
beforeEach(async () => {
  await pg.exec(`TRUNCATE regulatory_programs,projects,organization_users,users,organizations,project_members,project_charters RESTART IDENTITY;
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(5,'active'),(7,'active'),(8,'active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,5,'member'),(7,7,'member'),(7,8,'member');
    INSERT INTO regulatory_programs(id,organization_id,deleted_at,product_type,indication,program_type,primary_agency) VALUES('${PROGRAM}',7,NULL,'monoclonal_antibody','Recorded indication','ind','FDA'),('${FOREIGN}',8,NULL,'vaccine','Private','cta','EMA');
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',5,5,'{"projectSharing":{"visibility":"private","members":[]}}'),(21,8,81,'${FOREIGN}',5,5,'{}');
    INSERT INTO project_members VALUES(11,7,7,'use','active');
    INSERT INTO project_charters(organization_id,project_id,version,approval_status,therapeutic_area,development_stage,target_population)
      VALUES(7,11,3,'draft','oncology','phase_2','Adults'),(8,21,1,'approved','neurology','phase_3','Private population');`);
  query.mockReset().mockImplementation((sql: string, params: unknown[] = []) => pg.query(sql, params));
});
afterAll(async () => { await pg.close(); });

describe('recorded drafting context uses the admitted project and real stored fields', () => {
  it('uses the canonical program and its sole charter without promoting approval to evidence', async () => {
    const { context } = await load();
    expect(context).toMatchObject({ state: 'recorded', projectId: 11, programId: PROGRAM, therapeuticArea: 'oncology',
      phase: 'phase_2', population: 'Adults', productType: 'monoclonal_antibody', modality: 'mab',
      indication: 'Recorded indication', charter: { version: 3, approvalStatus: 'draft' } });
    const out = renderDraftProductAdvisory({ therapeuticArea: 'neurology', modality: 'gene_therapy', phase: 'phase_3' }, '2.5', 'test', context);
    expect(out.prompt).toContain('not scientific evidence');
    expect(out.prompt).toContain('Therapeutic Area Context — Oncology');
    expect(out.prompt).not.toContain('Therapeutic Area Context — Neurology');
    expect(out.audit.productContextConflicts).toEqual(['therapeuticArea', 'modality', 'phase']);
  });

  it.each([{ projectRef: FOREIGN }, { projectRef: '21' }, { projectRef: '999' }])('refuses foreign/missing %j before a charter read', async extra => {
    await expect(loadRecordedDraftProductContext(q, { ...input, ...extra })).rejects.toMatchObject({ status: 404 });
    expect(query.mock.calls.some(call => String(call[0]).includes('FROM project_charters'))).toBe(false);
  });

  it.each([8, 0])('refuses unauthorized actor %s before product facts', async userId => {
    await expect(loadRecordedDraftProductContext(q, { ...input, userId })).rejects.toMatchObject({ status: 403 });
    expect(query.mock.calls.some(call => String(call[0]).includes('SELECT product_type'))).toBe(false);
  });

  it('keeps absent charters distinct from two competing charters', async () => {
    await pg.query('DELETE FROM project_charters WHERE organization_id=$1 AND project_id=$2', [7,11]);
    expect((await load()).context).toMatchObject({ charterState: 'missing', phase: null, therapeuticArea: null });
    await pg.query(`INSERT INTO project_charters(organization_id,project_id,version,therapeutic_area) VALUES(7,11,1,'oncology'),(7,11,2,'neurology')`);
    expect((await load()).context).toMatchObject({ charterState: 'ambiguous', phase: null, therapeuticArea: null, modality: 'mab' });
  });

  it('does not sharpen a recorded broad biologic from a caller modality', async () => {
    await pg.query('UPDATE regulatory_programs SET product_type=$1 WHERE id=$2', ['biologic',PROGRAM]);
    const { context } = await load();
    const out = renderDraftProductAdvisory({ modality: 'mab' }, '3.2.P.2', 'test', context);
    expect(out.audit.productModality).toBeNull();
    expect(out.prompt).toContain('PRODUCT MODALITY: UNASSESSED');
  });

  it('does not read any database for an omitted project', async () => {
    expect((await loadRecordedDraftProductContext(q, { organizationId: 7, userId: 7 })).context.state).toBe('unassessed');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a typed refusal when the recorded facts become unreadable before dispatch', async () => {
    const read = await load();
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM project_charters')) throw new Error('private database detail');
      return pg.query(sql, params);
    });
    await expect(read.assertCurrent()).rejects.toMatchObject({ status: 503, code: 'DRAFT_PRODUCT_CONTEXT_UNAVAILABLE' });
  });

  it.each(['charter','product','filing','access'])('refuses changed %s after generation starts', async kind => {
    const read = await load();
    if (kind === 'charter') await pg.query('UPDATE project_charters SET version=4 WHERE organization_id=$1 AND project_id=$2', [7,11]);
    if (kind === 'product') await pg.query('UPDATE regulatory_programs SET indication=$1 WHERE id=$2', ['Changed',PROGRAM]);
    if (kind === 'filing') await pg.query('UPDATE regulatory_programs SET primary_agency=$1 WHERE id=$2', ['EMA',PROGRAM]);
    if (kind === 'access') await pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2", [7,11]);
    await expect(read.assertCurrent()).rejects.toMatchObject({ status: kind === 'access' ? 403 : 409 });
  });
});
