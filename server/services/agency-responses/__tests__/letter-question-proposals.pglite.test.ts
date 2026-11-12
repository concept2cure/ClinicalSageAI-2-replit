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
/* A letter that numbers nothing: its deficiencies are itemized by the parser (P-122). */
const PROSE_LETTER = `Food and Drug Administration

We have reviewed your submission. The stability data for the drug product do not support the proposed shelf life.
The safety database does not characterize the risk of serious infections at the higher dose.

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
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL, program_type text);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', 9, 'IND'), ('${OTHER_PROGRAM}', 9, 'US_510K');
    CREATE TABLE cre_evidence_sources (id serial PRIMARY KEY, organization_id int, client_program_id uuid, title text,
      extracted_text text, deleted_at timestamptz);
    CREATE TABLE concept2cure_agency_communications (event_id text PRIMARY KEY, organization_id int NOT NULL,
      project_id int NOT NULL, linked_artifact_ids text[]);
    INSERT INTO projects VALUES (11, 9, '${PROGRAM}'), (12, 9, '${OTHER_PROGRAM}');
    INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, extracted_text) VALUES
      (9, '${PROGRAM}', 'IR letter 2026-10-12.pdf', $letter$${LETTER}$letter$),
      (9, '${OTHER_PROGRAM}', 'Another project''s letter.pdf', '1. Not this project''s question.'),
      (9, '${PROGRAM}', 'Scanned letter.pdf', NULL);
    INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, extracted_text) VALUES
      (9, '${PROGRAM}', 'Deficiency letter (prose).pdf', $prose$${PROSE_LETTER}$prose$);
    INSERT INTO concept2cure_agency_communications VALUES
      ('evt-ir-1', 9, 11, ARRAY['cre_source:1']),
      ('evt-foreign', 9, 11, ARRAY['cre_source:2', 'cre_source:3']),
      ('evt-prose', 9, 11, ARRAY['cre_source:4']);
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

/* P-122 (2026-11-10): the deficiency parser (`runGovernedIssueParser`, keyword rules, no model) is reached from the
   inbox: each proposed question carries its reading, as a suggestion for the record form, and a letter that numbers
   no question has its deficiencies itemized. It had no caller since e3a2d0475. */
describe('readLetterQuestionProposals: the deficiency parser reads each question', () => {
  it('a question no rule names is said to be not classified, and nothing is suggested for it', async () => {
    const out = await readLetterQuestionProposals(client, SCOPE, []);
    // Batch analysis, the starting dose and the Investigator's Brochure: no keyword rule names them.
    for (const p of out.proposals) {
      expect(p.classification).toEqual({ topics: [{ label: 'Not classified', severity: 'low', sections: [] }],
        suggested: { severity: 'major', ctdSection: null, discipline: null } });
    }
    expect(out.deficiencies).toEqual([]);
  });

  it('a numbered question a rule names carries its topic and the suggestion for the record form', async () => {
    await db.exec(`INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, extracted_text) VALUES
        (9, '${PROGRAM}', 'IR 2.pdf', '1. Submit the 6-month stability results for drug product lot 2501.' || chr(10) || chr(10) || '2. Provide the efficacy endpoints for Study 201.');
      INSERT INTO concept2cure_agency_communications VALUES ('evt-ir-2', 9, 11, ARRAY['cre_source:5']);`);
    const out = await readLetterQuestionProposals(client, { ...SCOPE, eventId: 'evt-ir-2' }, []);
    const [stability, efficacy] = out.proposals.map((p) => p.classification);
    expect(stability?.topics.map((t) => t.label)).toEqual(['CMC and quality']);
    expect(stability?.suggested).toEqual({ severity: 'major', ctdSection: '3.2.S', discipline: 'CMC' });
    expect(efficacy?.topics.map((t) => t.label)).toEqual(['Clinical efficacy']);
    expect(efficacy?.suggested).toEqual({ severity: 'minor', ctdSection: '2.5', discipline: 'Clinical' });
  });

  it('itemizes the deficiencies of a letter that numbers no question, each passage verbatim', async () => {
    const out = await readLetterQuestionProposals(client, { ...SCOPE, eventId: 'evt-prose' }, []);
    expect(out.proposals).toEqual([]);
    expect(out.deficiencies.map((d) => d.classification.topics[0].label)).toEqual(['CMC and quality', 'Clinical safety']);
    expect(out.deficiencies[0].classification.suggested).toEqual({ severity: 'major', ctdSection: '3.2.S', discipline: 'CMC' });
    expect(out.deficiencies[1].classification.suggested).toMatchObject({ discipline: 'Safety', ctdSection: '2.5' });
    for (const d of out.deficiencies) expect(PROSE_LETTER.slice(d.start, d.end)).toBe(d.text);
  });

  it('reads with the device vocabulary on a device project, never the CTD one', async () => {
    await db.exec(`INSERT INTO projects VALUES (13, 9, '${OTHER_PROGRAM}');
      INSERT INTO concept2cure_agency_communications VALUES ('evt-device', 9, 13, ARRAY['cre_source:4']);
      UPDATE cre_evidence_sources SET client_program_id = '${OTHER_PROGRAM}' WHERE id = 4;`);
    const out = await readLetterQuestionProposals(client, { orgId: 9, projectId: 13, eventId: 'evt-device' }, []);
    expect(out.deficiencies.length).toBeGreaterThan(0);
    for (const d of out.deficiencies) expect(d.classification.suggested.ctdSection).toBeNull();
    await db.exec(`UPDATE cre_evidence_sources SET client_program_id = '${PROGRAM}' WHERE id = 4;`);
  });
});
