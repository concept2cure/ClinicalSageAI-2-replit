/** Independent native regression: an editor save does not accept imported prose.
 * Uses canonical CSR import, real JWTs, and the deployed non-owner RLS role.
 * The original source, CREATE receipt, and revision genesis are never rewritten. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { parse } from 'node-html-parser';
import { databaseUrl } from '../setup.db';

const TAG = `formatlineage-${process.pid}-${Date.now().toString(36)}`;
const REASON = 'Isolated native formatting and unchanged-prose provenance verification.';
const A = 'Participants were monitored throughout the study.';
const B = 'Safety visits followed the recorded schedule.';
const TABLE = `<table><tbody><tr><th>Visit</th><th>Assessment</th></tr><tr><td>Baseline</td><td>${B}</td></tr></tbody></table>`;
const ORIGINAL = `<p>${A}</p>${TABLE}`;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=';
const FIGURE = `<img src="${PNG}" alt="" width="1" height="1">`;
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let projectId: number;
let programId: string;
type Actor = { id: number; email: string; token: string };
const actors = {} as Record<'importer' | 'editor', Actor>;
type Span = { id: string; char_start: number; char_end: number; span_text_sha256: string;
  provenance_kind: string; machine_author_id: string | null; asserted_by: string | null;
  asserted_at: string | null; signature_id: string | null; usage: string;
  confidence: number | null; created_by: string | null };
type Copied = { docId: string; sectionId: string; sourceJobId: number; original: string };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
// Independent reader, not the production carry-forward comparison function.
const visible = (html: string) => parse(html.replace(/<\/(?:p|td|th|tr|div|h[1-6])>/gi, '$& ')).text.replace(/\s+/g, ' ').trim();
const post = (body: unknown) => request(app).post('/api/authoring/import/source').set('Authorization', `Bearer ${actors.importer.token}`).send(body);
const patchSection = (copy: Copied, content: string, extra: Record<string, unknown> = {}) => request(app)
  .patch(`/api/authoring/sections/${copy.sectionId}`).set('Authorization', `Bearer ${actors.editor.token}`)
  .send({ content, changeReason: REASON, ...extra });

async function copySource(content = ORIGINAL): Promise<Copied> {
  const job = (await owner.query(`INSERT INTO csr_build_jobs
    (organization_id,project_id,study_id,status,progress,sections_to_generate,study_info_snapshot,requested_by)
    VALUES ($1,$2,$3,'complete',100,ARRAY['1'],$4::jsonb,$5) RETURNING id`,
  [orgId,projectId,`${TAG}-${randomUUID()}`,JSON.stringify({title:TAG}),actors.importer.id])).rows[0];
  await owner.query(`INSERT INTO csr_section_outputs
    (organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model,lineage)
    VALUES ($1,$2,$3,'1',$4,$5,false,NULL,'{}'::jsonb)`,[orgId,projectId,job.id,content,sha(content)]);
  const source = {kind:'csr',jobId:Number(job.id),sectionNumbers:['1']};
  const preview = await post({programId,source,previewOnly:true});
  expect(preview.status,JSON.stringify(preview.body)).toBe(200);
  const imported = await post({programId,source,reason:REASON,expectedFingerprint:preview.body.data.fingerprint});
  expect([200,201],JSON.stringify(imported.body)).toContain(imported.status);
  const data = imported.body.data;
  return {docId:data.doc.id,sectionId:data.sections[0].id,sourceJobId:Number(job.id),original:data.sections[0].content};
}
async function live(copy: Copied): Promise<{ content: string; spans: Span[] }> {
  const section = (await owner.query('SELECT content FROM authoring_sections WHERE id=$1::uuid AND tenant_id=$2',[copy.sectionId,orgId])).rows[0];
  const spans = (await owner.query<Span>(`SELECT id,char_start,char_end,span_text_sha256,provenance_kind,machine_author_id,
    asserted_by,asserted_at,signature_id,usage,confidence,created_by FROM document_span_lineage
    WHERE organization_id=$1 AND document_table='authoring_sections' AND document_id=$2 AND deleted_at IS NULL
    ORDER BY char_start,char_end,id`,[orgId,copy.sectionId])).rows;
  for (const span of spans) expect(span.span_text_sha256).toBe(sha(section.content.slice(span.char_start,span.char_end)));
  return {content:section.content,spans};
}
async function immutable(copy: Copied) {
  return (await owner.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id) FROM authoring_audit_trail a
      WHERE a.tenant_id=$1 AND a.doc_id=$2::uuid AND a.operation_type='CREATE') AS receipt,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.id) FROM doc_revisions r
      WHERE r.tenant_id=$1 AND r.section_id=$3::uuid AND r.origin='genesis') AS genesis,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM csr_section_outputs s
      WHERE s.organization_id=$1 AND s.job_id=$4) AS source`,[orgId,copy.docId,copy.sectionId,copy.sourceJobId])).rows[0];
}
async function fullState(copy: Copied) {
  return (await owner.query(`SELECT
    (SELECT to_jsonb(s) FROM authoring_sections s WHERE s.tenant_id=$1 AND s.id=$2::uuid) AS section,
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM document_span_lineage l
      WHERE l.organization_id=$1 AND l.document_table='authoring_sections' AND l.document_id=$2::text) AS lineage,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM doc_revisions r WHERE r.tenant_id=$1 AND r.section_id=$2::uuid) AS revisions,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM authoring_audit_trail a WHERE a.tenant_id=$1 AND a.doc_id=$3::uuid) AS audit`,
  [orgId,copy.sectionId,copy.docId])).rows[0];
}
async function noAuthority(copy: Copied) {
  const row = (await owner.query(`SELECT
    (SELECT count(*)::int FROM authoring_signatures WHERE doc_id=$1::uuid) AS signatures,
    (SELECT count(*)::int FROM frozen_documents WHERE document_id=$1::uuid) AS frozen,
    (SELECT count(*)::int FROM authoring_exports WHERE doc_id=$1::text) AS exports`,[copy.docId])).rows[0];
  expect(row).toEqual({signatures:0,frozen:0,exports:0});
}
function machineProse(state: Awaited<ReturnType<typeof live>>) {
  return state.spans.filter(span=>span.provenance_kind==='machine_draft')
    .map(span=>visible(state.content.slice(span.char_start,span.char_end))).filter(Boolean).join(' ');
}
function humanProse(state: Awaited<ReturnType<typeof live>>) {
  return state.spans.filter(span=>span.provenance_kind==='author_assertion')
    .map(span=>visible(state.content.slice(span.char_start,span.char_end))).filter(Boolean).join(' ');
}
function expectUnacceptedIdentity(state: Awaited<ReturnType<typeof live>>) {
  const machine = state.spans.filter(span=>span.provenance_kind==='machine_draft');
  expect(machine.length).toBeGreaterThan(0);
  for (const span of machine) expect(span).toMatchObject({machine_author_id:'workflow_import',asserted_by:null,
    asserted_at:null,signature_id:null,usage:'asserted',confidence:null,created_by:String(actors.importer.id)});
  expect(state.spans.some(span=>span.provenance_kind==='accepted_machine_draft')).toBe(false);
}
async function expectFormatting(copy: Copied, content: string) {
  const kept = await immutable(copy);
  expect(kept.receipt).not.toBeNull(); expect(kept.genesis).not.toBeNull();
  const saved = await patchSection(copy,content);
  expect(saved.status,JSON.stringify(saved.body)).toBe(200);
  const current = await live(copy);
  expectUnacceptedIdentity(current);
  expect(machineProse(current)).toBe(visible(copy.original));
  expect(humanProse(current)).toBe('');
  expect(await immutable(copy)).toEqual(kept);
  await noAuthority(copy);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must name the real non-owner runtime role.');
  owner = new Pool({connectionString:databaseUrl,max:4});
  runtime = new Pool({connectionString:process.env.APP_DATABASE_URL,max:4});
  const organization = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid",[TAG])).rows[0];
  orgId = Number(organization.id); orgUuid = String(organization.uuid);
  for (const key of ['importer','editor'] as const) {
    const email = `${TAG}-${key}@example.invalid`;
    const person = (await owner.query("INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id",
      [email,`Native formatting ${key}`,await bcrypt.hash('Formatting-QA-Only-2026!',4)])).rows[0];
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')",[orgId,person.id]);
    actors[key] = {id:Number(person.id),email,token:jwt.sign({type:'access',id:String(person.id),userId:String(person.id),
      organizationId:String(orgId),role:'admin',roles:['RA_CMC','QA'],email},process.env.JWT_SECRET_DEV || process.env.JWT_SECRET!,{expiresIn:'1h'})};
  }
  const workspace = (await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug,status,created_by_id)
    VALUES($1,$2,$2,'active',$3) RETURNING id`,[orgId,TAG,actors.importer.id])).rows[0];
  programId = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
    VALUES($1,$2,$3::text,$3::text,'IND','drug','FDA',$3::text)`,[programId,orgId,TAG]);
  const project = (await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,created_by_id,owner_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}') RETURNING id`,[orgId,workspace.id,TAG,actors.importer.id,programId])).rows[0];
  projectId = Number(project.id);
  await owner.query("INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,$2,'private')",[projectId,orgId]);
  const {authMiddleware} = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/authoring',authMiddleware,(await import('../../server/routes/authoring.router')).default);
},120_000);
afterAll(async () => {
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1 AND slug=$2",[orgId,TAG]);
  await runtime?.end();
  const {getPool} = await import('../../server/db/runtime');
  await getPool().end().catch(()=>undefined);
  await owner?.end();
});

describe('canonical import under the restricted native runtime',() => {
  it('uses real NOSUPERUSER NOBYPASSRLS and forced tenant RLS',async () => {
    const role = (await runtime.query('SELECT current_user AS who,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(role).toMatchObject({who:'app_service',rolsuper:false,rolbypassrls:false});
    const {getPool} = await import('../../server/db/runtime');
    const {runWithTenantScope} = await import('../../server/db/tenantStore');
    const configured = await runWithTenantScope({tenantId:String(orgId),orgUuid,role:'admin',source:'test',caller:'format-lineage-native-role'},
      ()=>getPool().query('SELECT current_user AS who'));
    expect(configured.rows[0].who).toBe(role.who);
    const policies = (await runtime.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid IN ('authoring_documents'::regclass,'authoring_sections'::regclass,'document_span_lineage'::regclass)`)).rows;
    expect(policies).toHaveLength(3);
    for (const policy of policies) expect(policy).toMatchObject({relrowsecurity:true,relforcerowsecurity:true});
  });
  it('starts with actual workflow_import machine-draft prose and immutable source receipts',async () => {
    const copy = await copySource();
    const current = await live(copy);
    expectUnacceptedIdentity(current);
    expect(machineProse(current)).toBe(visible(copy.original));
    expect(humanProse(current)).toBe('');
    const kept = await immutable(copy);
    expect(kept.receipt.length).toBeGreaterThan(0); expect(kept.genesis.length).toBeGreaterThan(0);
    expect(kept.genesis[0]).toMatchObject({content:copy.original,content_sha256:sha(copy.original),origin:'genesis'});
    await noAuthority(copy);
  });
});

const formatting = [
  {name:'strong wrappers around unchanged narrative',source:ORIGINAL,content:`<p>Participants were <strong>monitored</strong> throughout the study.</p>${TABLE}`},
  {name:'paragraph alignment and printing attributes',source:ORIGINAL,content:`<p style="text-align: left; margin-top: 0px;">${A}</p>${TABLE}`},
  {name:'a figure placed before unchanged narrative',source:ORIGINAL,content:`<p>${FIGURE}${A}</p>${TABLE}`},
  {name:'a figure inserted inside unchanged narrative',source:ORIGINAL,content:`<p>Participants were ${FIGURE}monitored throughout the study.</p>${TABLE}`},
  {name:'TipTap table paragraph/strong wrappers and default spans',source:ORIGINAL,content:`<p>${A}</p><table><tbody><tr><th colspan="1" rowspan="1"><p><strong>Visit</strong></p></th><th colspan="1" rowspan="1"><p><strong>Assessment</strong></p></th></tr><tr><td colspan="1" rowspan="1"><p>Baseline</p></td><td colspan="1" rowspan="1"><p>${B}</p></td></tr></tbody></table>`},
  {name:'table colgroup and printing width normalization',source:ORIGINAL,content:`<p>${A}</p><table style="min-width: 100px;"><colgroup><col style="width: 40px;"><col style="width: 60px;"></colgroup><tbody><tr><th style="width: 40px;">Visit</th><th style="width: 60px;">Assessment</th></tr><tr><td>Baseline</td><td>${B}</td></tr></tbody></table>`},
  {name:'exact scientific characters represented by HTML entities',source:'<p>Dose was 10 µg at 37 °C; response was ≤ 5 %.</p>',content:'<p>Dose was <strong>10 &micro;g</strong> at 37 &deg;C; response was &le; 5 %.</p>'},
];
describe('formatting does not create human scientific authority',() => {
  it.each(formatting)('preserves unaccepted provenance for $name',async ({source,content}) => {
    await expectFormatting(await copySource(source),content);
  });
});

describe('semantic changes and adversarial claims remain bounded',() => {
  it('attributes the changed clinical clause to its actual editor while retaining unchanged table prose',async () => {
    const copy = await copySource(); const kept = await immutable(copy);
    const changed = 'Participants were monitored twice daily throughout the study.';
    const saved = await patchSection(copy,`<p>${changed}</p>${TABLE}`);
    expect(saved.status,JSON.stringify(saved.body)).toBe(200);
    const current = await live(copy); expectUnacceptedIdentity(current);
    expect(machineProse(current)).toContain(B); expect(machineProse(current)).not.toContain(changed);
    expect(humanProse(current)).toBe(changed);
    for (const span of current.spans.filter(s=>s.provenance_kind==='author_assertion')) {
      expect(span.asserted_by).toBe(String(actors.editor.id)); expect(span.asserted_at).not.toBeNull();
      expect(span.signature_id).toBeNull();
    }
    expect(await immutable(copy)).toEqual(kept); await noAuthority(copy);
  });
  it('cannot credit more repeated occurrences than the prior machine draft actually held',async () => {
    const copy = await copySource(`<p>${A}</p>`);
    const saved = await patchSection(copy,`<p><strong>${A}</strong></p><p>${A}</p>`);
    expect(saved.status,JSON.stringify(saved.body)).toBe(200);
    const current = await live(copy); expectUnacceptedIdentity(current);
    expect(machineProse(current)).toBe(A); expect(humanProse(current)).toBe(A);
    await noAuthority(copy);
  });
  it('does not let a forged acceptance turn receipt accept already imported prose',async () => {
    const copy = await copySource(); const kept = await immutable(copy);
    const saved = await patchSection(copy,`<p><strong>${A}</strong></p>${TABLE}`,{
      acceptedAuthors:['workflow_import'],acceptedMachineText:[{authorId:'workflow_import',text:copy.original,turnRecordId:randomUUID()}],
    });
    expect(saved.status,JSON.stringify(saved.body)).toBe(200);
    const current = await live(copy); expectUnacceptedIdentity(current);
    expect(machineProse(current)).toBe(visible(copy.original)); expect(humanProse(current)).toBe('');
    expect(await immutable(copy)).toEqual(kept); await noAuthority(copy);
  });
  it('refuses a corrupt prior live machine hash atomically instead of minting human authority',async () => {
    const copy = await copySource(); const original = await immutable(copy);
    const current = await live(copy); const victim = current.spans.find(s=>s.provenance_kind==='machine_draft')!;
    // Only this isolated mutable live span is corrupted. Immutable receipts remain intact.
    await owner.query('UPDATE document_span_lineage SET span_text_sha256=$1 WHERE id=$2 AND organization_id=$3',
      [sha('corrupt native fixture, never authoritative prose'),victim.id,orgId]);
    const before = await fullState(copy);
    const saved = await patchSection(copy,`<p><strong>${A}</strong></p>${TABLE}`);
    expect(saved.status,JSON.stringify(saved.body)).toBe(500);
    expect(saved.body.error.code).toBe('LINEAGE_REQUIRED');
    expect(await fullState(copy)).toEqual(before); expect(await immutable(copy)).toEqual(original);
    await noAuthority(copy);
  });
  it('does not carry table provenance when identical words acquire different header associations',async () => {
    const copy = await copySource(); const kept = await immutable(copy);
    const saved = await patchSection(copy,`<p>${A}</p><table><tbody><tr><th>Assessment</th><th>Visit</th></tr><tr><td>Baseline</td><td>${B}</td></tr></tbody></table>`);
    expect(saved.status,JSON.stringify(saved.body)).toBe(200);
    const current = await live(copy); expectUnacceptedIdentity(current);
    expect(machineProse(current)).toBe(A); expect(humanProse(current)).toContain(B);
    expect(await immutable(copy)).toEqual(kept); await noAuthority(copy);
  });
});

describe('unsupported retained-prose markup cannot silently manufacture authority',() => {
  it.each([
    {name:'a title containing an additional statement',content:`<p title="Additional statement">${A}</p>${TABLE}`},
    {name:'an unsupported data attribute',content:`<p data-custom="additional-statement">${A}</p>${TABLE}`},
  ])('refuses $name atomically',async ({content}) => {
    const copy = await copySource(); const kept = await immutable(copy);
    const before = await fullState(copy);
    const saved = await patchSection(copy,content);
    expect(saved.status,JSON.stringify(saved.body)).toBe(422);
    expect(saved.body.error.code).toBe('MACHINE_LINEAGE_FORMATTING_UNVERIFIED');
    expect(await fullState(copy)).toEqual(before); expect(await immutable(copy)).toEqual(kept);
    expectUnacceptedIdentity(await live(copy)); await noAuthority(copy);
  });
});
