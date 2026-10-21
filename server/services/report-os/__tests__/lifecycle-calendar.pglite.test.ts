/** Actual lifecycle DDL + canonical current-actor/project policy, renderer and PDF. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ fallback: vi.fn(), readiness: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: h.fallback }, getPool: () => ({ query: h.fallback }), db: {} }));
vi.mock('../orchestrator', () => ({ computeInitialRun: h.readiness }));
import { computeDomainReport } from '../research-compliance-report-providers';
import { calculateLifecycleCalendar, LIFECYCLE_CALENDAR_LIMIT, LIFECYCLE_CALENDAR_SQL, LIFECYCLE_CALENDAR_TYPE, type LifecycleCalendarSnapshot } from '../lifecycle-calendar';
import { lifecycleCalendarOf } from '../render/lifecycle-calendar';
import { computeRunForType } from '../compute-run';
import { gapsWereEvaluated, renderReport } from '../render/render';
import { evaluateTruthfulness } from '../truthfulness';
import { buildRunPdf } from '../pdf/run-pdf';
let pg: PGlite;
const query = vi.fn((sql: string, parameters?: unknown[]) => pg.query<Record<string, unknown>>(sql, parameters));
const q = { query };
const run = (userId = 5) => computeRunForType({ engine: 'domain', typeId: LIFECYCLE_CALENDAR_TYPE, organizationId: 7, scopeType: 'account', scopeId: '7', recordContext: { userId, executor: q } });
const calendar = async (userId = 5) => lifecycleCalendarOf((await run(userId)).computed.summary.domain as Record<string, unknown>)!;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations(id int PRIMARY KEY,status text); CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamp);
    CREATE TABLE submissions(id int PRIMARY KEY,organization_id int,program_id uuid,deleted_at timestamp);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,client_workspace_id int,status text,owner_id int,created_by_id int,settings json);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY,artifact_id text,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    INSERT INTO organizations VALUES(7,'active'),(8,'active'); INSERT INTO users VALUES(5,'active'),(6,'active'),(9,'inactive');
    INSERT INTO organization_users VALUES(7,5,'member'),(7,6,'member'),(7,9,'manager');
    INSERT INTO regulatory_programs VALUES
      ('00000000-0000-4000-8000-000000000011',7,NULL),('00000000-0000-4000-8000-000000000012',7,NULL),
      ('00000000-0000-4000-8000-000000000013',8,NULL),('00000000-0000-4000-8000-000000000014',7,now()),
      ('00000000-0000-4000-8000-000000000015',7,NULL),('00000000-0000-4000-8000-000000000021',7,NULL);
    INSERT INTO submissions VALUES(11,7,'00000000-0000-4000-8000-000000000011',NULL),(12,7,'00000000-0000-4000-8000-000000000012',NULL),
      (13,8,'00000000-0000-4000-8000-000000000013',NULL),(14,7,'00000000-0000-4000-8000-000000000014',NULL),
      (15,7,'00000000-0000-4000-8000-000000000015',NULL),(16,7,NULL,NULL),(17,7,'00000000-0000-4000-8000-000000000011',now());
    INSERT INTO projects VALUES
      (11,7,'00000000-0000-4000-8000-000000000011',71,'active',5,5,'{}'),
      (12,7,'00000000-0000-4000-8000-000000000012',71,'active',6,6,'{}'),
      (15,7,'00000000-0000-4000-8000-000000000015',71,'active',5,5,'{}'),
      (16,7,'00000000-0000-4000-8000-000000000015',71,'active',6,6,'{}'),
      (21,7,'00000000-0000-4000-8000-000000000021',71,'active',5,5,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(15,7,'private'),(16,7,'private'),(21,7,'private');
  `);
  await pg.exec(await readFile('migrations/20260610_rim_lite.sql', 'utf8'));
  await pg.exec(await readFile('migrations/20260610_lifecycle_obligations.sql', 'utf8'));
  await pg.exec(`
    INSERT INTO rim_products(id,organization_id,product_name,status,created_by,deleted_at) VALUES
      (1,7,'Recorded product','active',5,NULL),(2,8,'FOREIGN PRODUCT','active',6,NULL),(3,7,'DELETED PRODUCT','active',5,now());
    INSERT INTO lifecycle_obligations(id,organization_id,product_id,submission_id,region,obligation_type,title,status,due_date,created_by,deleted_at) VALUES
      (1,7,1,11,'fda','annual_report','Admitted recorded obligation','in_preparation','2000-01-01',5,NULL),
      (2,7,NULL,NULL,'other','renewal','Unlinked undated obligation','planned',NULL,5,NULL),
      (3,7,1,NULL,'eu','periodic_report','Recorded terminal obligation','submitted','2000-01-01',5,NULL),
      (4,7,1,12,'fda','annual_report','PRIVATE SECRET','planned','2000-01-01',6,NULL),
      (5,8,2,13,'fda','annual_report','FOREIGN SECRET','planned','2000-01-01',6,NULL),
      (6,7,1,13,'fda','annual_report','FOREIGN PARENT','planned','2000-01-01',5,NULL),
      (7,7,1,14,'fda','annual_report','DELETED PROGRAM','planned','2000-01-01',5,NULL),
      (8,7,1,15,'fda','annual_report','DUPLICATE ANCHOR','planned','2000-01-01',5,NULL),
      (9,7,1,16,'fda','annual_report','UNRESOLVED PROGRAM','planned','2000-01-01',5,NULL),
      (10,7,1,17,'fda','annual_report','DELETED SUBMISSION','planned','2000-01-01',5,NULL),
      (11,7,2,NULL,'fda','annual_report','FOREIGN PRODUCT LINK','planned','2000-01-01',5,NULL),
      (12,7,3,NULL,'fda','annual_report','DELETED PRODUCT LINK','planned','2000-01-01',5,NULL),
      (13,7,1,NULL,'fda','annual_report','DELETED OBLIGATION','planned','2000-01-01',5,now());
    INSERT INTO lifecycle_obligation_events(id,organization_id,obligation_id,period_start,period_end,due_date,status,created_by,deleted_at) VALUES
      (1,7,1,'1999-01-01','1999-12-31','2000-03-01','pending',5,NULL),
      (2,7,1,NULL,NULL,NULL,'pending',5,NULL),
      (3,7,1,'2000-01-01','2000-12-31','2001-03-01','approved',5,NULL),
      (4,7,4,NULL,NULL,'2000-03-01','pending',6,NULL),
      (5,8,1,NULL,NULL,'2000-03-01','pending',6,NULL),
      (6,7,1,NULL,NULL,'2000-03-01','pending',5,now());
  `);
}, 60_000);
afterAll(async () => { await pg?.close(); });

describe('admitted recorded lifecycle source', () => {
  it('uses the explicit same executor, one source snapshot and canonical real sharing policy before and after the read', async () => {
    query.mockClear(); const { computed } = await run(); const output = lifecycleCalendarOf(computed.summary.domain as Record<string, unknown>)!;
    expect(output.obligations.map(row => row.id)).toEqual([1,3,2]); expect(output.events.map(row => row.id)).toEqual([1,3,2]);
    expect(computed.summary.accessProjectIds).toEqual([11]);
    expect(query.mock.calls.find(([sql]) => sql === LIFECYCLE_CALENDAR_SQL)?.[1]).toEqual([7, expect.arrayContaining(['00000000-0000-4000-8000-000000000021'])]);
    expect(JSON.stringify(computed)).not.toContain('00000000-0000-4000-8000-000000000021');
    expect(JSON.stringify(computed)).toContain('redacted');
    expect(query.mock.calls.filter(([sql]) => sql === LIFECYCLE_CALENDAR_SQL)).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('SELECT ou.role'))).toHaveLength(2);
    expect(JSON.stringify(computed)).not.toMatch(/PRIVATE SECRET|FOREIGN SECRET|FOREIGN PARENT|DELETED PROGRAM|DUPLICATE ANCHOR|UNRESOLVED PROGRAM|DELETED SUBMISSION|FOREIGN PRODUCT LINK|DELETED PRODUCT LINK|DELETED OBLIGATION/);
    expect(computed.providers[0].atoms?.map(atom => `${atom.sourceTable}:${atom.recordId}`)).toEqual(['lifecycle_obligations:1','lifecycle_obligations:3','lifecycle_obligations:2','lifecycle_obligation_events:1','lifecycle_obligation_events:3','lifecycle_obligation_events:2']);
    expect(h.fallback).not.toHaveBeenCalled(); expect(h.readiness).not.toHaveBeenCalled();
  });
  it('admits each private parent only for its actual owner and retains separately recorded nullable dates', async () => {
    const output = await calendar(6);
    expect(output.obligations.map(row => row.id)).toEqual([3,4,2]); expect(output.events.map(row => row.id)).toEqual([4]);
    expect((await calendar()).obligationSummary).toMatchObject({ total: 3, overdue: 1, closed: 1, undated: 1 });
    expect((await calendar()).eventSummary).toMatchObject({ total: 3, overdue: 1, closed: 1, undated: 1 });
    expect((await calendar()).events.find(row => row.id === 2)).toMatchObject({ period_start: null, period_end: null, due_date: null, urgency: 'undated' });
  });
  it('refuses a missing context or inactive actor without substituting the global pool or an empty report', async () => {
    await expect(computeRunForType({ engine: 'domain', typeId: LIFECYCLE_CALENDAR_TYPE, organizationId: 7, scopeType: 'account', scopeId: '7' })).rejects.toMatchObject({ name: 'ReportTypeNotComputed' });
    await expect(run(9)).rejects.toMatchObject({ code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(h.fallback).not.toHaveBeenCalled();
  });
  it('refuses a scope revoked while SQL was reading instead of retaining earlier private facts', async () => {
    const executor = { query: async (sql: string, args?: unknown[]) => {
      const result = await pg.query<Record<string, unknown>>(sql, args);
      if (sql === LIFECYCLE_CALENDAR_SQL) await pg.exec('UPDATE projects SET owner_id=6,created_by_id=6 WHERE id=11');
      return result;
    } };
    try {
      await expect(computeDomainReport(LIFECYCLE_CALENDAR_TYPE, 7, { recordContext: { userId: 5, executor } })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
    } finally { await pg.exec('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=11'); }
  });
  it('refuses unreadable and oversized sources rather than saving empty or truncated success', async () => {
    const failing = { query: async (sql: string, args?: unknown[]) => { if (sql === LIFECYCLE_CALENDAR_SQL) throw new Error('Calendar source unreadable'); return pg.query<Record<string, unknown>>(sql,args); } };
    await expect(computeDomainReport(LIFECYCLE_CALENDAR_TYPE,7,{recordContext:{userId:5,executor:failing}})).rejects.toThrow('Calendar source unreadable');
    await pg.exec("INSERT INTO lifecycle_obligations(id,organization_id,obligation_type,region,title,created_by) SELECT 1000+n,7,'annual_report','other','Oversized source',5 FROM generate_series(1,501) n");
    try { await expect(run()).rejects.toMatchObject({ name: 'ReportTypeNotComputed', message: expect.stringContaining('No truncated calendar') }); }
    finally { await pg.exec("DELETE FROM lifecycle_obligations WHERE title='Oversized source'"); }
  });
});

async function rendered() {
  const { computed } = await run();
  return { computed, report: renderReport({ reportTypeId: LIFECYCLE_CALENDAR_TYPE, reportTypeLabel: 'Lifecycle Obligation Calendar', scopeType: 'account', scopeId: '7', providers: computed.providers, blockers: computed.blockers, summary: computed.summary, status: 'partial', generatedAt: '2026-10-17T00:00:00Z' }) };
}
async function actualPdfText(bytes: Buffer): Promise<string> {
  const pdfModule: unknown = await import('pdf-parse');
  if (!pdfModule || typeof pdfModule !== 'object' || !('PDFParse' in pdfModule) || typeof pdfModule.PDFParse !== 'function') throw new Error('PDFParse constructor unavailable');
  const parser: unknown = Reflect.construct(pdfModule.PDFParse,[{data:new Uint8Array(bytes)}]);
  if (!parser || typeof parser !== 'object' || !('getText' in parser) || typeof parser.getText !== 'function' || !('destroy' in parser) || typeof parser.destroy !== 'function') throw new Error('PDF extraction unavailable');
  try { const result: unknown = await parser.getText(); if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string') throw new Error('No PDF text'); return result.text.replace(/\s+/g,' '); }
  finally { await parser.destroy(); }
}
describe('actual lifecycle report output', () => {
  it('renders fixed nullable date columns, source rows and explicit gaps without readiness substitution or legal finalization', async () => {
    const { computed, report } = await rendered();
    expect(JSON.stringify(report)).toContain('Admitted recorded obligation'); expect(JSON.stringify(report)).toContain('Persisted lifecycle occurrences');
    expect(JSON.stringify(report)).not.toMatch(/No gaps detected|Submission readiness not computed|PRIVATE SECRET/);
    expect(gapsWereEvaluated(computed.summary)).toBe(true);
    expect(evaluateTruthfulness({ requestedStatus:'final', confidence:null, blockers:computed.blockers, criticalBlockers:computed.criticalBlockers, gapsSection:true, disclosure:false },{ allowPartial:true,requireBlockers:true,forbidFinalIfMissingCritical:true })).toMatchObject({allowedStatus:'partial',downgradedFrom:'final'});
    const table=report.sections.find(section=>section.id==='lifecycle-occurrences')!.blocks.filter(block=>block.kind==='table')[1];
    expect(table).toMatchObject({columns:expect.arrayContaining(['Period start','Period end','Due date','Submitted date'])});
    expect(computed.criticalBlockers).toEqual([LIFECYCLE_CALENDAR_LIMIT]);
  });
  it('exports actual recorded obligations/occurrences, dates and legal limits in the existing PDF exporter', async () => {
    const { report }=await rendered();
    const {bytes}=await buildRunPdf({run:{id:17,runUuid:null,reportTypeId:LIFECYCLE_CALENDAR_TYPE,scopeType:'account',scopeId:'7',status:'partial',confidence:null,createdAt:'2026-10-17T00:00:00Z'},report,typeLabel:'Lifecycle Obligation Calendar',seal:null,runBy:'Synthetic local actor',exportId:'lifecycle-test',exportedAt:'2026-10-17T01:00:00Z'});
    const text=await actualPdfText(bytes);
    for(const value of ['Admitted recorded obligation','Unlinked undated obligation','Persisted lifecycle occurrences','1999-12-31','2000-03-01','Legal applicability','NOT FINAL']) expect(text).toContain(value);
    expect(text).not.toContain('PRIVATE SECRET');
  });
  it('preserves null-first date fields in the fixed document contract and refuses unsupported saved schemas', () => {
    const snapshot: LifecycleCalendarSnapshot={observed_at:'2026-10-17T00:00:00Z',obligation_count:0,event_count:0,obligations:[],events:[]};
    const empty=calculateLifecycleCalendar(snapshot); expect(empty.gaps.some(gap=>gap.title==='No admitted obligation records')).toBe(true);
    expect(()=>lifecycleCalendarOf({lifecycleCalendar:{...empty,schemaVersion:2}})).toThrow('Unsupported');
  });
});
