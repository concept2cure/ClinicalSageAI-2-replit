/** Native secondary-reader policy proof. Invented QA metadata only; no source
 * bytes, dossiers, signatures or scientific qualification are produced. */
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import {SignJWT} from 'jose';
import {databaseUrl} from '../setup.db';
import {setTenantContextTx} from '../../server/services/tenant/governed-tenant-context';
import {getPool} from '../../server/db/runtime';
import {listClientDocuments} from '../../server/services/clinical-regulatory-evidence/evidence-spine.service';
import {summarizeSourceUsage,listChangedSourceUsages,listCitedSections} from '../../server/services/clinical-regulatory-evidence/source-usage.service';
import {listCitationSources} from '../../server/services/clinical-regulatory-evidence/citation-source-read';
import {getCurrentAuthoringReadScope} from '../../server/services/authoring/authoring-read-scope';
import {assertAnaUploadAccess} from '../../server/services/ana/source-context-admission';
import {readVaultPlacements,readVaultEstarUses,readVaultCmcEvidenceUses} from '../../server/services/vault/vault-where-used';

const TAG=`secondaryqa-${randomUUID()}`;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
let owner:Pool;let runtime:Pool;let orgId:number;let orgUuid:string;let workspaceId:number;
const users={} as Record<'a'|'b'|'reader',number>;
type Program={id:string;project:number;vault:string};
const programs={} as Record<'public'|'a'|'b',Program>;
const sources={} as Record<'public'|'a'|'b'|'global'|'nullPrivate'|'unbound'|'ambiguous'|'artifact',number>;
const files={} as Record<'unbound'|'ambiguous'|'artifact',string>;
const docs={} as Record<'open'|'private',string>;
const sections={} as Record<'open'|'private'|'otherSection',string>;
let privatePermission:string;
let bibliographyCitationId:string;
let httpApp:express.Express;

async function buildNativeHttpApp() {
  const {requireTenantContext}=await import('../../server/middleware/tenantContext');
  const {authoringObjectAuthorization}=await import('../../server/middleware/authoringObjectAuthorization');
  const {requestPgClient}=await import('../../server/db/requestDb');
  const {default:authoringRouter}=await import('../../server/routes/authoring.router');
  const app=express();app.use(express.json());
  app.use('/api',requireTenantContext,authoringObjectAuthorization);
  app.get('/api/native-rls-probe',async(req,res)=>{
    const {rows}=await requestPgClient(req).query(`SELECT current_user AS who,r.rolsuper,r.rolbypassrls,
      current_setting('app.rls_enforce',true) AS enforced,current_setting('app.current_tenant_id',true) AS tenant
      FROM pg_roles r WHERE r.rolname=current_user`);
    res.json(rows[0]);
  });
  app.use('/api/authoring',authoringRouter);
  return app;
}
async function nativeHttpToken(userId:number) {
  const secret=process.env.JWT_SECRET_DEV || process.env.JWT_SECRET;
  if (!secret) throw new Error('The native suite requires its configured JWT signing secret.');
  return new SignJWT({userId:String(userId),organizationId:String(orgId),organizationUuid:orgUuid,role:'member',type:'access'})
    .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('5m').setJti(randomUUID())
    .sign(new TextEncoder().encode(secret));
}

async function asUser<T>(userId:number,work:(q:PoolClient)=>Promise<T>):Promise<T> {
  const q=await runtime.connect();
  try {
    await q.query('BEGIN');await setTenantContextTx(q,orgId,'member');
    await q.query("SELECT set_config('app.current_org_id',$1,true)",[orgUuid]);
    return await work(q);
  } finally {await q.query('ROLLBACK');q.release();}
}

async function program(key:keyof typeof programs,creator:number,visibility:'private'|'org_public') {
  const id=randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
    VALUES($1,$2,$3::text,$4,'IND','drug','FDA',$3::text)`,[id,orgId,`${TAG}-${key}`,`SQA-${id.slice(0,8)}-${key}`]);
  const project=(await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}') RETURNING id`,[orgId,workspaceId,`${TAG}-${key}`,creator,id])).rows[0];
  await owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)',[orgId,project.id,visibility]);
  const vault=randomUUID();
  await owner.query(`INSERT INTO vault.documents(id,organization_id,program_id,document_title,document_code,document_type,file_name,content_hash,extracted_text,created_by)
    VALUES($1,$2,$3,$4::text,$4::text,'REPORT',$5,$6,'Invented QA metadata only',$7)`,[vault,orgId,id,`${TAG}-${key}-vault`,`${key}.txt`,sha(key),creator]);
  programs[key]={id,project:Number(project.id),vault};
}
async function source(key:keyof typeof sources,programId:string|null,extra:{org?:number|null;visibility?:string;workspace?:number;file?:string;artifactId?:string;origin?:string}={}) {
  const result=await owner.query(`INSERT INTO cre_evidence_sources(organization_id,visibility_class,source_type,client_program_id,client_workspace_id,
    title,checksum,provenance,metadata,ingestion_status,extraction_status,created_by)
    VALUES($1,$2,'client_document',$3,$4,$5,$6,$7::jsonb,$8::jsonb,'ingested','extracted',$9) RETURNING id`,
  [extra.org===undefined?orgId:extra.org,extra.visibility ?? 'project_private',programId,extra.workspace ?? null,`${TAG}-${key}`,
    sha(key),JSON.stringify({origin:extra.origin ?? 'native_metadata_fixture',fileUploadId:extra.file}),
    JSON.stringify({artifactId:extra.artifactId}),users.a]);sources[key]=Number(result.rows[0].id);
}
async function upload(key:keyof typeof files,creator:number) {
  const id=`file_${randomUUID()}`;files[key]=id;
  await owner.query(`INSERT INTO file_uploads(id,user_id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES($1,$2,$3,$4,'text/plain',1,$5,$6,'uploaded')`,[id,creator,orgId,`${TAG}-${key}.txt`,`${TAG}/${id}.txt`,sha(key)]);
}
async function authoring(key:keyof typeof docs,creator:number) {
  const id=randomUUID();docs[key]=id;
  await owner.query(`INSERT INTO authoring_documents(id,title,status,created_by,tenant_id,client_program_id)
    VALUES($1,$2,'draft',$3,$4,$5)`,[id,`${TAG}-${key}-document`,String(creator),orgId,programs.public.id]);
  const section=randomUUID();sections[key]=section;
  await owner.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
    VALUES($1,$2,'1',$3,'QA metadata only',$4)`,[section,id,`${TAG}-${key}-section`,orgId]);
  // Canonical document insertion creates the OWNER grant through its trigger.
  await owner.query(`INSERT INTO authoring_citations(id,section_id,source,reference_id,payload_sha256,tenant_id,created_by)
    VALUES($1,$2,'cre_evidence_source',$3,$4,$5,$6)`,[randomUUID(),section,String(sources.public),sha('old QA cite-time content'),orgId,String(creator)]);
}

beforeAll(async()=>{
  if (!process.env.APP_DATABASE_URL) throw new Error('A real restricted APP_DATABASE_URL is required.');
  const ownerTarget = new URL(databaseUrl); const runtimeTarget = new URL(process.env.APP_DATABASE_URL);
  const approvedDatabase = ownerTarget.pathname === '/platform_ci_native_recheck_20261013' ||
    process.env.CI === 'true' && process.env.NODE_ENV === 'test' && ownerTarget.pathname === '/concept2cure-ri_dbtest';
  if (!approvedDatabase || ownerTarget.pathname !== runtimeTarget.pathname ||
    ownerTarget.hostname !== runtimeTarget.hostname || ownerTarget.port !== runtimeTarget.port || runtimeTarget.username !== 'app_service') {
    throw new Error('Use matching declared isolated QA connections and the restricted application role.');
  }
  owner=new Pool({connectionString:databaseUrl,max:3});runtime=new Pool({connectionString:process.env.APP_DATABASE_URL,max:3});
  const org=(await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid",[TAG])).rows[0];
  orgId=Number(org.id);orgUuid=String(org.uuid);
  const passwordHash=await bcrypt.hash('Secondary-Native-QA-Only-2026!',4);
  for (const key of ['a','b','reader'] as const) {
    users[key]=Number((await owner.query("INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id",[`${TAG}-${key}@example.invalid`,`${TAG}-${key}`,passwordHash])).rows[0].id);
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')",[orgId,users[key]]);
  }
  workspaceId=Number((await owner.query("INSERT INTO client_workspaces(organization_id,name,slug,status,created_by_id) VALUES($1,$2,$2,'active',$3) RETURNING id",[orgId,TAG,users.a])).rows[0].id);
  await program('public',users.a,'org_public');await program('a',users.a,'private');await program('b',users.b,'private');
  await source('public',programs.public.id);await source('a',programs.a.id);await source('b',programs.b.id);
  await source('global',null,{org:null,visibility:'global_public'});await source('nullPrivate',null,{org:null,visibility:'tenant_private'});
  await upload('unbound',users.a);await source('unbound',null,{file:files.unbound,origin:'chat_upload'});
  await upload('ambiguous',users.b);await source('ambiguous',null,{workspace:programs.public.project,file:files.ambiguous,origin:'legacy_workspace'});
  await upload('artifact',users.a);
  const artifactId=`artifact-${randomUUID()}`;
  await owner.query(`INSERT INTO concept2cure_artifacts(artifact_id,project_id,organization_id,type,category,title,content,metadata,created_by_id)
    VALUES($1,$2,$3,'source_document','source',$4,'QA metadata only',$5::jsonb,$6)`,
  [artifactId,programs.public.project,orgId,TAG,JSON.stringify({fileId:files.artifact}),users.a]);
  await source('artifact',null,{workspace:programs.public.project,file:files.artifact,artifactId,origin:'chat_upload'});
  await authoring('open',users.a);await authoring('private',users.b);
  sections.otherSection=randomUUID();
  await owner.query("INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id) VALUES($1,$2,'2',$3,'QA other section',$4)",
    [sections.otherSection,docs.private,`${TAG}-other-private-section`,orgId]);
  httpApp=await buildNativeHttpApp();
},120_000);
afterAll(async()=>{
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1 AND slug=$2",[orgId,TAG]);
  await runtime?.end();await getPool().end().catch(()=>undefined);await owner?.end();
});

describe('actual source identity and current creator boundaries',()=>{
  it('uses a real non-owner runtime with tenant RLS',async()=>asUser(users.a,async q=>{
    const role=(await q.query('SELECT current_user AS who,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(role).toMatchObject({who:'app_service',rolsuper:false,rolbypassrls:false});
    const flags=(await q.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='regulatory_programs'::regclass")).rows[0];
    expect(flags).toMatchObject({relrowsecurity:true,relforcerowsecurity:true});
  }));
  it('preserves actual NULL-org global_public and withholds NULL-org private sources',async()=>asUser(users.a,async q=>{
    const ids=(await listClientDocuments(q,orgId,{userId:users.a,includeUnscoped:true})).map(row=>row.id);
    expect(ids).toContain(sources.global);expect(ids).not.toContain(sources.nullPrivate);
  }));
  it('enumerates genuinely unbound chat captures only for the original uploader',async()=>{
    const mine=await asUser(users.a,q=>listClientDocuments(q,orgId,{userId:users.a,includeUnscoped:true}));
    const peer=await asUser(users.b,q=>listClientDocuments(q,orgId,{userId:users.b,includeUnscoped:true}));
    expect(mine.map(row=>row.id)).toContain(sources.unbound);expect(peer.map(row=>row.id)).not.toContain(sources.unbound);
  });
  it('does not authorize an unknown workspace by a matching accessible numeric project',async()=>{
    await expect(asUser(users.a,q=>assertAnaUploadAccess(q,{organizationId:orgId,userId:users.a,fileIds:[files.ambiguous]})))
      .rejects.toMatchObject({status:409,code:'ANA_SOURCE_SCOPE_UNRESOLVED'});
  });
  it('preserves legacy numeric chat access only through its exact artifact/file parent',async()=>{
    await expect(asUser(users.reader,q=>assertAnaUploadAccess(q,{organizationId:orgId,userId:users.reader,fileIds:[files.artifact]}))).resolves.toBeUndefined();
  });
  it('does not make a captured artifact appear to be an unbound conversation upload',async()=>asUser(users.a,async q=>{
    const ids=(await listClientDocuments(q,orgId,{userId:users.a,includeUnscoped:true})).map(row=>row.id);
    expect(ids).not.toContain(sources.artifact);
  }));
});

describe('source usage requires both current parent and canonical object ACL',()=>{
  it('counts only currently permitted citing documents even inside one accessible program',async()=>asUser(users.a,async q=>{
    const used=await summarizeSourceUsage(q,orgId,[sources.public],{userId:users.a});
    expect(used.get(sources.public)).toMatchObject({sections:1,documents:1,changedSections:1});
    const cards=await listCitedSections(q,orgId,{userId:users.a});
    expect(cards.map(card=>card.documentId)).toEqual([docs.open]);
  }));
  it('counts an explicit section grant without promoting it to whole-document authority',async()=>{
    privatePermission=(await owner.query(`INSERT INTO doc_permissions(doc_id,section_id,tenant_id,principal_id,role,granted_by)
      VALUES($1,$2,$3,$4,'VIEWER',$5) RETURNING id`,[docs.private,sections.private,orgId,String(users.a),String(users.b)])).rows[0].id;
    await asUser(users.a,async q=>{
      const access=await getCurrentAuthoringReadScope(q,{organizationId:orgId,userId:users.a});
      expect(access.documentIds).not.toContain(docs.private);expect(access.sectionIds).toContain(sections.private);
      expect(access.sectionIds).not.toContain(sections.otherSection);
      const used=await summarizeSourceUsage(q,orgId,[sources.public],{userId:users.a});
      expect(used.get(sources.public)).toMatchObject({sections:2,documents:2,changedSections:2});
    });
  });
  it('rechecks a revoked current section grant',async()=>{
    await owner.query("UPDATE doc_permissions SET revoked_at=now(),revoked_by=$2,revoke_reason='Native QA revoke' WHERE id=$1 AND tenant_id=$3",
      [privatePermission,String(users.b),orgId]);
    const used=await asUser(users.a,q=>summarizeSourceUsage(q,orgId,[sources.public],{userId:users.a}));
    expect(used.get(sources.public)).toMatchObject({sections:1,documents:1});
  });
  it('refuses an explicitly selected private source before returning change metadata',async()=>{
    await expect(asUser(users.a,q=>listChangedSourceUsages(q,orgId,{userId:users.a,programId:programs.public.id,sourceId:sources.b})))
      .rejects.toMatchObject({status:403,code:'SOURCE_ACCESS_DENIED'});
  });
  it('preserves an unresolved recorded citation without enriching private source facts',async()=>{
    const citationId=randomUUID();
    await owner.query(`INSERT INTO authoring_citations(id,section_id,source,reference_id,payload_sha256,citation_text,tenant_id,created_by)
      VALUES($1,$2,'cre_evidence_source',$3,$4,'Recorded QA citation',$5,$6)`,
    [citationId,sections.open,String(sources.b),sha('b'),orgId,String(users.a)]);
    const cards=await asUser(users.a,q=>listCitedSections(q,orgId,{userId:users.a,documentId:docs.open}));
    const retained=cards[0].sources.find(row=>row.citationId===citationId);
    expect(retained).toMatchObject({state:'unresolved',source:null,citedChecksum:sha('b')});
    expect(JSON.stringify(cards)).not.toContain(`${TAG}-b`);
  });
  it('returns unavailable verification rather than fabricated usage zeros',async()=>asUser(users.a,async q=>{
    const interrupted={query:async(sql:string,params?:unknown[])=>{
      if (sql.includes('organization_users')) throw Object.assign(new Error('Injected QA verification interruption'),{code:'08006'});
      return q.query(sql,params);
    }};
    await expect(summarizeSourceUsage(interrupted,orgId,[sources.public],{userId:users.a})).rejects.toMatchObject({status:503});
  }));
});

describe('native bibliography admission uses the current original uploader',()=>{
  it('resolves a recorded unbound source citation for its original uploader',async()=>{
    bibliographyCitationId=randomUUID();
    // Existing-record fixture: preserve a legacy citation through the actual
    // store, independently of new-citation writer qualification.
    await owner.query(`INSERT INTO authoring_citations
      (id,section_id,source,reference_id,payload_sha256,citation_text,tenant_id,created_by)
      VALUES($1,$2,'cre_evidence_source',$3,$4,'Native QA historical citation',$5,$6)`,
    [bibliographyCitationId,sections.open,String(sources.unbound),sha('unbound'),orgId,String(users.a)]);
    const resolved=await asUser(users.a,async q=>{
      const access=await getCurrentAuthoringReadScope(q,{organizationId:orgId,userId:users.a,documentId:docs.open});
      expect(access.documentIds).toContain(docs.open);
      return listCitationSources(orgId,[sources.unbound],{documentId:docs.open,sectionId:sections.open,userId:users.a},q);
    });
    expect(resolved).toEqual([expect.objectContaining({id:String(sources.unbound),title:`${TAG}-unbound`})]);
  });
  it('withholds that source metadata from a different permitted document reader without changing the citation or hash',async()=>{
    const before=(await owner.query(`SELECT id,reference_id,payload_sha256,citation_text,created_by,created_at,frozen_at
      FROM authoring_citations WHERE id=$1 AND tenant_id=$2`,[bibliographyCitationId,orgId])).rows;
    expect(before).toEqual([expect.objectContaining({reference_id:String(sources.unbound),payload_sha256:sha('unbound')})]);
    const grant=(await owner.query(`INSERT INTO doc_permissions(doc_id,section_id,tenant_id,principal_id,role,granted_by)
      VALUES($1,NULL,$2,$3,'VIEWER',$4) RETURNING id`,[docs.open,orgId,String(users.reader),String(users.a)])).rows[0].id;
    try {
      const withheld=await asUser(users.reader,async q=>{
        const access=await getCurrentAuthoringReadScope(q,{organizationId:orgId,userId:users.reader,documentId:docs.open});
        expect(access.documentIds).toContain(docs.open);expect(access.sectionIds).toContain(sections.open);
        return listCitationSources(orgId,[sources.unbound],{documentId:docs.open,sectionId:sections.open,userId:users.reader},q);
      });
      expect(withheld).toEqual([]);
      expect((await owner.query(`SELECT id,reference_id,payload_sha256,citation_text,created_by,created_at,frozen_at
        FROM authoring_citations WHERE id=$1 AND tenant_id=$2`,[bibliographyCitationId,orgId])).rows).toEqual(before);
      expect((await owner.query('SELECT checksum FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2',
        [sources.unbound,orgId])).rows).toEqual([{checksum:sha('unbound')}]);
    } finally {
      await owner.query(`UPDATE doc_permissions SET revoked_at=now(),revoked_by=$2,
        revoke_reason='Native bibliography fixture completed' WHERE id=$1 AND tenant_id=$3`,[grant,String(users.a),orgId]);
    }
  });
  it('runs bibliography and Sources HTTP reads through actual JWT, object ACL and instrumented app_service tenant transactions',async()=>{
    const originalToken=await nativeHttpToken(users.a);
    const role=await request(httpApp).get('/api/native-rls-probe').set('Authorization',`Bearer ${originalToken}`);
    expect(role.status,JSON.stringify(role.body)).toBe(200);
    expect(role.body).toMatchObject({who:'app_service',rolsuper:false,rolbypassrls:false,enforced:'on',tenant:String(orgId)});
    const paths=[`/api/authoring/docs/${docs.open}/citations`,`/api/authoring/sections/${sections.open}/sources`];
    const positive=[];
    for (const path of paths) {
      const response=await request(httpApp).get(path).set('Authorization',`Bearer ${originalToken}`);
      expect(response.status,JSON.stringify(response.body)).toBe(200);positive.push(response.body);
    }
    expect(positive[0].find((row:{id:string})=>row.id===bibliographyCitationId).source_details)
      .toMatchObject({id:String(sources.unbound),title:`${TAG}-unbound`});
    expect(positive[1].sources.find((row:{citationId:string})=>row.citationId===bibliographyCitationId))
      .toMatchObject({source:{id:sources.unbound,title:`${TAG}-unbound`},citedChecksum:sha('unbound')});
    const grant=(await owner.query(`INSERT INTO doc_permissions(doc_id,section_id,tenant_id,principal_id,role,granted_by)
      VALUES($1,NULL,$2,$3,'VIEWER',$4) RETURNING id`,[docs.open,orgId,String(users.reader),String(users.a)])).rows[0].id;
    try {
      const peerToken=await nativeHttpToken(users.reader);const withheld=[];
      for (const path of paths) {
        const response=await request(httpApp).get(path).set('Authorization',`Bearer ${peerToken}`);
        expect(response.status,JSON.stringify(response.body)).toBe(200);withheld.push(response.body);
      }
      expect(withheld[0].find((row:{id:string})=>row.id===bibliographyCitationId))
        .toMatchObject({source_details:null,payload_sha256:sha('unbound')});
      expect(withheld[1].sources.find((row:{citationId:string})=>row.citationId===bibliographyCitationId))
        .toMatchObject({source:null,state:'unresolved',citedChecksum:sha('unbound')});
      expect(JSON.stringify(withheld)).not.toContain(`${TAG}-unbound`);
    } finally {
      await owner.query(`UPDATE doc_permissions SET revoked_at=now(),revoked_by=$2,
        revoke_reason='Native HTTP bibliography fixture completed' WHERE id=$1 AND tenant_id=$3`,[grant,String(users.a),orgId]);
    }
  });
});

describe('current related-parent scope before where-used projection',()=>{
  it('withholds private and unparented submissions while keeping readable placements',async()=>{
    for (const [name,parent] of [['readable',programs.public.id],['private',programs.b.id],['unparented',null]] as const) {
      const submission=(await owner.query(`INSERT INTO submissions(title,application_type,client_type,primary_region,organization_id,created_by,program_id)
        VALUES($1,'IND','sponsor','fda',$2,$3,$4) RETURNING id`,[`${TAG}-${name}`,orgId,users.a,parent])).rows[0].id;
      const sequence=(await owner.query(`INSERT INTO ectd_sequences(submission_id,region,sequence_number,organization_id,created_by)
        VALUES($1,'fda','0000',$2,$3) RETURNING id`,[submission,orgId,users.a])).rows[0].id;
      await owner.query(`INSERT INTO submission_leaves(sequence_id,section_code,title,organization_id,created_by,document_table,document_uuid)
        VALUES($1,'m1.1',$2,$3,$4,'vault_documents',$5)`,[sequence,`${TAG}-${name}-leaf`,orgId,users.a,programs.public.vault]);
    }
    const map=await asUser(users.a,q=>readVaultPlacements(q,orgId,[programs.public.vault],{userId:users.a}));
    expect(map.get(programs.public.vault)).toHaveLength(1);expect(map.get(programs.public.vault)?.[0].submissionTitle).toBe(`${TAG}-readable`);
  });
  it('withholds a private eSTAR export or a private retained counterpart',async()=>{
    for (const [name,parent,retained] of [['readable',programs.public,null],['private-export',programs.b,null],['private-retention',programs.public,programs.b.vault]] as const) {
      const metadata={source:'export_estar_pdf',programId:parent.id,attachments:[{source:{kind:'vault_document',documentId:programs.public.vault},fileName:name}],
        retention:retained ? {retained:true,documentId:retained,documentCode:`${TAG}-private-retained`} : {retained:false}};
      await owner.query(`INSERT INTO concept2cure_artifacts(artifact_id,project_id,organization_id,type,category,title,content,metadata,created_by_id)
        VALUES($1,$2,$3,'export','regulatory',$4,'QA metadata; no official export produced',$5::jsonb,$6)`,
      [`export-${randomUUID()}`,parent.project,orgId,`${TAG}-${name}`,JSON.stringify(metadata),users.a]);
    }
    const map=await asUser(users.a,q=>readVaultEstarUses(q,orgId,[programs.public.vault],{userId:users.a}));
    expect(map.get(programs.public.vault)).toHaveLength(1);expect(map.get(programs.public.vault)?.[0].fileName).toBe('readable');
  });
  it('keeps permitted CMC evidence without leaking a private compiled section key',async()=>{
    const key=`${TAG}-public-object`;
    const object=(await owner.query(`INSERT INTO cmc_source_objects(organization_id,project_id,source_type,source_key,source_payload,source_hash)
      VALUES($1,$2,'drug_substance',$3,'{}',$4) RETURNING id`,[orgId,programs.public.id,key,sha('{}')])).rows[0].id;
    const section=(await owner.query(`INSERT INTO cmc_module3_sections(organization_id,project_id,section_key,section_path,deterministic_json,compiled_hash)
      VALUES($1,$2,$3,'m3.2.s','{}',$4) RETURNING id`,[orgId,programs.b.id,`${TAG}-private-compiled`,sha('{}')])).rows[0].id;
    await owner.query(`INSERT INTO cmc_section_lineage(organization_id,section_id,source_object_id,source_hash_at_compile)
      VALUES($1,$2,$3,$4)`,[orgId,section,object,sha('{}')]);
    await owner.query(`INSERT INTO cmc_source_evidence(organization_id,program_id,source_type,source_key,vault_document_id,content_hash_at_link,reason,linked_by)
      VALUES($1,$2,'drug_substance',$3,$4,$5,'Native QA retained cross-project lineage fixture',$6)`,
    [orgId,programs.public.id,key,programs.public.vault,sha('public'),users.a]);
    const map=await asUser(users.a,q=>readVaultCmcEvidenceUses(q,orgId,[programs.public.vault],{userId:users.a}));
    expect(map.get(programs.public.vault)).toHaveLength(1);expect(map.get(programs.public.vault)?.[0].sections).toEqual([]);
  });
});
