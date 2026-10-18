/** The launch CMC overview reads the same real filing spine that project intake/placement writes. */
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../../db.js',()=>({query:(...args:unknown[])=>h.query(...args)}));
vi.mock('../../utils/tenantContext.js',()=>({getSecureOrgId:(req:any)=>req.user?.organizationId}));
import createRoutes from '../cmc-module3-board.routes';
let db:PGlite;
const P1='00000000-0000-4000-8000-000000000011',P2='00000000-0000-4000-8000-000000000012';
const app=(orgId=1)=>{const a=express();a.use((req,_res,next)=>{(req as any).user={id:7,organizationId:orgId};next();});a.use('/api/cmc/module3-board',createRoutes());return a;};
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE organizations(id int PRIMARY KEY); INSERT INTO organizations VALUES(1),(2);
    CREATE TABLE users(id int PRIMARY KEY); INSERT INTO users VALUES(7);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,title text,deleted_at timestamptz);
    INSERT INTO regulatory_programs VALUES('${P1}',1,'Program one',NULL),('${P2}',2,'Program two',NULL);`);
  await db.exec(await readFile('migrations/20260604_submission_core_canonical.sql','utf8'));
  await db.exec(`ALTER TABLE submissions ADD COLUMN program_id uuid;
    CREATE TABLE reg_questions(id serial,organization_id int,question_text text,section_reference text,priority text,severity text,status text,
      region text,due_date date,assigned_to text,response_doc_id uuid);
    CREATE TABLE cmc_module3_sections(organization_id int,project_id text,section_key text,section_path text,approval_state text,deterministic_json jsonb);
    INSERT INTO submissions(id,title,product_name,application_type,client_type,primary_region,organization_id,created_by,program_id,deleted_at) VALUES
      (1,'Live filing','Product one','ind','pharma','fda',1,7,'${P1}',NULL),
      (2,'Foreign filing','Other product','nda','pharma','eu',2,7,'${P2}',NULL),
      (3,'Deleted filing','Deleted','ind','pharma','fda',1,7,'${P1}',NOW());
    INSERT INTO ectd_sequences(id,submission_id,region,sequence_number,organization_id,created_by,deleted_at) VALUES
      (1,1,'fda','0000',1,7,NULL),(2,1,'fda','0001',2,7,NULL),(3,1,'fda','0002',1,7,NOW()),(4,2,'eu','0000',2,7,NULL);
    INSERT INTO submission_leaves(sequence_id,section_code,title,organization_id,created_by,deleted_at) VALUES
      (1,'3.2.S.1','Numeric Module 3',1,7,NULL),(1,'m3s1','M3 Module 3',1,7,NULL),(1,'2.5','Module 2',1,7,NULL),
      (1,'m3p1','Foreign child',2,7,NULL),(2,'m3s1','Foreign sequence child',2,7,NULL),(3,'m3s1','Deleted sequence child',1,7,NULL),
      (1,'m3s1','Deleted leaf',1,7,NOW()),(4,'m3s1','Foreign filing leaf',2,7,NULL);
    INSERT INTO cmc_module3_sections VALUES(1,'${P1}','M3S1','3.2.S.1','approved','{"completeness":100,"missingInputs":[]}'),
      (2,'${P1}','M3S2','3.2.S.2','approved','{"completeness":100,"missingInputs":[]}');`);
  h.query.mockImplementation((sql:string,args:unknown[])=>db.query(sql,args));
});
afterAll(async()=>{await db?.close();});
describe('canonical CMC board with no legacy reg_submissions registry',()=>{
  it('returns a real anchored filing and actual Module 3 placement counts without querying an absent legacy registry',async()=>{
    h.query.mockClear();const res=await request(app()).get(`/api/cmc/module3-board?projectId=${P1}`);
    expect(res.status).toBe(200);expect(res.body.data.portfolio).toHaveLength(1);
    expect(res.body.data.portfolio[0]).toMatchObject({sub:'Live filing',product:'Product one',region:'FDA',type:'IND',source:'spine',m3Leaves:2,sequences:1,rpi:null,ir:null});
    expect(res.body.data.portfolio[0]).toMatchObject({submissionId:1,programId:P1});
    expect(res.body.data.sections).toHaveLength(1);expect(res.body.data.kpis.sectionsTotal).toBe(1);
    expect(res.body.data.meta.portfolioProvisioned).toBe(true);expect(res.body.data.meta.portfolioUnreadable).toBe(false);
    expect(h.query.mock.calls.some(([sql])=>/reg_submissions|reg_m3_sections|reg_changes/i.test(String(sql)))).toBe(false);
  });
  it('reads only the current tenant and respects a selected canonical program',async()=>{
    const foreign=await request(app(2)).get('/api/cmc/module3-board');
    expect(foreign.body.data.portfolio.map((row:any)=>row.sub)).toEqual(['Foreign filing']);
    const mismatch=await request(app(1)).get(`/api/cmc/module3-board?projectId=${P2}`);
    expect(mismatch.body.data.portfolio).toEqual([]);expect(mismatch.body.data.sections).toEqual([]);
  });
  it('publishes no established submission count when its canonical portfolio read fails',async()=>{
    h.query.mockImplementationOnce(async()=>{throw Object.assign(new Error('connection failed'),{code:'57P01'});});
    const res=await request(app()).get('/api/cmc/module3-board');
    expect(res.status).toBe(200);expect(res.body.data.meta.portfolioUnreadable).toBe(true);
    expect(res.body.data.kpis.submissions).toBeNull();expect(res.body.data.kpis.rpiAverage).toBeNull();
  });
});
