/**
 * CSR slice 3 (docs/design/CSR_END_TO_END_2026-10-29.md): the job tables are on
 * the deploy path, so their creating migration must replay, and per-section
 * review state is recorded with the reviewer's identity on the exact text.
 * Runs the real migrations/20260628_csr_job_state.sql in PGlite.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decideCsrSectionReview, type CsrSectionReviewInput } from '../csr-section-review';

const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const BASE = `
  CREATE TABLE organizations (id integer PRIMARY KEY);
  CREATE TABLE projects (id integer PRIMARY KEY);
  CREATE TABLE users (id integer PRIMARY KEY);
  INSERT INTO organizations VALUES (7), (8);
  INSERT INTO projects VALUES (11);
  INSERT INTO users VALUES (5), (6), (9);`;
const TEXT = '§11.4.1 Primary efficacy: global cure 10/12 (83.3%) vs 4/11 (36.4%).';
const REDRAFT = '§11.4.1 Primary efficacy (redrafted): global cure 10/12 (83.3%) vs 4/11 (36.4%).';

let db: PGlite;
const q = { query: async (text: string, params?: unknown[]) => db.query<Record<string, unknown>>(text, params as never[]) };
const decide = (over: Partial<CsrSectionReviewInput>) => decideCsrSectionReview(q, {
  organizationId: 7, jobId: 1, sectionNumber: '11.4.1', reviewerId: 6, decision: 'submit', expectedContentHash: sha(TEXT), ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(SQL);
  await db.exec(SQL); // every deploy re-runs the file (CLAUDE.md RULE 1)
  await db.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (1, 7, 11, 'NCT05330182', 'complete', $1, 5)`,
  [JSON.stringify({ studyInfo: { protocolNumber: 'NCT05330182' }, evidenceSource: { programId: 'p', runId: 'run-42', studyId: 's' } })]);
  await db.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash)
    VALUES (7, 11, 1, '11.4.1', $1, $2)`, [TEXT, sha(TEXT)]);
});
afterAll(async () => { await db?.close(); });

describe('20260628_csr_job_state.sql on the deploy path', () => {
  it('replays over tables pushed without the 2026-10-29 columns and keeps their rows', async () => {
    const pushed = new PGlite();
    try {
      await pushed.exec(`${BASE}
        CREATE TABLE csr_build_jobs (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer, study_id text NOT NULL,
          status text NOT NULL DEFAULT 'queued', progress integer NOT NULL DEFAULT 0, sections_to_generate text[], study_info_snapshot jsonb,
          error jsonb, requested_by integer, started_at timestamp, completed_at timestamp, created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now());
        CREATE TABLE csr_section_outputs (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer, job_id integer NOT NULL,
          section_number text NOT NULL, content text NOT NULL, content_hash text NOT NULL, ai_generated boolean NOT NULL DEFAULT false,
          model text, token_cost integer DEFAULT 0, lineage jsonb, generated_at timestamp NOT NULL DEFAULT now());
        INSERT INTO csr_build_jobs (organization_id, study_id, study_info_snapshot) VALUES (7, 'S', '{"evidenceSource":{"runId":"run-7"}}');
        INSERT INTO csr_section_outputs (organization_id, job_id, section_number, content, content_hash) VALUES (7, 1, '10.1', 'x', 'h');`);
      await pushed.exec(SQL);
      await pushed.exec(SQL);
      const job = await pushed.query<{ source_run_id: string }>('SELECT source_run_id FROM csr_build_jobs');
      expect(job.rows).toEqual([{ source_run_id: 'run-7' }]);
      const out = await pushed.query<Record<string, unknown>>('SELECT review_status, reviewer_id, review_decided_at FROM csr_section_outputs');
      expect(out.rows).toEqual([{ review_status: 'draft', reviewer_id: null, review_decided_at: null }]);
    } finally { await pushed.close(); }
  });

  it('records the bound evidence run from the job snapshot and refuses an unknown review state', async () => {
    const job = await db.query<{ source_run_id: string | null }>('SELECT source_run_id FROM csr_build_jobs WHERE id = 1');
    expect(job.rows[0].source_run_id).toBe('run-42');
    await expect(db.query(`UPDATE csr_section_outputs SET review_status = 'complete', review_decided_at = now(),
      reviewed_content_hash = content_hash WHERE job_id = 1`)).rejects.toThrow(/csr_section_outputs_review_status_check/);
    await expect(db.query(`UPDATE csr_section_outputs SET review_status = 'approved' WHERE job_id = 1`))
      .rejects.toThrow(/csr_section_outputs_review_decision_check/);
  });
});

describe('per-section review state', () => {
  it('moves draft → in review → approved, with the reviewer and the text the approval binds', async () => {
    expect(await decide({ decision: 'submit', reviewerId: 5 })).toMatchObject({ state: 'in_review', reviewerId: 5 });
    await expect(decide({ decision: 'approve', reviewerId: 5 })).rejects.toMatchObject({ code: 'CSR_REVIEWER_IS_REQUESTER' });
    const approved = await decide({ decision: 'approve', reviewerId: 6 });
    expect(approved).toMatchObject({ state: 'approved', reviewerId: 6, contentHash: sha(TEXT), staleApproval: false });
    expect(approved.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const row = await db.query<Record<string, unknown>>('SELECT reviewer_id, reviewed_content_hash FROM csr_section_outputs WHERE job_id = 1');
    expect(row.rows[0]).toEqual({ reviewer_id: 6, reviewed_content_hash: sha(TEXT) });
  });

  it('refuses a send-back without a reason, then records the reason', async () => {
    await expect(decide({ decision: 'send_back', reason: '   ' })).rejects.toMatchObject({ code: 'CSR_REVIEW_REASON_REQUIRED', status: 400 });
    const back = await decide({ decision: 'send_back', reviewerId: 9, reason: 'Synopsis states 4/11; §11.4.1 must say the same.' });
    expect(back).toMatchObject({ state: 'draft', reviewerId: 9, reason: 'Synopsis states 4/11; §11.4.1 must say the same.' });
    await expect(decide({ decision: 'approve' })).rejects.toMatchObject({ code: 'CSR_REVIEW_TRANSITION_REFUSED' });
  });

  it('never carries an approval onto redrafted text, and refuses a decision on text the reviewer did not see', async () => {
    await decide({ decision: 'submit' });
    await decide({ decision: 'approve' });
    await db.query('UPDATE csr_section_outputs SET content = $1, content_hash = $2 WHERE job_id = 1', [REDRAFT, sha(REDRAFT)]);
    await expect(decide({ decision: 'send_back', reason: 'r' })).rejects.toMatchObject({ code: 'CSR_SECTION_CHANGED' });
    const resubmitted = await decide({ decision: 'submit', expectedContentHash: sha(REDRAFT) });
    expect(resubmitted).toMatchObject({ state: 'in_review', contentHash: sha(REDRAFT) });
  });

  it('never submits a placeholder-filled template as reviewable clinical writing', async () => {
    const template = '§10.1 Disposition: [DATA TO BE INSERTED FROM SOURCE RECORDS]';
    await db.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash)
      VALUES (7, 11, 1, '10.1', $1, $2)`, [template, sha(template)]);
    await expect(decide({ sectionNumber: '10.1', expectedContentHash: sha(template), decision: 'submit' }))
      .rejects.toMatchObject({ code: 'CSR_SECTION_DATA_PLACEHOLDER', status: 409 });
    const rows = await db.query<{ review_status: string }>(`SELECT review_status FROM csr_section_outputs WHERE job_id=1 AND section_number='10.1'`);
    expect(rows.rows[0].review_status).toBe('draft');
  });

  it('rejects a content-only edit racing between integrity read and the review UPDATE', async () => {
    // The recorded hash alone is insufficient for an optimistic lock: an
    // out-of-band editor can replace the bytes while leaving content_hash
    // unchanged. Run the actual PGlite UPDATE after that intervening write.
    await db.query(`UPDATE csr_section_outputs
      SET content = $1, content_hash = $2, review_status = 'in_review',
          review_decided_at = now(), reviewed_content_hash = $2
      WHERE job_id = 1 AND section_number = '11.4.1'`, [REDRAFT, sha(REDRAFT)]);
    let injected = false;
    const racing = {
      query: async (sql: string, params?: unknown[]) => {
        if (!injected && sql.startsWith('UPDATE csr_section_outputs')) {
          injected = true;
          await db.query(`UPDATE csr_section_outputs SET content = $1
             WHERE job_id = 1 AND section_number = '11.4.1'`, ['Text changed between SELECT and UPDATE']);
        }
        return db.query<Record<string, unknown>>(sql, params as never[]);
      },
    };
    await expect(decideCsrSectionReview(racing, {
      organizationId: 7, jobId: 1, sectionNumber: '11.4.1',
      reviewerId: 6, decision: 'approve', expectedContentHash: sha(REDRAFT),
    })).rejects.toMatchObject({ code: 'CSR_SECTION_CHANGED', status: 409 });
    expect(injected).toBe(true);
    const result = await db.query<{ review_status: string; content: string }>(
      `SELECT review_status, content FROM csr_section_outputs WHERE job_id = 1 AND section_number = '11.4.1'`);
    expect(result.rows[0]).toEqual({
      review_status: 'in_review', content: 'Text changed between SELECT and UPDATE',
    });
  });

  it('refuses independent approval when a legacy completed job has no recorded requester', async () => {
    await db.query(`INSERT INTO csr_build_jobs
      (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
      VALUES (10, 7, 11, 'SYN-LEGACY', 'complete', '{}'::jsonb, NULL)`);
    await db.query(`INSERT INTO csr_section_outputs
      (organization_id, project_id, job_id, section_number, content, content_hash)
      VALUES (7, 11, 10, '11.4.1', $1, $2)`, [TEXT, sha(TEXT)]);
    const input = {
      organizationId: 7, jobId: 10, sectionNumber: '11.4.1',
      expectedContentHash: sha(TEXT), reviewerId: 6,
    };
    const submitted = await decideCsrSectionReview(q, { ...input, decision: 'submit' });
    expect(submitted.state).toBe('in_review');
    await expect(decideCsrSectionReview(q, { ...input, decision: 'approve' }))
      .rejects.toMatchObject({ code: 'CSR_REVIEW_REQUESTER_MISSING', status: 409 });
    const current = await db.query<{ review_status: string }>(
      `SELECT review_status FROM csr_section_outputs WHERE job_id = 10`);
    expect(current.rows[0].review_status).toBe('in_review');
  });

  it('refuses tampered text, a foreign tenant and a missing section', async () => {
    await db.query(`UPDATE csr_section_outputs SET content = 'edited outside the runner' WHERE job_id = 1`);
    await expect(decide({ decision: 'approve', expectedContentHash: sha(REDRAFT) })).rejects.toMatchObject({ code: 'CSR_SECTION_HASH_MISMATCH' });
    await expect(decide({ organizationId: 8 })).rejects.toMatchObject({ code: 'CSR_SECTION_NOT_FOUND', status: 404 });
    await expect(decide({ sectionNumber: '12.2' })).rejects.toMatchObject({ code: 'CSR_SECTION_NOT_FOUND' });
  });
});
