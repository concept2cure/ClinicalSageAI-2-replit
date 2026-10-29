/**
 * G3 (P-39 step 3): the Agency inbox proposes the letter's numbered questions
 * from the text the data room read, and writes nothing; a person records each
 * through the governed create. Against PostgreSQL in process, with the tables
 * the read touches reduced to the columns it reads.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readLetterQuestionProposals } from '../letter-question-proposals';

const LETTER = `Food and Drug Administration
10903 New Hampshire Avenue

IND 123456

We have the following requests for information:

1. Provide the batch analysis data for the drug substance lots used in the toxicology studies.

2. Clarify the starting dose rationale, including the NOAEL in the most sensitive species.

3. Submit the updated Investigator's Brochure.

Sincerely,
`;
const PROGRAM = '00000000-0000-4000-8000-000000000001';
const OTHER_PROGRAM = '00000000-0000-4000-8000-000000000002';

let db: PGlite;
const client = { query: (sql: string, params?: unknown[]) => db.query<Record<string, any>>(sql, params) };
const SCOPE = { orgId: 9, projectId: 11, eventId: 'evt-ir-1' };
const counts = async () => (await db.query<{ n: number }>(
  `SELECT (SELECT count(*) FROM concept2cure_agency_communications)::int + (SELECT count(*) FROM cre_evidence_sources)::int AS n`)).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE projects (id int PRIMARY KEY, organization_id int NOT NULL, regulatory_program_id uuid);
    CREATE TABLE cre_evidence_sources (id serial PRIMARY KEY, organization_id int, client_program_id uuid, title text,
      extracted_text text, deleted_at timestamptz);
    CREATE TABLE concept2cure_agency_communications (event_id text PRIMARY KEY, organization_id int NOT NULL,
      project_id int NOT NULL, linked_artifact_ids text[]);
    INSERT INTO projects VALUES (11, 9, '${PROGRAM}'), (12, 9, '${OTHER_PROGRAM}');
    INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, extracted_text) VALUES
      (9, '${PROGRAM}', 'IR letter 2026-10-12.pdf', $letter$${LETTER}$letter$),
      (9, '${OTHER_PROGRAM}', 'Another project''s letter.pdf', '1. Not this project''s question.'),
      (9, '${PROGRAM}', 'Scanned letter.pdf', NULL);
    INSERT INTO concept2cure_agency_communications VALUES
      ('evt-ir-1', 9, 11, ARRAY['cre_source:1']),
      ('evt-foreign', 9, 11, ARRAY['cre_source:2', 'cre_source:3']);
  `);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('readLetterQuestionProposals', () => {
  it("proposes the letter's three numbered questions verbatim, and writes nothing", async () => {
    const before = await counts();
    const out = await readLetterQuestionProposals(client, SCOPE, []);
    expect(out.sources).toEqual([{ sourceId: 1, title: 'IR letter 2026-10-12.pdf', state: 'read' }]);
    expect(out.proposals.map((p) => [p.ref, p.text])).toEqual([
      ['1', 'Provide the batch analysis data for the drug substance lots used in the toxicology studies.'],
      ['2', 'Clarify the starting dose rationale, including the NOAEL in the most sensitive species.'],
      ['3', "Submit the updated Investigator's Brochure."],
    ]);
    for (const p of out.proposals) expect(LETTER.slice(p.start, p.end)).toBe(p.text);
    expect(await counts()).toBe(before);
  });

  it('marks a question already recorded under the same number', async () => {
    const out = await readLetterQuestionProposals(client, SCOPE, [{ id: 501, questionRef: 'Q2' }]);
    expect(out.proposals.map((p) => p.recordedQuestionId)).toEqual([null, 501, null]);
  });

  it("reads no other project's file, and says when a file's text was not read", async () => {
    const out = await readLetterQuestionProposals(client, { ...SCOPE, eventId: 'evt-foreign' }, []);
    expect(out.sources).toEqual([
      { sourceId: 2, title: null, state: 'not-found' },
      { sourceId: 3, title: 'Scanned letter.pdf', state: 'no-text' },
    ]);
    expect(out.proposals).toEqual([]);
  });
});
