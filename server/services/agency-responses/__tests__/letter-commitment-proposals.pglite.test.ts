/**
 * Extract commitments (P-81, P-84): the Agency inbox proposes the commitments an
 * approval letter imposes, from the text the data room read, and writes nothing.
 * A person records each through the governed create. Against PostgreSQL in
 * process, with the tables the read touches reduced to the columns it reads.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitmentBasisOf, readLetterCommitmentProposals } from '../letter-question-proposals';

const LETTER = `NDA 214321
APPROVAL

POSTMARKETING REQUIREMENTS UNDER 505(o)

4321-1    Conduct a randomized trial to evaluate long-term hepatic safety.

          Final Protocol Submission:    09/2026
          Final Report Submission:      06/2029

POSTMARKETING COMMITMENTS SUBJECT TO REPORTING REQUIREMENTS UNDER SECTION 506B

4321-3    Complete the in vitro study of LMN-201 as a substrate of OATP1B1.

          Final Report Submission:      12/2026

Sincerely,
`;
const PROGRAM = '00000000-0000-4000-8000-000000000001';
const OTHER_PROGRAM = '00000000-0000-4000-8000-000000000002';

let db: PGlite;
const client = { query: (sql: string, params?: unknown[]) => db.query<Record<string, any>>(sql, params) };
const SCOPE = { orgId: 9, projectId: 11, eventId: 'evt-approval' };
const counts = async () => (await db.query<{ n: number }>(
  `SELECT (SELECT count(*) FROM regulatory_commitments)::int + (SELECT count(*) FROM cre_evidence_sources)::int AS n`)).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE projects (id int PRIMARY KEY, organization_id int NOT NULL, regulatory_program_id uuid);
    CREATE TABLE cre_evidence_sources (id serial PRIMARY KEY, organization_id int, client_program_id uuid, title text,
      extracted_text text, deleted_at timestamptz);
    CREATE TABLE concept2cure_agency_communications (event_id text PRIMARY KEY, organization_id int NOT NULL,
      project_id int NOT NULL, linked_artifact_ids text[]);
    CREATE TABLE regulatory_commitments (id serial PRIMARY KEY, organization_id int, project_id int,
      source_communication_event_id text, regulatory_basis text);
    INSERT INTO projects VALUES (11, 9, '${PROGRAM}'), (12, 9, '${OTHER_PROGRAM}');
    INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, extracted_text) VALUES
      (9, '${PROGRAM}', 'Approval letter.pdf', $letter$${LETTER}$letter$),
      (9, '${OTHER_PROGRAM}', 'Another project''s approval.pdf', $letter$${LETTER}$letter$);
    INSERT INTO concept2cure_agency_communications VALUES
      ('evt-approval', 9, 11, ARRAY['cre_source:1']),
      ('evt-foreign', 9, 11, ARRAY['cre_source:2']);
    INSERT INTO regulatory_commitments (organization_id, project_id, source_communication_event_id, regulatory_basis) VALUES
      (9, 11, 'evt-approval', 'FDCA 505(o)(3) · 4321-1'),
      (9, 11, 'evt-other-letter', 'FDCA 506B · 4321-3');
  `);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('readLetterCommitmentProposals', () => {
  it("proposes the letter's commitments verbatim, with kind, basis and due date, and writes nothing", async () => {
    const before = await counts();
    const out = await readLetterCommitmentProposals(client, SCOPE);
    expect(out.sources).toEqual([{ sourceId: 1, title: 'Approval letter.pdf', state: 'read' }]);
    expect(out.proposals.map((p) => [p.ref, p.commitmentType, p.basis, p.text, p.dueDate])).toEqual([
      ['4321-1', 'pmr', 'FDCA 505(o)(3)', 'Conduct a randomized trial to evaluate long-term hepatic safety.', '2029-06-30'],
      ['4321-3', 'pmc', 'FDCA 506B', 'Complete the in vitro study of LMN-201 as a substrate of OATP1B1.', '2026-12-31'],
    ]);
    expect(await counts()).toBe(before);
  });

  it('says which are already recorded from this letter, and no other letter counts', async () => {
    const out = await readLetterCommitmentProposals(client, SCOPE);
    expect(out.proposals.map((p) => [p.ref, p.recordedCommitmentId])).toEqual([['4321-1', 1], ['4321-3', null]]);
    expect(out.proposals.map((p) => p.recordBasis)).toEqual(['FDCA 505(o)(3) · 4321-1', 'FDCA 506B · 4321-3']);
  });

  it("reads no other project's letter", async () => {
    const out = await readLetterCommitmentProposals(client, { ...SCOPE, eventId: 'evt-foreign' });
    expect(out.sources).toEqual([{ sourceId: 2, title: null, state: 'not-found' }]);
    expect(out.proposals).toEqual([]);
  });

  it('records the basis with the number, so the register says where it came from', () => {
    expect(commitmentBasisOf({ basis: 'FDCA 505(o)(3)', ref: '4321-1' })).toBe('FDCA 505(o)(3) · 4321-1');
  });
});
