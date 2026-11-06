import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, any>>>,
  denied: new Set<string>(),
  permissionFailure: false,
  changed: false,
  releases: new Map<number, any>(),
  parents: {} as Record<string,string>,
  reviews: new Map<number,any>(),
  approval: 'valid',
}));
vi.mock('../../c2c/current-program-access', () => ({
  getCurrentAccessibleProgramScope: vi.fn(async (_q, input) => ({ actor: { userId: input.userId, role: 'member' }, programIds: input.programId ? [input.programId] : [], reconciliationRequired: false })),
  requireProgramScopeStillCurrent: vi.fn(async () => { if (state.changed) throw Object.assign(new Error('access changed'), { status: 503 }); }),
  verifiedProgramAnchors: vi.fn(() => [{ programId: '11111111-1111-4111-8111-111111111111', projectId: 1, clientWorkspaceId: 7 }]),
}));
vi.mock('../controlled-document-content', () => ({
  authorizeQmsContentRead: vi.fn(async (_q, _org, _user, row) => {
    if (state.permissionFailure) throw Object.assign(new Error('permission store failed'), { status: 503 });
    if (state.denied.has(String(row.authoring_document_id))) throw Object.assign(new Error('private document'), { status: 403 });
  }),
}));
vi.mock('../in-force-release', () => ({ readInForceReleases: vi.fn(async () => state.releases) }));
vi.mock('../periodic-review',()=>({readQmsReviewSchedule:vi.fn(async()=>({inForce:state.releases,reviews:state.reviews,dueOf:(row:Record<string,unknown>)=>state.reviews.get(Number(row.id))?.nextDue ?? row.next_review_date ?? null}))}));
vi.mock('../current-release-approval', () => ({
  readQmsTrainingReleaseContext: vi.fn(async () => ({ context: { eligible: state.approval==='valid', contentDigest: 'a'.repeat(64) }, approval: { state: state.approval, signatureId: 81 } })),
}));

import { authorizeQualityEvidenceSnapshot, readQualityProjectEvidence, readQualityRecordEvidence } from '../project-evidence';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const input = { organizationId: 2, userId: 9, programId: PROGRAM };
const q = { query: vi.fn(async (sql: string, args?: unknown[]) => {
  if (sql.startsWith('SELECT client_program_id FROM authoring_documents')) return {rows:[{client_program_id:state.parents[String(args?.[0])] ?? PROGRAM}]};
  const table = /FROM\s+(?:public\.)?([a-z_]+)\s+(?:AS\s+)?[a-z]/i.exec(sql)?.[1];
  let rows = state.rows[table ?? ''] ?? [];
  if (/authoring_sections/.test(sql)) rows = rows.filter(row => row.doc_id === args?.[0]);
  return { rows };
}) };

beforeEach(() => {
  state.rows = {}; state.denied.clear(); state.permissionFailure = false; state.changed = false; state.releases.clear(); state.reviews.clear();state.parents={};state.approval='valid';q.query.mockClear();
});

describe('native Quality evidence admission', () => {
  it('labels organization QA context and strips arbitrary metadata without changing stable identity', async () => {
    state.rows.qms_suppliers = [{ id: 3, organization_id: 2, supplier_name: 'Acme laboratory', approval_status: 'pending', metadata: { password: 'DO-NOT-PROJECT', accessToken: 'HIDDEN' } }];
    const first = await readQualityProjectEvidence(q, input);
    expect(first).toContainEqual(expect.objectContaining({ key: 'quality:qms_suppliers:3', sourceScope: 'organization', lifecycle: 'pending', native: { kind: 'qms_suppliers', id: '3' } }));
    expect(JSON.stringify(first)).not.toMatch(/DO-NOT-PROJECT|HIDDEN|generatedAt/);
    expect(await readQualityProjectEvidence(q, input)).toEqual(first);
  });

  it('omits denied authored text and propagates failed verification instead of an empty success', async () => {
    state.rows.qms_documents = [{ id: 4, organization_id: 2, doc_number: 'SOP-4', title: 'Private SOP', status: 'draft', version: '2.0', authoring_document_id: 'private', authoring_program_id: PROGRAM, metadata: { authoringContent: { sections: [{ content: 'SECRET PROSE' }] } } }];
    state.denied.add('private');
    expect(await readQualityProjectEvidence(q, input)).toEqual([]);
    state.permissionFailure = true;
    await expect(readQualityProjectEvidence(q, input)).rejects.toMatchObject({ status: 503 });
  });

  it('keeps the working revision distinct from its authorized release in force', async () => {
    const working = { id: 4, organization_id: 2, doc_number: 'SOP-4', title: 'A procedure', status: 'draft', version: '2.0', authoring_document_id: 'draft-copy', authoring_program_id: PROGRAM, metadata: {} };
    state.rows.qms_documents = [working];
    state.rows.authoring_sections = [{ id: 'section-draft', doc_id: 'draft-copy', code: 'purpose', title: 'Purpose', content: 'Draft revision', order_index: 1 }];
    const release = { ...working, status: 'effective', version: '1.0', authoring_document_id: 'released-copy', metadata: { authoringContent: { documentId: 'released-copy', programId: PROGRAM, sections: [{ id: 'old-section', code: 'purpose', title: 'Purpose', content: 'Released text', orderIndex: 1 }] } } };
    state.releases.set(4, { release, underRevision: true });
    const rows = await readQualityProjectEvidence(q, input);
    expect(rows.find(row => row.key === 'quality:qms_documents:4:working')).toMatchObject({ version: '2.0', lifecycle: 'draft', native: { authoringDocumentId: 'draft-copy' } });
    expect(rows.find(row => row.key === 'quality:qms_documents:4:release-in-force')).toMatchObject({ version: '1.0', lifecycle: 'effective', native: { authoringDocumentId: 'released-copy' } });
    expect(rows.find(row => row.key.endsWith(':release-in-force'))?.text).toContain('Released text');
    state.denied.add('released-copy');
    expect((await readQualityProjectEvidence(q, input)).some(row => row.key.endsWith(':release-in-force'))).toBe(false);
  });

  it('refuses a family overflow rather than silently losing native records', async () => {
    state.rows.qms_suppliers = Array.from({ length: 1001 }, (_, id) => ({ id, organization_id: 2, supplier_name: `Supplier ${id}`, approval_status: 'pending' }));
    await expect(readQualityProjectEvidence(q, input)).rejects.toMatchObject({ status: 503, code: 'QUALITY_EVIDENCE_UNAVAILABLE' });
  });

  it('keeps withdrawn approval historical and refuses an unavailable approval check',async()=>{
    const release={id:4,organization_id:2,doc_number:'SOP-4',title:'A procedure',status:'effective',version:'1.0',authoring_document_id:'released-copy',metadata:{authoringContent:{sections:[{content:'Retained release text'}]}}};
    state.rows.qms_documents=[release];state.releases.set(4,{release,underRevision:false});state.approval='withdrawn';
    const row=(await readQualityProjectEvidence(q,input)).find(snapshot=>snapshot.key.endsWith(':release-in-force'))!;
    expect(row.title).toContain('release record; approval withdrawn');
    expect(row.title).not.toContain('release in force');
    expect(JSON.parse(row.text).data.inForce).toBe(false);
    state.approval='unavailable';
    await expect(readQualityProjectEvidence(q,input)).rejects.toMatchObject({status:503});
  });

  it('rechecks current admission and returns null only for a genuinely absent selected identity', async () => {
    expect(await readQualityRecordEvidence(q, input, 'quality:qms_suppliers:999')).toBeNull();
    state.changed = true;
    await expect(readQualityProjectEvidence(q, input)).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    ['capa_records',{id:'capa-1',program_id:PROGRAM,state:'investigation',root_cause_analysis:{cause:'contamination'},source_refs:['sample-1'],effectiveness_check_result:{met:false}},'root_cause_analysis'],
    ['capa_actions',{id:'action-1',capa_id:'capa-1',state:'done',evidence_refs:['verification-1']},'evidence_refs'],
    ['qms_management_reviews',{id:3,organization_id:2,period:'2026Q4',inputs:{audits:'reviewed'},outputs:{actions:[{description:'Close gap'}]}},'outputs'],
    ['qmp_section_gating',{id:7,organization_id:2,qmp_id:8,section_key:'methods',section_name:'Methods',required_ctq_factor_ids:[9],minimum_mandatory_completion:100,minimum_recommended_completion:80,allow_override:false,override_requires_approval:true,override_requires_reason:true},'required_ctq_factor_ids'],
  ] satisfies Array<[string,Record<string,unknown>,string]>)('keeps canonical %s business facts and changes identity text when they change',async(table,record,field)=>{
    state.rows[String(table)]=[record];
    const first=await readQualityProjectEvidence(q,input);
    const snapshot=first.find(row=>row.native.kind===table)!;
    expect(snapshot.text).toContain(String(field));
    (record as Record<string,unknown>)[String(field)]={changed:'recorded fact'};
    expect((await readQualityProjectEvidence(q,input)).find(row=>row.native.kind===table)?.text).not.toBe(snapshot.text);
  });

  it('uses the exact retained authored parent for historical access, not the latest working copy grant',async()=>{
    const old='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    state.rows.qms_documents=[{id:4,organization_id:2,authoring_document_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',metadata:{retainedAuthoringDocuments:[old]}}];
    await expect(authorizeQualityEvidenceSnapshot(q,input,{kind:'qms_documents',id:'4',authoringDocumentId:old})).resolves.toBeUndefined();
    state.denied.add(old);
    await expect(authorizeQualityEvidenceSnapshot(q,input,{kind:'qms_documents',id:'4',authoringDocumentId:old})).rejects.toMatchObject({status:404});
  });

  it('tracks the canonical standing periodic review without rewriting or trusting the static register date',async()=>{
    state.rows.qms_documents=[{id:4,organization_id:2,doc_number:'SOP-4',title:'Legacy registration',status:'effective',version:'1.0',next_review_date:'2027-01-01',authoring_document_id:null}];
    const before=(await readQualityProjectEvidence(q,input))[0];
    state.reviews.set(4,{signatureId:8,version:'1.0',reviewedAt:'2026-11-06T12:00:00Z',outcome:'current',nextDue:'2027-03-01',nextReviewDate:'2027-03-01'});
    const after=(await readQualityProjectEvidence(q,input))[0];
    expect(after.text).not.toBe(before.text);
    expect(after.text).toContain('2027-03-01');
    expect(JSON.parse(after.text).data.record.next_review_date).toBe('2027-01-01');
  });

});

describe('native Quality evidence SQL admission',()=>{
  it('enforces project, tenant, workspace and exact training-version boundaries in SQL',async()=>{
    const db=new PGlite();
    const draft='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',old='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const foreign='22222222-2222-4222-8222-222222222222';
    const tables=['qms_change_controls','qms_nonconforming_products','capa_records','capa_actions','qms_suppliers','qc_deviations','qms_internal_audits','qms_management_reviews','qms_training_records','qms_training_assignments','qms_job_roles','qms_job_role_members','quality_management_plans','ctq_factors','qmp_section_gating','qmp_traceability_matrix','qms_change_links'];
    try {
      await db.exec(`CREATE TABLE regulatory_programs(id uuid,organization_id int,deleted_at timestamptz);
        CREATE TABLE authoring_documents(id uuid,tenant_id int,client_program_id uuid);
        CREATE TABLE authoring_sections(id text,doc_id uuid,tenant_id int,code text,title text,content text,order_index int);
        CREATE TABLE qms_documents(id int,organization_id int,doc_number text,title text,status text,version text,authoring_document_id uuid,metadata jsonb,deleted_at timestamptz,
          created_at timestamptz,updated_at timestamptz,doc_type text,category text,effective_date date,next_review_date date,author_id int,approver_id int,approved_at timestamptz,superseded_by_id int);
        CREATE TABLE qms_document_versions(id int,document_id int,organization_id int,version text,authoring_document_id uuid,sections jsonb,record_kind text);
        ${tables.map(table=>`CREATE TABLE ${table}(id text,organization_id int,program_id ${table==='capa_records'?'text':'uuid'},deleted_at timestamptz,client_workspace_id int,document_id int,document_version text,change_id int,job_role_id int,qmp_id int,capa_id text,status text,title text,supplier_name text,approval_status text);`).join('\n')}`);
      await db.query('INSERT INTO regulatory_programs VALUES($1,2,NULL),($2,2,NULL)',[PROGRAM,foreign]);
      await db.query('INSERT INTO authoring_documents VALUES($1,2,$3),($2,2,$3)',[draft,old,PROGRAM]);
      await db.query(`INSERT INTO qms_documents(id,organization_id,doc_number,title,status,version,authoring_document_id,metadata,deleted_at) VALUES(4,2,'SOP-4','Private successor','draft','2.0',$1,'{}',NULL)`,[draft]);
      await db.query(`INSERT INTO qms_document_versions VALUES(11,4,2,'1.0',$1,'[{"content":"Retained allowed text"}]','signed')`,[old]);
      await db.exec(`INSERT INTO qms_training_records(id,organization_id,document_id,document_version) VALUES('1',2,4,'1.0'),('2',2,4,'2.0');
        INSERT INTO qms_training_assignments(id,organization_id,document_id) VALUES('3',2,4);
        INSERT INTO qms_suppliers(id,organization_id,supplier_name,approval_status) VALUES('4',2,'Our supplier','pending'),('5',3,'Foreign supplier','approved');
        INSERT INTO qc_deviations(id,organization_id,client_workspace_id,title) VALUES('6',2,7,'Our client'),('7',2,8,'Other client'),('8',2,NULL,'Organization deviation');`);
      await db.query(`INSERT INTO qms_change_controls(id,organization_id,program_id,title) VALUES('9',2,$1,'Our change'),('10',2,$2,'Other project'),('11',3,$1,'Other tenant'),('12',2,NULL,'Organization change')`,[PROGRAM,foreign]);
      state.denied.add(draft);
      const statements:string[]=[];
      const reader={query:async(sql:string,args?:unknown[])=>{statements.push(sql);return db.query(sql,args);}};
      const rows=await readQualityProjectEvidence(reader,input);
      const joined=rows.map(row=>row.text).join('\n');
      expect(joined).not.toMatch(/Private successor|Foreign supplier|Other client|Other project|Other tenant/);
      expect(joined).toMatch(/Retained allowed text/);
      expect(rows.filter(row=>row.native.kind==='qms_training_records')).toEqual([expect.objectContaining({native:{kind:'qms_training_records',id:'1'},sourceScope:'project'})]);
      expect(rows.some(row=>row.native.kind==='qms_training_assignments')).toBe(false);
      expect(statements.some(sql=>sql.startsWith('SELECT d.*'))).toBe(false);
      expect(statements.some(sql=>sql.startsWith('SELECT v.*'))).toBe(true);
      expect(rows.filter(row=>row.native.kind==='qms_change_controls').map(row=>[row.native.id,row.sourceScope])).toEqual([['12','organization'],['9','project']]);
    } finally {await db.close();}
  },20000);
});
