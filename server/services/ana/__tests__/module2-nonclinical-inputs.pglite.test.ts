/** Real project/actor admission and source-set currentness for the existing
 * Module 2.4/2.6 tools. PGlite proves SQL behavior, not deployed RLS or science. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';

const h = vi.hoisted(() => ({ globalReads: 0 }));
vi.mock('../../../db.js', () => ({
  get db() { h.globalReads++; throw new Error('GLOBAL_DATABASE_MUST_NOT_BE_USED'); },
  getPool: () => { h.globalReads++; throw new Error('GLOBAL_POOL_MUST_NOT_BE_USED'); },
  pool: { query: () => { h.globalReads++; throw new Error('GLOBAL_POOL_MUST_NOT_BE_USED'); } },
}));

import { draftNonclinicalFromRecords } from '../module2-nonclinical-inputs';
import { captureCurrentRunSourceGate, createRunSourceAuthority, runWithSourceAuthority } from '../../ai-gateway/model-call-scope';

const PROGRAM = '7d1c2f0e-5b7a-4c1e-9a43-0f2b6d1e8c55';
const SIBLING = '8e2d3f1a-6c8b-4d2e-a154-1a3c7e2f9d66';
const FOREIGN = '9f3e4a2b-7d9c-4e3f-b265-2b4d8f3a0e77';
const UNANCHORED = 'af4f5b3c-8e0d-4f4a-c376-3c5e9a4b1f88';
let pg: PGlite;
let failStudyRead = false;
let afterStudyRead: (() => Promise<void>) | null = null;
const queries: string[] = [];

type QueryConfig = string | { text: string; values?: unknown[]; rowMode?: string };
/** Same physical connection for raw SQL and node-postgres Drizzle calls. */
const sqlClient = {
  async query(input: QueryConfig, values?: unknown[]) {
    const text = typeof input === 'string' ? input : input.text;
    const params = values ?? (typeof input === 'string' ? undefined : input.values);
    queries.push(text);
    if (failStudyRead && /nonclinical_studies/i.test(text)) throw new Error('PRIVATE_SOURCE_DRIVER_DETAIL_37MG');
    const result = await pg.query<Record<string, unknown>>(text, params,
      typeof input !== 'string' && input.rowMode === 'array' ? { rowMode: 'array' } : undefined);
    if (afterStudyRead && /\bSELECT\b/i.test(text) && /\bFROM\s+nonclinical_studies\b/i.test(text)) {
      const hook = afterStudyRead;
      afterStudyRead = null;
      await hook();
    }
    return result;
  },
} satisfies RequestSqlClient;

interface Context {
  organizationId: number;
  userId?: number;
  projectId?: number | null;
  projectRef?: string | null;
  sqlClient?: RequestSqlClient;
}
interface Draft {
  ok?: boolean;
  status?: string;
  code?: string;
  error?: string;
  basis?: string;
  structure?: { sections: unknown[] };
  summary?: { narrative: string; gaps: string[]; tables: Array<{ title: string; headers: string[]; rows: string[][] }> };
  nonclinical_data?: {
    status: string;
    source?: string;
    projectId?: number;
    programId?: string;
    snapshotHash?: string;
    records?: Array<{ id: number; submissionId: number; studyNumber: string; status: string; updatedAt: string }>;
  };
}
const context = (extra: Partial<Context> = {}): Context => ({ organizationId: 7, userId: 5, projectId: 11, sqlClient, ...extra });
const draft = async (module: '2.4' | '2.6' = '2.6', input: Record<string, unknown> = {}, ctx = context()): Promise<Draft> =>
  JSON.parse(await draftNonclinicalFromRecords(input, ctx, module));
const identity = (ctx: Context, input: Record<string, unknown> = {}) => ({
  organizationId: ctx.organizationId, userId: ctx.userId,
  projectId: ctx.projectRef ?? ctx.projectId ?? (typeof input.project_id === 'number' ? input.project_id : null),
});
const withAuthority = <T>(work: () => Promise<T>, ctx = context(), input: Record<string, unknown> = {}): Promise<T> =>
  runWithSourceAuthority(createRunSourceAuthority(identity(ctx, input)), work);
const status = (out: Draft) => out.status ?? out.nonclinical_data?.status;
const ids = (out: Draft) => (out.nonclinical_data?.records ?? []).map(record => record.id).sort((a, b) => a - b);
const checkpoint = (ctx = context()) => {
  const gate = captureCurrentRunSourceGate(identity(ctx));
  expect(gate).toBeDefined();
  return gate!;
};
function expectNoStudyPayload(out: Draft) {
  expect(out.summary).toBeUndefined();
  expect(out.nonclinical_data?.records).toBeUndefined();
  expect(out.nonclinical_data?.snapshotHash).toBeUndefined();
  expect(JSON.stringify(out)).not.toMatch(/NC-FINAL|NC-REPORT|37 mg\/kg|Recorded hepatic finding|EXCLUDED-/);
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users(id integer PRIMARY KEY,status text NOT NULL DEFAULT 'active');
    CREATE TABLE organizations(id integer PRIMARY KEY,status text NOT NULL DEFAULT 'active');
    CREATE TABLE organization_users(organization_id integer,user_id integer,role text);
    CREATE TABLE client_workspaces(id integer,organization_id integer);
    CREATE TABLE projects(id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,status text,
      owner_id integer,created_by_id integer,settings jsonb DEFAULT '{}'::jsonb,regulatory_program_id uuid);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,name text,status text,deleted_at timestamptz);
    CREATE TABLE project_visibility_settings(project_id integer,organization_id integer,visibility text);
    CREATE TABLE project_members(project_id integer,organization_id integer,user_id integer,role text,status text);
    CREATE TABLE concept2cure_review_assignments(artifact_id integer,reviewer_id integer,organization_id integer,status text);
    CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE submissions(id integer PRIMARY KEY,organization_id integer,program_id uuid,application_type text,
      status text DEFAULT 'active',product_name text,deleted_at timestamptz,updated_at timestamptz DEFAULT '2026-11-01');
    CREATE TABLE nonclinical_studies(id integer PRIMARY KEY,organization_id integer,submission_id integer,
      study_number text,title text,study_type text,species text,glp_compliant boolean DEFAULT false,noael text,
      duration_label text,key_finding text,finding_class text,ctd_section text,status text,report_finalized_date date,
      deleted_at timestamptz,created_at timestamptz DEFAULT '2026-11-01',updated_at timestamptz DEFAULT '2026-11-01');
  `);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  failStudyRead = false;
  afterStudyRead = null;
  h.globalReads = 0;
  queries.length = 0;
  await pg.exec(`
    TRUNCATE users,organizations,organization_users,projects,regulatory_programs,project_visibility_settings,
      project_members,concept2cure_artifacts,concept2cure_review_assignments,submissions,nonclinical_studies;
    INSERT INTO users VALUES(5,'active'),(6,'active'),(99,'active');
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO organization_users VALUES(7,5,'member'),(7,6,'member'),(8,5,'member');
    INSERT INTO projects VALUES
      (11,7,NULL,'active',99,99,'{}','${PROGRAM}'),(12,7,NULL,'active',99,99,'{}','${SIBLING}'),
      (13,8,NULL,'active',99,99,'{}','${FOREIGN}'),(14,7,NULL,'active',99,99,'{}',NULL);
    INSERT INTO regulatory_programs VALUES
      ('${PROGRAM}',7,'Program label is not a drug-substance name','active',NULL),
      ('${SIBLING}',7,'Sibling program','active',NULL),('${FOREIGN}',8,'Foreign program','active',NULL),
      ('${UNANCHORED}',7,'Unanchored program','active',NULL);
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(13,8,'private'),(14,7,'private');
    INSERT INTO project_members VALUES(11,7,5,'use','active'),(12,7,5,'use','active'),(13,8,5,'use','active'),(14,7,5,'use','active');
    INSERT INTO submissions(id,organization_id,program_id,application_type,product_name,deleted_at) VALUES
      (101,7,'${PROGRAM}','ind','Product is not a drug substance',NULL),(102,7,'${PROGRAM}','nda',NULL,NULL),
      (103,7,'${SIBLING}','ind',NULL,NULL),(104,8,'${FOREIGN}','ind',NULL,NULL),
      (105,7,'${PROGRAM}','ind',NULL,'2026-11-02'),(106,8,'${PROGRAM}','ind',NULL,NULL),(107,7,NULL,'ind',NULL,NULL);
    INSERT INTO nonclinical_studies(id,organization_id,submission_id,study_number,title,study_type,species,
      glp_compliant,noael,duration_label,key_finding,ctd_section,status,report_finalized_date,deleted_at) VALUES
      (1,7,101,'NC-FINAL','Finalized recorded study','repeat_dose_tox','rat',true,'37 mg/kg','13 weeks','Recorded hepatic finding','4.2.3.2','finalized','2026-10-31',NULL),
      (2,7,101,'NC-REPORT','IND reporting study','adme_pk','dog',false,NULL,NULL,'Recorded elimination finding','4.2.2','in_reporting',NULL,NULL),
      (3,7,102,'NC-NDA-FINAL','NDA finalized study','genotoxicity',NULL,false,NULL,NULL,NULL,NULL,'finalized','2026-10-30',NULL),
      (4,7,102,'EXCLUDED-NDA-REPORT','Excluded','repeat_dose_tox','rat',true,'999 mg/kg',NULL,'Excluded finding',NULL,'in_reporting',NULL,NULL),
      (5,7,101,'EXCLUDED-PLANNED','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'planned',NULL,NULL),
      (6,7,101,'EXCLUDED-CANCELLED','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'cancelled',NULL,NULL),
      (7,7,101,'EXCLUDED-IN-LIFE','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'in_life',NULL,NULL),
      (8,7,101,'EXCLUDED-DELETED','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,'2026-11-02'),
      (9,7,103,'EXCLUDED-SIBLING','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (10,8,104,'EXCLUDED-FOREIGN','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (11,7,104,'EXCLUDED-FOREIGN-SUBMISSION','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (12,8,101,'EXCLUDED-FOREIGN-STUDY','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (13,7,NULL,'EXCLUDED-UNLINKED','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (14,7,105,'EXCLUDED-DELETED-SUBMISSION','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (15,7,106,'EXCLUDED-FOREIGN-ORG-SUBMISSION','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL),
      (16,7,107,'EXCLUDED-NO-PROGRAM','Excluded','repeat_dose_tox',NULL,false,NULL,NULL,NULL,NULL,'finalized',NULL,NULL);
  `);
});

describe.each(['2.4', '2.6'] as const)('Module %s governed project binding', module => {
  it.each([
    ['numeric open project', {}, { projectId: 11 }],
    ['UUID open project', {}, { projectId: null, projectRef: PROGRAM }],
    ['named project when none is open', { project_id: 11 }, { projectId: null }],
  ] as const)('composes only persisted eligible facts for the %s', async (_label, input, extra) => {
    const ctx = context(extra);
    await withAuthority(async () => {
      const out = await draft(module, input, ctx);
      expect(out.basis).toBe('recorded');
      expect(out.nonclinical_data).toMatchObject({ status: 'recorded', source: 'nonclinical_studies', projectId: 11, programId: PROGRAM });
      expect(ids(out)).toEqual([1, 2, 3]);
      expect(out.nonclinical_data?.records).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 1, submissionId: 101, studyNumber: 'NC-FINAL', status: 'finalized', updatedAt: expect.any(String) }),
        expect.objectContaining({ id: 2, submissionId: 101, studyNumber: 'NC-REPORT', status: 'in_reporting' }),
        expect.objectContaining({ id: 3, submissionId: 102, status: 'finalized' }),
      ]));
      expect(out.nonclinical_data?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
      expect(out.summary).toBeDefined();
      expect(JSON.stringify(out.summary)).toContain('37 mg/kg');
      expect(JSON.stringify(out.summary)).toContain('Recorded hepatic finding');
      expect(JSON.stringify(out)).not.toMatch(/EXCLUDED-|999 mg\/kg|Product is not a drug substance|Program label is not a drug-substance name/);
      expect(out.summary?.gaps.some(gap => /drug.substance name/i.test(gap))).toBe(true);
      expect(out.summary?.gaps.some(gap => /NC-REPORT/.test(gap) && /duration/i.test(gap))).toBe(true);
      expect(checkpoint(ctx).tiers).toContain(3);
      await checkpoint(ctx).recheck();
      expect(h.globalReads).toBe(0);
    }, ctx, input);
  });

  it('refuses another named project while the UUID project is open', async () => {
    const ctx = context({ projectId: null, projectRef: PROGRAM });
    const out = await withAuthority(() => draft(module, { project_id: 12 }, ctx), ctx);
    expect(status(out)).toBe('cross_project');
    expectNoStudyPayload(out);
  });

  it('never accepts model studies, findings or product identity as recorded facts', async () => {
    const out = await withAuthority(() => draft(module, {
      studies: [{ studyType: 'repeat_dose_tox', noael: 'MODEL_12345 mg/kg' }],
      findings: [{ organ: 'MODEL_ORGAN', finding: 'MODEL_FINDING' }], drugSubstanceName: 'MODEL_DRUG', indication: 'MODEL_INDICATION',
    }));
    expect(JSON.stringify(out)).not.toMatch(/MODEL_12345|MODEL_ORGAN|MODEL_FINDING|MODEL_DRUG|MODEL_INDICATION/);
    expectNoStudyPayload(out);
  });
});

describe('denials and empty/unavailable sources', () => {
  it('binds a named project when the private conversation authority has no open project', async () => {
    const ctx = context({ projectId: null, projectRef: null });
    await withAuthority(async () => {
      const out = await draft('2.6', { project_id: 11 }, ctx);
      expect(status(out)).toBe('recorded');
      expect(ids(out)).toEqual([1, 2, 3]);
      const gate = checkpoint(ctx);
      expect(gate.tiers).toContain(3);
      await gate.recheck();
      await pg.exec("DELETE FROM project_members WHERE project_id=11 AND user_id=5");
      await expect(gate.recheck()).rejects.toThrow();
    }, ctx);
  });

  it.each([
    ['non-member', { userId: 99 }], ['missing actor', { userId: undefined }],
    ['private project without sharing', { userId: 6 }], ['foreign project', { projectId: 13 }],
  ] as const)('refuses %s without exposing study facts', async (_label, extra) => {
    const ctx = context(extra);
    const out = await withAuthority(() => draft('2.6', {}, ctx), ctx);
    expect(status(out)).not.toBe('recorded');
    expectNoStudyPayload(out);
    expect(queries.some(query => /nonclinical_studies/i.test(query))).toBe(false);
  });

  it.each(['revoked', 'invited'])('refuses a %s project grant', async memberStatus => {
    await pg.query('UPDATE project_members SET status=$1 WHERE project_id=11 AND user_id=5', [memberStatus]);
    const out = await withAuthority(() => draft());
    expect(status(out)).toBe('access_denied');
    expectNoStudyPayload(out);
  });

  it.each(['uuid', 'numeric'])('refuses duplicate anchors for %s project selection', async selected => {
    await pg.query(`INSERT INTO projects VALUES(15,7,NULL,'active',99,99,'{}',$1)`, [PROGRAM]);
    const ctx = context(selected === 'uuid' ? { projectId: null, projectRef: PROGRAM } : {});
    const out = await withAuthority(() => draft('2.6', {}, ctx), ctx);
    expect(status(out)).not.toBe('recorded');
    expect(status(out)).not.toBe('needs_data');
    expectNoStudyPayload(out);
  });

  it.each([
    ['unanchored UUID', { projectId: null, projectRef: UNANCHORED }],
    ['numeric project without a program', { projectId: 14 }],
  ] as const)('does not turn an %s into an empty eligible source set', async (_label, extra) => {
    const ctx = context(extra);
    const out = await withAuthority(() => draft('2.6', {}, ctx), ctx);
    expect(status(out)).not.toBe('recorded');
    expect(status(out)).not.toBe('needs_data');
    expectNoStudyPayload(out);
  });

  it('returns the canonical outline for a genuinely empty eligible set and pins that absence', async () => {
    await pg.query("UPDATE nonclinical_studies SET status='planned' WHERE id IN(1,2,3)");
    await withAuthority(async () => {
      const out = await draft();
      expect(status(out)).toBe('needs_data');
      expect(out.structure?.sections.length).toBeGreaterThan(0);
      expectNoStudyPayload(out);
      const gate = checkpoint();
      // Nothing study-bearing was released, so the run is not raised to the studies' tier: at Tier 3 the next model
      // call is refused on an outside provider and AnA cannot even say that there are no studies (2026-11-12).
      expect(gate.tiers).not.toContain(3);
      await gate.recheck();
      await pg.query("UPDATE nonclinical_studies SET status='finalized' WHERE id=1");
      await expect(gate.recheck()).rejects.toThrow();
    });
  });

  it('does not expose records without private run authority', async () => {
    const out = await draft();
    expect(status(out)).not.toBe('recorded');
    expectNoStudyPayload(out);
  });

  it('does not escape to a global connection when the request executor is absent', async () => {
    const ctx = context({ sqlClient: undefined });
    const out = await withAuthority(() => draft('2.6', {}, ctx), ctx);
    expectNoStudyPayload(out);
    expect(h.globalReads).toBe(0);
  });

  it('sanitizes unavailable study reads instead of returning empty-source success', async () => {
    failStudyRead = true;
    const out = await withAuthority(() => draft());
    expect(status(out)).not.toBe('recorded');
    expect(status(out)).not.toBe('needs_data');
    expectNoStudyPayload(out);
    expect(JSON.stringify(out)).not.toContain('PRIVATE_SOURCE_DRIVER_DETAIL_37MG');
  });
});

describe('source races before the first public response', () => {
  it.each([
    ['sharing revocation', "UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=5"],
    ['finding changed without timestamp update', "UPDATE nonclinical_studies SET key_finding='Changed while first read returned' WHERE id=1"],
    ['added eligible study', "UPDATE nonclinical_studies SET status='finalized' WHERE id=5"],
  ])('withholds the source payload after %s during the first study read', async (_label, mutation) => {
    afterStudyRead = async () => { await pg.exec(mutation); };
    await withAuthority(async () => {
      const out = await draft();
      expect(afterStudyRead).toBeNull();
      expectNoStudyPayload(out);
    });
  });
});

describe('private source-set grant currentness', () => {
  it.each([
    ['content without timestamp changes', "UPDATE nonclinical_studies SET key_finding='Changed full finding' WHERE id=1"],
    ['NOAEL', "UPDATE nonclinical_studies SET noael='38 mg/kg' WHERE id=1"],
    ['type', "UPDATE nonclinical_studies SET study_type='single_dose_tox' WHERE id=1"],
    ['GLP declaration', 'UPDATE nonclinical_studies SET glp_compliant=false WHERE id=1'],
    ['duration', "UPDATE nonclinical_studies SET duration_label='26 weeks' WHERE id=1"],
    ['locator', "UPDATE nonclinical_studies SET ctd_section='4.2.3' WHERE id=1"],
    ['study identity', "UPDATE nonclinical_studies SET study_number='CHANGED-NUMBER' WHERE id=1"],
    ['finalization date', "UPDATE nonclinical_studies SET report_finalized_date='2026-10-30' WHERE id=1"],
    ['update pin', "UPDATE nonclinical_studies SET updated_at='2026-11-03' WHERE id=1"],
    ['removed eligibility', "UPDATE nonclinical_studies SET status='planned' WHERE id=1"],
    ['changed eligible lifecycle', "UPDATE nonclinical_studies SET status='finalized' WHERE id=2"],
    ['same-project relink', 'UPDATE nonclinical_studies SET submission_id=102 WHERE id=1'],
    ['sibling relink', 'UPDATE nonclinical_studies SET submission_id=103 WHERE id=1'],
    ['study deletion', "UPDATE nonclinical_studies SET deleted_at='2026-11-03' WHERE id=1"],
    ['new eligible record', "UPDATE nonclinical_studies SET status='finalized' WHERE id=5"],
    ['submission relink', `UPDATE submissions SET program_id='${SIBLING}' WHERE id=101`],
    ['submission deletion', "UPDATE submissions SET deleted_at='2026-11-03' WHERE id=101"],
    ['program deletion', `UPDATE regulatory_programs SET deleted_at='2026-11-03' WHERE id='${PROGRAM}'`],
    ['anchor relink', `UPDATE projects SET regulatory_program_id='${SIBLING}' WHERE id=11`],
    ['duplicate anchor', `INSERT INTO projects VALUES(15,7,NULL,'active',99,99,'{}','${PROGRAM}')`],
    ['membership removal', 'DELETE FROM organization_users WHERE organization_id=7 AND user_id=5'],
    ['sharing revocation', "UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=5"],
    ['inactive actor', "UPDATE users SET status='inactive' WHERE id=5"],
  ])('refuses dispatch after %s', async (_label, mutation) => {
    await withAuthority(async () => {
      const out = await draft();
      expect(status(out)).toBe('recorded');
      const gate = checkpoint();
      await gate.recheck();
      await pg.exec(mutation);
      await expect(gate.recheck()).rejects.toThrow();
    });
  });

  it('keeps a stable snapshot and ignores changes outside the eligible project set', async () => {
    await withAuthority(async () => {
      const first = await draft();
      expect(status(first)).toBe('recorded');
      await pg.query("UPDATE nonclinical_studies SET key_finding='Still excluded' WHERE id=9");
      await checkpoint().recheck();
      const second = await draft();
      expect(second.nonclinical_data?.snapshotHash).toBe(first.nonclinical_data?.snapshotHash);
      expect(ids(second)).toEqual([1, 2, 3]);
      expect(h.globalReads).toBe(0);
    });
  });
});
