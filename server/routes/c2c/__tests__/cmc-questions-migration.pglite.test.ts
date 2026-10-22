/**
 * The deploy DDL of the CMC agency-questions convergence (2026-10-19, rows D2
 * and D5; decision P-39 item 1), run on the files the deploy runs, twice.
 *
 *   migrations/20261018b_agency_response_questions.sql (amended in place):
 *     ctd_section on the canonical question, with a CHECK that admits exactly
 *     what the repository's one CTD rule (shared/regulatory/section-code.ts
 *     normalizeCtdCode) produces. The case table is shared with the unit test
 *     of the normaliser, so the two rules cannot drift apart unseen.
 *   migrations/20261019b_reg_questions_read_only.sql (new):
 *     the earlier CMC question file refuses every INSERT, UPDATE, DELETE and
 *     TRUNCATE, for every role, the owner included (DELETE and TRUNCATE since
 *     the review of 2026-10-19; a purge door is owed, and amends the file).
 *
 * pglite runs as its superuser, so this is the trigger's half. The grant half
 * (the runtime role holds SELECT only, so a statement the trigger never meets,
 * `UPDATE … WHERE false`, is refused too) is tests/db/
 * cmc-agency-questions-converged.dbtest.ts and append-only-store-grants.dbtest.ts,
 * on PostgreSQL 16 as app_service.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { CTD_SECTION_CASES, CTD_SECTION_RAW_REFUSED } from '../../../services/agency-responses/__tests__/ctd-section-cases';

const ROOT = path.resolve(__dirname, '../../../../');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const QUESTIONS = 'migrations/20261018b_agency_response_questions.sql';
const READ_ONLY = 'migrations/20261019b_reg_questions_read_only.sql';

let pg: PGlite;

async function refusal(sql: string, params: unknown[] = []): Promise<{ code: string; message: string } | null> {
  try {
    await pg.query(sql, params);
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: String(err.code ?? ''), message: String(err.message ?? '') };
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY, name text);
    CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE submissions (id serial PRIMARY KEY);
    INSERT INTO organizations VALUES (7);
    INSERT INTO users VALUES (5, 'Author');
    INSERT INTO projects VALUES (42);
  `);
  await pg.exec(read('db/migrations/20260331_communication_center_scaffold.sql'));
  await pg.exec(read('migrations/20260610_ha_interactions_commitments.sql'));
  // The earlier CMC file, on the DDL that creates it (drizzle push from
  // 0000_sweet_joseph.sql on a fresh install) and the column 20260830 adds.
  const core = read('migrations/0000_sweet_joseph.sql');
  const regQuestions = core.match(/CREATE TABLE "reg_questions" \([\s\S]*?\n\);/)?.[0];
  if (!regQuestions) throw new Error('reg_questions DDL not found in 0000_sweet_joseph.sql');
  await pg.exec(regQuestions);
  await pg.exec(read('db/migrations/20260830_reg_questions_response_doc.sql'));
  // A row written before the file became read-only: the history the screen shows.
  await pg.exec(`INSERT INTO reg_questions (organization_id, question_text, section_reference, status)
                 VALUES (7, 'Provide the ICH Q1E extrapolation analysis.', '3.2.P.8.1', 'OPEN')`);
  await pg.exec(`
    INSERT INTO concept2cure_agency_communications
      (event_id, organization_id, project_id, source_type, communication_type, source_channel, urgency,
       human_review_status, closure_status, audit_metadata)
    VALUES ('ace_1', 7, 42, 'agency', 'information_request', 'esg', 'high', 'pending_review', 'open',
            '{"visibilityTier":"shared_client_c2c"}'::jsonb);
  `);
  // Every file runs on every deploy (Rule 1): twice here.
  for (let i = 0; i < 2; i += 1) {
    await pg.exec(read(QUESTIONS));
    await pg.exec(read(READ_ONLY));
  }
});

afterAll(async () => {
  await pg?.close();
});

describe('ctd_section on the canonical question (20261018b, amended in place)', () => {
  let ref = 0;
  const insert = (section: string | null) => {
    ref += 1;
    return refusal(
      `INSERT INTO agency_communication_questions
         (organization_id, project_id, communication_event_id, question_ref, question_text, ctd_section, created_by)
       VALUES (7, 42, 'ace_1', $1, 'Provide the batch analyses.', $2, 5)`,
      [`Q${ref}`, section],
    );
  };

  it('admits every form the repository\'s CTD rule stores, and no section at all', async () => {
    for (const [, stored] of CTD_SECTION_CASES) if (stored) expect(await insert(stored), stored).toBeNull();
    expect(await insert(null)).toBeNull();
  });

  it('refuses, in the database, what the rule would never store', async () => {
    for (const raw of CTD_SECTION_RAW_REFUSED) expect((await insert(raw))?.code, raw).toBe('23514');
  });

  it('is declared once, however many times the file runs', async () => {
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_constraint
        WHERE conname = 'agency_communication_questions_ctd_section_format'
          AND conrelid = 'public.agency_communication_questions'::regclass`,
    );
    expect(r.rows[0].n).toBe(1);
  });
});

describe('the earlier CMC question file is read-only in the database (20261019b)', () => {
  it('refuses an INSERT, for every role, and names where agency questions are recorded now', async () => {
    const r = await refusal(`INSERT INTO reg_questions (organization_id, question_text, status) VALUES (7, 'A new question.', 'OPEN')`);
    expect(r?.code).toBe('P0001');
    expect(r?.message).toMatch(/reg_questions is read-only/);
    expect(r?.message).toMatch(/letter/);
  });

  it('refuses an UPDATE of any column, the status included', async () => {
    for (const set of [`status = 'CLOSED'`, `assigned_to = 'someone'`, `updated_at = updated_at`]) {
      const r = await refusal(`UPDATE reg_questions SET ${set} WHERE organization_id = 7`);
      expect(r?.code, set).toBe('P0001');
    }
    const row = await pg.query<{ status: string }>(`SELECT status FROM reg_questions WHERE organization_id = 7`);
    expect(row.rows.map((x) => x.status)).toEqual(['OPEN']);
  });

  /* Review of 2026-10-19: the file first left DELETE to the owner, so
     URS-CMC-030's "refuses every write" was untrue (an owner DELETE ran). A
     purge door is owed, and is built by amending the file. */
  it('refuses a DELETE and a TRUNCATE too, the owner included', async () => {
    const del = await refusal(`DELETE FROM reg_questions WHERE organization_id = 7`);
    expect(del?.code).toBe('P0001');
    expect(del?.message).toMatch(/read-only .*DELETE refused/);
    const trunc = await refusal(`TRUNCATE reg_questions`);
    expect(trunc?.code).toBe('P0001');
    expect(trunc?.message).toMatch(/TRUNCATE refused/);
    const row = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM reg_questions WHERE organization_id = 7`);
    expect(row.rows[0].n).toBe(1);
  });

  it('has one guard of each kind however many times the file runs, and replays on a database without the table', async () => {
    const t = await pg.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.reg_questions'::regclass AND NOT tgisinternal ORDER BY tgname`,
    );
    expect(t.rows.map((r) => r.tgname)).toEqual(['reg_questions_read_only', 'reg_questions_read_only_truncate']);
    const bare = new PGlite();
    try {
      await bare.exec(read(READ_ONLY));
      await bare.exec(read(READ_ONLY));
    } finally {
      await bare.close();
    }
  });
});
