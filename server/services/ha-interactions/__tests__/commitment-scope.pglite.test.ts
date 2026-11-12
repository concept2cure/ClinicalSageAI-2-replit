/**
 * What a commitment may name, and what a reader may be answered about (2026-11-12, P-122: AnA's commitment tools
 * reached under launch scope, docs/evidence/DESIGN/P-122/ana-reach/). PGlite, with the register as its migration
 * creates it, the plain foreign key to submissions included:
 *   - a commitment names a submission of this organisation or none, never another tenant's. Until this change the
 *     id was inserted as given, on both doors (POST /api/ha-interactions/commitments and AnA's tool);
 *   - a submission's project, and a meeting's submission, are read in one place for every admission;
 *   - the list binds a reader's program scope before anything is counted, when one is given.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
import {
  ORG_LEVEL,
  createCommitmentTx,
  listCommitments,
  projectOfSubmission,
  subjectsOfCommitment,
  submissionOfInteraction,
  submissionReadableIn,
} from '../ha-service';

const PROGRAM_A = '00000000-0000-4000-8000-00000000000a';
const PROGRAM_B = '00000000-0000-4000-8000-00000000000b';
const PROGRAM_TWO_PROJECTS = '00000000-0000-4000-8000-00000000000c';
let pg: PGlite;
const q = { query: (sql: string, params?: unknown[]) => pg.query<any>(sql, params as any[]) };
const count = async () => (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM regulatory_commitments')).rows[0].n;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text);
    CREATE TABLE submissions (id integer PRIMARY KEY, organization_id integer NOT NULL, program_id uuid, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid, status text);
    CREATE TABLE concept2cure_agency_communications (event_id text PRIMARY KEY, organization_id integer,
      communication_type text, audit_metadata jsonb);
    CREATE TABLE agency_communication_questions (id serial PRIMARY KEY, organization_id integer, question_ref text);
    CREATE TABLE provenance_links (id serial PRIMARY KEY, organization_id integer, source_type text, source_id integer,
      target_type text, target_id integer, link_role text, created_by integer, deleted_at timestamptz);
    CREATE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
      LANGUAGE sql STABLE AS $fn$ SELECT u.name, u.email FROM users u WHERE u.id = p_user_id $fn$;
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (5, 'A. Author', 'a@x');
    INSERT INTO projects VALUES (100, 1, '${PROGRAM_A}', 'active'), (101, 1, '${PROGRAM_B}', 'active'),
      (102, 1, '${PROGRAM_TWO_PROJECTS}', 'active'), (103, 1, '${PROGRAM_TWO_PROJECTS}', 'active'),
      (104, 1, '${PROGRAM_A}', 'deleted'), (200, 2, '${PROGRAM_A}', 'active');
    INSERT INTO submissions VALUES (10, 1, '${PROGRAM_A}', NULL), (11, 1, '${PROGRAM_B}', NULL), (12, 1, NULL, NULL),
      (13, 1, '${PROGRAM_TWO_PROJECTS}', NULL), (14, 1, '${PROGRAM_A}', now()), (20, 2, '${PROGRAM_A}', NULL);
  `);
  await pg.exec(extractTableDdl('migrations/20260610_ha_interactions_commitments.sql', ['ha_interactions', 'regulatory_commitments']));
  await pg.exec(`
    ALTER TABLE regulatory_commitments
      ADD COLUMN project_id integer, ADD COLUMN source_communication_event_id text, ADD COLUMN source_question_id integer,
      ADD COLUMN fulfilment_sequence_id integer, ADD COLUMN fulfilment_vault_document_id uuid,
      ADD COLUMN fulfilment_vault_sha256 text, ADD COLUMN fulfilment_recorded_by integer,
      ADD COLUMN fulfilment_recorded_at timestamptz;
    INSERT INTO ha_interactions (id, organization_id, submission_id, interaction_type, agency, title, created_by) VALUES
      (1, 1, 10, 'pre_ind', 'fda', 'On a submission', 5), (2, 1, NULL, 'other', 'fda', 'Names none', 5),
      (3, 2, 20, 'pre_ind', 'fda', 'Another organisation''s', 5);
  `);
}, 60_000);
afterAll(async () => { await pg?.close(); });

const commitment = (submissionId?: number) => ({ commitmentType: 'pmr' as const, description: 'Hepatic safety study', submissionId });

describe('recording a commitment', () => {
  it("names this organisation's submission, or none, and never another tenant's", async () => {
    // The foreign key itself admits organisation 2's submission: only the service's check stands in the way.
    await expect(createCommitmentTx(q, 1, 5, commitment(20))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createCommitmentTx(q, 1, 5, commitment(14))).rejects.toMatchObject({ code: 'NOT_FOUND' }); // removed
    expect(await count()).toBe(0);
    expect((await pg.query('SELECT 1 FROM provenance_links')).rows).toHaveLength(0);
    expect((await createCommitmentTx(q, 1, 5, commitment(10))).provenanceLinkIds).toHaveLength(1);
    expect((await createCommitmentTx(q, 1, 5, commitment())).provenanceLinkIds).toHaveLength(0);
  });
});

describe('what a submission and a meeting belong to', () => {
  it('a submission has one live project in its own organisation, or none that can admit a write', async () => {
    expect(await projectOfSubmission(q, 1, 10)).toBe(100); // its deleted project 104 is not counted
    expect(await projectOfSubmission(q, 1, 11)).toBe(101);
    expect(await projectOfSubmission(q, 1, 12)).toBeNull(); // in no program
    expect(await projectOfSubmission(q, 1, 13)).toBeNull(); // two projects on its program: not chosen between
    expect(await projectOfSubmission(q, 1, 14)).toBeNull(); // removed
    expect(await projectOfSubmission(q, 1, 20)).toBeNull(); // another organisation's
    expect(await projectOfSubmission(q, 2, 20)).toBe(200);
  });

  it("a meeting's submission is read in its own organisation only", async () => {
    expect(await submissionOfInteraction(q, 1, 1)).toBe(10);
    expect(await submissionOfInteraction(q, 1, 2)).toBeNull();
    expect(await submissionOfInteraction(q, 1, 3)).toBeUndefined();
    expect(await submissionOfInteraction(q, 1, 999)).toBeUndefined();
  });

  it('a submission is readable in no program, or in a program of the reader’s scope', async () => {
    expect(await submissionReadableIn(q, 1, 10, [PROGRAM_A])).toBe(true);
    expect(await submissionReadableIn(q, 1, 10, [PROGRAM_B])).toBe(false);
    expect(await submissionReadableIn(q, 1, 10, [])).toBe(false);
    expect(await submissionReadableIn(q, 1, 12, [])).toBe(true);
    expect(await submissionReadableIn(q, 1, 20, [PROGRAM_A])).toBe(false); // another organisation's, same program id
    expect(await submissionReadableIn(q, 1, 14, [PROGRAM_A])).toBe(false); // removed
  });
});

describe('listing the organisation’s own commitments', () => {
  const submissionsOf = (rows: Array<{ submission_id: number | null }>) => rows.map((r) => r.submission_id).sort();

  beforeAll(async () => {
    await pg.exec('TRUNCATE regulatory_commitments RESTART IDENTITY');
    for (const submissionId of [10, 11, 12, undefined]) await createCommitmentTx(q, 1, 5, commitment(submissionId));
    await createCommitmentTx(q, 2, 5, commitment(20));
  });

  it('with no scope given, lists as the screens always have: every commitment of the organisation', async () => {
    expect(submissionsOf(await listCommitments(1, undefined, ORG_LEVEL, q))).toEqual([10, 11, 12, null]);
    expect(submissionsOf(await listCommitments(1, 11, ORG_LEVEL, q))).toEqual([11]);
  });

  it('with a reader’s program scope, lists those that name no submission, one in no program, or one in scope', async () => {
    expect(submissionsOf(await listCommitments(1, undefined, ORG_LEVEL, q, [PROGRAM_A]))).toEqual([10, 12, null]);
    expect(submissionsOf(await listCommitments(1, undefined, ORG_LEVEL, q, []))).toEqual([12, null]);
    expect(submissionsOf(await listCommitments(1, 11, ORG_LEVEL, q, [PROGRAM_A]))).toEqual([]);
    expect(submissionsOf(await listCommitments(1, 11, ORG_LEVEL, q, [PROGRAM_A, PROGRAM_B]))).toEqual([11]);
  });

  it("never another organisation's, whatever the scope", async () => {
    expect(submissionsOf(await listCommitments(1, 20, ORG_LEVEL, q, [PROGRAM_A]))).toEqual([]);
    expect(submissionsOf(await listCommitments(2, undefined, ORG_LEVEL, q, [PROGRAM_A]))).toEqual([20]);
  });
});

/* 2026-11-12: the screen's routes and AnA's fulfilment tool admit a commitment by the project of the submission it
   names, or of the meeting it was made at. The list hides what those acts would refuse. */
describe('a commitment made at a meeting', () => {
  const atMeeting = (sourceInteractionId: number) => ({ commitmentType: 'meeting_commitment' as const, description: 'Send the protocol', sourceInteractionId });
  const meetingsOf = (rows: Array<{ source_interaction_id: number | null }>) => rows.map((r) => r.source_interaction_id).sort();
  let onSubmission: number; let namesNone: number;

  beforeAll(async () => {
    await pg.exec('TRUNCATE regulatory_commitments RESTART IDENTITY');
    onSubmission = (await createCommitmentTx(q, 1, 5, atMeeting(1))).id; // meeting 1 is on submission 10, program A
    namesNone = (await createCommitmentTx(q, 1, 5, atMeeting(2))).id; // meeting 2 names no submission
  });

  it('names its submission and its meeting for admission, in its own organisation only', async () => {
    expect(await subjectsOfCommitment(q, 1, onSubmission)).toEqual({ submissionId: null, sourceInteractionId: 1 });
    expect(await subjectsOfCommitment(q, 1, namesNone)).toEqual({ submissionId: null, sourceInteractionId: 2 });
    expect(await subjectsOfCommitment(q, 2, onSubmission)).toBeUndefined();
    expect(await subjectsOfCommitment(q, 1, 999)).toBeUndefined();
  });

  it('a project\'s own commitment is not the organisation\'s door\'s to admit', async () => {
    await pg.query('UPDATE regulatory_commitments SET project_id = 100 WHERE id = $1', [namesNone]);
    expect(await subjectsOfCommitment(q, 1, namesNone)).toBeUndefined();
    await pg.query('UPDATE regulatory_commitments SET project_id = NULL WHERE id = $1', [namesNone]);
  });

  it('is listed for a reader who can open the meeting\'s submission, and not for one who cannot', async () => {
    expect(meetingsOf(await listCommitments(1, undefined, ORG_LEVEL, q))).toEqual([1, 2]);
    expect(meetingsOf(await listCommitments(1, undefined, ORG_LEVEL, q, [PROGRAM_A]))).toEqual([1, 2]);
    expect(meetingsOf(await listCommitments(1, undefined, ORG_LEVEL, q, [PROGRAM_B]))).toEqual([2]);
    expect(meetingsOf(await listCommitments(1, undefined, ORG_LEVEL, q, []))).toEqual([2]);
  });
});
