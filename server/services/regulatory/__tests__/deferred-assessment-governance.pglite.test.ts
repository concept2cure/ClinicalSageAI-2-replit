/** Real SQL for canonical assessment writers and their governed transaction boundaries. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const m = vi.hoisted(() => ({ failAudit: false, query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: (...args: unknown[]) => m.query(...args) }, db: {} }));
vi.mock('../../../middleware/auth', () => ({ authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next() }));
// The transaction test supplies a real SQL audit write; chain/ceremony integrity has its own suites.
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: async (client: any, input: any) => {
  await client.query('INSERT INTO audit_events(target,actor_id,reason,payload) VALUES($1,$2,$3,$4::jsonb)', [input.target,input.userId,input.reason,JSON.stringify(input.payload)]);
  if (m.failAudit) throw new Error('Audit persistence unavailable');
  return { actionId: 'actual-test-action', auditId: 'actual-test-audit', sha256Chain: 'a'.repeat(64) };
} }));
import { saveBlaAssessment } from '../../biologics/bla-assessment-store';
import ivdRouter from '../../../routes/ivd-assessments';
import lifecycleRouter from '../../../routes/ivd-lifecycle';
import { saveGeneratedDocument } from '../ivd-assessments.service';
const PROGRAM='11111111-1111-4111-8111-111111111111';
const FOREIGN='22222222-2222-4222-8222-222222222222';
let db: PGlite;
const client={query:(sql:string,params?:unknown[])=>db.query<Record<string,unknown>>(sql,params)};
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE organizations(id int PRIMARY KEY,status text);CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,lead_user_id int,deleted_at timestamptz);
    INSERT INTO organizations VALUES(7,'active'),(9,'active');INSERT INTO users VALUES(5,'active'),(20,'active');
    INSERT INTO organization_users VALUES(7,5,'member'),(7,20,'member');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,5,NULL),('${FOREIGN}',9,5,NULL);
    CREATE TABLE audit_events(target text,actor_id int,reason text,payload jsonb);`);
  for(const name of ['20260604_bla_workbench.sql','20260610_ivd_assessments.sql']) await db.exec(readFileSync(`migrations/${name}`,'utf8'));
},60_000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{m.failAudit=false;m.query.mockImplementation(client.query);await db.exec("TRUNCATE c2c_bla_assessments,ivd_assessments,ivd_generated_documents,audit_events;UPDATE users SET status='active';UPDATE organization_users SET role='member'");});
const bla=()=>({organizationId:7,userId:5,programId:PROGRAM,title:'Measured comparability',reason:'Retaining measured change evidence',kind:'comparability' as const,verdict:'comparable',inputs:{attributes:[{name:'Potency',preChange:[95,96],postChange:[96,97]}]},result:{conclusion:'comparable',rationale:'Recorded computed result'}});
function app(actor=5,role='member') {
  const a=express();a.use(express.json());a.use((req,_res,next)=>{Object.assign(req,{dbClient:client,user:{id:actor,organizationId:7,role}});next();});a.use('/api/ivd-assessments',ivdRouter);a.use('/api/ivd-lifecycle',lifecycleRouter);return a;
}
const facts={deviceName:'Entered CDx assay',intendedPurpose:'Select patients for treatment',isSelfTest:false,isNearPatient:false,isCompanionDiagnostic:true,detectsTransmissibleAgent:false,bloodScreening:false,detectsCancer:false,prenatalScreening:false,isGeneticTest:false};
const savedFacts=()=>({programId:PROGRAM,title:'Recorded CDx classification',reason:'Retaining actual intended-purpose facts',facts});
describe('BLA canonical governed save',()=>{
  it('commits exact scientific snapshots and attributable audit together',async()=>{
    const row=await saveBlaAssessment(client,bla());
    const stored=(await db.query('SELECT * FROM c2c_bla_assessments')).rows[0];
    expect(stored).toMatchObject({id:row.id,program_id:PROGRAM,status:'draft',created_by:5,input:bla().inputs,result:bla().result});
    expect((await db.query('SELECT * FROM audit_events')).rows[0]).toMatchObject({target:`bla_assessment:${row.id}`,actor_id:5,reason:bla().reason});
  });
  it('rolls back the saved assessment if the audit fails',async()=>{
    m.failAudit=true;await expect(saveBlaAssessment(client,bla())).rejects.toThrow('Audit persistence');
    expect((await db.query('SELECT * FROM c2c_bla_assessments')).rows).toEqual([]);expect((await db.query('SELECT * FROM audit_events')).rows).toEqual([]);
  });
  it('refuses unfiled, foreign, inactive and non-lead saves before writing',async()=>{
    await expect(saveBlaAssessment(client,{...bla(),programId:null})).rejects.toMatchObject({code:'PROGRAM_REQUIRED'});
    await expect(saveBlaAssessment(client,{...bla(),programId:FOREIGN})).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(saveBlaAssessment(client,{...bla(),userId:20})).rejects.toMatchObject({code:'FORBIDDEN'});
    await db.exec("UPDATE users SET status='inactive' WHERE id=5");await expect(saveBlaAssessment(client,bla())).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await db.query('SELECT * FROM c2c_bla_assessments')).rows).toEqual([]);
  });
});
describe('IVD governed classification and document save',()=>{
  it('recomputes canonical IVDR facts instead of persisting a supplied class or verdict',async()=>{
    const res=await request(app()).post('/api/ivd-assessments/classification').send({...savedFacts(),result:{classification:'A'},verdict:'A',createdBy:'999'});
    expect(res.status).toBe(201);expect(res.body).toMatchObject({program_id:PROGRAM,created_by:'5',result:{classification:'C'},verdict:'C'});
    expect((await db.query('SELECT * FROM audit_events')).rows).toHaveLength(1);
  });
  it('recomputes generic classification saves instead of trusting a posted verdict',async()=>{
    const generic=await request(app()).post('/api/ivd-assessments').send({...savedFacts(),assessmentType:'ivdr_classification',inputs:facts,result:{classification:'A'},verdict:'A'});
    expect(generic.status).toBe(201);expect(generic.body.result.classification).toBe('C');
  });
  it('requires explicit boolean facts, an actual program, reason and editor access',async()=>{
    const missing={...facts} as Partial<typeof facts>;delete missing.bloodScreening;
    expect((await request(app()).post('/api/ivd-assessments/classification').send({...savedFacts(),facts:missing})).status).toBe(422);
    expect((await request(app()).post('/api/ivd-assessments/classification').send({...savedFacts(),programId:null})).status).toBe(400);
    expect((await request(app()).post('/api/ivd-assessments/classification').send({...savedFacts(),reason:'short'})).status).toBe(400);
    expect((await request(app(5,'viewer')).post('/api/ivd-assessments/classification').send(savedFacts())).status).toBe(403);
    expect((await request(app(20)).post('/api/ivd-assessments/classification').send(savedFacts())).status).toBe(403);
    expect((await db.query('SELECT * FROM ivd_assessments')).rows).toEqual([]);
  });
  it('rolls back the IVD snapshot on an audit error and reports an unconfirmed save',async()=>{
    m.failAudit=true;const res=await request(app()).post('/api/ivd-assessments/classification').send(savedFacts());
    expect(res.status).toBe(500);expect(JSON.stringify(res.body)).not.toContain('Audit persistence unavailable');
    expect((await db.query('SELECT * FROM ivd_assessments')).rows).toEqual([]);expect((await db.query('SELECT * FROM audit_events')).rows).toEqual([]);
  });
  it('builds an FSN from actual facts and always saves draft status',async()=>{
    const fsn={manufacturerName:'Manufacturer Ltd',deviceName:'Assay X',affectedLots:['L-7'],actionType:'recall',reasonForAction:'Lot issue',riskToHealth:'Recorded patient risk',recommendedUserAction:'Stop use',contactDetails:'manufacturer@example.test'};
    const res=await request(app()).post('/api/ivd-assessments/documents/fsn').send({programId:PROGRAM,title:'Retained FSN',reason:'Retaining actual field action facts',facts:fsn,status:'transmitted',payload:{fake:'Injected payload'}});
    expect(res.status).toBe(201);expect(res.body).toMatchObject({status:'draft',doc_type:'fsn',created_by:'5',payload:{documentType:'FSN',riskToHealth:'Recorded patient risk'}});
    expect(res.body.payload.fake).toBeUndefined();
    await expect(saveGeneratedDocument(7,{docType:'fsn',payload:{},status:'final'},client)).rejects.toMatchObject({code:'DRAFT_ONLY'});
  });
});

describe('legacy IVD explicit save failure and governed recovery',()=>{
  const review={pathway:'eu_ivdr',assayType:'qualitative',intendedUse:'diagnosis',evidence:{clinicalPerformance:false},programId:PROGRAM,title:'Retained reviewer simulation',reason:'Retaining actual evidence gaps',save:true};
  it('refuses a requested save when the audit fails instead of silently returning an unsaved successful computation',async()=>{
    m.failAudit=true;const res=await request(app()).post('/api/ivd-lifecycle/review-simulation').send(review);
    expect(res.status).toBe(503);expect(res.body.error.code).toBe('SAVE_UNAVAILABLE');
    expect(res.body.savedAssessmentId).toBeUndefined();expect(JSON.stringify(res.body)).not.toContain('Audit persistence unavailable');
    expect((await db.query('SELECT * FROM ivd_assessments')).rows).toEqual([]);
  });
  it('saves the actual computed snapshot and refuses viewer/unfiled requests while retaining pure previews',async()=>{
    const saved=await request(app()).post('/api/ivd-lifecycle/review-simulation').send(review);expect(saved.status).toBe(200);
    const row=(await db.query('SELECT * FROM ivd_assessments')).rows[0];expect(row).toMatchObject({id:saved.body.savedAssessmentId,program_id:PROGRAM,created_by:'5',inputs:review});
    expect((await request(app(5,'viewer')).post('/api/ivd-lifecycle/review-simulation').send(review)).status).toBe(403);
    expect((await request(app()).post('/api/ivd-lifecycle/review-simulation').send({...review,programId:null})).status).toBe(400);
    const pure=await request(app(5,'viewer')).post('/api/ivd-lifecycle/review-simulation').send({...review,save:false});
    expect(pure.status).toBe(200);expect(pure.body.savedAssessmentId).toBeUndefined();expect((await db.query('SELECT * FROM ivd_assessments')).rows).toHaveLength(1);
  });
});
