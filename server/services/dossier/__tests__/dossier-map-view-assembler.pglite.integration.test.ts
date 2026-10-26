/** The retained tracking owner, on actual SQL with a bound accepted parent mapping. */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readProjectSectionTracking } from '../dossier-map-view-assembler';

let pg: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as Array<Record<string, unknown>> }) };
const ORG = 7;
const programFor = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const mapping = (id: number) => ({ programId: programFor(id), projectId: id, clientWorkspaceId: 100 });
const tracked = (id: number, org = ORG) => readProjectSectionTracking(q, org, id, mapping(id));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE projects(id serial PRIMARY KEY,organization_id int,status text,regulatory_program_id uuid,client_workspace_id int);
    CREATE TABLE project_sections(organization_id int,project_id int,section_code text,module text,title text,status text);`);
}, 60_000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM project_sections; DELETE FROM projects;'); });
async function project(org = ORG, status = 'active') {
  const result = await pg.query<{ id: number }>('INSERT INTO projects(organization_id,status,client_workspace_id) VALUES($1,$2,100) RETURNING id', [org,status]);
  const id = result.rows[0].id;
  await pg.query('UPDATE projects SET regulatory_program_id=$2 WHERE id=$1', [id,programFor(id)]);
  return id;
}
async function section(id: number, code: string, status: string | null, module: string | null = 'M2', title = 'Recorded title', org = ORG) {
  await pg.query('INSERT INTO project_sections VALUES($1,$2,$3,$4,$5,$6)', [org,id,code,module,title,status]);
}

describe('recorded section tracking retains its own basis and exact parent', () => {
  it('returns recorded names, labels, stages and server-derived counts/percentage', async () => {
    const p = await project();
    await section(p,'m2.5','signed','M2','Clinical overview');
    await section(p,'m2.7','drafting','M2','Clinical summary');
    expect(await tracked(p)).toEqual({ basis:'section_tracking',state:'measured',unmapped:[],modules:[{
      m:'2',label:'CTD summaries',counted:2,complete:1,unknownCount:0,pct:50,tone:'warn',sections:[
        {code:'m2.5',title:'Clinical overview',status:'signed',label:'2.5 Clinical overview',observedStatuses:['signed']},
        {code:'m2.7',title:'Clinical summary',status:'drafting',label:'2.7 Clinical summary',observedStatuses:['drafting']},
      ],
    }] });
  });

  it('does not mix sibling/foreign rows or a foreign parent into the figure', async () => {
    const p = await project(); const sibling = await project(); const foreign = await project(9);
    await section(p,'m2.5','drafting');
    await section(sibling,'m2.5','signed');
    await section(p,'m4.2.1','locked','M4','Foreign section',9);
    await section(foreign,'m5.3','locked','M5','Foreign parent');
    expect(await tracked(p)).toMatchObject({modules:[{m:'2',counted:1,complete:0,pct:0,tone:'idle'}]});
    expect(await tracked(foreign)).toMatchObject({state:'no_sections',modules:[],unmapped:[]});
    expect(await tracked(p,9)).toMatchObject({state:'no_sections',modules:[],unmapped:[]});
  });

  it.each(['archived','deleted'])('excludes a %s parent without manufacturing tracked rows', async status => {
    const p = await project(ORG,status); await section(p,'m2.5','signed');
    expect(await tracked(p)).toMatchObject({state:'no_sections',modules:[],unmapped:[]});
  });

  it('does not follow an accepted parent that changes its program or client mapping', async () => {
    const p = await project(); await section(p,'m2.5','signed');
    await pg.query('UPDATE projects SET regulatory_program_id=$2 WHERE id=$1',[p,programFor(999)]);
    expect(await tracked(p)).toMatchObject({state:'no_sections',modules:[],unmapped:[]});
    await pg.query('UPDATE projects SET regulatory_program_id=$2,client_workspace_id=101 WHERE id=$1',[p,programFor(p)]);
    expect(await tracked(p)).toMatchObject({state:'no_sections',modules:[],unmapped:[]});
  });
});

describe('tracking syntax, raw identity and duplicate observations', () => {
  it('retains most-advanced known duplicates and deterministic equal-rank title selection', async () => {
    const p = await project();
    await section(p,'m2.5','drafting','M2','Early title');
    await section(p,'m2.5','signed','M2','Z title');
    await section(p,'m2.5','signed','M2','A title');
    expect(await tracked(p)).toMatchObject({modules:[{counted:1,complete:1,pct:100,tone:'ok',sections:[
      {code:'m2.5',title:'A title',status:'signed',observedStatuses:['drafting','signed']},
    ]}]});
  });

  it.each(['future_status','__proto__',null])('withholds the dependent figure for unknown state %s', async status => {
    const p = await project(); await section(p,'m2.5',status);
    expect(await tracked(p)).toMatchObject({modules:[{counted:1,complete:0,unknownCount:1,pct:null,tone:null,sections:[{status,observedStatuses:[status]}]}]});
  });

  it('cannot hide an unknown duplicate behind a complete record', async () => {
    const p = await project();
    await section(p,'m2.5','locked','M2','Approved old title');
    await section(p,'m2.5','future_status','M2','New unassessed title');
    expect(await tracked(p)).toMatchObject({modules:[{counted:1,complete:0,unknownCount:1,pct:null,tone:null,sections:[
      {title:'New unassessed title',status:'future_status',observedStatuses:['future_status','locked']},
    ]}]});
  });

  it('does not collapse distinct recorded raw code aliases', async () => {
    const p = await project();
    await section(p,'m2.5','signed'); await section(p,'2.5','drafting');
    expect(await tracked(p)).toMatchObject({modules:[{counted:2,complete:1,pct:50,sections:[{code:'2.5'},{code:'m2.5'}]}]});
  });

  it('preserves invalid and contradictory placement as unmapped records', async () => {
    const p = await project();
    await section(p,'record4','locked','garbage4','Invalid section');
    await section(p,'m2.5','approved','garbage2','Invalid module');
    await section(p,'m3.2.S.1','signed','M4','Contradictory module');
    expect(await tracked(p)).toMatchObject({state:'measured',modules:[],unmapped:[
      {code:'m2.5',title:'Invalid module',module:'garbage2',reason:'INVALID_MODULE'},
      {code:'m3.2.S.1',title:'Contradictory module',module:'M4',reason:'MODULE_MISMATCH'},
      {code:'record4',title:'Invalid section',module:'garbage4',reason:'INVALID_SECTION_CODE'},
    ]});
  });

  it('uses valid code fallback only for absent modules and preserves regulatory order', async () => {
    const p = await project();
    for (const code of ['3.2.R','3.2.A','3.2.P','3.2.S.10','3.2.S.2']) await section(p,code,'signed',null);
    expect(await tracked(p)).toMatchObject({modules:[{m:'3',counted:5,complete:5,pct:100,sections:[
      {code:'3.2.S.2'},{code:'3.2.S.10'},{code:'3.2.P'},{code:'3.2.A'},{code:'3.2.R'},
    ]}]});
  });
});

describe('explicit tracking source states', () => {
  it('does not query without an accepted mapping or a valid anchor', async () => {
    const query = vi.fn();
    expect(await readProjectSectionTracking({query},ORG,null)).toMatchObject({state:'unanchored',modules:null,unmapped:null});
    expect(await readProjectSectionTracking({query},ORG,41)).toMatchObject({state:'unanchored',modules:null,unmapped:null});
    expect(await readProjectSectionTracking({query},ORG,41,mapping(42))).toMatchObject({state:'unanchored',modules:null,unmapped:null});
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['42P01','42703'])('keeps missing schema %s distinct from a measured empty source', async code => {
    const query = vi.fn().mockRejectedValue(Object.assign(new Error('schema missing'),{code}));
    expect(await readProjectSectionTracking({query},ORG,41,mapping(41))).toMatchObject({state:'unavailable',code:'STORE_UNAVAILABLE',modules:null,unmapped:null});
  });

  it('keeps failed or malformed sources unavailable without exposing error details', async () => {
    const failure = new Error('private connection detail');
    const failed = await readProjectSectionTracking({query:vi.fn().mockRejectedValue(failure)},ORG,41,mapping(41));
    expect(failed).toMatchObject({state:'unavailable',code:'READ_FAILED',modules:null,unmapped:null});
    expect(JSON.stringify(failed)).not.toContain('private connection detail');
    const query = vi.fn().mockResolvedValue({rows:[{section_code:'m2.5',module:'M2',title:'Clinical',status:{malformed:true}}]});
    expect(await readProjectSectionTracking({query},ORG,41,mapping(41))).toMatchObject({state:'unavailable',code:'READ_FAILED',modules:null,unmapped:null});
  });
});
