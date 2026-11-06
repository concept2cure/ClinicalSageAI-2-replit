import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fallback: vi.fn(), collect: vi.fn(), scope: vi.fn(), anchors: vi.fn(), current: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.fallback }, getPool: () => ({}) }));
vi.mock('../../qms/project-evidence', () => ({
  readQualityProjectEvidence: h.collect,
  QualityEvidenceUnavailable: class extends Error { constructor(message = 'Current Quality evidence is unavailable.') { super(message); this.name = 'QualityEvidenceUnavailable'; } },
}));
vi.mock('../../c2c/current-program-access', async original => ({ ...await original<typeof import('../../c2c/current-program-access')>(),
  getCurrentAccessibleProgramScope: h.scope, verifiedProgramAnchors: h.anchors, requireProgramScopeStillCurrent: h.current,
}));

import { reportAvailability } from '../report-engine';
import { computeDomainReport } from '../research-compliance-report-providers';
import { computeDomainRun } from '../report-engine';
import { gapsWereEvaluated, renderReport } from '../render/render';
import { evaluateTruthfulness } from '../truthfulness';
import { REPORT_TYPE_SEED } from '../taxonomy';
import { buildRunPdf } from '../pdf/run-pdf';

const TYPE = 'compliance.audit_assurance_pack';
const LIMIT = 'Quality evidence completeness is not assessed. Audit-chain integrity and compliance controls are not assessed.';
const A = '00000000-0000-4000-8000-000000000011', B = '00000000-0000-4000-8000-000000000012';
const q = { query: vi.fn() };
const recordContext = { userId: 5, executor: q };
const records = [
  { key: 'quality:qms_documents:1:working', title: 'Project procedure', text: '{"status":"draft"}', version: '2', sourceScope: 'project', native: { kind: 'qms_documents', id: '1' }, lifecycle: 'draft' },
  { key: 'quality:qms_internal_audits:2', title: 'Organization audit', text: '{"status":"planned"}', version: null, sourceScope: 'organization', native: { kind: 'qms_internal_audits', id: '2' }, lifecycle: 'planned' },
];
const scope = { actor: { userId: 5, role: 'member' }, programIds: [A, B], reconciliationRequired: false };
beforeEach(() => {
  vi.clearAllMocks();
  h.scope.mockResolvedValue(scope);
  h.anchors.mockReturnValue([{ projectId: 11, programId: A, clientWorkspaceId: 71 }, { projectId: 12, programId: B, clientWorkspaceId: 72 }]);
  h.current.mockResolvedValue(undefined);
  h.collect.mockImplementation(async (_q, input) => input.programId === A ? records : [records[1]]);
});

describe('native Quality report text fidelity',()=>{
  it.each(['view','PDF'])('preserves clinical limits, literal prose and unresolved semantic marks in the %s',async(target)=>{
    const plain='pH < 6 and temperature > 30 C; impurity <LOQ; temperature <critical> threshold; literal &amp;lt; and &lt; stay unchanged.';
    const html='<p>Bioburden 10<sup>6</sup> CFU/mL; pH &lt; 6 and temperature &gt; 30 C; encoded &amp;lt;.</p><p>Proposed dose <del data-author-name="QA reviewer">20 mg</del><ins>40 mg</ins>.</p>';
    const projected='Bioburden 10^6 CFU/mL; pH < 6 and temperature > 30 C; encoded &lt;. Proposed dose [-20 mg-][+40 mg+].';
    const inline='10<sup>6</sup> CFU; limit &lt;5; literal &amp;lt;. <ins>value &lt; 5</ins>';
    const projectedInline='10^6 CFU; limit <5; literal &lt;. [+value < 5+]';
    const qualification='Working record; pending changes are not approved.';
    const nativeRecords=[
      {...records[0],key:'quality:qms_nonconforming_products:41',title:'Nonconformance: NC-41',native:{kind:'qms_nonconforming_products',id:'41'},
        text:JSON.stringify({data:{record:{nc_number:'NC-41',description:plain}}})},
      {...records[0],title:'SOP-001 Working procedure',text:JSON.stringify({data:{record:{doc_number:'SOP-001'},
        contentBasis:qualification,sections:[{title:'Acceptance criteria',content:html},{title:'Inline criteria',content:inline}]}})},
    ];
    const summary={computedScope:'project',domain:{qualityEvidence:{schemaVersion:1,records:nativeRecords,limits:[LIMIT]}}};
    const original=JSON.stringify(summary);
    const report=renderReport({reportTypeId:TYPE,reportTypeLabel:'Quality assurance pack',scopeType:'project',scopeId:'11',status:'partial',providers:[],blockers:[LIMIT],summary});
    const visible=report.sections.flatMap(section=>section.blocks).filter(block=>block.kind==='table')
      .flatMap(block=>block.kind==='table' ? block.rows.map(row=>row.join(' ')) : []).join('\n');
    let output=visible;
    if (target==='PDF') {
      const at='2026-11-06T00:00:00.000Z';
      const {bytes}=await buildRunPdf({report,typeLabel:'Quality assurance pack',seal:null,runBy:'QA reviewer',exportId:'quality-fidelity',exportedAt:at,
        run:{id:19,runUuid:'quality-fidelity-run',reportTypeId:TYPE,scopeType:'project',scopeId:'11',status:'partial',confidence:0,createdAt:new Date(at)}});
      const {PDFParse}=(await import('pdf-parse')) as unknown as {PDFParse:new(options:{data:Buffer})=>{getText():Promise<{text:string}>}};
      output=(await new PDFParse({data:bytes}).getText()).text.replace(/\s+/g,' ');
      expect(output).toContain('NOT FINAL (PARTIAL)');
      expect(output).toContain(LIMIT);
    }
    expect(output).toContain(plain);
    expect(output).toContain(projected);
    expect(output).toContain(projectedInline);
    expect(output).toContain(qualification);
    expect(JSON.stringify(summary)).toBe(original);
    expect(report.status).toBe('partial');
    expect(JSON.stringify(report.sections)).toContain(LIMIT);
  });
});

describe('the existing assurance pack computes native Quality facts', () => {
  it('routes the existing type only to supported Quality scopes', () => {
    expect(reportAvailability(TYPE, 'project', ['project'])).toMatchObject({ engine: 'domain', runnable: true, computedScope: 'project' });
    expect(reportAvailability(TYPE, 'account', ['account'])).toMatchObject({ engine: 'domain', runnable: true, computedScope: 'organization' });
    expect(reportAvailability(TYPE, 'document', ['document']).runnable).toBe(false);
    expect(reportAvailability(TYPE, 'submission', ['submission']).runnable).toBe(false);
  });

  it('requires a current verified actor and executor instead of producing an empty or organization report', async () => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11' })).rejects.toThrow(/current actor|current.*context/i);
  });

  it('passes the exact admitted project, actor and executor to the canonical reader and retains its facts', async () => {
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', clientWorkspaceId: 71, recordContext });
    expect(h.scope).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 });
    expect(h.anchors).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 }, scope);
    expect(h.collect).toHaveBeenCalledTimes(2);
    expect(h.collect).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5, programId: A });
    expect(h.current).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 }, scope);
    expect(report).toMatchObject({ computedScope: 'project', accessProjectIds: [11], criticalBlockers: [LIMIT],
      summary: { projectEvidenceSnapshots: 1, organizationEvidenceSnapshots: 1, qualityEvidence: { records, limits: expect.arrayContaining([LIMIT]) } },
      provider: { status: 'partial', atoms: [{ sourceTable: 'qms_documents', recordId: '1', transformation: 'direct_copy' }, { sourceTable: 'qms_internal_audits', recordId: '2', transformation: 'direct_copy' }] } });
    expect(JSON.stringify(report)).not.toContain(B);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('deduplicates organization context and retains only projects contributing evidence in an organization run', async () => {
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext });
    expect(h.collect.mock.calls.map(([, input]) => input.programId)).toEqual([A, B, A, B]);
    expect(report).toMatchObject({ computedScope: 'organization', accessProjectIds: [11],
      summary: { projectEvidenceSnapshots: 1, organizationEvidenceSnapshots: 1, qualityEvidence: { records } } });
    expect(JSON.stringify(report)).not.toContain(B);
  });

  it('reads explicit organization context when there are no accessible projects, without inventing an empty completeness result', async () => {
    h.scope.mockResolvedValue({ ...scope, programIds: [] }); h.anchors.mockReturnValue([]);
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext });
    expect(h.collect).toHaveBeenCalledTimes(2);
    expect(h.collect).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5, programId: null });
    expect(report).toMatchObject({ accessProjectIds: [], summary: { projectEvidenceSnapshots: 0, organizationEvidenceSnapshots: 1 }, provider: { status: 'partial' } });
    h.collect.mockResolvedValue([]);
    const empty = await computeDomainRun(TYPE, 7, 'account', '7', { recordContext });
    expect(empty).toMatchObject({ confidence: null, criticalBlockers: [LIMIT], providers: [{ status: 'missing' }] });
    expect(empty.blockers.join(' ')).toContain('No admitted Quality evidence');
  });

  it.each(['99', '0', A, '11.0'])('refuses a private, missing or malformed tracking project %s without an organization fallback', async scopeId => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId, recordContext })).rejects.toThrow(/project.*verified/);
    expect(h.collect).not.toHaveBeenCalled();
  });

  it('refuses an unverified client claim, unsupported scope, and another organization account', async () => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', clientWorkspaceId: 72, recordContext })).rejects.toThrow(/client workspace/);
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', clientWorkspaceId: 71, recordContext })).rejects.toMatchObject({ code: 'REPORT_CLIENT_SCOPE_UNSUPPORTED' });
    for (const options of [{ scopeType: 'submission', scopeId: '11' }, { scopeType: 'document', scopeId: A }, { scopeType: 'account', scopeId: '8' }]) {
      await expect(computeDomainReport(TYPE, 7, { ...options, recordContext })).rejects.toThrow(/verified project|organization/);
    }
    expect(h.collect).not.toHaveBeenCalled();
  });

  it('propagates collector failure, observed access revocation and conflicting snapshots instead of reporting partial counts', async () => {
    h.collect.mockRejectedValueOnce(new Error('Native evidence unreadable'));
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', recordContext })).rejects.toThrow('Native evidence unreadable');
    h.current.mockRejectedValueOnce(Object.assign(new Error('Access changed'), { code: 'PROJECT_ACCESS_CHANGED' }));
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', recordContext })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
    h.collect.mockImplementation(async (_q, input) => input.programId === A ? records : [{ ...records[1], lifecycle: 'changed' }]);
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('cannot finalize native facts as audit assurance under the existing type rules', async () => {
    const report = await computeDomainRun(TYPE, 7, 'project', '11', { recordContext });
    expect(gapsWereEvaluated(report.summary)).toBe(false);
    expect(evaluateTruthfulness({ requestedStatus: 'final', confidence: report.confidence, blockers: report.blockers,
      criticalBlockers: report.criticalBlockers, gapsSection: gapsWereEvaluated(report.summary), disclosure: false },
    REPORT_TYPE_SEED.find(type => type.typeId === TYPE)!.truthfulnessRules)).toMatchObject({ allowedStatus: 'partial', downgradedFrom: 'final' });
  });

  it('renders project evidence and organization context separately with its unassessed checks', () => {
    const report = renderReport({ reportTypeId: TYPE, reportTypeLabel: 'Compliance & Audit Assurance Pack',
      scopeType: 'project', scopeId: '11', generatedAt: '2026-11-06T00:00:00.000Z', status: 'partial',
      providers: [{ provider: 'quality_project_evidence', observedAt: '2026-11-06T00:00:00.000Z', status: 'partial' }],
      blockers: [LIMIT], summary: { computedScope: 'project', domain: { qualityEvidence: { schemaVersion: 1, records, limits: [LIMIT] } } } });
    expect(report.sections.find(section => section.id === 'quality-project-evidence')?.title).toBe('Project Quality evidence');
    expect(report.sections.find(section => section.id === 'quality-organization-context')?.title).toBe('Organization Quality-system context');
    const body = JSON.stringify(report);
    expect(body).toContain('Project procedure');
    expect(body).toContain('Organization audit');
    expect(body).toContain('Organization context is not assigned to this project.');
    expect(body).toContain(LIMIT);
    expect(body).not.toMatch(/awards, proposals|Submission readiness/);
  });

  it('refuses an unsupported saved Quality snapshot instead of displaying malformed facts as an empty register', () => {
    const report = renderReport({ reportTypeId: TYPE, reportTypeLabel: 'Compliance & Audit Assurance Pack', scopeType: 'project', scopeId: '11',
      status: 'partial', providers: [], blockers: [LIMIT], summary: { domain: { qualityEvidence: { schemaVersion: 2, records, limits: [LIMIT] } } } });
    expect(report.sections.find(section => section.id === 'quality-evidence-unavailable')).toBeDefined();
    expect(JSON.stringify(report)).not.toContain('Project procedure');
  });

});

describe('native Quality report presentation',()=>{
  it('renders readable business facts in the view and PDF without changing the sealed input',async()=>{
    const nativeRecords=[
      {key:'quality:qms_nonconforming_products:41',title:'Nonconformance: NC-41',version:null,sourceScope:'project',native:{kind:'qms_nonconforming_products',id:'41'},lifecycle:'pending',
        text:JSON.stringify({data:{record:{id:41,organization_id:7,nc_number:'NC-41',description:'Container seal integrity failed',capa_linked:false}}})},
      {key:'quality:capa_records:72',title:'CAPA: Container closure',version:null,sourceScope:'project',native:{kind:'capa_records',id:'72'},lifecycle:'action_planned',
        text:JSON.stringify({data:{record:{id:'72',capa_code:'CAPA-72',target_close_date:'2026-12-01',root_cause_analysis:{cause:'Incorrect torque',tests:0},source_refs:['NC-41']}}})},
      {key:'quality:qms_management_reviews:8',title:'Management review: Q4',version:null,sourceScope:'organization',native:{kind:'qms_management_reviews',id:'8'},lifecycle:'not_recorded',
        text:JSON.stringify({data:{record:{outputs:{actions:[{description:'Validate the torque procedure',dueDate:'2026-11-30',closed:false}]}}}})},
      {key:'quality:qms_documents:2:working',title:'SOP-001 Seal checks — working record',version:'2.0',sourceScope:'project',native:{kind:'qms_documents',id:'2'},lifecycle:'draft',
        text:JSON.stringify({data:{record:{doc_number:'SOP-001'},sections:[{id:'private-section-id',code:'purpose',title:'Purpose',content:'<p>Review the <strong>seals</strong>.</p>'}],contentBasis:'Working record; not a signed release.'}})},
      {key:'quality:capa_actions:00000000-0000-4000-8000-000000000041',title:'CAPA action: 00000000-0000-4000-8000-000000000041',version:null,sourceScope:'project',
        native:{kind:'capa_actions',id:'00000000-0000-4000-8000-000000000041'},lifecycle:'planned',text:JSON.stringify({data:{record:{n:3,description:'Repeat the torque validation'}}})},
    ];
    const summary={computedScope:'project',domain:{qualityEvidence:{schemaVersion:1,records:nativeRecords,limits:[LIMIT]}},
      provenance:{queries:[{query:'readQualityProjectEvidence',rows:nativeRecords}]}};
    const providers=[{provider:'quality_project_evidence',observedAt:'2026-11-06T00:00:00.000Z',status:'partial' as const,
      atoms:nativeRecords.map(row=>({sourceTable:row.native.kind,recordId:row.native.id,transformation:'direct_copy' as const}))}];
    const original=JSON.stringify(summary);
    const originalProviders=JSON.stringify(providers);
    const report=renderReport({reportTypeId:TYPE,reportTypeLabel:'Compliance & Audit Assurance Pack',scopeType:'project',scopeId:'11',status:'partial',providers,blockers:[LIMIT],summary});
    const tables=report.sections.filter(section=>section.id.startsWith('quality-')).flatMap(section=>section.blocks).filter(block=>block.kind==='table');
    const visible=tables.flatMap(table=>table.kind==='table' ? [table.columns.join(' '),...table.rows.map(row=>row.join(' '))] : []).join('\n');
    expect(visible).toContain('Container seal integrity failed');
    expect(visible).toContain('CAPA-72');
    expect(visible).toContain('CAPA action 3');
    expect(visible).toContain('2026-12-01');
    expect(visible).toContain('Due date: 2026-11-30');
    expect(visible).toContain('Tests: 0');
    expect(visible).toContain('CAPA linked: No');
    expect(visible).toContain('Review the seals.');
    expect(visible).toContain('Not recorded');
    expect(visible).not.toMatch(/quality:|capa_records|qms_documents|organization_id|root_cause_analysis|private-section-id|00000000-0000-4000-8000-000000000041|\{"|<strong>/);
    expect(JSON.stringify(summary)).toBe(original);
    expect(JSON.stringify(providers)).toBe(originalProviders);
    expect(report.provenance).toBeUndefined();
    expect(report.status).toBe('partial');
    expect(JSON.stringify(report.sections)).toContain(LIMIT);
    expect(JSON.stringify(report)).not.toMatch(/quality:|capa_records|qms_documents|quality_project_evidence/);

    const at='2026-11-06T00:00:00.000Z';
    const {bytes}=await buildRunPdf({report,typeLabel:'Quality assurance pack',seal:null,runBy:'QA reviewer',exportId:'quality-export',exportedAt:at,
      run:{id:17,runUuid:'quality-report-run',reportTypeId:TYPE,scopeType:'project',scopeId:'11',status:'partial',confidence:0,createdAt:new Date(at)}});
    const {PDFParse}=(await import('pdf-parse')) as unknown as {PDFParse:new(options:{data:Buffer})=>{getText():Promise<{text:string}>}};
    const parser=new PDFParse({data:bytes});
    const pdf=(await parser.getText()).text.replace(/\s+/g,' ');
    expect(pdf).toContain('Container seal integrity failed');
    expect(pdf).toContain('CAPA-72');
    expect(pdf).toContain('Due date: 2026-11-30');
    expect(pdf).toContain('NOT FINAL (PARTIAL)');
    expect(pdf).not.toMatch(/quality:|capa_records|qms_documents|quality_project_evidence|readQualityProjectEvidence|"data"|"queries"/);
  });

  it('keeps record qualifications ahead of a shortened excerpt and marks additional array facts',()=>{
    const text=JSON.stringify({data:{record:{description:'Recorded issue',source_refs:Array.from({length:9},(_,i)=>`NC-${i+1}`)},
      approvalQualification:'Electronic-signature standing is not inferred.'}});
    const report=renderReport({reportTypeId:TYPE,reportTypeLabel:'Quality assurance pack',scopeType:'project',scopeId:'11',status:'partial',providers:[],blockers:[LIMIT],
      summary:{domain:{qualityEvidence:{schemaVersion:1,records:[{...records[0],text}],limits:[LIMIT]}}}});
    const visible=JSON.stringify(report.sections);
    expect(visible).toContain('Electronic-signature standing is not inferred.');
    expect(visible).toContain('Additional recorded details are retained in the report data');
  });

  it('shows a readable unavailable-details note instead of falling back to malformed raw source text',()=>{
    const text='{PRIVATE RAW SOURCE JSON';
    const report=renderReport({reportTypeId:TYPE,reportTypeLabel:'Compliance & Audit Assurance Pack',scopeType:'project',scopeId:'11',status:'partial',providers:[],blockers:[LIMIT],
      summary:{domain:{qualityEvidence:{schemaVersion:1,records:[{...records[0],text}],limits:[LIMIT]}}}});
    const visible=JSON.stringify(report.sections);
    expect(visible).not.toContain(text);
    expect(visible).toContain('Recorded details are unavailable');
  });
});
