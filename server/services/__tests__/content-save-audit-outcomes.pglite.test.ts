/** Actual declared stores distinguish committed content, ancillary audit loss,
 * authority refusal and a business rollback. No provider/network is invoked. */
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ db:null as any, audit:vi.fn(), ai:vi.fn() }));
vi.mock('../../db', () => ({ get db() { return h.db; } }));
vi.mock('../auditService', () => ({ default:{ logAction:h.audit } }));
vi.mock('../../lib/unified-ai-client', () => ({ ai:{ chat:h.ai } }));
import { deviceDataCenter, deviceProfiles, cerReports, cerTemplates, cerVersionHistory } from '../../../shared/schema';
import dataCenter from '../DocumentDataCenterService';
import cer from '../cerGenerationService';
import { UnifiedCERService } from '../cer';
let pg:PGlite;
let directory:string;
beforeAll(async () => {
  directory=await mkdtemp(join(tmpdir(),'content-audit-'));
  pg=new PGlite(); h.db=drizzle(pg);
  const base=await readFile('migrations/0000_sweet_joseph.sql','utf8');
  for (const table of [deviceDataCenter,deviceProfiles,cerReports,cerTemplates,cerVersionHistory]) {
    const config=getTableConfig(table);
    const ddl=base.match(new RegExp(`CREATE TABLE "${config.name}" \\([\\s\\S]*?\\n\\);`))?.[0];
    if(!ddl) throw new Error(`Canonical base DDL not found for ${config.name}`);
    await pg.exec(ddl);
    const columns=new Set((await pg.query<{column_name:string}>('SELECT column_name FROM information_schema.columns WHERE table_name=$1',[config.name])).rows.map(row=>row.column_name));
    for(const column of config.columns) if(!columns.has(column.name)) await pg.exec(`ALTER TABLE "${config.name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`);
  }
});
beforeEach(async()=>{
  h.audit.mockReset();h.ai.mockReset();
  h.audit.mockResolvedValue({persisted:true,chained:true,tamperProof:false});
  h.ai.mockRejectedValue(new Error('Controlled provider unavailable; keyword tagging is permitted.'));
  await pg.exec(`ALTER TABLE cer_reports DROP CONSTRAINT IF EXISTS content_business_failure;
    ALTER TABLE device_data_center DROP CONSTRAINT IF EXISTS content_business_failure;
    DELETE FROM cer_version_history; DELETE FROM cer_reports;DELETE FROM cer_templates;DELETE FROM device_profiles;DELETE FROM device_data_center;
    INSERT INTO device_profiles(id,organization_id,device_name,classification) VALUES(1,9,'Synthetic device nine','IIa'),(2,10,'Synthetic device ten','IIa');`);
});
afterAll(async()=>{await pg?.close();if(directory)await rm(directory,{recursive:true,force:true});});
const options={deviceId:1,organizationId:9,userId:7,regulatoryFramework:'MDR_2017_745' as const};
function auditMode(mode:string){
  if(mode==='throw')h.audit.mockRejectedValue(new Error('Private audit database secret'));
  else h.audit.mockResolvedValue({persisted:mode!=='lost',chained:mode==='saved',tamperProof:mode==='tamper-only',error:'Private audit database secret'});
}
const outcome=(mode:string)=>mode==='lost'||mode==='throw'?{persisted:false,code:'AUDIT_ROW_NOT_PERSISTED'}:{persisted:true,chained:mode==='saved'};
async function upload(){const path=join(directory,'source.txt');await writeFile(path,'Recorded source text.');return dataCenter.uploadDocument(9,{path,originalname:'source.txt',mimetype:'text/plain',size:21} as Parameters<typeof dataCenter.uploadDocument>[1],{userId:'7'});}
describe('actual content writes carry actual post-save audit outcomes',()=>{
  it.each(['saved','lost','throw','tamper-only'])('upload and tags retain their saved values with audit=%s',async mode=>{
    auditMode(mode);const created=await upload();
    expect(created.meta.auditTrail).toMatchObject(outcome(mode));
    const updated=await dataCenter.updateDocumentTags(9,created.document.id,{tags:['reviewed-tag'],userId:'7'});
    expect(updated.meta.auditTrail).toMatchObject(outcome(mode));
    expect((await pg.query('SELECT tags,organization_id FROM device_data_center')).rows).toEqual([{tags:['reviewed-tag'],organization_id:9}]);
    expect(h.audit).toHaveBeenLastCalledWith(expect.objectContaining({organizationId:9,userId:'7',action:'DOCUMENT_TAGS_UPDATED'}));
    expect(h.audit.mock.calls[1][0].ipAddress).toBeUndefined();
    expect(JSON.stringify(updated)).not.toContain('Private audit');
  });
  it('a foreign tenant cannot read or update the document through a guessed id',async()=>{
    const created=await upload();h.audit.mockClear();
    await expect(dataCenter.updateDocumentTags(10,created.document.id,{tags:['foreign'],userId:'8'})).rejects.toThrow('Document not found');
    expect((await pg.query<{tags:string[]|null}>('SELECT tags FROM device_data_center')).rows[0].tags).toEqual([]);expect(h.audit).not.toHaveBeenCalled();
  });
  it('a business failure writes neither a document nor a misleading successful audit',async()=>{
    await pg.exec('ALTER TABLE device_data_center ADD CONSTRAINT content_business_failure CHECK(false) NOT VALID');
    await expect(upload()).rejects.toThrow('Failed to upload document');
    expect((await pg.query('SELECT id FROM device_data_center')).rows).toEqual([]);expect(h.audit).not.toHaveBeenCalled();
  });
  it.each(['saved','lost','throw','tamper-only'])('CER create, version and facade preserve saved draft with audit=%s',async mode=>{
    auditMode(mode);const created=await cer.generateCER(options);
    expect(created.meta.auditTrail).toMatchObject(outcome(mode));
    const changed=await cer.updateCerVersion(created.id,{conclusions:{text:'Actual reviewer draft.'}},7,'Updated conclusion',9);
    expect(changed.meta.auditTrail).toMatchObject(outcome(mode));
    expect(changed.cerVersion).toBe('1.1');
    expect((await pg.query('SELECT version FROM cer_version_history')).rows).toEqual([{version:'1.0'}]);
    const facade=await new UnifiedCERService(options).generateReport();
    expect(facade.status).toBe('success');expect(facade.meta?.auditTrail).toMatchObject(outcome(mode));
  });
  it('refuses a foreign device before creating any template, report or audit',async()=>{
    await expect(cer.generateCER({...options,deviceId:2})).rejects.toThrow('Device not found');
    expect((await pg.query('SELECT id FROM cer_reports')).rows).toEqual([]);expect((await pg.query('SELECT id FROM cer_templates')).rows).toEqual([]);expect(h.audit).not.toHaveBeenCalled();
  });
  it('version history rolls back with a failed content update and a later recovery increments once',async()=>{
    const created=await cer.generateCER(options);h.audit.mockClear();
    await pg.exec("ALTER TABLE cer_reports ADD CONSTRAINT content_business_failure CHECK(conclusions->>'text' IS DISTINCT FROM 'Refused') NOT VALID");
    await expect(cer.updateCerVersion(created.id,{conclusions:{text:'Refused'}},7,'Rejected',9)).rejects.toThrow();
    expect((await pg.query('SELECT version FROM cer_version_history')).rows).toEqual([]);expect(h.audit).not.toHaveBeenCalled();
    const recovered=await cer.updateCerVersion(created.id,{conclusions:{text:'Recovered'}},7,'Recovered',9);
    expect(recovered.cerVersion).toBe('1.1');expect((await pg.query('SELECT version FROM cer_version_history')).rows).toEqual([{version:'1.0'}]);
  });
  it('a lost completion after a real version COMMIT is reported as unconfirmed and retains actual history',async()=>{
    const created=await cer.generateCER(options);h.audit.mockClear();const real=h.db.transaction.bind(h.db);
    const completion=vi.spyOn(h.db,'transaction').mockImplementation(async(...args:unknown[])=>{await real(...args);throw new Error('Synthetic loss after actual commit');});
    try{
      await expect(cer.updateCerVersion(created.id,{conclusions:{text:'Committed draft'}},7,'Saved version',9)).rejects.toMatchObject({code:'CER_VERSION_COMMIT_UNCONFIRMED',cerReportId:created.id,status:503});
      expect((await pg.query('SELECT cer_version FROM cer_reports WHERE id=$1',[created.id])).rows).toEqual([{cer_version:'1.1'}]);
      expect((await pg.query('SELECT version FROM cer_version_history')).rows).toEqual([{version:'1.0'}]);expect(h.audit).not.toHaveBeenCalled();
    }finally{completion.mockRestore();}
  });
  it.each([{organizationId:10},{cerStatus:'approved'},{createdBy:99},{id:999}])('rejects immutable or governed fields %j',async changes=>{
    const created=await cer.generateCER(options);h.audit.mockClear();
    await expect(cer.updateCerVersion(created.id,changes,7,'Forbidden update',9)).rejects.toThrow('Only CER draft section');
    expect((await pg.query('SELECT version FROM cer_version_history')).rows).toEqual([]);expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses section updates to an approved CER and foreign report ids',async()=>{
    const created=await cer.generateCER(options);h.audit.mockClear();
    await expect(cer.updateCerVersion(created.id,{conclusions:{}},7,'Foreign',10)).rejects.toThrow('not found or access denied');
    await pg.query("UPDATE cer_reports SET cer_status='approved',status='approved' WHERE id=$1",[created.id]);
    await expect(cer.updateCerVersion(created.id,{conclusions:{}},7,'Overwrite',9)).rejects.toThrow('Only a draft CER');
    expect((await pg.query('SELECT version FROM cer_version_history')).rows).toEqual([]);expect(h.audit).not.toHaveBeenCalled();
  });
  it('an explicit missing or foreign template is refused without cloning it',async()=>{
    const existing=await cer.generateCER(options);h.audit.mockClear();
    await expect(cer.generateCER({...options,deviceId:2,organizationId:10,templateId:existing.templateId!})).rejects.toThrow('CER template not found');
    await expect(cer.generateCER({...options,templateId:'not-recorded'})).rejects.toThrow('CER template not found');
    expect((await pg.query('SELECT id FROM cer_reports')).rows).toHaveLength(1);expect(h.audit).not.toHaveBeenCalled();
  });
  it('independent tenants can both create their first CER without global identity collisions',async()=>{
    const one=await cer.generateCER(options);const two=await cer.generateCER({...options,deviceId:2,organizationId:10});
    expect(one.reportId).not.toBe(two.reportId);expect(one.cerNumber).toBe(two.cerNumber);
    expect((await pg.query('SELECT organization_id FROM cer_templates ORDER BY organization_id')).rows).toEqual([{organization_id:9},{organization_id:10}]);
  });
});
