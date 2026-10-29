/**
 * Whether a study is pivotal is the sponsor's declaration, per study, and
 * Module 2's input carries it (D5, founder's decision of 2026-10-29).
 *
 * Runs the real migration (20261029e) on PGlite: the declaration is recorded
 * with its reason, a change is a new row, a row is never rewritten, and the
 * CSR loader hands Module 2 the current declaration of each study, or null
 * where the sponsor has not declared one.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return h.database; } }));

import { declareStudyPivotal, readProjectStudyPivotal, StudyPivotalDeclarationError } from '../study-pivotal-declaration';
import { loadCsrInputsForProject } from '../load-csr-inputs-for-project';

let database: PGlite;
const q = { query: async (text: string, params?: unknown[]) => database.query<Record<string, unknown>>(text, params as never[]) };

beforeAll(async () => {
  database = new PGlite();
  h.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,status text,owner_id integer,created_by_id integer,settings jsonb DEFAULT '{}'::jsonb);
    INSERT INTO projects VALUES (11,7,71,'active',NULL,NULL,'{}');
    CREATE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE (name text, email text) LANGUAGE sql AS $f$ SELECT 'Rena Author'::text, 'rena@example.test'::text WHERE p_user_id = 5 $f$;
    CREATE TABLE organization_users (organization_id integer,user_id integer,role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE csr_build_jobs (id integer PRIMARY KEY, organization_id integer, project_id integer,
      study_id text, status text, study_info_snapshot jsonb, created_at timestamp, source_run_id text GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED);
    CREATE TABLE csr_section_outputs (id serial PRIMARY KEY, organization_id integer, project_id integer, job_id integer,
      section_number text, content text, content_hash text, ai_generated boolean, model text, token_cost integer, lineage jsonb, generated_at timestamp DEFAULT now(), review_status text NOT NULL DEFAULT 'draft', reviewer_id integer, review_decided_at timestamptz, review_reason text, reviewed_content_hash text);
    INSERT INTO csr_build_jobs VALUES
      (1,7,11,'LMN-201-PART-B','complete','{"studyInfo":{"protocolNumber":"LMN-201-CDI02","phase":"Phase 2/3","title":"RePreve Part B"}}','2026-10-01'),
      (2,7,11,'LMN-201-PART-A','complete','{"studyInfo":{"protocolNumber":"LMN-201-CDI02A","phase":"Phase 2/3","title":"RePreve Part A"}}','2026-10-01'),
      (3,7,11,'X-301','complete','{"studyInfo":{"protocolNumber":"X-301","phase":"Phase 3"}}','2026-10-01'),
      (4,8,11,'OTHER-ORG','complete','{"studyInfo":{"protocolNumber":"Z"}}','2026-10-01');
  `);
  await database.exec(readFileSync(path.join(process.cwd(), 'migrations/20261029e_study_pivotal_declarations.sql'), 'utf8'));
});
afterAll(async () => { await database?.close(); });

const declare = (over: Record<string, unknown>) => declareStudyPivotal(q, {
  organizationId: 7, projectId: 11, studyId: 'LMN-201-PART-B', pivotal: true,
  reason: 'Agreed with FDA at the Type B meeting', declaredBy: 5, ...over,
});
const refusal = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e as StudyPivotalDeclarationError);

describe('the sponsor declares, per study, whether it is pivotal', () => {
  it('records the declaration with its reason, and a change is a new row with the history kept', async () => {
    const first = await declare({ pivotal: false, reason: 'Pending FDA agreement on Part B' });
    expect(first).toMatchObject({ studyId: 'LMN-201-PART-B', pivotal: false, reason: 'Pending FDA agreement on Part B', declaredBy: 5 });
    await new Promise(r => setTimeout(r, 5));
    const second = await declare({});
    expect(second.pivotal).toBe(true);
    const studies = await readProjectStudyPivotal(q, 7, 11);
    expect(studies.map(s => s.studyId).sort()).toEqual(['LMN-201-PART-A', 'LMN-201-PART-B', 'X-301']);
    const partB = studies.find(s => s.studyId === 'LMN-201-PART-B')!;
    expect(partB).toMatchObject({ protocolNumber: 'LMN-201-CDI02', phase: 'Phase 2/3', title: 'RePreve Part B' });
    expect(partB.declaration).toMatchObject({ pivotal: true, reason: 'Agreed with FDA at the Type B meeting' });
    expect(studies.find(s => s.studyId === 'X-301')!.declaration).toBeNull();
    expect((await database.query<{ n: number }>("SELECT count(*)::integer AS n FROM study_pivotal_declarations WHERE study_id = 'LMN-201-PART-B'")).rows[0].n).toBe(2);
  });

  it.each([
    ['no choice', { pivotal: undefined }, 'PIVOTAL_CHOICE_REQUIRED'],
    ['a choice that is not yes or no', { pivotal: 'yes' }, 'PIVOTAL_CHOICE_REQUIRED'],
    ['a reason under eight characters', { reason: 'Agreed' }, 'PIVOTAL_REASON_REQUIRED'],
    ['a reason of spaces', { reason: '          ' }, 'PIVOTAL_REASON_REQUIRED'],
    ['a study the project has no CSR for', { studyId: 'NOT-A-STUDY' }, 'STUDY_NOT_IN_PROJECT'],
    ['another organization’s study', { studyId: 'OTHER-ORG' }, 'STUDY_NOT_IN_PROJECT'],
  ])('refuses %s, and records nothing', async (_label, over, code) => {
    const before = (await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM study_pivotal_declarations')).rows[0].n;
    const err = await refusal(declare(over));
    expect(err).toBeInstanceOf(StudyPivotalDeclarationError);
    expect(err.code).toBe(code);
    expect(err.message).toMatch(/Nothing was recorded/);
    expect((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM study_pivotal_declarations')).rows[0].n).toBe(before);
  });

  it('never rewrites a declaration: UPDATE and TRUNCATE are refused', async () => {
    await expect(database.query("UPDATE study_pivotal_declarations SET pivotal = NOT pivotal")).rejects.toThrow(/STUDY_PIVOTAL_DECLARATION_IMMUTABLE/);
    await expect(database.query('TRUNCATE study_pivotal_declarations')).rejects.toThrow(/STUDY_PIVOTAL_DECLARATION_IMMUTABLE/);
  });

  it('the migration replays cleanly, as every deploy runs it', async () => {
    await expect(database.exec(readFileSync(path.join(process.cwd(), 'migrations/20261029e_study_pivotal_declarations.sql'), 'utf8'))).resolves.toBeDefined();
  });

  it('Module 2’s input carries each study’s current declaration, and null where none was made', async () => {
    await declareStudyPivotal(q, { organizationId: 7, projectId: 11, studyId: 'LMN-201-PART-A', pivotal: false,
      reason: 'Open-label dose-confirmation part', declaredBy: 5 });
    const inputs = await loadCsrInputsForProject(7, 11, { actorUserId: 5 });
    expect(Object.fromEntries(inputs.map(i => [i.studyId, i.pivotal]))).toEqual({
      'LMN-201-PART-A': false, 'LMN-201-PART-B': true, 'X-301': null,
    });
  });
});
