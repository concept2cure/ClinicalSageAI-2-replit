import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ database: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return h.database; } }));
import { loadCsrInputsForProject } from '../load-csr-inputs-for-project';
let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  h.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,status text,owner_id integer,created_by_id integer,settings jsonb DEFAULT '{}'::jsonb);
    INSERT INTO projects VALUES (11,7,71,'active',NULL,NULL,'{}'),(99,7,71,'active',NULL,NULL,'{}');
    CREATE TABLE organization_users (organization_id integer,user_id integer,role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE csr_build_jobs (id integer PRIMARY KEY, organization_id integer, project_id integer,
      study_id text, status text, study_info_snapshot jsonb, created_at timestamp, source_run_id text GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED);
    CREATE TABLE csr_section_outputs (id serial PRIMARY KEY, organization_id integer, project_id integer, job_id integer,
      section_number text, content text, content_hash text, ai_generated boolean, model text, token_cost integer, lineage jsonb, generated_at timestamp DEFAULT now(), review_status text NOT NULL DEFAULT 'draft', reviewer_id integer, review_decided_at timestamptz, review_reason text, reviewed_content_hash text);
    INSERT INTO csr_build_jobs VALUES
      (1,7,11,'STUDY-A','complete','{"studyInfo":{"protocolNumber":"A","phase":"1","sampleSize":10}}','2026-10-01'),
      (2,7,11,'STUDY-A','complete','{"studyInfo":{"protocolNumber":"A","phase":"1","sampleSize":20}}','2026-10-02'),
      (3,7,11,'STUDY-A','failed','{"studyInfo":{"protocolNumber":"A","sampleSize":30}}','2026-10-03'),
      (4,7,12,'STUDY-A','complete','{"studyInfo":{"protocolNumber":"A","sampleSize":99}}','2026-10-04'),
      (5,8,11,'STUDY-A','complete','{"studyInfo":{"protocolNumber":"A","sampleSize":999}}','2026-10-05'),
      (6,7,11,'STUDY-B','complete','{"studyInfo":{"protocolNumber":"B","phase":"2"}}','2026-10-02'),
      (7,7,11,'STUDY-B','complete','{"studyInfo":{"protocolNumber":"B","phase":"2"}}','2026-10-02');
    INSERT INTO csr_section_outputs (organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,token_cost)
      SELECT organization_id,project_id,id,'13','Retained generation ' || id,'recorded-hash-' || id,false,0 FROM csr_build_jobs;
  `);
});
afterAll(async () => { await database?.close(); });
describe('CSR sources supplied to CTD summaries', () => {
  it('uses one latest completed generation per study after tenant/project/status filtering, with deterministic ties', async () => {
    const inputs = await loadCsrInputsForProject(7, 11, { actorUserId: 5 });
    expect(inputs).toHaveLength(2);
    // The build request's sampleSize is the planned size: it travels as planned, never as enrolled.
    expect(inputs.find(s => s.studyId === 'STUDY-A')).toMatchObject({ sampleSize: null, plannedSampleSize: 20, csrSections: [{ content: 'Retained generation 2' }] });
    expect(inputs.find(s => s.studyId === 'STUDY-B')?.csrSections?.[0]?.content).toBe('Retained generation 7');
    expect(inputs.find(s => s.studyId === 'STUDY-B')?.sampleSize).toBeNull();
  });
  it('retains all historical generations and their section records', async () => {
    await loadCsrInputsForProject(7, 11, { actorUserId: 5 });
    expect((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM csr_build_jobs')).rows[0]?.n).toBe(7);
    expect((await database.query<{ content: string }>('SELECT content FROM csr_section_outputs WHERE job_id=1')).rows[0]?.content).toBe('Retained generation 1');
    expect(await loadCsrInputsForProject(7, 99, { actorUserId: 5 })).toEqual([]);
  });
});
